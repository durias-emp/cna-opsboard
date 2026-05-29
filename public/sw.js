// CNA OS — Service Worker for push notifications

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CNA OS', {
      body:    data.body  ?? '',
      icon:    '/cna-logo.png',
      badge:   '/cna-logo.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // If app is already open, focus it and navigate
      for (const client of list) {
        if ('focus' in client) {
          client.focus()
          client.navigate(event.notification.data?.url ?? '/')
          return
        }
      }
      // Otherwise open a new window
      clients.openWindow(event.notification.data?.url ?? '/')
    })
  )
})
