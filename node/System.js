// @ts-check

const fs = require('fs');
const { app } = require('electron');
const path = require('path');
const { randomString } = require('./Utils');
const console = require('./Console.js');

let systemIndex = "0";


/** @returns {string} */
function generateUniqueId() {
    return "deltamod_" + randomString(16) + "_" + Date.now() + "_" + require('../package.json').version;
}

function healthCheck() {
    if (!fs.existsSync(path.join(app.getPath('userData'), 'deltamod_system-unique'))) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'deltamod_system-unique'), { recursive: true });
        console.log('Created deltamod_system-unique folder in userData');
    }

    if (!fs.existsSync(getPacketDatabase())) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'pkg.db'), { recursive: true });
        console.log('Created pkg.db in userData');
    }
}

/**
 * @param {string} index
 */
function setSystemIndex(index) {
    systemIndex = index;
    console.log(`System index set to ${systemIndex}`);
}

function getCurrentSystemIndex() {
    return systemIndex;
}

/**
 * @param {string} fileid
 * @param {boolean} unique
 * @returns {string}
 */
function getSystemFile(fileid, unique = false) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), fileid);
}

/**
 * @param {string} fileid
 * @param {string} index
 * @returns {string}
 */
function getSystemFileOfIndex(fileid, index) {
    return path.join(app.getPath('userData'), 'deltamod_system-' + index, fileid);
}

/**
 * @param {string} folderid
 * @param {boolean} [unique]
 * @returns {string}
 */
function getSystemFolder(folderid, unique) {
    if (folderid === "deltaruneInstall") {
        var store = JSON.parse(fs.existsSync(getSystemFile('store.json', unique)) ? fs.readFileSync(getSystemFile('store.json', unique), 'utf8') : '{}');
        return store.gamePath || path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), 'deltaruneInstall');
    }
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), folderid);
}

/**
 * @param {string} folderid
 * @param {string} si
 * @returns {string}
 */
function getSystemFolderOfIndex(folderid, si) {
    if (folderid === "deltaruneInstall") {
        var store = JSON.parse(fs.existsSync(getSystemFile('store.json')) ? fs.readFileSync(getSystemFile('store.json'), 'utf8') : '{}');
        return store.gamePath || path.join(app.getPath('userData'), 'deltamod_system-' + systemIndex, 'deltaruneInstall');
    }
    return path.join(app.getPath('userData'), 'deltamod_system-' + si, folderid);
}

/** @returns {string} */
function getPacketDatabase() {
    return path.join(app.getPath('userData'), 'pkg.db');
}

/** @returns {string} */
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
