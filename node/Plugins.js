const fs = require('fs');
const { app } = require('electron');
const path = require('path');

const PLUGINS_BASE = path.join(app.getPath('userData'), 'plugins.db');
let FUNCTION_CACHE = {};
let loadedPlugins = [];

if (!fs.existsSync(PLUGINS_BASE)) {
    fs.mkdirSync(PLUGINS_BASE, { recursive: true });
}

function loadPlugins() {
    fs.readdirSync(PLUGINS_BASE).forEach(file => {
        if (file.endsWith('.asar')) {
            var meta = JSON.parse(fs.readFileSync(path.join(PLUGINS_BASE, file, 'meta.json'), 'utf8'));

            loadedPlugins.push({
                name: meta.name,
                version: meta.version,
                description: meta.description,
                author: meta.author
            });

            var nodeModulesPath = path.join(PLUGINS_BASE, file, 'node');
            var webModulesPath = path.join(PLUGINS_BASE, file, 'web');

            var contentsNode = fs.readdirSync(nodeModulesPath).filter(f => f.endsWith('.js'));
            var contentsWeb = fs.readdirSync(webModulesPath).filter(f => f.endsWith('.js'));

            contentsNode.forEach(f => {
                var functionName = 'node_' + f.toLowerCase().replace('.js', '');
                FUNCTION_CACHE[functionName] = [...FUNCTION_CACHE[functionName] || [], path.join(nodeModulesPath, f)];
            });

            contentsWeb.forEach(f => {
                var functionName = 'web_' + f.toLowerCase().replace('.js', '');
                FUNCTION_CACHE[functionName] = [...FUNCTION_CACHE[functionName] || [], path.join(webModulesPath, f)];
            });
        }
    });

    console.log('Loaded plugins: ', loadedPlugins.map(p => `${p.name} (v${p.version})`).join(', '));
    console.log('Loaded functions: ', Object.keys(FUNCTION_CACHE));
}

function call(functionName, ...args) {
    if (!FUNCTION_CACHE[functionName]) {
        console.log(`function ${functionName} not defined in any plugins.`);
        return;
    }

    FUNCTION_CACHE[functionName].forEach(file => {
        try {
            const func = require(file)(...args);
        } catch (e) {
            console.error(`Error calling function ${functionName} in plugin ${file}:`, e);
        }
    });
}

loadPlugins();

module.exports = {call};