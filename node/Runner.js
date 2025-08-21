const { app, BrowserWindow, ipcMain, dialog, protocol, session, net, shell } = require('electron');
const Paths = require('./Paths.js');
const KeyValue = require('./KeyValue.js');
const fs = require('fs');
const mime = require('mime-types');
const zl = require("zip-lib");
const { pathToFileURL } = require('url');
const {Downloader} = require("nodejs-file-downloader");
const { startGamePatch } = require('./GamePatching.js');
const { getSystemFile, getSystemFolder, getPacketDatabase, setSystemIndex } = require('./System.js');
const crypto = require('crypto');
const {randomString, hashFile} = require('./Utils.js');
const { exec } = require('child_process');
const Modstore = require('./Modstore.js');
const GamePatching = require('./GamePatching.js');
const { error } = require('console');
const { default: axios } = require('axios');
const System = require('./System.js');
const { screen } = require('electron');
const path = require('path');

const console = require('./Console.js');

let itch;
let canLoadItch = false;
try {
    itch = require('./ItchKeys.js');
    canLoadItch = true;
}
catch (e) {
    console.error('Itch.io CSRF keys not found, downloading Deltarune demo will not work.');
}

let win; // Main window
let sharedVariables = {}; // shared vars with renderer

function errorWin(err) {
    const errorStack = err.stack || 'No stack trace available';
    setSharedVar('error', err.toString() + "\n" + errorStack);
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

// find the first file named `name` anywhere under `root`
function findFirstByName(root, name) {
    const stack = [root];
    const needle = name.toLowerCase();
    while (stack.length) {
        const dir = stack.pop();
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
            const full = path.join(dir, e.name);
            if (e.isFile() && e.name.toLowerCase() === needle) return full;
            if (e.isDirectory()) stack.push(full);
        }
    }
    return null;
}

// Zork's Patch: pick the directory that looks like the real mod root
function findModRoot(root) {
    const stack = [root];
    let fallback = null;
    while (stack.length) {
        const dir = stack.pop();
        const hasXml  = fs.existsSync(path.join(dir, 'modding.xml'));
        const hasId   = fs.existsSync(path.join(dir, '__deltaID.json'));
        const hasInfo = fs.existsSync(path.join(dir, '_deltamodInfo.json'));
        if (hasXml && hasId) return dir;
        if (!fallback && (hasXml || hasId || hasInfo)) fallback = dir;

        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) if (e.isDirectory()) stack.push(path.join(dir, e.name));
    }
    return fallback || root;
}

function isSubpath(parent, child) {
    const P = p => path.resolve(p).toLowerCase();
    const a = P(parent), b = P(child);
    return b.startsWith(a + path.sep) || a === b;
}

// Zork's Patch: move/copy everything from `wrapper` → `dest`, then delete `wrapper`
function flattenInto(dest, wrapper) {
    const destR = path.resolve(dest);
    const wrapR = path.resolve(wrapper);
    if (destR === wrapR) return;
    if (!isSubpath(destR, wrapR)) {
        console.warn('[flattenInto] refused: wrapper not inside dest', { destR, wrapR });
        return;
    }

    for (const name of fs.readdirSync(wrapR)) {
        const from = path.join(wrapR, name);
        const to   = path.join(destR, name);

        // overwrite if already exists
        try { fs.rmSync(to, { recursive: true, force: true }); } catch {}

        try {
            fs.renameSync(from, to); // fast path
        } catch {
            const st = fs.statSync(from);
            if (st.isDirectory()) {
                copyRecursiveSync(from, to);
            } else {
                fs.mkdirSync(path.dirname(to), { recursive: true });
                fs.copyFileSync(from, to);
            }
            // remove original
            fs.rmSync(from, { recursive: true, force: true });
        }
    }

    // remove now-empty wrapper dir
    try { fs.rmSync(wrapR, { recursive: true, force: true }); } catch {}
}

function copyRecursiveSync(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((child) => {
            copyRecursiveSync(
                path.join(src, child),
                path.join(dest, child)
            );
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('deltamod', process.execPath, [path.resolve(process.argv[1])])
    }
} else {
    app.setAsDefaultProtocolClient('deltamod')
}


function showError(errorCode) {
    let errorMessage = '';
    dialog.showErrorBox('Error', `An error occurred: ${errorCode}`);
}

function createWindow() {
    if (!KeyValue.readUniqueFlag('setup')) {
        KeyValue.writeUniqueFlag('setup', 'true');
        KeyValue.writeUniqueFlag('audio', 'true');
    }
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
    const partition = 'persist:deltamod'; 
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
        const filePath = path.resolve(__dirname, '..', url.hostname + url.pathname);

        const data = await fs.promises.readFile(filePath);
        return new Response(data, {
            headers: {
                'Content-Type': mime.lookup(filePath.split('.')[filePath.split('.').length - 1]) || 'application/octet-stream',
                'Content-Length': data.length,
                'Cache-Control': 'no-cache'
            }
        });
    });

    let unmetConditions = require('./RunConditions.js').checkConditions();

    if (unmetConditions.length > 0) {
        if (unmetConditions.filter((c => c.required)).length > 0) {
            let message = 'The following PC requirements for running Deltamod are not met in this machine:\n' + unmetConditions.map(n => n.name).join('\n') + "\n\nDeltamod will not run on this machine.";
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'PC Requirements Not Met',
                message: message,
            });
            app.exit(1);
            return;
        }
        else {
            let message = 'The following suggested PC requirements for running Deltamod are not met in this machine:\n' + unmetConditions.map(n => n.name).join('\n') + "\n\nYou might experience issues or crashes if you continue.";
            dialog.showMessageBoxSync({
                type: 'warning',
                title: 'PC Requirements Not Met',
                message: message,
            });
        }
    }

    KeyValue.retrieve();
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
            nodeIntegration: true,
            partition: partition,
            preload: Paths.file('web', 'preload.js'),
        }
    });
    win.loadURL('deltapack://web/index.html');

    devToolsEnabled = (process.env.DELTAMOD_ENV === 'dev' ? true : false);

    win.webContents.on('devtools-opened', () => {
        if (!devToolsEnabled) {
            win.webContents.closeDevTools();
            
            dialog.showMessageBox(win, {
                type: 'warning',
                title: 'DevTools Warning',
                message: 'Are you sure you want to open the DevTools? This is not recommended for normal users.\n\nIf you were told by someone to open the DevTools, please make sure you trust them! You can possibly hack your PC if you don\'t know what you are doing.',
                buttons: ['Yes', 'No'],
                defaultId: 1,
            }).then((choice) => {
                if (choice.response === 0) {
                    devToolsEnabled = true;
                    win.webContents.send('warn', 'Please be careful when using the DevTools! You can possibly hack your PC if you don\'t know what you are doing.');
                    win.webContents.openDevTools({ mode: 'detach' });
                }
                else {
                    win.webContents.closeDevTools();
                }
            });    
        }
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    ipcMain.handle('log', (event, args) => {
        console.rendererLog(args[1], args[2], args[0]);
    });

    /*
     * getTheme
     * returns theme name as specified in the themes folder.
    */
    ipcMain.handle('getTheme', async () => {
        var themeHost = System.getSystemFile('_theme', true);
        if (fs.existsSync(themeHost)) {
            var theme = fs.readFileSync(themeHost, 'utf8');
            if (!fs.existsSync(path.join(__dirname, '..', 'web', 'themes', theme + '.theme.json'))) {
                errorWin('The theme "' + theme + '" does not exist. Please select a valid theme.');
                return 'base';
            }
            return theme;
        } else {
            fs.writeFileSync(themeHost, 'base');
            return 'base';
        }
    });

    /*
     * importMod
     * Imports a mod from a zip file.
    */
    ipcMain.handle('importMod', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [{ name: 'Deltamod compatible archive', extensions: ['zip'] }]
        });
        if (canceled || !filePaths || !filePaths[0]) return;

        const filePath = filePaths[0];

        // create unique mod folder
        const modPath = path.join(app.getPath('userData'), 'pkg.db', randomString(32));
        fs.mkdirSync(modPath, { recursive: true });

        try {
            await zl.extract(filePath, modPath);

            // fs.unlinkSync (filePath); // delete the zip file after extraction, I (Zork) commented this out temporarily to keep the zip file for debugging.

            // Normalize: pull contents out of wrapper folder so mod is flat
            const realRoot = findModRoot(modPath);
            if (realRoot && path.resolve(realRoot) !== path.resolve(modPath)) {
                flattenInto(modPath, realRoot);
            }

            // Check manifest anywhere in the tree (now usually at root after flatten)
            const manifestPath = findFirstByName(modPath, '_deltamodInfo.json') || path.join(modPath, '_deltamodInfo.json');
            if (!fs.existsSync(manifestPath)) {
                fs.rmdirSync(modPath, { recursive: true, force: true });
                throw new Error('Mod manifest not found. Please ensure the mod is properly packaged.');
            }

            await dialog.showMessageBox(win, {
                type: 'info',
                title: 'Import Successful',
                message: 'Mod imported successfully.',
                buttons: ['OK']
            });

            // Simple way to refresh the list
            app.relaunch();
            app.exit();
            process.exit();
        } catch (err) {
            console.error('Error importing mod:', err);
            dialog.showErrorBox('Import failed', String(err));
        }
    });

    /*
     * openSysFolder
     * Opens the specified system folder.
     * args[0] is the name of the folder to open.
    */
    ipcMain.handle('openSysFolder', async (event, args) => {
        var folder = args[0];
        switch (folder) {
            case 'mods':
                shell.openExternal(path.join(app.getPath('userData'), 'pkg.db'));
                break;
            case 'delta':
                shell.openExternal(getSystemFolder('deltaruneInstall', false));
                break;
        }
    });

    /*
        * downloadDelta
        * Downloads the latest version of the Deltarune demo.
        * The host is itch.io, and Deltamod uses its API to download the game.
    */
    ipcMain.handle('downloadDelta', async (event, args) => {
        if (!canLoadItch) {
            dialog.showErrorBox('itch.io download not available', 'Deltamod cannot download the Deltarune demo because the needed authentication file is not available.');
            return;
        }

        var modal = new BrowserWindow({
            width: 600,
            height: 200,
            resizable: false,
            maximizable: false,
            minimizable: false,
            closable: false,
            fullscreenable: false,
            modal: true,
            parent: win,
            webPreferences: {
                devTools: (process.env.DELTAMOD_ENV === 'dev' ? true : false),
                nodeIntegration: true,
                partition: partition,
                preload: Paths.file('web', 'download_deltarune/preload.js'),
            }
        });
        modal.loadURL('deltapack://web/download_deltarune/index.html');
        modal.setMenuBarVisibility(false);

        var token = await itch.csrf();
        console.log('Got token from itch: ' + token);
        var api = await axios.post('https://tobyfox.itch.io/deltarune/file/12206581?source=view_game&as_props=1&after_download_lightbox=true', "csrf_token=" + token);

        var deltaruneUrl = api.data.url;

        var zipPath = path.join(app.getPath('downloads'), 'deltarune_demo.zip');

        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        const downloader = new Downloader({
            url: deltaruneUrl,
            fileName: "deltarune_demo.zip",
            directory: app.getPath('downloads'),
            onProgress: function (percentage, chunk, remainingSize) {
                modal.webContents.send('progress', {
                    percentage: percentage
                });
            },
        });

        try {
            await downloader.download();
            console.log('Download completed successfully');

            var extractPath = getSystemFolder('deltaruneInstall', false);

            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            await zl.extract(zipPath, extractPath);

            // normalize: move contents from the true mod root to `dest` if wrapped
            const realRoot = findModRoot(extractPath);
            if (realRoot && realRoot !== extractPath && realRoot.startsWith(extractPath)) {
                const items = fs.readdirSync(realRoot);
                for (const name of items) {
                    const from = path.join(realRoot, name);
                    const to   = path.join(extractPath, name);
                    try { fs.renameSync(from, to); }
                    catch {
                        // cross-device or conflicts → fallback to copy
                        if (fs.statSync(from).isDirectory()) {
                            copyRecursiveSync(from, to);
                            fs.rmSync(from, { recursive: true, force: true });
                        } else {
                            fs.mkdirSync(path.dirname(to), { recursive: true });
                            fs.copyFileSync(from, to);
                            fs.rmSync(from, { force: true });
                        }
                    }
                }
                // try to remove the now-empty wrapper
                try { fs.rmSync(realRoot, { recursive: true, force: true }); } catch {}
            }

            fs.unlinkSync(zipPath);

            dialog.showMessageBox(win, {
                type: 'info',
                title: 'Import Successful',
                message: 'Deltarune install downloaded and imported successfully.',
                buttons: ['OK']
            }).then(() => {
                KeyValue.setKVS('loadedDeltarune', true);
                KeyValue.setKVS('deltarunePath', extractPath);
                KeyValue.setKVS('deltaruneEdition', "demo");
                KeyValue.kvsFlush();
                app.relaunch();
                app.exit();
            });
        }
        catch (error) {
            console.error('Download failed:', error);
            dialog.showErrorBox('Download Failed', 'An error occurred while downloading the Deltarune demo. Please try again later.');
            modal.close();
            errorWin('Download failed: ' + error.toString());
        }
    });

    /*
     * writeToDesktop
     * Writes a file to the desktop.
     * args[0] is the content of the file.
     * args[1] is the name of the file.
     * (Patched to actually write to Documents)
    */
    ipcMain.handle('writeToDocuments', async (event, args) => {
        try {
            const desktopPath = app.getPath('documents');
            if (!fs.existsSync(path.join(desktopPath, 'deltamod')))
            {
                fs.mkdirSync(desktopPath + "/deltamod");
            }
            const filePath = path.join(desktopPath, 'deltamod', args[1]);
            await fs.promises.writeFile(filePath, args[0], 'utf8');
            console.log(`File written to documents: ${filePath}`);
        }
        catch (err) {
            console.error('Error writing to documents:', err);
        }
    });

    /*
     * getUniqueFlag
     * Returns the value of a unique flag.
     * args[0] is the name of the flag.
    */
    ipcMain.handle('getUniqueFlag', async (event, args) => {
        return KeyValue.readUniqueFlag(args[0].toUpperCase());
    });

    /*
     * setUniqueFlag
     * Sets a unique flag.
     * args[0] is the name of the flag.
     * args[1] is the value of the flag.
    */
    ipcMain.handle('setUniqueFlag', async (event, args) => {
        KeyValue.writeUniqueFlag(args[0].toUpperCase(), args[1]);
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
        try {
            var systemFiles = fs.readdirSync(path.join(app.getPath('userData'))).filter(file => file.startsWith('deltamod_system-'));
            var maxIndex = 0;
            var invalidInstalls = [];
            systemFiles.forEach((file) => {
                var index = file.split('-')[1];
                var contents = fs.readdirSync(path.join(app.getPath('userData'), file));
                if (!contents.includes('deltaruneInstall') && index != 'unique') {
                    fs.rmdirSync(path.join(app.getPath('userData'), file), { recursive: true });
                    console.log(`Removed empty directory: ${file}`);
                    invalidInstalls.push(index);
                    return; // Skip empty directories
                }

                if (index === 'unique') return;

                if (index) {
                    maxIndex = Math.max(maxIndex, parseInt(index));
                }
            });
            console.log(`Max existing index: ${maxIndex}`);
            return [maxIndex, invalidInstalls];
        }
        catch (err) {
            console.error('Error getting max existing index:', err);
            return [0, []];
        }
    });
    ipcMain.handle('changeSystemIndex', async (event, args) => {
        fs.writeFileSync(getSystemFile('_sysindex',true), args[0]);
        app.relaunch();
        app.exit();
    });

    /*
     * getEditionByIndex
     * Returns the edition of the game by index.
    */
    ipcMain.handle('getEditionByIndex', async (event, args) => {
        var index = args[0];
        var edition = KeyValue.readKVSOfIndex('deltaruneEdition', index);
        if (edition) {
            return edition;
        }
        else {
            return "Unknown";
        }
    });
    /*
     * getModList
     * Returns the list of mods from the KVS.
    */
    ipcMain.handle('getModList', async (event, args) => {
        var modlist = Modstore.modList();

        var edition = KeyValue.readKVS('deltaruneEdition');

        return modlist.filter((mod) => {
            var editionCompatible = (mod.demo && edition === 'demo') || (!mod.demo && edition === 'full');
            var hashCompatible = true;

            try {
                if (mod.neededFiles > 0) {
                    mod.neededFiles.forEach((file) => {
                        var specifiedHash = file.checksum.toLowerCase();
                        var filePath = path.join(KeyValue.readKVS('deltarunePath'), file.file);

                        if (!fs.existsSync(filePath)) {
                            hashCompatible = false;
                        }

                        if (file.checksum) {
                            if (hashFile(filePath).toLowerCase() !== specifiedHash) {
                                hashCompatible = false;
                            }
                        }
                    });
                }
            }
            catch (e) {
                console.error('Error checking mod hashes compatibility:', e);
                hashCompatible = true;
            }

            return hashCompatible && editionCompatible;
        });
    });

    /*
     * patchAndRun
     * Patches the Deltarune install and runs the game.
     * args[0] is an Array containing the mod UIDs to apply.
    */
    ipcMain.handle('patchAndRun', async (event, args) => {
        try {
            var pathname = KeyValue.readKVS('deltarunePath');
            if (!pathname) {
                dialog.showErrorBox('This command cannot be run', 'Please import a Deltarune install first.');
                return false;
            }

            // In case a previous run crashed mid-restore
            GamePatching.restoreOriginalsIfAny(pathname);

            // Patch the REAL install in-place (GamePatching backs up to *.original)
            var log = await GamePatching.startGamePatch(pathname, getPacketDatabase(), args[0]);

            if (!log.patched) {
                dialog.showErrorBox('Patching failed', 'Please check the log and try again.\n\n' + log.log);
                win.webContents.send('audio', true);
                win.webContents.send('page', 'main');
                //win.webContents.executeJavaScript('openAudio(); page(\'main\');');
                return false;
            }
            console.log('Patching log: ', log);

            // Launch the game from the install (no temp copy)
            win.hide();
            win.webContents.send('audio', false); // Stop audio before launching the game
            //win.webContents.executeJavaScript('closeAudio();');

            const exeCandidate = KeyValue.readKVS('deltaruneExecutable');
            const exe = exeCandidate && fs.existsSync(exeCandidate)
                ? exeCandidate
                : (fs.existsSync(path.join(pathname, 'DELTARUNE.exe'))
                    ? path.join(pathname, 'DELTARUNE.exe')
                    : null);

            if (!exe) {
                errorWin('Could not find a Deltarune executable to run.');
                win.show();
                win.webContents.send('audio', true);
                win.webContents.send('page', 'main');
                //win.webContents.executeJavaScript('openAudio(); page(\'main\');');
                return false;
            }

            var args = "";
            if (KeyValue.readUniqueFlag("outputDelta")) {
                if (fs.existsSync(path.join(path.dirname(exe), '_console.txt'))) {
                    fs.unlinkSync(path.join(path.dirname(exe), '_console.txt'));
                }
                args += '-output _console.txt';
            }
            exec(`"${exe}" ${args}`, { cwd: path.dirname(exe) }, (error, stdout, stderr) => {
                // Always restore originals after the game closes
                GamePatching.restoreOriginalsIfAny(pathname);
                win.show();

                if (KeyValue.readUniqueFlag('outputDelta')) {
                    var consoleFile = path.join(path.dirname(exe), '_console.txt');
                    var consoleContent = fs.readFileSync(consoleFile, 'utf8');
                    fs.unlinkSync(consoleFile);
                    setSharedVar('deltaruneLogs', consoleContent);
                }
                win.webContents.send('audio', true);
                win.webContents.send('page', (KeyValue.readUniqueFlag('outputDelta') ? 'deltalogs' : 'main'));
                //win.webContents.executeJavaScript('openAudio(); page(\'main\');');
            });
        } catch (err) {
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
            var pathname = KeyValue.readKVS('deltarunePath');
            if (!KeyValue.readKVS('loadedDeltarune')) {
                KeyValue.setKVS('deltarunePath', null);
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
                KeyValue.setKVS('loadedDeltarune', false);
                KeyValue.setKVS('deltarunePath', null);
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
            var deltapath = pathdial.filePaths[0];
            var keyItems = ['data.win', 'DELTARUNE.exe'];
            var missingItems = [];
            var isValid = true;

            keyItems.forEach((item) => {
                if (!fs.existsSync(`${deltapath}/${item}`)) {
                    isValid = false;
                    missingItems.push(item);
                }
            });

            if (isValid) {
                return deltapath;
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
                KeyValue.setKVS('loadedDeltarune', true);
                KeyValue.setKVS('deltarunePath', path2);
                KeyValue.setKVS('deltaruneEdition', gameEdition);
                KeyValue.kvsFlush();
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

app.whenReady().then(() => {
    // Run a safety restore before creating the window (handles crash-last-time cases)
    try {
        const p = KeyValue.readKVS('deltarunePath');
        if (p) {
            const restored = GamePatching.restoreOriginalsIfAny(p);
            if (restored && restored.length) {
                console.log('[boot-restore] restored:', restored);
            }
        }
    } catch (e) {
        console.warn('[boot-restore] failed:', e.message);
    }

    createWindow();       // the main window
});



app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
