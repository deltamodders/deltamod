function purifyDescription(desc) {
    var final = desc;
    final = desc.replace(/\n/g, ' ').substring(0, 100);
    if (desc.length > 100) final += '...';
    return final;
}

function purify(text) {
    return text.replace(/<[^>]*>/g, '');
}

async function createMod(mod) {
    const modRow = document.createElement('tr');

    // Column 1 (Mod)
    const modNameContainer = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.innerText = mod.name;
    titleSpan.id = `modtitle-${mod.uid}`;
    modNameContainer.appendChild(titleSpan);
    modNameContainer.appendChild(document.createElement('br'));

    const descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.style = 'font-size: 10px; color: #ffffffdd;';
    descSpan.innerText = purifyDescription(mod.description);
    descSpan.id = `moddesc-${mod.uid}`;
    modNameContainer.appendChild(descSpan);

    let authorSpan = document.createElement('p');
    authorSpan = adaptForIcons(authorSpan);
    authorSpan.style.margin = '0px';
    authorSpan.style.marginTop = '4px';
    authorSpan.className = 'calibri';
    authorSpan.style.fontSize = 'smaller';
    authorSpan.style.color = '#888';
    authorSpan.innerHTML = `${icon('person', 'small')} ${purify(mod.author.join(', '))}`;
    authorSpan.id = `modauthor-${mod.uid}`;
    modNameContainer.appendChild(document.createElement('br'));
    modNameContainer.appendChild(authorSpan);

    let sizeSpan = document.createElement('p');
    sizeSpan = adaptForIcons(sizeSpan);
    sizeSpan.style.margin = '0px';
    sizeSpan.style.marginTop = '4px';
    sizeSpan.className = 'calibri';
    sizeSpan.style.fontSize = 'smaller';
    sizeSpan.style.color = '#888';
    sizeSpan.innerHTML = `${icon('hard_disk', 'small')} ${mod.size} MB`;
    sizeSpan.id = `modsize-${mod.uid}`;
    modNameContainer.appendChild(sizeSpan);

    // Column 2 (Actions)
    const actionContainer = document.createElement('td');
    actionContainer.className = 'modlist-actions-column';
    {
        const exploreModButton = document.createElement('button');
        exploreModButton.onclick = () => window.electronAPI.invoke('openModFolder', [mod.folder]);
        exploreModButton.innerHTML = icon('folder_eye', '20px');
        actionContainer.appendChild(exploreModButton);

        const deleteModButton = document.createElement('button');
        deleteModButton.onclick = () => window.electronAPI.invoke('removeMod', [mod.folder]);
        deleteModButton.innerHTML = icon('delete_forever', '20px');
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

(async () => {
    const errorBanner = document.getElementById("error-banner");

    var { modList, errors } = await window.electronAPI.invoke('getModListFull', []);
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
        td.innerText = 'No mods found.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        document.getElementById('modlist').appendChild(tr);
    }
})();