// @ts-check

const execSync = require('child_process').execSync;
const path = require('path');
const console = require('./Console.js');
const fs = require('fs')
const os = require('os');

/**
 * @param {string} str
 * @returns {string}
 */
function betweenDoubleQuotes(str) {
    return `"${str}"`;
}

/**
 * @param {string} target
 * @param {string} path
 * @returns {string}
 */
function createJunction(target, path) {
    console.log(`Creating junction from ${path} to ${target}`);
    try {
        fs.symlinkSync(target, path, "junction");
        return `Successfully created junction from ${path} to ${target}`
    } catch (err) {
        return /** @type {any} */ (err).toString();
    }
}

/**
 * @param {string} path
 * @returns {string}
 */
function deleteJunction(path) {
    console.log(`Deleting junction at ${path}`);
    try {
        fs.unlinkSync(path)
        return `Successfully deleted junction at ${path}`
    } catch (err) {
        return /** @type {any} */ (err).toString();
    }
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isJunction(path) {
    const stats = fs.lstatSync(path);
    return stats.isSymbolicLink()
}

module.exports = {
    createJunction,
    deleteJunction,
    isJunction
};
