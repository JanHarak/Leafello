/*
 * Minimální service worker – jen aby byla appka instalovatelná jako PWA.
 * Záměrně zatím bez offline cache, ať nehrozí zaseknutí uživatelů na staré
 * verzi po nasazení. Offline podporu lze doplnit později.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // passthrough (síťové chování prohlížeče)
});
