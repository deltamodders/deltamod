const console = require('./Console');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dialog } = require('electron');

const PATCHER_PATH = path.join(__dirname, '..', 'tools', 'G3MTool.exe');

async function g3mtool(callback, ...args) {
    console.log('Running G3MTool with args: G3MTool', args.join(' '));
    return new Promise((resolve, reject) => {
        const g3mtoolProcess = spawn(PATCHER_PATH, args, { stdio: 'pipe' });
        var output = '';
        g3mtoolProcess.stdout.on('data', (data) => {
            output += data.toString();
            process.stdout.write(data.toString());
        });
        g3mtoolProcess.stderr.on('data', (data) => {
            output += data.toString();
            process.stderr.write(data.toString());
        });
        g3mtoolProcess.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                dialog.showErrorBox('G3MTool Error', `G3MTool exited with code ${code}.\n\nOutput:\n${output}`);
                reject(new Error(`G3MTool exited with code ${code}`));
            }
        });
    });
}

async function startGamePatch(gamePath, modFolder, mods, logCallback) {
    function log(...args) {
        console.log(...args);
        if (logCallback) logCallback(args.join(' '));
    }

    if (!fs.existsSync(PATCHER_PATH)) {
        throw new Error('G3MTool not found in tools folder.');
    }

    var overridePatches = [];
    
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

    // Step 1: override patches
    log('Performing override patches...');

    let patchedFiles = [];

    for (const mod of moddingInfo) {
        log('Applying override patches for mod: ' + mod.meta.metadata.name);
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
        }
    }

    log('Override patches completed.');
    log('Preparing xdelta patches...');

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

    await Promise.all(Object.entries(xdeltaMap).map(async ([targetFile, patches]) => {
        log(`Applying xdelta patches for file: ${targetFile} (${patches.length} patches)`);

        var newPath = path.join(gamePath, targetFile.replace('.win','') + '-og.win');
        fs.renameSync(path.join(gamePath, targetFile), newPath);

        if (patches.length > 1) {
            log('Merging ' + patches.length + ' xdelta patches for file: ' + targetFile);
            var output = await g3mtool(log, 'patch', 'merge', newPath, ...patches.map(p => p.patch), '--apply', path.join(gamePath, targetFile));
        }
        else {
            log('Applying single xdelta patch for file: ' + targetFile);
            var output = await g3mtool(log, 'xpatch', 'apply', '"' + path.join(gamePath, targetFile) + '"', '"' + patches[0].patch + '"', '--apply', '"' + path.join(gamePath, targetFile) + '"');
        }

        log(`xdelta patches applied for file: ${targetFile}`);

        fs.renameSync(newPath, path.join(gamePath, targetFile + '.bak'));
    }));

    log('xdelta patches prepared.');
    return { patched: true, log: ''};
}

async function restore(gamePath) {
    const files = fs.readdirSync(gamePath);
    for (const file of files) {
        if (fs.statSync(path.join(gamePath, file)).isDirectory()) {
            restore(path.join(gamePath, file));
        }
        if (file.endsWith('.bak')) {
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
