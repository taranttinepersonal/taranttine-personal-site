// --- Push notifications (Firebase Cloud Messaging) ---
// Wrapped in try/catch: if this fails (config not filled in yet, CDN unreachable),
// the offline-caching service worker below must keep working regardless.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

  // TODO: replace with real values from Firebase Console > Project settings >
  // General > Your apps > Web app — must match app/js/push.js's firebaseConfig.
  firebase.initializeApp({
    apiKey: 'AIzaSyC9uCOxGzu0NnKKsnpzDCeM1neIw7MLWFY',
    authDomain: 'taranttine-personal.firebaseapp.com',
    projectId: 'taranttine-personal',
    storageBucket: 'taranttine-personal.firebasestorage.app',
    messagingSenderId: '870292754316',
    appId: '1:870292754316:web:ea1e56d4da822404d5d0a9',
  });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || 'Taranttine Personal', {
      body: body || '',
      icon: '/app/icons/icon-192.png',
      badge: '/app/icons/icon-192.png',
    });
  });
} catch (err) {
  // push notifications unavailable this session; offline caching still works
}

const VERSION = 'v3';
const APP_CACHE = `taranttine-app-${VERSION}`;
const DATA_CACHE = `taranttine-data-${VERSION}`;
const GIF_CACHE = `taranttine-gifs-${VERSION}`;
const VENDOR_CACHE = `taranttine-vendor-${VERSION}`;

const APP_SHELL = [
  '/app/',
  '/app/index.html',
  '/app/manifest.webmanifest',
  '/app/css/tokens.css',
  '/app/css/app.css',
  '/app/js/main.js',
  '/app/js/router.js',
  '/app/js/auth.js',
  '/app/js/supabaseClient.js',
  '/app/js/lib/loadHistory.js',
  '/app/js/pages/login.js',
  '/app/js/pages/workout.js',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
];

const SUPABASE_DATA_HOST = 'zqopjmijrmlifwnzthfb.supabase.co';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL);
    // best-effort: supabase-js comes from an external CDN and is required to boot
    // the app offline, but a failed fetch here must not abort the whole install
    try {
      const vendorCache = await caches.open(VENDOR_CACHE);
      await vendorCache.add('https://esm.sh/@supabase/supabase-js@2');
    } catch (err) {
      // ignore — will be cached on first successful online load instead
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  const keep = new Set([APP_CACHE, DATA_CACHE, GIF_CACHE, VENDOR_CACHE]);
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept writes (load/completion saves)

  const url = new URL(request.url);

  if (url.hostname === SUPABASE_DATA_HOST && url.pathname.startsWith('/rest/v1/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.hostname === SUPABASE_DATA_HOST && url.pathname.startsWith('/storage/v1/object/public/')) {
    event.respondWith(cacheFirst(request, GIF_CACHE));
    return;
  }

  if (url.hostname === 'esm.sh') {
    event.respondWith(cacheFirst(request, VENDOR_CACHE));
    return;
  }

  if (url.pathname.startsWith('/app/')) {
    event.respondWith(staleWhileRevalidate(request, APP_CACHE));
    return;
  }
  // everything else (e.g. Google Fonts) passes straight through
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((fresh) => {
    cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => cached);
  return cached || networkPromise;
}
