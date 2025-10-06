(async() => {
    var releases = await fetch('https://api.github.com/repos/deltamodders/GM3P/releases');
    var viewport = document.querySelector('.releases');
    var releasesData = await releases.json();

    releasesData.forEach(async release => {

        var releaseCard = document.createElement('div');
        releaseCard.className = 'releasecard';

        var title = document.createElement('span');
        title.className = 'str';
        title.style.fontSize = '30px';
        title.innerHTML = release.name + (release.prerelease ? ' <span style="color:orange;">(Beta)</span>' : ' <span style="color:green;">(Stable)</span>');

        var desc = document.createElement('span');
        desc.className = 'desc calibri';
        desc.innerHTML = `<img src="${release.author.avatar_url}" alt="Author avatar" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:8px;">
        Released by <strong>${release.author.login}</strong> on <strong>${new Date(release.published_at).toLocaleDateString()}</strong>`;

        var button = document.createElement('button');
        button.textContent = 'Download and install this';
        button.onclick = async () => {
            var json = await (await fetch(release.url)).json();
            window.electronAPI.invoke('downloadGM3P', [json.assets[0].browser_download_url]);
        };

        releaseCard.appendChild(title);
        releaseCard.appendChild(desc);
        releaseCard.appendChild(button);
        viewport.appendChild(releaseCard);
    });
})();