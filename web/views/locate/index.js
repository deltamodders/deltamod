async function locateDelta() {
    var path = await window.electronAPI.invoke('locateDelta',[]);
    if (path) {
        document.querySelector('input[type="text"]').value = path;
    }
}

function id() {
    console.log(document.getElementById('dpath').value.replaceAll('\\', '/'));
    window.electronAPI.invoke("createNewInstallation", ["", "locate", document.getElementById('dpath').value.replaceAll('\\', '/')]);
}

function steam() {
    window.electronAPI.invoke("createNewInstallation", ["steam", "", ""]);
}
function downloadDelta() {
    window.electronAPI.invoke("downloadDelta", []);
}

window.currentPageStack.id = id;

window.currentPageStack.back = function() {
    window.electronAPI.invoke('changeSystemIndex', ["0"]);
};

window.currentPageStack.locateDelta = locateDelta;

window.currentPageStack.steam = steam;

window.currentPageStack.downloadDelta = downloadDelta;