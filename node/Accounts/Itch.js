const AccountManager = require('../AccountManager');
const { app, shell } = require('electron');
const express = require('express');
const console = require('../Console');
const axios = require('axios');

const BASE_API_URL = 'https://deltamodders.com/apiv1';

function login() {
    return new Promise((resolve, reject) => {
        var app = express();
        var http;
        app.get('/callback', (req, res) => {
            var token = req.query.token;
            AccountManager.saveAccountInfo('itch', { token: token });

            console.log("Saved itch token: " + token);

            res.header("Access-Control-Allow-Origin", "*");
            res.send({ success: true });

            http.close();

            resolve();
        });

        http = app.listen(2900, () => {
            shell.openExternal('https://itch.io/user/oauth?client_id=605f3bf508de861ba94641192b43e69d&scope=profile&response_type=token&redirect_uri=https%3A%2F%2Fdeltamodders.com%2Flogin%2Fitch');
        });
    });
}

async function isLoggedIn() {
    try {
        var accountInfo = AccountManager.getAccountInfo('itch') || "null";
    }
    catch (e) {
        return false;
    }

    var resp = await axios.get(BASE_API_URL + '/deltamod_itch/' + accountInfo.token);

    console.log("Itch login check: " + JSON.stringify(resp.data));

    if (resp.data.success === false) {
        AccountManager.deleteAccountInfo('itch');
    }

    return resp.data.success;
}

async function getAccountInfo() {
    try {
        var accountInfo = AccountManager.getAccountInfo('itch') || "null";
    }
    catch (e) {
        return null;
    }

    var resp = ((await axios.get(BASE_API_URL + '/deltamod_itch/' + accountInfo.token)).data);

    console.log("Itch account info: " + JSON.stringify(resp));

    if (resp.success) {
        var user = resp.user;
        return {
            name: user.name,
            id: user.id,
            pic: user.pic
        };
    }
    else {
        AccountManager.deleteAccountInfo('itch');
        return null;
    }
}

async function getDatabase() {
    var accountInfo = AccountManager.getAccountInfo('itch') || "null";

    var data = await axios.get(BASE_API_URL + '/deltamod_itch_db/data?token=' + accountInfo.token);
    return data.data.data; // json obj
}

async function writeDatabase(data) {
    var accountInfo = AccountManager.getAccountInfo('itch') || "null";

    var resp = await axios.post(BASE_API_URL + '/deltamod_itch_db/data', {
        token: accountInfo.token,
        data: btoa(JSON.stringify(data))
    });

    console.log("Itch write database response: " + JSON.stringify(resp.data));

    return resp.data.success;
}

async function createCollection(name) {
    var db = await getDatabase();
    db.collections = db.collections || [];
    db.collections.push({ name, items: [], id: Date.now() });
    console.log("Created collection, new db state: " + JSON.stringify(db));
    await writeDatabase(db);
    return true;
}

async function deleteCollection(id) {
    var db = await getDatabase();
    db.collections = db.collections || [];
    db.collections = db.collections.filter(c => c.id !== id);
    await writeDatabase(db);
    return { success: true };
}

async function addToCollection(id, modID, modModel) {
    var db = await getDatabase();
    db.collections = db.collections || [];
    var collection = db.collections.find(c => c.id === id);
    if (!collection) {
        return false;
    }
    // expected format: { name: "Mod", downloads: [{ filename: "file.zip", url: "https://example.com/file.zip" }] }
    collection.items.push({ id: modID, model: modModel });
    await writeDatabase(db);
    return true;
}

async function getCollections() {
    var db = await getDatabase();
    console.log("Collections: " + JSON.stringify(db.collections));
    db.collections = db.collections || [];
    return db.collections.map(x => {
        delete x.items;
        return x;
    });
}

async function inspectCollection(id) {
    var db = await getDatabase();
    db.collections = db.collections || [];
    var collection = db.collections.find(c => c.id === id);
    
    var allMods = collection.items || [];

    var allDownloads = [];
    for (const mod of allMods) {
        console.log(`Inspecting mod ${mod.model} ${mod.id}`);
        var profilepage = await axios.get(`https://gamebanana.com/apiv13/${mod.model}/${mod.id}/ProfilePage`);
        var files = (profilepage.data._aFiles
            .filter(x => x._aModManagerIntegrations.map(y => y._idToolRow).includes(20575))) || []
            .map((x) => {
                return {
                    url: x._sDownloadUrl.replace('https://gamebanana.com/dl/', 'https://gamebanana.com/mmdl/'),
                    filename: x._sFile
                };
            });

        allDownloads.push({
            name: profilepage.data._sName,
            files: files
        });
    }

    return allDownloads;
}

module.exports = {
    login,
    validateToken: isLoggedIn,
    getAccountInfo,
    isLoggedIn,
    collections: {
        create: createCollection,
        delete: deleteCollection,
        add: addToCollection,
        list: getCollections,
        inspect: inspectCollection
    },
};