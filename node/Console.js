const { lastOfArray } = require('./Utils.js');
const colors = require('yoctocolors-cjs');
const prefixColorMap = {
    'ERROR': colors.red,
    'WARN': colors.yellow,
    'INFO': colors.blue,
    'LOG': colors.cyan,
    'DEBUG': colors.white,
}
const FIXED_LENGTH = 50;

function log(prefix, ...args) {
    const stack = new Error().stack;
    const callerDetails = stack.split("\n")[3].trim();
    const callerFile = lastOfArray(callerDetails.split("\\")).split(":")[0];
    const callerLine = lastOfArray(callerDetails.split("\\")).split(":")[1];
    const callerInfo = `${callerFile}:${callerLine}`;
    let part1 = colors.bold(prefixColorMap[prefix]('[' + prefix + '] ')) + colors.green('[' + callerInfo + '] ');
    process.stdout.write(part1 + args.join(' ') + '\n');
}

function rendererLog(prefix, page, ...args) {
    process.stdout.write(colors.bold(prefixColorMap[prefix]('[' + prefix + '] ')) + colors.yellow('[Renderer] ' + (page !== null ? '["' + page + '"] ' : '' )) + args.join(' ') + '\n');
}



module.exports = {
    log: (...a) => log('LOG', ...a),
    rendererLog,
    warn: (...a) => log('WARN', ...a),
    error: (...a) => log('ERROR', ...a),
    info: (...a) => log('INFO', ...a),
    debug: (...a) => log('DEBUG', ...a),
};