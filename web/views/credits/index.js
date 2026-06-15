const GB_URL = 'https://gamebanana.com/apiv11/Tool/20575/ProfilePage';

(async() => {
    document.querySelector('#credits').innerHTML = '';
    document.querySelector('#credits').style.opacity = 0;

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


    var madeUsers = [];

    gbpage._aCredits.forEach(group => {
        group._aAuthors.forEach(credit => {
            var pcard = document.createElement('div');
            pcard.className = 'credits-card';
            pcard.style.display = 'inline-block';
            pcard.style.margin = '10px';
            pcard.style.textAlign = 'center';
            document.querySelector('#credits').appendChild(pcard);

            var pfp = document.createElement('img');
            pfp.className = 'credits-pfp';
            pfp.style.borderRadius = '10px';
            pfp.src = credit._sAvatarUrl;
            pcard.appendChild(pfp);

            var personname = document.createElement('div');
            personname.className = 'credits-name';
            personname.innerText = credit._sName;
            pcard.appendChild(personname);

            var desc = document.createElement('div');
            desc.className = 'credits-desc';
            desc.style.fontSize = '0.8em';
            desc.style.opacity = 0.7;
            desc.innerText = credit._sRole;
            pcard.appendChild(desc);

            document.querySelector('#credits').appendChild(pcard);
        });
    });

    document.querySelector('#credits').style.opacity = 1;
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