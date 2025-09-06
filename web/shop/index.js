(async() => {
    const gamebanana = await fetch("https://gamebanana.com/apiv11/Game/6755/Subfeed?_sSort=default&_nPage=1").then(res => res.json());

    gamebanana._aRecords.forEach(item => {
        var tr = document.createElement("tr");

        var modMetadata = document.createElement("td");
        modMetadata.innerText = item._sName;
        tr.appendChild(modMetadata);

        var downloadTD = document.createElement("td");
        var downloadButton = document.createElement("button");
        downloadButton.innerText = "Download";
        downloadButton.onclick = () => {
            window.open(`https://gamebanana.com/mods/download/${item._iID}`, "_blank");
        }
        downloadTD.appendChild(downloadButton);
        tr.appendChild(downloadTD);

        document.getElementById("mod-list").appendChild(tr);
    });
})();