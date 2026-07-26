import { Utils } from './utils.js';
import { MarkdownRenderer } from './md-viewer.js';
import { API } from './constants.js';

/**
 * @module blog
 * @description 博客模块：Hugo Book 风格三栏布局，文章列表 + 内联渲染 + ToC
 * @requires module:utils
 * @requires module:md-viewer
 * @requires module:constants
 *
 * 使用：import { Blog } from './blog.js'
 */


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
    async function _fetchIndexOrAutoindex(indexUrl, autoindexUrl, type) {
        let ext = type === 'markdown' ? MD_EXTS : HTML_EXTS;
        return Utils.fetchIndexOrAutoindex(indexUrl, autoindexUrl, ext, function(item) {
            item.type = type;
        });
    }

    /* ============================================================
       获取文章列表（index.json 优先，autoindex 降级）
       ============================================================ */
    /**
     * 获取文章列表（index.json 优先，autoindex 降级），合并 Markdown 和 HTML。
     * @returns {Promise<void>}
     */ async function _fetchArticles() {
        if (_fetching || _loaded) return;
        if (!$blogNav) return;
        _fetching = true;
        $blogNav.innerHTML = '<div class="blog-nav-loading">加载中...</div>';

        try {
            let results = await Promise.allSettled([
                _fetchIndexOrAutoindex(API.MARKDOWN_INDEX, API.MARKDOWN_LIST, 'markdown'),
                _fetchIndexOrAutoindex(API.HTML_INDEX, API.HTML_LIST, 'html')
            ]);

            let markdownArticles = results[0].status === 'fulfilled' ? results[0].value : [];
            let htmlArticles     = results[1].status === 'fulfilled' ? results[1].value : [];

            _articles = markdownArticles.concat(htmlArticles).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
            _loaded = true;

            _renderSidebar();

            let firstMd = _articles.find(function(a) { return a.type === 'markdown'; });
            if (firstMd) _selectArticle(firstMd.name, firstMd.type);

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
    function _renderSidebar() {
        if (!$blogSidebar) return;

        let query = $blogSearch ? $blogSearch.value.trim().toLowerCase() : '';
        let queryActive = !!query;

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
        html += _renderArticleGroup(mdArticles, 'markdown', queryActive);
        html += '</div>';

        html += '<div class="blog-nav-section">';
        html += '<span class="blog-nav-section-title">📄 HTML <span class="blog-nav-count">' + htmlArticles.length + '</span></span>';
        html += _renderArticleGroup(htmlArticles, 'html', queryActive);
        html += '</div>';

        $blogNav.innerHTML = html;
    }

    /* ---- 按顶层目录分组：散落文件 + 书(目录→子项) ---- */
    function _groupArticles(list) {
        let loose = [];
        let books = {};
        let bookOrder = [];

        list.forEach(function(a) {
            let slash = a.name.indexOf('/');
            if (slash === -1) {
                loose.push(a);
            } else {
                let dir = a.name.slice(0, slash);
                if (!books[dir]) { books[dir] = []; bookOrder.push(dir); }
                books[dir].push(a);
            }
        });

        let numeric = { numeric: true, sensitivity: 'base' };
        loose.sort(function(a, b) { return a.name.localeCompare(b.name, undefined, numeric); });
        bookOrder.sort(function(a, b) { return a.localeCompare(b, undefined, numeric); });
        bookOrder.forEach(function(dir) {
            books[dir].sort(function(a, b) {
                return a.name.slice(a.name.lastIndexOf('/') + 1)
                    .localeCompare(b.name.slice(b.name.lastIndexOf('/') + 1), undefined, numeric);
            });
        });

        return {
            loose: loose,
            books: bookOrder.map(function(d) { return { name: d, items: books[d] }; })
        };
    }

    /* ---- 渲染一组：散落文件平铺 + 目录作可折叠书 ---- */
    function _renderArticleGroup(list, type, queryActive) {
        let g = _groupArticles(list);
        if (g.loose.length === 0 && g.books.length === 0) {
            return '<div class="blog-nav-empty">无匹配</div>';
        }

        let parts = '';

        if (g.loose.length > 0) {
            parts += '<ul class="blog-nav-list">';
            g.loose.forEach(function(a) {
                let active = _currentFile === a.name ? ' active' : '';
                parts += '<li><a href="#" class="blog-nav-link' + active + '" data-file="' +
                    Utils.escapeHtml(a.name) + '" data-type="' + type + '">' +
                    Utils.escapeHtml(a.name) + '</a></li>';
            });
            parts += '</ul>';
        }

        g.books.forEach(function(book) {
            let open = queryActive || book.items.some(function(a) { return _currentFile === a.name; });
            parts += '<details class="blog-nav-book"' + (open ? ' open' : '') + '>';
            parts += '<summary class="blog-nav-book-title"><span class="blog-nav-book-icon">▸</span>' +
                Utils.escapeHtml(book.name) +
                ' <span class="blog-nav-count">' + book.items.length + '</span></summary>';
            parts += '<ul class="blog-nav-list">';
            book.items.forEach(function(a) {
                let active = _currentFile === a.name ? ' active' : '';
                let label = a.name.slice(a.name.lastIndexOf('/') + 1);
                parts += '<li><a href="#" class="blog-nav-link' + active + '" data-file="' +
                    Utils.escapeHtml(a.name) + '" data-type="' + type + '">' +
                    Utils.escapeHtml(label) + '</a></li>';
            });
            parts += '</ul>';
            parts += '</details>';
        });

        return parts;
    }

    /* ============================================================
       选中文章 → 内联渲染
       ============================================================ */
    /**
     * 选中并渲染一篇文章。HTML 在新标签页打开；Markdown 内联渲染。
     * @param {string} filename - 文件名（含子目录路径）
     * @param {string} type - "markdown" | "html"
     * @returns {Promise<void>}
     */ async function _selectArticle(filename, type) {
        // HTML 文件 → 新标签页打开
        if (type === 'html') {
            _currentFile = filename;
            _renderSidebar();
            window.open('/Html/' + filename.split('/').map(encodeURIComponent).join('/'), '_blank');
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
            let resp = await fetch(API.MARKDOWN_FILE + filename.split('/').map(encodeURIComponent).join('/'), { signal: signal });
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
            _renderSidebar();

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
    function _onSidebarClick(e) {
        let a = e.target.closest('.blog-nav-link');
        if (!a) return;
        e.preventDefault();
        let file = a.getAttribute('data-file');
        let type = a.getAttribute('data-type');
        if (file) _selectArticle(file, type);
        // 移动端关闭侧边栏
        if ($blogMenuCtrl) $blogMenuCtrl.checked = false;
    }

    /* ---- 类型过滤 ---- */
    function _onFilterClick(e) {
        let btn = e.target.closest('.blog-filter-btn');
        if (!btn) return;
        _filterType = btn.getAttribute('data-type') || 'all';

        if ($blogFilter) {
            $blogFilter.querySelectorAll('.blog-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        }
        btn.classList.add('active');
        _renderSidebar();
    }

    /* ---- 绑定事件 ---- */
    function _bindEvents() {
        if (_eventsBound) return;
        _eventsBound = true;
        if ($blogSearch) $blogSearch.addEventListener('input', function() {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(_renderSidebar, 250);
        });
        if ($blogFilter) $blogFilter.addEventListener('click', _onFilterClick);
        if ($blogSidebar) $blogSidebar.addEventListener('click', _onSidebarClick);
        // 移动端遮罩关闭由 <label for="blog-menu-ctrl"> 处理，无需 JS
    }

    /* ---- 初始化 ---- */
    /**
     * 初始化博客模块：缓存 DOM、绑定事件。
     * @returns {void}
     */
    function _init() {
        $blogSidebar        = document.getElementById('blogSidebar');
        $blogNav            = document.getElementById('blogNav');
        $blogContent        = document.getElementById('blogContent');
        $blogToc            = document.getElementById('blogToc');
        $blogSearch         = document.getElementById('blogSearch2');
        $blogFilter         = document.getElementById('blogFilter');
        $blogMenuCtrl       = document.getElementById('blog-menu-ctrl');
        $blogTocCtrl        = document.getElementById('blog-toc-ctrl');
        $blogTitle          = document.getElementById('blogTitle');

        _bindEvents();
    }

    /**
     * 检查是否已加载文章。
     * @returns {boolean}
     */
    function _hasArticles() { return _articles.length > 0; }
    const Blog = {
        init: _init,
        fetchArticles: _fetchArticles,
        hasArticles: _hasArticles
    };

export { Blog };
