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

    setTimeout(() => {
        document.querySelector('#messageInput').disabled = false;
        document.querySelector('#messageInput').placeholder = 'Type your message here and press Enter to send...';
    }, 5000);

    document.querySelector('#messageInput').addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            var inputElem = document.querySelector('#messageInput');
            var message = inputElem.value.trim();
            if (message.length === 0) {
                return;
            }
            if (message.length > 100) {
                await htmlAlert(
                    'Error',
                    'Message is too long. Please limit to 100 characters.',
                    [{ text: 'OK', resolveWith: 'ok' }],
                    'error'
                );
                return;
            }
            if (message.includes('https://') || message.includes('http://') || message.includes('www.')) {
                await htmlAlert(
                    'Error',
                    'Message cannot contain URLs.',
                    [{ text: 'OK', resolveWith: 'ok' }],
                    'error'
                );
                return;
            }
            inputElem.value = 'Sending...';
            inputElem.disabled = true;
            inputElem.style.color = 'gray';
            var resp = await window.electronAPI.invoke('deltahubMessagePost', ['en', message]).catch(async (err) => {
                console.error('Error sending message: ', err)
                await htmlAlert(
                    'Error',
                    'Could not send message. Please try again later.',
                    [{ text: 'OK', resolveWith: 'ok' }],
                    'error'
                );
                inputElem.value = '';
            });
            
            page('community');
        }
    });
})();