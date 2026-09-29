self.addEventListener('push', event => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
    const title = typeof payload.title === 'string' ? payload.title : 'MessMate announcement';
    const body = typeof payload.body === 'string' ? payload.body : 'A new notice is available.';
    const requestedUrl = typeof payload.url === 'string' ? payload.url : '/';
    const targetUrl = new URL(requestedUrl, self.location.origin);
    const safeUrl = targetUrl.origin === self.location.origin ? `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}` : '/';
    event.waitUntil(self.registration.showNotification(title, {
        body,
        icon: '/assets/messmate-mark.svg',
        badge: '/assets/messmate-mark.svg',
        tag: 'messmate-announcement',
        data: { url: safeUrl }
    }));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
        return existing ? existing.navigate(targetUrl).then(() => existing.focus()) : self.clients.openWindow(targetUrl);
    }));
});
