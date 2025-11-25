window.currentPageStack.unlockBtn = function(id,me) {
    me.disabled = true;
    me.innerText = 'Done!';

    document.getElementById('btn'+id).disabled = false;
}