// @ts-check

const { Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { ASSETS_DIR, PACKAGE_JSON } = require('./Paths');

let canShowButton = true;
/**
 * @param {boolean} show
 */
function showButton(show) {
    canShowButton = show;
}

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
                label: 'Show' + (canShowButton ? '' : ' (cannot show while game is running)'),
                click: () => {
                    const win = require('./Utils.js').getWindow();
                    if (win) {
                        win.show();
                    }
                },
                enabled: canShowButton
            },
            {
                label: 'Quit',
                click: () => {
                    if (!canShowButton) {
                        var resp = dialog.showMessageBoxSync({
                            type: 'info',
                            title: 'Quit Deltamod',
                            message: 'Are you sure you want to quit Deltamod? The game will be kept running.',
                            buttons: ['Yes', 'No'],
                            defaultId: 1,
                            cancelId: 1
                        });
                        if (resp === 1) {
                            return;
                        }
                    }
                    process.exit(0);
                }
            },
        ]);

        tray.popUpContextMenu(contextMenu);
    });

    tray.setToolTip('Deltamod');
}

module.exports = { makeTray, showButton };