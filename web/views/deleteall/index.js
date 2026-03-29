window.currentPageStack.init = function() {
    var white = document.createElement('div');
    white.style.position = 'absolute';
    white.style.left = '0px';
    white.style.top = '0px';
    white.style.width = '100%';
    white.style.height = '100%';
    white.style.backgroundColor = 'white';
    white.style.zIndex = '1000000000';
    white.style.animation = 'fadeIn 5s ease-out forwards';
    document.body.appendChild(white);

    var audSFX = new Audio('audio/fadewh.ogg');
    audSFX.play();

    setTimeout(function() {
        window.electronAPI.invoke('initialize',[])
    }, 6000);
};

var btn = document.getElementById('initbtn');
let holdTimer;
let holding = false;
btn.addEventListener('mousedown', () => {
    holding = true;
});
btn.addEventListener('mouseup', () => {
    holding = false;
});
btn.addEventListener('mouseleave', () => {
    holding = false;
});

setInterval(() => {
    if (holding) {
        holdTimer = (holdTimer || 0) + 100;
        document.getElementById('progbar').value = holdTimer / 5000 * 100;
    }
    else {
        holdTimer = (holdTimer <= 0) ? 0 : holdTimer - 100;
        document.getElementById('progbar').value = holdTimer / 5000 * 100;
    }

    if (holdTimer >= 5000) {
        window.currentPageStack.init();
    }   
}, 100);