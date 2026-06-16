(async() => {
    var table = document.getElementById("collections");
    var collections = await invoke('gamebanana_getCollections');
    if (collections.success === false && collections.message == 'You must be logged in to perform this action') {
        var tr = document.createElement("tr");
        var errortd = document.createElement("td");
        errortd.colSpan = 2;
        var errordiv = document.createElement("div");
        errordiv.style.display = "flex";
        errordiv.style.alignItems = "center";
        errordiv.style.gap = "0.5em";
        errordiv.innerHTML = icon('account_circle', '1.5em') + "<span>" + await k('collections_not_logged_in') + "</span>";
        errortd.appendChild(errordiv);
        tr.appendChild(errortd);
        table.appendChild(tr);
        return;
    }
    for (const collection of collections) {
        var tr = document.createElement("tr");

        var nametd = document.createElement("td");
        nametd.innerText = collection.name;
        tr.appendChild(nametd);

        var actiontd = document.createElement("td");
        actiontd.classList.add("actions");
        
        var openInBrowser = document.createElement("button");
        openInBrowser.innerHTML = icon('open_in_new', '1em');
        openInBrowser.addEventListener('click', async () => {
            window.open(`https://gamebanana.com/collections/${collection.id}`, '_blank');
        });
        actiontd.appendChild(openInBrowser);

        var trash = document.createElement("button");
        trash.innerHTML = icon('delete', '1em');
        trash.addEventListener('click', async () => {
            var htmlresp = await htmlAlert((await k('delete_collection')), (await k('delete_collection_confirm')), [{
                text: await k('yes'),
                resolveWith: 'y'
            }, {
                text: await k('no'),
                resolveWith: 'n'
            }]);
            if (htmlresp !== 'y') {
                return;
            }
            var resp = await invoke('gamebanana_deleteCollection', [collection.id]);
            if (!resp.success) {
                await htmlAlert(await k('error'), await k('delete_collection_failed', JSON.stringify(resp.error)), [{
                    text: await k('ok'),
                    resolveWith: 'ok'
                }]);
            } else {
                page('collections');
            }
        });
        actiontd.appendChild(trash);
        tr.appendChild(actiontd);

        var backup = document.createElement("button");
        backup.innerHTML = icon('bottom_panel_open', '1em');
        backup.addEventListener('click', async () => {
            window._pageArguments = {
                collectionId: collection.id
            };
            page('collection-exportchoose');
        });
        actiontd.appendChild(backup);
        tr.appendChild(actiontd);

        var download = document.createElement("button");
        download.innerHTML = icon('bottom_panel_close', '1em');
        download.addEventListener('click', async () => {
            download.disabled = true;
            var resp = await invoke('gamebanana_downloadAllInCollection', [collection.id]);
            await htmlAlert(await k('done'), await k('collection_restore_complete'), [{
                text: await k('ok'),
                resolveWith: 'ok'
            }]);
            download.disabled = false;
        });
        actiontd.appendChild(download);
        tr.appendChild(actiontd);


        table.appendChild(tr);
    }

    var addTr = document.createElement("tr");

    var nameInputTd = document.createElement("td");
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = await k('collection_new_placeholder');
    nameInputTd.appendChild(nameInput);
    nameInput.classList.add("collection-name-input");
    addTr.appendChild(nameInputTd);

    var addActionTd = document.createElement("td");
    addActionTd.classList.add("actions");
    var addButton = document.createElement("button");
    addButton.innerHTML = icon('add', '1em');
    addButton.addEventListener('click', async () => {
        var name = nameInput.value.trim();
        if (name.length > 0) {
            var newCollection = await invoke('gamebanana_createCollection', [name]);
            page('collections');
        }
    });
    addActionTd.appendChild(addButton);
    addTr.appendChild(addActionTd);

    table.appendChild(addTr);
})();