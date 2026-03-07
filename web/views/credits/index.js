const GB_URL = 'https://gamebanana.com/apiv11/Tool/20575/ProfilePage';

(async() => {
    try {
        console.log('Obtaining credits from ' + GB_URL);
        var gbpage = await fetch(GB_URL).then(r => r.json());
        localStorage.setItem('gbpage', JSON.stringify(gbpage));
    }
    catch (e) {
        if (localStorage.getItem('gbpage')) {
            var gbpage = JSON.parse(localStorage.getItem('gbpage'));
        } else {
            console.error('Failed to fetch GameBanana profile page:', e);
            window.alert('Failed to load credits! You must be online to view credits.');
            page('main');
            return;
        }
    }

    var credits = document.querySelector('.gbcredits');
    credits.innerHTML = '';

    var madeUsers = [];

    gbpage._aCredits.forEach(group => {
        var groupTitle = document.createElement('span');
        groupTitle.innerText = group._sGroupName;
        groupTitle.style.fontSize = '1.2em';
        credits.appendChild(groupTitle);
        group._aAuthors.forEach(credit => {
            var personname = document.createElement('span');
            personname.onclick = () => window.open(credit._sProfileUrl);
            personname.innerHTML = `${navigator.onLine ? `<img src="${credit._sAvatarUrl}" alt="${credit._sName}" class="credits-avatar">` : ''} ${credit._sName}`;
            personname.className = 'credits-author calibri';

            madeUsers.push(credit._sName);

            if (credit._sRole) {
                tippy(personname, {
                    content: credit._sRole,
                });
            }

            credits.appendChild(personname);
        });
    });
})();

(async() => {
    var version = (await window.electronAPI.invoke('version',[]));

    var gitCommit = await window.electronAPI.invoke('myCommitInfo',[]);
    document.querySelector('#version').innerText = `Deltamod ${version}`;
    if (gitCommit) {
        document.querySelector('#version').innerHTML += `${gitCommit}`;
    }

    if (!navigator.onLine) {
        document.querySelector('#discordBtn').disabled = true;
        document.querySelector('#discordBtn').style.opacity = 0.5;
        document.querySelector('#discordBtn').innerHTML += ' (Offline)';
    }
})();