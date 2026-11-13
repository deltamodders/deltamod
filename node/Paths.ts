import fs from "fs";
import path from "path";

type ProjectRoot = { dir: string; package_json: string };

function project_root_new(dir: string): ProjectRoot {
    const package_json = path.join(dir, "package.json");
    return { dir, package_json };
}

function find_root(src_dir: string): ProjectRoot {
    let res = project_root_new(src_dir);
    while (!fs.existsSync(res.package_json)) {
        res = project_root_new(path.dirname(res.dir));
    }
    return res;
}

export const SRC_DIR = __dirname;

const proj_root = find_root(SRC_DIR);
export const { dir: DELTAMOD_DIR, package_json: PACKAGE_JSON } = proj_root;

export const ASSETS_DIR = path.join(DELTAMOD_DIR, "assets");
export const TOOLS_DIR = path.join(DELTAMOD_DIR, "tools");

export const WEB_DIR = path.join(DELTAMOD_DIR, "web");
export const THEMES_DIR = path.join(WEB_DIR, "themes");
export const VIEWS_DIR = path.join(WEB_DIR, "views");
