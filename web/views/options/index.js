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
        if (flagid == 'sfx' && e.target.checked) {
            var a = new Audio();
            a.src = 'audio/orch2.mp3';
            a.playbackRate = 1.1;
            a.currentTime = 0.6;
            a.play();
        }
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
    document.getElementById('b_gb').classList.remove('selected');
    try {
        document.getElementById('b_dev').classList.remove('selected');
    }
    catch (e) {
        console.log('Dev button not found, skipping.');
    }

    document.getElementById('b_' + cat).classList.add('selected');
    document.querySelectorAll('[id^="b_"]').forEach(btn => {
        if (btn.id != 'b_' + cat) {
            btn.classList.add('blur');
        }
        else {
            btn.classList.remove('blur');
        }
    });
    switch (cat) {
        case 'gen':            
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
            await addCheckboxOption('Enable SFX in menus', 'Choose if you want SFX to play when you do some things. Some actions might still trigger SFX even with this off.', 'sfx');

            await addButton('Select a theme', 'Opens the theme selection menu.', async () => {
                page('themesel');
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
            await addButton('Change patcher', 'Allows you to change your patching system. Only for advanced users!', async () => {
                page('gm3p-selector');
            }, 'Open');

            await addButton('Reboot in Developer Mode', 'Reboots in developer mode, a mode which allows you to use the DevTools.', async () => {
                var goOn = await htmlAlert(
                        'Warning', 
                        'Are you sure you want to reboot in developer mode? This is only for people who know their shit!', 
                        [{text:'Yes',resolveWith:'ok'}, {text:'No',rejectWith:'cancel'}]
                    );
                await window.electronAPI.invoke('rebootDev', [])
            }, 'Open', !await window.electronAPI.invoke('isDevMode', []), 'You are already in dev mode.');

            await addButton('Precalculate game hashes', 'If you are using advanced mod checks, doing this operation may save you time when opening Deltamod, but it can be pretty lengthy.', async () => {
                await window.electronAPI.invoke('precalcGameHashes', []);
                await htmlAlert('Done','The operation was successful.',[{text: 'OK', resolveWith:''}]);
            }, 'Open');

            break;
        case "dev":
            await addButton('Open flag database (DEV-ONLY)', 'Opens the database holding flags.', async () => {
                await window.electronAPI.invoke('openFlagDatabase', []);
            }, 'Open');
            break;
        case 'gb':
            var tr = document.createElement('tr');
            tbody.appendChild(tr);

            var td = document.createElement('td');
            td.colSpan = 2;
            td.innerHTML = 'Please wait...';

            var gamebananaUserinfo = await window.electronAPI.invoke('getGamebananaUserinfo', []);
            td.innerHTML = '';

            var flexdiv = document.createElement('div');
            flexdiv.style.display = 'flex';
            flexdiv.style.alignItems = 'center';
            flexdiv.style.gap = '10px';
            td.appendChild(flexdiv);

            var img = document.createElement('img');
            img.src = gamebananaUserinfo._sAvatarUrl || './img/mod-placeholder.png';
            img.style.width = '32px';
            img.style.height = '32px';
            flexdiv.appendChild(img);

            img.style.borderRadius = '8px';
            var span = document.createElement('span');
            flexdiv.appendChild(span);
            span.innerText = 'Currently logged in as ' + gamebananaUserinfo._sName;

            if (gamebananaUserinfo._sName == undefined) {
                span.innerText = 'You aren\'t logged in to GameBanana.';
                gamebananaUserinfo = { loggedIn: false };
            }
            else {
                gamebananaUserinfo.loggedIn = true;
            }

            tr.appendChild(td);

            await addButton('Logout', 'Removes your GameBanana account from Deltamod.', async () => {
                await window.electronAPI.invoke('logoutGamebanana', []);
                window._pageArguments = {cat: 'gb'};
                page('options');
            }, 'Logout', gamebananaUserinfo.loggedIn, 'You are not logged in.', '');

            await addButton('Login', 'Adds a GameBanana account to Deltamod.\n\nThis action will save your session ID (not username and password) on your computer in plaintext.\n\nPLEASE ENABLE 2FA BEFORE USING THIS FEATURE!!', async () => {
                await window.electronAPI.invoke('loginGamebanana', []);
                window._pageArguments = {cat: 'gb'};
                page('options');
            }, 'Login', !gamebananaUserinfo.loggedIn, 'You are already logged in.', '');
    }
    // theme adjustments
    // as far as i know this page is the only page that needs ts
    genbtnstyles();
    rew();
}

if (window._pageArguments.cat != undefined) {
    window.currentPageStack.cat(window._pageArguments.cat);
}