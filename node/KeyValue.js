const path = require('path');
const app = require('electron').app;
const fs = require('fs');
let kvs = {};
const { getSystemFile, getSystemFolder, healthCheck, getSystemFileOfIndex, getSystemFolderOfIndex } = require('./System.js');
const { get } = require('http');
const crypto = require('crypto');
const console = require('./Console.js');

function hash(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function retrieve() {
    healthCheck();
    var pathname = getSystemFile('store.json', false);
    if (!fs.existsSync(pathname)) {
        console.log('Creating blank store');
        fs.writeFileSync(pathname, '{}');
    }
    var raw = fs.readFileSync(pathname, 'utf8');
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

function kvsFlushIndex(obj, index) {
    var pathname = getSystemFileOfIndex('store.json', index);
    fs.writeFileSync(pathname, JSON.stringify(obj, null, 2));
    console.log('Store flushed for index ' + index);
    return true;
}

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

function setKVS(name, value) {
    kvs[name] = value;
    kvsFlush();
}

function upgradeStores() {
    try {
        var oldStorePath = app.getPath('userData');

        console.log('Checking for old stores to upgrade in ' + oldStorePath);

        fs.readdirSync(oldStorePath).filter(f => f.startsWith('deltamod_system-')).forEach(file => {
            if (file.endsWith('unique')) return;

            var indx = file.split('-')[1];
            console.log('Checking install index ' + indx);

            // upgrade edition flag to gamePid
            var fff = readKVSOfIndex('deltaruneEdition', indx, "none");
            console.log('Found edition ' + fff + ' in index ' + indx);
            if (fff != "rem") {
                console.log('Upgrading index ' + indx);
                var pid = "toby.deltarune.demo";
                if (readKVSOfIndex('deltaruneEdition', indx, "n") == "full") {
                    pid = "toby.deltarune";
                }
                setKVSOfIndex('gamePid', pid, indx);
                setKVSOfIndex('deltaruneEdition', "rem", indx);
                console.log('Upgraded index ' + indx);
            }

            // upgrade deltaruneInstall path to store
            var gamePath = readKVSOfIndex('gamePath', indx, "none");
            if (gamePath == "none") {
                setKVSOfIndex('gamePath', path.join(getSystemFolderOfIndex('deltaruneInstall', indx)), indx);
            }

            // upgrade toby.deltarune.demo -> toby.deltarune.demolts if needed
            var pid = readKVSOfIndex('gamePid', indx, "none");
            var doneCheck = readKVSOfIndex('drDemoCheck', indx, "none");
            if (pid == "toby.deltarune.demo" && doneCheck != "done") {
                var gamePath = readKVSOfIndex('gamePath', indx, "none");
                var checkpath = path.join(gamePath, "chapter1_windows");
                if (fs.existsSync(checkpath) && fs.statSync(checkpath).isDirectory()) {
                    setKVSOfIndex('gamePid', "toby.deltarune.demolts", indx);
                    console.log('Upgraded gamePid for index ' + indx);
                }

                setKVSOfIndex('drDemoCheck', "done", indx);
            }
        });
    }
    catch (e) {
        console.log('No old stores found to upgrade: ' + e);
    }
}

function loadUniqueDefaults() {
    var defaults = {
        'setup': true,
        'audio': true,
        'sfx': true,
        'controller': false,
    };

    for (var key in defaults) {
        if (!existsUniqueFlag(key)) {
            console.log('Setting flag default for ' + key + ' to ' + defaults[key]);
            // set unique flags
            writeUniqueFlag(key, defaults[key]);
        }
    }
}

function setKVSOfIndex(name, value, index) {
    try {
        var odb = JSON.parse(fs.readFileSync(getSystemFileOfIndex("store.json", index), 'utf8').split('##')[0]);
    }
    catch (e) {
        var odb = {};
    }
    odb[name] = value;
    kvsFlushIndex(odb, index);
}

function readKVSOfIndex(name, index, defaultTo = null) {
    var odb = JSON.parse(fs.readFileSync(getSystemFileOfIndex("store.json", index), 'utf8').split('##')[0]);
    return odb[name] ?? defaultTo;
}

function readKVS(name, defaultTo = null) {
    return kvs[name] ?? defaultTo;
}

module.exports = {
    hash,
    retrieve,
    kvsFlush,
    writeUniqueFlag,
    readUniqueFlag,
    kvsWipe,
    setKVS,
    upgradeStores,
    setKVSOfIndex,
    readKVSOfIndex,
    readKVS,
    loadUniqueDefaults,
};
