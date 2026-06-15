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
    document.getElementById('b_lang').classList.remove('selected');
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
            await addCheckboxOption(await k('options_gen3_title'), await k('options_gen3_desc'), 'CONTROLLER');
            break;
        case 'ui':
            await addCheckboxOption(await k('options_ui0_title'), "", 'SHOP', true);
            await addCheckboxOption(await k('options_ui1_title'), "", 'audio', false, (enabled) => {
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
            await addCheckboxOption(await k('options_ui2_title'), "", 'sfx', false, (enabled) => {
                if (enabled) {
                    var a = new Audio();
                    a.src = 'audio/orch1.mp3';
                    a.playbackRate = 1.1;
                    a.play();
                }
            });

            await addButton(await k('options_ui_theme_title'), await k('options_ui_theme_desc'), async () => {
                page('themesel');
            }, await k('open'));

            break;
        case 'inst':
            var isSteam = await window.electronAPI.invoke('isCurrentIndexSteam', []);

            await addButton(await k('options_inst0_title'), await k('options_inst0_desc'), async () => {
                await window.electronAPI.invoke('removeSteamIntegration', []);
            }, await k('disconnect'), isSteam, await k('options_inst0_onlysteam'));

            await addButton(await k('options_inst1_title'), await k('options_inst1_desc'), async () => {
                page('installmanager');
            }, await k('open'));

            break;
        case 'adv':
            await addRowHeader(icon('warning', '20px') + ' ' + await k('options_adv0_warn'));

            await addButton(await k('options_adv0_title'), await k('options_adv0_desc'), async () => {
                await window.electronAPI.invoke('importPatcher', []);
            }, await k('choose'));

            await addButton(await k('options_adv1_title'), await k('options_adv1_desc'), async () => {
                var goOn = await htmlAlert(
                        'Warning', 
                        await k('options_adv1_warning'), 
                        [{text:await k('yes'),resolveWith:'ok'}, {text:await k('no'),rejectWith:'cancel'}]
                    );
                await window.electronAPI.invoke('rebootDev', [])
            }, await k('open'), !await window.electronAPI.invoke('isDevMode', []), await k('options_adv1_alreadydev'));

            await addButton(await k('options_adv2_title'), await k('options_adv2_desc'), async () => {
                await window.electronAPI.invoke('precalcGameHashes', []);
                await htmlAlert(await k('done'),await k('operation_successful'),[{text: await k('ok'), resolveWith:''}]);
            }, await k('open'));

            await addButton(await k('options_adv3_title'), await k('options_adv3_desc'), async () => {
                var res = await window.electronAPI.invoke('installDeltamodCLI', []);
                if (res) {
                    await htmlAlert(await k('done'),await k('operation_successful'),[{text: await k('ok'), resolveWith:''}]);
                }
            }, await k('open'));

            break;
        // dev isnt keyed and is always in english
        case "dev":
            await addRowHeader(icon('warning', '20px') + ' ' + await k('options_dev0_warn'));
            await addButton('Open flag database (DEV-ONLY)', 'Opens the database holding flags.', async () => {
                await window.electronAPI.invoke('openFlagDatabase', []);
            }, await k('open'));
            await addButton('Decrypt GameBanana account token (DEV-ONLY)', 'Decrypts your GameBanana account token from the default encryption and saves it to your desktop.', async () => {
                await window.electronAPI.invoke('dev_getGBToken', []);
                await htmlAlert(await k('done'),await k('operation_successful'),[{text: await k('ok'), resolveWith:''}]);
            }, await k('open'));
            await addButton('Force controller mode (DEV-ONLY)', 'Forces Controller Mode on, regardless of controller detection status', async () => {
                await window.electronAPI.invoke('cmode-on', []);
            }, await k('open'));
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
            td.innerHTML = await k('loading');

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
        case 'lang':
            var langs = await window.electronAPI.invoke('obtainLangs', []);
            var currentLang = await window.electronAPI.invoke('getLang', []);

            for (let i = 0; i < langs.length; i++) {
                const lang = langs[i];
                const tr = document.createElement('tr');
                
                const tdContent = document.createElement('td');
                const img = document.createElement('img');
                img.src = 'deltapack://langs/' + lang.code + '/flag.png';
                img.style.width = '30px';
                img.style.height = '30px';
                img.style.marginRight = '10px';
                img.style.verticalAlign = 'middle';
                tdContent.appendChild(img);
                
                const span = document.createElement('span');
                span.innerText = lang.name;
                tdContent.appendChild(span);
                tdContent.appendChild(document.createElement('br'));

                const small = document.createElement('small');
                small.className = 'calibri';
                small.style.marginTop = '10px';
                small.innerHTML = `${icon('attribution', '15px')} ${lang.author}`;
                tdContent.appendChild(small);
                tr.appendChild(tdContent);
                
                const tdButton = document.createElement('td');
                tdButton.className = 'center';
                const button = document.createElement('button');
                button.innerText = await k('select');
                button.disabled = lang.code == currentLang;
                button.addEventListener('click', async () => {
                    var res = await window.electronAPI.invoke('setLang', [lang.code]);
                    if (!res) {
                        // hardcode ts since we can't fetch language strings without a language
                        await htmlAlert("Error", "This language could not be loaded correctly.", [{text: await k('ok'), resolveWith:''}]);
                        return;
                    }
                    page("");
                });
                tdButton.appendChild(button);
                tr.appendChild(tdButton);
                
                tbody.appendChild(tr);
            }
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