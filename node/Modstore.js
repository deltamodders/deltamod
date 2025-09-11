const path = require('path');
const system = require('./System');
const fs = require('fs');
const os = require('os');
const console = require('./Console');
const _7z = require('7zip-min');
const { randomString, page } = require('./Utils');
const { findModRoot } = require('./GamePatching');
const { dialog } = require('electron');

const computerName = os.hostname();

async function importMod(filePath) {
    // create unique mod folder
    const modPath = path.join(system.getPacketDatabase(), randomString(32));
    fs.mkdirSync(modPath, { recursive: true });

    try {
        await _7z.unpack(filePath, modPath);
        // I (mc) believe that we shouldn't delete a user's files if we did not create/download them ourselves
        // I (techy) agree with mc
        // fs.unlinkSync (filePath); // delete the zip file after extraction, I (Zork) commented this out temporarily to keep the zip file for debugging.

        // Normalize: pull contents out of wrapper folder so mod is flat
        const realRoot = findModRoot(modPath);
        if (realRoot && path.resolve(realRoot) !== path.resolve(modPath)) {
            flattenInto(modPath, realRoot);
        }

        // Check manifest anywhere in the tree (now usually at root after flatten)
        const manifestPath = findFirstByName(modPath, '_deltamodInfo.json') || path.join(modPath, '_deltamodInfo.json');
        if (!fs.existsSync(manifestPath)) {
            fs.rmdirSync(modPath, { recursive: true, force: true });
            throw new Error('Mod manifest not found. Please ensure the mod is properly packaged.');
        }

        /*await dialog.showMessageBox(win, {
            type: 'info',
            title: 'Import Successful',
            message: 'Mod imported successfully.',
            buttons: ['OK']
        });*/

        // simpler way to refresh the list
        page("main");

        // Simple way to refresh the list
        // app.relaunch(properRelaunch());
        // app.exit();
        // process.exit();
    } catch (err) {
        console.error('Error importing mod:', err);
        dialog.showErrorBox('Import failed', String(err));
    }
}

function removeModSafe(modid) {
    var modPath = path.join(system.getPacketDatabase(), modid);

    // make sure that what we're deleting is actually a mod and not a random folder
    if (fs.existsSync(path.join(modPath, "__deltaID.json")) && fs.existsSync(modPath)) {
        console.log("Deleting mod", modPath);
        fs.rmSync(modPath, { recursive: true });
    } else console.warn("Error: Mod", modPath, "doesn't seem to be a valid mod with a __deltaID.json.");

    page("main");
}

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

function validatePID(pid) {
    console.log("Validating packageID:", pid);

    if (!pid) return "und.und.und"; // default if not specified

    if (typeof pid !== 'string') return "und.und.und";
    
    pid = pid.trim();

    if (pid.split('.').length !== 3) return "und.und.und"; // must be three parts

    return pid.toLowerCase();
}

function modList() {
    var mods = fs.readdirSync(system.getPacketDatabase());
    var modList = [];
    var errors = [];
    var uniqueIdSet = new Set(); // actually use it

    var failureReason = "";

    for (var mod of mods) {
        try {
            failureReason = "Unknown. Contact a developer!";
            var modPath = path.join(system.getPacketDatabase(), mod);

            // Zork's Patch: Find manifest anywhere in the mod folder, not only at root (safe)
            const manifestPath =
                findFirstByName(modPath, '_deltamodInfo.json') ||
                path.join(modPath, '_deltamodInfo.json');

            // Zork's Patch: Read defensively; synthesize defaults if missing
            failureReason = "Failed to read _deltamodInfo JSON.";
            var modInfo = safeReadJSON(manifestPath) || {
                metadata: { name: mod, version: '1.0.0', demoMod: false, packageID: 'und.und.und' },
                dependencies: []
            };
            var meta = modInfo.metadata || {};

            const idPath = findFirstByName(modPath, '__deltaID.json') || path.join(modPath, '__deltaID.json');
            failureReason = "Failed to read __deltaID JSON.";
            let deltamodExclusive = safeReadJSON(idPath);

            failureReason = "Failed to generate unique __deltaID for mod.";
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
            failureReason = "_deltamodInfo.json is missing required fields `name`, `description` or `demoMod`.";
            if (
                !meta ||
                typeof meta.name !== 'string' ||
                typeof meta.description !== 'string' ||
                typeof meta.demoMod === 'undefined'
            ) {
                throw new Error(`Missing required fields in _deltamodInfo.json for mod: ${mod}`);
            }

            var modSize = 0;
            function calculateFolderSize(folderPath) {
                const items = fs.readdirSync(folderPath);
                for (const item of items) {
                    const itemPath = path.join(folderPath, item);
                    const stats = fs.statSync(itemPath);
                    if (stats.isFile()) {
                        modSize += stats.size;
                    } else if (stats.isDirectory()) {
                        calculateFolderSize(itemPath);
                    }
                }
            }
            calculateFolderSize(modPath);
            modSize = Math.round(modSize / (1024 * 1024)); // size
            // keep your return shape; just add ids (non-breaking)
            modList.push({
                name:        meta.name || mod,
                version:     require('./Utils').validateVersioning(meta.version) || "Unknown",
                author:      meta.author || computerName,
                description: meta.description || '',
                folder:      mod,
                size:        modSize, // New in 1.1.2
                demo:        !!meta.demoMod,
                dependencies: modInfo.dependencies || [],
                packageID: validatePID(meta.packageID),
                // NEW: give the renderer stable identifiers
                uniqueId: uid,
                uid:      uid,   // <- many UIs look for this name
                id:       uid
            });
        }
        catch (e) {
            console.error(`Error reading mod info for ${mod}:`, e);
            errors.push({ mod, reason: failureReason });
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

    return { modList, errors };
}

function getModImage(moduid) {
    var modPackets = fs.readdirSync(system.getPacketDatabase());
    for (var mod of modPackets) {
        var deltaID = safeReadJSON(path.join(system.getPacketDatabase(), mod, '__deltaID.json'));
        if (deltaID && deltaID.uniqueId === moduid) {
            try {
                const imgPath = ((mod + '/_icon.png'));
                if (fs.existsSync(path.join(system.getPacketDatabase(), imgPath))) {
                    return { exists: true, path: imgPath };
                }
                else {
                    return { exists: false, path: null };
                }
            }
            catch {
                return { exists: false, path: null };
            }
        }
    }
}
if (!fs.existsSync(system.getPacketDatabase())) {
    fs.mkdirSync(system.getPacketDatabase(), { recursive: true });
}

module.exports = {
    modList,
    importMod,
    removeModSafe,
    getModImage
};