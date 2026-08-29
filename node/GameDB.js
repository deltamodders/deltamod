const fs = require('fs');
const path = require('path');
const console = require('./Console.js');

const GAMES_BASE = path.join(__dirname, '../', 'games');
let cached = null;
function getGames() {
    if (!cached) {
        cached = fs.readdirSync(GAMES_BASE).map(x => {
            return JSON.parse(fs.readFileSync(path.join(GAMES_BASE, x), 'utf8'));
        });
    }
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

module.exports = {
    getGames,
    getGameById,
    getFeatInfo
};
