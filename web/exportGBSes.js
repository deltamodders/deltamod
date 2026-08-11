var bigBlackDiv = document.createElement('div');
bigBlackDiv.style.position = 'fixed';
bigBlackDiv.style.top = '0';
bigBlackDiv.style.left = '0';
bigBlackDiv.style.width = '100%';
bigBlackDiv.style.height = '100%';
bigBlackDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
bigBlackDiv.style.zIndex = '9999';
document.body.appendChild(bigBlackDiv);

var box = document.createElement('div');
box.style.position = 'fixed';
box.style.top = '50%';
box.style.left = '50%';
box.style.transform = 'translate(-50%, -50%)';
box.style.backgroundColor = 'gray';
box.style.padding = '20px';
box.style.zIndex = '10000';
document.body.appendChild(box);

box.innerText = 'Authorization with Deltamod will begin in a moment...';

setTimeout(async function() {
    var cookie = document.cookie;
    var neededCookies = ['sess', 'rmc', 'muid'];

    function getCookieValue(name) {
        var match = cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        if (match) {
            return match[2];
        }
        return null;
    }

    var token = neededCookies.map(x => x + '.' + getCookieValue(x)).join(':');

    var response = await fetch('http://localhost:4912/?token=' + btoa(token));
    var json = await response.json();

    if (json.success) {
        sessionStorage.setItem('_sSuccessMessage', json.message);
    }

    window.location.reload();
}, 3000);