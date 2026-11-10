// Steam-managed launching. This file is also copied into each binding directory and run by the Launch Options hook,
// so at load time it may only require ./ProtonSteamOptions and Node builtins. Deltamod-only modules are required lazily.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const Options = require('./ProtonSteamOptions');

const running = new Set();
const BUNDLE = ['ProtonSteamBridge.js', 'ProtonSteamOptions.js'];
const SESSION_FILES = ['session.json', 'request.json', 'claimed.json', 'recovery.lock'];
const LEFTOVER_SESSION = 'DELTAMOD_STEAM_LEFTOVER_SESSION';
const APP_ID = /^[1-9][0-9]{0,9}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fills in the effects every Steam bridge function uses. `userData` and `confirmAccount` come from Deltamod;
 * the rest default to the real system and are replaced in tests.
 */
function withDefaults({
    userData,
    runtime = process.execPath,
    assertDurable = Options.durablePath,
    optionsEffects = {},
    processIdentity = identity,
    processAlive = alive,
    inspect = inspectActivity,
    delay = wait,
    now = Date.now,
    startupMs = 90000,
    platform = process.platform,
    isSteamClosed = Options.steamClosed,
    confirmAccount = async () => false,
    promoteHelper = fs.renameSync
} = {}) {
    return {
        userData, runtime, assertDurable, optionsEffects, processIdentity, processAlive, inspect, delay, now,
        startupMs, platform, isSteamClosed, confirmAccount, promoteHelper
    };
}

function isAbsoluteString(value) {
    return typeof value === 'string' && path.isAbsolute(value);
}

function withReason(message, activity) {
    return message + (activity.reason ? '\n\n' + activity.reason : '');
}

function hasSessionFiles(directory) {
    return SESSION_FILES.some(name => fs.existsSync(path.join(directory, name)));
}

// The hook's status file carries the scanner reason for an uncertain or failed session.
function statusReason(status) {
    return { reason: typeof status?.message === 'string' ? status.message : '' };
}

function checkNodeRuntime(runtime) {
    fs.accessSync(runtime, fs.constants.X_OK);
    const result = spawnSync(runtime, ['-p', '"deltamod-node-runtime"'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, shell: false, timeout: 5000, encoding: 'utf8', maxBuffer: 4096
    });
    if (result.error || result.status !== 0 || result.stdout.trim() !== 'deltamod-node-runtime') {
        throw new Error('The stable Electron runtime cannot run the Steam helper in Node mode.');
    }
}

function readJson(filename) {
    return JSON.parse(Options.decode(Options.safeFile(filename, 65536).bytes));
}

function replaceJson(filename, value) {
    const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
    Options.writePrivate(temporary, value);
    fs.renameSync(temporary, filename);
}

/**
 * Splits a /proc/<pid>/stat line. `fields[0]` is the state, `[1]` the parent PID and `[19]` the start time.
 */
function parseStat(text) {
    return {
        comm: text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')),
        fields: text.slice(text.lastIndexOf(')') + 2).split(' ')
    };
}

/**
 * Identifies a process across PID reuse and reboots by its start time and the boot ID.
 */
function identity(pid = process.pid) {
    const { fields } = parseStat(fs.readFileSync('/proc/' + pid + '/stat', 'utf8'));
    return {
        pid,
        birth: fields[19],
        state: fields[0],
        boot: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
    };
}

function alive(owner) {
    if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || !/^\d+$/.test(owner.birth) || typeof owner.boot !== 'string') return false;
    try {
        const current = identity(owner.pid);
        return !['Z', 'X'].includes(current.state) && current.birth === owner.birth && current.boot === owner.boot;
    } catch (error) {
        if (['ENOENT', 'ESRCH'].includes(error.code)) return false;
        throw error;
    }
}

function isValidArgv(argv) {
    return Array.isArray(argv) && argv.length > 0 && argv.length <= 512 &&
        argv.every(arg => typeof arg === 'string' && !arg.includes('\0') && arg.length <= 32768);
}

/**
 * Returns Steam's Proton command with the verified original executable swapped for the staged one.
 * Anything other than a single `proton waitforexitandrun <source>` chain for the requested app is refused.
 */
function redirectCommand(argv, request, env) {
    if (!isValidArgv(argv)) throw new Error('Invalid Steam command arguments.');
    const ids = [env.SteamAppId, env.SteamGameId].filter(Boolean);
    if (!ids.length || ids.some(id => String(id) !== request.appid)) throw new Error('Steam command belongs to a different game.');

    const verbs = argv.map((arg, index) => arg === 'waitforexitandrun' ? index : -1).filter(i => i >= 0);
    if (verbs.length !== 1) throw new Error('Unsupported Steam Proton command: expected waitforexitandrun.');
    const verb = verbs[0];
    const runsProton = verb >= 1 && path.basename(argv[verb - 1]) === 'proton';
    const runsSourceOnce = argv[verb + 1] === request.source && argv.filter(arg => arg === request.source).length === 1;
    if (!runsProton || !runsSourceOnce || !path.isAbsolute(argv[0])) {
        throw new Error('Steam command does not match the verified original executable.');
    }

    const result = argv.slice();
    result[verb + 1] = request.stage;
    return result;
}

function sameProcess(proc, folder, fields, comm) {
    const current = parseStat(proc.readFileSync(folder + '/stat', 'utf8'));
    return current.fields[19] === fields[19] && current.fields[1] === fields[1] && current.comm === comm;
}

/**
 * Scans the current user's processes for a Deltamod stage, Steam session or Steam app.
 * Any process that cannot be read is reported as uncertain rather than ignored.
 */
function inspectActivity({ id, appid, root, afterBirth, exclude = [], wholeApp = false }, proc = fs) {
    const result = { active: false, uncertain: false };
    for (const pid of proc.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
        if (exclude.includes(Number(pid))) continue;
        const folder = '/proc/' + pid;
        let reading = 'stat';
        let comm = '';
        try {
            if (proc.statSync(folder).uid !== process.getuid()) continue;
            const stat = parseStat(proc.readFileSync(folder + '/stat', 'utf8'));
            const fields = stat.fields;
            const finished = ['Z', 'X'].includes(fields[0]);
            if (finished || afterBirth && BigInt(fields[19]) < BigInt(afterBirth)) continue;
            comm = stat.comm;

            reading = 'cmdline';
            const args = proc.readFileSync(folder + '/cmdline', 'utf8').split('\0').filter(Boolean);
            const owned = root && args.some(arg => arg.startsWith(path.join(root, 'work') + path.sep));
            if (owned) {
                result.active = true;
                result.reason ||= `process ${pid}: owned Steam stage (${comm})`;
            }

            reading = 'environ';
            let env;
            try {
                env = proc.readFileSync(folder + '/environ', 'utf8').split('\0');
            } catch (error) {
                // An unreadable environment alone does not make a verified desktop service a game process.
                const deniedService = !owned && ['EACCES', 'EPERM'].includes(error.code) && Options.isProtectedService(proc, fields, args, comm);
                if (deniedService && sameProcess(proc, folder, fields, comm)) continue;
                throw error;
            }
            const inSession = id && env.includes('DELTAMOD_STEAM_SESSION=' + id);
            const inApp = wholeApp && env.some(value => value === 'SteamAppId=' + appid || value === 'SteamGameId=' + appid);
            if (inSession || inApp) {
                result.active = true;
                result.reason ||= `process ${pid}: owned Steam app or session (${comm})`;
            }
        } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes(error.code)) {
                if (!result.uncertain) result.reason = `process ${pid}: ${reading} ${error.code || error.message}${comm ? ` (${comm})` : ''}`;
                result.uncertain = true;
            }
        }
    }
    return result;
}

function isValidBinding(binding) {
    if (!binding || binding.version !== 1) return false;
    if (!SHA256.test(binding.id) || !APP_ID.test(binding.appid) || !APP_ID.test(binding.account)) return false;
    if (!['root', 'source', 'executable', 'directory', 'runtime'].every(key => isAbsoluteString(binding[key]))) return false;

    const files = binding.files;
    if (!files || Object.keys(files).sort().join(',') !== 'ProtonSteamBridge.js,ProtonSteamOptions.js,launch') return false;
    if (!Object.values(files).every(hash => SHA256.test(hash))) return false;
    return binding.executable !== binding.source && binding.executable.startsWith(binding.source + path.sep);
}

function validateBinding(binding) {
    if (!isValidBinding(binding)) throw new Error('Invalid Steam bridge binding.');
    return binding;
}

function verifyBundle(binding, updating = false) {
    if (!updating && fs.existsSync(path.join(binding.directory, 'helper-update.json'))) {
        throw new Error('Steam helper update is incomplete. Fully exit Steam, then retry launching from Deltamod.');
    }
    for (const [name, hash] of Object.entries(binding.files)) {
        if (Options.safeFile(path.join(binding.directory, name)).hash !== hash) throw new Error('Managed Steam helper was modified. Review before repairing setup.');
    }
    fs.accessSync(path.join(binding.directory, 'launch'), fs.constants.X_OK);
    fs.accessSync(binding.runtime, fs.constants.X_OK);
}

function isValidSession(session) {
    if (!session || session.version !== 1) return false;
    if (!SHA256.test(session.id) || !isAbsoluteString(session.root) || !APP_ID.test(session.appid)) return false;
    const owner = session.owner;
    return Number.isSafeInteger(owner?.pid) && owner.pid > 0 && /^\d+$/.test(owner.birth) &&
        typeof owner.boot === 'string' && !!owner.boot && owner.boot.length <= 128;
}

function validateSession(session) {
    if (!isValidSession(session)) throw new Error('Invalid Steam session identity.');
    return session;
}

function bindingId(game, account) {
    return crypto.createHash('sha256').update([game.root, game.appid, account].join('\0')).digest('hex');
}

/**
 * The private folder that holds the hook, helper bundle and session files for one Steam game and account.
 */
function steamBindingDirectory(userData, game, account) {
    return path.join(userData, 'steam-bridge', bindingId(game, account));
}

function hookScript(runtime, directory) {
    return '#!/bin/sh\nexec env ELECTRON_RUN_AS_NODE=1 ' + Options.shellQuote(fs.realpathSync(runtime)) + ' ' +
        Options.shellQuote(path.join(directory, 'ProtonSteamBridge.js')) + ' ' + Options.shellQuote(directory) + ' "$@"\n';
}

function writeBundle(directory) {
    for (const name of BUNDLE) {
        const content = Options.safeFile(path.join(__dirname, name)).bytes;
        const target = path.join(directory, name);
        if (!fs.existsSync(target)) {
            Options.writePrivate(target, content);
        } else if (!Options.safeFile(target).bytes.equals(content)) {
            throw new Error('Stored Steam helper differs from this build. Review the old integration before repair.');
        }
    }
}

function writeHook(hook, content) {
    if (!fs.existsSync(hook)) {
        Options.writePrivate(hook, content);
        fs.chmodSync(hook, 0o700);
    } else if (Options.decode(Options.safeFile(hook).bytes) !== content) {
        throw new Error('Managed Steam hook was modified. Review before repair.');
    }
}

function needsManualSetup(error) {
    return /Complex Launch Options|wrappers require manual|quoting|Ambiguous %command%/.test(error.message);
}

/**
 * Installs or repairs the Launch Options hook for `profile`. Steam must be fully exited.
 * With `manual`, Launch Options too complex to edit safely are handed to the user through `confirmManual`.
 * Returns the `steam` section of the profile's backend descriptor.
 */
function installSteamHook({ game, account, exeName, profile, manual, confirmManual }, settings) {
    const s = withDefaults(settings);
    if (s.platform !== 'linux') throw new Error('Steam-managed launching is Linux-only.');
    if (!s.isSteamClosed()) throw new Error('Fully exit Steam before installing or repairing the managed hook.');
    s.assertDurable(fs.realpathSync(s.userData));
    s.assertDurable(fs.realpathSync(s.runtime));
    s.assertDurable(path.resolve(profile));
    checkNodeRuntime(s.runtime);
    if (!game.accounts.some(item => item.account === account)) throw new Error('Confirm an initialized Steam account first.');

    const executable = path.join(game.source, exeName);
    Options.safeFile(executable);
    Options.privateDirectory(path.join(s.userData, 'steam-bridge'));
    const directory = steamBindingDirectory(s.userData, game, account);
    Options.privateDirectory(directory);
    if (fs.existsSync(path.join(directory, 'request.json')) || fs.existsSync(path.join(directory, 'claimed.json'))) {
        throw new Error('A Steam launch is active or needs recovery before setup.');
    }

    const hook = path.join(directory, 'launch');
    const hookContent = hookScript(s.runtime, directory);
    const files = {};
    for (const name of BUNDLE) files[name] = Options.safeFile(path.join(__dirname, name)).hash;
    files.launch = crypto.createHash('sha256').update(hookContent).digest('hex');
    const binding = {
        version: 1, id: bindingId(game, account), root: game.root, source: game.source,
        executable, appid: game.appid, account, directory, runtime: fs.realpathSync(s.runtime), files
    };

    const bindingFile = path.join(directory, 'binding.json');
    if (fs.existsSync(bindingFile)) {
        const previous = validateBinding(readJson(bindingFile));
        if (JSON.stringify({ ...previous, files: binding.files }) !== JSON.stringify(binding)) {
            throw new Error('Steam binding changed. Use a new verified integration.');
        }
        refreshBundle(previous, profile, s);
    } else {
        Options.writePrivate(bindingFile, binding);
    }
    writeBundle(directory);
    writeHook(hook, hookContent);

    const request = { directory, steamRoot: game.root, account, appid: game.appid, hook, profile };
    try {
        Options.installLaunchOptions(request, s.optionsEffects);
    } catch (error) {
        if (!needsManualSetup(error) || !manual) throw error;
        const command = Options.prepareManualLaunchOptions(request, s.optionsEffects);
        if (!confirmManual(command)) throw new Error('Manual Steam setup cancelled. Existing settings and the owned base were retained.');
        Options.adoptManualLaunchOptions(request, s.optionsEffects);
    }
    return { root: game.root, source: game.source, appid: game.appid, account, binding: directory };
}

/**
 * Helper files are replaced only while Steam is exited and no registered profile has a session or a live process.
 */
function requireQuiescent(binding, root, s) {
    const state = Options.readLaunchOptions(binding.directory);
    const profiles = [...new Set([root, ...(state?.profiles || [])].filter(Boolean))];
    if (!s.isSteamClosed()) {
        throw new Error('Steam helper update required. Fully exit Steam, then launch from Deltamod without reopening Steam first. Deltamod starts Steam itself.');
    }
    if (hasSessionFiles(binding.directory) || profiles.some(profile => fs.existsSync(path.join(profile, 'steam-session.json')))) {
        throw new Error('Finish or recover the Steam session before updating its helper.');
    }
    for (const profile of profiles) {
        const activity = s.inspect({ appid: binding.appid, root: profile, wholeApp: true });
        if (activity.active || activity.uncertain) {
            throw new Error(withReason('Steam helper update refused: game process state is active or uncertain.', activity));
        }
    }
}

function readUpdatePlan(journalFile, current, sources) {
    const plan = readJson(journalFile);
    if (plan.version !== 1) throw new Error('Invalid Steam helper update journal.');
    validateBinding(plan.previous);
    validateBinding(plan.next);
    const onlyFilesChanged = JSON.stringify({ ...plan.previous, files: plan.next.files }) === JSON.stringify(plan.next);
    const currentIsKnown = [JSON.stringify(plan.previous), JSON.stringify(plan.next)].includes(JSON.stringify(current));
    const sameHook = plan.next.files.launch === plan.previous.files.launch;
    const sameBuild = BUNDLE.every(name => plan.next.files[name] === sources[name].hash);
    if (!onlyFilesChanged || !currentIsKnown || !sameHook || !sameBuild) {
        throw new Error('Steam helper update identity or build changed. Preserve the journal for review.');
    }
    return plan;
}

function promoteFile(binding, name, bytes, before, quiet, s) {
    const target = path.join(binding.directory, name);
    const temporary = path.join(binding.directory, 'helper-update-' + name + '.tmp');
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!fs.existsSync(temporary)) {
        Options.writePrivate(temporary, bytes);
    } else if (Options.safeFile(temporary).hash !== hash) {
        throw new Error('Steam helper update temporary file changed. Preserve it for review.');
    }
    quiet();
    if (Options.safeFile(target).hash !== before) throw new Error('Steam helper changed during promotion.');
    s.promoteHelper(temporary, target);
    Options.syncDirectory(binding.directory);
}

/**
 * Brings an installed helper bundle up to this build. A journal (`helper-update.json`) makes the update resumable,
 * and every file must match either the old or the new verified bytes.
 */
function refreshBundle(binding, root, s) {
    const sources = Object.fromEntries(BUNDLE.map(name => [name, Options.safeFile(path.join(__dirname, name))]));
    const journalFile = path.join(binding.directory, 'helper-update.json');
    const upToDate = BUNDLE.every(name => binding.files[name] === sources[name].hash);
    if (!fs.existsSync(journalFile) && upToDate) {
        verifyBundle(binding);
        return binding;
    }

    const release = require('./ProtonLauncher').reserve(binding.directory);
    try {
        const bindingFile = path.join(binding.directory, 'binding.json');
        const current = validateBinding(readJson(bindingFile));
        if (JSON.stringify(current) !== JSON.stringify(binding)) throw new Error('Steam binding changed before helper update.');
        const quiet = () => requireQuiescent(binding, root, s);

        let plan;
        if (fs.existsSync(journalFile)) {
            plan = readUpdatePlan(journalFile, current, sources);
        } else {
            verifyBundle(current);
            const files = { ...current.files, ...Object.fromEntries(BUNDLE.map(name => [name, sources[name].hash])) };
            plan = { version: 1, previous: current, next: { ...current, files } };
            quiet();
            Options.writePrivate(journalFile, plan);
        }

        quiet();
        for (const [name, nextHash] of Object.entries(plan.next.files)) {
            const hash = Options.safeFile(path.join(binding.directory, name)).hash;
            if (hash !== plan.previous.files[name] && hash !== nextHash) {
                throw new Error('Managed Steam helper was modified during update. Preserve the journal for review.');
            }
        }
        for (const name of BUNDLE) {
            const before = Options.safeFile(path.join(binding.directory, name)).hash;
            if (before !== plan.next.files[name]) promoteFile(binding, name, sources[name].bytes, before, quiet, s);
        }

        quiet();
        for (const [name, hash] of Object.entries(plan.next.files)) {
            if (Options.safeFile(path.join(binding.directory, name)).hash !== hash) throw new Error('Steam helper changed before update promotion.');
        }
        if (JSON.stringify(readJson(bindingFile)) !== JSON.stringify(current)) throw new Error('Steam binding changed during helper update.');
        promoteFile(binding, 'binding.json', JSON.stringify(plan.next, null, 4), Options.safeFile(bindingFile).hash, quiet, s);
        verifyBundle(plan.next, true);
        fs.unlinkSync(journalFile);
        Options.syncDirectory(binding.directory);
        return plan.next;
    } finally {
        release();
    }
}

function bindingMatchesProfile(binding, descriptor, game) {
    return binding.id === bindingId(game, descriptor.steam.account) &&
        binding.directory === descriptor.steam.binding &&
        binding.executable === path.join(game.source, descriptor.exeName) &&
        binding.root === game.root &&
        binding.source === game.source &&
        binding.appid === game.appid &&
        binding.account === descriptor.steam.account;
}

/**
 * Checks that a Steam profile's binding, registry and Launch Options still match the installed game.
 * With `updateHelpers`, an outdated helper bundle is refreshed instead of refused.
 */
function verifySteamProfile(root, { updateHelpers = false } = {}, settings) {
    const s = withDefaults(settings);
    const descriptor = require('./ProtonStaging').readDescriptor(root);
    if (descriptor.backend !== 'steam') throw new Error('This is not a Steam-managed profile.');
    Options.ownedDirectory(descriptor.steam.binding, true);
    let binding = validateBinding(readJson(path.join(descriptor.steam.binding, 'binding.json')));
    const game = require('./ProtonSetup').discoverSteamGame({
        steamRoot: descriptor.steam.root, appid: descriptor.steam.appid, sourcePath: descriptor.steam.source
    });
    if (!bindingMatchesProfile(binding, descriptor, game)) throw new Error('Steam game binding no longer matches the profile.');

    const state = Options.readLaunchOptions(binding.directory);
    if (!state || state.config !== Options.configPath(binding.root, binding.account)) {
        throw new Error('Steam integration registry needs repair with Steam exited.');
    }
    const current = Options.editLaunchOptions(Options.decode(Options.safeFile(state.config).bytes), binding.appid, undefined).previous;
    if (!state.active || !state.profiles.includes(root) || current !== state.managed) {
        throw new Error('Steam Launch Options need setup or repair with Steam exited.');
    }

    if (updateHelpers) binding = refreshBundle(binding, root, s);
    else verifyBundle(binding);
    return { descriptor, binding };
}

/**
 * Polls the hook's status file until the session ends. Returns true when the game exited with code 0.
 * The stage and session files are cleaned up only after the hook and every session process are gone.
 */
async function waitForHook({ root, binding, session, request, stage, profileLock }, s) {
    const statusFile = path.join(binding.directory, 'status.json');
    let claimed = false;
    while (true) {
        const status = fs.existsSync(statusFile) ? readJson(statusFile) : null;
        const ours = status?.id === session.id;
        if (ours) {
            claimed = true;
            if (status.phase === 'uncertain') {
                throw new Error(withReason('Steam process state is uncertain. The stage and session were retained for review.', statusReason(status)));
            }
            if (status.phase === 'failed') throw new Error('Steam hook failed: ' + status.message + '. Session retained.');
            if (status.phase === 'done') {
                const active = s.inspect({ id: session.id, root, exclude: [process.pid], afterBirth: session.owner.birth });
                if (active.active || active.uncertain) throw new Error('Steam session completion is uncertain. Stage retained.');
                if (s.processAlive(status.helper)) {
                    await s.delay(250);
                    continue;
                }
                require('./ProtonStaging').discardStage(root, stage.id);
                for (const file of ['claimed.json', 'status.json', 'session.json']) fs.unlinkSync(path.join(binding.directory, file));
                fs.unlinkSync(profileLock);
                return status.code === 0;
            }
        }
        if (ours && status.phase === 'claimed' && !s.processAlive(status.helper)) {
            throw new Error('Steam hook exited before confirming completion. Stage and session retained for review.');
        }
        if (!claimed && s.now() > request.expires) {
            throw new Error('Steam did not claim the modded launch in time. Request and stage retained; do not retry until recovery.');
        }
        await s.delay(250);
    }
}

/**
 * Stages the selected mods, leaves a one-use request for the hook and asks Steam to start the game.
 * `options` carries `openSteam`, the mod selection and the staging callbacks.
 * Returns false when the user declines the account confirmation.
 */
async function runSteamProfile(root, options, settings) {
    const s = withDefaults(settings);
    if (s.platform !== 'linux') throw new Error('Steam-managed launching is Linux-only.');
    root = fs.realpathSync(root);
    s.assertDurable(root);
    const release = require('./ProtonLauncher').reserve(root);
    try {
        // Checked before the helper refresh, which would refuse leftover session files with a less useful message.
        const current = require('./ProtonStaging').readDescriptor(root);
        if (current.backend === 'steam') refuseLeftoverSession(root, current.steam.binding);
        const { descriptor, binding } = verifySteamProfile(root, { updateHelpers: true }, s);
        const profileLock = path.join(root, 'steam-session.json');
        const appLock = path.join(binding.directory, 'session.json');
        const session = {
            version: 1, id: crypto.randomBytes(32).toString('hex'), owner: s.processIdentity(),
            root, appid: binding.appid, created: s.now()
        };
        const activity = s.inspect({ appid: binding.appid, root, wholeApp: true });
        if (activity.active || activity.uncertain) {
            throw new Error(withReason('This game is already running or its process state is uncertain. Exit it before launching mods.', activity));
        }

        Options.writePrivate(profileLock, session);
        let acquired = false;
        let stage;
        let handed = false;
        try {
            Options.writePrivate(appLock, session);
            acquired = true;
            running.add(root);
            if (fs.existsSync(path.join(binding.directory, 'request.json')) || fs.existsSync(path.join(binding.directory, 'claimed.json'))) {
                throw new Error('An earlier Steam request needs recovery.');
            }
            if (!(await s.confirmAccount(binding))) return false;
            const args = options.args || [];
            if (!Array.isArray(args) || args.length) {
                throw new Error('Additional Deltamod arguments are not supported in Steam mode. Use the game Launch Options.');
            }

            const Staging = require('./ProtonStaging');
            const mods = options.mods || Staging.loadMods(options.database, options.selected);
            stage = await Staging.prepareStage(root, mods, options);
            const latestActivity = s.inspect({ appid: binding.appid, root, wholeApp: true });
            if (latestActivity.active || latestActivity.uncertain) {
                throw new Error('Game process state changed during preparation. No Steam handoff was created.');
            }

            const stagedExecutable = path.join(stage.game, descriptor.exeName);
            const request = {
                ...session, stageId: stage.id, stage: stagedExecutable,
                source: binding.executable, binding: binding.id, expires: s.now() + s.startupMs,
                executableHash: Options.safeFile(stagedExecutable).hash
            };
            Options.writePrivate(path.join(binding.directory, 'request.json'), request);
            handed = true;
            await options.openSteam('steam://rungameid/' + binding.appid);
            return await waitForHook({ root, binding, session, request, stage, profileLock }, s);
        } finally {
            running.delete(root);
            if (!handed) {
                if (stage) require('./ProtonStaging').discardStage(root, stage.id);
                if (acquired) fs.unlinkSync(appLock);
                fs.unlinkSync(profileLock);
            }
        }
    } finally {
        release();
    }
}

/**
 * The session files a launch leaves behind until it finishes: the app lock, the pending or claimed request and the profile lock.
 */
function leftoverFiles(root, directory) {
    return [
        path.join(directory, 'session.json'),
        path.join(directory, 'request.json'),
        path.join(directory, 'claimed.json'),
        path.join(root, 'steam-session.json')
    ].filter(file => fs.existsSync(file));
}

/**
 * Refuses a launch while an earlier session's files remain. The error is recognized by `isLeftoverSession`,
 * so Deltamod can offer recovery instead of a bare "file already exists".
 */
function refuseLeftoverSession(root, directory) {
    if (fs.existsSync(path.join(directory, 'recovery.lock'))) throw new Error('Steam session recovery is active or interrupted.');
    if (!leftoverFiles(root, directory).length) return;

    const lock = path.join(directory, 'session.json');
    if (fs.existsSync(lock) && readJson(lock).root !== root) {
        throw new Error('Another Deltamod profile has an unfinished Steam session for this game. Finish or recover it from that profile first.');
    }
    let status = null;
    try {
        status = readJson(path.join(directory, 'status.json'));
    } catch {
        // The status file only adds a reason to the message; a missing or unreadable one still allows recovery.
    }
    const message = 'An earlier Steam launch did not finish cleanly. Recover it with Steam fully exited, then launch again.';
    throw Object.assign(new Error(withReason(message, statusReason(status))), { code: LEFTOVER_SESSION });
}

function isLeftoverSession(error) {
    return error?.code === LEFTOVER_SESSION;
}

/**
 * Clears an abandoned Steam session and its stage once its owner, hook and game processes are gone and Steam is exited.
 * Any leftover session file identifies the session, so recovery still works after one was deleted by hand;
 * every file that remains must name the same session and this profile.
 * Returns false when there is nothing to recover.
 */
function recoverSteamProfile(root, settings) {
    const s = withDefaults(settings);
    const { binding } = verifySteamProfile(root, {}, s);
    const leftovers = leftoverFiles(root, binding.directory);
    if (!leftovers.length) return false;
    const records = leftovers.map(file => validateSession(readJson(file)));
    const session = records[0];
    const ownedSession = SHA256.test(session.id) && records.every(record => record.id === session.id && record.root === root);
    if (!ownedSession) throw new Error('Steam recovery session does not belong to this profile.');

    const statusPath = path.join(binding.directory, 'status.json');
    const status = fs.existsSync(statusPath) ? readJson(statusPath) : null;
    const activity = s.inspect({ id: session.id, appid: binding.appid, root, wholeApp: true });
    const busy = running.has(root) ||
        (s.processAlive(session.owner) && session.owner.pid !== process.pid) ||
        (status?.helper && s.processAlive(status.helper)) ||
        activity.active || activity.uncertain;
    if (busy) throw new Error('Steam session is active or uncertain. Recovery refused.');
    // A late Steam command must not become a silent vanilla launch after cancellation.
    if (!s.isSteamClosed()) throw new Error('Exit Steam before recovering an abandoned launch.');

    const recoveryLock = path.join(binding.directory, 'recovery.lock');
    Options.writePrivate(recoveryLock, { id: session.id });
    try {
        for (const name of ['request.json', 'claimed.json']) {
            const requestFile = path.join(binding.directory, name);
            if (!fs.existsSync(requestFile)) continue;
            require('./ProtonStaging').discardStage(root, readJson(requestFile).stageId);
            fs.unlinkSync(requestFile);
        }
        for (const name of ['status.json', 'session.json']) {
            fs.rmSync(path.join(binding.directory, name), { force: true });
        }
        fs.rmSync(path.join(root, 'steam-session.json'), { force: true });
        return true;
    } finally {
        fs.unlinkSync(recoveryLock);
    }
}

/**
 * Brings the installed helper bundle up to this build. Needs Steam exited and no session,
 * so recovery calls it while those conditions still hold instead of leaving it to the next launch.
 */
function updateSteamHelper(root, settings) {
    verifySteamProfile(root, { updateHelpers: true }, withDefaults(settings));
}

/**
 * Unregisters a Steam profile from the Launch Options hook, then calls `dispose` to delete it.
 * Returns true when this was the last profile and the original Launch Options were restored.
 */
function removeSteamProfile(root, { dispose } = {}, settings) {
    const s = withDefaults(settings);
    const descriptor = require('./ProtonStaging').readDescriptor(root);
    if (descriptor.backend !== 'steam') throw new Error('This is not a Steam-managed profile.');
    const steam = descriptor.steam;
    const expected = steamBindingDirectory(s.userData, { root: steam.root, source: steam.source, appid: steam.appid }, steam.account);
    const directory = steam.binding;
    if (directory !== expected) throw new Error('Steam removal binding does not belong to this installation.');

    const release = require('./ProtonLauncher').reserve(root, !!dispose);
    try {
        if (hasSessionFiles(directory) || fs.existsSync(path.join(root, 'steam-session.json'))) {
            throw new Error('Recover or finish the Steam session before removing integration.');
        }
        const activity = s.inspect({ appid: steam.appid, root, wholeApp: true });
        if (activity.active || activity.uncertain || !s.isSteamClosed()) {
            throw new Error('Close the game and fully exit Steam before removal. Active or uncertain processes block removal.');
        }
        const state = Options.readLaunchOptions(directory);
        if (state && (state.config !== Options.configPath(steam.root, steam.account) || state.appid !== steam.appid)) {
            throw new Error('Steam removal registry does not match this account/game.');
        }
        const removed = Options.removeLaunchOptions({ directory, profile: root }, s.optionsEffects);
        dispose?.();
        return removed;
    } finally {
        release();
    }
}

function isRelativeExecutable(name) {
    return typeof name === 'string' && !path.isAbsolute(name) && !name.split(/[\\/]/).some(p => !p || p === '..' || p === '.');
}

function isLiveRequest(request, binding, now, processAlive) {
    const matchesBinding = SHA256.test(request.id) && request.binding === binding.id &&
        request.appid === binding.appid && request.source === binding.executable;
    if (!matchesBinding) return false;
    if (!Number.isSafeInteger(request.expires) || request.expires < now() || request.expires > now() + 120000) return false;
    return processAlive(request.owner);
}

/**
 * Cross-checks the request against the session locks, the profile's descriptor and the staged executable on disk.
 */
function isAuthenticStage(request, binding, directory) {
    const lock = validateSession(readJson(path.join(directory, 'session.json')));
    const profile = validateSession(readJson(path.join(request.root, 'steam-session.json')));
    const backend = readJson(path.join(request.root, 'backend.json'));
    const owner = readJson(path.join(request.root, 'owner.json'));

    const sameSession = lock.id === request.id && lock.root === request.root && profile.id === request.id && profile.root === request.root;
    if (!sameSession) return false;
    const ownedSteamBackend = backend.version === 2 && backend.owner === owner.id &&
        backend.backend === 'steam' && backend.sharedProgressAcknowledged === true;
    if (!ownedSteamBackend) return false;
    const steam = backend.steam;
    const sameGame = steam.binding === directory && steam.appid === binding.appid && steam.account === binding.account &&
        steam.root === binding.root && steam.source === binding.source;
    if (!sameGame || !isRelativeExecutable(backend.exeName)) return false;

    if (!/^[a-f0-9-]{36}$/.test(request.stageId)) return false;
    if (request.stage !== path.join(request.root, 'work', request.stageId, 'game', backend.exeName)) return false;
    if (fs.realpathSync(request.root) !== request.root) return false;
    if (Options.safeFile(request.stage).hash !== request.executableHash) return false;
    return readJson(path.join(request.root, 'work', request.stageId, 'ready.json')).id === request.stageId;
}

function withoutNodeMode(environment) {
    const env = { ...environment };
    delete env.ELECTRON_RUN_AS_NODE;
    return env;
}

function runVanilla(spawnCommand, command, env) {
    return new Promise((resolve, reject) => {
        const child = spawnCommand(command[0], command.slice(1), { env, shell: false, stdio: 'inherit' });
        child.once('error', reject);
        child.once('close', code => resolve(code === null ? 1 : code));
    });
}

/**
 * Entry point of the Launch Options hook. Without a pending request Steam's command runs unchanged.
 * With one, the request is claimed once, the staged executable is launched in its place and the session is supervised
 * until every session process has been quiet for `quietMs`.
 */
async function runHook(directory, argv, {
    spawnCommand = spawn,
    inspect = inspectActivity,
    processAlive = alive,
    processIdentity = identity,
    now = Date.now,
    delay = wait,
    quietMs = 5000,
    environment = process.env
} = {}) {
    Options.ownedDirectory(directory, true);
    const binding = validateBinding(readJson(path.join(directory, 'binding.json')));
    verifyBundle(binding);
    if (binding.directory !== directory) throw new Error('Steam hook directory mismatch.');

    const requestFile = path.join(directory, 'request.json');
    const claimedFile = path.join(directory, 'claimed.json');
    if (!fs.existsSync(requestFile)) {
        if (fs.existsSync(claimedFile) || fs.existsSync(path.join(directory, 'session.json'))) {
            throw new Error('A managed Steam launch is already claimed or requires recovery.');
        }
        if (!Array.isArray(argv) || !argv.length || !path.isAbsolute(argv[0])) throw new Error('Invalid vanilla Steam command.');
        return await runVanilla(spawnCommand, argv, withoutNodeMode(environment));
    }

    const request = validateSession(readJson(requestFile));
    const statusFile = path.join(directory, 'status.json');
    const helper = processIdentity();
    const status = (phase, extra = {}) => replaceJson(statusFile, { id: request.id, phase, helper, ...extra });
    let claimed = false;
    try {
        if (!isLiveRequest(request, binding, now, processAlive)) throw new Error('Invalid, expired or abandoned Steam handoff.');
        if (!isAuthenticStage(request, binding, directory)) throw new Error('Steam stage or profile authentication failed.');
        const command = redirectCommand(argv, request, environment);
        fs.linkSync(requestFile, claimedFile);
        fs.unlinkSync(requestFile);
        claimed = true;
        status('claimed');

        let closed = false;
        let code;
        let failure;
        const child = spawnCommand(command[0], command.slice(1), {
            cwd: path.dirname(request.stage),
            env: { ...withoutNodeMode(environment), DELTAMOD_STEAM_SESSION: request.id },
            shell: false,
            stdio: 'inherit'
        });
        child.once('error', error => {
            failure = error;
            closed = true;
        });
        child.once('close', value => {
            code = value;
            closed = true;
        });

        // Chapter transitions briefly leave no session process, so the session ends only after a quiet period.
        let quiet;
        while (true) {
            const activity = inspect({ id: request.id, root: request.root, afterBirth: helper.birth, exclude: [process.pid] });
            if (activity.uncertain) {
                status('uncertain', { message: String(activity.reason || '').slice(0, 500) });
                return 1;
            }
            if (!closed || activity.active) quiet = undefined;
            else if (quiet === undefined) quiet = now();
            if (quiet !== undefined && now() - quiet >= quietMs) break;
            await delay(250);
        }
        if (failure || code === null) throw failure || new Error('Steam runtime terminated by a signal.');
        status('done', { code });
        return code;
    } catch (error) {
        if (claimed) status('failed', { message: error.message.slice(0, 500) });
        throw error;
    }
}

if (require.main === module) {
    runHook(process.argv[2], process.argv.slice(3)).then(code => {
        process.exitCode = code;
    }).catch(error => {
        process.stderr.write('Deltamod Steam hook: ' + error.message + '\n');
        process.exitCode = 1;
    });
}

module.exports = {
    steamBindingDirectory,
    installSteamHook,
    verifySteamProfile,
    runSteamProfile,
    recoverSteamProfile,
    updateSteamHelper,
    isLeftoverSession,
    removeSteamProfile,
    runHook,
    redirectCommand,
    inspectActivity,
    identity,
    alive,
    bindingId
};
