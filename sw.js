const CACHE_NAME='rifflog-v33';
const ASSETS=['./','./index.html','./styles.css?v=29','./app.js?v=30','./manifest.json','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{ if(event.request.method!=='GET') return; event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{ const clone=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(event.request,clone)); return response; }).catch(()=>caches.match('./index.html')))); });
