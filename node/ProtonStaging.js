const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hashCache = new Map();
const OPEN_READ = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
const DELTA_TYPES = ['xdelta', 'g3mpatch'];
const FILE_TYPES = ['override', 'copy'];

function isUnsafePathPart(part) {
    return !part || part === '.' || part === '..' ||
        /[\x00-\x1f<>:"|?*]/.test(part) ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part);
}

function normalizePath(value) {
    if (typeof value !== 'string' || !value || value.length > 1024) throw new Error('Invalid mod path.');
    const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
    if (normalized.split('/').some(isUnsafePathPart)) throw new Error(`Unsafe mod path: ${value}`);
    return normalized;
}

function isRealDirectory(filename) {
    const stat = fs.lstatSync(filename);
    return stat.isDirectory() && !stat.isSymbolicLink();
}

function regularFile(filename) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`Unsafe file or link: ${filename}`);
    return stat;
}

function sameFile(a, b) {
    return a.ino === b.ino && a.dev === b.dev;
}

function unchangedSince(before, after) {
    return after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs;
}

function readFile(filename, encoding, limit = 8 * 1024 * 1024) {
    const stat = regularFile(filename);
    if (stat.size > limit) throw new Error(`Metadata file too large: ${filename}`);
    const fd = fs.openSync(filename, OPEN_READ);
    try {
        const opened = fs.fstatSync(fd);
        if (!sameFile(opened, stat) || opened.nlink !== 1) throw new Error(`File changed: ${filename}`);
        // One spare byte detects a file that grew after the size check.
        const buffer = Buffer.alloc(stat.size + 1);
        let length = 0;
        let count;
        while (length < buffer.length && (count = fs.readSync(fd, buffer, length, buffer.length - length, null))) {
            length += count;
        }
        const after = fs.fstatSync(fd);
        if (length !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
            throw new Error(`File changed while reading: ${filename}`);
        }
        const data = buffer.subarray(0, length);
        return encoding ? data.toString(encoding) : data;
    } finally {
        fs.closeSync(fd);
    }
}

function readJSON(filename) {
    return JSON.parse(readFile(filename, 'utf8'));
}

function hashFile(filename) {
    const stat = regularFile(filename);
    const key = `${filename}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (hashCache.has(key)) return hashCache.get(key);

    const fd = fs.openSync(filename, OPEN_READ);
    const hash = crypto.createHash('sha256');
    try {
        const opened = fs.fstatSync(fd);
        if (!sameFile(opened, stat) || opened.nlink !== 1) throw new Error(`File changed: ${filename}`);
        const buffer = Buffer.alloc(1024 * 1024);
        let count;
        while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
        if (!unchangedSince(stat, fs.fstatSync(fd))) throw new Error(`File changed while hashing: ${filename}`);
    } finally {
        fs.closeSync(fd);
    }

    const result = hash.digest('hex');
    if (hashCache.size >= 4096) hashCache.clear();
    hashCache.set(key, result);
    return result;
}

/**
 * Describes every file and folder under `root` by relative path.
 * Links and case-colliding names are refused so the manifest maps one-to-one onto Windows paths.
 */
function snapshot(root) {
    if (!isRealDirectory(root)) throw new Error(`Unsafe directory or link: ${root}`);
    const result = Object.create(null);
    const seen = new Set();

    function walk(dir, prefix) {
        for (const name of fs.readdirSync(dir).sort()) {
            const relative = normalizePath(prefix + name);
            if (seen.has(relative.toLowerCase())) throw new Error(`Case-colliding paths: ${relative}`);
            seen.add(relative.toLowerCase());

            const full = path.join(root, relative);
            const stat = fs.lstatSync(full);
            if (stat.isSymbolicLink()) throw new Error(`Unsafe link: ${relative}`);
            if (stat.isDirectory()) {
                result[relative] = { directory: true };
                walk(full, relative + '/');
            } else {
                result[relative] = { size: stat.size, sha256: hashFile(full) };
            }
        }
    }

    walk(root, '');
    return result;
}

function sameSnapshot(expected, actual) {
    return JSON.stringify(expected) === JSON.stringify(actual);
}

function writeJSON(filename, value) {
    const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value, null, 4), { flag: 'wx', mode: 0o600, flush: true });
    fs.renameSync(temporary, filename);
}

function copyVerifiedFile(source, target, expectedHash, replace = false) {
    const stat = regularFile(source);
    const input = fs.openSync(source, OPEN_READ);
    let output;
    try {
        const opened = fs.fstatSync(input);
        if (!sameFile(opened, stat) || opened.nlink !== 1) throw new Error(`Source changed while copying: ${source}`);
        if (replace && fs.existsSync(target)) regularFile(target);

        const mode = replace ? fs.constants.O_TRUNC : fs.constants.O_EXCL;
        output = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | mode | (fs.constants.O_NOFOLLOW || 0), 0o600);
        const hash = crypto.createHash('sha256');
        const buffer = Buffer.alloc(1024 * 1024);
        let count;
        while ((count = fs.readSync(input, buffer, 0, buffer.length, null))) {
            hash.update(buffer.subarray(0, count));
            let written = 0;
            while (written < count) written += fs.writeSync(output, buffer, written, count - written);
        }

        if (hash.digest('hex') !== expectedHash || !unchangedSince(stat, fs.fstatSync(input))) {
            throw new Error(`Source changed while copying: ${source}`);
        }
    } finally {
        fs.closeSync(input);
        if (output !== undefined) fs.closeSync(output);
    }
}

function copyTree(source, destination, manifest) {
    fs.mkdirSync(destination);
    const bytes = Object.values(manifest).reduce((sum, entry) => sum + (entry.size || 0), 0);
    const disk = fs.statfsSync(destination);
    if (disk.bavail * disk.bsize < bytes + 32 * 1024 * 1024) throw new Error('Not enough disk space for a clean game stage.');

    for (const [relative, entry] of Object.entries(manifest)) {
        const target = path.join(destination, relative);
        if (entry.directory) fs.mkdirSync(target);
        else copyVerifiedFile(path.join(source, relative), target, entry.sha256);
    }
    if (!sameSnapshot(manifest, snapshot(source))) throw new Error('Source changed while copying.');
}

/**
 * Checks that `root` is the Proton folder Deltamod created and returns its owner record.
 */
function ownedRoot(root) {
    if (fs.realpathSync(root) !== path.resolve(root) || fs.lstatSync(root).isSymbolicLink()) throw new Error('Unsafe Proton storage path.');
    const owner = readJSON(path.join(root, 'owner.json'));
    if (owner.version !== 1 || typeof owner.id !== 'string' || !/^[a-f0-9-]{36}$/.test(owner.id)) {
        throw new Error('Invalid Proton storage owner.');
    }
    for (const name of ['base', 'work', 'prefix']) {
        const child = path.join(root, name);
        if (fs.existsSync(child) && !isRealDirectory(child)) throw new Error(`Unsafe Proton storage directory: ${name}`);
    }
    return owner;
}

function createDescriptor(owner, exeName, settings) {
    if (settings.backend === 'steam') {
        return {
            version: 2, backend: 'steam', owner: owner.id, gameId: settings.gameId, exeName,
            steam: settings.steam, sharedProgressAcknowledged: settings.sharedProgressAcknowledged
        };
    }
    return { version: 1, owner: owner.id, gameId: settings.gameId, umu: settings.umu, proton: settings.proton, exeName };
}

/**
 * Copies the game at `source` into `root/base` and writes the profile's backend descriptor.
 * On any failure the half-created `root` is removed.
 */
function importBase(root, source, settings) {
    source = fs.realpathSync(source);
    const parent = fs.realpathSync(path.dirname(root));
    root = path.join(parent, path.basename(root));
    if (source === parent || parent.startsWith(source + path.sep)) throw new Error('Proton storage cannot be inside the source installation.');

    const manifest = snapshot(source);
    const exeName = normalizePath(settings.exeName);
    if (!manifest[exeName] || manifest[exeName].directory) throw new Error(`Missing executable: ${exeName}`);

    fs.mkdirSync(root, { mode: 0o700 });
    try {
        const owner = { version: 1, id: crypto.randomUUID() };
        writeJSON(path.join(root, 'owner.json'), owner);
        copyTree(source, path.join(root, 'base'), manifest);
        fs.mkdirSync(path.join(root, 'work'));
        fs.mkdirSync(path.join(root, 'prefix'));
        writeJSON(path.join(root, 'base-manifest.json'), manifest);
        const descriptor = createDescriptor(owner, exeName, settings);
        writeJSON(path.join(root, 'backend.json'), descriptor);
        readDescriptor(root);
        return descriptor;
    } catch (error) {
        fs.rmSync(root, { recursive: true, force: true });
        throw error;
    }
}

function isAbsoluteString(value) {
    return typeof value === 'string' && path.isAbsolute(value);
}

function isAppId(value) {
    return /^[1-9][0-9]{0,9}$/.test(value);
}

function isValidSteamSettings(descriptor) {
    const steam = descriptor.steam;
    return descriptor.sharedProgressAcknowledged === true && !!steam &&
        isAppId(steam.appid) && isAppId(steam.account) &&
        ['root', 'source', 'binding'].every(key => isAbsoluteString(steam[key]));
}

function readDescriptor(root) {
    const owner = ownedRoot(root);
    const descriptor = readJSON(path.join(root, 'backend.json'));
    const steam = descriptor.version === 2 && descriptor.backend === 'steam';

    const validBackend = steam || (descriptor.version === 1 && isAbsoluteString(descriptor.umu) && isAbsoluteString(descriptor.proton));
    const validOwner = descriptor.owner === owner.id && typeof descriptor.gameId === 'string' && !!descriptor.gameId;
    if (!validBackend || !validOwner) throw new Error('Invalid Proton backend descriptor. Reimport into a new profile.');
    if (steam && !isValidSteamSettings(descriptor)) throw new Error('Invalid Steam backend descriptor. Reimport into a new profile.');

    const validAcknowledgement = descriptor.runtimeAcknowledged === undefined || typeof descriptor.runtimeAcknowledged === 'boolean';
    if (normalizePath(descriptor.exeName) !== descriptor.exeName || !validAcknowledgement) throw new Error('Invalid Proton backend descriptor.');
    return descriptor;
}

/**
 * Reads the self-closing `<patch type patch to />` entries of a modding.xml.
 * Anything else fails, so an unsupported declaration is never skipped silently.
 */
function parsePatches(xml) {
    const stripped = xml
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\?xml[^?]*\?>/g, '')
        .replace(/<\/?patches\s*>/g, '');
    const patches = [];

    const remainder = stripped.replace(/<patch\s+([^<>]*?)\s*\/>/g, (_, attributes) => {
        const patch = {};
        const extra = attributes.replace(/(type|patch|to)\s*=\s*(["'])([^<>]*?)\2/g, (attribute, key, quote, value) => {
            if (Object.hasOwn(patch, key) || value.includes('&')) throw new Error('Unsupported or ambiguous patch XML.');
            patch[key] = value;
            return '';
        });
        if (extra.trim() || Object.keys(patch).length !== 3) throw new Error('Malformed patch XML.');
        patches.push(patch);
        return '';
    });

    if (remainder.trim()) throw new Error('Unsupported patch XML. Expected self-closing patch entries.');
    return patches;
}

function loadMods(database, selected) {
    if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string') || new Set(selected).size !== selected.length) {
        throw new Error('Invalid selected mod list.');
    }

    const found = new Map();
    for (const name of fs.readdirSync(database)) {
        // Match the legacy mod list: only real folders with a Deltamod identity are mods.
        // A linked folder is skipped, so selecting it fails as a missing mod.
        const idFile = path.join(database, name, '__deltaID.json');
        if (!fs.lstatSync(path.join(database, name)).isDirectory() || !fs.existsSync(idFile)) continue;

        const folder = path.join(database, normalizePath(name));
        const id = readJSON(idFile).uniqueId;
        if (!selected.includes(id)) continue;
        if (found.has(id)) throw new Error(`Duplicate mod identity: ${id}`);

        const variant = path.join(folder, '__variant');
        const filename = fs.existsSync(variant) ? normalizePath(readFile(variant, 'utf8').trim()) : 'modding.xml';
        snapshot(folder);
        const patches = parsePatches(readFile(path.join(folder, filename), 'utf8'));
        found.set(id, { id, name, folder, patches });
    }

    return selected.map(id => {
        if (!found.has(id)) throw new Error(`Selected mod is missing: ${id}`);
        return found.get(id);
    });
}

async function checkCompatibility(mod, base, descriptor, options) {
    const compatibility = path.join(mod.folder, 'proton-compatibility.json');
    if (!fs.existsSync(compatibility)) {
        if (!(await options.confirmUnverified?.(mod))) throw new Error(`Unverified compatibility was not approved for mod: ${mod.name}`);
        return;
    }

    const declared = readJSON(compatibility);
    const files = declared.files;
    if (declared.version !== 1 || !files || Array.isArray(files) || typeof files !== 'object' || !Object.keys(files).length) {
        throw new Error(`Invalid compatibility declaration: ${mod.name}`);
    }
    if (declared.gameId !== descriptor.gameId) throw new Error(`Wrong game in compatibility declaration: ${mod.name}`);
    for (const [name, hash] of Object.entries(files)) {
        const target = normalizePath(name);
        if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error(`Invalid compatibility hash: ${mod.name}, ${target}`);
        if (!base[target] || base[target].sha256 !== hash.toLowerCase()) throw new Error(`Source hash mismatch: ${mod.name}, ${target}`);
    }
}

/**
 * Records every folder level of `target` so two mods cannot disagree on case or on file versus folder.
 */
function claimDestination(destinations, target) {
    const parts = target.split('/');
    for (let i = 1; i <= parts.length; i++) {
        const name = parts.slice(0, i).join('/');
        const directory = i < parts.length;
        const existing = destinations.get(name.toLowerCase());
        if (existing && (existing.name !== name || existing.directory !== directory)) throw new Error(`Case or file/directory collision: ${name}`);
        destinations.set(name.toLowerCase(), { name, directory });
    }
}

/**
 * Validates the clean base and every selected mod, and returns the ordered patch plan.
 * Nothing is written.
 */
async function preflight(root, mods, options) {
    const descriptor = readDescriptor(root);
    const base = Object.assign(Object.create(null), readJSON(path.join(root, 'base-manifest.json')));
    if (!sameSnapshot(base, snapshot(path.join(root, 'base')))) throw new Error('Clean base has changed. Reimport into a new profile.');

    const destinations = new Map(Object.entries(base).map(([name, entry]) => [name.toLowerCase(), { name, directory: !!entry.directory }]));
    const overrides = new Map();
    const plan = [];
    for (const mod of mods) {
        const files = snapshot(mod.folder);
        await checkCompatibility(mod, base, descriptor, options);
        for (const patch of mod.patches) {
            if (![...FILE_TYPES, ...DELTA_TYPES].includes(patch.type)) throw new Error(`Unsupported patch type: ${mod.name}, ${patch.type}`);
            const payload = normalizePath(patch.patch);
            const target = normalizePath(patch.to);
            if (!files[payload] || files[payload].directory) throw new Error(`Missing patch payload: ${mod.name}, ${payload}`);
            claimDestination(destinations, target);
            if (FILE_TYPES.includes(patch.type)) {
                if (overrides.has(target)) throw new Error(`Conflicting mods: ${overrides.get(target)} and ${mod.name}, ${target}`);
                overrides.set(target, mod.name);
            }
            plan.push({ type: patch.type, target, source: path.join(mod.folder, payload), sha256: files[payload].sha256, mod: mod.id });
        }
    }

    for (const patch of plan.filter(p => DELTA_TYPES.includes(p.type))) {
        if (!base[patch.target] && !overrides.has(patch.target)) throw new Error(`Missing delta target: ${patch.target}`);
        if (!options.applyDelta) throw new Error('Linux G3MTool helper is required for delta patches.');
    }
    return { base, plan };
}

/**
 * Builds a disposable modded copy of the clean base under `root/work/<id>/game`.
 * Whole-file patches are applied first, then deltas grouped per target.
 */
async function prepareStage(root, mods, options = {}) {
    const { base, plan } = await preflight(root, mods, options);
    const id = crypto.randomUUID();
    const run = path.join(root, 'work', id);
    const game = path.join(run, 'game');
    fs.mkdirSync(run);
    try {
        writeJSON(path.join(run, 'transaction.json'), {
            version: 1, id, state: 'preparing',
            files: plan.map(p => ({ target: p.target, mod: p.mod, operation: base[p.target] ? 'replace' : 'add' }))
        });
        copyTree(path.join(root, 'base'), game, base);

        fs.mkdirSync(path.join(run, 'payloads'));
        plan.forEach((patch, i) => {
            regularFile(patch.source);
            const extension = DELTA_TYPES.includes(patch.type) ? `.${patch.type}` : '';
            patch.payload = path.join(run, 'payloads', `${i}${extension}`);
            copyVerifiedFile(patch.source, patch.payload, patch.sha256);
        });

        for (const patch of plan.filter(p => FILE_TYPES.includes(p.type))) {
            const target = path.join(game, patch.target);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            copyVerifiedFile(patch.payload, target, patch.sha256, true);
        }

        const deltas = new Map();
        for (const patch of plan.filter(p => DELTA_TYPES.includes(p.type))) {
            if (!deltas.has(patch.target)) deltas.set(patch.target, []);
            deltas.get(patch.target).push(patch.payload);
        }
        for (const [target, payloads] of deltas) {
            await options.applyDelta({ game, target, payloads, scratch: run, log: options.log || (() => {}) });
        }

        snapshot(game);
        writeJSON(path.join(run, 'ready.json'), { version: 1, id });
        return { id, game, run };
    } catch (error) {
        if (fs.existsSync(path.join(run, 'transaction.json'))) {
            discardStage(root, id);
        } else {
            ownedRoot(root);
            fs.rmSync(run, { recursive: true });
        }
        throw error;
    }
}

function discardStage(root, id) {
    ownedRoot(root);
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid stage identity.');
    const run = path.join(root, 'work', id);
    if (!fs.existsSync(run)) return;
    if (!isRealDirectory(run)) throw new Error('Unsafe stage cleanup path.');
    const journal = readJSON(path.join(run, 'transaction.json'));
    if (journal.id !== id || journal.version !== 1) throw new Error('Invalid stage transaction.');
    fs.rmSync(run, { recursive: true });
}

module.exports = {
    importBase,
    readDescriptor,
    prepareStage,
    discardStage,
    loadMods,
    parsePatches,
    normalizePath,
    snapshot,
    hashFile,
    readFile,
    writeJSON,
    ownedRoot
};
