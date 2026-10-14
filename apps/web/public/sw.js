const CACHE_NAME = 'bloom-kigali-static-v5';
const OFFLINE_URL = '/offline';

const IS_LOCAL_DEVELOPMENT =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1';

const STATIC_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/brand/bloom-logo-horizontal.png',
  '/brand/bloom-logo-circle.png',
];

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEVELOPMENT) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(STATIC_ASSETS),
      ),
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(
                  'bloom-kigali-',
                ) &&
                (IS_LOCAL_DEVELOPMENT ||
                  key !== CACHE_NAME),
            )
            .map((key) =>
              caches.delete(key),
            ),
        ),
      )
      .then(() =>
        self.clients.claim(),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  // Local development must always use Turbopack's
  // newest JS/CSS rather than PWA cached chunks.
  if (IS_LOCAL_DEVELOPMENT) {
    return;
  }

  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (
    url.origin !== self.location.origin
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache =
          await caches.open(CACHE_NAME);

        const offlinePage =
          await cache.match(OFFLINE_URL);

        return (
          offlinePage ||
          Response.error()
        );
      }),
    );

    return;
  }

  const isSafeStaticAsset =
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname ===
      '/apple-touch-icon.png' ||
    url.pathname === '/favicon.ico' ||
    url.pathname ===
      '/manifest.webmanifest' ||
    url.pathname.startsWith(
      '/_next/static/',
    );

  if (!isSafeStaticAsset) {
    return;
  }

  event.respondWith(
    caches
      .match(request)
      .then(async (cached) => {
        if (cached) {
          return cached;
        }

        const response =
          await fetch(request);

        if (
          !response ||
          response.status !== 200
        ) {
          return response;
        }

        const copy = response.clone();
        const cache =
          await caches.open(CACHE_NAME);

        await cache.put(
          request,
          copy,
        );

        return response;
      }),
  );
});
