// UMU launch, recovery and removal for staged Proton profiles, plus the
// installation removal records and selection rules shared with Steam profiles.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Staging = require('./ProtonStaging');
const { isProtectedService, safeFile, writePrivate } = require('./ProtonSteamOptions');

const SESSION_PHASES = ['preparing', 'starting', 'running', 'retained'];
const PROFILE_ENTRY = /^(?:deltamod_system-([0-9]+)|removed-deltamod_system-([0-9]+)\.json)$/;
const REMOVED = 'This installation is being removed or has been deleted.';
const LOG_LIMIT = 8 * 1024 * 1024;

// Variables inherited from a Steam or Wine parent would override this profile's prefix and runtime.
const INHERITED_RUNTIME_VARIABLES = [
    'STEAM_COMPAT_DATA_PATH',
    'STEAM_COMPAT_INSTALL_PATH',
    'SteamAppId',
    'SteamGameId',
    'UMU_NO_PROTON',
    'WINELOADER',
    'WINESERVER',
    'WINEDLLPATH'
];

const inFlight = new Set();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const removeDirectory = filename => fs.rmSync(filename, { recursive: true });

function withDefaults({
    platform = process.platform,
    inspect = inspectProcesses,
    spawn: spawnProcess = spawn,
    sleep = wait,
    now = Date.now,
    pollMs = 500,
    quietMs = 2000,
    startupTimeout = 120000
} = {}) {
    return { platform, inspect, spawnProcess, sleep, now, pollMs, quietMs, startupTimeout };
}

// Profile locks

function processExists(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        if (error.code === 'ESRCH') return false;
        throw error;
    }
}

function writeLock(lock, contents) {
    fs.writeFileSync(lock, JSON.stringify(contents), { flag: 'wx', mode: 0o600, flush: true });
}

function takeAbandonedLock(lock, gate, token, contents) {
    fs.writeFileSync(gate, token, { flag: 'wx', mode: 0o600, flush: true });
    try {
        const owner = JSON.parse(Staging.readFile(lock, 'utf8'));
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) {
            throw new Error('Invalid Proton lock; manual review is required.');
        }
        if (processExists(owner.pid)) {
            throw new Error('A Proton session or preparation is already active in another application instance.');
        }
        // Recovery contenders serialize here before removing an abandoned owner's lock.
        fs.unlinkSync(lock);
        writeLock(lock, contents);
    } finally {
        fs.unlinkSync(gate);
    }
}

function reserve(root, removing = false) {
    const marker = removalFile(root);
    if (!removing && fs.existsSync(marker)) throw new Error(REMOVED);
    const lock = path.join(root, 'control.lock');
    const gate = path.join(root, 'recovery.lock');
    const token = crypto.randomUUID();
    const contents = { pid: process.pid, token };
    if (fs.existsSync(gate)) {
        throw new Error('Proton recovery is already active or was interrupted. Review recovery.lock before retrying.');
    }
    try {
        writeLock(lock, contents);
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        takeAbandonedLock(lock, gate, token, contents);
    }
    if (!removing && fs.existsSync(marker)) {
        fs.unlinkSync(lock);
        throw new Error(REMOVED);
    }
    return () => {
        if (removing && !fs.existsSync(lock) && fs.existsSync(marker)) return;
        const owner = JSON.parse(Staging.readFile(lock, 'utf8'));
        if (owner.token !== token) throw new Error('Proton lock ownership changed; data was retained.');
        fs.unlinkSync(lock);
    };
}

function validateRuntime(descriptor) {
    const executables = [
        ['UMU', descriptor.umu],
        ['Proton', path.join(descriptor.proton, 'proton')]
    ];
    for (const [label, filename] of executables) {
        try {
            if (!fs.statSync(filename).isFile()) throw new Error('not a regular executable');
            fs.accessSync(filename, fs.constants.R_OK | fs.constants.X_OK);
        } catch (error) {
            throw new Error(`${label} executable is unavailable: ${filename}. Select an installed runtime. ${error.message}`);
        }
    }
}

// Process inspection

function statFields(stat) {
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ');
}

function statName(stat) {
    return stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
}

function hasExited(fields) {
    return fields[0] === 'Z' || fields[0] === 'X';
}

function markActive(result, reason) {
    result.active = true;
    result.reason ||= reason;
}

function unchangedProcess(proc, dir, fields, comm) {
    const current = proc.readFileSync(path.join(dir, 'stat'), 'utf8');
    const currentFields = statFields(current);
    return currentFields[19] === fields[19] && currentFields[1] === fields[1] && statName(current) === comm;
}

// Returns null for a protected desktop service that denied the read; those cannot belong to this runtime.
function readEnvironment(proc, dir, { owned, fields, argv, comm }) {
    try {
        return proc.readFileSync(path.join(dir, 'environ'), 'utf8').split('\0');
    } catch (error) {
        const denied = ['EACCES', 'EPERM'].includes(error.code);
        if (!owned && denied && isProtectedService(proc, fields, argv, comm) && unchangedProcess(proc, dir, fields, comm)) {
            return null;
        }
        throw error;
    }
}

function isGameProcess(argv, comm, exeName) {
    const gameName = exeName.split('/').pop().toLowerCase();
    const executable = (argv[0] || '').replaceAll('\\', '/').split('/').pop();
    return executable.toLowerCase() === gameName || comm.toLowerCase() === gameName;
}

async function inspectProcesses(root, session, proc = fs) {
    const prefix = path.join(root, 'prefix');
    const result = { active: false, game: false, uncertain: false };
    const descriptor = Staging.readDescriptor(root);
    const sameBoot = session.ownerBirth &&
        session.ownerBoot === proc.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    const pids = proc.readdirSync('/proc').filter(name => /^\d+$/.test(name));
    for (const pid of pids) {
        const dir = path.join('/proc', pid);
        let reading = 'stat';
        let comm = '';
        try {
            if (proc.statSync(dir).uid !== process.getuid()) continue;
            const stat = proc.readFileSync(path.join(dir, 'stat'), 'utf8');
            const fields = statFields(stat);
            if (hasExited(fields)) continue;
            // Descendants cannot predate their owner; persist this boundary across app restarts.
            if (sameBoot && BigInt(fields[19]) < BigInt(session.ownerBirth)) continue;
            comm = statName(stat);

            let owned = session.pgid && Number(fields[2]) === session.pgid;
            if (owned) markActive(result, `process ${pid}: owned process group ${session.pgid} (${comm})`);

            reading = 'cmdline';
            const argv = proc.readFileSync(path.join(dir, 'cmdline'), 'utf8').split('\0').filter(Boolean);
            owned ||= argv.some(arg => arg === root || arg.includes(root + path.sep));
            if (owned) markActive(result, `process ${pid}: owned profile path or process group (${comm})`);

            reading = 'environ';
            const env = readEnvironment(proc, dir, { owned, fields, argv, comm });
            if (env === null) continue;
            owned ||= env.includes(`WINEPREFIX=${prefix}`) ||
                (session.id && env.includes(`DELTAMOD_SESSION_ID=${session.id}`));
            if (!owned) continue;

            markActive(result, `process ${pid}: owned runtime (${comm})`);
            if (Number(pid) !== session.pgid && isGameProcess(argv, comm, descriptor.exeName)) result.game = true;
        } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes(error.code)) {
                if (!result.uncertain) {
                    result.reason = `process ${pid}: ${reading} ${error.code || error.message}${comm ? ` (${comm})` : ''}`;
                }
                result.uncertain = true;
            }
        }
    }
    return result;
}

// UMU sessions

async function requireQuiet(root, session, s, message) {
    for (let quiet = 0; quiet <= s.quietMs; quiet += s.pollMs) {
        const activity = await s.inspect(root, session);
        if (activity.active || activity.uncertain) {
            throw new Error(`${message}${activity.reason ? `\n${activity.reason}` : ''}`);
        }
        if (quiet < s.quietMs) await s.sleep(s.pollMs);
    }
}

function isValidSession(session) {
    return session.version === 1 &&
        typeof session.id === 'string' &&
        Number.isSafeInteger(session.ownerPid) &&
        session.ownerPid > 0 &&
        SESSION_PHASES.includes(session.phase) &&
        (session.ownerBirth === undefined || /^\d+$/.test(session.ownerBirth));
}

// Clears a finished session journal and its stages; the caller must hold the profile lock.
async function recoverSession(root, s) {
    Staging.readDescriptor(root);
    const file = path.join(root, 'session.json');
    if (!fs.existsSync(file)) return;
    const session = JSON.parse(Staging.readFile(file, 'utf8'));
    if (!isValidSession(session)) throw new Error('Invalid session journal. Manual review is required.');
    if (session.phase === 'preparing' && processExists(session.ownerPid)) {
        throw new Error('A Proton preparation is still active.');
    }
    await requireQuiet(root, session, s,
        'The previous Proton session is still active or its status is uncertain. Its stage and prefix were retained.');
    for (const id of fs.readdirSync(path.join(root, 'work'))) Staging.discardStage(root, id);
    fs.unlinkSync(file);
}

// Lets a later inspection ignore processes that started before this owner.
function recordOwner(session) {
    if (process.platform !== 'linux') return;
    const stat = fs.readFileSync('/proc/self/stat', 'utf8');
    session.ownerBirth = statFields(stat)[19];
    session.ownerBoot = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
}

async function acknowledgeRuntime(root, descriptor, options) {
    if (descriptor.runtimeAcknowledged) return;
    if (!(await options.acknowledgeRuntime?.())) {
        throw new Error('Runtime download and separate progress acknowledgment was canceled.');
    }
    descriptor.runtimeAcknowledged = true;
    Staging.writeJSON(path.join(root, 'backend.json'), descriptor);
}

function isValidArgs(args) {
    return Array.isArray(args) && args.every(arg => typeof arg === 'string' && !arg.includes('\0'));
}

function runtimeEnvironment(root, descriptor, session) {
    const env = {
        ...process.env,
        WINEPREFIX: path.join(root, 'prefix'),
        PROTONPATH: descriptor.proton,
        GAMEID: 'umu-default',
        STORE: 'none',
        PROTONFIXES_DISABLE: '1',
        PROTON_VERB: 'waitforexitandrun',
        DELTAMOD_SESSION_ID: session.id
    };
    for (const key of INHERITED_RUNTIME_VARIABLES) delete env[key];
    return env;
}

function appendLog(filename, data) {
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0);
    const fd = fs.openSync(filename, flags, 0o600);
    try {
        if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).nlink !== 1) throw new Error('Unsafe runtime log.');
        fs.writeSync(fd, String(data).slice(0, 65536));
    } finally {
        fs.closeSync(fd);
    }
}

function runtimeLog(root, options) {
    const filename = path.join(root, 'runtime.log');
    return data => {
        try {
            if (!fs.existsSync(filename) || fs.statSync(filename).size < LOG_LIMIT) appendLog(filename, data);
            options.log?.(String(data).slice(0, 4096));
        } catch {
            // A closed renderer or unavailable log must not orphan the owned runtime monitor.
        }
    };
}

function watchChild(child, log) {
    const exit = { done: false, code: undefined, error: undefined };
    child.on('error', error => {
        exit.error = error;
        exit.done = true;
    });
    child.on('close', code => {
        exit.code = code;
        exit.done = true;
    });
    child.stdout?.on('data', log);
    child.stderr?.on('data', log);
    return exit;
}

// Polls until the runtime has exited and stayed quiet; returns whether the game process was seen.
async function monitorRuntime(root, session, sessionFile, exit, options, s) {
    const started = s.now();
    let observedGame = false;
    let inactiveSince;
    while (true) {
        const activity = await s.inspect(root, session);
        if (activity.uncertain) {
            throw new Error(`Proton process status is uncertain (${activity.reason || 'unavailable metadata'}). Stage and prefix were retained.`);
        }
        if (activity.game && !observedGame) {
            observedGame = true;
            session.phase = 'running';
            Staging.writeJSON(sessionFile, session);
            options.onStarted?.();
        }
        if (exit.done && !activity.active) {
            inactiveSince ??= s.now();
            if (s.now() - inactiveSince >= s.quietMs) return observedGame;
        } else {
            inactiveSince = undefined;
        }
        if (!observedGame && s.now() - started >= s.startupTimeout) {
            throw new Error('Proton startup timed out. The runtime may still be preparing; no processes were killed and the stage was retained.');
        }
        await s.sleep(s.pollMs);
    }
}

async function runProtonProfile(root, options = {}, settings = {}) {
    const s = withDefaults(settings);
    if (s.platform !== 'linux') throw new Error('The staged Proton backend is available on native Linux only.');
    root = path.resolve(root);
    if (inFlight.has(root)) throw new Error('A Proton session is already active for this installation.');
    const descriptor = Staging.readDescriptor(root);
    validateRuntime(descriptor);
    const release = reserve(root);
    inFlight.add(root);
    const sessionFile = path.join(root, 'session.json');
    const session = { version: 1, id: crypto.randomUUID(), ownerPid: process.pid, phase: 'preparing' };
    let locked = false;
    let stage;
    let spawned = false;
    try {
        await recoverSession(root, s);
        recordOwner(session);
        fs.writeFileSync(sessionFile, JSON.stringify(session), { flag: 'wx', mode: 0o600, flush: true });
        locked = true;
        await acknowledgeRuntime(root, descriptor, options);
        if (options.args && !isValidArgs(options.args)) throw new Error('Invalid game arguments.');

        const mods = options.mods || (options.database ? Staging.loadMods(options.database, options.selected || []) : []);
        stage = await Staging.prepareStage(root, mods, options);
        Object.assign(session, { phase: 'starting', stage: stage.id });
        Staging.writeJSON(sessionFile, session);

        const env = runtimeEnvironment(root, descriptor, session);
        const args = [path.join(stage.game, descriptor.exeName), ...(options.args || [])];
        const child = s.spawnProcess(descriptor.umu, args, {
            cwd: stage.game,
            env,
            shell: false,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        spawned = true;
        session.pgid = child.pid;
        Staging.writeJSON(sessionFile, session);

        const exit = watchChild(child, runtimeLog(root, options));
        const observedGame = await monitorRuntime(root, session, sessionFile, exit, options, s);
        Staging.discardStage(root, stage.id);
        fs.unlinkSync(sessionFile);
        locked = false;
        if (exit.error) throw exit.error;
        if (exit.code !== 0) throw new Error(`UMU exited with code ${exit.code}. See ${path.join(root, 'runtime.log')}`);
        if (!observedGame) throw new Error('UMU exited but the game process was not observed. A launch was not confirmed.');
        return true;
    } catch (error) {
        if (locked && spawned) {
            // A spawned runtime may still own the stage and prefix, so keep them for recovery.
            session.phase = 'retained';
            session.reason = error.message;
            Staging.writeJSON(sessionFile, session);
        } else if (locked) {
            if (stage) Staging.discardStage(root, stage.id);
            fs.unlinkSync(sessionFile);
        }
        throw error;
    } finally {
        inFlight.delete(root);
        release();
    }
}

async function recoverProtonProfile(root, settings = {}) {
    const s = withDefaults(settings);
    root = path.resolve(root);
    if (inFlight.has(root)) throw new Error('A Proton session is already active for this installation.');
    Staging.readDescriptor(root);
    const release = reserve(root);
    try {
        await recoverSession(root, s);
    } finally {
        release();
    }
}

async function removeProtonProfile(root, dispose, settings = {}) {
    const s = withDefaults(settings);
    root = path.resolve(root);
    if (s.platform !== 'linux') throw new Error('Remove Proton installations from native Linux.');
    if (inFlight.has(root)) throw new Error('A Proton session is still active for this installation.');
    Staging.readDescriptor(root);
    const release = reserve(root, true);
    try {
        const hadSession = fs.existsSync(path.join(root, 'session.json'));
        await recoverSession(root, s);
        // recoverSession only inspects processes when a journal exists.
        if (!hadSession) {
            await requireQuiet(root, {}, s, 'Proton is active or its status is uncertain. Close the game/runtime and retry removal.');
        }
        dispose();
    } finally {
        release();
    }
}

// Installation records

function removalFile(root) {
    const profile = path.dirname(root);
    return path.join(path.dirname(profile), `removed-${path.basename(profile)}.json`);
}

function profileIndex(value) {
    const index = String(value);
    if (!/^(0|[1-9][0-9]*)$/.test(index) || !Number.isSafeInteger(Number(index))) {
        throw new Error('Invalid installation index.');
    }
    return index;
}

function optionalIndex(value) {
    try {
        return profileIndex(value);
    } catch {
        return undefined;
    }
}

function profilePaths(userData, value) {
    const index = profileIndex(value);
    const profile = path.join(fs.realpathSync(userData), `deltamod_system-${index}`);
    const root = path.join(profile, 'proton');
    return { index, profile, root, marker: removalFile(root) };
}

function profileIndices(userData) {
    const indices = fs.readdirSync(userData).flatMap(name => {
        const match = PROFILE_ENTRY.exec(name);
        return match ? [Number(profileIndex(match[1] || match[2]))] : [];
    });
    return [...new Set(indices)].sort((a, b) => a - b);
}

function isValidRemoval(state, index) {
    return state.version === 1 &&
        state.index === index &&
        ['pending', 'done'].includes(state.phase) &&
        typeof state.proton === 'boolean' &&
        typeof state.pid === 'string' &&
        !!state.identity &&
        /^[0-9]+$/.test(state.identity.dev) &&
        /^[0-9]+$/.test(state.identity.ino);
}

function readRemoval(userData, value) {
    const p = profilePaths(userData, value);
    if (!fs.existsSync(p.marker)) return null;
    const state = JSON.parse(safeFile(p.marker, 65536).bytes.toString('utf8'));
    if (!isValidRemoval(state, p.index)) throw new Error('Invalid installation removal record. Preserve it for review.');
    return state;
}

function ownedDirectory(profile) {
    const stat = fs.lstatSync(profile);
    const owned = stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        fs.realpathSync(profile) === profile &&
        !(process.getuid && stat.uid !== process.getuid());
    if (!owned) throw new Error('Unsafe installation directory. Nothing was removed.');
    return stat;
}

function sameIdentity(stat, identity) {
    return String(stat.dev) === identity.dev && String(stat.ino) === identity.ino;
}

// KeyValue appends a '##hash' integrity suffix to store.json.
function readStore(profile) {
    const text = safeFile(path.join(profile, 'store.json'), 1024 * 1024).bytes.toString('utf8');
    return JSON.parse(text.split('##')[0]);
}

function writeRemoval(p, phase, proton, pid, identity) {
    Staging.writeJSON(p.marker, { version: 1, index: p.index, phase, proton, pid, identity });
}

async function removeInstallation(value, { confirm, removeLegacy = () => {} }, {
    userData,
    removeProton = removeProtonProfile,
    removeSteam,
    removeTree = removeDirectory
}) {
    const p = profilePaths(userData, value);
    const lock = p.marker + '.lock';
    writePrivate(lock, { pid: process.pid });
    try {
        const pending = readRemoval(userData, p.index);
        if (pending?.phase === 'done') return true;
        const identity = fs.existsSync(p.profile) ? ownedDirectory(p.profile) : undefined;
        if (!identity && !pending) throw new Error('Installation not found.');
        if (pending && identity && !sameIdentity(identity, pending.identity)) {
            throw new Error('Installation directory identity changed after interrupted removal. Manual review is required.');
        }

        const ownedIdentity = pending?.identity || { dev: String(identity.dev), ino: String(identity.ino) };
        const proton = pending?.proton ?? fs.existsSync(p.root);
        const descriptor = !pending && proton ? Staging.readDescriptor(p.root) : null;
        const store = !pending && !descriptor ? readStore(p.profile) : null;
        const pid = pending?.pid || descriptor?.gameId || store?.gamePid;
        if (typeof pid !== 'string' || !pid) throw new Error('Installation identity is missing. Manual review is required.');
        const steam = descriptor?.backend === 'steam';
        if (!(await confirm({ proton, steam, retry: !!pending }))) return false;

        const dispose = () => {
            if (identity) {
                const latest = fs.lstatSync(p.profile);
                if (latest.dev !== identity.dev || latest.ino !== identity.ino || latest.isSymbolicLink()) {
                    throw new Error('Installation directory changed. Removal refused.');
                }
            }
            // This durable tombstone fences launches and prevents a deleted absolute profile path being reused.
            writeRemoval(p, 'pending', proton, pid, ownedIdentity);
            if (fs.existsSync(p.profile)) removeTree(p.profile);
            writeRemoval(p, 'done', proton, pid, ownedIdentity);
        };

        if (pending) {
            dispose();
        } else if (steam) {
            removeSteam(p.root, { dispose });
        } else if (proton) {
            await removeProton(p.root, dispose);
        } else {
            removeLegacy(Number(p.index));
            dispose();
        }
        return true;
    } finally {
        fs.unlinkSync(lock);
    }
}

function hasGame(p) {
    if (fs.existsSync(p.marker)) return false;
    try {
        const store = JSON.parse(fs.readFileSync(path.join(p.profile, 'store.json'), 'utf8').split('##')[0]);
        return typeof store.gamePid === 'string' && store.gamePid.length > 0 &&
            typeof store.gamePath === 'string' && store.gamePath.length > 0;
    } catch {
        return false;
    }
}

// Keeps a valid selection, else picks the lowest live installation, else the next free import index.
function resolveSelection(userData, value) {
    const known = profileIndices(userData);
    const preferred = optionalIndex(value);
    const selectable = known.filter(index => hasGame(profilePaths(userData, index))).map(String);
    if (selectable.includes(preferred)) return preferred;
    return selectable[0] ?? profileIndex(Math.max(-1, ...known) + 1);
}

module.exports = {
    reserve,
    validateRuntime,
    inspectProcesses,
    runProtonProfile,
    recoverProtonProfile,
    removeProtonProfile,
    removalFile,
    profileIndex,
    profileIndices,
    readRemoval,
    removeInstallation,
    resolveSelection
};
