// Offline: appka sa načíta aj bez signálu, záznamy čakajú v telefóne a odošlú sa neskôr.
// Ukladajú sa len súbory appky (nie dáta zo servera – tie musia byť vždy čerstvé).
const C="dochadzka-v5";
const FILES=["./","index.html","manifest.json","config.js","vendor/supabase-2.117.2.js","icon-192.png","icon-512.png","icon-180.png","vendor/fonts/fonts.css","vendor/html5-qrcode-2.3.8.min.js","vendor/fonts/Barlow-400-latin.woff2","vendor/fonts/Barlow-400-latin-ext.woff2","vendor/fonts/Barlow-500-latin.woff2","vendor/fonts/Barlow-500-latin-ext.woff2","vendor/fonts/Barlow-600-latin.woff2","vendor/fonts/Barlow-600-latin-ext.woff2","vendor/fonts/Barlow-700-latin.woff2","vendor/fonts/Barlow-700-latin-ext.woff2","vendor/fonts/BarlowCondensed-600-latin.woff2","vendor/fonts/BarlowCondensed-600-latin-ext.woff2","vendor/fonts/BarlowCondensed-700-latin.woff2","vendor/fonts/BarlowCondensed-700-latin-ext.woff2"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  const mine=u.origin===location.origin&&!u.pathname.includes("/admin/");
  if(!mine)return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp)).catch(()=>{});return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
