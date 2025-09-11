const path = require('path');

function file(lib,name) {
    return path.join(__dirname, "../", lib, name);
}

module.exports = {
    file
};