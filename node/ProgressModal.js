const { BrowserWindow } = require("electron");
const { getWindow } = require("./Utils");
const Paths = require("./Paths");
const { PARTITION } = require("./Config");

const progressModals = new Set();

/**
 * @returns {BrowserWindow}
 */
function createProgressModal() {
    const modal = new BrowserWindow({
        width: 350,
        height: 170,
        resizable: false,
        maximizable: false,
        frame: false,
        minimizable: false,
        closable: true,
        fullscreenable: false,
        modal: true,
        parent: getWindow(),
        webPreferences: {
            devTools: process.env.DELTAMOD_ENV === 'dev',
            nodeIntegration: true,
            preload: Paths.file('web', 'views', 'gm3p-modal', 'preload.js'),
            partition: PARTITION
        }
    });

    progressModals.add(modal);
    modal.on('closed', () => progressModals.delete(modal));

    modal.loadURL('deltapack://web/views/gm3p-modal/index.html');
    modal.setMenuBarVisibility(false);

    return modal;
}

/**
 * 
 * @param {BrowserWindow} modal 
 * @param {BrowserWindow?} mainWindow
 * @param {number} frac
 * @param {string?} logPrefix
 */
function updateProgressModal(modal, mainWindow, frac, logPrefix) {
    const percent = Math.round(frac * 100 * 100) / 100;

    if (logPrefix == null) {
        console.log(`Progress: ${percent}%`);
    } else {
        console.log(`${logPrefix} ${percent}%`);
    }

    if (mainWindow != null) {
        getWindow().setProgressBar(Math.round(percent)/100);
    }

    // Disclaimer: In a few lines, you will see a TERRIBLE workaround. I *hate* this workaround.

    // I HATE THIS WORKAROUND!!! >:( THIS WORKAROUND SUCKS
    modal.webContents.executeJavaScript(`updateProgress(${percent});`); // i hate this workaround
    // The workaround above is TERRIBLE.
}

function closeAllProgressModals() {
    for (const modal of progressModals) {
        try { modal.close(); } catch {}
    }
    progressModals.clear();
}

module.exports = {
    createProgressModal,
    updateProgressModal,
    closeAllProgressModals
};
