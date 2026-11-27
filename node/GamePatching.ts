import { spawn, execFile } from 'child_process';
import type { SpawnOptions } from 'child_process';
import fs from 'fs';
import path from 'path';

import * as TOML from 'smol-toml';

import console from './Console';
import { TOOLS_DIR } from './Paths';
import { vpromise } from "./UtilsT/VPromise";

const EXEC_SUFFIX = process.platform === "win32" ? ".exe" : "";
const PLATFORM_SUBDIR = process.platform === "win32" ? "win" : "linux";

const G3MT_PATH = path.join(TOOLS_DIR, "g3mtool", "G3MTool" + EXEC_SUFFIX);
const UTMT_PATH = path.join(TOOLS_DIR, "utmt", PLATFORM_SUBDIR, "UndertaleModCli" + EXEC_SUFFIX);

type LogFn = (..._: any) => void;
type ToolRunErrHandle = (exit_code: number | null, output: string) => void | undefined | Error;

async function tool_run(
    command: string,
    args: string[],
    options: SpawnOptions,
    tool_name_upper: string,
    tool_name_mixed: string,
    log_fn: LogFn,
    error_fn: ToolRunErrHandle = (_a, _b) => { },
): Promise<void> {
    function default_error(exit_code: number | null, output: string): Error {
        return new Error(`${tool_name_mixed} exited with code ${exit_code}\n\nCOMMAND: ${command} ${args.join(" ")}\nOUTPUT:\n${output}`);
    }
    function mkerror(exit_code: number | null, output: string): Error {
        return error_fn(exit_code, output) || default_error(exit_code, output);
    }
    function iohandle(chunk: Buffer, outputref: { s: string; }, out: NodeJS.WriteStream, out_type: string) {
        // and pray to YHVH that this is valid UTF-8
        // TODO(fnrir): maybe decode only until the last valid UTF-8 char?
        let txt = chunk.toString();
        // commented out due to personal preference. we're already printing this
        //out.write(txt);
        // FIXME(fnrir): this might split lines longer than the IO buffer
        for (const line of txt.trimEnd().split("\n"))
            log_fn(`[${tool_name_upper}/${out_type}] ${line}`);
        outputref.s += txt;
    }
    function mkiohandle(outputref: { s: string; }, out: NodeJS.WriteStream, out_type: string): (chunk: Buffer) => void {
        return (chunk) => { iohandle(chunk, outputref, out, out_type) };
    }
    const outputref = { s: "" };
    const on_stdout = mkiohandle(outputref, process.stdout, "STDOUT");
    const on_stderr = mkiohandle(outputref, process.stderr, "STDERR");
    if (!options.stdio) options.stdio = ["ignore", "pipe", "pipe"];
    console.log(`Running ${tool_name_mixed} with args: ${command} ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
        const p = spawn(command, args, options);
        if (p.stdout) p.stdout.on('data', on_stdout);
        if (p.stderr) p.stderr.on('data', on_stderr);
        p.on('close', (exit_code) => {
            if (exit_code === 0) resolve();
            else reject(mkerror(exit_code, outputref.s));
        });
    });
}

function g3mtool(
    gamePath: string,
    args: string[],
    log_fn: LogFn,
    error_fn: ToolRunErrHandle = (_a, _b) => { },
): Promise<void> {
    return tool_run(
        G3MT_PATH,
        args,
        { cwd: gamePath },
        "G3MTOOL",
        "G3MTool",
        log_fn,
        error_fn
    );
}

function utmt(args: string[], log_fn: LogFn): Promise<void> {
    const tool_bin = UTMT_PATH;
    return tool_run(
        tool_bin,
        args,
        { cwd: path.dirname(tool_bin) },
        "UTMT",
        "UndertaleModCli",
        log_fn
    );
}

function apply_prebuilt_merge(callback: LogFn, newp: string, patches: { patch: string; }[], gamePath: string, targetFile: string): Promise<void> {
    function merge_error(_exit_code: number | null, output: string): undefined | Error {
        if (output.includes('normally this indicates that the source file is incorrect'))
            return new Error('This mod can\'t be merged due to an xdelta being applied to the wrong source file. Please make sure your mods are compatible with your install.');
    }
    return g3mtool(
        gamePath,
        ['patch', 'merge', newp, ...patches.map(p => p.patch), '--properties', '-a', path.join(gamePath, targetFile)],
        callback,
        merge_error
    );
}

function apply_prebuilt_as_is(callback: LogFn, relativeBackupFile: string, relativeTargetFile: string, patches: { patch: string; }[], gamePath: string): Promise<void> {
    return g3mtool(
        gamePath,
        ['patch', 'apply', relativeBackupFile, patches[0].patch, relativeTargetFile],
        callback
    );
}

function apply_script(callback: LogFn, backupPath: string, targetPath: string, patchPath: string): Promise<void> {
    return utmt(
        ['load', backupPath, '--output', targetPath, '--scripts', patchPath, '--overwrite'],
        callback
    );
}

function safeReadFileSync(filePath: string, encoding: BufferEncoding): string | null {
    try {
        return fs.readFileSync(filePath, encoding);
    } catch (err) {
        return null;
    }
}

// u+x (user executable bit)
const MODE_USER_EXEC = 0o100;

/**
 * Make a file executable by the user, if not already exec
 */
function maybeChmodExec(path: string) {
    if (process.platform !== 'linux') return;
    const mode = fs.statSync(path).mode;
    if (mode & MODE_USER_EXEC) return;
    fs.chmodSync(path, mode | MODE_USER_EXEC);
}

interface PatchInfo {
    type: string;
    patch: string;
    to: string;
    modName: string;
}

interface ModInfo {
    meta: any;
    xml: string;
    folder: string;
    patches: PatchInfo[];
    uuid: string;
}

interface GamePatchStatus {
    patched: boolean;
    log: string;
    fullLog: string;
}

export async function startGamePatch(
    gamePath: string,
    modFolder: string,
    mods: string[],
    logCallback: LogFn,
): Promise<GamePatchStatus> {
    let fullLog = '';
    function log(...args: any[]) {
        console.log_internal("LOG", args, new Error().stack, 2);
        fullLog += args.join(' ') + '\n';
        if (logCallback) logCallback(args.join(' '));
    }

    if (!fs.existsSync(G3MT_PATH)) {
        throw new Error('G3MTool not found in tools folder.');
    }

    // ensure the G3MTool-linux file is executable
    maybeChmodExec(G3MT_PATH);
    maybeChmodExec(UTMT_PATH);

    var moddingInfo = (fs.readdirSync(modFolder).map(folder => {
        var moddingXML = path.join(modFolder, folder, 'modding.xml');
        if (fs.existsSync(path.join(modFolder, folder, '__variant'))) {
            var filename = fs.readFileSync(path.join(modFolder, folder, '__variant'), 'utf-8').trim();
            log(`Mod "${folder}" has a variant specified: ${filename}. Using that variant for modding.xml.`);
            moddingXML = path.join(modFolder, folder, filename);
        }

        if (!fs.existsSync(moddingXML)) {
            log(`Modding XML file not found for mod "${folder}". Skipping this mod.`);
            return null;
        }

        const meta_path = path.join(modFolder, folder, 'meta.toml');
        const deltaid_path = path.join(modFolder, folder, '__deltaID.json');

        const xml = safeReadFileSync(moddingXML, 'utf-8');
        if (xml === null) {
            console.error(`"${moddingXML}" is empty`);
            return null;
        }
        const meta_txt = safeReadFileSync(meta_path, 'utf-8');
        if (meta_txt === null) {
            console.error(`"${meta_path}" is empty`);
            return null;
        }
        const deltaid_txt = safeReadFileSync(deltaid_path, 'utf-8');
        if (deltaid_txt === null) {
            console.error(`"${deltaid_path}" is empty`);
            return null;
        }

        const meta: any = TOML.parse(meta_txt);

        return {
            meta,
            xml,
            folder: folder,
            patches: [...xml.matchAll(/<patch\s+type="([^"]+)"\s+patch="([^"]+)"\s+to="([^"]+)"\s*\/>/g)].map(match => ({
                type: match[1],
                patch: match[2],
                to: match[3],
                modName: meta.metadata.name
            })),
            uuid: JSON.parse(deltaid_txt).uniqueId
        }
    }).filter(mod => mod != null && mods.includes(mod.uuid))) as ModInfo[];

    var totalPatches = moddingInfo.length;
    var performedPatches = 0;

    var overridePatches = [];

    // Step 1: override patches
    log('Step 1: Applying override patches...');

    let patchedFiles: string[] = [];
    var performedOverridePatches = 0;

    for (const mod of moddingInfo) {
        for (const patch of mod.patches.filter(p => p.type === 'override' || p.type === 'copy')) {
            const patchPath = path.join(modFolder, mod.folder, patch.patch);
            const targetPath = path.join(gamePath, patch.to);

            if (patchedFiles.includes(targetPath)) {
                return { 
                    patched: false, 
                    log: `The file ${patch.to} has already been patched by another mod. Conflicting mods can\'t be merged. Please remove one of the conflicting mods.`,
                    fullLog: fullLog
                };
            }

            if (!fs.existsSync(patchPath)) {
                fs.writeFileSync(patchPath, ''); // Techy: fixed the below error message by MAKING the file, although since it is syncronous, IDK if it finished before the fs.copyFileSync thingy is called.
                //  return { patched: false, log: `An override patch file "${patch.patch}", indicated by mod "${patch.modName}", wasn't found. Please check the mod files.`, fullLog: fullLog };
                log(`An override patch file "${patch.patch}", indicated by mod "${patch.modName}", wasn't found. Please check the mod files.`); //Still log it
            }
            

            patchedFiles.push(targetPath);

            if (fs.existsSync(targetPath)) {
                fs.copyFileSync(targetPath, targetPath + '.bak');
            }
            else {
                if (!fs.existsSync(path.dirname(targetPath))) {
                    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                }
                fs.writeFileSync(targetPath + '.rem', "");
            }
            
            fs.copyFileSync(patchPath, targetPath);

            performedOverridePatches++;
            performedPatches++;
            log(performedOverridePatches + '/' + mod.patches.filter(p => p.type === 'override' || p.type === 'copy').length + ' override patches applied.');
        }
    }

    log('Step 1 completed.');

    let xdeltaMap: Record<string, { patch: string }[]> = {};

    for (const mod of moddingInfo) {
        for (const patch of mod.patches.filter(p => p.type === 'xdelta' || p.type === 'g3mpatch')) {
            console.log(JSON.stringify(patch));
            if (!xdeltaMap[patch.to]) {
                xdeltaMap[patch.to] = [];
            }
            xdeltaMap[patch.to].push({
                patch: path.join(modFolder, mod.folder, patch.patch)
            });
            if (!fs.existsSync(path.join(modFolder, mod.folder, patch.patch))) {
                return { patched: false, log: `A merge patch file "${patch.patch}", indicated by mod "${patch.modName}", wasn't found. Please check the mod files.`, fullLog: fullLog };
            }
        }
    }

    log('Step 2: Applying merging (xdelta + g3mpatch) patches...');

    var hasFailed = false;
    var hasFailedReason = '';

    var xdeltasMapArr = Object.entries(xdeltaMap);
    var i = -1;
    await Promise.all(xdeltasMapArr.map(async ([targetFile, patches]) => {
        var newp = path.join(gamePath, targetFile + '.bak');
        fs.copyFileSync(path.join(gamePath, targetFile), newp);

        var relativeTargetFile = path.relative(gamePath, path.join(gamePath, targetFile));
        var relativeBackupFile = path.relative(gamePath, newp);

        try {
            if (patches.length > 1) {
                var output = await apply_prebuilt_merge(log, newp, patches, gamePath, targetFile).catch(e =>  {
                    throw new Error(`Error merging patches for ${targetFile}: ${e.message}`);
                });
            }
            else {
                var output = await apply_prebuilt_as_is(log, relativeBackupFile, relativeTargetFile, patches, gamePath).catch(e =>  {
                    throw new Error(`Error applying patch for ${targetFile}: ${e.message}`);
                });
            }
        }
        catch (err: any) {
            console.error(err);
            hasFailed = true;
            hasFailedReason = err.message;
        }

        i++;
        performedPatches++;
        log((i + 1) + '/' + xdeltasMapArr.length + ' merging patches applied.');
    }));

    if (hasFailed) {
        log('Patching failed due to errors.');
        return { patched: false, log: 'Patching failed: ' + hasFailedReason, fullLog: fullLog };
    }

    log('Step 2 completed.');

    log('Step 3: Applying CSX patches...');

    let performedCsxPatches = 0;
    for (const mod of moddingInfo) {
        for (const patch of mod.patches.filter(p => p.type === 'csx')) {
            const patchPath = path.join(modFolder, mod.folder, patch.patch);
            const targetPath = path.join(gamePath, patch.to);

            if (!fs.existsSync(patchPath)) {
                return { patched: false, log: `A CSX patch file "${patch.patch}", indicated by mod "${patch.modName}", wasn't found. Please check the mod files.`, fullLog: fullLog };
            }

            if (!fs.existsSync(targetPath)) {
                return { patched: false, log: `A CSX patch target file "${patch.to}", indicated by mod "${patch.modName}", wasn't found. Please check the mod files.`, fullLog: fullLog };
            }


                var backupPath = path.join(gamePath, patch.to + '.bak');
                fs.copyFileSync(targetPath, backupPath);
                
            

            log(`Applying CSX ${patch.patch} to ${patch.to}...`);

            var output = await apply_script(log, backupPath, targetPath, patchPath).catch(e =>  {
                throw new Error(`Error applying CSX patch for ${targetPath}: ${e.message}`);
            });
            performedCsxPatches++;
        }
    }

    return { patched: true, log: '', fullLog: fullLog };
}

export async function restore(gamePath: string, reentrant: boolean = false): Promise<void> {
    if (!gamePath || !fs.existsSync(gamePath)) {
        console.log('Game path does not exist: ' + gamePath);
        return;
    }
    const files = fs.readdirSync(gamePath);
    if (!reentrant) console.log('Restoring original game files...');
    for (const file of files) {
        if (fs.statSync(path.join(gamePath, file)).isDirectory()) {
            restore(path.join(gamePath, file), true);
        }
        if (file.endsWith('.bak')) {
            console.log('Restoring file: ' + file);
            const originalFile = file.slice(0, -4);
            fs.rmSync(path.join(gamePath, originalFile), { force: true });
            fs.copyFileSync(path.join(gamePath, file), path.join(gamePath, originalFile));
        }
        if (file.endsWith('.rem')) {
            fs.rmSync(path.join(gamePath, file), { force: true });
            fs.rmSync(path.join(gamePath, file.slice(0, -4)), { force: true });
        }
    }

}

// NOTE(fnrir): this was missing. inferred from unit tests
const MERGE_FLAGS = ["--properties"];

interface ApplyStagedDeltaArgs {
    game: string;
    target: string;
    payloads: any;
    scratch: any;
    log: any;
}

/**
 * TODO(fnrir): merge duplicate functionality with `apply_*` functions
 */
async function applyStagedDelta({ game, target, payloads, scratch, log }: ApplyStagedDeltaArgs): Promise<void> {
    const input = path.join(scratch, 'delta-input');
    const output = path.join(scratch, 'delta-output');
    fs.copyFileSync(path.join(game, target), input, fs.constants.COPYFILE_EXCL);
    const args = payloads.length > 1
        ? ['patch', 'merge', input, ...payloads, ...MERGE_FLAGS, '-a', output]
        : ['patch', 'apply', input, payloads[0], output];
    try {
        await vpromise((resolve, reject) => {
            execFile(G3MT_PATH, args, { cwd: game, timeout: 600000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                try {
                    log(stdout);
                    log(stderr);
                    if (error) reject(new Error(`Delta apply/merge failed; check the mod's source version. ${error.message}\n${stderr}`));
                    else resolve();
                } catch (callbackError) {
                    reject(callbackError);
                }
            });
        });
        const stat = fs.lstatSync(output);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Unsafe delta helper output.');
        fs.renameSync(output, path.join(game, target));
    } finally {
        fs.rmSync(input, { force: true });
        fs.rmSync(output, { force: true });
    }
}

export function getStagedDeltaHelper() {
    try {
        fs.accessSync(G3MT_PATH, fs.constants.R_OK | fs.constants.X_OK);
        if (!fs.statSync(G3MT_PATH).isFile()) return undefined;
        return applyStagedDelta;
    } catch {
        return undefined;
    }
}
