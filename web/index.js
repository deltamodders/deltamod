var audio = new Audio();
var currentAudio = "";
var theme = null;
var pageN = null;
var addedStyle = null;
var update = false;

window.preloadAPI.onUpdateAvailable((info) => {
    console.log('Update available:', info.version);
    update = true;
    window.ustack = {};
    window.ustack.updateInfo = info;
    page('update');
});

window.preloadAPI.onDDS((info) => {
    if (window.currentPageStack.du) {
        window.currentPageStack.du(info.percentage);
    }
});

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

window.preloadAPI.onGPL((message) => {
    if (window.currentPageStack.gpl) {
        window.currentPageStack.gpl(message);
    }
});

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
    if (purifiedHTML.includes('STYLESHEET[')) {
        var stylesheetSrc = purifiedHTML.match(/STYLESHEET\[(.*?)\]/);
        if (stylesheetSrc && stylesheetSrc[1]) {
            var stylesheetContent = await fetch(`./${name}/${stylesheetSrc[1]}.css`).then(res => res.text());

            var s = addedStyle ?? document.createElement("style");
            s.innerHTML = stylesheetContent;

            if (!addedStyle) {
                var h = document.getElementById("head");
                addedStyle = h.appendChild(s);
            }
        }
        purifiedHTML = purifiedHTML.replace(/STYLESHEET\[(.*?)\]/g, '');
    } else if (addedStyle) addedStyle.innerHTML = ""; // remove styles to not interfere with other pages
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

            changeAudio = true;
        }
        let shouldPlayAudio = await window.electronAPI.invoke('getUniqueFlag', ["AUDIO"]);
        console.log('Audio should play:', shouldPlayAudio);
        if (shouldPlayAudio) {
            audio.play();
        }
        else {
            audio.pause();
        }
        purifiedHTML = purifiedHTML.replace(/AUDIO\[(.*?)\]/g, '');
    }
    document.getElementsByClassName('viewport')[0].innerHTML = purifiedHTML;
    pageN = name;
    if (runScripts)
        eval(await fetch('./' + name + '/index.js').then(response => response.text()));
}

if (!window.electronAPI) {
    window.alert('This application cannot run in this environment.');
    window.close();
    window.location.href = 'about:blank';
}

(async function() {
    // Check if deltarune is loaded
    var loaded = await window.electronAPI.invoke('loadedDeltarune',[]);

    if (await window.electronAPI.invoke('fetchSharedVariable',["gb1click"]) === true) {
        page('goc-dl');
        return;
    }

    if (loaded.loaded) {
        window.electronAPI.invoke('fireUpdate', []);
        if (!update) {
            await page('main');
        }
        else {
            await page('update');
        }
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