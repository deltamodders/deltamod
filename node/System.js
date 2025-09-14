const fs = require('fs');
const app = require('electron').app;
const path = require('path');
const { randomString } = require('./Utils');
const console = require('./Console.js');

let systemIndex = "0";


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

function getCurrentSystemIndex() {
    return systemIndex;
}

function getSystemFile(fileid, unique) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), fileid);
}

function getSystemFileOfIndex(fileid, index) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + index, fileid);
}

function getSystemFolder(folderid, unique) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), folderid);
}

function getSystemFolderOfIndex(folderid, si) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + si, folderid);
}

function getPacketDatabase() {
    return path.join(app.getPath('userData'), 'pkg.db');
}

function getTemporary() {
    return path.join(app.getPath('temp'), "Deltamod");
}

function clearTemporary() {
    // Scary!
    const p = getTemporary();
    fs.rmSync(p, { recursive: true, force: true });
    fs.mkdirSync(p);
}

healthCheck();

module.exports = {
    getSystemFile,
    getSystemFolder,
    getPacketDatabase,
    setSystemIndex,
    healthCheck,
    getSystemFolderOfIndex,
    getSystemFileOfIndex,
    getCurrentSystemIndex,
    generateUniqueId,
    getTemporary,
    clearTemporary
};