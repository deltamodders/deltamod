const { writeFileSync, mkdirSync, rmSync } = require("original-fs");
const { log } = require("./Console");
const { isFeatureEnabled } = require("./FeatureFlags");
const { join, dirname } = require("path");
const System = require("./System");
const _7z = require("7zip-min");
const { error } = require("console");
const { importMod } = require("./Modstore");
const fs = require("fs");
const path = require("path");
const { dialog, app } = require("electron");
const { page, setSharedVar } = require("./Utils");
const { errorWin } = require("./ErrorWin");
const mime = require("mime-types");

// https://stackoverflow.com/questions/26156292/trim-specific-character-from-a-string
function trim(str, ch) {
    var start = 0, 
        end = str.length;

    while(start < end && str[start] === ch)
        ++start;

    while(end > start && str[end - 1] === ch)
        --end;

    return (start > 0 || end < str.length) ? str.substring(start, end) : str;
}

/**
 * 
 * @param {Electron.Protocol} protocol 
 */
function registerProtocolSchemesAsPrivileged(protocol) {
    const privileges = {
        standard: true,
        secure: true,
        supportFetchAPI: true
    }
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'deltapack',
            privileges
        },
        {
            scheme: 'packet',
            privileges
        },
        {
            scheme: 'themeprot',
            privileges
        },
        {
            scheme: "deltamod",
            privileges
        }
    ])
}

/**
 * 
 * @param {Electron.Session} ses 
 */
function registerProtocolHandlers(ses) {
    ses.protocol.handle('deltapack', async (request) => {
        const url = new URL(request.url);
        // security
        var combined = url.hostname+url.pathname;
        if (combined.includes('..')) {
            errorWin(new Error('Unsecure request made to deltapack.'));
            return new Response("bad");
        }
        const filePath = path.resolve(__dirname, '..', url.hostname + url.pathname);

        const data = await fs.promises.readFile(filePath);
        return new Response(data, {
            headers: {
                'Content-Type': mime.lookup(filePath.split('.')[filePath.split('.').length - 1]) || 'application/octet-stream',
                'Content-Length': String(data.length),
                'Cache-Control': 'no-cache'
            }
        });
    });

    ses.protocol.handle('themeprot', async (request) => {
        const url = new URL(request.url);
        // security
        var combined = url.hostname+url.pathname;
        if (combined.includes('..')) {
            errorWin(new Error('Unsecure request made to themes protocol.'));
            return new Response("bad");
        }
        if (!fs.existsSync(path.join(app.getPath('userData'), 'customThemes'))) {
            fs.mkdirSync(path.join(app.getPath('userData'), 'customThemes'), { recursive: true });
            fs.mkdirSync(path.join(app.getPath('userData'), 'customThemes', 'data'), { recursive: true });
            fs.mkdirSync(path.join(app.getPath('userData'), 'customThemes', 'img'), { recursive: true });
            fs.mkdirSync(path.join(app.getPath('userData'), 'customThemes', 'mus'), { recursive: true });
        }
        let pospath1 = path.join(__dirname, '..', 'web/themes', url.hostname + url.pathname);
        let pospath2 = path.join(app.getPath('userData'), 'customThemes', url.hostname + url.pathname);
        let finalPath = null;
        if (fs.existsSync(pospath2)) {
            finalPath = pospath2;
        }
        else {
            finalPath = pospath1;
        }

        if (fs.existsSync(pospath1) && fs.existsSync(pospath2)) {
            finalPath = pospath1; // prefer built-in theme files
        }

        const data = await fs.promises.readFile(finalPath);
        return new Response(data, {
            headers: {
                'Content-Type': mime.lookup(finalPath.split('.')[finalPath.split('.').length - 1]) || 'application/octet-stream',
                'Content-Length': String(data.length),
                'Cache-Control': 'no-cache'
            }
        });
    });

    /*
    ses.protocol.handle('https', async (request) => {
        const url = new URL(request.url);

        if (!Netlayer.approve(request.url)) {
            setSharedVar('error', 'Unsecure request made to https protocol.');
            win.loadURL('deltapack://web/views/errorWrt/index.html');
        }
        
        const data = await (await fetch(request.url)).arrayBuffer();

        return new Response(data, {
            headers: {
                'Content-Length': data.length,
                'Cache-Control': 'no-cache'
            }
        });
    });
    */

    ses.protocol.handle("http", async (request) => {
        errorWin(new Error("HTTP protocol is not supported. Please use HTTPS for secure connections."));
        return new Response("bad");
    });

    ses.protocol.handle('packet', async (request) => {
        const url = new URL(request.url);
        // security
        var combined = url.hostname+url.pathname;
        if (combined.includes('..') || combined.includes('.js')) {
            errorWin(new Error('Unsecure request made to packet protocol.'));
            return new Response("bad");
        }
        const filePath = path.resolve(System.getPacketDatabase(), url.hostname + url.pathname);

        const data = await fs.promises.readFile(filePath);
        return new Response(data, {
            headers: {
                'Content-Type': mime.lookup(filePath.split('.')[filePath.split('.').length - 1]) || 'application/octet-stream',
                'Content-Length': String(data.length),
                'Cache-Control': 'no-cache'
            }
        });
    });
}

async function handleProtocolLaunch(url) {
    if (!url || !url.startsWith("deltamod://")) return;
    
    log("Protocol launch detected using", url);

    url = trim(url.substring("deltamod://".length), '/');
    
    var args = url.split("/");
    var command = args.shift().toLowerCase();

    switch (command) {
        case "gb": {
            if (!isFeatureEnabled("GB-OneClick")) break;
            if (args.length < 3) break;

            setSharedVar('gb1click', true);

            var modType = args.shift();
            var modId = args.shift();
            var modArchive = args.join("/");

            log("Installing mod via GameBanana:", modType, modId, modArchive);
            var itemid = System.generateUniqueId();
            var filepath = join(System.getTemporary(), `${itemid}.modarchive`);
            log("Downloading to", filepath);

            mkdirSync(dirname(filepath), { recursive: true });

            try {
                const response = await fetch(modArchive);
                if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);

                const total = Number(response.headers.get("content-length")) || 0;
                const reader = response.body.getReader();
                const chunks = [];
                let received = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    received += value.length;

                    if (total > 0) {
                        const percentage = Math.floor((received / total) * 100);
                        require('./Utils').getWindow().webContents.executeJavaScript(`window.currentPageStack.onDLP(${percentage})`);
                    }
                }

                var archiveData = Buffer.concat(chunks);
            }
            catch (e) {
                page("main");
                dialog.showErrorBox('Download failed', 'The mod you\'re attempting to download from GameBanana could not be reached. Please check your internet connection and try again.');
                return;
            }
            writeFileSync(filepath, archiveData);

            log("Download successful -- extracting using 7zip");
            const items = await _7z.list(filepath);
            var cantFindMeta = false;
            if (!items.find(x => x.name === "meta.json") && !items.find(x => x.name === "_deltamodInfo.json")) {
                cantFindMeta = true;
            }
            if (cantFindMeta || !items.find(x => x.name === "modding.xml")) {
                error("Invalid archive -- couldn't find meta.json/deltamodInfo.json or modding.xml");
                rmSync(filepath);

                dialog.showErrorBox('Import failed', 'The mod you\'re attempting to download from GameBanana does not support the Deltamod format.');
                page("main");
                break;
            }

            log("Archive valid -- found meta.json and modding.xml");
            //await _7z.unpack(filepath, join(dirname(filepath), itemid));
            await importMod(filepath, "main", modId, modType);

            setSharedVar('gb1click', false);

            // cleanup
            rmSync(filepath);
            break;
        }

        case "launch": {
            if (args.length < 1) break;

            var installationIdx = args.shift();
            const { getSystemFile } = require('./System');
            const { app } = require('electron');

            fs.writeFileSync(getSystemFile('_sysindex', true), installationIdx.toString());
            log("Launching installation", installationIdx);
            app.relaunch();
            app.exit();
            break;
        }
    }
}

module.exports = {
    handleProtocolLaunch,
    registerProtocolHandlers,
    registerProtocolSchemesAsPrivileged
};
