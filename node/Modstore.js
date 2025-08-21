const Paths = require('./Paths');
const path = require('path');
const system = require('./System');
const fs = require('fs');
const os = require('os');
const console = require('./Console.js');

const computerName = os.hostname();
// [ADDED] depth-first search for a file by name anywhere under root
function findFirstByName(root, fileName) {
    const needle = String(fileName).toLowerCase();
    const stack = [root];
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

function safeReadJSON(p) {
    if (!p) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function modList() {
    var mods = fs.readdirSync(system.getPacketDatabase());
    var modList = [];
    var uniqueIdSet = new Set(); // actually use it

    for (var mod of mods) {
        try {
            var modPath = path.join(system.getPacketDatabase(), mod);

            // Zork's Patch: Find manifest anywhere in the mod folder, not only at root (safe)
            const manifestPath =
                findFirstByName(modPath, '_deltamodInfo.json') ||
                path.join(modPath, '_deltamodInfo.json');

            // Zork's Patch: Read defensively; synthesize defaults if missing
            var modInfo = safeReadJSON(manifestPath) || {
                metadata: { name: mod, version: '1.0.0', demoMod: false },
                dependencies: []
            };
            var meta = modInfo.metadata || {};


            const idPath = findFirstByName(modPath, '__deltaID.json') || path.join(modPath, '__deltaID.json');
            let deltamodExclusive = safeReadJSON(idPath);

            if (!deltamodExclusive || !deltamodExclusive.uniqueId) {
                console.log('generating unique uid for mod:', mod);
                deltamodExclusive = {
                    uniqueId: system.generateUniqueId(),
                    validFor: computerName,
                };
                try {
                    fs.writeFileSync(idPath, JSON.stringify(deltamodExclusive, null, 2), 'utf8');
                } catch (_) {}
            }

            // de-dupe in memory so list has unique rows (don’t rewrite disk)
            let uid = deltamodExclusive.uniqueId;
            if (uniqueIdSet.has(uid)) uid = `${uid}#${mod}`;
            uniqueIdSet.add(uid);

            // sanity for required fields
            if (
                !meta ||
                typeof meta.name !== 'string' ||
                typeof meta.description !== 'string' ||
                typeof meta.demoMod === 'undefined'
            ) {
                throw new Error(`Missing required fields in _deltamodInfo.json for mod: ${mod}`);
            }

            // keep your return shape; just add ids (non-breaking)
            modList.push({
                name:        meta.name || mod,
                version:     meta.version || '1.0.0',
                author:      meta.author || computerName,
                description: meta.description || '',
                folder:      mod,
                demo:        !!meta.demoMod,
                dependencies: modInfo.dependencies || [],

                // NEW: give the renderer stable identifiers
                uniqueId: uid,
                uid:      uid,   // <- many UIs look for this name
                id:       uid
            });
        }
        catch (e) {
            console.error(`Error reading mod info for ${mod}:`, e);
            return;
        }
    };

    /*
    // Zork's Patch: give the “No.” column a value most UIs expect, this could be used for sorting mods by priority in the future, but probably not as GM3P doesn't have that right now.
    modList.sort((a, b) => String(a.uniqueId).localeCompare(String(b.uniqueId)));
    modList.forEach((m, i) => {
        const n = i + 1;
        m.priority = n; // many UIs use this for the first column
        m.number   = n;
        m.index    = n;
        m.no       = n;
    });
    */
   // CURRENTLY DEPRECATED: priority function was planned but removed to favor GM3P integration

    return modList;
}

if (!fs.existsSync(system.getPacketDatabase())) {
    fs.mkdirSync(system.getPacketDatabase(), { recursive: true });
}

module.exports = {
    modList: modList
};