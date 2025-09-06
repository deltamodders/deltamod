async function render(page) {
    document.getElementById("mod-list").innerHTML = "<tr><td colspan='2' style='text-align: center;'>Loading...</td></tr>";
    const gamebanana = await fetch("https://gamebanana.com/apiv11/Game/6755/Subfeed?_sSort=default&_nPage=" + page).then(res => res.json());
    document.getElementById("mod-list").innerHTML = "";

    let i = 0;

    while (i < gamebanana._aRecords.length) {
        const item = gamebanana._aRecords[i];
        if (item._sModelName !== "Mod") {
            i++;
            continue;
        }
        var tr = document.createElement("tr");

        var modMetadata = document.createElement("td");
        modMetadata.style.display = "flex";
        modMetadata.style.alignItems = "center";
        tr.appendChild(modMetadata);

        var img = document.createElement("img");
        img.src = item._aPreviewMedia._aImages[0]._sBaseUrl + "/" + item._aPreviewMedia._aImages[0]._sFile100;
        img.style.maxWidth = "100px";
        img.style.maxHeight = "100px";
        img.style.marginRight = "10px";
        img.style.verticalAlign = "top";
        modMetadata.appendChild(img);

        var detailSpan = document.createElement("div");
        modMetadata.appendChild(detailSpan);

        var modTitle = document.createElement("span");
        modTitle.innerText = item._sName;
        modTitle.style.fontWeight = "bold";
        detailSpan.appendChild(modTitle);
        detailSpan.appendChild(document.createElement("br"));

        var modAuthor = document.createElement("span");
        modAuthor.innerText = "by " + item._aSubmitter._sName;
        modAuthor.style.fontStyle = "italic";
        modAuthor.style.fontSize = "smaller";
        modAuthor.classList.add("calibri");
        detailSpan.appendChild(modAuthor);
        detailSpan.appendChild(document.createElement("br"));

        var downloadTD = document.createElement("td");
        var downloadButton = document.createElement("button");
        downloadButton.innerText = "Download";
        downloadButton.onclick = () => {
            window.open(item._sProfileUrl + "?ref=deltamod", "_blank");
        }
        downloadTD.appendChild(downloadButton);
        tr.appendChild(downloadTD);

        document.getElementById("mod-list").appendChild(tr);

        i++;
    }

    var pageInputTR = document.createElement("tr");
    var pageInputTD = document.createElement("td");
    pageInputTD.style.textAlign = "center";
    pageInputTD.colSpan = 2;
    
    var backButton = document.createElement("button");
    backButton.innerText = "<";
    backButton.onclick = () => {
        if (currentPage != 1) {
            currentPage--;
            render(currentPage);
        }
    };
    if (currentPage != 1) pageInputTD.appendChild(backButton);

    var forwardButton = document.createElement("button");
    forwardButton.innerText = ">";
    forwardButton.onclick = () => {
        currentPage++;
        render(currentPage);
    };
    pageInputTD.appendChild(forwardButton);

    pageInputTR.appendChild(pageInputTD);

    document.getElementById("mod-list").appendChild(pageInputTR);
}

let currentPage = 1;
render(currentPage);