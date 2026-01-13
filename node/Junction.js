const execSync = require('child_process').execSync;
const path = require('path');
const console = require('./Console.js');
const fs = require('fs')
const os = require('os');

function betweenDoubleQuotes(str) {
    return `"${str}"`;
}

function createJunction(target, path) {
    console.log(`Creating junction from ${path} to ${target}`);
    try {
        fs.symlinkSync(target, path, "junction");
        return `Successfully created junction from ${path} to ${target}`
    } catch (err) {
        return err.toString();
    }
}

function deleteJunction(path) {
    console.log(`Deleting junction at ${path}`);
    try {
        fs.unlinkSync(path)
        return `Successfully deleted junction at ${path}`
    } catch (err) {
        return err.toString();
    }
}

function isJunction(path) {
    try {
        const output = execSync(JUNCTION_EXE_PATH, ['-accepteula', '-nobanner', betweenDoubleQuotes(path)], { encoding: 'utf8' });
        return output.includes('Junction');
    } catch (error) {
        return false;
    }
}

function isJunction(path) {
    const stats = fs.lstatSync(path);
    return stats.isSymbolicLink()
}

module.exports = {
    createJunction,
    deleteJunction,
    isJunction
};
