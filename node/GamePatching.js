// Hello Ghino! this is the new GamePatching module, I hope you like it!
// I also modified a bit of Runner.js and Modstore.js to support the new features.
// Everything new will be marked with [Zork's PATCH] so you can easily find it.
// ------------------------------------------------------------------
// Exports:
//   - startGamePatch(gamePath, dbPath, enableMods)
//   - restoreOriginalsIfAny(gamePath)
// What’s new here:
//   - Now reads all the zip file when importing mods, even if it has a wrapper folder inside (for example, mod.zip has a "Mod" folder).
//   - Group xdelta patches by their target `to` and run GM3P once per target, using GM3P new Multi Chapter support.
//   - Backups to *.original + restore helper, this was to avoid doing a temp deltarune install every time, overbloating.
//   - Uses execFile (no shell) with big buffers
//   - **Verbose console logging with timestamps** for each step, this was for me to discover what was going on with the patching.
//   - Detects file conflicts for external file overrides (data.win is merged by GM3P) and shows a dialog with the list of conflicting mods.
//   - Restores original files if they exist (with *.original suffix) in the gamePath root or one level deep.

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { exec } = require('child_process');
const { timeoutPromise } = require('./Utils.js');
const { emitKeypress } = require('emit-keypress');
const convert = require('xml-js');
const process = require('process');
const console = require('./Console.js');



const GM3P_OUTPUT = path.join(__dirname, '../gm3p/output')
const UTMT_FOLD = path.join(__dirname, '../gm3p/UTMTCLI')
// Checks to see what platform DeltaMOD is running on and set constants accordingly
if (process.platform === 'win32') {
    GM3P_EXE = 'start /B \"DeltaMOD GM3P run\" \"' + (path.join(__dirname, '../gm3p/GM3P.exe')) + '\"';
    UTMT_EXE = path.join(UTMT_FOLD, 'UndertaleModCli.exe');
    DOTNET_UNIX = '';
} else {
    GM3P_EXE = '/usr/bin/dotnet \"' + path.join(__dirname, '../gm3p/GM3P.dll') + '\"';
    UTMT_EXE = path.join(UTMT_FOLD, 'UndertaleModCli.dll');
    DOTNET_UNIX = '/usr/bin/dotnet';
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
        exec(file, _opts, (err, stdout, stderr) => {
            if (stdout) clog('stdout:', trunc(stdout));
            if (stderr) clog('stderr:', trunc(stderr));
            if (err) {
                return reject(new Error((stderr || '') + (stdout || '') || err.message));
            }
            resolve({ stdout, stderr });
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
        const hasXml  = fs.existsSync(path.join(dir, 'modding.xml'));
        const hasId   = fs.existsSync(path.join(dir, '__deltaID.json'));
        const hasInfo = fs.existsSync(path.join(dir, '_deltamodInfo.json'));
        if (hasXml && hasId) return dir;
        if (!fallback && (hasXml || hasId || hasInfo)) fallback = dir;

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
        dialog.showErrorBox('Patching was cancelled');
        for (const t of chapterTargets) restoreIfBackup(t);
        ret.log = log.concat('Patching was cancelled').join('\n');
        return ret;
        close();
    }
};

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
            const infof = findFirstByName(modRoot, '_deltamodInfo.json');
            const xmlf  = findFirstByName(modRoot, 'modding.xml');
            
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
            await run(GM3P_EXE + ' ' + ' clear');
            await run(GM3P_EXE + ' ' + 'massPatch ' + gamePath + ' GM ' + String(modAmount) + ' ' + filepathArg);
            if (modAmount > 1) {
                    //Attempt to speed things up and to lower chances of a timeout by having UTMTCLI being a child instead of a grandchild process.
                    for (var i = 0; i < 5; i++) {
                        for (var modNumber = 0; modNumber < modAmount + 2; modNumber++) {
                                if (!fs.existsSync(path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'Objects', 'CodeEntries'))) {
                                    await fs.mkdirSync(path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'Objects', 'CodeEntries'), {recursive: true});
                                }
                            fs.writeFileSync(path.join(GM3P_OUTPUT, 'Cache', 'running', 'chapterNumber.txt'), i.toString());
                            fs.writeFileSync(path.join(GM3P_OUTPUT, 'Cache', 'running', 'modNumbersCache.txt'), modNumber.toString());
                            if (modNumber != 1) {
                                await run(DOTNET_UNIX + ' ' + UTMT_EXE + ' load ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'data.win') + ' --verbose --output ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), modNumber.toString(), 'data.win') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAllTexturesGrouped.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAllCode.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ExportAssetOrder.csx'));
                            }
                        }
                    }



                    // Heavy step ONCE for all chapters
                    await run(GM3P_EXE + ' ' + ' compare ' + String(modAmount) + ' false ' + 'false');

                    //UTMT Importing
                    for (var i = 0; i < 5; i++) {
                        fs.writeFileSync(path.join(GM3P_OUTPUT, 'Cache', 'running', 'chapterNumber.txt'), i.toString());
                        await run(DOTNET_UNIX + ' ' + UTMT_EXE + ' load ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), '1', 'data.win') + ' --verbose --output ' + path.join(GM3P_OUTPUT, 'xDeltaCombiner', i.toString(), '1', 'data.win') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ImportGraphics.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ImportGML.csx') + ' --scripts ' + path.join(UTMT_FOLD, 'Scripts', 'ImportAssetOrder.csx'));
                    }
                    oneMod = ' true';
                } else { oneMod = ' false'; }
            
            // Produce: one subfolder per chapter index
            pack   = 'DeltamodPack_Multi';
            outDir = path.join(GM3P_OUTPUT, 'result', pack);
            await run(GM3P_EXE + ' ' + 'result ' + pack + oneMod);

            // Copy each produced chapter back
            for (let i = 0; i < chapterTargets.length; i++) {
                if (modAmount > 1) {
                    produced = path.join(outDir, String(i), 'data.win');
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

            await run(GM3P_EXE + ' ' + ' clear');
        } catch (e) {
            clog('GM3P error, restoring backups:', e.message);
            for (const t of chapterTargets) restoreIfBackup(t);
            ret.log = log.concat('GM3P error: ' + e.message).join('\n');
            dialog.showErrorBox('Patching failed', ret.log);
            return ret;
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
    ret.log = log.concat('Patched via GM3P + overrides.').join('\n');
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

module.exports = { startGamePatch, restoreOriginalsIfAny, findModRoot };
