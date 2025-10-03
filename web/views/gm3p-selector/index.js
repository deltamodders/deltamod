(async() => {
    var releases = await fetch('https://api.github.com/repos/deltamodders/GM3P/tags');
    var viewport = document.querySelector('.releases');
    var releasesData = await releases.json();

    releasesData.forEach(async release => {

        var releaseCard = document.createElement('div');
        releaseCard.className = 'releasecard';

        var title = document.createElement('span');
        title.className = 'str';
        title.textContent = release.name;

        var button = document.createElement('button');
        button.textContent = 'Download and install this';
        button.onclick = () => {
            window.location.href = release.zipball_url;
        };

        releaseCard.appendChild(title);
        releaseCard.appendChild(date);
        releaseCard.appendChild(button);
        viewport.appendChild(releaseCard);
    });
})();