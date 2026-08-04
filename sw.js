// Service worker: permite abrir y seguir usando la app sin conexión, una vez
// se ha cargado al menos una vez. Los datos (catálogo, mensajes, ofertas) viven
// en localStorage del navegador, no aquí — esto solo cachea los ficheros de la app.

const CACHE_VERSION = "rc-patinete-v18";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/app.js",
  "./js/store.js",
  "./js/ai.js",
  "./js/platforms.js",
  "./js/offers.js",
  "./js/maintenance.js",
  "./js/pipeline.js",
  "./js/demand.js",
  "./js/sectorTrends.js",
  "./js/pwa.js",
  "./js/connectivity.js",
  "./js/auth.js",
  "./js/ebay.js",
  "./icons/icon-192.png?v=2",
  "./icons/icon-512.png?v=2",
  "./icons/apple-touch-icon.png?v=2",
  "./icons/favicon-32.png?v=2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all(
          APP_SHELL.map((url) =>
            fetch(url, { cache: "reload" }).then((response) => cache.put(url, response))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));
      return cached || network;
    })
  );
});
