var audio = new Audio();
var currentAudio = "";
var theme = null;
var pageN = null;

console.log = function(...arguments) {
    window.electronAPI.invoke('log', [arguments.join(' '), 'LOG', pageN]);
}

console.warn = function(...arguments) {
    window.electronAPI.invoke('log', [arguments.join(' '), 'WARN', pageN]);
}

console.error = function(...arguments) {
    window.electronAPI.invoke('log', [arguments.join(' '), 'ERROR', pageN]);
}

console.info = function(...arguments) {
    window.electronAPI.invoke('log', [arguments.join(' '), 'INFO', pageN]);
}

async function page(name) {
    theme = await fetch('./themes/' + await window.electronAPI.invoke('getTheme', []) + '.theme.json').then(response => response.json());
    document.getElementsByClassName('viewport')[0].style.backgroundImage = 'url(./' + theme.background + ')';
    window.currentPageStack = {};
    var purifiedHTML =  await fetch('./' + name + '/index.html').then(response => response.text());
    var runScripts = false;
    var changeAudio = false;
    if (purifiedHTML.includes('JSL')) {
        purifiedHTML = purifiedHTML.replace('JSL', '');
        runScripts = true;
    }
    if (purifiedHTML.includes('AUDIO[')) {
        var audioSrc = purifiedHTML.match(/AUDIO\[(.*?)\]/);
        if (audioSrc && audioSrc[1] && audioSrc[1] !== currentAudio) {
            currentAudio = audioSrc[1];
            audio.pause();
            audio.currentTime = 0;
            if (audioSrc[1] == 'mainTheme.mp3') {
                audio.src = './' + theme.mainSong;
            }
            else {
                audio.src = './' + audioSrc[1];
            }
            audio.loop = true;
            audio.volume = 0.7;
            if ((await window.electronAPI.invoke('getUniqueFlag', ['audio']))) {
                audio.play().catch(error => {

                });
            }

            changeAudio = true;
        }
        purifiedHTML = purifiedHTML.replace(/AUDIO\[(.*?)\]/g, '');
    }
    document.getElementsByClassName('viewport')[0].innerHTML = purifiedHTML;
    pageN = name;
    if (runScripts) {
        eval(await fetch('./' + name + '/index.js').then(response => response.text()));
    }
}

if (!window.electronAPI) {
    window.alert('This application cannot run in this environment.');
    window.close();
    window.location.href = 'about:blank';
}

(async function() {
    // Check if deltarune is loaded
    var loaded = await window.electronAPI.invoke('loadedDeltarune',[]);

    if (loaded.loaded) {
        await page('main');
    } else {
        await page('locate');
    }

})();

function closeAudio() {
    if (audio) {
        audio.pause();
    }
}

function openAudio() {
    if (audio && audio.src) {
        audio.play().catch(error => {
            
        });
    }
}

window.preloadAPI.onPage((title) => {
    page(title);
});

window.preloadAPI.onAudio((stat) => {
    if (stat) openAudio();
    else closeAudio();
});
