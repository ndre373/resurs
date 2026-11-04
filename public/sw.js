/* sw.js — offline shell for the «Ресурс» app.
 * Network-first for documents (fresh deploys win), cache-first for hashed
 * build assets and icons. No external requests are cached.
 * The FULL precache list (every built file, lazy chunks included) is generated
 * at build time into sw-assets.js — the app works offline from the first visit. */
const CACHE = "resurs-v24";

// generated at build time by scripts/gen-sw-assets.mjs; absent in local dev
let GENERATED = [];
try {
  importScripts("./sw-assets.js");
  GENERATED = self.SW_ASSETS ?? [];
} catch {
  GENERATED = [];
}
// scope-relative paths: the same worker works from the domain root (local
// server) and from a subpath (GitHub Pages serves the app at /resurs/)
const SHELL = [
  ...new Set([
    "./",
    "index.html",
    "manifest.webmanifest",
    "icon-192.png",
    "icon-512.png",
    ...GENERATED,
  ]),
];

self.addEventListener("install", (e) => {
  // precache the shell, then wait — the page decides when to activate
  // (it shows an «update available» toast and posts SKIP_WAITING)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
  // Settings screen asks which version is actually in control
  if (e.data === "GET_VERSION" && e.source) {
    e.source.postMessage({ type: "sw:version", version: CACHE });
  }
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // API calls (tRPC sync etc.) always go straight to the network — never
  // cached, never intercepted, so a stale sync.load is impossible by design
  if (url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    // documents: try the network, fall back to the cached shell when offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html")),
    );
    return;
  }

  // static assets (hashed) + icons: cache-first
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ??
        fetch(e.request).then((res) => {
          if (res.ok && (url.pathname.includes("/assets/") || url.pathname.endsWith(".png"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
