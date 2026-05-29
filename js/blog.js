/* ============================================================
   blog.js —— 博客文章列表模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，在 window 上挂载 Blog API
     [初始化] 外部调用 Blog.init() → 获取文章列表 + 绑定搜索/过滤
     [运行] Blog.render() → 按搜索词和类型过滤渲染文章卡片
     [交互] 点击文章卡片 → 调用 MdViewer.open(filename) 打开阅读器
   ────────────────────────────────────────────────────────────
   数据源：GET /api/md/ (nginx autoindex) → 解析 HTML 提取文件列表
   依赖：Utils.escapeHtml, MdViewer.open（由 md-viewer.js 提供）
   使用：Blog.init()
   ============================================================ */

(function(global) {
    'use strict';

    let _articles = [];
    let _filterType = 'all';    // 'all' | 'markdown' | 'html'

    /* ---- DOM 引用缓存 ---- */
    let $blogList, $blogSearch, $blogTabs;

    /* ---- 解析 nginx autoindex 页面，提取文件列表 ---- */
    async function parseDirListing(resp, type) {
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

            // 过滤：只保留对应类型的文件
            const extMatch = type === 'markdown'
                ? name.match(/\.(md|markdown)$/i)
                : name.match(/\.(html?|htm)$/i);
            if (!extMatch) continue;

            // 提取文件大小和修改时间
            let size = '?', modified = '?';
            const parent = link.parentElement;
            if (parent) {
                const txt = parent.textContent || '';
                const dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                if (dm) modified = dm[1];
                const sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                if (sm) size = sm[1] + ' ' + sm[2];
            }

            results.push({ name: name, type: type, size: size, modified: modified });
        }

        return results;
    }

    /* ---- 获取文章列表 ---- */
    async function fetchArticles() {
        if (!$blogList) return;
        $blogList.innerHTML = '<div class="blog-loading">加载中...</div>';

        try {
            const [mdResp, htmlResp] = await Promise.all([
                fetch('/api/md/'),
                fetch('/api/html/')
            ]);

            const mdArticles   = await parseDirListing(mdResp,   'markdown');
            const htmlArticles = await parseDirListing(htmlResp, 'html');

            _articles = [...mdArticles, ...htmlArticles].sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            render();
        } catch (err) {
            console.error('Blog: 加载文章列表失败', err);
            $blogList.innerHTML = '<div class="blog-loading">加载失败，请检查网络</div>';
        }
    }

    /* ---- 渲染文章列表 ---- */
    function render() {
        if (!$blogList) return;

        const query = $blogSearch ? $blogSearch.value.trim().toLowerCase() : '';

        const filtered = _articles.filter(function(a) {
            if (_filterType !== 'all' && a.type !== _filterType) return false;
            if (query && !a.name.toLowerCase().includes(query)) return false;
            return true;
        });

        if (filtered.length === 0) {
            $blogList.innerHTML = '<div class="blog-empty">' +
                (query ? '未找到匹配的文章' : '暂无文章，请将 .md 文件放入 Markdown/ 目录') +
                '</div>';
            return;
        }

        $blogList.innerHTML = filtered.map(function(a) {
            return '<div class="blog-card" data-file="' + Utils.escapeHtml(a.name) + '" data-type="' + a.type + '">' +
                '<span class="blog-card-icon">' + (a.type === 'markdown' ? '📘' : '📄') + '</span>' +
                '<span class="blog-card-info">' +
                    '<span class="blog-card-name">' + Utils.escapeHtml(a.name) + '</span>' +
                    '<span class="blog-card-meta">' +
                        Utils.escapeHtml(a.size) + ' · ' +
                        Utils.escapeHtml(a.modified) + ' · ' +
                        a.type.toUpperCase() +
                    '</span>' +
                '</span>' +
                '<span class="blog-card-arrow">→</span>' +
            '</div>';
        }).join('');
    }

    /* ---- 文章点击 → 打开 Markdown 阅读器 ---- */
    function onArticleClick(e) {
        const card = e.target.closest('.blog-card');
        if (!card) return;
        const file = card.getAttribute('data-file');
        const type = card.getAttribute('data-type');
        if (file) {
            if (typeof MdViewer !== 'undefined' && type === 'markdown') {
                MdViewer.open(file);
            } else if (type === 'html') {
                window.open('/Html/' + encodeURIComponent(file), '_blank');
            } else {
                MdViewer.open(file);
            }
        }
    }

    /* ---- 类型过滤切换 ---- */
    function onTabClick(e) {
        const btn = e.target.closest('.blog-tab');
        if (!btn) return;
        _filterType = btn.getAttribute('data-type') || 'all';

        // 更新标签页激活状态
        if ($blogTabs) {
            $blogTabs.querySelectorAll('.blog-tab').forEach(function(b) { b.classList.remove('active'); });
        }
        btn.classList.add('active');
        render();
    }

    /* ---- 绑定事件 ---- */
    function bindEvents() {
        if ($blogSearch) {
            $blogSearch.addEventListener('input', render);
        }
        if ($blogTabs) {
            $blogTabs.addEventListener('click', onTabClick);
        }
        if ($blogList) {
            $blogList.addEventListener('click', onArticleClick);
        }
    }

    /* ---- 初始化 ---- */
    function init() {
        $blogList  = document.getElementById('blogList');
        $blogSearch = document.getElementById('blogSearch');
        $blogTabs  = document.getElementById('blogTabs');

        bindEvents();
        fetchArticles();
    }

    global.Blog = { init: init, render: render, fetchArticles: fetchArticles };

})(window);
