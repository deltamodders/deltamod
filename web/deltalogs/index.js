(async() => {
    var logs = await window.electronAPI.invoke('fetchSharedVariable', ['deltaruneLogs']);
    console.log('Deltarune logs:', logs);
    document.getElementById('lg').innerText = logs;
})();