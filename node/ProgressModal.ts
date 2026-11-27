import path from "path";

import { BrowserWindow } from "electron";

import { PARTITION } from "./Config";
import { VIEWS_DIR } from "./Paths";
import { getWindow } from "./Utils";

const progressModals = new Set<BrowserWindow>();

export function createProgressModal(): BrowserWindow {
    const modal = new BrowserWindow({
        width: 450,
        height: 210,
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
            preload: path.join(VIEWS_DIR, 'dlmodal', 'preload.js'),
            partition: PARTITION
        }
    });

    progressModals.add(modal);
    modal.on('closed', () => {
        progressModals.delete(modal)
        console.log("THE WINDOW SHALL ACTUALLY CLOSE NOW.");
        // hopefully this actually destroys the modal
        modal.destroy();
        console.log("IT SHOULD BE CLOSED BY NOW.");
    });

    modal.loadURL('deltapack://web/dlmodal/index.html');
    modal.setMenuBarVisibility(false);

    return modal;
}

export function updateProgressModal(
    modal: BrowserWindow,
    mainWindow: BrowserWindow | null,
    frac: number,
    logPrefix: string | null,
) {
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

export function closeAllProgressModals() {
    for (const modal of progressModals) {
        try { modal.close(); } catch {}
    }
    progressModals.clear();
}
