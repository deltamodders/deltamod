async function locateDelta() {
    var path = await window.electronAPI.invoke('locateDelta',[]);
    if (path) {
        document.querySelector('input[type="text"]').value = path;
    }
}

function id() {
    console.log(document.getElementById('dpath').value.replaceAll('\\', '/'));
    window.electronAPI.invoke("importDelta", [document.getElementById('dpath').value.replaceAll('\\', '/')]);
}

window.currentPageStack.id = id;

window.currentPageStack.locateDelta = locateDelta;