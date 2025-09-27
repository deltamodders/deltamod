window.currentPageStack = {};
window.currentPageStack.gpl = function (message) {
    document.getElementById("gpl").innerText += message;
    document.getElementById("gpl").innerHTML += "<br>";
    const gplElement = document.getElementById("gpl");
    gplElement.scrollTop = gplElement.scrollHeight;
}



window.currentPageStack.toggleGM3P = function () {
    const gplElement = document.getElementById("gpl");
        if (gplElement.style.display === "none" || gplElement.style.display === "") {
            gplElement.style.display = "block";
        } else {
            gplElement.style.display = "none";
        }
};

(async() => {
    const THEME = await window.electronAPI.invoke('getSponsor',[]);

    let configuration = await fetch('deltapack://web/views/patching/sponsors/' + THEME + '/config.sponsor.json').then(response => response.json());

    configuration.img.forEach(img => {
        let imageElement = document.createElement('img');
        imageElement.src = 'deltapack://web/views/patching/sponsors/' + THEME + '/' + img;
        imageElement.className = 'sponsor-image';
        document.querySelector('.sponsor-container').appendChild(imageElement);
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
})();