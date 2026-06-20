/* ============================================================
   sw.js —— Service Worker 离线缓存
   ────────────────────────────────────────────────────────────
   策略：
     /api/dashboard        → network-only（不缓存实时数据）
     /Markdown/* /api/md/* → SWR（先缓存后更新）
     /Image/* /api/images/* → SWR
     / /index.html /config.json → network-first（入口保证新鲜）
     其余静态资源            → cache-first
   ============================================================ */
const CACHE = 'blog-v3';
const SHELL = [
    '/',
    '/index.html',
    '/css/style.css?v=2',
    '/config.json',
    '/js/theme.js',
    '/js/utils.js',
    '/js/lightbox.js',
    '/js/dashboard.js',
    '/js/navigation.js',
    '/js/blog.js',
    '/js/gallery.js',
    '/js/md-viewer.js',
    '/js/sanitizer.js',
    '/js/footnotes.js',
    '/js/constants.js',
    '/js/main.js?v=3',
    '/js/app.js',
    '/lib/marked.min.js?v=2',
    '/lib/github-markdown.min.css?v=2',
    '/lib/katex.min.css?v=2',
    '/lib/katex.min.js?v=2',
    '/lib/auto-render.min.js?v=2',
    '/favicon.ico'
];

const NETWORK_FIRST = ['/', '/index.html', '/config.json'];
const SWR_PREFIX = ['/Markdown/', '/api/md/', '/Html/', '/api/html/', '/Image/', '/api/images/'];

/* ---- 安装：预缓存 App Shell（逐项容错）---- */
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE).then(function(cache) {
            return Promise.allSettled(
                SHELL.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.warn('SW: 预缓存失败 ' + url, err);
                    });
                })
            );
        })
    );
    self.skipWaiting();
});

/* ---- 激活：清理旧缓存 ---- */
self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

/* ---- 拦截请求 ---- */
self.addEventListener('fetch', function(e) {
    var url = new URL(e.request.url);

    if (e.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // /api/dashboard 不缓存
    if (url.pathname === '/api/dashboard') {
        e.respondWith(fetch(e.request));
        return;
    }

    // Markdown / Image → SWR
    if (SWR_PREFIX.some(function(p) { return url.pathname.startsWith(p); })) {
        e.respondWith(swr(e.request));
        return;
    }

    // 入口/配置/API → network-first
    if (NETWORK_FIRST.indexOf(url.pathname) !== -1 ||
        NETWORK_FIRST.some(function(p) { return p !== '/' && url.pathname.startsWith(p); })) {
        e.respondWith(networkFirst(e.request));
        return;
    }

    // 其余 → cache-first
    e.respondWith(cacheFirst(e.request));
});

/* ---- Network-First 策略 ---- */
function networkFirst(request) {
    return fetch(request).then(function(response) {
        if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE).then(function(c) { c.put(request, clone); });
        }
        return response;
    }).catch(function() {
        return caches.match(request);
    });
}

/* ---- Cache-First 策略 ---- */
function cacheFirst(request) {
    return caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
            if (response.ok) {
                var clone = response.clone();
                caches.open(CACHE).then(function(c) { c.put(request, clone); });
            }
            return response;
        });
    });
}

/* ---- Stale-While-Revalidate 策略 ---- */
function swr(request) {
    return caches.open(CACHE).then(function(cache) {
        return cache.match(request).then(function(cached) {
            var fetchPromise = fetch(request).then(function(response) {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
                return response;
            }).catch(function() {
                return cached || new Response('离线', { status: 503 });
            });
            return cached || fetchPromise;
        });
    });
}
