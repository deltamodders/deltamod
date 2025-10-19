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

var baking = false;

function adaptForIconsA(elem) {
    elem.style.display = 'inline-flex';
    elem.style.alignItems = 'center';
    elem.style.gap = '4px';
    elem.style.justifyContent = 'left';
    return elem;
}
function purify(text) {
    return text.replace(/<[^>]*>/g, '');
}

setTimeout(() => {
    document.getElementsByClassName('buttons')[0].style.display = 'flex';
}, 500);

function getPredominantColor(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = canvas.width = 256;
    const height = canvas.height = 256;

    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const colorCount = {};
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const key = `${r},${g},${b}`;
        colorCount[key] = (colorCount[key] || 0) + 1;
    }

    let top = null;
    let second = null;
    for (const [key, count] of Object.entries(colorCount)) {
        if (!top || count > top.count) {
            second = top;
            top = { key, count };
        } else if (!second || count > second.count) {
            second = { key, count };
        }
    }

    const parseKey = (k) => {
        const [r, g, b] = k.split(',').map(Number);
        return { r, g, b };
    };

    const isBlackOrWhite = ({ r, g, b }, tol = 16) => {
        const isBlack = r <= tol && g <= tol && b <= tol;
        const isWhite = r >= 255 - tol && g >= 255 - tol && b >= 255 - tol;
        return isBlack || isWhite;
    };

    let dominantColor = top ? parseKey(top.key) : { r: 0, g: 0, b: 0 };
    if (top && isBlackOrWhite(dominantColor) && second) {
        dominantColor = parseKey(second.key);
    }

    return dominantColor;
}

function noHTML(elem) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = elem;
    return tempDiv.textContent || tempDiv.innerText || '';
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

    let IMAGE_DIMENSION = 50;
    let imageContainer = document.createElement('div');
    imageContainer.style.width = IMAGE_DIMENSION + 'px';
    imageContainer.style.height = IMAGE_DIMENSION + 'px';
    imageContainer.style.margin = '4px';
    imageContainer.style.marginLeft = '2px';

    tippy(imageContainer, {
        content: 'Right click to view in mod manager',
        placement: 'right',
        delay: [100, 0],
        onMount(instance) {
            const box = instance.popper.querySelector('.tippy-box');
            box.classList.add('calibri');
            if (box) box.style.border = '3px solid #ffffffff';
        }
    });

    let imeta = await window.electronAPI.invoke('getModImage', [mod.uid]);
    if (!imeta.path) {
        imeta.path = 'deltapack://web/mod-placeholder.png';
    }

    let img = document.createElement('img');
    img.src = (imeta.path.includes('deltapack') ? '' : "packet://") + imeta.path;
    img.style.width = IMAGE_DIMENSION + 'px';
    img.style.height = IMAGE_DIMENSION + 'px';
    img.classList.add('mod-image');
    imageContainer.appendChild(img);

    imageContainer.oncontextmenu = e => {
        htmlAlert(mod.name,"Do you wish to view this mod in the Mod Manager?",[{text:'Yes',resolveWith:'accept'},{text:'No',rejectWith:'close'}]).then(result => {
            if (result === 'accept') {
                window._pageArguments = { highlightMod: mod.uid };
                page('allmods');
            }
        }).catch(() => {});
    };

    let infoContainer = document.createElement('div');
    let titleSpan = document.createElement('span');
    titleSpan.innerText = mod.name;
    if (mod.new) {
        titleSpan = adaptForIconsA(titleSpan);
        titleSpan.style.marginBottom = '0px';
        titleSpan.innerHTML += ` ${icon('fiber_new', '20px')}`;
    }
    titleSpan.id = `modtitle-${mod.uid}`;
    infoContainer.appendChild(titleSpan);

    infoContainer.appendChild(document.createElement('br'));

    let descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.style = 'font-size: 10px; color: #ffffffdd;';
    descSpan.innerText = purifyDescription(mod.description);
    descSpan.onclick = () => {
        htmlAlert(mod.name,(mod.description),[{text:'Close',resolveWith:'close'}]);
    };
    descSpan.style.cursor = 'pointer';
    descSpan.id = `moddesc-${mod.uid}`;
    infoContainer.appendChild(descSpan);

    let flexContnainer = document.createElement('div');
    flexContnainer.style.display = 'flex';
    flexContnainer.style.alignItems = 'center';
    flexContnainer.style.justifyContent = 'left';
    flexContnainer.style.gap = '6px';
    flexContnainer.style.marginTop = '4px';
    flexContnainer.style.border = '3px solid #474747a0';
    flexContnainer.style.backgroundColor = '#1a1a1a54';
    flexContnainer.style.borderRadius = '5px';
    flexContnainer.style.width = 'fit-content';
    flexContnainer.style.padding = '4px';
    flexContnainer.style.paddingLeft = '10px';
    flexContnainer.style.paddingRight = '10px';
    infoContainer.appendChild(flexContnainer);

    var fontSize = 13;
    let authorSpan = document.createElement('p');
    authorSpan = adaptForIconsA(authorSpan);
    authorSpan.style.margin = '0px';
    authorSpan.className = 'calibri';
    authorSpan.style.fontSize = fontSize + 'px';
    authorSpan.style.color = '#888';
    authorSpan.innerHTML = `${icon('attribution', fontSize + 'px')} ${purify(mod.author.join(', '))}`;
    authorSpan.id = `modauthor-${mod.uid}`;
    flexContnainer.appendChild(authorSpan);

    let versionSpan = document.createElement('p');
    versionSpan = adaptForIconsA(versionSpan);
    versionSpan.style.margin = '0px';
    versionSpan.className = 'calibri';
    versionSpan.style.fontSize = fontSize + 'px';
    versionSpan.style.color = '#888';
    versionSpan.innerHTML = `${icon('change_history', fontSize + 'px')} ${(mod.version ? mod.version : 'Unknown')}`;
    versionSpan.id = `modsize-${mod.uid}`;
    flexContnainer.appendChild(versionSpan);

    bigAhhContainer.appendChild(imageContainer);
    bigAhhContainer.appendChild(infoContainer);

    modNameContainer.appendChild(bigAhhContainer);

    var developermode = await window.electronAPI.invoke('isDevMode', [""]);
    if (developermode) {
        let idSpan = document.createElement('p');
        idSpan = adaptForIconsA(idSpan);
        idSpan.className = 'calibri';
        idSpan.style.fontSize = fontSize + 'px';
        idSpan.style.color = '#888';
        idSpan.innerHTML = `${icon('tag', fontSize + 'px')} ${mod.packageID}`;
        idSpan.style.margin = '0px';
        flexContnainer.appendChild(idSpan);
    }

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

    var prevalColor = getPredominantColor(img);
    var cssStyle = `linear-gradient(90deg,rgba(${prevalColor.r}, ${prevalColor.g}, ${prevalColor.b}, 0.5) 0%, rgba(40, 40, 40, 0) 100px)`;
    modNameContainer.style.background = `${cssStyle}`;
    modRow.appendChild(modNameContainer);
    modRow.appendChild(enabledContainer);

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
    if (window._pageArguments && window._pageArguments.sortfunc && window._pageArguments.sortid) {
        modList = modList.sort(window._pageArguments.sortfunc);
        document.getElementById('sortWay').value = window._pageArguments.sortid;
    }
    else {
        // sort by name ascending by default
        modList = modList.sort((a, b) => a.name.localeCompare(b.name));
    }
    modList.forEach(x => createMod(x));

    document.getElementById('sortWay').onchange = (e) => {
        switch (e.target.value) {
            case 'asc':
                window._pageArguments = { sortfunc: (a, b) => a.name.localeCompare(b.name), sortid: 'asc' };
                page('');
                break;
            case 'desc':
                window._pageArguments = { sortfunc: (a, b) => b.name.localeCompare(a.name), sortid: 'desc' };
                page('');
                break;
            case 'size-asc':
                window._pageArguments = { sortfunc: (a, b) => (a.size || 0) - (b.size || 0), sortid: 'size-asc' };
                page('');
                break;
            case 'size-desc':
                window._pageArguments = { sortfunc: (a, b) => (b.size || 0) - (a.size || 0), sortid: 'size-desc' };
                page('');
                break;
        }
    };

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

    baking = window._pageArguments && window._pageArguments.baker;
    if (baking) {
        document.getElementById('ptitle').innerText = 'Select mods to bake';
        document.getElementById('importModBtn').disabled = true;
        document.getElementById('importModBtn').style.opacity = 0.3;
    }
    window._pageArguments = null;
})();

function patchAndRun() {
    var allChecks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.id.startsWith('modcheck-'));
    var selectedMods = allChecks.filter(cb => cb.checked).map(cb => cb.id.replace('modcheck-', ''));
    console.log('Selected mods:', selectedMods);
    if (baking && selectedMods.length === 0) {
        htmlAlert('No mods selected', 'You need to select at least one mod to bake into the game.', [{ text: 'Close', resolveWith: 'close' }]);
        return;
    }
    if (baking) {
        window._pageArguments = { baker: true, customPatchingText: 'Baking installation...', customPatchingDesc: 'Please wait while the installation is baked.' };
        var msg = [
            'You are about to bake the selected mods into the game installation.',
            'This installation will not be able to use any other mods apart from the ones you selected now.',
            'You can still add a new installation and it will be unaffected by this.',
            'Are you sure you want to continue?'
        ]
        if (!window.confirm(msg.join('\n'))) {
            return;
        }
    }
    if (selectedMods.length === 0) {
        window.electronAPI.invoke('startGame', []);
    }
    else {
        window.electronAPI.invoke('patchAndRun', [selectedMods, (baking ? 'baker' : '')]);
        page('patching');
    }
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