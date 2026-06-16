/**
 * ==========================================
 * Deltamod Core Script
 * ==========================================
 */


// Global Variables & State
var audio = new Audio();
var currentAudio = "";
var theme = null;
var pageN = null;
var addedStyle = null;
var update = false;
var TARGET_MUSIC_VOLUME = 0.5;
var cmode = false; // Controller Mode

window._onClosePage = window._onClosePage || [];

/**
 * Wrapper for invoking Electron IPC calls.
 */
async function invoke(...params) {
    return window.electronAPI.invoke(...params);
}

/**
 * Generates and appends glyph icons to the DOM.
 * @param {Array} jsonArr - Array of glyph objects { icon, description }
 */
async function makeGlyphs(jsonArr) {
    var glyphContainer = document.querySelector('.glyph');
    glyphContainer.innerHTML = '';
    
    jsonArr.forEach(glyph => {
        var glyphIconElement = document.createElement('span');
        glyphIconElement.classList.add('material-symbols-outlined');
        glyphIconElement.innerText = glyph.icon;

        var glyphDescElement = document.createElement('span');
        glyphDescElement.innerText = glyph.description;

        glyphContainer.appendChild(glyphIconElement);
        glyphContainer.appendChild(glyphDescElement);
    });
}

/**
 * Prompts the user to leave Controller Mode.
 */
async function promptLeaveCMode() {
    htmlAlert(
        await k('leave_cmode_title'), 
        await k('leave_cmode_message'), 
        [
            { text: await k('yes'), resolveWith: true },
            { text: await k('no'), resolveWith: false }
        ], 
        'stadia_controller'
    ).then((result) => {
        if (result) {
            window.electronAPI.invoke('cmode-off', []);
        }
    });
}

/**
 * Plays the "rew" SFX.
 */
async function rew() {
    if (await window.electronAPI.invoke('getUniqueFlag', ["SFX"]) === false) {
        return;
    }
    var a = new Audio();
    a.src = 'audio/rew.mp3';
    a.play();
}

/**
 * Brightens an RGB color by a specified amount.
 */
function brightenColor(r, g, b, amount) {
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Fetches an advanced localization key.
 */
function k(key, ...args) {
    return window.electronAPI.invoke('obtainLangKeyAdv', [key, args]);
}

/**
 * Replaces localization template keys ($$key$$) with localized strings in HTML.
 * @param {string} html - HTML string to process.
 */
async function replaceLangKeys(html) {
    const regex = /\$\$(.*?)\$\$/g;
    const matches = [...html.matchAll(regex)];

    const values = await Promise.all(
        matches.map(m =>
            window.electronAPI.invoke('obtainLangKey', [m[1]])
                .catch(() => m[0])
        )
    );

    let i = 0;
    return html.replace(regex, () => values[i++]);
}

// Window Management
function toggleFullscreen() { window.electronAPI.invoke('toggleFullscreen', []); }
function toggleMinimize() { window.electronAPI.invoke('minimizeMe', []); }
function genbtnstyles() { /* deprecated */ }

// Play rewind SFX on specific preload trigger
window.preloadAPI.onWRA(() => rew());

function error() {
    fetch('http://google.com'); // Force an error trigger if used in a specific context
}

/**
 * ==========================================
 * Custom HTML Alert System
 * ==========================================
 */
var alertCache = [];
var isAlertShowing = false;

/**
 * Queues or displays an HTML-based alert dialog.
 */
async function htmlAlert(title, message, buttons, specialIcon) {
    if (isAlertShowing) {
        return new Promise((resolve, reject) => {
            alertCache.push({ title, message, buttons, resolve, reject, specialIcon: 'info' });
        });
    } else {
        return htmlAlertRaw(title, message, buttons, specialIcon);
    }
}

/**
 * Internal function to handle the rendering of the HTML alert.
 */
async function htmlAlertRaw(title, message, buttons, specialIcon = 'info') {
    return new Promise(async (resolve, reject) => {
        isAlertShowing = true;
        var alertMain = document.getElementsByClassName('alertMain')[0];
        var alertMsgR = alertMain.getElementsByClassName('alertMsg')[0];

        var animOptions = 'cubic-bezier(0.22, 1, 0.36, 1) forwards';
        var animLength = 0.5;

        alertMsgR.innerHTML = '';

        // Container
        var alertMsg = document.createElement('div');
        alertMsgR.appendChild(alertMsg);

        // Title
        var titleElement = document.createElement('h1');
        titleElement.innerText = title;
        titleElement.style.opacity = '0';
        
        // Message
        var messageElement = document.createElement('p');
        messageElement.innerHTML = message.replace(/\n/g, '<br>');
        messageElement.style.opacity = '0';
        
        alertMsg.appendChild(titleElement);
        alertMsg.appendChild(messageElement);

        // Buttons
        var buttonsHTML = document.createElement('div');
        buttonsHTML.style.textAlign = 'right';
        buttonsHTML.classList.add('alertButtons');
        buttonsHTML.style.opacity = '0';

        buttons.forEach((button) => {
            var btn = document.createElement('button');
            btn.textContent = button.text;
            btn.onclick = function() {
                // Outro animation
                alertMsgR.style.animation = `${animLength}s alertFadeOut ${animOptions}`;
                setTimeout(() => {
                    alertMain.style.animation = '';
                    alertMain.style.display = 'none';
                    alertMsgR.style.animation = `${animLength}s alertFadeIn ${animOptions}`;
                    alertMsgR.innerHTML = '';
                }, 300);
                
                isAlertShowing = false;
                
                // Play dismiss SFX
                var a = new Audio();
                a.src = 'audio/booow.mp3';
                if (window.electronAPI.invoke('getUniqueFlag', ["SFX"]) === true) {
                    a.play();
                }

                // Resolve/Reject
                if (button.resolveWith) {
                    resolve(button.resolveWith);
                    return;
                }
                if (button.rejectWith) {
                    reject(button.rejectWith);
                    return;
                }
                if (button.onClick) button.onClick();

                // Process next alert in cache
                if (alertCache.length > 0) {
                    setTimeout(() => {
                        var nextAlert = alertCache.shift();
                        htmlAlertRaw(nextAlert.title, nextAlert.message, nextAlert.buttons)
                            .then(nextAlert.resolve)
                            .catch(nextAlert.reject);
                    }, 600);
                }
            };
            buttonsHTML.appendChild(btn);
        });

        alertMain.style.display = 'flex';
        alertMsg.appendChild(buttonsHTML);

        // Special Background Icon
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

        // Cascade Intro Animations
        setTimeout(() => { titleElement.style.animation = `${animLength}s stuffFadeIn ${animOptions}`; }, 100);
        setTimeout(() => { messageElement.style.animation = `${animLength}s stuffFadeIn ${animOptions}`; }, 200);
        setTimeout(() => { buttonsHTML.style.animation = `${animLength}s stuffFadeIn ${animOptions}`; }, 300);

        // Play alert SFX
        var a = new Audio();
        a.src = 'audio/htmlalert.mp3';
        a.playbackRate = 0.9;
        if (await window.electronAPI.invoke('getUniqueFlag', ["SFX"]) === true) {
            a.play();
        }
    });
}

function credits(funny) {
    page('credits');
}

/**
 * ==========================================
 * Preload API Listeners (Updates, Logging)
 * ==========================================
 */
window.preloadAPI.onUpdateAvailable((info) => {
    console.log('Update available:', info.version);
    update = true;
    window.ustack = {};
    window.ustack.updateInfo = info;

    htmlAlert(
        'Update available', 
        `A new version of Deltamod (${info.version}) is available for download. Do you wish to update?`, 
        [
            { text: 'Yes', resolveWith: "a" },
            { text: 'No', rejectWith: "a" }
        ], 
        'update'
    ).then(async () => {
        await window.electronAPI.invoke('start-update', []);
    }).catch(async () => {
        await window.electronAPI.invoke('ignore-update', []);
    });
});

window.preloadAPI.onDLMODProgress((info) => window.currentPageStack.dlmod && window.currentPageStack.dlmod(info));
window.preloadAPI.onDDS((info) => window.currentPageStack.du && window.currentPageStack.du(info.percentage));
window.preloadAPI.onRefresh(() => page(pageN));
window.preloadAPI.onUpdateProgress((info) => window.currentPageStack.u && window.currentPageStack.u(info.perc));
window.preloadAPI.onFinishedPatch(() => window.currentPageStack.fp && window.currentPageStack.fp());
window.preloadAPI.onGPL((message) => window.currentPageStack.gpl && window.currentPageStack.gpl(message));
window.preloadAPI.onPage((title) => page(title));
window.preloadAPI.onAudio((stat) => stat ? openAudio() : closeAudio());

function sanitizeHTML(str) {
    var temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

// Override console methods to tunnel logs through Electron IPC
console.log = function(...args) { window.electronAPI.invoke('log', [args.join(' '), 'LOG', pageN]); };
console.warn = function(...args) { window.electronAPI.invoke('log', [args.join(' '), 'WARN', pageN]); };
console.error = function(...args) { window.electronAPI.invoke('log', [args.join(' '), 'ERROR', pageN]); };
console.info = function(...args) { window.electronAPI.invoke('log', [args.join(' '), 'INFO', pageN]); };

function uppercaseFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function adaptForIcons(element) {
    element.style.display = 'flex';
    element.style.alignItems = 'left';
    element.style.gap = '5px';
    element.style.justifyContent = 'left';
    return element;
}

function icon(name, fontSize) {
    return `<span class="material-symbols-outlined" style="font-size: ${fontSize}">${name}</span>`;
}

/**
 * ==========================================
 * Theme & Audio Rendering
 * ==========================================
 */

/**
 * Refreshes the application theme and applies background/music.
 * @param {boolean} refreshAudio - Whether to also reload and play the main theme song.
 */
async function themeRefresh(refreshAudio = true) {
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

window.preloadAPI.onThemeChange(themeRefresh);

let lockRandoms = false;

function elisten(element, event, handler) {
    element.addEventListener(event, handler);
    window._eventListeners = window._eventListeners || [];
    window._eventListeners.push({ element, event, handler });
}

/**
 * Navigates to a specific internal page and processes HTML/CSS injections.
 * @param {string} name - The identifier of the page to load.
 */
async function page(name) {
    var refreshing = (pageN == name || name == "");
    rew();

    // Clear existing intervals/listeners to prevent memory leaks
    try {
        window._intervals.forEach(clearInterval);
    } catch(e) {
        console.log('No intervals to clear');
    }
    window._intervals = [];

    window._eventListeners = window._eventListeners || [];
    window._eventListeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
    });
    
    if (name == "") {
        name = pageN;
    }

    // Prevents escaping to home if game is baked
    if (await window.electronAPI.invoke('isBaked', []) && name == 'main') {
        name = 'bakedhome';
    }

    // Viewport animation reset
    document.querySelector('.viewport').style.animation = 'none';
    document.querySelector('.viewport').style.pointerEvents = 'none';
    await new Promise(resolve => setTimeout(resolve, 50));
    document.querySelector('.viewport').style.animation = '0.34s fadeIn cubic-bezier(0, 0.55, 0.45, 1)';
    document.querySelector('.viewport').style.pointerEvents = 'auto';
    window.electronAPI.invoke('showWindow', []);

    // Load theme if not yet initialized
    if (!theme) {
        await themeRefresh(false); 
    }

    window.currentPageStack = {};

    // Process Page HTML
    var purifiedHTML = await fetch(`./views/${name}/index.html`).then(response => response.text());
    purifiedHTML = await replaceLangKeys(purifiedHTML);
    
    var runScripts = false;
    var changeAudio = false;

    // Detect and queue JS execution
    if (purifiedHTML.includes('JSL')) {
        purifiedHTML = purifiedHTML.replace('JSL', '');
        runScripts = true;
    }

    // Load internal stylesheet tags
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
    } else if (addedStyle) {
        addedStyle.innerHTML = ""; // Remove styles to not interfere with other pages
    }

    // Handle NO-SIDEBAR tag
    if (purifiedHTML.includes('NO-SIDEBAR')) {
        purifiedHTML = purifiedHTML.replace('NO-SIDEBAR', '');
        Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => button.disabled = true);
    } else {
        Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => button.disabled = false);
    }

    // Extract Title Tag
    var title = purifiedHTML.match(/TITLEKEY\[(.*?)\]/);
    purifiedHTML = purifiedHTML.replace(/TITLEKEY\[(.*?)\]/g, '');

    // Extract Exclude Audio Tag
    var themeAudioExclude = purifiedHTML.match(/THEME-AUDIO-EXCLUDE\[(.*?)\]/);
    purifiedHTML = purifiedHTML.replace(/THEME-AUDIO-EXCLUDE\[(.*?)\]/g, '');

    // Process Audio Tag
    if (true) {
        var audioSrc = purifiedHTML.match(/AUDIO\[(.*?)\]/);
        console.log('Audio source found:' + audioSrc);
        
        if (!audioSrc || !audioSrc[1]) {
            audioSrc = ['AUDIO[mainTheme.mp3]', 'mainTheme.mp3'];
        }
        if (theme.id == themeAudioExclude?.[1]) {
            audioSrc = ['AUDIO[mainTheme.mp3]', 'mainTheme.mp3'];
        }

        if (audioSrc && audioSrc[1] && audioSrc[1] !== currentAudio) {
            currentAudio = audioSrc[1];
            audio.pause();
            audio.currentTime = 0;
            
            if (audioSrc[1] == 'mainTheme.mp3') {
                audio.src = 'themeprot://mus/' + theme.mainSong;
            } else {
                audio.src = './' + audioSrc[1];
            }

            // Custom loop behavior
            audio.addEventListener('timeupdate', function(){
                var buffer = .44;
                if(this.currentTime > this.duration - buffer) {
                    this.currentTime = 0;
                    this.play();
                }
            });

            audio.volume = TARGET_MUSIC_VOLUME;
            changeAudio = true;
        }

        let shouldPlayAudio = await window.electronAPI.invoke('getUniqueFlag', ["AUDIO"]);
        if (shouldPlayAudio) {
            audio.play();
        } else {
            audio.pause();
        }
        purifiedHTML = purifiedHTML.replace(/AUDIO\[(.*?)\]/g, '');
    }

    // Inject Viewport HTML
    document.getElementsByClassName('viewport')[0].innerHTML = purifiedHTML;

    // Set Active Sidebar Button
    Array.from(document.getElementsByClassName('sidebar-button')).forEach(button => {
        if (button.getAttribute('data-page') === name) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Handle Scrolling
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
    document.querySelector('.titleTxt').innerText = await k(title[1]);

    // Generate Dynamic CSS Colors based on Theme
    var rgbNumbers = {
        r: theme.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)[1],
        g: theme.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)[2],
        b: theme.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)[3],
    };

    var generatedCSS = `
    /* Generated by Deltamod */
    :root {
        --theme-color: ${theme.color};
        --theme-color-rgbaless: rgba(${rgbNumbers.r}, ${rgbNumbers.g}, ${rgbNumbers.b}, 0.8);
        --theme-color-point2: rgba(${rgbNumbers.r}, ${rgbNumbers.g}, ${rgbNumbers.b}, 0.2);
    }
    button:not(.sidebar-button), input, select {
        border: 1px solid rgba(${rgbNumbers.r}, ${rgbNumbers.g}, ${rgbNumbers.b}, 0.5);
    }
    input, progress {
        accent-color: ${theme.color};
    }
    .sidebar {
        border-color: ${theme.color};
    }

    ${theme.specialCSS || ''}
    `;

    // Execute Cleanup Functions
    window._onClosePage = window._onClosePage || [];
    window._onClosePage.forEach(func => func());
    window._onClosePage = [];
    
    // Inject Dynamic Style
    var styleTag = document.getElementById('dynamic-theme-styles');
    styleTag.innerHTML = generatedCSS;

    // Execute Page JS
    if (runScripts) {
        try {
            eval(await fetch(`./views/${name}/index.js`).then(response => response.text()));
        } catch (error) {
            console.error('Error occurred while evaluating script for page:', name, error);
        }
    }

    // Trigger Initial Render Animations
    if (!refreshing) {
        var i = -1;
        document.querySelectorAll('.viewport > *').forEach(el => {
            i++;
            const recursiveApply = (element) => {
                if (element.classList.contains('noanim')) return;
                
                element.style.opacity = '0';
                setTimeout(() => {
                    element.style.animation = '0.5s elFadeIn cubic-bezier(0, 0.55, 0.45, 1)';
                    element.style.opacity = '1';
                }, 100 + (i * 50));
                
                element.children && Array.from(element.children).forEach(child => recursiveApply(child));
            };
            recursiveApply(el);
        });
    }
}

/**
 * ==========================================
 * Global Window Listeners
 * ==========================================
 */
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

/**
 * ==========================================
 * Initialization Boot Sequence
 * ==========================================
 */
(async function() {
    cmode = await window.electronAPI.invoke('isCMode', []);
    
    // Initialize Theme prior to initial page loads
    await themeRefresh(false); 

    // Setup Controller Mode visual adjustments
    if (cmode) {
        document.body.style.zoom = '120%';
        document.querySelector('.glyph').style.display = 'flex';
        document.querySelector('.minimize-button').style.display = 'none';
        document.querySelector('.maximize-button').style.display = 'none';

        makeGlyphs([
            { icon: 'game_stick_left', description: await k('cmode_leftstick_glydesc') },
            { icon: 'game_stick_right', description: await k('cmode_rightstick_glydesc') },
            { icon: 'cancel', description: await k('cmode_abutton_glydesc') },
            { icon: 'square_circle', description: await k('cmode_bbutton_glydesc') },
        ]);

        if (!localStorage.getItem('seenCModeAlert')) {
            localStorage.setItem('seenCModeAlert', 'true');
            htmlAlert(
                await k('controllermode_alert_title'), 
                await k('controllermode_alert_message'), 
                [{ text: await k('ok') }], 
                'stadia_controller'
            );
        }
    } else {
        document.querySelector('.glyph').style.display = 'none';
        window.addEventListener("gamepadconnected", async (event) => {
            if (await window.electronAPI.invoke('getUniqueFlag', ["CONTROLLER"]) === false) {
                return;
            }
            if (!event.gamepad.id.toLowerCase().includes('dualshock') && !event.gamepad.id.toLowerCase().includes('dualsense')) {
                return;
            }
            var res = await htmlAlert(
                await k('prompt_cmode_title'),
                await k('prompt_cmode_message'),
                [
                    { text: await k('yes'), resolveWith: true },
                    { text: await k('no'), resolveWith: false }
                ]
            );

            if (res) {
                invoke('cmode-on', []);
            }
        });
    }

    var loaded = await window.electronAPI.invoke('loadedDeltarune',[]);

    if (await window.electronAPI.invoke('fetchSharedVariable',["gb1click"]) === true) {
        page('goc-dl');
        return;
    }

    // Check prerequisites
    var hasCore = await window.electronAPI.invoke('hasPatchingCore',[]);
    if (!hasCore) {
        await htmlAlert(
            await k('criterrors_gm3palert_title'), 
            await k('criterrors_gm3palert_message'), 
            [{ text: await k('ok'), resolveWith: 'ok' }], 
            'error_med'
        );

        window.close();
        
        return;
    }

    // Main App Branching Route
    if (loaded.loaded) {
        var available = await window.electronAPI.invoke('fireUpdate', []);
        console.log('Update check complete. Update available:', available);

        var im = await window.electronAPI.invoke('shouldGoIM', []);
        if (im) {
            await page('installmanager');
        } else {
            await page('main');
        }

        window.electronAPI.invoke('executeArgumentCmd',[]);
        
        // Fetch Developer Messages
        try {
            var anyMSG = await fetch('https://deltamodders.github.io/deltamod-msgrepo/msg.json?' + Date.now()).then(res => res.json());
            anyMSG.availableMsg.forEach(async (msg) => {
                if (localStorage.getItem('seenMSG_' + msg.id) != 'true' || msg.showEveryBoot) {
                    localStorage.setItem('seenMSG_' + msg.id, 'true');
                    await htmlAlert(msg.title, msg.message + "\n" + msg.sender, [{ text: await k('ok') }]);
                }
            });
        } catch (e) {
            console.log('No MSGs found or error fetching them.');
        }
    } else {
        await page('locate');
        document.querySelectorAll('.sidebar-button').forEach(button => button.disabled = true);
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
            // Silently fail if audio play is blocked
        });
    }
}

/**
 * ==========================================
 * Late Execution Modules (Shop Checker)
 * ==========================================
 */
(async () => {
    var gbflag = await window.electronAPI.invoke('getUniqueFlag', ['SHOP']);
    
    // Toggle Shop Ribbon
    if (gbflag && navigator.onLine) {
        document.getElementById('shopRibbon').style.display = 'block';
    }

    if ((await window.electronAPI.invoke('validateGamebananaToken'))) {
        document.getElementById('collectionsRibbon').style.display = 'block';
    }

    // Prompt Opt-in for GameBanana Shop functionality
    if (!localStorage.getItem('seenShopAlert') && !gbflag && navigator.onLine) {
        localStorage.setItem('seenShopAlert', 'true');
        var res = await htmlAlert(
            await k('gamebananaBrowseTitle'), 
            await k('toggleShopPopup_msg'), 
            [
                { text: await k('yes'), resolveWith: true },
                { text: await k('no'), resolveWith: false }
            ]
        );
        
        await window.electronAPI.invoke('setUniqueFlag', ['SHOP', res]);
        if (res) {
            window.location.reload();
        }
    }
})();