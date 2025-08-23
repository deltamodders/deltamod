function purifyDescription(desc) {
    var final = desc;
    final = desc.replace(/\n/g, ' ').substring(0, 100);
    if (desc.length > 100) final += '...';
    return final;
}

async function createMod(mod) {
    const modRow = document.createElement('tr');

    // Column 1 (Mod)
    const modNameContainer = document.createElement('td');
    
    const bigAhhContainer = document.createElement('div');
    bigAhhContainer.style.display = 'flex';
    bigAhhContainer.style.alignItems = 'center';
    bigAhhContainer.style.gap = '10px';
    bigAhhContainer.style.justifyContent = 'left';

    let IMAGE_DIMENSION = 32;
    const imageContainer = document.createElement('div');
    imageContainer.style.width = IMAGE_DIMENSION + 'px';
    imageContainer.style.height = IMAGE_DIMENSION + 'px';
    
    let imeta = await window.electronAPI.invoke('getModImage', [mod.uid]);
    if (!imeta.path) {
        imeta.path = 'deltapack://web/mod-placeholder.png';
    }

    const img = document.createElement('img');
    img.src = (imeta.path.includes('deltapack') ? '' : "packet://") + imeta.path;
    img.style.width = IMAGE_DIMENSION + 'px';
    img.style.height = IMAGE_DIMENSION + 'px';
    img.style.objectFit = 'contain';
    imageContainer.appendChild(img);

    const infoContainer = document.createElement('div');
    const titleSpan = document.createElement('span');
    titleSpan.innerText = mod.name;
    titleSpan.id = `modtitle-${mod.uid}`;
    infoContainer.appendChild(titleSpan);
    infoContainer.appendChild(document.createElement('br'));

    const descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.innerText = purifyDescription(mod.description);
    descSpan.id = `moddesc-${mod.uid}`;
    infoContainer.appendChild(descSpan);

    const authorSpan = document.createElement('span');
    authorSpan.className = 'calibri';
    authorSpan.style.fontSize = 'smaller';
    authorSpan.style.color = '#888';
    authorSpan.innerText = `Authors: ${mod.author.join(', ')}`;
    authorSpan.id = `modauthor-${mod.uid}`;
    infoContainer.appendChild(document.createElement('br'));
    infoContainer.appendChild(authorSpan);

    bigAhhContainer.appendChild(imageContainer);
    bigAhhContainer.appendChild(infoContainer);

    modNameContainer.appendChild(bigAhhContainer);

    // Column 2 (Actions)
    const actionContainer = document.createElement('td');
    actionContainer.className = 'modlist-actions-column';
    {
        const enabled = document.createElement("input");
        enabled.type = 'checkbox';
        enabled.id = `modcheck-${mod.uid}`;
        enabled.checked = await window.electronAPI.invoke('getModState', [mod.uid]);
        enabled.onchange = e => {
            const c = e.target;
            const isEnabled = c.checked;
            const forMod = mod.uid;

            window.electronAPI.invoke("toggleModState", [forMod, isEnabled]);
        };
        actionContainer.appendChild(enabled);

        const exploreModButton = document.createElement('button');
        exploreModButton.onclick = () => window.electronAPI.invoke('openModFolder', [mod.folder]);
        exploreModButton.innerText = "🔎";
        actionContainer.appendChild(exploreModButton);

        const deleteModButton = document.createElement('button');
        deleteModButton.onclick = () => window.electronAPI.invoke('removeMod', [mod.folder]);
        deleteModButton.innerText = "🗑️";
        actionContainer.appendChild(deleteModButton);
    }

    modRow.appendChild(modNameContainer);
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
    window.electronAPI.invoke('changeSystemIndex', [""+index])
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
        td.colSpan = 2;
        td.innerText = 'No compatible mods found.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        document.getElementById('modlist').appendChild(tr);

        document.getElementById('par').innerText = 'Run without patches';
    }

    var sysindex = await window.electronAPI.invoke('getSystemIndex', []);
    var maxindex = await window.electronAPI.invoke('getMaxExistingIndex', []);

    console.log(`System index: ${sysindex}, Max index: ${maxindex[0]}`);

    var i = -1;
    while (i < maxindex[0]) {
        i++;
        var option = document.createElement('option');
        option.value = i;
        if (i === sysindex) {
            option.selected = true;
        }
        var edition = await window.electronAPI.invoke('getEditionByIndex', [i]);
        option.innerText = `Install ${i + 1} (${edition})`;
        document.getElementById('installs').appendChild(option);
    }
    var newOption = document.createElement('option');
    newOption.value = parseInt(maxindex[0]) + 1;
    newOption.innerHTML = '<i>New...</i>';
    document.getElementById('installs').appendChild(newOption);
    document.getElementById('installs').value = sysindex;
    document.getElementById('installs').addEventListener('change', (e) => {
        loadInst(parseInt(e.target.value));
    });
})();

function patchAndRun() {
    var allChecks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.id.startsWith('modcheck-'));
    var selectedMods = allChecks.filter(cb => cb.checked).map(cb => cb.id.replace('modcheck-', ''));
    console.log('Selected mods:', selectedMods);
    page('patching');
    window.electronAPI.invoke('patchAndRun',[selectedMods]);
}

window.currentPageStack.patchAndRun = patchAndRun;

window.currentPageStack.disableMusic = async function(button) {
    audio.pause();
    audio.currentTime = 0;
    button.style.display = 'none';
    button.disabled = true;
    await window.electronAPI.invoke('setUniqueFlag', ["AUDIO", false]);
};

(async () => {
    var audioEnabled = await window.electronAPI.invoke('getUniqueFlag', ["AUDIO"]);
    if (audioEnabled) {
        document.getElementById('audioBtn').style.display = 'block';
    }
    else {
        document.getElementById('audioBtn').style.display = 'none';
    }
})();