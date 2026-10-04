/**
 * @typedef {Object} QueryOptions
 * @property {boolean} optional
 */

/**
 * @type QueryOptions
 */
const QO_DEF = { optional: false };

function onCancel() {
    page("allmods");
}

/**
 * @param {HTMLElement?} parent
 * @param {string} placeholder
 * @returns {HTMLSelectElement}
 */
function el_select_new(parent, placeholder) {
    let res = document.createElement("select");
    res.required = true;
    let d_empty = document.createElement("option");
    d_empty.disabled = true;
    d_empty.hidden = true;
    d_empty.selected = true;
    d_empty.value = "";
    d_empty.innerText = placeholder;
    res.appendChild(d_empty);
    if (parent) parent.appendChild(res);
    return res;
}

/**
 * @param {HTMLSelectElement?} parent
 * @param {string} value
 * @returns {HTMLOptionElement}
 */
function el_option_new(parent, value) {
    let res = document.createElement("option");
    res.value = value;
    res.innerText = value;
    if (parent) parent.appendChild(res);
    return res;
}

/**
 * @param {HTMLElement?} parent
 * @param {string} class_name
 * @param {string} placeholder
 * @returns {HTMLInputElement}
 */
function el_input_new(parent, class_name, placeholder) {
    let res = document.createElement("input");
    res.className = class_name;
    res.placeholder = placeholder;
    if (parent) parent.appendChild(res);
    return res;
}

/**
 * @typedef {Object} InputPlus
 * @property {HTMLDivElement} section
 * @property {HTMLInputElement} field
 * @property {HTMLButtonElement} button
 */

/**
 * @param {HTMLElement?} parent
 * @param {string} field_class_name
 * @param {string} field_placeholder
 * @param {string} icon_kind
 * @param {(event: PointerEvent, field: HTMLInputElement) => void} btn_onclick
 * @returns {InputPlus}
 */
function el_input_plus(
    parent,
    field_class_name,
    field_placeholder,
    icon_kind,
    btn_onclick,
) {
    let res = document.createElement("div");
    res.style =
        "display: flex; justify-content: left; align-items: center; gap: 5px;";
    let field = el_input_new(res, field_class_name, field_placeholder);
    let btn = document.createElement("button");
    res.appendChild(btn);
    btn.onclick = (event) => {
        btn_onclick(event, field);
    };
    let icon = document.createElement("span");
    btn.appendChild(icon);
    icon.className = "material-symbols-outlined";
    icon.innerText = icon_kind;
    if (parent) parent.appendChild(res);
    return { section: res, field: field, button: btn };
}

var patch_counter = 0;

function addPatch() {
    let uid =
        Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    let patch_list = document.getElementById("mod_patch_list");
    let patch_id = `mod_patch_${uid}`;
    let new_patch = document.createElement("div");
    new_patch.id = patch_id;
    new_patch.style =
        "animation: 0.34s cubic-bezier(0, 0.55, 0.45, 1) 0s 1 normal none running fadeIn;";

    let subsec = document.createElement("div");
    subsec.style = "layout: flex;";
    new_patch.appendChild(subsec);

    let lab = document.createElement("p");
    lab.style = "width: 50%; display: inline-block;";
    patch_counter += 1;
    lab.innerText = `Patch ${patch_counter} (${uid})`;
    subsec.appendChild(lab);

    let dropdown = el_select_new(subsec, "Patch type (Required)");
    dropdown.className = "mod_patch_type";
    dropdown.style = "width: 50%; display: inline-block;";
    el_option_new(dropdown, "csx");
    el_option_new(dropdown, "g3mpatch");
    el_option_new(dropdown, "xdelta");
    el_option_new(dropdown, "override");

    let patch_src = el_input_plus(
        new_patch,
        "mod_patch_src",
        "Patch source file (Required)",
        "file_open",
        (_event, field) => {
            locatePatchFile(field, dropdown);
        },
    );

    let patch_dst = el_input_plus(
        new_patch,
        "mod_patch_dst",
        "Patch destination file (Required)",
        "file_open",
        (_event, field) => {
            locatePatchDestFile(field, dropdown);
        },
    );

    let patch_dst_csum = el_input_plus(
        new_patch,
        "mod_patch_dst_csum",
        "Patch destination file checksum (SHA256)",
        "function",
        (_event, field) => {
            calculateFileHash(field, patch_dst.field);
        },
    );

    let revdeps = [patch_src, patch_dst, patch_dst_csum];
    /**
     * @param {InputPlus} input_plus
     * @param {boolean} state
     */
    let revdep_f = (input_plus, state) => {
        input_plus.button.disabled = state;
        input_plus.field.disabled = state;
    };
    revdeps.forEach((input_plus) => revdep_f(input_plus, true));
    dropdown.onchange = (_event) => {
        revdeps.forEach((input_plus) => revdep_f(input_plus, false));
    };

    new_patch.appendChild(document.createElement("p"));

    let remove_button = document.createElement("button");
    new_patch.appendChild(remove_button);
    remove_button.style =
        "padding: 10px; display: flex; align-items: center; justify-content: center; gap: 10px; justify-self: right;";
    remove_button.innerHTML =
        '<span class="material-symbols-outlined">remove</span> Remove';
    remove_button.onclick = (_event) => {
        patch_list.removeChild(new_patch);
    };

    new_patch.appendChild(document.createElement("hr"));

    patch_list.appendChild(new_patch);
}

/**
 * @param {HTMLInputElement} field
 * @param {HTMLSelectElement} dropdown
 * @returns
 */
async function locatePatchFile(field, dropdown) {
    let patch_type = dropdown.value;
    let path = await window.electronAPI.invoke("pickPatchFile", [patch_type, window.currentPageStack.currentMainDir || ""]);
    if (path === "invalid_md") {
        htmlAlert("Error", "Selected file is not within the workspace.", [
            { text: "Ok", resolveWith: "ok" },
        ]);
        return;
    }
    if (path && path !== "Invalid") {
        field.value = path;
        return;
    }
    htmlAlert("Error", "No file seemed to be selected.", [
        { text: "Ok", resolveWith: "ok" },
    ]);
}

/**
 * @param {HTMLInputElement} field
 * @param {HTMLSelectElement} dropdown
 * @returns
 */
async function locatePatchDestFile(field, dropdown) {
    let patch_type = dropdown.value;
    let path = await window.electronAPI.invoke("pickPatchDestFile", [
        patch_type,
    ]);
    if (path && path !== "Invalid") {
        field.value = path;
        return;
    }
    htmlAlert("Error", "No file seemed to be selected.", [
        { text: "Ok", resolveWith: "ok" },
    ]);
}

/**
 * @param {HTMLInputElement} csum_field
 * @param {HTMLInputElement} patch_dst_field
 * @returns
 */
async function calculateFileHash(csum_field, patch_dst_field) {
    let patch_dst = patch_dst_field.value;
    let csum = await window.electronAPI.invoke("calculateFileHash", [
        patch_dst,
    ]);
    if (csum) {
        csum_field.value = csum;
        return;
    }
    htmlAlert("Error", "Destination file checksum calculation failed.", [
        { text: "Ok", resolveWith: "ok" },
    ]);
}

/**
 * @param {string} element_id
 * @param {string} name
 * @param {string} kind
 * @param {QueryOptions} [kw]
 * @returns {Object}
 */
function qi(element_id, name, kind, kw = QO_DEF) {
    let el = document.getElementById(element_id);
    if (!el)
        throw `Element ${element_id} not found. This is likely a Deltamod bug.`;
    let res = el.value;
    if (res) return res;
    if (kw.optional) return null;
    throw `Required ${kind} field not specified: ${name}`;
}

/**
 * @param {string} element_id
 * @param {string} name
 * @param {QueryOptions} [kw]
 * @returns {string}
 */
function qi_input(element_id, name, kw = QO_DEF) {
    return qi(element_id, name, "line", kw);
}

/**
 * @param {string} element_id
 * @param {string} name
 * @param {QueryOptions} [kw]
 * @returns {string}
 */
function qi_textarea(element_id, name, kw = QO_DEF) {
    return qi(element_id, name, "text", kw);
}

/**
 * @param {number} num
 * @param {string} subname
 * @returns {string}
 */
function qq_pid(num, subname) {
    return qi_input(`mod_meta_package_id_${num}`, `Package ID / ${subname}`);
}

/**
 * @returns {string}
 */
function query_pid() {
    const NAMES = ["Website", "Mod", "Author"];
    return NAMES.map((subname, n) => qq_pid(n + 1, subname)).join(".");
}

function query_meta() {
    let metadata = {
        name: qi_input("mod_meta_name", "Name"),
        description: qi_textarea("mod_meta_desc", "Description"),
        author: [qi_input("mod_meta_authors", "Authors")],
        version: qi_input("mod_meta_version", "Version"),
        ai: "no",
        packageID: query_pid(),
        game: qi("mod_meta_game", "Game", "dropdown"),
    };
    return { metadata: metadata };
}

/**
 * @param {HTMLDivElement} patch_el
 * @param {string} clazz
 * @returns {string}
 */
function qpatchel(patch_el, clazz, kw = {}) {
    let clazz2 = `mod_patch_${clazz}`;
    let elms = patch_el.getElementsByClassName(clazz2);
    if (elms.length != 1) throw `Too many elements matching ${clazz2}`;
    let el = elms[0];
    if (el.value) return el.value;
    if (kw.optional) return undefined;
    throw `Required line field not specified: ${patch_el.id} / ${clazz}`;
}

/**
 * @param {HTMLDivElement} patch_el
 * @returns {Object}
 */
function query_modding_inner(patch_el) {
    let ty = qpatchel(patch_el, "type");
    let src = qpatchel(patch_el, "src");
    let dst = qpatchel(patch_el, "dst");
    let dst_csum = qpatchel(patch_el, "dst_csum", { optional: true });
    return { type: ty, from: src, to: dst, csum: dst_csum };
}

function query_modding() {
    let patch_list = document.getElementById("mod_patch_list");
    return Array.from(patch_list.children).map(query_modding_inner);
}

async function onDone() {
    try {
        let meta = query_meta();
        let modding = query_modding();
        await window.electronAPI.invoke("modCreate", [meta, modding]);
        page("allmods");
    } catch (e) {
        htmlAlert("Error", e.toString(), [{ text: "Ok", resolveWith: "ok" }]);
        throw e;
    }
}

window.currentPageStack = { onCancel, onDone, addPatch };

(async () => {
    var currentgame = document.getElementById("currentGame");
    currentgame.innerText = `Currently using ${(await invoke("getCurrentGameInfo")).name}`;
})();

if (window._pageArguments.isWorkspace) {
    window.currentPageStack.currentMainDir = window._pageArguments.path;
    document.querySelector(".workspaceWarning").style.display = "block";
    document.querySelector(".workspaceWarning").innerText = "You may only choose files within the downloaded \"" + window._pageArguments.name + "\" folder.";
}