const Paths = require('./Paths');
const path = require('path');
const system = require('./System');
const fs = require('fs');
const os = require('os');

const computerName = os.hostname();

function modList() {
    var mods = fs.readdirSync(system.getPacketDatabase());
    var modList = [];

    mods.forEach((mod) => {
        try {
            var modPath = path.join(system.getPacketDatabase(), mod);
            var modInfo = JSON.parse(fs.readFileSync(path.join(modPath, '_deltamodInfo.json'), 'utf8'));
            var uniqueidSet = new Set();
            
            if (fs.existsSync(path.join(modPath, '__deltaID.json'))) {
                fs.rmSync(path.join(modPath, '__deltaID.json'));
            }

            console.log('generating unique uid for mod:', mod);
            deltamodExclusive = {
                uniqueId: system.generateUniqueId(),
                validFor: computerName,
            };
            fs.writeFileSync(path.join(modPath, '__deltaID.json'), JSON.stringify(deltamodExclusive, null, 2), 'utf8');

            if (
                !modInfo ||
                !modInfo.metadata ||
                typeof modInfo.metadata.name !== 'string' ||
                typeof modInfo.metadata.description !== 'string' ||
                typeof modInfo.metadata.demoMod === 'undefined'
            ) {
                throw new Error(`Missing required fields in _deltamodInfo.json for mod: ${mod}`);
            }

            modList.push({
                name: modInfo.metadata.name,
                description: modInfo.metadata.description,
                priority: 1,
                uid: deltamodExclusive.uniqueId,
                demo: modInfo.metadata.demoMod,
                dependencies: modInfo.dependencies || [],
            });
        }
        catch (e) {
            console.error(`Error reading mod info for ${mod}:`, e);
            return;
        }
    });

    return modList;
}

if (!fs.existsSync(system.getPacketDatabase())) {
    fs.mkdirSync(system.getPacketDatabase(), { recursive: true });
}

module.exports = {
    modList: modList
};