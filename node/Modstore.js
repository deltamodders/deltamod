const Paths = require('./Paths');
const path = require('path');
const system = require('./System');
const fs = require('fs');

function modList() {
    var mods = fs.readdirSync(system.getPacketDatabase());
    var modList = [];

    mods.forEach((mod) => {
        try {
            var modPath = path.join(system.getPacketDatabase(), mod);
            var modInfo = JSON.parse(fs.readFileSync(path.join(modPath, '_deltamodInfo.json'), 'utf8'));

            modList.push({
                name: modInfo.metadata.name,
                description: modInfo.metadata.description,
                priority: 1,
                uid: modInfo.metadata.uniqueId,
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