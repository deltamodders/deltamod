const console = require('./Console');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { dialog } = require('electron');
const TOML = require('smol-toml');

const { get_tools } = require('./GamePatchingTools');

/**
 * @typedef {import('./GamePatchingTools').ToolOverrides} ToolOverrides
 * @typedef {(..._a: any) => void} LogFn
 * @callback ToolRunErrHandle
 * @param {number} exit_code
 * @param {string} output
 * @returns {void | Error?}
 */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {import('child_process').SpawnOptions} options
 * @param {string} tool_name_upper
 * @param {string} tool_name_mixed
 * @param {LogFn} log_fn
 * @param {ToolRunErrHandle} error_fn
 * @returns {Promise<void>}
 */
async function tool_run(command, args, options, tool_name_upper, tool_name_mixed, log_fn, error_fn = (_a, _b) => {}) {
    /**
     * @param {number} exit_code
     * @param {string} output
     * @returns {Error}
     */
    function default_error(exit_code, output) {
        return new Error(`${tool_name_mixed} exited with code ${exit_code}\n\nCOMMAND: ${command} ${args.join(" ")}\nOUTPUT:\n${output}`);
    }
    /**
     * @param {number} exit_code
     * @param {string} output
     * @returns {Error}
     */
    function mkerror(exit_code, output) {
        return error_fn(exit_code, output) || default_error(exit_code, output);
    }
    /**
     * @param {Buffer} chunk
     * @param {{ s: string }} outputref
     * @param {NodeJS.WriteStream} out
     * @param {string} out_type
     */
    function iohandle(chunk, outputref, out, out_type) {
        // and pray to YHVH that this is valid UTF-8
        // TODO(fnrir): maybe decode only until the last valid UTF-8 char?
        let txt = chunk.toString();
        //out.write(txt);
        // TODO(fnrir): a single chunk is not always a single line. split it
        log_fn(`[${tool_name_upper}/${out_type}] ${encodeURI(txt)}`);
        outputref.s += txt;
    }
    /**
     * @param {{ s: string }} outputref
     * @param {NodeJS.WriteStream} out
     * @param {string} out_type
     * @returns {(chunk: Buffer) => void}
     */
    function mkiohandle(outputref, out, out_type) {
        return (chunk) => { iohandle(chunk, outputref, out, out_type) };
    }
    const outputref = { s: "" };
    const on_stdout = mkiohandle(outputref, process.stdout, "STDOUT");
    const on_stderr = mkiohandle(outputref, process.stderr, "STDERR");
    if (!options.stdio) options.stdio = ["ignore", "pipe", "pipe"];
    console.log(`Running ${tool_name_mixed} with args: ${command} ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
        const p = spawn(command, args, options);
        p.stdout.on('data', on_stdout);
        p.stderr.on('data', on_stderr);
        p.on('close', (exit_code) => {
            if (exit_code === 0) resolve();
            else reject(mkerror(exit_code, outputref.s));
        });
    });
}

/**
 * @param {ToolOverrides} tool_bins
 * @param {string} gamePath
 * @param {string[]} args
 * @param {LogFn} log_fn
 * @param {ToolRunErrHandle} error_fn
 * @returns {Promise<void>}
 */
function g3mtool(tool_bins, gamePath, args, log_fn, error_fn = (_a, _b) => {}) {
    return tool_run(
        tool_bins.g3mtool,
        args,
        { cwd: gamePath },
        "G3MTOOL",
        "G3MTool",
        log_fn,
        error_fn
    );
}

/**
 * @param {ToolOverrides} tool_bins
 * @param {string[]} args
 * @param {LogFn} log_fn
 * @returns {Promise<void>}
 */
function utmt(tool_bins, args, log_fn) {
    const tool_bin = tool_bins.utmt;
    return tool_run(
        tool_bin,
        args,
        { cwd: path.dirname(tool_bin) },
        "UTMT",
        "UndertaleModCli",
        log_fn
    );
}

function apply_prebuilt_merge(callback, newp, patches, gamePath, targetFile, tool_bins) {
    function merge_error(_exit_code, output) {
        if (output.includes('normally this indicates that the source file is incorrect'))
            return new Error('This mod can\'t be merged due to an xdelta being applied to the wrong source file. Please make sure your mods are compatible with your install.');
    }
    return g3mtool(
        tool_bins,
        gamePath,
        ['patch', 'merge', newp, ...patches.map(p => p.patch), '-a', path.join(gamePath, targetFile)],
        callback,
        merge_error
    );
}

function apply_prebuilt_as_is(callback, relativeBackupFile, relativeTargetFile, patches, gamePath, tool_bins) {
    return g3mtool(
        tool_bins,
        gamePath,
        ['patch', 'apply', relativeBackupFile, patches[0].patch, relativeTargetFile],
        callback
    );
}

function apply_script(callback, backupPath, targetPath, patchPath, tool_bins) {
    return utmt(
        tool_bins,
        ['load', backupPath, '--output', targetPath, '--scripts', patchPath, '--overwrite'],
        callback
    );
}

function safeReadFileSync(filePath, encoding) {
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
 * @param {string} path
 */
function maybeChmodExec(path) {
    if (process.platform !== 'linux') return;
    const mode = fs.statSync(path).mode;
    if (mode & MODE_USER_EXEC) return;
    fs.chmodSync(path, mode | MODE_USER_EXEC);
}

async function startGamePatch(gamePath, modFolder, mods, logCallback) {
    let fullLog = '';
    function log(...args) {
        console.log(...args);
        fullLog += args.join(' ') + '\n';
        if (logCallback) logCallback(args.join(' '));
    }

    const tool_bins = get_tools();

    if (!fs.existsSync(tool_bins.g3mtool)) {
        throw new Error('G3MTool not found in tools folder.');
    }

    // ensure the G3MTool-linux file is executable
    Object.values(tool_bins).forEach(maybeChmodExec);
    
    var moddingInfo = fs.readdirSync(modFolder).map(folder => {
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

        const xml = safeReadFileSync(moddingXML, 'utf-8');
        const meta = TOML.parse(safeReadFileSync(path.join(modFolder, folder, 'meta.toml'), 'utf-8'));

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
            uuid: JSON.parse(safeReadFileSync(path.join(modFolder, folder, '__deltaID.json'), 'utf-8')).uniqueId
        }
    }).filter(mod => mod != null && mods.includes(mod.uuid));

    var totalPatches = moddingInfo.length;
    var performedPatches = 0;

    var overridePatches = [];

    // Step 1: override patches
    log('Step 1: Applying override patches...');

    let patchedFiles = [];
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

    let xdeltaMap = {};

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
                var output = await apply_prebuilt_merge(log, newp, patches, gamePath, targetFile, tool_bins).catch(e =>  {
                    throw new Error(`Error merging patches for ${targetFile}: ${e.message}`);
                });
            }
            else {
                var output = await apply_prebuilt_as_is(log, relativeBackupFile, relativeTargetFile, patches, gamePath, tool_bins).catch(e =>  {
                    throw new Error(`Error applying patch for ${targetFile}: ${e.message}`);
                });
            }
        }
        catch (err) {
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

            var output = await apply_script(log, backupPath, targetPath, patchPath, tool_bins).catch(e =>  {
                throw new Error(`Error applying CSX patch for ${targetPath}: ${e.message}`);
            });
            performedCsxPatches++;
        }
    }

    return { patched: true, log: '', fullLog: fullLog };
}

async function restore(gamePath) {
    if (!gamePath || !fs.existsSync(gamePath)) {
        console.log('Game path does not exist: ' + gamePath);
        return;
    }
    const files = fs.readdirSync(gamePath);
    console.log('Restoring original game files...');
    for (const file of files) {
        if (fs.statSync(path.join(gamePath, file)).isDirectory()) {
            restore(path.join(gamePath, file));
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

module.exports = {
    startGamePatch,
    restore
};
