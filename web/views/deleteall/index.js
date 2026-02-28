window.currentPageStack.unlockBtn = async function(id,me) {
    me.disabled = true;
    me.innerText = await k('done');

    document.getElementById('btn'+id).disabled = false;
}

setTimeout(() => {
    document.querySelector('.puzzle').style.display='none'; 
    document.querySelector('.puzzleExpired').style.display='block';
}, 30 * 1000);