const path = require('path');
const app = require('electron').app;
const fs = require('fs');
let kvs = {};
const { getSystemFile, getSystemFolder, healthCheck, getSystemFileOfIndex } = require('./System.js');
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
    if (hash(raw.split('##')[0]) != raw.split('##')[1]) {
        console.log('Store hash mismatch, wiping store');
        fs.writeFileSync(pathname, '{}##' + hash('{}'));
        retrieve();
        return true;
    }
    kvs = JSON.parse(raw.split('##')[0]);
    console.log('Store loaded')
    return true;
}

function kvsFlush() {
    var pathname = getSystemFile('store.json', false);
    fs.writeFileSync(pathname, JSON.stringify(kvs, null, 2) + '##' + hash(JSON.stringify(kvs, null, 2)));
    console.log('Store flushed.');
    return true;
}

function kvsFlushIndex(obj, index) {
    var pathname = getSystemFileOfIndex('store.json', index);
    fs.writeFileSync(pathname, JSON.stringify(obj, null, 2) + '##' + hash(JSON.stringify(obj, null, 2)));
    console.log('Store flushed for index ' + index);
    return true;
}

function writeUniqueFlag(name, val) {
    var pathname = getSystemFile('FLAG-' + name.toUpperCase(), true);
    if (val) {
        fs.writeFileSync(pathname, "");
    } else {
        if (fs.existsSync(pathname)) {
            fs.unlinkSync(pathname);
        }
    }
}

function readUniqueFlag(name) {
    return fs.existsSync(getSystemFile('FLAG-' + name.toUpperCase(), true));
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
    setKVSOfIndex,
    readKVSOfIndex,
    readKVS
};