// RelyOn 360 — Service Worker
// Estratégia:
//   • index.html / manifest.json → network-first (sempre pega versão nova quando online)
//   • /js/*                       → stale-while-revalidate (abre instantâneo, atualiza em bg)
//   • CDN assets (React, Babel…)  → cache-first  (imutáveis, versionados na URL)
//   • Supabase                    → bypass total  (dados em tempo real)

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? { title: 'RelyOn 360', body: 'Sua programação foi atualizada' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      data:  { url: data.url || 'https://relyon360.vercel.app' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(event.notification.data?.url || 'https://relyon360.vercel.app');
    })
  );
});

const CACHE_NAME  = 'relyon360-v5';
const CDN_CACHE   = 'relyon360-cdn-v1';

const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.1',
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CDN_CACHE).then(cache =>
      Promise.allSettled(
        CDN_ASSETS.map(url =>
          fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
        )
      )
    )
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CDN_CACHE).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase: nunca cachear
  if (url.hostname.includes('supabase.co')) return;

  // CDN assets: cache-first (URLs versionadas, conteúdo imutável)
  const isCdn = CDN_ASSETS.some(u => request.url.startsWith(u));
  if (isCdn) {
    event.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(r => {
            if (r.ok) cache.put(request, r.clone());
            return r;
          });
        })
      )
    );
    return;
  }

  // /js/* → stale-while-revalidate: serve cache imediato (abertura instantânea),
  // atualiza em background pra próxima visita pegar versão nova.
  const isJsApp = url.pathname.startsWith('/js/');
  if (isJsApp) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // index.html / manifest / icon → network-first: sempre busca versão nova
  // (é o HTML que referencia ?v=covN, então o app shell precisa estar atualizado).
  const isAppShell = APP_SHELL.some(p => url.pathname === p || url.pathname === '');
  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Demais recursos: cache-first com fallback para rede
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
