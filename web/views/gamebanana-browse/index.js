let PAGE = (window._pageArguments && window._pageArguments.lp) ? parseInt(window._pageArguments.lp) : 1;

const BLACKLIST_MODS = [
    493817 // Gendered Kris mod
];

window.PAGE = PAGE;

window._onClosePage.push(() => {
    delete window.PAGE;
});

function timeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getThumbURL(mod) {
    try {
        if (mod._sImageUrl && mod._sImageUrl.length > 0) {
            return mod._sImageUrl;
        }
        return mod._aPreviewMedia._aImages[0]?._sBaseUrl + "/" + mod._aPreviewMedia._aImages[0]._sFile530;
    }
    catch {
        return 'https://gamebanana.com/img/gblogo.png';
    }
}

const element = document.querySelector('.scrollBottomDetector');

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
        plusPage(1);
    }
  });
}, {
  threshold: 0.1
});

observer.observe(element);

window._onClosePage.push(() => {
    observer.disconnect();
});

function getAllThumbs(mod) {
    let ar = mod._aPreviewMedia._aImages.map(x => {
        return {
            urlA: x._sBaseUrl + "/" + x._sFile,
            urlB: x._sBaseUrl + "/" + x._sFile100
        }
    });
    return ar;
}
    
var isGBLoggedIn = false;

async function gameBananaLogin() {
    var loggedin = await Promise.race([
        window.electronAPI.invoke('validateGamebananaToken', []),
        new Promise(resolve => setTimeout(() => resolve(false), 5000))
    ]);

    isGBLoggedIn = loggedin;

    if (loggedin) {
        var pic = await window.electronAPI.invoke('getGamebananaPic',[]);
        document.getElementById('gbPic').src = pic;
    }
    else {
        document.getElementById('gbPic').src = './img/mod-placeholder.png';
    }

    document.getElementById('gbPic').onclick = async () => {
        window._pageArguments = {
            cat: 'gb'
        };
        page('options');
    };
};

function roundViews(views) {
    const n = Number(views) || 0;
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
}

let capi = '';
let csearch = '';

async function search() {
    let gameID = (await window.electronAPI.invoke('getCurrentGameInfo',[])).gamebanana.id;
    let query = document.getElementById('searchInput').value;
    if (query.length < 3) {
        await htmlAlert(await k('shop_tooshortquery'),await k('shop_tooshortquery_desc'),[{text:await k('ok'),resolveWith:'ok'}], 'error');
        return;
    }
    window._pageArguments.gbAPI = 'https://gamebanana.com/apiv11/Util/Search/Results?_sModelName=Mod&_sOrder=best_match&_sSearchString=' + encodeURIComponent(query) + '&_csvFields=name%2Cdescription%2Carticle%2Cattribs%2Cstudio%2Cowner%2Ccredits&_idGameRow=' + gameID + '&_nPage=$PAGE';
    window._pageArguments.gbAPIFilter = async function(data) {
        return data;
    };
    window._pageArguments.leSearchQuery = query;
    page('gamebanana-browse');
}

async function featured() {
    let gameID = (await window.electronAPI.invoke('getCurrentGameInfo',[])).gamebanana.id;
    // Why doesn't GB have a standard endpoint format for subs SMH
    window._pageArguments.gbAPI = 'https://gamebanana.com/apiv11/Game/' + gameID + '/TopSubs';
    window._pageArguments.gbAPIFilter = async function(data) {
        return {_aRecords: data.map(x => {
            x.featuredDataset = true;
            return x;
        })};
    } 
    page('gamebanana-browse');
}

window.currentPageStack.featured = featured;
window.currentPageStack.qms = {}; //queryme stack

async function dlmod(dlurl, buttonElem=null, modid, modmodel) {
    lockUs = true;
    Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = true);
    let queryme = Math.random().toString(36).substring(2, 15);

    buttonElem.innerHTML = icon('search_activity', '0.9em');

    window.currentPageStack.qms[queryme] = function(info) {
        if (info.error) {
            lockUs = false;
            Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = false);
            buttonElem.innerHTML = icon('cancel', '0.9em')
            return;
        }

        const p = Math.max(0, Math.min(100, Number(info.progress) || 0));
        buttonElem.style.transition = 'none';
        buttonElem.style.background = `linear-gradient(
            90deg,
            var(--theme-color) 0%,
            var(--theme-color) ${p}%,
            rgba(255,255,255,0.14) ${p}%,
            rgba(255,255,255,0.14) 100%
        )`;

    };

    var res = await window.electronAPI.invoke('dlmodURL',[dlurl, queryme, modid, modmodel]);

    lockUs = false;
    Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = false);
    buttonElem.innerHTML = icon('done_outline', '0.9em');
}

window.currentPageStack.dlmod = async function(info) {
    let queryme = info.queryme;
    let qms = window.currentPageStack.qms;
    if (!qms[queryme]) {
        console.warn('Received dlmod progress for unknown queryme: ' + queryme);
        return;
    }
    let qme = qms[queryme];
    qme(info);
} 

window.currentPageStack.search = search;

window.currentPageStack.plusPage = plusPage;

var firstgeneration = true;

async function renderMods(table, GB_API, filter, gameID) {
    if (window.PAGE == null) {
        window.PAGE = 1;
    }
    var furl = GB_API.replace('$PAGE', window.PAGE);
    console.log('Fetching from URL: ' + furl);
    var response = await fetch(furl);
    var data = await filter(await response.json());

    var featured = await fetch("https://gamebanana.com/apiv11/Game/" + gameID + "/TopSubs");
    var featuredData = await featured.json();
    var featuredIDs = featuredData.map(x => {return {id: x._idRow, period: x._sPeriod};});

    try {
        if (data._aRecords.length === 0) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 2;
            td.innerText = (firstgeneration ? await k('shop_noresults') : await k('shop_endlist'));
            tr.appendChild(td);
            table.appendChild(tr);
            observer.disconnect(); // stop observing since there's no more content to load
            document.querySelector('.scrollBottomDetector').style.display = 'none'; // hide the loading indicator
            return;
        }
        for (const mod of data._aRecords) {
            if (mod._sModelName == 'Wip' && !mod._bHasFiles) continue;
            if (mod._sModelName != 'Wip' && mod._sModelName != 'Mod') continue;
            if (BLACKLIST_MODS.includes(mod._idRow)) continue;
            
            await (async () => {

                var td0 = document.createElement('td');
                td0.style.display = 'flex';
                td0.style.alignItems = 'top';
                td0.style.gap = '8px';
                td0.style.justifyContent = 'left';
                // Rendering of td0
                {
                var div0 = document.createElement('div');
                div0.style.display = 'flex';
                div0.style.alignItems = 'center';
                div0.style.gap = '8px';
                div0.className = 'modThumbDiv';
                
                let thumbs = getAllThumbs(mod);
                var img = document.createElement('img');
                img.className = 'modThumbImg';
                img.src = (thumbs[0].urlA);
                let i = 0;
                img.style.width = '130px';
                img.style.margin = '4px';
                img.style.aspectRatio = '16 / 9';
                img.style.borderRadius = '4px';
                img.style.border = '2px solid var(--theme-color)';
                img.style.height = 'auto';
                img.style.cursor = 'zoom-in';
                img.onclick = async () => {
                    img.style.cursor = 'wait';
                    await invoke('openImageViewer', [img.src]);
                    img.style.cursor = 'zoom-in';
                };
                img.style.objectFit = 'cover';
                img.style.transition = 'opacity 0.3s ease-in-out';
                img.style.objectPosition = 'center';

                var gridSmallImages = document.createElement('div');
                gridSmallImages.style.display = 'grid';
                gridSmallImages.style.gridTemplateColumns = 'repeat(3, 1fr)';
                gridSmallImages.style.gridTemplateRows = 'repeat(3, auto)';
                gridSmallImages.style.gap = '4px';
                gridSmallImages.style.marginTop = '4px';
                gridSmallImages.style.width = '100%';

                thumbs.slice(0, 9).forEach((thumb, index) => {
                    var smallImg = document.createElement('img');
                    smallImg.src = thumb.urlB;
                    smallImg.style.width = '30px';
                    smallImg.style.aspectRatio = '16 / 9';
                    smallImg.style.objectFit = 'cover';
                    smallImg.style.objectPosition = 'center';
                    smallImg.style.borderRadius = '4px';
                    smallImg.style.border = '1px solid var(--theme-color)';
                    smallImg.onclick = async () => {
                        img.style.opacity = '0';
                        await timeoutPromise(300);
                        img.src = thumb.urlA;
                        img.onload = () => {
                            img.style.opacity = '1';
                            img.onload = null; // Remove the onload handler after it has been called
                        }
                    }
                    smallImg.style.cursor = 'pointer';
                    gridSmallImages.appendChild(smallImg);
                });

                var emptySpaces = 9 - thumbs.slice(0, 9).length;
                for (let j = 0; j < emptySpaces; j++) {
                    var emptyDiv = document.createElement('div');
                    emptyDiv.style.width = '30px';
                    emptyDiv.style.aspectRatio = '16 / 9';
                    emptyDiv.style.borderRadius = '4px';
                    emptyDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    gridSmallImages.appendChild(emptyDiv);
                }

                div0.appendChild(gridSmallImages);
                div0.appendChild(img);

                var div1 = document.createElement('div');
                div1.style.marginLeft = '8px';
                div1.style.display = 'flex';
                div1.style.flexDirection = 'column';
                div1.style.justifyContent = 'space-between';
                td0.appendChild(div0);
                td0.appendChild(div1);

                var biggerSpan = document.createElement('span');
                biggerSpan.className = 'modTitleSpan';
                biggerSpan.style.fontSize = '1.2em';
                biggerSpan.style.marginBottom = '0px';
                biggerSpan.innerText = mod._sName;
                biggerSpan.style.cursor = 'pointer';
                biggerSpan.onclick = () => {
                    window.open(mod._sProfileUrl, '_blank');
                };
                div1.appendChild(biggerSpan);

                var otherInfoSpan = document.createElement('div');
                otherInfoSpan.className = 'modOtherInfoSpan';
                otherInfoSpan.style.fontSize = '0.9em';
                otherInfoSpan.style.display = 'flex';
                otherInfoSpan.style.flexDirection = 'column';
                otherInfoSpan.style.color = '#cccccc';
                otherInfoSpan.style.marginTop = '7px';
                otherInfoSpan.style.width = '100%';

                var nameauthor = mod._aSubmitter._sName;
                // easter egg for the tenna lover
                if (mod._aSubmitter._idRow == 1712567) {
                    nameauthor += ' (Tenna lover)';
                }
                var authorSpan = document.createElement('span');
                authorSpan.className = 'modAuthorSpan iptspan';
                authorSpan.style.marginRight = '12px';
                authorSpan.innerHTML = `<img src="${mod._aSubmitter._sAvatarUrl}" alt="${nameauthor}" class="modAvatarImg"> ${nameauthor}`;
                authorSpan.onclick = () => {
                    window.open(mod._aSubmitter._sProfileUrl, '_blank');
                };
                authorSpan.style.cursor = 'pointer';

                var e = null;
                if (featuredIDs.find(x => x.id === mod._idRow)) {
                    biggerSpan.style.color = 'gold';
                    img.style.borderColor = 'gold';

                    var periodsDesc = [
                        ["today",await k('shop_featuredtoday')],
                        ["week",await k('shop_featuredweek')],
                        ["month",await k('shop_featuredmonth')],
                        ["3month",await k('shop_featured3month')],
                        ["6month",await k('shop_featured6month')],
                        ["year",await k('shop_featuredyear')],
                        ["alltime",await k('shop_featuredalltime')]
                    ]
                    var featSpan = document.createElement('span');
                    featSpan.className = 'modFeaturedSpan iptspan';
                    featSpan.style.display = 'inline-block';
                    for (let pd of periodsDesc) {
                    if (featuredIDs.find(x => x.id === mod._idRow && x.period === pd[0])) {
                        featSpan.innerHTML = `${icon((pd[0] == 'alltime' ? "award_star" : "editor_choice"),'1.1em')} ${pd[1]}`;
                        break;
                    }
                    }
                    featSpan.style.color = 'gold';
                    featSpan.style.marginRight = '12px';
                    e = featSpan;
                }
                otherInfoSpan.appendChild(authorSpan);
                if (e) otherInfoSpan.appendChild(e);
                div1.appendChild(otherInfoSpan);

                var addDate = mod._tsDateAdded || 0;
                var modDate = mod._tsDateModified || 0;

                var date = new Date(Math.max(addDate, modDate) * 1000);

                var desc = document.createElement('span');
                desc.className = 'modDescSpan iptspan';
                const relativeDate = (() => {
                    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
                    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
                    const units = [
                        { limit: 60, value: 1, unit: 'second' },
                        { limit: 3600, value: 60, unit: 'minute' },
                        { limit: 86400, value: 3600, unit: 'hour' },
                        { limit: 2592000, value: 86400, unit: 'day' },
                        { limit: 31536000, value: 2592000, unit: 'month' },
                        { limit: Infinity, value: 31536000, unit: 'year' }
                    ];

                    for (const { limit, value, unit } of units) {
                        if (Math.abs(diffSeconds) < limit) {
                            return rtf.format(Math.round(diffSeconds / value), unit);
                        }
                    }
                })();

                desc.innerHTML = icon('acute', '1.1em') + ' ' + relativeDate;
                otherInfoSpan.appendChild(desc);
                }

                var td1 = document.createElement('td');
                td1.style.textAlign = 'center';
                // Rendering of td1
                {
                    var dlBtn = document.createElement('button');
                    dlBtn.innerHTML = icon('download', '0.9em') + '';
                    dlBtn.className = 'serietast';
                    dlBtn.onclick = async () => {
                        dlBtn.disabled = true;
                        dlBtn.innerHTML = icon('downloading', '0.9em');
                        dlBtn.style.opacity = '0.7';

                        var dlpage = await fetch(`https://gamebanana.com/apiv11/${mod._sModelName}/${mod._idRow}/ProfilePage`);
                        dlpage = await dlpage.json();

                        var eligibleDownloads = [];

                        dlpage._aFiles.forEach(file => {
                            try {
                                var mmo = file._aModManagerIntegrations.map(x => x._idToolRow);
                                if (mmo.includes(20575)) {
                                    eligibleDownloads.push(file);
                                }
                            }
                            catch {
                                //nothing, file is just not compatible
                            }
                        });

                        if (eligibleDownloads.length === 0) {
                            dlBtn.innerHTML = icon('cancel', '0.9em');
                            var open = await htmlAlert(await k('shop_nooneclick'), await k('shop_nooneclick_desc'),[{text:await k('ok'),resolveWith:'no',},{text:await k('shop_open_mod_page'),resolveWith:'yes'}], 'web_traffic');
                            if (open === 'yes') {
                                window.open(mod._sProfileUrl, '_blank');
                            }
                            return;
                        }

                        if (eligibleDownloads.length > 1) {
                            dlBtn.innerHTML = icon('indeterminate_question_box', '0.9em');
                            var res = await htmlAlert(await k('shop_multiple_files'), await k('shop_multiple_files_desc'),eligibleDownloads.map(x => {return {text:x._sFile,resolveWith:x._sDownloadUrl.replace('dl','mmdl')}}), 'deployed_code_update');
                            if (!res) {
                                return;
                            }
                            else {
                                dlmod(res, dlBtn);
                            }
                            return;
                        }

                        dlmod(eligibleDownloads[0]._sDownloadUrl.replace('dl','mmdl'), dlBtn, mod._idRow, mod._sModelName);
                    };

                    td1.appendChild(dlBtn);

                    var commentBtn = document.createElement('button');
                    commentBtn.innerHTML = icon('comment', '0.9em') + '';
                    commentBtn.style.marginLeft = '8px';
                    commentBtn.className = 'serietast';
                    commentBtn.onclick = async () => {
                        window._pageArguments = {
                            id: mod._idRow,
                            model: mod._sModelName
                        };
                        page('gamebanana-leave-comment');
                    };
                    commentBtn.disabled = !isGBLoggedIn;
                    td1.appendChild(commentBtn);

                    var likeBtn = document.createElement('button');
                    likeBtn.innerHTML = icon('mood_heart', '0.9em') + '';
                    likeBtn.style.marginLeft = '8px';
                    likeBtn.className = 'serietast';
                    likeBtn.disabled = !isGBLoggedIn;
                    likeBtn.onclick = async () => {
                        let res = await window.electronAPI.invoke('gbLikeMod',[mod._sModelName, mod._idRow]);
                        if (res.status == 200) {
                            likeBtn.innerHTML = icon('sentiment_very_satisfied', '0.9em') + '';
                            likeBtn.disabled = true;
                        }
                        else if (res.data._sErrorCode.toLowerCase() == 'already_liked') {
                            await htmlAlert(await k('shop_cant_like'),await k('shop_already_liked'),[{text:'Ok',resolveWith:'ok'}], 'sentiment_very_satisfied');
                            likeBtn.innerHTML = icon('sentiment_very_satisfied', '0.9em') + '';
                            likeBtn.disabled = true;
                        } else {
                            await htmlAlert(await k('shop_cant_like'),res.data._sErrorCode,[{text:'Ok',resolveWith:'ok'}], 'error');
                        }
                    };
                    td1.appendChild(likeBtn);
                }

                // tr-ify and add
                var tr = document.createElement('tr');
                tr.appendChild(td0);
                tr.appendChild(td1);

                table.appendChild(tr);
            })();
        };
    }
    catch (e) {
        console.error(e);
        
        await htmlAlert(await k('shop_error'),await k('shop_error_desc'),[{text:'Ok',resolveWith:'ok'}], 'error');

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
        await htmlAlert(await k('shop_offline'),await k('shop_offline_desc'),[{text:await k('ok'),resolveWith:'ok'}], 'cloud_alert');
        page('main');
        return;
    }
    let gameID = (await window.electronAPI.invoke('getCurrentGameInfo',[])).gamebanana.id;
    let GB_API = 'https://gamebanana.com/apiv11/Game/' + gameID + '/Subfeed?_sSort=default&_nPage=$PAGE';
    let table = document.getElementById('modsBody');
    let filter = async function(a) {
        return a;
    };

    if (window._pageArguments && window._pageArguments.gbAPI && window._pageArguments.gbAPIFilter) {
        GB_API = window._pageArguments.gbAPI;
        filter = window._pageArguments.gbAPIFilter;
    }

    if (window._pageArguments && window._pageArguments.leSearchQuery) {
        document.getElementById('searchInput').value = window._pageArguments.leSearchQuery;
        csearch = window._pageArguments.leSearchQuery;

        let searchInd = document.getElementById('searchInd');
        searchInd.style.display = 'block';
        searchInd.innerText = await k('shop_showingresults', csearch);
    }

    capi = GB_API;
    window._pageArguments = {}; // reset page arguments

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

document.getElementById('searchInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        search();
    }
});