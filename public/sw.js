/* RPPC OS service worker: app shell offline, network-first pages, cache-first static assets. */
const VERSION = 'v1'
const STATIC = `rppc-static-${VERSION}`
const PAGES = `rppc-pages-${VERSION}`
const SHELL = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']
const WARM = ['/', '/activities', '/tickets/new', '/tasks']
const NEVER = [/^\/api\//, /^\/auth\//, /^\/login/, /^\/setup/, /^\/account\//]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![STATIC, PAGES].includes(k)) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('message', (e) => {
  if (e.data === 'clear') e.waitUntil(caches.delete(PAGES))
  if (e.data === 'warm') e.waitUntil(warm())
})

async function warm() {
  const c = await caches.open(PAGES)
  await Promise.all(WARM.map(async (u) => {
    try {
      const r = await fetch(u, { credentials: 'same-origin', redirect: 'manual' })
      if (r.ok && r.type === 'basic') await c.put(u, r)
    } catch { /* offline */ }
  }))
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return            // never touch Supabase or signed file URLs
  if (NEVER.some((r) => r.test(url.pathname))) return

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) c.put(req, res.clone())
      return res
    }))
    return
  }

  // React Server Component payloads: network only (the router falls back to a full navigation offline).
  if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(PAGES)
      try {
        const res = await fetch(req)
        if (res.ok && !res.redirected && res.type === 'basic') c.put(url.pathname, res.clone())
        return res
      } catch {
        return (await c.match(url.pathname)) || (await caches.match('/offline')) || Response.error()
      }
    })())
  }
})
