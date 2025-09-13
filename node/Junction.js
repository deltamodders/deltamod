const execSync = require('child_process').execSync;
const path = require('path');
const console = require('./Console.js');
const fs = require('fs');

const JUNCTION_EXE_PATH = path.join(__dirname, '../', 'junction.exe');

function betweenDoubleQuotes(str) {
    return `"${str}"`;
}

function runJunctionCommand(args) {
    const command = `"${JUNCTION_EXE_PATH}" -accepteula -nobanner ${args.join(' ')}`;
    console.log(`Executing command: ${command}`);
    var output = execSync(command, { stdio: 'inherit' });
    return output;
}

function createJunction(target, path) {
    console.log(`Creating junction from ${path} to ${target}`);
    return runJunctionCommand([betweenDoubleQuotes(path), betweenDoubleQuotes(target)]);
}

function deleteJunction(path) {
    console.log(`Deleting junction at ${path}`);
    return runJunctionCommand(['-d', betweenDoubleQuotes(path)]);
}

function isJunction(path) {
    try {
        const output = execSync(JUNCTION_EXE_PATH, ['-accepteula', '-nobanner', betweenDoubleQuotes(path)], { encoding: 'utf8' });
        return output.includes('Junction');
    } catch (error) {
        return false;
    }
}

if (!fs.existsSync(JUNCTION_EXE_PATH)) {
    console.error('junction.exe not found. Please ensure it is present in the application directory.');
    process.exit(1);
}
else {
    console.log('junction.exe found.');
}

module.exports = {
    createJunction,
    deleteJunction,
    isJunction
};