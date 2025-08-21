const GB_URL = 'https://gamebanana.com/apiv11/Wip/94135/ProfilePage';

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

    document.querySelector('.gbcredits').innerHTML = '';

    gbpage._aCredits.forEach(group => {
        var h3 = document.createElement('h2');
        h3.className = 'calibri';
        h3.innerText = group._sGroupName;
        document.querySelector('.gbcredits').appendChild(h3);

        group._aAuthors.forEach(credit => {
            var p = document.createElement('a');
            p.style.marginTop = '0';
            p.style.display = 'block';
            p.href = credit._sProfileUrl;
            p.style.marginBottom = '0';
            p.innerHTML = credit._sName;
            p.style.color = 'white';
            p.className = 'calibri';
            document.querySelector('.gbcredits').appendChild(p);
        });
    });
})();