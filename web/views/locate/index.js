async function locateDelta() {
    var path = await window.electronAPI.invoke('locateDelta',[]);
    if (path) {
        document.querySelector('input[type="text"]').value = path;
    }
}

function id() {
    console.log(document.getElementById('dpath').value.replaceAll('\\', '/'));
    if (window.gid == 'noid') {
        htmlAlert('Warning','Please select a game.',[{text:'OK',resolveWith:'ok'}]);
        return;
    }
    window.electronAPI.invoke("createNewInstallation", ["", "locate", (window.currentPageStack.pathOV ? window.currentPageStack.pathOV : document.getElementById('dpath').value).replaceAll('\\', '/'), (window.fromIM == undefined ? false : window.fromIM), window.gid]);
}

function steam() {
    window.electronAPI.invoke("createNewInstallation", ["steam", "", "", window.fromIM, ""]);
}

window.currentPageStack.id = id;

window.currentPageStack.back = function() {
    window.electronAPI.invoke('changeSystemIndex', ["0"]);
};

window.currentPageStack.locateDelta = locateDelta;

window.currentPageStack.steam = steam;

document.getElementById('audioCHECK').addEventListener('change', (event) => {
    window.electronAPI.invoke('setUniqueFlag', ['AUDIO', event.target.checked]);
});

window.electronAPI.invoke('getUniqueFlag', ['AUDIO']).then((result) => {
    document.getElementById('audioCHECK').checked = result;
});

(async() => {
    window.gid = "noid";

    var games = await window.electronAPI.invoke('getAvailableGames',[]);
    var gOptions = document.querySelector('.gOptions');

    var ems = [];

    for (l in games) {
        await (async() => {
            var game = games[l];

            var img = document.createElement('img');
            img.style.width = '40px';
            img.style.opacity = '0.4';
            img.style.cursor = 'pointer';
            img.id = game.id;
            img.classList.add('gameico');
            img.addEventListener('click', function() {
                window.gid = game.id;
                document.querySelectorAll('.gameico:not(#' + game.id + ')').forEach(x =>{
                    x.style.opacity = 0.4;
                    img.style.opacity = 1;
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