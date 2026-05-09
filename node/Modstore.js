const path = require('path');
const system = require('./System');
const fs = require('fs');
const os = require('os');
const console = require('./Console');
const _7z = require('7zip-min');
const { randomString, page, shopClang } = require('./Utils');
const { findModRoot } = require('./GamePatching');
const crypto = require('crypto');
const { dialog } = require('electron');
const {Downloader} = require("nodejs-file-downloader");
const { url } = require('inspector');

const computerName = os.hostname();

function downloadModFromURL(url, onProgress, mID, mModel) {
    return new Promise(async (resolve, reject) => {
        try {
            const downloader = new Downloader({
                url: url,
                directory: require('os').tmpdir(),
                onProgress: (percentage) => {
                    console.log(`Download progress: ${percentage}%`);
                    if (onProgress) onProgress(percentage, 200);
                }
            });
            const { filePath } = await downloader.download();
            await importMod(filePath, "donothing", mID, mModel);
            resolve(true);
        } catch (err) {
            reject(err);
        }
    });
}

async function importMod(filePath, nextPage = "main", mID = null, mModel = null) {
    var clangit = true;

    console.log("Importing mod (gb info)", mID, mModel, "from file:", filePath);
    // create unique mod folder
    const modPath = path.join(system.getPacketDatabase(), "Mod_" + randomString(32));
    fs.mkdirSync(modPath, { recursive: true });

    try {
        await _7z.unpack(filePath, modPath);
        // I (mc) believe that we shouldn't delete a user's files if we did not create/download them ourselves
        // I (techy) agree with mc
        // fs.unlinkSync (filePath); // delete the zip file after extraction, I (Zork) commented this out temporarily to keep the zip file for debugging.

        // Normalize: pull contents out of wrapper folder so mod is flat

        // Legacy support: rename _deltamodInfo.json to meta.json if needed
        if (fs.existsSync(path.join(modPath, '_deltamodInfo.json'))) {
            fs.copyFileSync(path.join(modPath, '_deltamodInfo.json'), path.join(modPath, 'meta.json'));
            fs.unlinkSync(path.join(modPath, '_deltamodInfo.json'));
        }
        if (fs.existsSync(path.join(modPath, '_icon.png'))) {
            fs.copyFileSync(path.join(modPath, '_icon.png'), path.join(modPath, 'icon.png'));
            fs.unlinkSync(path.join(modPath, '_icon.png'));
        }
        const realRoot = findModRoot(modPath);
        if (realRoot && path.resolve(realRoot) !== path.resolve(modPath)) {
            // flatten the mod by moving all files up to the root and deleting the wrapper folder
            console.log("Flattening mod structure by moving files from", realRoot, "to", modPath);
            const items = fs.readdirSync(realRoot);
            for (const item of items) {
                const src = path.join(realRoot, item);
                const dest = path.join(modPath, item);
                fs.renameSync(src, dest);
            }
            // delete the wrapper folder if it's not the same as the modPath
            if (path.resolve(realRoot) !== path.resolve(modPath)) {
                fs.rmSync(realRoot, { recursive: true, force: true });
            }
        }

        // [Zork's PATCH]: G3M mod format bridge — generate meta.json + __deltaID.json from mod_config.json
        const g3mConfigPath = path.join(modPath, 'mod_config.json');
        if (fs.existsSync(g3mConfigPath)) {
            try {
                const g3m = JSON.parse(fs.readFileSync(g3mConfigPath, 'utf8'));
                if (!fs.existsSync(path.join(modPath, 'meta.json'))) {
                    const meta = {
                        metadata: {
                            name:        g3m.name        || g3m.id  || 'Unknown G3M Mod',
                            description: g3m.description || '',
                            version:     g3m.version     || '1.0',
                            author:      g3m.author       || 'Unknown',
                            game:        g3m.game         || 'toby.deltarune',
                            packageID:   '',
                        },
                        source: 'g3m'
                    };
                    fs.writeFileSync(path.join(modPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
                    console.log('G3M bridge: wrote meta.json for', meta.metadata.name);
                }
                if (!fs.existsSync(path.join(modPath, '__deltaID.json'))) {
                    const uniqueId = 'g3m-' + (g3m.id || require('crypto').randomBytes(8).toString('hex'));
                    fs.writeFileSync(path.join(modPath, '__deltaID.json'), JSON.stringify({ uniqueId }, null, 2), 'utf8');
                    console.log('G3M bridge: wrote __deltaID.json, uniqueId:', uniqueId);
                }
            } catch (e) {
                console.error('G3M bridge: failed to generate metadata:', e.message);
                // Non-fatal — manifest check below will catch it if truly broken
            }
        }

        // Check manifest anywhere in the tree (now usually at root after flatten)
        const manifestPath = findFirstByName(modPath, 'meta.json') || path.join(modPath, 'meta.json');
        if (!fs.existsSync(manifestPath)) {
            fs.rmSync(modPath, { recursive: true, force: true });
            throw new Error('Mod manifest not found. Please ensure the mod is properly packaged.');
        }

        var modInfo = safeReadJSON(manifestPath);
        if (!modInfo || !modInfo.metadata) {
            fs.rmSync(modPath, { recursive: true, force: true });
            throw new Error('Invalid mod manifest. Please ensure meta.json is correctly formatted.');
        }

        if (modInfo.metadata.packageID && modInfo.metadata.packageID.toString().trim().toLowerCase() === "..") {
            modInfo.metadata.packageID = "und.und.und"; // prevent directory traversal
            fs.writeFileSync(path.join(modPath, 'meta.json'), JSON.stringify(modInfo, null, 2), 'utf8');
        }

        if (mID && mModel) {
            modInfo.metadata.gamebanana_id = mID;
            modInfo.metadata.gamebanana_model = mModel;
            fs.writeFileSync(path.join(modPath, 'meta.json'), JSON.stringify(modInfo, null, 2), 'utf8');
        }

        if (modInfo.metadata.demoMod !== undefined) {
            modInfo.metadata.game = (modInfo.metadata.demoMod ? "toby.deltarune.demo" : "toby.deltarune");
            delete modInfo.metadata.demoMod;
            fs.writeFileSync(path.join(modPath, 'meta.json'), JSON.stringify(modInfo, null, 2), 'utf8');
        }
        else if (modInfo.metadata.demoMod === undefined && modInfo.metadata.game === undefined) {
            fs.rmSync(modPath, { recursive: true, force: true });
            throw new Error('Mod manifest is missing required field `game`.');
        }


        if (modInfo.metadata.packageID?.toString().trim() && modInfo.metadata.packageID.toString().trim() != "und.und.und") {
            if (fs.existsSync(path.join(system.getPacketDatabase(), modInfo.metadata.packageID)) && modInfo.metadata.packageID != "und.und.und") {
                clangit = false;
                var existingModInfo = safeReadJSON(path.join(system.getPacketDatabase(), modInfo.metadata.packageID, 'meta.json'));
                var oldVersion = existingModInfo?.metadata?.version || "Unknown";
                var newVersion = modInfo.metadata.version || "Unknown";
                
                var response = dialog.showMessageBoxSync({
                    type: 'error',
                    title: 'Import Failed',
                    message: `The mod "${modInfo.metadata.name}" is already present in your mods.\n\nPresent version: ${oldVersion}\nTo be imported version: ${newVersion}\n\nHow would you like to proceed?`,
                    buttons: ['Delete old version', 'Keep old version', 'Cancel import'],
                    defaultId: 0,
                    cancelId: 2,
                });

                if (response == 0) {
                    fs.rmSync(path.join(system.getPacketDatabase(), modInfo.metadata.packageID), { recursive: true, force: true });
                } else if (response == 1) {
                    fs.rmSync(modPath, { recursive: true, force: true });
                     if (nextPage && nextPage !== "donothing") page(nextPage);
                    return;
                } else {
                    fs.rmSync(modPath, { recursive: true, force: true });
                    if (nextPage && nextPage !== "donothing") page(nextPage);
                    return;
                }
            }
            fs.renameSync(modPath, path.join(system.getPacketDatabase(), modInfo.metadata.packageID));
        }


        /*await dialog.showMessageBox(win, {
            type: 'info',
            title: 'Import Successful',
            message: 'Mod imported successfully.',
            buttons: ['OK']
        });*/

        if (nextPage && nextPage !== "donothing") page(nextPage);

        if (clangit) {
            shopClang();
        }

        // Simple way to refresh the list
        // app.relaunch(properRelaunch());
        // app.exit();
        // process.exit();
    } catch (err) {
        console.error('Error importing mod:', err);
        dialog.showErrorBox('Import failed', String(err) + "\nThe mod was not imported.");
        // clean up
        try {
            fs.rmSync(modPath, { recursive: true, force: true });
        }
        catch (_) {
            console.warn('Failed to clean up mod folder after failed import:', modPath);
        }
    }
}

function removeModSafe(modid) {
    var modPath = path.join(system.getPacketDatabase(), modid);

    // make sure that what we're deleting is actually a mod and not a random folder
    if (fs.existsSync(path.join(modPath, "__deltaID.json")) && fs.existsSync(modPath)) {
        console.log("Deleting mod", modPath);
        fs.rmSync(modPath, { recursive: true });
    } else console.warn("Error: Mod", modPath, "doesn't seem to be a valid mod with a __deltaID.json.");

    page("");
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

    if (pid.includes('..') || pid.includes('/') || pid.includes('\\')) {
        return "und.und.und"; // prevent directory traversal
    }

    if (!pid) return "und.und.und"; // default if not specified

    if (typeof pid !== 'string') return "und.und.und";
    
    pid = pid.trim();

    if (pid.split('.').length !== 3) return "und.und.und"; // must be three parts

    return pid.toLowerCase();
}

function howmany() {
    return fs.readdirSync(system.getPacketDatabase()).length;
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
            
            if (fs.existsSync(path.join(modPath, '_deltamodInfo.json'))) {
                fs.copyFileSync(path.join(modPath, '_deltamodInfo.json'), path.join(modPath, 'meta.json'));
                fs.unlinkSync(path.join(modPath, '_deltamodInfo.json'));
            }
            if (fs.existsSync(path.join(modPath, '_icon.png'))) {
                fs.copyFileSync(path.join(modPath, '_icon.png'), path.join(modPath, 'icon.png'));
                fs.unlinkSync(path.join(modPath, '_icon.png'));
            };

            // Zork's Patch: Find manifest anywhere in the mod folder, not only at root (safe)
            const manifestPath =
                findFirstByName(modPath, 'meta.json') ||
                path.join(modPath, 'meta.json');

            // Zork's Patch: Read defensively; synthesize defaults if missing
            failureReason = "Failed to read meta.json.";
            var modInfo = safeReadJSON(manifestPath) || {
                metadata: { name: mod, version: '1.0.0', game: 'toby.deltarune', packageID: 'und.und.und' },
                dependencies: []
            };
            var meta = modInfo.metadata || {};
            meta.isIncompatible = false;

            if (meta.packageID && meta.packageID.toString().trim().toLowerCase() === "..") {
                meta.packageID = "und.und.und"; // prevent directory traversal
                modInfo.metadata.packageID = "und.und.und"; // prevent directory traversal
                fs.writeFileSync(path.join(modPath, 'meta.json'), JSON.stringify(modInfo, null, 2), 'utf8');
            }

            if (meta.packageID && meta.packageID.toString().trim().split('.').length === 3) {
                console.log('detected valid pid for mod', mod, ':', meta.packageID);
                meta.packageID = validatePID(meta.packageID);

                if (modPath !== path.join(system.getPacketDatabase(), meta.packageID) && meta.packageID != "und.und.und") {
                    console.log('upgrading modstore to have folder named by packageID for mod', mod);
                    fs.renameSync(modPath, path.join(system.getPacketDatabase(), meta.packageID));
                    modPath = path.join(system.getPacketDatabase(), meta.packageID);
                }
            }

            try {
                if (meta.demoMod !== undefined) {
                    console.log("Upgrading demoMod field to game field for mod:", mod);
                    meta.game = (meta.demoMod ? "toby.deltarune.demo" : "toby.deltarune");
                    delete meta.demoMod;
                    fs.writeFileSync(path.join(modPath, 'meta.json'), JSON.stringify(modInfo, null, 2), 'utf8');
                }
            }
            catch {
                console.log("Failed to upgrade demoMod field for mod:", mod);
            }

            try {
                meta.packageID = validatePID(meta.packageID) || "und.und.und";
            }
            catch {
                meta.packageID = "und.und.und";
            }
            const pid = meta.packageID;

            if (require('./KeyValue').readUniqueFlag('HASHCHECKS')) {
                modInfo.neededFiles?.forEach(file => {
                    try {
                        var fileContents = (path.join(system.getSystemFolder('deltaruneInstall'), file.file));
                        var fileContentsHashCPATH = (path.join(system.getSystemFolder('deltaruneInstall'), file.file + '.hash'));

                        if (!fs.existsSync(fileContents)) {
                            meta._incompatibleHASH = true;
                            return; // skip to next file
                        }

                        if (!fs.existsSync(fileContentsHashCPATH)) {
                            var fileContentsHashCalc = crypto.createHash('sha256').update(fs.readFileSync(fileContents)).digest('hex');
                            fs.writeFileSync(fileContentsHashCPATH, fileContentsHashCalc, 'utf8');
                        }

                        var fileContentsHash = fs.readFileSync(fileContentsHashCPATH, 'utf8').trim();

                        console.log('CHECK FILES! ' + file.checksum + ' VS ' + fileContentsHash);
                        if (file.checksum !== fileContentsHash) {
                            meta._incompatibleHASH = true;
                        }
                    }
                    catch {
                        meta._incompatibleHASH = true;
                    }
                }); // future use
            }

            const idPath = findFirstByName(modPath, '__deltaID.json') || path.join(modPath, '__deltaID.json');
            failureReason = "Failed to read __deltaID JSON.";
            let deltamodExclusive = safeReadJSON(idPath);

            failureReason = "Failed to generate an UINTID for the mod.";

            if (meta.game == 'toby.deltarune.demo' && meta.isForLTS == true) {
                meta.game = 'toby.deltarune.demolts';
                var modInfoCP = modInfo; // avoid mutating the original modInfo in case of errors
                modInfoCP.metadata.game = 'toby.deltarune.demolts';
                delete modInfoCP.metadata.isForLTS;
                delete modInfoCP.metadata.isIncompatible;
                delete modInfoCP.metadata._incompatibleHASH;
                fs.writeFileSync(manifestPath, JSON.stringify(modInfoCP, null, 2), 'utf8');
            }


            if (meta.game == 'toby.deltarune.demo' && meta.isForLTS == undefined && !fs.existsSync(path.join(modPath, '_democheck'))) {
                var modXML = fs.readFileSync(path.join(modPath, 'modding.xml'), 'utf8');
                if (modXML.includes('chapter1_windows') || modXML.includes('chapter2_windows')) {
                    meta.game = 'toby.deltarune.demolts';
                    modInfo.metadata.game = 'toby.deltarune.demolts';
                    fs.writeFileSync(manifestPath, JSON.stringify(modInfo, null, 2), 'utf8');
                }
                else {
                    meta.game = 'toby.deltarune.demo';
                    modInfo.metadata.game = 'toby.deltarune.demo';

                    var modInfoCP = modInfo; // avoid mutating the original modInfo in case of errors
                    delete modInfoCP.metadata.isForLTS;
                    delete modInfoCP.metadata.isIncompatible;
                    delete modInfoCP.metadata._incompatibleHASH;
                    fs.writeFileSync(manifestPath, JSON.stringify(modInfoCP, null, 2), 'utf8');

                    fs.writeFileSync(path.join(modPath, '_democheck'), "", 'utf8');
                }
            }

            try {
                if (deltamodExclusive.new == null) {
                    deltamodExclusive.new = false; // backfill old mods
                    fs.writeFileSync(idPath, JSON.stringify(deltamodExclusive, null, 2), 'utf8');
                }

                if (deltamodExclusive.uniqueId.split('_')[3] !== require('../package.json').version) {
                    // if the version is different, regenerate the uniqueId
                    console.log('mod version mismatch, regenerating uniqueId for mod:', mod);
                    deltamodExclusive = null; // force regeneration below
                }
            }
            catch {
                console.log('deltamodExclusive uniqueId version parse failed, regenerating uniqueId for mod:', mod);
            }

            if (!deltamodExclusive || !deltamodExclusive.uniqueId) {
                console.log('generating unique uid for mod:', mod);
                deltamodExclusive = {
                    uniqueId: system.generateUniqueId(),
                    validFor: computerName,
                    new: true
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
                typeof meta.game === 'undefined'
            ) {
                failureReason = "meta.json is missing required fields `name`, `description` or `game`.";
                throw new Error(`Missing required fields in meta.json for mod: ${mod}`);
            }

            if (fs.readdirSync(modPath).filter(x => x.endsWith('.js')).length !== 0
            || fs.readdirSync(modPath).filter(x => x.endsWith('.ts')).length !== 0
            || fs.readdirSync(modPath).filter(x => x.endsWith('.exe')).length !== 0) {
                failureReason = "This mod contains potentially malicious content. (EXE_DETECT)";
                throw new Error(`This mod contains potentially malicious content. (EXE_DETECT)`);
            }

            [meta.name, meta.description, meta.author].forEach(field => {
                if (
                    (typeof field === 'string' && /<\/?[^>]+>/.test(field))
                ) {
                    failureReason = "This mod contains potentially malicious content. (HTML_DETECT)";
                    throw new Error('This mod contains potentially malicious content. (HTML_DETECT)');
                }
            });

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
            // convert bytes to megabytes, round to 2 decimals; non-zero values are at least 0.01 MB
            modSize = modSize === 0 ? 0 : Math.max(0.01, Math.round((modSize / (1024 * 1024)) * 100) / 100);

            var games = require('./GameDB').getGames();
            if (!games.some(g => g.id === meta.game)) {
                failureReason = `Mod targets unknown game: ${meta.game}`;
                throw new Error(`Mod targets unknown game: ${meta.game}`);
            }

            try {
                var variant = fs.readFileSync(path.join(modPath, '__variant'), 'utf8').trim();
            }
            catch {
                variant = null;
            }
            // keep your return shape; just add ids (non-breaking)
            modList.push({
                name:         meta.name || mod,
                version:      require('./Utils').validateVersioning(meta.version) || "Unknown",
                author:       meta.author || computerName,
                description:  meta.description || '',
                folder:       mod,
                size:         modSize, // New in 1.1.2
                mergeSupport: (meta.mergeSupport == undefined ? true : meta.mergeSupport), // default true
                url:          meta.url || null,
                customRGB:    meta.color || null,
                variants:     modInfo.variants || null,
                game:         meta.game || "toby.deltarune",
                dependencies: modInfo.dependencies || [],
                packageID: pid,
                gamebanana: {
                    supports: meta.gamebanana_id != null && meta.gamebanana_model != null,
                    id:       meta.gamebanana_id || null,
                    model:    meta.gamebanana_model || null,
                },
                _incompatibleHASH: meta._incompatibleHASH || false,
                _selectedVariant: variant || null,
                // NEW: give the renderer stable identifiers
                new: deltamodExclusive.new || false, // Used in UI

                uniqueId: uid,
                uid:      uid,   // <- many UIs look for this name
                id:       uid,

                // TODO I don't know what the default values for these fields should be.
                // I'm just adding them to satisfy the typechecker.
                // 
                // GHINORHINO NOTE:
                // These are dynamically set one level above this function, before sending them off to the renderer,
                // compatibility checks are performed in Runner.js
                isIncompatible: false,
                incompatibilityReason: "",
            });
        }
        catch (e) {
            console.error(`Error reading mod info for ${mod}:`, e, ' ' + e.stack);
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
                const imgPath = mod + '/icon.png';
                if (fs.existsSync(path.join(system.getPacketDatabase(), imgPath))) {
                    return { exists: true, path: 'packet://' + imgPath };
                }
                return { exists: false, path: null };
            }
            catch {
                return { exists: false, path: null };
            }
        }
    }
    return { exists: false, path: null };
}
if (!fs.existsSync(system.getPacketDatabase())) {
    fs.mkdirSync(system.getPacketDatabase(), { recursive: true });
}

module.exports = {
    modList,
    importMod,
    howmany,
    downloadModFromURL,
    removeModSafe,
    getModImage
};
