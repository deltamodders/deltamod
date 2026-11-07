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

async function isLoggedIn() {
    try {
        var uiconf = await getGBUIConf();
        return uiconf._idMemberRow > 0;
    }
    catch {
        return false;
    }
}

const NO_AUTH_MSG = "User not logged in";
/**
 * FIXME(fnrir): this is a dirty hack
 * @type {axios.AxiosResponse}
 */
// @ts-ignore
const NO_AUTH_RES = { success: false, message: "User not logged in" };

/**
 * @template T
 * @template D
 * @param {"get" | "post" | "put" | "delete"} method
 * @param {string} url
 * @param {any} [data]
 * @returns {Promise<axios.AxiosResponse<T, D, {}, any>>}
 */
async function authenticatedAPICall(method, url, data = {}) {
    var token = AccountManager.loadAccountInfo('gamebanana')?.cookie;
    if (!token) return NO_AUTH_RES;

    console.log(`Making authenticated API call to ${url} with method ${method} and data:`, data);

    /**
     * @type {axios.AxiosResponse}
     */
    var response;
    switch (method.toLowerCase()) {
        case 'get':
            response = await axios.get(url, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers'
                }
            });
            break;
        case 'post':
            response = await axios.post(url, data, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers',
                    'Content-Type': 'application/json'
                }
            });
            break;
        case 'put':
            response = await axios.put(url, data, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers',
                    'Content-Type': 'application/json'
                }
            });
            break;
        case 'delete':
            response = await axios.delete(url, {
                headers: {
                    'Cookie': token,
                    'User-Agent': require('electron').app.userAgentFallback,
                    'TE': 'Trailers'
                },
                data: data
            });
            break;
        default:
            throw new Error(`unsupported method: ${method}`);
    }

    return response;
}

/** @type {any} */
let uiConfCache = null;

async function getGBUIConf(skipCache = false) {
    if (uiConfCache && !skipCache && AccountManager.loadAccountInfo('gamebanana')?.cookie) {
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
        resolve({ name: profilePage.data._sName, pic: profilePage.data._sHdAvatarUrl || profilePage.data._sAvatarUrl, id: uiconf._idMemberRow, loggedIn: true });
    });
}
function clearCache() {
    uiConfCache = null;
}
/**
 * @param {string} id
 * @param {string} comment
 * @param {string} model
 * @returns {Promise<boolean>}
 */
async function leaveComment(id, comment, model) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/${model}/${id}/Post/Add`, {
        _aImageFiles: [],
        _aImages: [],
        _aMentionedMemberRowIds: [],
        _sText: "<p>" + comment + "</p>",
    });

    return response.status === 200;
}

/**
 * @param {string} model
 * @param {string} id
 * @returns {Promise<{ status: number, data: any }>}
 */
async function likeMod(model, id) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/${model}/${id}/Like`, {});
    return { status: response.status, data: response.data };
}

/**
 * @param {string} name
 * @returns {Promise<true>}
 */
async function createDeltamodBackup(name) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/Collection/Add`, {
        _bIsPrivate: true,
        _sName: name,
        _sPassword: "deltamod"
    });
    return true;
}

/**
 * @param {string} collectionId
 * @param {string} itemId
 * @param {string} itemType
 * @returns {Promise<boolean>}
 */
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
    var response = await authenticatedAPICall('get', `https://gamebanana.com/apiv13/Tool/20575/AccessorCollections`, {});

    console.log(JSON.stringify(response.data));
    if (response.status != 200) {
        return [];
    }

    var collections = response.data._aAllCollections.map(/** @param {any} x */ x => {
        return {
            id: x._idRow,
            name: x._sName
        };
    });
    console.log("GameBanana collections: " + JSON.stringify(collections));
    return collections;
}

/**
 * @param {string} collectionId
 * @returns {Promise<any[]>}
 */
async function getCollectionMods(collectionId) {
    /** @type {any[]} */
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
            // @ts-ignore
            .filter(x => x._aModManagerIntegrations.map(y => y._idToolRow).includes(20575))
            // @ts-ignore
            .map((x) => {
                return {
                    url: x._sDownloadUrl.replace('https://gamebanana.com/dl/', 'https://gamebanana.com/mmdl/'),
                    filename: x._sFile
                };
            });

        allDownloads.push({
            name: profilepage.data._sName,
            files
        });
    }
    return allDownloads;
}

/**
 * @param {string} collectionId
 * @returns {Promise<{ success: boolean, error: string? }>}
 */
async function deleteCollection(collectionId) {
    var response = await authenticatedAPICall('delete', `https://gamebanana.com/apiv13/Collection/${collectionId}`, {
        _idReasonRow: 1,
        _sNotes: "<p>Deleted via Deltamod</p>"
    });

    return { success: response.status == 200, error: response.status == 200 ? null : response.data };
}

/**
 * @param {string} commentId
 * @param {string} commentText
 * @returns {Promise<{ success: boolean, error: any?, id: string }>}
 */
async function replyToComment(commentId, commentText) {
    var response = await authenticatedAPICall('post', `https://gamebanana.com/apiv13/Post/${commentId}`, {
        _sText: commentText
    });

    return { success: response.status == 200, error: response.status == 200 ? null : response.data, id: response.data._aPost._idRow };
}

async function pairRemoteDownload() {
    var response = await authenticatedAPICall('post', 'https://gamebanana.com/apiv13/RemoteInstall/Enroll/Deltamod', {});

    return { 
        success: response.status == 200 && response.data._sStatus == "SUCCESS", 
        pair: response.data._sPairingCommand, 
        // @ts-ignore
        error: response._sStatus == "SUCCESS" ? null : response.data 
    };
}

getGBUIConf(); // start caching the UI config on startup

module.exports = {
    getGBUIConf,
    leaveComment,
    replyToComment,
    likeMod,
    pairRemoteDownload,
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