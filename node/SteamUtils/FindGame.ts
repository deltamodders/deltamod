import { readFileSync, existsSync } from "fs";
import path from "path";

import type { Dialog } from "electron";
import kvparser from "kvparser";

import { getSteamDirectory } from "../Utils";

interface SteamLibrary {
    path: string;
    apps: Record<string, string>;
}

interface ChosenEdition {
    folder: string;
    appid: string;
}

function tryGameDir(
    libfolder: SteamLibrary,
    chosenEdition: ChosenEdition,
): string | null {
    if (!Object.keys(libfolder.apps).includes(chosenEdition.appid)) return null;
    let sourcePath = path.join(
        libfolder.path,
        "steamapps",
        "common",
        chosenEdition.folder,
    );
    // can't use IPCHandlers.js:validateDeltarune because of circular dep
    return existsSync(sourcePath) ? sourcePath : null;
}

export function findGame(
    state: any,
    chosenEdition: ChosenEdition,
    dialog: Dialog,
): string | null {
    state.STEAM_BASE = getSteamDirectory(dialog);
    let libfolders = readFileSync(
        path.join(state.STEAM_BASE, "/../libraryfolders.vdf"),
        { encoding: "utf-8" },
    );
    let vvv: Record<string, SteamLibrary> =
        kvparser.parse(libfolders).libraryfolders;
    const libfolder = Object.values(vvv)
        .map((libfolder) => tryGameDir(libfolder, chosenEdition))
        .find((x) => !!x);
    return libfolder ? libfolder : null;
}
