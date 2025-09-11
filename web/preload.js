const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, data) => {
        return ipcRenderer.invoke(channel, data);
    }
});

contextBridge.exposeInMainWorld('preloadAPI', {
  onPage: (callback) => ipcRenderer.on('page', (_, title) => callback(title)),
  onAudio: (callback) => ipcRenderer.on('audio', (_, stat) => callback(stat)),
  onGPL: (callback) => ipcRenderer.on('gplog', (_, message) => callback(message)),
  onUpdateAvailable: (callback) => ipcRenderer.on('updateAvailable', (_, info) => callback(info)),
  onDDS: (callback) => ipcRenderer.on('du-progress', (_, info) => callback(info)),
  onThemeChange: (callback) => ipcRenderer.on('themeChange', () => callback())
});

ipcRenderer.on('warn', (_, message) => {
    console.warn(message);
});

// Remove Windows SMTC handlers to stop Windows interfering with background music
Object.defineProperty(navigator, "mediaSession", {
  value: {
    metadata: null,
    playbackState: "none",
    setActionHandler: () => {},
  },
  writable: false,
});