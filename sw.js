/* ============================================================
   sw.js —— Service Worker 离线缓存
   ============================================================ */
const CACHE = 'blog-v2';
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
    '/js/main.js?v=3',
    '/js/app.js',
    '/lib/marked.min.js?v=2',
    '/lib/github-markdown.min.css?v=2',
    '/favicon.ico'
];

/* ---- 安装：预缓存 App Shell ---- */
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE).then(function(cache) {
            return cache.addAll(SHELL).catch(function(err) {
                console.warn('SW: 预缓存失败（部分资源可能不存在）', err);
            });
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

    // 跳过非 GET 请求和外部资源
    if (e.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // 文章和图片：Stale-While-Revalidate
    if (/^\/(Markdown|Html|Image|api)\//.test(url.pathname)) {
        e.respondWith(swr(e.request));
        return;
    }

    // App Shell / JS / CSS：Cache-First
    e.respondWith(cacheFirst(e.request));
});

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
