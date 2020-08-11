/**
 * Service Worker
 * Allows to cache the app file and access it offline
 */

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open('v1').then(function (cache) {
            return cache.addAll([
                '/sw-init.js',
                '/',
                '/play',
                '/app/app.js',
                '/app/app-net.js',
                '/app/gm.js',
                '/app/gm-ui.js',
                '/app/page.js',
                '/lib/ccp.js',
                '/lib/cgraph.js',
                '/lib/mt.js',
                '/lib/p2p.js',
                '/lib/ui.js',
                '/vendor/clr.js',
                '/vendor/lz-string.js',
                '/icon.svg',
                '/icon-sm.svg',
                '/preview_1.png',
                '/preview_2.png',
                '/preview_3.png',
                '/style.css',
            ]);
        })
    );
});


// Cache strategy
// - cached then network fallback
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.open('v1').then(cache => {
            return cache.match(event.request).then(cached_response => {
                return cached_response || fetch(event.request).then(network_response => {
                    cache.put(event.request, network_response.clone());
                    return network_response;
                });
            });
        })
    );
});
