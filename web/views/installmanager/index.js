(async () => {
    try {
        const installs = await window.electronAPI.invoke('getInstallations', []).catch(e => {
            throw new Error(`Error fetching installations: ${e.message}`);
        });
        const index = await window.electronAPI.invoke('getSystemIndex', []).catch(e => {
            throw new Error(`Error fetching current installation index: ${e.message}`);
        });
        const tbody = document.querySelector('#installations-list');

        for (const i in installs) {
            const install = installs[i];

            await (async (install, i) => {
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

                const editablespan = document.createElement('input');
                editablespan.type = 'text';
                editablespan.style.display = 'block';
                editablespan.style.margin = '0';
                editablespan.style.height = '22px';
                editablespan.style.fontSize = '16px';
                editablespan.value = sanitizeHTML(
                    install.name || `Install #${install.index + 1}`
                );
                editablespan.style.cursor = 'text';

                editablespan.onblur = async () => {
                    if (editablespan.value.trim() === '') {
                        htmlAlert(
                            'Invalid installation name',
                            'This installation name is invalid. Please choose another one.',
                            [{ text: 'Ok', resolveWith: 'ok' }]
                        );

                        editablespan.value = `Install #${install.index + 1}`;
                    }

                    install.name = editablespan.value.trim();

                    window.electronAPI.invoke('setInstallationCName', [
                        install.index.toString(),
                        install.name,
                    ]);
                };

                const boldName = document.createElement('img');
                boldName.style.width = '43px';
                boldName.src = './gamesIco/' + install.pid + '.png';

                nameContainer.appendChild(boldName);
                nameContainer.appendChild(editablespan);

                const details = document.createElement('small');
                {
                    const gname = await window.electronAPI
                        .invoke('getGameInfo', [install.pid])
                        .then(g => g.name);

                    details.innerHTML = `
                        ${icon('stadia_controller', '14px')} ${gname}<br>
                        ${icon('gite', '14px')} ${install.steam ? 'Steam' : 'Manual'}
                    `;
                }

                details.classList.add('calibri');
                details.style.color = '#888';
                details.style.display = 'block';

                nameContainer.appendChild(details);

                console.log('created index row for install:', install.index);

                let goBtn = document.createElement('button');
                goBtn.style.padding = '4px';
                goBtn.style.textAlign = 'center';
                goBtn = adaptForIcons(goBtn);
                goBtn.innerHTML = icon('sync_arrow_up', '18px');

                goBtn.onclick = () => {
                    console.log('Switching to installation index:', install.index);

                    window.electronAPI.invoke('changeSystemIndex', [
                        install.index.toString(),
                    ]);
                };

                if (index == install.index) {
                    goBtn.disabled = true;
                    goBtn.style.cursor = 'not-allowed';
                    goBtn.style.opacity = '0.3';
                    goBtn.innerHTML = icon('check_circle', '18px');
                }

                buttonsDiv.appendChild(goBtn);

                tippy(goBtn, {
                    content:
                        index == install.index
                            ? 'Current installation'
                            : 'Switch to this installation',
                    placement: 'top',
                    delay: [500, 0],
                });

                let deleteBtn = document.createElement('button');
                deleteBtn.style.padding = '4px';
                deleteBtn.style.textAlign = 'center';
                deleteBtn = adaptForIcons(deleteBtn);
                deleteBtn.innerHTML = icon('delete', '18px');

                deleteBtn.onclick = async () => {
                    const resp = await htmlAlert(
                        'Warning',
                        `Are you sure you want to delete the installation "${
                            install.name || `Install #${install.index + 1}`
                        }"? This action cannot be undone.`,
                        [
                            { text: 'Yes', resolveWith: 'Y' },
                            { text: 'No', resolveWith: 'N' },
                        ]
                    );

                    if (resp === 'Y') {
                        window.electronAPI.invoke('deleteSystemIndex', [
                            install.index.toString(),
                        ]);
                    }
                };

                buttonsDiv.appendChild(deleteBtn);

                tippy(deleteBtn, {
                    content: 'Delete installation',
                    placement: 'top',
                    delay: [500, 0],
                });

                let openBtn = document.createElement('button');
                openBtn.style.padding = '4px';
                openBtn.style.textAlign = 'center';
                openBtn = adaptForIcons(openBtn);
                openBtn.innerHTML = icon('folder_open', '18px');

                openBtn.onclick = () => {
                    window.electronAPI.invoke('openInstallationFolder', [
                        install.index.toString(),
                    ]);
                };

                tippy(openBtn, {
                    content: 'Open installation folder',
                    placement: 'top',
                    delay: [500, 0],
                });

                let shortcutBtn = document.createElement('button');
                shortcutBtn.style.padding = '4px';
                shortcutBtn.style.textAlign = 'center';
                shortcutBtn = adaptForIcons(shortcutBtn);
                shortcutBtn.innerHTML = icon('forward', '18px');
                shortcutBtn.title = 'Create shortcut on desktop';

                shortcutBtn.onclick = async () => {
                    if (!(await window.electronAPI.invoke('isPackaged', []))) {
                        await htmlAlert(
                            'Error',
                            'This feature is only available when Deltamod is packaged.',
                            [{ text: 'Ok', resolveWith: 'ok' }]
                        );
                        return;
                    }

                    window.electronAPI.invoke('createInstallLink', [
                        install.index.toString(),
                        install.name || `Install #${install.index + 1}`,
                    ]);
                };

                tippy(shortcutBtn, {
                    content: 'Create shortcut on desktop',
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
            })(install, i).catch(e => {
                throw new Error(`Error creating row for installation ${install.index}: ${e.message}`);
            });
        }

        const newRow = document.createElement('tr');
        const newCell = document.createElement('td');

        newCell.colSpan = 2;
        newCell.style.textAlign = 'center';

        const newButton = document.createElement('button');
        newButton.style.width = '100%';
        newButton.style.cursor = 'pointer';
        newButton.style.display = 'inline-flex';
        newButton.style.alignItems = 'center';
        newButton.style.gap = '10px';
        newButton.style.justifyContent = 'center';
        newButton.style.textAlign = 'center';

        newButton.innerHTML =
            icon('create_new_folder') + ' Create new installation';

        newButton.onclick = () => {
            window.fromIM = true;
            page('locate');
        };

        newCell.appendChild(newButton);
        newRow.appendChild(newCell);

        tbody.appendChild(newRow);

        genbtnstyles();
    } catch (e) {
        var errorTR = document.createElement('tr');
        var errorTD = document.createElement('td');
        errorTD.colSpan = 2;
        errorTD.style.fontWeight = 'bold';

        var errortitle = document.createElement('div');
        errortitle.innerText = 'Error loading installations';
        errortitle.style.fontSize = '18px';
        errortitle.style.marginBottom = '10px';
        errorTD.appendChild(errortitle);

        var errorMsg = document.createElement('div');
        errorMsg.innerHTML = e.message + '<br>' + e.stack || e;
        errorMsg.style.fontSize = '14px';
        errorTD.appendChild(errorMsg);

        document.querySelector('#installations-list').appendChild(errorTR);
    }
})().catch(e => {
    window.alert('Unexpected error: ' + e.message + '\n' + e.stack);
});