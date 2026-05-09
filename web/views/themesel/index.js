(async() => {
    var themes = (await window.electronAPI.invoke('getThemes', [])).sort((a, b) => {
        if (a.builtIn && !b.builtIn) return -1;
        if (!a.builtIn && b.builtIn) return 1;
        if (a.timed && !b.timed) return -1;
        if (!a.timed && b.timed) return 1;
        const aExpired = a.timed && Date.now() > a.timedExpire;
        const bExpired = b.timed && Date.now() > b.timedExpire;
        if (!aExpired && bExpired) return -1;
        if (aExpired && !bExpired) return 1;
        return a.name.localeCompare(b.name);
    });
    var currentTheme = await window.electronAPI.invoke('getTheme', []);

    for (let i = 0; i < themes.length; i++) {
        let theme = themes[i];

        if (theme.hiddenByDefault && theme.id != currentTheme) continue;

        var tr = document.createElement('tr');
        document.querySelector('tbody').appendChild(tr);

        var td0 = document.createElement('td');
        td0.classList.add('theme-entry');
        td0.style.backgroundImage = `url('themeprot://img/${theme.background}')`;
        td0.style.backgroundSize = 'cover';
        td0.style.backgroundRepeat = 'no-repeat';
        tr.appendChild(td0);
        
        var td1 = document.createElement('td');
        td1.classList.add('theme-entry');

        var name = document.createElement('span');
        name.innerText = theme.name;
        name.style.fontSize = '1.2em';
        td1.appendChild(name);

        td1.appendChild(document.createElement('br'));
        
        var desc = document.createElement('span');
        desc.innerText = `${theme.description}`;
        desc.classList.add('calibri');
        desc.style.fontSize = '0.9em';
        td1.appendChild(desc);

        var mfxTag = document.createElement('span');
        mfxTag.style.display = 'block';
        mfxTag.style.marginTop = '0.5em';
        mfxTag.innerHTML = icon('audio_file', '0.8em') + ` ${theme.musicTrack}`;
        mfxTag.classList.add('calibri');
        mfxTag.style.fontSize = '0.8em';
        td1.appendChild(mfxTag);

        var ogTag = document.createElement('span');
        ogTag.style.display = 'block';
        ogTag.style.marginTop = '0.5em';
        ogTag.innerHTML = icon('where_to_vote', '0.8em') + ` ${theme.builtIn ? await k('themesel_builtin') : await k('themesel_custom')}`;
        ogTag.classList.add('calibri');
        ogTag.style.fontSize = '0.8em';
        td1.appendChild(ogTag);

        var td2 = document.createElement('td');
        td2.classList.add('theme-entry');

        var selectbtn = document.createElement('button');
        selectbtn.innerHTML = icon('check_box_outline_blank', '25px');
        if (theme.id == currentTheme) {
            selectbtn.disabled = true;
            selectbtn.style.opacity = 0.5;
            selectbtn.innerHTML = icon('check_box', '25px');
            selectbtn.style.cursor = 'not-allowed';
        }
        selectbtn.addEventListener('click', async () => {
            await window.electronAPI.invoke('setTheme', [theme.id]);

            themeRefresh(true);
        });

        td2.style.textAlign = 'center';

        td2.appendChild(selectbtn);

        if (!theme.builtIn) {
            var deletebtn = document.createElement('button');
            deletebtn.innerHTML = icon('delete', '25px');
            deletebtn.style.marginLeft = '0.5em';
            deletebtn.addEventListener('click', async () => {
                if (theme.id == currentTheme) { 
                    await window.electronAPI.invoke('setTheme', ['base']);

                    themeRefresh(true);
                }
                await window.electronAPI.invoke('deleteCustomTheme', [theme.id]);
            });
            td2.appendChild(deletebtn);

            name.contentEditable = true;
            desc.contentEditable = true;

            name.addEventListener('blur', async () => {
                if (name.innerText.trim() === "") name.innerText = theme.name;
                await window.electronAPI.invoke('renameCustomTheme', [theme.id, name.innerText.trim(), desc.innerText.trim()]);
            });

            desc.addEventListener('blur', async () => {
                if (desc.innerText.trim() === "") desc.innerText = theme.description;
                await window.electronAPI.invoke('renameCustomTheme', [theme.id, name.innerText.trim(), desc.innerText.trim()]);
            });
        }

        tr.appendChild(td1);
        tr.appendChild(td2);
    }

    genbtnstyles();
})();
let spamtennaBuffer = '';
    let spamtennaDetected = false;

    const handleSpamtennaKeydown = (event) => {
        if (spamtennaDetected) return;

        if (event.key.length === 1) {
            spamtennaBuffer = (spamtennaBuffer + event.key.toLowerCase()).slice(-9);
            if (spamtennaBuffer === 'spamtenna') {
                spamtennaDetected = true;
                invoke('setTheme', ['spamtenna']);
                themeRefresh(true);
                page('main');

            }
        } else if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Escape') {
            spamtennaBuffer = '';
        }
    };

elisten(document, 'keydown', handleSpamtennaKeydown);
