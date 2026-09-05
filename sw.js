const CACHE_NAME='rifflog-runtime-v1';
const APP_ROOT=new URL('./',self.registration.scope);
const OFFLINE_URL=new URL('index.html',APP_ROOT).toString();
const ASSETS=[APP_ROOT.toString(),OFFLINE_URL,new URL('styles.css',APP_ROOT).toString(),new URL('i18n.js',APP_ROOT).toString(),new URL('backup-utils.js',APP_ROOT).toString(),new URL('app.js',APP_ROOT).toString(),new URL('manifest.json',APP_ROOT).toString(),new URL('icon.svg',APP_ROOT).toString()];

function isAppRequest(request){
  const url=new URL(request.url);
  if(url.origin!==APP_ROOT.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return false;
  if(request.mode==='navigate') return true;
  return [APP_ROOT.pathname,`${APP_ROOT.pathname}index.html`,`${APP_ROOT.pathname}app.js`,`${APP_ROOT.pathname}i18n.js`,`${APP_ROOT.pathname}backup-utils.js`,`${APP_ROOT.pathname}styles.css`].includes(url.pathname);
}

async function networkFirst(request){
  const cache=await caches.open(CACHE_NAME);
  const url=new URL(request.url), isDocument=request.mode==='navigate' || url.pathname===APP_ROOT.pathname || url.pathname===`${APP_ROOT.pathname}index.html`;
  try {
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){
      await cache.put(request,response.clone());
      if(request.mode==='navigate') await cache.put(OFFLINE_URL,response.clone());
    }
    return response;
  } catch(error) {
    const cached=await cache.match(request,{ignoreSearch:true});
    return cached || (isDocument ? await cache.match(OFFLINE_URL) : Response.error());
  }
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  const responses=await Promise.all(ASSETS.map(url=>fetch(url,{cache:'no-store'})));
  await Promise.all(responses.map((response,index)=>{ if(!response.ok) throw new Error(`Unable to cache ${ASSETS[index]}`); return cache.put(ASSETS[index],response); }));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const cacheNames=await caches.keys();
  await Promise.all(cacheNames.filter(name=>name!==CACHE_NAME).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method==='GET' && isAppRequest(event.request)) event.respondWith(networkFirst(event.request));
});
