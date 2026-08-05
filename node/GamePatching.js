const console = require('./Console');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { dialog } = require('electron');
const TOML = require('js-toml');
const pty = require('node-pty');

const PATCHER_PATH = process.platform == 'win32' ? path.join(__dirname, '../', 'tools', 'g3mtool', 'g3mtool-win.exe') : path.join(__dirname, '../', 'tools', 'g3mtool', 'g3mtool-lin');
const UTMT_PATH = process.platform == 'win32' ? path.join(__dirname, '../', 'tools', 'utmt', 'win', 'UndertaleModCli.exe') : path.join(__dirname, '../', 'tools', 'utmt', 'linux', 'UndertaleModCli');

async function g3mtool(callback, args, gamePath) {
    console.log('Running G3MTool with args: G3MTool', args.join(' '));
    return new Promise((resolve, reject) => {
        const g3mtoolProcess = spawn(PATCHER_PATH, args, { stdio: 'inherit', cwd: gamePath });
        var output = '';
        g3mtoolProcess.stdout.on('data', (data) => {
            output += data.toString();
            process.stdout.write(data.toString());
            callback("[G3MTOOL] " + data.toString());
        });
        g3mtoolProcess.stderr.on('data', (data) => {
            output += data.toString();
            process.stderr.write(data.toString());
            callback("[G3MTOOL/STDERR] " + data.toString());
        });
        g3mtoolProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                if (output.includes('normally this indicates that the source file is incorrect')) {
                    reject(new Error('This mod can\'t be merged due to an xdelta being applied to the wrong source file. Please make sure your mods are compatible with your install.'));
                    return;
                }
                reject(new Error(`G3MTool exited with code ${code}\n\nCOMMAND: ${PATCHER_PATH} ${args.join(' ')}\nOUTPUT:\n${output}`));
            }
        });
    });
}

async function utmt(callback, args) {
    console.log('Running UndertaleModCli with args: UndertaleModCli', args.map(x => '"' + x + '"').join(' '));
    return new Promise((resolve, reject) => {
        const ptyProcess = pty.spawn(UTMT_PATH, args, { cwd: path.dirname(UTMT_PATH) });
        let output = '';
        
        ptyProcess.on('data', (data) => {
            var dataStr = data.toString();
            dataStr = dataStr.replace(/\x1B\[[0-9;]*m/g, '').trim();
            if (dataStr.length == 0) return;
            output += dataStr;
            process.stdout.write(dataStr);
            callback("[UTMT] " + dataStr);
        });
        
        ptyProcess.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`UndertaleModCli exited with code ${code}\n\nCOMMAND: ${UTMT_PATH} ${args.join(' ')}\nOUTPUT:\n${output}`));
            }
        });
        
        ptyProcess.on('error', (error) => {
            reject(error);
        });
    });
}

function safeReadFileSync(filePath, encoding) {
    try {
        return fs.readFileSync(filePath, encoding);
    } catch (err) {
        return null;
    }
}

async function startGamePatch(gamePath, modFolder, mods, logCallback, progressCallback) {
    let fullLog = '';
    function log(...args) {
        console.log(...args);
        fullLog += args.join(' ') + '\n';
        if (logCallback) logCallback(args.join(' '));
    }

    if (!fs.existsSync(PATCHER_PATH)) {
        throw new Error('G3MTool not found in tools folder.');
    }

    if (process.platform === 'linux') {
        // ensure the G3MTool-linux file is executable
        fs.chmodSync(PATCHER_PATH, 0o755);
    }
    
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
        const meta = TOML.load(safeReadFileSync(path.join(modFolder, folder, 'meta.toml'), 'utf-8'));

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
                return { patched: false, log: `An override patch file "${patch.patch}", indicated by mod "${patch.modName}", wasn't found. Please check the mod files.`, fullLog: fullLog };
            }

            patchedFiles.push(targetPath);

            if (fs.existsSync(targetPath)) {
                fs.renameSync(targetPath, targetPath + '.bak');
            }
            else {
                fs.writeFileSync(targetPath + '.rem', "");
            }
            
            fs.copyFileSync(patchPath, targetPath);

            performedOverridePatches++;
            performedPatches++;
            log(performedOverridePatches + '/' + mod.patches.filter(p => p.type === 'override' || p.type === 'copy').length + ' override patches applied.');

            progressCallback(performedPatches / totalPatches * 100);
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
        fs.renameSync(path.join(gamePath, targetFile), newp);

        var relativeTargetFile = path.relative(gamePath, path.join(gamePath, targetFile));
        var relativeBackupFile = path.relative(gamePath, newp);

        try {
            if (patches.length > 1) {
                var output = await g3mtool(log, ['patch', 'merge', newp, ...patches.map(p => p.patch), '-a', path.join(gamePath, targetFile)], gamePath).catch(e =>  {
                    throw new Error(`Error merging patches for ${targetFile}: ${e.message}`);
                });
            }
            else {
                var output = await g3mtool(log, ['patch', 'apply', relativeBackupFile, patches[0].patch, relativeTargetFile], gamePath).catch(e =>  {
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

        progressCallback(performedPatches / totalPatches * 100);
    }));

    if (hasFailed) {
        log('Patching failed due to errors.');
        return { patched: false, log: 'Patching failed: ' + hasFailedReason, fullLog: fullLog };
    }

    log('Step 2 completed.');

    log('Step 3: Applying CSX patches...');

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

            var backupPath = targetPath + '.bak';
            if (!fs.existsSync(backupPath)) {
                fs.renameSync(targetPath, backupPath);
            }

            log(`Applying CSX ${patch.patch} to ${patch.to}...`);

            var output = await utmt(log, ['load', backupPath, '--output', targetPath, '--scripts', patchPath], gamePath).catch(e =>  {
                throw new Error(`Error applying CSX patch for ${targetPath}: ${e.message}`);
            });
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
            fs.renameSync(path.join(gamePath, file), path.join(gamePath, originalFile));
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
