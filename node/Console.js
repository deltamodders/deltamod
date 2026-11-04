// @ts-check

const { lastOfArray: array_last } = require("./Utils.js");
const colors = require("yoctocolors-cjs");

/**
 * @typedef {"ERROR" | "WARN" | "INFO" | "LOG" | "DEBUG"} LogLevel
 * @typedef {(s: string) => string} Format
 * NOTE(fnrir): copied from "yoctocolors-cjs"
 */

/**
 * @type Record<LogLevel, Format>
 */
const prefixColorMap = {
    'ERROR': colors.bgRed,
    'WARN': colors.bgYellow,
    'INFO': colors.bgWhite,
    'LOG': colors.bgBlue,
    'DEBUG': colors.bgYellowBright,
};
const FIXED_LENGTH = 50;

/**
 * @param {LogLevel} prefix
 * @returns {string}
 */
function log_level_fmt(prefix) {
    return (prefixColorMap[prefix])("[" + prefix + "]");
}

/**
 * @template T
 * @param a {T[]}
 * @returns {T}
 */
function array_last_err(a) {
    const res = array_last(a);
    if (res === null) throw new Error("");
    return res;
}

/**
 * @param {LogLevel} prefix
 * @param {...any} args
 */
function log(prefix, ...args) {
    const stack = new Error().stack;
    let buf = [log_level_fmt(prefix)];
    if (stack) {
        const callerDetails = stack.split("\n")[3].trim();
        const callerFile = array_last_err(callerDetails.split("\\")).split(":")[0];
        const callerLine = array_last_err(callerDetails.split("\\")).split(":")[1];
        const callerInfo = `${callerFile} : ${callerLine}`;
        buf.push(colors.green('[' + callerInfo + '] '));
    }
    process.stdout.write(colors.bold(buf.join(' ')) + args.join(' ') + '\n');
}

/**
 * @param {LogLevel} prefix
 * @param {string} page
 * @param {...any} args
 */
function rendererLog(prefix, page, ...args) {
    process.stdout.write(
        colors.bold(log_level_fmt(prefix)) + ' '
        + colors.yellowBright('[RENDER] ' + (page !== null ? '["' + page + '"] ' : ''))
        + args.join(' ') + '\n'
    );
}


module.exports = {
    // @ts-ignore
    log: (...a) => log('LOG', ...a),
    rendererLog,
    // @ts-ignore
    warn: (...a) => log('WARN', ...a),
    // @ts-ignore
    error: (...a) => log('ERROR', ...a),
    // @ts-ignore
    info: (...a) => log('INFO', ...a),
    // @ts-ignore
    debug: (...a) => log('DEBUG', ...a),
    clear: () => process.stdout.write('\x1b[2J\x1b[0f'),
};
