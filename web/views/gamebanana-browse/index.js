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

var isGBLoggedIn = false;

async function gameBananaLogin() {
    var loggedin = await window.electronAPI.invoke('validateGamebananaToken',[]);

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

let PAGE = (window._pageArguments && window._pageArguments.lp) ? parseInt(window._pageArguments.lp) : 1;

function plusPage(ind) {
    PAGE += ind;
    if (PAGE < 1) PAGE = 1;
    window._pageArguments = window._pageArguments || {};
    window._pageArguments.lp = PAGE;
    window._pageArguments.gbAPI = capi;
    window._pageArguments.gbAPIFilter = async function(data) {
        return data;
    };
    window._pageArguments.leSearchQuery = csearch;
    page('gamebanana-browse');
}

async function search() {
    let gameID = (await window.electronAPI.invoke('getCurrentGameInfo',[])).gamebanana.id;
    let query = document.getElementById('searchInput').value;
    if (query.length < 3) {
        await htmlAlert('Search query too short','Please enter at least 3 characters to search.',[{text:'Ok',resolveWith:'ok'}], 'error');
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

function dlmod(dlurl, buttonElem=null) {
    lockUs = true;
    Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = true);
    let queryme = Math.random().toString(36).substring(2, 15);

    buttonElem.innerHTML = icon('clock_loader_10', '0.9em');

    window.currentPageStack.qms[queryme] = function(info) {
        if (info.error) {
            lockUs = false;
            Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = false);
            buttonElem.innerHTML = icon('cancel', '0.9em')
            return;
        }
        var ranges = [
            [0,20,'20'],
            [20,40,'40'],
            [40,60,'60'],
            [60,80,'80'],
            [80,100,'90']
        ];
        let roundedPercent = '';

        for (let r of ranges) {
            if (info.percent >= r[0] && info.percent < r[1]) {
                roundedPercent = r[2];
                break;
            }
        }
        
        buttonElem.innerHTML = icon('clock_loader_' + roundedPercent, '0.9em');
        if (info.percent >= 100) {
            lockUs = false;
            Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = false);
            buttonElem.innerHTML = icon('check', '0.9em');
        }
    };

    window.electronAPI.invoke('dlmodURL',[dlurl, queryme]);
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

(async () => {
    if (navigator.onLine === false) {
        await htmlAlert('You\'re offline','To access the shopping page, you must have an active Internet connection.',[{text:'Ok',resolveWith:'ok'}], 'cloud_alert');
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
        searchInd.innerText = `Currently showing results for "${csearch}"`;
    }

    capi = GB_API;
    window._pageArguments = {}; // reset page arguments

    await gameBananaLogin();

    var furl = GB_API.replace('$PAGE', PAGE);
    console.log('Fetching from URL: ' + furl);
    var response = await fetch(furl);
    var data = await filter(await response.json());

    var featured = await fetch("https://gamebanana.com/apiv11/Game/" + gameID + "/TopSubs");
    var featuredData = await featured.json();
    var featuredIDs = featuredData.map(x => {return {id: x._idRow, period: x._sPeriod};});

    table.innerHTML = '';

    try {
        if (data._aRecords.length === 0) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 2;
            td.innerText = 'No mods found were found matching your query.';
            tr.appendChild(td);
            table.appendChild(tr);
            return;
        }
        data._aRecords.forEach(mod => {
            if (mod._sModelName == 'Wip' && !mod._bHasFiles) return;
            if (mod._sModelName != 'Wip' && mod._sModelName != 'Mod') return;

            var td0 = document.createElement('td');
            td0.style.display = 'flex';
            td0.style.alignItems = 'center';
            td0.style.gap = '8px';
            td0.style.justifyContent = 'left';
            // Rendering of td0
            {
                var div0 = document.createElement('div');
                div0.className = 'modThumbDiv';
                
                var img = document.createElement('img');
                img.className = 'modThumbImg';
                img.src = (getThumbURL(mod));
                img.style.width = '120px';
                img.style.margin = '4px';
                img.style.aspectRatio = '16 / 9';
                img.style.borderRadius = '4px';
                img.style.border = '1px solid #ccc';
                img.style.height = 'auto';
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center';
                div0.appendChild(img);

                var div1 = document.createElement('div');
                div1.style.display = 'inline-block';
                div1.style.verticalAlign = 'top';
                div1.style.marginLeft = '8px';
                td0.appendChild(div0);
                td0.appendChild(div1);

                var biggerSpan = document.createElement('span');
                biggerSpan.className = 'modTitleSpan';
                biggerSpan.style.fontFamily = 'Calibri, sans-serif';
                biggerSpan.style.fontSize = '1.0em';
                biggerSpan.innerText = mod._sName;
                div1.appendChild(biggerSpan);

                var otherInfoSpan = document.createElement('div');
                otherInfoSpan.className = 'modOtherInfoSpan';
                otherInfoSpan.style.fontSize = '0.8em';
                otherInfoSpan.style.color = '#888888';
                otherInfoSpan.style.marginTop = '8px';
                otherInfoSpan.style.width = '100%';

                var nameauthor = mod._aSubmitter._sName;
                // easter egg for the tenna lover
                if (mod._aSubmitter._idRow == 1712567) {
                    nameauthor += ' (Tenna lover)';
                }
                var authorSpan = document.createElement('span');
                authorSpan.className = 'modAuthorSpan';
                authorSpan.style.display = 'block';
                authorSpan.style.marginRight = '12px';
                authorSpan.innerHTML = `${icon('attribution','0.9em')} ${nameauthor}`;
                authorSpan.onclick = () => {
                    window.open(mod._aSubmitter._sProfileUrl, '_blank');
                };
                authorSpan.style.cursor = 'pointer';

                var categorySpan = document.createElement('span');
                categorySpan.className = 'modCategorySpan';
                categorySpan.style.display = 'block';
                categorySpan.style.marginRight = '12px';
                categorySpan.innerHTML = `${icon('folder','0.9em')} ${mod._aRootCategory._sName}`;

                if (!mod.featuredDataset) {
                    var dateSpan = document.createElement('span');
                    dateSpan.className = 'modDateSpan';
                    dateSpan.style.display = 'block';
                    dateSpan.innerHTML = `${icon('calendar_clock','0.9em')} ${new Date(mod._tsDateAdded*1000).toLocaleDateString()}`;

                    var viewsSpan = document.createElement('span');
                    viewsSpan.className = 'modViewsSpan';
                    viewsSpan.style.display = 'block';
                    viewsSpan.innerHTML = `${icon('visibility','0.9em')} ${roundViews(mod._nViewCount)}`;
                }

                var e = null;
                if (featuredIDs.find(x => x.id === mod._idRow)) {
                    biggerSpan.style.color = 'gold';
                    img.style.border = '1px solid gold';
                    var periodsDesc = [
                        ["today","Best of today"],
                        ["week","Best of this week"],
                        ["month","Best of this month"],
                        ["3month","Best of last 3 months"],
                        ["6month","Best of last 6 months"],
                        ["year","Best of this year"],
                        ["alltime","All-Time Best"]
                    ]
                    var featSpan = document.createElement('span');
                    featSpan.className = 'modFeaturedSpan';
                    featSpan.style.display = 'inline-block';
                    for (let pd of periodsDesc) {
                        if (featuredIDs.find(x => x.id === mod._idRow && x.period === pd[0])) {
                            featSpan.innerHTML = `${icon((pd[0] == 'alltime' ? "award_star" : "editor_choice"),'0.9em')} ${pd[1]}`;
                            break;
                        }
                    }
                    featSpan.style.color = 'gold';
                    featSpan.style.marginRight = '12px';
                    e = featSpan;
                }

                otherInfoSpan.appendChild(authorSpan);
                otherInfoSpan.appendChild(categorySpan);
                try {
                    otherInfoSpan.appendChild(dateSpan);
                    otherInfoSpan.appendChild(viewsSpan);
                }
                catch {}
                if (e) otherInfoSpan.appendChild(e);
                div1.appendChild(otherInfoSpan);
            }

            var td1 = document.createElement('td');
            // Rendering of td1
            {
                var dlBtn = document.createElement('button');
                dlBtn.innerHTML = icon('download', '0.9em') + '';
                dlBtn.onclick = async () => {
                    dlBtn.disabled = true;
                    dlBtn.innerHTML = icon('downloading', '0.9em');
                    dlBtn.style.opacity = '0.6';

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
                        var open = await htmlAlert('One click not available','This mod cannot be downloaded via Deltamod because the owner did not package it for usage with the tool.',[{text:'Ok',resolveWith:'no',},{text:'Open mod page on GameBanana',resolveWith:'yes'}], 'web_traffic');
                        if (open === 'yes') {
                            window.open(mod._sProfileUrl, '_blank');
                        }
                        return;
                    }

                    if (eligibleDownloads.length > 1) {
                        dlBtn.innerHTML = icon('indeterminate_question_box', '0.9em');
                        var res = await htmlAlert('Multiple compatible files','This mod has multiple files compatible with Deltamod. Please choose the one to download.',eligibleDownloads.map(x => {return {text:x._sFile,resolveWith:x._sDownloadUrl.replace('dl','mmdl')}}), 'deployed_code_update');
                        if (!res) {
                            return;
                        }
                        else {
                            dlmod(res, dlBtn);
                        }
                        return;
                    }

                    dlmod(eligibleDownloads[0]._sDownloadUrl.replace('dl','mmdl'), dlBtn);
                };

                var vwBtn = document.createElement('button');
                vwBtn.innerHTML = icon('open_in_new', '0.9em') + '';
                vwBtn.style.marginRight = '8px';
                vwBtn.onclick = () => {
                    window.open(mod._sProfileUrl, '_blank');
                }
                td1.appendChild(vwBtn);
                td1.appendChild(dlBtn);

                if (isGBLoggedIn) {
                    var commentBtn = document.createElement('button');
                    commentBtn.innerHTML = icon('comment', '0.9em') + '';
                    commentBtn.style.marginLeft = '8px';
                    commentBtn.onclick = async () => {
                        window._pageArguments = {
                            id: mod._idRow,
                            model: mod._sModelName
                        };
                        page('gamebanana-leave-comment');
                    };
                    td1.appendChild(commentBtn);
                }
            }


            // tr-ify and add
            var tr = document.createElement('tr');
            tr.appendChild(td0);
            tr.appendChild(td1);

            table.appendChild(tr);
        });
    }
    catch (e) {
        console.error(e);
        
        await htmlAlert('Error loading mods','An error occurred while loading mods from GameBanana. Please try again later.',[{text:'Ok',resolveWith:'ok'}], 'error');

        page('main');
        return;
    }

    genbtnstyles();
})();