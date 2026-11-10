import { exec } from 'child_process';
import path from 'path';

import { TOOLS_DIR } from './Paths';

var proc;
var running = false;

export function start() {
    if (running) return;

    running = true;
    var exepath = path.join(TOOLS_DIR, 'cmodeutil.exe');
    proc = require('child_process').exec('cmd /c "' + exepath + '"');
}

export function stop() {
    if (!running) return;
    
    running = false;
    try {
        exec('taskkill /IM cmodeutil.exe /f /t');
    }
    catch (e) {}
}