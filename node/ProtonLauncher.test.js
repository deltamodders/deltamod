const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');
const Staging = require('./ProtonStaging');
const {
    validateRuntime,
    inspectProcesses,
    runProtonProfile,
    recoverProtonProfile,
    removeProtonProfile,
    reserve,
    removalFile,
    profileIndex,
    profileIndices,
    readRemoval,
    removeInstallation,
    resolveSelection
} = require('./ProtonLauncher');
const { installSteamHook, removeSteamProfile } = require('./ProtonSteamBridge');

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-launch-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'source');
    const root = path.join(dir, 'proton');
    const proton = path.join(dir, 'Proton with spaces');
    fs.mkdirSync(source);
    fs.mkdirSync(proton);
    fs.writeFileSync(path.join(source, 'DELTARUNE.exe'), 'fixture executable');
    fs.writeFileSync(path.join(proton, 'proton'), 'fixture runner');
    fs.chmodSync(path.join(proton, 'proton'), 0o755);
    Staging.importBase(root, source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton });
    return { dir, source, root, proton };
}

function runtime(f, overrides = {}) {
    let time = 0;
    let polls = 0;
    let closed = false;
    const child = new EventEmitter();
    child.pid = 9999999;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const calls = [];
    const settings = { platform: 'linux', now: () => time, pollMs: 1, quietMs: 2, startupTimeout: 5,
        inspect: async () => ({ active: !closed, game: !closed, uncertain: false }),
        sleep: async () => {
            time++;
            polls++;
            if (polls === 2) {
                closed = true;
                child.emit('close', 0);
            }
        },
        spawn: (file, args, options) => {
            calls.push({ file, args, options });
            queueMicrotask(() => child.emit('spawn'));
            return child;
        }, ...overrides };
    return { settings, child, calls };
}

function processTable(records, executable = { uid: 0, mode: 0o100755 }) {
    return {
        readdirSync: () => Object.keys(records).filter(pid => records[pid].listed !== false),
        statSync: filename => {
            if (!filename.startsWith('/proc/')) return executable;
            const record = records[filename.split('/')[2]];
            if (!record) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
            return { uid: record.uid ?? process.getuid() };
        },
        readFileSync: filename => {
            if (filename.endsWith('/boot_id')) return 'fixture-boot';
            const record = records[filename.split('/')[2]];
            if (!record) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
            const name = path.basename(filename);
            const failure = record.errors?.[name];
            if (failure) throw Object.assign(new Error('fixture read failure'), { code: failure });
            if (name === 'stat') {
                const fields = Array(20).fill('0');
                fields[0] = 'S';
                fields[1] = String(record.ppid ?? 1);
                fields[2] = String(record.pgid ?? 123);
                fields[19] = String(record.birth ?? 300);
                return `123 (${record.comm}) ${fields.join(' ')}`;
            }
            if (name === 'comm') return record.comm + '\n';
            if (name === 'cmdline') return (record.argv || []).join('\0') + '\0';
            if (name === 'environ') return (record.env || []).join('\0') + '\0';
            throw new Error(`Unexpected fixture read: ${filename}`);
        }
    };
}

test('protected desktop and SSH services do not block inactive UMU removal without a journal', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const proc = processTable({
        100: { comm: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], errors: { environ: 'EACCES' } },
        101: { comm: '(sd-pam)', argv: ['(sd-pam)'], ppid: 100, errors: { environ: 'EPERM' } },
        102: { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EACCES' } },
        103: { comm: 'polkit-kde-auth', argv: ['/usr/lib/polkit-kde-authentication-agent-1'], errors: { environ: 'EACCES' } },
        104: { comm: 'sshd-session', argv: ['sshd-session: fixture@notty'], ppid: 99, errors: { environ: 'EACCES' } },
        99: { comm: 'sshd-session', argv: ['sshd-session: fixture [priv]'], uid: 0, listed: false }
    });
    assert.deepEqual(await inspectProcesses(f.root, {}, proc), { active: false, game: false, uncertain: false });
    let disposed = false;
    const settings = { platform: 'linux', quietMs: 0, inspect: (root, session) => inspectProcesses(root, session, proc) };
    await removeProtonProfile(f.root, () => { disposed = true; }, settings);
    assert.equal(disposed, true);
});

test('permission exceptions never hide ambiguous runtimes or profile ownership', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const service = { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EACCES' } };
    for (const record of [
        { comm: 'wine64', argv: ['/usr/bin/wine64'], errors: { environ: 'EACCES' } },
        { comm: 'proton', argv: ['/usr/bin/python3', '/tmp/proton'], errors: { environ: 'EPERM' } },
        { comm: 'unknown', argv: ['/tmp/unknown'], errors: { environ: 'EACCES' } },
        { ...service, comm: 'wine64' },
        { ...service, errors: { cmdline: 'EACCES', environ: 'EACCES' } },
        { ...service, errors: { environ: 'EIO' } },
        { comm: '(sd-pam)', argv: ['(sd-pam)'], ppid: 999, errors: { environ: 'EACCES' } },
        { comm: 'sshd-session', argv: ['sshd-session: fixture@notty'], ppid: 999, errors: { environ: 'EACCES' } }
    ]) {
        const state = await inspectProcesses(f.root, {}, processTable({ 123: record }));
        assert.equal(state.uncertain, true, JSON.stringify(record));
        assert.match(state.reason, /process 123:/);
    }
    for (const executable of [{ uid: 1000, mode: 0o100755 }, { uid: 0, mode: 0o100777 }]) {
        assert.equal((await inspectProcesses(f.root, {}, processTable({ 123: service }, executable))).uncertain, true);
    }
    for (const [record, session] of [
        [{ ...service, errors: { cmdline: 'EACCES', environ: 'EACCES' } }, { pgid: 123 }],
        [{ ...service, argv: [...service.argv, path.join(f.root, 'work/stage/game/DELTARUNE.exe')] }, {}],
        [{ ...service, argv: [...service.argv, path.join(f.root, 'prefix')] }, {}],
        [{ ...service, errors: {}, env: [`WINEPREFIX=${path.join(f.root, 'prefix')}`] }, {}],
        [{ ...service, errors: {}, env: ['DELTAMOD_SESSION_ID=owned'] }, { id: 'owned' }]
    ]) {
        const state = await inspectProcesses(f.root, session, processTable({ 123: record }));
        assert.equal(state.active, true, JSON.stringify(record));
        assert.match(state.reason, /process 123:/);
    }
});

test('a protected-service name never exempts a reused PID or unverified parent', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const record = { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EACCES' } };
    const proc = processTable({ 123: record });
    const read = proc.readFileSync;
    let reads = 0;
    proc.readFileSync = filename => {
        if (filename.endsWith('/stat')) record.birth = 300 + reads++;
        return read(filename);
    };
    assert.equal((await inspectProcesses(f.root, {}, proc)).uncertain, true);
    for (const child of [
        { comm: '(sd-pam)', argv: ['(sd-pam)'], ppid: 100 },
        { comm: 'sshd-session', argv: ['sshd-session: fixture@notty'], ppid: 100 }
    ]) {
        const parent = { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland', '--user'], listed: false };
        assert.equal((await inspectProcesses(f.root, {}, processTable({ 123: { ...child, errors: { environ: 'EACCES' } }, 100: parent }))).uncertain, true);
    }
    const readable = { ...record, errors: {}, env: ['DELTAMOD_SESSION_ID=undefined'] };
    assert.deepEqual(await inspectProcesses(f.root, {}, processTable({ 123: readable })), { active: false, game: false, uncertain: false });
});

test('removal and abandoned recovery report the blocking process without disposing files', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const proc = processTable({ 123: { comm: 'wine64', argv: ['/usr/bin/wine64'], errors: { environ: 'EACCES' } } });
    const settings = { platform: 'linux', quietMs: 0, inspect: (root, session) => inspectProcesses(root, session, proc) };
    let disposed = false;
    await assert.rejects(removeProtonProfile(f.root, () => { disposed = true; }, settings), /process 123:.*EACCES/);
    assert.equal(disposed, false);
    const journal = path.join(f.root, 'session.json');
    const retained = JSON.stringify({ version: 1, id: 'fixture', ownerPid: 9999999, phase: 'retained' });
    fs.writeFileSync(journal, retained);
    await assert.rejects(recoverProtonProfile(f.root, settings), /process 123:.*EACCES/);
    assert.equal(fs.readFileSync(journal, 'utf8'), retained);
    assert.equal(fs.readFileSync(path.join(f.source, 'DELTARUNE.exe'), 'utf8'), 'fixture executable');
});

test('missing runtime fails before staging or touching a prefix', async t => {
    const f = fixture(t);
    const descriptor = Staging.readDescriptor(f.root);
    descriptor.umu = path.join(f.dir, 'missing-umu');
    Staging.writeJSON(path.join(f.root, 'backend.json'), descriptor);
    const r = runtime(f);
    await assert.rejects(runProtonProfile(f.root, {}, r.settings), /UMU/i);
    assert.equal(r.calls.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('explicit runtime is validated instead of assuming any Proton directory works', t => {
    const f = fixture(t);
    fs.rmSync(path.join(f.proton, 'proton'));
    assert.throws(() => validateRuntime(Staging.readDescriptor(f.root)), /Proton/i);
});

test('launch passes a staged executable, explicit runner and persistent separate prefix without a shell', async t => {
    const f = fixture(t);
    const r = runtime(f);
    await runProtonProfile(f.root, { acknowledgeRuntime: async () => true, args: ['argument with spaces', ';not-a-command'] }, r.settings);
    const call = r.calls[0];
    assert.equal(call.file, process.execPath);
    assert.match(call.args[0], /work.*game.*DELTARUNE\.exe$/);
    assert.deepEqual(call.args.slice(1), ['argument with spaces', ';not-a-command']);
    assert.equal(call.options.shell, false);
    assert.equal(call.options.detached, true);
    assert.equal(call.options.env.WINEPREFIX, path.join(f.root, 'prefix'));
    assert.equal(call.options.env.PROTONPATH, f.proton);
    assert.equal(call.options.env.PROTONFIXES_DISABLE, '1');
    assert.equal(call.options.env.GAMEID, 'umu-default');
    assert.equal(fs.existsSync(path.join(f.root, 'prefix')), true);
    assert.equal(fs.existsSync(path.join(f.root, 'session.json')), false);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('first launch is canceled without acknowledgment; no child or stage is created', async t => {
    const f = fixture(t);
    const r = runtime(f);
    await assert.rejects(runProtonProfile(f.root, {}, r.settings), /acknowledg/i);
    assert.equal(r.calls.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('startup timeout retains the session and stage rather than deleting potentially active files', async t => {
    const f = fixture(t);
    const r = runtime(f, { inspect: async () => ({ active: true, game: false, uncertain: false }) });
    await assert.rejects(runProtonProfile(f.root, { acknowledgeRuntime: async () => true }, r.settings), /startup.*time/i);
    assert.equal(fs.readdirSync(path.join(f.root, 'work')).length, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'session.json'))).phase, 'retained');
    await assert.rejects(runProtonProfile(f.root, {}, r.settings), /still active|uncertain/i);
});

test('runner exit with a live chapter child never cleans staging prematurely', async t => {
    const f = fixture(t);
    let tick = 0;
    let r;
    r = runtime(f, { now: () => tick,
        inspect: async () => ({ active: tick < 5, game: true, uncertain: false }),
        sleep: async () => {
            tick++;
            if (tick === 1) r.child.emit('close', 0);
            if (tick === 3) assert.equal(fs.readdirSync(path.join(f.root, 'work')).length, 1);
        } });
    await runProtonProfile(f.root, { acknowledgeRuntime: async () => true }, r.settings);
    assert.ok(tick >= 7);
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('duplicate requests lock before asynchronous dialogs or preparation', async t => {
    const f = fixture(t);
    let release;
    const acknowledgment = new Promise(resolve => { release = resolve; });
    const r = runtime(f);
    const running = runProtonProfile(f.root, { acknowledgeRuntime: () => acknowledgment }, r.settings);
    await assert.rejects(runProtonProfile(f.root, {}, r.settings), /already|active/i);
    release(true);
    await running;
});

test('uncertain inspection retains data; inactive retained session is recovered without erasing progress', async t => {
    const f = fixture(t);
    const r = runtime(f, { inspect: async () => ({ active: false, game: false, uncertain: true }) });
    await assert.rejects(runProtonProfile(f.root, { acknowledgeRuntime: async () => true }, r.settings), /uncertain/i);
    fs.writeFileSync(path.join(f.root, 'prefix', 'progress.fixture'), 'progress');
    const next = runtime(f, { inspect: async () => ({ active: false, game: false, uncertain: false }) });
    await recoverProtonProfile(f.root, next.settings);
    assert.equal(fs.readFileSync(path.join(f.root, 'prefix/progress.fixture'), 'utf8'), 'progress');
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('spawn errors and early exit are errors, not proof a game ran', async t => {
    const f = fixture(t);
    const r = runtime(f, { spawn: () => { throw new Error('fixture spawn failed'); } });
    await assert.rejects(runProtonProfile(f.root, { acknowledgeRuntime: async () => true }, r.settings), /spawn failed/);
    assert.equal(fs.existsSync(path.join(f.root, 'session.json')), false);
    const early = runtime(f, { inspect: async () => ({ active: false, game: false, uncertain: false }) });
    await assert.rejects(runProtonProfile(f.root, { acknowledgeRuntime: async () => true }, early.settings), /not observed|before.*game/i);
});

test('malformed descriptors and arguments fail without invoking a runtime', async t => {
    const f = fixture(t);
    const r = runtime(f);
    await assert.rejects(runProtonProfile(f.root, { acknowledgeRuntime: async () => true, args: ['bad\0argument'] }, r.settings), /arguments/i);
    assert.equal(r.calls.length, 0);
    const descriptor = Staging.readDescriptor(f.root);
    descriptor.version = 99;
    Staging.writeJSON(path.join(f.root, 'backend.json'), descriptor);
    await assert.rejects(runProtonProfile(f.root, {}, r.settings), /descriptor/i);
});

test('a live application lock blocks launch and an interrupted recovery gate needs review', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'control.lock'), JSON.stringify({ pid: process.pid, token: 'other-instance' }));
    const r = runtime(f);
    await assert.rejects(runProtonProfile(f.root, {}, r.settings), /already active/i);
    assert.equal(r.calls.length, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'control.lock'))).token, 'other-instance');
    assert.equal(fs.existsSync(path.join(f.root, 'recovery.lock')), false);
    fs.unlinkSync(path.join(f.root, 'control.lock'));
    fs.writeFileSync(path.join(f.root, 'recovery.lock'), 'interrupted');
    await assert.rejects(recoverProtonProfile(f.root, r.settings), /interrupted/i);
});

test('an abandoned preparing transaction is not mistaken for a completed launch', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'session.json'), JSON.stringify({
        version: 1, id: 'fixture-session', phase: 'preparing', ownerPid: process.pid
    }));
    const r = runtime(f);
    await assert.rejects(recoverProtonProfile(f.root, r.settings), /preparation.*active/i);
    assert.equal(fs.existsSync(path.join(f.root, 'session.json')), true);
});

test('asynchronous spawn errors are reported and never erase prefix progress', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'prefix/progress.fixture'), 'keep');
    let child;
    const r = runtime(f, {
        inspect: async () => ({ active: false, game: false, uncertain: false }),
        spawn: () => {
            child = new EventEmitter();
            queueMicrotask(() => child.emit('error', new Error('fixture ENOENT')));
            return child;
        }
    });
    await assert.rejects(runProtonProfile(f.root, { acknowledgeRuntime: async () => true }, r.settings), /fixture ENOENT/);
    assert.equal(fs.readFileSync(path.join(f.root, 'prefix/progress.fixture'), 'utf8'), 'keep');
});

test('Linux real subprocess/proc fixture observes an owned child and preserves argv/env', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const fakeUMU = path.join(f.dir, 'umu fixture');
    fs.writeFileSync(fakeUMU, `#!${process.execPath}\n` +
        `const fs = require('node:fs');\nconst path = require('node:path');\n` +
        `fs.writeFileSync(path.join(process.env.WINEPREFIX, 'capture.json'), JSON.stringify({ argv: process.argv.slice(2), prefix: process.env.WINEPREFIX, proton: process.env.PROTONPATH }));\n` +
        `const child = require('node:child_process').spawn(process.execPath, ['-e', 'process.title = "DELTARUNE.exe"; setTimeout(() => {}, 400)'], { stdio: 'inherit' });\n` +
        `child.on('exit', code => process.exit(code));\n`);
    fs.chmodSync(fakeUMU, 0o755);
    const descriptor = Staging.readDescriptor(f.root);
    descriptor.umu = fakeUMU;
    Staging.writeJSON(path.join(f.root, 'backend.json'), descriptor);
    let ownedChild;
    const settings = { pollMs: 25, quietMs: 100, startupTimeout: 5000,
        spawn: (...args) => {
            ownedChild = require('node:child_process').spawn(...args);
            return ownedChild;
        } };
    let started = false;
    try {
        await runProtonProfile(f.root, { acknowledgeRuntime: async () => true, args: ['with spaces', ';not-a-shell'],
            onStarted: () => { started = true; } }, settings);
    } finally {
        if (ownedChild && ownedChild.exitCode === null && ownedChild.signalCode === null) {
            const ended = new Promise(resolve => ownedChild.once('close', resolve));
            try { process.kill(-ownedChild.pid, 'SIGTERM'); }
            catch (error) { if (error.code !== 'ESRCH') throw error; }
            await ended;
        }
    }
    assert.equal(started, true);
    const captured = JSON.parse(fs.readFileSync(path.join(f.root, 'prefix/capture.json')));
    assert.deepEqual(captured.argv.slice(1), ['with spaces', ';not-a-shell']);
    assert.equal(captured.prefix, path.join(f.root, 'prefix'));
    assert.equal(captured.proton, f.proton);
    assert.equal(fs.readFileSync(path.join(f.source, 'DELTARUNE.exe'), 'utf8'), 'fixture executable');
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'work')), []);
});

test('Linux inspection excludes pre-owner processes but refuses inaccessible possible descendants', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    let birth = '100';
    let environmentsRead = 0;
    const proc = {
        readdirSync: () => ['123'], statSync: () => ({ uid: process.getuid() }),
        readFileSync: filename => {
            if (filename.endsWith('/boot_id')) return 'fixture-boot';
            if (filename.endsWith('/stat')) {
                const fields = Array(20).fill('0');
                fields[0] = 'S';
                fields[19] = birth;
                return `123 (fixture) ${fields.join(' ')}`;
            }
            environmentsRead++;
            throw Object.assign(new Error('fixture permission denied'), { code: 'EACCES' });
        }
    };
    const session = { id: 'fixture', ownerBirth: '200', ownerBoot: 'fixture-boot' };
    assert.deepEqual(await inspectProcesses(f.root, session, proc), { active: false, game: false, uncertain: false });
    assert.equal(environmentsRead, 0);
    birth = '300';
    const possibleChild = await inspectProcesses(f.root, session, proc);
    assert.equal(possibleChild.uncertain, true);
    assert.match(possibleChild.reason, /EACCES/);
    session.ownerBoot = 'previous-boot';
    birth = '100';
    assert.equal((await inspectProcesses(f.root, session, proc)).uncertain, true);
});

// Installation removal

function removalFixture(t, steam = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-removal-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'Steam/steamapps/common/Game');
    const profile = path.join(dir, 'deltamod_system-0');
    const root = path.join(profile, 'proton');
    const runner = path.join(dir, 'runner');
    const steamRoot = path.join(dir, 'Steam');
    const config = path.join(steamRoot, 'userdata/12345/config/localconfig.vdf');
    const save = path.join(steamRoot, 'steamapps/compatdata/123/pfx/save.fixture');
    for (const folder of [source, profile, runner, path.dirname(config), path.dirname(save), path.join(steamRoot, 'config')]) fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(source, 'DELTARUNE.exe'), 'original executable');
    fs.writeFileSync(path.join(source, 'data.win'), 'original data');
    fs.writeFileSync(path.join(profile, 'store.json'), JSON.stringify({ gamePath: source, gamePid: 'fixture' }));
    fs.writeFileSync(path.join(runner, 'proton'), 'runner');
    fs.writeFileSync(config, '"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { "123" { "LaunchOptions" "--original" } } } } } }', { mode: 0o600 });
    fs.writeFileSync(save, 'normal Steam progress');
    const settings = { userData: dir, platform: 'linux', assertDurable: x => x,
        isSteamClosed: () => true, inspect: () => ({ active: false, uncertain: false }),
        optionsEffects: { isSteamClosed: () => true } };
    const game = { root: steamRoot, source, appid: '123', accounts: [{ account: '12345', name: 'Fixture' }] };
    const descriptor = steam ? { backend: 'steam', sharedProgressAcknowledged: true,
        steam: installSteamHook({ game, account: '12345', exeName: 'DELTARUNE.exe', profile: root }, settings) } : { umu: process.execPath, proton: runner };
    Staging.importBase(root, source, { ...descriptor, gameId: 'fixture', exeName: 'DELTARUNE.exe' });
    fs.writeFileSync(path.join(root, 'prefix/progress.fixture'), 'old isolated progress');
    const launcherSettings = { platform: 'linux', quietMs: 0, inspect: async () => ({ active: false, uncertain: false }) };
    const removeProton = (profileRoot, dispose) => removeProtonProfile(profileRoot, dispose, launcherSettings);
    const removeSteam = (profileRoot, removal) => removeSteamProfile(profileRoot, removal, settings);
    const options = { userData: dir, removeProton, removeSteam };
    return { dir, source, profile, root, config, save, settings, game, launcherSettings, options };
}

function originals(f) {
    assert.equal(fs.readFileSync(f.save, 'utf8'), 'normal Steam progress');
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'original data');
    assert.equal(fs.readFileSync(path.join(f.source, 'DELTARUNE.exe'), 'utf8'), 'original executable');
}

test('cancellation and invalid indices never remove files or leave deletion records', async t => {
    const f = removalFixture(t);
    assert.equal(await removeInstallation('0', { confirm: () => false }, f.options), false);
    for (const index of ['../Steam', '-1', '0/../../Steam', '00', '1.2', '9007199254740992', undefined]) {
        await assert.rejects(removeInstallation(index, { confirm: () => true }, f.options), /Invalid installation index/);
    }
    assert.equal(fs.existsSync(removalFile(f.root)), false);
    assert.equal(fs.existsSync(removalFile(f.root) + '.lock'), false);
    assert.equal(fs.readFileSync(path.join(f.root, 'prefix/progress.fixture'), 'utf8'), 'old isolated progress');
    originals(f);
});

test('inactive UMU deletion preserves Steam data and stable sparse profile identities', async t => {
    const f = removalFixture(t);
    fs.mkdirSync(path.join(f.dir, 'deltamod_system-8'));
    fs.writeFileSync(path.join(f.dir, 'deltamod_system-8/sentinel'), 'untouched');
    assert.equal(await removeInstallation('0', { confirm: () => true }, f.options), true);
    assert.equal(fs.existsSync(f.profile), false);
    assert.equal(fs.readFileSync(path.join(f.dir, 'deltamod_system-8/sentinel'), 'utf8'), 'untouched');
    assert.deepEqual(profileIndices(f.dir), [0, 8]);
    assert.equal(readRemoval(f.dir, 0).phase, 'done');
    assert.throws(() => reserve(f.root), /removed|deleted/);
    originals(f);
});

test('legacy deletion reads a hashed KeyValue store', async t => {
    const f = removalFixture(t);
    const legacy = path.join(f.dir, 'deltamod_system-5');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'store.json'), JSON.stringify({ gamePath: f.source, gamePid: 'legacy' }) + '##0123abcd');
    const legacyRemovals = [];
    assert.equal(await removeInstallation('5', { confirm: () => true, removeLegacy: index => legacyRemovals.push(index) }, f.options), true);
    assert.deepEqual(legacyRemovals, [5]);
    assert.equal(fs.existsSync(legacy), false);
    assert.equal(readRemoval(f.dir, 5).pid, 'legacy');
    originals(f);
});

test('active and uncertain Proton sessions refuse deletion and retain progress', async t => {
    for (const activity of [{ active: true }, { uncertain: true }]) {
        const f = removalFixture(t);
        const launcherSettings = { ...f.launcherSettings, inspect: async () => activity };
        const options = { ...f.options, removeProton: (root, dispose) => removeProtonProfile(root, dispose, launcherSettings) };
        await assert.rejects(removeInstallation(0, { confirm: () => true }, options), /active|uncertain/);
        assert.equal(fs.existsSync(removalFile(f.root)), false);
        assert.equal(fs.readFileSync(path.join(f.root, 'prefix/progress.fixture'), 'utf8'), 'old isolated progress');
        originals(f);
    }
});

test('launch exclusion prevents deletion by another application instance', async t => {
    const f = removalFixture(t);
    const release = reserve(f.root);
    try {
        await assert.rejects(removeInstallation(0, { confirm: () => true }, f.options), /already active/);
        assert.equal(fs.existsSync(removalFile(f.root)), false);
    } finally {
        release();
    }
    originals(f);
});

test('failed filesystem cleanup remains fenced and can be retried without a valid remaining descriptor', async t => {
    const f = removalFixture(t);
    const options = { ...f.options, removeTree: profile => {
        fs.unlinkSync(path.join(profile, 'proton/backend.json'));
        throw new Error('fixture disk failure');
    } };
    await assert.rejects(removeInstallation(0, { confirm: () => true }, options), /fixture disk failure/);
    assert.equal(readRemoval(f.dir, 0).phase, 'pending');
    assert.throws(() => reserve(f.root), /removed|deleted/);
    let retries = 0;
    assert.equal(await removeInstallation(0, { confirm: state => { assert.equal(state.retry, true); retries++; return true; } }, f.options), true);
    assert.equal(retries, 1);
    assert.equal(readRemoval(f.dir, 0).phase, 'done');
    assert.equal(fs.existsSync(f.profile), false);
    originals(f);
});

test('a replacement directory cannot be removed using an interrupted installation record', async t => {
    const f = removalFixture(t);
    const options = { ...f.options, removeTree: () => { throw new Error('fixture interrupted'); } };
    await assert.rejects(removeInstallation(0, { confirm: () => true }, options), /fixture interrupted/);
    fs.renameSync(f.profile, path.join(f.dir, 'retained-original'));
    fs.mkdirSync(f.profile);
    fs.writeFileSync(path.join(f.profile, 'sentinel'), 'replacement is not owned by the removal record');
    await assert.rejects(removeInstallation(0, { confirm: () => true }, f.options), /identity changed/);
    assert.equal(fs.readFileSync(path.join(f.profile, 'sentinel'), 'utf8'), 'replacement is not owned by the removal record');
    originals(f);
});

test('an owned base from an incomplete import can be deleted without a store', async t => {
    const f = removalFixture(t);
    fs.unlinkSync(path.join(f.profile, 'store.json'));
    assert.equal(await removeInstallation(0, { confirm: () => true }, f.options), true);
    assert.equal(fs.existsSync(f.profile), false);
    originals(f);
});

test('Steam removal unregisters only its profile and restores options only after the last user', async t => {
    const f = removalFixture(t, true);
    const second = path.join(f.dir, 'deltamod_system-3/proton');
    const descriptor = Staging.readDescriptor(f.root);
    fs.mkdirSync(path.dirname(second));
    installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: second }, f.settings);
    Staging.importBase(second, f.source, { ...descriptor, owner: undefined });
    fs.writeFileSync(path.join(path.dirname(second), 'store.json'), JSON.stringify({ gamePid: 'fixture' }));
    const before = fs.readFileSync(f.config);
    assert.equal(await removeInstallation(0, { confirm: () => true }, f.options), true);
    assert.deepEqual(fs.readFileSync(f.config), before);
    assert.equal(fs.existsSync(second), true);
    assert.equal(await removeInstallation(3, { confirm: () => true }, f.options), true);
    assert.equal(fs.readFileSync(f.config, 'utf8'), '"UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" { "123" { "LaunchOptions" "--original" } } } } } }');
    originals(f);
});

test('edited Steam settings, retained sessions, and running/uncertain processes stop permanent removal', async t => {
    for (const cause of ['edited', 'session', 'request', 'running', 'uncertain', 'steam']) {
        const f = removalFixture(t, true);
        if (cause === 'edited') fs.writeFileSync(f.config, fs.readFileSync(f.config, 'utf8').replace('%command%', '%command% --user-edited'));
        if (cause === 'session') fs.writeFileSync(path.join(f.root, 'steam-session.json'), '{}');
        if (cause === 'request') fs.writeFileSync(path.join(Staging.readDescriptor(f.root).steam.binding, 'request.json'), '{}');
        const steamSettings = { ...f.settings,
            inspect: () => ({ active: cause === 'running', uncertain: cause === 'uncertain' }), isSteamClosed: () => cause !== 'steam' };
        const removeSteam = (root, removal) => removeSteamProfile(root, removal, steamSettings);
        const options = { ...f.options, removeSteam };
        const before = fs.readFileSync(f.config);
        await assert.rejects(removeInstallation(0, { confirm: () => true }, options), /edited|session|process|Steam/i);
        assert.deepEqual(fs.readFileSync(f.config), before);
        assert.equal(fs.existsSync(removalFile(f.root)), false);
        assert.equal(fs.existsSync(f.profile), true);
        originals(f);
    }
});

test('linked profile roots are refused while prefix symlinks are unlinked without touching their targets', { skip: process.platform !== 'linux' }, async t => {
    const f = removalFixture(t);
    const linked = path.join(f.dir, 'deltamod_system-7');
    fs.symlinkSync(path.dirname(f.save), linked);
    await assert.rejects(removeInstallation(7, { confirm: () => true }, f.options), /Unsafe installation/);
    fs.symlinkSync(path.dirname(f.save), path.join(f.root, 'prefix/steam-link'));
    assert.equal(await removeInstallation(0, { confirm: () => true }, f.options), true);
    originals(f);
});

// Startup selection

function selectionFixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-selection-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const unique = path.join(dir, 'deltamod_system-unique');
    fs.mkdirSync(unique);
    function profile(index, gamePid = 'toby.deltarune') {
        const folder = path.join(dir, `deltamod_system-${index}`);
        fs.mkdirSync(folder);
        fs.writeFileSync(path.join(folder, 'store.json'), JSON.stringify({ gamePid, gamePath: folder, loadedDeltarune: true }));
        return folder;
    }
    function select(index) {
        fs.writeFileSync(path.join(unique, '_sysindex'), index);
    }
    function boot(args = []) {
        let current = '0';
        let ready;
        const boundary = new Error('Window boundary');
        const silent = { log() {}, error() {}, warn() {}, clear() {} };
        const app = { getPath: () => dir, getVersion: () => 'fixture', commandLine: { appendSwitch() {} },
            setAsDefaultProtocolClient() {}, requestSingleInstanceLock: () => true, on() {},
            whenReady: () => ({ then: callback => { ready = callback; } }) };
        const system = {
            healthCheck() {}, clearTemporary() {}, setSystemIndex: index => { current = index; },
            getSystemFile: (file, shared) => path.join(shared ? unique : path.join(dir, `deltamod_system-${current}`), file)
        };
        const storage = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'KeyValue.js'), 'utf8'), {
            module: storage, require: name => ({ './System.js': system, './Console.js': silent, electron: { app } }[name] || require(name))
        });
        const keyValue = storage.exports;
        const modules = {
            electron: { app, BrowserWindow: function () { throw boundary; },
                protocol: { registerSchemesAsPrivileged() {} }, session: { fromPartition() {} },
                screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) } },
            './System': system, './Console': silent,
            './KeyValue': { ...keyValue, loadUniqueDefaults() {}, upgradeStores() {} },
            './ProtonLauncher': { profileIndex, resolveSelection },
            './Paths': { file: (...parts) => path.join(dir, ...parts) },
            './Protocol': { registerProtocolSchemesAsPrivileged() {}, registerProtocolHandlers() {} },
            './FeatureFlags': { isFeatureEnabled: () => false }, './Plugins': { call() {} },
            './RunConditions.js': { checkConditions: () => [] },
            '7zip-min': { getConfig: () => ({}), config() {} }
        };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'Runner.js'), 'utf8'), {
            module: { exports: {} }, __dirname, require: name => modules[name] || (['fs', 'path', 'crypto'].includes(name) ? require(name) : {}),
            process: { platform: 'linux', argv: args, env: {}, stdout: { write() {} } }
        });
        assert.throws(() => ready(), error => error === boundary);
        return { index: current, gameId: keyValue.readKVS('gamePid'), persisted: fs.readFileSync(path.join(unique, '_sysindex'), 'utf8') };
    }
    return { dir, unique, profile, select, boot };
}

test('startup repairs a deleted selection before real KeyValue loads the surviving game', t => {
    const h = selectionFixture(t);
    h.profile(1);
    h.select('0');
    assert.deepEqual(h.boot(), { index: '1', persisted: '1', gameId: 'toby.deltarune' });
    assert.deepEqual(h.boot(), { index: '1', persisted: '1', gameId: 'toby.deltarune' });
    assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-0')), false);
});

test('startup retains a valid sparse selection and honors a valid CLI override', t => {
    const h = selectionFixture(t);
    h.profile(2, 'other.game');
    h.profile(7);
    h.select('7');
    assert.equal(h.boot().index, '7');
    assert.equal(h.boot(['---system_index=invalid']).index, '7');
    assert.equal(h.boot(['---system_index=../outside']).index, '7');
    assert.deepEqual(h.boot(['---system_index=2']), { index: '2', persisted: '2', gameId: 'other.game' });
});

test('missing and invalid selections recover deterministically without using untrusted path text', t => {
    const h = selectionFixture(t);
    h.profile(7);
    h.profile(2);
    for (const value of ['../outside', '-1', '9999999999999999999999', '0']) {
        h.select(value);
        assert.equal(h.boot().index, '2');
    }
    fs.unlinkSync(path.join(h.unique, '_sysindex'));
    assert.equal(h.boot().index, '2');
});

test('selection recovery excludes incomplete stores and all removal markers without altering them', t => {
    const h = selectionFixture(t);
    h.profile(0);
    h.profile(1);
    const broken = h.profile(2);
    const empty = h.profile(3);
    h.profile(4);
    fs.writeFileSync(path.join(broken, 'store.json'), '{');
    fs.writeFileSync(path.join(empty, 'store.json'), '{}');
    const pending = path.join(h.dir, 'removed-deltamod_system-0.json');
    const done = path.join(h.dir, 'removed-deltamod_system-1.json');
    fs.writeFileSync(pending, '{"phase":"pending"}');
    fs.writeFileSync(done, '{"phase":"done"}');
    assert.equal(resolveSelection(h.dir, '0'), '4');
    assert.equal(fs.readFileSync(pending, 'utf8'), '{"phase":"pending"}');
    assert.equal(fs.readFileSync(done, 'utf8'), '{"phase":"done"}');
});

test('no surviving installation reserves a fresh import index without resurrecting retired profiles', t => {
    const h = selectionFixture(t);
    fs.writeFileSync(path.join(h.dir, 'removed-deltamod_system-7.json'), '{}');
    h.select('0');
    assert.deepEqual(h.boot(), { index: '8', persisted: '8', gameId: null });
    assert.deepEqual(h.boot(), { index: '8', persisted: '8', gameId: null });
    assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-0')), false);
});

test('fresh startup chooses import slot zero without creating a phantom installation', t => {
    const h = selectionFixture(t);
    assert.deepEqual(h.boot(), { index: '0', persisted: '0', gameId: null });
    assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-0')), false);
});
