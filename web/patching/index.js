window.currentPageStack = {};
window.currentPageStack.gpl = function (message) {
    document.getElementById("gpl").innerText += message;
    document.getElementById("gpl").innerHTML += "<br>";
    const gplElement = document.getElementById("gpl");
    gplElement.scrollTop = gplElement.scrollHeight;
}

window.currentPageStack.cancelPatch = function () {
    const controller = new AbortController;
    page('main');
    controller.abort();
    return;
}

document.addEventListener('keydown', function(event) {
    if(event.key === "x" || event.key === "X") {
        const gplElement = document.getElementById("gpl");
        if (gplElement.style.display === "none" || gplElement.style.display === "") {
            gplElement.style.display = "block";
        } else {
            gplElement.style.display = "none";
        }
    }
});