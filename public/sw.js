/* Cache only the public offline shell and static assets, never API responses or authenticated pages. */
const CACHE = 'alumex-field-shell-v3';
self.addEventListener('install', event => event.waitUntil((async () => {
 const cache = await caches.open(CACHE);
 const page = await fetch('/offline', {cache:'reload'});
 if (!page.ok) throw new Error('Offline shell unavailable');
 const html = await page.clone().text();
 await cache.put('/offline', page);
 const assets = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(p=>p.startsWith('/_next/static/'));
 await cache.addAll([...new Set([...assets, '/logos/AlumexLogo.svg'])]);
 await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
 const request=event.request; const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.startsWith('/_next/static/')||url.pathname==='/logos/AlumexLogo.svg'){
  event.respondWith((async()=>{const cache=await caches.open(CACHE);const saved=await cache.match(request);if(saved)return saved;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());return;
 }
 if(request.mode==='navigate')event.respondWith((async()=>{
  try{return await fetch(request);}catch{
   if(url.pathname!=='/offline')return Response.redirect(new URL('/offline?path='+encodeURIComponent(url.pathname),self.location.origin),302);
   return (await caches.open(CACHE)).match('/offline').then(r=>r||Response.error());
  }
 })());
});
