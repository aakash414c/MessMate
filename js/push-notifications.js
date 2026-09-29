(() => {
    const button = document.getElementById('pushSubscribeButton');
    const status = document.getElementById('pushSubscribeStatus');
    if (!button || !status) return;

    let registration;
    let pushConfig;
    let subscription;

    async function request(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Could not update notification settings.');
        return data;
    }

    function updateButton() {
        button.disabled = false;
        button.textContent = subscription ? 'Disable alerts' : 'Enable alerts';
    }

    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            if (subscription) {
                await request('/api/push/subscriptions', {
                    method: 'DELETE',
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
                await subscription.unsubscribe();
                subscription = null;
                status.textContent = 'Browser alerts are disabled on this device.';
            } else {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') throw new Error('Notification permission was not granted.');
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: decodeApplicationKey(pushConfig.publicKey)
                });
                await request('/api/push/subscriptions', {
                    method: 'POST',
                    body: JSON.stringify({ subscription: subscription.toJSON() })
                });
                status.textContent = 'Browser alerts are enabled on this device.';
            }
        } catch (error) {
            status.textContent = error.message;
            if (subscription && !registration?.pushManager) subscription = null;
        } finally {
            updateButton();
        }
    });

    function decodeApplicationKey(value) {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
        return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    }

    (async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
            status.textContent = 'This browser does not support push notifications.';
            return;
        }
        try {
            pushConfig = await request('/api/push/config');
            if (!pushConfig.enabled) {
                status.textContent = 'Push needs VAPID keys configured in the project .env file.';
                return;
            }
            registration = await navigator.serviceWorker.register('/service-worker.js');
            subscription = await registration.pushManager.getSubscription();
            if (subscription && Notification.permission !== 'granted') subscription = null;
            status.textContent = subscription ? 'Browser alerts are enabled on this device.' : 'Get new mess announcements as browser alerts.';
            updateButton();
        } catch (error) {
            status.textContent = error.message;
        }
    })();
})();
