// @ts-check

import fs from 'fs';
import { safeStorage, app } from 'electron';

type BaseAccountInfo = any;

export function saveAccountInfo(name: string, info: BaseAccountInfo) {
    var info_txt = JSON.stringify(info);
    var encryptedInfo = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(info_txt) : info_txt;
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (!fs.existsSync(app.getPath('userData') + '/accounts')) {
        fs.mkdirSync(app.getPath('userData') + '/accounts');
    }
    fs.writeFileSync(filePath, encryptedInfo);
}

export function getAccountInfo(name: string): BaseAccountInfo {
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (!fs.existsSync(filePath)) {
        return null;
    }
    var encryptedInfo = fs.readFileSync(filePath);
    var info = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(encryptedInfo) : encryptedInfo.toString();
    return JSON.parse(info);
}

export function deleteAccountInfo(name: string) {
    var filePath = app.getPath('userData') + '/accounts/' + name.toLowerCase() + '.json';
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

export const loadAccountInfo = getAccountInfo; // alias
