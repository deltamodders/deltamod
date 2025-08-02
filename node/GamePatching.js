const {encodeSync, decodeSync} = require('@chainsafe/xdelta3-node');
const fs = require('fs');
const pathing = require('path');
var convert = require('xml-js');
const { dialog } = require('electron');
const { ChildProcess } = require('child_process');
const { exec } = require('child_process');

function timeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function detectConflicts(files) {
    let conflicts = [];
    let seen = {};

    for (const file of files) {
        if (!seen[file.to]) {
            seen[file.to] = [];
        }
        seen[file.to].push(file.modName);
    }

    for (const key in seen) {
        // Only consider as conflict if more than one unique mod is trying to patch the same file
        const uniqueMods = [...new Set(seen[key])];
        if (uniqueMods.length > 1) {
            conflicts.push(uniqueMods);
        }
    }

    if (conflicts.length > 0) {
        return { found: true, conflicts };
    } else {
        return { found: false, conflicts: [] };
    }
}

module.exports = {
    startGamePatch: async (gamePath, dbPath, enableMods) => {
        var dbMods = fs.readdirSync(dbPath);
        var returnedObj = {
            patched: true,
            log: ""
        };

        var objects = [];
        for (const mod of dbMods) {
            var meta = JSON.parse(fs.readFileSync(`${dbPath}/${mod}/_deltamodInfo.json`, 'utf8'));
            var dmc = JSON.parse(fs.readFileSync(`${dbPath}/${mod}/__deltaID.json`, 'utf8'));
            if (enableMods.includes(dmc.uniqueId)) {
                console.log(`Applying mod: ${dmc.uniqueId}`);
                var xml = fs.readFileSync(`${dbPath}/${mod}/modding.xml`, 'utf8');
                var json = convert.xml2json(xml, {compact: false, spaces: 4});
                var jsonObj = JSON.parse(json);

                console.log(jsonObj);

                jsonObj.elements.forEach(patch => {
                    console.log(`Found patch: ${patch.attributes.patch} of type ${patch.attributes.type}`);
                    objects.push({
                        type: patch.attributes.type,
                        patch: patch.attributes.patch,
                        to: patch.attributes.to,
                        modPath: `${dbPath}/${mod}`,
                        modName: meta.metadata.name
                    });
                });
                /*
                xml.split('\n').forEach(line => {
                    var parser = new DOMParser();
                    var xmlDoc = parser.parseFromString(line, 'text/xml');
                    var patches = xmlDoc.getElementsByTagName("patch");
                    for (let i = 0; i < patches.length; i++) {
                        var patch = patches[i];
                        objects.push({
                            type: patch.getAttribute("type"),
                            patch: patch.getAttribute("patch"),
                            to: patch.getAttribute("to"),
                            modPath: `${dbPath}\\${mod}`,
                            modName: meta.metadata.name
                        });
                }
                });
                */
            }
        }

        console.log("Patches to apply:", objects);

        var xdeltas = objects.filter(obj => obj.type === "xdelta");
        var files = objects.filter(obj => obj.type === "override");
        var combined = [...xdeltas, ...files];

        var conflicts = detectConflicts(combined);
        if (conflicts.found) {
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'Conflict Detected',
                message: 'These mods are conflicting with each other:\n' +
                    conflicts.conflicts.join(','),
                buttons: ['OK']
            });
            returnedObj.patched = false;
            returnedObj.log += "Conflicts detected in file overrides.\n";
            return returnedObj;
        }

        if (xdeltas.length >= 1) {
            // insert xdelta patching here

            //TODO: make sure this works
            // Helper to promisify exec
            function execPromise(command) {
                return new Promise((resolve, reject) => {
                    exec(command, {maxBuffer: 1024 * 16384}, (error, stdout, stderr) => {
                        if (error) {
                            reject(stderr || error);
                        } else {
                            resolve(stdout);
                        }
                    });
                });
            }

            try {

                console.log((xdeltas.map(z => z.modPath).join(',')).replace('/', '\\') + '\n');
                console.log(pathing.join(gamePath, xdeltas[0].to));
                if (fs.existsSync(pathing.join(__dirname, "../gm3p/output/xDeltaCombiner")))
                {
                    await execPromise(pathing.join(__dirname, "../gm3p/GM3P.exe") + " clear");
                }
                await execPromise(pathing.join(__dirname, "../gm3p/GM3P.exe") + " massPatch " + pathing.join(gamePath, xdeltas[0]?.to) + " GM " + xdeltas.length + " \",," + (xdeltas.map(z => pathing.join(z.modPath, z.patch)).join(',')).replace('/','\\') + "\"");
                await execPromise(pathing.join(__dirname, "../gm3p/GM3P.exe") + " compare " + xdeltas.length + " true true");
                // Use the first modName for result (or adapt as needed)
                const modName = xdeltas[0]?.modName || "result";
                await execPromise(pathing.join(__dirname, "../gm3p/GM3P.exe") + " result \"" + modName + "\" true");
                const to = pathing.join(gamePath, xdeltas[0]?.to || "data.win");
                fs.rmSync(to, { force: true, recursive: true });
                fs.copyFileSync(pathing.join(__dirname, "../gm3p/output/result/", modName, "0/data.win"), to);
            } catch (err) {
                returnedObj.patched = false;
                returnedObj.log += `Error during xdelta patching: ${err}\n`;
            }
        }

        for (const file of files) {
            var from = pathing.join(file.modPath, file.patch);
            var to = pathing.join(gamePath, file.to);

            console.log(`Copying file from ${from} to ${to}`);

            if (!fs.existsSync(from)) {
                returnedObj.patched = false;
                returnedObj.log += `File not found: ${from}\n`;
                continue;
            }

            fs.rmSync(to, {force: true, recursive: true});
            fs.copyFileSync(from, to);
        }

        await timeoutPromise(1000); // Delay needed (TODO fix)

        return returnedObj;
    }
};