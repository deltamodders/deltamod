const fs = require('fs');
const path = require('path');
const console = require('./Console');
const { version } = require('os');

var language = {};

function loadLanguage(lang) {
    let langpath = path.join(__dirname, "../", "langs", lang, "language.json");
    if (!fs.existsSync(langpath)) {
        console.error(`Language file not found: ${langpath}`);
        return;
    }
    const langData = fs.readFileSync(langpath, 'utf8');
    language = JSON.parse(langData);
}

function getAvailableLanguages() {
    let langsDir = path.join(__dirname, "../", "langs");
    return fs.readdirSync(langsDir).filter(file => {
        if (!fs.existsSync(path.join(langsDir, file, "language.json"))) {
            console.warn(`Language ${file} does not have a language.json file, skipping.`);
            return false;
        }
        return fs.statSync(path.join(langsDir, file)).isDirectory();
    }).map(file => {
        var meta = fs.readFileSync(path.join(langsDir, file, "metadata.txt"), 'utf8').split('\n');
        return {
            code: file,
            name: meta[0].replace('\r', '') || file,
            author: meta[1].replace('\r', '') || "Unknown",
            version: meta[2].replace('\r', '') || "Unknown"
        };
    });
}

function loadString(key, ...args) {
    let str = language[key];
    if (!str) {
        console.error(`String not found: ${key}`);
        return `$${key}`;
    }
    return str.replace(/{(\d+)}/g, (match, index) => {
        return args[index] || match;
    });
}

module.exports = {
    loadLanguage,
    loadString,
    getAvailableLanguages
};