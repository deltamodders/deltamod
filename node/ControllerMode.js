const { exec } = require('child_process');

var proc;
var running = false;

function start() {
    if (running) return;

    running = true;
    var exepath = require('path').join(__dirname, '../', 'tools', 'cmodeutil.exe');
    proc = require('child_process').exec('cmd /c "' + exepath + '"');
}

function stop() {
    if (!running) return;
    
    running = false;
    try {
        exec('taskkill /IM cmodeutil.exe /f /t');
    }
    catch (e) {}
}

module.exports = {
    start: start,
    stop: stop
};