async function locateDelta() {
    var path = await window.electronAPI.invoke('locateDelta',[]);
    if (path) {
        document.querySelector('input[type="text"]').value = path;
    }
}

function id() {
    console.log(document.getElementById('dpath').value.replaceAll('\\', '/'));
    window.electronAPI.invoke("createNewInstallation", ["", "locate", (window.currentPageStack.pathOV ? window.currentPageStack.pathOV : document.getElementById('dpath').value).replaceAll('\\', '/')]);
}

function steam() {
    window.electronAPI.invoke("createNewInstallation", ["steam", "", ""]);
}
async function downloadDelta() {
    try {
        var p = await window.electronAPI.invoke("downloadDelta", []);
        if (p) {
            document.querySelector('input[type="text"]').value = p;
        }
    } catch (e) {
        console.error("Error downloading Deltarune:", e);
        htmlAlert('Error', 'An error occurred while downloading Deltarune. Please try again later.', [
            { text: 'OK', resolveWith: 'close' }
        ], 'error');
    }
}

window.currentPageStack.id = id;

window.currentPageStack.back = function() {
    window.electronAPI.invoke('changeSystemIndex', ["0"]);
};

window.currentPageStack.locateDelta = locateDelta;

window.currentPageStack.steam = steam;

window.currentPageStack.downloadDelta = downloadDelta;

document.getElementById('audioCHECK').addEventListener('change', (event) => {
    window.electronAPI.invoke('setUniqueFlag', ['AUDIO', event.target.checked]);
});

window.electronAPI.invoke('getUniqueFlag', ['AUDIO']).then((result) => {
    document.getElementById('audioCHECK').checked = result;
});