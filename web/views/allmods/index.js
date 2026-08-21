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

async function createMod(mod, compatible, loggedIn) {
    const modRow = document.createElement('tr');

    let imeta = await window.electronAPI.invoke('getModImage', [mod.uid]);
    if (!imeta.path) {
        imeta.path = 'deltapack://web/img/mod-placeholder.png';
    }

    // Column 1 (Mod)
    const modNameContainer = document.createElement('td');
    const titleSpan = document.createElement('div');
    titleSpan.innerHTML = `
    <img src="${imeta.path}" width="32" height="32" onerror="this.onerror=null; this.src='deltapack://web/img/mod-placeholder.png'" style="border-radius: 4px; object-fit: cover;"> 
    <span>${purify(mod.name)}</span>`;
    titleSpan.style.display = 'flex';
    titleSpan.style.alignItems = 'center';
    titleSpan.style.gap = '8px';
    titleSpan.style.marginBottom = '4px';
    titleSpan.id = `modtitle-${mod.uid}`;
    modNameContainer.appendChild(titleSpan);

    if (window._pageArguments && window._pageArguments.highlightMod === mod.uid) {
        modNameContainer.style.backgroundColor = '#b5b5b544';
        setTimeout(() => {
            try {
                modNameContainer.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            } catch (e) {
                modNameContainer.scrollIntoView();
            }
        }, 50);
    }

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
    idSpan.innerHTML = `${icon('sell', 'small')} ${mod.packageID == 'und.und.und' ? '<i>' + "No ID was specified." + '</i>' : mod.packageID}`;
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

    let versionSpan = document.createElement('p');
    versionSpan = adaptForIcons(versionSpan);
    versionSpan.style.margin = '0px';
    versionSpan.style.marginTop = '4px';
    versionSpan.className = 'calibri';
    versionSpan.style.fontSize = 'smaller';
    versionSpan.style.color = '#888';
    versionSpan.innerHTML = `${icon('change_history', 'small')} ${purify(mod.version)}`;
    versionSpan.id = `modversion-${mod.uid}`;
    modNameContainer.appendChild(versionSpan);

    if ((mod.variants || []).length > 0) {
        let variantSpan = document.createElement('p');
        variantSpan = adaptForIcons(variantSpan);
        variantSpan.style.margin = '0px';
        variantSpan.style.marginTop = '4px';
        variantSpan.className = 'calibri';
        variantSpan.style.fontSize = 'smaller';
        variantSpan.style.color = '#888';
        variantSpan.innerHTML = `${icon('stack', 'small')} Mod has ${mod.variants.length} variants`;
        variantSpan.id = `modvariant-${mod.uid}`;
        modNameContainer.appendChild(variantSpan);
    }

    var comp = !mod.isIncompatible;
    let compatSpan = document.createElement('p');
    compatSpan = adaptForIcons(compatSpan);
    compatSpan.style.margin = '0px';
    compatSpan.style.marginTop = '4px';
    compatSpan.className = 'calibri';
    compatSpan.style.fontSize = 'smaller';
    compatSpan.style.color = comp ? '#4caf50' : '#f44336';
    compatSpan.innerHTML = comp ? `${icon('check', 'small')} ${"Compatible with current version"}` : `${icon('error', 'small')} ${`Incompatible: ${mod.incompatibilityReason}`}`;
    compatSpan.id = `modcompat-${mod.uid}`;
    modNameContainer.appendChild(compatSpan);
    
    
    if (mod.gamebanana.supports) {
        let gbSpan = document.createElement('p');
        gbSpan = adaptForIcons(gbSpan);
        gbSpan.style.margin = '0px';
        gbSpan.style.marginTop = '4px';
        gbSpan.className = 'calibri';
        gbSpan.style.fontSize = 'smaller';
        gbSpan.style.color = '#888';
        gbSpan.innerHTML = `<img src="./img/banana-outline.png" width="15" height="15"> ${"Installed through GameBanana"}`;
        gbSpan.id = `modgb-${mod.uid}`;
        modNameContainer.appendChild(gbSpan);
    }

    let aiSpan = document.createElement('p');
    aiSpan = adaptForIcons(aiSpan);
    aiSpan.style.margin = '0px';
    aiSpan.style.marginTop = '4px';
    aiSpan.className = 'calibri';
    aiSpan.style.fontSize = 'smaller';
    aiSpan.style.color = '#888';
    var map = {
        'fully': 'Fully AI-generated',
        'partial': 'Partially AI-generated',
        'no': 'No AI used'
    }
    aiSpan.innerHTML = `${icon('robot_2', 'small')} ${map[mod.ai]}`;
    aiSpan.id = `modai-${mod.uid}`;
    modNameContainer.appendChild(aiSpan);

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
        deleteModButton.onclick = () => {
            window.electronAPI.invoke('removeMod', [mod.folder]);
        };
        deleteModButton.innerHTML = icon('delete_forever', '20px');
        bdiv.appendChild(deleteModButton);

            const gbModButton = document.createElement('button');
            gbModButton.onclick = () => {
                window._pageArguments = {
                    id: mod.gamebanana.id,
                    model: mod.gamebanana.model
                };
                page(`gamebanana-leave-comment`);
            };
            gbModButton.innerHTML = icon('comment', '20px');
            bdiv.appendChild(gbModButton);

            const likeBtn = document.createElement('button');
            likeBtn.onclick = async () => {
                let res = await window.electronAPI.invoke('gbLikeMod',[mod.gamebanana.model, mod.gamebanana.id]);
                    if (res.status == 200) {
                        likeBtn.innerHTML = icon('sentiment_very_satisfied', '20px') + '';
                        likeBtn.disabled = true;
                    }
                    else if (res.data._sErrorCode.toLowerCase() == 'already_liked') {
                        await htmlAlert("Can't like mod","You've already liked this mod. Can't get any more likes than that!",[{text:"Ok",resolveWith:'ok'}], 'sentiment_very_satisfied');
                        likeBtn.innerHTML = icon('sentiment_very_satisfied', '20px') + '';
                        likeBtn.disabled = true;
                    } else {
                        await htmlAlert("Can't like mod",res.data._sErrorCode,[{text:"Ok",resolveWith:'ok'}], 'error');
                    }
            };
            likeBtn.innerHTML = icon('mood_heart', '20px');
            bdiv.appendChild(likeBtn);

            tippy(likeBtn, {
                content: "Like this mod on GameBanana",
            });
            tippy(gbModButton, {
                content: loggedIn ? "Leave a comment on GameBanana" : "View the GameBanana comments for this mod",
            });

            likeBtn.disabled = !mod.gamebanana.supports || !loggedIn;
            gbModButton.disabled = !mod.gamebanana.supports;
    }

    modRow.appendChild(modNameContainer);
    modRow.appendChild(actionContainer);

    document.getElementById('modlist').appendChild(modRow);
    return modRow;
}

async function createErroringMods(errors) {
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
        selectSpan.innerText = "How do you want to proceed?";
        

        const actionRow = document.createElement("div");
        actionRow.className = "error-buttons";
        {
            // Action Row
            const exploreBtn = document.createElement("button");
            exploreBtn.innerText = "Open mod folder";
            exploreBtn.onclick = () => window.electronAPI.invoke("openModFolder", [err.mod]);
            actionRow.appendChild(exploreBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.innerText = "Delete mod";
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
    var loggedIn = await window.electronAPI.invoke('validateGamebananaToken', []);
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
    for (const mod of list) {
        await createMod(mod, mod.isCompatible, loggedIn);
    }
    window._pageArguments = {}; // Clear it so it doesn't affect other mods

    if (errors.length > 0) {
        errorBanner.onclick = () => {
            rew();
            createErroringMods(errors);
        };
        errorBanner.children[0].innerText = `${errors.length} mod(s) failed to load`;
        errorBanner.style.display = "inherit";
    } else errorBanner.style.display = "none";

    if (list.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.innerText = (modList.length === 0) ? "No mods are installed." : "No mods match the selected filter.";
        tr.appendChild(td);
        document.getElementById('modlist').appendChild(tr);
    }

    genbtnstyles();
})();