const { app, BrowserWindow, ipcMain, dialog, protocol, session, shell, screen, Notification, safeStorage } = require('electron');
const Paths = require('./Paths');
const KeyValue = require('./KeyValue');
const fs = require('fs');
const { execSync } = require('child_process');
const mime = require('mime-types');
const createDesktopShortcut = require('create-desktop-shortcuts');
const _7z = require("7zip-min");
const { getSystemFile, getSystemFolder, getPacketDatabase, setSystemIndex, getSystemFolderOfIndex } = require('./System');
const crypto = require('crypto');
const { setWindow, page, getSharedVar, setSharedVar, properRelaunch, getSteamDirectory } = require('./Utils');
const { exec } = require('child_process');
const Modstore = require('./Modstore');
const Updates = require('./Updates');
const GameDB = require('./GameDB');
const { createProgressModal, updateProgressModal, closeAllProgressModals } = require('./ProgressModal');
const GamePatching = require('./GamePatching');
const Junction = require('./Junction');
const { default: axios } = require('axios');
const System = require('./System');
const Netlayer = require('./Netlayer');
const path = require('path');
const { getConfig, config } = require('7zip-min');
const { path7za } = require('7zip-bin');
const console = require('./Console');
const { handleProtocolLaunch, registerProtocolSchemesAsPrivileged, registerProtocolHandlers } = require('./Protocol');
const { isFeatureEnabled } = require('./FeatureFlags');
const { valid } = require('node-html-parser');
const os = require('os');
const { PARTITION } = require('./Config');
const { errorWin } = require("./ErrorWin");

let abortController;
let updateAvailable = false;
let callbackNPS;
let callbackNPSPassWith;
let devToolsEnabled;
// TODO should this have CONST_CASE or not?
let STEAM_BASE;

app.commandLine.appendSwitch('disable-features', 'MediaSessionService'); // Causes issues when enabled

let cachedUIConf = null;

const { getGBUIConf } = require('./GameBananaWindow');
function obtainThemes() {
    if (!fs.existsSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes'))) {
        fs.mkdirSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes'));
        fs.mkdirSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'data'));
        fs.mkdirSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'img'));
        fs.mkdirSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'mus'));
    }
    var available = fs.readdirSync(path.join(__dirname, '..', 'web', 'themes', 'data')).filter(f => f.endsWith('.theme.json'));
        var available2 = fs.readdirSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'data')).filter(f => f.endsWith('.theme.json'));
        return [...available.map(f => {
            return {
                ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'themes', 'data', f), 'utf8')),
                builtIn: true
            };
        }), ...available2.map(f => {
            return {
                ...JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'data', f), 'utf8')),
                builtIn: false
            };
        }).filter(x => {
            var include = !available.map(n => n.replace('.theme.json','')).includes(x.id);
            if (!include) {
                console.log('Custom theme "' + x.id + '" ignored because a built-in theme with the same ID exists.');
            }
            return include;
        })];
}
function validateDeltarune(deltapath) {
    const keyItems = ['data.win'];
    const missingItems = [];
    let isValid = true;

    keyItems.forEach((item) => {
        if (!fs.existsSync(`${deltapath}/${item}`)) {
            console.log(`Missing key item: ${deltapath}/${item}`);
            isValid = false;
            missingItems.push(item);
        }
    });

    if (isValid) {
        return deltapath;
    } else {
        return null;
    }
}

/** @type {BrowserWindow} */
let win; // Main window
let ignoreUpdate = false;

if (process.argv.includes('--developer') && !isFeatureEnabled("AutoupdateNoMatterWhat") /* for testing lol */) {
    ignoreUpdate = true;
}

function loadUrl(url) {
    win.loadURL(url);
}

async function getInstallations(suppressWarnings = false) {
    const systemFiles = fs
        .readdirSync(path.join(app.getPath('userData')))
        .filter(file => file.startsWith('deltamod_system-'));

    const installations = [];

    systemFiles.forEach((file) => {
        if (file.endsWith('unique')) return;

        const storeJSON = path.join(app.getPath('userData'), file, 'store.json');
        const deltaruneInstall = path.join(app.getPath('userData'), file, 'deltaruneInstall');

        if (!fs.existsSync(deltaruneInstall) || !fs.existsSync(storeJSON)) {
            let cname = path.join(app.getPath('userData'), file, '_cname');
            if (fs.existsSync(cname)) {
                cname = fs.readFileSync(cname, 'utf8');
            } else {
                cname = "Install #" + (parseInt(file.split('-')[1]) + 1);
            }

            if (!suppressWarnings) {
                dialog.showMessageBoxSync({
                    type: 'warning',
                    title: 'Invalid Installation Found',
                    message: `An invalid or not fully imported installation of Deltarune was found and will be removed from Deltamod: ${cname}.`,
                });
            }

            fs.rmdirSync(path.join(app.getPath('userData'), file), { recursive: true });
            console.log(`Removed invalid installation: ${file}`);
            return; // Skip invalid installations
        }

        let commonName = "";
        try {
            commonName = fs.readFileSync(path.join(app.getPath('userData'), file, '_cname'), 'utf8');
        } catch {
            commonName = "Install #" + (parseInt(file.split('-')[1]) + 1);
            fs.writeFileSync(path.join(app.getPath('userData'), file, '_cname'), commonName);
        }

        installations.push({
            index: parseInt(file.split('-')[1]),
            name: commonName,
            steam: KeyValue.readKVSOfIndex('isSteam', parseInt(file.split('-')[1])) === true,
            pid: KeyValue.readKVSOfIndex('gamePid', parseInt(file.split('-')[1])),
            appid: KeyValue.readKVSOfIndex('steamAppId', parseInt(file.split('-')[1]))
        });
    });

    return installations;
}

function intoIM() {
    return { args: [...process.argv.slice(1).filter(x => !x.toLowerCase().startsWith("deltamod://")), '---im'] };
}

function validateMyInstall(deltapath) {
    const keyItems = ['data.win'];
    let isValid = true;
    keyItems.forEach((item) => {
        if (!fs.existsSync(`${deltapath}/${item}`)) {
            isValid = false;
        }
    });
    return isValid;
}

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (win) {
        errorWin(err);
    }
    else {
        app.quit();
    }
});

process.on('unhandledRejection', (reason, promise) => {
    if (win) {
        errorWin(new Error('Unhandled Rejection at: ' + promise + ' reason: ' + reason));
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

let elecTracer;

registerProtocolSchemesAsPrivileged(protocol);

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

async function precalculateHashes(root) {
    if (!fs.existsSync(root)) return;
    if (fs.lstatSync(root).isFile()) return;

    var allFiles = [];

    function walkDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.lstatSync(fullPath);
            if (stat.isDirectory()) {
                walkDir(fullPath);
            } else if (stat.isFile()) {
                allFiles.push(fullPath);
            }
        }
    }

    walkDir(root);

    console.log(`Precalculating hashes for ${allFiles.length} files...`);
    for (let i = 0; i < allFiles.length; i++) {
        const filePath = allFiles[i];

        if (filePath.endsWith('.hash')) continue; // skip existing hashes

        var fileBuffer = fs.readFileSync(filePath);

        var hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        fs.writeFileSync(filePath + '.hash', hash, 'utf8');

        console.log(`Hashed file ${i + 1} / ${allFiles.length}`);
    }
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
    KeyValue.upgradeStores();
    if (!KeyValue.readUniqueFlag('setup')) {
        KeyValue.writeUniqueFlag('setup', 'true');
        KeyValue.writeUniqueFlag('audio', 'true');
    }

    if (!KeyValue.readUniqueFlag('sfx')) {
        KeyValue.writeUniqueFlag('sfx', 'true');
    }

    try {
        if (process.platform === 'win32') {
            try {
                const procs = execSync('tasklist', { encoding: 'utf8' }).toLowerCase();
                const found = [];
                if (procs.includes('gm3p.exe')) found.push('GM3P.exe');
                if (procs.includes('gamemakermodmerger.exe')) found.push('GamemakerModMerger.exe');

                if (found.length > 0) {
                    var res = dialog.showMessageBoxSync({
                        type: 'warning',
                        title: 'Close running processes',
                        message: `Deltamod detected these running process${found.length > 1 ? 'es' : ''}: ${found.join(', ')}.\n\nPlease close them before opening Deltamod as when the app closes these may terminate.`,
                        buttons: ['Kill them for me', 'Close the app', 'Ignore (may cause issues)'],
                    });
                    if (res === 0) {
                        try {
                            if (found.includes('GM3P.exe')) {
                                console.log('Killing GM3P.exe processes...');
                                execSync('taskkill /IM GM3P.exe /F', { stdio: 'ignore' });
                            }
                            if (found.includes('GamemakerModMerger.exe')) {
                                console.log('Killing DEVICE_FUSION.exe processes...');
                                execSync('taskkill /IM GamemakerModMerger.exe /F', { stdio: 'ignore' });
                            }
                            console.log('Processes terminated.');
                        } catch (e) {
                            console.warn('Failed to kill processes:', e && e.message ? e.message : e);
                        }
                    } else if (res === 1) {
                        app.quit();
                        return;
                    }
                    // if 2, ignore
                }
            } catch (e) {
                console.warn('Could not enumerate processes to check for GM3P/Device Fusion:', e && e.message ? e.message : e);
            }
        }
    } catch (e) {
        console.warn('Process-check wrapper failed:', e && e.message ? e.message : e);
    }

    // 7-zip fix for electron
    config({ ...getConfig(), binaryPath: path7za });

    // clear out the temporary folder, contains modarchives (that failed to import) and deltamod installers
    try { System.clearTemporary(); } catch (e) { console.error(e); }

    // lets check if we need to change part
    var threrror = "";
    var partOverride = getSystemFile('_sysindex',true);
    // if caller passed ---system_index=<n> on CLI, persist it to the _sysindex file
    const sysArg = process.argv.find(a => a.startsWith('---system_index='));
    if (sysArg) {
        try {
            const val = sysArg.split('=')[1];
            if (val !== undefined && /^-?\d+$/.test(val)) {
                const sysIndexPath = getSystemFile('_sysindex', true);
                fs.writeFileSync(sysIndexPath, val.toString(), 'utf8');
                console.log(`Wrote system index override ${val} to ${sysIndexPath}`);
            } else {
                console.warn('Invalid ---system_index value:', val);
            }
        } catch (e) {
            console.error('Failed to write system index override:', e);
        }
    }
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
        setSystemIndex('0');
    }

    const partition = PARTITION; 
    const ses = session.fromPartition(partition);

    registerProtocolHandlers(ses);

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

    var totalScreenWidth = screen.getPrimaryDisplay().workAreaSize.width;
    var totalScreenHeight = screen.getPrimaryDisplay().workAreaSize.height;
    var w = totalScreenWidth * 0.4;
    var h = totalScreenHeight * 0.7;

    KeyValue.retrieve();
    win = new BrowserWindow({
        width: w,
        height: h,
        resizable: true,
        frame: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            partition: partition,
            preload: Paths.file('web', 'preload.js'),
        }
    });

    // I put this at the start so that we could use getWindow() in window setup functions
    // Because I want createWindow() to not be a giant function
    setWindow(win);
    
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        // check if it https
        if (details.url.startsWith('https://')) {
            console.log('Request to: ' + details.url);
            var locked = !Netlayer.approve(require('./Utils.js').between(details.url, 'https://', '/'));
            callback({ cancel: locked });
            if (locked) {
                errorWin('A request to an unapproved URL was blocked: ' + details.url);
            }
            return;
        }

        callback({ cancel: false });
    });

    win.on('resized', () => {
        var [width, height] = win.getSize();

        if (width < 800) width = 800;
        if (height < 600) height = 600;
        win.setSize(width, height);

        win.webContents.send('winResAlert', []);
    });

    win.loadURL('deltapack://web/index.html');

    devToolsEnabled = (process.argv.includes('--developer') || process.env.DELTAMOD_ENV === 'dev' ? true : false);

    if (!devToolsEnabled) {
        win.setMenu(null);
    }

    win.webContents.on('devtools-opened', () => {
        if (!devToolsEnabled) {
            win.webContents.closeDevTools();
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
    ipcMain.handle('loginGamebanana', async () => {
        if (!safeStorage.isEncryptionAvailable()) {
            dialog.showMessageBoxSync({
                type: 'warning',
                title: 'Reduced security',
                message: 'Your system does not support secure storage. GameBanana login information will be stored without encryption, which may pose a security risk. It is recommended to use Deltamod on a system that supports secure storage for enhanced security.',
            });
        }
        var token = await require('./GameBananaWindow.js').obtainLogin();

        var file = getSystemFile('bananapwd', true);
        fs.writeFileSync(file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : token, 'utf8');

        return true;
    });

    ipcMain.handle('logoutGamebanana', async () => {
        var file = getSystemFile('bananapwd', true);
        fs.unlinkSync(file);
        cachedUIConf = null;
        return true;
    });

    ipcMain.handle('leaveCommentGamebanana', async (event, args) => {
        var uiconf = await getGBUIConf();

        var cond = uiconf._idMemberRow > 0;

        if (cond) {
            return (await require('./GameBananaWindow.js').leaveComment(args[0], args[1], args[2]));
        }
    });

    ipcMain.handle('gbLikeMod', async (event, args) => {
        var uiconf = await getGBUIConf();

        var cond = uiconf._idMemberRow > 0;

        if (cond) {
            return (await require('./GameBananaWindow.js').likeMod(args[0], args[1]));
        }
    });

    ipcMain.handle('validateGamebananaToken', async () => {
        var uiconf = await getGBUIConf();

        var cond = uiconf._idMemberRow > 0;
        console.log('GameBanana logged in status: ' + cond);

        return cond;
    });

    ipcMain.handle('dev_getGBToken', async () => {
        var file = getSystemFile('bananapwd', true);
        if (!fs.existsSync(file)) {
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'No GameBanana Token',
                message: 'No GameBanana token found.',
            });
            return null;
        }

        var contents = fs.readFileSync(file);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(contents) : contents.toString('utf8');

        dialog.showSaveDialog(win, {
            title: 'Save GameBanana Token',
            defaultPath: path.join(os.homedir(), 'gamebanana_token.txt'),
            buttonLabel: 'Save Token',
        }).then(result => {
            if (!result.canceled && result.filePath) {
                fs.writeFileSync(result.filePath, token, 'utf8');
            }
        });
    });

    ipcMain.handle('getGamebananaPic', async () => {
        var uiconf = await getGBUIConf();

        console.log('GameBanana avatar URL: ' + uiconf._sAvatarUrl);

        return uiconf._sAvatarUrl;
    });

    ipcMain.handle('getGamebananaID', async () => {
        var uiconf = await getGBUIConf();

        console.log('GameBanana user ID: ' + uiconf._idMemberRow);

        return uiconf._idMemberRow;
    });

    ipcMain.handle('getGamebananaUserinfo', async () => {
        var uiconf = await getGBUIConf();
        var id = uiconf._idMemberRow;

        var cond = id > 0;
        if (!cond) {
            return {loggedIn: false};
        }

        var profilepage = await axios.get('https://gamebanana.com/apiv11/Member/' + id + '/ProfilePage');

        return {
            ...profilepage.data,
            loggedIn: true
        };
    });

    ipcMain.handle('shouldGoIM', () => {
        return process.argv.includes('---im');
    });

    ipcMain.handle('precalcGameHashes', () => {
        return precalculateHashes(getSystemFolder('deltaruneInstall'));
    });

    ipcMain.handle('getCurrentGameInfo', (event, args) => {
        return GameDB.getGameById(KeyValue.readKVS('gamePid'));
    });

    ipcMain.handle('openFlagDatabase', (event, args) => {
        const flagDBPath = path.join(app.getPath('userData'), 'deltamod_system-unique', 'flagDB.config');
        shell.openPath(flagDBPath);
    });

    ipcMain.handle('isPackaged', () => {
        return app.isPackaged;
    });

    ipcMain.handle('hasPatchingCore', () => {
        return fs.existsSync(path.join(__dirname, '..', 'gm3p'));
    });

    ipcMain.handle('openElectronTracer', (event, args) => {
        if (elecTracer) {
            return;
        }

        elecTracer = new BrowserWindow({
            width: 500,
            height: 300,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: true,
                partition: partition,
                preload: path.join(__dirname, '..', 'web', 'views', 'electron-tracer', 'preload.js'),
            }
        });

        elecTracer.setAlwaysOnTop(true);
        elecTracer.setMenuBarVisibility(false);

        elecTracer.loadURL('deltapack://web/views/electron-tracer/index.html');
    });
    ipcMain.handle('logElectronAPI' , (event, args) => {
        try {
            if (elecTracer) {
                elecTracer.webContents.send('log', args[0]);
            }
        }
        catch (e) {
            console.error('Failed to log to Electron Tracer:', e);
            elecTracer = null;
        }
    });
    
    ipcMain.handle('minimizeMe', (event, args) => {
        const senderWin = BrowserWindow.fromWebContents(event.sender);
        
        if (senderWin) {
            senderWin.minimize();
        }
    });

    ipcMain.handle('toggleFullscreen', (event, args) => {
        const senderWin = BrowserWindow.fromWebContents(event.sender);
        
        if (senderWin) {
            senderWin.setFullScreen(!senderWin.isFullScreen());
        }
    });

    ipcMain.handle('deltamoddersDiscord', async (event, args) => {
        var guildAPI = require('../package.json').discordAPI;
        var get = await axios.get(guildAPI);
        var data = get.data;

        shell.openExternal(data.instant_invite);
    });

    ipcMain.handle('showItem', (event, args) => {
        shell.showItemInFolder(args[0]);
    });

    ipcMain.handle('dlmodURL', async (event, args) => {
        var url = args[0];
        var queryme = args[1];
        var modid = args[2];
        var modmodel = args[3];
        console.log('Downloading mod from URL: ' + url + ' (modid: ' + modid + ', model: ' + modmodel + ', queryme: ' + queryme + ')');
        return await Modstore.downloadModFromURL(url, function(progress, downloaded) {
            event.sender.send('dlmodURL-progress', { progress, downloaded, queryme: args[1], error: false });
        }, modid, modmodel);
    });
    ipcMain.handle('getOS', () => {
        return {
            platform: process.platform,
            release: require('os').release(),
            version: require('os').version()
        };
    });
    ipcMain.handle('rebootDev', async () => {
        if (process.argv.includes('--developer')) {
            return false;
        }
        var existingArgs = process.argv.slice(1).filter(a => !a.startsWith('---system_index=') || a === '---initialize_deltamod' || a.startsWith('deltamod:') );
        app.relaunch({ args: [...existingArgs, '--developer'] });
        app.exit(0);
        return true; // should not reach here
    });

    ipcMain.handle('createInstallLink', async (event, args) => {
        if (process.platform !== 'win32') {
            dialog.showErrorBox('Unsupported OS', 'Creating installation links is only supported on Windows.');
            return;
        }

        if (!args[0]) {
            dialog.showErrorBox('Invalid Argument', 'Please provide a valid system index.');
            return;
        }

        var iName = fs.readFileSync(System.getSystemFileOfIndex('_cname', args[0]), 'utf8');
        var thisProgramEXE = process.execPath;
        console.log('This program EXE: ' + thisProgramEXE); 

        const shortcutsCreated = createDesktopShortcut({
            windows: { filePath: thisProgramEXE.replaceAll('\\','\\\\'), name: 'Deltamod (' + iName + ')', arguments: '---system_index=' + args[0]  },
        });

        if (shortcutsCreated) {
            dialog.showMessageBox(win, {
                type: 'info',
                title: 'Shortcut Created',
                message: 'The installation shortcut has been created on your desktop.',
            });
        } else {
            dialog.showErrorBox('Shortcut Creation Failed', 'Failed to create the installation shortcut.');
        }
    });

    ipcMain.handle('isBaked', async (event, args) => {
        return KeyValue.readKVS('baked');
    });

    // NPS callbacks can be used for everything, so feel free.
    ipcMain.handle('npsCallback', async (event, args) => {
        if (!callbackNPS) return;
        callbackNPS(...callbackNPSPassWith);
        callbackNPS = null;
    });

    ipcMain.handle('deltahubMessageGet', async (event, args) => {
        var url = 'https://us-central1-dh-data-5a818.cloudfunctions.net/deltamodGetChatMessages?channel=' + args[0];

        var get = await axios.get(url);

        return get.data;
    });

    ipcMain.handle('deltahubMessagePost', async (event, args) => {
        console.log('Requesting signature for Deltahub message...');
        var url = 'https://us-central1-dh-data-5a818.cloudfunctions.net/deltamodSendChatMessage';
        var hash = "";

        var tool = path.join(__dirname, '..', 'tools', 'dhubsign.exe'); // this exe is not distributed on github

        if (fs.existsSync(tool)) {
            try {
                hash = (await new Promise((resolve, reject) => {
                    exec(`"${tool}" "${btoa(args[1])}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error('Error signing message for Deltahub:', error);
                            resolve("");
                            return;
                        }
                        resolve(stdout);
                    });
                })).replaceAll('\r','').replaceAll('\n','').replaceAll('[start]','').replaceAll('[end]','').trim(); // long;
            } catch (e) {
                console.error('Failed to sign message for Deltahub:', e);
            }
        }

        hash = hash.trim();

        var post = await axios.post(url, {
            channel: args[0],
            message: args[1],
        }, {
            headers: {
                'X-Signature': hash
            }
        }).catch((error) => {
            throw error.data.message;
        });

        if (post.data.ok !== true) {
            throw post.data.message;
        }

        return;
    });

    ipcMain.handle('modalTest', async (event, args) => {
        var modal = createProgressModal();

        let x = 0.0;
        function doit() {
            x += 0.1;
            updateProgressModal(modal, win, x, null);
        }

        setTimeout(function doit1234() {
            doit();
            if (x < 1.0)
                setTimeout(doit1234, 250);
            else
                setTimeout(() => {
                    console.log('IM GONNA ATTEMPT TO CLOSE THE WINDOW!!!');
                    modal.close();
                    // modal.destroy();
                }, 250);
        }, 250)
    })

    ipcMain.handle('downloadGM3P', async (event, args) => {
        var url = args[0];

        var modal = createProgressModal();

        const fileName = "gm3p_pkg.zip";
        const destPath = path.join(app.getPath('downloads'), fileName);

        const writer = fs.createWriteStream(destPath);

        const response = await axios({
            method: 'get',
            url,
            responseType: 'stream'
        });

        const totalLength = response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : null;
        let downloaded = 0;

        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (totalLength) {
                updateProgressModal(modal, win, downloaded / totalLength, 'Downloaded');
            } else {
                console.log(`Downloaded ${downloaded} bytes`);
            }
        });

        response.data.pipe(writer);

        writer.on('finish', async () => {
            win.setProgressBar(0);
            console.log("download completed successfully");
            console.log("removing old gm3p folder...");
            try {
                fs.rmSync(path.join(__dirname, '..', 'gm3p'), { recursive: true, force: true });
            }
            catch (e) {
                console.error('Failed to remove old gm3p folder:', e);
            }
            console.log('creating new gm3p folder...');
            fs.mkdirSync(path.join(__dirname, '..', 'gm3p'), { recursive: true });
            console.log(`unpacking ${fileName}...`);
            await _7z.unpack(destPath, path.join(__dirname, '..', 'gm3p'));
            console.log("showing success box...");

            // TODO I REALLY want to figure out how electron works
            // and why it modal.close() does ABSOLUTELY NOTHING here
            // modal.close() does NOT close the window and it does NOT
            // call the 'close' event handler either!!!
            modal.destroy();

            dialog.showMessageBoxSync(win, {
                type: 'info',
                title: 'Download Complete',
                message: 'Patcher package downloaded and extracted successfully.',
            });
            console.log("relaunching...");
            app.relaunch(properRelaunch());
            app.quit();
            process.exit(0);
        });

        writer.on('error', (err) => {
            modal.close();
            console.error('Error downloading file:', err);
            dialog.showErrorBox('Download Error', 'An error occurred while downloading the Patcher package. The app will now reboot.');
            app.relaunch(properRelaunch());
            app.quit();
            process.exit(1);
        });

        return destPath;
    });

    ipcMain.handle('initialize', async (event, args) => {
        app.relaunch(properRelaunch(['---initialize_deltamod']));
        app.quit();
    });

    ipcMain.handle('executeArgumentCmd', async (event, args) => {
        if (process.argv.includes('---initialize_deltamod')) {
            win.hide();
            const confirm = dialog.showMessageBoxSync({
                type: 'warning',
                buttons: ['Yes', 'No'],
                defaultId: 1,
                cancelId: 1,
                title: 'Initialize Deltamod',
                message: 'A request was received for Deltamod to initialize and remove every installation and mod from the system. This action is irreversible. Do you want to continue?'
            });
            if (confirm !== 0) {
                process.exit(0);
                app.quit();
                return;
            }
            page('busy');

            console.log('Initializing Deltamod...');

            await new Promise(resolve => setTimeout(resolve, 1000));

            var appdata = path.join(app.getPath('appData'), 'deltamod');

            fs.readdirSync(appdata).forEach(file => {
                if (file.startsWith('deltamod_system')) {
                    const fullPath = path.join(appdata, file);
                    console.log('Removing old system folder: ' + fullPath);
                    try {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } catch (e) {
                        console.error(`Failed to remove ${fullPath}:`, e);
                    }
                }
            });

            fs.rmSync(path.join(app.getPath('appData'), 'deltamod', 'pkg.db'), { recursive: true, force: true });

            await new Promise(resolve => setTimeout(resolve, 1000));

            app.quit();
        }
    });

    ipcMain.handle('myCommitInfo', async (event, args) => {
        var toreturn = "";

        var gm3ppath = path.join(__dirname, '..', 'gm3p', 'GM3P.exe');
        var devicefusionpath = path.join(__dirname, '..', 'gm3p', 'GamemakerModMerger.exe');
        if (fs.existsSync(gm3ppath) && !fs.existsSync(devicefusionpath)) {
            var attributes = require('./Utils.js').getFileVersion(gm3ppath);
            if (attributes) {
                toreturn += `<br>GM3P ${attributes}`;
            }
            else {
                toreturn += `<br>GM3P, version unknown`;
            }
        }

        if (fs.existsSync(devicefusionpath)) {
            var attributes = require('./Utils.js').getFileVersion(devicefusionpath);
            if (attributes) {
                toreturn += `<br>DEVICE_FUSION ${attributes}`;
            }
            else {
                toreturn += `<br>DEVICE_FUSION, version unknown`;
            }
        }

        return toreturn;
    });

    ipcMain.handle('showWindow', (event) => {
        BrowserWindow.fromWebContents(event.sender).show();
    });
    ipcMain.handle('openExternal', (event, args) => {
        shell.openExternal(args[0]);
    });

    ipcMain.handle('version', () => {
        return require('../package.json').version;
    });

    ipcMain.handle('log', (event, args) => {
        console.rendererLog(args[1], args[2], args[0]);
    });

    ipcMain.handle('chooseTheme', async () => {
        var available = fs.readdirSync(path.join(__dirname, '..', 'web', 'themes')).filter(f => f.endsWith('.theme.json'));
        var themeObjects = available.map(f => {
            return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'themes', f), 'utf8'));
        });

        var choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            title: 'Select a theme',
            message: 'Select a theme from the list below:',
            buttons: [...themeObjects.map(t => t.name), 'Cancel'],
            cancelId: themeObjects.length
        });
        if (choice === themeObjects.length) return; // Cancel
        var theme = themeObjects[choice];
        var themeHost = System.getSystemFile('_theme', true);
        fs.writeFileSync(themeHost, theme.id);
        win.webContents.send('themeChange');
    });
    ipcMain.handle('setSponsor', async (event, args) => {
        let base = path.join(__dirname, '..', 'web', 'views', 'patching', 'sponsors');

        let buttons = [];
        let names = [];

        var sponsors = fs.readdirSync(base);
        if (Math.random() >= 0.08) {
            sponsors = sponsors.filter(s => s !== 'musical');
        }
        sponsors.forEach(s => {
            var json = JSON.parse(fs.readFileSync(path.join(base, s, 'config.sponsor.json'), 'utf8'));
            names.push(s);
            buttons.push(json.name);
        });

        var choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            title: 'Select a patching character',
            message: 'Select a patching character from the list below:',
            buttons: [...buttons, 'Cancel'],
        });

        if (choice === buttons.length) return; // Cancel

        fs.writeFileSync(System.getSystemFile('_sponsor', true), names[choice]);
    });
    ipcMain.handle('getSponsor', async () => {
        var sponsorHost = System.getSystemFile('_sponsor', true);
        if (fs.existsSync(sponsorHost)) {
            var sponsor = fs.readFileSync(sponsorHost, 'utf8');
            return sponsor;
        }
        else {
            fs.writeFileSync(sponsorHost, 'cd');
            return 'cd';
        }
    });
    ipcMain.handle('setTheme', async (event, args) => {
        var themeHost = System.getSystemFile('_theme', true);
        fs.writeFileSync(themeHost, args[0]);
    });
    ipcMain.handle('getThemes', async () => {
        return obtainThemes();
    });
    /*
     * getTheme
     * returns theme name as specified in the themes folder.
    */
    ipcMain.handle('getTheme', async () => {
        var themeHost = System.getSystemFile('_theme', true);
        try {
            var theme = fs.readFileSync(themeHost, 'utf8');
            var themeData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'themes', 'data', theme + '.theme.json'), 'utf8'));
            
        }
        catch(e) {
            theme = 'base';
            fs.writeFileSync(themeHost, theme);
        }
        if (obtainThemes().filter(t => t.id === theme).length === 0) {
            theme = 'base';
            fs.writeFileSync(themeHost, theme);
        }
        return theme;
    });

    /*
     * importMod
     * Imports a mod from a zip file.
    */
    ipcMain.handle('importMod', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [{ name: 'Deltamod compatible archive', extensions: ['zip', '7z', 'tar.gz', 'lzma'] }]
        });
        if (canceled || !filePaths || !filePaths[0]) return;

        const filePath = filePaths[0];
        Modstore.importMod(filePath);
    });

    /*
     * removeMod
     * Removes the folder containing the mod and reloads the list.
     * args[0] is the ID of the mod.
     */
    ipcMain.handle('removeMod', async (event, args) => {
        await Modstore.removeModSafe(args[0]);
    });

    /*
     * toggleModState
     * Changes the mod availability status for the current system profile.
     * args[0] is the ID of the mod.
     * args[1] is the new state of the mod.
     */
    ipcMain.handle('toggleModState', async (event, args) => {
        if (args[1]) KeyValue.setKVS("enabledMods", [...KeyValue.readKVS("enabledMods", []), args[0]]);
        else KeyValue.setKVS("enabledMods", KeyValue.readKVS("enabledMods", []).filter(x => x !== args[0]));
    });

    /*
     * getModState
     * Gets the mod availability status for the current system profile.
     * args[0] is the ID of the mod.
     */
    ipcMain.handle('getModState', async (event, args) => {
        return KeyValue.readKVS("enabledMods", []).includes(args[0]);
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
                shell.openPath(getPacketDatabase());
                break;
            case 'delta':
                shell.openPath(getSystemFolder('deltaruneInstall', false));
                break;
        }
    });

    /*
     * getModImage
     * Returns the URL of a mod image using the packet:// protocol.
    */
    ipcMain.handle('getModImage', async (event, args) => {
        return Modstore.getModImage(args[0]);
    });

    /*
     * openModFolder
     * Opens the specified mod's data folder.
     * args[0] is the ID of the mod to open the folder of.
     */
    ipcMain.handle('openModFolder', async (event, args) => {
        shell.openPath(path.join(getPacketDatabase(), args[0]));
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
        return getSharedVar(args[0]);
    });

    if (threrror !== "") {
        errorWin(threrror);
        return;
    }

    ipcMain.handle('start-update', async (event, args) => {
        console.log(`Downloading ${args[0].version} from GameBanana...`);
        page("autoupdate");

        try {
            const installerpath = path.join(System.getTemporary(), `installer.${args[0].version.replaceAll(".", "")}.exe`);
            const { data: bytes } = await axios.get(args[0].newVersionLink, {
                responseType: 'arraybuffer',
                onDownloadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    console.log(`Download progress: ${percentCompleted}%`);
                    win.webContents.send('updateProgress', {
                        perc: percentCompleted
                    });
                }
            });
            console.log(`Fetched ${bytes.byteLength} bytes from ${args[0].newVersionLink}. Prompting for installation.`);

            // i trust the deltamod team to not fuck up the version and put invalid characters into the file name
            await fs.writeFileSync(installerpath, Buffer.from(bytes));
            shell.openPath(installerpath);
            app.exit(0);
        } catch (e) {
            console.error(e);
            dialog.showErrorBox("Failed to download update", "An unknown error occured while attempting to download the new Deltamod update. Please reinstall Deltamod from GameBanana. The page will now open in your browser.");
            shell.openExternal('https://gamebanana.com/tools/20575');

            ignoreUpdate = true;
            page("main");
        }
    });

    ipcMain.handle('ignore-update', async (event, args) => {
        ignoreUpdate = true;
        page("main");
    });

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
    // DEPRECATED 1.2: Use 'getInstallations'
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

    // Returns array of indexes with edition, ui name and index.
    ipcMain.handle('getInstallations', async (event, args) => {
        try {
            return await getInstallations();
        }
        catch (err) {
            errorWin('Error getting installations: ' + err.toString());
            return [];
        }
    });

    // Changes C(ommon)Name of the specified installation.
    ipcMain.handle('setInstallationCName', async (event, args) => {
        var index = args[0];
        var newName = args[1];

        fs.writeFileSync(path.join(app.getPath('userData'), 'deltamod_system-'+index, '_cname'), newName);
    });

    ipcMain.handle('changeSystemIndex', async (event, args) => {
        fs.writeFileSync(getSystemFile('_sysindex',true), args[0]);
        app.relaunch(intoIM());
        app.exit();
    });

    /*
     * getEditionByIndex
     * Returns the edition of the game by index.
    */
    ipcMain.handle('getEditionByIndex', async (event, args) => {
        var index = args[0];
        var edition = KeyValue.readKVSOfIndex('gamePid', index);
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
        var { modList, errors } = Modstore.modList();
        var edition = KeyValue.readKVS('gamePid');
        

        let datalist = modList;
        for (let i = datalist.length - 1; i >= 0; i--) {
            datalist[i].isIncompatible = false;
            let mod = datalist[i];
            var editionCompatible = (mod.game == edition);
            console.log(`Mod ${mod.name} (${mod.uniqueId}) compatibility check: mod game=${mod.game} vs edition=${edition} => ${editionCompatible ? 'compatible' : 'incompatible'}`);
            if (mod._incompatibleHASH) {
                datalist[i].isIncompatible = true;
                datalist[i].incompatibilityReason = 'Mismatching hashes (disable advanced mod compatibility checks to ignore)';
                delete datalist[i]._incompatibleHASH;
            }
            if (!editionCompatible) {
                datalist[i].isIncompatible = true;
                datalist[i].incompatibilityReason = 'Mod not made for this game';
            }
        }

        return { modList: datalist, errors };
    });

    /*
     * getModListFull
     * Returns the list of mods from the KVS.
     * Includes incompatible mods as well, marked.
    */
    ipcMain.handle('getModListFull', async (event, args) => {
        return Modstore.modList();
    });

    ipcMain.handle('howManyMods', async (event, args) => {
        return Modstore.howmany();
    });

    // Used as a relay to allow async handling
    ipcMain.handle('startGame', async (event, args) => {
        ipcMain.emit('startGame', event, args);
    });

    ipcMain.on('startGame', async (event, args) => {
        console.log('Starting game...');
        var pathname = path.join(app.getPath('userData'), 'deltamod_system-' + System.getCurrentSystemIndex(), 'deltaruneInstall');
        if (!fs.existsSync(pathname)) {
            dialog.showErrorBox('This command cannot be run', 'Please import a Deltarune install first.');
            return false;
        }

        // Hide UI and stop audio before launching
        win.hide();
        win.webContents.send('audio', false);

        let gameConfig = GameDB.getGameById(KeyValue.readKVS('gamePid'));

        const exe = path.join(pathname, gameConfig.exeName);

        console.log('running off ' + exe);

        if (!exe) {
            errorWin('Could not find executable to run.');
            win.show();
            win.webContents.send('audio', true);
            win.webContents.send('page', 'main');
            return false;
        }

        // Build args
        let argsStr = '';

        // If this install is steam-managed, launch via steam protocol and quit
        if (KeyValue.readKVS('isSteam')) {
            dialog.showMessageBoxSync({
                type: 'info',
                title: 'Launching via Steam',
                message: 'The game will now be launched via Steam. Deltamod will close.',
            });
            shell.openExternal(`steam://rungameid/${KeyValue.readKVS('steamAppId')}`);
            app.quit();
            process.exit(0);
            return true;
        }

        // Launch executable
        exec(`"${exe}" ${argsStr}`, { cwd: path.dirname(exe) }, (error, stdout, stderr) => {
            // Always restore originals after the game closes
            try {
                GamePatching.restoreOriginalsIfAny(pathname);
            } catch (e) {
                console.error('Failed to restore originals after run:', e);
            }

            win.show();
            win.webContents.send('audio', true);
            win.webContents.send('page', 'main');
        });

        return true;
    });

    /*
     * patchAndRun
     * Patches the Deltarune install and runs the game.
     * args[0] is an Array containing the mod UIDs to apply.
    */
    ipcMain.handle('patchAndRun', async (event, args) => {
        try {
            var baking = args[1] == 'baker';
            var pathname = KeyValue.readKVS('deltarunePath');
            if (!pathname) {
                dialog.showErrorBox('This command cannot be run', 'Please import a Deltarune install first.');
                return false;
            }

            // Fix for DEVICE_FUSION not creating output folder
            // techy here: this code was redundant because GamePatching.js already creates the output folder if it doesn't exist. The reason why that error appeared was due to a misconfiguration on Ego's end (which has been fixed and we are now just waiting for a build with the fix)

            // In case a previous run crashed mid-restore
            GamePatching.restoreOriginalsIfAny(pathname);

            var mods = fs.readdirSync(getPacketDatabase());
            mods = mods.filter(f => fs.existsSync(path.join(getPacketDatabase(), f, '__deltaID.json')));
            mods = mods.map(f => {
                var data = JSON.parse(fs.readFileSync(path.join(getPacketDatabase(), f, '__deltaID.json'), 'utf8'));
                if (args[0].includes(data.uniqueId)) {
                    console.log('No more new for you, ' + data.uniqueId);
                    data.new = false;
                    fs.writeFileSync(path.join(getPacketDatabase(), f, '__deltaID.json'), JSON.stringify(data, null, 4), 'utf8');
                }
                return data;
            });

            // Patch the REAL install in-place (GamePatching backs up to *.original)
            var log = await GamePatching.startGamePatch(pathname, getPacketDatabase(), args[0], BrowserWindow.fromWebContents(event.sender));

            if (!log.patched) {
                dialog.showErrorBox('Patching failed', 'Please check the log and try again.\n\n' + log.log);
                win.webContents.send('audio', true);
                win.webContents.send('page', 'main');
                //win.webContents.executeJavaScript('openAudio(); page(\'main\');');
                return false;
            }
            console.log('Patching log: ', log);

            const notif = new Notification({
                title: 'Patch complete!',
                body: 'Deltarune has been patched successfully! Reopen Deltamod to launch the game.',
                silent: false
            });
            notif.show();
            notif.on('click', () => {
                try {
                    if (!win) return;
                    if (win.isMinimized()) win.restore();
                    win.show();
                    win.focus();
                    // sometimes forcing briefly on top helps bring to front
                    win.setAlwaysOnTop(true);
                    setTimeout(() => win.setAlwaysOnTop(false), 100);
                } catch (e) {
                    console.error('Failed to focus window on notification click:', e);
                }
            });

            callbackNPS = function(pathname) {
                ipcMain.emit('startGame', null, []);
            };
            if (!baking) {
                callbackNPSPassWith = [pathname];
                win.webContents.send('finishedPatch',mods);
            }
            else {
                var allMods = Modstore.modList().modList.filter(m => (args[0].includes(m.uniqueId))).map(m => ({
                    name: m.name,
                    description: m.description,
                    author: m.author,
                    version: m.version,
                }));
                KeyValue.setKVS('bakeList', allMods);
                GamePatching.deleteOriginals(pathname);
                app.relaunch(properRelaunch());
                app.exit();
            }
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
            var kvs = KeyValue.readKVS('gamePid');
            var gameInfo = GameDB.getGameById(kvs);
            return { loaded: fs.existsSync(path.join(System.getSystemFolder('deltaruneInstall'), gameInfo.exeName)), path: kvs };
        }
        catch (err) {
            return { loaded: false, path: "" };
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
            return validateDeltarune(pathdial.filePaths[0]);
        }
    });

    ipcMain.handle('downloadGame', async (event, args) => {
        return new Promise (async (resolve, reject) => {
            var dataFeat = GameDB.getFeatInfo(args[0], 'autodownload').data;

            var deltaruneUrl = await (require('./DownloadUtilities/' + dataFeat.pluginName).run(args[0], dataFeat));

            var modal = createProgressModal();

            const fileName = "deltaruneGAME.zip";
            const destPath = path.join(System.getTemporary(), fileName);

            const writer = fs.createWriteStream(destPath);

            const response = await axios({
                method: 'get',
                url: deltaruneUrl,
                responseType: 'stream'
            });

            const totalLength = response.headers['content-length'] ? parseInt(response.headers['content-length'], 10) : null;
            let downloaded = 0;

            response.data.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalLength) {
                    updateProgressModal(modal, win, downloaded / totalLength, 'Downloaded')
                } else {
                    console.log(`Downloaded ${downloaded} bytes`);
                }
            });

            response.data.pipe(writer);

            writer.on('finish', async () => {
                console.log('Download completed successfully');

                win.setProgressBar(0);
                
                var extractPath = path.join(System.getTemporary(), 'game_ext_' + Date.now());
                fs.mkdirSync(extractPath, { recursive: true });
                await _7z.unpack(destPath, extractPath);

                if (fs.readdirSync(extractPath).length == 1) {
                    const singleFolder = fs.readdirSync(extractPath)[0];
                    const singleFolderPath = path.join(extractPath, singleFolder);
                    extractPath = singleFolderPath;
                }
                console.log('Extraction completed successfully');
                modal.close();
                resolve(extractPath);
            });

            writer.on('error', (err) => {
                console.error('Error downloading file:', err);
                modal.close();
                reject(err);
            });
        });

    });

    /*
     * fireUpdate
     * Called by window when ready to get update info.
    */
    ipcMain.handle('fireUpdate', async (event) => {
        try {
            const updateInfo = await Updates.checkUpdates();
            console.log('Update check result:', updateInfo.update);
            if (updateInfo.update && !ignoreUpdate) {
                win.webContents.send('updateAvailable', updateInfo);
                updateAvailable = true;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error checking updates:', error);
            return false;
        }
    });

    /*
     * importDelta
     * DEPRECATED: use createNewInstallation
    */

    /*
     * createNewInstallation
     * Copy of importDelta that is called from installmanager.
    */
    ipcMain.handle('createNewInstallation', async (event, args) => {
        var i = 0;
        var steam = (args[0] == 'steam');
        var isFromLocate = (args[1] == 'locate');
        var specifiedLocatePath = (isFromLocate && args[2] ? args[2] : null);
        var fromIM = (args[3]);
        var selectedGame = args[4];
        
        console.log('Creating new installation, steam=' + steam + ', isFromLocate=' + isFromLocate + ', specifiedLocatePath=' + specifiedLocatePath + ', fromIM=' + fromIM);

        // get max index
        var systemFiles = fs.readdirSync(path.join(app.getPath('userData'))).filter(file => file.startsWith('deltamod_system-'));
        systemFiles.forEach((file) => {
            var index = file.split('-')[1];
            if (index === 'unique') return;
            if (index) {
                i = Math.max(i, parseInt(index));
            }
        });

        if (isFromLocate && !fromIM) {
            i = parseInt(require('./System.js').getCurrentSystemIndex());
        }
        else {
            i++;
        }

        var path1 = "";
        if (!steam && !isFromLocate) {
            const result = await dialog.showOpenDialog(win, {
                properties: ['openDirectory'],
            });
            if (result.canceled || !result.filePaths || !result.filePaths[0]) {
                dialog.showErrorBox('No folder selected', 'Please select a folder to proceed.');
                return false;
            }
            path1 = result.filePaths[0];
        }
        else if (steam && !isFromLocate) {
            STEAM_BASE = getSteamDirectory(dialog);

            var chosenEdition = GameDB.getFeatInfo(selectedGame, "steam").data;

            selectedGame = chosenEdition.pid;

            if ((await getInstallations(true)).map(x => x.appid).includes(chosenEdition.appid)) {
                dialog.showErrorBox('Edition already imported', 'The selected edition has already been imported. Please select another edition or remove the existing one from the Install Manager.');
                return false;
            }

            path1 = path.join(STEAM_BASE, chosenEdition.folder);
            console.log('Assumed steam path: ' + path1);
        }
        else {
            path1 = specifiedLocatePath;
        }

        if (validateDeltarune(path1) === null) {
            dialog.showErrorBox('Invalid folder', (steam ? 'The edition you prompted does not exist on your computer\'s hard drive or is corrupted. Download the game from Steam.' : 'The provided folder does not appear to be a valid game installation.'));
            if (chosenEdition.downloadable && process.platform === 'win32') {
                if (dialog.showMessageBoxSync({
                    type: 'question',
                    title: 'Download Deltarune demo',
                    message: 'Would you like to download the Deltarune demo now from Steam?',
                    buttons: ['Yes', 'No'],
                }) === 0) {
                    shell.openExternal('steam://install/' + chosenEdition.appid);
                }
            }
            return false;
        }

        var path2 = getSystemFolderOfIndex('deltaruneInstall',i);

        // officially initialize the folder
        if (!fs.existsSync(path.join(app.getPath('userData'), 'deltamod_system-' + i))) {
            fs.mkdirSync(path.join(app.getPath('userData'), 'deltamod_system-' + i), { recursive: true });
        }

        // Check if the path is valid
        console.log(`Importing game install from ${path1} to ${path2}`);
        if (!fs.existsSync(path1)) {
            dialog.showErrorBox('Invalid folder', 'The provided folder path is invalid.');
            return false;
        }

        var gameEdition = selectedGame;
        if (gameEdition == null || gameEdition == undefined || gameEdition.trim() == "") {
            var games = GameDB.getGames();
       
            var response = dialog.showMessageBoxSync({
                type: 'question',
                title: 'Choose the game',
                message: 'Please choose the game you are importing:',
                buttons: games.map(x => x.name)
            }); // to fix dialog focus issues on some platforms

            gameEdition = games.map(x => x.id)[response];
        }

        var gameInfo = GameDB.getGameById(gameEdition);

        if (!fs.existsSync(path.join(path1, gameInfo.exeName))) {
            dialog.showErrorBox('Invalid install', 'The selected folder does not contain the required game files (' + gameInfo.exeName + ' not found).');
            return false;
        }

        if (!fs.existsSync(path2)) {
            fs.mkdirSync(path2, { recursive: true });
        }


        try {
            copyRecursiveSync(path1, path2);

            KeyValue.setKVSOfIndex('loadedDeltarune', true, i);
            KeyValue.setKVSOfIndex('deltarunePath', path2, i);
            KeyValue.setKVSOfIndex('gamePid', gameEdition, i);
            KeyValue.setKVSOfIndex('deltaruneEdition', 'rem', i); // signal so that gamestore isnt upgraded and reset
            KeyValue.setKVSOfIndex('enabledMods', [], i);
            KeyValue.setKVSOfIndex('isSteam', steam, i);
            KeyValue.setKVSOfIndex('originalSteamPath', (steam ? path1 : ""), i);
            KeyValue.setKVSOfIndex('steamAppId', (steam ? chosenEdition.appid : ""), i);

            if (steam) {
                fs.rmSync(path1, { force: true, recursive: true });
                Junction.createJunction(path2, path1);
                console.log(`Created junction from ${path1} to ${path2}`);
            }
            
            page((fromIM ? "installmanager" : "main"));
            return true;
        } catch (err) {
            var stack = err.stack ? '\n\n' + err.stack : '';
            dialog.showErrorBox('Import failed', `Failed to import game install: ${err.message} ${stack}`);
            errorWin('Failed to import game install: ' + err.toString());
            return false;
        }
    });

    ipcMain.handle('isCurrentIndexSteam', async (event, args) => {
        return KeyValue.readKVSOfIndex('isSteam', parseInt(require('./System.js').getCurrentSystemIndex()));
    });

    ipcMain.handle('removeSteamIntegration', async (event, args) => {
        var currentIndex = require('./System.js').getCurrentSystemIndex();
const https = require('https');
        Junction.deleteJunction(KeyValue.readKVSOfIndex('originalSteamPath', parseInt(currentIndex)));
        KeyValue.setKVSOfIndex('isSteam', false, parseInt(currentIndex));
        KeyValue.setKVSOfIndex('originalSteamPath', "", parseInt(currentIndex));
        KeyValue.setKVSOfIndex('steamAppId', "", parseInt(currentIndex));
        app.relaunch(properRelaunch());
        app.exit();
        process.exit(0);
        return true;
    });

    ipcMain.handle('deleteSystemIndex', async (event, args) => {
        var index = args[0];
        if (KeyValue.readKVSOfIndex('isSteam', parseInt(index)) === true) {
            Junction.deleteJunction(KeyValue.readKVSOfIndex('originalSteamPath', parseInt(index)));
        }
        try {
            var currentIndex = parseInt(fs.readFileSync(getSystemFile('_sysindex',true), 'utf8'));
        }
        catch {
            var currentIndex = 0;
        }
        var pathToDelete = path.join(app.getPath('userData'), 'deltamod_system-' + index);

        if (fs.existsSync(pathToDelete)) {
            fs.rmdirSync(pathToDelete, { recursive: true });
        }

        // Now reorder the remaining sysindex
        var systemFiles = fs.readdirSync(path.join(app.getPath('userData'))).filter(file => file.startsWith('deltamod_system-'));

        var cNum = -1;
        systemFiles.forEach((file) => {
            var idx = file.split('-')[1];
            if (idx === 'unique') return;
            cNum++;

            var oldPath = path.join(app.getPath('userData'), file);
            var newPath = path.join(app.getPath('userData'), 'deltamod_system-' + cNum);

            fs.renameSync(oldPath, newPath);
            console.log(`Shifted index: ${file.split('-')[1]} -> ${cNum}`);

            var cnamePath = path.join(newPath, '_cname');
            if (fs.existsSync(cnamePath)) {
                var cname = fs.readFileSync(cnamePath, 'utf8');
                if (cname.startsWith('Install #')) {
                    console.log('Shifting CName for index', cNum);
                    fs.writeFileSync(cnamePath, 'Install #' + (cNum+1));
                }
            }
        });

        fs.writeFileSync(getSystemFile('_sysindex',true), (0).toString());

        app.relaunch(intoIM());
        app.exit();

        return true;
    });

    ipcMain.handle('openInstallationFolder', async (event, args) => {
        shell.openExternal(getSystemFolderOfIndex('deltaruneInstall', args[0]));
    });

    ipcMain.handle('isDevMode', async (event, args) => {
        return (process.argv.includes('--developer'));
    });

    ipcMain.handle('getGameInfo', async (event, args) => {
        return GameDB.getGameById(args[0]);
    });

    ipcMain.handle('getAvailableGames', async (event, args) => {
        return GameDB.getGames();
    });

    ipcMain.handle('canReportError', async (event, args) => {
        return !(process.argv.includes('--developer')) && !(updateAvailable);
    });
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', (e, argv) => {
    console.log("Received second-instance check:", argv);
    const maybeUrl = argv.find(arg => arg.startsWith('deltamod://'));
    if (maybeUrl)
    {
        handleProtocolLaunch(maybeUrl);
        page('goc-dl');
        win.focus();
    }
});


app.whenReady().then(() => {
    if (process.platform === 'win32' || process.platform === 'linux') {
        const maybeUrl = process.argv.find(arg => arg.startsWith('deltamod://'));
        if (maybeUrl)
            handleProtocolLaunch(maybeUrl);
    }

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
    try {
        if (process.platform === 'win32') {
            console.log('Killing GM3P.exe processes...');
            execSync('taskkill /IM GM3P.exe /F', { stdio: 'ignore' });
            console.log('Killing DEVICE_FUSION.exe processes...');
            execSync('taskkill /IM GamemakerModMerger.exe /F', { stdio: 'ignore' });
        }
    } catch (e) {
        console.warn('Failed to terminate GM3P processes:', e && e.message ? e.message : e);
    }
    // This originally didn't quit the app was on macOS
    // However, the app shows an error and instantly crashes on macOS when trying to click
    // the app icon to open a new window.
    // I think making the app close when all windows are closed on macOS is okay for now.
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

module.exports = {
    loadUrl
};
