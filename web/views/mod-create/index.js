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

function qq(selectors, name, kind, kw) {
    let res = document.querySelector(selectors).value;
    if (res) return res;
    if (kw.required)
        throw `Required ${kind} field not specified: ${name}`
    return undefined;
}

function q_input(element_id, name, kw = {}) {
    return qq(`input[id=${element_id}]`, name, "line", kw);
}

function q_textarea(element_id, name, kw = {}) {
    return qq(`textarea[id=${element_id}]`, name, "text", kw);
}

function query_meta() {
    let metadata = {
        name: q_input("mod_meta_name", "Name", { required: true }),
        version: q_input("mod_meta_version", "Version", { required: true }),
        description: q_textarea("mod_meta_desc", "Description", { required: true }),
    };
    return { metadata: metadata };
    let patch_file = document.querySelector('input[id="mpatchpath"]').value;
    let target_file = document.querySelector('input[id="mpatchtarget"]').value;
}

async function onDone() {
    let meta;
    try {
        meta = query_meta();
    } catch (e) {
        htmlAlert("Error", e.toString(), [{ text: "Ok", resolveWith: 'ok' }]);
        return;
    }
    console.log(JSON.stringify(meta));
    return
    try {
        await window.electronAPI.invoke('modCreate', [name, patch_file, target_file]);
        page('allmods');
    } catch (e) {
        htmlAlert("Error", e.toString(), [{ text: "Ok", resolveWith: 'ok' }]);
    }
}


window.currentPageStack = { locatePatch, onCancel, onDone };
