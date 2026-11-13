import https from 'https';
import { version } from 'os';

import console from './Console';
import { PACKAGE_JSON } from './Paths';

interface SomeUpdateInfo {
    update: true;
    newVersionLink: string;
    version: string;
}

interface NoneUpdateInfo {
    update: false;
    newVersionLink: null;
    version: null;
}

type UpdateInfo = SomeUpdateInfo | NoneUpdateInfo;

function httpsPromisify(params: string | URL | https.RequestOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(params, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

export async function checkUpdates(): Promise<UpdateInfo> {
    try {
        var VERSION = require(PACKAGE_JSON).version;
        var URL = "https://deltamodders.com/apiv1/deltamod/latest?v=" + encodeURIComponent(VERSION);
        var DATA = await JSON.parse(await httpsPromisify(URL));
    }
    catch (e) {
        console.warn("Failed to check for updates");
        return {update: false, newVersionLink: null, version: null};
    }

    if (process.platform == 'linux') {
        console.warn("Auto-updates are not supported on Linux. Please check https://github.com/deltamodders/deltamod for updates.");
        return {update: false, newVersionLink: null, version: null};
    }

    return {
        update: DATA.update,
        newVersionLink: DATA.newVersionLink,
        version: DATA.version
    };
}
