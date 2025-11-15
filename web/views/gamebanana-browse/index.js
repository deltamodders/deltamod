function getThumbURL(mod) {
    try {
        return mod._aPreviewMedia._aImages[0]?._sBaseUrl + "/" + mod._aPreviewMedia._aImages[0]._sFile530;
    }
    catch {
        return 'https://gamebanana.com/img/gblogo.png';
    }
}

let PAGE = (window._pageArguments && window._pageArguments.lp) ? parseInt(window._pageArguments.lp) : 1;

function plusPage(ind) {
    PAGE += ind;
    if (PAGE < 1) PAGE = 1;
    window._pageArguments = window._pageArguments || {};
    window._pageArguments.lp = PAGE;
    page('gamebanana-browse');
}

window.currentPageStack.plusPage = plusPage;

(async () => {
    if (navigator.onLine === false) {
        await htmlAlert('Offline','To access the shopping page, you must have an active Internet connection.',[{text:'Ok',resolveWith:'ok'}]);
        page('main');
        return;
    }
    let GB_API = 'https://gamebanana.com/apiv11/Game/6755/Subfeed?_sSort=default&_nPage=' + PAGE;
    let table = document.getElementById('modsBody');

    window._pageArguments = {}; // reset page arguments

    var response = await fetch(GB_API);
    var data = await response.json();

    table.innerHTML = '';

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

            var otherInfoSpan = document.createElement('span');
            otherInfoSpan.className = 'modOtherInfoSpan';
            otherInfoSpan.style.display = 'block';
            otherInfoSpan.style.fontSize = '0.8em';
            otherInfoSpan.style.color = '#888888';
            otherInfoSpan.style.marginTop = '4px';
            otherInfoSpan.innerHTML = `${icon('attribution','0.9em')} ${mod._aSubmitter._sName}`;
            div1.appendChild(otherInfoSpan);
        }

        var td1 = document.createElement('td');
        // Rendering of td1
        {
            var viewButton = document.createElement('button');
            viewButton.innerHTML = icon('download', '0.9em') + ' View this mod';
            viewButton.onclick = () => {
                window.open(mod._sUrl, '_blank');
            };
            td1.appendChild(viewButton);
        }


        // tr-ify and add
        var tr = document.createElement('tr');
        tr.appendChild(td0);
        tr.appendChild(td1);

        table.appendChild(tr);
    });
})();