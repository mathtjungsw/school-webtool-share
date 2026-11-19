export function registerScheduleWorker() {
  if (!('serviceWorker' in navigator)) return
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  const scope = new URL('./', manifest?.href || document.baseURI)
  const worker = navigator.serviceWorker
  const hadController = Boolean(worker.controller)
  let reloading = false
  function controllerChanged() {
    if (hadController && !reloading) {
      reloading = true
      location.reload()
    }
  }
  const register = () => {
    void worker.register(new URL('sw.js', scope), { scope: scope.href, updateViaCache: 'none' })
      .then(() => worker.ready)
      .then(registration => {
        // The first visit may have loaded its JS chunks before the worker gained control.
        const assets = performance.getEntriesByType('resource').map(entry => entry.name)
          .filter(url => url.startsWith(scope.href) && /\.(?:m?js|css)$/.test(new URL(url).pathname))
        registration.active?.postMessage({ type: 'cache-app-assets', assets })
      })
      .catch(() => undefined)
  }
  worker.addEventListener('controllerchange', controllerChanged)
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
  return () => {
    window.removeEventListener('load', register)
    worker.removeEventListener('controllerchange', controllerChanged)
  }
}
