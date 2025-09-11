const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.on('progress', (event, message) => {
    document.getElementById('progress').max = 100;
    document.getElementById('progress').value = message.percentage;
});