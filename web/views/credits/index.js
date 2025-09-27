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

    gbpage._aCredits.forEach(group => {
        var div = document.createElement('div');
        div.className = 'credits-group';

        var groupname = document.createElement('span');
        groupname.className = 'credits-header';
        groupname.innerText = group._sGroupName;

        var authorsDiv = document.createElement('div');
        authorsDiv.className = 'credits-developers';

        group._aAuthors.forEach(credit => {
            var personname = document.createElement('span');
            personname.onclick = () => window.open(credit._sProfileUrl);
            personname.innerHTML = `${credit._sName}`;
            personname.className = 'credits-author';

            if (credit._sRole) {
                tippy(personname, {
                    content: credit._sRole,
                });
            }

            authorsDiv.appendChild(personname);
        });

        div.appendChild(groupname);
        div.appendChild(authorsDiv);
        credits.appendChild(div);
    });
})();

(async() => {
    var version = await window.electronAPI.invoke('version',[]);
    var gitCommit = await window.electronAPI.invoke('myCommitInfo',[]);
    document.querySelector('#version').innerText = `Deltamod ${version}`;
    if (gitCommit) {
        document.querySelector('#version').innerHTML += `${gitCommit}`;
    }
})();