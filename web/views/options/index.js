async function addCheckboxOption(name, description, flagid) {
    const table = document.querySelector('table');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerHTML = name;
    tdLabel.appendChild(span);

    tdLabel.appendChild(document.createElement('br'));

    const small = document.createElement('small');
    small.className = 'calibri';
    small.innerHTML = description;
    tdLabel.appendChild(small);

    const tdInput = document.createElement('td');
    tdInput.className = 'input';
    tdInput.classList.add('center');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'FLAG-' + flagid.toUpperCase();
    input.checked = await window.electronAPI.invoke('getUniqueFlag', [flagid]);
    input.addEventListener('change', async (e) => {
        await window.electronAPI.invoke('setUniqueFlag', [flagid, e.target.checked]);
    });
    tdInput.appendChild(input);

    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);

    table.appendChild(tr);
}


async function addButton(name, description, click, buttonText) {
    const table = document.querySelector('table');
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    const span = document.createElement('span');
    span.innerHTML = name;
    tdLabel.appendChild(span);

    tdLabel.appendChild(document.createElement('br'));

    const small = document.createElement('small');
    small.className = 'calibri';
    small.innerHTML = description;
    tdLabel.appendChild(small);

    const tdInput = document.createElement('td');
    tdInput.classList.add('center');

    const button = document.createElement('button');
    button.innerHTML = buttonText;
    button.addEventListener('click', click);
    tdInput.appendChild(button);

    tr.appendChild(tdLabel);
    tr.appendChild(tdInput);

    table.appendChild(tr);
}

(async() => {
    addCheckboxOption('Enable music in menus', 'Choose if you want music to play in the background. The dogcheck will still have music.', 'audio');
    addButton('Open mod folder', 'Open the folder where mods are stored. You can drag mod folders in Deltamod format there.', async () => {
        await window.electronAPI.invoke('openSysFolder', ['mods']);
    }, 'Open');
    addButton('Open Deltarune installation folder', 'Open the folder where Deltarune is installed.', async () => {
        await window.electronAPI.invoke('openSysFolder', ['delta']);
    }, 'Open');
    addCheckboxOption('Show user Deltarune logs after close', 'Enables logging of Deltarune messages and errors to Deltamod. <b>Will not work on Steam based installs.</b>', 'outputDelta');

    addButton('Select a theme', 'Opens the theme selection menu.', async () => {
        await window.electronAPI.invoke('chooseTheme', []);
    }, 'Open');
})();