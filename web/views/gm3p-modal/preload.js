const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    onProgress: (callback) => ipcRenderer.on('progress', (event, data) => callback(data))
});