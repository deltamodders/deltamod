function purifyDescription(desc) {
    if (desc === null || desc === undefined) return '';
    let text = String(desc);
    // Remove any HTML tags first
    text = purify(text);
    // Normalize whitespace/newlines to single spaces
    text = text.replace(/\s+/g, ' ').trim();
    // Truncate safely
    const max = 100;
    if (text.length > max) return text.substring(0, max) + '...';
    return text;
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
    authorSpan.innerHTML = `${icon('attribution', 'small')} ${purify(mod.author.join(', '))}`;
    authorSpan.id = `modauthor-${mod.uid}`;
    modNameContainer.appendChild(document.createElement('br'));
    modNameContainer.appendChild(authorSpan);

    modRow.appendChild(modNameContainer);

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

window.currentPageStack.openGame = async function() {
    await window.electronAPI.invoke('startGame', []);
};

(async () => {
    const errorBanner = document.getElementById("error-banner");

    var { modList, errors } = await window.electronAPI.invoke('getBakedMods', []);
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