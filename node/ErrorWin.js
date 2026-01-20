const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { setSharedVar, getWindow } = require("./Utils");
const { closeAllProgressModals } = require("./ProgressModal");

/**
 * Show the dogcheck error screen
 * @param {Error | string} err The error to show
 */
function errorWin(err) {
    closeAllProgressModals();

    if (typeof(err) === 'string') {
        err = new Error(err);
    }

    var filename = 'error_' + Date.now() + '.log';
    if (!fs.existsSync(path.join(app.getPath('documents'), 'deltamodErrors'))) {
        fs.mkdirSync(path.join(app.getPath('documents'), 'deltamodErrors'), { recursive: true });
    }
    var whereWrite = path.join(app.getPath('documents'), 'deltamodErrors', filename);
    var heapScreenshot = require('v8').getHeapSnapshot();
    var heapFile = fs.createWriteStream(whereWrite.replace('.log', '.heapsnapshot'));
    var error = (err.stack || err.toString());

    setSharedVar('error', error);
    setSharedVar('filename', filename);
    setSharedVar('filepath', whereWrite);

    fs.writeFileSync(whereWrite, error, 'utf8');
    heapScreenshot.pipe(heapFile);

    const win = getWindow();
    win.show();
    win.loadURL('deltapack://web/views/errorWrt/index.html');
}

module.exports = {
    errorWin,
}
