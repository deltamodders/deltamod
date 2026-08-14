const CREDITS = [
    {
        name: "GhinoRhino",
        role: "Owner & Lead Dev",
        pfp: "ghino.png",
        socials: [
            {
                name: "GameBanana",
                url: "https://gamebanana.com/members/4526373"
            },
            {
                name: "YouTube",
                url: "https://youtube.com/@ghinoyt"
            }
        ]
    },
    {
        name: "mc-intosh",
        role: "Director",
        pfp: "mc.png",
        socials: [
            {
                name: "GameBanana",
                url: "https://gamebanana.com/members/1712567"
            },
            {
                name: "YouTube",
                url: "https://youtube.com/@mc-intosh"
            }
        ]
    },
    {
        name: "Toastie",
        role: "Lead Artist",
        pfp: "toastie.png",
        socials: [
            {
                name: "GameBanana",
                url: "https://gamebanana.com/members/4635904"
            },
            {
                name: "YouTube",
                url: "https://youtube.com/@Its_Toastie"
            },
            {
                name: "Twitter",
                url: "https://x.com/ItToastie"
            }
        ]
    },
    {
        name: "oh ok",
        role: "Artist",
        pfp: "ohok.png",
        socials: [
            {
                name: "GameBanana",
                url: "https://gamebanana.com/members/4635904"
            }
        ]
    },
    {
        name: "Zatmaggot",
        role: "Partnered YouTuber",
        pfp: "zat.png",
        socials: [
            {
                name: "YouTube",
                url: "https://youtube.com/@zatmaggotDR"
            }
        ]
    },
    {
        name: "techy804",
        role: "Developer",
        pfp: "techy.png",
        socials: [
            {
                name: "GameBanana",
                url: "https://gamebanana.com/members/4548254"
            }
        ]
    },
    {
        name: "Myggins07",
        role: "Musician",
        pfp: "myzmyggins.png",
        socials: [
            {
                name: "YouTube",
                url: "https://www.youtube.com/@Myggins"
            }
        ]
    }
];


(async() => {
    document.querySelector('#credits').innerHTML = '';
    document.querySelector('#credits').style.opacity = 0;

    var version = (await window.electronAPI.invoke('version',[]));
    document.querySelector('#version').innerText = 'Deltamod ' + version;

    CREDITS.forEach((credit) => {
        var box = document.createElement('div');
        box.className = 'creditsBox';

        var heart = document.createElement('img');
        heart.className = 'credits-heart';
        heart.src = credit.name == "Zatmaggot" ? './img/zatsoul.svg' : './img/redsoul.svg';
        heart.style.width = '20px';
        heart.style.height = '20px';
        heart.style.opacity = 0;
        box.appendChild(heart);

        var pfp = document.createElement('img');
        pfp.className = 'credits-pfp';
        pfp.style.width = '50px';
        pfp.style.height = '50px';
        pfp.style.borderRadius = '10px';
        pfp.src = "views/credits/pfp/" + credit.pfp;

        var infoDiv = document.createElement('div');
        infoDiv.className = 'credits-info';

        var name = document.createElement('p');
        name.className = 'credits-name';
        name.innerText = credit.name;
        infoDiv.appendChild(name);

        var role = document.createElement('p');
        role.className = 'credits-role';
        role.innerText = credit.role;
        infoDiv.appendChild(role);

        document.querySelector('#credits').appendChild(box);
        box.appendChild(pfp);
        box.appendChild(infoDiv);

        var socials = document.createElement('div');
        socials.className = 'credits-socials';
        infoDiv.appendChild(socials);

        socials.innerHTML = credit.socials.map(social => {
            return `<a href="${social.url}" target="_blank" class="credits-social">${social.name}</a>`;
        }).join(' • ');

        box.addEventListener('mouseenter', () => {
            heart.style.opacity = 1;
        });

        box.addEventListener('mouseleave', () => {
            heart.style.opacity = 0;
        });
    });

    document.querySelector('#credits').style.opacity = 1;
})();