// Proton import setup: the managed UMU download, Steam Proton discovery, and
// the Steam game and account lookup used by Steam-managed profiles.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execFile } = require('child_process');

const RELEASE = Object.freeze({
    version: '1.4.4',
    url: 'https://github.com/Open-Wine-Components/umu-launcher/releases/download/1.4.4/umu-launcher-1.4.4-zipapp.tar',
    sha256: 'eb590691841f7fad3fc3ad8fd5db4ccb87849fe7948e62b28ece7a4ee48cc851',
    executableSha256: 'd0005a58602041229cc467dab03dc0c0b9e8cce09a8145b16b7683244cf17804',
    archiveBytes: 430080,
    executableBytes: 419388
});
const DOWNLOAD_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
const REDIRECTS = [301, 302, 303, 307, 308];

const APP_ID = /^[1-9][0-9]{0,9}$/;
const STEAM_HOMES = ['.local/share/Steam', '.steam/steam', '.steam/root'];
const FLATPAK_STEAM_HOME = '.var/app/com.valvesoftware.Steam/.local/share/Steam';
const UNSAFE_KEYS = ['__proto__', 'prototype', 'constructor'];
const STEAM_ID_BASE = 76561197960265728n;

// UMU download

function hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function isAllowedDownload(url) {
    return url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        DOWNLOAD_HOSTS.has(url.hostname);
}

function downloadArchive(release, { get = https.get, timeoutMs = 60000, onProgress = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        let request;
        let response;
        let finished = false;
        const timer = setTimeout(() => finish(new Error('UMU download timed out')), timeoutMs);

        function finish(error, data) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (!error) {
                resolve(data);
                return;
            }
            response?.destroy();
            request?.destroy();
            reject(error);
        }

        function receive(res) {
            const chunks = [];
            let size = 0;
            res.on('data', chunk => {
                if (finished) return;
                size += chunk.length;
                if (size > release.archiveBytes) {
                    finish(new Error('UMU archive size limit exceeded'));
                    return;
                }
                chunks.push(chunk);
                try {
                    onProgress(size / release.archiveBytes);
                } catch (error) {
                    finish(error);
                }
            });
            res.on('end', () => {
                if (finished) return;
                if (size !== release.archiveBytes) {
                    finish(new Error('UMU archive size mismatch'));
                    return;
                }
                finish(null, Buffer.concat(chunks));
            });
        }

        function respond(res, url, redirects) {
            if (finished) {
                res.destroy();
                return;
            }
            response = res;
            res.on('error', error => finish(error));
            if (REDIRECTS.includes(res.statusCode)) {
                if (!res.headers.location || redirects >= 5) {
                    finish(new Error('UMU redirect limit exceeded'));
                    return;
                }
                res.destroy();
                try {
                    visit(new URL(res.headers.location, url).href, redirects + 1);
                } catch (error) {
                    finish(error);
                }
                return;
            }
            res.on('aborted', () => finish(new Error('UMU download interrupted')));
            if (res.statusCode !== 200) {
                finish(new Error(`UMU download HTTP ${res.statusCode}`));
                return;
            }
            const declared = res.headers['content-length'];
            if (declared !== undefined && Number(declared) !== release.archiveBytes) {
                finish(new Error('UMU archive size mismatch'));
                return;
            }
            receive(res);
        }

        function visit(address, redirects) {
            try {
                const url = new URL(address);
                if (!isAllowedDownload(url)) throw new Error('UMU download destination is not allowed');
                const headers = { 'User-Agent': 'Deltamod', Accept: 'application/octet-stream' };
                request = get(url, { headers }, res => respond(res, url, redirects));
                request.on('error', error => finish(error));
            } catch (error) {
                finish(error);
            }
        }

        visit(release.url, 0);
    });
}

// UMU archive

function tarString(header, start, length) {
    return header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
}

function tarOctal(header, start, length) {
    const value = tarString(header, start, length).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error('Invalid UMU archive numeric field');
    return parseInt(value, 8);
}

// The checksum field itself counts as eight spaces.
function tarChecksum(header) {
    return header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
}

// Returns the verified umu-run bytes; the archive must hold exactly the three official members.
function readArchive(archive, release) {
    if (archive.length !== release.archiveBytes || hash(archive) !== release.sha256) {
        throw new Error('UMU archive checksum mismatch');
    }
    let offset = 0;
    let executable;
    const members = new Set();
    while (offset + 512 <= archive.length) {
        const header = archive.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) {
            if (archive.length - offset < 1024 || archive.subarray(offset).some(byte => byte !== 0)) {
                throw new Error('Invalid UMU archive ending');
            }
            if (members.size !== 3 || !executable) throw new Error('Missing UMU archive member');
            return Buffer.from(executable);
        }
        if (tarOctal(header, 148, 8) !== tarChecksum(header) || tarString(header, 257, 5) !== 'ustar' || tarString(header, 345, 155)) {
            throw new Error('Invalid UMU archive header');
        }
        const name = tarString(header, 0, 100);
        const size = tarOctal(header, 124, 12);
        const type = String.fromCharCode(header[156]);
        const link = tarString(header, 157, 100);
        if (members.has(name)) throw new Error('Duplicate UMU archive member');
        members.add(name);
        const end = offset + 512 + size;
        if (end > archive.length) throw new Error('Truncated UMU archive');

        const isFolder = name === 'umu/' && type === '5' && size === 0 && !link;
        const isExecutable = name === 'umu/umu-run' && ['0', '\0'].includes(type) && !link && size === release.executableBytes;
        // The official alias is metadata only; no archive links reach disk.
        const isAlias = name === 'umu/umu_run.py' && type === '2' && size === 0 && link === 'umu-run';
        if (isExecutable) {
            executable = archive.subarray(offset + 512, end);
            if (hash(executable) !== release.executableSha256) throw new Error('UMU executable checksum mismatch');
        } else if (!isFolder && !isAlias) {
            throw new Error(`Unexpected UMU archive member: ${name}`);
        }
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    throw new Error('Truncated UMU archive ending');
}

// Managed UMU runtime

function probeExecutable(file, args) {
    const env = { ...process.env, PYTHONNOUSERSITE: '1', UMU_LOG: '0' };
    delete env.PYTHONPATH;
    delete env.PYTHONHOME;
    const options = { env, timeout: 8000, killSignal: 'SIGKILL', maxBuffer: 8192, windowsHide: true };
    return new Promise((resolve, reject) => {
        execFile(file, args, options, (error, stdout) => {
            if (error) reject(new Error(`UMU prerequisite/version probe failed: ${error.message}`));
            else resolve(stdout.trim());
        });
    });
}

function ownedEntry(filename, isDirectory) {
    const stat = fs.lstatSync(filename);
    const expectedType = isDirectory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1;
    if (stat.isSymbolicLink() || !expectedType) throw new Error(`Unsafe managed UMU path: ${filename}`);
    if (process.platform !== 'win32' && (stat.uid !== process.getuid() || (stat.mode & 0o022))) {
        throw new Error(`Managed UMU path must be owned by you and not writable by others: ${filename}`);
    }
    return stat;
}

function runtimeContext({ userData, release = RELEASE, get, probe = probeExecutable, pathEnv = process.env.PATH || '', timeoutMs } = {}) {
    if (!path.isAbsolute(userData) || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(release.version)) {
        throw new Error('Invalid managed UMU location/version');
    }
    const parent = path.join(userData, 'runtimes', 'umu');
    const versionRoot = path.join(parent, release.version);
    const destination = path.join(versionRoot, 'umu-run');
    return { userData, release, get, probe, pathEnv, timeoutMs, parent, versionRoot, destination };
}

// Returns false when a runtime directory is missing and create is off.
function prepareDirectories(u, create) {
    ownedEntry(u.userData, true);
    for (const folder of [path.dirname(u.parent), u.parent]) {
        try {
            ownedEntry(folder, true);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            if (!create) return false;
            fs.mkdirSync(folder, { mode: 0o700 });
            ownedEntry(folder, true);
        }
    }
    return true;
}

async function verifyUmu(u, file, managed = false) {
    if (managed) {
        ownedEntry(u.versionRoot, true);
        const stat = ownedEntry(file, false);
        if (stat.size !== u.release.executableBytes || hash(fs.readFileSync(file)) !== u.release.executableSha256) {
            throw new Error('Managed UMU checksum mismatch; choose an installed executable or review the managed installation');
        }
    } else if (!fs.statSync(file).isFile()) {
        throw new Error('UMU must be a regular executable');
    }
    fs.accessSync(file, fs.constants.R_OK | fs.constants.X_OK);
    const output = await u.probe(file, ['--version']);
    const match = /^umu-launcher version (\d+\.\d+\.\d+)\b/.exec(output);
    if (!match || (managed && match[1] !== u.release.version)) throw new Error('UMU version probe returned an unexpected result');
    return file;
}

async function findUmu(u) {
    const folders = u.pathEnv.split(path.delimiter).filter(folder => path.isAbsolute(folder)).slice(0, 64);
    const candidates = new Set(folders.map(folder => path.join(folder, 'umu-run')));
    for (const candidate of candidates) {
        try {
            fs.accessSync(candidate, fs.constants.R_OK | fs.constants.X_OK);
            return await verifyUmu(u, fs.realpathSync(candidate));
        } catch {
            // An unusable PATH entry falls through to the next candidate.
        }
    }
    if (prepareDirectories(u, false) && fs.existsSync(u.versionRoot)) return verifyUmu(u, u.destination, true);
    return null;
}

async function requirePython(u) {
    try {
        const version = await u.probe('python3', ['-I', '-c', 'import sys; print("%d.%d" % sys.version_info[:2])']);
        const match = /^(\d+)\.(\d+)$/.exec(version);
        const major = match ? Number(match[1]) : 0;
        const minor = match ? Number(match[2]) : 0;
        if (!match || major < 3 || (major === 3 && minor < 10)) throw new Error('Unsupported Python version');
    } catch (error) {
        throw new Error(`UMU setup requires Python 3.10 or newer. Install Python through your distribution, or choose an installed UMU. ${error.message}`);
    }
}

async function installRuntime(settings, onProgress) {
    const u = runtimeContext(settings);
    prepareDirectories(u, true);
    const lock = path.join(u.parent, 'install.lock');
    try {
        fs.mkdirSync(lock, { mode: 0o700 });
    } catch (error) {
        if (error.code === 'EEXIST') {
            throw new Error('UMU installation lock exists; setup may be in progress. Review inactive setup state before retrying.');
        }
        throw error;
    }
    let temporary;
    try {
        if (fs.existsSync(u.versionRoot)) return await verifyUmu(u, u.destination, true);
        await requirePython(u);
        const archive = await downloadArchive(u.release, { get: u.get, timeoutMs: u.timeoutMs, onProgress });
        const executable = readArchive(archive, u.release);

        temporary = fs.mkdtempSync(path.join(u.parent, '.install-'));
        fs.chmodSync(temporary, 0o700);
        const staged = path.join(temporary, 'umu-run');
        fs.writeFileSync(staged, executable, { flag: 'wx', mode: 0o700 });
        const result = await u.probe(staged, ['--version']);
        if (!new RegExp(`^umu-launcher version ${u.release.version.replaceAll('.', '\\.')}\\b`).test(result)) {
            throw new Error('UMU version probe returned an unexpected result');
        }
        ownedEntry(temporary, true);
        ownedEntry(staged, false);
        if (fs.existsSync(u.versionRoot)) throw new Error('Managed UMU destination appeared during installation');
        fs.renameSync(temporary, u.versionRoot);
        temporary = null;
        return u.destination;
    } finally {
        if (temporary) {
            ownedEntry(temporary, true);
            fs.unlinkSync(path.join(temporary, 'umu-run'));
            fs.rmdirSync(temporary);
        }
        fs.rmdirSync(lock);
    }
}

async function selectRuntime(settings, { dialog, progress = () => ({ update() {}, close() {} }) }) {
    const u = runtimeContext(settings);
    const version = u.release.version;
    let available;
    let warning = '';
    try {
        available = await findUmu(u);
    } catch (error) {
        warning = `\n\nExisting setup needs review: ${error.message}`;
    }
    const { response } = await dialog.showMessageBox({
        type: 'question',
        title: 'UMU setup',
        message: available
            ? `Use detected UMU?\n${available}`
            : `Download official UMU ${version}? Requires Python 3.10 or newer. Deltamod verifies the download and stores it in its own data directory. No administrator access or system changes.${warning}`,
        buttons: [available ? 'Use detected UMU' : `Download UMU ${version}`, 'Choose executable', 'Cancel'],
        defaultId: 0,
        cancelId: 2
    });
    if (response !== 0 && response !== 1) return null;
    if (response === 1) {
        const selected = await dialog.showOpenDialog({ title: 'Select installed umu-run executable', properties: ['openFile'] });
        if (selected.canceled || !selected.filePaths[0]) return null;
        return verifyUmu(u, path.resolve(selected.filePaths[0]));
    }
    if (available) return available;
    const modal = progress();
    try {
        return await installRuntime(settings, value => modal.update(value));
    } finally {
        modal.close();
    }
}

// Steam metadata

function readMetadata(file, limit = 1024 * 1024) {
    let fd;
    try {
        // Non-blocking open so a FIFO in place of a metadata file fails instead of hanging.
        fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > limit) throw new Error('Steam metadata is not a bounded regular file');
        const data = Buffer.alloc(stat.size + 1);
        let size = 0;
        while (size < data.length) {
            const count = fs.readSync(fd, data, size, data.length - size, null);
            if (!count) break;
            size += count;
        }
        if (size !== stat.size) throw new Error('Steam metadata changed while reading');
        return data.subarray(0, size);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

function createFields() {
    return { values: Object.create(null), seen: Object.create(null) };
}

// Steam keys are case-insensitive, so a case-folded duplicate is ambiguous.
function addField(object, key, value) {
    if (!key || key.length > 1024 || UNSAFE_KEYS.includes(key.toLowerCase())) throw new Error('Unsafe Steam metadata key');
    const folded = key.toLowerCase();
    if (Object.hasOwn(object.seen, folded)) throw new Error('Ambiguous duplicate Steam metadata key');
    object.seen[folded] = true;
    object.values[key] = value;
}

function lookup(object, key) {
    if (!object || typeof object !== 'object') return undefined;
    return Object.entries(object).find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1];
}

// Parses Steam's text KeyValues format (VDF/ACF) with size and depth limits.
function parseText(data) {
    if (!data) return Object.create(null);
    const text = data.toString('utf8').replace(/^﻿/, '');
    let cursor = 0;
    let tokens = 0;

    function skipSpaceAndComments() {
        while (cursor < text.length) {
            if (/\s/.test(text[cursor])) {
                cursor++;
            } else if (text.startsWith('//', cursor)) {
                const end = text.indexOf('\n', cursor);
                cursor = end < 0 ? text.length : end + 1;
            } else {
                break;
            }
        }
    }

    function quoted() {
        let value = '';
        cursor++;
        while (cursor < text.length && text[cursor] !== '"') {
            if (text[cursor] === '\\') cursor++;
            if (cursor === text.length) throw new Error('Truncated Steam text string');
            value += text[cursor++];
        }
        if (text[cursor++] !== '"') throw new Error('Truncated Steam text string');
        return value;
    }

    function bare() {
        const start = cursor;
        while (cursor < text.length && !/[\s{}"]/.test(text[cursor])) cursor++;
        const value = text.slice(start, cursor);
        if (!value || value.length > 16384) throw new Error('Invalid Steam text token');
        return value;
    }

    function token() {
        skipSpaceAndComments();
        if (cursor === text.length) return null;
        if (++tokens > 100000) throw new Error('Steam text metadata has too many tokens');
        if ('{}'.includes(text[cursor])) return { brace: text[cursor++] };
        return { value: text[cursor] === '"' ? quoted() : bare() };
    }

    function object(depth, nested) {
        if (depth > 32) throw new Error('Steam text metadata is too deeply nested');
        const result = createFields();
        for (;;) {
            const key = token();
            if (key === null) {
                if (nested) throw new Error('Truncated Steam text metadata');
                return result.values;
            }
            if (key.brace === '}') {
                if (!nested) throw new Error('Unexpected Steam metadata closing brace');
                return result.values;
            }
            const value = token();
            if (key.value === undefined || !value || value.brace === '}') throw new Error('Invalid Steam text metadata');
            addField(result, key.value, value.brace === '{' ? object(depth + 1, true) : value.value);
        }
    }

    const result = object(0, false);
    if (Object.keys(result).length !== 1) throw new Error('Steam text metadata must have one root');
    return result;
}

// Reads Steam's binary appinfo.vdf (v28 or v29) and returns every declared compat tool.
function parseAppinfo(data) {
    if (!data) return [];
    const magic = data.readUInt32LE(0);
    if (![0x07564428, 0x07564429].includes(magic)) throw new Error('Unsupported Steam appinfo format');
    const version29 = magic === 0x07564429;
    const tableOffset = version29 ? Number(data.readBigUInt64LE(8)) : data.length;
    if (!Number.isSafeInteger(tableOffset) || tableOffset < (version29 ? 20 : 12) || tableOffset > data.length) {
        throw new Error('Invalid Steam appinfo key table');
    }
    let cursor = version29 ? 16 : 8;
    const keys = [];

    function cstring(position, end) {
        const zero = data.indexOf(0, position);
        if (zero < position || zero >= end || zero - position > 1024 * 1024) throw new Error('Invalid Steam appinfo string');
        return [data.toString('utf8', position, zero), zero + 1];
    }

    // v29 stores field names once in a trailing table and refers to them by index.
    if (version29) {
        let position = tableOffset;
        const count = data.readUInt32LE(position);
        position += 4;
        if (count > 131072) throw new Error('Steam appinfo key table is too large');
        for (let i = 0; i < count; i++) {
            const [key, next] = cstring(position, data.length);
            keys.push(key);
            position = next;
        }
        if (position !== data.length) throw new Error('Unexpected Steam appinfo key table data');
    }

    let nodes = 0;
    function binary(end, depth) {
        if (depth > 32) throw new Error('Steam appinfo is too deeply nested');
        const result = createFields();
        function take(size) {
            if (cursor + size > end) throw new Error('Truncated Steam appinfo field');
            const position = cursor;
            cursor += size;
            return position;
        }
        while (cursor < end) {
            const type = data[take(1)];
            if (type === 8) return result.values;
            if (++nodes > 1000000) throw new Error('Steam appinfo has too many fields');
            let key;
            if (version29) {
                const index = data.readUInt32LE(take(4));
                if (index >= keys.length) throw new Error('Invalid Steam appinfo key index');
                key = keys[index];
            } else {
                [key, cursor] = cstring(cursor, end);
            }
            let value;
            if (type === 0) value = binary(end, depth + 1);
            else if (type === 1) [value, cursor] = cstring(cursor, end);
            else if ([2, 3, 4, 6].includes(type)) value = data.readUInt32LE(take(4));
            else if ([7, 10].includes(type)) value = data.readBigUInt64LE(take(8)).toString();
            else throw new Error('Unsupported Steam appinfo field type');
            addField(result, key, value);
        }
        throw new Error('Unterminated Steam appinfo object');
    }

    const tools = [];
    let records = 0;
    while (cursor < tableOffset - 4) {
        if (++records > 100000 || cursor + 68 > tableOffset - 4) throw new Error('Invalid Steam appinfo record');
        const appid = data.readUInt32LE(cursor);
        const size = data.readUInt32LE(cursor + 4);
        const end = cursor + 8 + size;
        if (!appid || size < 60 || end > tableOffset - 4) throw new Error('Invalid Steam appinfo record size');
        cursor += 68;
        const section = binary(end, 0);
        if (cursor !== end) throw new Error('Unexpected Steam appinfo record data');
        const declarations = lookup(lookup(lookup(section, 'appinfo'), 'extended'), 'compat_tools');
        if (declarations && typeof declarations === 'object') {
            for (const [key, entry] of Object.entries(declarations)) tools.push({ key, entry });
        }
    }
    if (cursor !== tableOffset - 4 || data.readUInt32LE(cursor) !== 0) throw new Error('Invalid Steam appinfo terminator');
    return tools;
}

// Steam folders

function realDirectory(file) {
    try {
        const canonical = fs.realpathSync(file);
        return fs.statSync(canonical).isDirectory() ? canonical : null;
    } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
        throw error;
    }
}

function listDirectory(folder) {
    let handle;
    try {
        handle = fs.opendirSync(folder);
        const result = [];
        let entry;
        while ((entry = handle.readSync())) {
            if (result.length >= 1024) throw new Error('Steam directory has too many entries');
            result.push(entry);
        }
        return result;
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    } finally {
        if (handle) handle.closeSync();
    }
}

// discoverSteamGame's messages end with a period; both wordings are kept unchanged.
function steamLibraries(root, period = '') {
    const folders = lookup(parseText(readMetadata(path.join(root, 'steamapps/libraryfolders.vdf'))), 'libraryfolders') || {};
    if (Object.keys(folders).length > 64) throw new Error(`Too many Steam libraries${period}`);
    const libraries = [root];
    for (const entry of Object.values(folders)) {
        const folder = typeof entry === 'string' ? entry : lookup(entry, 'path');
        if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error(`Invalid Steam library path${period}`);
        const canonical = realDirectory(folder);
        if (canonical) libraries.push(canonical);
    }
    return [...new Set(libraries)];
}

function installDirectory(library, appid) {
    const manifest = lookup(parseText(readMetadata(path.join(library, 'steamapps', 'appmanifest_' + appid + '.acf'))), 'AppState');
    if (!manifest) return null;
    const name = lookup(manifest, 'installdir');
    const safeName = typeof name === 'string' && name && name !== '.' && name !== '..' && !/[\\/:]/.test(name);
    if (String(lookup(manifest, 'appid')) !== appid || !safeName) throw new Error('Unsafe Steam app manifest installation path');
    return { directory: realDirectory(path.join(library, 'steamapps/common', name)), name: lookup(manifest, 'name') };
}

function cleanName(value, length) {
    return String(value).replace(/[\x00-\x1f]/g, '').slice(0, length);
}

// Proton discovery

function protonDirectory(folder) {
    const resolved = realDirectory(folder);
    if (!resolved || !fs.statSync(path.join(resolved, 'proton')).isFile()) throw new Error('Selected Proton is not installed');
    fs.accessSync(path.join(resolved, 'proton'), fs.constants.R_OK | fs.constants.X_OK);
    return resolved;
}

function protonSteamInstallation(home, steamRoot, appid, sourcePath) {
    const homes = [...STEAM_HOMES, FLATPAK_STEAM_HOME].map(relative => path.join(home, relative));
    const roots = [...new Set([steamRoot, ...homes].filter(Boolean).map(realDirectory).filter(Boolean))]
        .filter(root => realDirectory(path.join(root, 'steamapps')));
    if (!roots.length) throw new Error('Steam installation was not found');
    const installations = roots.map(root => ({ root, libraries: steamLibraries(root) }));
    let matches = installations;
    if (appid && sourcePath) {
        const source = realDirectory(sourcePath);
        matches = installations.filter(installation =>
            installation.libraries.some(library => installDirectory(library, appid)?.directory === source && source));
    }
    if (matches.length !== 1) throw new Error('Steam installation is missing or ambiguous for this import');
    return matches[0];
}

function isToolKey(key) {
    return typeof key === 'string' && key.length > 0 && key.length <= 256 && !/[\x00-\x1f]/.test(key);
}

// A game-specific compat tool mapping wins over the global default (app 0).
function configuredTool(root, appid) {
    const config = parseText(readMetadata(path.join(root, 'config/config.vdf')));
    const steam = lookup(lookup(lookup(lookup(config, 'InstallConfigStore'), 'Software'), 'Valve'), 'Steam');
    const mappings = lookup(steam, 'CompatToolMapping');
    const gameName = lookup(appid ? lookup(mappings, appid) : undefined, 'name');
    const key = gameName || lookup(lookup(mappings, '0'), 'name');
    if (!isToolKey(key)) throw new Error('No explicit Proton selection is configured in Steam');
    return { key, source: gameName ? 'game' : 'global' };
}

function isSafeInstallPath(installPath) {
    return typeof installPath === 'string' &&
        installPath.length > 0 &&
        (path.isAbsolute(installPath) || !installPath.split(/[\\/]/).includes('..'));
}

function customTools(root, key) {
    const customRoot = path.join(root, 'compatibilitytools.d');
    const manifests = [];
    for (const entry of listDirectory(customRoot)) {
        if (entry.name === 'compatibilitytool.vdf') {
            manifests.push({ file: path.join(customRoot, entry.name), base: customRoot });
        } else if (entry.isDirectory() || entry.isSymbolicLink()) {
            const base = path.join(customRoot, entry.name);
            manifests.push({ file: path.join(base, 'compatibilitytool.vdf'), base });
        }
    }
    const found = [];
    for (const manifest of manifests) {
        const declarations = lookup(lookup(parseText(readMetadata(manifest.file)), 'compatibilitytools'), 'compat_tools') || {};
        for (const [name, tool] of Object.entries(declarations)) {
            if (name !== key) continue;
            const installPath = lookup(tool, 'install_path');
            if (!isSafeInstallPath(installPath)) throw new Error('Unsafe custom Proton installation path');
            found.push({ proton: protonDirectory(path.resolve(manifest.base, installPath)), name: lookup(tool, 'display_name') || key });
        }
    }
    return found;
}

function toolAliases(tool) {
    return String(lookup(tool.entry, 'aliases') || '').split(',').map(name => name.trim());
}

function officialTools(root, libraries, key) {
    const official = parseAppinfo(readMetadata(path.join(root, 'appcache/appinfo.vdf'), 64 * 1024 * 1024));
    const exact = official.filter(tool => tool.key === key);
    const selected = exact.length ? exact : official.filter(tool => toolAliases(tool).includes(key));
    const found = [];
    for (const tool of selected) {
        const id = String(lookup(tool.entry, 'appid'));
        if (!APP_ID.test(id)) throw new Error('Invalid Steam tool app ID');
        for (const library of libraries) {
            const installed = installDirectory(library, id);
            if (installed?.directory) found.push({ proton: protonDirectory(installed.directory), name: installed.name || key });
        }
    }
    return found;
}

// Returns the Proton build Steam would use, or { reason } explaining why none was resolved.
function discoverProton({ home = os.homedir(), appid, sourcePath, steamRoot } = {}) {
    try {
        if (appid !== undefined && !APP_ID.test(String(appid))) throw new Error('Invalid Steam game app ID');
        appid = appid === undefined ? undefined : String(appid);
        const { root, libraries } = protonSteamInstallation(home, steamRoot, appid, sourcePath);
        const { key, source } = configuredTool(root, appid);
        // Custom registrations can override Valve names; never silently select a second identity.
        const found = [...customTools(root, key), ...officialTools(root, libraries, key)];
        const unique = [...new Map(found.map(tool => [tool.proton, tool])).values()];
        if (unique.length !== 1) {
            throw new Error(unique.length
                ? 'Selected Steam Proton has multiple ambiguous installations'
                : 'Selected Steam Proton could not be resolved to an installed build');
        }
        const tool = unique[0];
        return { ...tool, name: cleanName(tool.name, 256), key, source, root };
    } catch (error) {
        return { reason: error.message };
    }
}

async function selectProton({ dialog, ...options }) {
    const detected = discoverProton(options);
    const available = !!detected.proton;
    let selection = 'Steam Proton could not be detected';
    if (available) {
        selection = detected.source === 'game' ? 'Steam game-specific selection' : 'Steam global default (not a game-specific selection)';
    }
    const { response } = await dialog.showMessageBox({
        type: 'question',
        title: 'Proton selection',
        message: available
            ? `${selection}: ${detected.name}\n${detected.proton}\n\nThis profile keeps a fixed path and will not track later Steam selection changes. Steam prefixes and saves are not reused.`
            : `${selection}.\n${detected.reason}\n\nChoose an installed Proton directory manually.`,
        buttons: available ? ['Use detected Proton', 'Choose directory', 'Cancel'] : ['Choose directory', 'Cancel'],
        defaultId: 0,
        cancelId: available ? 2 : 1
    });
    const chooseButton = available ? 1 : 0;
    if (available && response === 0) return protonDirectory(detected.proton);
    if (response !== chooseButton) return null;
    const selected = await dialog.showOpenDialog({ title: 'Select installed Proton directory (contains proton)', properties: ['openDirectory'] });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return protonDirectory(path.resolve(selected.filePaths[0]));
}

// Steam game discovery

// Steam's 32-bit account ID is the 64-bit SteamID minus the individual-account base.
function accountNumber(steamId) {
    if (!/^7656119[0-9]{10}$/.test(steamId)) throw new Error('Unsupported Steam account identity.');
    const number = BigInt(steamId) - STEAM_ID_BASE;
    if (number <= 0n || number > 4294967295n) throw new Error('Unsupported Steam account identity.');
    return String(number);
}

function steamAccounts(root) {
    const users = lookup(parseText(readMetadata(path.join(root, 'config/loginusers.vdf'))), 'users');
    if (!users || typeof users !== 'object' || Object.keys(users).length > 64) {
        throw new Error('Supported Steam account metadata was not found. Sign in to Steam first.');
    }
    const accounts = [];
    for (const [steamId, value] of Object.entries(users)) {
        const account = accountNumber(steamId);
        if (!fs.existsSync(path.join(root, 'userdata', account, 'config/localconfig.vdf'))) continue;
        accounts.push({ account, name: cleanName(lookup(value, 'PersonaName') || account, 80) });
    }
    if (!accounts.length) throw new Error('No initialized Steam account settings were found.');
    return accounts;
}

function discoverSteamGame({ home = os.homedir(), steamRoot, appid, sourcePath }) {
    if (!APP_ID.test(String(appid))) throw new Error('A verified Steam game app ID is required.');
    const source = realDirectory(sourcePath);
    if (!source) throw new Error('Steam game installation is missing.');
    const candidates = steamRoot ? [steamRoot] : STEAM_HOMES.map(relative => path.join(home, relative));
    const matches = [];
    for (const root of [...new Set(candidates.map(realDirectory).filter(Boolean))]) {
        if (root.includes(path.join('.var', 'app', 'com.valvesoftware.Steam'))) {
            throw new Error('Flatpak Steam bridge visibility is not verified. Use UMU for now.');
        }
        const installed = steamLibraries(root, '.').filter(library => installDirectory(library, String(appid))?.directory === source);
        if (installed.length > 1) throw new Error('Ambiguous Steam game manifests.');
        if (installed.length) matches.push(root);
    }
    if (matches.length !== 1) throw new Error('Steam installation is missing or ambiguous for this game.');
    const root = matches[0];
    return { root, source, appid: String(appid), accounts: steamAccounts(root) };
}

module.exports = {
    downloadArchive,
    readArchive,
    installRuntime,
    selectRuntime,
    discoverProton,
    selectProton,
    discoverSteamGame
};
