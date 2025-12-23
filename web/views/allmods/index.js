function purifyDescription(desc) {
    if (desc === null || desc === undefined) return '';
    let text = String(desc);
    // Remove any HTML tags first
    text = purify(text);
    // Normalize whitespace/newlines to single spaces
    text = text.replace(/\s+/g, ' ').trim();
    // Only add some words
    const maxWords = 25;
    const words = text.split(' ').slice(0, maxWords);
    text = words.join(' ') + (words.length >= maxWords ? '...' : '');
    // If too long, truncate as last resort
    const max = 150;
    if (text.length > max) return text.substring(0, max) + '...';
    return text;
}

function purify(text) {
    return text.replace(/<[^>]*>/g, '');
}

async function createMod(mod, compatible) {
    const modRow = document.createElement('tr');

    // Column 1 (Mod)
    const modNameContainer = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.innerText = mod.name;
    titleSpan.id = `modtitle-${mod.uid}`;
    modNameContainer.appendChild(titleSpan);
    modNameContainer.appendChild(document.createElement('br'));

    if (window._pageArguments && window._pageArguments.highlightMod === mod.uid) {
        modNameContainer.style.backgroundColor = '#b5b5b544';
        setTimeout(() => {
            try {
                modNameContainer.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch (e) {
                modNameContainer.scrollIntoView();
            }
        }, 50);
        window._pageArguments = null; // Clear it so it doesn't affect other mods
    }

    const descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.style = 'font-size: 10px; color: #ffffffdd;';
    descSpan.innerText = purifyDescription(mod.description);
    descSpan.style.cursor = 'pointer';
    descSpan.onclick = () => {
        const fullDesc = purify(mod.description);
        if (fullDesc.length === 0) return;
        htmlAlert(mod.name, fullDesc, [{ text: 'Close', resolveWith: 'Ok' }]);
    }
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

    let idSpan = document.createElement('p');
    idSpan = adaptForIcons(idSpan);
    idSpan.style.margin = '0px';
    idSpan.style.marginTop = '4px';
    idSpan.className = 'calibri';
    idSpan.style.fontSize = 'smaller';
    idSpan.style.color = '#888';
    idSpan.innerHTML = `${icon('sell', 'small')} ${mod.packageID == 'und.und.und' ? '<i>No ID was specified.</i>' : mod.packageID}`;
    idSpan.id = `modid-${mod.uid}`;
    modNameContainer.appendChild(idSpan);

    let gameSpan = document.createElement('p');
    gameSpan = adaptForIcons(gameSpan);
    gameSpan.style.margin = '0px';
    gameSpan.style.marginTop = '4px';
    gameSpan.className = 'calibri';
    gameSpan.style.fontSize = 'smaller';
    gameSpan.style.color = '#888';
    gameSpan.innerHTML = `${icon('stadia_controller', 'small')} ${await window.electronAPI.invoke('getGameInfo', [mod.game]).then(g => g.name)}`;
    gameSpan.id = `modgame-${mod.uid}`;
    modNameContainer.appendChild(gameSpan);
    
    var comp = !mod.isIncompatible;
    let compatSpan = document.createElement('p');
    compatSpan = adaptForIcons(compatSpan);
    compatSpan.style.margin = '0px';
    compatSpan.style.marginTop = '4px';
    compatSpan.className = 'calibri';
    compatSpan.style.fontSize = 'smaller';
    compatSpan.style.color = comp ? '#4caf50' : '#f44336';
    compatSpan.innerHTML = comp ? `${icon('check', 'small')} Compatible with current version` : `${icon('error', 'small')} Incompatible: ${mod.incompatibilityReason}`;
    compatSpan.id = `modcompat-${mod.uid}`;
    modNameContainer.appendChild(compatSpan);

    // Column 2 (Actions)
    const actionContainer = document.createElement('td');
    actionContainer.style.textAlign = 'center';
    actionContainer.className = 'modlist-actions-column';
    {
        let bdiv = document.createElement('div');
        bdiv.className = 'modlist-actions-column-bdiv';
        actionContainer.appendChild(bdiv);

        const exploreModButton = document.createElement('button');
        exploreModButton.onclick = () => window.electronAPI.invoke('openModFolder', [mod.folder]);
        exploreModButton.innerHTML = icon('folder_eye', '20px');
        bdiv.appendChild(exploreModButton);

        const deleteModButton = document.createElement('button');
        deleteModButton.onclick = () => window.electronAPI.invoke('removeMod', [mod.folder]);
        deleteModButton.innerHTML = icon('delete_forever', '20px');
        bdiv.appendChild(deleteModButton);
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
        modId.style.fontSize = '20px';
        modId.style.color = '#888';

        const reasoning = document.createElement("span");
        reasoning.className = 'calibri';
        reasoning.innerHTML = `${icon('warning', '20px')} ${err.reason}`;
        reasoning.style.display = 'flex';
        reasoning.style.alignItems = 'center';
        reasoning.style.gap = '8px';
        reasoning.style.justifyContent = 'left';

        var selectSpan = document.createElement('span');
        selectSpan.className = 'calibri';
        selectSpan.style.marginTop = '18px';
        selectSpan.style.display = 'block';
        selectSpan.innerText = 'How would you like to proceed?';
        

        const actionRow = document.createElement("div");
        actionRow.className = "error-buttons";
        {
            // Action Row
            const exploreBtn = document.createElement("button");
            exploreBtn.innerText = "Open the mod's folder";
            exploreBtn.onclick = () => window.electronAPI.invoke("openModFolder", [err.mod]);
            actionRow.appendChild(exploreBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.innerText = "Delete the mod";
            deleteBtn.onclick = () => window.electronAPI.invoke("removeMod", [err.mod]);
            actionRow.appendChild(deleteBtn);
        }

        element.appendChild(modId);
        element.appendChild(document.createElement("br"));
        element.appendChild(reasoning);
        element.appendChild(selectSpan);
        element.appendChild(actionRow);
        errorList.appendChild(element);
    }

    dialogElement.showModal();
}

(async () => {
    const errorBanner = document.getElementById("error-banner");

    let filterFunc = (x) => true;
    try {
        if (window._pageArguments.specID != undefined && window._pageArguments.specID !== 'all') {
            filterFunc = (mod) => mod.game === window._pageArguments.specID;
        }
    }
    catch (e) {
        console.error("Failed to apply filter function:", e);
    }

    var enumerateGames = await window.electronAPI.invoke('getAvailableGames', []);
    const gamesShowSelect = document.getElementById('gamesShow');
    for (const game of enumerateGames) {
        const option = document.createElement('option');
        option.value = game.id;
        option.innerText = game.name;
        gamesShowSelect.appendChild(option);
    }

    gamesShowSelect.onchange = () => {
        const selectedGame = gamesShowSelect.value;
        window._pageArguments = { specID: selectedGame };
        page('allmods');
    };
    
    try {
        if (window._pageArguments.specID != undefined && window._pageArguments.specID !== 'all') {
            gamesShowSelect.value = window._pageArguments.specID;
        }
    } catch (e) {
        console.error("Failed to set game select value:", e);
    }
    

    var { modList, errors } = await window.electronAPI.invoke('getModList', []);

    var list = modList.filter(filterFunc);
    list.forEach(x => createMod(x, x.isCompatible));
    window._pageArguments = {}; // Clear it so it doesn't affect other mods

    if (errors.length > 0) {
        errorBanner.onclick = () => {
            rew();
            createErroringMods(errors);
        };
        errorBanner.children[0].innerText = `${errors.length} mod${errors.length === 1 ? "" : "s"} failed to load`;
        errorBanner.style.display = "inherit";
    } else errorBanner.style.display = "none";

    if (list.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.innerText = (modList.length === 0) ? 'No mods are installed.' : 'No mods match the selected filter.';
        tr.appendChild(td);
        document.getElementById('modlist').appendChild(tr);
    }

    genbtnstyles();
})();