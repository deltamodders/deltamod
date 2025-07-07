function createMod(modName, modDescription, priority, modUID) {
    const tr = document.createElement('tr');

    const td0 = document.createElement('td');
    td0.className = 'ord';
    td0.id = modUID;
    td0.innerHTML = priority;

    const td1 = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = `<b>${modName}</b>`;
    titleSpan.id = `modtitle-${modUID}`;
    td1.appendChild(titleSpan);

    td1.appendChild(document.createElement('br'));

    const descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.innerHTML = modDescription;
    descSpan.id = `moddesc-${modUID}`;
    td1.appendChild(descSpan);

    const td2 = document.createElement('td');
    td2.className = 'checkmod';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `modcheck-${modUID}`;
    checkbox.checked = true;
    td2.appendChild(checkbox);

    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);

    document.getElementById('modlist').appendChild(tr);

    return tr;
}

(async () => {
    var modList = await window.electronAPI.invoke('getModList', []);

    modList.forEach((mod, index) => {
        createMod(mod.name, mod.description, mod.priority, mod.uid);
    });

    if (modList.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 3;
        td.innerHTML = 'No mods found! Import them or add them via GameBanana to begin.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        document.getElementById('modlist').appendChild(tr);
    }
})();

function patchAndRun() {
    page('patching');
    window.electronAPI.invoke('patchAndRun',[[]]);
}

window.currentPageStack.patchAndRun = patchAndRun;