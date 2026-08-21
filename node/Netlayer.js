const console = require("./Console");

function approve(domain) {
    // List of approved domains for Deltamod external resources
    // Techy: Added Google Sheets for future dyamically data we want Deltamod to pull without directly updating Deltamod (e.g. a mod blocklist or a manifest ID to an updated game)
    var approvedDomains = ["sheets.googleapis.com", "fonts.googleapis.com", "deltamodders.github.io", "api.github.com", "images.gamebanana.com", "avatars.githubusercontent.com", "fonts.googleapis.com", "fonts.gstatic.com", "gamebanana.com", "unpkg.com"];
    if (!approvedDomains.includes(domain)) {
        console.log("Blocked request to: " + domain);
        return false;
    }
    return true;
}

module.exports = {
    approve
};
