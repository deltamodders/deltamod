// collecton of utility functions

import crypto from "crypto";
import https from "https";
import fs from "fs";
import path from "path";
import os from "os";
import { BrowserWindow } from "electron";

let win: BrowserWindow | null = null;

export function timeoutPromise(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateUUID(): string {
    return crypto.randomUUID();
}

import { pipeline } from 'stream';
import { promisify } from 'util';
const pipelineAsync = promisify(pipeline);

export async function downloadFile(
    url: string,
    dest: string,
    onProgress: (downloadedFrac: number) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = https.get(url, async (res) => {
            if (res.statusCode === undefined) {
                reject(new Error("statusCode is undefined"));
                return;
            }
            try {
                // Handle redirects
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    res.resume(); // discard response
                    resolve(downloadFile(res.headers.location, dest, onProgress));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const total = Number(res.headers['content-length']) || 0;
                let downloaded = 0;

                if (onProgress) {
                    res.on('data', (chunk: Buffer) => {
                        downloaded += chunk.length;

                        if (total > 0) {
                            try {
                                onProgress(downloaded / total);
                            } catch {
                                // ignore callback errors
                            }
                        }
                    });
                }

                const file = fs.createWriteStream(dest);

                await pipelineAsync(res, file);

                // At this point the stream has finished and closed.
                resolve();
            } catch (err) {
                fs.unlink(dest, () => {});
                reject(err);
            }
        });

        req.on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

export function getFileVersion(filePath: string): string {
    var basecmd = `powershell -command "(Get-Item '${filePath}').VersionInfo.FileVersion"`;
    var execSync = require('child_process').execSync;
    var c = execSync(basecmd).toString().trim();
    console.log(`File version of ${filePath} is ${c}`);
    return c;
}

export function randomString(length: number): string {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

export function lastOfArray<T>(arr: T[]): T | null {
    return arr.length > 0 ? arr[arr.length - 1] : null;
}

function hashFile(filePath: string): string {
    return crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
}

/**
 * TODO(fnrir): what's the type of this???
 */
export function validateVersioning<T>(version: T): T {
    return version;
}

/**
 * sets the current window to newwin.
 */
export function setWindow(newwin: BrowserWindow) {
    win = newwin;
}

/**
 * returns the current window.
 */
export function getWindow(): BrowserWindow {
    if (win === null) throw new Error("getWindow called before win initialized");
    return win;
}

export function page(newPage: string) {
    getWindow().webContents.send("page", [newPage]);
}

export function shopClang() {
    // deprecated
}

let sharedVariables: Record<string, any> = {}; // shared vars with renderer

export function setSharedVar(name: string, value: any): true {
    sharedVariables[name] = value;
    return true;
}

export function getSharedVar(name: string): any {
    return sharedVariables[name];
}

export function properRelaunch(otherArgs: string[] = []): { args: string[] } {
    const a = process.argv.slice(1);
    return { args: [...a.filter(x => !x.toLowerCase().startsWith("deltamod://")), ...otherArgs] }
}

function logOnAccess<T>(obj: T, logMsg: any): T {
    console.log(logMsg);
    return obj;
}

export function between(string: string, start: string, end: string): string {
    return string.split(start)[1].split(end)[0];
}

function showSteamPathMessageBox(dialog: Electron.Dialog): number {
    return dialog.showMessageBoxSync({
        type: 'question',
        title: 'Provide Steam path',
        message: 'Could not find Steam installation automatically. Would you like to provide the Steam installation path manually?',
        buttons: ['Yes', 'No'],
    })
}

export function getSteamDirectory(dialog: Electron.Dialog): string {
    let steamdir;
    switch (process.platform) {
        case "win32":
            const winSteamDir = "Program Files (x86)/Steam/steamapps/common/";
            if (fs.existsSync(`C:/${winSteamDir}`)) {
                steamdir = `C:/${winSteamDir}`;
            } else {
                steamdir = `D:/${winSteamDir}`;
            }
            break;
        case "linux":
            const steamCommon = "steamapps/common/";

            const linuxDirCandidates = [
                path.join(os.homedir(), ".local/share/Steam"),
                path.join(os.homedir(), ".steam/steam"),
                path.join(os.homedir(), ".steam/root"),
                path.join(os.homedir(), ".var/app/com.valvesoftware.Steam/.local/share/Steam"),
            ];

            steamdir =
                  linuxDirCandidates
                    .map(dir => path.join(dir, steamCommon))
                    .find(dir => fs.existsSync(dir)); 

            break;
        case "darwin":
            steamdir = path.join(os.homedir(), "/Library/Application Support/Steam/steamapps/common/");
            break;
    }

    if (steamdir == undefined || !fs.existsSync(steamdir)) {
        if (showSteamPathMessageBox(dialog) === 0) {
            const dialog_res = dialog.showOpenDialogSync(getWindow(), {
                properties: ['openDirectory'],
                message: 'Select the Steam "common" folder (e.g., C:/Program Files (x86)/Steam/steamapps/common/)',
            });
            if (dialog_res !== undefined) steamdir = dialog_res[0];
        }
    }

    if (steamdir === undefined) throw new Error("No Steam common folder chosen");

    return steamdir;
}
