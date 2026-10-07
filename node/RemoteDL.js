const axios = require('axios');
const fs = require('fs');
const Modstore = require('./Modstore.js');
const System = require('./System.js');
const { Notification } = require('electron');
async function check() {
    var rdlCredentials = {};

    if (fs.existsSync(System.getSystemFile('remotedl', true))) {
        rdlCredentials = JSON.parse(fs.readFileSync(System.getSystemFile('remotedl', true), 'utf-8'));
    }
    else {
        console.log('Remote download credentials not found, skipping check');
        return;
    }
    
    var rdlLane = axios.get('https://gamebanana.com/apiv11/RemoteInstall/' + rdlCredentials.memberID + '/' + rdlCredentials.secretKey + '/Deltamod');

    var resp = await rdlLane.then(r => r.data).catch(e => {
        console.log('Error while checking for Remote download: ' + e);
        return null;
    });

    if (resp == null) {
        return;
    }

    for (const url of resp) {
        await Modstore.downloadModFromURL(url, () => {}, null, null);
    }

    new Notification({
        title: 'Remote download',
        body: 'Downloaded ' + resp.length + ' mod(s) from GameBanana\'s remote install query.',
    }).show();
}

setInterval(check, 20000);