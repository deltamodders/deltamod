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

var noMergeMods = [];

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

    let IMAGE_DIMENSION = 70;
    let imageContainer = document.createElement('div');
    imageContainer.style.width = IMAGE_DIMENSION + 'px';
    imageContainer.style.height = IMAGE_DIMENSION + 'px';
    imageContainer.style.margin = '4px';
    imageContainer.style.marginLeft = '2px';

    tippy(imageContainer, {
        content: await k('main_rightclick'),
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
        imeta.path = 'deltapack://web/img/mod-placeholder.png';
    }

    let img = document.createElement('img');
    img.src = imeta.path;
    img.classList.add('mod-image');
    img.style.border = '3px solid ';
    img.style.width = IMAGE_DIMENSION + 'px';
    img.style.height = IMAGE_DIMENSION + 'px';
    img.style.objectFit = 'cover';
    imageContainer.appendChild(img);

    imageContainer.oncontextmenu = async e => {
        htmlAlert(mod.name,await k("main_rightclick_confirm"),[{text:await k("yes"),resolveWith:'accept'},{text:await k("no"),rejectWith:'close'}]).then(result => {
            if (result === 'accept') {
                window._pageArguments = { highlightMod: mod.uid };
                page('allmods');
            }
        }).catch(() => {});
    };

    var prevalColor = mod.customRGB || getPredominantColor(img);
    if (prevalColor.r < 30 && prevalColor.g < 30 && prevalColor.b < 30) {
        prevalColor.r = Math.min(prevalColor.r + 60, 255);
        prevalColor.g = Math.min(prevalColor.g + 60, 255);
        prevalColor.b = Math.min(prevalColor.b + 60, 255);
    }

    img.style.border = '3px solid ' + `rgba(${prevalColor.r}, ${prevalColor.g}, ${prevalColor.b}, 0.5)`;
    
    let infoContainer = document.createElement('div');
    let titleSpan = document.createElement('span');
    titleSpan.innerText = mod.name;
    titleSpan.style.fontSize = '23px';
    if (mod.new) {
        titleSpan = adaptForIconsA(titleSpan);
        titleSpan.style.marginBottom = '0px';
        titleSpan.innerHTML = `${icon('fiber_new', '30px')} ${titleSpan.innerHTML}`;
    }
    titleSpan.id = `modtitle-${mod.uid}`;
    infoContainer.appendChild(titleSpan);

    infoContainer.appendChild(document.createElement('br'));

    let descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.style = 'font-size: 12px; color: #ffffff;';
    descSpan.innerText = purifyDescription(mod.description);
    descSpan.id = `moddesc-${mod.uid}`;
    infoContainer.appendChild(descSpan);

    let flexContnainer = document.createElement('div');
    flexContnainer.style.display = 'flex';
    flexContnainer.style.alignItems = 'center';
    flexContnainer.style.justifyContent = 'left';
    flexContnainer.style.gap = '6px';
    flexContnainer.style.marginTop = '8px';
    flexContnainer.style.backgroundColor = 'rgba(' + prevalColor.r + ', ' + prevalColor.g + ', ' + prevalColor.b + ', 0.2)';
    flexContnainer.style.backdropFilter = 'blur(5px)';
    flexContnainer.style.boxShadow = '0 0 5px ' + `rgba(${prevalColor.r}, ${prevalColor.g}, ${prevalColor.b}, 0.5)`;
    flexContnainer.style.borderRadius = '50px';
    flexContnainer.style.width = 'fit-content';
    flexContnainer.style.padding = '4px';
    flexContnainer.style.paddingLeft = '10px';
    flexContnainer.style.paddingRight = '10px';
    infoContainer.appendChild(flexContnainer);

    var reducedAuthorStr = mod.author.slice(0,2).join(', ');
    if (mod.author.length > 2) reducedAuthorStr += ` ${await k('main_andmore', mod.author.length - 2)}`;
    var fontSize = 13;
    let authorSpan = document.createElement('p');
    authorSpan = adaptForIconsA(authorSpan);
    authorSpan.style.margin = '0px';
    authorSpan.className = 'calibri';
    authorSpan.style.fontSize = fontSize + 'px';
    authorSpan.style.color = '#ffffff';
    authorSpan.innerHTML = `${icon('attribution', fontSize + 'px')} ${purify(reducedAuthorStr)}`;
    authorSpan.id = `modauthor-${mod.uid}`;
    flexContnainer.appendChild(authorSpan);

    let versionSpan = document.createElement('p');
    versionSpan = adaptForIconsA(versionSpan);
    versionSpan.style.margin = '0px';
    versionSpan.className = 'calibri';
    versionSpan.style.fontSize = fontSize + 'px';
    versionSpan.style.color = '#ffffff';
    versionSpan.innerHTML = `${icon('change_history', fontSize + 'px')} ${(mod.version ? mod.version : await k('unknown'))}`;
    versionSpan.id = `modsize-${mod.uid}`;
    flexContnainer.appendChild(versionSpan);

    if (!mod.mergeSupport) {
        noMergeMods.push({uid: mod.uid, name: mod.name});  

        let mergeSpan = document.createElement('p');
        mergeSpan = adaptForIconsA(mergeSpan);
        mergeSpan.style.margin = '0px';
        mergeSpan.style.marginTop = '10px';
        mergeSpan.className = 'calibri';
        mergeSpan.style.fontSize = fontSize + 'px';
        mergeSpan.style.color = '#ffffff';
        mergeSpan.innerHTML = `${icon('warning', fontSize + 'px')} ${await k('main_incompatiblemerge')}`;
        mergeSpan.id = `modmerge-${mod.uid}`;
        infoContainer.appendChild(mergeSpan);
    }

    if (mod.variants != null) {
        let variantSelect = document.createElement('select');
        variantSelect.style.marginTop = '10px';
        variantSelect.className = 'calibri';
        variantSelect.style.backgroundColor = 'rgba(' + (prevalColor.r - 80) + ', ' + (prevalColor.g - 80) + ', ' + (prevalColor.b - 80) + ', 1)';
        variantSelect.style.border = '1px solid rgba(' + prevalColor.r + ', ' + prevalColor.g + ', ' + prevalColor.b + ', 0.5)';
        variantSelect.style.fontSize = fontSize + 'px';
        variantSelect.style.color = '#ffffff';
        for (const variant of mod.variants) {
            let option = document.createElement('option');
            option.value = variant.filename;
            option.innerText = variant.name;
            variantSelect.appendChild(option);
        }
        variantSelect.onchange = e => {
            const selectedVariant = e.target.value;
            window.electronAPI.invoke('setModVariant', [selectedVariant, mod.folder]);
        };
        variantSelect.value = mod._selectedVariant || mod.variants[0].filename;
        if (mod._selectedVariant == null || !mod.variants.some(v => v.filename === mod._selectedVariant)) {
            window.electronAPI.invoke('setModVariant', [mod.variants[0].filename, mod.folder]);
        }
        infoContainer.appendChild(variantSelect);
    }

    bigAhhContainer.appendChild(imageContainer);
    bigAhhContainer.appendChild(infoContainer);

    modNameContainer.appendChild(bigAhhContainer);

    // Column 2 (Actions)
    let enabledContainer = document.createElement('td');
    enabledContainer.style.textAlign = 'center';
    enabledContainer.className = 'modlist-enabled-column';
    {
        let enabled = document.createElement("input");
        enabled.type = 'checkbox';
        enabled.id = `modcheck-${mod.uid}`;
        enabled.checked = await window.electronAPI.invoke('getModState', [mod.uid]);
        enabled.style.accentColor = `rgb(${prevalColor.r}, ${prevalColor.g}, ${prevalColor.b})`;
        enabled.onchange = e => {
            const c = e.target;
            const isEnabled = c.checked;
            const forMod = mod.uid;

            window.electronAPI.invoke("toggleModState", [forMod, isEnabled]);
        };
        enabledContainer.appendChild(enabled);
    }

    var cssStyle1 = `rgba(${prevalColor.r}, ${prevalColor.g}, ${prevalColor.b}, 0.2)`;
    var cssStyle2 = `rgba(${prevalColor.r}, ${prevalColor.g}, ${prevalColor.b}, 0.1)`;
    modNameContainer.style.background = `${cssStyle1}`;
    enabledContainer.style.background = `${cssStyle2}`;
    modRow.appendChild(modNameContainer);
    modRow.appendChild(enabledContainer);

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
        selectSpan.innerText = await k('modFail_howtoproceed');
        

        const actionRow = document.createElement("div");
        actionRow.className = "error-buttons";
        {
            // Action Row
            const exploreBtn = document.createElement("button");
            exploreBtn.innerText = await k("open_mod_folder");
            exploreBtn.onclick = () => window.electronAPI.invoke("openModFolder", [err.mod]);
            actionRow.appendChild(exploreBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.innerText = await k("delete_mod");
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

function loadInst(index) {
    window.electronAPI.invoke('changeSystemIndex', ["" + index])
}

(async () => {
    const errorBanner = document.getElementById("error-banner");

    var { modList, errors } = (await window.electronAPI.invoke('getModList', []));
    if (window._pageArguments && window._pageArguments.sortfunc && window._pageArguments.sortid) {
        modList = modList.sort(window._pageArguments.sortfunc);
        document.getElementById('sortWay').value = window._pageArguments.sortid;
    }
    else {
        // sort by name ascending by default
        modList = modList.sort((a, b) => a.name.localeCompare(b.name));
    }
    let addedAuthors = [];
    for (const x of modList.filter(x => !x.isIncompatible)) {
        if (window._pageArguments && window._pageArguments.sortid === "author" && !addedAuthors.includes(x.author[0] || 'Unknown Author')) {
            // also create author tr
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 3;
            td.style.paddingLeft = '10px';
            td.style.fontSize = '18px';
            td.style.fontWeight = 'bold';
            td.style.backgroundColor = '#222';
            td.style.color = '#fff';
            td.innerText = await k('main_authorsortsub', ((x.author[0] || await k('unknown'))));
            tr.appendChild(td);
            addedAuthors.push(x.author[0] || await k('unknown'));
            document.getElementById('modlist').appendChild(tr);
        }
        await createMod(x);
    }

    document.getElementById('sortWay').onchange = async (e) => {
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
            case 'author':
                window._pageArguments = { sortfunc: (a, b) => {
                    const authorA = a.author[0] || "Unknown Author";
                    const authorB = b.author[0] || "Unknown Author";
                    return authorA.localeCompare(authorB);
                }, sortid: 'author' };
                page('');
                break;

        }
    };

    if (errors.length > 0) {
        errorBanner.onclick = () => {
            rew();
            createErroringMods(errors);
        };
        errorBanner.children[0].innerText = await k('modFail_bannerTitle', errors.length);
        errorBanner.style.display = "inherit";
    } else errorBanner.style.display = "none";

    if (modList.filter(x => !x.isIncompatible).length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.innerHTML = await k('main_nocompatiblemods') + (modList.filter(x => x.isIncompatible).length != 0 ? '<br><small class="calibri" style="color: #888;">' + await k('main_incompatiblemodsfound', modList.filter(x => x.isIncompatible).length) + '</small>' : '');
        td.style.paddingLeft = '10px';
        tr.appendChild(td);
        if ((await window.electronAPI.invoke('howManyMods', [])) == 0) {
            let small = document.createElement('small');
            var hasShop = await window.electronAPI.invoke('getUniqueFlag', ['SHOP']);
            small.innerHTML = hasShop ? await k('main_wheremods_shop') : await k('main_wheremods_noshop');
            small.style.color = '#888';
            td.appendChild(document.createElement('br'));
            td.appendChild(small);
        }
        document.getElementById('modlist').appendChild(tr);

        //document.getElementById('par').innerText = 'Run without patches';
    }

    window._pageArguments = null;

    genbtnstyles();
})();

async function patchAndRun() {
    var allChecks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.id.startsWith('modcheck-'));
    var selectedMods = allChecks.filter(cb => cb.checked).map(cb => cb.id.replace('modcheck-', ''));
    console.log('Selected mods:', selectedMods);

    var goOn = true;
    for (let i = 0; i < selectedMods.length; i++) {
        const modId = selectedMods[i];
        if (!goOn) break;
        if (noMergeMods.map(x => x.uid).includes(modId) && selectedMods.length > 1) {
            await htmlAlert(
                await k('main_incompatiblesetting'),
                await k('main_incompatiblemodTxt', noMergeMods.find(x => x.uid === modId).name),
                [{ text: await k('ok'), resolveWith: 'ok' }],
                'join'
            );
            goOn = false;
        }
    }
    if (!goOn) return;

    if (selectedMods.length === 0) {
        window.electronAPI.invoke('startGame', []);
    }
    else {
        page('patching');
        setTimeout(() => {
            window.electronAPI.invoke('patchAndRun', [selectedMods]);
        }, 1000);
    }
}

window.currentPageStack.patchAndRun = patchAndRun;