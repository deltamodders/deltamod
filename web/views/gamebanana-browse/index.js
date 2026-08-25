let PAGE = (window._pageArguments?.lp) ? parseInt(window._pageArguments.lp) : 1;

const BLACKLIST_MODS = [];

window.PAGE = PAGE;

window._onClosePage.push(() => {
    delete window.PAGE;
});

const timeoutPromise = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let operations = 0;

function showOPBox() {
    const box = document.querySelector('#dlBox');
    box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
}

window.currentPageStack.showOPBox = showOPBox;

function istantiateOpBox(name) {
    const box = document.querySelector('#dlBox');

    const opbox = document.createElement('div');
    opbox.className = 'dlOP';

    const infoSBBox = document.createElement('div');
    infoSBBox.className = 'dlOPInfo';

    const title = document.createElement('span');
    title.innerText = name;
    title.style.fontWeight = 'bold';
    title.style.fontSize = '1.1em';
    title.style.color = 'white';
    title.style.textAlign = 'left';
    infoSBBox.appendChild(title);

    const status = document.createElement('span');
    status.innerText = '0%';
    status.style.fontSize = '0.9em';
    status.style.color = 'white';
    status.style.textAlign = 'right';
    infoSBBox.appendChild(status);

    opbox.appendChild(infoSBBox);

    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = 0;
    progress.style.width = '100%';
    progress.style.marginTop = '4px';
    opbox.appendChild(progress);

    box.appendChild(opbox);

    operations++;
    ([...Array.from(document.getElementsByClassName('sidebar-ribbon')), ...Array.from(document.getElementsByClassName('gamebanana-account'))]).forEach(button => button.setAttribute('data-disabled', 'true'));

    if (operations > 0) {
        document.querySelector('.dlactionButton').style.opacity = '1';
        document.querySelector('#nothingHere').style.display = 'none';
    }

    return {
        setProgress: function(value, statusText = null, color = null) {
            progress.value = value;
            status.innerText = statusText || `${value}%`;
            if (color) {
                progress.style.accentColor = color;
            }
        },
        delete: function() {
            operations--;
            if (operations < 0) operations = 0; 
            opbox.remove();

            const btn = document.querySelector('.dlactionButton');
            btn.style.opacity = operations <= 0 ? '0.5' : '1';
            if (operations <= 0) {
                document.querySelector('#nothingHere').style.display = 'unset';
                ([...Array.from(document.getElementsByClassName('sidebar-ribbon')), ...Array.from(document.getElementsByClassName('gamebanana-account'))]).forEach(button => button.setAttribute('data-disabled', 'false'));
            }
        }
    };
}

function getThumbURL(mod) {
    try {
        if (mod._sImageUrl?.length > 0) {
            return mod._sImageUrl;
        }
        return `${mod._aPreviewMedia._aImages[0]?._sBaseUrl}/${mod._aPreviewMedia._aImages[0]._sFile530}`;
    } catch {
        return 'https://gamebanana.com/img/gblogo.png';
    }
}

const element = document.querySelector('.scrollBottomDetector');

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) plusPage(1);
    });
}, { threshold: 0.1 });

observer.observe(element);

window._onClosePage.push(() => {
    observer.disconnect();
});

function getAllThumbs(mod) {
    return mod._aPreviewMedia._aImages.map(x => ({
        urlA: `${x._sBaseUrl}/${x._sFile}`,
        urlB: `${x._sBaseUrl}/${x._sFile100}`
    }));
}
    
let isGBLoggedIn = false;

async function gameBananaLogin() {
    const loggedin = await Promise.race([
        window.electronAPI.invoke('getAccountInfo', ['gamebanana']),
        new Promise(resolve => setTimeout(() => resolve(false), 5000))
    ]);

    isGBLoggedIn = loggedin.loggedIn;
    const gbPic = document.getElementById('gbPic');

    if (loggedin) {
        gbPic.src = await loggedin.pic;
    } else {
        gbPic.src = './img/mod-placeholder.png';
    }

    var box = document.querySelector('#gbBox');

    var flexbox = document.createElement('div');
    flexbox.style.display = 'flex';
    flexbox.style.alignItems = 'center';
    flexbox.style.justifyContent = 'left';
    box.appendChild(flexbox);

    var pic = document.createElement('img');
    pic.src = gbPic.src;
    pic.width = 64;
    pic.height = 64;
    flexbox.appendChild(pic);

    var infoBox = document.createElement('div');
    infoBox.style.display = 'flex';
    infoBox.style.flexDirection = 'column';
    infoBox.style.marginLeft = '8px';
    flexbox.appendChild(infoBox);

    var text = document.createElement('span');
    text.innerText = loggedin ? loggedin.name : 'Not logged in';
    text.style.color = 'white';
    text.style.fontSize = '1em';
    text.style.marginBottom = '8px';
    text.style.marginLeft = '8px';
    infoBox.appendChild(text);

    var optbutton = document.createElement('button');
    optbutton.innerText = loggedin ? 'Settings' : 'Log in';
    optbutton.onclick = async () => {
        window._pageArguments = { cat: 'gb' };
        page('options');
    };
    infoBox.appendChild(optbutton);
}

function roundViews(views) {
    const n = Number(views) || 0;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
}

let capi = '';
let csearch = '';

async function search(searchQuery = null) {
    const gameInfo = await window.electronAPI.invoke('getCurrentGameInfo', []);
    const gameID = gameInfo.gamebanana.id;
    const query = searchQuery || document.getElementById('searchInput').value;
    
    if (searchQuery) document.getElementById('searchInput').value = searchQuery;
    
    if (query.length < 3) {
        await htmlAlert("Search query too short", "Please enter at least 3 characters to search.", [{text:"Ok", resolveWith:'ok'}], 'error');
        return;
    }

    window._pageArguments.gbAPI = `https://gamebanana.com/apiv11/Util/Search/Results?_sModelName=Mod&_sOrder=best_match&_sSearchString=${encodeURIComponent(query)}&_csvFields=name%2Cdescription%2Carticle%2Cattribs%2Cstudio%2Cowner%2Ccredits&_idGameRow=${gameID}&_nPage=$PAGE`;
    window._pageArguments.gbAPIFilter = async (data) => data;
    window._pageArguments.leSearchQuery = query;
    
    page('gamebanana-browse');
}

async function featured() {
    const gameInfo = await window.electronAPI.invoke('getCurrentGameInfo', []);
    const gameID = gameInfo.gamebanana.id;
    
    window._pageArguments.gbAPI = `https://gamebanana.com/apiv11/Game/${gameID}/TopSubs`;
    window._pageArguments.gbAPIFilter = async (data) => {
        return {
            _aRecords: data.map(x => ({ ...x, featuredDataset: true }))
        };
    };
    
    page('gamebanana-browse');
}

window.currentPageStack.featured = featured;
window.currentPageStack.qms = {}; 

async function dlmod(dlurl, buttonElem=null, modid, modmodel, modname) {
    lockUs = true;

    const queryme = Math.random().toString(36).substring(2, 15);
    buttonElem.innerHTML = icon('search_activity', '0.9em');

    const opbox = istantiateOpBox(`Downloading "${modname || 'mod'}"`);

    window.currentPageStack.qms[queryme] = function(info) {
        if (info.error) {
            lockUs = false;
            document.querySelectorAll('.sidebar-button').forEach(e => e.disabled = false);
            buttonElem.innerHTML = icon('cancel', '0.9em');
            return;
        }

        const p = Math.max(0, Math.min(100, Number(info.progress) || 0));
        if (p < 100) {
            opbox.setProgress(p, `Downloading... ${p}%`, null);
        } else {
            opbox.setProgress(p, 'Importing', 'yellow');
        }
        
        buttonElem.style.transition = 'none';
        buttonElem.style.background = `linear-gradient(90deg, var(--theme-color) 0%, var(--theme-color) ${p}%, rgba(255,255,255,0.14) ${p}%, rgba(255,255,255,0.14) 100%)`;
    };
    
    await window.electronAPI.invoke('dlmodURL', [dlurl, queryme, modid, modmodel]);
    
    lockUs = false;
    buttonElem.innerHTML = icon('done_outline', '0.9em');

    opbox.setProgress(100, 'Done', 'green');
    setTimeout(() => opbox.delete(), 2000);
}

window.currentPageStack.dlmod = async function(info) {
    const queryme = info.queryme;
    const qms = window.currentPageStack.qms;
    if (!qms[queryme]) {
        console.warn(`Received dlmod progress for unknown queryme: ${queryme}`);
        return;
    }
    qms[queryme](info);
} 

window.currentPageStack.search = search;
window.currentPageStack.plusPage = plusPage;

let firstgeneration = true;

function buildModThumbnail(mod) {
    const div0 = document.createElement('div');
    div0.className = 'modThumbDiv';
    div0.style.display = 'flex';
    div0.style.alignItems = 'center';
    div0.style.gap = '8px';

    const thumbs = getAllThumbs(mod);
    const img = document.createElement('img');
    img.className = 'modThumbImg';
    img.src = thumbs[0].urlA;
    var width = 150;
    var height = width * 9 / 16;
    Object.assign(img.style, {
        width: width + 'px', 
        height: height + 'px', 
        margin: '4px', 
        aspectRatio: '16 / 9', 
        borderRadius: '4px',
        border: '2px solid var(--theme-color)', 
        cursor: 'zoom-in',
        objectFit: 'cover', 
        transition: 'opacity 0.3s ease-in-out', 
        objectPosition: 'center'
    });

    img.onclick = async () => {
        img.style.cursor = 'wait';
        await invoke('openImageViewer', [img.src]);
        img.style.cursor = 'zoom-in';
    };

    const gridSmallImages = document.createElement('div');
    Object.assign(gridSmallImages.style, {
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', 
        gridTemplateRows: 'repeat(3, auto)', gap: '4px', marginTop: '4px', width: '100%'
    });

    thumbs.slice(0, 12).forEach((thumb) => {
        const smallImg = document.createElement('img');
        smallImg.src = thumb.urlB;
        Object.assign(smallImg.style, {
            width: '30px', aspectRatio: '16 / 9', objectFit: 'cover',
            objectPosition: 'center', borderRadius: '4px',
            border: '1px solid var(--theme-color)', cursor: 'pointer'
        });

        smallImg.onclick = async () => {
            img.style.opacity = '0';
            await timeoutPromise(300);
            img.src = thumb.urlA;
            img.onload = () => { img.style.opacity = '1'; img.onload = null; };
        };
        gridSmallImages.appendChild(smallImg);
    });

    const emptySpaces = 12 - thumbs.slice(0, 12).length;
    for (let j = 0; j < emptySpaces; j++) {
        const emptyDiv = document.createElement('div');
        Object.assign(emptyDiv.style, {
            width: '30px', aspectRatio: '16 / 9', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)'
        });
        gridSmallImages.appendChild(emptyDiv);
    }

    div0.appendChild(gridSmallImages);
    div0.appendChild(img);
    return { div0, img };
}

function buildModDetails(mod, featuredIDs, img) {
    const div1 = document.createElement('div');
    Object.assign(div1.style, { marginLeft: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px' });

    const biggerSpan = document.createElement('span');
    biggerSpan.className = 'modTitleSpan';
    Object.assign(biggerSpan.style, { fontSize: '1.2em', marginBottom: '0px', cursor: 'pointer' });
    biggerSpan.innerText = mod._sName;
    biggerSpan.onclick = () => window.open(mod._sProfileUrl, '_blank');
    
    div1.appendChild(biggerSpan);

    const otherInfoSpan = document.createElement('div');
    otherInfoSpan.className = 'modOtherInfoSpan';
    Object.assign(otherInfoSpan.style, {
        fontSize: '0.9em', display: 'flex', flexDirection: 'column',
        color: '#cccccc', marginTop: '7px', width: '100%'
    });

    let nameauthor = mod._aSubmitter._sName;
    
    const authorSpan = document.createElement('span');
    authorSpan.className = 'modAuthorSpan iptspan';
    authorSpan.style.marginRight = '12px';
    authorSpan.style.cursor = 'pointer';
    authorSpan.innerHTML = `<img src="${mod._aSubmitter._sAvatarUrl}" alt="${nameauthor}" class="modAvatarImg"> ${nameauthor}`;
    authorSpan.onclick = () => window.open(mod._aSubmitter._sProfileUrl, '_blank');
    otherInfoSpan.appendChild(authorSpan);

    if (featuredIDs.find(x => x.id === mod._idRow)) {
        biggerSpan.style.color = 'gold';
        img.style.borderColor = 'gold';

        const periodsDesc = [
            ["today", "Best of today"], ["week", "Best of this week"], ["month", "Best of this month"],
            ["3month", "Best of last 3 months"], ["6month", "Best of last 6 months"],
            ["year", "Best of this year"], ["alltime", "All-time featured"]
        ];
        
        const featSpan = document.createElement('span');
        featSpan.className = 'modFeaturedSpan iptspan';
        featSpan.style.display = 'inline-block';
        featSpan.style.color = 'gold';
        featSpan.style.marginRight = '12px';

        for (let pd of periodsDesc) {
            if (featuredIDs.find(x => x.id === mod._idRow && x.period === pd[0])) {
                featSpan.innerHTML = `${icon((pd[0] === 'alltime' ? "award_star" : "editor_choice"), '1.1em')} ${pd[1]}`;
                break;
            }
        }
        otherInfoSpan.appendChild(featSpan);
    }

    const date = new Date(Math.max(mod._tsDateAdded || 0, mod._tsDateModified || 0) * 1000);
    const desc = document.createElement('span');
    desc.className = 'modDescSpan iptspan';

    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const units = [
        { limit: 60, value: 1, unit: 'second' }, { limit: 3600, value: 60, unit: 'minute' },
        { limit: 86400, value: 3600, unit: 'hour' }, { limit: 2592000, value: 86400, unit: 'day' },
        { limit: 31536000, value: 2592000, unit: 'month' }, { limit: Infinity, value: 31536000, unit: 'year' }
    ];

    let relativeDate;
    for (const { limit, value, unit } of units) {
        if (Math.abs(diffSeconds) < limit) {
            relativeDate = rtf.format(Math.round(diffSeconds / value), unit);
            break;
        }
    }

    desc.innerHTML = `${icon('acute', '1.1em')} ${relativeDate}`;
    otherInfoSpan.appendChild(desc);
    div1.appendChild(otherInfoSpan);

    return div1;
}

function buildModActions(mod, table, tr) {
    const td1 = document.createElement('td');
    td1.style.textAlign = 'center';

    const dlBtn = document.createElement('button');
    dlBtn.innerHTML = icon('download', '0.9em');
    dlBtn.className = 'serietast';
    dlBtn.onclick = async () => {
        dlBtn.disabled = true;
        dlBtn.innerHTML = icon('downloading', '0.9em');
        dlBtn.style.opacity = '0.7';

        let dlpage = await fetch(`https://gamebanana.com/apiv11/${mod._sModelName}/${mod._idRow}/ProfilePage`);
        dlpage = await dlpage.json();

        const eligibleDownloads = dlpage._aFiles.filter(file => {
            try {
                return file._aModManagerIntegrations.map(x => x._idToolRow).includes(20575);
            } catch {
                return false;
            }
        });

        if (eligibleDownloads.length === 0) {
            dlBtn.innerHTML = icon('cancel', '0.9em');
            const open = await htmlAlert("One-click download not available", "This mod cannot be downloaded via Deltamod because the owner did not package it for usage with the tool.", [{text:"Ok", resolveWith:'no'}, {text:"Open mod page on GameBanana", resolveWith:'yes'}], 'web_traffic');
            if (open === 'yes') window.open(mod._sProfileUrl, '_blank');
            return;
        }

        if (eligibleDownloads.length > 1) {
            dlBtn.innerHTML = icon('indeterminate_question_box', '0.9em');
            const dtr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2;
            dtr.appendChild(td);
            
            const btnsDiv = document.createElement('div');
            td.appendChild(btnsDiv);

            eligibleDownloads.forEach((file) => {
                const thisBtn = document.createElement('button');
                Object.assign(thisBtn.style, { display: 'inline-flex', alignItems: 'center', gap: '4px', margin: '4px', width: '100%' });
                thisBtn.onclick = async () => {
                    dlmod(file._sDownloadUrl.replace('dl','mmdl'), dlBtn, mod._idRow, mod._sModelName, mod._sName);
                    dtr.remove();
                };
                
                const dlIcon = document.createElement('span');
                dlIcon.innerHTML = icon('download', '1.1em');
                
                const details = document.createElement('div');
                details.style.textAlign = 'left';
                
                const filename = document.createElement('span');
                filename.innerText = file._sFile;
                Object.assign(filename.style, { display: 'block', fontWeight: 'bold', fontSize: '1.1em' });
                
                const filesize = document.createElement('span');
                filesize.innerText = ` (${(file._nFilesize / 1024 / 1024).toFixed(2)} MB)`;
                Object.assign(filesize.style, { display: 'block', fontSize: '0.9em' });

                const filedesc = document.createElement('span');
                filedesc.innerText = file._sDescription || "No description provided.";
                Object.assign(filedesc.style, { display: 'block', fontSize: '0.9em', color: '#ffffff60' });

                const fdate = new Date(file._tsDateAdded * 1000);
                const filedate = document.createElement('span');
                filedate.innerText = `Added on ${fdate.toLocaleDateString()} at ${fdate.toLocaleTimeString()}`;
                Object.assign(filedate.style, { display: 'block', fontSize: '0.9em', color: '#ffffff60' });

                details.append(filename, filesize, filedesc, filedate);

                if (file._sAvState === 'done' && file._sAvResult !== 'clean') {
                    const avspan = document.createElement('span');
                    avspan.innerText = `File flagged: ${file._sAnalysisResultVerbose}`;
                    Object.assign(avspan.style, { display: 'block', fontSize: '0.9em', color: '#ffffff', backgroundColor: '#980000', padding: '2px 4px' });
                    details.appendChild(avspan);
                }
                
                thisBtn.append(dlIcon, details);
                btnsDiv.appendChild(thisBtn);
            });

            tr.insertAdjacentElement("afterend", dtr);
            await timeoutPromise(100);
            rew();
            return;
        }

        dlmod(eligibleDownloads[0]._sDownloadUrl.replace('dl','mmdl'), dlBtn, mod._idRow, mod._sModelName, mod._sName);
    };
    td1.appendChild(dlBtn);

    const commentBtn = document.createElement('button');
    commentBtn.innerHTML = icon('comment', '0.9em');
    commentBtn.className = 'serietast';
    commentBtn.style.marginLeft = '8px';
    commentBtn.onclick = async () => {
        window._pageArguments = { id: mod._idRow, model: mod._sModelName };
        page('gamebanana-leave-comment');
    };
    td1.appendChild(commentBtn);

    const likeBtn = document.createElement('button');
    likeBtn.innerHTML = icon('mood_heart', '0.9em');
    likeBtn.className = 'serietast';
    likeBtn.style.marginLeft = '8px';
    likeBtn.disabled = !isGBLoggedIn;
    likeBtn.onclick = async () => {
        const res = await window.electronAPI.invoke('gbLikeMod', [mod._sModelName, mod._idRow]);
        if (res.status === 200) {
            likeBtn.innerHTML = icon('sentiment_very_satisfied', '0.9em');
            likeBtn.disabled = true;
        } else if (res.data._sErrorCode.toLowerCase() === 'already_liked') {
            await htmlAlert("Can't like the mod", "You've already liked this mod. Can't get any more likes than that!", [{text:'Ok', resolveWith:'ok'}], 'sentiment_very_satisfied');
            likeBtn.innerHTML = icon('sentiment_very_satisfied', '0.9em');
            likeBtn.disabled = true;
        } else {
            await htmlAlert("Can't like the mod", res.data._sErrorCode, [{text:'Ok', resolveWith:'ok'}], 'error');
        }
    };
    td1.appendChild(likeBtn);

    return td1;
}

async function renderMods(table, GB_API, filter, gameID) {
    if (window.PAGE == null) window.PAGE = 1;
    
    const furl = GB_API.replace('$PAGE', window.PAGE);
    console.log(`Fetching from URL: ${furl}`);
    
    try {
        const response = await fetch(furl);
        const data = await filter(await response.json());

        const featuredRes = await fetch(`https://gamebanana.com/apiv11/Game/${gameID}/TopSubs`);
        const featuredData = await featuredRes.json();
        const featuredIDs = featuredData.map(x => ({ id: x._idRow, period: x._sPeriod }));

        if (data._aMetadata?._bIsComplete) {
            observer.disconnect(); 
            document.querySelector('.scrollBottomDetector').style.display = 'none'; 
        }

        if (data._aRecords.length === 0 && firstgeneration) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2;
            td.innerText = firstgeneration ? "No mods were found matching your query." : "You've reached the end of the list.";
            tr.appendChild(td);
            table.appendChild(tr);
            
            observer.disconnect();
            document.querySelector('.scrollBottomDetector').style.display = 'none';
            return;
        }

        for (const mod of data._aRecords) {
            if (mod._sModelName === 'Wip' && !mod._bHasFiles) continue;
            if (mod._sModelName !== 'Wip' && mod._sModelName !== 'Mod') continue;
            if (BLACKLIST_MODS.includes(mod._idRow)) continue;
            
            const tr = document.createElement('tr');
            
            const td0 = document.createElement('td');
            Object.assign(td0.style, { display: 'flex', alignItems: 'top', gap: '8px', justifyContent: 'left' });

            const { div0, img } = buildModThumbnail(mod);
            const div1 = buildModDetails(mod, featuredIDs, img);
            
            td0.append(div0, div1);
            
            const td1 = buildModActions(mod, table, tr);

            tr.append(td0, td1);
            table.appendChild(tr);
        }
    } catch (e) {
        console.error(e);
        await htmlAlert("Error", "An error occurred while loading mods from GameBanana. Please try again later.", [{text:'Ok', resolveWith:'ok'}], 'error');
        page('main');
        firstgeneration = true;
        return;
    }

    firstgeneration = false;
}

async function plusPage(amt) {
    window.PAGE += amt;
    await renderMods(window.currentPageStack.table, window.currentPageStack.GB_API, window.currentPageStack.filter, window.currentPageStack.gameID);
}

(async () => {
    if (navigator.onLine === false) {
        await htmlAlert("You're offline", "To access this page, you must have an active Internet connection.", [{text:"Ok", resolveWith:'ok'}], 'cloud_alert');
        page('main');
        return;
    }
    
    const gameInfo = await window.electronAPI.invoke('getCurrentGameInfo', []);
    const gameID = gameInfo.gamebanana.id;
    let GB_API = `https://gamebanana.com/apiv11/Game/${gameID}/Subfeed?_sSort=default&_nPage=$PAGE`;
    const table = document.getElementById('modsBody');
    let filter = async (a) => a;

    if (window._pageArguments?.gbAPI && window._pageArguments?.gbAPIFilter) {
        GB_API = window._pageArguments.gbAPI;
        filter = window._pageArguments.gbAPIFilter;
    }

    if (window._pageArguments?.leSearchQuery) {
        const query = window._pageArguments.leSearchQuery;
        document.getElementById('searchInput').value = query;
        csearch = query;

        const searchInd = document.getElementById('searchInd');
        searchInd.style.display = 'block';
        searchInd.innerText = `Currently showing results for "${csearch}"`;
    }

    capi = GB_API;
    window._pageArguments = {};

    await gameBananaLogin();

    table.innerHTML = '';

    window.currentPageStack = {
        ...window.currentPageStack,
        table,
        GB_API,
        filter,
        gameID
    };

    await renderMods(table, GB_API, filter, gameID);
    genbtnstyles();
})();

const searchel = document.getElementById('searchInput');
const autocomplete = document.querySelector('.autocomplete .results');

searchel.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') search();
});

searchel.addEventListener('focus', () => {
    autocomplete.style.opacity = '1';
    autocomplete.style.pointerEvents = 'auto';
});

searchel.addEventListener('blur', () => {
    setTimeout(() => {
        autocomplete.style.opacity = '0';
        autocomplete.style.pointerEvents = 'none';
    }, 300);
});

let sval = 0;
window._intervals = window._intervals || [];
window._intervals.push(setInterval(async () => {
    const isFocused = document.activeElement === searchel;
    if (!isFocused) {
        autocomplete.style.opacity = '0';
        autocomplete.style.pointerEvents = 'none';
        return;
    }
    
    if (sval !== searchel.value) {
        sval = searchel.value;
    } else return;

    if (searchel.value.length < 3) {
        autocomplete.innerHTML = '';
        autocomplete.style.opacity = '0';
        autocomplete.style.pointerEvents = 'none';
        return;
    }

    const res = await fetch(`https://gamebanana.com/apiv12/Util/Search/Suggestions?_idGameRow=6755&_sSearchString=${searchel.value}`);
    const elems = JSON.parse(await res.text());

    autocomplete.style.opacity = '1';
    autocomplete.style.pointerEvents = 'auto';
    autocomplete.innerHTML = '';
    
    elems.forEach((item) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result';
        resultDiv.innerText = item;
        resultDiv.addEventListener('click', () => {
            searchel.value = item;
            search(searchel.value);
        });
        autocomplete.appendChild(resultDiv);
    });
    
    if (elems.length === 0) {
        const noResultDiv = document.createElement('div');
        noResultDiv.className = 'result';
        noResultDiv.innerText = 'No results found';
        noResultDiv.style.color = '#888';
        noResultDiv.style.pointerEvents = 'none';
        autocomplete.appendChild(noResultDiv);
    }
}, 1000));