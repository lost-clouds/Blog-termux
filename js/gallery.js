/* ============================================================
   gallery.js —— 图片画廊模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，在 window 上挂载 Gallery API
     [初始化] 外部调用 Gallery.init() → 获取图片列表 + 绑定事件
     [运行] Gallery.render() → 按搜索词过滤渲染图片网格
     [交互] 点击图片卡片 → 调用 Lightbox.open() 展示灯箱
   ────────────────────────────────────────────────────────────
   数据源：GET /api/images/ (nginx autoindex) → 解析 HTML 提取图片列表
   依赖：Utils.escapeHtml, Lightbox.open
   使用：Gallery.init()
   ============================================================ */

(function(global) {
    'use strict';

    const IMG_EXTS = /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i;

    let _images = [];

    /* ---- DOM 引用缓存 ---- */
    let $galleryGrid, $gallerySearch;

    /* ---- 获取图片列表（解析 nginx autoindex）---- */
    async function fetchImages() {
        if (!$galleryGrid) return;
        $galleryGrid.innerHTML = '<div class="gallery-loading">加载中...</div>';

        try {
            const resp = await fetch('/api/images/');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const text = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const links = doc.querySelectorAll('a');

            const results = [];
            for (const link of links) {
                const href = link.getAttribute('href');
                if (!href || href === '../' || href === '/') continue;

                let name;
                try { name = decodeURIComponent(href); } catch(e) { name = href; }
                if (!IMG_EXTS.test(name)) continue;

                let size = '?', modified = '?';
                const parent = link.parentElement;
                if (parent) {
                    const txt = parent.textContent || '';
                    const dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                    if (dm) modified = dm[1];
                    const sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                    if (sm) size = sm[1] + ' ' + sm[2];
                }

                results.push({ name: name, size: size, modified: modified });
            }

            // 去重 + 排序
            const seen = new Set();
            _images = results.filter(function(f) {
                if (seen.has(f.name)) return false;
                seen.add(f.name);
                return true;
            }).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            render();
        } catch (err) {
            console.error('Gallery: 加载图片列表失败', err);
            $galleryGrid.innerHTML = '<div class="gallery-loading">加载失败，请检查配置</div>';
        }
    }

    /* ---- 渲染图片网格 ---- */
    function render() {
        if (!$galleryGrid) return;

        const query = $gallerySearch ? $gallerySearch.value.trim().toLowerCase() : '';
        const filtered = query
            ? _images.filter(function(img) { return img.name.toLowerCase().includes(query); })
            : _images;

        if (filtered.length === 0) {
            $galleryGrid.innerHTML = '<div class="gallery-empty">' +
                (query ? '未找到匹配的图片' : '暂无图片，请将图片放入 Image/ 目录') +
                '</div>';
            return;
        }

        $galleryGrid.innerHTML = filtered.map(function(img) {
            const url = '/api/images/' + encodeURIComponent(img.name);
            return '<div class="gallery-card" data-src="' + Utils.escapeHtml(url) +
                   '" data-name="' + Utils.escapeHtml(img.name) + '">' +
                '<div class="gallery-thumb">' +
                    '<img src="' + Utils.escapeHtml(url) + '" alt="' + Utils.escapeHtml(img.name) +
                    '" loading="lazy" onerror="this.style.opacity=0">' +
                '</div>' +
                '<div class="gallery-info">' +
                    '<span class="gallery-name">' + Utils.escapeHtml(img.name) + '</span>' +
                    '<span class="gallery-size">' + Utils.escapeHtml(img.size) + '</span>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    /* ---- 图片卡片点击 → 灯箱 ---- */
    function onCardClick(e) {
        const card = e.target.closest('.gallery-card');
        if (!card) return;
        const src  = card.getAttribute('data-src');
        const name = card.getAttribute('data-name');
        if (src && typeof Lightbox !== 'undefined') {
            Lightbox.open(src, name);
        }
    }

    /* ---- 绑定事件 ---- */
    function bindEvents() {
        if ($gallerySearch) {
            $gallerySearch.addEventListener('input', render);
        }
        if ($galleryGrid) {
            $galleryGrid.addEventListener('click', onCardClick);
        }
    }

    /* ---- 初始化 ---- */
    function init() {
        $galleryGrid   = document.getElementById('galleryGrid');
        $gallerySearch = document.getElementById('gallerySearch');

        bindEvents();
        fetchImages();
    }

    global.Gallery = { init: init, render: render, fetchImages: fetchImages };

})(window);
