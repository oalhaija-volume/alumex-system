/* Only the public shell and static assets enter Cache Storage. Account data stays in IndexedDB. */
const CACHE = 'alumex-field-shell-v27';
const mobileDevice = /Android|iPhone|iPad|iPod|Tablet|Silk|Windows Phone/i.test(self.navigator.userAgent);
let refreshing = null;
let refreshedAt = 0;

function refreshShell() {
 if (refreshing) return refreshing;
 if (Date.now() - refreshedAt < 60000) return Promise.resolve();
 refreshing = (async () => {
  const cache = await caches.open(CACHE);
  const page = await fetch('/offline', { cache: 'reload', signal: AbortSignal.timeout(15000) });
  if (!page.ok || page.redirected || !page.headers.get('content-type')?.includes('text/html')) throw new Error('Offline shell unavailable');
  const html = await page.clone().text();
  const assets = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)]
   .map(match => match[1].replaceAll('&amp;', '&')).filter(path => path.startsWith('/_next/static/'));
  if (!assets.length) throw new Error('Offline assets unavailable');
  // Publish the new shell only after every required asset is available. A failed
  // update leaves the previous working shell and unsynced records intact.
  await Promise.all([...new Set([...assets, '/logos/AlumexLogo.svg'])].map(async path => {
   if (await cache.match(path)) return;
   const response = await fetch(path, { signal: AbortSignal.timeout(15000) });
   if (!response.ok) throw new Error('Offline asset unavailable');
   await cache.put(path, response);
  }));
  await cache.put('/offline', page);
  refreshedAt = Date.now();
 })().finally(() => { refreshing = null; });
 return refreshing;
}

self.addEventListener('install', event => event.waitUntil((mobileDevice ? refreshShell() : Promise.resolve()).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
 if (mobileDevice && event.data?.type === 'REFRESH_OFFLINE_SHELL') event.waitUntil(refreshShell().catch(() => {}));
});
self.addEventListener('fetch', event => {
 const request = event.request, url = new URL(request.url);
 if (request.method !== 'GET' || url.origin !== self.location.origin) return;
 if (url.pathname.startsWith('/_next/static/') || url.pathname === '/logos/AlumexLogo.svg') {
  event.respondWith((async () => {
   const cache = await caches.open(CACHE), saved = await cache.match(request);
   if (saved) return saved;
   const response = await fetch(request);
   if (response.ok) await cache.put(request, response.clone()).catch(() => {});
   return response;
  })());
  return;
 }
 if (request.mode !== 'navigate') return;
 // Existing desktop installations must no longer open the saved device shell.
 if (!mobileDevice) {
  if (url.pathname === '/offline') event.respondWith(Promise.resolve(Response.redirect(new URL('/dashboard', self.location.origin), 302)));
  return;
 }
 if (url.pathname === '/offline') {
  // The public device shell opens immediately, even on a slow connection.
  // Refresh it without reloading a form the employee might be filling out.
  event.waitUntil(refreshShell().catch(() => {}));
  event.respondWith((async () => (await (await caches.open(CACHE)).match('/offline')) || fetch(request))());
  return;
 }
 const fieldRoute = /^\/(?:dashboard|intake|projects|mini-crm|initial-measurements)(?:\/|$)/.test(url.pathname);
 if (!fieldRoute) return;
 event.respondWith((async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
   const response = await fetch(request, { signal: controller.signal });
   if (response.status < 500) return response;
  } catch { /* A saved field workspace remains usable when the network stalls. */ }
  finally { clearTimeout(timeout); }
  const saved = await (await caches.open(CACHE)).match('/offline');
  return saved ? Response.redirect(new URL('/offline?path=' + encodeURIComponent(url.pathname), self.location.origin), 302) : Response.error();
 })());
});
