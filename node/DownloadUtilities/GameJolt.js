const axios = require('axios');
const fs = require('fs');
const path = require('path');
async function run(id, data) {
    return new Promise (async (resolve, reject) => {
        var api = `https://gamejolt.com/site-api/web/discover/games/builds/get-download-url/${data.buildId}`;
        const response = await axios.post(api, {
            forceDownload: true
        }, {
            headers: {
                'Cookie': 'gjtz=7200;'
            }
        });
        resolve(response.data.payload.url);
    });
}

module.exports = {
    run 
};