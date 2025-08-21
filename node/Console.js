const { lastOfArray } = require('./Utils.js');
const colors = require('yoctocolors-cjs');
const prefixColorMap = {
    'ERROR': colors.red,
    'WARN': colors.yellow,
    'INFO': colors.blue,
    'LOG': colors.white,
    'DEBUG': colors.cyan,
}

function log(prefix, ...args) {
    const stack = new Error().stack;
    const callerLine = lastOfArray(stack.split("\n")[3].trim().split("\\")).split(":")[0];
    process.stdout.write(colors.bold(prefixColorMap[prefix]('[' + prefix + '] ')) + colors.green('[' + callerLine + '] ') + args.join(' ') + '\n');
}

function rendererLog(prefix, page, ...args) {
    process.stdout.write(colors.bold(prefixColorMap[prefix]('[' + prefix + '] ')) + colors.yellow('[Renderer - Page "' + page + '"] ') + args.join(' ') + '\n');
}



module.exports = {
    log: (...a) => log('LOG', ...a),
    rendererLog,
    warn: (...a) => log('WARN', ...a),
    error: (...a) => log('ERROR', ...a),
    info: (...a) => log('INFO', ...a),
    debug: (...a) => log('DEBUG', ...a),
};