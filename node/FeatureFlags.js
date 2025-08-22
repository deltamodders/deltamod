const package = require("../package.json");

function isFeatureEnabled(feature) {
    return package.featureFlags.findIndex(x => x.toLowerCase().trim() == feature.toLowerCase().trim()) >= 0;
}

module.exports = { isFeatureEnabled };