async function onCancel() {
    page('allmods');
}

async function locatePatch() {
    let path = await window.electronAPI.invoke('pickPatchFile', []);
    if (!path || path == "Invalid") {
        htmlAlert("Error", "No file seemed to be selected.", [{ text: "Ok", resolveWith: 'ok' }]);
        return;
    }
    document.querySelector('input[id="mpatchpath"]').value = path;
}

async function onDone() {
    let name = document.querySelector('input[id="mname"]').value;
    let patch_file = document.querySelector('input[id="mpatchpath"]').value;
    let target_file = document.querySelector('input[id="mpatchtarget"]').value;
    try {
        await window.electronAPI.invoke('modCreate', [name, patch_file, target_file]);
        page('allmods');
    } catch (e) {
        htmlAlert("Error", e.toString(), [{ text: "Ok", resolveWith: 'ok' }]);
    }
}


window.currentPageStack = { locatePatch, onCancel, onDone };
