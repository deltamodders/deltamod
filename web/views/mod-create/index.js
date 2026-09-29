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

function addPatch() {
    let uid =
        Date.now().toString() + Math.floor(Math.random() * 1000).toString();
    let patch_list = document.getElementById("mod_patch_list");
    let patch_id = `mod_patch_${uid}`;
    let new_patch = document.createElement("div");
    new_patch.id = patch_id;

    let subsec = document.createElement("div");
    subsec.style = "layout: flex; justify-content: left;";
    new_patch.appendChild(subsec);

    let lab = document.createElement("p");
    lab.style = "width: 50%;";
    lab.innerText = `Patch 1 (${uid})`;
    subsec.appendChild(lab);

    let dropdown = el_select_new(subsec, "Patch type (Required)");
    dropdown.className = "mod_patch_type";
    dropdown.style = "width: 50%";
    el_option_new(dropdown, "csx");
    el_option_new(dropdown, "g3mpatch");
    el_option_new(dropdown, "xdelta");
    el_option_new(dropdown, "override");

    el_input_new(new_patch, "mod_patch_src", "Patch source file (Required)");
    el_input_new(
        new_patch,
        "mod_patch_dst",
        "Patch destination file (Required)",
    );
    el_input_new(
        new_patch,
        "mod_patch_dst_csum",
        "Patch destination file checksum (SHA256)",
    );

    let remove_button = document.createElement("button");
    new_patch.appendChild(remove_button);
    remove_button.innerHTML =
        '<span class="material-symbols-outlined">remove</span> Remove';
    remove_button.onclick = (_event) => {
        patch_list.removeChild(new_patch);
    };

    patch_list.appendChild(new_patch);
}

async function locatePatch() {
    let path = await window.electronAPI.invoke("pickPatchFile", []);
    if (!path || path == "Invalid") {
        htmlAlert("Error", "No file seemed to be selected.", [
            { text: "Ok", resolveWith: "ok" },
        ]);
        return;
    }
    document.querySelector('input[id="mpatchpath"]').value = path;
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
        ai: qi("mod_meta_ai", "AI Disclaimer", "dropdown"),
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

window.currentPageStack = { locatePatch, onCancel, onDone, addPatch };
