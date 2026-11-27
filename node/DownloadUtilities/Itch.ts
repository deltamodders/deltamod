import axios from 'axios';
import cheerio from 'cheerio';

export interface AutodownloadItch {
    pluginName: "Itch";
    homepage: string;
    fileID: string;
}

export async function run(id: string, data: AutodownloadItch): Promise<string> {
    var itchIOPage = await axios.get(data.homepage).then(r => r.data);
            
    const $ = cheerio.load(itchIOPage);
    const csrfToken = $('meta[name="csrf_token"]').attr('value');
    console.log('Got token: ', csrfToken);

    var api = await axios.post(data.homepage + '/file/' + data.fileID + '?source=view_game&as_props=1&after_download_lightbox=true', "csrf_token=" + csrfToken);

    return api.data.url;
}
