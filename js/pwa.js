(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch(error => {
                console.warn('MessMate offline shell could not be registered:', error.message);
            });
        });
    }

    const card = document.getElementById('appLaunchCard');
    const installButton = document.getElementById('appLaunchInstall');
    const qr = document.getElementById('appLaunchQr');
    const qrWrap = document.getElementById('appLaunchQrWrap');
    const note = document.getElementById('appLaunchNote');
    let installPrompt = null;

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        if (installButton) installButton.hidden = false;
    });

    window.addEventListener('appinstalled', () => {
        installPrompt = null;
        if (installButton) installButton.hidden = true;
        if (note) note.textContent = 'MessMate is installed on this device. Open it from your home screen or app list.';
    });

    if (installButton) {
        installButton.addEventListener('click', async () => {
            if (!installPrompt) {
                if (note) note.textContent = 'Use your browser menu and choose “Install app” or “Add to Home Screen”.';
                return;
            }
            installPrompt.prompt();
            await installPrompt.userChoice;
            installPrompt = null;
            installButton.hidden = true;
        });
    }

    if (card && qr && note) {
        fetch('/api/public-app', { headers: { Accept: 'application/json' } })
            .then(response => response.ok ? response.json() : null)
            .then(info => {
                if (!info?.available) return;
                qr.src = '/app-qr.png';
                qr.alt = 'QR code that opens MessMate at ' + info.url;
                if (qrWrap) qrWrap.hidden = false;
                note.textContent = 'Scan with your phone camera to open MessMate, then install it from your browser menu.';
            })
            .catch(() => {});
    }
})();
