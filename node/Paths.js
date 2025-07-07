const path = require('path');
const app = require('electron').app;
const fs = require('fs');
let kvs = {};
const { getSystemFile, getSystemFolder } = require('./System.js');
const { get } = require('http');

function file(lib,name) {
    return path.join(__dirname, "../", lib, name);
}

function retrieve() {
    var pathname = getSystemFile('store.json');
    if (!fs.existsSync(pathname)) {
        console.log('Creating blank store');
        fs.writeFileSync(pathname, '{}');
    }
    kvs = JSON.parse(fs.readFileSync(pathname, 'utf8'));
    console.log('Store loaded')
    return true;
}

function kvsFlush() {
    var pathname = getSystemFile('store.json');
    fs.writeFileSync(pathname, JSON.stringify(kvs, null, 2));
    console.log('Flushed store to sys1.json');
    return true;
}

function kvsWipe() {
    kvs = {};
    var pathname = getSystemFile('store.json');
    fs.writeFileSync(pathname, '{}');
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