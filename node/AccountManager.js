// @ts-check

const fs = require('fs');
const { safeStorage, app } = require('electron');

/** @typedef {any} BaseAccountInfo */

/**
 * @param {string} name
 * @param {BaseAccountInfo} info
 */
function saveAccountInfo(name, info) {
    var info_txt = JSON.stringify(info);
    var encryptedInfo = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(info_txt) : info_txt;
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (!fs.existsSync(app.getPath('userData') + '/accounts')) {
        fs.mkdirSync(app.getPath('userData') + '/accounts');
    }
    fs.writeFileSync(filePath, encryptedInfo);
}

/**
 * @param {string} name
 * @returns {BaseAccountInfo}
 */
function getAccountInfo(name) {
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (!fs.existsSync(filePath)) {
        return null;
    }
    var encryptedInfo = fs.readFileSync(filePath);
    var info = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(encryptedInfo) : encryptedInfo.toString();
    return JSON.parse(info);
}

/**
 * @param {string} name
 */
function deleteAccountInfo(name) {
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

module.exports = {
    saveAccountInfo,
    getAccountInfo,
    loadAccountInfo: getAccountInfo, // alias
    deleteAccountInfo
};