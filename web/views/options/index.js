async function addCheckboxOption(name, description, flagid) {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerText = name;
    tdLabel.appendChild(span);

    tdLabel.appendChild(document.createElement('br'));

    const small = document.createElement('small');
    small.className = 'calibri';
    small.innerText = description;
    tdLabel.appendChild(small);

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


async function addButton(name, description, click, buttonText, enabled = true, disabledReason = '') {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerText = name;
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

(async() => {
    /*
        */
})();

window.currentPageStack.cat = async function(cat) {
    let tbody = document.querySelector('tbody');
    tbody.innerHTML = '';

    switch (cat) {
        case 'gen':
            await addCheckboxOption('Show user Deltarune logs after close', 'Enables logging of Deltarune messages and errors to Deltamod. Will not work on Steam based installs.', 'outputDelta');
            await addButton('Open mod folder', 'Open the folder where mods are stored. You can drag mod folders in Deltamod format there.', async () => {
                await window.electronAPI.invoke('openSysFolder', ['mods']);
            }, 'Open');
            break;
        case 'ui':
            await addCheckboxOption('Enable music in menus', 'Choose if you want music to play in the background. The dogcheck will still have music.', 'audio');

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

            await addButton('Bake this install', 'Allows you to select mods to bake into the game (so you don\'t have to patch everytime)', async () => {
                window._pageArguments = { baker: true };
                page('main');
            }, 'Open', !await window.electronAPI.invoke('isBaked', []), 'Not available when current installation has been already baked'); // Disable if install is invalid

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
                    await htmlAlert('Error', 'An error occurred while trying to download DEVICE_FUSION: ' + e.message, [{text:'OK',resolveWith:'ok'}]);
                }
            }, 'Open');

            await addButton('Reboot in Developer Mode', 'Reboots in developer mode, a mode which allows you to use the DevTools.', async () => {
                await window.electronAPI.invoke('rebootDev', []);
            }, 'Open');
            break;
    }
}