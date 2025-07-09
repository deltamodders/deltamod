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

function loadInst(index) {
    window.electronAPI.invoke('changeSystemIndex', [""+index])
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

        document.getElementById('par').innerHTML = 'Run without patches';
    }

    var sysindex = await window.electronAPI.invoke('getSystemIndex', []);
    var maxindex = await window.electronAPI.invoke('getMaxExistingIndex', []);

    console.log(`System index: ${sysindex}, Max index: ${maxindex}`);

    var i = -1;
    while (i < maxindex) {
        i++;
        var option = document.createElement('option');
        option.value = i;
        if (i === sysindex) {
            option.selected = true;
        }
        option.innerHTML = `Install ${i + 1}`;
        document.getElementById('installs').appendChild(option);
    }
    var newOption = document.createElement('option');
    newOption.value = parseInt(maxindex) + 1;
    newOption.innerHTML = '<i>New...</i>';
    document.getElementById('installs').appendChild(newOption);
    document.getElementById('installs').value = sysindex;
    document.getElementById('installs').addEventListener('change', (e) => {
        loadInst(parseInt(e.target.value));
    });
})();

function patchAndRun() {
    var allChecks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.id.startsWith('modcheck-'));
    var selectedMods = allChecks.filter(cb => cb.checked).map(cb => cb.id.replace('modcheck-', ''));
    console.log('Selected mods:', selectedMods);
    page('patching');
    window.electronAPI.invoke('patchAndRun',[selectedMods]);
}

window.currentPageStack.patchAndRun = patchAndRun;