(async() => {
    var themes = (await window.electronAPI.invoke('getThemes', [])).sort((a, b) => {
        if (a.builtIn && !b.builtIn) return -1;
        if (!a.builtIn && b.builtIn) return 1;
        return a.name.localeCompare(b.name);
    });
    var currentTheme = await window.electronAPI.invoke('getTheme', []);

    for (let i = 0; i < themes.length; i++) {
        let theme = themes[i];

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

        var desc = document.createElement('span');
        desc.innerText = `\n${theme.description}`;
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
        ogTag.innerHTML = icon('where_to_vote', '0.8em') + ` ${theme.builtIn ? 'Built-In Theme' : 'Custom Theme'}`;
        ogTag.classList.add('calibri');
        ogTag.style.fontSize = '0.8em';
        td1.appendChild(ogTag);

        var td2 = document.createElement('td');
        td2.classList.add('theme-entry');

        var selectbtn = document.createElement('button');
        selectbtn.innerText = 'Select';
        if (theme.id == currentTheme) {
            selectbtn.disabled = true;
            selectbtn.style.opacity = 0.5;
            selectbtn.innerText = 'Select';
            selectbtn.style.cursor = 'not-allowed';
        }
        selectbtn.addEventListener('click', async () => {
            await window.electronAPI.invoke('setTheme', [theme.id]);
            currentAudio = "";
            audio.pause();
            page('');
        });
        td2.appendChild(selectbtn);
        tr.appendChild(td1);
        tr.appendChild(td2);
    }
})();