var proc;

function start() {
    var exepath = require('path').join(__dirname, '../', 'tools', 'cmodeutil.exe');
    proc = require('child_process').execFile(exepath);
}

function stop() {
    if (proc) {
        proc.kill();
    }
}

module.exports = {
    start: start,
    stop: stop
};