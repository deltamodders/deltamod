const { BrowserWindow, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { getSystemFile } = require('./System');
const console = require('./Console');
function obtainLogin() {
    return new Promise(async (resolve, reject) => {
        let loginWindow = new BrowserWindow({
            width: 800,
            height: 600,
            minimizable: false,
            webPreferences: {
                nodeIntegration: false,
                partition: 'persist:gamebananaLogin',
                contextIsolation: true,
            }
        });

        if (process.argv.includes('---controller')) {
            loginWindow.setFullScreen(true);
        }
        else {
            loginWindow.center();
            loginWindow.setResizable(false);
            loginWindow.setFullScreenable(false);
        }

        loginWindow.setMenuBarVisibility(false);
    
        // empty cookies before login
        const cookies = loginWindow.webContents.session.cookies;
        const allCookies = await cookies.get({});
        for (const cookie of allCookies) {
            if (cookie.domain?.includes('gamebanana.com')) {
                await cookies.remove(`http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`, cookie.name);
            }
        }

        loginWindow.loadURL('https://gamebanana.com/members/account/login');

        loginWindow.webContents.on('did-navigate', async (event, url) => {
            var allowedURLS = [
                "https://gamebanana.com/members/account/login",
                "https://gamebanana.com/"
            ];
            var text = "Please log in to your GameBanana account to continue in Deltamod. Your account access token will be stored securely. No passwords are stored.";

            loginWindow.webContents.executeJavaScript(`
                document.title = "Login to GameBanana to continue in Deltamod."; 
                document.querySelectorAll(\'.Description\')[0].innerHTML = "${text}";
                document.querySelector('#PrimaryNav').style.opacity = '0.5';
                document.querySelector('#PrimaryNav').style.pointerEvents = 'none';
                document.querySelector('#PageFooter').style.display = 'none';
                (() => {
                    const onFullyLoaded = () => {
                        document.querySelector('.fc-cta-do-not-consent').click();
                    };

                    if (document.readyState === 'complete') {
                        onFullyLoaded();
                    } else {
                        window.addEventListener('load', onFullyLoaded, { once: true });
                    }
                })();
            `);

            if (!url.includes('gamebanana.com/members/account')) {
                const allCookies = (await loginWindow.webContents.session.cookies.get({})).filter(c => {
                    return c.domain?.includes('gamebanana.com')
                });
                console.log('Found ' + allCookies.length + ' GameBanana account cookies after login: ' + allCookies.map(c => c.name).join(', '));
                const cookieHeader = allCookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
                resolve(cookieHeader);
                loginWindow.close();
            }
        });
    });
}

let uiConfCache = null;

async function getGBUIConf() {
    if (uiConfCache) {
        console.log('Using cached GameBanana UI Config for user ID ' + uiConfCache._idMemberRow);
        return uiConfCache;
    }

    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        var file = "";
        var token = "";
    }
        var uiconf = await axios.get('https://gamebanana.com/apiv12/Member/UiConfig?_sUrl=/', {
            headers: {
                'Cookie': token,
                // get electron user agent
                'User-Agent': require('electron').app.userAgentFallback,
                'TE': 'Trailers'
            }
        });

        console.log('Fetched GameBanana UI Config for user ID ' + uiconf.data._idMemberRow);

        uiConfCache = uiconf.data;

    return uiconf.data;
}

function clearCache() {
    uiConfCache = null;
}

async function leaveComment(id, comment, model) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return false;
    }

    var response = await axios.post(`https://gamebanana.com/apiv12/${model}/${id}/Post/Add`, {
        _aImageFiles: [],
        _aImages: [],
        _aMentionedMemberRowIds: [],
        _sText: "<p>" + comment + "</p>",
    }, {
        headers: {
            'Cookie': token,
            'User-Agent': require('electron').app.userAgentFallback,
            'TE': 'Trailers',
            'Content-Type': 'application/json'
        },
    });

    return response.status === 200;
}

async function likeMod(model, id) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return false;
    }

    var response = await axios.post(`https://gamebanana.com/apiv12/${model}/${id}/Like`, {}, {
        headers: {
            'Cookie': token,
            'User-Agent': require('electron').app.userAgentFallback,
            'TE': 'Trailers',
            'Content-Type': 'application/json'
        },
    }).catch((error) => {
        return error.response;
    });

    return { status: response.status, data: response.data };
}

module.exports = {
    obtainLogin,
    getGBUIConf,
    leaveComment,
    likeMod,
    clearCache
};