async function addCheckboxOption(name, description, flagid, requiresRestart = false, changeHandler = (e) => {}) {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerText = name;
    span.className = 'optionName';
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


window.currentPageStack.expandSemimenu = function(sm) {
    document.querySelector('.semimenu#' + sm).style.display = 'block';
    document.querySelector('.semimenuCollapser#b_' + sm).style.opacity = 0.5;
    rew();
};

window.currentPageStack.collapseSemimenu = function() {
    Array.from(document.querySelectorAll('.semimenu')).forEach(menu => {
        menu.style.display = 'none';
    });
    Array.from(document.querySelectorAll('.semimenuCollapser')).forEach(btn => {
        btn.style.opacity = 0.5;
    });
};

window.electronAPI.invoke('isDevMode', []).then((devmode) => {
    if (devmode) {
        document.getElementById('b_dev').style.display = 'flex';
    }
    else {
        const devBtn = document.getElementById('b_dev');
        if (devBtn) devBtn.remove();
    }
});

async function addSelectOption(name, description, options, requiresRestart = false, changeHandler = (val) => {}, defaultValue = '') {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.className = 'optionName';
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

    const select = document.createElement('select');
    select.id = 'SELECT-' + name.toUpperCase().replace(/[^A-Z0-9]+/g, '-');

    let firstValue = '';
    for (const option of options) {
        const opt = document.createElement('option');
        if (typeof option === 'object' && option !== null) {
            opt.value = option.value ?? option.id ?? option.key ?? '';
            opt.innerText = option.label ?? option.name ?? String(opt.value);
            if (option.selected) select.value = opt.value;
        } else {
            opt.value = String(option);
            opt.innerText = String(option);
        }
        if (firstValue === '') firstValue = opt.value;
        select.appendChild(opt);
    }

    select.value = defaultValue || firstValue;

    select.addEventListener('change', (e) => {
        changeHandler(e.target.value);
    });

    tdInput.appendChild(select);
    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);
    table.appendChild(tr);
}

async function addButton(name, description, click, buttonText, enabled = true, disabledReason = '', colour = '') {
    const table = document.querySelector('tbody');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerText = name;
    span.className = 'optionName';
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

async function renderAccount(backendName, displayName, cat, tbody = document.querySelector('tbody')) {
    var children = [];
    if (backendName === 'gamebanana') {
        await invoke('eraseGamebananaCache', []);
    }

    var loadtr = document.createElement('tr');
    loadtr.innerHTML = '<td colspan="2" style="text-align:center; display: flex; justify-content: center; align-items: center;"><div class="loadingBar"></div></td>';
    tbody.appendChild(loadtr);

    var tr = document.createElement('tr');
    tbody.appendChild(tr);

    var td = document.createElement('td');
    td.colSpan = 2;
    td.innerHTML = "Loading...";

    var userInfo = await Promise.race([
        window.electronAPI.invoke('getAccountInfo', [backendName]),
        new Promise(resolve => setTimeout(() => resolve({ loggedIn: false }), 5000))
    ]);

    console.log("User info for " + backendName + ": " + JSON.stringify(userInfo));

    if (userInfo === null || userInfo === undefined) {
        userInfo = { loggedIn: false };
    }
            
    tbody.removeChild(loadtr);
    td.innerHTML = '';

    var flexdiv = document.createElement('div');
    flexdiv.style.display = 'flex';
    flexdiv.style.alignItems = 'center';
    flexdiv.style.gap = '10px';
    td.appendChild(flexdiv);

    var img = document.createElement('img');
    img.src = userInfo.pic || './img/mod-placeholder.png';
    img.style.width = '32px';
    img.style.height = '32px';
    img.style.border = '1px solid var(--theme-color)';
    flexdiv.appendChild(img);

    img.style.borderRadius = '5px';
    var span = document.createElement('span');
    flexdiv.appendChild(span);
    span.innerText = `Currently logged in as ${userInfo.name}`;

    if (userInfo.name == undefined) {
        span.innerText = "You aren't logged in to " + displayName + ".";
        userInfo = { loggedIn: false };
    }
    else {
        userInfo.loggedIn = true;
    }

    tr.appendChild(td);

    if (userInfo.loggedIn && userInfo.name != undefined) {
        await addButton("Logout", "Removes your " + displayName + " account from Deltamod.", async () => {
            await window.electronAPI.invoke('logout_account', [backendName]);
            window._pageArguments = {cat: cat};
            page('options');
        }, "Logout", userInfo.loggedIn, "You aren't logged in to " + displayName + ".", '');
    }
    else {
        await addButton("Login", "Adds a " + displayName + " account to Deltamod.", async () => {
            await window.electronAPI.invoke('login_account', [backendName]);
            window._pageArguments = {cat: cat};
            page('options');
        }, "Login", !userInfo.loggedIn, "You are already logged in to " + displayName + ".", '');
    }
}

var tempLock = false;

window.currentPageStack.cat = async function(cat, collapseSemimenu = true) {
    if (tempLock) return;
    tempLock = true;
    let tbody = document.querySelector('tbody');
    tbody.innerHTML = '';

    try {
        if (collapseSemimenu) {
            window.currentPageStack.collapseSemimenu();
        }

        var currentCatbtn = document.getElementById('b_' + cat);
        var isInSemimenu = currentCatbtn?.closest('div.semimenu') !== null;
        if (isInSemimenu) {
            window.currentPageStack.expandSemimenu(currentCatbtn.closest('div.semimenu').id);
        }
    }
    catch {}


    document.querySelectorAll('[id^="b_"]').forEach(btn => {
        btn.classList.remove('selected');
    });
    
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
            await addButton("Delete all installations", "Deletes all Deltamod installations. Doesn't affect mods or other data.", async () => {
                var response = await htmlAlert("Warning", "Are you sure you want to delete all installations? This action cannot be undone.", [{ text: "Yes", resolveWith: 'Y' }, { text: "No", resolveWith: 'N' }]);
                if (response === 'Y') {
                    await window.electronAPI.invoke('initializeInstalls', []);
                }
            }, "Delete", true, '', 'red');
            await addCheckboxOption("Prompt controller mode when available", "When enabled, you will be asked to activate Controller Mode when a compatible controller is attached. Currently only compatible with DualSense.", 'CONTROLLER');
            await addCheckboxOption("Enable hash checks", "If enabled, Deltamod will check the hashes of mods to ensure compatibility. This may slow down Deltamod and render some mods incompatible.", 'hashchecks', true);
            break;
        case 'ui':
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

            await addSelectOption(
                "Alert alignment",
                "Choose how alerts are positioned on the screen.",
                [
                    { value: "Top", label: "Top" },
                    { value: "Center", label: "Center" },
                    { value: "Bottom", label: "Bottom" },
                    { value: "Separate", label: "Separate" }
                ],
                true,
                async (val) => {
                    var oldVal = localStorage.getItem('alertAlignment');
                    localStorage.setItem('alertAlignment', val);
                    await reapplyHAStyles();
                    var response = await htmlAlert("Modified", "This is how your alerts look when aligned as " + val + '. Keep it this way?', [{ text: "Yes", resolveWith: 'Y' }, { text: "No, revert to " + oldVal, resolveWith: 'N' }]);
                    if (response == 'N') {
                        localStorage.setItem('alertAlignment', oldVal);
                        await reapplyHAStyles();
                        window._pageArguments = { cat: 'ui' };
                        page('options');
                    }
                },
                localStorage.getItem('alertAlignment') || 'Top'
            );

            await addButton("Select a theme", "Opens the theme selection menu.", async () => {
                page('themesel');
            }, "Open");

            break;
        case 'inst':
            var isSteam = await window.electronAPI.invoke('isCurrentIndexSteam', []);

            await addButton("Disconnect Steam from Deltamod", "Disconnects Steam from the current install. This install will no longer be launched via Steam. In some cases, this may require deleting and reinstalling the game from Steam.", async () => {
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
            await renderAccount('gamebanana', 'GameBanana', 'gb');
            break;
        case 'itch':
            await renderAccount('itch', 'Itch.io', 'itch');

            var td = document.createElement('td');
            td.colSpan = 2;
            td.innerHTML = `<small style='color:#888; font-style: normal;'>
            DELTAModders runs the server responsible for storing itch.io-related information. 
            The itch.io account info you submit is tied to an account created on our server.
            Please read our Terms of Service and Privacy Policy before using this feature.
            </small>`;
            var tr = document.createElement('tr');
            tr.appendChild(td);
            tbody.appendChild(tr);

            break;
        case 'gamejolt':
            await addButton("wip", "wip!", async () => {
                window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank');
            }, "Open");
            break;
        case 'help':
            await addButton("Open the Deltamod tutorial", "Opens the Deltamod tutorial video by Zatmaggot in your default browser.", async () => {
                window.open('https://www.youtube.com/watch?v=vFj0wFI5kp4', '_blank');
            }, "Open");
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