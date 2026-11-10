const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const Staging = require('./ProtonStaging');

function harness(t, platform = 'linux', realStorage = false) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deltamod-ipc-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const profile = path.join(dir, 'deltamod_system-0');
    const source = path.join(dir, 'source');
    const database = path.join(dir, 'pkg.db');
    const runner = path.join(dir, 'Proton');
    for (const folder of [profile, source, database, runner]) fs.mkdirSync(folder);
    fs.writeFileSync(path.join(source, 'DELTARUNE.exe'), 'fixture executable');
    fs.writeFileSync(path.join(source, 'data.win'), 'vanilla');
    fs.writeFileSync(path.join(runner, 'proton'), 'runner');
    fs.chmodSync(path.join(runner, 'proton'), 0o755);
    fs.mkdirSync(path.join(dir, 'deltamod_system-unique'));
    const stores = { 0: { gamePath: source, gamePid: 'fixture', isSteam: true, steamAppId: '123' } };
    fs.writeFileSync(path.join(profile, 'store.json'), JSON.stringify(stores[0]));
    const handlers = new Map();
    const listeners = new Map();
    const errors = [];
    const calls = [];
    const messages = [];
    const choices = [];
    const files = [];
    const runtimeSetup = { select: async () => { calls.push('umu-setup'); return files.shift() || null; } };
    const protonSelection = { select: async () => files.shift() || null };
    const protonLauncher = {
        ...require('./ProtonLauncher'),
        runProtonProfile: async (root, options) => { calls.push({ root, options }); return true; },
        removeProtonProfile: async (root, dispose) => { calls.push({ umuRemove: root }); dispose(); }
    };
    const steamBridge = {
        steamBindingDirectory: () => path.join(dir, 'steam-bridge'),
        installSteamHook: async options => { calls.push({ steamInstall: options }); return options; },
        runSteamProfile: async (root, options) => { calls.push({ steamRun: root, options }); return true; },
        removeSteamProfile: (root, options = {}) => { calls.push({ steamRemove: root }); options.dispose?.(); return true; },
        recoverSteamProfile: root => { calls.push({ steamRecover: root }); return true; },
        updateSteamHelper: root => { calls.push({ steamHelperUpdate: root }); },
        isLeftoverSession: require('./ProtonSteamBridge').isLeftoverSession
    };
    let current = '0';
    let restores = 0;
    let patches = 0;
    const win = { isDestroyed: () => false, setProgressBar: value => calls.push({ progress: value }),
        webContents: { send: (...args) => messages.push(args) } };
    let keyValue = {
        readKVS: key => stores[current][key],
        readKVSOfIndex: (key, index) => stores[index]?.[key],
        setKVSOfIndex: (key, value, index) => {
            stores[index] ||= {};
            stores[index][key] = value;
            fs.writeFileSync(path.join(dir, `deltamod_system-${index}`, 'store.json'), JSON.stringify(stores[index]));
        }, retrieve: () => {}
    };
    const system = {
        getCurrentSystemIndex: () => current,
        setSystemIndex: index => { current = String(index); },
        healthCheck() {},
        getSystemFileOfIndex: (file, index) => path.join(dir, `deltamod_system-${index}`, file),
        getSystemFolderOfIndex: (folder, index) => path.join(dir, `deltamod_system-${index}`, folder),
        getSystemFolder: folder => folder === 'deltaruneInstall' ? stores[0].gamePath : path.join(profile, folder),
        getSystemFile: (file, unique) => path.join(dir, unique ? 'deltamod_system-unique' : `deltamod_system-${current}`, file), getPacketDatabase: () => database
    };
    const game = { id: 'fixture', name: 'Fixture game', exeName: 'DELTARUNE.exe',
        availableFeatures: [{ feat: 'steam', data: { appid: '123' } }] };
    const electron = {
        app: { getPath: () => dir, relaunch: () => calls.push('relaunch'), exit: () => calls.push('exit'), quit: () => calls.push('quit') },
        ipcMain: { handle: (name, callback) => handlers.set(name, callback), on: (name, callback) => listeners.set(name, callback),
            emit: (name, ...args) => listeners.get(name)?.(...args) },
        dialog: { showErrorBox: (...args) => errors.push(args),
            showMessageBoxSync: options => { calls.push({ nativeDialog: options }); return choices.shift() ?? 0; },
            showMessageBox: async () => ({ response: choices.shift() ?? 1 }),
            showOpenDialog: async () => ({ canceled: false, filePaths: [files.shift()] }) },
        shell: { openExternal: uri => calls.push(uri) },
        clipboard: { writeText: value => calls.push({ clipboard: value }) }
    };
    if (realStorage) {
        const storage = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'KeyValue.js'), 'utf8'), {
            module: storage,
            require: name => ({ './System.js': system, './Console.js': { log() {} }, electron }[name] || require(name))
        });
        keyValue = storage.exports;
        keyValue.retrieve();
    }
    const modList = [];
    const modules = {
        './Modstore': { modList: () => ({ modList, errors: [] }) },
        electron, fs, path, os, crypto: require('node:crypto'), './System': system, './KeyValue': keyValue,
        './GameDB': { getGames: () => [game], getGameById: id => id === game.id ? game : null },
        './SteamUtils/FindGame': { findGame: () => source },
        './Console': { log() {}, error() {} }, './Accounts/GameBanana.js': {},
        './ProtonStaging': Staging,
        './Junction': { deleteJunction: target => calls.push({ junction: target }) },
        './ProtonSetup': { selectRuntime: (settings, options) => runtimeSetup.select(options),
            selectProton: options => protonSelection.select(options),
            discoverSteamGame: () => ({ root: dir, source, appid: '123', accounts: [{ account: '12345', name: 'Fixture' }] }) },
        './ProtonSteamBridge': steamBridge,
        './ProtonSteamOptions': { durablePath: value => value },
        './ProgressModal': { createProgressModal: () => {
            let destroyed = false;
            return { isDestroyed: () => destroyed, destroy: () => { destroyed = true; calls.push('progress-destroyed'); },
                webContents: { executeJavaScript: async code => { calls.push({ progressScript: code }); } } };
        } },
        './ProtonLauncher': protonLauncher,
        './Utils': { page: value => calls.push(value), properRelaunch: () => ({}) },
        './GamePatching': { restore: () => { restores++; },
            startGamePatch: async () => { patches++; return { patched: false, log: 'fixture legacy failure' }; },
            getStagedDeltaHelper: () => undefined }
    };
    const load = file => {
        const module = { exports: {} };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
            require: name => modules[name] || {}, module, __dirname, process: { platform, argv: [] }, console,
            setTimeout, clearTimeout, setInterval, clearInterval
        }, { filename: file });
        return module.exports;
    };
    modules['./ProtonDialogs'] = load('ProtonDialogs.js');
    load('IPCHandlers.js')({ getWindow: () => win, state: {}, errorWin: message => errors.push(message) });
    return { dir, profile, source, runner, stores, handlers, listeners, errors, calls, messages, choices, files,
        keyValue, modList, currentIndex: () => current,
        runtimeSetup, protonSelection, protonLauncher, steamBridge, restoreCount: () => restores, patchCount: () => patches, switchIndex: index => { current = index; } };
}

test('failed UMU removal shows the process reason without directing users to Steam recovery', async t => {
    const h = harness(t);
    const root = path.join(h.profile, 'proton');
    Staging.importBase(root, h.source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: h.runner });
    h.protonLauncher.removeProtonProfile = async () => { throw new Error('process 123: environ EACCES (wine64)'); };
    h.choices.push(0);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), false);
    const [title, message] = h.errors[0];
    assert.equal(title, 'Installation not removed');
    assert.match(message, /process 123: environ EACCES/);
    assert.match(message, /retry.*Delete/i);
    assert.doesNotMatch(message, /Manage Steam Launch Options|Recover abandoned launch/);
    assert.equal(fs.existsSync(root), true);
    assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
});

test('failed Steam removal identifies the existing Options recovery path', async t => {
    const h = harness(t);
    h.choices.push(0, 0, 0);
    assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), true);
    h.steamBridge.removeSteamProfile = () => { throw new Error('retained Steam fixture'); };
    h.choices.push(0);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['1']), false);
    const message = h.errors.at(-1)[1];
    assert.match(message, /retained Steam fixture/);
    assert.match(message, /Options → Disconnect Steam from Deltamod → Recover abandoned launch/);
    assert.doesNotMatch(message, /Abandoned UMU/);
    assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-1/proton')), true);
});

test('Steam-managed import acknowledges shared progress, installs the hook and routes ahead of UMU and legacy patching', async t => {
    const h = harness(t);
    h.choices.push(0, 0, 0);
    assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), true);
    const root = path.join(h.dir, 'deltamod_system-1/proton');
    const descriptor = Staging.readDescriptor(root);
    assert.equal(descriptor.backend, 'steam');
    assert.equal(descriptor.sharedProgressAcknowledged, true);
    assert.equal(descriptor.steam.account, '12345');
    assert.ok(h.calls.some(call => call.steamInstall));
    assert.equal(h.calls.includes('umu-setup'), false);
    h.switchIndex('1');
    assert.equal(await h.handlers.get('patchAndRun')({}, [[]]), true);
    assert.ok(h.calls.some(call => call.steamRun === root));
    assert.equal(h.restoreCount(), 0);
    assert.equal(h.patchCount(), 0);
});

test('a leftover Steam session offers recovery on the spot instead of a launch error', async t => {
    for (const recover of [true, false]) {
        const h = harness(t);
        h.choices.push(0, 0, 0);
        assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), true);
        const root = path.join(h.dir, 'deltamod_system-1/proton');
        h.steamBridge.runSteamProfile = async () => {
            const message = 'An earlier Steam launch did not finish cleanly.\n\nprocess 9: environ EACCES (fixture)';
            throw Object.assign(new Error(message), { code: 'DELTAMOD_STEAM_LEFTOVER_SESSION' });
        };
        h.switchIndex('1');
        h.choices.push(recover ? 0 : 1);
        assert.equal(await h.handlers.get('patchAndRun')({}, [[]]), false);
        const prompt = h.calls.find(call => call.nativeDialog?.title === 'Earlier Steam launch not finished');
        assert.match(prompt.nativeDialog.message, /environ EACCES \(fixture\)/);
        assert.equal(h.calls.some(call => call.steamRecover === root), recover);
        assert.equal(h.calls.some(call => call.steamHelperUpdate === root), recover);
        if (recover) {
            const done = h.calls.filter(call => call.nativeDialog).at(-1).nativeDialog;
            assert.equal(done.message, 'Earlier Steam launch recovered. Reopen Steam, then launch again.');
        }
        assert.deepEqual(h.errors, []);
    }
});

test('recovery updates the Steam helper while Steam is exited, and says so when it cannot', async t => {
    for (const refused of [false, true]) {
        const h = harness(t);
        h.choices.push(0, 0, 0);
        assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), true);
        const root = path.join(h.dir, 'deltamod_system-1/proton');
        h.steamBridge.recoverSteamProfile = () => false;
        h.steamBridge.updateSteamHelper = updated => {
            h.calls.push({ steamHelperUpdate: updated });
            if (refused) throw new Error('Steam helper update required. Fully exit Steam (fixture).');
        };
        h.steamBridge.runSteamProfile = async () => {
            throw Object.assign(new Error('An earlier Steam launch did not finish cleanly.'), { code: 'DELTAMOD_STEAM_LEFTOVER_SESSION' });
        };
        h.switchIndex('1');
        h.choices.push(0);
        assert.equal(await h.handlers.get('patchAndRun')({}, [[]]), false);
        assert.ok(h.calls.some(call => call.steamHelperUpdate === root));
        const done = h.calls.filter(call => call.nativeDialog).at(-1).nativeDialog;
        const refusal = 'No leftover Steam session was found.\n\nThe Steam helper could not be updated yet: Steam helper update required. Fully exit Steam (fixture).';
        if (refused) assert.equal(done.message, refusal);
        else assert.equal(done.message, 'No leftover Steam session was found. Reopen Steam, then launch again.');
        assert.deepEqual(h.errors, []);
    }
});

test('Steam account or shared-progress cancellation stops before profile and hook creation', async t => {
    for (const choices of [[0, 1], [0, 0, 1]]) {
        const h = harness(t);
        h.choices.push(...choices);
        assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), false);
        assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-1')), false);
        assert.equal(h.calls.some(call => call.steamInstall), false);
    }
});

test('native Steam management can repair, unregister or recover without activating legacy game patching', async t => {
    for (const [action, property] of [[0, 'steamInstall'], [1, 'steamRemove'], [2, 'steamRecover']]) {
        const h = harness(t);
        h.choices.push(0, 0, 0);
        assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), true);
        h.switchIndex('1');
        h.calls.length = 0;
        h.choices.push(action);
        assert.equal(h.handlers.get('removeSteamIntegration')(), true);
        assert.ok(h.calls.some(call => call[property]));
        assert.equal(h.calls.some(call => call.steamHelperUpdate), action === 2);
        assert.equal(h.stores[1].isSteam, true);
        assert.equal(h.patchCount(), 0);
        assert.equal(h.calls.includes('relaunch'), false);
    }
});

test('failed managed setup retains the base and reports the failure without launching or loading a profile', async t => {
    const h = harness(t);
    h.steamBridge.installSteamHook = () => { throw new Error('Steam is running'); };
    h.choices.push(0, 0, 0);
    assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), false);
    assert.equal(h.stores[1], undefined);
    assert.ok(fs.existsSync(path.join(h.dir, 'deltamod_system-1/proton/base/data.win')));
    assert.ok(h.errors.some(error => String(error).includes('Steam is running')));
    assert.equal(h.calls.some(call => call.steamRun), false);
});

test('manual setup adapter copies only the hook and requires explicit verification', async t => {
    for (const consent of [true, false]) {
        const h = harness(t);
        h.steamBridge.installSteamHook = options => {
            const confirmed = options.confirmManual("'/private/hook' %command%");
            if (!confirmed) throw new Error('Manual setup cancelled');
        };
        h.choices.push(0, 0, 0, consent ? 0 : 1, 0);
        assert.equal(await h.handlers.get('createNewInstallation')({}, ['steam', null, null, true, 'fixture']), consent);
        assert.equal(h.calls.some(call => call.clipboard === "'/private/hook' %command%"), consent);
        assert.equal(h.calls.some(call => call.steamRun), false);
    }
});

test('Proton patch/run routes before legacy restore and launches selected mods directly', async t => {
    const h = harness(t);
    Staging.importBase(path.join(h.profile, 'proton'), h.source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: h.runner });
    assert.equal(await h.handlers.get('patchAndRun')(null, [['selected-mod']]), true);
    assert.equal(h.restoreCount(), 0);
    assert.equal(h.patchCount(), 0);
    assert.deepEqual(Array.from(h.calls[0].options.selected), ['selected-mod']);
    assert.equal(h.calls[0].root, path.join(h.profile, 'proton'));
    assert.equal(h.calls.some(call => typeof call === 'string' && call.startsWith('steam:')), false);
    assert.equal(await h.listeners.get('startGame')(), true);
    assert.deepEqual(Array.from(h.calls[1].options.selected), []);
});

test('legacy profile retains its restore/patch route on Windows and Linux', async t => {
    for (const platform of ['win32', 'linux']) {
        const h = harness(t, platform);
        assert.equal(await h.handlers.get('patchAndRun')(null, [[]]), false);
        assert.equal(h.restoreCount(), 1);
        assert.equal(h.patchCount(), 1);
        assert.equal(h.calls.length, 0);
    }
});

test('an asynchronous Proton request captures its profile before the selected index changes', async t => {
    const h = harness(t);
    Staging.importBase(path.join(h.profile, 'proton'), h.source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: h.runner });
    fs.mkdirSync(path.join(h.dir, 'deltamod_system-1'));
    fs.mkdirSync(path.join(h.dir, 'deltamod_system-1/proton'));
    const request = h.handlers.get('patchAndRun')(null, [['selected-mod']]);
    h.switchIndex('1');
    assert.equal(await request, true);
    assert.equal(h.calls[0].root, path.join(h.profile, 'proton'));
    assert.equal(h.restoreCount(), 0);
});

test('import stores the confirmed Steam Proton path once and passes the actual imported app identity', async t => {
    const h = harness(t);
    let request;
    h.protonSelection.select = async options => { request = options; return h.runner; };
    h.choices.push(1);
    h.files.push(process.execPath);
    const result = await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']);
    assert.equal(result, true, JSON.stringify(h.errors));
    assert.equal(request.appid, '123');
    assert.equal(request.sourcePath, h.source);
    const root = path.join(h.dir, 'deltamod_system-1/proton');
    assert.equal(Staging.readDescriptor(root).proton, h.runner);
    h.protonSelection.select = async () => { throw new Error('launch must not rediscover Proton'); };
    h.switchIndex('1');
    await h.listeners.get('startGame')();
    assert.equal(h.calls.find(call => call.root === root)?.root, root);
    assert.equal(Staging.readDescriptor(root).proton, h.runner);
});

test('Proton selection cancellation or failure stops import before creating a profile', async t => {
    for (const failure of [false, true]) {
        const h = harness(t);
        h.protonSelection.select = async () => {
            if (failure) throw new Error('fixture selected runtime became unavailable');
            return null;
        };
        h.files.push(process.execPath, h.runner);
        h.choices.push(1);
        assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']), false);
        assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-1')), false);
        assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
        if (failure) assert.match(JSON.stringify(h.errors), /runtime became unavailable/);
    }
});

test('non-Steam import does not pretend the configured game has a verified Steam app identity', async t => {
    const h = harness(t);
    let request;
    h.protonSelection.select = async options => { request = options; return h.runner; };
    h.files.push(process.execPath);
    h.choices.push(0);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['folder', 'locate', h.source, true, 'fixture', 'copy']), true);
    assert.equal(request.appid, undefined);
    assert.equal(request.sourcePath, h.source);
});

test('Linux opt-in imports a copied base even with an existing Steam profile', async t => {
    const h = harness(t);
    h.choices.push(1);
    h.files.push(process.execPath, h.runner);
    const result = await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']);
    assert.equal(result, true, JSON.stringify(h.errors));
    const root = path.join(h.dir, 'deltamod_system-1', 'proton');
    assert.equal(h.stores[1].gamePath, path.join(root, 'base'));
    assert.equal(h.stores[1].isSteam, true);
    assert.equal(Staging.readDescriptor(root).proton, h.runner);
    assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
    assert.deepEqual(fs.readdirSync(path.join(root, 'prefix')), []);
});

test('Linux import consumes the managed setup path through the real runtime selection seam', async t => {
    const h = harness(t);
    h.choices.push(1);
    h.files.push(process.execPath, h.runner);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']), true);
    assert.ok(h.calls.includes('umu-setup'));
    assert.equal(Staging.readDescriptor(path.join(h.dir, 'deltamod_system-1', 'proton')).umu, process.execPath);
});

test('UMU setup cancellation and failure stop before profile mutation', async t => {
    for (const fail of [false, true]) {
        const h = harness(t);
        h.choices.push(1);
        h.runtimeSetup.select = async () => {
            h.calls.push('umu-setup');
            if (fail) throw new Error('fixture UMU checksum mismatch');
            return null;
        };
        const snapshot = fs.readFileSync(path.join(h.profile, 'store.json'), 'utf8');
        assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']), false);
        assert.ok(h.calls.includes('umu-setup'));
        assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-1')), false);
        assert.equal(fs.readFileSync(path.join(h.profile, 'store.json'), 'utf8'), snapshot);
        assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
        if (fail) assert.match(JSON.stringify(h.errors), /fixture UMU checksum mismatch/);
    }
});

test('native UMU progress adapter releases its modal and taskbar state', async t => {
    const h = harness(t);
    h.choices.push(1);
    h.files.push(h.runner);
    h.runtimeSetup.select = async ({ progress }) => {
        const modal = progress();
        modal.update(0.5);
        modal.close();
        return process.execPath;
    };
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']), true);
    assert.ok(h.calls.some(call => call.progress === 0.5));
    assert.ok(h.calls.some(call => call.progress === -1));
    assert.ok(h.calls.includes('progress-destroyed'));
});

test('legacy import duplicate check still applies when opting out of Proton', async t => {
    const h = harness(t);
    h.choices.push(2);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', 'locate', h.source, true, 'fixture', 'copy']), false);
    assert.equal(h.errors[0][0], 'Duplicate Steam install');
});

test('invalid Proton profiles remain protected from deletion, reset, hash writes, baking and reimport', async t => {
    const h = harness(t);
    const root = path.join(h.profile, 'proton');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'progress.fixture'), 'progress');
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), false);
    assert.equal(h.handlers.get('initialize')(), false);
    h.handlers.get('precalcGameHashes')();
    assert.equal(await h.handlers.get('patchAndRun')(null, [[], 'baker']), false);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['locate', 'locate', h.source, false, 'fixture']), false);
    assert.equal(fs.readFileSync(path.join(root, 'progress.fixture'), 'utf8'), 'progress');
    assert.equal(fs.existsSync(path.join(h.source, 'data.win.hash')), false);
    assert.equal(h.restoreCount(), 0);
    assert.equal(h.calls.length, 0);
});

test('staged delta helper preserves ordered single-apply and multi-merge CLI contracts', async t => {
    const h = harness(t);
    const game = path.join(h.dir, 'delta-game');
    const scratch = path.join(h.dir, 'delta-scratch');
    fs.mkdirSync(game);
    fs.mkdirSync(scratch);
    fs.writeFileSync(path.join(game, 'data.win'), 'source');
    const commands = [];
    let failure;
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'GamePatching.js'), 'utf8'), {
        require: name => ({ fs: { ...fs, accessSync: () => {}, statSync: () => ({ isFile: () => true }) }, path, './Console': console,
            child_process: { execFile: (file, args, options, callback) => {
                commands.push(Array.from(args));
                fs.writeFileSync(args.at(-1), 'patched');
                assert.equal(options.cwd, game);
                assert.ok(options.timeout > 0);
                queueMicrotask(() => callback(failure, 'fixture output', failure ? 'wrong source fixture' : ''));
            } } }[name] || {}), module, __dirname, process
    });
    const apply = module.exports.getStagedDeltaHelper();
    assert.equal(typeof apply, 'function');
    await apply({ game, target: 'data.win', payloads: ['one.patch'], scratch, log: () => {} });
    assert.deepEqual(commands[0], ['patch', 'apply', path.join(scratch, 'delta-input'), 'one.patch', path.join(scratch, 'delta-output')]);
    assert.equal(fs.readFileSync(path.join(game, 'data.win'), 'utf8'), 'patched');
    await apply({ game, target: 'data.win', payloads: ['one.patch', 'two.patch'], scratch, log: () => {} });
    assert.deepEqual(commands[1], ['patch', 'merge', path.join(scratch, 'delta-input'), 'one.patch', 'two.patch', '--properties', '-a', path.join(scratch, 'delta-output')]);
    failure = new Error('fixture failure');
    await assert.rejects(apply({ game, target: 'data.win', payloads: ['one.patch'], scratch, log: () => {} }), /source version/);
    failure = undefined;
    await assert.rejects(apply({ game, target: 'data.win', payloads: ['one.patch'], scratch, log: () => { throw new Error('fixture log closed'); } }), /fixture log closed/);
    assert.deepEqual(fs.readdirSync(scratch), []);
    assert.equal(fs.readFileSync(path.join(game, 'data.win'), 'utf8'), 'patched');
});

test('native multi-mod patching deep-merges property files so every mod keeps its global scripts', async t => {
    const h = harness(t);
    const game = path.join(h.dir, 'native-game');
    const mods = path.join(h.dir, 'native-mods');
    fs.mkdirSync(game);
    fs.writeFileSync(path.join(game, 'data.win'), 'source');
    for (const name of ['bgm', 'knight']) {
        fs.mkdirSync(path.join(mods, name), { recursive: true });
        fs.writeFileSync(path.join(mods, name, 'modding.xml'), '<patch type="xdelta" patch="mod.xdelta" to="data.win"/>');
        fs.writeFileSync(path.join(mods, name, 'meta.toml'), '');
        fs.writeFileSync(path.join(mods, name, 'mod.xdelta'), name);
        fs.writeFileSync(path.join(mods, name, '__deltaID.json'), JSON.stringify({ uniqueId: name }));
    }
    const commands = [];
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'GamePatching.js'), 'utf8'), {
        require: name => ({
            fs: { ...fs, existsSync: file => file.endsWith('G3MTool.exe') || fs.existsSync(file) },
            path, './Console': { log_internal() {}, log() {}, error() {} },
            'smol-toml': { parse: () => ({ metadata: { name: 'fixture' } }) },
            child_process: { spawn: (file, args) => {
                commands.push(Array.from(args));
                const child = new EventEmitter();
                child.stdout = new EventEmitter();
                child.stderr = new EventEmitter();
                setImmediate(() => child.emit('close', 0));
                return child;
            } }
        }[name] || {}), module, __dirname, process: { platform: 'win32', stdout: process.stdout, stderr: process.stderr }
    });
    const result = await module.exports.startGamePatch(game, mods, ['bgm', 'knight']);
    assert.equal(result.patched, true);
    assert.deepEqual(commands, [['patch', 'merge', path.join(game, 'data.win.bak'),
        path.join(mods, 'bgm', 'mod.xdelta'), path.join(mods, 'knight', 'mod.xdelta'), '--properties', '-a', path.join(game, 'data.win')]]);
});

test('UMU Steam-disconnect action offers installation removal navigation instead of a dead-end error', async t => {
    for (const choice of [0, 1]) {
        const h = harness(t);
        const root = path.join(h.profile, 'proton');
        Staging.importBase(root, h.source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: h.runner });
        const descriptor = fs.readFileSync(path.join(root, 'backend.json'));
        h.choices.push(choice);
        assert.equal(h.handlers.get('removeSteamIntegration')(), choice === 0);
        assert.equal(h.errors.length, 0);
        assert.equal(h.messages.some(args => args[0] === 'page' && args[1] === 'installmanager'), choice === 0);
        assert.deepEqual(fs.readFileSync(path.join(root, 'backend.json')), descriptor);
        assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
        assert.equal(h.calls.some(call => call.steamRemove || call.umuRemove || call.junction), false);
        assert.equal(h.calls.includes('relaunch'), false);
        const prompt = h.calls.find(call => call.nativeDialog)?.nativeDialog;
        assert.ok(prompt.buttons.includes('Open Install Manager'));
        assert.match(prompt.message, /Delete/);
        if (choice === 0) {
            h.choices.push(0);
            assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), true);
            assert.equal(fs.existsSync(h.profile), false);
            assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
            assert.ok(h.calls.some(call => call.umuRemove === root));
        }
    }
});

test('permanent deletion removes only the selected inactive Proton installation without renumbering', async t => {
    const h = harness(t);
    const root = path.join(h.profile, 'proton');
    Staging.importBase(root, h.source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: h.runner });
    const survivor = path.join(h.dir, 'deltamod_system-4');
    fs.mkdirSync(survivor);
    const survivorStore = JSON.stringify({ gamePath: h.source, gamePid: 'fixture' });
    fs.writeFileSync(path.join(survivor, 'store.json'), survivorStore);
    h.stores[4] = JSON.parse(survivorStore);
    h.choices.push(0);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), true);
    assert.equal(fs.existsSync(h.profile), false);
    assert.equal(fs.readFileSync(path.join(survivor, 'store.json'), 'utf8'), survivorStore);
    assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
    assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-1')), false);
});

test('Steam imports offer shared Steam progress first without invoking UMU setup', async t => {
    const h = harness(t);
    h.choices.push(0, 0, 0);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', 'steam', null, true, 'fixture']), true);
    const runtime = h.calls.find(call => call.nativeDialog?.title === 'Linux game runtime').nativeDialog;
    assert.match(runtime.buttons[0], /Steam-managed/);
    assert.equal(runtime.defaultId, 0);
    assert.equal(h.calls.includes('umu-setup'), false);
    assert.equal(Staging.readDescriptor(path.join(h.dir, 'deltamod_system-1', 'proton')).backend, 'steam');
});

test('deleting the final installation keeps its index retired and the next import usable', async t => {
    const h = harness(t);
    h.choices.push(0);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), true);
    assert.equal(fs.existsSync(h.profile), false);
    assert.equal(fs.readFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), 'utf8'), '1');
    assert.equal((await h.handlers.get('getInstallations')()).length, 0);
    h.choices.push(0, 0, 0);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', null, null, true, 'fixture']), true);
    assert.equal(fs.existsSync(path.join(h.dir, 'deltamod_system-1/proton/backend.json')), true);
    assert.equal(fs.existsSync(h.profile), false);
});

for (const fromIM of [false, true]) {
    test(`import after permanent removal loads the replacement identity (fromIM=${fromIM})`, async t => {
        const h = harness(t, 'linux', true);
        h.choices.push(0);
        assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), true);
        h.choices.push(0, 0, 0);
        assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', null, null, fromIM, 'fixture']), true);
        assert.equal(h.currentIndex(), '1');
        assert.equal(fs.readFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), 'utf8'), '1');
        assert.equal(h.keyValue.readKVS('gamePid'), 'fixture');
        assert.equal(h.keyValue.readKVS('gamePath'), path.join(h.dir, 'deltamod_system-1/proton/base'));
        h.modList.push({ game: 'fixture' }, { game: 'other.game' }, { game: 'fixture', _incompatibleHASH: true });
        const result = await h.handlers.get('getModList')();
        assert.equal(result.modList[0].isIncompatible, false);
        assert.equal(result.modList[1].isIncompatible, true);
        assert.match(result.modList[1].incompatibilityReason, /you are running Fixture game/);
        assert.equal(result.modList[2].isIncompatible, true);
        assert.equal(fs.existsSync(h.profile), false);
    });
}

test('Install Manager import keeps a valid loaded selection rather than switching to the new profile', async t => {
    const h = harness(t, 'linux', true);
    fs.writeFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), '0');
    h.choices.push(0, 0, 0);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', null, null, true, 'fixture']), true);
    assert.equal(h.currentIndex(), '0');
    assert.equal(fs.readFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), 'utf8'), '0');
    assert.equal(h.keyValue.readKVS('gamePath'), h.source);
});

test('cancelled import leaves a stale selection and loaded storage untouched', async t => {
    const h = harness(t, 'linux', true);
    fs.writeFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), '9');
    h.switchIndex('9');
    h.choices.push(2);
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['steam', null, null, false, 'fixture']), false);
    assert.equal(h.currentIndex(), '9');
    assert.equal(fs.readFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), 'utf8'), '9');
    assert.equal(h.keyValue.readKVS('gamePath'), h.source);
});

test('Windows legacy import loads and persists its selected identity through real KeyValue', async t => {
    const h = harness(t, 'win32', true);
    h.switchIndex('7');
    assert.equal(await h.handlers.get('createNewInstallation')(null, ['local', 'locate', h.source, false, 'fixture']), true);
    assert.equal(h.currentIndex(), '7');
    assert.equal(fs.readFileSync(path.join(h.dir, 'deltamod_system-unique/_sysindex'), 'utf8'), '7');
    assert.equal(h.keyValue.readKVS('gamePath'), h.source);
    assert.equal(h.keyValue.readKVS('loadedDeltarune'), true);
});

test('invalid Proton storage is never silently deleted by the max-index probe', t => {
    const h = harness(t);
    fs.mkdirSync(path.join(h.profile, 'proton'));
    fs.writeFileSync(path.join(h.profile, 'proton/progress.fixture'), 'retain');
    fs.writeFileSync(path.join(h.profile, 'store.json'), '{}');
    const result = h.handlers.get('getMaxExistingIndex')();
    assert.equal(result[0], 0);
    assert.equal(fs.readFileSync(path.join(h.profile, 'proton/progress.fixture'), 'utf8'), 'retain');
});

test('pending removal stays listed for retry and cannot be selected for launching', async t => {
    const h = harness(t);
    const root = path.join(h.profile, 'proton');
    Staging.importBase(root, h.source, { gameId: 'fixture', exeName: 'DELTARUNE.exe', umu: process.execPath, proton: h.runner });
    const removalSettings = { userData: h.dir,
        removeProton: async (unused, dispose) => dispose(),
        removeTree: profile => { fs.unlinkSync(path.join(profile, 'proton/backend.json')); throw new Error('fixture disk failure'); } };
    await assert.rejects(require('./ProtonLauncher').removeInstallation(0, { confirm: () => true }, removalSettings), /fixture disk failure/);
    const installations = await h.handlers.get('getInstallations')();
    assert.equal(installations.length, 1);
    assert.match(installations[0].name, /Removal incomplete/);
    assert.equal(installations[0].pid, 'fixture');
    assert.equal(h.handlers.get('changeSystemIndex')(null, ['0']), false);
    h.choices.push(0);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), true);
    assert.equal((await h.handlers.get('getInstallations')()).length, 0);
});

test('backend deletion confirmation cannot be bypassed and cancel leaves the installation unchanged', async t => {
    const h = harness(t);
    const before = fs.readFileSync(path.join(h.profile, 'store.json'));
    h.choices.push(1);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), false);
    assert.deepEqual(fs.readFileSync(path.join(h.profile, 'store.json')), before);
    assert.equal(h.calls.includes('relaunch'), false);
});

test('legacy copied Steam deletion retains its junction cleanup without changing the original game', async t => {
    const h = harness(t, 'win32');
    h.stores[0].gamePath = path.join(h.profile, 'deltaruneInstall');
    h.stores[0].originalSteamPath = path.join(h.dir, 'legacy-junction');
    fs.mkdirSync(h.stores[0].gamePath);
    h.choices.push(0);
    assert.equal(await h.handlers.get('deleteSystemIndex')(null, ['0']), true);
    assert.equal(h.calls.filter(call => call.junction === h.stores[0].originalSteamPath).length, 1);
    assert.equal(fs.readFileSync(path.join(h.source, 'data.win'), 'utf8'), 'vanilla');
});

test('native startup does not probe Wine and retains the logical screen warning', () => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'RunConditions.js'), 'utf8'), {
        require: name => {
            if (name === 'electron') return { screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1280, height: 720 } }) } };
            if (name === './Console.js') return { log: () => {} };
            if (name === 'os') return { totalmem: () => 2 * 1024 ** 3, homedir: () => '/fixture-home' };
            if (name === 'fs') return { statfsSync: () => ({ bfree: 1024 ** 2, bsize: 4096 }) };
            throw new Error(`Unexpected startup dependency: ${name}`);
        }, module, process: { platform: 'linux' }
    });
    const unmet = module.exports.checkConditions();
    assert.equal(unmet.length, 1);
    assert.equal(unmet[0].name, 'Minimum screen size of at least 1024x768');
    assert.equal(unmet[0].required, false);
});
