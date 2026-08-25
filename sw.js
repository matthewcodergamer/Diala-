const CACHE = 'diala-v2.0.1';
const CORE = [
  './', './index.html', './styles.css',
  './css/base.css', './css/components.css', './css/overlays.css',
  './css/ios-v2-1.css', './css/ios-v2-2.css', './css/ios-v2-3.css', './css/ios-v2-4.css',
  './html/shell-1.html', './html/shell-2.html', './html/shell-3.html', './html/shell-4.html', './html/shell-5.html',
  './js/bootstrap-v2.js', './js/v2-core-1.js', './js/v2-core-2.js', './js/v2-core-3.js', './js/v2-core-4.js', './js/v2-core-5.js', './js/v2-core-6.js',
  './js/media.js', './js/v2-app-1.js', './js/v2-app-2.js', './js/v2-app-3.js', './js/v2-app-4.js',
  './manifest.webmanifest', './assets/icon.svg'
];
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
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
});
self.addEventListener('push', event => {
  let data = { title: 'Diala', body: 'You have a new call desk update.', badgeCount: 1, url: './' };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}
  const work = [];
  if ('setAppBadge' in self.navigator && Number.isFinite(Number(data.badgeCount))) {
    work.push(self.navigator.setAppBadge(Math.max(0, Number(data.badgeCount))).catch(() => {}));
  }
  work.push(self.registration.showNotification(data.title || 'Diala', {
    body: data.body || 'You have a new update.', icon: './assets/icon.svg', badge: './assets/icon.svg',
    tag: data.tag || 'diala-update', data: data.url || './'
  }));
  event.waitUntil(Promise.all(work));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const target = event.notification.data || './';
    for (const client of windows) {
      if ('navigate' in client) client.navigate(target).catch(() => {});
      if ('focus' in client) return client.focus();
    }
    return clients.openWindow(target);
  }));
});
