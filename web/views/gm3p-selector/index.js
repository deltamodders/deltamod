(async() => {
    var releases = await fetch('https://api.github.com/repos/deltamodders/GM3P/releases');
    var viewport = document.querySelector('.releases');
    var code = releases.status;
    if (code != 200) {
        await htmlAlert("An error occurred", `An error occurred while fetching releases from GitHub. Your requests may have been blocked by their servers. (Status code: ${code})`, [{text:'OK',resolveWith:'ok'}]);
        page('options');
        return;
    }
    var releasesData = await releases.json();

    for (const release of releasesData) {

        const releaseCard = document.createElement('div');
        releaseCard.className = 'releasecard';

        const title = document.createElement('span');
        title.className = 'str';
        title.style.fontSize = '30px';
        title.innerHTML = release.name + (release.prerelease ? ' <span style="color:orange;">(Beta)</span>' : ' <span style="color:green;">(Stable)</span>');

        const description = document.createElement('p');
        description.className = 'desc calibri';
        description.style.marginTop = '8px';
        description.style.fontStyle = 'italic';
        description.style.color = '#ccc';
        description.style.marginBottom = '8px';
        description.innerHTML = release.body ? release.body.replaceAll('\n', '<br>') : 'No description provided.';

        const desc = document.createElement('span');
        desc.className = 'desc calibri';
        desc.innerHTML = `<img src="${release.author.avatar_url}" alt="Author avatar" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-right:8px;">
        Released by <strong>${release.author.login}</strong> on <strong>${new Date(release.published_at).toLocaleDateString()}</strong>`;

        const res = await fetch(release.url);
        const code = res.status;
        const json = await res.json();

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'asset-buttons';

        if (Array.isArray(json.assets) && json.assets.length) {
            for (const asset of json.assets) {
                const btn = document.createElement('button');
                btn.style.display = 'block';
                btn.style.marginBottom = '8px';
                btn.textContent = `Download ${asset.name}`;
                btn.onclick = () => {
                    window.electronAPI.invoke('downloadGM3P', [asset.browser_download_url]);
                };
                buttonContainer.appendChild(btn);
            }
        } else {
            const noAssets = document.createElement('span');
            noAssets.textContent = (code == 403) ? 'GitHub is rate limiting your requests, and thus no assets can be downloaded.' : 'No assets available for this release.';
            buttonContainer.appendChild(noAssets);
        }

        releaseCard.appendChild(title);
        releaseCard.appendChild(desc);
        releaseCard.appendChild(description);
        releaseCard.appendChild(buttonContainer);
        viewport.appendChild(releaseCard);
    }
})();