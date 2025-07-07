const { app, BrowserWindow, ipcMain, dialog, protocol, session, net } = require('electron');
const Paths = require('./Paths.js');
const fs = require('fs');
const paths = require('path');
const mime = require('mime-types');
const { pathToFileURL } = require('url')
const { getSystemFile, getSystemFolder } = require('./System.js');
const crypto = require('crypto');
const { exec } = require('child_process');
const Modstore = require('./Modstore.js');

let win; // Main window

function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
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
    const partition = 'persist:deltamod'; // Use a persistent partition for session storage
    const ses = session.fromPartition(partition);

    ses.protocol.handle('deltapack', async (request) => {
        const url = new URL(request.url);
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
    console.log('deltapack://' + Paths.file('web', 'index.html'));
    win.loadURL('deltapack://web/index.html');

    /*
     * getModList
     * Returns the list of mods from the KVS.
    */
    ipcMain.handle('getModList', async (event, args) => {
        var modlist = Modstore.modList();

        return modlist;
    });

    /*
     * patchAndRun
     * Patches the Deltarune install and runs the game.
     * args[0] is an Array containing the mod UIDs to apply.
    */
    ipcMain.handle('patchAndRun', async (event, args) => {
        win.webContents.executeJavaScript('closeAudio();'); // Clear the viewport
        win.hide();
        var pathname = Paths.readKVS('deltarunePath');
        if (!pathname) {
            dialog.showErrorBox('This command cannot be run', 'Please import a Deltarune install first.');
            return false;
        }

        // make a copy
        var tempPath = getSystemFolder('temp_' + hash(Date.now() + '-' + Math.random()));
        fs.mkdirSync(tempPath, { recursive: true });

        copyRecursiveSync(pathname, tempPath);

        exec(`"${tempPath}/DELTARUNE.exe"`, {cwd: tempPath}, (error, stdout, stderr) => {
            fs.rmdirSync(tempPath, { recursive: true, force: true });
            win.show();
            win.webContents.executeJavaScript('openAudio();');
        });
    });
    
    /*
     * loadedDeltarune
     * Returns true if the file has been set.
    */
    ipcMain.handle('loadedDeltarune', async (event, name) => {
        var pathname = Paths.readKVS('deltarunePath');
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
                dialog.showErrorBox('Invalid Deltarune Install', `The selected folder is not a valid Deltarune install. Look out for a folder that contains the DELTARUNE.exe file.`);
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
            dialog.showErrorBox('Invalid Path', 'The provided path is invalid.');
            return false;
        }

        var path1 = args[0];
        var path2 = getSystemFolder('deltaruneInstall');

        // Check if the path is valid
        console.log(`Importing Deltarune install from ${path1} to ${path2}`);
        if (!fs.existsSync(path1)) {
            dialog.showErrorBox('Invalid Path', 'The provided path does not exist.');
            return false;
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
                Paths.kvsFlush();
                app.relaunch();
                app.exit();
            });
            return true;
        } catch (err) {
            dialog.showErrorBox('Import Failed', `Failed to import Deltarune install: ${err.message}`);
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