const { BrowserWindow, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { getSystemFile } = require('../System');
const console = require('../Console');
const express = require('express');
const AccountManager = require('../AccountManager');

function login() {
    return new Promise(async (resolve, reject) => {
        let loginWindow = new BrowserWindow({
            width: 700,
            height: 500,
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
                AccountManager.saveAccountInfo('gamebanana', { cookie: cookieHeader });
                resolve(cookieHeader);
                loginWindow.close();
            }
        });
    });
}

function isLoggedIn() {
    return new Promise(async (resolve, reject) => {
        var uiconf = await getGBUIConf();
        resolve(uiconf && uiconf._idMemberRow > 0);
    });
}

async function authenticatedAPICall(method, url, data = {}) {
    var token = AccountManager.loadAccountInfo('gamebanana')?.cookie;
    if (!token) {
        return { success: false, message: "User not logged in" };
    }

    console.log(`Making authenticated API call to ${url} with method ${method} and data:`, data);

    switch (method.toLowerCase()) {
        case 'get':
            var response = await axios.get(url, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers'
                }
            });
            break;
        case 'post':
            var response = await axios.post(url, data, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers',
                    'Content-Type': 'application/json'
                }
            });
            break;
        case 'put':
            var response = await axios.put(url, data, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers',
                    'Content-Type': 'application/json'
                }
            });
            break;
        case 'delete':
            var response = await axios.delete(url, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers'
                },
                data: data
            });
            break;
    }

    return response;
}

let uiConfCache = null;

async function getGBUIConf(skipCache = false) {
    if (uiConfCache && !skipCache) {
        return uiConfCache;
    }

    console.log('Fetching GameBanana UI config...');

    var uiconf = await authenticatedAPICall('get', 'https://gamebanana.com/apiv13/Member/UiConfig?_sUrl=/');
    uiConfCache = uiconf.data;
    return uiconf.data;
}
function getAccountInfo() {
    return new Promise(async (resolve, reject) => {
        var uiconf = await getGBUIConf();
        if (!uiconf || !uiconf._idMemberRow) {
            resolve({ loggedIn: false });
            return;
        }
        console.log('GameBanana account info:', uiconf);
        var profilePage = await axios.get(`https://gamebanana.com/apiv13/Member/${uiconf._idMemberRow}/ProfilePage`);
        resolve({ name: profilePage.data._sName, pic: profilePage.data._sAvatarUrl, id: uiconf._idMemberRow, loggedIn: true });
    });
}
function clearCache() {
    uiConfCache = null;
}
async function leaveComment(id, comment, model) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/${model}/${id}/Post/Add`, {
        _aImageFiles: [],
        _aImages: [],
        _aMentionedMemberRowIds: [],
        _sText: "<p>" + comment + "</p>",
    });

    return response.status === 200;
}

async function likeMod(model, id) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/${model}/${id}/Like`, {});
    return { status: response.status, data: response.data };
}

async function createDeltamodBackup(name) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/Collection/Add`, {
        _bIsPrivate: true,
        _sName: name,
        _sPassword: "deltamod"
    });
    return true;
}

async function addModToBackup(collectionId, itemId, itemType) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return false;
    }

    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/${itemType}/${itemId}/AddToCollection`, {
        _idCollectionRow: collectionId
    });

    return true;
}

async function getCollections() {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return { success: false, message: "You must be logged in to perform this action" };
    }

    var response = await authenticatedAPICall('get', `https://gamebanana.com/apiv13/Tool/20575/AccessorCollections`, {});

    return response.data._aAllCollections.map(x => {
        return {
            id: x._idRow,
            name: x._sName
        };
    });
}

async function getCollectionMods(collectionId) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return { success: false, message: "User not logged in" };
    }

    var allMods = [];
    var page = 0;
    while (true) {
        page++;
        var response = await authenticatedAPICall('get', `https://gamebanana.com/apiv13/Collection/${collectionId}/Items?_nPage=${page}&_sDirection=DESC&_sNameOperator=contains`, {});

        allMods = allMods.concat(response.data._aRecords || []);

        if (response.data._aMetadata._bIsComplete == true) {
            break;
        }
    }
    
    var allDownloads = [];
    for (const mod of allMods) {
        var profilepage = await authenticatedAPICall('get', `https://gamebanana.com/apiv13/${mod._sModelName}/${mod._idRow}/ProfilePage`, {});
        var files = profilepage.data._aFiles
            .filter(x => x._aModManagerIntegrations.map(y => y._idToolRow).includes(20575))
            .map((x) => {
                return {
                    url: x._sDownloadUrl.replace('https://gamebanana.com/dl/', 'https://gamebanana.com/mmdl/'),
                    filename: x._sFile
                };
            });

        allDownloads.push({
            name: profilepage.data._sName,
            downloads: files
        });
    }
    return allDownloads;
}

async function deleteCollection(collectionId) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return { success: false, message: "User not logged in" };
    }

    var response = await authenticatedAPICall('delete', `https://gamebanana.com/apiv13/Collection/${collectionId}`, {
        _idReasonRow: 1,
        _sNotes: "<p>Deleted via Deltamod</p>"
    });

    return { success: response.status == 200, error: response.status == 200 ? null : response.data };
}

async function replyToComment(commentId, commentText) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/Post/${commentId}`, {
        _sText: commentText
    });

    return { success: response.status == 200, error: response.status == 200 ? null : response.data, id: response.data._aPost._idRow };
}

module.exports = {
    getGBUIConf,
    leaveComment,
    replyToComment,
    likeMod,
    collections: {
        create: createDeltamodBackup,
        delete: deleteCollection,
        add: addModToBackup,
        list: getCollections,
        inspect: getCollectionMods
    },
    clearCache,
    login,
    validateToken: isLoggedIn,
    getAccountInfo,
    isLoggedIn
};