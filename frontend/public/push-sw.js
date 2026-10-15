self.addEventListener('push', (event) => {
  let payload = {
    title: 'CEP Tumba',
    body: 'You have a new notification.',
    url: '/announcements',
    tag: 'announcement-notification',
  };

  try {
    if (event.data) {
      const data = event.data.json();
      payload = {
        ...payload,
        ...data,
        tag: data.announcementId ?? payload.tag,
      };
    }
  } catch {
    // Ignore malformed payloads and use defaults.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: {
        url: payload.url,
      },
      tag: payload.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url ?? '/announcements';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl)) {
            return client.focus();
          }
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
