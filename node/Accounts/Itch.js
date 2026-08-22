const AccountManager = require('../AccountManager');
const { app, shell } = require('electron');
const express = require('express');
const axios = require('axios');

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

    var resp = await axios.get('https://deltamodders.com/apiv1/deltamod_itch/' + accountInfo.token);

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

    var resp = ((await axios.get('https://deltamodders.com/apiv1/deltamod_itch/' + accountInfo.token)).data);

    if (resp.success) {
        var user = JSON.parse(resp.user);
        return {
            name: user.username,
            id: user.userID,
            pic: user.pic
        };
    }
    else {
        AccountManager.deleteAccountInfo('itch');
        return null;
    }
}

module.exports = {
    login,
    validateToken: isLoggedIn,
    getAccountInfo,
    isLoggedIn
};