const https = require('https');
const console = require('./Console.js');
const { version } = require('os');

function httpsPromisify(params) {
    return new Promise((resolve, reject) => {
        https.get(params, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function checkUpdates() {
    try {
        var URL = "https://gamebanana.com/apiv11/Tool/20575/ProfilePage";
        var DATA = await JSON.parse(await httpsPromisify(URL));
        var ARTIFACT_NEEDED = process.platform === 'win32' ? 'A' : process.platform === 'linux' ? 'C' : 'U';
        var VERSION = require('../package.json').version;
    }
    catch (e) {
        console.warn("Failed to check for updates");
        return {update: false, newVersionLink: null, version: null};
    }

    if (ARTIFACT_NEEDED === 'C') {
        console.warn("Auto-updates are not supported on Linux. Please check https://github.com/deltamodders/deltamod for updates.");
        return {update: false, newVersionLink: null, version: null};
    }

    var versionOffline = VERSION + ARTIFACT_NEEDED;
    var versionOnline = DATA._aFiles.find(f => f._sVersion.toLowerCase().endsWith(ARTIFACT_NEEDED.toLowerCase()));

    if (versionOffline.toLowerCase() !== versionOnline._sVersion.toLowerCase()) {
        console.warn(`A new version is available: ${versionOnline._sVersion} (You have ${versionOffline})`);
        return {update: true, newVersionLink: versionOnline._sDownloadUrl.replace("/dl/", "/mmdl/"), version: versionOnline._sVersion};
    }

    return {update: false, newVersionLink: null, version: null};
}

module.exports = {
    checkUpdates
};