window.currentPageStack.u = function(pr) {
    document.getElementById("up").value = pr;
};

var timeElapsed = 0;

setInterval(function() {
    timeElapsed++;
    var upEl = document.getElementById("up");
    var timeEl = document.getElementById("time");
    var value = parseFloat(upEl.value);
    if (isNaN(value) || value < 0) {
        timeEl.innerText = "--:--";
        return;
    }
    if (value >= 100) {
        timeEl.innerText = "00:00";
        return;
    }
    if (timeElapsed <= 0) {
        timeEl.innerText = "--:--";
        return;
    }

    var speedPerTick = value / timeElapsed; // percent per 100ms tick
    if (speedPerTick <= 0) {
        timeEl.innerText = "--:--";
        return;
    }

    var ticksRemaining = (100 - value) / speedPerTick;
    var secondsRemaining = ticksRemaining * 0.1; // each tick = 0.1s

    var mins = Math.floor(secondsRemaining / 60);
    var secs = Math.round(secondsRemaining % 60);
    if (secs === 60) { mins += 1; secs = 0; }

    var mm = String(mins).padStart(2, "0");
    var ss = String(secs).padStart(2, "0");
    timeEl.innerText = mm + ":" + ss;
}, 100);