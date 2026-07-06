window.currentPageStack = {};
window.currentPageStack.gpl = function (obj) {
    var message = obj.log;
    var percent = obj.percent;

    if (message != "") {
        if (document.getElementById("gpl").innerHTML.length > 10000) {
            document.getElementById("gpl").innerHTML = document.getElementById("gpl").innerHTML.slice(document.getElementById("gpl").innerHTML.length - 8000);
        }
        document.getElementById("gpl").innerHTML += message + "<br>";
        const gplElement = document.getElementById("gpl");
        gplElement.scrollTop = gplElement.scrollHeight;
        gplElement.scrollLeft = 0;
    }

    if (percent != -1) {
        document.getElementById("patchingProgress").value = percent;
    }
}

window.currentPageStack.next = function () {
    window.electronAPI.invoke('npsCallback', []);
}

window.currentPageStack.fp = async function () {
    document.getElementById("patchingTXT").innerHTML = icon('check') + " " + "Patching complete!";
    document.getElementById("patchingTXT").classList.add("success");
    document.getElementById("next").style.display = "block";
}