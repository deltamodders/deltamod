const fs = require('fs');
const { safeStorage, app } = require('electron');

function saveAccountInfo(name, info) {
    var info = JSON.stringify(info);
    var encryptedInfo = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(info) : info;
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (!fs.existsSync(app.getPath('userData') + '/accounts')) {
        fs.mkdirSync(app.getPath('userData') + '/accounts');
    }
    fs.writeFileSync(filePath, encryptedInfo);
}

function getAccountInfo(name) {
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (!fs.existsSync(filePath)) {
        return null;
    }
    var encryptedInfo = fs.readFileSync(filePath);
    var info = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(encryptedInfo) : encryptedInfo;
    return JSON.parse(info);
}

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