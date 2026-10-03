const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { dialog } = require("electron");

const { readKVS } = require("./KeyValue");

/**
 * @typedef {"csx" | "g3mpatch" | "xdelta" | "override"} PatchType
 */

/**
 * @type {Electron.FileFilter}
 */
const CSX_SCRIPT_FILE = { name: "C# script file", extensions: ["csx"] };
/**
 * @type {Electron.FileFilter}
 */
const G3M_PATCH_FILE = { name: "G3M patch file", extensions: ["xdelta"] };
/**
 * @type {Electron.FileFilter}
 */
const XDELTA_PATCH_FILE = { name: "XDelta patch file", extensions: ["xdelta"] };
/**
 * @type {Electron.FileFilter}
 */
const GM_DATA_FILE = {
    name: "GameMaker data file",
    extensions: ["unx", "win"],
};

/**
 * @param {string} path
 * @returns {string}
 */
function prepend_dotslash(path) {
    // patchers don't seem to normalize the path, so we have to add a ./
    // since most mods use that
    return path.startsWith("./") ? path : `./${path}`;
}

/**
 * @param {string} path
 * @returns {string}
 */
function strip_dotslash(path) {
    return path.startsWith("./") ? path.slice(2, path.length) : path;
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {Electron.FileFilter[]?} filters
 * @param {Electron.OpenDialogOptions?} extra_options
 * @returns {string?}
 */
function openFileDialog(win, filters, extra_options = {}) {
    /**
     * Why tf does electron always default to ~/Downloads instead of
     * letting the file picker remember the last path?
     * @type {Electron.OpenDialogOptions}
     */
    let options = { properties: ["openFile"] };
    if (filters) options.filters = filters;
    if (extra_options) Object.assign(options, extra_options);
    const res = dialog.showOpenDialogSync(win, options);
    return res ? res[0] : null;
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {PatchType} patch_type
 * @returns {string?}
 */
function pick_src_patch_file(win, patch_type) {
    /**
     * @type {Electron.FileFilter[]}
     */
    const filters = [];
    switch (patch_type) {
        case "csx":
            filters.push(CSX_SCRIPT_FILE);
            break;
        case "g3mpatch":
            filters.push(G3M_PATCH_FILE);
            break;
        case "xdelta":
            filters.push(XDELTA_PATCH_FILE);
            break;
    }
    return openFileDialog(win, filters);
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {PatchType} patch_type
 * @returns {string?}
 */
function pick_patch_dest_file(win, patch_type) {
    /**
     * @type {Electron.FileFilter[]}
     */
    const filters = [];
    switch (patch_type) {
        case "csx":
            filters.push(GM_DATA_FILE);
            break;
        case "g3mpatch":
            filters.push(GM_DATA_FILE);
            break;
    }
    const installPath = readKVS("gamePath");
    const game_file_path = openFileDialog(win, filters, {
        defaultPath: installPath,
    });
    if (!game_file_path) return null;
    return prepend_dotslash(path.relative(installPath, game_file_path));
}

/**
 * @param {string} file_path
 * @returns {string}
 */
function calculate_file_hash(file_path) {
    const installPath = readKVS("gamePath");
    const abs_file_path = path.join(installPath, strip_dotslash(file_path));
    const fileBuffer = fs.readFileSync(abs_file_path);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

module.exports = {
    pick_src_patch_file,
    pick_patch_dest_file,
    calculate_file_hash,
};
