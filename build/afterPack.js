/**
 * @import {AfterPackContext} from "electron-builder"
 */

import fs from "fs";
import path from "path";

import { DELTAMOD_DIR, TOOLS_DIR } from "../dist/node/Paths";

/**
 * @param {AfterPackContext} ctx
 */
export default function (ctx) {
    if (!fs.existsSync(TOOLS_DIR)) {
        process.stderr.write("CI WORKAROUND: building a non-functional version of Deltamod.");
        return;
    }
    /**
     * @param {...string} paths
     */
    const distAddTool = (...paths) => {
        const subpath = path.join("tools", ...paths);
        const src = path.join(DELTAMOD_DIR, subpath);
        const dst = path.join(ctx.appOutDir, "resources", "app", subpath);
        fs.cpSync(src, dst, { recursive: true });
    };
    const EXEC_SUFFIX = ctx.electronPlatformName === "win32" ? ".exe" : "";
    const PLATFORM_SUBDIR = ctx.electronPlatformName === "win32" ? "win" : "linux";
    for (const filename of ["G3MTool" + EXEC_SUFFIX, "licenses", "LICENSE", "THIRD_PARTY_NOTICES.md"])
        distAddTool("g3mtool", filename);
    distAddTool("utmt", PLATFORM_SUBDIR);
    distAddTool("cmodeutil.exe");
}
