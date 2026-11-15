const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { ASSETS_DIR, PACKAGE_JSON } = require('./Paths');

async function makeTray() {
    const tray = new Tray(path.join(ASSETS_DIR, 'tray.png'));

    tray.on('click', () => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Deltamod ' + require(PACKAGE_JSON).version,
                icon: nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.png')).resize({ width: 16, height: 16 }),
                enabled: false
            },
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

module.exports = { makeTray };