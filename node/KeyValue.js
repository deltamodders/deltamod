// @ts-check
// TODO(fnrir): fixup readKVS(OfIndex) overloads

const path = require('path');
const app = require('electron').app;
const fs = require('fs');
const { getSystemFile, getSystemFolder, healthCheck, getSystemFileOfIndex, getSystemFolderOfIndex } = require('./System.js');
const { get } = require('http');
const crypto = require('crypto');
const console = require('./Console.js');

/**
 * @type {Object<string, boolean>}
 */
const KVS_DATABASE_DEFAULTS = {
    'setup': true,
    'audio': true,
    'sfx': true,
    'controller': false,
    'aidisclaimers': true
};

/**
 * @type {Object<string, any>}
 */
let kvs = {};

/**
 * @param {string} str
 * @returns {string}
 */
function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Loads `store.json` of current installation into global `kvs`.
 * Returns whether `store.json` exists.
 * @returns bool
 */
function retrieve() {
    healthCheck();
    var pathname = getSystemFile('store.json', false);
    try {
        var raw = fs.readFileSync(pathname, 'utf8');
    } catch (e) {
        if (e instanceof Error && "code" in e && e.code == "ENOENT")
            return false;
        throw e;
    }
    kvs = JSON.parse(raw.split('##')[0]);
    console.log('Store loaded')
    return true;
}

function kvsFlush() {
    var pathname = getSystemFile('store.json', false);
    var exportedKVS = kvs;
    
    exportedKVS.version = 'DELTAMOD_DATA_'+require('../package.json').version;
    fs.writeFileSync(pathname, JSON.stringify(exportedKVS, null, 2));
    console.log('Store flushed.');
    return true;
}

/**
 * @param {*} obj
 * @param {string} index
 * @returns {boolean}
 */
function kvsFlushIndex(obj, index) {
    var pathname = getSystemFileOfIndex('store.json', index);
    fs.writeFileSync(pathname, JSON.stringify(obj, null, 2));
    console.log('Store flushed for index ' + index);
    return true;
}

const defFDBMsg = "TODO(fnrir): defFDBMsg was unset. added value to appease tsc";

/**
 * @param {string} name
 * @param {boolean} val
 * @returns {boolean}
 */
function writeUniqueFlag(name, val) {
    try {
        var database = getSystemFile('flagDB.config', true);
        if (!fs.existsSync(database)) {
            fs.writeFileSync(database, defFDBMsg);
        }
        var databaseContent = fs.readFileSync(database, 'utf8');
        var lines = databaseContent.split('\n').filter(l => l.trim() != '' && !l.startsWith(name.toUpperCase() + ' = '));
        lines.push(name.toUpperCase() + ' = ' + (val ? '1' : '0'));
        fs.writeFileSync(database, lines.join('\n'));
        return true;
    }
    catch (e) {
        console.log('Error writing unique flag: ' + e);
        return false;
    }
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function existsUniqueFlag(name) {
    try {
        var database = getSystemFile('flagDB.config', true);
        if (!fs.existsSync(database)) {
            fs.writeFileSync(database, "");
        }
        var databaseContent = fs.readFileSync(database, 'utf8');

        return databaseContent.split('\n').some(l => l.startsWith(name.toUpperCase() + ' = '));
    }
    catch (e) {
        console.log('Error checking unique flag existence: ' + e);
        return false;
    }
}
/**
 * @param {string} name
 * @returns {boolean}
 */
function readUniqueFlag(name) {
    try {
        var database = getSystemFile('flagDB.config', true);
        if (!fs.existsSync(database)) {
            fs.writeFileSync(database, '');
        }
        var databaseContent = fs.readFileSync(database, 'utf8');

        var line = databaseContent.split('\n').find(l => l.startsWith(name.toUpperCase() + ' = '));
        if (line) {
            var value = line.split(' = ')[1].trim();
            return value.toLowerCase() == '1';
        }
        databaseContent += "\n" + name.toUpperCase() + " = 0";
        fs.writeFileSync(database, databaseContent);
        return false;
    }
    catch (e) {
        console.log('Error reading unique flag: ' + e);
        return false;
    }
}

function kvsWipe() {
    kvs = {};
    var pathname = getSystemFile('store.json', false);
    fs.writeFileSync(pathname, '{}##' + hash('{}'));
    console.log('Wiped store');
    return true;
}

/**
 * @param {string} name
 * @param {*} value
 */
function setKVS(name, value) {
    kvs[name] = value;
    kvsFlush();
}

function loadUniqueDefaults() {
    for (var key in KVS_DATABASE_DEFAULTS) {
        if (!existsUniqueFlag(key)) {
            console.log('Setting flag default for ' + key + ' to ' + KVS_DATABASE_DEFAULTS[key]);
            // set unique flags
            writeUniqueFlag(key, KVS_DATABASE_DEFAULTS[key]);
        }
    }
}

/**
 * @param {string} name
 * @param {*} value
 * @param {string} index
 */
function setKVSOfIndex(name, value, index) {
    try {
        var odb = JSON.parse(fs.readFileSync(getSystemFileOfIndex("store.json", index), 'utf8').split('##')[0]);
    }
    catch (e) {
        /**
         * @type any
         */
        var odb = {};
    }
    odb[name] = value;
    kvsFlushIndex(odb, index);
}

/**
 * @overload
 * @param {string} name
 * @param {string} index
 * @param {null} [defaultTo=null]
 * @returns {any}
 */
/**
 * @template T
 * @overload
 * @param {string} name
 * @param {string} index
 * @param {T} defaultTo
 * @returns {any | T}
 */
/**
 * @param {string} name
 * @param {string} index
 * @param {any} [defaultTo=null]
 * @returns {any}
 */
function readKVSOfIndex(name, index, defaultTo = null) {
    var odb = JSON.parse(fs.readFileSync(getSystemFileOfIndex("store.json", index), 'utf8').split('##')[0]);
    return odb[name] ?? defaultTo;
}

function upgradeStores() {
    try {
        var oldStorePath = app.getPath('userData');

        console.log('Checking for old stores to upgrade in ' + oldStorePath);

        fs.readdirSync(oldStorePath).filter(f => f.startsWith('deltamod_system-')).forEach(file => {
            if (file.endsWith('unique')) return;

            var indx = file.split('-')[1];
            console.log('Checking install index ' + indx);
            var edi = readKVSOfIndex('deltaruneEdition', indx, "none");

            console.log('Found edition ' + edi + ' in index ' + indx);
            if (edi != "rem") {
                console.log('Upgrading index ' + indx);
                var pid = "toby.deltarune.demo";
                if (readKVSOfIndex('deltaruneEdition', indx, "n") == "full") {
                    pid = "toby.deltarune";
                }
                setKVSOfIndex('gamePid', pid, indx);
                setKVSOfIndex('deltaruneEdition', "rem", indx);
                console.log('Upgraded index ' + indx + ' (Edition => GAMEID)');
                return;
            }

            /**
             * @param {string} folder
             */
            function scanFolderRecursively(folder) {
                fs.readdirSync(folder).forEach(file => {
                    var fullPath = path.join(folder, file);
                    if (fs.statSync(fullPath).isDirectory()) {
                        scanFolderRecursively(fullPath);
                    }
                    else if (file.endsWith('.hash')) {
                        console.log('Found hash file: ' + fullPath);
                        fs.rmSync(fullPath);
                    }
                });
            }

            var gpath = getSystemFolderOfIndex('', indx);
            console.log('Scanning for .hash files in ' + gpath);

            scanFolderRecursively(getSystemFolderOfIndex('', indx));

            console.log('Finished upgrading index ' + indx);
        });
    }
    catch (e) {
        console.log('No old stores found to upgrade: ' + e);
    }
}

/**
 * @overload
 * @param {string} name
 * @param {null} [defaultTo=null]
 * @returns {any}
 */
/**
 * @template T
 * @overload
 * @param {string} name
 * @param {T} defaultTo
 * @returns {any | T}
 */
/**
 * @param {string} name
 * @param {any} [defaultTo=null]
 * @returns {any}
 */
function readKVS(name, defaultTo = null) {
    return kvs[name] ?? defaultTo;
}

module.exports = {
    hash,
    retrieve,
    kvsFlush,
    writeUniqueFlag,
    existsUniqueFlag,
    readUniqueFlag,
    kvsWipe,
    setKVS,
    setKVSOfIndex,
    readKVSOfIndex,
    readKVS,
    loadUniqueDefaults,
    upgradeStores
};
