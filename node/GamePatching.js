// Hello Ghino! this is the new GamePatching module, with G3M Support!, I hope you like it!
// I also did a small change to Runner.js so I could test G3M, in lines 762-765, but that should be easily reversible if you want to keep the old flow for now.
// Everything new will be marked with [Zork’s PATCH] so you can easily find it.
// ------------------------------------------------------------------
// [Zork’s PATCH] — G3M native patcher support (see also Modstore.js):
//   - Added G3M_NATIVE patcher as default. GM3P and DEVICE_FUSION fully preserved.
//   - G3M mods (mod_config.json manifest) recognised by findModRoot() and import flow in Modstore.js.
//   - .xdelta mods: pure-JS via @chainsafe/xdelta3-node decodeSync (single) or G3MTool CLI (multi-mod).
//   - .g3mpatch mods: two-tier resolution —
//       1. extractVcdiffFromG3MPatch: checks VCDIFF magic (0xD6 0xC3 0xC4) inside ZIP. If detected, applied
//          in-process with decodeSync — no external binary needed. (Most likely code path for G3MTool-generated patches.)
//       2. G3MTool CLI: if binary entry is not VCDIFF. Bundled in deltamod/tools/.
//   - Chapter mapping: G3M IDs (‘deltarune_0’, ‘deltarune_1’, ...) resolved via trailing-digit extraction.
//   - Idempotent patching: always reads from .original backup so re-patching never operates on an already-patched file.
//   - Patcher selection: KeyValue.writeKVS(‘selectedPatcher’, ‘GM3P’|’DEVICE_FUSION’|’G3M_NATIVE’) for first-boot UI.

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { exec } = require('child_process');
const { timeoutPromise } = require('./Utils.js');
const { emitKeypress } = require('emit-keypress');
const { log } = require('./Console.js');
const convert = require('xml-js');
const process = require('process');
const console = require('./Console.js');

let GM3P_EXE;
let Patcher;
let GM3P_DLL;
let UTMT_EXE;
let DOTNET_UNIX;


const GM3P_OUTPUT = path.join(__dirname, '../gm3p/output')
const UTMT_FOLD = path.join(__dirname, '../gm3p/UTMTCLI')

// [Zork's PATCH]: Read user-selected patcher from KeyValue store before platform detection
{
    let selectedPatcher = (
        fs.existsSync(path.join(__dirname, '../gm3p/GM3P.exe')) ? 'GM3P' :
        fs.existsSync(path.join(__dirname, '../gm3p/GamemakerModMerger.exe')) ? 'DEVICE_FUSION' :
        'G3M_NATIVE'
    );
    if (selectedPatcher === 'GM3P' || selectedPatcher === 'DEVICE_FUSION') {
        // User explicitly chose a binary patcher — let platform detection below confirm and set EXE paths
        Patcher = selectedPatcher;
    } else {
        // null, undefined, or 'G3M_NATIVE' → use pure-JS native path, skip GM3P binary detection
        Patcher = 'G3M_NATIVE';
    }
}

// Checks to see what platform DeltaMOD is running on and set constants accordingly
// [Zork's PATCH]: Only run binary detection when not using G3M_NATIVE
if (Patcher !== 'G3M_NATIVE') {
if (process.platform === 'win32') {
    if (fs.existsSync(path.join(__dirname, '../gm3p/GM3P.exe'))) {
        GM3P_EXE = 'start /B \"DeltaMOD GM3P run\" \"' + (path.join(__dirname, '../gm3p/GM3P.exe')) + '\"';
        Patcher = 'GM3P';
    } else {
        GM3P_EXE = 'start /B \"DeltaMOD GM3P run\" \"' + (path.join(__dirname, '../gm3p/GamemakerModMerger.exe')) + '\"';
        Patcher = 'DEVICE_FUSION';
    }
    GM3P_DLL = '';
    UTMT_EXE = path.join(UTMT_FOLD, 'UndertaleModCli.exe');
    DOTNET_UNIX = '';
} else {
    GM3P_EXE = '/usr/bin/dotnet';

    if (fs.existsSync(path.join(__dirname, '../gm3p/GM3P.exe'))) {
        GM3P_DLL = path.join(__dirname, '../gm3p/GM3P.dll');
        Patcher = 'GM3P';
    } else {
        GM3P_DLL = path.join(__dirname, '../gm3p/GamemakerModMerger.dll');
        Patcher = 'DEVICE_FUSION';
    }
    UTMT_EXE = path.join(UTMT_FOLD, 'UndertaleModCli.dll');
    DOTNET_UNIX = '/usr/bin/dotnet';
}
}
const BACKUP_SUFFIX = '.original';

// ----------------------------- logger ---------------------------------------
const t0 = process.hrtime.bigint();
const ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
let sendToWin = null;
function clog(...args) {
    console.log(...args);
    if (sendToWin) {
        sendToWin.webContents.send('gplog', [...args]);
    }
}
function trunc(s, n = 10000) {
    if (!s) return '';
    s = String(s);
    return s.length > n ? s.slice(0, n) + '... [truncated]' : s;
}

// ----------------------------- helpers --------------------------------------

function run(file, args, opts = {}) {
    const _opts = {
        windowsHide: true,
        maxBuffer: 24 * 1024 * 1024, // 24MB
        timeout: 10 * 60 * 1000,     // 10 minutes hard cap (avoid infinite hangs)
        ...opts
    };
    clog('RUN:', file, JSON.stringify(args));
    return new Promise((resolve, reject) => {
        const child = exec(file, _opts, (err, stdout, stderr) => {
            // final callback: keep a summarized dump for compatibility
            if (stdout) clog('stdout (final):', trunc(stdout));
            if (stderr) clog('stderr (final):', trunc(stderr));
            if (err) {
            return reject(new Error((stderr || '') + (stdout || '') || err.message));
            }
            resolve({ stdout, stderr });
        });

        // Helper to stream and log each line as it arrives
        function streamLines(stream, label) {
            if (!stream) return;
            let buf = '';
            stream.on('data', (chunk) => {
            buf += String(chunk);
            let idx;
            while ((idx = buf.indexOf('\n')) !== -1) {
                let line = buf.slice(0, idx);
                buf = buf.slice(idx + 1);
                // normalize CRLF and truncate if needed
                line = line.replace(/\r$/, '');
                clog(label, trunc(line));
            }
            });
            stream.on('end', () => {
            if (buf.length) {
                const line = buf.replace(/\r$/, '');
                clog(label, trunc(line));
                buf = '';
            }
            });
            stream.on('error', (e) => clog(label, 'stream error:', e && e.message));
        }

        streamLines(child.stdout, 'stdout:');
        streamLines(child.stderr, 'stderr:');

        child.on('error', (e) => {
            clog('child process error:', e && e.message);
        });
    });
}

function copyOver(src, dst) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.lstatSync(src).isFile()) {
        fs.copyFileSync(src, dst);
    } else {
        fs.cpSync(src, dst, { recursive: true });
    }
}

function ensureBackup(targetAbs) {
    if (!targetAbs) return;
    const backup = targetAbs + BACKUP_SUFFIX;
    if (fs.existsSync(targetAbs) && !fs.existsSync(backup)) {
        const sz = safeStat(targetAbs)?.size ?? 0;
        clog('Backup →', backup, `(size ${sz} bytes)`);
        copyOver(targetAbs, backup);
    }
}

function restoreIfBackup(targetAbs) {
    const backup = targetAbs + BACKUP_SUFFIX;
    if (fs.existsSync(backup)) {
        clog('Restore from backup:', backup);
        try { fs.rmSync(targetAbs, { force: true }); } catch {}
        copyOver(backup, targetAbs);
        try { fs.rmSync(backup, { force: true }); } catch {}
        return true;
    }
    return false;
}
// find the first file named `name` anywhere under `root`
function findFirstByName(root, name) {
    const stack = [root];
    const needle = name.toLowerCase();
    while (stack.length) {
        const dir = stack.pop();
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
            const full = path.join(dir, e.name);
            if (e.isFile() && e.name.toLowerCase() === needle) return full;
            if (e.isDirectory()) stack.push(full);
        }
    }
    return null;
}

// find the directory that looks like the "mod root"
function findModRoot(root) {
    const stack = [root];
    let fallback = null;
    while (stack.length) {
        const dir = stack.pop();
        let searchFile = "modding.xml";
        if (fs.existsSync(path.join(dir, '__variant'))) {
            searchFile = fs.readFileSync(path.join(dir, '__variant'), 'utf8').trim() + '.xml';
        }
        const hasXml  = fs.existsSync(path.join(dir, searchFile));
        const hasId   = fs.existsSync(path.join(dir, '__deltaID.json'));
        const hasInfo = fs.existsSync(path.join(dir, 'meta.json'));
        const hasG3M  = fs.existsSync(path.join(dir, 'mod_config.json')); // [Zork's PATCH]: G3M mod format recognition
        if ((hasXml && hasId) || hasG3M) return dir;
        if (!fallback && (hasXml || hasId || hasInfo || hasG3M)) fallback = dir;

        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) if (e.isDirectory()) stack.push(path.join(dir, e.name));
    }
    return fallback || root;
}

function resolveAbsTarget(gamePath, toTarget) {
    if (!toTarget || toTarget === '.') toTarget = 'data.win';
    const cleaned = String(toTarget).replace(/^[.][/\\]/, '');
    const abs = path.isAbsolute(cleaned) ? path.normalize(cleaned) : path.join(gamePath, cleaned);
    return abs;
}

// Recursive walk for xml-js ({compact:false})
function walkElements(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { for (const n of node) walkElements(n, out); return out; }
    if (node.type === 'element' || node.name) out.push(node);
    if (node.elements && Array.isArray(node.elements)) {
        for (const ch of node.elements) walkElements(ch, out);
    }
    return out;
}

// Pick first existing attribute name
function pickAttr(attrs, ...keys) {
    for (const k of keys) {
        if (attrs && attrs[k] != null && attrs[k] !== '') return attrs[k];
    }
    return undefined;
}

// Conflict detector for external file overrides only
function detectFileConflicts(overrides) {
    const map = new Map(); // destAbs -> Set(modName)
    for (const o of overrides) {
        const key = o.to.toLowerCase();
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(o.modName);
    }
    const conflicts = [];
    for (const [to, mods] of map.entries()) {
        if (mods.size > 1) conflicts.push(Array.from(mods));
    }
    return { found: conflicts.length > 0, conflicts };
}
//Zork's Patch: This function discovers all chapters in the gamePath
// It looks for data.win files in the root and subdirectories, mirroring the C# structure of GM3P.
function discoverChapters(gamePath) {
    const out = [];
    const root = path.join(gamePath, 'data.win');
    if (fs.existsSync(root)) out.push(root);

    // EXACTLY mirror C# Directory.GetDirectories(...).OrderBy(d => d), or multi chapter mods will not work
    // (they expect the data.win files to be in a specific order)
    // This is a bit of a hack, but it works for the current game structure.
    const subdirs = fs.readdirSync(gamePath, { withFileTypes: true })
        .filter(d => d.isDirectory && d.isDirectory())
        .map(d => path.join(gamePath, d.name))
        .sort((a, b) => a.localeCompare(b)); // lexicographic, full path

    for (const dir of subdirs) {
        const candidate = path.join(dir, 'data.win');
        if (fs.existsSync(candidate)) out.push(candidate);
    }
    return out;
}

function safeReadDir(dir, opts) {
    try { return fs.readdirSync(dir, opts); } catch { return []; }
}
function safeStat(p) {
    try { return fs.statSync(p); } catch { return null; }
}

const onKeyPress = (input, key, close) => {
    // do stuff with keypress events
    console.log({ input, key });

    // Close the stream if the user presses `Ctrl+C`
    if (input === '\x03') {
        dialog.showErrorBox('Patching was cancelled', 'Patching was cancelled.');
        for (const t of chapterTargets) restoreIfBackup(t);
        ret.log = log.concat('Patching was cancelled').join('\n');
        return ret;
        close();
    }
};

// [Zork's PATCH]: parseG3MManifest — reads mod_config.json and returns patch entries for G3M mods
/**
 * @param {string} modRoot - Absolute path to the mod root directory
 * @param {string} modName - Human-readable mod name for conflict reporting
 * @returns {Array<{type: 'g3m-xdelta'|'g3m-patch', patchFile: string, chapterKey: string, modName: string}>}
 */
// [Zork's PATCH]: classifyG3MPatchFile — mirrors G3M's mod_content_utils.classify_patch_file logic.
// Priority order: g3mpatch > xdelta > datafile (csx unsupported in G3M_NATIVE).
function classifyG3MPatchFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.g3mpatch' || ext === '.zip') return 'g3m-patch';   // ZIP container (may hold g3mpatch.json)
    if (ext === '.xdelta' || ext === '.xdelta3' || ext === '.vcdiff') return 'g3m-xdelta';
    if (ext === '.csx') return 'g3m-csx';                            // not supported, will warn at apply time
    return 'g3m-datafile';                                           // raw data.win replacement (MOD_TYPE_DATAFILE in G3M)
}

function parseG3MManifest(modRoot, modName) {
    try {
        const configPath = path.join(modRoot, 'mod_config.json');
        const raw = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(raw);
        const files = config.files || {};
        const entries = [];
        for (const [chapterKey, entry] of Object.entries(files)) {
            // [Zork's PATCH]: support both data_file_path (current) and data_file_url (legacy G3M field)
            const dataFilePath = entry?.data_file_path || entry?.data_file_url;
            if (!entry || !dataFilePath) continue;
            const type = classifyG3MPatchFile(dataFilePath);
            const patchFile = path.join(modRoot, dataFilePath);
            entries.push({ type, patchFile, chapterKey, modName });
        }
        clog('[parseG3MManifest]', modName, '- entries:', entries.length);
        return entries;
    } catch (e) {
        clog('[parseG3MManifest] error reading manifest for', modName, ':', e.message);
        return [];
    }
}

// [Zork's PATCH]: extractVcdiffFromG3MPatch — attempt to extract a VCDIFF stream from a .g3mpatch file.
// .g3mpatch is a ZIP (g3mpatch.json metadata + binary patch entry). The binary entry is most likely
// a raw VCDIFF stream — the same format @chainsafe/xdelta3-node already handles for .xdelta files.
// VCDIFF magic: 0xD6 0xC3 0xC4 (first 3 bytes). If detected, we can apply the patch purely in-process
// without G3MTool. Returns the VCDIFF Buffer on success, null on format mismatch or read error.
function extractVcdiffFromG3MPatch(patchPath) {
    try {
        const buf = fs.readFileSync(patchPath);
        // Must be a ZIP (PK\x03\x04)
        if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B || buf[2] !== 0x03 || buf[3] !== 0x04) {
            return null;
        }
        // Minimal ZIP local-file-header reader (stored or deflated entries only)
        const zlib = require('zlib');
        let pos = 0;
        while (pos + 30 <= buf.length) {
            if (buf.readUInt32LE(pos) !== 0x04034B50) break;
            const flags    = buf.readUInt16LE(pos + 6);
            const method   = buf.readUInt16LE(pos + 8);
            const compSize = buf.readUInt32LE(pos + 18);
            const nameLen  = buf.readUInt16LE(pos + 26);
            const extraLen = buf.readUInt16LE(pos + 28);
            const name     = buf.slice(pos + 30, pos + 30 + nameLen).toString('utf8');
            const dataStart = pos + 30 + nameLen + extraLen;
            if (flags & 0x0008) break; // data-descriptor flag — skip
            if (dataStart + compSize > buf.length) break;
            // Only look at the binary (non-JSON) entry
            if (!name.toLowerCase().endsWith('.json')) {
                const compData = buf.slice(dataStart, dataStart + compSize);
                let raw;
                try { raw = method === 8 ? zlib.inflateRawSync(compData) : compData; } catch { break; }
                // VCDIFF magic: 0xD6 0xC3 0xC4
                if (raw.length >= 4 && raw[0] === 0xD6 && raw[1] === 0xC3 && raw[2] === 0xC4) {
                    return raw;
                }
                return null; // binary entry found but not VCDIFF — unknown format
            }
            pos = dataStart + compSize;
        }
        return null;
    } catch {
        return null;
    }
}

// [Zork's PATCH]: findG3MTool — locate the G3MTool CLI binary (non-VCDIFF .g3mpatch and multi-mod merging).
// G3MTool is bundled in tools/ alongside Deltamod.
// Search order: user config → deltamod/tools/.
function findG3MTool() {
    // 1. User-configured path (KeyValue 'g3mToolPath')
    try {
        const KeyValue = require('./KeyValue');
        const configured = KeyValue.readKVS('g3mToolPath');
        if (configured && fs.existsSync(configured)) return configured;
    } catch { /* KeyValue unavailable */ }

    // 2. Bundled in deltamod's tools/ directory
    const toolsDir = path.join(__dirname, '../gm3p');
    const toolExe = process.platform === 'win32' ? 'G3MTool.exe' : 'G3MTool';
    const localPath = path.join(toolsDir, toolExe);
    if (fs.existsSync(localPath)) return localPath;

    return null;
}

// [Zork's PATCH]: runG3MToolAsync — async spawn wrapper for G3MTool CLI.
// Returns { code, stdout, stderr }.
function runG3MToolAsync(g3mToolPath, args) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn(g3mToolPath, args, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => { stdout += String(d); });
        proc.stderr.on('data', d => { stderr += String(d); });
        proc.on('close', code => resolve({ code: code ?? -1, stdout, stderr }));
        proc.on('error', err => reject(err));
    });
}

// ------------------------------ main ----------------------------------------

async function startGamePatch(gamePath, dbPath, enableMods, window) {
    sendToWin = window;
    const log = [];
    const ret = { patched: false, log: '' };
    const enabled = new Set(enableMods || []);
    function logln(s) { log.push(String(s)); clog(s); }

    clog('== startGamePatch ==');
    clog('gamePath:', gamePath);
    clog('dbPath:', dbPath);
    clog('enabledMods:', Array.from(enabled));

    // Collect actions from all enabled mods
    const objects = []; // {type:'xdelta'|'override', patch/from, to, modName}
    const modsInDb = safeReadDir(dbPath);
    clog('DB mods found:', modsInDb.length);

    for (const mod of modsInDb) {
        const modDir = path.join(dbPath, mod);
        try {
            const modRoot = findModRoot(modDir);
            const idf   = findFirstByName(modRoot, '__deltaID.json');
            const infof = findFirstByName(modRoot, 'meta.json');
            let searchFile = "modding.xml";
            if (fs.existsSync(path.join(modRoot, '__variant'))) {
                searchFile = fs.readFileSync(path.join(modRoot, '__variant'), 'utf8').trim() + '.xml';
            }
            const xmlf  = findFirstByName(modRoot, searchFile);
            
            // [Zork's PATCH]: G3M mod format — detect mod_config.json and route to G3M_NATIVE pipeline
            const g3mConfigPath = path.join(modRoot, 'mod_config.json');
            if (fs.existsSync(g3mConfigPath)) {
                if (Patcher === 'G3M_NATIVE' && idf && fs.existsSync(idf)) {
                    const { uniqueId } = JSON.parse(fs.readFileSync(idf, 'utf8'));
                    if (enabled.has(uniqueId)) {
                        const info = infof && fs.existsSync(infof) ? JSON.parse(fs.readFileSync(infof, 'utf8')) : {};
                        const modName = info?.metadata?.name || uniqueId;
                        logln(`Applying G3M mod: ${uniqueId}${info?.metadata?.name ? ` (${info.metadata.name})` : ''}`);
                        const g3mEntries = parseG3MManifest(modRoot, modName);
                        for (const entry of g3mEntries) {
                            objects.push({ type: entry.type, patch: entry.patchFile, to: entry.chapterKey, modName });
                        }
                    } else {
                        clog('Skip G3M (not enabled):', idf);
                    }
                }
                continue; // always skip modding.xml logic for G3M mods
            }

            if (!idf || !xmlf) continue;
            if (!fs.existsSync(idf) || !fs.existsSync(xmlf)) {
                clog('Skip (missing id/xml):', mod);
                continue;
            }

            const { uniqueId } = JSON.parse(fs.readFileSync(idf, 'utf8'));
            if (!enabled.has(uniqueId)) {
                clog('Skip (not enabled):', uniqueId);
                continue;
            }

            const info = fs.existsSync(infof) ? JSON.parse(fs.readFileSync(infof, 'utf8')) : {};
            const modName = info?.metadata?.name || uniqueId;
            logln(`Applying mod: ${uniqueId}${info?.metadata?.name ? ` (${info.metadata.name})` : ''}`);

            const xml = fs.readFileSync(xmlf, 'utf8');
            const root = JSON.parse(convert.xml2json(xml, { compact: false }));
            const all = walkElements(root);
            clog('Parsed XML nodes for', mod, ':', all.length);

            for (const el of all) {
                const at = el.attributes || {};
                const name = (el.name || '').toLowerCase();
                const type = (at.type || '').toLowerCase();

                // attribute spells
                const srcPatch = pickAttr(at, 'patch', 'file', 'path', 'src');
                const toTarget = pickAttr(at, 'to', 'dest', 'target') || 'data.win';
                const fromFile = pickAttr(at, 'from', 'patch', 'file', 'path', 'src');

                // identify xdelta
                const isXdelta = name === 'xdelta' ||
                    (name === 'patch' && type === 'xdelta') ||
                    (name === 'delta' && type === 'xdelta') ||
                    type === 'xdelta';

                if (isXdelta && srcPatch) {
                    const absPatch = path.join(modRoot, srcPatch);
                    const sz = safeStat(absPatch)?.size ?? -1;
                    objects.push({
                        type: 'xdelta',
                        patch: absPatch,
                        to: toTarget,
                        modName
                    });
                    clog('  + xdelta:', absPatch, `(size ${sz})`, '->', toTarget);
                    continue;
                }

                // identify override
                const isOverride = name === 'file' || name === 'override' ||
                    (name === 'patch' && (type === 'override' || type === 'file')) ||
                    (type === 'override' || type === 'file');

                if (isOverride && fromFile && toTarget) {
                    const srcAbs = path.join(modRoot, fromFile);
                    const destAbs = resolveAbsTarget(gamePath, toTarget);
                    const sz = safeStat(srcAbs)?.size ?? -1;
                    objects.push({
                        type: 'override',
                        from: srcAbs,
                        to: destAbs,
                        modName
                    });
                    clog('  + override:', srcAbs, `(size ${sz})`, '->', destAbs);
                }
            }
        } catch (e) {
            logln(`Error reading mod ${mod}: ${e.message}`);
        }
    }

    const xdeltas   = objects.filter(o => o.type === 'xdelta');
    const overrides = objects.filter(o => o.type === 'override');

    clog('Collected:', xdeltas.length, 'xdelta(s),', overrides.length, 'override(s)');

    // Group xdeltas by absolute target `to` and back them up
    const groups = new Map(); // targetAbs -> [patchAbs]
    for (const x of xdeltas) {
        const targetAbs = resolveAbsTarget(gamePath, x.to);
        if (!groups.has(targetAbs)) groups.set(targetAbs, []);
        groups.get(targetAbs).push(x.patch);
    }
    clog('Xdelta groups:', Array.from(groups.entries()).map(([t, l]) => `${t} (${l.length})`));

    for (const [target] of groups) {
        const st = safeStat(target);
        clog('Target:', target, st ? `(exists, size ${st.size})` : '(MISSING!)');
        ensureBackup(target);
    }
    for (const f of overrides) ensureBackup(f.to);

    // [Zork's PATCH]: GM3P pipeline only runs when Patcher !== 'G3M_NATIVE'
    if (Patcher !== 'G3M_NATIVE') {
    // 1) Discover chapters in the install (absolute data.win paths)
    const chapterTargets = discoverChapters(gamePath);  // uses the helper you pasted
    if (chapterTargets.length === 0) {
        ret.log = log.concat('No data.win found under gamePath.').join('\n');
        dialog.showErrorBox('Patching failed', ret.log);
        return ret;
    }
    clog('Chapters detected:', chapterTargets);

    // 2) Map each xdelta to a chapter index
    const idxOfTarget = new Map(chapterTargets.map((p, i) => [path.normalize(p), i]));
    const perChapterPatches = Array.from({ length: chapterTargets.length }, () => []);

    for (const x of xdeltas) {
        const targetAbs = resolveAbsTarget(gamePath, x.to);
        const idx = idxOfTarget.get(path.normalize(targetAbs));
        if (idx == null) {
            clog('  ! xdelta target not in discovered chapters (skip):', targetAbs);
            continue;
        }
        perChapterPatches[idx].push(x.patch);
    }

    // 3) If no xdelta anywhere, skip GM3P and just do overrides later
    const totalXdeltas = perChapterPatches.reduce((n, l) => n + l.length, 0);
    if (totalXdeltas === 0) {
        clog('No xdelta patches; skipping GM3P (will only apply overrides).');
    } else {
        // Backups for chapter data.wins + any override destinations
        for (const t of chapterTargets) ensureBackup(t);
        for (const f of overrides) ensureBackup(f.to);

        // Build the multi-chapter argument string: one slot per chapter
        const slots      = perChapterPatches.map(list => list.length ? (',,' + list.join(',')) : '');
        const filepathArg = slots.join('::');
        const modAmount   = Math.max(1, ...perChapterPatches.map(l => l.length)); // GM3P expects MAX patches across chapters

        clog('MULTI massPatch folder:', gamePath, 'chapters:', chapterTargets.length, 'modAmount:', modAmount);
        perChapterPatches.forEach((l, i) => clog(`  chapter[${i}] patches: ${l.length}`));
        try {
            emitKeypress({ onKeyPress });
            clog("Max Mods per Chapter: " + modAmount.toString());
            if (Patcher === 'GM3P') {

                await run(GM3P_EXE + ' ' + GM3P_DLL + ' ' + ' clear');
                await run(GM3P_EXE + ' ' + GM3P_DLL + ' ' + 'massPatch ' + gamePath + ' GM ' + String(modAmount) + ' ' + filepathArg);
                if (modAmount > 1) {
                    //Attempt to speed things up and to lower chances of a timeout by having UTMTCLI being a child instead of a grandchild process.
                    for (var i = 0; i < chapterTargets.length; i++) {
                        for (var modNumber = 0; modNumber < modAmount + 2; modNumber++) {
                            if (!fs.existsSync(path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'Objects', 'CodeEntries'))) {
                                await fs.mkdirSync(path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'Objects', 'CodeEntries'), { recursive: true });
                            }
                        }
                    }
                    for (var i = 0; i < chapterTargets.length; i++) {
                        for (var modNumber = 1; modNumber < modAmount + 2; modNumber++) {
                            fs.writeFileSync(path.join(GM3P_OUTPUT, 'Cache', 'running', 'chapterNumber.txt'), i.toString());
                            fs.writeFileSync(path.join(GM3P_OUTPUT, 'Cache', 'running', 'modNumbersCache.txt'), modNumber.toString());
                            if (modNumber != 1) {
                                if (!fs.existsSync(path.join(UTMT_FOLD, 'Scripts', 'ExportModifiedOnly.csx'))) {
                                    await run(DOTNET_UNIX + ' ' + UTMT_EXE + ' load ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'data.win') + ' --verbose --output ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'data.win') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportModifiedOnly.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAssetOrder.csx'));
                                } else {
                                    await run(DOTNET_UNIX + ' ' + UTMT_EXE + ' load ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'data.win') + ' --verbose --output ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'data.win') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAllTexturesGrouped.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAllCode.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAssetOrder.csx'));
                                }
                            }
                        }
                    }

                    // Heavy step ONCE for all chapters
                    await run(GM3P_EXE + ' ' + GM3P_DLL + ' ' + ' compare ' + String(modAmount) + ' false ' + 'false');

                    //UTMT Importing
                    for (var i = 0; i < chapterTargets.length; i++) {
                        fs.writeFileSync(path.join(GM3P_OUTPUT, 'Cache', 'running', 'chapterNumber.txt'), i.toString());
                        await run(DOTNET_UNIX + ' ' + UTMT_EXE + ' load ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), '1', 'data.win') + ' --verbose --output ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), '1', 'data.win') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ImportGraphics.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ImportGML.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ImportAssetOrder.csx'));
                    }
                    oneMod = ' true';
                } else { oneMod = ' false'; }
            } else {
                for (var i = 0; i < chapterTargets.length; i++) {
                    if (!fs.existsSync(path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), '1'))) {
                        fs.mkdirSync(path.join(GM3P_OUTPUT, 'xDeltaCombiner', String(i), '1'), {recursive: true});
                    }
                    clog('Patching chapter', i, 'with', (perChapterPatches.map(list => list.length ? (list.join('::')) : ''))[i]);
                    await run(GM3P_EXE + ' ' + GM3P_DLL + ' ' + path.join(gamePath, 'chapter' + String(i) + '_windows', 'data.win') + ' ' + (perChapterPatches.map(list => list.length ? (list.join('::')) : ''))[i] + ' ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', String(i), '1', 'data.win'));
                }
            }
            // Produce: one subfolder per chapter index
            pack   = 'DeltamodPack_Multi';
            outDir = path.join(GM3P_OUTPUT, 'result', pack);
            if (Patcher === 'GM3P') {
                await run(GM3P_EXE + ' ' + GM3P_DLL + ' ' + 'result ' + pack + ' true');
            }            
            // Copy each produced chapter back
            for (let i = 0; i < chapterTargets.length; i++) {
                if (modAmount > 1 || Patcher !== 'GM3P') {
                    produced = path.join(GM3P_OUTPUT, 'xDeltaCombiner', String(i), '1', 'data.win');
                } else {
                    produced = path.join(GM3P_OUTPUT, 'xDeltaCombiner', String(i), '2', 'data.win');
                }
                    clog(`Produced[${i}]:`, produced, fs.existsSync(produced) ? '(exists)' : '(MISSING)');
                if (fs.existsSync(produced)) {
                    fs.rmSync(chapterTargets[i], { force: true });
                    copyOver(produced, chapterTargets[i]);
                } else { clog(`GM3P did not produce chapter ${i} data.win`); }
            }
            if (pack = 'DeltamodPack_Multi' && fs.existsSync(outDir)) {
                try { fs.rmdirSync(outDir, { force: true, recursive: true }); } catch { }
            }

            //await run(GM3P_EXE + ' ' + GM3P_DLL + ' ' + ' clear');
        } catch (e) {
            clog('GM3P error, restoring backups:', e.message);
            for (const t of chapterTargets) restoreIfBackup(t);
            ret.log = log.concat('GM3P error: ' + e.message).join('\n');
            dialog.showErrorBox('Patching failed', ret.log);
            return ret;
        }
    }

    } // [Zork's PATCH]: end of GM3P pipeline block

    // [Zork's PATCH]: G3M_NATIVE in-process patching pipeline — pure JS, no external binaries
    if (Patcher === 'G3M_NATIVE') {
        // [Zork's PATCH]: include all G3M entry types; g3m-datafile and g3m-csx handled below
        const g3mAllEntries = objects.filter(o =>
            o.type === 'xdelta' || o.type === 'g3m-xdelta' || o.type === 'g3m-patch' ||
            o.type === 'g3m-datafile' || o.type === 'g3m-csx'
        );

        if (g3mAllEntries.length === 0) {
            clog('[G3M_NATIVE] No patch entries; skipping G3M pipeline (overrides only).');
        } else {
            const chapters = discoverChapters(gamePath);
            if (chapters.length === 0) {
                ret.log = log.concat('No data.win found under gamePath.').join('\n');
                dialog.showErrorBox('Patching failed', ret.log);
                return ret;
            }
            clog('[G3M_NATIVE] Chapters:', chapters);

            // [Zork's PATCH]: Find G3MTool once — needed for .g3mpatch mods
            const g3mTool = findG3MTool();
            if (g3mTool) {
                clog('[G3M_NATIVE] G3MTool found:', g3mTool);
            } else {
                clog('[G3M_NATIVE] G3MTool not found — g3mpatch mods will be skipped. Add G3MTool.exe to deltamod/tools/ to enable g3mpatch support.');
            }

            // Back up all chapter data.wins before touching them
            for (const c of chapters) ensureBackup(c);

            // Group entries by chapter index
            // - legacy xdelta (from modding.xml): resolve target path → chapter index
            // - g3m entries: chapterKey is either a numeric string ("0", "1", ...)
            //   or a G3M chapter ID ("deltarune_0", "deltarune_1", "chapter_1", etc.)
            //   G3M uses trailing-number IDs: extract the digit suffix to get the index.
            const perChapter = Array.from({ length: chapters.length }, () => []);
            for (const entry of g3mAllEntries) {
                let idx = null;
                if (entry.type === 'xdelta') {
                    const targetAbs = resolveAbsTarget(gamePath, entry.to);
                    idx = chapters.findIndex(c => path.normalize(c) === path.normalize(targetAbs));
                } else {
                    // [Zork's PATCH]: G3M chapter IDs use format 'deltarune_0', 'deltarune_1', etc.
                    // parseInt would return NaN for these — extract trailing digit instead.
                    const keyInt = parseInt(entry.to, 10);
                    if (!isNaN(keyInt) && keyInt < chapters.length) {
                        idx = keyInt;
                    } else {
                        const numMatch = entry.to.match(/(\d+)$/);
                        if (numMatch) {
                            const n = parseInt(numMatch[1], 10);
                            if (n < chapters.length) idx = n;
                        }
                    }
                }
                if (idx == null || idx < 0) {
                    clog('[G3M_NATIVE] Cannot map entry to chapter:', entry.to, '— skipping');
                    continue;
                }
                perChapter[idx].push(entry);
            }

            try {
                for (let i = 0; i < chapters.length; i++) {
                    const entries = perChapter[i];
                    if (entries.length === 0) continue;

                    const backupPath = chapters[i] + BACKUP_SUFFIX;
                    await new Promise(r => setImmediate(r));

                    const validEntries = entries.filter(e => {
                        if (!fs.existsSync(e.patch)) {
                            clog('[G3M_NATIVE] Missing patch (skip):', e.patch);
                            return false;
                        }
                        return true;
                    });
                    if (validEntries.length === 0) continue;

                    clog(`[G3M_NATIVE] Chapter ${i}: ${validEntries.length} entry(ies)`);

                    // [Zork's PATCH]: g3m-datafile = raw data.win replacement (MOD_TYPE_DATAFILE in G3M).
                    // G3M handles this with shutil.copy2 — we just write the file directly. Last writer wins.
                    const datafileEntries = validEntries.filter(e => e.type === 'g3m-datafile');
                    for (const e of datafileEntries) {
                        clog(`[G3M_NATIVE] Chapter ${i}: datafile replacement from`, e.patch);
                        await fs.promises.copyFile(e.patch, chapters[i]);
                        clog(`[G3M_NATIVE] Chapter ${i}: datafile applied.`);
                    }
                    if (datafileEntries.length > 0 && datafileEntries.length === validEntries.length) continue;

                    // [Zork's PATCH]: g3m-csx = UndertaleModTool C# script — not supported in G3M_NATIVE.
                    for (const e of validEntries.filter(e2 => e2.type === 'g3m-csx')) {
                        logln(`Warning: chapter ${i} mod '${e.modName}' uses a .csx script which is not supported by G3M_NATIVE — skipped.`);
                    }

                    // [Zork's PATCH]: Patching strategy mirrors G3M source exactly:
                    //   xdelta    → pure-JS decodeSync (single) or G3MTool CLI (multi-mod)
                    //   g3mpatch  → VCDIFF magic check → G3MTool CLI
                    //   datafile  → direct copy (handled above)
                    //   multi-mod → g3mtool patch merge (handles both xdelta and g3mpatch)
                    const g3mpatchEntries = validEntries.filter(e => e.type === 'g3m-patch');
                    const xdeltaEntries   = validEntries.filter(e => e.type === 'xdelta' || e.type === 'g3m-xdelta');

                    // [Zork's PATCH]: g3mpatch resolution — two-tier approach:
                    //   1. extractVcdiffFromG3MPatch: check if binary entry inside ZIP is VCDIFF (magic 0xD6 0xC3 0xC4).
                    //      If yes → treat as xdelta, apply purely in-process. No G3MTool needed.
                    //   2. G3MTool CLI: if VCDIFF check fails (unknown binary format). Always bundled in tools/.
                    // [Zork's PATCH]: Resolve g3mpatch format
                    const resolvedG3MPatches = g3mpatchEntries.map(e => ({
                        entry: e,
                        vcdiffBuf: extractVcdiffFromG3MPatch(e.patch),
                    }));
                    const allVcdiff = resolvedG3MPatches.length > 0 && resolvedG3MPatches.every(r => r.vcdiffBuf !== null);
                    const hasNonVcdiffPatch = g3mpatchEntries.length > 0 && !allVcdiff;
                    // [Zork's PATCH]: GameMaker FORM files encode chunk sizes, offsets, and pointers that
                    // interrelate across the entire binary. Byte-level chunk merge produces conflicting
                    // structural declarations when >1 mod targets the same chapter — both mods rewrite
                    // FORM header bytes with different values and last-write-wins corrupts the file.
                    // G3MTool patch merge understands FORM structure and is the only correct path for
                    // multi-mod merging. Route there whenever more than one patch targets this chapter.
                    const isMultiMod = xdeltaEntries.length + g3mpatchEntries.length > 1;
                    const needsG3MTool = hasNonVcdiffPatch || isMultiMod;

                    if (needsG3MTool) {
                        if (!g3mTool) {
                            throw new Error(`G3MTool not found — required for chapter ${i} (${hasNonVcdiffPatch ? 'non-VCDIFF g3mpatch' : 'multi-mod merging'}). Ensure G3MTool is present in tools/.`);
                        }
                        const allPatches = [...xdeltaEntries, ...g3mpatchEntries].map(e => e.patch);
                        const sourcePath = fs.existsSync(backupPath) ? backupPath : chapters[i];
                        let result;
                        if (allPatches.length === 1) {
                            result = await runG3MToolAsync(g3mTool, ['patch', 'apply', sourcePath, allPatches[0], chapters[i]]);
                        } else {
                            result = await runG3MToolAsync(g3mTool, ['patch', 'merge', sourcePath, ...allPatches, '--apply', chapters[i]]);
                        }
                        if (result.code !== 0) {
                            const detail = (result.stderr || result.stdout || '').trim().slice(0, 500);
                            throw new Error(`G3MTool failed for chapter ${i} (exit ${result.code})${detail ? ': ' + detail : ''}`);
                        }
                        clog(`[G3M_NATIVE] Chapter ${i}: G3MTool applied ${allPatches.length} patch(es).`);
                        continue;
                    }

                    // [Zork's PATCH]: Build the effective patch list for single-mod in-process path.
                    // g3mpatch entries that are VCDIFF are treated identically to xdelta (Buffer instead of path).
                    const effectiveEntries = [
                        ...xdeltaEntries.map(e => ({ ...e, _patchBuf: null })),
                        ...(allVcdiff
                            ? resolvedG3MPatches.map(r => ({ ...r.entry, type: 'g3m-xdelta', _patchBuf: r.vcdiffBuf }))
                            : []
                        ),
                    ];
                    if (effectiveEntries.length === 0) continue;

                    // [Zork's PATCH]: Always patch from the vanilla backup so re-patching is idempotent.
                    const originalBuf = await fs.promises.readFile(
                        fs.existsSync(backupPath) ? backupPath : chapters[i]
                    );

                    // Decode in-process (mirrors g3mtool xpatch apply for single-mod VCDIFF).
                    const entry = effectiveEntries[0];
                    const { decodeSync } = require('@chainsafe/xdelta3-node');
                    const patchData = entry._patchBuf ?? await fs.promises.readFile(entry.patch);
                    await new Promise(r => setImmediate(r));
                    const patched = Buffer.from(decodeSync(originalBuf, patchData));
                    const label = entry._patchBuf ? 'g3mpatch(vcdiff)' : 'xdelta';
                    clog(`[G3M_NATIVE] Chapter ${i}: ${label} applied. Size: ${patched.length} bytes`);

                    await fs.promises.writeFile(chapters[i], patched);
                    clog(`[G3M_NATIVE] Chapter ${i} written.`);
                }
            } catch (e) {
                clog('[G3M_NATIVE] Error during patching, restoring backups:', e.message);
                for (const c of chapters) restoreIfBackup(c);
                ret.log = log.concat('G3M_NATIVE error: ' + e.message).join('\n');
                dialog.showErrorBox('Patching failed', ret.log);
                return ret;
            }
        }
    }

    // External file overrides (after merge)
    const conflicts = detectFileConflicts(overrides);
    if (conflicts.found) {
        const msg = 'Conflicting external file overrides (data.win is merged by GM3P):\n\n' +
            conflicts.conflicts.map((c, i) => `${i + 1}. ${c.join(', ')}`).join('\n');
        ret.log = log.concat(msg).join('\n');
        clog('[CONFLICTS]', msg);
        dialog.showErrorBox('Conflict Detected', msg);
        return ret;
    }

    for (const f of overrides) {
        try {
            if (!fs.existsSync(f.from)) { logln('Missing file in mod: ' + f.from); continue; }
            clog('Copy override:', f.from, '->', f.to);
            copyOver(f.from, f.to);
        } catch (e) {
            logln(`Error copying ${f.from} -> ${f.to}: ${e.message}`);
        }
    }

    ret.patched = true;
    ret.log = log.concat(`Patched via ${Patcher} + overrides.`).join('\n'); // [Zork's PATCH]: patcher-aware log message
    clog('== startGamePatch DONE ==');

    await timeoutPromise(1000); // Needed for UI to work properly.

    return ret;
}

// Restore *.original files inside gamePath (root and one level deep)
function restoreOriginalsIfAny(gamePath) {
    const restored = [];
    function tryRestore(target) {
        if (restoreIfBackup(target)) restored.push(target);
    }
    clog('Restore check in', gamePath);
    try {
        // root level
        for (const e of safeReadDir(gamePath, { withFileTypes: true })) {
            if (e.isFile && e.isFile() && e.name.endsWith(BACKUP_SUFFIX)) {
                const target = path.join(gamePath, e.name.slice(0, -BACKUP_SUFFIX.length));
                clog('Found root backup:', e.name, '->', target);
                tryRestore(target);
            }
        }
        // one level deep
        for (const e of safeReadDir(gamePath, { withFileTypes: true })) {
            if (e.isDirectory && e.isDirectory()) {
                const sub = path.join(gamePath, e.name);
                for (const f of safeReadDir(sub)) {
                    if (String(f).endsWith(BACKUP_SUFFIX)) {
                        const target = path.join(sub, String(f).slice(0, -BACKUP_SUFFIX.length));
                        clog('Found sub backup:', f, '->', target);
                        tryRestore(target);
                    }
                }
            }
        }
    } catch (e) {
        clog('Restore scan error:', e.message);
    }
    clog('Restored count:', restored.length);
    return restored;
}


// nuke that backup if it exists (needed for baking)
function deleteOriginals(gamePath) {
    const restored = [];
    function tryRestore(target) {
        if (restoreIfBackup(target)) restored.push(target);
    }
    clog('Restore check in', gamePath);
    try {
        // root level
        for (const e of safeReadDir(gamePath, { withFileTypes: true })) {
            if (e.isFile && e.isFile() && e.name.endsWith(BACKUP_SUFFIX)) {
                const filePath = path.join(gamePath, e.name);
                clog('Deleting root backup:', e.name);
                try { fs.rmSync(filePath, { force: true }); } catch {}
            }
        }
        // one level deep
        for (const e of safeReadDir(gamePath, { withFileTypes: true })) {
            if (e.isDirectory && e.isDirectory()) {
                const sub = path.join(gamePath, e.name);
                for (const f of safeReadDir(sub)) {
                    if (String(f).endsWith(BACKUP_SUFFIX)) {
                        const filePath = path.join(sub, String(f).slice(0, -BACKUP_SUFFIX.length));
                        clog('Deleting sub backup:', f);
                        try { fs.rmSync(filePath, { force: true }); } catch {}
                    }
                }
            }
        }
    } catch (e) {
        clog('Restore scan error:', e.message);
    }
    clog('Restored count:', restored.length);
    return restored;
}

module.exports = {
    startGamePatch,
    restoreOriginalsIfAny,
    findModRoot,
    deleteOriginals
};
