var audio = new Audio();
var currentAudio = "";
var theme = null;
var pageN = null;
var addedStyle = null;
var update = false;
var TARGET_MUSIC_VOLUME = 0.5;
function rew() {
    var a = new Audio();
    a.src = './rew.mp3';
    a.play();
}
function brightenColor(r,g,b, amount) {
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return `rgb(${r}, ${g}, ${b})`;
}

function toggleFullscreen() {
    window.electronAPI.invoke('toggleFullscreen', []);
}

function toggleMinimize() {
    window.electronAPI.invoke('minimizeMe', []);
}

function genbtnstyles() {
    // deprecated
}

window.preloadAPI.onWRA(() => {
    rew();
});

function error() {
    fetch('http://google.com');
}

var alertCache = [];
var isAlertShowing = false;
async function htmlAlert(t,m,b,i) {
    if (isAlertShowing) {
        return new Promise((resolve, reject) => {
            alertCache.push({title: t, message: m, buttons: b, resolve: resolve, reject: reject, specialIcon: 'info'});
        });
    }
    else {
        return htmlAlertRaw(t, m, b, i);
    }
}
async function htmlAlertRaw(title, message, buttons, specialIcon = 'info') {
    return new Promise((resolve, reject) => {
        isAlertShowing = true;
        var alertMain = document.getElementsByClassName('alertMain')[0];
        var alertMsgR = alertMain.getElementsByClassName('alertMsg')[0];


        alertMsgR.innerHTML = '';

        var alertMsg = document.createElement('div');
        alertMsgR.appendChild(alertMsg);

        var titleElement = document.createElement('h1');
        titleElement.innerText = title;
        titleElement.style.opacity = '0';
        var messageElement = document.createElement('p');
        messageElement.innerHTML = message.replace(/\n/g, '<br>');
        messageElement.style.opacity = '0';
        alertMsg.appendChild(titleElement);
        alertMsg.appendChild(messageElement);

        var buttonsHTML = document.createElement('div');
        buttonsHTML.style.textAlign = 'right';
        buttonsHTML.classList.add('alertButtons');
        buttonsHTML.style.opacity = '0';
        buttons.forEach((button, index) => {
            var btn = document.createElement('button');
            btn.textContent = button.text;
            btn.onclick = function() {
                alertMsgR.style.animation = '0.3s alertFadeOut cubic-bezier(0.25, 1, 0.5, 1)';
                setTimeout(() => {
                    alertMain.style.animation = '';
                    alertMain.style.display = 'none';
                    alertMsgR.style.animation = '0.3s alertFadeIn cubic-bezier(0.25, 1, 0.5, 1)';
                    alertMsgR.innerHTML = '';
                }, 300);
                isAlertShowing = false;
                var a = new Audio();
                a.src = './booow.mp3';
                a.play();
                if (button.resolveWith) {
                    resolve(button.resolveWith);
                    return;
                }
                if (button.rejectWith) {
                    reject(button.rejectWith);
                    return;
                }
                if (button.onClick) button.onClick();

                // Check if there are more alerts in the cache
                if (alertCache.length > 0) {
                    setTimeout(() => {
                        var nextAlert = alertCache.shift();
                        htmlAlertRaw(nextAlert.title, nextAlert.message, nextAlert.buttons).then(nextAlert.resolve).catch(nextAlert.reject);
                    }, 600);
                }
                return;
            }
            buttonsHTML.appendChild(btn);
        });

        alertMain.style.display = 'flex';
        alertMsg.appendChild(buttonsHTML);

        var bigIcon = document.createElement('span');
        bigIcon.classList.add('material-symbols-outlined', 'alertBigIcon');
        bigIcon.innerText = specialIcon;
        bigIcon.style.fontSize = '400px';
        bigIcon.style.position = 'absolute';
        bigIcon.style.top = '-100px';
        bigIcon.style.right = '-50px';
        bigIcon.style.opacity = '0.1';
        bigIcon.style.userSelect = 'none';
        bigIcon.style.pointerEvents = 'none';
        alertMsgR.appendChild(bigIcon);

        setTimeout(() => {
            titleElement.style.animation = '0.3s stuffFadeIn cubic-bezier(0.25, 1, 0.5, 1) forwards';
        }, 100);
        setTimeout(() => {
            messageElement.style.animation = '0.3s stuffFadeIn cubic-bezier(0.25, 1, 0.5, 1) forwards';
        }, 200);
        setTimeout(() => {
            buttonsHTML.style.animation = '0.3s stuffFadeIn cubic-bezier(0.25, 1, 0.5, 1) forwards';
        }, 300);

        var a = new Audio();
        a.src = './ooow.mp3';
        a.play();
    });
}

function credits(funny) {
    page('credits');
}

window.preloadAPI.onUpdateAvailable((info) => {
    console.log('Update available:', info.version);
    update = true;
    window.ustack = {};
    window.ustack.updateInfo = info;

    htmlAlert('Update available', `A new version of Deltamod (${info.version}) is available for download. Do you wish to update?`, [
        { text: 'Yes', resolveWith: "a" },
        { text: 'No', rejectWith: "a" }
    ], 'update').then(async (result) => {
        await window.electronAPI.invoke('start-update', [window.ustack.updateInfo]);
    }).catch(async (result) => {
        await window.electronAPI.invoke('ignore-update', []);
    });
});

window.preloadAPI.onDLMODProgress((info) => {
    if (window.currentPageStack.dlmod) {
        window.currentPageStack.dlmod(info);
    }
});

window.preloadAPI.onDDS((info) => {
    if (window.currentPageStack.du) {
        window.currentPageStack.du(info.percentage);
    }
});

window.preloadAPI.onRefresh(() => {
    page(pageN);
});

window.preloadAPI.onUpdateProgress((info) => {
    if (window.currentPageStack.u) {
        window.currentPageStack.u(info.perc);
    }
});

window.preloadAPI.onFinishedPatch(() => {
    if (window.currentPageStack.fp) {
        window.currentPageStack.fp();
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
async function refreshTheme(refreshAudio = true) {
    theme = await fetch('themeprot://data/' + await window.electronAPI.invoke('getTheme', []) + '.theme.json').then(response => response.json());
    document.getElementsByClassName('bg')[0].style.backgroundImage = 'url(themeprot://img/' + theme.background + ')';
    if (refreshAudio) {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = true;
        audio.volume = TARGET_MUSIC_VOLUME;
        audio.src = 'themeprot://mus/' + theme.mainSong;
        audio.play();
        page(pageN);
    }
}
window.preloadAPI.onThemeChange(refreshTheme);

let lockRandoms = false;

async function page(name) {
    rew();
    
    if (name == "") {
        name = pageN;
    }
    // make sure nobody can escape to home
    if (await window.electronAPI.invoke('isBaked', []) && name == 'main') {
        name = 'bakedhome';
    }
    document.querySelector('.viewport').style.animation = '0.3s fadeOut cubic-bezier(0, 0.55, 0.45, 1)';
    document.querySelector('.viewport').style.pointerEvents = 'none';
    await new Promise(resolve => setTimeout(resolve, 300));
    document.querySelector('.viewport').style.animation = '0.4s fadeIn cubic-bezier(0, 0.55, 0.45, 1)';
    document.querySelector('.viewport').style.pointerEvents = 'auto';
    window.electronAPI.invoke('showWindow', []);
    theme = await fetch('themeprot://data/' + await window.electronAPI.invoke('getTheme', []) + '.theme.json').then(response => response.json());
    document.getElementsByClassName('bg')[0].style.backgroundImage = 'url(themeprot://img/' + theme.background + ')';
    // first render the fantastidynamic
    try {
        theme.dynamic.forEach(dynamicEvent => {
            switch (dynamicEvent.type) {
                case "RANDOM_OCCURENCE":
                    if (lockRandoms) return;
                    lockRandoms = true;
                    if (Math.random()*100 <= 2) {
                        console.log(`Dynamic event triggered: ${dynamicEvent.description}`);
                        if (dynamicEvent.override) {
                            Object.keys(dynamicEvent.override).forEach(key => {
                                theme[key] = dynamicEvent.override[key];
                            });
                            console.log('Theme updated with dynamic event overrides:', dynamicEvent.override);
                        }
                    }
                    break;
            }
        });
    }
    catch(e) {
        console.log('no dynamic theme');
    }

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
    if (true) {
        var audioSrc = purifiedHTML.match(/AUDIO\[(.*?)\]/);
        console.log('Audio source found:' + audioSrc);
        if (!audioSrc || !audioSrc[1]) {
            audioSrc = ['AUDIO[mainTheme.mp3]','mainTheme.mp3'];
        }
        if (audioSrc && audioSrc[1] && audioSrc[1] !== currentAudio) {
            currentAudio = audioSrc[1];
            audio.pause();
            audio.currentTime = 0;
            if (audioSrc[1] == 'mainTheme.mp3') {
                audio.src = 'themeprot://mus/' + theme.mainSong;
            }
            else {
                audio.src = './' + audioSrc[1];
            }
            audio.loop = true;
            audio.volume = TARGET_MUSIC_VOLUME;

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
    try {
        const vp = document.getElementsByClassName('viewport')[0];
        if (vp && typeof vp.scrollTo === 'function') {
            vp.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        } else {
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        }
    } catch (e) {
        window.scrollTo(0, 0);
    }
    pageN = name;
    /*
    Array.from(document.querySelectorAll('th')).forEach(th => {
        th.style.backgroundColor = theme.color;
    });
    */
    var generatedCSS = `
    /* Generated by Deltamod */
    :root {
        --theme-color: ${theme.color};
    }
    button:not(.sidebar-button), input, select {
        border: 1.3px solid ${theme.color};
    }
    th {
        background-color: ${theme.color};
    }
    input, progress {
        accent-color: ${theme.color};
    }
    .sidebar {
        border-color: ${theme.color};
    }
    `;
    var styleTag = document.getElementById('dynamic-theme-styles');
    styleTag.innerHTML = generatedCSS;
    if (runScripts)
        eval(await fetch('./views/' + name + '/index.js').then(response => response.text()));
}

window.addEventListener('blur', () => {
    if (audio) {
        audio.volume = 0;
    }
});

window.addEventListener('focus', async () => {
    let shouldPlayAudio = await window.electronAPI.invoke('getUniqueFlag', ["AUDIO"]);
    if (audio && shouldPlayAudio) {
        audio.volume = TARGET_MUSIC_VOLUME;
    }
});

if (!window.electronAPI) {
    window.alert('This application cannot run in this environment.');
    window.close();
    window.location.href = 'about:blank';
}

(async function() {
    var os = await window.electronAPI.invoke('getOS',[]);
    if (os.platform == 'win32' && os.version.startsWith('Windows 11')) {
        document.getElementsByClassName('winb')[0].style.borderRadius = "8px";
    }
    // Check if deltarune is loaded
    var loaded = await window.electronAPI.invoke('loadedDeltarune',[]);

    if (await window.electronAPI.invoke('fetchSharedVariable',["gb1click"]) === true) {
        page('goc-dl');
        return;
    }

    var hasCore = await window.electronAPI.invoke('hasPatchingCore',[]);
    if (!hasCore) {
        page('busy');
        await htmlAlert('Important error', 'There is no patcher installed. Please install a new GM3P version to continue using Deltamod.', [
            { text: 'OK', resolveWith: 'ok' }
        ], 'error_med');

        await page('gm3p-selector');

        document.querySelectorAll('.sidebar-button').forEach(button => {
            button.disabled = true;
        });

        return;
    }

    if (loaded.loaded) {
        var available = await window.electronAPI.invoke('fireUpdate', []);
        console.log('Update check complete. Update available:', available);

        await page('main');

        window.electronAPI.invoke('executeArgumentCmd',[]);
        
        
        try {
            var anyMSG = await fetch('https://deltamodders.github.io/deltamod-msgrepo/msg.json?' + Date.now()).then(res => res.json());
            anyMSG.availableMsg.forEach(async (msg) => {
                if (localStorage.getItem('seenMSG_' + msg.id) != 'true' || msg.showEveryBoot) {
                    localStorage.setItem('seenMSG_' + msg.id, 'true');
                    await htmlAlert(msg.title, msg.message + "\n" + msg.sender, [
                        { text: 'OK' }
                    ]);
                }
            });
        }
        catch (e) {
            console.log('No MSGs found or error fetching them.');
        }
    } else {
        await page('locate');
        window.electronAPI.invoke('executeArgumentCmd',[]);
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

document.getElementsByClassName('sidebar')[0].addEventListener('mouseenter', () => {
    document.getElementsByClassName('sidebar-backdrop')[0].style.opacity = 1;
});

document.getElementsByClassName('sidebar')[0].addEventListener('mouseleave', () => {
    document.getElementsByClassName('sidebar-backdrop')[0].style.opacity = 0;
});

document.getElementsByClassName('sidebar-backdrop')[0].style.opacity = 0;

Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => {
    tippy(button, {
        content: button.getAttribute('data-label') || uppercaseFirst(button.getAttribute('data-page')),
        placement: 'right',
        delay: [0, 0],
    });
});

(async () => {
    var gbflag = await window.electronAPI.invoke('getUniqueFlag', ['SHOP']);
    if (gbflag && navigator.onLine) {
        document.getElementById('shopRibbon').style.display = 'block';
    }

    if (!localStorage.getItem('seenShopAlert') && !gbflag && navigator.onLine) {
        localStorage.setItem('seenShopAlert', 'true');
        var res = await htmlAlert('Deltamod Mod Shop', 'Do you wish to enable the Mod Shop? A brand new way to get your mods directly from this app. This service uses GameBanana. (You can always toggle this setting in the Options)', [
            { text: 'Yes', resolveWith: true },
            { text: 'No', resolveWith: false }
        ]);
        await window.electronAPI.invoke('setUniqueFlag', ['SHOP', res]);
        if (res) {
            window.location.reload();
        }
    }
})();

var elaps = 0;
var start = 0;
var end = 0;
var lastClose = 0;
document.querySelector('.sidebar').addEventListener('mouseenter', () => {
    start = Date.now();

    elaps = start - lastClose;

    if (elaps > 200 || end == 0) {
        var a = new Audio();
        a.src = './hoverSBAR.mp3';
        a.volume = 0.6;
        a.play();
    }
});

document.querySelector('.sidebar').addEventListener('mouseleave', () => {
    end = Date.now();

    elaps = end - start;

    if (elaps > 200) {
        var a = new Audio();
        a.src = './dehoverSBAR.mp3';
        a.volume = 0.6;
        a.play();
    }

    lastClose = Date.now();
});