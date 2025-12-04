async function addCheckboxOption(name, description, flagid, requiresRestart = false) {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerText = name;
    tdLabel.appendChild(span);

    tdLabel.appendChild(document.createElement('br'));

    const small = document.createElement('small');
    small.className = 'calibri';
    small.innerHTML = description;
    tdLabel.appendChild(small);

    if (requiresRestart) {
        const restartNote = document.createElement('small');
        restartNote.className = 'calibri';
        restartNote.style.marginTop = '7px';
        restartNote.style.display = 'block';
        restartNote.style.color = '#888';
        restartNote.style.fontSize = 'x-small';
        restartNote.innerText = 'Requires a Deltamod restart to take effect.';
        tdLabel.appendChild(restartNote);
    }

    const tdInput = document.createElement('td');
    tdInput.className = 'input';
    tdInput.classList.add('center');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'FLAG-' + flagid.toUpperCase();
    input.checked = await window.electronAPI.invoke('getUniqueFlag', [flagid]);
    input.addEventListener('change', async (e) => {
        await window.electronAPI.invoke('setUniqueFlag', [flagid, e.target.checked]);
    });
    tdInput.appendChild(input);

    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);

    table.appendChild(tr);
}

window.electronAPI.invoke('isDevMode', []).then((devmode) => {
    if (devmode) {
        document.getElementById('b_dev').style.display = 'inline-block';
    }
    else {
        const devBtn = document.getElementById('b_dev');
        if (devBtn) devBtn.remove();
    }
});

async function addButton(name, description, click, buttonText, enabled = true, disabledReason = '', colour = '') {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerText = name;
    if (colour != '') {
        span.style.color = colour;
    }
    tdLabel.appendChild(span);

    tdLabel.appendChild(document.createElement('br'));

    const small = document.createElement('small');
    small.className = 'calibri';
    small.innerText = description;
    tdLabel.appendChild(small);

    const tdInput = document.createElement('td');
    tdInput.classList.add('center');

    const button = document.createElement('button');
    button.innerText = buttonText;
    button.addEventListener('click', click);
    tdInput.appendChild(button);
    if (!enabled) {
        button.disabled = true;
        button.style.opacity = 0.5;
        button.style.cursor = 'not-allowed';
        span.style.opacity = 0.5;
        small.style.opacity = 0.5;
        span.style.fontStyle = 'italic';
        small.style.fontStyle = 'italic';
        if (disabledReason != '') {
            small.innerText = '(' + disabledReason + ')';
        }
    }

    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);

    table.appendChild(tr);
}


window.currentPageStack.cat = async function(cat) {
    let tbody = document.querySelector('tbody');
    tbody.innerHTML = '';

    document.getElementById('b_gen').classList.remove('selected');
    document.getElementById('b_ui').classList.remove('selected');
    document.getElementById('b_inst').classList.remove('selected');
    document.getElementById('b_adv').classList.remove('selected');
    try {
        document.getElementById('b_dev').classList.remove('selected');
    }
    catch (e) {
        console.log('Dev button not found, skipping.');
    }

    document.getElementById('b_' + cat).classList.add('selected');
    switch (cat) {
        case 'gen':
            await addCheckboxOption('Show user Deltarune logs after close', 'Enables logging of Deltarune messages and errors to Deltamod. Will not work on Steam based installs.', 'outputDelta');
            
            await addButton('Open mod folder', 'Open the folder where mods are stored. You can drag mod folders in Deltamod format there.', async () => {
                await window.electronAPI.invoke('openSysFolder', ['mods']);
            }, 'Open');
            await addButton('Delete all user data', 'Deletes all Deltamod data. Irreeversible!', async () => {
                page('deleteall');
            }, 'Delete', true, '', 'red');
            await addCheckboxOption('Enable advanced mod checks', 'Enables advanced compatibility checks for mods that support it. Currently beta!', 'HASHCHECKS');
            break;
        case 'ui':
            await addCheckboxOption('Enable Mod Shop', 'Enables the Mod Shop. This service uses GameBanana to run. ' + (navigator.onLine ? '' : '<br><br><i style="color: gold;">This option is currently disregarded because there is no Internet.</i>'), 'SHOP', true);
            await addCheckboxOption('Enable music in menus', 'Choose if you want music to play in the background.', 'audio');

            await addButton('Select a theme', 'Opens the theme selection menu.', async () => {
                page('themesel');
            }, 'Open');

            await addButton('Select a patching character', 'Open the patching character selection menu.', async () => {
                await window.electronAPI.invoke('setSponsor', []);
            }, 'Open');

            break;
        case 'inst':
            var isSteam = await window.electronAPI.invoke('isCurrentIndexSteam', []);

            await addButton('Disconnect Steam from Deltamod', 'Disconnects Steam from the current install and will delete the files for Steam. You\'ll have to redownload the game from Steam, but the current install will remain on Deltamod.', async () => {
                await window.electronAPI.invoke('removeSteamIntegration', []);
            }, 'Disconnect', isSteam, 'Only available on Steam based installs.');

            await addButton('Open the Install Manager', 'Opens the install manager menu, which allows you to delete/create installations and create shortcuts for them.', async () => {
                page('installmanager');
            }, 'Open');

            break;
        case 'adv':
            await addButton('Change GM3P version', 'Allows you to change your GM3P version. Only for advanced users!', async () => {
                page('gm3p-selector');
            }, 'Open');

            await addButton('Install DEVICE_FUSION', '(BETA) Allows you to use DEVICE_FUSION instead of GM3P for patching.', async () => {
                try {
                    var releasesRaw = await fetch('https://api.github.com/repos/Egochka11/DEVICE-FUSION/releases');
                    var releases = await releasesRaw.json();
                    var code = releasesRaw.status;
                    if (code != 200) {
                        throw new Error(`GitHub is rejecting your requests. HTML code: ${code}`);
                    }
                    var asset = releases[0].assets.find(a => a.name.endsWith('.zip'));
                    await window.electronAPI.invoke('downloadGM3P', [asset.browser_download_url]);
                } catch (e) {
                    await htmlAlert('Error', 'An error occurred while trying to download DEVICE_FUSION: ' + e.message, [{text:'OK',resolveWith:'ok'}], 'error');
                }
            }, 'Open');

            await addButton('Reboot in Developer Mode', 'Reboots in developer mode, a mode which allows you to use the DevTools.', async () => {
                var goOn = await htmlAlert(
                        'Warning', 
                        'Are you sure you want to reboot in developer mode? This is only for people who know their shit!', 
                        [{text:'Yes',resolveWith:'ok'}, {text:'No',rejectWith:'cancel'}]
                    );
                await new Promise(r => setTimeout(r, 1000));
                
                if (!await window.electronAPI.invoke('rebootDev', [])) {
                    await htmlAlert(
                        'Info', 
                        'The app is already running in developer mode.', 
                        [{text:'OK',resolveWith:'ok'}]
                    );
                }
            }, 'Open');

            break;
        case "dev":
            await addButton('Open flag database (DEV-ONLY)', 'Opens the database holding flags.', async () => {
                await window.electronAPI.invoke('openFlagDatabase', []);
            }, 'Open');
            break;
    }
    // theme adjustments
    // as far as i know this page is the only page that needs ts
    genbtnstyles();
    rew();
}