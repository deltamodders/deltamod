const cheerio = require('cheerio');
const fs = require('fs');
const axios = require('axios');

async function run(id, data) {
    var itchIOPage = await axios.get(data.homepage).then(r => r.data);
            
    const $ = cheerio.load(itchIOPage);
    const csrfToken = $('meta[name="csrf_token"]').attr('value');
    console.log('Got token: ', csrfToken);

    var api = await axios.post(data.homepage + '/file/' + data.fileID + '?source=view_game&as_props=1&after_download_lightbox=true', "csrf_token=" + csrfToken);

    return api.data.url;
}

module.exports = {
    run
};