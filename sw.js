// RelyOn 360 — Service Worker
// Estratégia:
//   • index.html / manifest.json → network-first (sempre pega versão nova quando online)
//   • CDN assets (React, Babel…)  → cache-first  (imutáveis, versionados na URL)
//   • Supabase                    → bypass total  (dados em tempo real)

const CACHE_NAME  = 'relyon360-v3';
const CDN_CACHE   = 'relyon360-cdn-v1';

const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icon.svg'];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
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

  // App shell (index.html, manifest, icon): network-first
  // → sempre busca versão nova na rede; usa cache só se offline
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
