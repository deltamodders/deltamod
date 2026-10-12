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
            // gb/Mod/692002/https://gamebanana.com/mmdl/1845548
            var code = url.split('/');
            var gbCommand = code.shift();
            var gbModel = code.shift();
            var gbID = code.shift();
            var gbURL = code.join('/');

            await Modstore.downloadModFromURL(gbURL, () => {}, gbID, gbModel);

            var ppage = await axios.get('https://gamebanana.com/apiv11/' + gbModel + '/' + gbID + '/ProfilePage');

            new Notification({
                title: 'Download complete',
                body: 'Downloaded "' + ppage.data._sName + '" from GameBanana\'s remote install service.'
            }).show();
        }

        lock = false;
    }
    catch (err) {
        console.log('Error checking for remote downloads: ' + err);
        lock = false;
    }
}

check();

setInterval(check, 20000);