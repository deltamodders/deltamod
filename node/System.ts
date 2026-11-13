import fs from 'fs';
import path from 'path';

import { app } from 'electron';

import console from './Console';
import type { IndexLike } from './KeyValue';
import { randomString } from './Utils';

let systemIndex: IndexLike = "0";


export function generateUniqueId(): string {
    return "deltamod_" + randomString(16) + "_" + Date.now() + "_" + require('../package.json').version;
}

export function healthCheck() {
    if (!fs.existsSync(path.join(app.getPath('userData'), 'deltamod_system-unique'))) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'deltamod_system-unique'), { recursive: true });
        console.log('Created deltamod_system-unique folder in userData');
    }

    if (!fs.existsSync(getPacketDatabase())) {
        fs.mkdirSync(path.join(app.getPath('userData'), 'pkg.db'), { recursive: true });
        console.log('Created pkg.db in userData');
    }
}

export function setSystemIndex(index: IndexLike) {
    systemIndex = index;
    console.log(`System index set to ${systemIndex}`);
}

export function getCurrentSystemIndex(): string {
    return systemIndex.toString();
}

export function getSystemFile(fileid: string, unique: boolean = false): string {
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), fileid);
}

export function getSystemFileOfIndex(fileid: string, index: IndexLike): string {
    return path.join(app.getPath('userData'), 'deltamod_system-' + index, fileid);
}

export function getSystemFolder(folderid: string, unique: boolean | undefined = undefined): string {
    if (folderid === "deltaruneInstall") {
        var store = JSON.parse(fs.existsSync(getSystemFile('store.json', unique)) ? fs.readFileSync(getSystemFile('store.json', unique), 'utf8') : '{}');
        return store.gamePath || path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), 'deltaruneInstall');
    }
    return path.join(app.getPath('userData'), 'deltamod_system-' + (unique ? "unique" : systemIndex), folderid);
}

export function getSystemFolderOfIndex(folderid: string, si: string): string {
    if (folderid === "deltaruneInstall") {
        var store = JSON.parse(fs.existsSync(getSystemFile('store.json')) ? fs.readFileSync(getSystemFile('store.json'), 'utf8') : '{}');
        return store.gamePath || path.join(app.getPath('userData'), 'deltamod_system-' + systemIndex, 'deltaruneInstall');
    }
    return path.join(app.getPath('userData'), 'deltamod_system-' + si, folderid);
}

export function getPacketDatabase(): string {
    return path.join(app.getPath('userData'), 'pkg.db');
}

export function getTemporary(): string {
    return path.join(app.getPath('temp'), "Deltamod");
}

export function clearTemporary() {
    // Scary!
    const p = getTemporary();
    fs.rmSync(p, { recursive: true, force: true });
    fs.mkdirSync(p);
}

healthCheck();
