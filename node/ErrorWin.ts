import fs from "fs";
import path from "path";

import { app } from "electron";

import { closeAllProgressModals } from "./ProgressModal";
import { setSharedVar, getWindow } from "./Utils";

/**
 * Show the dogcheck error screen
 * @param err The error to show
 */
export function errorWin(err: Error | string) {
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
