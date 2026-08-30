const STATIC_CACHE = 'ungcheon-mobile-static-v9'
const APP_SHELL = ['', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']
  .map(path => new URL(path, self.registration.scope).href)

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== STATIC_CACHE).map(key => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  // Apps Script POST 및 외부 출처 요청은 가로채거나 캐시하지 않는다.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(APP_SHELL[0])))
    return
  }
  if (['script', 'style', 'worker'].includes(request.destination)) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()))
      return response
    }).catch(() => caches.match(request)))
    return
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()))
    return response
  })))
})
