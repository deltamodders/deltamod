const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const {
    downloadArchive,
    readArchive,
    installRuntime,
    selectRuntime,
    discoverProton,
    selectProton,
    discoverSteamGame
} = require('./ProtonSetup');

// Managed UMU runtime

function hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function tarEntry(name, data = Buffer.alloc(0), type = '0', link = '') {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000700\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write(link, 157, 100);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    return Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
}

function runtimeFixture(t, extra = {}) {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-umu-'));
    t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
    const payload = Buffer.from('#!/usr/bin/env python3\nprint("umu fixture")\n');
    const archive = Buffer.concat([
        tarEntry('umu/', Buffer.alloc(0), '5'), tarEntry('umu/umu-run', payload),
        tarEntry('umu/umu_run.py', Buffer.alloc(0), '2', 'umu-run'), Buffer.alloc(1024)
    ]);
    const release = { version: '1.4.4', url: 'https://github.com/example/umu.tar',
        sha256: hash(archive), executableSha256: hash(payload), archiveBytes: archive.length, executableBytes: payload.length };
    const requests = [];
    const probes = [];
    const get = (url, options, callback) => {
        requests.push(String(url));
        const request = new EventEmitter();
        request.destroy = () => {};
        queueMicrotask(() => {
            const response = new PassThrough();
            response.statusCode = 200;
            response.headers = { 'content-length': String(archive.length) };
            callback(response);
            response.end(archive);
        });
        return request;
    };
    const probe = async (file, args) => {
        probes.push({ file, args });
        return path.basename(file) === 'python3' ? '3.12' : 'umu-launcher version 1.4.4 (fixture)';
    };
    const options = { userData, release, get, probe, pathEnv: '', ...extra };
    return { userData, payload, archive, release, requests, probes, options,
        destination: path.join(userData, 'runtimes', 'umu', release.version, 'umu-run') };
}

test('verified download installs only the pinned regular executable and reuses it offline', async t => {
    const f = runtimeFixture(t);
    assert.equal(await installRuntime(f.options), f.destination);
    assert.deepEqual(fs.readFileSync(f.destination), f.payload);
    assert.deepEqual(fs.readdirSync(path.dirname(f.destination)), ['umu-run']);
    assert.equal(await installRuntime(f.options), f.destination);
    assert.equal(f.requests.length, 1);
    assert.ok(f.probes.some(x => x.args[0] === '--version'));
});

test('checksum mismatch refuses installation before executing downloaded bytes', async t => {
    const f = runtimeFixture(t);
    f.release.sha256 = '0'.repeat(64);
    await assert.rejects(installRuntime(f.options), /checksum/i);
    assert.equal(fs.existsSync(f.destination), false);
    assert.equal(f.probes.some(x => x.args[0] === '--version'), false);
});

test('missing or old Python fails before downloading', async t => {
    for (const result of ['3.9', '2.7', 'garbage', null]) {
        const f = runtimeFixture(t, { probe: async () => { if (result === null) throw new Error('ENOENT'); return result; } });
        await assert.rejects(installRuntime(f.options), /Python 3\.10/i);
        assert.equal(f.requests.length, 0);
    }
});

test('failed version probe leaves no promoted executable or installation lock', async t => {
    const f = runtimeFixture(t, { probe: async file => path.basename(file) === 'python3' ? '3.12' : 'not UMU' });
    await assert.rejects(installRuntime(f.options), /version/i);
    assert.equal(fs.existsSync(f.destination), false);
    assert.deepEqual(fs.readdirSync(path.dirname(path.dirname(f.destination))), []);
});

test('corrupt managed installation is not overwritten and older versions are retained', async t => {
    const f = runtimeFixture(t);
    fs.mkdirSync(path.dirname(f.destination), { recursive: true });
    fs.writeFileSync(f.destination, 'corrupted');
    const old = path.join(path.dirname(path.dirname(f.destination)), 'older');
    fs.mkdirSync(old);
    fs.writeFileSync(path.join(old, 'umu-run'), 'older working version');
    await assert.rejects(installRuntime(f.options), /managed|checksum/i);
    assert.equal(fs.readFileSync(f.destination, 'utf8'), 'corrupted');
    assert.equal(fs.readFileSync(path.join(old, 'umu-run'), 'utf8'), 'older working version');
    assert.equal(f.requests.length, 0);
});

test('concurrent setup refuses a second installer and releases only its own lock', async t => {
    const f = runtimeFixture(t);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const probe = async file => { if (path.basename(file) === 'python3') { await held; return '3.12'; } return 'umu-launcher version 1.4.4'; };
    const pending = installRuntime({ ...f.options, probe });
    await assert.rejects(installRuntime(f.options), /installation.*lock|setup.*progress/i);
    release();
    await pending;
    assert.equal(await installRuntime(f.options), f.destination);
});

test('cancel and manual selection do not download or create managed directories', async t => {
    const f = runtimeFixture(t);
    const dialog = { showMessageBox: async () => ({ response: 2 }), showOpenDialog: async () => ({ canceled: true }) };
    assert.equal(await selectRuntime(f.options, { dialog }), null);
    dialog.showMessageBox = async () => ({ response: 1 });
    assert.equal(await selectRuntime(f.options, { dialog }), null);
    assert.equal(f.requests.length, 0);
    assert.equal(fs.existsSync(path.join(f.userData, 'runtimes')), false);
    for (const response of [undefined, -1, 99]) {
        dialog.showMessageBox = async () => ({ response });
        assert.equal(await selectRuntime(f.options, { dialog }), null);
    }
});

test('installed runtime is preferred, validated and still allows manual selection', async t => {
    const f = runtimeFixture(t);
    const bin = path.join(f.userData, 'bin');
    fs.mkdirSync(bin);
    const installed = path.join(bin, 'umu-run');
    fs.writeFileSync(installed, 'installed');
    fs.chmodSync(installed, 0o755);
    const settings = { ...f.options, pathEnv: bin };
    assert.equal(await selectRuntime(settings, { dialog: { showMessageBox: async () => ({ response: 0 }) } }), installed);
    const manual = { showMessageBox: async () => ({ response: 1 }),
        showOpenDialog: async () => ({ canceled: false, filePaths: [installed] }) };
    assert.equal(await selectRuntime(settings, { dialog: manual }), installed);
    assert.equal(f.requests.length, 0);
});

test('download confirmation owns progress cleanup on success and failure', async t => {
    const f = runtimeFixture(t);
    let opened = 0;
    let closed = 0;
    const ui = { dialog: { showMessageBox: async () => ({ response: 0 }) },
        progress: () => { opened++; return { update() {}, close() { closed++; } }; } };
    assert.equal(await selectRuntime(f.options, ui), f.destination);
    assert.equal(opened, 1);
    assert.equal(closed, 1);
    const bad = runtimeFixture(t);
    bad.release.sha256 = '0'.repeat(64);
    await assert.rejects(selectRuntime(bad.options, ui), /checksum/i);
    assert.equal(opened, 2);
    assert.equal(closed, 2);
});

test('archive reader rejects traversal, links, duplicates, truncation and unexpected members', t => {
    const f = runtimeFixture(t);
    const ending = Buffer.alloc(1024);
    const directory = tarEntry('umu/', Buffer.alloc(0), '5');
    const executable = tarEntry('umu/umu-run', f.payload);
    const alias = tarEntry('umu/umu_run.py', Buffer.alloc(0), '2', 'umu-run');
    for (const entries of [
        [directory, tarEntry('../escape', f.payload), alias],
        [directory, tarEntry('/escape', f.payload), alias],
        [directory, tarEntry('umu/umu-run', f.payload, '2', '../../escape'), alias],
        [directory, tarEntry('umu/umu-run', f.payload, '1', 'outside'), alias],
        [directory, executable, executable, alias],
        [directory, executable, tarEntry('umu/umu_run.py', Buffer.alloc(0), '2', '../../outside')],
        [directory, executable], [directory, executable, alias, tarEntry('extra', f.payload)]
    ]) {
        const archive = Buffer.concat([...entries, ending]);
        assert.throws(() => readArchive(archive, { ...f.release, archiveBytes: archive.length, sha256: hash(archive) }), /archive/i);
    }
    for (const archive of [f.archive.subarray(0, f.archive.length - 1024), Buffer.concat([f.archive, Buffer.from('not padding')])]) {
        assert.throws(() => readArchive(archive, { ...f.release, archiveBytes: archive.length, sha256: hash(archive) }), /archive/i);
    }
    const broken = Buffer.from(f.archive);
    broken[10] ^= 1;
    assert.throws(() => readArchive(broken, { ...f.release, sha256: hash(broken) }), /header/i);
    assert.throws(() => readArchive(f.archive, { ...f.release, executableSha256: '0'.repeat(64) }), /executable checksum/i);
});

function transport(steps, calls = []) {
    return (url, options, callback) => {
        calls.push(String(url));
        const req = new EventEmitter();
        req.destroy = () => {};
        const step = steps.shift();
        queueMicrotask(() => {
            if (step.error) { req.emit('error', new Error(step.error)); return; }
            if (step.stall) return;
            const res = new PassThrough();
            res.statusCode = step.status ?? 200;
            res.headers = step.headers || {};
            callback(res);
            if (step.abort) { res.emit('aborted'); return; }
            res.end(step.body || '');
        });
        return req;
    };
}

test('download allows the official asset redirect but refuses unsafe destinations and redirect loops', async t => {
    const f = runtimeFixture(t);
    const get = transport([{ status: 302, headers: { location: 'https://release-assets.githubusercontent.com/asset?token=fixture' } }, { body: f.archive }]);
    assert.deepEqual(await downloadArchive(f.release, { get }), f.archive);
    for (const location of ['http://github.com/asset', 'https://evil.invalid/asset', 'https://user:pass@github.com/a', 'https://github.com:444/a', 'file:///etc/passwd']) {
        const calls = [];
        await assert.rejects(downloadArchive(f.release, { get: transport([{ status: 302, headers: { location } }], calls) }), /not allowed/i);
        assert.equal(calls.length, 1);
    }
    await assert.rejects(downloadArchive(f.release, { get: transport(Array.from({ length: 6 }, () => ({ status: 302, headers: { location: '/again' } }))) }), /redirect limit/i);
});

test('download bounds bytes, HTTP errors, interrupted responses and total time', async t => {
    const f = runtimeFixture(t);
    for (const [step, expected] of [
        [{ status: 404 }, /HTTP 404/], [{ headers: { 'content-length': '99999999' } }, /size/],
        [{ body: Buffer.alloc(f.archive.length + 1) }, /size limit/], [{ body: 'short' }, /size mismatch/],
        [{ error: 'network unavailable' }, /network unavailable/], [{ abort: true }, /interrupted/], [{ stall: true }, /timed out/]
    ]) await assert.rejects(downloadArchive(f.release, { get: transport([step]), timeoutMs: 25 }), expected);
});

test('redirect responses are closed instead of draining an unbounded unused body', async t => {
    const f = runtimeFixture(t);
    let redirects = 0;
    let unused;
    const get = (url, options, callback) => {
        const request = new EventEmitter();
        request.destroy = () => {};
        queueMicrotask(() => {
            const response = new PassThrough();
            if (redirects++ === 0) {
                unused = response;
                response.statusCode = 302;
                response.headers = { location: 'https://release-assets.githubusercontent.com/asset' };
                callback(response);
            } else {
                response.statusCode = 200;
                response.headers = {};
                callback(response);
                response.end(f.archive);
            }
        });
        return request;
    };
    t.after(() => unused?.destroy());
    await downloadArchive(f.release, { get });
    assert.equal(unused.destroyed, true);
});

test('failed transfers and stale locks never replace a prior version or execute payloads', async t => {
    const f = runtimeFixture(t);
    const old = path.join(f.userData, 'runtimes', 'umu', '1.0.0');
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, 'umu-run'), 'preserve');
    const settings = { ...f.options, get: transport([{ status: 503 }]) };
    await assert.rejects(installRuntime(settings), /HTTP 503/);
    assert.equal(fs.readFileSync(path.join(old, 'umu-run'), 'utf8'), 'preserve');
    assert.equal(fs.existsSync(f.destination), false);
    assert.equal(f.probes.some(x => x.args[0] === '--version'), false);
    fs.mkdirSync(path.join(f.userData, 'runtimes', 'umu', 'install.lock'));
    await assert.rejects(installRuntime(f.options), /installation lock/i);
    assert.equal(fs.existsSync(path.join(f.userData, 'runtimes', 'umu', 'install.lock')), true);
});

test('managed storage refuses unsafe links, hardlinks and writable paths on Linux', { skip: process.platform !== 'linux' }, async t => {
    for (const kind of ['parent-link', 'version-link', 'file-link', 'hardlink', 'writable-directory', 'writable-file']) {
        const f = runtimeFixture(t);
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-umu-outside-'));
        t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
        fs.writeFileSync(path.join(outside, 'sentinel'), 'untouched');
        if (kind === 'parent-link') fs.symlinkSync(outside, path.join(f.userData, 'runtimes'));
        else {
            fs.mkdirSync(path.dirname(path.dirname(f.destination)), { recursive: true });
            if (kind === 'version-link') fs.symlinkSync(outside, path.dirname(f.destination));
            else {
                fs.mkdirSync(path.dirname(f.destination));
                if (kind === 'file-link') fs.symlinkSync(path.join(outside, 'sentinel'), f.destination);
                else if (kind === 'hardlink') fs.linkSync(path.join(outside, 'sentinel'), f.destination);
                else {
                    fs.writeFileSync(f.destination, f.payload, { mode: 0o700 });
                    fs.chmodSync(kind === 'writable-file' ? f.destination : path.dirname(f.destination), 0o777);
                }
            }
        }
        await assert.rejects(installRuntime(f.options), /unsafe|writable|managed/i);
        assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'untouched');
        assert.equal(f.requests.length, 0);
    }
});

test('real version probes are bounded and reject failing executables', { skip: process.platform !== 'linux' }, async t => {
    const f = runtimeFixture(t);
    const executable = path.join(f.userData, 'fixture');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 7\n', { mode: 0o700 });
    const settings = { userData: f.userData, pathEnv: '' };
    const dialog = { showMessageBox: async () => ({ response: 1 }),
        showOpenDialog: async () => ({ canceled: false, filePaths: [executable] }) };
    await assert.rejects(selectRuntime(settings, { dialog }), /probe failed/);
    fs.writeFileSync(executable, '#!/bin/sh\nexec sleep 30\n');
    await assert.rejects(selectRuntime(settings, { dialog }), /probe failed/);
});

test('read-only managed storage fails without networking or touching other files', { skip: process.platform !== 'linux' }, async t => {
    const f = runtimeFixture(t);
    fs.chmodSync(f.userData, 0o500);
    try {
        await assert.rejects(installRuntime(f.options), { code: 'EACCES' });
        assert.equal(f.requests.length, 0);
        assert.equal(fs.existsSync(f.destination), false);
    } finally { fs.chmodSync(f.userData, 0o700); }
});

// Steam Proton and game discovery

test('Steam-managed identity binds the manifest source and offers initialized accounts without guessing most recent', t => {
    const f = steamFixture(t);
    const root = f.root();
    const source = f.game(root);
    f.write(path.join(root, 'config/loginusers.vdf'), '"users" { "76561197960278073" { "PersonaName" "First" "MostRecent" "0" } "76561197960289184" { "PersonaName" "Second" "MostRecent" "1" } }');
    for (const account of ['12345', '23456']) f.write(path.join(root, 'userdata', account, 'config/localconfig.vdf'), '"UserLocalConfigStore" {}');
    const result = discoverSteamGame({ home: f.home, appid: '123', sourcePath: source });
    assert.deepEqual(result.accounts, [{ account: '12345', name: 'First' }, { account: '23456', name: 'Second' }]);
    assert.equal(result.root, fs.realpathSync(root));
    assert.throws(() => discoverSteamGame({ home: f.home, appid: '999', sourcePath: source }), /missing or ambiguous/);
    f.write(path.join(root, 'config/loginusers.vdf'), '"users" { "invalid" {} }');
    assert.throws(() => discoverSteamGame({ home: f.home, appid: '123', sourcePath: source }), /identity/);
});

function steamFixture(t) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-steam-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    function write(file, data) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, data);
        return file;
    }
    function root(relative = '.local/share/Steam') {
        const directory = path.join(home, relative);
        fs.mkdirSync(path.join(directory, 'steamapps'), { recursive: true });
        return directory;
    }
    function config(directory, mappings) {
        const entries = Object.entries(mappings).map(([id, name]) => `"${id}" { "name" "${name}" }`).join('\n');
        write(path.join(directory, 'config/config.vdf'), `"InstallConfigStore" { "Software" { "Valve" { "Steam" { "CompatToolMapping" { ${entries} } } } } }`);
    }
    function runner(directory) {
        write(path.join(directory, 'proton'), 'not executable code; fixture only');
        fs.chmodSync(path.join(directory, 'proton'), 0o755);
        return fs.realpathSync(directory);
    }
    function custom(directory, key, folder = key, installPath = '.') {
        const tool = path.join(directory, 'compatibilitytools.d', folder);
        write(path.join(tool, 'compatibilitytool.vdf'), `"compatibilitytools" { "compat_tools" { "${key}" { "install_path" "${installPath.replaceAll('\\', '\\\\')}" "display_name" "Friendly Proton" "from_oslist" "windows" "to_oslist" "linux" } } }`);
        return runner(path.resolve(tool, installPath));
    }
    function game(directory, library = directory) {
        const source = path.join(library, 'steamapps/common/Game');
        write(path.join(source, 'DELTARUNE.exe'), 'original');
        write(path.join(library, 'steamapps/appmanifest_123.acf'), '"AppState" { "appid" "123" "installdir" "Game" }');
        write(path.join(directory, 'steamapps/libraryfolders.vdf'), `"libraryfolders" { "0" { "path" "${library.replaceAll('\\', '\\\\')}" } }`);
        return source;
    }
    return { home, write, root, config, runner, custom, game };
}

function appinfo(version, key = 'proton_test', appid = '999', aliases = '') {
    const keys = ['appinfo', 'appid', 'extended', 'compat_tools', key, 'aliases'];
    const keyBytes = name => version === 29 ? u32(keys.indexOf(name)) : Buffer.from(name + '\0');
    const field = (type, name, value) => Buffer.concat([Buffer.from([type]), keyBytes(name), value]);
    const str = (name, value) => field(1, name, Buffer.from(value + '\0'));
    const object = (name, children) => field(0, name, Buffer.concat([...children, Buffer.from([8])]));
    const payload = Buffer.concat([object('appinfo', [
        field(2, 'appid', u32(891390)),
        object('extended', [object('compat_tools', [object(key, [str('appid', appid), str('aliases', aliases)])])])
    ]), Buffer.from([8])]);
    const section = Buffer.alloc(68);
    section.writeUInt32LE(891390, 0);
    section.writeUInt32LE(payload.length + 60, 4);
    const header = Buffer.alloc(version === 29 ? 16 : 8);
    header.writeUInt32LE(version === 29 ? 0x07564429 : 0x07564428);
    header.writeUInt32LE(1, 4);
    const body = Buffer.concat([section, payload, u32(0)]);
    if (version === 28) return Buffer.concat([header, body]);
    header.writeBigUInt64LE(BigInt(header.length + body.length), 8);
    return Buffer.concat([header, body, u32(keys.length), ...keys.map(name => Buffer.from(name + '\0'))]);
}

test('bounded library, directory, and nesting limits refuse discovery without guessing', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    f.custom(root, 'custom');
    const libraries = path.join(root, 'steamapps/libraryfolders.vdf');
    f.write(libraries, '"libraryfolders" { ' + Array.from({ length: 65 }, (_, i) => `"${i}" "${f.home.replaceAll('\\', '\\\\')}"`).join(' ') + ' }');
    assert.match(discoverProton({ home: f.home }).reason, /too many Steam libraries/i);
    fs.unlinkSync(libraries);
    const config = path.join(root, 'config/config.vdf');
    f.write(config, '"root" { '.repeat(34) + '"value" "x"' + ' }'.repeat(34));
    assert.match(discoverProton({ home: f.home }).reason, /deeply nested/i);
    f.config(root, { 0: 'custom' });
    for (let i = 0; i < 1024; i++) f.write(path.join(root, 'compatibilitytools.d', 'entry-' + i), '');
    assert.match(discoverProton({ home: f.home }).reason, /too many entries/i);
});

test('custom and official registrations sharing one identity cannot select a different installed build', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'proton_test' });
    f.custom(root, 'proton_test');
    f.write(path.join(root, 'appcache/appinfo.vdf'), appinfo(29));
    f.write(path.join(root, 'steamapps/appmanifest_999.acf'), '"AppState" { "appid" "999" "installdir" "Official" "name" "Official Proton" }');
    f.runner(path.join(root, 'steamapps/common/Official'));
    assert.match(discoverProton({ home: f.home }).reason, /ambiguous/i);
});

test('game-specific confirmation revalidates a removed runner and manual cancellation returns no path', async t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 123: 'custom' });
    const proton = f.custom(root, 'custom');
    const sourcePath = f.game(root);
    const dialog = {
        showMessageBox: async message => {
            assert.match(message.message, /Steam game-specific selection/);
            fs.unlinkSync(path.join(proton, 'proton'));
            return { response: 0 };
        },
        showOpenDialog: async () => { throw new Error('Unexpected directory picker'); }
    };
    await assert.rejects(selectProton({ home: f.home, appid: '123', sourcePath, dialog }), /ENOENT|not installed/);
    f.runner(proton);
    dialog.showMessageBox = async () => ({ response: 1 });
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    assert.equal(await selectProton({ home: f.home, appid: '123', sourcePath, dialog }), null);
});

function u32(value) {
    const result = Buffer.alloc(4);
    result.writeUInt32LE(value);
    return result;
}

test('game-specific selection wins over global and resolves custom internal identity without folder guessing', t => {
    const f = steamFixture(t);
    const root = f.root();
    const sourcePath = f.game(root);
    f.config(root, { 0: 'default', 123: 'selected' });
    f.custom(root, 'default');
    const proton = f.custom(root, 'selected', 'unrelated-directory-name');
    const before = fs.readFileSync(path.join(root, 'config/config.vdf'));
    const result = discoverProton({ home: f.home, appid: '123', sourcePath });
    assert.equal(result.proton, proton);
    assert.equal(result.source, 'game');
    assert.equal(result.name, 'Friendly Proton');
    assert.equal(result.key, 'selected');
    assert.deepEqual(fs.readFileSync(path.join(root, 'config/config.vdf')), before);
});

test('global default is labeled separately and supported for a non-Steam import', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    const proton = f.custom(root, 'custom');
    const result = discoverProton({ home: f.home });
    assert.equal(result.proton, proton);
    assert.equal(result.source, 'global');
});

test('a missing explicit game selection never silently substitutes the global build', t => {
    const f = steamFixture(t);
    const root = f.root();
    const sourcePath = f.game(root);
    f.config(root, { 0: 'good', 123: 'missing' });
    f.custom(root, 'good');
    const result = discoverProton({ home: f.home, appid: '123', sourcePath });
    assert.equal(result.proton, undefined);
    assert.match(result.reason, /selected|installed|resolve/i);
});

for (const version of [28, 29]) {
    test(`official Proton resolves binary appinfo v${version} identity to an installed tool in another library`, t => {
        const f = steamFixture(t);
        const root = f.root();
        const library = f.root('other-library');
        const sourcePath = f.game(root, library);
        f.config(root, { 123: 'proton_test' });
        f.write(path.join(root, 'appcache/appinfo.vdf'), appinfo(version));
        f.write(path.join(library, 'steamapps/appmanifest_999.acf'), '"AppState" { "appid" "999" "installdir" "Arbitrary tool directory" "name" "Official Proton" }');
        const proton = f.runner(path.join(library, 'steamapps/common/Arbitrary tool directory'));
        const result = discoverProton({ home: f.home, appid: '123', sourcePath });
        assert.equal(result.proton, proton, result.reason);
        assert.equal(result.name, 'Official Proton');
        assert.equal(result.source, 'game');
    });
}

test('official aliases resolve exactly but never match a display-name substring', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'exact-alias' });
    f.write(path.join(root, 'appcache/appinfo.vdf'), appinfo(29, 'internal', '999', 'other,exact-alias'));
    f.write(path.join(root, 'steamapps/appmanifest_999.acf'), '"AppState" { "appid" "999" "installdir" "Proton" }');
    const proton = f.runner(path.join(root, 'steamapps/common/Proton'));
    assert.equal(discoverProton({ home: f.home }).proton, proton);
    f.config(root, { 0: 'alias' });
    assert.equal(discoverProton({ home: f.home }).proton, undefined);
});

test('source manifest selects the matching Flatpak root rather than an unrelated native installation', t => {
    const f = steamFixture(t);
    const native = f.root();
    f.config(native, { 123: 'native' });
    f.custom(native, 'native');
    const flatpak = f.root('.var/app/com.valvesoftware.Steam/.local/share/Steam');
    const sourcePath = f.game(flatpak);
    f.config(flatpak, { 123: 'flatpak' });
    const proton = f.custom(flatpak, 'flatpak');
    assert.equal(discoverProton({ home: f.home, appid: '123', sourcePath }).proton, proton);
    assert.equal(discoverProton({ home: f.home }).proton, undefined);
});

test('conflicting roots or duplicate tool identities require manual selection', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    f.custom(root, 'custom', 'first');
    f.custom(root, 'custom', 'second');
    const result = discoverProton({ home: f.home });
    assert.equal(result.proton, undefined);
    assert.match(result.reason, /ambiguous|multiple/i);
});

test('unsafe relative install paths and game/tool manifest escapes are refused', t => {
    for (const attack of ['../escape', '/absolute', 'nested/folder', 'C:\\escape']) {
        const f = steamFixture(t);
        const root = f.root();
        const sourcePath = f.game(root);
        f.config(root, { 123: 'official' });
        f.write(path.join(root, 'appcache/appinfo.vdf'), appinfo(28, 'official'));
        f.write(path.join(root, 'steamapps/appmanifest_999.acf'), `"AppState" { "appid" "999" "installdir" "${attack.replaceAll('\\', '\\\\')}" }`);
        assert.equal(discoverProton({ home: f.home, appid: '123', sourcePath }).proton, undefined);
    }
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'escape' });
    f.custom(root, 'escape', 'registered', '../outside');
    assert.equal(discoverProton({ home: f.home }).proton, undefined);
});

test('malformed, duplicate, trailing and oversized config metadata fail closed', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.custom(root, 'custom');
    const config = path.join(root, 'config/config.vdf');
    const valid = '"InstallConfigStore" { "Software" { "Valve" { "Steam" { "CompatToolMapping" { "0" { "name" "custom" } } } } } }';
    for (const data of [valid.slice(0, -1), valid + ' "trailing" "data"', valid.replace('"name" "custom"', '"name" "custom" "name" "other"'), valid.replace('"name" "custom"', '"Name" "custom" "name" "other"'), 'x'.repeat(1024 * 1024 + 1), '"x" { "__proto__" { "polluted" "yes" } }']) {
        f.write(config, data);
        const result = discoverProton({ home: f.home });
        assert.equal(result.proton, undefined);
        assert.ok(result.reason);
        assert.equal({}.polluted, undefined);
    }
});

test('unsupported, truncated and invalid binary appinfo cannot guess an official runner', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'official' });
    f.write(path.join(root, 'steamapps/appmanifest_999.acf'), '"AppState" { "appid" "999" "installdir" "Proton" }');
    f.runner(path.join(root, 'steamapps/common/Proton'));
    const good = appinfo(29, 'official');
    const badOffset = Buffer.from(good);
    badOffset.writeBigUInt64LE(0xffffffffffn, 8);
    const badSize = Buffer.from(good);
    badSize.writeUInt32LE(0xffffffff, 20);
    for (const data of [Buffer.from('unknown'), good.subarray(0, 40), badOffset, badSize, good.subarray(0, good.length - 1)]) {
        f.write(path.join(root, 'appcache/appinfo.vdf'), data);
        const result = discoverProton({ home: f.home });
        assert.equal(result.proton, undefined);
        assert.ok(result.reason);
    }
});

test('missing roots, absent settings and unavailable runner return actionable manual fallback', t => {
    const f = steamFixture(t);
    assert.match(discoverProton({ home: f.home }).reason, /Steam/i);
    const root = f.root();
    f.config(root, {});
    assert.match(discoverProton({ home: f.home }).reason, /setting|selection|configured/i);
    f.config(root, { 0: 'custom' });
    const proton = f.custom(root, 'custom');
    fs.unlinkSync(path.join(proton, 'proton'));
    assert.equal(discoverProton({ home: f.home }).proton, undefined);
});

test('metadata paths resolving to the same Steam root are deduplicated', { skip: process.platform !== 'linux' }, t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    const proton = f.custom(root, 'custom');
    fs.mkdirSync(path.join(f.home, '.steam'), { recursive: true });
    fs.symlinkSync(root, path.join(f.home, '.steam/root'));
    assert.equal(discoverProton({ home: f.home }).proton, proton);
});

test('selection confirms detected source, preserves manual fallback, and treats every other response as cancel', async t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    const proton = f.custom(root, 'custom');
    const messages = [];
    let response = 0;
    let browsed = 0;
    const dialog = { showMessageBox: async message => { messages.push(message); return { response }; },
        showOpenDialog: async () => { browsed++; return { canceled: false, filePaths: [proton] }; } };
    assert.equal(await selectProton({ home: f.home, dialog }), proton);
    assert.match(messages[0].message, /global default/i);
    assert.match(messages[0].message, /not follow|will not track|fixed/i);
    assert.equal(browsed, 0);
    response = 1;
    assert.equal(await selectProton({ home: f.home, dialog }), proton);
    assert.equal(browsed, 1);
    for (response of [2, -1, undefined, 99]) assert.equal(await selectProton({ home: f.home, dialog }), null);
    assert.equal(browsed, 1);
});

test('bounded long Steam configuration values do not prevent selected tool discovery', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    const proton = f.custom(root, 'custom');
    const config = path.join(root, 'config/config.vdf');
    const data = fs.readFileSync(config, 'utf8').replace('"Steam" {', '"Steam" { "SDL_GamepadBind" "' + 'x'.repeat(20000) + '" ');
    f.write(config, data);
    assert.equal(discoverProton({ home: f.home }).proton, proton);
});

test('long unrelated binary values remain bounded by the metadata file limit rather than a tiny string limit', t => {
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'official' });
    f.write(path.join(root, 'appcache/appinfo.vdf'), appinfo(29, 'official', '999', 'x'.repeat(20000)));
    f.write(path.join(root, 'steamapps/appmanifest_999.acf'), '"AppState" { "appid" "999" "installdir" "Proton" }');
    const proton = f.runner(path.join(root, 'steamapps/common/Proton'));
    assert.equal(discoverProton({ home: f.home }).proton, proton);
});

test('metadata FIFO fails instead of blocking a read-only discovery', { skip: process.platform !== 'linux' }, t => {
    const { spawnSync } = require('node:child_process');
    const f = steamFixture(t);
    const root = f.root();
    f.config(root, { 0: 'custom' });
    const file = path.join(root, 'config/config.vdf');
    fs.unlinkSync(file);
    const made = spawnSync('mkfifo', [file], { timeout: 2000 });
    assert.equal(made.status, 0);
    const script = 'const result = require(process.argv[1]).discoverProton({home:process.argv[2]}); if(result.proton || !result.reason) process.exit(1);';
    const child = spawnSync(process.execPath, ['-e', script, require.resolve('./ProtonSetup'), f.home], { timeout: 2000 });
    assert.equal(child.status, 0, 'discovery must reject nonregular metadata without waiting for a FIFO writer');
});

test('failed discovery explains manual fallback and manual cancellation is side-effect free', async t => {
    const f = steamFixture(t);
    let message;
    let response = 0;
    const dialog = { showMessageBox: async options => { message = options; return { response }; },
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
    assert.equal(await selectProton({ home: f.home, dialog }), null);
    assert.match(message.message, /Steam.*not|not.*Steam/i);
    assert.deepEqual(fs.readdirSync(f.home), []);
    response = 1;
    assert.equal(await selectProton({ home: f.home, dialog }), null);
});
