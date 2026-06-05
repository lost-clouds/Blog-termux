/* ============================================================
   blog.js —— 博客模块（Hugo Book 风格三栏布局）
   ────────────────────────────────────────────────────────────
   生命周期：
     [init]  获取文章列表 → 渲染侧边栏 → 自动加载第一篇
     [render] 渲染左侧文章列表（搜索+类型过滤）
     [select] 点击文章 → 中间内联渲染正文 + 右侧生成 ToC
   ────────────────────────────────────────────────────────────
   依赖：Utils.escapeHtml, MdViewer.render, MdViewer.buildToc
   使用：Blog.init()
   ============================================================ */

(function(global) {
    'use strict';

    var _articles = [];
    var _filterType = 'all';
    var _currentFile = null;

    /* ---- DOM 引用 ---- */
    var $blogSidebar, $blogNav, $blogContent, $blogToc, $blogSearch, $blogFilter;
    var $blogMenuCtrl, $blogSidebarOverlay, $blogTitle;

    /* ============================================================
       解析 nginx autoindex 目录
       ============================================================ */
    async function parseDirListing(resp, type) {
        var text = await resp.text();
        var parser = new DOMParser();
        var doc = parser.parseFromString(text, 'text/html');
        var links = doc.querySelectorAll('a');
        var results = [];

        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var href = link.getAttribute('href');
            if (!href || href === '../' || href === '/') continue;

            var name;
            try { name = decodeURIComponent(href); } catch(e) { name = href; }

            var extMatch = type === 'markdown'
                ? name.match(/\.(md|markdown)$/i)
                : name.match(/\.(html?|htm)$/i);
            if (!extMatch) continue;

            var size = '?', modified = '?';
            var parent = link.parentElement;
            if (parent) {
                var txt = parent.textContent || '';
                var dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                if (dm) modified = dm[1];
                var sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                if (sm) size = sm[1] + ' ' + sm[2];
            }

            results.push({ name: name, type: type, size: size, modified: modified });
        }

        return results;
    }

    /* ============================================================
       获取文章列表
       ============================================================ */
    async function fetchArticles() {
        if (!$blogSidebar) return;
        $blogNav.innerHTML = '<div class="blog-nav-loading">加载中...</div>';

        try {
            var results = await Promise.all([
                fetch('/api/md/').then(function(r) { return parseDirListing(r, 'markdown'); }),
                fetch('/api/html/').then(function(r) { return parseDirListing(r, 'html'); })
            ]);

            _articles = results[0].concat(results[1]).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            renderSidebar();

            // 默认加载第一篇 MD 文章
            var firstMd = _articles.find(function(a) { return a.type === 'markdown'; });
            if (firstMd) selectArticle(firstMd.name, firstMd.type);

        } catch (err) {
            console.error('Blog: 加载失败', err);
            $blogNav.innerHTML = '<div class="blog-nav-loading">加载失败</div>';
        }
    }

    /* ============================================================
       渲染左侧文章列表
       ============================================================ */
    function renderSidebar() {
        if (!$blogSidebar) return;

        var query = $blogSearch ? $blogSearch.value.trim().toLowerCase() : '';

        var filtered = _articles.filter(function(a) {
            if (_filterType !== 'all' && a.type !== _filterType) return false;
            if (query && !a.name.toLowerCase().includes(query)) return false;
            return true;
        });

        // 按类型分组
        var mdArticles = filtered.filter(function(a) { return a.type === 'markdown'; });
        var htmlArticles = filtered.filter(function(a) { return a.type === 'html'; });

        var html = '';

        // Markdown 分组
        html += '<div class="blog-nav-section">';
        html += '<span class="blog-nav-section-title">📘 Markdown <span class="blog-nav-count">' + mdArticles.length + '</span></span>';
        if (mdArticles.length === 0) {
            html += '<div class="blog-nav-empty">无匹配</div>';
        } else {
            html += '<ul class="blog-nav-list">';
            mdArticles.forEach(function(a) {
                var active = _currentFile === a.name ? ' active' : '';
                html += '<li><a href="#" class="blog-nav-link' + active + '" data-file="' +
                    Utils.escapeHtml(a.name) + '" data-type="markdown">' +
                    Utils.escapeHtml(a.name) + '</a></li>';
            });
            html += '</ul>';
        }
        html += '</div>';

        // HTML 分组
        html += '<div class="blog-nav-section">';
        html += '<span class="blog-nav-section-title">📄 HTML <span class="blog-nav-count">' + htmlArticles.length + '</span></span>';
        if (htmlArticles.length === 0) {
            html += '<div class="blog-nav-empty">无匹配</div>';
        } else {
            html += '<ul class="blog-nav-list">';
            htmlArticles.forEach(function(a) {
                html += '<li><a href="#" class="blog-nav-link" data-file="' +
                    Utils.escapeHtml(a.name) + '" data-type="html">' +
                    Utils.escapeHtml(a.name) + '</a></li>';
            });
            html += '</ul>';
        }
        html += '</div>';

        $blogNav.innerHTML = html;
    }

    /* ============================================================
       选中文章 → 内联渲染
       ============================================================ */
    async function selectArticle(filename, type) {
        _currentFile = filename;

        // 更新侧边栏高亮
        renderSidebar();

        if (!$blogContent || !$blogToc) return;

        // HTML 文件 → 新窗口打开
        if (type === 'html') {
            window.open('/Html/' + encodeURIComponent(filename), '_blank');
            $blogContent.innerHTML = '<div class="blog-content-placeholder">' +
                '<div class="blog-content-placeholder-icon">📄</div>' +
                '<div>HTML 文件已在新标签页打开</div>' +
                '<div class="blog-content-placeholder-hint">' + Utils.escapeHtml(filename) + '</div>' +
                '</div>';
            $blogToc.innerHTML = '';
            return;
        }

        // 更新标题
        if ($blogTitle) $blogTitle.textContent = filename;

        // 显示加载状态
        $blogContent.innerHTML = '<div class="blog-content-placeholder">加载中...</div>';
        $blogToc.innerHTML = '';

        try {
            var resp = await fetch('/Markdown/' + encodeURIComponent(filename));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            var raw = await resp.text();

            // 调用共享渲染引擎
            if (typeof MdViewer === 'undefined' || !MdViewer.render) {
                throw new Error('MdViewer 渲染模块未加载');
            }

            var $article = document.createElement('div');
            $article.className = 'markdown-body';

            // 清空内容容器，放入 markdown-body
            $blogContent.innerHTML = '';
            $blogContent.appendChild($article);

            await MdViewer.render(raw, $article);

            // 生成右侧 ToC
            if ($blogToc) {
                $blogToc.innerHTML = MdViewer.buildToc($article.innerHTML);
                // 绑定 ToC 点击 → 滚动到对应标题
                $blogToc.querySelectorAll('a').forEach(function(a) {
                    a.addEventListener('click', function(e) {
                        e.preventDefault();
                        var id = a.getAttribute('data-toc-id');
                        if (id) {
                            var el = document.getElementById(id);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        // 移动端关闭 ToC
                        var tocCtrl = document.getElementById('blog-toc-ctrl');
                        if (tocCtrl) tocCtrl.checked = false;
                    });
                });
            }

            // 滚动到顶部
            $blogContent.scrollTop = 0;

        } catch (err) {
            console.error('Blog: 渲染失败', err);
            $blogContent.innerHTML = '<div class="md-error">渲染失败: ' +
                Utils.escapeHtml(err.message) + '</div>';
            if ($blogToc) $blogToc.innerHTML = '';
        }
    }

    /* ---- 侧边栏文章点击 ---- */
    function onSidebarClick(e) {
        var a = e.target.closest('.blog-nav-link');
        if (!a) return;
        e.preventDefault();
        var file = a.getAttribute('data-file');
        var type = a.getAttribute('data-type');
        if (file) selectArticle(file, type);
        // 移动端关闭侧边栏
        if ($blogMenuCtrl) $blogMenuCtrl.checked = false;
    }

    /* ---- 类型过滤 ---- */
    function onFilterClick(e) {
        var btn = e.target.closest('.blog-filter-btn');
        if (!btn) return;
        _filterType = btn.getAttribute('data-type') || 'all';

        if ($blogFilter) {
            $blogFilter.querySelectorAll('.blog-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        }
        btn.classList.add('active');
        renderSidebar();
    }

    /* ---- 绑定事件 ---- */
    function bindEvents() {
        if ($blogSearch) $blogSearch.addEventListener('input', renderSidebar);
        if ($blogFilter) $blogFilter.addEventListener('click', onFilterClick);
        if ($blogSidebar) $blogSidebar.addEventListener('click', onSidebarClick);
        // 移动端遮罩关闭由 <label for="blog-menu-ctrl"> 处理，无需 JS
    }

    /* ---- 初始化 ---- */
    function init() {
        $blogSidebar        = document.getElementById('blogSidebar');
        $blogNav            = document.getElementById('blogNav');
        $blogContent        = document.getElementById('blogContent');
        $blogToc            = document.getElementById('blogToc');
        $blogSearch         = document.getElementById('blogSearch2');
        $blogFilter         = document.getElementById('blogFilter');
        $blogMenuCtrl       = document.getElementById('blog-menu-ctrl');
        $blogSidebarOverlay = document.getElementById('blogSidebarOverlay');
        $blogTitle          = document.getElementById('blogTitle');

        bindEvents();
        fetchArticles();
    }

    global.Blog = { init: init, fetchArticles: fetchArticles, selectArticle: selectArticle };

})(window);
