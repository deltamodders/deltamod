const path = require('path');

/**
 * Paths.file("foo", "bar", "baz") == "node/../foo/bar/baz".
 * @param  {...string} args the directories/filename to add
 * @returns {string}
 */
function file(...args) {
    return path.join(__dirname, "../", ...args);
}

module.exports = {
    file
};
