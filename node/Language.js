const fs = require('fs');
const path = require('path');
const console = require('./Console');
const { version } = require('os');

var language = {};
var englishLanguage = {};

function loadLanguage(lang) {
    let engpath = path.join(__dirname, "../", "langs", "en", "language.json");
    let engData = fs.readFileSync(engpath, 'utf8');
    // remove text between /* and */ (comments)
    engData = engData.replace(/\/\*[\s\S]*?\*\//g, '');

    englishLanguage = JSON.parse(engData); // have this as a fallback for missing keys

    try {
        let langpath = path.join(__dirname, "../", "langs", lang, "language.json");
        if (!fs.existsSync(langpath)) {
            console.error(`Language file not found: ${langpath}`);
            return false;
        }
        let langData = fs.readFileSync(langpath, 'utf8');
        // remove text between /* and */ (comments)
        langData = langData.replace(/\/\*[\s\S]*?\*\//g, '');
        language = JSON.parse(langData);

        return true;
    }
    catch (e) {
        console.error(`Failed to load language: ${e}`);
        return false;
    }
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
        return englishLanguage[key] || `!${key}`; // fallback to English or return the key if not found
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