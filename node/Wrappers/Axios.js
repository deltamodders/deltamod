const axios = require("axios");

/**
 * @typedef {import("stream").Readable} Readable
 */

/**
 * @callback OnStreamData
 * @param {(chunk: Buffer) => void} handler
 * @returns {void}
 */

/**
 * @typedef AxiosGetResponseExt
 * @property {number?} content_length
 * @property {OnStreamData} on_data
 */

/**
 * @typedef {axios.AxiosResponse<Readable, {}, {}, any>} AxiosGetSteamResponse
 * @typedef {AxiosGetSteamResponse & AxiosGetResponseExt} GetResponseExt
 */

/**
 * @param {string} url 
 * @returns {Promise<GetResponseExt>}
 */
async function getSteamSized(url) {
    const response = await axios.get(url, { responseType: 'stream', maxRedirects: 10 });
    const content_len_val = response.headers['content-length'];
    return {
        content_length: content_len_val ? parseInt(content_len_val.toString(), 10) : null,
        on_data: (f) => response.data.on('data', /** @param {Buffer} chunk */ chunk => f(chunk)),
        ...response
    };
}

module.exports = { getSteamSized };
