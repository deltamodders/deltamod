const { app, BrowserWindow, dialog, protocol, session, shell, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { getConfig, config } = require('7zip-min');
const { path7za } = require('7zip-bin');

// Local modules
const Paths = require('./Paths');
const KeyValue = require('./KeyValue');
const Language = require('./Language');
const { getSystemFile, setSystemIndex } = require('./System');
const System = require('./System');
const { setWindow, page, between } = require('./Utils');
const CMode = require('./ControllerMode');
const GamePatching = require('./GamePatching');
const Netlayer = require('./Netlayer');
const console = require('./Console');
const { handleProtocolLaunch, registerProtocolSchemesAsPrivileged, registerProtocolHandlers } = require('./Protocol');
const { isFeatureEnabled } = require('./FeatureFlags');
const { PARTITION } = require('./Config');
const registerIPCHandlers = require('./IPCHandlers');

// --- Global Setup & State ---
let win;

const isControllerMode = process.argv.includes('-controller');
const isDevToolsEnabled = process.argv.includes('--developer') || process.env.DELTAMOD_ENV === 'dev';

// Shared state object specifically for IPC injection context tracking
const appState = {
    updateAvailable: false,
    ignoreUpdate: false,
    callbackNPS: null,
    callbackNPSPassWith: null,
    elecTracer: null,
    STEAM_BASE: null
};

// --- Initialization ---
app.commandLine.appendSwitch('disable-features', 'MediaSessionService');
registerProtocolSchemesAsPrivileged(protocol);

if (process.argv.includes('--developer') && !isFeatureEnabled("AutoupdateNoMatterWhat")) {
    appState.ignoreUpdate = true;
}

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('deltamod', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('deltamod');
}

// --- Setup Language ---
const langFile = System.getSystemFile('language', true);
if (fs.existsSync(langFile)) {
    Language.loadLanguage(fs.readFileSync(langFile, 'utf8'));
} else {
    Language.loadLanguage('en');
    fs.writeFileSync(langFile, 'en', 'utf8');
}

// --- Utilities ---

/**
 * Triggers the fallback error window when a critical failure occurs.
 * @param {Error|string} error - The error to display.
 */
function errorWin(error) {
    if (win) win.setFullScreen(false);
    return require('./ErrorWin.js').errorWin(error);
}

/**
 * Helper to direct the main window to a specific URL.
 * @param {string} url - The URL to load.
 */
function loadUrl(url) {
    win.loadURL(url);
}

/**
 * Generates a SHA-256 hash for a given string.
 * @param {string} str - Input string.
 * @returns {string} The computed hex hash.
 */
function hashString(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Utility to pause execution for a set duration using async/await.
 * @param {number} amount - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function asyncTimeout(amount) {
    return new Promise(resolve => setTimeout(resolve, amount));
}

/**
 * Clears the standard console and prints the ASCII logo and current version.
 */
function writeTopPart() {
    process.stdout.write('\x1b]0;Deltamod\x07');
    console.clear();
    process.stdout.write(`${fs.readFileSync(path.join(__dirname, '..', 'ascii.txt'), 'utf8')}\r\n\r\n`);
    process.stdout.write(`[ version ${app.getVersion()} ]\r\n\r\n`);
}

/**
 * Detects and kills active patcher processes on Windows to prevent lock conflicts during startup.
 */
function killConflictProcesses() {
    if (process.platform !== 'win32') return;

    try {
        const procs = execSync('tasklist', { encoding: 'utf8' }).toLowerCase();
        const found = [];
        if (procs.includes('gm3p.exe')) found.push('GM3P.exe');
        if (procs.includes('gamemakermodmerger.exe')) found.push('GamemakerModMerger.exe');
        if (procs.includes('g3mtool.exe')) found.push('G3MTool.exe');

        if (found.length > 0) {
            const res = dialog.showMessageBoxSync({
                type: 'warning',
                title: 'Close running processes',
                message: `Deltamod detected these running process${found.length > 1 ? 'es' : ''}: ${found.join(', ')}.\n\nPlease close them before opening Deltamod as when the app closes these may terminate.`,
                buttons: ['Kill them for me', 'Close the app', 'Ignore (may cause issues)'],
            });

            if (res === 0) {
                if (found.includes('GM3P.exe')) execSync('taskkill /IM GM3P.exe /F', { stdio: 'ignore' });
                if (found.includes('GamemakerModMerger.exe')) execSync('taskkill /IM GamemakerModMerger.exe /F', { stdio: 'ignore' });
                if (found.includes('G3MTool.exe')) execSync('taskkill /IM G3MTool.exe /F', { stdio: 'ignore' });
                console.log('Conflict processes terminated.');
            } else if (res === 1) {
                app.quit();
                process.exit(0);
            }
        }
    } catch (e) {
        console.warn('Process-check wrapper failed:', e?.message || e);
    }
}

/**
 * Checks if a specific path is a child (subpath) of a parent directory.
 * @param {string} parent - The parent path.
 * @param {string} child - The subpath to test.
 * @returns {boolean}
 */
function isSubpath(parent, child) {
    const a = path.resolve(parent).toLowerCase();
    const b = path.resolve(child).toLowerCase();
    return b.startsWith(a + path.sep) || a === b;
}

/**
 * Moves/copies all files from a wrapper directory into a destination, then deletes the wrapper.
 * @param {string} dest - Destination folder.
 * @param {string} wrapper - Source folder to flatten.
 */
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
        const to = path.join(destR, name);
        try { fs.rmSync(to, { recursive: true, force: true }); } catch {}
        try {
            fs.renameSync(from, to);
        } catch {
            if (fs.statSync(from).isDirectory()) {
                console.error('Cannot flatten directories recursively in this context.');
            } else {
                fs.mkdirSync(path.dirname(to), { recursive: true });
                fs.copyFileSync(from, to);
            }
            fs.rmSync(from, { recursive: true, force: true });
        }
    }
    try { fs.rmSync(wrapR, { recursive: true, force: true }); } catch {}
}

// --- Window Creation ---

/**
 * Bootstraps the application layout, enforces hardware requirements, configures primary partitioning routes, and constructs the primary BrowserWindow interface instance.
 */
function createWindow() {
    writeTopPart();
    killConflictProcesses();
    
    KeyValue.upgradeStores();
    KeyValue.loadUniqueDefaults();
    config({ ...getConfig(), binaryPath: path7za });
    try { System.clearTemporary(); } catch (e) { console.error(e); }

    const sysArg = process.argv.find(a => a.startsWith('---system_index='));
    if (sysArg) {
        try {
            const val = sysArg.split('=')[1];
            if (/^-?\d+$/.test(val)) fs.writeFileSync(getSystemFile('_sysindex', true), val, 'utf8');
        } catch {}
    }

    const partOverride = getSystemFile('_sysindex', true);
    if (fs.existsSync(partOverride)) {
        const overrideData = fs.readFileSync(partOverride, 'utf8');
        if (parseInt(overrideData, 10) < 0) console.error('The specified installation is invalid.');
        setSystemIndex(overrideData);
    } else {
        setSystemIndex('0');
    }

    registerProtocolHandlers(session.fromPartition(PARTITION));

    const unmetConditions = require('./RunConditions.js').checkConditions();
    if (unmetConditions.length > 0) {
        const requiredUnmet = unmetConditions.filter(c => c.required);
        if (requiredUnmet.length > 0) {
            dialog.showMessageBoxSync({ type: 'error', title: 'PC Requirements Not Met', message: `Missing requirements:\n${requiredUnmet.map(n => n.name).join('\n')}\n\nDeltamod will not run.` });
            return app.exit(1);
        } else {
            dialog.showMessageBoxSync({ type: 'warning', title: 'PC Requirements Not Met', message: `Missing suggested requirements:\n${unmetConditions.map(n => n.name).join('\n')}\n\nYou might experience issues.` });
        }
    }

    const bounds = screen.getPrimaryDisplay().workAreaSize;
    
    KeyValue.retrieve();
    win = new BrowserWindow({
        width: bounds.width * 0.4,
        height: bounds.height * 0.7,
        resizable: true,
        frame: false,
        fullscreen: isControllerMode,
        webPreferences: { nodeIntegration: true, partition: PARTITION, preload: Paths.file('web', 'preload.js') }
    });

    setWindow(win);

    // --- Inject State and Register IPC Handlers ---
    registerIPCHandlers({
        getWindow: () => win,
        isControllerMode,
        isDevToolsEnabled,
        errorWin,
        state: appState
    });

    if (isControllerMode) {
        CMode.start();
        win.setMenu(Menu.buildFromTemplate([
            { label: 'View', submenu: [
                { label: 'Exit Controller Mode', accelerator: 'F11', click: () => win.webContents.executeJavaScript('promptLeaveCMode()') },
                { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => { if (isDevToolsEnabled) win.webContents.toggleDevTools(); } }
            ]}
        ]));
        win.on('blur', () => CMode.stop());
        win.on('focus', () => CMode.start());
    }

    win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        if (details.url.startsWith('https://')) {
            const locked = !Netlayer.approve(between(details.url, 'https://', '/'));
            if (locked) errorWin(`A request to an unapproved URL was blocked: ${details.url}`);
            return callback({ cancel: locked });
        }
        callback({ cancel: false });
    });

    win.on('resized', () => {
        let [w, h] = win.getSize();
        if (w < 800) w = 800;
        if (h < 600) h = 600;
        win.setSize(w, h);
        win.webContents.send('winResAlert', []);
    });

    if (!isDevToolsEnabled) win.setMenu(null);
    win.webContents.on('devtools-opened', () => { if (!isDevToolsEnabled) win.webContents.closeDevTools(); });
    win.webContents.on('will-navigate', (event, url) => { if (/^https?:\/\//.test(url)) { event.preventDefault(); shell.openExternal(url); } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });

    win.loadURL('deltapack://web/index.html');
}

// --- App Lifecycle ---
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', (e, argv) => {
        const maybeUrl = argv.find(arg => arg.startsWith('deltamod://'));
        if (maybeUrl) {
            handleProtocolLaunch(maybeUrl);
            page('goc-dl');
            if (win) win.focus();
        }
    });
}

app.whenReady().then(() => {
    if (['win32', 'linux'].includes(process.platform)) {
        const maybeUrl = process.argv.find(arg => arg.startsWith('deltamod://'));
        if (maybeUrl) handleProtocolLaunch(maybeUrl);
    }

    try {
        const p = KeyValue.readKVS('deltarunePath');
        if (p) GamePatching.restoreOriginalsIfAny(p);
    } catch {}

    createWindow();
});

app.on('window-all-closed', () => {
    try {
        CMode.stop();
        if (process.platform === 'win32') {
            execSync('taskkill /IM GM3P.exe /F', { stdio: 'ignore' });
            execSync('taskkill /IM GamemakerModMerger.exe /F', { stdio: 'ignore' });
        }
    } catch {}
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

module.exports = { loadUrl };