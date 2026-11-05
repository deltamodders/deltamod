const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TextDecoder } = require('util');

const LIMIT = 8 * 1024 * 1024;

function parseVdf(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > LIMIT || text.includes('\0')) {
        throw new Error('Unsupported Steam configuration encoding or size.');
    }
    let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    let count = 0;
    function token() {
        while (offset < text.length) {
            if (/\s/.test(text[offset])) {
                offset++;
            } else if (text.slice(offset, offset + 2) === '//') {
                const end = text.indexOf('\n', offset);
                offset = end < 0 ? text.length : end;
            } else {
                break;
            }
        }
        if (offset === text.length) return null;
        if (++count > 200000) throw new Error('Steam configuration has too many tokens.');
        const start = offset;
        const first = text[offset++];
        if (first === '{' || first === '}') return { value: first, start, end: offset, brace: true };
        let value = '';
        if (first === '"') {
            let closed = false;
            while (offset < text.length) {
                const ch = text[offset++];
                if (ch === '"') {
                    closed = true;
                    break;
                }
                if (ch === '\\') {
                    const escaped = text[offset++];
                    if (escaped !== '\\' && escaped !== '"') throw new Error('Unsupported VDF escape.');
                    value += escaped;
                } else {
                    if (ch.charCodeAt(0) < 32) throw new Error('Unsupported VDF string.');
                    value += ch;
                }
            }
            if (!closed) throw new Error('Unterminated VDF string.');
        } else {
            value = first;
            while (offset < text.length && !/[\s{}"]/.test(text[offset])) value += text[offset++];
        }
        return { value, start, end: offset, brace: false };
    }
    function object(depth, root = false) {
        if (depth > 32) throw new Error('Steam configuration is nested too deeply.');
        const children = new Map();
        while (true) {
            const key = token();
            if (!key || key.value === '}' && key.brace) {
                if (root ? key !== null : key === null) throw new Error('Unbalanced VDF object.');
                return { children, close: key ? key.start : text.length };
            }
            if (key.brace) throw new Error('Unexpected VDF object.');
            const folded = key.value.toLowerCase();
            if (children.has(folded)) throw new Error('Duplicate or case-ambiguous Steam configuration key.');
            const value = token();
            if (!value || value.value === '}' && value.brace) throw new Error('Missing VDF value.');
            const node = value.brace ? object(depth + 1) : { value: value.value, token: value };
            children.set(folded, { ...node, key, end: value.brace ? offset : value.end });
        }
    }
    return object(0, true);
}

function quoteVdf(value) {
    if (typeof value !== 'string' || /[\x00-\x1f]/.test(value) || value.length > 16384) throw new Error('Invalid Steam Launch Options.');
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function optionNode(text, appid) {
    if (!/^[1-9][0-9]{0,9}$/.test(String(appid))) throw new Error('Invalid Steam app ID.');
    const tree = parseVdf(text);
    if (tree.children.size !== 1 || !tree.children.get('userlocalconfigstore')?.children) throw new Error('Unsupported Steam localconfig layout. Use manual Launch Options setup.');
    const keys = ['Software', 'Valve', 'Steam', 'apps', String(appid), 'LaunchOptions'];
    let parent = tree.children.get('userlocalconfigstore');
    for (let i = 0; i < keys.length; i++) {
        const node = parent.children.get(keys[i].toLowerCase());
        if (!node) return { parent, missing: keys.slice(i) };
        if (i === keys.length - 1) {
            if (node.children) throw new Error('LaunchOptions is not a string.');
            return { parent, node };
        }
        if (!node.children) throw new Error('Unsupported Steam localconfig layout.');
        parent = node;
    }
}

function editLaunchOptions(text, appid, value) {
    const { parent, missing, node } = optionNode(text, appid);
    const previous = node?.value;
    if (previous === value) return { text, previous };
    if (node) {
        const start = value === undefined ? node.key.start : node.token.start;
        const replacement = value === undefined ? '' : quoteVdf(value);
        return { text: text.slice(0, start) + replacement + text.slice(node.end), previous };
    }
    if (value === undefined) return { text, previous };
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    let inserted = quoteVdf(value);
    for (let i = missing.length - 1; i >= 0; i--) {
        inserted = quoteVdf(missing[i]) + (i === missing.length - 1 ? '\t' + inserted : '\t{ ' + inserted + ' }');
    }
    return { text: text.slice(0, parent.close) + newline + inserted + newline + text.slice(parent.close), previous };
}

function shellQuote(value) {
    if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) throw new Error('Unsafe hook path.');
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

// Steam's Launch Options field can drop quotes, so a hook path that needs none is written bare.
function hookWord(hook) {
    const needsQuoting = !/^\/[A-Za-z0-9_\/.,:+@-]+$/.test(hook);
    return needsQuoting ? shellQuote(hook) : hook;
}

function hookCommand(hook) {
    return hookWord(hook) + ' %command%';
}

/**
 * Replaces Deltamod's own hook, quoted or bare, in front of the single `%command%` with plain `%command%`.
 * Anything else, including a repeated hook, is returned unchanged.
 */
function withoutOwnHook(options, hook) {
    if (typeof options !== 'string' || !containsOnce(options, '%command%')) return options;
    for (const word of [shellQuote(hook), hook]) {
        const command = word + ' %command%';
        const at = options.indexOf(command);
        const startsWord = at === 0 || /\s/.test(options[at - 1]);
        if (at === -1 || !startsWord || !containsOnce(options, command)) continue;

        const stripped = options.slice(0, at) + '%command%' + options.slice(at + command.length);
        const hookRemains = stripped.includes(hook) || stripped.includes(shellQuote(hook));
        return hookRemains ? options : stripped;
    }
    return options;
}

function isEnvironmentAssignment(token) {
    return /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(token.raw);
}

/**
 * Inserts the hook in front of `%command%` in the user's Launch Options.
 * Only plain arguments and leading `NAME=value` assignments are understood; anything a shell would evaluate needs manual setup.
 */
function composeOptions(previous, hook) {
    const input = previous || '';
    if (input.length > 8192 || /[$`;&|<>\r\n!(){}]/.test(input)) throw new Error('Complex Launch Options require manual setup. No settings were overwritten.');
    const tokens = [];
    const pattern = /(?:[^\s'"\\]+|'[^']*'|"[^"\\]*"|\\[ \\"'])+/gy;
    let cursor = 0;
    while (cursor < input.length) {
        if (/\s/.test(input[cursor])) {
            cursor++;
            continue;
        }
        pattern.lastIndex = cursor;
        const match = pattern.exec(input);
        if (!match) throw new Error('Unsupported Launch Options quoting. Use manual setup.');
        tokens.push({ raw: match[0], start: cursor, end: pattern.lastIndex });
        cursor = pattern.lastIndex;
    }
    const command = tokens.filter(t => t.raw.includes('%command%'));
    if (!command.length) return hookCommand(hook) + (input.trim() ? ' ' + input : '');
    const target = command[0];
    if (command.length !== 1 || target.raw !== '%command%') throw new Error('Ambiguous %command% in Launch Options.');
    const wrappers = tokens.slice(0, tokens.indexOf(target));
    if (!wrappers.every(isEnvironmentAssignment)) throw new Error('Launch Options wrappers require manual setup.');
    return input.slice(0, target.start) + hookWord(hook) + ' ' + input.slice(target.start);
}

/**
 * True when the current user owns `stat` and none of the `forbidden` permission bits are set.
 * Platforms without POSIX users always pass.
 */
function isPrivatelyOwned(stat, forbidden) {
    if (!process.getuid) return true;
    return stat.uid === process.getuid() && !(stat.mode & forbidden);
}

/**
 * Reads a regular, unlinked, owner-only file in one pass and returns its bytes, stat and SHA-256.
 */
function safeFile(filename, maximum = LIMIT) {
    const resolved = path.resolve(filename);
    if (fs.realpathSync(path.dirname(resolved)) !== path.dirname(resolved)) throw new Error('Symlinked parent path is unsupported.');
    const fd = fs.openSync(resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    try {
        const stat = fs.fstatSync(fd);
        const named = fs.lstatSync(resolved);
        const plainFile = stat.isFile() && !named.isSymbolicLink() && stat.nlink === 1 && stat.size <= maximum;
        const sameFile = stat.ino === named.ino && stat.dev === named.dev;
        if (!plainFile || !sameFile || !isPrivatelyOwned(stat, 0o022)) throw new Error('Unsafe file ownership, permissions, type or size.');
        const buffer = Buffer.alloc(stat.size + 1);
        let size = 0;
        while (size < buffer.length) {
            const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
            if (!count) break;
            size += count;
        }
        const bytes = buffer.subarray(0, size);
        const after = fs.fstatSync(fd);
        if (bytes.length !== stat.size || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) throw new Error('File changed while reading.');
        return { bytes, stat, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
    } finally {
        fs.closeSync(fd);
    }
}

function decode(bytes) {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('Unsupported Steam configuration encoding.');
    return text;
}

function privateDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    ownedDirectory(directory, true);
}

function ownedDirectory(directory, privateOnly = false) {
    const stat = fs.lstatSync(directory);
    const realDirectory = stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(directory) === path.resolve(directory);
    if (!realDirectory || !isPrivatelyOwned(stat, privateOnly ? 0o077 : 0o022)) throw new Error('Unsafe directory ownership, permissions or path.');
}

function isEphemeralPath(resolved) {
    const temporary = /^\/(?:tmp|var\/tmp|run)(?:\/|$)/.test(resolved);
    const appImageMount = /\/\.mount_[^/]+(?:\/|$)/.test(resolved);
    return temporary || appImageMount;
}

/**
 * Resolves `filename`, refusing locations that do not survive a reboot or an AppImage exit.
 * Steam keeps calling the hook path, so it must stay valid.
 */
function durablePath(filename) {
    const resolved = path.resolve(filename);
    if (isEphemeralPath(resolved)) {
        throw new Error('Steam integration needs persistent storage, not /tmp or an AppImage mount. Create a persistent profile first.');
    }
    return resolved;
}

/**
 * Creates `filename` exclusively with owner-only permissions. Objects are written as JSON.
 */
function writePrivate(filename, value) {
    const content = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 4);
    fs.writeFileSync(filename, content, { flag: 'wx', mode: 0o600, flush: true });
    syncDirectory(path.dirname(filename));
}

function syncDirectory(directory) {
    if (process.platform !== 'linux') return;
    const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try {
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

function isProtectedService(proc, fields, argv, comm) {
    const binaries = {
        '/usr/lib/systemd/systemd': 'systemd',
        '/usr/bin/kwin_wayland': 'kwin_wayland',
        '/usr/lib/polkit-kde-authentication-agent-1': 'polkit-kde-auth'
    };
    function trustedBinary(executable, name) {
        if (!binaries[executable] || binaries[executable] !== name) return false;
        const stat = proc.statSync(executable);
        return stat.uid === 0 && (stat.mode & 0o170000) === 0o100000 && (stat.mode & 0o022) === 0;
    }
    try {
        if (trustedBinary(argv[0], comm)) {
            return comm !== 'systemd' || (fields[1] === '1' && argv.includes('--user'));
        }
        if (comm !== '(sd-pam)' && comm !== 'sshd-session') return false;
        const parent = path.join('/proc', fields[1]);
        const stat = proc.readFileSync(path.join(parent, 'stat'), 'utf8');
        const parentFields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        const parentName = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
        if (BigInt(parentFields[19]) > BigInt(fields[19])) return false;
        const parentArgv = proc.readFileSync(path.join(parent, 'cmdline'), 'utf8').split('\0').filter(Boolean);
        if (comm === '(sd-pam)') {
            return argv[0] === '(sd-pam)' && parentName === 'systemd' && parentFields[1] === '1' && parentArgv.includes('--user') &&
                trustedBinary(parentArgv[0], parentName);
        }
        return argv[0]?.startsWith('sshd-session: ') && parentName === 'sshd-session' &&
            parentArgv[0]?.startsWith('sshd-session: ') && proc.statSync(parent).uid === 0;
    } catch {
        return false;
    }
}

function steamClosed(proc = fs, { platform = process.platform, uid = process.getuid?.() } = {}) {
    if (platform !== 'linux') throw new Error('Steam integration setup is Linux-only.');
    for (const entry of proc.readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) continue;
        try {
            const folder = '/proc/' + entry;
            if (proc.statSync(folder).uid !== uid) continue;
            const name = proc.readFileSync(folder + '/comm', 'utf8').trim();
            if (/^(?:steam|steamwebhelper|steam-runtime.*|pressure-vessel.*)$/i.test(name)) return false;
        } catch (error) {
            if (!['ENOENT', 'ESRCH'].includes(error.code)) throw new Error('Cannot confirm that Steam is fully exited.');
        }
    }
    return true;
}

function configPath(steamRoot, account) {
    if (!/^[1-9][0-9]{0,9}$/.test(String(account))) throw new Error('Invalid confirmed Steam account.');
    let directory = fs.realpathSync(steamRoot);
    ownedDirectory(directory);
    for (const name of ['userdata', String(account), 'config']) {
        directory = path.join(directory, name);
        ownedDirectory(directory);
    }
    return path.join(directory, 'localconfig.vdf');
}

function requireSteamClosed(effects) {
    const isSteamClosed = effects.isSteamClosed || steamClosed;
    if (!isSteamClosed()) {
        throw new Error('Fully exit Steam before installing, repairing or removing Launch Options. Deltamod will not close it for you.');
    }
}

function sameFileContent(latest, original) {
    return latest.hash === original.hash && latest.stat.ino === original.stat.ino && latest.stat.dev === original.stat.dev;
}

/**
 * Replaces localconfig.vdf with `next` and records `state` as the new registry.
 * A backup and a journal are written first; the journal is kept whenever promotion cannot be verified.
 */
function transact(directory, config, original, next, state, effects) {
    const beforePromote = effects.beforePromote || (() => {});
    const promote = effects.promote || fs.renameSync;

    const journal = path.join(directory, 'transaction.json');
    if (fs.existsSync(journal)) throw new Error('An interrupted Steam settings transaction needs review. No settings were changed.');
    const id = crypto.randomUUID();
    writePrivate(path.join(directory, 'backup-' + id + '.vdf'), original.bytes);
    writePrivate(journal, {
        version: 1, config, before: original.hash,
        after: crypto.createHash('sha256').update(next).digest('hex'), state
    });

    const temporary = path.join(path.dirname(config), '.deltamod-' + id + '.tmp');
    try {
        writePrivate(temporary, next);
        fs.chmodSync(temporary, original.stat.mode & 0o777);
        beforePromote();
        requireSteamClosed(effects);
        if (!sameFileContent(safeFile(config), original)) {
            throw new Error('Steam configuration changed during setup. Retry only after reviewing the transaction.');
        }
        promote(temporary, config);
        syncDirectory(path.dirname(config));
        if (!safeFile(config).bytes.equals(Buffer.from(next))) throw new Error('Steam settings verification failed. Retained backup and journal.');

        const pending = path.join(directory, 'state-' + id + '.tmp');
        writePrivate(pending, state);
        fs.renameSync(pending, path.join(directory, 'options.json'));
        syncDirectory(directory);
        fs.unlinkSync(journal);
        syncDirectory(directory);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

function isAbsoluteString(value) {
    return typeof value === 'string' && path.isAbsolute(value);
}

function isValidRegistry(state) {
    return state.version === 1 &&
        typeof state.active === 'boolean' &&
        Array.isArray(state.profiles) && state.profiles.every(isAbsoluteString) &&
        isAbsoluteString(state.config) &&
        typeof state.hook === 'string' &&
        typeof state.managed === 'string' &&
        /^[1-9][0-9]{0,9}$/.test(state.appid) &&
        (state.previous === undefined || typeof state.previous === 'string');
}

function readJsonFile(filename) {
    return JSON.parse(decode(safeFile(filename, 65536).bytes));
}

/**
 * Returns the managed Launch Options registry of a binding directory, or null when none was installed.
 */
function readLaunchOptions(directory) {
    ownedDirectory(directory, true);
    if (fs.existsSync(path.join(directory, 'transaction.json'))) {
        throw new Error('An interrupted Steam settings transaction needs review. Retained backup and journal.');
    }
    const filename = path.join(directory, 'options.json');
    if (!fs.existsSync(filename)) return null;
    const state = readJsonFile(filename);
    if (!isValidRegistry(state)) throw new Error('Invalid managed Steam options registry.');
    return state;
}

/**
 * Serializes every settings change of one binding directory through `options.lock`.
 */
function withLock(directory, operation) {
    privateDirectory(directory);
    const lock = path.join(directory, 'options.lock');
    writePrivate(lock, { pid: process.pid });
    try {
        return operation();
    } finally {
        fs.unlinkSync(lock);
    }
}

/**
 * Adds `profile` to the managed hook for `appid`, wrapping the user's existing Launch Options on first install.
 * `effects` replaces the Steam check and the file promotion in tests.
 */
function installLaunchOptions({ directory, steamRoot, account, appid, hook, profile }, effects = {}) {
    return withLock(directory, () => {
        requireSteamClosed(effects);
        privateDirectory(directory);
        const config = configPath(steamRoot, account);
        const original = safeFile(config);
        const text = decode(original.bytes);
        const prior = readLaunchOptions(directory);
        if (prior && (prior.config !== config || prior.appid !== String(appid) || prior.hook !== hook)) {
            throw new Error('Steam integration binding does not match this account, game or hook.');
        }

        const current = editLaunchOptions(text, appid, undefined).previous;
        const active = prior?.active;
        if (active && current !== prior.managed) {
            throw new Error('Steam Launch Options were edited outside Deltamod. Keep your changes and use manual setup or review the backup.');
        }
        const previous = active ? prior.previous : withoutOwnHook(current, hook);
        let managed = prior?.managed;
        if (!active) {
            // Options that already run this hook, for example after an interrupted setup, are kept as Steam saved them.
            managed = previous !== current ? current : composeOptions(previous, hook);
        }
        const profiles = [...new Set([...(active ? prior.profiles : []), path.resolve(profile)])];
        const state = { version: 1, config, appid: String(appid), hook, previous, managed, active: true, profiles };
        if (active && prior.profiles.includes(path.resolve(profile))) return prior;

        transact(directory, config, original, editLaunchOptions(text, appid, managed).text, state, effects);
        // A pending manual setup is moot once the hook is installed.
        fs.rmSync(path.join(directory, 'manual.json'), { force: true });
        return state;
    });
}

/**
 * Drops `profile` from the managed hook. The original Launch Options come back only when no profile remains.
 * Returns true when the hook was removed from Steam.
 */
function removeLaunchOptions({ directory, profile }, effects = {}) {
    return withLock(directory, () => {
        requireSteamClosed(effects);
        privateDirectory(directory);
        const prior = readLaunchOptions(directory);
        if (!prior?.active) return false;

        const original = safeFile(prior.config);
        const text = decode(original.bytes);
        if (editLaunchOptions(text, prior.appid, undefined).previous !== prior.managed) {
            throw new Error('Steam Launch Options were edited outside Deltamod. Removal refused to preserve your changes.');
        }
        const profiles = prior.profiles.filter(p => p !== path.resolve(profile));
        const state = { ...prior, profiles, active: profiles.length > 0 };
        const next = profiles.length ? text : editLaunchOptions(text, prior.appid, prior.previous).text;
        transact(directory, prior.config, original, next, state, effects);
        return profiles.length === 0;
    });
}

/**
 * Backs up localconfig.vdf and returns the hook command the user must add to Launch Options by hand.
 */
function prepareManualLaunchOptions({ directory, steamRoot, account, appid, hook }, effects = {}) {
    return withLock(directory, () => {
        requireSteamClosed(effects);
        if (readLaunchOptions(directory)?.active) throw new Error('An active managed integration cannot be replaced by manual setup.');
        const config = configPath(steamRoot, account);
        const original = safeFile(config);
        const previous = withoutOwnHook(editLaunchOptions(decode(original.bytes), appid, undefined).previous, hook);
        const filename = path.join(directory, 'manual.json');
        const state = { version: 1, config, account, appid: String(appid), hook, previous };

        if (fs.existsSync(filename)) {
            const earlier = readJsonFile(filename);
            const sameSetup = JSON.stringify({ ...earlier, previous: withoutOwnHook(earlier.previous, hook) }) === JSON.stringify(state);
            if (!sameSetup) throw new Error('An earlier manual setup needs review before retrying.');
        } else {
            writePrivate(path.join(directory, 'manual-backup-' + crypto.randomUUID() + '.vdf'), original.bytes);
            writePrivate(filename, state);
        }
        return hookCommand(hook);
    });
}

function containsOnce(text, part) {
    return text.split(part).length === 2;
}

/**
 * Registers Launch Options the user edited by hand, once they contain the prepared hook exactly once.
 */
function adoptManualLaunchOptions({ directory, steamRoot, account, appid, hook, profile }, effects = {}) {
    return withLock(directory, () => {
        requireSteamClosed(effects);
        const prepared = readJsonFile(path.join(directory, 'manual.json'));
        const config = configPath(steamRoot, account);
        const samePreparation = prepared.config === config && prepared.appid === String(appid) &&
            prepared.account === account && prepared.hook === hook;
        if (!samePreparation) throw new Error('Manual setup identity mismatch.');

        const original = safeFile(config);
        const text = decode(original.bytes);
        const current = editLaunchOptions(text, appid, undefined).previous;
        const hookFound = typeof current === 'string' && withoutOwnHook(current, hook) !== current;
        if (!hookFound) throw new Error('The exact manual hook was not found once in Launch Options. No settings were changed.');

        const state = {
            version: 1, config, appid: String(appid), hook, previous: withoutOwnHook(prepared.previous, hook), managed: current,
            active: true, manual: true, profiles: [path.resolve(profile)]
        };
        transact(directory, config, original, text, state, effects);
        fs.unlinkSync(path.join(directory, 'manual.json'));
        return state;
    });
}

module.exports = {
    editLaunchOptions,
    parseVdf,
    composeOptions,
    shellQuote,
    safeFile,
    decode,
    privateDirectory,
    ownedDirectory,
    durablePath,
    writePrivate,
    steamClosed,
    configPath,
    readLaunchOptions,
    installLaunchOptions,
    removeLaunchOptions,
    prepareManualLaunchOptions,
    adoptManualLaunchOptions,
    isProtectedService,
    syncDirectory
};
