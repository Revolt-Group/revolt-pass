/**
 * Revolt Pass - Background Web Push Service Worker
 * Handles 'push' and 'notificationclick' events for proactive security alerts.
 */

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Revolt Pass', body: event.data.text() };
    }
  }

  const title = data.title || '🛡️ Revolt Pass: Alerta de Seguridad';
  const options = {
    body: data.body || 'Actividad reciente detectada en tu cuenta.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'revolt-security-alert',
    renotify: true,
    data: {
      url: data.url || '/',
      timestamp: data.timestamp || Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
