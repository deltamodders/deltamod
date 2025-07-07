const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, data) => {
        return ipcRenderer.invoke(channel, data);
    }
});