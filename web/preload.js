const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, data) => {
        var leResponse = ipcRenderer.invoke(channel, data);
        if (channel != 'log') {
          leResponse.then((response) => {
            ipcRenderer.invoke('logElectronAPI', [{ channel, args: data, leResponse: (response) }]);
          });
        }
        return leResponse;
    }
});

contextBridge.exposeInMainWorld('preloadAPI', {
  onPage: (callback) => ipcRenderer.on('page', (_, title) => callback(title)),
  onAudio: (callback) => ipcRenderer.on('audio', (_, stat) => callback(stat)),
  onGPL: (callback) => ipcRenderer.on('gplog', (_, message) => callback(message)),
  onUpdateAvailable: (callback) => ipcRenderer.on('updateAvailable', (_, info) => callback(info)),
  onDDS: (callback) => ipcRenderer.on('du-progress', (_, info) => callback(info)),
  onThemeChange: (callback) => ipcRenderer.on('themeChange', () => callback()),
  onUpdateProgress: (callback) => ipcRenderer.on('updateProgress', (_, info) => callback(info)),
  onRefresh: (callback) => ipcRenderer.on('refresh', () => callback()),
  onFinishedPatch: (callback) => ipcRenderer.on('finishedPatch', () => callback()),
  onDLMODProgress: (callback) => ipcRenderer.on('dlmodURL-progress', (_, info) => callback(info)),
  onWRA: (callback) => ipcRenderer.on('winResAlert', (_, info) => callback(info)),
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