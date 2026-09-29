const CACHE_NAME = 'messmate-shell-v2';
const SHELL_ASSETS = [
    '/', '/index.html', '/signup.html', '/offline.html', '/manifest.webmanifest',
    '/css/main.css', '/css/brand-polish.css', '/css/signup.css',
    '/js/auth.js', '/js/pwa.js', '/js/motion.js',
    '/assets/messmate-mark.svg', '/assets/pwa-icon-192.png', '/assets/pwa-icon-512.png'
];
const OFFLINE_DOCUMENTS = new Set(['/', '/index.html', '/signup.html']);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('messmate-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/app-qr.png') return;

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).then(response => {
            if (response.ok && OFFLINE_DOCUMENTS.has(url.pathname)) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(async () => {
            if (OFFLINE_DOCUMENTS.has(url.pathname)) {
                const cachedPage = await caches.match(request) || await caches.match('/');
                if (cachedPage) return cachedPage;
            }
            return caches.match('/offline.html');
        }));
        return;
    }

    if (['style', 'script', 'image', 'font'].includes(request.destination)) {
        event.respondWith(fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(() => caches.match(request)));
    }
});

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
