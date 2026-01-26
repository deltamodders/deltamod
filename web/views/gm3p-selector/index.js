/**
 * Filters assets to find the specific GM3P download we need
 * This is to keep users from downloading the nupkg or "From Toolmakers" versions of GM3P
 * If there are any changes in how GM3P versions are released, feel free to modify this function!
 * (Although GM3P is kind of dead by now, so we are trying to switch away from it...)
 * @param {any[]} assets 
 * @returns {any[]}
 */
function filterAssets(assets) {
    if (assets.length == 1) {
        return assets;
    }

    const filteredAssets = assets.filter((asset) => {
        /** @type {string} */
        const name = asset.name;

        const filenameComps = name.split('.');
        const fileExtension = filenameComps[filenameComps.length - 1];
        // filter out nupkgs
        if (fileExtension == 'nupkg') {
            return false;
        }
        // filter out GM3P for Toolmakers
        if (filenameComps.includes('Toolmakers')) {
            return false;
        }

        return true;
    });

    return filteredAssets;
}

(async() => {
    var curpatch = 'deltamodders/GM3P';
    if (window._pageArguments && window._pageArguments.curpatch) {
        curpatch = window._pageArguments.curpatch;
    }
    document.getElementById('viewPatcher').value = curpatch;
    if (!navigator.onLine) {
        await htmlAlert("Offline", "You appear to be offline. Please connect to the internet to view releases.", [{text:'OK',resolveWith:'ok'}],'cloud_alert');
        page('options');
        return;
    }
    var releases = await fetch(`https://api.github.com/repos/${curpatch}/releases`);
    var viewport = document.querySelector('.releases');
    var code = releases.status;
    if (code != 200) {
        await htmlAlert("An error occurred", `An error occurred while fetching releases from GitHub. Your requests may have been blocked by their servers. (Status code: ${code})`, [{text:'OK',resolveWith:'ok'}],'cloud_alert');
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
        title.innerHTML = icon('deployed_code','25px') + ' ' + release.name + (release.prerelease ? ' <span style="color:orange;">(Beta)</span>' : ' <span style="color:green;">(Stable)</span>');

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
            for (const asset of filterAssets(json.assets)) {
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

    genbtnstyles();
})();

document.getElementById('viewPatcher').oninput = () => {
    window._pageArguments = {};
    window._pageArguments.curpatch = document.getElementById('viewPatcher').value;
    page("gm3p-selector");
};