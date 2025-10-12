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

        var json = await (await fetch(release.url)).json();

        var buttonContainer = document.createElement('div');
        buttonContainer.className = 'asset-buttons';

        if (Array.isArray(json.assets) && json.assets.length) {
            json.assets.forEach(asset => {
            var btn = document.createElement('button');
            btn.style.display = 'block';
            btn.style.marginBottom = '8px';
            btn.textContent = `Download ${asset.name}`;
            btn.onclick = () => {
                window.electronAPI.invoke('downloadGM3P', [asset.browser_download_url]);
            };
            buttonContainer.appendChild(btn);
            });
        } else {
            var noAssets = document.createElement('span');
            noAssets.textContent = 'No assets';
            buttonContainer.appendChild(noAssets);
        }

        var button = buttonContainer;

        releaseCard.appendChild(title);
        releaseCard.appendChild(desc);
        releaseCard.appendChild(button);
        viewport.appendChild(releaseCard);
    });
})();