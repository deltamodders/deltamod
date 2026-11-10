// Native dialogs for Proton and Steam-managed profiles: runtime choice during
// import, launch confirmations, Steam Launch Options management and removal.
const { app, dialog, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const ProtonStaging = require('./ProtonStaging');
const { validateRuntime } = require('./ProtonLauncher');
const { selectRuntime, selectProton, discoverSteamGame } = require('./ProtonSetup');
const SteamBridge = require('./ProtonSteamBridge');
const { durablePath } = require('./ProtonSteamOptions');
const { createProgressModal } = require('./ProgressModal');

const RUNTIME_CHOICE = { umu: 0, legacy: 1, cancel: 2, steam: 3 };

async function confirmSteamAccount(binding) {
    const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Confirm active Steam account',
        message: `Steam must already be open and signed into account ${binding.account}, with this game closed. Deltamod cannot verify Steam's active login. Do not switch accounts during this launch. A different account may lack this hook and launch vanilla instead. This mode shares normal saves and Steam Cloud data.`,
        buttons: [`Launch with account ${binding.account}`, 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    return result.response === 0;
}

function confirmManualSteam(command) {
    const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Manual setup for complex Launch Options',
        message: `Deltamod cannot safely rewrite this command. To continue, replace its one %command% with the following text, keeping any wrappers before the hook:\n\n${command}\n\nYou are responsible for the surrounding shell command. Deltamod will not evaluate it. Copy the hook, edit this game's Launch Options in Steam, then fully exit Steam again before verification.`,
        buttons: ['Copy hook and continue', 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    if (choice !== 0) return false;

    clipboard.writeText(command);
    const verify = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Verify manual Steam setup',
        message: 'After updating Launch Options for the confirmed account/game, fully exit Steam. Deltamod will verify the exact hook, remember your previous option value for removal, and preserve the surrounding command.',
        buttons: ['Verify with Steam exited', 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    return verify === 0;
}

async function acknowledgeRuntime() {
    const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Separate Proton runtime and progress',
        message: 'UMU may download its required Steam Linux Runtime on first launch. This profile uses a separate persistent prefix: existing Steam saves are not copied, and progress starts separately. A prefix is not a security sandbox.',
        buttons: ['Continue', 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    return result.response === 0;
}

async function confirmUnverifiedMod(mod) {
    const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Unverified mod compatibility',
        message: `Mod "${mod.name}" does not declare source-file hashes. Its compatibility with this game version is unverified. Continue with this mod for this launch only?`,
        buttons: ['Continue with this mod', 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    return result.response === 0;
}

function steamRootOf(state) {
    return state.STEAM_BASE ? path.resolve(state.STEAM_BASE, '../..') : undefined;
}

// Asks which runtime a Linux import should use. Steam imports list the
// Steam-managed option first, so their button order maps back to the
// shared RUNTIME_CHOICE values.
function askRuntimeChoice(steam) {
    const buttons = steam
        ? ['Use Steam-managed launch (existing Steam saves)', 'Use isolated Proton (UMU, separate saves)', 'Keep legacy setup', 'Cancel']
        : ['Use isolated Proton (UMU, separate saves)', 'Keep legacy setup', 'Cancel'];
    const selection = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Linux game runtime',
        message: 'Both staged modes preserve the original game files. UMU uses separate modded progress. Steam-managed launching uses the real Steam entry and its normal progress, and requires one-time Launch Options setup with Steam fully exited.',
        buttons,
        defaultId: 0,
        cancelId: steam ? 3 : 2
    });
    if (!steam) return selection;

    const steamOrder = [RUNTIME_CHOICE.steam, RUNTIME_CHOICE.umu, RUNTIME_CHOICE.legacy, RUNTIME_CHOICE.cancel];
    return steamOrder[selection] ?? RUNTIME_CHOICE.cancel;
}

function chooseSteamRuntime({ state, gameInfo, selectedGame, sourcePath, appid }) {
    try {
        if (app.isPackaged) throw new Error('Packaged Steam bridge runtime support has not been verified. Use a persistent source checkout or UMU for now.');
        durablePath(fs.realpathSync(app.getPath('userData')));
        const game = discoverSteamGame({ appid, sourcePath, steamRoot: steamRootOf(state) });

        const selection = dialog.showMessageBoxSync({
            type: 'question',
            title: 'Confirm Steam account',
            message: 'Choose the Steam account whose game Launch Options Deltamod should manage. No other account or game settings will be edited.',
            buttons: [...game.accounts.map(item => `${item.name} (${item.account})`), 'Cancel'],
            defaultId: game.accounts.length,
            cancelId: game.accounts.length
        });
        const choseAccount = selection >= 0 && selection < game.accounts.length;
        if (!choseAccount) return false;

        const account = game.accounts[selection].account;
        const consent = dialog.showMessageBoxSync({
            type: 'warning',
            title: 'Steam-managed mods share normal progress',
            message: `This uses Steam account ${account} and the game's normal Proton prefix. Mods can change your existing saves and Steam Cloud data. Deltamod does not copy, migrate or back up saves. Back up important progress first. Fully exit Steam before continuing; reopen it yourself after setup. Deltamod will preserve supported existing Launch Options and keep a private settings backup.`,
            buttons: ['Set up Steam-managed profile', 'Cancel'],
            defaultId: 1,
            cancelId: 1
        });
        if (consent !== 0) return false;

        return {
            steamSetup: { game, account, exeName: gameInfo.exeName },
            protonSettings: {
                backend: 'steam',
                gameId: selectedGame,
                exeName: gameInfo.exeName,
                sharedProgressAcknowledged: true,
                steam: {
                    root: game.root,
                    source: game.source,
                    appid: game.appid,
                    account,
                    binding: SteamBridge.steamBindingDirectory(app.getPath('userData'), game, account)
                }
            }
        };
    } catch (error) {
        dialog.showErrorBox('Steam-managed setup unavailable', error.message);
        return false;
    }
}

// Mirrors runtime download progress in a modal and the window taskbar entry.
function runtimeProgress(win) {
    const modal = createProgressModal();
    return {
        update: value => {
            if (modal.isDestroyed()) return;
            // The download can finish before the progress page loads.
            modal.webContents.executeJavaScript(`typeof updateProgress === 'function' && updateProgress(${Math.round(value * 10000) / 100});`).catch(() => {});
            if (!win.isDestroyed()) win.setProgressBar(value);
        },
        close: () => {
            if (!modal.isDestroyed()) modal.destroy();
            if (!win.isDestroyed()) win.setProgressBar(-1);
        }
    };
}

async function chooseUmuRuntime({ win, steam, state, gameInfo, selectedGame, sourcePath, appid }) {
    let umu;
    try {
        umu = await selectRuntime({ userData: app.getPath('userData') }, {
            dialog,
            progress: () => runtimeProgress(win)
        });
    } catch (error) {
        dialog.showErrorBox('UMU setup failed', `${error.message}\n\nYou can retry setup or choose an installed umu-run executable. No system packages were changed.`);
        return false;
    }
    if (!umu) return false;

    try {
        const proton = await selectProton({
            dialog,
            appid,
            sourcePath,
            steamRoot: steam ? steamRootOf(state) : undefined
        });
        if (!proton) return false;

        const protonSettings = { gameId: selectedGame, exeName: gameInfo.exeName, umu, proton };
        validateRuntime(protonSettings);
        return { protonSettings };
    } catch (error) {
        dialog.showErrorBox('Runtime unavailable', error.message);
        return false;
    }
}

/**
 * Lets a Linux import pick its runtime.
 * @returns {Promise<false|{protonSettings?: Object, steamSetup?: Object}>}
 *   false when cancelled or unavailable, an empty object for the legacy setup.
 */
async function chooseLinuxRuntime(request) {
    const choice = askRuntimeChoice(request.steam);
    if (choice === RUNTIME_CHOICE.cancel || choice < 0) return false;

    if (choice === RUNTIME_CHOICE.steam && request.steam) return chooseSteamRuntime(request);
    if (choice === RUNTIME_CHOICE.umu) return chooseUmuRuntime(request);
    return {};
}

function manageUmuProfile(getWindow) {
    const action = dialog.showMessageBoxSync({
        type: 'info',
        title: 'Manage UMU installation',
        message: 'This installation uses UMU and has no managed Steam Launch Options to disconnect. To remove it, open the Install Manager and choose Delete for this installation. Deletion requires a separate confirmation; opening the manager does not delete any files.',
        buttons: ['Open Install Manager', 'Cancel'],
        defaultId: 0,
        cancelId: 1
    });
    if (action !== 0) return false;

    const win = getWindow();
    if (!win || win.isDestroyed()) return false;
    win.webContents.send('page', 'installmanager');
    return true;
}

function manageSteamProfile(root, descriptor, steamSettings) {
    const action = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Manage Steam Launch Options',
        message: `Account ${descriptor.steam.account}, game ${descriptor.steam.appid}. Fully exit Steam before setup, removal or recovery. Removal preserves your other settings and leaves this profile disabled until setup is repaired.`,
        buttons: ['Repair setup', 'Remove managed Launch Options', 'Recover abandoned launch', 'Cancel'],
        defaultId: 3,
        cancelId: 3
    });

    if (action === 0) {
        const game = discoverSteamGame({ steamRoot: descriptor.steam.root, appid: descriptor.steam.appid, sourcePath: descriptor.steam.source });
        SteamBridge.installSteamHook({
            game,
            account: descriptor.steam.account,
            exeName: descriptor.exeName,
            profile: root,
            manual: true,
            confirmManual: confirmManualSteam
        }, steamSettings);
        dialog.showMessageBoxSync({ message: 'Steam Launch Options are ready. Reopen Steam before playing.', buttons: ['OK'] });
    } else if (action === 1) {
        const removed = SteamBridge.removeSteamProfile(root, {}, steamSettings);
        const message = removed
            ? 'The previous game Launch Options were restored. Normal Steam Play is vanilla. This profile is disabled until setup is repaired.'
            : 'Another Deltamod profile still uses this game hook. This profile was unregistered; the shared hook remains.';
        dialog.showMessageBoxSync({ message, buttons: ['OK'] });
    } else if (action === 2) {
        SteamBridge.recoverSteamProfile(root, steamSettings);
        const message = 'Inactive Steam session recovered.' + updateHelperAfterRecovery(root, steamSettings);
        dialog.showMessageBoxSync({ message, buttons: ['OK'] });
    } else {
        return false;
    }
    return true;
}

// Options menu entry for a Proton profile: Steam profiles manage their
// Launch Options, UMU profiles are pointed at the Install Manager.
function manageProtonProfile(root, getWindow, steamSettings) {
    try {
        const descriptor = ProtonStaging.readDescriptor(root);
        if (descriptor.backend !== 'steam') return manageUmuProfile(getWindow);
        return manageSteamProfile(root, descriptor, steamSettings);
    } catch (error) {
        dialog.showErrorBox('Steam integration unchanged or needs review', error.message);
        return false;
    }
}

function confirmRemoval(index, { proton, steam, retry }) {
    const isUmuWithPrefix = proton && !steam && !retry;
    const prefixWarning = isUmuWithPrefix ? '\n\nThis older UMU profile also has a separate prefix; deleting it permanently deletes any progress stored there.' : '';
    const retryNote = retry ? '\n\nRetry the interrupted cleanup. The installation remains disabled until cleanup finishes.' : '';
    const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Delete installation permanently',
        message: `Delete installation #${Number(index) + 1} permanently? This removes its Deltamod-owned files and cannot be undone. Steam saves, Steam's Proton prefix, and the original game are not deleted.${prefixWarning}${retryNote}`,
        buttons: ['Delete permanently', 'Cancel'],
        defaultId: 1,
        cancelId: 1
    });
    return choice === 0;
}

// request is the last confirmRemoval argument, or undefined when the
// failure happened before confirmation.
function showRemovalFailure(error, request) {
    const isFirstProtonAttempt = request?.proton && !request.retry;
    const backend = isFirstProtonAttempt ? (request.steam ? 'steam' : 'umu') : undefined;

    let recovery = 'Resolve the error before retrying Delete in Install Manager.';
    if (backend === 'steam') {
        recovery = 'For a retained Steam launch, exit Steam, then choose Options → Disconnect Steam from Deltamod → Recover abandoned launch.';
    } else if (backend === 'umu') {
        recovery = 'Close the identified game/runtime, then retry Delete in Install Manager. Abandoned UMU sessions are checked automatically before removal.';
    }
    dialog.showErrorBox('Installation not removed', `${error.message}\n\n${recovery} Do not delete session or lock files to bypass this check.`);
}

// Recovery is the one moment Steam is known to be exited with no session, which a helper update needs.
// Returns the closing instruction for the recovery message.
function updateHelperAfterRecovery(root, steamSettings) {
    try {
        SteamBridge.updateSteamHelper(root, steamSettings);
        return ' Reopen Steam, then launch again.';
    } catch (error) {
        return `\n\nThe Steam helper could not be updated yet: ${error.message}`;
    }
}

// Shown when a launch finds files from an earlier Steam session; recovery runs on the spot instead of through Options.
function offerSteamRecovery(root, reason, steamSettings) {
    const choice = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Earlier Steam launch not finished',
        message: reason,
        detail: 'Fully exit Steam, then choose Recover. Recovery deletes the leftover modded copy and session files. Your saves and the original game files are not touched.',
        buttons: ['Recover', 'Cancel'],
        defaultId: 0,
        cancelId: 1
    });
    if (choice !== 0) return false;

    try {
        const recovered = SteamBridge.recoverSteamProfile(root, steamSettings);
        const outcome = recovered ? 'Earlier Steam launch recovered.' : 'No leftover Steam session was found.';
        const message = outcome + updateHelperAfterRecovery(root, steamSettings);
        dialog.showMessageBoxSync({ message, buttons: ['OK'] });
        return recovered;
    } catch (error) {
        dialog.showErrorBox('Steam recovery refused', error.message);
        return false;
    }
}

module.exports = {
    confirmSteamAccount,
    confirmManualSteam,
    acknowledgeRuntime,
    confirmUnverifiedMod,
    chooseLinuxRuntime,
    manageProtonProfile,
    confirmRemoval,
    showRemovalFailure,
    offerSteamRecovery
};
