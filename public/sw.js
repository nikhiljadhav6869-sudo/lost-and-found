const CACHE_NAME = 'lost-found-offline-v2';
const OFFLINE_URL = '/offline.html';

// Only this generic page is stored. Reports, photos, API responses and sessions
// always use the network and never enter the service worker's cache.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('lost-found-offline-') && key !== CACHE_NAME) {
        await caches.delete(key);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.pathname === '/api' ||
      url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(OFFLINE_URL) || new Response(
        'You are offline. Reconnect to use Lost & Found.',
        {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}}
      );
    }
  })());
});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification('Lost & Found',{body:'You have a new update. Open the app to view it.',icon:'/icons/icon-192.png',tag:typeof data.tag==='string'?data.tag.slice(0,100):'lost-found-update',data:{url:'/'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows)if(new URL(client.url).origin===self.location.origin){await client.focus();return;}await self.clients.openWindow('/');})());
});
