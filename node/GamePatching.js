const {encodeSync, decodeSync} = require('@chainsafe/xdelta3-node');
const fs = require('fs');
const pathing = require('path');
const {DOMParser} = require('@xmldom/xmldom');

function timeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    startGamePatch: async (gamePath, dbPath, enableMods) => {
        var dbMods = fs.readdirSync(dbPath);
        var returnedObj = {
            patched: true,
            log: ""
        };

        console.log("Game Path:", gamePath);
        console.log("Database Path:", dbPath);
        console.log("Enabled Mods:", enableMods);

        var objects = [];
        for (const mod of dbMods) {
            var meta = JSON.parse(fs.readFileSync(`${dbPath}/${mod}/_deltamodInfo.json`, 'utf8'));
            if (enableMods.includes(meta.metadata.uniqueId)) {
                console.log(`Applying mod: ${meta.metadata.uniqueId}`);
                var xml = fs.readFileSync(`${dbPath}/${mod}/modding.xml`, 'utf8');
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(xml, 'text/xml');

                var patches = xmlDoc.getElementsByTagName("patch");
                
                for (let i = 0; i < patches.length; i++) {
                    const element = patches[i];
                    switch (element.getAttribute("type")) {
                        case "xdelta":
                            var patchFile = pathing.join(dbPath, mod, element.getAttribute("patch"));
                            var toFile = pathing.join(gamePath, element.getAttribute("to"));
                            console.log(`Applying xdelta patch from ${patchFile} to ${toFile}`);
                            try {
                                var bufferPatch = Buffer.from(fs.readFileSync(patchFile));
                                var bufferTo = Buffer.from(fs.readFileSync(toFile));
                                var patchedBuffer = encodeSync(bufferTo, bufferPatch);

                                fs.writeFileSync(toFile, patchedBuffer);
                                console.log(`Patched ${toFile} successfully.`);
                            } catch (error) {
                                returnedObj.patched = false;
                                returnedObj.log += `Failed to apply xdelta patch: ${error.message}\n`;
                            }
                            break;
                        case "override":
                            var patchFile = pathing.join(dbPath, mod, element.getAttribute("patch"));
                            var toFile = pathing.join(gamePath, element.getAttribute("to"));
                            console.log(`Applying xdelta patch from ${patchFile} to ${toFile}`);
                            try {
                                fs.rmSync(toFile, { force: true, recursive: true });
                                fs.copyFileSync(patchFile, toFile);
                                console.log(`Overrode ${toFile} successfully.`);
                            } catch (error) {
                                returnedObj.patched = false;
                                returnedObj.log += `Failed to apply xdelta patch: ${error.message}\n`;
                            }
                            break;
                        default:
                            returnedObj.patched = false;
                            returnedObj.log += `Unknown patch type: ${element.getAttribute("type")}\n`;
                            break;
                    }
                }
            }
        }

        await timeoutPromise(1000); // Delay needed (TODO fix)

        return returnedObj;
    }
};