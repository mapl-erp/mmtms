const CACHE = "mm-shell-v1";
const SHELL = ["/offline.html", "/icon.svg", "/manifest.webmanifest"];
const DB = "mm-driver";
const STORE = "outbox";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function enqueue(payload) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id: crypto.randomUUID(), payload, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/api/driver/proof") {
    if (event.request.headers.get("x-mm-queue") === "flush") return;
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request.clone());
          if (!response.ok) throw new Error("proof failed");
          return response;
        } catch {
          const payload = await event.request.clone().json();
          await enqueue(payload);
          return new Response(JSON.stringify({ queued: true }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        }
      })(),
    );
    return;
  }
  if (event.request.method !== "GET") return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
        }
        return new Response("offline", { status: 503 });
      }
    })(),
  );
});
