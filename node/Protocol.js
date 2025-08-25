const { writeFileSync, mkdirSync, rmSync } = require("original-fs");
const { log } = require("./Console");
const { isFeatureEnabled } = require("./FeatureFlags");
const { join, dirname } = require("path");
const system = require("./System");
const _7z = require("7zip-min");
const { error } = require("console");
const { importMod } = require("./Modstore");
const { dialog } = require("electron");
const { page, setSharedVar } = require("./Utils");

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
            var itemid = system.generateUniqueId();
            var filepath = join(system.getTemporary(), `${itemid}.modarchive`);
            log("Downloading to", filepath);

            mkdirSync(dirname(filepath), { recursive: true });

            var archiveData = await fetch(modArchive).then(x => x.bytes());
            writeFileSync(filepath, archiveData);

            log("Download successful -- extracting using 7zip");
            const items = await _7z.list(filepath);
            if (!items.find(x => x.name === "_deltamodInfo.json") || !items.find(x => x.name === "modding.xml")) {
                error("Invalid archive -- couldn't find _deltamodInfo.json or modding.xml");
                rmSync(filepath);

                dialog.showErrorBox('Import failed', 'The mod you\'re attempting to download from GameBanana does not support the Deltamod format.');
                page("main");
                break;
            }

            log("Archive valid -- found _deltamodInfo.json and modding.xml");
            //await _7z.unpack(filepath, join(dirname(filepath), itemid));
            await importMod(filepath);

            setSharedVar('gb1click', false);

            // cleanup
            rmSync(filepath);
            break;
        }

        case "launch": {
            if (args.length < 1) break;

            var installationIdx = args.shift();
            // TODO: Launch an installation using it's index

            log("Launching installation", installationIdx);
            break;
        }
    }
}

module.exports = {handleProtocolLaunch};