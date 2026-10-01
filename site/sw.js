// Glassbox service worker: shows a notification when a new explainer is added, and opens it
// when tapped. It does nothing else: no caching, no tracking.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* not JSON: show a plain note */ }
  e.waitUntil(self.registration.showNotification(d.title || 'A new box just opened on Glassbox', {
    body: d.body || 'See inside how something works.',
    icon: '/assets/icon-192.png', badge: '/assets/icon-192.png',
    data: { url: d.url || '/' }, tag: 'glassbox-new',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url === url);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
