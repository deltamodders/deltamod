const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, data) => {
        return ipcRenderer.invoke(channel, data);
    }
});

contextBridge.exposeInMainWorld('preloadAPI', {
  onPage: (callback) => ipcRenderer.on('page', (_, title) => callback(title)),
  onAudio: (callback) => ipcRenderer.on('audio', (_, stat) => callback(stat))
});

ipcRenderer.on('warn', (_, message) => {
    console.warn(message);
});