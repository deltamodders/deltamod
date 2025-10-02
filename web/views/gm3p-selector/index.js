(async() => {
    var releases = await fetch('https://api.github.com/repos/deltamodders/GM3P/tags');
    var viewport = document.querySelector('.releases');
    var releasesData = await releases.json();

    releasesData.forEach(async release => {

        var releaseCard = document.createElement('div');
        releaseCard.className = 'releasecard';

        var commitInfo = await fetch(release.commit.url);
        var commitData = await commitInfo.json();



        var title = document.createElement('span');
        title.className = 'str';
        title.textContent = release.name;

        var date = document.createElement('span');
        date.className = 'calibri';
        date.style.fontStyle = 'italic';
        // it is needed
        date.innerHTML = `Published by <strong>${commitData.commit.author.name}</strong> on ${new Date(commitData.commit.author.date).toLocaleDateString()}`;

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