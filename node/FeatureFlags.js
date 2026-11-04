// @ts-check

/** @type {{ featureFlags: string[] }} */
const pkg_info = require("../package.json");

/**
 * @param {string} feature
 * @returns {boolean}
 */
function isFeatureEnabled(feature) {
    return pkg_info.featureFlags.findIndex(x => x.toLowerCase().trim() == feature.toLowerCase().trim()) >= 0;
}

module.exports = {
    isFeatureEnabled
};
