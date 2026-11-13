import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { dialog } from "electron";
import type { BrowserWindow, FileFilter, OpenDialogOptions } from "electron";
import * as TOML from "smol-toml";

import { readKVS } from "./KeyValue";
import { generateUniqueId, getPacketDatabase } from "./System";
import { randomString } from "./Utils";

type PatchType = "csx" | "g3mpatch" | "xdelta" | "override";

interface ModdingXmlEarlyEntry {
    type: PatchType;
    from: string;
    to: string;
    csum: string | undefined;
}

type ModdingXmlEntry = ModdingXmlEarlyEntry & { src_name: string };

const CSX_SCRIPT_FILE: FileFilter = {
    name: "C# script file",
    extensions: ["csx"],
};
const G3M_PATCH_FILE: FileFilter = {
    name: "G3M patch file",
    extensions: ["xdelta"],
};
const XDELTA_PATCH_FILE: FileFilter = {
    name: "XDelta patch file",
    extensions: ["xdelta"],
};
const GM_DATA_FILE: FileFilter = {
    name: "GameMaker data file",
    extensions: ["unx", "win"],
};

function prepend_dotslash(path: string): string {
    // patchers don't seem to normalize the path, so we have to add a ./
    // since most mods use that
    return path.startsWith("./") ? path : `./${path}`;
}

function strip_dotslash(path: string): string {
    return path.startsWith("./") ? path.slice(2, path.length) : path;
}

function openFileDialog(
    win: BrowserWindow,
    filters: FileFilter[] | null,
    extra_options: OpenDialogOptions | null = {},
): string | null {
    /**
     * Why tf does electron always default to ~/Downloads instead of
     * letting the file picker remember the last path?
     */
    let options: OpenDialogOptions = { properties: ["openFile"] };
    if (filters) options.filters = filters;
    if (extra_options) Object.assign(options, extra_options);
    const res = dialog.showOpenDialogSync(win, options);
    return res ? res[0] : null;
}

export function pick_src_patch_file(
    win: BrowserWindow,
    patch_type: PatchType,
): string | null {
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

export function pick_patch_dest_file(
    win: BrowserWindow,
    patch_type: PatchType,
): string | null {
    const filters = [];
    switch (patch_type) {
        case "csx":
            filters.push(GM_DATA_FILE);
            break;
        case "g3mpatch":
            filters.push(GM_DATA_FILE);
            break;
    }
    const installPath = readKVS<string>("gamePath")!;
    const game_file_path = openFileDialog(win, filters, {
        defaultPath: installPath,
    });
    if (!game_file_path) return null;
    return prepend_dotslash(path.relative(installPath, game_file_path));
}

export function calculate_file_hash(file_path: string): string {
    const installPath = readKVS<string>("gamePath")!;
    const abs_file_path = path.join(installPath, strip_dotslash(file_path));
    const fileBuffer = fs.readFileSync(abs_file_path);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

function randomModId(): string {
    const pkg_db_path = getPacketDatabase();
    for (let i = 0; i < 100; i++) {
        const mod_id = `local.deltamod.${randomString(16)}`;
        if (!fs.existsSync(path.join(pkg_db_path, mod_id))) return mod_id;
    }
    throw new Error("Failed to create a new mod id too many times");
}

function modding_xml_entry_to_str(
    patch_type: PatchType,
    patch_src_name: string,
    patch_dst: string,
): string {
    // TODO: properly excape dest path. it shouldn't contain any quotation
    // marks, but it's better to be safe than sorry
    return `<patch type="${patch_type}" patch="./${patch_src_name}" to="${patch_dst}" />`;
}

function modding_xml_entry_ser(patch: ModdingXmlEntry): string {
    return modding_xml_entry_to_str(patch.type, patch.src_name, patch.to);
}

function modding_xml_ser(modding_data: ModdingXmlEntry[]): string {
    return modding_data.map(modding_xml_entry_ser).join("\n") + "\n";
}

interface MetadataPartial {
    metadata: { packageID: string };
    neededFiles: { file: string; checksum: string | undefined }[];
}

function meta_init_needed_files(
    meta: MetadataPartial,
    modding_data: ModdingXmlEntry[],
) {
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
 */
export function mod_create(
    meta: MetadataPartial,
    modding_data_early: ModdingXmlEarlyEntry[],
) {
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
