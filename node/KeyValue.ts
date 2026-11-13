import path from 'path';
const app = require('electron').app;
import fs from 'fs';
import { getSystemFile, getSystemFolder, healthCheck, getSystemFileOfIndex, getSystemFolderOfIndex } from './System.js';
import { get } from 'http';
import crypto from 'crypto';
import console from './Console.js';

/** TODO: decide if install index should be a string or an int */
export type IndexLike = number | string;

type KeyValueStore = Record<string, boolean>;
type KeyValueStoreODF = Record<string, any>;

const KVS_DATABASE_DEFAULTS: KeyValueStore = {
    'setup': true,
    'audio': true,
    'sfx': true,
    'controller': false,
    'aidisclaimers': true
};

let kvs: KeyValueStore = {};

function hash(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Loads `store.json` of current installation into global `kvs`.
 * Returns whether `store.json` exists.
 */
export function retrieve(): boolean {
    healthCheck();
    var pathname = getSystemFile('store.json', false);
    try {
        var raw = fs.readFileSync(pathname, 'utf8');
    } catch (e: any) {
        if ("code" in e && e.code == "ENOENT")
            return false;
        throw e;
    }
    kvs = JSON.parse(raw.split('##')[0]);
    console.log('Store loaded')
    return true;
}

function kvsFlush(): true {
    var pathname = getSystemFile('store.json', false);
    var exportedKVS: KeyValueStoreODF = kvs;
    
    exportedKVS.version = 'DELTAMOD_DATA_'+require('../package.json').version;
    fs.writeFileSync(pathname, JSON.stringify(exportedKVS, null, 2));
    console.log('Store flushed.');
    return true;
}

function kvsFlushIndex(obj: any, index: IndexLike): true {
    var pathname = getSystemFileOfIndex('store.json', index);
    fs.writeFileSync(pathname, JSON.stringify(obj, null, 2));
    console.log('Store flushed for index ' + index);
    return true;
}

const defFDBMsg = "TODO(fnrir): defFDBMsg was unset. added value to appease tsc";

export function writeUniqueFlag(name: string, val: boolean): boolean {
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

export function existsUniqueFlag(name: string): boolean {
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
export function readUniqueFlag(name: string): boolean {
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

function kvsWipe(): true {
    kvs = {};
    var pathname = getSystemFile('store.json', false);
    fs.writeFileSync(pathname, '{}##' + hash('{}'));
    console.log('Wiped store');
    return true;
}

function setKVS(name: string, value: any) {
    kvs[name] = value;
    kvsFlush();
}

export function loadUniqueDefaults() {
    for (var key in KVS_DATABASE_DEFAULTS) {
        if (!existsUniqueFlag(key)) {
            console.log('Setting flag default for ' + key + ' to ' + KVS_DATABASE_DEFAULTS[key]);
            // set unique flags
            writeUniqueFlag(key, KVS_DATABASE_DEFAULTS[key]);
        }
    }
}

export function setKVSOfIndex(name: string, value: any, index: IndexLike) {
    try {
        var odb = JSON.parse(fs.readFileSync(getSystemFileOfIndex("store.json", index), 'utf8').split('##')[0]);
    }
    catch (e) {
        var odb: any = {};
    }
    odb[name] = value;
    kvsFlushIndex(odb, index);
}

export function readKVSOfIndex<T>(name: string, index: IndexLike): T | null;
export function readKVSOfIndex<T>(name: string, index: IndexLike, defaultTo: T): T;
export function readKVSOfIndex(name: string, index: IndexLike, defaultTo: any = null): any {
    var odb = JSON.parse(fs.readFileSync(getSystemFileOfIndex("store.json", index), 'utf8').split('##')[0]);
    return odb[name] ?? defaultTo;
}

export function upgradeStores() {
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
                if (readKVSOfIndex<string>('deltaruneEdition', indx, "n") == "full") {
                    pid = "toby.deltarune";
                }
                setKVSOfIndex('gamePid', pid, indx);
                setKVSOfIndex('deltaruneEdition', "rem", indx);
                console.log('Upgraded index ' + indx + ' (Edition => GAMEID)');
                return;
            }

            function scanFolderRecursively(folder: string) {
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

export function readKVS<T>(name: string): T | null;
export function readKVS<T>(name: string, defaultTo: T): T;
export function readKVS(name: string, defaultTo: any = null): any {
    return kvs[name] ?? defaultTo;
}
