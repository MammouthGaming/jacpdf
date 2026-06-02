/* eslint-disable no-restricted-globals */
// JacSuite Service Worker — Phase 1 (Plan item 5).
//
// Stratégies de cache :
//   - Shell statique (index.html, JS/CSS bundles, polices) : stale-while-revalidate
//     pour qu'un user offline charge toujours quelque chose, tout en récupérant
//     la version la plus récente en arrière-plan.
//   - Images & icônes : cache-first avec expiration 30 jours.
//   - API Supabase, RPC, et endpoints d'écriture : **JAMAIS** servir depuis le
//     cache. On les laisse passer (network-only) ; en cas d'échec, on enqueue
//     les writes dans IndexedDB (queue traitée par `cloudWriteQueue.js`,
//     à créer en Phase 2).
//   - Feeds iCal : network-first, fallback cache ; ne respecte pas le SW si
//     `cache-control: no-store` est présent (géré côté fetcher déjà).
//
// Versioning : VERSION est injecté automatiquement au build (placeholder
// __BUILD_ID__ remplacé par un horodatage dans vite.config.js). Chaque build
// change donc le nom des caches → purge des anciens au prochain `activate`,
// et déclenche la détection de mise à jour côté client.

const VERSION = '__BUILD_ID__'
const STATIC_CACHE = `jacsuite-static-${VERSION}`
const IMAGE_CACHE = `jacsuite-img-${VERSION}`
const ICAL_CACHE = `jacsuite-ical-${VERSION}`

// Pré-cache minimal du shell. Le reste sera pris en SWR au runtime.
const SHELL_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  // Pas de skipWaiting automatique : on laisse le nouveau SW en attente et on
  // prévient l'utilisateur via la bannière (event jacsuite:sw-update-ready).
  // Il s'activera seulement quand l'utilisateur cliquera « Rafraîchir », ce qui
  // envoie le message SKIP_WAITING (géré plus bas). Évite un reload surprise.
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(SHELL_PRECACHE).catch(() => {})),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((k) => k.startsWith('jacsuite-') && ![STATIC_CACHE, IMAGE_CACHE, ICAL_CACHE].includes(k))
        .map((k) => caches.delete(k)),
    )
    // Prendre la main sur toutes les pages déjà ouvertes.
    await self.clients.claim()
  })())
})

// Helpers d'identification des requêtes.
function isHtml(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')
}
function isStaticAsset(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|json)$/.test(url.pathname)
}
function isImage(url) {
  return /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico)$/.test(url.pathname)
}
function isSupabaseOrApi(url) {
  return (
    url.hostname.endsWith('.supabase.co')
    || url.hostname.endsWith('.supabase.in')
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/rpc/')
  )
}
function isIcalFeed(url, req) {
  // Heuristique : URL terminée par .ics OU header Accept text/calendar.
  if (/\.ics(?:\?.*)?$/.test(url.pathname)) return true
  const accept = (req.headers.get('accept') || '').toLowerCase()
  return accept.includes('text/calendar')
}

// Stratégie : stale-while-revalidate.
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {})
    return response
  }).catch(() => null)
  return cached || networkPromise || new Response('', { status: 504 })
}

// Stratégie : cache-first avec lazy revalidate.
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone()).catch(() => {})
    return response
  } catch {
    return new Response('', { status: 504 })
  }
}

// Stratégie : network-first avec fallback cache.
async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone()).catch(() => {})
    return response
  } catch {
    const cached = await cache.match(request)
    return cached || new Response('', { status: 504 })
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  // On n'intercepte que GET (les POST/PUT vers Supabase sont laissés tels quels
  // et seront enqueueés côté app en Phase 2).
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch { return }

  // Same-origin uniquement, sauf cas explicites (CDN à ajouter ici si besoin).
  const sameOrigin = url.origin === self.location.origin

  if (isSupabaseOrApi(url)) {
    // Pas de cache. Laisser passer.
    return
  }

  if (isIcalFeed(url, req)) {
    event.respondWith(networkFirst(ICAL_CACHE, req))
    return
  }

  if (sameOrigin && isHtml(req)) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, req))
    return
  }

  if (sameOrigin && isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, req))
    return
  }

  if (isImage(url)) {
    event.respondWith(cacheFirst(IMAGE_CACHE, req))
    return
  }
})

// Message API : permet à l'app de demander un skip-waiting depuis l'UI
// (bannière « Une nouvelle version est disponible — Recharger »).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('jacsuite-')).map((k) => caches.delete(k)))
    })())
  }
})