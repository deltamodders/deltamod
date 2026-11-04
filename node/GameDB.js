// @ts-check

const fs = require('fs');
const path = require('path');
const console = require('./Console.js');

/**
 * @template Ident
 * @template Data
 * @typedef MkFeat
 * @property {Ident} feat
 * @property {Data} data
 */

/**
 * @typedef AutodownloadGameJolt
 * @property {"GameJolt"} pluginName
 * @property {string} buildId
 * @property {string} gameId
 *
 * @typedef AutodownloadItch
 * @property {"Itch"} pluginName
 * @property {string} homepage
 * @property {string} fileID
 *
 * @typedef {AutodownloadGameJolt | AutodownloadItch} FeatureAutodownload
 *
 * @typedef FeatureSteam
 * @property {string} folder
 * @property {string} appid
 * @property {boolean} downloadable
 *
 * @typedef {MkFeat<"autodownload", FeatureAutodownload> | MkFeat<"steam", FeatureSteam>} TypedFeature
 * @typedef {{ feat: string, data: any }} UntypedFeature
 *
 * @typedef {TypedFeature | UntypedFeature} FeatureInfo
 *
 * @typedef GameInfo
 * @property {string} name
 * @property {string} author
 * @property {string} id
 * @property {{ id: string }} gamebanana
 * @property {string} exeName
 * @property {FeatureInfo[]} availableFeatures
 */

const GAMES_BASE = path.join(__dirname, '../', 'games');
/**
 * @type {GameInfo[]?}
 */
let cached = null;

function getGames() {
    if (!cached) {
        cached = fs.readdirSync(GAMES_BASE).map(x => {
            return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
        });
    }
    return cached;
}

/**
 * @param {string} id
 * @returns {GameInfo | undefined}
 */
function getGameById(id) {
    const games = getGames();
    return games.find(g => g.id == id);
}

/**
 * @param {string} id 
 * @param {string} feat 
 * @returns {FeatureInfo | boolean | undefined}
 */
function getFeatInfo(id, feat) {
    const game = getGameById(id);
    if (!game || !game.availableFeatures) return false;
    return game.availableFeatures.filter(f => f.feat == feat)[0];
}

module.exports = {
    getGames,
    getGameById,
    getFeatInfo
};
