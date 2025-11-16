function getThumbURL(mod) {
    try {
        return mod._aPreviewMedia._aImages[0]?._sBaseUrl + "/" + mod._aPreviewMedia._aImages[0]._sFile530;
    }
    catch {
        return 'https://gamebanana.com/img/gblogo.png';
    }
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
    let query = document.getElementById('searchInput').value;
    if (query.length < 3) {
        await htmlAlert('Search query too short','Please enter at least 3 characters to search.',[{text:'Ok',resolveWith:'ok'}]);
        return;
    }
    window._pageArguments.gbAPI = 'https://gamebanana.com/apiv11/Util/Search/Results?_sModelName=Mod&_sOrder=best_match&_sSearchString=' + encodeURIComponent(query) + '&_csvFields=name%2Cdescription%2Carticle%2Cattribs%2Cstudio%2Cowner%2Ccredits&_idGameRow=6755&_nPage=$PAGE';
    window._pageArguments.gbAPIFilter = async function(data) {
        return data;
    };
    window._pageArguments.leSearchQuery = query;
    page('gamebanana-browse');
}

window.currentPageStack.qms = {}; //queryme stack

function dlmod(dlurl, buttonElem=null) {
    lockUs = true;
    Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = true);
    let queryme = Math.random().toString(36).substring(2, 15);
    buttonElem.innerHTML = "";
    var prog = document.createElement('progress');
    prog.value = 0;
    prog.max = 100;
    prog.style.width = '100px';
    buttonElem.appendChild(prog);

    window.currentPageStack.qms[queryme] = function(info) {
        if (info.error) {
            lockUs = false;
            Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = false);
            buttonElem.innerHTML = icon('cancel', '0.9em') + ' Error: ' + info.message;;
            return;
        }
        prog.value = info.percent;
        if (info.percent >= 100) {
            lockUs = false;
            Array.from(document.querySelectorAll('.sidebar-button')).forEach(e => e.disabled = false);
            buttonElem.innerHTML = icon('check', '0.9em') + ' Download complete!';
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
        await htmlAlert('Offline','To access the shopping page, you must have an active Internet connection.',[{text:'Ok',resolveWith:'ok'}]);
        page('main');
        return;
    }
    let GB_API = 'https://gamebanana.com/apiv11/Game/6755/Subfeed?_sSort=default&_nPage=$PAGE';
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

    var furl = GB_API.replace('$PAGE', PAGE);
    console.log('Fetching from URL: ' + furl);
    var response = await fetch(furl);
    var data = await filter(await response.json());

    table.innerHTML = '';

    try {
        if (data._aRecords.length === 0) {
            var tr = document.createElement('tr');
            var td = document.createElement('td');
            td.colSpan = 2;
            td.style.textAlign = 'center';
            td.innerText = 'No mods found.';
            tr.appendChild(td);
            table.appendChild(tr);
            return;
        }
        data._aRecords.forEach(mod => {
            if (mod._sModelName !== 'Mod') return;

            var td0 = document.createElement('td');
            td0.style.display = 'flex';
            td0.style.alignItems = 'center';
            td0.style.gap = '8px';
            td0.style.justifyContent = 'left';
            // Rendering of td0
            {
                var div0 = document.createElement('div');
                div0.className = 'modThumbDiv';
                div0.style.display = 'inline-block';
                
                var img = document.createElement('img');
                img.className = 'modThumbImg';
                img.src = getThumbURL(mod);
                img.style.width = '120px';
                img.style.aspectRatio = '16 / 9';
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
                otherInfoSpan.style.display = 'block';
                otherInfoSpan.style.fontSize = '0.8em';
                otherInfoSpan.style.color = '#888888';
                otherInfoSpan.style.marginTop = '4px';

                var authorSpan = document.createElement('span');
                authorSpan.className = 'modAuthorSpan';
                authorSpan.style.display = 'block';
                authorSpan.style.marginRight = '12px';
                authorSpan.style.marginBottom = '8px';
                authorSpan.innerHTML = `<img src="${mod._aSubmitter._sAvatarUrl}" alt="${mod._aSubmitter._sName}" class="modAuthorAvatar"> ${mod._aSubmitter._sName}`;
                authorSpan.onclick = () => {
                    window.open(mod._aSubmitter._sProfileUrl, '_blank');
                };
                authorSpan.style.cursor = 'pointer';

                var categorySpan = document.createElement('span');
                categorySpan.className = 'modCategorySpan';
                categorySpan.style.display = 'block';
                categorySpan.style.marginBottom = '8px';
                categorySpan.style.marginRight = '12px';
                categorySpan.innerHTML = `${icon('folder','0.9em')} ${mod._aRootCategory._sName}`;
                

                var dateSpan = document.createElement('span');
                dateSpan.className = 'modDateSpan';
                dateSpan.style.display = 'block';
                dateSpan.innerHTML = `${icon('calendar_clock','0.9em')} ${new Date(mod._tsDateAdded*1000).toLocaleDateString()}`;

                otherInfoSpan.appendChild(authorSpan);
                otherInfoSpan.appendChild(categorySpan);
                otherInfoSpan.appendChild(dateSpan);
                div1.appendChild(otherInfoSpan);
            }

            var td1 = document.createElement('td');
            // Rendering of td1
            {
                var viewButton = document.createElement('button');
                viewButton.innerHTML = icon('download', '0.9em') + ' Download this mod';
                viewButton.onclick = async () => {
                    viewButton.disabled = true;
                    viewButton.innerHTML = icon('downloading', '0.9em') + ' Loading...';
                    viewButton.style.opacity = '0.6';

                    var dlpage = await fetch(`https://gamebanana.com/apiv11/Mod/${mod._idRow}/ProfilePage`);
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
                        viewButton.innerHTML = icon('cancel', '0.9em') + ' Cannot download';
                        var open = await htmlAlert('No compatible files','This mod cannot be downloaded via Deltamod. Ask the owner to make it compatible with Deltamod!',[{text:'Ok',resolveWith:'no',},{text:'Open mod page on GameBanana',resolveWith:'yes'}]);
                        if (open === 'yes') {
                            window.open(mod._sProfileUrl, '_blank');
                        }
                        return;
                    }

                    if (eligibleDownloads.length > 1) {
                        viewButton.innerHTML = icon('cancel', '0.9em') + ' Multiple files found';
                        var res = await htmlAlert('Multiple compatible files','This mod has multiple files compatible with Deltamod. Please choose the one to download.',eligibleDownloads.map(x => {return {text:x._sFile,resolveWith:x._sDownloadUrl.replace('dl','mmdl')}}));
                        if (!res) {
                            return;
                        }
                        else {
                            dlmod(res, viewButton);
                        }
                        return;
                    }

                    dlmod(eligibleDownloads[0]._sDownloadUrl.replace('dl','mmdl'), viewButton);
                };
                td1.appendChild(viewButton);
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
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = 2;
        td.style.textAlign = 'center';
        td.innerText = 'An error occurred while loading mods.';
        tr.appendChild(td);
        table.appendChild(tr);
    }
})();