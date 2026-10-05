const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const process = require('process');

const { app, dialog, shell } = require('electron');

const console = require('./Console');
const { createProgressModal, updateProgressModal } = require('./ProgressModal');
const System = require('./System');
const { page, downloadFile, timeoutPromise, randomString, getWindow } = require('./Utils');

/**
 * @typedef {Object} UpdateInfoV1
 * @property {boolean} update
 * @property {string?} newVersionLink
 * @property {string?} version
 */

function httpsPromisify(params) {
    return new Promise((resolve, reject) => {
        https.get(params, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * @type {NodeJS.Platform[]}
 */
const UPDATE_SUPPORTED_PLATFORMS = ['linux', 'win32'];
/**
 * @type {UpdateInfoV1}
 */
const DEFAULT_UPDATE = { update: false, newVersionLink: null, version: null };
const APPIMAGE_PATH = process.env.APPIMAGE;
const IS_APPIMAGE = !!APPIMAGE_PATH;

function updates_supported() {
    //return UPDATE_SUPPORTED_PLATFORMS.includes(os.platform());
    const platform = os.platform();
    switch (platform) {
        case 'win32':
            return true;
        case 'linux':
            return IS_APPIMAGE;
    }
    return false;
}

/**
 * @returns {Promise<UpdateInfoV1>}
 */
async function checkUpdates() {
    if (!updates_supported()) return DEFAULT_UPDATE;
    try {
        var VERSION = require('../package.json').version;
        var URL = "https://deltamodders.com/apiv1/deltamod/latest?v=" + encodeURIComponent(VERSION);
        var DATA = await JSON.parse(await httpsPromisify(URL));
    }
    catch (e) {
        console.warn("Failed to check for updates");
        console.warn(e);
        return DEFAULT_UPDATE;
    }
    //const DATA = { update: true, newVersionLink: "http://127.0.0.1:8080/deltamod.zip", version: "2.13.7" };

    return {
        update: DATA.update,
        newVersionLink: DATA.newVersionLink,
        version: DATA.version
    };
}

/**
 * @param {UpdateInfoV1} updateStackInfo
 * @param {Electron.CrossProcessExports.BrowserWindow} pwin
 */
async function doUpdateWindows(updateStackInfo, pwin) {
    const installerPath = path.join(System.getTemporary(), `deltamodUpdate.${updateStackInfo.version.replace(/\./g, "")}.exe`);

    await downloadFile(updateStackInfo.newVersionLink, installerPath, (progress) => {
        if (pwin) updateProgressModal(pwin, null, progress, 'Downloading update');
    });

    await timeoutPromise(1500);

    exec(`"${installerPath}" --mode unattended --unattendedmodeui minimal`);

    app.exit(0);
}

/**
 * @param {UpdateInfoV1} updateStackInfo
 * @param {Electron.CrossProcessExports.BrowserWindow} pwin
 */
async function doUpdateLinuxAppimage(updateStackInfo, pwin) {
    const version = updateStackInfo.version;
    const gh_file_url = `https://github.com/deltamodders/deltamod/releases/download/${version}/Deltamod-${version}-AppImage.AppImage`;
    const appimage_dir = path.dirname(APPIMAGE_PATH);
    const tmp_filename = `Deltamod-${version}-AppImage-${randomString(16)}.AppImage.part`;
    const tmp_appimage_path = path.join(appimage_dir, tmp_filename);
    await downloadFile(gh_file_url, tmp_appimage_path, (progress) => {
        if (pwin) updateProgressModal(pwin, null, progress, 'Downloading update');
    });
    const old_stat = fs.statSync(APPIMAGE_PATH);
    fs.chmodSync(tmp_appimage_path, old_stat.mode);
    const bak_path = APPIMAGE_PATH + ".bak";
    if (fs.existsSync(bak_path)) fs.unlinkSync(bak_path);
    fs.renameSync(APPIMAGE_PATH, bak_path);
    try {
        fs.renameSync(tmp_appimage_path, APPIMAGE_PATH);
    } catch (e) {
        fs.renameSync(bak_path, APPIMAGE_PATH);
        throw e;
    }
    await dialog.showMessageBox({
        message: "Update successful! Please restart Deltamod.",
        type: "info",
        buttons: ["Ok"]
    });
    // TODO: self-reexec
    app.exit(0);
}

/**
 * @param {UpdateInfoV1} updateStackInfo
 * @param {Electron.CrossProcessExports.BrowserWindow} pwin
 */
async function doUpdateLinuxStandard(updateStackInfo, pwin) {
    const exec_path = process.execPath;
    fs.statSync(exec_path);
    const install_path = path.dirname(exec_path);
    const tmp_install_path = `${install_path}-${randomString(16)}`;
    const gh_release_url = `https://github.com/deltamodders/deltamod/releases/tag/${updateStackInfo.version}`;
}

/**
 * @param {UpdateInfoV1} updateStackInfo
 * @param {Electron.CrossProcessExports.BrowserWindow} pwin
 */
async function doUpdateLinux(updateStackInfo, pwin) {
    if (IS_APPIMAGE) return doUpdateLinuxAppimage(updateStackInfo, pwin);
    throw new Error("unimplemented");
}

/**
 * @param {UpdateInfoV1?} updateStackInfo
 * @param {{ ignoreUpdate: boolean }} state
 */
async function doUpdate(updateStackInfo, state) {
    if (!updateStackInfo) return;
    const pwin = createProgressModal();
    try {
        if (os.platform() === "linux") doUpdateLinux(updateStackInfo, pwin);
        else doUpdateWindows(updateStackInfo, pwin);
    } catch (e) {
        dialog.showErrorBox("Update Failed", "Failed to download update. Please reinstall from GameBanana. Opening browser...");
        shell.openExternal('https://gamebanana.com/tools/20575');
        state.ignoreUpdate = true;
        page("main");
    }
}

async function doUpdateV2() {
    if (!updates_supported()) return;
}

module.exports = {
    checkUpdates,
    doUpdate
};
