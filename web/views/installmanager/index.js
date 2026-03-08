(async() => {
    var installs = await window.electronAPI.invoke('getInstallations', []);
    var index = await window.electronAPI.invoke('getSystemIndex', []);
    const tbody = document.querySelector('#installations-list');
    for (i in installs) {
        var install = installs[i];
        
        await (async(install, i) => {
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
            nameContainer.style.display = 'flex';
            nameContainer.style.justifyContent = 'left';
            nameContainer.style.alignItems = 'center';
            nameContainer.style.gap = '8px';

            let editablespan = document.createElement('input');
            editablespan.type = 'text';
            editablespan.style.display = 'block';
            editablespan.style.margin = '0';
            editablespan.style.height = '22px';
            editablespan.style.fontSize = '16px';
            editablespan.value = sanitizeHTML(install.name || await k('install_default', install.index + 1));
            editablespan.style.cursor = 'text';
            editablespan.onblur = async () => {
                if (editablespan.value.trim() === "") {
                    htmlAlert(await k('installmanager_invalidname_title'), await k('installmanager_invalidname_desc'), [{text: await k('ok'), resolveWith: 'ok'}]);
                    editablespan.value = await k('install_default', install.index + 1);
                }
                install.name = editablespan.value.trim();
                window.electronAPI.invoke('setInstallationCName', [install.index.toString(), install.name]);
            };

            let boldName = document.createElement('img');
            boldName.style.width = '43px';
            boldName.src = './gamesIco/' + install.pid + '.png';

            nameContainer.appendChild(boldName);
            nameContainer.appendChild(editablespan);

            const details = document.createElement('small');
            {
                var gname = await (window.electronAPI.invoke('getGameInfo', [install.pid])).then(g => g.name);
                details.innerHTML = `${icon('stadia_controller', '14px')} ${gname} <br> ${icon('gite', '14px')} ${(install.steam ? await k('steam') : await k('manual'))}`;
            }
            details.classList.add('calibri');
            details.style.color = '#888';
            details.style.display = 'block';
            nameContainer.appendChild(details);

            console.log('created index row for install: ', install.index );

            let goBtn = document.createElement('button');
            goBtn.style.padding = '4px';
            goBtn.style.textAlign = 'center';
            goBtn = adaptForIcons(goBtn);
            goBtn.innerHTML = icon('sync_arrow_up', '18px');
            goBtn.onclick = () => {
                console.log('Switching to installation index: ', install.index );
                window.electronAPI.invoke('changeSystemIndex', [install.index.toString()]);
            };
            if (index == install.index) {
                goBtn.disabled = true;
                goBtn.style.cursor = 'not-allowed';
                goBtn.style.opacity = '0.3';
                goBtn.innerHTML = icon('check_circle', '18px');
            }
            buttonsDiv.appendChild(goBtn);

            tippy(goBtn, {
                content: index == install.index ? await k('installmanager_current_installation') : await k('installmanager_switch_to_installation'),
                placement: 'top',
                delay: [500, 0],
            });

            let deleteBtn = document.createElement('button');
            deleteBtn.style.padding = '4px';
            deleteBtn.style.textAlign = 'center';
            deleteBtn = adaptForIcons(deleteBtn);
            deleteBtn.innerHTML = icon('delete', '18px');
            deleteBtn.onclick = async () => {
                var resp = await htmlAlert(await k('warning'), `Are you sure you want to delete the installation "${install.name || await k('install_default', install.index + 1)}"? This action cannot be undone.`, [
                    {text: await k('yes'), resolveWith: 'Y'},
                    {text: await k('no'), resolveWith: 'N'}
                ]);

                if (resp === 'Y') {
                    window.electronAPI.invoke('deleteSystemIndex', [install.index.toString()]);
                }
            };
            buttonsDiv.appendChild(deleteBtn);

            tippy(deleteBtn, {
                content: await k('installmanager_delete_installation'),
                placement: 'top',
                delay: [500, 0],
            });

            let openBtn = document.createElement('button');
            openBtn.style.padding = '4px';
            openBtn.style.textAlign = 'center';
            openBtn = adaptForIcons(openBtn);
            openBtn.innerHTML = icon('folder_open', '18px');
            openBtn.onclick = () => {
                window.electronAPI.invoke('openInstallationFolder', [install.index.toString()]);
            }
            tippy(openBtn, {
                content: await k('installmanager_open_installation_folder'),
                placement: 'top',
                delay: [500, 0],
            });

            let shortcutBtn = document.createElement('button');
            shortcutBtn.style.padding = '4px';
            shortcutBtn.style.textAlign = 'center';
            shortcutBtn = adaptForIcons(shortcutBtn);
            shortcutBtn.innerHTML = icon('forward', '18px');
            shortcutBtn.title = await k('installmanager_create_shortcut');
            shortcutBtn.onclick = async () => {
                if (!await window.electronAPI.invoke('isPackaged', [])) {
                    await htmlAlert(await k('error'), await k('installmanager_shortcut_notpackaged'),[{text:await k('ok'),resolveWith:'ok'}]);
                    return;
                }
                window.electronAPI.invoke('createInstallLink', [install.index.toString(), install.name || `Install #${install.index + 1}`]);
            };
            tippy(shortcutBtn, {
                content: await k('installmanager_create_shortcut'),
                placement: 'top',
                delay: [500, 0],
            });
            buttonsDiv.appendChild(shortcutBtn);
            buttonsDiv.appendChild(openBtn);

            goCell.appendChild(buttonsDiv);

            nameCell.appendChild(nameContainer);

            row.appendChild(nameCell);
            row.appendChild(goCell);
            tbody.appendChild(row);
        })(install, i);
    }

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
    newButton.innerHTML = icon("create_new_folder") + ' ' + await k('installmanager_create_new_installation');
    newButton.style.textAlign = 'center';
    newButton.onclick = () => {
        window.fromIM = true;
        page('locate');
    };

    newCell.appendChild(newButton);
    newRow.appendChild(newCell);


    tbody.appendChild(newRow);

    genbtnstyles();
    
})();