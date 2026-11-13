const path = require("path");

const SRC_DIR = __dirname;
const DELTAMOD_DIR = path.dirname(SRC_DIR);
const PACKAGE_JSON = path.join(DELTAMOD_DIR, "package.json");
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
