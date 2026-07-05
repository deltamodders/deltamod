const console = require('./Console');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dialog } = require('electron');

const PATCHER_PATH = path.join(__dirname, '..', 'tools', 'g3mtool', 'G3MTool.exe');

async function g3mtool(callback, args, gamePath) {
    console.log('Running G3MTool with args: G3MTool', args.join(' '));
    return new Promise((resolve, reject) => {
        const g3mtoolProcess = spawn(PATCHER_PATH, args, { stdio: 'pipe', cwd: gamePath });
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
                dialog.showErrorBox('G3MTool Error', `G3MTool exited with code ${code}.\nCommand: ${PATCHER_PATH} ${args.join(' ')}\nOutput:\n${output}`);
                reject(new Error(`G3MTool exited with code ${code}`));
            }
        });
    });
}

async function startGamePatch(gamePath, modFolder, mods, logCallback, progressCallback) {
    function log(...args) {
        console.log(...args);
        if (logCallback) logCallback(args.join(' '));
    }

    if (!fs.existsSync(PATCHER_PATH)) {
        throw new Error('G3MTool not found in tools folder.');
    }
    
    var moddingInfo = fs.readdirSync(modFolder).map(folder => {
        const xml = fs.readFileSync(path.join(modFolder, folder, 'modding.xml'), 'utf-8');

        return {
            meta: JSON.parse(fs.readFileSync(path.join(modFolder, folder, 'meta.json'))),
            xml,
            folder: folder,
            patches: [...xml.matchAll(/<patch\s+type="([^"]+)"\s+patch="([^"]+)"\s+to="([^"]+)"\s*\/>/g)].map(match => ({
                type: match[1],
                patch: match[2],
                to: match[3]
            })),
            uuid: JSON.parse(fs.readFileSync(path.join(modFolder, folder, '__deltaID.json'))).uniqueId
        }
    }).filter(mod => mods.includes(mod.uuid));

    var totalPatches = moddingInfo.length;
    var performedPatches = 0;

    var overridePatches = [];

    // Step 1: override patches
    log('Step 1: Applying override patches...');

    let patchedFiles = [];
    var performedOverridePatches = 0;

    for (const mod of moddingInfo) {
        for (const patch of mod.patches.filter(p => p.type === 'override')) {
            const patchPath = path.join(modFolder, mod.folder, patch.patch);
            const targetPath = path.join(gamePath, patch.to);

            if (patchedFiles.includes(targetPath)) {
                dialog.showErrorBox('Patch Error', `Found a conflict on file ${patch.to} between mods. Please remove one of the conflicting mods.`);
                return { patched: false, log: `The file ${patch.to} has already been patched by another mod. Please remove one of the conflicting mods.`};
            }

            patchedFiles.push(targetPath);

            fs.renameSync(targetPath, targetPath + '.bak');
            fs.copyFileSync(patchPath, targetPath);

            performedOverridePatches++;
            performedPatches++;
            log(performedOverridePatches + '/' + mod.patches.filter(p => p.type === 'override').length + ' override patches applied.');

            progressCallback(performedPatches / totalPatches * 100);
        }
    }

    log('Step 1 completed.');

    let xdeltaMap = {};

    for (const mod of moddingInfo) {
        for (const patch of mod.patches.filter(p => p.type === 'xdelta')) {
            if (!xdeltaMap[patch.to]) {
                xdeltaMap[patch.to] = [];
            }
            xdeltaMap[patch.to].push({
                patch: path.join(modFolder, mod.folder, patch.patch)
            });
        }
    }

    log('Step 2: Applying xdelta patches...');

    var xdeltasMapArr = Object.entries(xdeltaMap);
    var i = -1;
    await Promise.all(xdeltasMapArr.map(async ([targetFile, patches]) => {
        var newp = path.join(gamePath, targetFile + '.bak');
        fs.renameSync(path.join(gamePath, targetFile), newp);

        var relativeTargetFile = path.relative(gamePath, path.join(gamePath, targetFile));
        var relativeBackupFile = path.relative(gamePath, newp);

        if (patches.length > 1) {
            var output = await g3mtool(log, ['patch', 'merge', newp, ...patches.map(p => p.patch), path.join(gamePath, targetFile)], gamePath);
        }
        else {
            var output = await g3mtool(log, ['patch', 'apply', relativeBackupFile, patches[0].patch, relativeTargetFile], gamePath);
        }

        i++;
        performedPatches++;
        log((i + 1) + '/' + xdeltasMapArr.length + ' xdelta patches applied.');

        progressCallback(performedPatches / totalPatches * 100);
    }));

    log('Step 2 completed.');
    return { patched: true, log: ''};
}

async function restore(gamePath) {
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
        if (file.endsWith('-og.win')) {
            const originalFile = file.slice(0, -7) + '.win';
            fs.rmSync(path.join(gamePath, originalFile), { force: true });
            fs.renameSync(path.join(gamePath, file), path.join(gamePath, originalFile));
        }
    }

}

module.exports = {
    startGamePatch,
    restore
};
