// RelyOn 360 — Service Worker (arquitetura de BUNDLE, pós build step esbuild)
// Estratégia:
//   • navegação (/ , /index.html) → NÃO interceptada: o browser busca o HTML direto.
//       O index.html é pequeno e servido com `must-revalidate`; tirar o SW do caminho
//       da navegação elimina a latência de partida do SW antes do 1º paint — era ela
//       que deixava a "tela preta" (#050505 do body) aparecer no recarregamento do
//       portão de versão. (TASKS 2026-06-20 / DESIGN §24)
//   • /app.<hash>.js (bundle)     → cache-first IMUTÁVEL (o hash de conteúdo troca a cada
//       deploy → URL nova → cache miss → fetch fresco; o index.html já chega da rede).
//   • ícones / manifest           → cache-first (precache no install).
//   • CDN assets (React, Supabase, bcrypt, xlsx, babel) → cache-first (URLs versionadas).
//   • Supabase                    → bypass total (dados em tempo real).
//
// Trade-off consciente: sem o fallback de navegação, abrir o PWA 100% offline mostra o
// erro de rede do browser (antes mostrava o shell cacheado, possivelmente stale). O app
// depende do Supabase (online), então isso não é uma regressão real de uso.

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

// CACHE_NAME bumpado a cada mudança de estratégia (purga caches antigos no activate).
// CDN_CACHE FICA em v1 de propósito: _applyUpdate (config.js) limpa todo cache MENOS
// 'relyon360-cdn-v1' ao aplicar uma atualização — manter esse nome preserva os assets
// imutáveis da CDN entre upgrades. Mudar o nome aqui = mudar lá também.
const CACHE_NAME = 'relyon360-v6';
const CDN_CACHE  = 'relyon360-cdn-v1';

// Precache mínimo. O bundle (app.<hash>.js) NÃO entra aqui — o hash é desconhecido na
// hora de escrever o SW; ele é cacheado sob demanda no 1º fetch (cache-first).
const PRECACHE = ['/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.1',
  'https://cdnjs.cloudflare.com/ajax/libs/bcryptjs/2.4.3/bcrypt.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js', // usado só no rollback (babel-no-navegador)
];

// Bundle de produção: /app.<hash>.js na raiz (emitido pelo build.mjs).
const isBundle = url => /^\/app\.[A-Za-z0-9]+\.js$/.test(url.pathname);

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(Promise.all([
    caches.open(CDN_CACHE).then(cache =>
      Promise.allSettled(
        CDN_ASSETS.map(u => fetch(u).then(r => r.ok ? cache.put(u, r) : null).catch(() => null))
      )
    ),
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        PRECACHE.map(p => fetch(p).then(r => r.ok ? cache.put(p, r) : null).catch(() => null))
      )
    ),
  ]));
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CDN_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase: nunca cachear (dados em tempo real).
  if (url.hostname.includes('supabase.co')) return;

  // Navegação: NÃO interceptar — o browser busca o index.html direto da rede.
  // É o que mata a latência de partida do SW (e a tela preta) no auto-update.
  if (request.mode === 'navigate') return;

  // CDN assets: cache-first (URLs versionadas, conteúdo imutável).
  if (CDN_ASSETS.some(u => request.url.startsWith(u))) {
    event.respondWith(cacheFirst(request, CDN_CACHE, false));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  // Bundle hasheado (imutável) + ícones/manifest → cache-first no cache de código.
  if (sameOrigin && (isBundle(url) || PRECACHE.includes(url.pathname))) {
    event.respondWith(cacheFirst(request, CACHE_NAME, isBundle(url)));
    return;
  }

  // Demais recursos: rede direto, sem cache (e sem fallback offline pro shell).
});

// Cache-first: serve do cache se houver; senão busca, cacheia e serve. Quando o request
// é um bundle novo (pruneBundles), remove os app.<hash>.js antigos pra não acumular
// versões obsoletas entre bumps de CACHE_NAME.
async function cacheFirst(request, cacheName, pruneBundles) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const resp = await fetch(request);
  if (resp && resp.ok) {
    if (pruneBundles) {
      const here = new URL(request.url).pathname;
      for (const key of await cache.keys()) {
        const kp = new URL(key.url).pathname;
        if (/^\/app\.[A-Za-z0-9]+\.js$/.test(kp) && kp !== here) cache.delete(key);
      }
    }
    cache.put(request, resp.clone());
  }
  return resp;
}
