const { app, BrowserWindow, ipcMain, dialog, protocol, session, net } = require('electron');
const Paths = require('./Paths.js');
const fs = require('fs');
const paths = require('path');
const mime = require('mime-types');
const { pathToFileURL } = require('url');
const { startGamePatch } = require('./GamePatching.js');
const { getSystemFile, getSystemFolder, getPacketDatabase, setSystemIndex } = require('./System.js');
const crypto = require('crypto');
const { exec } = require('child_process');
const Modstore = require('./Modstore.js');
const GamePatching = require('./GamePatching.js');
const { error } = require('console');

let win; // Main window
let sharedVariables = {}; // shared vars with renderer

function errorWin(err) {
    setSharedVar('error', err.toString());
    win.loadURL('deltapack://web/errorWrt/index.html');
}

process.on('uncaughtException', (err) => {
    if (win) {
        setSharedVar('error', err.toString());
        win.loadURL('deltapack://web/errorWrt/index.html');
    }
});

process.on('unhandledRejection', (reason, promise) => {
    if (win) {
        setSharedVar('error', reason.toString());
        win.loadURL('deltapack://web/errorWrt/index.html');
    }
});

function isNaN(value) {
    return typeof value === 'number' && !Number.isNaN(value);
}

function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function asyncTimeout(amount) {
    return new Promise((resolve,reject) => {
        setTimeout(resolve, amount);
    })
}
function setSharedVar(name, value) {
    sharedVariables[name] = value;
    return true;
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'deltapack',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

function copyRecursiveSync(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((child) => {
            copyRecursiveSync(
                paths.join(src, child),
                paths.join(dest, child)
            );
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function showError(errorCode) {
    let errorMessage = '';
    dialog.showErrorBox('Error', `An error occurred: ${errorCode}`);
}

function createWindow() {
    app.setAsDefaultProtocolClient('deltamod' + (process.env.DELTAMOD_ENV === 'dev' ? '-dev' : ''));

    // lets check if we need to change part
    var threrror = "";
    var partOverride = getSystemFile('_sysindex',true);
    if (fs.existsSync(partOverride)) {
        var overrideData = fs.readFileSync(partOverride, 'utf8');
        if (parseInt(overrideData) < 0) {
            console.error('The specified installation of Deltarune is invalid.');
            threrror = 'The specified installation of Deltarune is invalid.';
        }
        setSystemIndex(overrideData);
    }
    else {
        console.log('No system index override found, using default index.');
    }
    const partition = 'persist:deltamod'; // Use a persistent partition for session storage
    const ses = session.fromPartition(partition);

    ses.protocol.handle('deltapack', async (request) => {
        const url = new URL(request.url);
        // security
        var combined = url.hostname+url.pathname;
        if (combined.includes('..')) {
            setSharedVar('error', 'Unsecure request made to deltapack.');
            win.loadURL('deltapack://web/errorWrt/index.html');
            return new Response("bad");
        }
        const filePath = paths.resolve(__dirname, '..', url.hostname + url.pathname);

        const data = await fs.promises.readFile(filePath);
        return new Response(data, {
            headers: {
                'Content-Type': mime.lookup(filePath.split('.')[filePath.split('.').length - 1]) || 'application/octet-stream',
                'Content-Length': data.length,
                'Cache-Control': 'no-cache'
            }
        });
    });

    Paths.retrieve();
    win = new BrowserWindow({
        width: 800,
        height: 800,
        titleBarStyle: 'hidden',
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        titleBarOverlay: {
            color: 'rgba(249,249,249,0)',
            symbolColor: 'rgb(255, 255, 255)',
            height: 28
        },
        webPreferences: {
            devTools: (process.env.DELTAMOD_ENV === 'dev' ? true : false),
            nodeIntegration: true,
            partition: partition,
            preload: Paths.file('web', 'preload.js'),
        }
    });
    win.loadURL('deltapack://web/index.html');

    /*
     * writeToDesktop
     * Writes a file to the desktop.
     * args[0] is the content of the file.
     * args[1] is the name of the file.
    */
    ipcMain.handle('writeToDesktop', async (event, args) => {
        try {
            const desktopPath = app.getPath('desktop');
            const filePath = paths.join(desktopPath, args[1]);
            await fs.promises.writeFile(filePath, args[0], 'utf8');
            console.log(`File written to desktop: ${filePath}`);
        }
        catch (err) {
            console.error('Error writing to desktop:', err);
        }
    });

    /*
     * fetchSharedVariable
     * Fetches a variable in the shared vars object
     * args[0] is the name of the variable.
    */
    ipcMain.handle('fetchSharedVariable', async (event, args) => {
        return sharedVariables[args[0]];
    });

    if (threrror !== "") {
        setSharedVar('error', threrror);
        win.loadURL('deltapack://web/errorWrt/index.html');
        return;
    }

    // A collection of IPC handlers for handling of sysindexes.
    ipcMain.handle('getSystemIndex', async (event, args) => {
        var partOverride = getSystemFile('_sysindex',true);
        if (fs.existsSync(partOverride)) {
            var overrideData = fs.readFileSync(partOverride, 'utf8');
            return overrideData;
        }
        else {
            console.log('No system index override found, using default index.');
            return 0;
        }
    });
    ipcMain.handle('getMaxExistingIndex', async (event, args) => {
        var systemFiles = fs.readdirSync(paths.join(app.getPath('userData'))).filter(file => file.startsWith('deltamod_system-'));
        var maxIndex = 0;
        systemFiles.forEach((file) => {
            var index = file.split('-')[1];

            if (index === 'unique') return;

            if (index) {
                maxIndex = Math.max(maxIndex, parseInt(index));
            }
        });
        return maxIndex;
    });
    ipcMain.handle('changeSystemIndex', async (event, args) => {
        fs.writeFileSync(getSystemFile('_sysindex',true), args[0]);
        app.relaunch();
        app.exit();
    });
    /*
     * getModList
     * Returns the list of mods from the KVS.
    */
    ipcMain.handle('getModList', async (event, args) => {
        var modlist = Modstore.modList();

        var edition = Paths.readKVS('deltaruneEdition');

        return modlist.filter((mod) => {
            return (mod.demo && edition === 'demo') || (!mod.demo && edition === 'full');
        });
    });

    /*
     * patchAndRun
     * Patches the Deltarune install and runs the game.
     * args[0] is an Array containing the mod UIDs to apply.
    */
    ipcMain.handle('patchAndRun', async (event, args) => {
        try {
            var pathname = Paths.readKVS('deltarunePath');
            if (!pathname) {
                dialog.showErrorBox('This command cannot be run', 'Please import a Deltarune install first.');
                return false;
            }

            // make a copy
            var tempPath = getSystemFolder('temp_' + hash(Date.now() + '-' + Math.random()), false);
            fs.mkdirSync(tempPath, { recursive: true });

            copyRecursiveSync(pathname, tempPath);

            var log = await GamePatching.startGamePatch(tempPath, getPacketDatabase(), args[0]);

            console.log('Patching log: ', log);

            win.hide();
            win.webContents.executeJavaScript('closeAudio();'); // Clear the viewport

            exec(`"${tempPath}/DELTARUNE.exe"`, {cwd: tempPath}, (error, stdout, stderr) => {
                fs.rmdirSync(tempPath, { recursive: true, force: true });
                win.show();
                win.webContents.executeJavaScript('openAudio(); page(\'main\');');
            });
        }
        catch (err) {
            errorWin('Coudn\'t patch and run Deltarune: ' + err.toString());
            return false;
        }
    });
    
    /*
     * loadedDeltarune
     * Returns true if the file has been set.
    */
    ipcMain.handle('loadedDeltarune', async (event, name) => {
        try {
            var pathname = Paths.readKVS('deltarunePath');
            if (!Paths.readKVS('loadedDeltarune')) {
                Paths.setKVS('deltarunePath', null);
                return {
                    loaded: false
                };
            }

            if (!pathname) {
                return {
                    loaded: false
                };
            }

            if (!fs.existsSync(pathname)) {
                Paths.setKVS('loadedDeltarune', false);
                Paths.setKVS('deltarunePath', null);
                return {
                    loaded: false
                };
            }

            return {
                loaded: pathname
            }
        }
        catch (err) {
            errorWin(err.toString());
            return null;
        }
    });

    /*     
     * browseFile
     * Opens a file dialog to select a file.
     * args[0] is the name of the file type (e.g., "Deltarune data.win").
     * args[1] is the extension (e.g., "win").
     * Returns the selected file path or null if canceled.
    */
    ipcMain.handle('browseFile', async (event, args) => {
        const pathdial = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [
                { name: args[0], extensions: [args[1]] }
            ]
        });
        if (pathdial.canceled) {
            return null;
        } else {
            return pathdial.filePaths[0];
        }
    });

    /*
     * locateDelta
     * Opens a file dialog to select a valid "Deltarune" install folder.
     * Returns the selected folder path or null if canceled or install isn't detected.
    */
    ipcMain.handle('locateDelta', async (event) => {
        const pathdial = await dialog.showOpenDialog(win, {
            properties: ['openDirectory']
        });
        if (pathdial.canceled) {
            return null;
        } else {
            var path = pathdial.filePaths[0];
            var keyItems = ['data.win', 'DELTARUNE.exe'];
            var missingItems = [];
            var isValid = true;

            keyItems.forEach((item) => {
                if (!fs.existsSync(`${path}/${item}`)) {
                    isValid = false;
                    missingItems.push(item);
                }
            });

            if (isValid) {
                return path;
            } else {
                dialog.showErrorBox('This folder doesn\'t contain a valid Deltarune install', `The selected folder is not a valid Deltarune install.`);
                return null;
            }
        }
    });

    /*
     * importDelta
     * Imports the Deltarune install into the app data.
     * args[0] is the path to the Deltarune install.
     * Returns true if successful, false otherwise.
    */
    ipcMain.handle('importDelta', async (event, args) => {
        if (!args || !args.length) {
            return false;
        }

        var path1 = args[0];
        var path2 = getSystemFolder('deltaruneInstall',false);

        // Check if the path is valid
        console.log(`Importing Deltarune install from ${path1} to ${path2}`);
        if (!fs.existsSync(path1)) {
            dialog.showErrorBox('Invalid folder', 'The provided folder path is invalid.');
            return false;
        }

        var gameEdition = 'demo';
        if (fs.existsSync(`${path1}/chapter4_windows/data.win`)) {
            gameEdition = 'full';
        }

        if (!fs.existsSync(path2)) {
            fs.mkdirSync(path2, { recursive: true });
        }


        try {
            copyRecursiveSync(path1, path2);
            
            dialog.showMessageBox(win, {
                type: 'info',
                title: 'Import Successful',
                message: 'Deltarune install imported successfully.',
                buttons: ['OK']
            }).then(() => {
                Paths.setKVS('loadedDeltarune', true);
                Paths.setKVS('deltarunePath', path2);
                Paths.setKVS('deltaruneEdition', gameEdition);
                Paths.kvsFlush();
                app.relaunch();
                app.exit();
            });
            return true;
        } catch (err) {
            dialog.showErrorBox('Import failed', `Failed to import Deltarune install: ${err.message}`);
            errorWin('Failed to import Deltarune install: ' + err.toString());
            return false;
        }
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});