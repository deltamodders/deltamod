// collecton of utility functions

const crypto = require("crypto");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { BrowserWindow, app } = require("electron");

var win = null;

function timeoutPromise(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

async function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, async (res) => {
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

function getFileVersion(filePath) {
    var basecmd = `powershell -command "(Get-Item '${filePath}').VersionInfo.FileVersion"`;
    var execSync = require('child_process').execSync;
    var c = execSync(basecmd).toString().trim();
    console.log(`File version of ${filePath} is ${c}`);
    return c;
}

function randomString(length) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function lastOfArray(arr) {
    return arr.length > 0 ? arr[arr.length - 1] : null;
}

function hashFile(filePath) {
    return crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
}

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
    return win;
}

function page(newPage) {
    win.webContents.send("page", [newPage]);
}

function shopClang() {
    // deprecated
}

let sharedVariables = {}; // shared vars with renderer
function setSharedVar(name, value) {
    sharedVariables[name] = value;
    return true;
}

function getSharedVar(name) {
    return sharedVariables[name];
}

function properRelaunch(otherArgs = []) {
    const a = process.argv.slice(1);
    return { args: [...a.filter(x => !x.toLowerCase().startsWith("deltamod://")), ...otherArgs] }
}

function logOnAccess(obj, logMsg) {
    console.log(logMsg);
    return obj;
}

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
            steamdir = path.join(os.homedir(), "/.local/share/Steam/steamapps/common/");
            break;
        case "darwin":
            steamdir = path.join(os.homedir(), "/Library/Application Support/Steam/steamapps/common/");
            break;
    }

    if (!fs.existsSync(steamdir)) {
        if (showSteamPathMessageBox(dialog) === 0) {
            steamdir = dialog.showOpenDialogSync(win, {
                properties: ['openDirectory'],
                message: 'Select the Steam "common" folder (e.g., C:/Program Files (x86)/Steam/steamapps/common/)',
            })[0];
        }
    }

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

    getWindow,
    setWindow,
    shopClang
    // errorWin,
};
