(async() => {
    var installs = await window.electronAPI.invoke('getInstallations', []);
    var index = await window.electronAPI.invoke('getSystemIndex', []);
    const tbody = document.querySelector('#installations-list');
    installs.forEach(install => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const goCell = document.createElement('td');
        const buttonsDiv = document.createElement('div');

        buttonsDiv.style.display = 'flex';
        buttonsDiv.style.gap = '10px';
        buttonsDiv.style.alignItems = 'center';
        buttonsDiv.style.justifyContent = 'center';

        goCell.style.textAlign = 'center';

        console.log(JSON.stringify(install));

        const nameContainer = document.createElement('div');

        let editablespan = document.createElement('input');
        editablespan.type = 'text';
        editablespan.style.display = 'block';
        editablespan.style.margin = '0';
        editablespan.style.height = '22px';
        editablespan.style.fontSize = '13px';
        editablespan.value = sanitizeHTML(install.name || `Install #${install.index + 1}`);
        editablespan.style.cursor = 'text';
        editablespan.onblur = () => {
            if (editablespan.value.trim() === "") {
                window.alert("Installation name cannot be empty.");
                editablespan.value = `Install #${install.index + 1}`;
            }
            install.name = editablespan.value.trim();
            window.electronAPI.invoke('setInstallationCName', [install.index.toString(), install.name]);
        };

        let boldName = document.createElement('small');
        boldName.style.display = 'inline-flex';
        boldName.style.alignItems = 'center';
        boldName.style.gap = '5px';
        boldName.style.fontSize = '13px';
        boldName.style.marginBottom = '6px';
        boldName.style.justifyContent = 'left';
        boldName.style.fontWeight = 'normal';
        boldName.innerHTML = icon('snippet_folder');
        boldName.appendChild(editablespan);

        nameContainer.appendChild(boldName);

        const details = document.createElement('small');
        details.innerHTML = ` Game type: ${uppercaseFirst(install.type)}<br>Game source: ${(install.steam ? 'Steam' : 'Manual')}`;
        details.classList.add('calibri');
        details.style.display = 'block';
        nameContainer.appendChild(details);

        let goBtn = document.createElement('button');
        goBtn.style.padding = '4px';
        goBtn.style.textAlign = 'center';
        goBtn = adaptForIcons(goBtn);
        goBtn.innerHTML = icon('sync_arrow_up', '18px');
        goBtn.onclick = () => {
            window.electronAPI.invoke('changeSystemIndex', [install.index.toString()]);
        };
        if (index == install.index) {
            goBtn.disabled = true;
            goBtn.style.cursor = 'not-allowed';
            goBtn.style.opacity = '0.3';
            goBtn.innerHTML = icon('check_circle', '18px');
        }
        buttonsDiv.appendChild(goBtn);

        let deleteBtn = document.createElement('button');
        deleteBtn.style.padding = '4px';
        deleteBtn.style.textAlign = 'center';
        deleteBtn = adaptForIcons(deleteBtn);
        deleteBtn.innerHTML = icon('delete', '18px');
        deleteBtn.onclick = () => {
            if (window.confirm("Are you sure you want to delete this installation? This action cannot be undone.")) {
                window.electronAPI.invoke('deleteSystemIndex', [install.index.toString()]);
            }
        };
        buttonsDiv.appendChild(deleteBtn);

        let openBtn = document.createElement('button');
        openBtn.style.padding = '4px';
        openBtn.style.textAlign = 'center';
        openBtn = adaptForIcons(openBtn);
        openBtn.innerHTML = icon('folder_open', '18px');
        openBtn.onclick = () => {
            window.electronAPI.invoke('openInstallationFolder', [install.index.toString()]);
        }
        buttonsDiv.appendChild(openBtn);

        goCell.appendChild(buttonsDiv);

        nameCell.appendChild(nameContainer);

        row.appendChild(nameCell);
        row.appendChild(goCell);
        tbody.appendChild(row);
    });

    const newRow = document.createElement('tr');
    const newCell = document.createElement('td');
    newCell.colSpan = 2;
    newCell.style.textAlign = 'center';

    let newButton = document.createElement('button');
    newButton.style.width = '100%';
    newButton.style.cursor = 'pointer';
    newButton.style.display = 'inline-flex';
    newButton.style.alignItems = 'center';
    newButton.style.gap = '10px';
    newButton.style.justifyContent = 'center';
    newButton.innerHTML = icon("create_new_folder") + ' New installation';
    newButton.style.textAlign = 'center';
    newButton.onclick = () => {
        console.log('New button clicked');
        window.electronAPI.invoke('createNewInstallation', []);
    };

    newCell.appendChild(newButton);
    newRow.appendChild(newCell);

    const steamRow = document.createElement('tr');
    const steamCell = document.createElement('td');
    steamCell.colSpan = 2;
    steamCell.style.textAlign = 'center';

    let steamButton = document.createElement('button');
    steamButton.style.width = '100%';
    steamButton.style.cursor = 'pointer';
    steamButton.style.display = 'inline-flex';
    steamButton.style.alignItems = 'center';
    steamButton.style.gap = '10px';
    steamButton.style.paddingTop = '10px';
    steamButton.style.paddingBottom = '10px';
    steamButton.style.justifyContent = 'center';
    steamButton.innerHTML = '<img src="./steam.svg" width="20"> Import Steam installation (BETA)';
    steamButton.style.textAlign = 'center';
    steamButton.onclick = () => {
        console.log('Steam button clicked');
        window.electronAPI.invoke('createNewInstallation', ['steam']);
    };

    steamCell.appendChild(steamButton);
    steamRow.appendChild(steamCell);
    
    tbody.appendChild(newRow);
    tbody.appendChild(steamRow);
})();