self.addEventListener('push', event => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'SKF Academy', {
      body: data.body || 'You have an upcoming lesson.',
      icon: '/SKF_APP.png',
      badge: '/SKF_APP.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(event.notification.data?.url || '/dashboard')
          return
        }
      }
      clients.openWindow(event.notification.data?.url || '/dashboard')
    })
  )
})
