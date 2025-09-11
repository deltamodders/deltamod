const console = require("./Console");

function approve(url) {
    const urlParsed = new URL(url);
    // List of approved domains for Deltamod external resources
    var approvedDomains = ["fonts.googleapis.com", "fonts.gstatic.com", "gamebanana.com", "unpkg.com"];
    if (!approvedDomains.includes(urlParsed.hostname)) {
        console.log("Blocked request to: " + urlParsed.hostname);
        return false;
    }
    return true;
}

module.exports = { approve };