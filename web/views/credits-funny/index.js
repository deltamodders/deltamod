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

    document.getElementById('credits').innerHTML = `<span><b style="font-weight: bold !important;">Authors of thy work:</b></span>`;
    gbpage._aCredits.forEach(group => {
        group._aAuthors.forEach(credit => {
            if (document.getElementById('credits').innerHTML.includes(credit._sName)) return;
            document.getElementById('credits').innerHTML += `<br><span><i>${credit._sName}</i></span>`;
        });
    });
})();