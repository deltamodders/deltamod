const { Tray, Menu } = require('electron');
const path = require('path');
async function makeTray() {
    const tray = new Tray(path.join(__dirname, '../assets', 'tray.png'));

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

module.exports = { makeTray };