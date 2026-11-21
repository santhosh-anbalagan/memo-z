const shell = "memo-z-shell-@@VERSION@@";
const assets = ["/assets/@@STYLES@@", "/assets/@@SCRIPT@@"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(shell).then(cache => cache.addAll(["/", ...assets])));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("memo-z-shell-") && key !== shell).map(key => caches.delete(key)),
  )));
});

self.addEventListener("fetch", event => {
  const { origin, pathname } = new URL(event.request.url);
  if (event.request.method !== "GET" || origin !== self.location.origin) return;

  if (pathname === "/") {
    event.respondWith(fetch(event.request).catch(async () => await caches.match("/") ?? Response.error()));
  } else if (assets.includes(pathname)) {
    event.respondWith(caches.match(pathname).then(response => response ?? fetch(event.request)));
  }
});
