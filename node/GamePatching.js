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

        var objects = [];
        for (const mod of dbMods) {
            var meta = JSON.parse(fs.readFileSync(`${dbPath}/${mod}/_deltamodInfo.json`, 'utf8'));
            var dmc = JSON.parse(fs.readFileSync(`${dbPath}/${mod}/__deltaID.json`, 'utf8'));
            if (enableMods.includes(dmc.uniqueId)) {
                console.log(`Applying mod: ${dmc.uniqueId}`);
                var xml = fs.readFileSync(`${dbPath}/${mod}/modding.xml`, 'utf8');
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(xml, 'text/xml');

                var patches = xmlDoc.getElementsByTagName("patch");
                console.log("Patches found:", patches.length);
                for (let i = 0; i < patches.length; i++) {
                    var patch = patches[i];
                    objects.push({
                        type: patch.getAttribute("type"),
                        patch: patch.getAttribute("patch"),
                        to: patch.getAttribute("to"),
                        modPath: `${dbPath}\\${mod}`,
                    });
                }
                
            }
        }

        console.log("Patches to apply:", objects);

        var xdeltas = objects.filter(obj => obj.type === "xdelta");
        var files = objects.filter(obj => obj.type === "override");

        for (const xd of xdeltas) {
            // insert xdelta patching here
        }

        for (const file of files) {
            var from = pathing.join(file.modPath, file.patch);
            var to = pathing.join(gamePath, file.to);

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