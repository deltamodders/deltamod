const { app, BrowserWindow, ipcMain, dialog, shell, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const https = require('https');
const createDesktopShortcut = require('create-desktop-shortcuts');
const axios = require('axios');
var elevate = require('windows-elevate');
const _7z = require('7zip-min');
// Local modules
const KeyValue = require('./KeyValue');
const Language = require('./Language');
const System = require('./System');
const { getSystemFile, getSystemFolder, getPacketDatabase, getSystemFolderOfIndex } = require('./System');
const { page, getSharedVar, properRelaunch, getSteamDirectory, getFileVersion, downloadFile, timeoutPromise } = require('./Utils');
const Modstore = require('./Modstore');
const CMode = require('./ControllerMode');
const Updates = require('./Updates');
const GameDB = require('./GameDB');
const { createProgressModal, updateProgressModal } = require('./ProgressModal');
const GamePatching = require('./GamePatching');
const Junction = require('./Junction');
const console = require('./Console');
const { PARTITION } = require('./Config');

// Using this fixes a vulnerability where attackers could freely download code
let updateStackInfo = null;

// --- IPC Helper Functions ---

async function dominantColor(imagePath) {
    try {
        const img = await loadImage(imagePath);
        // downscale for performance
        const w = 100;
        const h = Math.max(1, Math.round((img.height / img.width) * w));
        const canvas = createCanvas(w, h);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        const counts = new Map();
        let maxCount = 0;
        let dominant = null;

        // quantize to reduce unique colors (to nearest 16)
        for (let i = 0; i < data.length; i += 4) {
            const r = Math.round(data[i] / 16) * 16;
            const g = Math.round(data[i + 1] / 16) * 16;
            const b = Math.round(data[i + 2] / 16) * 16;
            const key = `${r},${g},${b}`;
            const v = (counts.get(key) || 0) + 1;
            counts.set(key, v);
            if (v > maxCount) {
                maxCount = v;
                dominant = { r, g, b };
            }
        }

        if (!dominant) return 'rgb(0, 0, 0)';
        return `rgb(${Math.max(dominant.r - 20, 0)}, ${Math.max(dominant.g - 20, 0)}, ${Math.max(dominant.b - 20, 0)})`;
    } catch (e) {
        console.log('dominantColor error', e);
        return 'rgb(0, 0, 0)';
    }
}

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

function validateDeltarune(deltapath) {
    const keyItems = ['data.win'];
    const isValid = keyItems.every(item => {
        const exists = fs.existsSync(path.join(deltapath, item));
        if (!exists) console.log(`Missing key item: ${path.join(deltapath, item)}`);
        return exists;
    });
    return isValid ? deltapath : null;
}

async function getInstallations(suppressWarnings = false) {
    const userDataPath = app.getPath('userData');
    const systemFiles = fs.readdirSync(userDataPath).filter(file => file.startsWith('deltamod_system-'));
    const installations = [];

    for (const file of systemFiles) {
        if (file.endsWith('unique')) continue;

        const installPath = path.join(userDataPath, file);
        const index = parseInt(file.split('-')[1], 10);
        const storeJSON = path.join(installPath, 'store.json');

        var storeData = JSON.parse(fs.existsSync(storeJSON) ? fs.readFileSync(storeJSON, 'utf8') : '{}');
        const deltaruneInstall = validateDeltarune(storeData.gamePath);

        const cnamePath = path.join(installPath, '_cname');

        if (!fs.existsSync(deltaruneInstall) || !fs.existsSync(storeJSON)) {
            const defaultCName = `Install #${index + 1}`;
            const cname = fs.existsSync(cnamePath) ? fs.readFileSync(cnamePath, 'utf8') : defaultCName;

            if (!suppressWarnings) {
                dialog.showMessageBoxSync({
                    type: 'warning',
                    title: 'Invalid Installation Found',
                    message: `An invalid or not fully imported installation of Deltarune was found and will be removed from Deltamod: ${cname}.\n\n${storeJSON}\n\n${deltaruneInstall}`,
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

function intoIM() {
    return { args: [...process.argv.slice(1).filter(x => !x.toLowerCase().startsWith('deltamod://')), '---im'] };
}

// --- IPC Registration ---

/**
 * Registers all IPC Handlers utilizing Dependency Injection to access required state safely.
 * @param {Object} context - The shared state and references from Runner.js
 */
module.exports = function registerIPCHandlers(context) {
    const { getWindow, isControllerMode, isDevToolsEnabled, errorWin, state } = context;
    const { getGBUIConf, collections } = require('./GameBananaWindow');

    ipcMain.handle('isCMode', () => isControllerMode);
    ipcMain.handle('shouldGoIM', () => process.argv.includes('---im'));
    ipcMain.handle('diagnosticInfo', () => `Deltamod ${app.getVersion()} - Running on ${os.platform()} ${os.release()} - cmode ${isControllerMode ? 'on' : 'off'} - devtools ${isDevToolsEnabled ? 'enabled' : 'disabled'} - ${state.updateAvailable ? 'update available' : 'no update'}`);
    ipcMain.handle('isPackaged', () => app.isPackaged);
    ipcMain.handle('version', () => require('../package.json').version);
    ipcMain.handle('getOS', () => ({ platform: process.platform, release: os.release(), version: os.version() }));
    ipcMain.handle('isDevMode', () => process.argv.includes('--developer'));

    ipcMain.handle('sampleError', () => errorWin('This is a sample error triggered from the renderer process.'));
    ipcMain.handle('log', (event, args) => console.rendererLog(args[1], args[2], args[0]));
    ipcMain.handle('showWindow', (event) => BrowserWindow.fromWebContents(event.sender).show());
    ipcMain.handle('minimizeMe', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
    ipcMain.handle('toggleFullscreen', (event) => {
        const senderWin = BrowserWindow.fromWebContents(event.sender);
        if (senderWin) senderWin.setFullScreen(!senderWin.isFullScreen());
    });
    ipcMain.handle('openExternal', (event, args) => shell.openExternal(args[0]));
    ipcMain.handle('showItem', (event, args) => shell.showItemInFolder(args[0]));

    ipcMain.handle('cmode-on', () => {
        app.relaunch({ args: [...process.argv.slice(1).filter(arg => arg !== '-controller' && !arg.startsWith('deltamod://')), '-controller'] });
        app.exit(0);
    });
    ipcMain.handle('cmode-off', () => {
        app.relaunch({ args: process.argv.slice(1).filter(arg => arg !== '-controller' && !arg.startsWith('deltamod://')) });
        app.exit(0);
    });
    ipcMain.handle('rebootDev', async () => {
        if (process.argv.includes('--developer')) return false;
        const existingArgs = process.argv.slice(1).filter(a => !a.startsWith('---system_index=') || a === '---initialize_deltamod' || a.startsWith('deltamod:'));
        app.relaunch({ args: [...existingArgs, '--developer'] });
        app.exit(0);
    });

    // Language Handlers
    ipcMain.handle('obtainLangs', () => Language.getAvailableLanguages());
    ipcMain.handle('setLang', (event, args) => {
        fs.writeFileSync(getSystemFile('language', true), args[0], 'utf8');
        Language.loadLanguage(args[0]);
        return true;
    });
    ipcMain.handle('getLang', () => fs.existsSync(getSystemFile('language', true)) ? fs.readFileSync(getSystemFile('language', true), 'utf8') : 'en');
    ipcMain.handle('obtainLangKey', (event, args) => Language.loadString(args[0]) || `$${args[0]}`);
    ipcMain.handle('obtainLangKeyAdv', (event, args) => Language.loadString(args[0], ...args.slice(1)) || `$${args[0]} ${args.slice(1).join(' + ')}`);

    // Themes
    ipcMain.handle('chooseTheme', async () => {
        const win = getWindow();
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
        if(win) win.webContents.send('themeChange');
    });

    ipcMain.handle('setTheme', (event, args) => fs.writeFileSync(System.getSystemFile('_theme', true), args[0]));
    ipcMain.handle('getThemes', () => obtainThemes());
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

    ipcMain.handle('importTheme', async () => {
        const win = getWindow();
        const musicPath = (await dialog.showOpenDialog(win, { title: 'Select your music file', filters: [{ name: 'Song files', extensions: ['mp3', 'ogg'] }] })).filePaths[0];
        const bgPath = (await dialog.showOpenDialog(win, { title: 'Select your background image', filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif' ] }] })).filePaths[0];
        if (!musicPath || !bgPath) return;

        const randomSeed = Math.random().toString(36).substring(2, 15);
        const themeId = `custom_${randomSeed}`;
        const themeName = `Custom Theme #${randomSeed.substring(0, 5).toUpperCase()}`;
        const customThemesDir = path.join(app.getPath('appData'), 'deltamod', 'customThemes');

        fs.copyFileSync(musicPath, path.join(customThemesDir, 'mus', `${themeId}.${path.extname(musicPath).slice(1)}`));
        fs.copyFileSync(bgPath, path.join(customThemesDir, 'img', `${themeId}.${path.extname(bgPath).slice(1)}`));

        const config = {
            name: themeName,
            background: `${themeId}.${path.extname(bgPath).slice(1)}`,
            description: `This is a custom theme by the user.`,
            mainSong: `${themeId}.${path.extname(musicPath).slice(1)}`,
            id: themeId,
            musicTrack: "Custom music",
            color: await dominantColor(bgPath)
        };

        fs.writeFileSync(path.join(customThemesDir, 'data', `${themeId}.theme.json`), JSON.stringify(config, null, 4), 'utf8');
        page('themesel');
    });

    ipcMain.handle('renameCustomTheme', async (event, args) => {
        const [themeId, newName, newDesc] = args;

        const customJSON = path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'data', `${themeId}.theme.json`);
        var themeConfig = JSON.parse(fs.readFileSync(customJSON, 'utf8'));
        themeConfig.name = newName;
        themeConfig.description = newDesc;
        fs.writeFileSync(customJSON, JSON.stringify(themeConfig, null, 4), 'utf8');
    });

    ipcMain.handle('deleteCustomTheme', async (event, args) => {
        const themeId = args[0];

        const customJSON = path.join(app.getPath('appData'), 'deltamod', 'customThemes', 'data', `${themeId}.theme.json`);
        var themeConfig = JSON.parse(fs.readFileSync(customJSON, 'utf8'));
        if (fs.existsSync(customJSON)) {
            fs.unlinkSync(customJSON);
        }
    });

    // Sponsors
    ipcMain.handle('setSponsor', async () => {
        const win = getWindow();
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
    ipcMain.handle('getSponsor', () => {
        const sponsorHost = System.getSystemFile('_sponsor', true);
        if (fs.existsSync(sponsorHost)) return fs.readFileSync(sponsorHost, 'utf8');
        fs.writeFileSync(sponsorHost, 'cd');
        return 'cd';
    });

    // GameBanana Auth & API
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
    ipcMain.handle('logoutGamebanana', async () => {
        try { fs.unlinkSync(getSystemFile('bananapwd', true)); } catch {}
        require('./GameBananaWindow.js').clearCache();
        return true;
    });
    ipcMain.handle('eraseGamebananaCache', () => require('./GameBananaWindow.js').clearCache());
    ipcMain.handle('leaveCommentGamebanana', async (event, args) => {
        const uiconf = await getGBUIConf();
        if (uiconf._idMemberRow > 0) return await require('./GameBananaWindow.js').leaveComment(args[0], args[1], args[2]);
    });
    ipcMain.handle('openImageViewer', async (event, args) => {
        return new Promise(resolve => {
            const temp = path.join(app.getPath('temp'), `gb_image_${Date.now()}${path.extname(args[0])}`);
            const file = fs.createWriteStream(temp);
            axios.get(args[0], { responseType: 'stream' }).then(response => {
                response.data.pipe(file);
            }).catch(() => {
                dialog.showMessageBoxSync({
                    type: 'error',
                    title: 'Failed to load image',
                    message: 'The image could not be loaded. It may have been removed from GameBanana or there may be a network issue.'
                });
                resolve(false);
            });
            file.on('finish', () => {
                file.close();
                if (!temp.endsWith('.png') && !temp.endsWith('.jpg') && !temp.endsWith('.jpeg') && !temp.endsWith('.webp') && !temp.endsWith('.gif')) {
                    dialog.showMessageBoxSync({
                        type: 'error',
                        title: 'Blocked file type',
                        message: 'The file type of this image is not supported for viewing and has been blocked for your safety.'
                    });
                    resolve(false);
                }
                shell.openExternal(temp);
                resolve(true);
            });
        });
    });
    ipcMain.handle('gbLikeMod', async (event, args) => {
        const uiconf = await getGBUIConf();
        if (uiconf._idMemberRow > 0) return await require('./GameBananaWindow.js').likeMod(args[0], args[1]);
    });
    ipcMain.handle('validateGamebananaToken', async () => (await getGBUIConf())._idMemberRow > 0);
    ipcMain.handle('dev_getGBToken', async () => {
        const win = getWindow();
        const file = getSystemFile('bananapwd', true);
        if (!fs.existsSync(file)) return dialog.showMessageBoxSync({ type: 'error', title: 'No GameBanana Token', message: 'No token found.' });
        
        const contents = fs.readFileSync(file);
        const token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(contents) : contents.toString('utf8');
        const result = await dialog.showSaveDialog(win, { title: 'Save GameBanana Token', defaultPath: path.join(os.homedir(), 'gamebanana_token.txt') });
        if (!result.canceled && result.filePath) fs.writeFileSync(result.filePath, token, 'utf8');
    });
    ipcMain.handle('getGamebananaPic', async () => (await getGBUIConf())._sAvatarUrl);
    ipcMain.handle('getGamebananaID', async () => (await getGBUIConf())._idMemberRow);
    ipcMain.handle('getGamebananaUserinfo', async () => {
        try {
            const id = (await getGBUIConf())._idMemberRow;
            if (id <= 0) return { loggedIn: false };
            const profile = await axios.get(`https://gamebanana.com/apiv11/Member/${id}/ProfilePage`);
            return { ...profile.data, loggedIn: true };
        } catch (error) {
            console.error('Error fetching GameBanana user info:', error);
            return { loggedIn: false };
        }
    });

    // Patcher
    ipcMain.handle('importPatcher', async () => {
        const win = getWindow();
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
    ipcMain.handle('hasPatchingCore', () => {
        return fs.existsSync(path.join(__dirname, '..', 'gm3p'));
    });
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

    // Mod Management
    ipcMain.handle('importMod', async () => {
        const win = getWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            properties: ['openFile'],
            filters: [{ name: 'Deltamod compatible archive', extensions: ['zip', '7z', 'tar.gz', 'lzma'] }]
        });
        if (!canceled && filePaths?.[0]) Modstore.importMod(filePaths[0]);
    });
    ipcMain.handle('removeMod', async (event, args) => await Modstore.removeModSafe(args[0]));
    ipcMain.handle('toggleModState', (event, args) => {
        const enabled = KeyValue.readKVS("enabledMods", []);
        KeyValue.setKVS("enabledMods", args[1] ? [...enabled, args[0]] : enabled.filter(x => x !== args[0]));
    });
    ipcMain.handle('getModState', (event, args) => KeyValue.readKVS("enabledMods", []).includes(args[0]));
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
    ipcMain.handle('getModListFull', () => Modstore.modList());
    ipcMain.handle('howManyMods', () => Modstore.howmany());
    ipcMain.handle('dlmodURL', async (event, args) => {
        const [url, queryme, modid, modmodel] = args;
        return await Modstore.downloadModFromURL(url, (progress, downloaded) => {
            event.sender.send('dlmodURL-progress', { progress, downloaded, queryme, error: false });
        }, modid, modmodel);
    });
    ipcMain.handle('setModVariant', (event, args) => fs.writeFileSync(path.join(System.getPacketDatabase(), args[1], '__variant'), args[0]));
    ipcMain.handle('getModImage', (event, args) => Modstore.getModImage(args[0]));

    // Game Operations
    ipcMain.handle('precalcGameHashes', () => precalculateHashes(getSystemFolder('deltaruneInstall')));
    ipcMain.handle('getCurrentGameInfo', () => GameDB.getGameById(KeyValue.readKVS('gamePid')));
    ipcMain.handle('getGameInfo', (event, args) => GameDB.getGameById(args[0]));
    ipcMain.handle('getAvailableGames', () => GameDB.getGames());
    ipcMain.handle('loadedDeltarune', () => {
        try {
            const kvs = KeyValue.readKVS('gamePid');
            const gameInfo = GameDB.getGameById(kvs);
            return { loaded: fs.existsSync(path.join(System.getSystemFolder('deltaruneInstall'), gameInfo.exeName)), path: kvs };
        } catch {
            return { loaded: false, path: "" };
        }
    });

    ipcMain.handle('startGame', (event, args) => ipcMain.emit('startGame', event, args));
    ipcMain.on('startGame', () => {
        const win = getWindow();
        const installPath = KeyValue.readKVS('gamePath');

        if (win) {
            win.hide();
            win.webContents.send('audio', false);
        }

        if (KeyValue.readKVS('isSteam')) {
            shell.openExternal(`steam://rungameid/${KeyValue.readKVS('steamAppId')}`);
            app.quit();
            return process.exit(0);
        }

        const gameConfig = GameDB.getGameById(KeyValue.readKVS('gamePid'));
        const exePath = path.join(installPath, gameConfig.exeName);
        if (!fs.existsSync(exePath)) {
            errorWin('Could not find executable to run.');
            if (win) {
                win.show();
                win.webContents.send('audio', true);
            }
            return false;
        }

        if (isControllerMode) CMode.stop();

        exec(`"${exePath}"`, { cwd: path.dirname(exePath) }, () => {
            try { GamePatching.restoreOriginalsIfAny(installPath); } catch (e) { console.error('Failed to restore originals:', e); }
            if (isControllerMode) CMode.start();
            if (win) {
                win.show();
                win.webContents.send('audio', true);
                win.webContents.send('page', 'main');
            }
        });

        return true;
    });

    ipcMain.handle('gamebanana_getCollections', async () => {
        var res = await collections.list();
        return (typeof res === 'object' && Array.isArray(res)) ? res.map(c => ({
            id: c._idRow,
            name: c._sName,
        })) : res;
    });

    ipcMain.handle('gamebanana_createCollection', async (event, args) => {
        return await collections.create(args[0]);
    });

    ipcMain.handle('gamebanana_deleteCollection', async (event, args) => {
        return await collections.delete(args[0]);
    });

    ipcMain.handle('gamebanana_importToCollection', async (event, args) => {
        var pkgDB = getPacketDatabase();

        var gbMods = args[1];

        const skippedMods = [];
        
        for (const mod of gbMods) {
            const added = await collections.add(args[0], mod.id, mod.model);
            if (!added.success) {
                skippedMods.push({
                    name: mod.name,
                    pid: mod.pid,
                    reason: 'Failed to add to backup (API error)',
                    api: added.error
                });
            }
        }

        return { done: true, skippedMods };
    });

    ipcMain.handle('gamebanana_downloadAllInCollection', async (event, args) => {
        var mods = await collections.inspect(args[0]);

        var pwin = createProgressModal();

        for (const mod of mods) {

            var todownload = mod.files[0];
            if (mod.files.length > 1) {
                var result = dialog.showMessageBoxSync({
                    type: 'warning',
                    title: 'Multiple versions found',
                    message: `Multiple files for "${mod.mod}" were found. Choose which file to download`,
                    buttons: [...mod.files.map(f => f.filename), 'Cancel'],
                });

                if (result !== mod.files.length) {
                    todownload = mod.files[result];
                }
            }

            var dlpath = path.join(app.getPath('downloads'), Math.random().toString(36).substring(2, 15) + '.' + todownload.filename.split('.')[todownload.filename.split('.').length - 1]);

            await downloadFile(todownload.url, dlpath, (progress) => {
                if (pwin) updateProgressModal(pwin, null, progress, 'Downloading mod');
            });

            await Promise.race([
                Modstore.importMod(dlpath, 'donothing', mod.mod, mod.model),
                new Promise(resolve => setTimeout(resolve, 10000))
            ]);

            fs.unlinkSync(dlpath);
        }

        pwin.close();

        app.relaunch({ args: process.argv.slice(1).filter(arg => arg !== '-controller' && !arg.startsWith('deltamod://')).concat(isControllerMode ? ['-controller'] : []) });
        app.exit(0);

    });

    ipcMain.handle('patchAndRun', async (event, args) => {
        const win = getWindow();
        try {
            const baking = args[1] === 'baker';
            const pathname = KeyValue.readKVS('gamePath');
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
                if (win) {
                    win.webContents.send('audio', true);
                    win.webContents.send('page', 'main');
                }
                return false;
            }

            const notif = new Notification({ title: 'Patch complete!', body: 'Deltarune has been patched successfully!' });
            notif.on('click', () => {
                const currentWin = getWindow();
                if (!currentWin) return;
                if (currentWin.isMinimized()) currentWin.restore();
                currentWin.show();
                currentWin.focus();
                currentWin.setAlwaysOnTop(true);
                setTimeout(() => currentWin.setAlwaysOnTop(false), 100);
            });
            notif.show();

            state.callbackNPS = () => ipcMain.emit('startGame', null, []);
            
            if (!baking) {
                state.callbackNPSPassWith = [pathname];
                if (win) win.webContents.send('finishedPatch', mods);
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

    ipcMain.handle('downloadGame', async (event, args) => {
        const win = getWindow();
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

    // Install Management
    ipcMain.handle('getSystemIndex', () => {
        const overridePath = getSystemFile('_sysindex', true);
        return fs.existsSync(overridePath) ? fs.readFileSync(overridePath, 'utf8') : 0;
    });
    ipcMain.handle('getMaxExistingIndex', () => {
        try {
            const systemFiles = fs.readdirSync(app.getPath('userData')).filter(f => f.startsWith('deltamod_system-'));
            let maxIndex = 0;
            const invalidInstalls = [];
            for (const file of systemFiles) {
                const index = file.split('-')[1];
                if (index === 'unique') continue;
                var store = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), file, 'store.json'), 'utf8'));

                if (!fs.existsSync(store.gamePath)) {
                    fs.rmSync(path.join(app.getPath('userData'), file), { recursive: true, force: true });
                    invalidInstalls.push(index);
                    continue;
                }
                maxIndex = Math.max(maxIndex, parseInt(index, 10));
            }
            return [maxIndex, invalidInstalls];
        } catch (err) { return [0, []]; }
    });
    ipcMain.handle('getInstallations', async () => await getInstallations());
    ipcMain.handle('setInstallationCName', (event, args) => fs.writeFileSync(path.join(app.getPath('userData'), `deltamod_system-${args[0]}`, '_cname'), args[1]));
    ipcMain.handle('changeSystemIndex', (event, args) => {
        fs.writeFileSync(getSystemFile('_sysindex', true), args[0]);
        app.relaunch(intoIM());
        app.exit();
    });
    ipcMain.handle('getEditionByIndex', (event, args) => KeyValue.readKVSOfIndex('gamePid', args[0]) || "Unknown");
    
    ipcMain.handle('createNewInstallation', async (event, args) => {
        const win = getWindow();
        const steam = args[0] === 'steam';
        const isFromLocate = args[1] === 'locate';
        const specifiedLocatePath = isFromLocate ? args[2] : null;
        const fromIM = args[3];
        let selectedGame = args[4];
        let copyToDMod = args[5] == 'copy';

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
            state.STEAM_BASE = getSteamDirectory(dialog);
            chosenEdition = GameDB.getFeatInfo(selectedGame, "steam").data;
            selectedGame = chosenEdition.pid;

            if ((await getInstallations(true)).some(x => x.appid === chosenEdition.appid)) {
                dialog.showErrorBox('Already imported', 'Game already imported.');
                return false;
            }
            sourcePath = path.join(state.STEAM_BASE, chosenEdition.folder);
        }

        if (!validateDeltarune(sourcePath)) {
            dialog.showErrorBox('Invalid folder', steam ? 'Game missing from Steam library.' : 'Invalid game installation.');
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

        if (!fs.existsSync(path.join(app.getPath('userData'), `deltamod_system-${i}`))) {
            console.log('Initialized sysdir for new installation at index', i);
            fs.mkdirSync(path.join(app.getPath('userData'), `deltamod_system-${i}`), { recursive: true });
        }

        let destPath;
        if (copyToDMod) {
            destPath = path.join(app.getPath('userData'), `deltamod_system-${i}`, 'deltaruneInstall');
            console.log(`Copying files from ${sourcePath} to Deltamod storage (${destPath})...`);
            fs.mkdirSync((destPath), { recursive: true });
            try {
                const copyDir = (src, dest) => {
                    const stats = fs.statSync(src);
                    if (stats.isDirectory()) {
                        fs.mkdirSync(dest, { recursive: true });
                        for (const entry of fs.readdirSync(src)) {
                            copyDir(path.join(src, entry), path.join(dest, entry));
                        }
                    } else {
                        fs.copyFileSync(src, dest);
                    }
                };

                copyDir(sourcePath, destPath);
            }
            catch (err) {
                dialog.showErrorBox('Copy failed', `Failed to copy files: ${err.message}`);
                console.error('Error during copy:', err);
                return false;
            }

            console.log('Copy completed successfully.');
        }
        else {
            destPath = sourcePath;
        }

        try {
            KeyValue.setKVSOfIndex('loadedDeltarune', true, i);
            KeyValue.setKVSOfIndex('gamePath', destPath, i);
            KeyValue.setKVSOfIndex('gamePid', selectedGame, i);
            KeyValue.setKVSOfIndex('deltaruneEdition', 'rem', i); // stub to signal it has been upgraded
            KeyValue.setKVSOfIndex('enabledMods', [], i);
            KeyValue.setKVSOfIndex('isSteam', steam, i);
            KeyValue.setKVSOfIndex('originalSteamPath', steam ? sourcePath : "", i);
            KeyValue.setKVSOfIndex('steamAppId', steam ? chosenEdition.appid : "", i);

            page(fromIM ? "installmanager" : "main");
            return true;
        } catch (err) {
            dialog.showErrorBox('Import failed', `Failed: ${err.message}\n\n${err.stack}`);
            return false;
        }
    });

    ipcMain.handle('isCurrentIndexSteam', () => KeyValue.readKVSOfIndex('isSteam', parseInt(System.getCurrentSystemIndex())));
    ipcMain.handle('removeSteamIntegration', () => {
        const index = parseInt(System.getCurrentSystemIndex());
        
        if (KeyValue.readKVSOfIndex('gamePath', index).endsWith('deltaruneInstall')) {
            Junction.deleteJunction(KeyValue.readKVSOfIndex('originalSteamPath', index));
        }

        KeyValue.setKVSOfIndex('isSteam', false, index);
        KeyValue.setKVSOfIndex('originalSteamPath', "", index);
        KeyValue.setKVSOfIndex('steamAppId', "", index);
        app.relaunch(properRelaunch());
        app.exit();
    });

    ipcMain.handle('deleteSystemIndex', (event, args) => {
        const index = args[0];
        if (KeyValue.readKVSOfIndex('isSteam', parseInt(index)) && KeyValue.readKVSOfIndex('gamePath', parseInt(index)).endsWith('deltaruneInstall')) {
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

            var store = JSON.parse(fs.readFileSync(path.join(newPath, 'store.json'), 'utf8'));
            if (store.gamePath.endsWith('deltaruneInstall')) {
                console.log(`Updating game path for system index ${cNum} to reflect new index after deletion.`);
                store.gamePath = path.join(app.getPath('userData'), `deltamod_system-${cNum}`, 'deltaruneInstall');
                fs.writeFileSync(path.join(newPath, 'store.json'), JSON.stringify(store, null, 4), 'utf8');
            }
        });

        fs.writeFileSync(getSystemFile('_sysindex', true), "0");
        app.relaunch(intoIM());
        app.exit();
        return true;
    });

    ipcMain.handle('createInstallLink', (event, args) => {
        const win = getWindow();
        if (process.platform !== 'win32') return dialog.showErrorBox('Unsupported', 'Only supported on Windows.');
        if (!args[0]) return dialog.showErrorBox('Error', 'Invalid system index.');

        const iName = fs.readFileSync(System.getSystemFileOfIndex('_cname', args[0]), 'utf8');
        const shortcutsCreated = createDesktopShortcut({
            windows: { filePath: process.execPath.replace(/\\/g, '\\\\'), name: `Deltamod (${iName})`, arguments: `---system_index=${args[0]}` }
        });
        if (shortcutsCreated) dialog.showMessageBox(win, { type: 'info', title: 'Shortcut Created', message: 'Shortcut created on desktop.' });
    });

    ipcMain.handle('openInstallationFolder', (event, args) => shell.openExternal(getSystemFolderOfIndex('deltaruneInstall', args[0])));

    // Folders & Misc
    ipcMain.handle('openSysFolder', (event, args) => shell.openPath(args[0] === 'mods' ? getPacketDatabase() : getSystemFolder('deltaruneInstall', false)));
    ipcMain.handle('openModFolder', (event, args) => shell.openPath(path.join(getPacketDatabase(), args[0])));
    ipcMain.handle('getUniqueFlag', (event, args) => KeyValue.readUniqueFlag(args[0].toUpperCase()));
    ipcMain.handle('setUniqueFlag', (event, args) => KeyValue.writeUniqueFlag(args[0].toUpperCase(), args[1]));
    ipcMain.handle('fetchSharedVariable', (event, args) => getSharedVar(args[0]));
    ipcMain.handle('isBaked', () => KeyValue.readKVS('baked'));
    ipcMain.handle('npsCallback', () => { if (state.callbackNPS) { state.callbackNPS(...state.callbackNPSPassWith); state.callbackNPS = null; } });
    ipcMain.handle('executeArgumentCmd', () => {}); // No-op
    ipcMain.handle('openFlagDatabase', () => shell.openPath(path.join(app.getPath('userData'), 'deltamod_system-unique', 'flagDB.config')));
    ipcMain.handle('deltamoddersDiscord', async () => shell.openExternal((await axios.get(require('../package.json').discordAPI)).data.instant_invite));
    ipcMain.handle('browseFile', async (event, args) => {
        const win = getWindow();
        const pathdial = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: args[0], extensions: [args[1]] }] });
        return pathdial.canceled ? null : pathdial.filePaths[0];
    });
    ipcMain.handle('locateDelta', async () => {
        const win = getWindow();
        const pathdial = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
        return pathdial.canceled ? null : validateDeltarune(pathdial.filePaths[0]);
    });
    ipcMain.handle('canReportError', () => !isDevToolsEnabled && !state.updateAvailable);
    
    // Updates
    ipcMain.handle('fireUpdate', async () => {
        const win = getWindow();
        try {
            const updateInfo = await Updates.checkUpdates();
            if (updateInfo.update && !state.ignoreUpdate) {
                if (win) win.webContents.send('updateAvailable', updateInfo);
                state.updateAvailable = true;

                updateStackInfo = updateInfo;
                return true;
            }
            return false;
        } catch { return false; }
    });
    ipcMain.handle('start-update', async (event, args) => {
        if (!updateStackInfo) return;
        
        var pwin = createProgressModal();
        try {
            const installerPath = path.join(System.getTemporary(), `deltamodUpdate.${updateStackInfo.version.replace(/\./g, "")}.exe`);

            await downloadFile(updateStackInfo.newVersionLink, installerPath, (progress) => {
                if (pwin) updateProgressModal(pwin, null, progress, 'Downloading update');
            });

            await timeoutPromise(1500);

            exec(`"${installerPath}" --mode unattended --unattendedmodeui minimal`);

            app.exit(0);
        } catch (e) {
            dialog.showErrorBox("Update Failed", "Failed to download update. Please reinstall from GameBanana. Opening browser...");
            shell.openExternal('https://gamebanana.com/tools/20575');
            state.ignoreUpdate = true;
            page("main");
        }
    });
    ipcMain.handle('ignore-update', () => { state.ignoreUpdate = true; page("main"); });
    ipcMain.handle('initialize', () => {
        const appdata = path.join(app.getPath('appData'), 'deltamod');
        fs.readdirSync(appdata).filter(f => f.startsWith('deltamod_system')).forEach(f => {
            try { fs.rmSync(path.join(appdata, f), { recursive: true, force: true }); } catch {}
        });
        fs.rmSync(path.join(appdata, 'pkg.db'), { recursive: true, force: true });
        app.quit();
    });

    // Debug Modals / Tracers
    ipcMain.handle('modalTest', async () => {
        const win = getWindow();
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
    ipcMain.handle('openElectronTracer', () => {
        if (state.elecTracer) return;
        state.elecTracer = new BrowserWindow({ width: 500, height: 300, webPreferences: { nodeIntegration: true, contextIsolation: true, partition: PARTITION, preload: path.join(__dirname, '..', 'web', 'views', 'electron-tracer', 'preload.js') } });
        state.elecTracer.setAlwaysOnTop(true);
        state.elecTracer.setMenuBarVisibility(false);
        state.elecTracer.loadURL('deltapack://web/views/electron-tracer/index.html');
    });
    ipcMain.handle('logElectronAPI', (event, args) => { try { if (state.elecTracer) state.elecTracer.webContents.send('log', args[0]); } catch { state.elecTracer = null; } });

    // DeltamodCLI installation
    ipcMain.handle('installDeltamodCLI', async () => {
        var latestRelease;
        try {
            const response = await axios.get('https://api.github.com/repos/deltamodders/deltamodCLI/releases/latest');
            latestRelease = response.data;
        } catch (e) {
            dialog.showErrorBox('Error', 'Failed to fetch latest release info.');
            return;
        }

        const asset = latestRelease.assets[0].browser_download_url;

        try {
            const modal = createProgressModal();

            // download zip
            const downloadsDir = app.getPath('downloads');
            const cliZipPath = path.join(downloadsDir, 'cli.zip');
            const response = await axios.get(asset, { responseType: 'stream', maxRedirects: 10 });

            let receivedBytes = 0;
            await new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(cliZipPath);
                response.data.pipe(writer);
                response.data.on('data', chunk => {
                    const totalLength = parseInt(response.headers['content-length'] || '0', 10);
                    receivedBytes += chunk.length;
                    if (totalLength) updateProgressModal(modal, getWindow(), receivedBytes / totalLength, 'Downloading CLI');
                });
                writer.on('finish', resolve);
                writer.on('error', reject);
                response.data.on('error', reject);
            });

            modal.close();
            modal.destroy();

            const cliExtractPath = path.join(downloadsDir, 'cli_extracted');
            fs.mkdirSync(cliExtractPath, { recursive: true });
            await _7z.unpack(cliZipPath, cliExtractPath);

            execSync(`"${path.join(cliExtractPath, 'Install.cmd')}"`, { cwd: cliExtractPath });

            dialog.showMessageBox(getWindow(), { type: 'info', title: 'Installation complete', message: 'DeltamodCLI has been installed successfully!' });

        } catch (e) {
            dialog.showErrorBox('Error', `Failed to download CLI: ${e.message || e}`);
        }
    });
};