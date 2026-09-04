const CACHE_NAME='rifflog-v4';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.json','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{ if(event.request.method!=='GET') return; event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{ const clone=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone)); return response; }).catch(()=>caches.match('./index.html')))); });
