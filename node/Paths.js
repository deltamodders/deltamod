// @ts-check

const fs = require("fs");
const path = require("path");

/** @typedef {{ dir: string, package_json: string }} ProjectRoot */

/**
 * @param {string} dir
 * @returns {ProjectRoot}
 */
function project_root_new(dir) {
    const package_json = path.join(dir, "package.json");
    return { dir, package_json };
}

/**
 * @param {string} src_dir
 * @returns {ProjectRoot}
 */
function find_root(src_dir) {
    /** @type {ProjectRoot} */
    let res = project_root_new(src_dir);
    while (!fs.existsSync(res.package_json)) {
        res = project_root_new(path.dirname(res.dir));
    }
    return res;
}

const SRC_DIR = __dirname;
const { dir: DELTAMOD_DIR, package_json: PACKAGE_JSON } = find_root(SRC_DIR);
const ASSETS_DIR = path.join(DELTAMOD_DIR, "assets");
const TOOLS_DIR = path.join(DELTAMOD_DIR, "tools");

const WEB_DIR = path.join(DELTAMOD_DIR, "web");
const THEMES_DIR = path.join(WEB_DIR, "themes");
const VIEWS_DIR = path.join(WEB_DIR, "views");

module.exports = {
    SRC_DIR,
    DELTAMOD_DIR,
    PACKAGE_JSON,
    ASSETS_DIR,
    TOOLS_DIR,
    WEB_DIR,
    THEMES_DIR,
    VIEWS_DIR,
};
