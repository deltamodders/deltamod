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
        restartNote.innerText = await k('options_requiresrestart');
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
            await addButton(await k('options_gen0_title'), await k('options_gen0_desc'), async () => {
                await window.electronAPI.invoke('openSysFolder', ['mods']);
            }, await k('open'));
            await addButton(await k('options_gen1_title'), await k('options_gen1_desc'), async () => {
                page('deleteall');
            }, await k('delete'), true, '', 'red');
            await addCheckboxOption(await k('options_gen2_title'), await k('options_gen2_desc'), 'HASHCHECKS');
            break;
        case 'ui':
            await addCheckboxOption(await k('options_ui0_title'), await k('options_ui0_desc'), 'SHOP', true);
            await addCheckboxOption(await k('options_ui1_title'), await k('options_ui1_desc'), 'audio');
            await addCheckboxOption(await k('options_ui2_title'), await k('options_ui2_desc'), 'sfx');
            await addCheckboxOption(await k('options_ui3_title'), await k('options_ui3_desc'), 'PARALLAX', true);

            await addButton(await k('options_ui_theme_title'), await k('options_ui_theme_desc'), async () => {
                page('themesel');
            }, await k('open'));

            break;
        case 'inst':
            var isSteam = await window.electronAPI.invoke('isCurrentIndexSteam', []);

            await addButton(await k('options_inst0_title'), await k('options_inst0_desc'), async () => {
                await window.electronAPI.invoke('removeSteamIntegration', []);
            }, await k('disconnect'), isSteam, 'Only available on Steam based installs.');

            await addButton(await k('options_inst1_title'), await k('options_inst1_desc'), async () => {
                page('installmanager');
            }, await k('open'));

            break;
        case 'adv':
            await addButton(await k('options_adv0_title'), await k('options_adv0_desc'), async () => {
                page('gm3p-selector');
            }, await k('open'));

            await addButton(await k('options_adv1_title'), await k('options_adv1_desc'), async () => {
                var goOn = await htmlAlert(
                        'Warning', 
                        'Are you sure you want to reboot in developer mode? This is only for people who know their shit!', 
                        [{text:'Yes',resolveWith:'ok'}, {text:'No',rejectWith:'cancel'}]
                    );
                await window.electronAPI.invoke('rebootDev', [])
            }, await k('open'), !await window.electronAPI.invoke('isDevMode', []), 'You are already in dev mode.');

            await addButton(await k('options_adv2_title'), await k('options_adv2_desc'), async () => {
                await window.electronAPI.invoke('precalcGameHashes', []);
                await htmlAlert(await k('done'),await k('operation_successful'),[{text: await k('ok'), resolveWith:''}]);
            }, await k('open'));

            break;
        // dev isnt keyed and is always in english
        case "dev":
            await addButton('Open flag database (DEV-ONLY)', 'Opens the database holding flags.', async () => {
                await window.electronAPI.invoke('openFlagDatabase', []);
            }, await k('open'));
            await addButton('Decrypt GameBanana account token (DEV-ONLY)', 'Decrypts your GameBanana account token from the default encryption and saves it to your desktop.', async () => {
                await window.electronAPI.invoke('dev_getGBToken', []);
                await htmlAlert(await k('done'),await k('operation_successful'),[{text: await k('ok'), resolveWith:''}]);
            }, await k('open'));
            break;
        case 'gb':
            var loadtr = document.createElement('tr');
            loadtr.innerHTML = '<td colspan="2" style="text-align:center;">' + await k('loading') + '</td>';
            tbody.appendChild(loadtr);

            var tr = document.createElement('tr');
            tbody.appendChild(tr);

            var td = document.createElement('td');
            td.colSpan = 2;
            td.innerHTML = await k('loading');

            var gamebananaUserinfo = await window.electronAPI.invoke('getGamebananaUserinfo', []);
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
            flexdiv.appendChild(img);

            img.style.borderRadius = '8px';
            var span = document.createElement('span');
            flexdiv.appendChild(span);
            span.innerText = await k('options_gb_loggedas', gamebananaUserinfo._sName);

            if (gamebananaUserinfo._sName == undefined) {
                span.innerText = await k('options_gb_notlogged');
                gamebananaUserinfo = { loggedIn: false };
            }
            else {
                gamebananaUserinfo.loggedIn = true;
            }

            tr.appendChild(td);

            if (gamebananaUserinfo.loggedIn && gamebananaUserinfo._sName != undefined) {
                await addButton(await k('logout'), await k('options_gb_logout_desc'), async () => {
                    await window.electronAPI.invoke('logoutGamebanana', []);
                    window._pageArguments = {cat: 'gb'};
                    page('options');
                }, await k('logout'), gamebananaUserinfo.loggedIn, await k('options_gb_notlogged'), '');
            }
            else {
                await addButton(await k('login'), await k('options_gb_login_desc'), async () => {
                    await window.electronAPI.invoke('loginGamebanana', []);
                    window._pageArguments = {cat: 'gb'};
                    page('options');
                }, await k('login'), !gamebananaUserinfo.loggedIn, await k('options_gb_alreadylogged'), '');
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