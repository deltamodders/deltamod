async function addCheckboxOption(name, description, flagid, requiresRestart = false, changeHandler = (e) => {}) {
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
        restartNote.innerText = "Requires a Deltamod restart to take effect.";
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
        changeHandler(e.target.checked);
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

async function addRowHeader(name) {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'rowheader';
    td.innerHTML = "<div style='display:flex; align-items:center; gap:10px;'>" + name + "</div>"; // make it aligned
    tr.appendChild(td);
    table.appendChild(tr);
}

var tempLock = false;

window.currentPageStack.cat = async function(cat) {
    if (tempLock) return;
    tempLock = true;
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

    if (!document.getElementById('b_' + cat)) {
        cat = 'gen';
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
            await addButton("Open mod folder", "Open the folder where your mods are stored.", async () => {
                await window.electronAPI.invoke('openSysFolder', ['mods']);
            }, "Open");
            await addButton("Delete all data", "Deletes all Deltamod data, including installations, mods, and options.", async () => {
                page('deleteall');
            }, "Delete", true, '', 'red');
            await addCheckboxOption("Prompt controller mode when available", "When enabled, you will be asked to activate Controller Mode when a compatible controller is attached. Currently only compatible with DualSense.", 'CONTROLLER');
            await addCheckboxOption("Enable hash checks", "If enabled, Deltamod will check the hashes of mods to ensure compatibility. This may slow down Deltamod and render some mods incompatible.", 'hashchecks', true);
            break;
        case 'ui':
            await addCheckboxOption("Enable Mod Shop", "Enables the Mod Shop feature, allowing you to browse and install mods from the GameBanana community.", 'SHOP', true);
            await addCheckboxOption("Enable music in menus", "Plays background music in the main menus.", 'audio', false, (enabled) => {
                if (enabled) {
                    var a = new Audio();
                    a.src = 'audio/orch1.mp3';
                    a.playbackRate = 1.3;
                    a.play();
                    audio.play();
                }
                else {
                    audio.pause();
                }
            });
            await addCheckboxOption("Enable SFX in menus", "Plays sound effects in the main menus.", 'sfx', false, (enabled) => {
                if (enabled) {
                    var a = new Audio();
                    a.src = 'audio/orch1.mp3';
                    a.playbackRate = 1.1;
                    a.play();
                }
            });
            await addCheckboxOption("Enable dynamic music", "Enables dynamic background music that changes based on the page. If unchecked, always plays the default music for your theme.", 'dynamusic', true);

            await addButton("Select a theme", "Opens the theme selection menu.", async () => {
                page('themesel');
            }, "Open");

            break;
        case 'inst':
            var isSteam = await window.electronAPI.invoke('isCurrentIndexSteam', []);

            await addButton("Disconnect Steam from Deltamod", "Disconnects Steam from the current install and will delete the files for Steam. You'll have to redownload the game from Steam, but the current install will remain on Deltamod.", async () => {
                await window.electronAPI.invoke('removeSteamIntegration', []);
            }, "Disconnect", isSteam, "Only available for games imported from Steam.");

            await addButton("Open the Install Manager", "Opens the install manager menu, which allows you to delete/create installations and create shortcuts for them.", async () => {
                page('installmanager');
            }, "Open");

            break;
        case 'adv':
            await addRowHeader(icon('warning', '20px') + ' ' + "Please only change these settings if you know what they do.");

            await addButton("Reboot in Developer Mode", "Reboots in developer mode, a mode which allows you to use the DevTools.", async () => {
                var goOn = await htmlAlert(
                        'Warning', 
                        "Warning: this is only for users who know what they're doing. Are you sure you want to reboot in developer mode?", 
                        [{text:"Yes",resolveWith:'ok'}, {text:"No",rejectWith:'cancel'}]
                    );
                await window.electronAPI.invoke('rebootDev', [])
            }, "Open", !await window.electronAPI.invoke('isDevMode', []), "You are already in developer mode.");

            await addButton("Precalculate game hashes", "If you are using advanced mod checks, doing this operation may save you time when opening Deltamod, but it can be pretty lengthy.", async () => {
                await window.electronAPI.invoke('precalcGameHashes', []);
                await htmlAlert("Done","Operation successful!",[{text: "Ok", resolveWith:''}]);
            }, "Open");

            await addButton("Install DeltamodCLI", "Installs the 'deltamod' command in your system. Requires administrator privileges.", async () => {
                var res = await window.electronAPI.invoke('installDeltamodCLI', []);
                if (res) {
                    await htmlAlert("Done","Operation successful!",[{text: "Ok", resolveWith:''}]);
                }
            }, "Open");

            break;
        // dev isnt keyed and is always in english
        case "dev":
            await addRowHeader(icon('warning', '20px') + ' ' + "These options are for developers only.");
            await addButton('Open flag database (DEV-ONLY)', 'Opens the database holding flags.', async () => {
                await window.electronAPI.invoke('openFlagDatabase', []);
            }, "Open");
            await addButton('Decrypt GameBanana account token (DEV-ONLY)', 'Decrypts your GameBanana account token from the default encryption and saves it to your desktop.', async () => {
                await window.electronAPI.invoke('dev_getGBToken', []);
                await htmlAlert("Done","Operation successful!",[{text: "Ok", resolveWith:''}]);
            }, "Open");
            await addButton('Force controller mode (DEV-ONLY)', 'Forces Controller Mode on, regardless of controller detection status', async () => {
                await window.electronAPI.invoke('cmode-on', []);
            }, "Open");
            break;
        case 'gb':
            await invoke('eraseGamebananaCache', []);

            var loadtr = document.createElement('tr');
            loadtr.innerHTML = '<td colspan="2" style="text-align:center; display: flex; justify-content: center; align-items: center;"><div class="loadingBar"></div></td>';
            tbody.appendChild(loadtr);

            var tr = document.createElement('tr');
            tbody.appendChild(tr);

            var td = document.createElement('td');
            td.colSpan = 2;
            td.innerHTML = "Loading...";

            var gamebananaUserinfo = await Promise.race([
                window.electronAPI.invoke('getGamebananaUserinfo', []),
                new Promise(resolve => setTimeout(() => resolve({ loggedIn: false }), 5000))
            ]);
            
            tbody.removeChild(loadtr);
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
            img.style.border = '1px solid var(--theme-color)';
            flexdiv.appendChild(img);

            img.style.borderRadius = '5px';
            var span = document.createElement('span');
            flexdiv.appendChild(span);
            span.innerText = `Currently logged in as ${gamebananaUserinfo._sName}`;

            if (gamebananaUserinfo._sName == undefined) {
                span.innerText = "You aren't logged in to GameBanana.";
                gamebananaUserinfo = { loggedIn: false };
            }
            else {
                gamebananaUserinfo.loggedIn = true;
            }

            tr.appendChild(td);

            if (gamebananaUserinfo.loggedIn && gamebananaUserinfo._sName != undefined) {
                await addButton("Logout", "Removes your GameBanana account from Deltamod.", async () => {
                    await window.electronAPI.invoke('logoutGamebanana', []);
                    window._pageArguments = {cat: 'gb'};
                    page('options');
                }, "Logout", gamebananaUserinfo.loggedIn, "You aren't logged in to GameBanana.", '');
            }
            else {
                await addButton("Login", "Adds a GameBanana account to Deltamod.", async () => {
                    await window.electronAPI.invoke('loginGamebanana', []);
                    window._pageArguments = {cat: 'gb'};
                    page('options');
                }, "Login", !gamebananaUserinfo.loggedIn, "You are already logged in to GameBanana.", '');
            }
            break;
    }
    // theme adjustments
    // as far as i know this page is the only page that needs ts
    genbtnstyles();
    rew();

    tempLock = false;
}

if (window._pageArguments.cat != undefined) {
    window.currentPageStack.cat(window._pageArguments.cat);
    window._pageArguments = {};
}