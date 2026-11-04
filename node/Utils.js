// @ts-check
// collecton of utility functions

const crypto = require("crypto");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { BrowserWindow, app } = require("electron");

/**
 * @type {BrowserWindow | null}
 */
var win = null;

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function timeoutPromise(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function generateUUID() {
    return crypto.randomUUID();
}

const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

/**
 * @param {string} url
 * @param {string} dest
 * @param {*} onProgress
 * @returns {Promise<void>}
 */
async function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, async (res) => {
            if (res.statusCode === undefined) {
                reject(new Error("statusCode is undefined"));
                return;
            }
            try {
                // Handle redirects
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    res.resume(); // discard response
                    resolve(downloadFile(res.headers.location, dest, onProgress));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const total = Number(res.headers['content-length']) || 0;
                let downloaded = 0;

                if (onProgress) {
                    res.on('data', (chunk) => {
                        downloaded += chunk.length;

                        if (total > 0) {
                            try {
                                onProgress(downloaded / total);
                            } catch {
                                // ignore callback errors
                            }
                        }
                    });
                }

                const file = fs.createWriteStream(dest);

                await pipelineAsync(res, file);

                // At this point the stream has finished and closed.
                resolve();
            } catch (err) {
                fs.unlink(dest, () => {});
                reject(err);
            }
        });

        req.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getFileVersion(filePath) {
    var basecmd = `powershell -command "(Get-Item '${filePath}').VersionInfo.FileVersion"`;
    var execSync = require('child_process').execSync;
    var c = execSync(basecmd).toString().trim();
    console.log(`File version of ${filePath} is ${c}`);
    return c;
}

/**
 * @param {number} length
 * @returns {string}
 */
function randomString(length) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

/**
 * @template T
 * @param {T[]} arr
 * @returns {T?}
 */
function lastOfArray(arr) {
    return arr.length > 0 ? arr[arr.length - 1] : null;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function hashFile(filePath) {
    return crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
}

/**
 * TODO(fnrir): what's the type of this???
 * @template T
 * @param {T} version
 * @returns {T}
 */
function validateVersioning(version) {
    return version;
}

/**
 * sets the current window to newwin.
 * @param {BrowserWindow} newwin
 */
function setWindow(newwin) {
    win = newwin;
}

/**
 * returns the current window.
 * @returns {BrowserWindow}
 */
function getWindow() {
    if (win === null) throw new Error("getWindow called before win initialized");
    return win;
}

/**
 * @param {string} newPage
 */
function page(newPage) {
    getWindow().webContents.send("page", [newPage]);
}

function shopClang() {
    // deprecated
}

/**
 * @type {Object<string, any>}
 */
let sharedVariables = {}; // shared vars with renderer

/**
 * @param {string} name 
 * @param {any} value 
 * @returns {true}
 */
function setSharedVar(name, value) {
    sharedVariables[name] = value;
    return true;
}

/**
 * @param {string} name
 * @returns {any}
 */
function getSharedVar(name) {
    return sharedVariables[name];
}

/**
 * @param {string[]} otherArgs 
 * @returns {{ args: string[] }}
 */
function properRelaunch(otherArgs = []) {
    const a = process.argv.slice(1);
    return { args: [...a.filter(x => !x.toLowerCase().startsWith("deltamod://")), ...otherArgs] }
}

/**
 * @template T
 * @param {T} obj
 * @param {any} logMsg
 * @returns {T}
 */
function logOnAccess(obj, logMsg) {
    console.log(logMsg);
    return obj;
}

/**
 * @param {string} string
 * @param {string} start
 * @param {string} end
 * @returns {string}
 */
function between(string, start, end) {
    return string.split(start)[1].split(end)[0];
}

/**
 * @param {Electron.Dialog} dialog
 * @returns {number}
 */
function showSteamPathMessageBox(dialog) {
    return dialog.showMessageBoxSync({
        type: 'question',
        title: 'Provide Steam path',
        message: 'Could not find Steam installation automatically. Would you like to provide the Steam installation path manually?',
        buttons: ['Yes', 'No'],
    })
}

/**
 * @param {Electron.Dialog} dialog
 * @returns {string}
 */
function getSteamDirectory(dialog) {
    let steamdir;
    switch (process.platform) {
        case "win32":
            const winSteamDir = "Program Files (x86)/Steam/steamapps/common/";
            if (fs.existsSync(`C:/${winSteamDir}`)) {
                steamdir = `C:/${winSteamDir}`;
            } else {
                steamdir = `D:/${winSteamDir}`;
            }
            break;
        case "linux":
            const steamCommon = "steamapps/common/";

            const linuxDirCandidates = [
                path.join(os.homedir(), ".local/share/Steam"),
                path.join(os.homedir(), ".steam/steam"),
                path.join(os.homedir(), ".steam/root"),
                path.join(os.homedir(), ".var/app/com.valvesoftware.Steam/.local/share/Steam"),
            ];

            steamdir =
                  linuxDirCandidates
                    .map(dir => path.join(dir, steamCommon))
                    .find(dir => fs.existsSync(dir)); 

            break;
        case "darwin":
            steamdir = path.join(os.homedir(), "/Library/Application Support/Steam/steamapps/common/");
            break;
    }

    if (steamdir == undefined || !fs.existsSync(steamdir)) {
        if (showSteamPathMessageBox(dialog) === 0) {
            const dialog_res = dialog.showOpenDialogSync(getWindow(), {
                properties: ['openDirectory'],
                message: 'Select the Steam "common" folder (e.g., C:/Program Files (x86)/Steam/steamapps/common/)',
            });
            if (dialog_res !== undefined) steamdir = dialog_res[0];
        }
    }

    if (steamdir === undefined) throw new Error("No Steam common folder chosen");

    return steamdir;
}

module.exports = {
    timeoutPromise,
    between,
    logOnAccess,
    getFileVersion,
    randomString,
    hashFile,
    lastOfArray,
    page,
    validateVersioning,
    setSharedVar,
    getSharedVar,
    properRelaunch,
    getSteamDirectory,
    downloadFile,
    generateUUID,

    getWindow,
    setWindow,
    shopClang
    // errorWin,
};
