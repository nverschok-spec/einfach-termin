// ================================================================
//  EINFACH-TERMIN — Service Worker  (PWA · Задача 27)
//  Strategie: Cache-First für statische Assets,
//             Network-First für HTML-Seiten.
// ================================================================

const SW_VERSION  = 'et-v3-20260501';
const CACHE_NAME  = 'einfach-termin-' + SW_VERSION;

// Statische Assets die immer gecacht werden
const PRECACHE_URLS = [
    './',
    './index.html',
    './admin.html',
    './style.css',
    './manifest.json',
    './js/shared.js',
    './js/index.js',
    './js/admin.js',
    // Google Fonts — offline-fallback
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Fraunces:ital,wght@0,700;0,900;1,700&display=swap'
];

// ── INSTALL ──────────────────────────────────────────────────────
// Beim ersten Laden alle kritischen Assets vorab cachen
self.addEventListener('install', event => {
    console.log('[SW] Installing version:', SW_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Pre-caching assets…');
                // Einzeln cachen damit ein Fehler nicht alles blockiert
                return Promise.allSettled(
                    PRECACHE_URLS.map(url =>
                        cache.add(url).catch(err =>
                            console.warn('[SW] Failed to cache:', url, err.message)
                        )
                    )
                );
            })
            .then(() => {
                console.log('[SW] Pre-cache complete');
                return self.skipWaiting(); // Sofort aktiv werden
            })
    );
});

// ── ACTIVATE ─────────────────────────────────────────────────────
// Alte Caches löschen wenn neue SW-Version aktiv wird
self.addEventListener('activate', event => {
    console.log('[SW] Activating version:', SW_VERSION);
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('einfach-termin-') && name !== CACHE_NAME)
                        .map(oldCache => {
                            console.log('[SW] Deleting old cache:', oldCache);
                            return caches.delete(oldCache);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Claiming clients…');
                return self.clients.claim(); // Sofort alle Tabs übernehmen
            })
    );
});

// ── FETCH ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Nur GET-Requests behandeln
    if (event.request.method !== 'GET') return;

    // Chrome-Extensions und andere Protokolle ignorieren
    if (!url.protocol.startsWith('http')) return;

    // EmailJS CDN — Network-First, Fallback Cache
    if (url.hostname.includes('emailjs') || url.hostname.includes('jsdelivr')) {
        event.respondWith(networkFirstStrategy(event.request));
        return;
    }

    // Google Fonts — Stale-While-Revalidate
    if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    // HTML-Seiten — Network-First (immer aktuellste Version versuchen)
    if (event.request.headers.get('Accept')?.includes('text/html') ||
        url.pathname.endsWith('.html') ||
        url.pathname === '/' ||
        url.pathname === '') {
        event.respondWith(networkFirstStrategy(event.request));
        return;
    }

    // JS, CSS, Bilder, Manifeste — Cache-First
    if (url.pathname.match(/\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff2?)$/)) {
        event.respondWith(cacheFirstStrategy(event.request));
        return;
    }

    // Alles andere — Network-First
    event.respondWith(networkFirstStrategy(event.request));
});

// ── STRATEGIEN ───────────────────────────────────────────────────

/**
 * Cache-First: aus Cache lesen, bei Miss Netzwerk.
 * Gut für: statische Assets (JS, CSS, Bilder)
 */
async function cacheFirstStrategy(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch(err) {
        console.warn('[SW] Cache-First network fail:', request.url);
        return offlineFallback(request);
    }
}

/**
 * Network-First: Netzwerk versuchen, bei Fehler aus Cache.
 * Gut für: HTML-Seiten, API-Calls
 */
async function networkFirstStrategy(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch(err) {
        const cached = await caches.match(request);
        if (cached) {
            console.log('[SW] Offline, serving from cache:', request.url);
            return cached;
        }
        return offlineFallback(request);
    }
}

/**
 * Stale-While-Revalidate: Cache sofort zurückgeben, im Hintergrund aktualisieren.
 * Gut für: Fonts, nicht-kritische Assets
 */
async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
    }).catch(() => null);

    return cached || (await fetchPromise) || offlineFallback(request);
}

/**
 * Offline-Fallback Seite.
 */
function offlineFallback(request) {
    // Für HTML-Seiten: gecachte index.html als Fallback
    if (request.headers.get('Accept')?.includes('text/html')) {
        return caches.match('./index.html').then(r => r || new Response(
            `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Einfach-Termin — Offline</title>
            <style>
                body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f5ff;color:#2d1b69;text-align:center;padding:24px;}
                h1{font-size:3rem;margin:0 0 8px;}
                p{color:#888;font-size:1rem;margin:0 0 24px;}
                button{background:#7c5cbf;color:#fff;border:none;border-radius:12px;padding:12px 28px;font-size:1rem;cursor:pointer;}
            </style></head>
            <body>
                <h1>📵</h1>
                <h2>Keine Verbindung</h2>
                <p>Einfach-Termin ist offline. Bitte überprüfen Sie Ihre Internetverbindung.</p>
                <button onclick="location.reload()">↻ Erneut versuchen</button>
            </body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        ));
    }

    // Für andere Assets: leere Response
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
}

// ── PUSH NOTIFICATIONS (Vorbereitung für später) ──────────────────
self.addEventListener('push', event => {
    if (!event.data) return;
    const data = event.data.json().catch(() => ({ title: 'Einfach-Termin', body: event.data.text() }));
    event.waitUntil(
        data.then(d => self.registration.showNotification(d.title || 'Einfach-Termin', {
            body:    d.body || '',
            icon:    './icons/icon-192.png',
            badge:   './icons/icon-72.png',
            vibrate: [200, 100, 200],
            data:    { url: d.url || './' }
        }))
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || './')
    );
});

console.log('[SW] Service Worker loaded:', SW_VERSION);
