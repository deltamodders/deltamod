const { screen } = require('electron');
const console = require('./Console.js');

const conditions = [
    {
        name: 'Minimum screen size of at least 1024x768',
        required: false,
        checker: () => {
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.workAreaSize;
            return width >= 1024 && height >= 768;
        }
    },
    {
        name: 'At least 1GB of RAM available',
        required: true,
        checker: () => {
            const totalMemory = require('os').totalmem();
            return totalMemory >= 1 * 1024 * 1024 * 1024;
        }
    },
    {
        name: 'At least 2GB of storage available',
        required: true,
        checker: () => {
            const fsp = require("fs");
            const { bfree, bsize } = fsp.statfsSync(__dirname);
            free = bfree * bsize;
            return free >= 2 * 1024 * 1024 * 1024;
        }
    },
    {
        name: 'Windows 10 or later',
        required: false,
        checker: () => {
            const os = require('os');
            const platform = os.platform();
            const release = os.release();
            console.log(`OS Platform: ${platform}, Release: ${release}`);
            if (platform === 'win32') {
                const version = parseInt(release.split('.')[0], 10);
                return version >= 10;
            }
            return false; // Not Windows or Linux
        }
    }
];

function checkConditions() {
    let checkers = [];
    for (var condition of conditions) {
        if (condition.checker() == false) {
            console.log(`Checking ${condition.name}`);
            checkers.push(condition);
        }
        else {
            console.log(`Checking ${condition.name}`);
        }
    };
    return checkers;
}

module.exports = {checkConditions};
