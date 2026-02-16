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
        },

        _pageArguments: {
            lp?: string,
            gbAPI?: string,
            gbAPIFilter?: (data: any) => any,
            leSearchQuery?: string,
        },
    }

    function page(name: string): Promise<void>;

    function htmlAlert(
        title: string,
        message: string,
        buttons: {
            text: string
            resolveWith?: string,
            rejectWith?: string,
            onClick?: any, // TODO Figure out what type this is supposed to be cause i genuinely have no clue
        }[],
        specialIcon?: string
    ): Promise<any>;
}
