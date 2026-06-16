(async () => {
    var modlist = (await invoke('getModList', [])).modList;
    var tbody = document.getElementById('mod-list');
    for (const mod of modlist) {
        var modTR = document.createElement('tr');

        var modTD = document.createElement('td');
        modTR.appendChild(modTD);

        var containerDiv = document.createElement('div');
        containerDiv.style.display = 'flex';
        containerDiv.style.alignItems = 'center';
        containerDiv.style.gap = '10px';
        modTD.appendChild(containerDiv);

        let imeta = await window.electronAPI.invoke('getModImage', [mod.uid]);
        if (!imeta.path) {
            imeta.path = 'deltapack://web/img/mod-placeholder.png';
        }

        var modIcon = document.createElement('img');
        modIcon.src = imeta.path;
        modIcon.style.width = '32px';
        modIcon.style.height = '32px';
        if (!mod.gamebanana.supports) {
            modIcon.style.filter = 'grayscale(100%)';
        }
        containerDiv.appendChild(modIcon);

        var modInfoDiv = document.createElement('div');
        containerDiv.appendChild(modInfoDiv);

        var modName = document.createElement('span');
        modName.textContent = mod.name;
        modInfoDiv.appendChild(modName);

        if (!mod.gamebanana.supports) {
            modInfoDiv.appendChild(document.createElement('br'));
            var unsupportedTag = document.createElement('span');
            unsupportedTag.textContent = 'Only mods downloaded from GameBanana are supported';
            unsupportedTag.style.color = 'rgba(255,255,255,0.5)';
            unsupportedTag.style.fontSize = '0.8em';
            unsupportedTag.style.marginLeft = '5px';
            modInfoDiv.appendChild(unsupportedTag);
        }

        tbody.appendChild(modTR);

        if (mod.gamebanana.supports) {
            var checkboxTD = document.createElement('td');
            checkboxTD.style.textAlign = 'center';
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.model = mod.gamebanana.model;
            checkbox.dataset.id = mod.gamebanana.id;
            checkbox.dataset.name = mod.name;
            checkbox.dataset.pid = mod.packageID;
            checkbox.addEventListener('click', (e) => {
                if (document.querySelectorAll('#mod-list input[type="checkbox"]:checked').length > 0) {
                    document.getElementById('export-btn').disabled = false;
                }
                else {
                    document.getElementById('export-btn').disabled = true;
                }
            });
            checkboxTD.appendChild(checkbox);
            modTR.appendChild(checkboxTD);
        }
        else {
            var emptyTD = document.createElement('td');
            emptyTD.style.textAlign = 'center';
            modTR.appendChild(emptyTD);

            emptyTD.innerHTML = icon('do_not_disturb_on', '2em');
        }
    }
})();

window.currentPageStack.exportMods = async function() {
    var checkboxes = document.querySelectorAll('#mod-list input[type="checkbox"]');
    var selectedMods = [];
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            selectedMods.push({
                model: checkbox.dataset.model,
                id: checkbox.dataset.id,
                name: checkbox.dataset.name,
                pid: checkbox.dataset.pid
            });
        }
    });

    await invoke('gamebanana_importToCollection', [window._pageArguments.collectionId, selectedMods]);

    await htmlAlert(await k('done'), await k('selected_mods_imported'), [{
        text: await k('ok'),
        resolveWith: 'ok'
    }]);

    window._pageArguments = {};

    page('collections');
};