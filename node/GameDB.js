const fs = require('fs');
const path = require('path');
const console = require('./Console.js');

const GAMES_BASE = path.join(__dirname, '../', 'games');
function getGames() {
    return fs.readdirSync(GAMES_BASE).map(x => {
        return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
    });
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

module.exports = {
    getGames,
    getGameById,
    getFeatInfo
};
