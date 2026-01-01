(async() => {
    var communityModule = await window.electronAPI.invoke('deltahubMessageGet', ['en']);
    
    if (!communityModule.ok) {
        await htmlAlert(
            'Error',
            'Could not load community messages.',
            [{ text: 'OK', resolveWith: 'ok' }],
            'error'
        );
        page('main');
        return;
    }
    var msgDiv = document.querySelector('.messages');

    console.log('Messages: ', communityModule.messages.length);

    communityModule.messages.forEach((msg, i) => {
        console.log('Looping message ', i);
        let msgElem = document.createElement('div');
        msgElem.classList.add('message');
        msgDiv.appendChild(msgElem);

        var contentsElem = document.createElement('div');
        contentsElem.classList.add('contents');
        contentsElem.innerHTML = msg.message;
        msgElem.appendChild(contentsElem);

        var dateElem = document.createElement('div');
        dateElem.classList.add('date');
        var interpretTimestamp = new Date(msg.timestamp).toLocaleString();
        dateElem.innerText = interpretTimestamp;
        msgElem.appendChild(dateElem);
    });

    // scroll to bottom of messages
    msgDiv.scrollTop = msgDiv.scrollHeight;

    document.querySelector('#sendBtn').addEventListener('click', async () => {
        try {
            var inputElem = document.querySelector('#messageInput');
            var message = inputElem.value.trim();
            if (message.length === 0) return;

            var sendResult = await window.electronAPI.invoke('deltahubMessagePost', ['en', message]);
            
            inputElem.value = '';

            page('community');
        }
        catch (e) {
            console.error('Error sending message: ', e);
            await htmlAlert(
                'Error',
                'Could not send message. Please check if it contains URLs and try again.',
                [{ text: 'OK', resolveWith: 'ok' }],
                'error'
            );
            inputElem.value = "";
            return;
        }
    });
})();