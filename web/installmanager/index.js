(async() => {
    var installs = await window.electronAPI.invoke('getInstallations', []);
    const tbody = document.querySelector('#installations-list');
    installs.forEach(install => {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const pathCell = document.createElement('td');

        console.log(JSON.stringify(install));

        nameCell.innerHTML = "Install no. " + (install.index+1) + "<br>" + install.type;

        row.appendChild(nameCell);
        row.appendChild(pathCell);
        tbody.appendChild(row);
    });
})();