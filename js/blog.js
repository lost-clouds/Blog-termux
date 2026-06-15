import { Utils } from './utils.js';
import { MarkdownRenderer } from './md-viewer.js';
import { API } from './constants.js';

/* ============================================================
   blog.js —— 博客模块（Hugo Book 风格三栏布局）
   ────────────────────────────────────────────────────────────
   生命周期：
     [init]  缓存 DOM → 绑定事件
     [load]  fetchArticles() → 获取文章列表 → 渲染侧边栏 → 自动加载第一篇
     [render] 渲染左侧文章列表（搜索）
     [select] 点击文章 → 中间内联渲染正文 + 右侧生成 ToC
   ────────────────────────────────────────────────────────────
   依赖：Utils (escapeHtml/formatSize/parseAutoindex),
        MarkdownRenderer (render/buildToc/bindTocLinks)
   使用：import { Blog } from './blog.js'
   ============================================================ */

'use strict';


    let _articles = [];
    let _filterType = 'all';
    let _currentFile = null;
    let _abortController = null;
    let _debounceTimer = null;
    let _fetching = false;
    let _loaded = false;
    let _requestId = 0;
    let _eventsBound = false;

    /* ---- DOM 引用 ---- */
    let $blogSidebar, $blogNav, $blogContent, $blogToc, $blogSearch, $blogFilter;
    let $blogMenuCtrl, $blogTocCtrl, $blogTitle;

    const MD_EXTS = /\.(md|markdown)$/i;
    const HTML_EXTS = /\.(html?|htm)$/i;

    /* ---- 优先 fetch index.json，404 时降级为解析 autoindex（委托 Utils.fetchIndexOrAutoindex）---- */
    async function fetchIndexOrAutoindex(indexUrl, autoindexUrl, type) {
        let ext = type === 'markdown' ? MD_EXTS : HTML_EXTS;
        return Utils.fetchIndexOrAutoindex(indexUrl, autoindexUrl, ext, function(item) {
            item.type = type;
        });
    }

    /* ============================================================
       获取文章列表（index.json 优先，autoindex 降级）
       ============================================================ */
    async function fetchArticles() {
        if (_fetching || _loaded) return;
        if (!$blogNav) return;
        _fetching = true;
        $blogNav.innerHTML = '<div class="blog-nav-loading">加载中...</div>';

        try {
            let results = await Promise.all([
                fetchIndexOrAutoindex(API.MARKDOWN_INDEX, API.MARKDOWN_LIST, 'markdown'),
                fetchIndexOrAutoindex(API.HTML_INDEX, API.HTML_LIST, 'html')
            ]);

            _articles = results[0].concat(results[1]).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
            _loaded = true;

            renderSidebar();

            let firstMd = _articles.find(function(a) { return a.type === 'markdown'; });
            if (firstMd) selectArticle(firstMd.name, firstMd.type);

        } catch (err) {
            console.error('Blog: 加载失败', err);
            if ($blogNav) $blogNav.innerHTML = '<div class="blog-nav-loading">加载失败</div>';
        } finally {
            _fetching = false;
        }
    }

    /* ============================================================
       渲染左侧文章列表
       ============================================================ */
    function renderSidebar() {
        if (!$blogSidebar) return;

        let query = $blogSearch ? $blogSearch.value.trim().toLowerCase() : '';

        let filtered = _articles.filter(function(a) {
            if (_filterType !== 'all' && a.type !== _filterType) return false;
            if (query && !a.name.toLowerCase().includes(query)) return false;
            return true;
        });

        let mdArticles = filtered.filter(function(a) { return a.type === 'markdown'; });
        let htmlArticles = filtered.filter(function(a) { return a.type === 'html'; });

        let html = '';

        html += '<div class="blog-nav-section">';
        html += '<span class="blog-nav-section-title">📘 Markdown <span class="blog-nav-count">' + mdArticles.length + '</span></span>';
        if (mdArticles.length === 0) {
            html += '<div class="blog-nav-empty">无匹配</div>';
        } else {
            html += '<ul class="blog-nav-list">';
            mdArticles.forEach(function(a) {
                let active = _currentFile === a.name ? ' active' : '';
                html += '<li><a href="#" class="blog-nav-link' + active + '" data-file="' +
                    Utils.escapeHtml(a.name) + '" data-type="markdown">' +
                    Utils.escapeHtml(a.name) + '</a></li>';
            });
            html += '</ul>';
        }
        html += '</div>';

        html += '<div class="blog-nav-section">';
        html += '<span class="blog-nav-section-title">📄 HTML <span class="blog-nav-count">' + htmlArticles.length + '</span></span>';
        if (htmlArticles.length === 0) {
            html += '<div class="blog-nav-empty">无匹配</div>';
        } else {
            html += '<ul class="blog-nav-list">';
            htmlArticles.forEach(function(a) {
                let activeH = _currentFile === a.name ? ' active' : '';
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
        // HTML 文件 → 新标签页打开
        if (type === 'html') {
            _currentFile = filename;
            renderSidebar();
            window.open('/Html/' + encodeURIComponent(filename), '_blank');
            if ($blogContent) {
                $blogContent.innerHTML = '<div class="blog-content-placeholder">' +
                    '<div class="blog-content-placeholder-icon">📄</div>' +
                    '<div>HTML 文件已在新标签页打开</div>' +
                    '<div class="blog-content-placeholder-hint">' + Utils.escapeHtml(filename) + '</div>' +
                    '</div>';
            }
            if ($blogToc) $blogToc.innerHTML = '';
            if ($blogTitle) $blogTitle.textContent = filename;
            return;
        }

        // 取消前一个未完成的请求
        if (_abortController) _abortController.abort();
        let requestId = ++_requestId;
        let controller = new AbortController();
        _abortController = controller;
        let signal = controller.signal;

        if (!$blogContent || !$blogToc) return;

        // 更新标题
        if ($blogTitle) $blogTitle.textContent = filename;

        // 显示加载状态
        $blogContent.innerHTML = '<div class="blog-content-placeholder">加载中...</div>';
        $blogToc.innerHTML = '';

        try {
            let resp = await fetch(API.MARKDOWN_FILE + encodeURIComponent(filename), { signal: signal });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            let raw = await resp.text();
            if (requestId !== _requestId) return;

            // 调用共享渲染引擎
            let $article = document.createElement('div');
            $article.className = 'markdown-body';
            $blogContent.innerHTML = '';
            $blogContent.appendChild($article);

            await MarkdownRenderer.render(raw, $article);
            if (requestId !== _requestId) return;

            // 仅请求成功后才更新当前文件和侧边栏高亮
            _currentFile = filename;
            renderSidebar();

            // 生成右侧 ToC
            if ($blogToc) {
                $blogToc.innerHTML = MarkdownRenderer.buildTocFromDom($article);
                MarkdownRenderer.bindTocLinks($blogToc, $blogContent, $blogTocCtrl);
            }

            // 滚动到顶部
            $blogContent.scrollTop = 0;

        } catch (err) {
            if (err.name === 'AbortError') {
                return;
            }
            if (requestId !== _requestId) return;
            console.error('Blog: 渲染失败', err);
            $blogContent.innerHTML = '<div class="md-error">渲染失败: ' +
                Utils.escapeHtml(err.message) + '</div>';
            if ($blogToc) $blogToc.innerHTML = '';
        } finally {
            if (_abortController === controller) _abortController = null;
        }
    }

    /* ---- 侧边栏文章点击 ---- */
    function onSidebarClick(e) {
        let a = e.target.closest('.blog-nav-link');
        if (!a) return;
        e.preventDefault();
        let file = a.getAttribute('data-file');
        let type = a.getAttribute('data-type');
        if (file) selectArticle(file, type);
        // 移动端关闭侧边栏
        if ($blogMenuCtrl) $blogMenuCtrl.checked = false;
    }

    /* ---- 类型过滤 ---- */
    function onFilterClick(e) {
        let btn = e.target.closest('.blog-filter-btn');
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
        if (_eventsBound) return;
        _eventsBound = true;
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
    }

    function hasArticles() { return _articles.length > 0; }
    function isLoaded() { return _loaded; }
    const Blog = {
        init: init,
        fetchArticles: fetchArticles,
        selectArticle: selectArticle,
        hasArticles: hasArticles,
        isLoaded: isLoaded
    };

export { Blog };
