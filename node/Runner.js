const { app, BrowserWindow, ipcMain, dialog, protocol, session, shell, screen, Notification, safeStorage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const axios = require('axios').default;
const mime = require('mime-types');
const createDesktopShortcut = require('create-desktop-shortcuts');
const _7z = require('7zip-min');
const { getConfig, config } = require('7zip-min');
const { path7za } = require('7zip-bin');

// Local modules
const Paths = require('./Paths');
const KeyValue = require('./KeyValue');
const Language = require('./Language');
const { getSystemFile, getSystemFolder, getPacketDatabase, setSystemIndex, getSystemFolderOfIndex } = require('./System');
const System = require('./System');
const { setWindow, page, getSharedVar, setSharedVar, properRelaunch, getSteamDirectory, getFileVersion, between } = require('./Utils');
const Modstore = require('./Modstore');
const CMode = require('./ControllerMode');
const Updates = require('./Updates');
const GameDB = require('./GameDB');
const { createProgressModal, updateProgressModal, closeAllProgressModals } = require('./ProgressModal');
const GamePatching = require('./GamePatching');
const Junction = require('./Junction');
const Netlayer = require('./Netlayer');
const console = require('./Console');
const { handleProtocolLaunch, registerProtocolSchemesAsPrivileged, registerProtocolHandlers } = require('./Protocol');
const { isFeatureEnabled } = require('./FeatureFlags');
const { PARTITION } = require('./Config');

// --- Global State ---
let win;
let elecTracer;
let abortController;
let updateAvailable = false;
let ignoreUpdate = false;
let callbackNPS;
let callbackNPSPassWith;
let STEAM_BASE;

const isControllerMode = process.argv.includes('-controller');
const isDevToolsEnabled = process.argv.includes('--developer') || process.env.DELTAMOD_ENV === 'dev';

// --- Initialization ---
app.commandLine.appendSwitch('disable-features', 'MediaSessionService');
registerProtocolSchemesAsPrivileged(protocol);

if (process.argv.includes('--developer') && !isFeatureEnabled("AutoupdateNoMatterWhat")) {
    ignoreUpdate = true;
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
 * Determines the dominant color of an image (currently a stub).
 * @param {string} imagePath - Path to the image file.
 * @returns {Promise<string>} The RGB string.
 */
async function dominantColor(imagePath) {
    return 'rgb(255,255,255)'; // TODO: implement
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
 * Modifies the launch arguments to route the app directly into the Install Manager mode.
 * @returns {Object} Relaunch argument payload.
 */
function intoIM() {
    return { args: [...process.argv.slice(1).filter(x => !x.toLowerCase().startsWith('deltamod://')), '---im'] };
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

// --- System & File Management ---

/**
 * Retrieves and merges built-in themes with user-created custom themes.
 * @returns {Array<Object>} An array of theme configuration objects.
 */
function obtainThemes() {
    const customThemeDir = path.join(app.getPath('appData'), 'deltamod', 'customThemes');
    if (!fs.existsSync(customThemeDir)) {
        fs.mkdirSync(path.join(customThemeDir, 'data'), { recursive: true });
        fs.mkdirSync(path.join(customThemeDir, 'img'), { recursive: true });
        fs.mkdirSync(path.join(customThemeDir, 'mus'), { recursive: true });
    }

    const available = fs.readdirSync(path.join(__dirname, '..', 'web', 'themes', 'data'))
        .filter(f => f.endsWith('.theme.json'));
    const available2 = fs.readdirSync(path.join(customThemeDir, 'data'))
        .filter(f => f.endsWith('.theme.json'));

    const builtInThemes = available.map(f => ({
        ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'themes', 'data', f), 'utf8')),
        builtIn: true
    }));

    const customThemes = available2.map(f => ({
        ...JSON.parse(fs.readFileSync(path.join(customThemeDir, 'data', f), 'utf8')),
        builtIn: false
    })).filter(x => {
        const include = !available.map(n => n.replace('.theme.json', '')).includes(x.id);
        if (!include) console.log(`Custom theme "${x.id}" ignored because a built-in theme with the same ID exists.`);
        return include;
    });

    return [...builtInThemes, ...customThemes];
}

/**
 * Validates a Deltarune installation path by ensuring `data.win` exists.
 * @param {string} deltapath - The path to the game folder.
 * @returns {string|null} The path if valid, null otherwise.
 */
function validateDeltarune(deltapath) {
    const keyItems = ['data.win'];
    const isValid = keyItems.every(item => {
        const exists = fs.existsSync(path.join(deltapath, item));
        if (!exists) console.log(`Missing key item: ${path.join(deltapath, item)}`);
        return exists;
    });
    return isValid ? deltapath : null;
}

/**
 * Similar to validateDeltarune, returns boolean instead of path.
 * @param {string} deltapath - The path to the game folder.
 * @returns {boolean} True if data.win exists.
 */
function validateMyInstall(deltapath) {
    return ['data.win'].every(item => fs.existsSync(path.join(deltapath, item)));
}

/**
 * Scans the app user data directory for valid Deltarune installations managed by Deltamod.
 * @param {boolean} suppressWarnings - Whether to hide popups for invalid installations.
 * @returns {Promise<Array<Object>>} Array of installation profiles.
 */
async function getInstallations(suppressWarnings = false) {
    const userDataPath = app.getPath('userData');
    const systemFiles = fs.readdirSync(userDataPath).filter(file => file.startsWith('deltamod_system-'));
    const installations = [];

    for (const file of systemFiles) {
        if (file.endsWith('unique')) continue;

        const installPath = path.join(userDataPath, file);
        const index = parseInt(file.split('-')[1], 10);
        const storeJSON = path.join(installPath, 'store.json');
        const deltaruneInstall = path.join(installPath, 'deltaruneInstall');
        const cnamePath = path.join(installPath, '_cname');

        if (!fs.existsSync(deltaruneInstall) || !fs.existsSync(storeJSON)) {
            const defaultCName = `Install #${index + 1}`;
            const cname = fs.existsSync(cnamePath) ? fs.readFileSync(cnamePath, 'utf8') : defaultCName;

            if (!suppressWarnings) {
                dialog.showMessageBoxSync({
                    type: 'warning',
                    title: 'Invalid Installation Found',
                    message: `An invalid or not fully imported installation of Deltarune was found and will be removed from Deltamod: ${cname}.`,
                });
            }

            fs.rmSync(installPath, { recursive: true, force: true });
            console.log(`Removed invalid installation: ${file}`);
            continue;
        }

        let commonName = `Install #${index + 1}`;
        try {
            commonName = fs.readFileSync(cnamePath, 'utf8');
        } catch {
            fs.writeFileSync(cnamePath, commonName);
        }

        installations.push({
            index,
            name: commonName,
            steam: KeyValue.readKVSOfIndex('isSteam', index) === true,
            pid: KeyValue.readKVSOfIndex('gamePid', index),
            appid: KeyValue.readKVSOfIndex('steamAppId', index)
        });
    }

    return installations;
}

/**
 * Recursively searches a directory tree for the first file matching a specific name.
 * @param {string} root - Directory to start the search.
 * @param {string} name - Name of the file to find.
 * @returns {string|null} The full path to the file, or null if not found.
 */
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

/**
 * Recursively reads a directory and writes `.hash` files for every file inside.
 * @param {string} root - Target directory.
 */
async function precalculateHashes(root) {
    if (!fs.existsSync(root) || fs.lstatSync(root).isFile()) return;

    const allFiles = [];
    function walkDir(dir) {
        for (const file of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, file);
            if (fs.lstatSync(fullPath).isDirectory()) walkDir(fullPath);
            else allFiles.push(fullPath);
        }
    }
    walkDir(root);

    console.log(`Precalculating hashes for ${allFiles.length} files...`);
    allFiles.forEach((filePath, i) => {
        if (filePath.endsWith('.hash')) return;
        const fileBuffer = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        fs.writeFileSync(`${filePath}.hash`, hash, 'utf8');
        console.log(`Hashed file ${i + 1} / ${allFiles.length}`);
    });
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
                copyRecursiveSync(from, to);
            } else {
                fs.mkdirSync(path.dirname(to), { recursive: true });
                fs.copyFileSync(from, to);
            }
            fs.rmSync(from, { recursive: true, force: true });
        }
    }
    try { fs.rmSync(wrapR, { recursive: true, force: true }); } catch {}
}

/**
 * Synchronously deep-copies a directory and all its contents to a new destination.
 * @param {string} src - Source file/folder.
 * @param {string} dest - Destination file/folder.
 */
function copyRecursiveSync(src, dest) {
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursiveSync(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// --- IPC Initialization ---

/**
 * Centralizes all Electron `ipcMain` handler registrations for frontend-to-backend communication.
 */
function registerIPCHandlers() {
    const { getGBUIConf } = require('./GameBananaWindow');

    // Returns whether the app was launched in Controller Mode.
    ipcMain.handle('isCMode', () => isControllerMode);
    
    // Checks if the CLI arguments request jumping straight to Install Manager.
    ipcMain.handle('shouldGoIM', () => process.argv.includes('---im'));
    
    // Returns diagnostic string (Version, OS, Mode flags, Update status).
    ipcMain.handle('diagnosticInfo', () => `Deltamod ${app.getVersion()} - Running on ${os.platform()} ${os.release()} - cmode ${isControllerMode ? 'on' : 'off'} - devtools ${isDevToolsEnabled ? 'enabled' : 'disabled'} - ${updateAvailable ? 'update available' : 'no update'}`);
    
    // Returns true if running as a packaged app vs dev build.
    ipcMain.handle('isPackaged', () => app.isPackaged);
    
    // Returns the app version from package.json.
    ipcMain.handle('version', () => require('../package.json').version);
    
    // Returns basic OS platform/version details.
    ipcMain.handle('getOS', () => ({ platform: process.platform, release: os.release(), version: os.version() }));
    
    // Returns whether developer mode is enabled via arguments.
    ipcMain.handle('isDevMode', () => process.argv.includes('--developer'));

    // Triggers an artificial error window for testing UI bounds/reactions.
    ipcMain.handle('sampleError', () => errorWin('This is a sample error triggered from the renderer process.'));
    
    // Bridges frontend console.log to the backend terminal out.
    ipcMain.handle('log', (event, args) => console.rendererLog(args[1], args[2], args[0]));
    
    // Unhides the sender's BrowserWindow.
    ipcMain.handle('showWindow', (event) => BrowserWindow.fromWebContents(event.sender).show());
    
    // Minimizes the sender's BrowserWindow.
    ipcMain.handle('minimizeMe', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
    
    // Toggles the sender's BrowserWindow fullscreen state.
    ipcMain.handle('toggleFullscreen', (event) => {
        const senderWin = BrowserWindow.fromWebContents(event.sender);
        if (senderWin) senderWin.setFullScreen(!senderWin.isFullScreen());
    });
    
    // Opens a given URL in the user's default external web browser.
    ipcMain.handle('openExternal', (event, args) => shell.openExternal(args[0]));
    
    // Opens the file explorer highlighting the specified item.
    ipcMain.handle('showItem', (event, args) => shell.showItemInFolder(args[0]));

    // Relaunches the application into Controller Mode.
    ipcMain.handle('cmode-on', () => {
        app.relaunch({ args: [...process.argv.slice(1).filter(arg => arg !== '-controller' && !arg.startsWith('deltamod://')), '-controller'] });
        app.exit(0);
    });
    
    // Relaunches the application disabling Controller Mode.
    ipcMain.handle('cmode-off', () => {
        app.relaunch({ args: process.argv.slice(1).filter(arg => arg !== '-controller' && !arg.startsWith('deltamod://')) });
        app.exit(0);
    });
    
    // Relaunches the app explicitly appending the --developer flag.
    ipcMain.handle('rebootDev', async () => {
        if (process.argv.includes('--developer')) return false;
        const existingArgs = process.argv.slice(1).filter(a => !a.startsWith('---system_index=') || a === '---initialize_deltamod' || a.startsWith('deltamod:'));
        app.relaunch({ args: [...existingArgs, '--developer'] });
        app.exit(0);
    });

    // --- Language Handlers ---
    // Gets all available localizations.
    ipcMain.handle('obtainLangs', () => Language.getAvailableLanguages());
    
    // Sets and persists the UI language.
    ipcMain.handle('setLang', (event, args) => {
        fs.writeFileSync(getSystemFile('language', true), args[0], 'utf8');
        Language.loadLanguage(args[0]);
        return true;
    });
    
    // Fetches the currently set language key.
    ipcMain.handle('getLang', () => fs.existsSync(langFile) ? fs.readFileSync(langFile, 'utf8') : 'en');
    
    // Retrieves a translation string by its key.
    ipcMain.handle('obtainLangKey', (event, args) => Language.loadString(args[0]) || `$${args[0]}`);
    
    // Retrieves a formatted translation string using parameterized arguments.
    ipcMain.handle('obtainLangKeyAdv', (event, args) => Language.loadString(args[0], ...args.slice(1)) || `$${args[0]} ${args.slice(1).join(' + ')}`);

    // --- Themes ---
    // Opens a selection dialog for users to pick an active theme.
    ipcMain.handle('chooseTheme', async () => {
        const themesDir = path.join(__dirname, '..', 'web', 'themes');
        const themeObjects = fs.readdirSync(themesDir)
            .filter(f => f.endsWith('.theme.json'))
            .map(f => JSON.parse(fs.readFileSync(path.join(themesDir, f), 'utf8')));

        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            title: 'Select a theme',
            message: 'Select a theme from the list below:',
            buttons: [...themeObjects.map(t => t.name), 'Cancel'],
            cancelId: themeObjects.length
        });
        
        if (choice === themeObjects.length) return;
        
        const themeId = themeObjects[choice].id;
        fs.writeFileSync(System.getSystemFile('_theme', true), themeId);
        win.webContents.send('themeChange');
    });

    // Forces a specific theme ID to be active.
    ipcMain.handle('setTheme', (event, args) => fs.writeFileSync(System.getSystemFile('_theme', true), args[0]));
    
    // Retrieves all loaded custom and built-in themes.
    ipcMain.handle('getThemes', () => obtainThemes());
    
    // Validates and retrieves the currently active theme's ID, defaulting to 'base'.
    ipcMain.handle('getTheme', async () => {
        const themeHost = System.getSystemFile('_theme', true);
        let themeId = 'base';
        
        if (fs.existsSync(themeHost)) {
            themeId = fs.readFileSync(themeHost, 'utf8');
            const validThemes = obtainThemes();
            if (!validThemes.find(t => t.id === themeId)) themeId = 'base';
        }
        
        fs.writeFileSync(themeHost, themeId);
        return themeId;
    });

    // Prompts the user for a bg and music track, builds a custom theme, and saves it.
    ipcMain.handle('importTheme', async () => {
        const musicPath = (await dialog.showOpenDialog(win, { title: 'Select your music file', filters: [{ name: 'MP3 files', extensions: ['mp3'] }] })).filePaths[0];
        const bgPath = (await dialog.showOpenDialog(win, { title: 'Select your background image', filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg'] }] })).filePaths[0];
        if (!musicPath || !bgPath) return;

        const randomSeed = Math.random().toString(36).substring(2, 15);
        const themeId = `custom_${randomSeed}`;
        const themeName = `Custom Theme (${new Date().toLocaleString()})`;
        const customThemesDir = path.join(app.getPath('appData'), 'deltamod', 'customThemes');

        fs.copyFileSync(musicPath, path.join(customThemesDir, 'mus', `${themeId}.mp3`));
        fs.copyFileSync(bgPath, path.join(customThemesDir, 'img', `${themeId}.png`));

        const config = {
            name: themeName,
            background: `${themeId}.png`,
            description: `Custom theme imported by the user - ${new Date().toLocaleString()}`,
            mainSong: `${themeId}.mp3`,
            id: themeId,
            musicTrack: "Custom music",
            color: await dominantColor(bgPath)
        };

        fs.writeFileSync(path.join(customThemesDir, 'data', `${themeId}.theme.json`), JSON.stringify(config, null, 4), 'utf8');
        page('themesel');
    });

    // --- Sponsors ---
    // Opens dialog to select the character (sponsor) shown during patching screens.
    ipcMain.handle('setSponsor', async () => {
        const base = path.join(__dirname, '..', 'web', 'views', 'patching', 'sponsors');
        let sponsors = fs.readdirSync(base);
        if (Math.random() >= 0.08) sponsors = sponsors.filter(s => s !== 'musical');

        const buttons = sponsors.map(s => JSON.parse(fs.readFileSync(path.join(base, s, 'config.sponsor.json'), 'utf8')).name);

        const choice = dialog.showMessageBoxSync(win, {
            type: 'question',
            title: 'Select a patching character',
            message: 'Select a patching character from the list below:',
            buttons: [...buttons, 'Cancel'],
        });

        if (choice === buttons.length) return;
        fs.writeFileSync(System.getSystemFile('_sponsor', true), sponsors[choice]);
    });
    
    // Gets the current sponsor ID, defaulting to 'cd'.
    ipcMain.handle('getSponsor', () => {
        const sponsorHost = System.getSystemFile('_sponsor', true);
        if (fs.existsSync(sponsorHost)) return fs.readFileSync(sponsorHost, 'utf8');
        fs.writeFileSync(sponsorHost, 'cd');
        return 'cd';
    });

    // --- GameBanana Auth & API ---
    // Prompts GameBanana login and securely stores the API token.
    ipcMain.handle('loginGamebanana', async () => {
        if (!safeStorage.isEncryptionAvailable()) {
            dialog.showMessageBoxSync({
                type: 'warning',
                title: 'Reduced security',
                message: 'Your system does not support secure storage. GameBanana login information will be stored without encryption.',
            });
        }
        const token = await require('./GameBananaWindow.js').obtainLogin();
        const file = getSystemFile('bananapwd', true);
        fs.writeFileSync(file, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : token, 'utf8');
        return true;
    });
    
    // Logs out by destroying the stored GameBanana token file.
    ipcMain.handle('logoutGamebanana', async () => {
        try { fs.unlinkSync(getSystemFile('bananapwd', true)); } catch {}
        require('./GameBananaWindow.js').clearCache();
        return true;
    });
    
    // Clears local GameBanana cache details.
    ipcMain.handle('eraseGamebananaCache', () => require('./GameBananaWindow.js').clearCache());
    
    // Submits a comment to GameBanana if the user is authenticated.
    ipcMain.handle('leaveCommentGamebanana', async (event, args) => {
        const uiconf = await getGBUIConf();
        if (uiconf._idMemberRow > 0) return await require('./GameBananaWindow.js').leaveComment(args[0], args[1], args[2]);
    });
    
    // Likes a mod on GameBanana via API.
    ipcMain.handle('gbLikeMod', async (event, args) => {
        const uiconf = await getGBUIConf();
        if (uiconf._idMemberRow > 0) return await require('./GameBananaWindow.js').likeMod(args[0], args[1]);
    });
    
    // Confirms if the GameBanana token in memory is valid/authenticated.
    ipcMain.handle('validateGamebananaToken', async () => (await getGBUIConf())._idMemberRow > 0);
    
    // Exports the decrypted GameBanana token to a text file for developers.
    ipcMain.handle('dev_getGBToken', async () => {
        const file = getSystemFile('bananapwd', true);
        if (!fs.existsSync(file)) return dialog.showMessageBoxSync({ type: 'error', title: 'No GameBanana Token', message: 'No token found.' });
        
        const contents = fs.readFileSync(file);
        const token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(contents) : contents.toString('utf8');
        const result = await dialog.showSaveDialog(win, { title: 'Save GameBanana Token', defaultPath: path.join(os.homedir(), 'gamebanana_token.txt') });
        if (!result.canceled && result.filePath) fs.writeFileSync(result.filePath, token, 'utf8');
    });
    
    // Gets the logged-in GameBanana user's avatar URL.
    ipcMain.handle('getGamebananaPic', async () => (await getGBUIConf())._sAvatarUrl);
    
    // Gets the logged-in GameBanana user's ID.
    ipcMain.handle('getGamebananaID', async () => (await getGBUIConf())._idMemberRow);
    
    // Fetches extended user profile info from GameBanana API.
    ipcMain.handle('getGamebananaUserinfo', async () => {
        const id = (await getGBUIConf())._idMemberRow;
        if (id <= 0) return { loggedIn: false };
        const profile = await axios.get(`https://gamebanana.com/apiv11/Member/${id}/ProfilePage`);
        return { ...profile.data, loggedIn: true };
    });

    // --- Patcher ---
    // Prompts user to select a zip file to import an updated GM3P/DEVICE_FUSION patcher core.
    ipcMain.handle('importPatcher', async () => {
        const zip = (await dialog.showOpenDialog(win, { title: 'Select a mod patcher ZIP file', filters: [{ name: 'ZIP files', extensions: ['zip'] }] })).filePaths[0];
        if (!zip) return;

        const patcherPath = path.join(__dirname, '..', 'gm3p');
        const tempPath = path.join(app.getPath('temp'), `deltamod_patcher_${Date.now()}`);

        await new Promise((resolve, reject) => _7z.unpack(zip, tempPath, err => err ? reject(err) : resolve()));

        const possibleExecutables = ['GM3P.exe', 'GamemakerModMerger.exe', 'G3MTool.exe'];
        const found = possibleExecutables.some(exe => fs.existsSync(path.join(tempPath, exe)));

        if (!found) {
            dialog.showMessageBoxSync({ type: 'error', title: 'No compatible patcher found', message: 'The selected ZIP file does not contain a supported patching core.' });
            fs.rmSync(tempPath, { recursive: true, force: true });
        } else {
            if (fs.existsSync(patcherPath)) fs.rmSync(patcherPath, { recursive: true, force: true });
            fs.renameSync(tempPath, patcherPath);
            dialog.showMessageBoxSync({ type: 'info', title: 'Patcher Imported', message: 'The patcher was successfully imported and is ready to use.' });
        }

        app.relaunch({ args: process.argv.slice(1).filter(arg => arg !== '-controller' && !arg.startsWith('deltamod://')).concat(isControllerMode ? ['-controller'] : []) });
        app.exit(0);
    });
    
    // Validates if the required external patching executable exists locally.
    ipcMain.handle('hasPatchingCore', () => {
        const selectedPatcher = KeyValue.readKVS('selectedPatcher');
        if (selectedPatcher !== 'GM3P' && selectedPatcher !== 'DEVICE_FUSION') return true;
        return fs.existsSync(path.join(__dirname, '..', 'gm3p'));
    });
    
    // Grabs file properties/versions to trace the commit info of the patcher core.
    ipcMain.handle('myCommitInfo', () => {
        const exes = ['GM3P.exe', 'GamemakerModMerger.exe', 'G3MTool.exe'];
        for (const exe of exes) {
            const exepath = path.join(__dirname, '..', 'gm3p', exe);
            if (fs.existsSync(exepath)) {
                try {
                    return `<br>${exe.replace('.exe', '')}, version ${getFileVersion(exepath)}`;
                } catch (e) {
                    console.error(`Failed to get version for ${exe}:`, e);
                }
            }
        }
        return '<br>No external patching core detected';
    });
    
    // Downloads a fresh copy of the GM3P patcher package from an online URL.
    ipcMain.handle('downloadGM3P', async (event, args) => {
        const url = args[0];
        const modal = createProgressModal();
        const destPath = path.join(app.getPath('downloads'), "gm3p_pkg.zip");
        const writer = fs.createWriteStream(destPath);

        try {
            const response = await axios({ method: 'get', url, responseType: 'stream' });
            const totalLength = parseInt(response.headers['content-length'] || '0', 10);
            let downloaded = 0;

            response.data.on('data', chunk => {
                downloaded += chunk.length;
                if (totalLength) updateProgressModal(modal, win, downloaded / totalLength, 'Downloaded');
            });

            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            if (win) win.setProgressBar(0);
            fs.rmSync(path.join(__dirname, '..', 'gm3p'), { recursive: true, force: true });
            fs.mkdirSync(path.join(__dirname, '..', 'gm3p'), { recursive: true });
            await _7z.unpack(destPath, path.join(__dirname, '..', 'gm3p'));
            
            modal.destroy();
            dialog.showMessageBoxSync(win, { type: 'info', title: 'Download Complete', message: 'Patcher package downloaded and extracted successfully.' });
            
            app.relaunch(properRelaunch());
            app.quit();
            process.exit(0);

        } catch (err) {
            modal.destroy();
            console.error('Error downloading patcher:', err);
            dialog.showErrorBox('Download Error', 'An error occurred while downloading the Patcher package.');
            app.relaunch(properRelaunch());
            app.quit();
            process.exit(1);
        }
        return destPath;
    });

    // --- Mod Management ---
    // Opens file dialog for user to select a zip/7z to import into Modstore.
    ipcMain.handle('importMod', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [{ name: 'Deltamod compatible archive', extensions: ['zip', '7z', 'tar.gz', 'lzma'] }]
        });
        if (!canceled && filePaths?.[0]) Modstore.importMod(filePaths[0]);
    });
    
    // Requests deletion of a mod folder by ID.
    ipcMain.handle('removeMod', async (event, args) => await Modstore.removeModSafe(args[0]));
    
    // Toggles a mod ID into or out of the "enabledMods" array.
    ipcMain.handle('toggleModState', (event, args) => {
        const enabled = KeyValue.readKVS("enabledMods", []);
        KeyValue.setKVS("enabledMods", args[1] ? [...enabled, args[0]] : enabled.filter(x => x !== args[0]));
    });
    
    // Checks if a mod ID is currently in the "enabledMods" array.
    ipcMain.handle('getModState', (event, args) => KeyValue.readKVS("enabledMods", []).includes(args[0]));
    
    // Gets list of all mods and tags incompatible ones with reasons.
    ipcMain.handle('getModList', () => {
        const { modList, errors } = Modstore.modList();
        const edition = KeyValue.readKVS('gamePid');
        const processedList = modList.map(mod => {
            mod.isIncompatible = false;
            if (mod._incompatibleHASH) {
                mod.isIncompatible = true;
                mod.incompatibilityReason = 'Mismatching hashes (disable advanced mod compatibility checks to ignore)';
                delete mod._incompatibleHASH;
            }
            if (mod.game !== edition) {
                mod.isIncompatible = true;
                mod.incompatibilityReason = 'Mod not made for this game';
            }
            return mod;
        });
        return { modList: processedList, errors };
    });
    
    // Gets the raw, unfiltered list of all installed mods.
    ipcMain.handle('getModListFull', () => Modstore.modList());
    
    // Counts total installed mods.
    ipcMain.handle('howManyMods', () => Modstore.howmany());
    
    // Requests the Modstore to download a remote mod file by URL.
    ipcMain.handle('dlmodURL', async (event, args) => {
        const [url, queryme, modid, modmodel] = args;
        return await Modstore.downloadModFromURL(url, (progress, downloaded) => {
            event.sender.send('dlmodURL-progress', { progress, downloaded, queryme, error: false });
        }, modid, modmodel);
    });
    
    // Overrides or assigns the sub-variant string of a given mod folder.
    ipcMain.handle('setModVariant', (event, args) => fs.writeFileSync(path.join(System.getPacketDatabase(), args[1], '__variant'), args[0]));
    
    // Resolves and returns the local file URL path to a mod's icon/image.
    ipcMain.handle('getModImage', (event, args) => Modstore.getModImage(args[0]));

    // --- Game Operations ---
    // Hashes vanilla game files for quick verification against mod hashes.
    ipcMain.handle('precalcGameHashes', () => precalculateHashes(getSystemFolder('deltaruneInstall')));
    
    // Gets GameDB info object corresponding to the current loaded PID.
    ipcMain.handle('getCurrentGameInfo', () => GameDB.getGameById(KeyValue.readKVS('gamePid')));
    
    // Gets GameDB info object for an arbitrary provided PID.
    ipcMain.handle('getGameInfo', (event, args) => GameDB.getGameById(args[0]));
    
    // Fetches the entire array of predefined target game profiles.
    ipcMain.handle('getAvailableGames', () => GameDB.getGames());
    
    // Checks if the executable for the current active PID physically exists locally.
    ipcMain.handle('loadedDeltarune', () => {
        try {
            const kvs = KeyValue.readKVS('gamePid');
            const gameInfo = GameDB.getGameById(kvs);
            return { loaded: fs.existsSync(path.join(System.getSystemFolder('deltaruneInstall'), gameInfo.exeName)), path: kvs };
        } catch {
            return { loaded: false, path: "" };
        }
    });

    // Relay to fire the startGame main event logic asynchronously.
    ipcMain.handle('startGame', (event, args) => ipcMain.emit('startGame', event, args));
    
    // Main event logic that determines if it's Steam protocol or raw EXE, and executes the game.
    ipcMain.on('startGame', () => {
        const installPath = path.join(app.getPath('userData'), `deltamod_system-${System.getCurrentSystemIndex()}`, 'deltaruneInstall');
        if (!fs.existsSync(installPath)) return dialog.showErrorBox('Cannot run', 'Please import a Deltarune install first.');

        win.hide();
        win.webContents.send('audio', false);

        if (KeyValue.readKVS('isSteam')) {
            shell.openExternal(`steam://rungameid/${KeyValue.readKVS('steamAppId')}`);
            app.quit();
            return process.exit(0);
        }

        const gameConfig = GameDB.getGameById(KeyValue.readKVS('gamePid'));
        const exePath = path.join(installPath, gameConfig.exeName);
        if (!fs.existsSync(exePath)) {
            errorWin('Could not find executable to run.');
            win.show();
            win.webContents.send('audio', true);
            return false;
        }

        if (isControllerMode) CMode.stop();
        exec(`"${exePath}"`, { cwd: path.dirname(exePath) }, () => {
            try { GamePatching.restoreOriginalsIfAny(installPath); } catch (e) { console.error('Failed to restore originals:', e); }
            if (isControllerMode) CMode.start();
            win.show();
            win.webContents.send('audio', true);
            win.webContents.send('page', 'main');
        });
        return true;
    });

    // Validates system dependencies (Git, .NET), runs the patcher binary, and preps the files.
    ipcMain.handle('patchAndRun', async (event, args) => {
        try {
            // Check Git
            await new Promise((resolve, reject) => exec('git --version', err => err ? reject() : resolve())).catch(() => {
                dialog.showErrorBox('Git not found', 'Missing Git. We will install it for you.');
                win.hide();
                exec(`"${path.join(__dirname, '..', 'tools', 'gitinstaller.exe')}" /SILENT /NORESTART /DIR="C:/Program Files/Git" /NOICONS /SP-`);
                app.relaunch(properRelaunch());
                app.exit(0);
                throw new Error('Restarting to install Git');
            });

            // Check .NET 8.0
            await new Promise((resolve, reject) => exec('dotnet --list-runtimes', (err, stdout) => {
                if (err || !stdout.includes('Microsoft.NETCore.App 8.0')) reject();
                else resolve();
            })).catch(() => {
                dialog.showErrorBox('.NET not found', 'Missing .NET 8.0. We will install it for you.');
                win.hide();
                execSync(`"${path.join(__dirname, '..', 'tools', 'dotnetinstaller.exe')}" /passive /norestart`);
                app.relaunch(properRelaunch());
                app.exit(0);
                throw new Error('Restarting to install .NET');
            });

            const baking = args[1] === 'baker';
            const pathname = KeyValue.readKVS('deltarunePath');
            if (!pathname) return dialog.showErrorBox('Error', 'Please import a Deltarune install first.');

            GamePatching.restoreOriginalsIfAny(pathname);

            let mods = fs.readdirSync(getPacketDatabase()).filter(f => fs.existsSync(path.join(getPacketDatabase(), f, '__deltaID.json'))).map(f => {
                const dataPath = path.join(getPacketDatabase(), f, '__deltaID.json');
                const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                if (args[0].includes(data.uniqueId)) {
                    data.new = false;
                    fs.writeFileSync(dataPath, JSON.stringify(data, null, 4), 'utf8');
                }
                return data;
            });

            const log = await GamePatching.startGamePatch(pathname, getPacketDatabase(), args[0], BrowserWindow.fromWebContents(event.sender));

            if (!log.patched) {
                await dialog.showErrorBox('Patching failed', `Please check the log and try again.\n\n${log.log}`);
                win.webContents.send('audio', true);
                win.webContents.send('page', 'main');
                return false;
            }

            const notif = new Notification({ title: 'Patch complete!', body: 'Deltarune has been patched successfully!' });
            notif.on('click', () => {
                if (!win) return;
                if (win.isMinimized()) win.restore();
                win.show();
                win.focus();
                win.setAlwaysOnTop(true);
                setTimeout(() => win.setAlwaysOnTop(false), 100);
            });
            notif.show();

            callbackNPS = () => ipcMain.emit('startGame', null, []);
            
            if (!baking) {
                callbackNPSPassWith = [pathname];
                win.webContents.send('finishedPatch', mods);
            } else {
                const bakeList = Modstore.modList().modList.filter(m => args[0].includes(m.uniqueId))
                    .map(m => ({ name: m.name, description: m.description, author: m.author, version: m.version }));
                KeyValue.setKVS('bakeList', bakeList);
                GamePatching.deleteOriginals(pathname);
                app.relaunch(properRelaunch());
                app.exit();
            }
        } catch (err) {
            if (err.message && err.message.includes('Restarting')) return false;
            errorWin(`Couldn't patch and run game: ${err.message}`);
            return false;
        }
    });

    // Uses defined plugins to hit an external URL, stream download a game build zip, and extract it.
    ipcMain.handle('downloadGame', async (event, args) => {
        const dataFeat = GameDB.getFeatInfo(args[0], 'autodownload').data;
        const deltaruneUrl = await require(`./DownloadUtilities/${dataFeat.pluginName}`).run(args[0], dataFeat);
        const modal = createProgressModal();
        const destPath = path.join(System.getTemporary(), "deltaruneGAME.zip");
        const writer = fs.createWriteStream(destPath);

        try {
            const response = await axios({ method: 'get', url: deltaruneUrl, responseType: 'stream' });
            const totalLength = parseInt(response.headers['content-length'] || '0', 10);
            let downloaded = 0;

            response.data.on('data', chunk => {
                downloaded += chunk.length;
                if (totalLength) updateProgressModal(modal, win, downloaded / totalLength, 'Downloaded');
            });

            response.data.pipe(writer);
            await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

            if (win) win.setProgressBar(0);
            let extractPath = path.join(System.getTemporary(), `game_ext_${Date.now()}`);
            fs.mkdirSync(extractPath, { recursive: true });
            await _7z.unpack(destPath, extractPath);

            const files = fs.readdirSync(extractPath);
            if (files.length === 1) extractPath = path.join(extractPath, files[0]);

            modal.close();
            return extractPath;
        } catch (err) {
            modal.close();
            throw err;
        }
    });

    // --- Install Management ---
    // Reads the _sysindex text file to get the active session profile index.
    ipcMain.handle('getSystemIndex', () => {
        const overridePath = getSystemFile('_sysindex', true);
        return fs.existsSync(overridePath) ? fs.readFileSync(overridePath, 'utf8') : 0;
    });
    
    // Finds the largest numeric index folder in user data, skipping invalid ones.
    ipcMain.handle('getMaxExistingIndex', () => {
        try {
            const systemFiles = fs.readdirSync(app.getPath('userData')).filter(f => f.startsWith('deltamod_system-'));
            let maxIndex = 0;
            const invalidInstalls = [];
            for (const file of systemFiles) {
                const index = file.split('-')[1];
                if (index === 'unique') continue;
                if (!fs.existsSync(path.join(app.getPath('userData'), file, 'deltaruneInstall'))) {
                    fs.rmSync(path.join(app.getPath('userData'), file), { recursive: true, force: true });
                    invalidInstalls.push(index);
                    continue;
                }
                maxIndex = Math.max(maxIndex, parseInt(index, 10));
            }
            return [maxIndex, invalidInstalls];
        } catch (err) { return [0, []]; }
    });
    
    // Wrapper for returning structured profiles parsed by `getInstallations()`.
    ipcMain.handle('getInstallations', async () => await getInstallations());
    
    // Overwrites the custom display name text file for a given index profile.
    ipcMain.handle('setInstallationCName', (event, args) => fs.writeFileSync(path.join(app.getPath('userData'), `deltamod_system-${args[0]}`, '_cname'), args[1]));
    
    // Reassigns the active system index pointer and reboots the application back to IM.
    ipcMain.handle('changeSystemIndex', (event, args) => {
        fs.writeFileSync(getSystemFile('_sysindex', true), args[0]);
        app.relaunch(intoIM());
        app.exit();
    });
    
    // Returns the game target edition identifier (PID) configured for a given index.
    ipcMain.handle('getEditionByIndex', (event, args) => KeyValue.readKVSOfIndex('gamePid', args[0]) || "Unknown");
    
    // Main wizard logic for importing physical files or Steam links into a new installation slot.
    ipcMain.handle('createNewInstallation', async (event, args) => {
        const steam = args[0] === 'steam';
        const isFromLocate = args[1] === 'locate';
        const specifiedLocatePath = isFromLocate ? args[2] : null;
        const fromIM = args[3];
        let selectedGame = args[4];

        let i = 0;
        fs.readdirSync(app.getPath('userData')).filter(f => f.startsWith('deltamod_system-')).forEach(file => {
            const idx = file.split('-')[1];
            if (idx !== 'unique') i = Math.max(i, parseInt(idx, 10));
        });
        i = (isFromLocate && !fromIM) ? parseInt(System.getCurrentSystemIndex()) : i + 1;

        let sourcePath = specifiedLocatePath;
        let chosenEdition;

        if (!steam && !isFromLocate) {
            const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
            if (result.canceled || !result.filePaths[0]) return false;
            sourcePath = result.filePaths[0];
        } else if (steam && !isFromLocate) {
            STEAM_BASE = getSteamDirectory(dialog);
            chosenEdition = GameDB.getFeatInfo(selectedGame, "steam").data;
            selectedGame = chosenEdition.pid;

            if ((await getInstallations(true)).some(x => x.appid === chosenEdition.appid)) {
                dialog.showErrorBox('Already imported', 'Edition already imported.');
                return false;
            }
            sourcePath = path.join(STEAM_BASE, chosenEdition.folder);
        }

        if (!validateDeltarune(sourcePath)) {
            dialog.showErrorBox('Invalid folder', steam ? 'Edition missing from Steam library.' : 'Invalid game installation.');
            if (steam && chosenEdition?.downloadable && process.platform === 'win32' && dialog.showMessageBoxSync({ type: 'question', title: 'Download Demo', message: 'Download demo from Steam?', buttons: ['Yes', 'No'] }) === 0) {
                shell.openExternal(`steam://install/${chosenEdition.appid}`);
            }
            return false;
        }

        if (!selectedGame) {
            const games = GameDB.getGames();
            const response = dialog.showMessageBoxSync({ type: 'question', title: 'Choose game', message: 'Select imported game:', buttons: games.map(x => x.name) });
            selectedGame = games[response].id;
        }

        const gameInfo = GameDB.getGameById(selectedGame);
        if (!fs.existsSync(path.join(sourcePath, gameInfo.exeName))) {
            dialog.showErrorBox('Invalid install', `Missing executable: ${gameInfo.exeName}`);
            return false;
        }

        const destPath = getSystemFolderOfIndex('deltaruneInstall', i);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        try {
            copyRecursiveSync(sourcePath, destPath);
            KeyValue.setKVSOfIndex('loadedDeltarune', true, i);
            KeyValue.setKVSOfIndex('deltarunePath', destPath, i);
            KeyValue.setKVSOfIndex('gamePid', selectedGame, i);
            KeyValue.setKVSOfIndex('deltaruneEdition', 'rem', i);
            KeyValue.setKVSOfIndex('enabledMods', [], i);
            KeyValue.setKVSOfIndex('isSteam', steam, i);
            KeyValue.setKVSOfIndex('originalSteamPath', steam ? sourcePath : "", i);
            KeyValue.setKVSOfIndex('steamAppId', steam ? chosenEdition.appid : "", i);

            if (steam) {
                fs.rmSync(sourcePath, { force: true, recursive: true });
                Junction.createJunction(destPath, sourcePath);
            }

            page(fromIM ? "installmanager" : "main");
            return true;
        } catch (err) {
            dialog.showErrorBox('Import failed', `Failed: ${err.message}`);
            return false;
        }
    });

    // Determines if the currently loaded session profile uses Steam Junctioning.
    ipcMain.handle('isCurrentIndexSteam', () => KeyValue.readKVSOfIndex('isSteam', parseInt(System.getCurrentSystemIndex())));
    
    // Disconnects Steam integration for the active slot by removing junctions, then relaunches.
    ipcMain.handle('removeSteamIntegration', () => {
        const index = parseInt(System.getCurrentSystemIndex());
        Junction.deleteJunction(KeyValue.readKVSOfIndex('originalSteamPath', index));
        KeyValue.setKVSOfIndex('isSteam', false, index);
        KeyValue.setKVSOfIndex('originalSteamPath', "", index);
        KeyValue.setKVSOfIndex('steamAppId', "", index);
        app.relaunch(properRelaunch());
        app.exit();
    });

    // Deletes an entire profile folder by index, collapses remaining array numbers to be contiguous.
    ipcMain.handle('deleteSystemIndex', (event, args) => {
        const index = args[0];
        if (KeyValue.readKVSOfIndex('isSteam', parseInt(index))) {
            Junction.deleteJunction(KeyValue.readKVSOfIndex('originalSteamPath', parseInt(index)));
        }

        const pathToDelete = path.join(app.getPath('userData'), `deltamod_system-${index}`);
        if (fs.existsSync(pathToDelete)) fs.rmSync(pathToDelete, { recursive: true, force: true });

        const systemFiles = fs.readdirSync(app.getPath('userData')).filter(f => f.startsWith('deltamod_system-') && !f.endsWith('unique'));
        let cNum = -1;
        
        systemFiles.sort((a,b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])).forEach(file => {
            cNum++;
            const oldPath = path.join(app.getPath('userData'), file);
            const newPath = path.join(app.getPath('userData'), `deltamod_system-${cNum}`);
            if (oldPath !== newPath) {
                fs.renameSync(oldPath, newPath);
                const cnamePath = path.join(newPath, '_cname');
                if (fs.existsSync(cnamePath) && fs.readFileSync(cnamePath, 'utf8').startsWith('Install #')) {
                    fs.writeFileSync(cnamePath, `Install #${cNum + 1}`);
                }
            }
        });

        fs.writeFileSync(getSystemFile('_sysindex', true), "0");
        app.relaunch(intoIM());
        app.exit();
        return true;
    });

    // Creates a Windows desktop shortcut bound to launch explicitly into a specific profile index.
    ipcMain.handle('createInstallLink', (event, args) => {
        if (process.platform !== 'win32') return dialog.showErrorBox('Unsupported', 'Only supported on Windows.');
        if (!args[0]) return dialog.showErrorBox('Error', 'Invalid system index.');

        const iName = fs.readFileSync(System.getSystemFileOfIndex('_cname', args[0]), 'utf8');
        const shortcutsCreated = createDesktopShortcut({
            windows: { filePath: process.execPath.replace(/\\/g, '\\\\'), name: `Deltamod (${iName})`, arguments: `---system_index=${args[0]}` }
        });
        if (shortcutsCreated) dialog.showMessageBox(win, { type: 'info', title: 'Shortcut Created', message: 'Shortcut created on desktop.' });
    });

    // Opens OS file manager specifically at the internal `deltaruneInstall` subfolder.
    ipcMain.handle('openInstallationFolder', (event, args) => shell.openExternal(getSystemFolderOfIndex('deltaruneInstall', args[0])));

    // --- Folders & Misc ---
    // Opens either the `mods` database path or the active `delta` game install path in the OS explorer.
    ipcMain.handle('openSysFolder', (event, args) => shell.openPath(args[0] === 'mods' ? getPacketDatabase() : getSystemFolder('deltaruneInstall', false)));
    
    // Opens a specific mod's localized working directory inside the Modstore database.
    ipcMain.handle('openModFolder', (event, args) => shell.openPath(path.join(getPacketDatabase(), args[0])));
    
    // Reads from the global `unique` namespace key-value system config.
    ipcMain.handle('getUniqueFlag', (event, args) => KeyValue.readUniqueFlag(args[0].toUpperCase()));
    
    // Writes to the global `unique` namespace key-value system config.
    ipcMain.handle('setUniqueFlag', (event, args) => KeyValue.writeUniqueFlag(args[0].toUpperCase(), args[1]));
    
    // Checks standard Shared Variable memory store.
    ipcMain.handle('fetchSharedVariable', (event, args) => getSharedVar(args[0]));
    
    // Checks if the "baked" parameter holds truth for standalone repackaged states.
    ipcMain.handle('isBaked', () => KeyValue.readKVS('baked'));
    
    // Fires an active Netlayer/NPS callback if one was loaded into memory.
    ipcMain.handle('npsCallback', () => { if (callbackNPS) { callbackNPS(...callbackNPSPassWith); callbackNPS = null; } });
    
    // Empty stub for argument processing (originally planned for command injections).
    ipcMain.handle('executeArgumentCmd', () => {}); 
    
    // Opens the plaintext flag DB file for manual editing via default OS app.
    ipcMain.handle('openFlagDatabase', () => shell.openPath(path.join(app.getPath('userData'), 'deltamod_system-unique', 'flagDB.config')));
    
    // Navigates the external browser directly to the Discord guild invite via API lookup.
    ipcMain.handle('deltamoddersDiscord', async () => shell.openExternal((await axios.get(require('../package.json').discordAPI)).data.instant_invite));
    
    // Pops a standard file dialog requiring a specific file extension (e.g. data.win).
    ipcMain.handle('browseFile', async (event, args) => {
        const pathdial = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: args[0], extensions: [args[1]] }] });
        return pathdial.canceled ? null : pathdial.filePaths[0];
    });
    
    // Pops a standard folder dialog and validates if the target is a Deltarune install path.
    ipcMain.handle('locateDelta', async () => {
        const pathdial = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return pathdial.canceled ? null : validateDeltarune(pathdial.filePaths[0]);
    });
    
    // Confirms whether user metrics/crash reports can be forwarded (disabled in Dev / pending updates).
    ipcMain.handle('canReportError', () => !isDevToolsEnabled && !updateAvailable);
    
    // --- Updates ---
    // Contacts checking server endpoints to see if a newer Deltamod version exists.
    ipcMain.handle('fireUpdate', async () => {
        try {
            const updateInfo = await Updates.checkUpdates();
            if (updateInfo.update && !ignoreUpdate) {
                win.webContents.send('updateAvailable', updateInfo);
                updateAvailable = true;
                return true;
            }
            return false;
        } catch { return false; }
    });
    
    // Automatically downloads and silently executes a new Deltamod `.exe` installer.
    ipcMain.handle('start-update', async (event, args) => {
        page("autoupdate");
        try {
            const installerPath = path.join(System.getTemporary(), `installer.${args[0].version.replace(/\./g, "")}.exe`);
            const response = await axios.get(args[0].newVersionLink, {
                responseType: 'arraybuffer',
                onDownloadProgress: e => win.webContents.send('updateProgress', { perc: Math.round((e.loaded * 100) / e.total) })
            });
            fs.writeFileSync(installerPath, Buffer.from(response.data));
            exec(`cmd /c ""${installerPath}" --mode unattended --unattendedmodeui minimal"`);
            app.exit(0);
        } catch (e) {
            dialog.showErrorBox("Update Failed", "Failed to download update. Please reinstall from GameBanana. Opening browser...");
            shell.openExternal('https://gamebanana.com/tools/20575');
            ignoreUpdate = true;
            page("main");
        }
    });
    
    // Marks the current update run as ignored until app restart.
    ipcMain.handle('ignore-update', () => { ignoreUpdate = true; page("main"); });
    
    // Factory reset logic; purges all user data folder properties completely and exits.
    ipcMain.handle('initialize', () => {
        const appdata = path.join(app.getPath('appData'), 'deltamod');
        fs.readdirSync(appdata).filter(f => f.startsWith('deltamod_system')).forEach(f => {
            try { fs.rmSync(path.join(appdata, f), { recursive: true, force: true }); } catch {}
        });
        fs.rmSync(path.join(appdata, 'pkg.db'), { recursive: true, force: true });
        app.quit();
    });

    // --- Chat ---
    // Polls external cloud functions for the recent history payload of a given channel.
    ipcMain.handle('deltahubMessageGet', async (event, args) => (await axios.get(`https://us-central1-dh-data-5a818.cloudfunctions.net/deltamodGetChatMessages?channel=${args[0]}`)).data);
    
    // Hashes/Signs a message via `dhubsign.exe` and posts it to the cloud chat service.
    ipcMain.handle('deltahubMessagePost', async (event, args) => {
        let signature = "";
        const tool = path.join(__dirname, '..', 'tools', 'dhubsign.exe');
        if (fs.existsSync(tool)) {
            signature = await new Promise(resolve => exec(`"${tool}" "${btoa(args[1])}"`, (err, stdout) => resolve(err ? "" : stdout.replace(/[\r\n]|\[start\]|\[end\]/g, '').trim())));
        }
        
        const post = await axios.post('https://us-central1-dh-data-5a818.cloudfunctions.net/deltamodSendChatMessage', { channel: args[0], message: args[1] }, { headers: { 'X-Signature': signature } }).catch(e => { throw e.response?.data?.message || e.message; });
        if (!post.data.ok) throw post.data.message;
    });

    // --- Debug Modals / Tracers ---
    // Creates a dummy progress modal and artificially ticks its loading bar for testing.
    ipcMain.handle('modalTest', async () => {
        const modal = createProgressModal();
        let x = 0.0;
        const interval = setInterval(() => {
            x += 0.1;
            updateProgressModal(modal, win, x, null);
            if (x >= 1.0) {
                clearInterval(interval);
                setTimeout(() => modal.close(), 250);
            }
        }, 250);
    });
    
    // Instantiates a secondary persistent window to render debug API tracking logs natively.
    ipcMain.handle('openElectronTracer', () => {
        if (elecTracer) return;
        elecTracer = new BrowserWindow({ width: 500, height: 300, webPreferences: { nodeIntegration: true, contextIsolation: true, partition: PARTITION, preload: path.join(__dirname, '..', 'web', 'views', 'electron-tracer', 'preload.js') } });
        elecTracer.setAlwaysOnTop(true);
        elecTracer.setMenuBarVisibility(false);
        elecTracer.loadURL('deltapack://web/views/electron-tracer/index.html');
    });
    
    // Forwards messages directly into the opened Electron Tracer window bounds.
    ipcMain.handle('logElectronAPI', (event, args) => { try { if (elecTracer) elecTracer.webContents.send('log', args[0]); } catch { elecTracer = null; } });
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
    registerIPCHandlers();

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