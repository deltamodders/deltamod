function createMod(mod) {
    const modRow = document.createElement('tr');

    // Column 1 (Mod)
    const modNameContainer = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = `<b>${mod.name}</b>`;
    titleSpan.id = `modtitle-${mod.uid}`;
    modNameContainer.appendChild(titleSpan);
    modNameContainer.appendChild(document.createElement('br'));

    const descSpan = document.createElement('span');
    descSpan.className = 'calibri';
    descSpan.innerHTML = mod.description;
    descSpan.id = `moddesc-${mod.uid}`;
    modNameContainer.appendChild(descSpan);

    // Column 2 (Apply?)
    const applyContainer = document.createElement('td');
    applyContainer.className = 'checkmod';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `modcheck-${mod.uid}`;
    checkbox.checked = true;
    applyContainer.appendChild(checkbox);

    // Column 3 (Actions)
    const actionContainer = document.createElement('td');
    actionContainer.className = 'modlist-actions-column';

    const deleteModButton = document.createElement('button');
    deleteModButton.onclick = () => window.electronAPI.invoke('removeMod', [mod.folder]);
    deleteModButton.innerText = "Delete [TEMP FOR ICON]";
    actionContainer.appendChild(deleteModButton);

    modRow.appendChild(modNameContainer);
    modRow.appendChild(applyContainer);
    modRow.appendChild(actionContainer);

    document.getElementById('modlist').appendChild(modRow);
    return modRow;
}

function loadInst(index) {
    window.electronAPI.invoke('changeSystemIndex', [""+index])
}

(async () => {
    var modList = await window.electronAPI.invoke('getModList', []);
    modList.forEach(x => createMod(x));

    if (modList.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.innerHTML = 'No compatible mods found.';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        document.getElementById('modlist').appendChild(tr);

        document.getElementById('par').innerHTML = 'Run without patches';
    }

    var sysindex = await window.electronAPI.invoke('getSystemIndex', []);
    var maxindex = await window.electronAPI.invoke('getMaxExistingIndex', []);

    console.log(`System index: ${sysindex}, Max index: ${maxindex[0]}`);

    var i = -1;
    while (i < maxindex[0]) {
        i++;
        var option = document.createElement('option');
        option.value = i;
        if (i === sysindex) {
            option.selected = true;
        }
        var edition = await window.electronAPI.invoke('getEditionByIndex', [i]);
        option.innerHTML = `Install ${i + 1} (${edition})`;
        document.getElementById('installs').appendChild(option);
    }
    var newOption = document.createElement('option');
    newOption.value = parseInt(maxindex[0]) + 1;
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