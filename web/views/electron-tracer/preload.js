const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('preloadAPI', {
  onLog: (callback) => ipcRenderer.on('log', (_, args) => callback(args)),
});