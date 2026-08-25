const CACHE = 'diala-v1.0.0';
const CORE = ['./', './index.html', './styles.css', './css/base.css', './css/components.css', './css/overlays.css', './js/core.js', './js/ui.js', './js/comms.js', './js/media.js', './js/ai.js', './js/main.js', './manifest.webmanifest', './assets/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match('./index.html'))));
});

self.addEventListener('push', event => {
  let data = { title: 'Diala', body: 'You have a new call desk update.' };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './assets/icon.svg',
    badge: './assets/icon.svg',
    data: data.url || './'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const target = event.notification.data || './';
    for (const client of windows) { if ('focus' in client) return client.focus(); }
    return clients.openWindow(target);
  }));
});
