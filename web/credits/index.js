(async() => {
    try {
        var gbpage = await fetch('https://gamebanana.com/apiv11/Wip/94135/ProfilePage').then(r => r.json());
    }
    catch (e) {
        window.alert('Failed to load credits! You must be online to view credits.');
        page('main');
        return;
    }

    gbpage._aCredits.forEach(group => {
        var h3 = document.createElement('h2');
        h3.className = 'calibri';
        h3.innerText = group._sGroupName;
        document.querySelector('.gbcredits').appendChild(h3);

        group._aAuthors.forEach(credit => {
            var p = document.createElement('p');
            p.style.marginTop = '0';
            p.style.marginBottom = '0';
            p.innerHTML = credit._sName;
            p.className = 'calibri';
            document.querySelector('.gbcredits').appendChild(p);
        });
    });
})();