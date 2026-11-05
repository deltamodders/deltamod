const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const {
    installSteamHook, verifySteamProfile, runSteamProfile, recoverSteamProfile, updateSteamHelper, isLeftoverSession,
    runHook, redirectCommand, inspectActivity, identity
} = require('./ProtonSteamBridge');
const Staging = require('./ProtonStaging');
const owner = { pid: 12345, birth: '100', boot: 'test-boot' };
const electronRuntime = (() => {
    if (process.platform !== 'linux') return null;
    try {
        return require('electron');
    } catch {
        return null;
    }
})();

function fixture(t, runtime = process.execPath) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steam-bridge-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const steam = path.join(dir, 'Steam');
    const source = path.join(steam, 'steamapps/common/Game with spaces');
    const profile = path.join(dir, 'profile');
    const userData = path.join(dir, "user data ' quoted");
    for (const folder of [source, profile, userData, path.join(steam, 'config'), path.join(steam, 'userdata/12345/config')]) fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(source, 'DELTARUNE.exe'), 'original executable');
    fs.writeFileSync(path.join(source, 'data.win'), 'original data');
    fs.writeFileSync(path.join(steam, 'steamapps/appmanifest_123.acf'), '"AppState" { "appid" "123" "installdir" "Game with spaces" }');
    fs.writeFileSync(path.join(steam, 'config/loginusers.vdf'), '"users" { "76561197960278073" { "PersonaName" "Fixture" } }');
    fs.writeFileSync(path.join(steam, 'userdata/12345/config/localconfig.vdf'), '"UserLocalConfigStore" {}', { mode: 0o600 });
    const game = { root: steam, source, appid: '123', accounts: [{ account: '12345', name: 'Fixture' }] };
    const root = path.join(profile, 'proton');
    const settings = { userData, runtime, platform: 'linux', assertDurable: value => value, optionsEffects: { isSteamClosed: () => true },
        processIdentity: () => owner, processAlive: () => false, inspect: () => ({ active: false, uncertain: false }), isSteamClosed: () => true,
        confirmAccount: async () => true };
    const binding = installSteamHook({ game, account: '12345', exeName: 'DELTARUNE.exe', profile: root }, settings);
    Staging.importBase(root, source, { backend: 'steam', gameId: 'fixture', exeName: 'DELTARUNE.exe', steam: binding, sharedProgressAcknowledged: true });
    return { dir, source, root, game, settings, binding: binding.binding };
}

function previousBundle(f) {
    const bindingFile = path.join(f.binding, 'binding.json');
    const binding = JSON.parse(fs.readFileSync(bindingFile, 'utf8'));
    for (const name of ['ProtonSteamBridge.js', 'ProtonSteamOptions.js']) {
        const file = path.join(f.binding, name);
        fs.appendFileSync(file, '\n// Previous verified fixture bundle.\n');
        binding.files[name] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    fs.writeFileSync(bindingFile, JSON.stringify(binding), { mode: 0o600 });
    return fs.readFileSync(bindingFile);
}

test('verified helper refresh updates both installed modules without changing options, hook or profile data', t => {
    const f = fixture(t);
    previousBundle(f);
    const optionsFile = path.join(f.game.root, 'userdata/12345/config/localconfig.vdf');
    const before = fs.readFileSync(optionsFile);
    const hook = fs.readFileSync(path.join(f.binding, 'launch'));
    const descriptor = fs.readFileSync(path.join(f.root, 'backend.json'));
    verifySteamProfile(f.root, { updateHelpers: true }, f.settings);
    for (const name of ['ProtonSteamBridge.js', 'ProtonSteamOptions.js']) {
        assert.deepEqual(fs.readFileSync(path.join(f.binding, name)), fs.readFileSync(path.join(__dirname, name)));
    }
    assert.deepEqual(fs.readFileSync(optionsFile), before);
    assert.deepEqual(fs.readFileSync(path.join(f.binding, 'launch')), hook);
    assert.deepEqual(fs.readFileSync(path.join(f.root, 'backend.json')), descriptor);
    assert.equal(fs.existsSync(path.join(f.binding, 'helper-update.json')), false);
    verifySteamProfile(f.root, {}, f.settings);
    verifySteamProfile(f.root, { updateHelpers: true }, f.settings);
});

test('helper refresh refuses Steam, retained sessions, active or uncertain processes and modified helpers', t => {
    for (const blocked of ['steam', 'session', 'active', 'uncertain', 'modified']) {
        const f = fixture(t);
        const before = previousBundle(f);
        if (blocked === 'session') fs.writeFileSync(path.join(f.binding, 'request.json'), '{}');
        if (blocked === 'modified') fs.appendFileSync(path.join(f.binding, 'ProtonSteamBridge.js'), 'changed');
        const settings = { ...f.settings, isSteamClosed: () => blocked !== 'steam',
            inspect: () => ({ active: blocked === 'active', uncertain: blocked === 'uncertain' }) };
        assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, settings), /Steam|session|modified|uncertain/i);
        assert.deepEqual(fs.readFileSync(path.join(f.binding, 'binding.json')), before);
        assert.equal(fs.existsSync(path.join(f.binding, 'helper-update.json')), false);
    }
});

test('interrupted helper promotion remains fenced and resumes only verified old or new bytes', async t => {
    for (const interruptAt of [1, 2, 3]) {
        const f = fixture(t);
        previousBundle(f);
        let promotions = 0;
        const settings = { ...f.settings, promoteHelper: (source, target) => {
            fs.renameSync(source, target);
            if (++promotions === interruptAt) throw new Error('fixture interrupted promotion');
        } };
        assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, settings), /interrupted/);
        assert.ok(fs.existsSync(path.join(f.binding, 'helper-update.json')));
        assert.throws(() => verifySteamProfile(f.root, {}, f.settings), /update.*incomplete/i);
        await assert.rejects(runHook(f.binding, ['/runtime'], hookOptions()), /update.*incomplete/i);
        verifySteamProfile(f.root, { updateHelpers: true }, f.settings);
        assert.equal(fs.existsSync(path.join(f.binding, 'helper-update.json')), false);
        assert.deepEqual(fs.readFileSync(path.join(f.binding, 'ProtonSteamBridge.js')), fs.readFileSync(path.join(__dirname, 'ProtonSteamBridge.js')));
    }
});

test('helper refresh preserves evidence on concurrent Steam restart or changed partial bytes', t => {
    const f = fixture(t);
    previousBundle(f);
    let checks = 0;
    const settings = { ...f.settings, isSteamClosed: () => ++checks < 3 };
    assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, settings), /Steam/);
    assert.ok(fs.existsSync(path.join(f.binding, 'helper-update.json')));
    fs.appendFileSync(path.join(f.binding, 'ProtonSteamBridge.js'), 'unrecognized edit');
    assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, f.settings), /modified|changed/i);
    assert.ok(fs.existsSync(path.join(f.binding, 'helper-update.json')));
});

test('the primary launch refreshes a registered old bundle before preparing or opening Steam', async t => {
    const f = fixture(t);
    previousBundle(f);
    const settings = { ...f.settings, confirmAccount: async () => false };
    assert.equal(await runSteamProfile(f.root, { mods: [], openSteam: async () => assert.fail('Unexpected game launch') }, settings), false);
    assert.deepEqual(fs.readFileSync(path.join(f.binding, 'ProtonSteamOptions.js')), fs.readFileSync(path.join(__dirname, 'ProtonSteamOptions.js')));
});

test('setup repairs a verified old helper without changing its registered identity', t => {
    const f = fixture(t);
    previousBundle(f);
    installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: f.root }, f.settings);
    verifySteamProfile(f.root, {}, f.settings);
    assert.deepEqual(fs.readFileSync(path.join(f.binding, 'ProtonSteamBridge.js')), fs.readFileSync(path.join(__dirname, 'ProtonSteamBridge.js')));
});

test('an update contender cannot replace files while the bundle reservation is owned', t => {
    const f = fixture(t);
    const before = previousBundle(f);
    const release = require('./ProtonLauncher').reserve(f.binding);
    try {
        assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, f.settings), /already active/);
        assert.deepEqual(fs.readFileSync(path.join(f.binding, 'binding.json')), before);
    } finally {
        release();
    }
    verifySteamProfile(f.root, { updateHelpers: true }, f.settings);
});

test('shared helper refresh checks every registered profile for retained sessions', t => {
    const f = fixture(t);
    const other = path.join(f.dir, 'another-profile');
    fs.mkdirSync(other);
    installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: other }, f.settings);
    previousBundle(f);
    fs.writeFileSync(path.join(other, 'steam-session.json'), '{}');
    assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, f.settings), /session/);
    assert.equal(fs.existsSync(path.join(f.binding, 'helper-update.json')), false);
});

test('helper update refuses changed journal identities and unrecognized temporary files', t => {
    for (const changed of ['journal', 'temporary']) {
        const f = fixture(t);
        previousBundle(f);
        const settings = { ...f.settings, promoteHelper: () => { throw new Error('fixture interrupted'); } };
        assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, settings), /interrupted/);
        const journalFile = path.join(f.binding, 'helper-update.json');
        if (changed === 'journal') {
            const plan = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
            plan.next.appid = '999';
            fs.writeFileSync(journalFile, JSON.stringify(plan), { mode: 0o600 });
        } else {
            fs.appendFileSync(path.join(f.binding, 'helper-update-ProtonSteamBridge.js.tmp'), 'unrecognized bytes');
        }
        assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, f.settings), /identity|changed/);
        assert.ok(fs.existsSync(journalFile));
    }
});

test('helper promotion permission failure retains the old manifest and is safely retryable', t => {
    const f = fixture(t);
    const before = previousBundle(f);
    const settings = { ...f.settings, promoteHelper: () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); } };
    assert.throws(() => verifySteamProfile(f.root, { updateHelpers: true }, settings), /permission denied/);
    assert.deepEqual(fs.readFileSync(path.join(f.binding, 'binding.json')), before);
    assert.ok(fs.existsSync(path.join(f.binding, 'helper-update.json')));
    verifySteamProfile(f.root, { updateHelpers: true }, f.settings);
    assert.equal(typeof require(path.join(f.binding, 'ProtonSteamOptions.js')).isProtectedService, 'function');
});

async function request(f, overrides = {}) {
    const stage = await Staging.prepareStage(f.root, []);
    const binding = JSON.parse(fs.readFileSync(path.join(f.binding, 'binding.json')));
    const value = { version: 1, id: crypto.randomBytes(32).toString('hex'), owner, root: f.root,
        appid: '123', source: path.join(f.source, 'DELTARUNE.exe'), stageId: stage.id,
        stage: path.join(stage.game, 'DELTARUNE.exe'), binding: binding.id, expires: Date.now() + 60000,
        executableHash: crypto.createHash('sha256').update('original executable').digest('hex'), ...overrides };
    for (const filename of [path.join(f.binding, 'request.json'), path.join(f.binding, 'session.json'), path.join(f.root, 'steam-session.json')]) {
        fs.writeFileSync(filename, JSON.stringify(value), { mode: 0o600 });
    }
    return value;
}

function command(req) {
    return ['/runtime/launcher', '/Proton/proton', 'waitforexitandrun', req.source, 'two words', '$not-evaluated'];
}

function hookOptions(extra = {}) {
    const start = Date.now();
    let clock = 0;
    return { environment: { SteamAppId: '123', SteamGameId: '123', STEAM_COMPAT_DATA_PATH: '/real/prefix', TEST: 'unchanged', ELECTRON_RUN_AS_NODE: '1' },
        processAlive: () => true, processIdentity: () => ({ ...owner, pid: 23456 }), inspect: () => ({ active: false, uncertain: false }),
        quietMs: 2, now: () => start + clock, delay: async () => { clock += 1; await new Promise(resolve => setImmediate(resolve)); },
        spawnCommand: () => { const child = new EventEmitter(); setImmediate(() => child.emit('close', 0)); return child; }, ...extra };
}

test('bridge preserves the Steam runtime argv and redirects only its exact game executable', () => {
    const source = path.resolve('original game/DELTARUNE.exe');
    const stage = path.resolve('stage/game/DELTARUNE.exe');
    const argv = ['/runtime/launcher', 'container-runtime', '/Proton Experimental/proton', 'waitforexitandrun', source, '--arg', 'two words', '$literal'];
    const result = redirectCommand(argv, { source, stage, appid: '123' }, { SteamAppId: '123' });
    assert.deepEqual(result, [...argv.slice(0, 4), stage, ...argv.slice(5)]);
    assert.equal(argv[4], source);
});

test('command validation rejects wrong apps, executable, verbs and ambiguous chains without evaluation', () => {
    const req = { source: path.resolve('original.exe'), stage: path.resolve('stage.exe'), appid: '123' };
    const argv = ['/Proton/proton', 'waitforexitandrun', req.source];
    for (const env of [{}, { SteamAppId: '456' }, { SteamAppId: '123', SteamGameId: '456' }]) assert.throws(() => redirectCommand(argv, req, env));
    for (const args of [['/Proton/proton', 'run', req.source], ['/other', 'waitforexitandrun', req.source],
        [...argv, req.source], ['/Proton/proton', 'waitforexitandrun', '/wrong.exe']]) assert.throws(() => redirectCommand(args, req, { SteamAppId: '123' }));
});

test('installed helper is app-owned, repair is idempotent and unknown account/changed helper is refused', t => {
    const f = fixture(t);
    assert.ok(fs.existsSync(path.join(f.binding, 'launch')));
    assert.ok(!fs.readFileSync(path.join(f.binding, 'launch'), 'utf8').includes('eval'));
    installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: f.root }, f.settings);
    assert.throws(() => installSteamHook({ game: f.game, account: '999', exeName: 'DELTARUNE.exe', profile: f.root }, f.settings), /account/);
    fs.appendFileSync(path.join(f.binding, 'launch'), '\nchanged');
    assert.throws(() => installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: f.root }, f.settings), /modified/);
});

test('normal Steam Play passes literal argv and environment, without reading or touching saves', async t => {
    const f = fixture(t);
    let call;
    const args = ['/runtime', 'literal $arg', 'two words'];
    const result = await runHook(f.binding, args, hookOptions({ spawnCommand: (exe, argv, options) => {
        call = { exe, argv, options };
        const child = new EventEmitter(); setImmediate(() => child.emit('close', 0)); return child;
    } }));
    assert.equal(result, 0);
    assert.deepEqual([call.exe, ...call.argv], args);
    assert.equal(call.options.env.STEAM_COMPAT_DATA_PATH, '/real/prefix');
    assert.equal(call.options.env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'original data');
});

test('one-use handoff preserves Steam prefix/runtime and waits across chapter transitions', async t => {
    const f = fixture(t);
    const req = await request(f);
    let call;
    let inspections = 0;
    const result = await runHook(f.binding, command(req), hookOptions({
        inspect: () => ({ active: [true, false, true, false, false, false][inspections++] || false, uncertain: false }),
        spawnCommand: (exe, argv, options) => {
            call = { exe, argv, options };
            const child = new EventEmitter(); setImmediate(() => child.emit('close', 0)); return child;
        }
    }));
    assert.equal(result, 0);
    assert.deepEqual([call.exe, ...call.argv], ['/runtime/launcher', '/Proton/proton', 'waitforexitandrun', req.stage, 'two words', '$not-evaluated']);
    assert.equal(call.options.cwd, path.dirname(req.stage));
    assert.equal(call.options.shell, false);
    assert.equal(call.options.env.STEAM_COMPAT_DATA_PATH, '/real/prefix');
    assert.equal(call.options.env.DELTAMOD_STEAM_SESSION, req.id);
    assert.ok(inspections >= 6);
    await assert.rejects(runHook(f.binding, command(req), hookOptions()), /already claimed/);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'original data');
});

test('invalid, stale, abandoned, modified and mismatched requests never fall back to vanilla', async t => {
    for (const change of [{ expires: 1 }, { appid: '456' }, { binding: 'wrong' }, { stageId: '../escape' }, { executableHash: '0'.repeat(64) }]) {
        const f = fixture(t);
        const req = await request(f, change);
        let launched = false;
        await assert.rejects(runHook(f.binding, command(req), hookOptions({ spawnCommand: () => { launched = true; throw new Error('must not launch'); } })));
        assert.equal(launched, false);
        assert.ok(fs.existsSync(path.join(f.binding, 'request.json')));
    }
    const f = fixture(t);
    const req = await request(f);
    await assert.rejects(runHook(f.binding, command(req), hookOptions({ processAlive: () => false })), /abandoned/);
});

test('unknown process state or helper failure retains the stage and marks the session', async t => {
    const f = fixture(t);
    const req = await request(f);
    const reason = 'process 9: environ EACCES (fixture)';
    assert.equal(await runHook(f.binding, command(req), hookOptions({ inspect: () => ({ uncertain: true, active: false, reason }) })), 1);
    const status = JSON.parse(fs.readFileSync(path.join(f.binding, 'status.json')));
    assert.equal(status.phase, 'uncertain');
    assert.equal(status.message, reason);
    assert.ok(fs.existsSync(req.stage));
    const g = fixture(t);
    const other = await request(g);
    await assert.rejects(runHook(g.binding, command(other), hookOptions({ spawnCommand: () => { throw new Error('missing runtime'); } })), /missing runtime/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(g.binding, 'status.json'))).phase, 'failed');
});

test('a helper that exits after claiming the request reports failure and retains the stage', async t => {
    const f = fixture(t);
    let request;
    let waits = 0;
    const settings = { ...f.settings, delay: async () => {
        if (++waits > 2) throw new Error('Unexpected continued wait for an exited helper.');
    } };
    await assert.rejects(runSteamProfile(f.root, { mods: [], openSteam: async () => {
        const pending = path.join(f.binding, 'request.json');
        request = JSON.parse(fs.readFileSync(pending, 'utf8'));
        fs.renameSync(pending, path.join(f.binding, 'claimed.json'));
        fs.writeFileSync(path.join(f.binding, 'status.json'), JSON.stringify({ id: request.id, phase: 'claimed', helper: owner }), { mode: 0o600 });
    } }, settings), /Steam hook exited before confirming completion/);
    assert.ok(fs.existsSync(request.stage));
    assert.ok(fs.existsSync(path.join(f.root, 'steam-session.json')));
    assert.ok(fs.existsSync(path.join(f.binding, 'claimed.json')));
});

test('main launcher retains unclaimed timeout and refuses duplicate app/profile launches', async t => {
    const f = fixture(t);
    let clock = Date.now();
    const settings = { ...f.settings, now: () => clock, startupMs: 10, delay: async () => { clock += 20; } };
    let uri;
    await assert.rejects(runSteamProfile(f.root, { mods: [], openSteam: value => { uri = value; } }, settings), /did not claim/);
    assert.equal(uri, 'steam://rungameid/123');
    assert.ok(fs.existsSync(path.join(f.binding, 'request.json')));
    assert.equal(fs.readdirSync(path.join(f.root, 'work')).length, 1);
    await assert.rejects(runSteamProfile(f.root, { mods: [] }, settings), error => isLeftoverSession(error) && /did not finish cleanly/.test(error.message));
});

test('main launch verifies actual hook completion before stage cleanup and preserves normal prefix', async t => {
    const f = fixture(t);
    const result = await runSteamProfile(f.root, { mods: [], openSteam: async () => {
        const req = JSON.parse(fs.readFileSync(path.join(f.binding, 'request.json')));
        await runHook(f.binding, command(req), hookOptions());
    } }, f.settings);
    assert.equal(result, true);
    assert.equal(fs.readdirSync(path.join(f.root, 'work')).length, 0);
    assert.equal(fs.readdirSync(path.join(f.root, 'prefix')).length, 0);
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'original data');
});

test('already-running/uncertain games and pre-handoff cancellation never leave session locks', async t => {
    const f = fixture(t);
    for (const state of [{ active: true }, { uncertain: true }]) {
        const settings = { ...f.settings, inspect: () => state };
        await assert.rejects(runSteamProfile(f.root, { mods: [] }, settings), /already running/);
    }
    await assert.rejects(runSteamProfile(f.root, { mods: [], args: ['unsupported'] }, f.settings), /arguments/);
    assert.equal(fs.existsSync(path.join(f.root, 'steam-session.json')), false);
    assert.equal(fs.existsSync(path.join(f.binding, 'session.json')), false);
});

test('restart recovery requires dead owners, inactive processes and Steam exited', async t => {
    const f = fixture(t);
    const req = await request(f);
    const liveOwner = { ...f.settings, processAlive: () => true };
    assert.throws(() => recoverSteamProfile(f.root, liveOwner), /active or uncertain/);
    const steamRunning = { ...f.settings, isSteamClosed: () => false };
    assert.throws(() => recoverSteamProfile(f.root, steamRunning), /Exit Steam/);
    assert.equal(recoverSteamProfile(f.root, f.settings), true);
    assert.equal(fs.existsSync(req.stage), false);
    assert.equal(fs.existsSync(path.join(f.binding, 'session.json')), false);
});

// Leaves the files an uncertain hook exit retains: the claimed request, the app lock, the status and the profile lock.
async function uncertainSession(f) {
    const req = await request(f);
    fs.renameSync(path.join(f.binding, 'request.json'), path.join(f.binding, 'claimed.json'));
    fs.writeFileSync(path.join(f.binding, 'status.json'), JSON.stringify({
        id: req.id, phase: 'uncertain', helper: owner, message: 'process 9: environ EACCES (fixture)'
    }), { mode: 0o600 });
    return req;
}

test('the hook reason for an uncertain session reaches the launch error', async t => {
    const f = fixture(t);
    await assert.rejects(runSteamProfile(f.root, { mods: [], openSteam: async () => {
        const pending = path.join(f.binding, 'request.json');
        const req = JSON.parse(fs.readFileSync(pending, 'utf8'));
        fs.renameSync(pending, path.join(f.binding, 'claimed.json'));
        fs.writeFileSync(path.join(f.binding, 'status.json'), JSON.stringify({
            id: req.id, phase: 'uncertain', helper: owner, message: 'process 9: environ EACCES (fixture)'
        }), { mode: 0o600 });
    } }, f.settings), /uncertain[\s\S]*process 9: environ EACCES \(fixture\)/);
});

test('a leftover session blocks the next launch with a recoverable error, and recovery works after the profile lock was deleted', async t => {
    const f = fixture(t);
    const req = await uncertainSession(f);
    fs.unlinkSync(path.join(f.root, 'steam-session.json'));
    const before = fs.readdirSync(f.binding).sort();
    const launch = () => runSteamProfile(f.root, { mods: [], openSteam: async () => assert.fail('Unexpected game launch') }, f.settings);
    await assert.rejects(launch(), error => isLeftoverSession(error) &&
        /did not finish cleanly/.test(error.message) && /process 9: environ EACCES \(fixture\)/.test(error.message));
    assert.deepEqual(fs.readdirSync(f.binding).sort(), before);
    assert.ok(fs.existsSync(req.stage));

    assert.equal(recoverSteamProfile(f.root, f.settings), true);
    assert.equal(fs.existsSync(req.stage), false);
    for (const name of ['session.json', 'claimed.json', 'status.json']) assert.equal(fs.existsSync(path.join(f.binding, name)), false);
    assert.equal(recoverSteamProfile(f.root, f.settings), false);
    assert.equal(await runSteamProfile(f.root, { mods: [] }, { ...f.settings, confirmAccount: async () => false }), false);
});

test('a helper updated right after recovery lets the next launch run with Steam reopened', async t => {
    const steamOpen = f => ({ ...f.settings, isSteamClosed: () => false, confirmAccount: async () => false });
    const stale = fixture(t);
    await uncertainSession(stale);
    previousBundle(stale);
    assert.equal(recoverSteamProfile(stale.root, stale.settings), true);
    await assert.rejects(runSteamProfile(stale.root, { mods: [] }, steamOpen(stale)), /helper update required.*without reopening Steam/);

    const f = fixture(t);
    await uncertainSession(f);
    previousBundle(f);
    assert.equal(recoverSteamProfile(f.root, f.settings), true);
    assert.throws(() => updateSteamHelper(f.root, steamOpen(f)), /helper update required/);
    updateSteamHelper(f.root, f.settings);
    for (const name of ['ProtonSteamBridge.js', 'ProtonSteamOptions.js']) {
        assert.deepEqual(fs.readFileSync(path.join(f.binding, name)), fs.readFileSync(path.join(__dirname, name)));
    }
    assert.equal(await runSteamProfile(f.root, { mods: [] }, steamOpen(f)), false);
});

test('recovery with only the profile lock left clears it, and mismatched or foreign session files are refused untouched', async t => {
    const f = fixture(t);
    const req = await request(f);
    Staging.discardStage(f.root, req.stageId);
    for (const name of ['request.json', 'session.json']) fs.unlinkSync(path.join(f.binding, name));
    assert.equal(recoverSteamProfile(f.root, f.settings), true);
    assert.equal(fs.existsSync(path.join(f.root, 'steam-session.json')), false);

    const g = fixture(t);
    const mismatched = await uncertainSession(g);
    fs.writeFileSync(path.join(g.root, 'steam-session.json'), JSON.stringify({ ...mismatched, id: 'b'.repeat(64) }), { mode: 0o600 });
    assert.throws(() => recoverSteamProfile(g.root, g.settings), /does not belong/);
    assert.ok(fs.existsSync(mismatched.stage));
    assert.ok(fs.existsSync(path.join(g.binding, 'claimed.json')));

    const other = fixture(t);
    const foreign = await uncertainSession(other);
    fs.unlinkSync(path.join(other.root, 'steam-session.json'));
    fs.writeFileSync(path.join(other.binding, 'session.json'), JSON.stringify({ ...foreign, root: path.join(other.dir, 'elsewhere') }), { mode: 0o600 });
    await assert.rejects(runSteamProfile(other.root, { mods: [] }, other.settings), error => !isLeftoverSession(error) && /Another Deltamod profile/.test(error.message));
    assert.throws(() => recoverSteamProfile(other.root, other.settings), /does not belong/);
    assert.ok(fs.existsSync(foreign.stage));
});

test('real generated Linux hook preserves quoted arguments with a disposable fake Steam command', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const script = path.join(f.dir, "fake command ' quoted.js");
    const output = path.join(f.dir, 'observed.json');
    fs.writeFileSync(script, 'require("fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));');
    const args = [process.execPath, script, output, 'a b', '$literal', 'quote\"'];
    const code = await new Promise((resolve, reject) => {
        const child = spawn(path.join(f.binding, 'launch'), args, { shell: false, stdio: 'pipe' });
        let stderr = '';
        child.stderr.on('data', data => { stderr += data; });
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve(code) : reject(new Error(stderr)));
    });
    assert.equal(code, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(output)), ['a b', '$literal', 'quote\"']);
});

test('real Linux hook authenticates the handoff and supervises a fake Proton command without changing vanilla', { skip: process.platform !== 'linux' }, async t => {
    const f = fixture(t);
    const actualOwner = identity();
    const req = await request(f, { owner: actualOwner });
    const fakeProton = path.join(f.dir, 'proton');
    const output = path.join(f.dir, 'observed.json');
    const prefix = path.join(f.dir, 'existing-prefix');
    fs.mkdirSync(prefix);
    fs.writeFileSync(fakeProton, 'const fs=require("fs"); fs.writeFileSync(process.argv[4],JSON.stringify({ argv:process.argv.slice(2),cwd:process.cwd(),prefix:process.env.STEAM_COMPAT_DATA_PATH,app:process.env.SteamAppId,session:process.env.DELTAMOD_STEAM_SESSION })); setTimeout(()=>{},300);');
    const code = await new Promise((resolve, reject) => {
        const child = spawn(path.join(f.binding, 'launch'), [process.execPath, fakeProton, 'waitforexitandrun', req.source, output, 'literal $arg'],
            { env: { ...process.env, SteamAppId: '123', SteamGameId: '123', STEAM_COMPAT_DATA_PATH: prefix }, shell: false, stdio: 'pipe' });
        let stderr = '';
        child.stderr.on('data', data => { stderr += data; });
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve(code) : reject(new Error(stderr)));
    });
    assert.equal(code, 0);
    const observed = JSON.parse(fs.readFileSync(output));
    assert.deepEqual(observed.argv, ['waitforexitandrun', req.stage, output, 'literal $arg']);
    assert.equal(observed.cwd, path.dirname(req.stage));
    assert.equal(observed.prefix, prefix);
    assert.equal(observed.app, '123');
    assert.equal(observed.session, req.id);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.binding, 'status.json'))).phase, 'done');
    assert.equal(fs.readFileSync(path.join(f.source, 'data.win'), 'utf8'), 'original data');
    assert.equal(fs.readdirSync(prefix).length, 0);
});

test('Linux process inspection tracks session children and fails closed on inaccessible new processes', { skip: process.platform !== 'linux' }, () => {
    const proc = { readdirSync: () => ['100', '101', '102'], statSync: () => ({ uid: process.getuid() }),
        readFileSync: filename => {
            if (filename.includes('/102/')) { const error = new Error('denied'); error.code = 'EACCES'; throw error; }
            if (filename.endsWith('/stat')) { const fields = Array(20).fill('0'); fields[0] = 'S'; fields[19] = filename.includes('/100/') ? '50' : '150'; return '101 (fixture) ' + fields.join(' '); }
            if (filename.endsWith('/environ')) return 'DELTAMOD_STEAM_SESSION=owned\0';
            return '/fixture\0';
        } };
    const activity = inspectActivity({ id: 'owned', afterBirth: '100' }, proc);
    assert.equal(activity.active, true);
    assert.equal(activity.uncertain, true);
    assert.match(activity.reason, /process 102:/);
});

test('generated Linux helper runs under the installed Electron Node mode, without a system Node helper requirement', { skip: !electronRuntime }, async t => {
    const f = fixture(t, electronRuntime);
    const script = path.join(f.dir, 'observed.js');
    const output = path.join(f.dir, 'electron-output');
    fs.writeFileSync(script, 'require("fs").writeFileSync(process.argv[2],"literal "+process.argv[3]);');
    const result = await new Promise((resolve, reject) => {
        const child = spawn(path.join(f.binding, 'launch'), [process.execPath, script, output, '$not-a-shell'], { shell: false, stdio: 'pipe' });
        let stderr = '';
        child.stderr.on('data', data => { stderr += data; });
        child.once('error', reject);
        child.once('close', code => code === 0 ? resolve(code) : reject(new Error(stderr)));
    });
    assert.equal(result, 0);
    assert.equal(fs.readFileSync(output, 'utf8'), 'literal $not-a-shell');
});

test('production setup rejects temporary storage without altering the confirmed Steam options', { skip: process.platform !== 'linux' }, t => {
    const f = fixture(t);
    const config = path.join(f.game.root, 'userdata/12345/config/localconfig.vdf');
    const before = fs.readFileSync(config);
    const settings = { ...f.settings, assertDurable: require('./ProtonSteamOptions').durablePath };
    assert.throws(() => installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: f.root }, settings), /persistent/);
    assert.deepEqual(fs.readFileSync(config), before);
});

test('app-level exclusion also blocks a different profile registered to the same game', async t => {
    const f = fixture(t);
    let clock = Date.now();
    const settings = { ...f.settings, now: () => clock, startupMs: 10, delay: async () => { clock += 20; } };
    const second = path.join(f.dir, 'second-profile');
    fs.mkdirSync(second);
    const root = path.join(second, 'proton');
    const steam = installSteamHook({ game: f.game, account: '12345', exeName: 'DELTARUNE.exe', profile: root }, settings);
    Staging.importBase(root, f.source, { backend: 'steam', gameId: 'fixture', exeName: 'DELTARUNE.exe', steam, sharedProgressAcknowledged: true });
    const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    const paths = [path.join(f.source, 'data.win'), path.join(f.source, 'DELTARUNE.exe'), path.join(f.root, 'base/data.win'), path.join(root, 'base/data.win')];
    const before = paths.map(hash);
    await assert.rejects(runSteamProfile(f.root, { mods: [], openSteam: () => {} }, settings), /did not claim/);
    await assert.rejects(runSteamProfile(root, { mods: [], openSteam: () => {} }, settings), /Another Deltamod profile/);
    assert.equal(fs.existsSync(path.join(root, 'steam-session.json')), false);
    assert.equal(fs.readdirSync(path.join(root, 'work')).length, 0);
    assert.deepEqual(paths.map(hash), before);
});

test('declining account confirmation creates no stage, request or Steam launch', async t => {
    const f = fixture(t);
    const settings = { ...f.settings, confirmAccount: async () => false };
    let opened = false;
    assert.equal(await runSteamProfile(f.root, { mods: [], openSteam: () => { opened = true; } }, settings), false);
    assert.equal(opened, false);
    assert.equal(fs.existsSync(path.join(f.binding, 'session.json')), false);
    assert.equal(fs.existsSync(path.join(f.root, 'steam-session.json')), false);
    assert.equal(fs.readdirSync(path.join(f.root, 'work')).length, 0);
});

test('modified helper is refused before staging or opening Steam, even when Launch Options match', async t => {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.binding, 'launch'), '\nchanged');
    let opened = false;
    await assert.rejects(runSteamProfile(f.root, { mods: [], openSteam: () => { opened = true; } }, f.settings), /modified/);
    assert.equal(opened, false);
    assert.equal(fs.readdirSync(path.join(f.root, 'work')).length, 0);
});

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
            const record = records[filename.split('/')[2]];
            if (!record) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
            const name = path.basename(filename);
            if (record.errors?.[name]) throw Object.assign(new Error('fixture read failure'), { code: record.errors[name] });
            if (name === 'stat') {
                const fields = Array(20).fill('0');
                fields[0] = record.state || 'S';
                fields[1] = String(record.ppid ?? 1);
                fields[19] = String(record.birth ?? 300);
                return `123 (${record.comm}) ${fields.join(' ')}`;
            }
            if (name === 'cmdline') return (record.argv || []).join('\0') + '\0';
            if (name === 'environ') return (record.env || []).join('\0') + '\0';
            throw new Error(`Unexpected fixture read: ${filename}`);
        }
    };
}

test('Steam inspection permits verified protected desktop and SSH services', { skip: process.platform !== 'linux' }, () => {
    const proc = processTable({
        100: { comm: 'systemd', argv: ['/usr/lib/systemd/systemd', '--user'], errors: { environ: 'EACCES' } },
        101: { comm: '(sd-pam)', argv: ['(sd-pam)'], ppid: 100, errors: { environ: 'EPERM' } },
        102: { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EACCES' } },
        103: { comm: 'polkit-kde-auth', argv: ['/usr/lib/polkit-kde-authentication-agent-1'], errors: { environ: 'EACCES' } },
        104: { comm: 'sshd-session', argv: ['sshd-session: fixture@notty'], ppid: 99, errors: { environ: 'EACCES' } },
        99: { comm: 'sshd-session', argv: ['sshd-session: fixture [priv]'], uid: 0, listed: false }
    });
    assert.deepEqual(inspectActivity({ appid: '123', root: '/owned', wholeApp: true }, proc), { active: false, uncertain: false });
});

test('Steam inspection keeps ambiguous runtimes, bad permissions and unreadable argv uncertain', { skip: process.platform !== 'linux' }, () => {
    for (const record of [
        { comm: 'wine', argv: ['/usr/bin/wine'], errors: { environ: 'EACCES' } },
        { comm: 'kwin_wayland', argv: ['/home/user/kwin_wayland'], errors: { environ: 'EPERM' } },
        { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EIO' } },
        { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { cmdline: 'EACCES' } }
    ]) {
        const activity = inspectActivity({ root: '/owned' }, processTable({ 100: record }));
        assert.equal(activity.uncertain, true);
        assert.match(activity.reason, /process 100:/);
    }
    const service = { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EACCES' } };
    assert.equal(inspectActivity({}, processTable({ 100: service }, { uid: process.getuid(), mode: 0o100777 })).uncertain, true);
});

test('Steam profile ownership wins over a protected service name before environment access', { skip: process.platform !== 'linux' }, () => {
    const activity = inspectActivity({ root: '/owned' }, processTable({
        100: { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland', '/owned/work/stage/game/DELTARUNE.exe'], errors: { environ: 'EACCES' } }
    }));
    assert.equal(activity.active, true);
    assert.equal(activity.uncertain, true);
});

test('Steam inspection retains app/session tracking and ignores unrelated, dead and old processes', { skip: process.platform !== 'linux' }, () => {
    for (const env of [['SteamAppId=123'], ['SteamGameId=123'], ['DELTAMOD_STEAM_SESSION=owned']]) {
        assert.equal(inspectActivity({ appid: '123', id: 'owned', wholeApp: true }, processTable({ 100: { comm: 'game', env } })).active, true);
    }
    const proc = processTable({
        100: { comm: 'old', birth: 10, errors: { environ: 'EACCES' } },
        101: { comm: 'dead', state: 'Z', errors: { environ: 'EACCES' } },
        102: { comm: 'unrelated', env: ['SteamAppId=456'] },
        103: { comm: 'other-user', uid: process.getuid() + 1, errors: { environ: 'EACCES' } }
    });
    assert.deepEqual(inspectActivity({ appid: '123', wholeApp: true, afterBirth: '100' }, proc), { active: false, uncertain: false });
});

test('Steam permission exceptions reject PID reuse and unverified service parents', { skip: process.platform !== 'linux' }, () => {
    const proc = processTable({ 100: { comm: 'kwin_wayland', argv: ['/usr/bin/kwin_wayland'], errors: { environ: 'EACCES' } } });
    const read = proc.readFileSync;
    let reads = 0;
    proc.readFileSync = filename => {
        const value = read(filename);
        return filename.endsWith('/stat') && ++reads > 1 ? value.replace(/300$/, '301') : value;
    };
    assert.equal(inspectActivity({}, proc).uncertain, true);
    assert.equal(inspectActivity({}, processTable({ 100: { comm: '(sd-pam)', argv: ['(sd-pam)'], ppid: 99, errors: { environ: 'EACCES' } } })).uncertain, true);
});
