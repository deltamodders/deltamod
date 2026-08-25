(async() => {
    var table = document.getElementById("collections");

    var loadingTr = document.createElement("tr");
    var loadingTd = document.createElement("td");
    loadingTd.colSpan = 2;
    loadingTd.innerText = "Loading collections...";
    loadingTr.appendChild(loadingTd);
    table.appendChild(loadingTr);

    if (!navigator.onLine) {
        table.removeChild(loadingTr);
        var tr = document.createElement("tr");
        var errortd = document.createElement("td");
        errortd.colSpan = 2;
        var errordiv = document.createElement("div");
        errordiv.style.display = "flex";
        errordiv.style.alignItems = "center";
        errordiv.style.gap = "0.5em";
        errordiv.innerHTML = icon('android_wifi_3_bar_off', '1.5em') + "<span>" + "Collections are not available without an Internet connection." + "</span>";
        errortd.appendChild(errordiv);
        tr.appendChild(errortd);
        table.appendChild(tr);
        return;
    }

    var areAvailable = await invoke('areCollectionsAvailable');
    if (!areAvailable) {
        table.removeChild(loadingTr);
        var tr = document.createElement("tr");
        var errortd = document.createElement("td");
        errortd.colSpan = 2;
        var errordiv = document.createElement("div");
        errordiv.style.display = "flex";
        errordiv.style.alignItems = "center";
        errordiv.style.gap = "0.5em";
        errordiv.innerHTML = icon('error', '1.5em') + "<span>" + "Collections are not available without having logged in with an account." + "</span>";
        errortd.appendChild(errordiv);
        tr.appendChild(errortd);
        table.appendChild(tr);
        return;
    }

    var collections = await invoke('gamebanana_getCollections');

    table.removeChild(loadingTr);

    if (collections.success === false && collections.message == 'You must be logged in to perform this action') {
        var tr = document.createElement("tr");
        var errortd = document.createElement("td");
        errortd.colSpan = 2;
        var errordiv = document.createElement("div");
        errordiv.style.display = "flex";
        errordiv.style.alignItems = "center";
        errordiv.style.gap = "0.5em";
        errordiv.innerHTML = icon('account_circle', '1.5em') + "<span>" + "You must be logged in to your accounts to view collections." + "</span>";
        errortd.appendChild(errordiv);
        tr.appendChild(errortd);
        table.appendChild(tr);
        return;
    }
    for (const collection of collections) {
        await (async() => {
            var tr = document.createElement("tr");

            var nametd = document.createElement("td");
            tr.appendChild(nametd);

            var nameDiv = document.createElement("div");
            nametd.appendChild(nameDiv);

            var nameSpan = document.createElement("span");
            nameSpan.innerText = collection.name;
            nameSpan.style.fontSize = "1.2em";
            nameDiv.appendChild(nameSpan);

            nameDiv.appendChild(document.createElement("br"));

            var providerSpan = document.createElement("span");
            providerSpan.innerText = collection.provider ? `(${collection.provider})` : "";
            providerSpan.style.fontSize = "0.8em";
            nameDiv.appendChild(providerSpan);

            var actiontd = document.createElement("td");
            actiontd.classList.add("actions");
            
            var openInBrowser = document.createElement("button");
            openInBrowser.innerHTML = icon('open_in_new', '1em');
            openInBrowser.addEventListener('click', async () => {
                window.open(`https://gamebanana.com/collections/${collection.id}`, '_blank');
            });
            if (collection.provider.toLowerCase() != 'gamebanana') {
                openInBrowser.disabled = true;
            }
            actiontd.appendChild(openInBrowser);

            var trash = document.createElement("button");
            trash.innerHTML = icon('delete', '1em');
            trash.addEventListener('click', async () => {
                var htmlresp = await htmlAlert(("Delete collection"), ("Are you sure you want to delete this collection? This action is irreversible."), [{
                    text: "Yes",
                    resolveWith: 'y'
                }, {
                    text: "No",
                    resolveWith: 'n'
                }]);
                if (htmlresp !== 'y') {
                    return;
                }
                var resp = await invoke('gamebanana_deleteCollection', [collection.id, collection.providerTechnical]);
                if (!resp.success) {
                    await htmlAlert("Error", `Failed to delete collection: ${JSON.stringify(resp.error)}`, [{
                        text: "Ok",
                        resolveWith: 'ok'
                    }]);
                } else {
                    rew();
                    tr.style.transition = "opacity 0.3s ease";
                    tr.style.opacity = "0";
                    await new Promise(resolve => setTimeout(resolve, 300));
                    tr.parentNode.removeChild(tr);
                }
            });
            actiontd.appendChild(trash);
            tr.appendChild(actiontd);

            var backup = document.createElement("button");
            backup.innerHTML = icon('bottom_panel_open', '1em');
            backup.addEventListener('click', async () => {
                window._pageArguments = {
                    collectionId: collection.id,
                    collectionProvider: collection.providerTechnical
                };
                page('collection-exportchoose');
            });
            actiontd.appendChild(backup);
            tr.appendChild(actiontd);

            var download = document.createElement("button");
            download.innerHTML = icon('bottom_panel_close', '1em');
            download.addEventListener('click', async () => {
                download.disabled = true;
                var resp = await invoke('gamebanana_downloadAllInCollection', [collection.id, collection.providerTechnical]);
                await htmlAlert("Done", `Collection restore complete! Skipped ${(resp && (resp.skipped ?? resp.skippedMods ?? 0))} mods in download process.`, [{
                    text: "Ok",
                    resolveWith: 'ok'
                }]);
                download.disabled = false;
            });
            actiontd.appendChild(download);
            tr.appendChild(actiontd);


            table.appendChild(tr);
        })();
    }

    if (collections.length === 0) {
        var tr = document.createElement("tr");
        var notd = document.createElement("td");
        notd.colSpan = 2;
        notd.innerText = "No collections found.";
        tr.appendChild(notd);
        table.appendChild(tr);
    }

    var addTr = document.createElement("tr");

    var nameInputTd = document.createElement("td");
    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "New collection name";
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
            var newCollection = await invoke('gamebanana_createCollection', [name, 'Itch']);
            page('collections');
        }
    });
    addActionTd.appendChild(addButton);
    addTr.appendChild(addActionTd);

    table.appendChild(addTr);
})();