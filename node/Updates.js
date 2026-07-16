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
        var VERSION = require('../package.json').version;
        var URL = "https://deltamodders.com/apiv1/deltamod/latest?v=" + encodeURIComponent(VERSION);
        var DATA = await JSON.parse(await httpsPromisify(URL));
    }
    catch (e) {
        console.warn("Failed to check for updates");
        return {update: false, newVersionLink: null, version: null};
    }

    if (process.platform == 'linux') {
        console.warn("Auto-updates are not supported on Linux. Please check https://github.com/deltamodders/deltamod for updates.");
        return {update: false, newVersionLink: null, version: null};
    }

    return {
        update: DATA.update,
        newVersionLink: DATA.newVersionLink,
        version: DATA.version
    };
}

module.exports = {
    checkUpdates
};
