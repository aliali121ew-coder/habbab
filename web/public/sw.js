// Service worker: makes the app installable and usable without a connection.
// - Pages ("/"): network first, the last copy offline.
// - Build files (/assets/, content-hashed): cached once, reused.
// - Data (GET /api/…): network first; when offline, or when the network is slower than
//   NETWORK_WAIT, the last saved answer is used, and a late network answer still refreshes it.
// - Photos (/api/files/…): signed and never change, so cached once.
// - Writes (POST, PATCH, DELETE) always go to the server; nothing is queued here.
// The app deletes the data cache when anyone signs out (see localRecords.ts).
const SHELL_CACHE = 'shell-v1';
const DATA_CACHE = 'api-v1';
const KEEP = [SHELL_CACHE, DATA_CACHE];
const NETWORK_WAIT = 4000;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/theme.js', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// What the app shows when there is no connection and nothing saved for this request.
const offlineAnswer = () => new Response(
  JSON.stringify({ error: 'لا يوجد اتصال بالإنترنت، ولا توجد نسخة محفوظة من هذه البيانات بعد' }),
  { status: 503, headers: { 'content-type': 'application/json', 'x-offline': '1' } },
);

// Marks a saved answer so the app can tell it is showing data from the device.
const fromDevice = async (saved) => new Response(await saved.blob(), {
  status: saved.status,
  headers: { ...Object.fromEntries(saved.headers), 'x-offline-copy': '1' },
});

function dataNetworkFirst(event) {
  const { request } = event;
  const network = fetch(request).then(async (response) => {
    // Only real answers are kept; a 401 means the session ended, so the saved copy goes too.
    const cache = await caches.open(DATA_CACHE);
    if (response.status === 200) await cache.put(request, response.clone());
    else if (response.status === 401) await caches.delete(DATA_CACHE);
    return response;
  });
  event.waitUntil(network.catch(() => undefined));

  return new Promise((resolve) => {
    let settled = false;
    const useSaved = async () => {
      const saved = await caches.match(request, { cacheName: DATA_CACHE });
      if (saved && !settled) { settled = true; resolve(fromDevice(saved)); }
      return !!saved;
    };
    const timer = setTimeout(() => { void useSaved(); }, NETWORK_WAIT);
    network
      .then((response) => { clearTimeout(timer); if (!settled) { settled = true; resolve(response); } })
      .catch(async () => {
        clearTimeout(timer);
        if (!(await useSaved()) && !settled) { settled = true; resolve(offlineAnswer()); }
      });
  });
}

function cacheFirst(event, cacheName) {
  const { request } = event;
  return caches.match(request, { cacheName }).then((hit) => hit || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(cacheName).then((cache) => cache.put(request, copy)));
    }
    return response;
  }));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/files/')) { event.respondWith(cacheFirst(event, DATA_CACHE)); return; }
  if (url.pathname.startsWith('/api/')) { event.respondWith(dataNetworkFirst(event)); return; }

  // The app's pages (#/… routes all load "/"): fresh from the network, the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)));
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Build files carry a content hash in their name, so a cached copy is always the right one.
  if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(event, SHELL_CACHE)); return; }

  // Everything else (icons, theme script): network, falling back to the cache.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
