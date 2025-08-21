const { screen } = require('electron');

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
        name: 'Windows 10 or later; or Linux kernel 5.0 or later',
        required: true,
        checker: () => {
            const os = require('os');
            const platform = os.platform();
            const release = os.release();
            console.log(`OS Platform: ${platform}, Release: ${release}`);
            if (platform === 'win32') {
                const version = parseInt(release.split('.')[0], 10);
                return version >= 10;
            }
            else if (platform === 'linux') {
                const version = parseInt(release.split('.')[0], 10);
                return version >= 5;
            }
            return false; // Not Windows or Linux
        }
    }
];

function checkConditions() {
    let checkers = [];
    console.log('[==CONDITIONS==]');
    conditions.forEach(condition => {
        console.log(`Checking condition: ${condition.name}`);
        if (condition.checker() == false) {
            console.log(`Condition not met: ${condition.name}`);
            checkers.push(condition);
        }
        else {
            console.log(`Condition met: ${condition.name}`);
        }
    });
    console.log('[==END CONDITIONS==]');
    return checkers;
}

module.exports = {checkConditions};
