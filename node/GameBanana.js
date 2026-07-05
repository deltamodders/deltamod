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

async function createDeltamodBackup(name) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return { success: false, message: "User not logged in" };
    }

    var response = await axios.post(`https://gamebanana.com/apiv12/Collection/Add`, {
        _bIsPrivate: true,
        _sName: name,
        _sPassword: "deltamod"
    }, {
        headers: {
            'Cookie': token,
            'User-Agent': require('electron').app.userAgentFallback,
            'TE': 'Trailers',
            'Content-Type': 'application/json'
        }
    }).catch((error) => {
        return error.response;
    });

    return { id: response.data._idRow, success: response.data._sStatus == 'SUCCESS', error: response.data._sStatus == 'SUCCESS' ? null : response.data };
}

async function addModToBackup(collectionId, itemId, itemType) {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return { success: false, message: "User not logged in" };
    }

    var response = await axios.post(`https://gamebanana.com/apiv12/${itemType}/${itemId}/AddToCollection`, {
        _idCollectionRow: collectionId
    }, {
        headers: {
            'Cookie': token,
            'User-Agent': require('electron').app.userAgentFallback,
            'TE': 'Trailers',
            'Content-Type': 'application/json'
        }
    }).catch((error) => {
        return error.response;
    });

    return { success: response.data._sStatus == 'SUCCESS', error: response.data._sStatus == 'SUCCESS' ? null : response.data };
}

async function getCollections() {
    try {
        var file = getSystemFile('bananapwd', true);
        var token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
    }
    catch {
        return { success: false, message: "You must be logged in to perform this action" };
    }

    var response = await axios.get(`https://gamebanana.com/apiv12/Tool/20575/AccessorCollections`, {
        headers: {
            'Cookie': token,
            'User-Agent': require('electron').app.userAgentFallback,
            'TE': 'Trailers',
            'Content-Type': 'application/json'
        }
    }).catch((error) => {
        return error.response;
    });

    return response.data._aAllCollections || [];
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
        var response = await axios.get(`https://gamebanana.com/apiv12/Collection/${collectionId}/Items?_nPage=${page}&_sDirection=DESC&_sNameOperator=contains`, {
            headers: {
                'Cookie': token,
                'User-Agent': require('electron').app.userAgentFallback,
                'TE': 'Trailers',
                'Content-Type': 'application/json'
            }
        }).catch((error) => {
            return error.response;
        });

        allMods = allMods.concat(response.data._aRecords || []);

        if (response.data._aMetadata._bIsComplete == true) {
            break;
        }
    }

    console.log(`Found ${allMods.length} mods in collection ${collectionId}`);
    
    var allDownloads = [];
    for (const mod of allMods) {
        var profilepage = await axios.get(`https://gamebanana.com/apiv12/${mod._sModelName}/${mod._idRow}/ProfilePage`);
        var files = profilepage.data._aFiles
        .filter(x => x._aModManagerIntegrations.map(y => y._idToolRow).includes(20575))
        .map((x) => {
            return {
                url: x._sDownloadUrl.replace('https://gamebanana.com/dl/', 'https://gamebanana.com/mmdl/'),
                filename: x._sFile
            };
        });

        allDownloads.push({
            mod: profilepage.data._sName,
            files: files
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

    var response = await axios.delete(`https://gamebanana.com/apiv12/Collection/${collectionId}`, {
        headers: {
            'Cookie': token,
            'User-Agent': require('electron').app.userAgentFallback,
            'TE': 'Trailers',
            'Content-Type': 'application/json'
        },
        data: {
            _idReasonRow: 1,
            _sNotes: "<p>Deleted by Deltamod on request of user</p>"
        }
    }).catch((error) => {
        return error.response;
    });

    return { success: response.status == 200, error: response.status == 200 ? null : response.data };
}

module.exports = {
    obtainLogin,
    getGBUIConf,
    leaveComment,
    likeMod,
    collections: {
        create: createDeltamodBackup,
        delete: deleteCollection,
        add: addModToBackup,
        list: getCollections,
        inspect: getCollectionMods
    },
    clearCache
};