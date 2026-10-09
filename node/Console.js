const { lastOfArray } = require('./Utils.js');
const colors = require('yoctocolors-cjs');
const prefixColorMap = {
    'ERROR': colors.bgRed,
    'WARN': colors.bgYellow,
    'INFO': colors.bgWhite,
    'LOG': colors.bgBlue,
    'DEBUG': colors.bgYellowBright,
}
const FIXED_LENGTH = 50;

function log_internal(prefix, args, stack = null, stack_idx = 3) {
    if (!stack) stack = new Error().stack;
    const callerDetails = stack.split("\n")[stack_idx].trim();
    const callerFile = lastOfArray(callerDetails.split("\\")).split(":")[0];
    const callerLine = lastOfArray(callerDetails.split("\\")).split(":")[1];
    const callerInfo = `${callerFile} : ${callerLine}`;
    let part1 = colors.bold(prefixColorMap[prefix]('[' + prefix + ']')) + ' ' + colors.green('[' + callerInfo + '] ');
    process.stdout.write(part1 + args.join(' ') + '\n');
}

function rendererLog(prefix, page, ...args) {
    process.stdout.write(colors.bold(prefixColorMap[prefix]('[' + prefix + ']')) + ' ' + colors.yellowBright('[RENDER] ' + (page !== null ? '["' + page + '"] ' : '' )) + args.join(' ') + '\n');
}

const l = log_internal;

module.exports = {
    log_internal,
    rendererLog,
    log: (...a) => l('LOG', a),
    warn: (...a) => l('WARN', a),
    error: (...a) => l('ERROR', a),
    info: (...a) => l('INFO', a),
    debug: (...a) => l('DEBUG', a),
    clear: () => process.stdout.write('\x1b[2J\x1b[0f'),
};
