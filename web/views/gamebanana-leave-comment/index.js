var gbModID = window._pageArguments.id;
var gbModel = window._pageArguments.model;
var commentPage = window._pageArguments.commentPage || 1;
window._pageArguments = {};

async function send() {
    var comment = document.getElementById('comment').value;
    await window.electronAPI.invoke('leaveCommentGamebanana',[gbModID, comment, gbModel]);
    window._pageArguments = {
        'id': gbModID,
        'model': gbModel,
        'commentPage': commentPage
    };
    page('gamebanana-leave-comment');
}

window.currentPageStack.send = send;

(async () => {
    document.getElementById('gbPic').src = await window.electronAPI.invoke('getGamebananaPic',[]);
    var comments = await fetch('https://gamebanana.com/apiv11/' + gbModel + '/' + gbModID + '/Posts?_nPage=1&_nPerpage=30&_sSort=popular');
    var commentsJson = await comments.json();
    var div = document.querySelector('.comments');

    try {
        commentsJson._aRecords.forEach(comment => {
            var commentDiv = document.createElement('div');
            commentDiv.classList.add('commentBox');

            var img = document.createElement('img');
            try {
                img.src = comment._aPoster._sAvatarUrl || "./img/mod-placeholder.png";
            }
            catch {
                img.src = "./img/mod-placeholder.png";
            }
            img.style.width = "50px";
            img.style.height = "50px";
            commentDiv.appendChild(img);

            var contentDiv = document.createElement('div');
            contentDiv.classList.add('commentArea');
            contentDiv.innerText = comment._sText.replaceAll(/<[^>]+>/g, '');
            commentDiv.appendChild(contentDiv);

            div.appendChild(commentDiv);
        });
    }
    catch (e) {
        document.querySelector('.comments').innerHTML += '<p style="text-align: center;">Failed to load comments.</p>';
        console.error(e);
    }
    if (commentsJson._aRecords.length === 0) {
        document.getElementById('nextPageButton').style.display = 'none';
        document.querySelector('.comments').innerHTML += '<p style="text-align: center;">No more comments to load.</p>';
    }
})();