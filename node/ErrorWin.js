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
    var error = (err.stack || err.toString());

    setSharedVar('errorPath', whereWrite);
    setSharedVar('errorMessage', error);

    fs.writeFileSync(whereWrite, error, 'utf8');

    const win = getWindow();
    win.show();
    win.loadURL('deltapack://web/error/index.html');
}

module.exports = {
    errorWin,
}
