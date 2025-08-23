(async() => {
    try {
        document.getElementById("mtxt").innerHTML = "Version " + window.ustack.updateInfo.version + " for Deltamod is available for download. Do you wish to download it?";
    }
    catch (e) {
        document.getElementById("mtxt").innerHTML = "Unknown";
    }
})();

window.currentPageStack.startUpdateDL = async function() {
    await window.electronAPI.invoke('start-update', [window.ustack.updateInfo]);
};
window.currentPageStack.ignoreUpdate = async function() {
    await window.electronAPI.invoke('ignore-update', []);
};
