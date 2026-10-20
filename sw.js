/* Les Gémo — service worker : tout est mis en cache pour fonctionner hors ligne */
const VERSION = '20261020230620';
const CACHE = 'gemo-' + VERSION;
const ASSETS = ["./","index.html","manifest.webmanifest","css/m.css","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","img/gemo-bleu-blink.png","img/gemo-bleu-happy.png","img/gemo-bleu-party.png","img/gemo-bleu-sad.png","img/gemo-bleu-sleep.png","img/gemo-bleu.png","img/gemo-gris-blink.png","img/gemo-gris-happy.png","img/gemo-gris-party.png","img/gemo-gris-sad.png","img/gemo-gris-sleep.png","img/gemo-gris.png","img/gemo-lapin-blink.png","img/gemo-lapin-happy.png","img/gemo-lapin-party.png","img/gemo-lapin-sad.png","img/gemo-lapin-sleep.png","img/gemo-lapin.png","js/importer.js","js/m.js","js/render.js","js/scheduler.js","js/store.js","js/sync.js","vendor/katex.min.css","vendor/katex.min.js","vendor/mhchem.min.js","vendor/fonts/KaTeX_AMS-Regular.woff2","vendor/fonts/KaTeX_Caligraphic-Bold.woff2","vendor/fonts/KaTeX_Caligraphic-Regular.woff2","vendor/fonts/KaTeX_Fraktur-Bold.woff2","vendor/fonts/KaTeX_Fraktur-Regular.woff2","vendor/fonts/KaTeX_Main-Bold.woff2","vendor/fonts/KaTeX_Main-BoldItalic.woff2","vendor/fonts/KaTeX_Main-Italic.woff2","vendor/fonts/KaTeX_Main-Regular.woff2","vendor/fonts/KaTeX_Math-BoldItalic.woff2","vendor/fonts/KaTeX_Math-Italic.woff2","vendor/fonts/KaTeX_SansSerif-Bold.woff2","vendor/fonts/KaTeX_SansSerif-Italic.woff2","vendor/fonts/KaTeX_SansSerif-Regular.woff2","vendor/fonts/KaTeX_Script-Regular.woff2","vendor/fonts/KaTeX_Size1-Regular.woff2","vendor/fonts/KaTeX_Size2-Regular.woff2","vendor/fonts/KaTeX_Size3-Regular.woff2","vendor/fonts/KaTeX_Size4-Regular.woff2","vendor/fonts/KaTeX_Typewriter-Regular.woff2"];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gemo-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;       // GitHub (synchro) : jamais en cache
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});