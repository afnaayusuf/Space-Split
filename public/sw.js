// Offline copy of the planner for the hosted site. The page is one file, so the
// worker keeps the last copy it fetched: online it always loads the newest page,
// offline it falls back to the copy it has. Data never passes through here.
const CACHE = 'waveforce-page';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add('./')).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === 'navigate' || /\/(manifest\.webmanifest|icon\.svg)$/.test(req.url))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './' : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? './' : req).then((hit) => hit || Response.error())),
  );
});
