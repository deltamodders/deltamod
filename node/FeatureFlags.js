const { PACKAGE_JSON } = require("./Paths");

/** @type {{ featureFlags: string[] }} */
const pkg_info = require(PACKAGE_JSON);

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
