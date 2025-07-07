const fs = require('fs');
const app = require('electron').app;
const path = require('path');

function getSystemFile(fileid) {
    return path.join(app.getPath('userData'), 'deltamod_system', fileid);
}

function getSystemFolder(folderid) {
    return path.join(app.getPath('userData'), 'deltamod_system', folderid);
}

if (!fs.existsSync(path.join(app.getPath('userData'), 'deltamod_system'))) {
    fs.mkdirSync(path.join(app.getPath('userData'), 'deltamod_system'), { recursive: true });
    console.log('Created deltamod_system folder in userData');
}
module.exports = {
    getSystemFile: getSystemFile,
    getSystemFolder: getSystemFolder
};