const fs = require('fs');
const app = require('electron').app;
const path = require('path');

let systemIndex = "0";

function randomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function generateUniqueId() {
    return "deltamod_" + randomString(16) + "_" + Date.now() + "_" + require('../package.json').version;
}

function healthCheck() {
    if (!fs.existsSync(path.join(app.getPath('userData'), 'deltamod_system-' + systemIndex))) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'deltamod_system-' + systemIndex), { recursive: true });
        console.log('Created deltamod_system folder in userData');
    }

    if (!fs.existsSync(path.join(app.getPath('userData'), 'deltamod_system-unique'))) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'deltamod_system-unique'), { recursive: true });
        console.log('Created deltamod_system-unique folder in userData');
    }

    if (!fs.existsSync(getPacketDatabase())) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'pkg.db'), { recursive: true });
        console.log('Created pkg.db in userData');
    }
}

function setSystemIndex(index) {
    systemIndex = index;
    console.log(`System index set to ${systemIndex}`);
}

function getSystemFile(fileid, unique) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), fileid);
}

function getSystemFolder(folderid, unique) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), folderid);
}

function getPacketDatabase() {
    return path.join(app.getPath('userData'), 'pkg.db');
}

healthCheck();

module.exports = {
    getSystemFile: getSystemFile,
    getSystemFolder: getSystemFolder,
    getPacketDatabase: getPacketDatabase,
    setSystemIndex: setSystemIndex,
    healthCheck: healthCheck,
    generateUniqueId: generateUniqueId,
};