// @ts-check

const { readFileSync, existsSync } = require('fs');
const path = require('path');

const kvparser = require('kvparser');
const { getSteamDirectory } = require('../Utils');

/**
 * @typedef SteamLibrary
 * @property {string} path
 * @property {Object<string, string>} apps
 */

 /**
  * @typedef ChosenEdition
  * @property {string} folder
  * @property {string} appid
  */

/**
 * @param {SteamLibrary} libfolder
 * @param {ChosenEdition} chosenEdition
 * @returns {string?}
 */
function tryGameDir(libfolder, chosenEdition) {
    if (!Object.keys(libfolder.apps).includes(chosenEdition.appid))
        return null;
    let sourcePath = path.join(libfolder.path, "steamapps", "common", chosenEdition.folder);
    // can't use IPCHandlers.js:validateDeltarune because of circular dep
    return existsSync(sourcePath) ? sourcePath : null;
}

/**
 * @param {*} state
 * @param {ChosenEdition} chosenEdition
 * @param {Electron.Dialog} dialog
 * @returns {string?}
 */
function findGame(state, chosenEdition, dialog) {
    state.STEAM_BASE = getSteamDirectory(dialog);
    let libfolders = readFileSync(path.join(state.STEAM_BASE, "/../libraryfolders.vdf"), { encoding: "utf-8" });
    /** @type Record<string, SteamLibrary> */
    let vvv = kvparser.parse(libfolders).libraryfolders;
    const libfolder = Object.values(vvv).map(libfolder => tryGameDir(libfolder, chosenEdition)).find(x => !!x);
    return libfolder ? libfolder : null;
}

module.exports = {
    findGame
};
