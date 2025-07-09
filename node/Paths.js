const path = require('path');
const app = require('electron').app;
const fs = require('fs');
let kvs = {};
const { getSystemFile, getSystemFolder, healthCheck } = require('./System.js');
const { get } = require('http');
const crypto = require('crypto');

function file(lib,name) {
    return path.join(__dirname, "../", lib, name);
}

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
    console.log('Flushed store to sys1.json');
    return true;
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

function readKVS(name) {
    return kvs[name] || null;
}

module.exports = {
    file,
    readKVS,
    kvsFlush,
    setKVS,
    kvsWipe,
    retrieve,
};