/* Account-scoped, network-first private copies. Authentication is never cached. */
const VERSION = 'photon-v2-actual-energy';
const ASSETS = `${VERSION}-assets`;
const META = `${VERSION}-meta`;
const MAX_AGE = 30 * 86400000;
const pages = new Set(['/', '/solar', '/devices', '/settings', '/automations', '/reports']);
const privatePath = path => pages.has(path) || ['/api/devices', '/api/automations/activity', '/api/automations', '/api/reports', '/api/storage-health', '/api/tuya/groups', '/api/tuya/scenes', '/api/settings', '/api/favorites', '/api/tuya/devices', '/api/tuya/rooms', '/api/solar/latest', '/api/solar/history', '/api/solar/reports'].includes(path) || /^\/api\/devices\/tuya\/[^/]+\/energy$/.test(path) || /^\/api\/tuya\/[^/]+(?:\/history)?$/.test(path);
const assetPath = path => /\.(?:js|css|woff2|png|svg)$/.test(path) && !path.startsWith('/api/');
const key = request => {
  const url = new URL(request.url);
  // The device UI asks for rolling whole-day ranges with a fresh clock on each open.
  if(/^\/api\/tuya\/[^/]+\/history$/.test(url.pathname)) for(const param of ['from','to']) {
    const value=url.searchParams.get(param); if(value&&/^\d{4}-\d{2}-\d{2}T/.test(value))url.searchParams.set(param,value.slice(0,10));
  }
  url.searchParams.sort(); return url.href;
};
let identityQueue = Promise.resolve();
async function account() { return (await (await caches.open(META)).match('/__photon_account'))?.text() ?? null; }
async function clearPrivate() { for (const name of await caches.keys()) if (name.startsWith('photon-') && name !== ASSETS) await caches.delete(name); }
async function setAccount(id) {
  identityQueue = identityQueue.catch(() => {}).then(async () => {
    if (await account() !== id) await clearPrivate();
    if (id) await (await caches.open(META)).put('/__photon_account', new Response(id));
  });
  await identityQueue;
}
async function copy(cache, request, response) {
  const headers = new Headers(response.headers); headers.set('x-photon-saved-at', String(Date.now()));
  await cache.put(key(request), new Response(await response.arrayBuffer(), {status: response.status, headers}));
}
async function saved(cache, request) {
  const response = await cache.match(key(request));
  if (!response) return null;
  if (Date.now() - Number(response.headers.get('x-photon-saved-at') || 0) > MAX_AGE) { await cache.delete(key(request)); return null; }
  return response;
}
async function notifySaved(response) {
  for (const client of await self.clients.matchAll()) client.postMessage({type:'SAVED_COPY', savedAt: Number(response.headers.get('x-photon-saved-at'))});
}
self.addEventListener('install', event => event.waitUntil((async () => {
  await (await caches.open(ASSETS)).addAll(['/offline.html', '/favicon.svg', '/manifest.webmanifest']);
  // Production manifest includes every client chunk, so restart offline needs no network.
  const manifest=await fetch('/offline-assets.json');
  if(manifest.ok&&manifest.headers.get('content-type')?.includes('json')) {
    const assets=await manifest.json();
    if(Array.isArray(assets))await (await caches.open(ASSETS)).addAll(assets.filter(path=>typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&assetPath(path)));
  }
  self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Never keep private copies made by an older cache protocol.
  for (const name of await caches.keys()) if (name.startsWith('photon-') && !name.startsWith(VERSION)) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  event.waitUntil((async () => {
    if (event.data?.type === 'ACCOUNT') await setAccount(event.data.accountId);
    if (event.data?.type === 'CLEAR_PRIVATE') {
      await setAccount(null);
      for(const notification of await self.registration.getNotifications())notification.close();
    }
    if (event.data?.type === 'WARM_PAGE') {
      const path = event.data.path;
      const target=typeof path==='string'?new URL(path,self.location.origin):null;
      if (target&&target.origin===self.location.origin&&pages.has(target.pathname)) {
        const response = await fetch(path, {credentials:'same-origin',cache:'no-store'});
        await privateResponse(new Request(new URL(path, self.location.origin)), response);
      }
    }
    event.ports[0]?.postMessage({ok:true, accountId: await account()});
  })());
});
async function privateResponse(request, response) {
  // A 401/403 or auth redirect must clear copies, never fall back to them.
  if (response.status === 401 || response.status === 403 || response.redirected || response.type === 'opaqueredirect') { await setAccount(null); return response; }
  if (!response.ok) return response;
  let id = await account();
  if (pages.has(new URL(request.url).pathname) && response.headers.get('content-type')?.includes('text/html')) {
    const html = await response.clone().text();
    const match = html.match(/<meta name="photon-account" content="([^"]+)"/);
    if (!match) { await setAccount(null); return response; }
    id = match[1]; await setAccount(id);
    const assetCache = await caches.open(ASSETS);
    const assets = [...html.matchAll(/(?:src|href)="([^"<>]+\.(?:js|css)(?:\?[^"<>]*)?)"/g)].map(m => new URL(m[1], request.url));
    await Promise.allSettled(assets.filter(url => url.origin === self.location.origin).map(async url => { if(await assetCache.match(url)) return; const result = await fetch(url); if(result.ok) await assetCache.put(url, result); }));
  }
  if (id) {
    const cache = await caches.open(`${VERSION}-private-${encodeURIComponent(id)}`);
    await copy(cache, request, response.clone());
    // Purge expired data even when the expired report is never opened again; pages are rare enough to pay for the scan.
    if (pages.has(new URL(request.url).pathname)) for (const old of await cache.keys()) await saved(cache, old);
  }
  return response;
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api/auth/logout') { event.respondWith((async () => { await setAccount(null); return fetch(request); })()); return; }
  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) event.respondWith(fetch(request).catch(() => Response.json({error:'Offline: changes are disabled. Nothing was queued.'},{status:503})));
    return;
  }
  if (assetPath(url.pathname)) {
    event.respondWith((async () => { const cache = await caches.open(ASSETS); const hit = await cache.match(request); if(hit)return hit; const response=await fetch(request); if(response.ok)await cache.put(request,response.clone()); return response; })()); return;
  }
  if (!privatePath(url.pathname) || url.searchParams.has('_rsc')) return;
  event.respondWith((async () => {
    await identityQueue;
    let response;
    try { response=await fetch(request,{redirect:'manual'}); }
    catch {
      const id = await account();
      const hit = id ? await saved(await caches.open(`${VERSION}-private-${encodeURIComponent(id)}`), request) : null;
      if (hit) {
        await notifySaved(hit);
        if(request.mode==='navigate') {
          const html=(await hit.text()).replace('</head>',`<meta name="photon-offline-saved-at" content="${Number(hit.headers.get('x-photon-saved-at'))}"></head>`);
          return new Response(html,{headers:hit.headers});
        }
        return hit;
      }
      if (request.mode === 'navigate') return (await (await caches.open(ASSETS)).match('/offline.html')) || Response.error();
      return Response.json({error:'This report has no saved offline copy.'},{status:503});
    }
    // Serve the page now and save the offline copy in the background.
    if (response.ok && !response.redirected && response.type !== 'opaqueredirect') { event.waitUntil(privateResponse(request, response.clone()).catch(() => {})); return response; }
    return privateResponse(request,response);
  })());
});
self.addEventListener('push', event => event.waitUntil((async () => {
  let payload; try {payload=event.data?.json();} catch {return;}
  if (!payload || payload.accountId !== await account()) return;
  await self.registration.showNotification(payload.title || 'Photon', {body:payload.body,icon:'/icons/photon-192.png',badge:'/icons/photon-192.png',tag:payload.eventId,data:{url:payload.url}});
})()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => { const url=new URL(event.notification.data?.url || '/', self.location.origin); if(url.origin!==self.location.origin || !pages.has(url.pathname))return; const windows=await self.clients.matchAll({type:'window'}); const existing=windows[0]; if(existing){await existing.navigate(url.href);await existing.focus();}else await self.clients.openWindow(url.href); })());
});
