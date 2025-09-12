const console = require("./Console");

function approve(domain) {
    // List of approved domains for Deltamod external resources
    var approvedDomains = ["fonts.googleapis.com", "fonts.googleapis.com", "fonts.gstatic.com", "gamebanana.com", "unpkg.com"];
    if (!approvedDomains.includes(domain)) {
        console.log("Blocked request to: " + domain);
        return false;
    }
    return true;
}

module.exports = { approve };