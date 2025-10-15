(async() => {
    var themes = await window.electronAPI.invoke('getThemes', []);
    var currentTheme = await window.electronAPI.invoke('getTheme', []);

    for (let i = 0; i < themes.length; i++) {
        let theme = themes[i];

        var tr = document.createElement('tr');
        document.querySelector('tbody').appendChild(tr);
        
        var td1 = document.createElement('td');
        td1.classList.add('theme-entry');

        var name = document.createElement('span');
        name.innerText = theme.name;
        td1.appendChild(name);

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