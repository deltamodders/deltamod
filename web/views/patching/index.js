window.currentPageStack = {};
window.currentPageStack.gpl = function (message) {
    if (document.getElementById("gpl").innerHTML.length > 10000) {
        document.getElementById("gpl").innerHTML = document.getElementById("gpl").innerHTML.slice(document.getElementById("gpl").innerHTML.length - 8000);
    }
    document.getElementById("gpl").innerHTML += message + "<br>";
    const gplElement = document.getElementById("gpl");
    gplElement.scrollTop = gplElement.scrollHeight;
    gplElement.scrollLeft = 0;
}

window.currentPageStack.next = function () {
    window.electronAPI.invoke('npsCallback', []);
}

window.currentPageStack.fp = function () {
    if (!baker) {
        document.getElementById("patchingTXT").innerHTML = icon('check') + " Patching complete!";
        document.getElementById("patchingTXT").classList.add("success");
        document.getElementById("next").style.display = "block";
    }
    else {
        document.getElementById("patchingTXT").innerHTML = "<span class=\"material-symbols-outlined rotate\">cycle</span>" + " Finishing baking...";
    }
}



window.currentPageStack.toggleGM3P = function () {
    const gplElement = document.getElementById("gpl");
        if (gplElement.style.display === "none" || gplElement.style.display === "") {
            gplElement.style.display = "block";
        } else {
            gplElement.style.display = "none";
        }
};

let baker = false;

(async() => {
    const THEME = await window.electronAPI.invoke('getSponsor',[]);

    let configuration = await fetch('deltapack://web/views/patching/sponsors/' + THEME + '/config.sponsor.json').then(response => response.json());

    configuration.img.forEach(img => {
        let imageElement = document.createElement('img');
        imageElement.src = 'deltapack://web/views/patching/sponsors/' + THEME + '/' + img;
        imageElement.className = 'sponsor-image';
        document.querySelector('.tab1').appendChild(imageElement);
    });

    try {
        let css = await fetch('deltapack://web/views/patching/sponsors/' + THEME + '/style.sponsor.css').then(response => response.text());
        let styleElement = document.createElement('style');
        styleElement.innerHTML = css;
        document.head.appendChild(styleElement);
    }
    catch (e) {
        console.log('no custom css');
    }


    currentAudio = 'PATCHINGMUS';
    audio.pause();
    audio.currentTime = 0;
    audio.src = 'deltapack://web/views/patching/sponsors/' + THEME + '/mus.mp3';
    audio.loop = true;
    audio.volume = 0.7;
    let shouldPlayAudio = await window.electronAPI.invoke('getUniqueFlag', ["AUDIO"]);
    if (shouldPlayAudio) {
        audio.play();
    }

    if (window._pageArguments.customPatchingText) {
        document.getElementById("patchingTXT").innerHTML = "<span class=\"material-symbols-outlined rotate\">cycle</span>" + window._pageArguments.customPatchingText;
    }

    if (window._pageArguments.customPatchingDesc) {
        document.getElementById("patchingDesc").innerHTML = window._pageArguments.customPatchingDesc;
    }

    baker = window._pageArguments && window._pageArguments.baker;

    window._pageArguments = {};
})();