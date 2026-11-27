import axios from 'axios';

interface AutodownloadGameJolt {
    pluginName: "GameJolt";
    buildId: string;
    gameId: string;
}

export async function run(id: string, data: AutodownloadGameJolt): Promise<string> {
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
