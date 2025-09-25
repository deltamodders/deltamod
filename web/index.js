var audio = new Audio();
var currentAudio = "";
var theme = null;
var pageN = null;
var addedStyle = null;
var update = false;
var lockFunnyCredits = false;
var pressCredits = 0;

async function htmlAlert(title, message, buttons) {
    return new Promise((resolve, reject) => {
        var alertMain = document.getElementsByClassName('alertMain')[0];
        var alertMsg = alertMain.getElementsByClassName('alertMsg')[0];

        alertMsg.innerHTML = `
            <h1>${(title)}</h1>
            <p>${(message)}</p>
        `;

        var buttonsHTML = document.createElement('div');
        buttonsHTML.style.textAlign = 'right';
        buttons.forEach((button, index) => {
            var btn = document.createElement('button');
            btn.textContent = button.text;
            btn.onclick = function() {
                alertMain.style.display = 'none';
                if (button.resolveWith) {
                    resolve(button.resolveWith);
                    return;
                }
                if (button.rejectWith) {
                    reject(button.rejectWith);
                    return;
                }
                if (button.onClick) button.onClick();
                return;
            }
            buttonsHTML.appendChild(btn);
        });

        alertMain.style.display = 'flex';
        alertMsg.appendChild(buttonsHTML);
    });
}

function credits(funny) {
    pressCredits++;
    if (!funny) funny = false;

    var random = Math.floor(Math.random() * 100);

    var range = [98, 99]; // 5% chance

    if (random >= range[0] && random <= range[1]) funny = true;
    if (lockFunnyCredits || pressCredits >= 25) funny = false;
    
    page('credits' + (funny ? '-funny' : ''));

    if (funny) {
        lockFunnyCredits = true;
    }
}

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

function sanitizeHTML(str) {
    var temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

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

function uppercaseFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
window.preloadAPI.onGPL((message) => {
    if (window.currentPageStack.gpl) {
        window.currentPageStack.gpl(message);
    }
});

function adaptForIcons(element) {
    element.style.display = 'flex';
    element.style.alignItems = 'left';
    element.style.gap = '5px';
    element.style.justifyContent = 'left';
    return element;
}
function icon(name, fontSize) {
    return "<span class=\"material-symbols-outlined\" style=\"font-size: " + fontSize + "\">" + name + "</span>";
}
async function refreshTheme() {
    theme = await fetch('./themes/' + await window.electronAPI.invoke('getTheme', []) + '.theme.json').then(response => response.json());
    audio.pause();
    audio.currentTime = 0;
    audio.loop = true;
    audio.volume = 0.7;
    audio.src = './' + theme.mainSong;
    audio.play();
    page(pageN);
}
window.preloadAPI.onThemeChange(refreshTheme);

async function page(name) {
    theme = await fetch('./themes/' + await window.electronAPI.invoke('getTheme', []) + '.theme.json').then(response => response.json());
    document.getElementsByClassName('viewport')[0].style.backgroundImage = 'url(./' + theme.background + ')';
    window.currentPageStack = {};
    var purifiedHTML =  await fetch('./views/' + name + '/index.html').then(response => response.text());
    var runScripts = false;
    var changeAudio = false;
    if (purifiedHTML.includes('JSL')) {
        purifiedHTML = purifiedHTML.replace('JSL', '');
        runScripts = true;
    }
    if (purifiedHTML.includes('STYLESHEET[')) {
        var stylesheetSrc = purifiedHTML.match(/STYLESHEET\[(.*?)\]/);
        if (stylesheetSrc && stylesheetSrc[1]) {
            var stylesheetContent = await fetch(`./views/${name}/${stylesheetSrc[1]}.css`).then(res => res.text());

            var s = addedStyle ?? document.createElement("style");
            s.innerHTML = stylesheetContent;

            if (!addedStyle) {
                var h = document.getElementById("head");
                addedStyle = h.appendChild(s);
            }
        }
        purifiedHTML = purifiedHTML.replace(/STYLESHEET\[(.*?)\]/g, '');
    } else if (addedStyle) addedStyle.innerHTML = ""; // remove styles to not interfere with other pages
    if (purifiedHTML.includes('NO-SIDEBAR')) {
        purifiedHTML = purifiedHTML.replace('NO-SIDEBAR', '');
        Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => {
            button.disabled = true;
        });
    }
    else {
        Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => {
            button.disabled = false;
        });
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

            changeAudio = true;
        }
        let shouldPlayAudio = await window.electronAPI.invoke('getUniqueFlag', ["AUDIO"]);
        if (shouldPlayAudio) {
            audio.play();
        }
        else {
            audio.pause();
        }
        purifiedHTML = purifiedHTML.replace(/AUDIO\[(.*?)\]/g, '');
    }
    document.getElementsByClassName('viewport')[0].innerHTML = purifiedHTML;
    Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => {
        if (button.getAttribute('data-page') === name) {
            button.classList.add('active');
        }
        else {
            button.classList.remove('active');
        }
    });
    pageN = name;
    if (runScripts)
        eval(await fetch('./views/' + name + '/index.js').then(response => response.text()));
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
        var available = await window.electronAPI.invoke('fireUpdate', []);
        console.log('Update check complete. Update available:', available);
        window.electronAPI.invoke('showWindow', []);
        if (!available) {
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