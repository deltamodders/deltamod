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
        td0.style.backgroundImage = `url('themeprot://${theme.id}/bg.png')`;
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
        mfxTag.innerHTML = icon('audio_file', '0.9em') + ` ${theme.musicTrack}`;
        mfxTag.classList.add('calibri');
        mfxTag.style.fontSize = '0.8em';
        td1.appendChild(mfxTag);

        var ogTag = document.createElement('span');
        ogTag.style.display = 'block';
        ogTag.style.marginTop = '0.5em';
        ogTag.innerHTML = icon('source_environment', '0.9em') + ` ${theme.builtIn ? "Default theme" : "Custom theme"}`;
        ogTag.classList.add('calibri');
        ogTag.style.fontSize = '0.8em';
        td1.appendChild(ogTag);

        if (theme.custom && !theme.builtIn) {
            var securityTag = document.createElement('span');
            securityTag.style.display = 'block';
            securityTag.style.color = 'yellow';
            securityTag.style.marginTop = '0.5em';
            securityTag.innerHTML = icon('security', '0.9em') + ` Contains custom stylesheet`;
            securityTag.classList.add('calibri');
            securityTag.style.fontSize = '0.8em';
            td1.appendChild(securityTag);
        }

        var td2 = document.createElement('td');
        td2.classList.add('theme-entry');

        var selectbtn = document.createElement('button');
        selectbtn.innerHTML = icon('check_box_outline_blank', '15px');
        if (theme.id == currentTheme) {
            selectbtn.disabled = true;
            selectbtn.style.opacity = 0.5;
            selectbtn.innerHTML = icon('check_box', '15px');
            selectbtn.style.cursor = 'not-allowed';
        }
        selectbtn.addEventListener('click', async () => {
            if (theme.custom && !theme.builtIn) {
                var shownSecNotice = localStorage.getItem('themeSecurityNoticeShown');

                if (!shownSecNotice) {
                    var res = await htmlAlert(
                        'Security',
                        'This theme contains a custom stylesheet. Custom stylesheets may be used to obtain some info such as your IP. Are you sure you want to use this theme?',
                        [{ text: 'Yes', resolveWith: "Y"}, {text: 'No', resolveWith: "N"}, {text: 'Yes, and don\'t show this again', resolveWith: "YA"}],
                    );

                    if (res == "N") {
                        return;
                    }
                    if (res == "YA") {
                        localStorage.setItem('themeSecurityNoticeShown', 'true');
                    }
                }
            }
            await window.electronAPI.invoke('setTheme', [theme.id]);

            themeRefresh(true);
        });

        td2.style.textAlign = 'center';

        td2.appendChild(selectbtn);

        if (!theme.builtIn) {
            var deletebtn = document.createElement('button');
            deletebtn.innerHTML = icon('delete', '15px');
            deletebtn.style.marginLeft = '0.5em';
            deletebtn.addEventListener('click', async () => {
                if (theme.id == currentTheme) { 
                    await window.electronAPI.invoke('setTheme', ['base']);

                    themeRefresh(true);
                }
                await window.electronAPI.invoke('deleteCustomTheme', [theme.id]);

                page('themesel');
            });
            td2.appendChild(deletebtn);
        }

        tr.appendChild(td1);
        tr.appendChild(td2);
    }

    genbtnstyles();
})();

(async() => {
    var notice = localStorage.getItem('themeNoticeShown');
    if (!notice) {
        document.getElementById('notice').style.display = 'block';
        localStorage.setItem('themeNoticeShown', 'true');
    }
})();