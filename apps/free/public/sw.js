const C='net-picking-v2';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','assets/main.js'];
// Filled in at build time by precache.js (every file under assets/: JS, CSS, fonts). Empty in the dev server.
const ASSETS=/*PRECACHE_START*/[]/*PRECACHE_END*/;
const ALL=[...new Set([...FILES,...ASSETS])];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(ALL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&(k==='net-picking-v1'||k.startsWith('net-picking-next-')||/^net-picking-v\d+$/.test(k))).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(m=>m||caches.match('index.html'))));});
