// RelyOn 360 — Service Worker
// Estratégia: cache-first para o app shell; network-first para CDNs (com fallback)

const CACHE_NAME = 'relyon360-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

// Recursos de CDN para pré-cachear (versionados, seguros para cache longo)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // App shell: obrigatório
      return cache.addAll(APP_SHELL).then(() => {
        // CDNs: tenta cachear, mas não bloqueia instalação se falhar
        return Promise.allSettled(
          CDN_ASSETS.map(url =>
            fetch(url).then(r => r.ok ? cache.put(url, r) : null).catch(() => null)
          )
        );
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
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

  // Supabase: sempre via rede (dados em tempo real, não cachear)
  if (url.hostname.includes('supabase.co')) return;

  // CDNs e app shell: cache-first, rede como fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        // Só cacheia respostas válidas e do tipo básico/cors
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Offline e não tem cache: retorna o index.html como fallback
        if (url.hostname === location.hostname) {
          return caches.match('/index.html');
        }
      });
    })
  );
});
