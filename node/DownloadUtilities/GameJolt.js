const axios = require('axios');
const fs = require('fs');
const { BrowserWindow } = require('electron');
async function run(id, data) {
    return new Promise (async (resolve, reject) => {
        // TODO: reverse engineer their download system to get direct download link
        var testerWindow = new BrowserWindow({
            width: 500,
            height: 500,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        await testerWindow.loadURL(`https://gamejolt.com/get/build?game=${data.gameId}&build=${data.buildId}`);

        testerWindow.webContents.on('will-navigate', (event, url) => {
            console.log('Found GJ redir: ', url);
            resolve(url);
            testerWindow.close();
            testerWindow.destroy();
        });
    });
}

module.exports = { run };