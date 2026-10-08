const axios = require('axios');
const fs = require('fs');
const Modstore = require('./Modstore.js');
const System = require('./System.js');
const { Notification } = require('electron');
const console = require('./Console.js');

let lock = false;
async function check() {
    if (lock) {
        return;
    }
    lock = true;
    console.log('Checking for remote downloads...');
    try {
        var rdlCredentials = {};

        if (fs.existsSync(System.getSystemFile('remotedl', true))) {
            rdlCredentials = JSON.parse(fs.readFileSync(System.getSystemFile('remotedl', true), 'utf-8'));
        }
        else {
            console.log('Remote download credentials not found, skipping check');
            return;
        }
        
        var rdlQuery = axios.get('https://gamebanana.com/apiv11/RemoteInstall/' + rdlCredentials.memberID + '/' + rdlCredentials.secretKey + '/Deltamod');

        var resp = ((await rdlQuery).data);

        if (resp == null) {
            return;
        }

        console.log('Found ' + resp.length + ' remote download(s).');
        lock = true;
        for (const url of resp) {
            await Modstore.downloadModFromURL(url, () => {}, null, null);
        }

        new Notification({
            title: 'Remote download',
            body: 'Downloaded ' + resp.length + ' mod(s) from GameBanana\'s remote install query.',
        }).show();

        lock = false;
    }
    catch (err) {
        console.log('Error checking for remote downloads: ' + err);
        lock = false;
    }
}

check();

setInterval(check, 20000);