(async() => {
    var logs = await window.electronAPI.invoke('fetchSharedVariable', ['deltaruneLogs']);
    document.getElementById('lg').innerText = logs;
})();