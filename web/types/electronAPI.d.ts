import { IpcRenderer, IpcRendererEvent } from "electron";

export {};

type PreloadListener = (IpcRendererEvent) => IpcRenderer;

declare global {
    interface Window {
        // TODO we need to also add preloadAPI functions here.
        electronAPI: {
            invoke: (channel, data) => any,
        },

        preloadAPI: {
            onPage: PreloadListener,
            onAudio: PreloadListener,
            onGPL: PreloadListener,
            onUpdateAvailable: PreloadListener,
            onDDS: PreloadListener,
            onThemeChange: PreloadListener,
            onUpdateProgress: PreloadListener,
            onRefresh: PreloadListener,
            onFinishedPatch: PreloadListener,
            onDLMODProgress: PreloadListener,
            onWRA: PreloadListener,
        }
    }
}
