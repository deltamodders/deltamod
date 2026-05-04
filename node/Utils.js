// collecton of utility functions

const crypto = require("crypto");
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
    win.webContents.executeJavaScript(`addToModCounter(0);`);
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

    getWindow,
    setWindow,
    shopClang
    // errorWin,
};
