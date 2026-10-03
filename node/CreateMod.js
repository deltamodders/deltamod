const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { dialog } = require("electron");
const TOML = require("smol-toml");

const { readKVS } = require("./KeyValue");
const { generateUniqueId, getPacketDatabase } = require("./System");
const { randomString } = require("./Utils");

/**
 * @typedef {"csx" | "g3mpatch" | "xdelta" | "override"} PatchType
 * @typedef {Object} ModdingXmlEarlyEntry
 * @property {PatchType} type
 * @property {string} from
 * @property {string} to
 * @property {string | undefined} csum
 * @typedef {ModdingXmlEarlyEntry & { src_name: string }} ModdingXmlEntry
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

/**
 * @returns {string}
 * @throws {Error}
 */
function randomModId() {
    const pkg_db_path = getPacketDatabase();
    for (let i = 0; i < 100; i++) {
        const mod_id = `local.deltamod.${randomString(16)}`;
        if (!fs.existsSync(path.join(pkg_db_path, mod_id))) return mod_id;
    }
    throw new Error("Failed to create a new mod id too many times");
}

/**
 * @param {PatchType} patch_type
 * @param {string} patch_src_name
 * @param {string} patch_dst
 * @returns {string}
 */
function modding_xml_entry_to_str(patch_type, patch_src_name, patch_dst) {
    // TODO: properly excape dest path. it shouldn't contain any quotation
    // marks, but it's better to be safe than sorry
    return `<patch type="${patch_type}" patch="./${patch_src_name}" to="${patch_dst}" />`;
}

/**
 * @param {ModdingXmlEntry} patch
 * @returns {string}
 */
function modding_xml_entry_ser(patch) {
    return modding_xml_entry_to_str(patch.type, patch.src_name, patch.to);
}

/**
 * @param {ModdingXmlEntry[]} modding_data
 * @returns {string}
 */
function modding_xml_ser(modding_data) {
    return modding_data.map(modding_xml_entry_ser).join("\n") + "\n";
}

/**
 * @param {Object} meta
 * @param {ModdingXmlEntry[]} modding_data
 */
function meta_init_needed_files(meta, modding_data) {
    const needed_files = modding_data
        .filter((item) => item.csum)
        .map((item) => ({ file: item.to, checksum: item.csum }));
    if (needed_files.length > 0) meta.neededFiles = needed_files;
}

/**
 * Creates a new mod
 *
 * Implicitly transfers ownership of `meta`.
 *
 * TODO: make this atomic to avoid any issues with half-added mods
 *
 * @param {Object} meta
 * @param {ModdingXmlEarlyEntry[]} modding_data_early
 * @throws {Error}
 */
function mod_create(meta, modding_data_early) {
    for (const entry of modding_data_early)
        if (!fs.existsSync(entry.from))
            throw Error(`Specified patch file doesn't exist: ${entry.from}`);
    const modding_data = modding_data_early.map((item) => ({
        src_name: path.basename(item.from),
        ...item,
    }));
    const modding_xml_txt = modding_xml_ser(modding_data);
    meta_init_needed_files(meta, modding_data);
    const deltaid_txt = JSON.stringify({
        uniqueId: generateUniqueId(),
        validFor: os.hostname(),
        new: true,
    });
    const meta_txt = TOML.stringify(meta);
    const pkg_db_path = getPacketDatabase();
    const mod_dir = path.join(pkg_db_path, meta.metadata.packageID);
    fs.mkdirSync(mod_dir);
    fs.writeFileSync(path.join(mod_dir, "__deltaID.json"), deltaid_txt, {
        encoding: "utf8",
    });
    fs.writeFileSync(path.join(mod_dir, "modding.xml"), modding_xml_txt, {
        encoding: "utf8",
    });
    fs.writeFileSync(path.join(mod_dir, "meta.toml"), meta_txt, {
        encoding: "utf8",
    });
    for (const item of modding_data)
        fs.copyFileSync(item.from, path.join(mod_dir, item.src_name));
}

module.exports = {
    pick_src_patch_file,
    pick_patch_dest_file,
    calculate_file_hash,
    mod_create,
};
