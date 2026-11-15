const fs = require('fs');
const path = require('path');
const console = require('./Console.js');
const { DELTAMOD_DIR } = require('./Paths');

const GAMES_BASE = path.join(DELTAMOD_DIR, 'games');
let cached = fs.readdirSync(GAMES_BASE).map(x => {
    return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
});;

function getGames() {
    return cached;
}

function getGameById(id) {
    const games = getGames();
    return games.find(g => g.id == id);
}

function getFeatInfo(id, feat) {
    const game = getGameById(id);
    if (!game || !game.availableFeatures) return false;
    return game.availableFeatures.filter(f => f.feat == feat)[0];
}

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
    getGameName
};
