const {encodeSync, decodeSync} = require('@chainsafe/xdelta3-node');

function timeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    startGamePatch: async (gamePath, dbPath, enableMods) => {
        await timeoutPromise(1000); // Wait for 1 second to ensure the UI is ready
    }
};