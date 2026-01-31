var gbModID = window._pageArguments.id;
var gbModel = window._pageArguments.model;
window._pageArguments = [];

async function send() {
    var comment = document.getElementById('comment').value;
    await window.electronAPI.invoke('leaveCommentGamebanana',[gbModID, comment, gbModel]);
    page('gamebanana-browse');
}

window.currentPageStack.send = send;