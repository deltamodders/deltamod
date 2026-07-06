async function locateDelta() {
    var path = await window.electronAPI.invoke('locateDelta',[]);
    if (path != null && path != "Invalid") {
        document.querySelector('input[type="text"]').value = path;
    }
    else {
        htmlAlert("Warning","The selected folder is not a valid installation for " + window.gidName + ".", [{text:"Ok",resolveWith:'ok'}]);
    }
}

async function id() {
    console.log(document.getElementById('dpath').value.replaceAll('\\', '/'));
    if (window.gid == 'noid') {
        htmlAlert("Warning","Please select a game.",[{text:"Ok",resolveWith:'ok'}]);
        return;
    }
    await window.electronAPI.invoke("createNewInstallation", ["", "locate", (window.currentPageStack.pathOV ? window.currentPageStack.pathOV : document.getElementById('dpath').value).replaceAll('\\', '/'), (window.fromIM == undefined ? false : window.fromIM), window.gid, document.getElementById('copyAnyways').checked ? 'copy' : 'ncopy']);
}

async function steam() {
    if (window.gid == 'noid') {
        htmlAlert("Warning","Please select a game.",[{text:"Ok",resolveWith:'ok'}]);
        return;
    }
    await window.electronAPI.invoke("createNewInstallation", ["steam", "", "", window.fromIM, window.gid, document.getElementById('copyAnyways').checked ? 'copy' : 'ncopy']);
}

window.currentPageStack.id = id;

window.currentPageStack.back = function() {
    window.electronAPI.invoke('changeSystemIndex', ["0"]);
};

window.currentPageStack.locateDelta = locateDelta;

window.currentPageStack.steam = steam;

window.currentPageStack.downloadDelta = async function() {
    if (window.gid == 'noid') {
        htmlAlert("Warning","Please select a game.",[{text:"Ok",resolveWith:'ok'}]);
        return;
    }
    var path = await window.electronAPI.invoke("downloadGame", [window.gid]);
    if (path) {
        document.querySelector('input[type="text"]').value = path;
    }

    document.querySelector('.copyAnyways').style.opacity = 0.5;
    document.querySelector('.copyAnyways').style.pointerEvents = 'none';
    document.querySelector('#copyAnyways').checked = true;
};

(async() => {
    var allFeat = ['steam','autodownload'];
    allFeat.forEach(f => {
        document.getElementById('feat_' + f).disabled = true;
        document.getElementById('feat_' + f).style.opacity = 0.4;
    });
    window.gid = "noid";

    var games = await window.electronAPI.invoke('getAvailableGames',[]);
    var gOptions = document.querySelector('.gOptions');

    var ems = [];

    for (l in games) {
        await (async() => {
            var game = games[l];

            var img = document.createElement('img');
            img.id = game.id;
            img.classList.add('gameIco');
            img.addEventListener('click', function() {
                window.gid = game.id;
                window.gidName = game.name;
                document.querySelectorAll('.gameIco').forEach(x =>{
                    x.classList.remove('selectedGameIco');
                });

                img.classList.add('selectedGameIco');

                var allFeat = ['steam','autodownload'];
                allFeat.forEach(f => {
                    if (game.availableFeatures.map(x => x.feat).includes(f)) {
                        document.getElementById('feat_' + f).disabled = false;
                        document.getElementById('feat_' + f).style.opacity = 1;
                    }
                    else {
                        document.getElementById('feat_' + f).disabled = true;
                        document.getElementById('feat_' + f).style.opacity = 0.4;
                    }
                });
            })
            img.src = './gamesIco/' + game.id+'.png';
            gOptions.appendChild(img);

            ems.push({id:game.id,em:img});

            tippy(img, {
                content: game.name
            });
        })();
    }
})();