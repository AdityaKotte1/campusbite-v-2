/* MunchAdda service worker — dependency-free.
 * - Navigations: network-first, fall back to cache, then the offline page.
 * - Same-origin static assets (_next/static, images, fonts): stale-while-revalidate.
 * - NEVER caches API calls or cross-origin (Supabase, Razorpay) — those always
 *   hit the network so auth/payments/order data are never stale.
 */
const CACHE = 'munchadda-v2';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin GETs. Cross-origin (Supabase/Razorpay) → default network.
  if (url.origin !== self.location.origin) return;
  // Never cache the API.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: network-first with offline fallback.
  // IMPORTANT: respondWith() MUST resolve to a Response. If fetch rejects and
  // neither the request nor the offline page is cached yet (e.g. the precache is
  // still in flight during an SW update), the old code resolved to `undefined`,
  // which throws "Failed to convert value to 'Response'" and turns the navigation
  // into a network error. Always end on a real Response.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title><p>You are offline.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
    return;
  }

  // Static assets: stale-while-revalidate. The network branch always resolves to
  // a Response (falling back to the cached copy, or a network-error Response) so
  // respondWith() can never receive `undefined`.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
