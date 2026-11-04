// @ts-check

const fs = require('fs');
const path = require('path');
const console = require('./Console.js');
const { DELTAMOD_DIR } = require('./Paths');

/**
 * @typedef FeatureData
 * @property {string} pluginName
 * @property {string} buildId
 * @property {string} gameId
 *
 * @typedef FeatureInfo
 * @property {string} feat
 * @property {FeatureData} data
 *
 * @typedef GameInfo
 * @property {string} name
 * @property {string} author
 * @property {string} id
 * @property {{ id: string }} gamebanana
 * @property {string} exeName
 * @property {FeatureInfo[]} availableFeatures
 */

const GAMES_BASE = path.join(DELTAMOD_DIR, 'games');
/** @type {GameInfo[]} */
let cached = fs.readdirSync(GAMES_BASE).map(x => {
    return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
});

/** @returns {GameInfo[]} */
function getGames() {
    return cached;
}

/**
 * @param {string} id
 * @returns {GameInfo | undefined}
 */
function getGameById(id) {
    return getGames().find(g => g.id == id);
}

/**
 * @param {string} id
 * @param {string} feat
 * @returns {FeatureInfo | false | undefined}
 */
function getFeatInfo(id, feat) {
    const game = getGameById(id);
    if (!game || !game.availableFeatures) return false;
    return game.availableFeatures.find(f => f.feat == feat);
}

/**
 * @param {string} id
 * @param {string} feat
 * @returns {FeatureInfo}
 */
function getFeatInfoChecked(id, feat) {
    const res = getFeatInfo(id, feat);
    if (!res) throw new Error(`game ${id} doesn't have feature `);
    return res;
}

/**
 * @param {string} id
 * @returns {string?}
 */
function getGameName(id) {
    const game = getGameById(id);
    if (!game) return null;
    return game.name;
}

getGames();

module.exports = {
    getGames,
    getGameById,
    getFeatInfo,
    getGameName,
    getFeatInfoChecked
};
