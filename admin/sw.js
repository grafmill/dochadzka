// Administrácia potrebuje vždy čerstvé dáta – nič sa neukladá, service worker je tu len kvôli inštalácii na plochu.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
