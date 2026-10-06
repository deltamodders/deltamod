const fs = require("fs");
const path = require("path");

const { getSystemFile } = require("./System");

const BUILTIN_TOOLS_DIR = path.join(path.dirname(__dirname), "tools");

const EXEC_SUFFIX = process.platform === "win32" ? ".exe" : "";
const PLATFORM_SUBDIR = process.platform === "win32" ? "win" : "linux";

/**
 * @typedef {"g3mtool" | "utmt"} Tool
 * @typedef {Record<Tool, string>} Tools
 * @typedef {Partial<Tools>} ToolOverrides
 */

/**
 * @type {Tools}
 */
const BUILTIN_TOOLS = {
    g3mtool: "G3MTool",
    utmt: path.join(PLATFORM_SUBDIR, "UndertaleModCli"),
};
/**
 * @type {Tool[]}
 *
 * jsdoc is being stubborn about this
 */
const TOOL_KEYS = ["g3mtool", "utmt"];

/**
 * @param {Tool} tool
 * @returns {string}
 */
function get_builtin_tool(tool) {
    return path.join(
        BUILTIN_TOOLS_DIR,
        tool,
        BUILTIN_TOOLS[tool] + EXEC_SUFFIX,
    );
}

/**
 * @returns {ToolOverrides}
 */
function get_tool_overrides() {
    const tool_overrides_path = getSystemFile("tool_overrides.json", true);
    let data_json;
    try {
        data_json = fs.readFileSync(tool_overrides_path, "utf8");
    } catch {
        return {};
    }
    return JSON.parse(data_json);
}

/**
 * @param {ToolOverrides} overrides
 */
function write_tool_overrides(overrides) {
    const tool_overrides_path = getSystemFile("tool_overrides.json", true);
    const data_json = JSON.stringify(overrides);
    fs.mkdirSync(path.dirname(tool_overrides_path), { recursive: true });
    fs.writeFileSync(tool_overrides_path, data_json);
}

/**
 * @param {Tool} tool
 * @returns {string}
 */
function get_tool(tool) {
    return get_tool_overrides()[tool] || get_builtin_tool(tool);
}

/**
 * @param {Tool} tool
 * @returns {string}
 */
function get_tool(tool) {
    return get_tool_overrides()[tool] || get_builtin_tool(tool);
}

/**
 * @returns {Tools}
 */
function get_tools() {
    const overrides = get_tool_overrides();
    /**
     * @param {Tool} tool
     * @returns {string}
     */
    const get_tool_x = (tool) => overrides[tool] || get_builtin_tool(tool);
    const res = TOOL_KEYS.map((tool) => [tool, get_tool_x(tool)]);
    return Object.fromEntries(res);
}

/**
 * @param {ToolOverrides} overrides
 */
function set_tool_overrides(overrides) {
    const current = get_tool_overrides();
    for (const k in overrides) {
        const v = overrides[k];
        if (v) current[k] = v;
        else delete current[k];
    }
    write_tool_overrides(current);
}

module.exports = {
    get_tool,
    get_tool_overrides,
    get_tools,
    set_tool_overrides,
};
