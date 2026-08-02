/* =============================================================================
   Service Worker：讓網站可離線使用，並讓瀏覽器願意提供「安裝」選項。
   策略：
     - 頁面（HTML）採 network-first：有網路時一定拿到最新版，沒網路才用快取。
     - 靜態資源（CSS/JS/圖片/字型）採 stale-while-revalidate：
       先回快取（快），同時在背景更新，下次就是新的。
   改版時只要把 VERSION 加一，舊快取會自動清掉。
   ============================================================================= */
"use strict";

const VERSION = "v2";
const CACHE = `elinotebook-${VERSION}`;

/* 核心資源：離線時要能完整開啟三個頁面 */
const CORE = [
  "./",
  "./index.html",
  "./financial-tools.html",
  "./underwriting-tools.html",
  "./404.html",
  "./style/financial-tools.css",
  "./style/underwriting-tools.css",
  "./style/underwriting-noscript.css",
  "./javascript/theme.js",
  "./javascript/analytics.js",
  "./javascript/financial-tools.js",
  "./javascript/underwriting-core.js",
  "./javascript/underwriting-tools.js",
  "./site.webmanifest",
  "./financial-tools-manifest.json",
  "./underwriting-tools-manifest.json",
  "./images/icons/icon-192.png",
  "./images/icons/icon-512.png",
  "./images/icons/icon-512-maskable.png",
  "./images/icons/apple-touch-icon.png",
  "./images/profile/eli-portrait-362.webp",
  "./images/profile/eli-portrait-543.webp",
  "./images/profile/eli-portrait-724.webp",
  "./images/profile/eli-portrait-543.jpg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      /* 個別加入，單一檔案失敗不會讓整個安裝失敗 */
      .then(cache => Promise.all(
        CORE.map(url => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isHtml(request){
  return request.mode === "navigate" ||
         (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   /* 只處理同網域 */

  /* 頁面：優先用網路，離線才回快取 */
  if (isHtml(request)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(hit => hit || caches.match("./financial-tools.html"))
            .then(hit => hit || caches.match("./index.html"))
            .then(hit => hit || new Response(
              "<!doctype html><meta charset=utf-8><title>離線</title>" +
              "<p style=\"font-family:sans-serif;padding:2rem\">目前沒有網路，且這個頁面尚未被快取。</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            ))
        )
    );
    return;
  }

  /* 靜態資源：先給快取，背景更新 */
  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

/* 讓頁面可以要求立即套用新版本 */
self.addEventListener("message", event => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
