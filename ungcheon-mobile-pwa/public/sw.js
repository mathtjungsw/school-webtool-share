const scope = self.registration.scope
const shell = new URL('./', scope).href
const cachePrefix = 'ungcheon-mobile-static-' + encodeURIComponent(new URL(scope).pathname) + '-'
const cacheName = cachePrefix + 'v14'
const shellFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png'].map(path => new URL(path, scope).href)

function isCode(url) {
  return url.href.startsWith(scope) && /\.(?:m?js|css)$/.test(url.pathname) && url.href !== new URL('sw.js', scope).href
}

async function prepareShell() {
  const cache = await caches.open(cacheName)
  const response = await fetch(shell, { cache: 'reload' })
  if (!response.ok) throw new Error('일정 화면을 준비하지 못했습니다.')
  const html = await response.clone().text()
  const assets = new Set(shellFiles)
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const url = new URL(match[1].replace(/&amp;/g, '&'), shell)
    if (isCode(url)) assets.add(url.href)
  }
  await cache.addAll([...assets])
  await cache.put(shell, response)
  await self.skipWaiting()
}

self.addEventListener('install', event => event.waitUntil(prepareShell()))
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== cacheName && (key.startsWith(cachePrefix) || /^ungcheon-mobile-static-v\d+$/.test(key))) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => {
  if (event.data?.type !== 'cache-app-assets' || !Array.isArray(event.data.assets)) return
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    const urls = new Set(event.data.assets.filter(value => {
      try { return typeof value === 'string' && isCode(new URL(value)) } catch { return false }
    }))
    await Promise.all([...urls].map(async url => {
      if (!await cache.match(url)) await cache.add(url)
    }))
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || !url.href.startsWith(scope)) return
  const isHome = request.mode === 'navigate' && [shell, new URL('index.html', scope).href].includes(url.origin + url.pathname)
  if (!isHome && !isCode(url) && !shellFiles.includes(url.href)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    const key = isHome ? shell : request
    try {
      const response = await fetch(request, { cache: 'no-store' })
      if (response.ok) {
        try { await cache.put(key, response.clone()) } catch { /* The online response remains usable when storage is full. */ }
      }
      return response
    } catch (error) {
      const saved = await cache.match(key)
      if (saved) return saved
      throw error
    }
  })())
})
