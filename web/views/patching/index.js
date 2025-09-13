window.tennaDialogue = [
    "MIKE, patch this Deltarune!",
    "Have you heard that GM3P is pretty slow?"
];



window.currentPageStack = {};
window.currentPageStack.gpl = function (message) {
    document.getElementById("gpl").innerText += message;
    document.getElementById("gpl").innerHTML += "<br>";
    const gplElement = document.getElementById("gpl");
    gplElement.scrollTop = gplElement.scrollHeight;
}



window.currentPageStack.toggleGM3P = function () {
    const gplElement = document.getElementById("gpl");
        if (gplElement.style.display === "none" || gplElement.style.display === "") {
            gplElement.style.display = "block";
        } else {
            gplElement.style.display = "none";
        }
};