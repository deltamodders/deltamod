const GB_URL = 'https://gamebanana.com/apiv11/Tool/20575/ProfilePage';

(async() => {
    document.querySelector('#credits').innerHTML = '';
    document.querySelector('#credits').style.opacity = 0;

    var version = (await window.electronAPI.invoke('version',[]));
    document.querySelector('#version').innerText = 'Deltamod ' + version;

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
            if (madeUsers.includes(credit._sName)) return;
            madeUsers.push(credit._sName);

            var box = document.createElement('div');
            box.className = 'creditsBox';

            var pfp = document.createElement('img');
            pfp.className = 'credits-pfp';
            pfp.style.borderRadius = '10px';
            pfp.src = credit._sAvatarUrl || 'https://images.gamebanana.com/static/img/defaults/avatar.gif';

            var infoDiv = document.createElement('div');
            infoDiv.className = 'credits-info';

            var name = document.createElement('p');
            name.className = 'credits-name';
            name.innerText = credit._sName;
            infoDiv.appendChild(name);

            var role = document.createElement('p');
            role.className = 'credits-role';
            role.innerText = credit._sRole;
            infoDiv.appendChild(role);

            document.querySelector('#credits').appendChild(box);
            box.appendChild(pfp);
            box.appendChild(infoDiv);
        });
    });

    document.querySelector('#credits').style.opacity = 1;
})();