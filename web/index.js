var audio = new Audio();

async function page(name) {
    var purifiedHTML =  await fetch('./' + name + '/index.html').then(response => response.text());
    var runScripts = false;
    var changeAudio = false;
    if (purifiedHTML.includes('JSL')) {
        purifiedHTML = purifiedHTML.replace('JSL', '');
        runScripts = true;
    }
    if (purifiedHTML.includes('AUDIO[')) {
        var audioSrc = purifiedHTML.match(/AUDIO\[(.*?)\]/);
        if (audioSrc && audioSrc[1]) {
            audio.pause();
            audio.currentTime = 0;
            audio.src = './' + audioSrc[1];
            audio.loop = true;
            audio.volume = 0.7;
            audio.play().catch(error => {

            });
            changeAudio = true;
        }
        purifiedHTML = purifiedHTML.replace(/AUDIO\[(.*?)\]/g, '');
    }
    document.getElementsByClassName('viewport')[0].innerHTML = purifiedHTML;
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