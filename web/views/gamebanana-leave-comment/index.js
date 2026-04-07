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

async function crawlComment(comment, div, depth = 0) {
    var commentDiv = document.createElement('div');
    if (depth == 0) commentDiv.style.marginTop = '35px';
    commentDiv.classList.add('commentBox');
    commentDiv.style.marginLeft = (depth * 25) + 'px';
    if (depth != 0) {
        commentDiv.style.position = 'relative';

        var leftLine = document.createElement('div');
        leftLine.style.position = 'absolute';
        var sol = -25;

        leftLine.style.left = sol + 'px'; // aligns with global margin-left = 0
        leftLine.style.top = '0';
        leftLine.style.bottom = '0';
        leftLine.style.width = '6px';
        leftLine.style.borderRadius = '5px';
        leftLine.style.backgroundColor = 'var(--theme-color)';

        commentDiv.appendChild(leftLine);
    }

    var img = document.createElement('img');
    try {
        img.src = comment._aPoster._sAvatarUrl || "./img/mod-placeholder.png";
    }
    catch {
        img.src = "./img/mod-placeholder.png";
    }
    img.style.width = "50px";
    img.style.height = "50px";
    img.style.borderRadius = "20px";
    commentDiv.appendChild(img);

    var contentDiv = document.createElement('div');
    contentDiv.classList.add('commentArea');
    contentDiv.innerText = comment._sText.replaceAll(/<[^>]+>/g, '');
    commentDiv.appendChild(contentDiv);

    var stampsDiv = document.createElement('div');
    stampsDiv.classList.add('stampsArea');
    stampsDiv.style.display = 'flex';
    stampsDiv.style.gap = '10px';
    stampsDiv.style.marginTop = '10px';
    stampsDiv.style.alignItems = 'center';
    contentDiv.appendChild(stampsDiv);

    try {
        (comment._aStamps || []).forEach(stampObj => {
            var stamp = document.createElement('span');
            stamp.classList.add('stamp');
            stamp.innerText = stampObj._sTitle + ' x' + stampObj._nCount;
            stampsDiv.appendChild(stamp);
        });
    }
    catch (e) {
        console.log('No stamps for comment ' + comment._idRow);
    }

    div.appendChild(commentDiv);

    if ((comment._nReplyCount || 0) > 0) {
        var replies = await fetch('https://gamebanana.com/apiv11/Post/' + comment._idRow + '/Posts?_nPage=1&_nPerpage=20&' + new Date().getTime());
        var repliesJson = await replies.json();
        try {
            for (let i = 0; i < repliesJson._aRecords.length; i++) {
                const reply = repliesJson._aRecords[i];
                await crawlComment(reply, div, depth + 1);
            }
        }
        catch (e) {
            console.error(e);
        }
    }
}

(async () => {
    document.getElementById('gbPic').src = await window.electronAPI.invoke('getGamebananaPic',[]);
    var comments = await fetch('https://gamebanana.com/apiv11/' + gbModel + '/' + gbModID + '/Posts?_nPage=1&_nPerpage=30&_sSort=popular&' + new Date().getTime());
    var commentsJson = await comments.json();
    var div = document.querySelector('.comments');

    try {
        for (let i = 0; i < commentsJson._aRecords.length; i++) {
            const comment = commentsJson._aRecords[i];
            await crawlComment(comment, div, 0);
        }
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