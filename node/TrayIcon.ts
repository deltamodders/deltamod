import path from 'path';

import { Tray, Menu } from 'electron';

import { ASSETS_DIR } from './Paths';

export async function makeTray() {
    const tray = new Tray(path.join(ASSETS_DIR, 'tray.png'));

    tray.on('click', () => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show',
                click: () => {
                    const win = require('./Utils.js').getWindow();
                    if (win) {
                        win.show();
                    }
                }
            },
            {
                label: 'Quit',
                click: () => {
                    process.exit(0);
                }
            },
        ]);

        tray.popUpContextMenu(contextMenu);
    });

    tray.setToolTip('Deltamod');
}
