window.currentPageStack = {};
window.currentPageStack.gpl = function (message) {
    if (document.getElementById("gpl").innerHTML.length > 10000) {
        document.getElementById("gpl").innerHTML = document.getElementById("gpl").innerHTML.slice(document.getElementById("gpl").innerHTML.length - 8000);
    }
    document.getElementById("gpl").innerHTML += message + "<br>";
    const gplElement = document.getElementById("gpl");
    gplElement.scrollTop = gplElement.scrollHeight;
    gplElement.scrollLeft = 0;
}

window.currentPageStack.next = function () {
    window.electronAPI.invoke('npsCallback', []);
}

window.currentPageStack.fp = function () {
    if (!baker) {
        document.getElementById("icon").innerHTML = 'check';
        document.getElementById("patchingTXT").innerHTML = "Patching complete!";
        document.getElementById("next").style.display = "block";
    }
    else {
        document.getElementById("patchingTXT").innerHTML = "Finishing baking...";
    }
}



window.currentPageStack.toggleGM3P = function () {
    const gplElement = document.getElementById("gpl");
        if (gplElement.style.display === "none" || gplElement.style.display === "") {
            gplElement.style.display = "block";
        } else {
            gplElement.style.display = "none";
        }
};

let baker = false;

(async() => {
    if (window._pageArguments.customPatchingText) {
        document.getElementById("patchingTXT").innerHTML = "<span class=\"material-symbols-outlined rotate\">cycle</span>" + window._pageArguments.customPatchingText;
    }

    if (window._pageArguments.customPatchingDesc) {
        document.getElementById("patchingDesc").innerHTML = window._pageArguments.customPatchingDesc;
    }

    baker = window._pageArguments && window._pageArguments.baker;

    window._pageArguments = {};
})();