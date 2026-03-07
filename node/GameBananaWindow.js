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
            resizable: false,
            fullscreenable: false,
            minimizable: false,
            webPreferences: {
                nodeIntegration: false,
                partition: 'persist:gamebananaLogin',
                contextIsolation: true,
            }
        });

        loginWindow.setMenuBarVisibility(false);
    
        // empty cookies before login
        const cookies = loginWindow.webContents.session.cookies;
        const allCookies = await cookies.get({});
        for (const cookie of allCookies) {
            await cookies.remove(`http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`, cookie.name);
        }

        loginWindow.loadURL('https://gamebanana.com/members/account/login');

        loginWindow.webContents.on('did-navigate', async (event, url) => {
            var allowedURLS = [
                "https://gamebanana.com/members/account/login",
                "https://gamebanana.com/"
            ];
            loginWindow.webContents.executeJavaScript('document.title = "Login to GameBanana to continue in Deltamod."; document.querySelectorAll(\'.Description\')[0].innerHTML = "To continue in Deltamod, login here. Please create an account in your browser if you do not have one. Only login with GameBanana on apps you trust. <b>This page is not endorsed by GameBanana.</b><br><br><b>This action will grant full account control to Deltamod.</b>"');
            if (!url.includes('gamebanana.com/members/account')) {
                const allCookies = (await loginWindow.webContents.session.cookies.get({})).filter(c => {
                    return ['sess', 'rmc', 'muid'].includes(c.name.toLowerCase()) && c.domain.includes('gamebanana.com');
                });
                console.log('Found ' + allCookies.length + ' GameBanana account cookies after login.');
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
        var uiconf = await axios.get('https://gamebanana.com/apiv11/Member/UiConfig?_sUrl=/', {
            headers: {
                'Cookie': token,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0',
                'TE': 'Trailers'
            }
        });

        console.log('Fetched GameBanana UI Config for user ID ' + uiconf.data._idMemberRow);

        uiConfCache = uiconf.data;

    return uiconf.data;
}

async function leaveComment(id, comment, model) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return false;
    }

    var response = await axios.post(`https://gamebanana.com/apiv11/${model}/${id}/Post/Add`, {
        _aImageFiles: [],
        _aImages: [],
        _aMentionedMemberRowIds: [],
        _sText: "<p>" + comment + "</p>",
    }, {
        headers: {
            'Cookie': token,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0',
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

    var response = await axios.post(`https://gamebanana.com/apiv11/${model}/${id}/Like`, {}, {
        headers: {
            'Cookie': token,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0',
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
    likeMod
};