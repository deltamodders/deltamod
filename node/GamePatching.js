const {encodeSync, decodeSync} = require('@chainsafe/xdelta3-node');
const fs = require('fs');

function timeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    startGamePatch: async (gamePath, dbPath, enableMods) => {
        var dbMods = fs.readdirSync(dbPath);

        console.log("Game Path:", gamePath);
        console.log("Database Path:", dbPath);
        console.log("Enabled Mods:", enableMods);

        var objects = [];
        for (const mod of dbMods) {
            var meta = JSON.parse(fs.readFileSync(`${dbPath}/${mod}/_deltamodInfo.json`, 'utf8'));
            if (enableMods.includes(meta.metadata.uniqueId)) {
                console.log("Rendering mod: ", meta.metadata.name);
                var paths = meta.patching;
                // xdelta patching here
                // overriding here
                // watercooler here.
                objects.push(mod);
            }
        }

        await timeoutPromise(1000); // Delay needed (TODO fix)

        return;
    }
};