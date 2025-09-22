function purifyDescription(desc) {
    var final = desc;
    final = desc.replace(/\n/g, ' ').substring(0, 100);
    if (desc.length > 100) final += '...';
    return final;
}

function purify(text) {
    return text.replace(/<[^>]*>/g, '');
}

setTimeout(() => {
    document.getElementsByClassName('buttons')[0].style.display = 'block';
}, 500);

function packageAtropos(container) {
    let atroposContainer = document.createElement('div');
    atroposContainer.className = 'atropos-inner';
    atroposContainer.style.width = container.style.width + 10 + 'px';
    atroposContainer.style.height = container.style.height + 10 + 'px';
    atroposContainer.style.display = 'flex';
    atroposContainer.style.alignItems = 'center';
    atroposContainer.style.justifyContent = 'center';
    atroposContainer.appendChild(container);

    let atroposRotate = document.createElement('div');
    atroposRotate.className = 'atropos-rotate';
    atroposRotate.appendChild(atroposContainer);

    let atroposScale = document.createElement('div');
    atroposScale.className = 'atropos-scale';
    atroposScale.appendChild(atroposRotate);

    let atropos = document.createElement('div');
    atropos.classList.add('atropos');
    atropos.appendChild(atroposScale);

    const atroposIniter = Atropos({
        el: atropos,
        activeOffset: 60,
        shadowScale: 1.05,
        highlight: false
    });

    return atropos;
}

async function createMod(mod) {
    let modRow = document.createElement('tr');

    modRow.className = 'modrow';

    // Column 1 (Mod)
    let modNameContainer = document.createElement('td');

    let bigAhhContainer = document.createElement('div');
    bigAhhContainer.style.display = 'flex';
    bigAhhContainer.style.alignItems = 'center';
    bigAhhContainer.style.gap = '10px';
    bigAhhContainer.style.justifyContent = 'left';

    let IMAGE_DIMENSION = 55;
    let imageContainer = document.createElement('div');
    imageContainer.style.width = IMAGE_DIMENSION + 'px';
    imageContainer.style.height = IMAGE_DIMENSION + 'px';

    let imeta = await window.electronAPI.invoke('getModImage', [mod.uid]);
    if (!imeta.path) {
        imeta.path = 'deltapack://web/mod-placeholder.png';
    }

    let img = document.createElement('img');
    img.src = (imeta.path.includes('deltapack') ? '' : "packet://") + imeta.path;
    img.style.width = IMAGE_DIMENSION + 'px';
    img.style.height = IMAGE_DIMENSION + 'px';
    // img.style.borderRadius = '8px';
    img.style.objectFit = 'contain';
    img.setAttribute('data-atropos-offset', '10');
    img.classList.add('mod-image');
    imageContainer.appendChild(img);

    var atroposImgContainer = packageAtropos(img);

    let infoContainer = document.createElement('div');
    let titleSpan = document.createElement('span');
    titleSpan.innerText = mod.name;
    titleSpan.id = `modtitle-${mod.uid}`;
    infoContainer.appendChild(titleSpan);
    infoContainer.appendChild(document.createElement('br'));

    let descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.style = 'font-size: 10px; color: #ffffffdd;';
    descSpan.innerText = purifyDescription(mod.description);
    descSpan.id = `moddesc-${mod.uid}`;
    infoContainer.appendChild(descSpan);

    let flexContnainer = document.createElement('div');
    flexContnainer.style.display = 'flex';
    flexContnainer.style.alignItems = 'center';
    flexContnainer.style.justifyContent = 'left';
    flexContnainer.style.gap = '6px';
    infoContainer.appendChild(flexContnainer);

    let authorSpan = document.createElement('p');
    authorSpan = adaptForIcons(authorSpan);
    authorSpan.style.margin = '0px';
    authorSpan.style.marginTop = '4px';
    authorSpan.className = 'calibri';
    authorSpan.style.fontSize = 'smaller';
    authorSpan.style.color = '#888';
    authorSpan.innerHTML = `${icon('person', 'small')} ${purify(mod.author.join(', '))}`;
    authorSpan.id = `modauthor-${mod.uid}`;
    flexContnainer.appendChild(authorSpan);

    let sizeSpan = document.createElement('p');
    sizeSpan = adaptForIcons(sizeSpan);
    sizeSpan.style.margin = '0px';
    sizeSpan.style.marginTop = '4px';
    sizeSpan.className = 'calibri';
    sizeSpan.style.fontSize = 'smaller';
    sizeSpan.style.color = '#888';
    sizeSpan.innerHTML = `${icon('hard_disk', 'small')} ${mod.size} MB`;
    sizeSpan.id = `modsize-${mod.uid}`;
    flexContnainer.appendChild(sizeSpan);

    let versionSpan = document.createElement('p');
    versionSpan = adaptForIcons(versionSpan);
    versionSpan.style.margin = '0px';
    versionSpan.style.marginTop = '4px';
    versionSpan.className = 'calibri';
    versionSpan.style.fontSize = 'smaller';
    versionSpan.style.color = '#888';
    versionSpan.innerHTML = `${icon('deployed_code_update', 'small')} ${(mod.version ? mod.version : 'Unknown')}`;
    versionSpan.id = `modsize-${mod.uid}`;
    flexContnainer.appendChild(versionSpan);

    bigAhhContainer.appendChild(atroposImgContainer);
    bigAhhContainer.appendChild(infoContainer);

    modNameContainer.appendChild(bigAhhContainer);

    let actionContainer = document.createElement('td');
    actionContainer.style.textAlign = 'center';
    actionContainer.className = 'modlist-actions-column';

    let bdiv = document.createElement('div');
    bdiv.className = 'modlist-actions-column-bdiv';
    actionContainer.appendChild(bdiv);

    let exploreModButton = document.createElement('button');
    exploreModButton.onclick = () => window.electronAPI.invoke('openModFolder', [mod.folder]);
    exploreModButton.innerHTML = icon('folder_eye', '20px');
    bdiv.appendChild(exploreModButton);

    let deleteModButton = document.createElement('button');
    deleteModButton.onclick = () => window.electronAPI.invoke('removeMod', [mod.folder]);
    deleteModButton.innerHTML = icon('delete_forever', '20px');
    bdiv.appendChild(deleteModButton);

    // Column 2 (Actions)
    let enabledContainer = document.createElement('td');
    enabledContainer.style.textAlign = 'center';
    enabledContainer.className = 'modlist-enabled-column';
    {
        let enabled = document.createElement("input");
        enabled.type = 'checkbox';
        enabled.id = `modcheck-${mod.uid}`;
        enabled.checked = await window.electronAPI.invoke('getModState', [mod.uid]);
        enabled.onchange = e => {
            const c = e.target;
            const isEnabled = c.checked;
            const forMod = mod.uid;

            window.electronAPI.invoke("toggleModState", [forMod, isEnabled]);
        };
        enabledContainer.appendChild(enabled);
    }

    modRow.appendChild(modNameContainer);
    modRow.appendChild(enabledContainer);
    modRow.appendChild(actionContainer);

    document.getElementById('modlist').appendChild(modRow);
    return modRow;
}

function createErroringMods(errors) {
    const dialogElement = document.getElementById("error-list-dialog");
    const errorList = document.getElementById("error-list-div");

    for (const child of errorList.children) errorList.removeChild(child);

    for (const err of errors) {
        // err { mod: string, reason: string }
        const element = document.createElement("div");
        element.className = "error-holder";

        const modId = document.createElement("span");
        modId.innerHTML = `Mod ID '${err.mod}'`;

        const reasoning = document.createElement("span");
        reasoning.className = 'calibri';
        reasoning.innerHTML = `<b style='font-weight: bold !important;'>Reason:</b> ${err.reason}`;

        const actionRow = document.createElement("div");
        actionRow.className = "error-buttons";
        {
            // Action Row
            const exploreBtn = document.createElement("button");
            exploreBtn.innerText = "Open Folder";
            exploreBtn.onclick = () => window.electronAPI.invoke("openModFolder", [err.mod]);
            actionRow.appendChild(exploreBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.innerText = "Delete Permanently";
            deleteBtn.onclick = () => window.electronAPI.invoke("removeMod", [err.mod]);
            actionRow.appendChild(deleteBtn);
        }

        element.appendChild(modId);
        element.appendChild(document.createElement("br"));
        element.appendChild(reasoning);
        element.appendChild(actionRow);
        errorList.appendChild(element);
    }

    dialogElement.showModal();
}

function loadInst(index) {
    window.electronAPI.invoke('changeSystemIndex', ["" + index])
}

(async () => {
    const errorBanner = document.getElementById("error-banner");

    var { modList, errors } = await window.electronAPI.invoke('getModList', []);
    modList.forEach(x => createMod(x));

    if (errors.length > 0) {
        errorBanner.onclick = () => createErroringMods(errors);
        errorBanner.children[0].innerText = `${errors.length} mod${errors.length === 1 ? "" : "s"} failed to load`;
        errorBanner.style.display = "inherit";
    } else errorBanner.style.display = "none";

    if (modList.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.innerHTML = 'No comaptible mods were found.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        var entiremodlist = await window.electronAPI.invoke('getModListFull', []);
        if (entiremodlist.modList.length == 0) {
            let small = document.createElement('small');
            small.innerHTML = 'You can download mods on GameBanana with the 1-Click Mod Download or press the ' + icon('add_box', 'small') + ' button below to open a downloaded Deltamod pack.';
            small.style.color = '#888';
            td.appendChild(document.createElement('br'));
            td.appendChild(small);
        }
        document.getElementById('modlist').appendChild(tr);

        //document.getElementById('par').innerText = 'Run without patches';
    }
})();

function patchAndRun() {
    var allChecks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.id.startsWith('modcheck-'));
    var selectedMods = allChecks.filter(cb => cb.checked).map(cb => cb.id.replace('modcheck-', ''));
    console.log('Selected mods:', selectedMods);
    page('patching');
    window.electronAPI.invoke('patchAndRun', [selectedMods]);
}

window.currentPageStack.patchAndRun = patchAndRun;

window.currentPageStack.disableMusic = async function (button) {
    audio.pause();
    audio.currentTime = 0;
    button.style.display = 'none';
    button.disabled = true;
    await window.electronAPI.invoke('setUniqueFlag', ["AUDIO", false]);
    await window.electronAPI.invoke('setUniqueFlag', ["DAB", true]);
};