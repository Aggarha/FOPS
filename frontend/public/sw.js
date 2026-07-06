// FOPS Service Worker — v1
const CACHE_NAME = 'fops-v1';
const STATIC_CACHE = 'fops-static-v1';

// Core app shell routes to precache
const APP_SHELL = [
  '/',
  '/dashboard',
  '/tools',
  '/login',
  '/operations/live-logs',
  '/settings',
  '/tv',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: cache app shell ─────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Precache failed (non-fatal):', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-HTTP(S) requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── API calls: network-first, offline fallback ──────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() =>
          new Response(JSON.stringify({ error: 'offline', message: 'No network connection' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        )
    );
    return;
  }

  // ── Static assets (_next/static): cache-first ─────────────────
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── Navigation: network-first, fallback to cached shell ────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }
});

// ── Push notifications (future use) ──────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'FOPS', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-32.png',
    tag: 'fops-notification',
  });
});
