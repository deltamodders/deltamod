(async() => {
    var installs = await window.electronAPI.invoke('getInstallations', []);
    var index = await window.electronAPI.invoke('getSystemIndex', []);
    const tbody = document.querySelector('#installations-list');
    installs.forEach(install => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const goCell = document.createElement('td');

        goCell.style.textAlign = 'center';

        console.log(JSON.stringify(install));

        const nameContainer = document.createElement('div');

        let boldName = document.createElement('small');
        boldName.style.display = 'inline-flex';
        boldName.style.alignItems = 'center';
        boldName.style.gap = '5px';
        boldName.style.fontSize = '13px';
        boldName.style.marginBottom = '6px';
        boldName.style.justifyContent = 'left';
        boldName.style.fontWeight = 'normal';
        boldName.innerHTML = icon('snippet_folder') + " Install no. " + (install.index+1);
        nameContainer.appendChild(boldName);

        const details = document.createElement('small');
        details.innerText = ` Game type: ${uppercaseFirst(install.type)}`;
        details.classList.add('calibri');
        details.style.display = 'block';
        nameContainer.appendChild(details);

        let goBtn = document.createElement('button');
        goBtn.style.padding = '8px';
        goBtn.style.textAlign = 'center';
        goBtn = adaptForIcons(goBtn);
        goBtn.innerHTML = icon('sync_arrow_up', '18px') + ' Switch';
        goBtn.onclick = () => {
            if (window.confirm(`Are you sure you want to switch? Deltamod will reboot.`)) {
                window.electronAPI.invoke('changeSystemIndex', [""+install.index]);
            }
        };
        if (index == install.index) {
            goBtn.disabled = true;
            goBtn.style.cursor = 'not-allowed';
            goBtn.style.opacity = '0.3';
            goBtn.innerHTML = icon('check_circle', '18px') + ' Active';
        }
        goCell.appendChild(goBtn);

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
    tbody.appendChild(newRow);
})();