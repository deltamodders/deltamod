import { lastOfArray as array_last } from "./Utils.js";
import colors from "yoctocolors-cjs";

type LogLevel = "ERROR" | "WARN" | "INFO" | "LOG" | "DEBUG";
/** NOTE(fnrir): copied from "yoctocolors-cjs" */
type Format = (s: string) => string;

const prefixColorMap: Record<LogLevel, Format> = {
    'ERROR': colors.bgRed,
    'WARN': colors.bgYellow,
    'INFO': colors.bgWhite,
    'LOG': colors.bgBlue,
    'DEBUG': colors.bgYellowBright,
};
const FIXED_LENGTH = 50;

function log_level_fmt(prefix: LogLevel): string {
    return (prefixColorMap[prefix])("[" + prefix + "]");
}

function array_last_err<T>(a: T[]): T {
    const res = array_last(a);
    if (res === null) throw new Error("");
    return res;
}

export function log_internal(
    prefix: LogLevel,
    args: any[],
    stack: string | undefined = undefined,
    stack_idx: number = 3,
) {
    let buf = [log_level_fmt(prefix)];
    if (!stack) stack = new Error().stack;
    if (stack) {
        const callerDetails = stack.split("\n")[stack_idx].trim();
        const callerFile = array_last_err(callerDetails.split("\\")).split(":")[0];
        const callerLine = array_last_err(callerDetails.split("\\")).split(":")[1];
        const callerInfo = `${callerFile} : ${callerLine}`;
        buf.push(colors.green('[' + callerInfo + '] '));
    }
    process.stdout.write(colors.bold(buf.join(' ')) + args.join(' ') + '\n');
}

export function rendererLog(prefix: LogLevel, page: string, ...args: any[]) {
    process.stdout.write(
        colors.bold(log_level_fmt(prefix)) + ' '
        + colors.yellowBright('[RENDER] ' + (page !== null ? '["' + page + '"] ' : ''))
        + args.join(' ') + '\n'
    );
}

const l = log_internal;

export const log = (...a: any[]) => l('LOG', a);
export const warn = (...a: any[]) => l('WARN', a);
export const error = (...a: any[]) => l('ERROR', a);
export const info = (...a: any[]) => l('INFO', a);
export const debug = (...a: any[]) => l('DEBUG', a);

export function clear() {
    process.stdout.write('\x1b[2J\x1b[0f');
}

export default { log_internal, log, warn, error, info, debug, clear };
