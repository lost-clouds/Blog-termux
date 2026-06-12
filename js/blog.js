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

'use strict';

    var _articles = [];
    var _filterType = 'all';
    var _currentFile = null;
    var _abortController = null;
    var _debounceTimer = null;
    var _fetching = false;

    /* ---- DOM 引用 ---- */
    var $blogSidebar, $blogNav, $blogContent, $blogToc, $blogSearch, $blogFilter;
    var $blogMenuCtrl, $blogTocCtrl, $blogTitle;

    /* ============================================================
       解析 nginx autoindex 目录（复用 utils 共享解析）
       ============================================================ */
    var MD_EXTS = /\.(md|markdown)$/i;
    var HTML_EXTS = /\.(html?|htm)$/i;

    async function parseDirListing(resp, type) {
        var ext = type === 'markdown' ? MD_EXTS : HTML_EXTS;
        var items = await Utils.parseAutoindex(resp, ext);
        for (var i = 0; i < items.length; i++) items[i].type = type;
        return items;
    }

    /* ============================================================
       获取文章列表（index.json 优先，autoindex 降级）
       ============================================================ */
    async function fetchArticles() {
        if (_fetching) return;
        if (!$blogSidebar) return;
        _fetching = true;
        $blogNav.innerHTML = '<div class="blog-nav-loading">加载中...</div>';

        try {
            var results = await Promise.all([
                fetchIndexOrAutoindex('/Markdown/index.json', '/api/md/', 'markdown'),
                fetchIndexOrAutoindex('/Html/index.json', '/api/html/', 'html')
            ]);

            _articles = results[0].concat(results[1]).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            renderSidebar();

            var firstMd = _articles.find(function(a) { return a.type === 'markdown'; });
            if (firstMd) selectArticle(firstMd.name, firstMd.type);

        } catch (err) {
            console.error('Blog: 加载失败', err);
            $blogNav.innerHTML = '<div class="blog-nav-loading">加载失败</div>';
        } finally {
            _fetching = false;
        }
    }

    /* ---- 优先 fetch index.json，404 时降级为解析 autoindex ---- */
    async function fetchIndexOrAutoindex(indexUrl, autoindexUrl, type) {
        try {
            var resp = await fetch(indexUrl);
            if (resp.ok) {
                var json = await resp.json();
                return json.map(function(item) {
                    item.type = type;
                    item.size = item.size > 0 ? Utils.formatSize(item.size) : '?';
                    return item;
                });
            }
        } catch(e) { /* index.json 不存在，降级 */ }

        var resp = await fetch(autoindexUrl);
        return parseDirListing(resp, type);
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
                var activeH = _currentFile === a.name ? ' active' : '';
                html += '<li><a href="#" class="blog-nav-link' + activeH + '" data-file="' +
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
        // 取消前一个未完成的请求
        if (_abortController) _abortController.abort();
        _abortController = new AbortController();
        var signal = _abortController.signal;

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
            var resp = await fetch('/Markdown/' + encodeURIComponent(filename), { signal: signal });
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
                MdViewer.bindTocLinks($blogToc, null, $blogTocCtrl);
            }

            // 滚动到顶部
            $blogContent.scrollTop = 0;

        } catch (err) {
            if (err.name === 'AbortError') return; // 请求被取消，静默忽略
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
        if ($blogSearch) $blogSearch.addEventListener('input', function() {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(renderSidebar, 250);
        });
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
        $blogTocCtrl        = document.getElementById('blog-toc-ctrl');
        $blogTitle          = document.getElementById('blogTitle');

        bindEvents();
        fetchArticles();
    }

    function hasArticles() { return _articles.length > 0; }
    const Blog = { init: init, fetchArticles: fetchArticles, selectArticle: selectArticle, hasArticles: hasArticles };
    window.Blog = Blog;


export { Blog };
