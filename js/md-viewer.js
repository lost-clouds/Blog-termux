/* ============================================================
   md-viewer.js —— Markdown 渲染引擎（全屏覆盖层 + 内联渲染）
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] IIFE 执行，挂载 MdViewer API
     [init] 绑定覆盖层关闭事件、进度条、TOC
     [render] MdViewer.render(raw, $el) → 内联渲染（blog.js 复用）
     [open]   MdViewer.open(filename)   → 全屏覆盖层模式
   ────────────────────────────────────────────────────────────
   数据源：GET /Markdown/<filename>
   依赖：marked, KaTeX(懒加载), Utils.escapeHtml, Lightbox.open
   使用：MdViewer.init() / MdViewer.render(raw, $el) / MdViewer.open(fn) / MdViewer.close()
   ============================================================ */

'use strict';

    var _currentFile = null;

    /* ---- 覆盖层 DOM 引用 ---- */
    var $overlay, $mdContent, $mdTitle, $tocSidebar, $tocOverlay, $tocNav;
    var _tocVisible = false;

    /* ============================================================
       白名单 HTML sanitizer（零依赖 XSS 防护）
       ============================================================ */
    var ALLOWED_TAGS = {
        h1:1, h2:1, h3:1, h4:1, h5:1, h6:1,
        p:1, div:1, span:1, br:1, hr:1,
        strong:1, em:1, b:1, i:1, u:1, s:1, del:1, ins:1,
        code:1, pre:1, kbd:1, mark:1, sub:1, sup:1, small:1,
        a:1, img:1,
        ul:1, ol:1, li:1,
        table:1, thead:1, tbody:1, tr:1, th:1, td:1,
        blockquote:1
    };
    var ALLOWED_ATTRS = {
        a: { href:1, id:1, class:1, 'data-toc-id':1 },
        img: { src:1, alt:1, class:1 },
        span: { class:1 },
        div: { class:1 },
        pre: { class:1 },
        code: { class:1 },
        th: { style:1 },
        td: { style:1 }
    };
    var SAFE_HREF = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;
    var UNSAFE_SRC = /^(javascript:|data:text\/html|vbscript:)/i;

    function sanitizeHtml(html) {
        var div = document.createElement('div');
        div.innerHTML = html;
        walk(div);
        return div.innerHTML;

        function walk(node) {
            var toRemove = [];
            for (var i = 0; i < node.childNodes.length; i++) {
                var child = node.childNodes[i];
                if (child.nodeType === 1) {
                    var tag = child.tagName.toLowerCase();
                    if (!ALLOWED_TAGS[tag]) {
                        toRemove.push(child);
                    } else {
                        sanitizeAttrs(child, tag);
                        walk(child);
                    }
                }
            }
            for (var j = toRemove.length - 1; j >= 0; j--) {
                toRemove[j].parentNode.removeChild(toRemove[j]);
            }
        }
        function sanitizeAttrs(el, tag) {
            var attrs = ALLOWED_ATTRS[tag] || {};
            var removeAttrs = [];
            for (var i = 0; i < el.attributes.length; i++) {
                var name = el.attributes[i].name;
                if (!attrs[name]) { removeAttrs.push(name); continue; }
                var val = el.getAttribute(name);
                if (name === 'href' && val && !SAFE_HREF.test(val)) {
                    el.setAttribute(name, '#');
                }
                // 仅拦截危险协议（javascript: 等），相对路径交给 fixImagePaths 后续重写
                if (name === 'src' && val && UNSAFE_SRC.test(val)) {
                    el.removeAttribute('src');
                }
            }
            for (var j = 0; j < removeAttrs.length; j++) {
                el.removeAttribute(removeAttrs[j]);
            }
        }
    }

    /* ============================================================
       KaTeX 懒加载
       ============================================================ */
    var _katexReady = false;
    var _katexPromise = null;

    function ensureKatex() {
        if (_katexReady) return Promise.resolve();
        if (_katexPromise) return _katexPromise;
        if (typeof renderMathInElement !== 'undefined') { _katexReady = true; return Promise.resolve(); }

        _katexPromise = new Promise(function(resolve, reject) {
            var s1 = document.createElement('script');
            s1.src = 'lib/katex.min.js';
            s1.onload = function() {
                var s2 = document.createElement('script');
                s2.src = 'lib/auto-render.min.js';
                s2.onload  = function() { _katexReady = true; resolve(); };
                s2.onerror = function() { reject(new Error('KaTeX auto-render 加载失败')); };
                document.head.appendChild(s2);
            };
            s1.onerror = function() { reject(new Error('KaTeX 核心库加载失败')); };
            document.head.appendChild(s1);
        });
        return _katexPromise;
    }

    /* ============================================================
       阅读进度条（仅覆盖层模式）
       ============================================================ */
    function updateProgress() {
        if (!$overlay || !$overlay.classList.contains('active')) return;
        var content = $overlay.querySelector('.md-content-scroll');
        if (!content) return;
        var scrollTop = content.scrollTop;
        var scrollHeight = content.scrollHeight - content.clientHeight;
        var pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        var bar = document.getElementById('mdProgressBar');
        if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    /* ============================================================
       TOC 目录生成（公用）
       ============================================================ */
    function buildToc(htmlContent) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(htmlContent, 'text/html');
        var headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');

        if (headings.length === 0) {
            return '<div class="toc-empty">无标题</div>';
        }

        var html = '<ul>';
        headings.forEach(function(h) {
            var level = parseInt(h.tagName[1]);
            var text  = h.textContent;
            if (text.length > 40) text = text.slice(0, 37) + '...';

            if (!h.id) {
                h.id = text.toLowerCase()
                    .replace(/[^\w一-鿿]+/g, '-')
                    .replace(/^-|-$/g, '');
            }
            if (!h.id) h.id = 'h-' + Date.now();

            html += '<li class="toc-level-' + level + '">';
            html += '<a href="#' + h.id + '" data-toc-id="' + h.id + '">' + Utils.escapeHtml(text) + '</a></li>';
        });
        html += '</ul>';
        return html;
    }

    /* ---- 注入标题锚点 ---- */
    function injectAnchors($container) {
        if (!$container) return;
        var headings = $container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(function(h) {
            if (!h.id) {
                var text = h.textContent;
                h.id = text.toLowerCase()
                    .replace(/[^\w一-鿿]+/g, '-')
                    .replace(/^-|-$/g, '');
            }
            if (!h.querySelector('.anchor')) {
                var a = document.createElement('a');
                a.href = '#' + h.id;
                a.className = 'anchor';
                a.setAttribute('aria-label', '链接');
                a.innerHTML = '#';
                h.style.position = 'relative';
                h.insertBefore(a, h.firstChild);
            }
        });
    }

    /* ---- 图片路径修正 ---- */
    function fixImagePaths($container) {
        if (!$container) return;
        var imgs = $container.querySelectorAll('img');
        var IMG_RE = /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)(\?.*)?$/i;
        imgs.forEach(function(img) {
            var src = img.getAttribute('src') || '';
            if (!src || /^(https?:|\/\/|data:|\/api\/)/i.test(src)) return;
            var filename = src.split('/').pop();
            if (!filename || !IMG_RE.test(filename)) return;

            // 提取相对路径：去掉可选的 Image/ 或 ./ 前缀，保留子目录结构
            var cleanPath = src.replace(/^\.\/|^Image\//, '');

            // 各段分别编码，保留 / 分隔符
            var encoded = cleanPath.split('/').map(function(s) {
                return encodeURIComponent(s);
            }).join('/');

            img.src = '/api/images/' + encoded;
        });
    }

    /* ---- KaTeX 数学渲染 ---- */
    function renderKatex($container) {
        if (typeof renderMathInElement === 'function') {
            renderMathInElement($container, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$',  right: '$',  display: false},
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false}
                ],
                throwOnError: false,
                strict: false,
                trust: false
            });
        }
    }

    /* ---- MD 图片灯箱（仅作用于 markdown-body / mdContent）---- */
    function onMdImageClick(e) {
        var img = e.target.closest('img');
        if (!img) return;
        // 仅响应 Markdown 渲染区域内的图片，避免与 gallery 灯箱冲突
        if (!img.closest('.markdown-body, #mdContent')) return;
        var src = img.getAttribute('src');
        if (!src) return;

        var lb = document.getElementById('mdLightbox');
        var lbImg = document.getElementById('mdLightboxImg');
        var lbName = document.getElementById('mdLightboxName');
        if (!lb || !lbImg) return;

        lbImg.src = src;
        lbImg.alt = img.alt || '';
        if (lbName) lbName.textContent = img.alt || '';
        lb.classList.add('active');
    }

    function closeMdLightbox() {
        var lb = document.getElementById('mdLightbox');
        if (lb) lb.classList.remove('active');
    }

    /* ============================================================
       脚注预处理：将 [^id] 引用和 [^id]: 定义转换为 HTML
       ============================================================ */
    function processFootnotes(raw) {
        var footnotes = {};
        var counter = 0;

        // 收集定义行 [^id]: content
        raw = raw.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, function(m, id, content) {
            if (!footnotes[id]) {
                counter++;
                footnotes[id] = { num: counter, content: content.trim() };
            }
            return '';
        });

        if (counter === 0) return raw;

        // 替换引用 [^id] 为上标链接
        raw = raw.replace(/\[\^([^\]]+)\]/g, function(m, id) {
            if (footnotes[id]) {
                return '<sup><a href="#fn-' + id + '" id="fnref-' + id + '">[' +
                    footnotes[id].num + ']</a></sup>';
            }
            return m;
        });

        // 追加脚注区
        raw += '\n\n---\n\n';
        var ids = Object.keys(footnotes);
        ids.sort(function(a, b) { return footnotes[a].num - footnotes[b].num; });
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var fn = footnotes[id];
            raw += '<p class="footnote" id="fn-' + id + '"><sup>[' + fn.num +
                ']</sup> ' + fn.content +
                ' <a href="#fnref-' + id + '" class="footnote-backref">↩</a></p>\n';
        }

        return raw;
    }

    /* ============================================================
       共享渲染引擎（blog.js 内联渲染 + 覆盖层共用）
       ============================================================ */
    async function render(rawMarkdown, $target) {
        if (!$target) throw new Error('目标元素缺失');

        if (typeof marked === 'undefined') {
            throw new Error('Markdown 解析组件 (marked) 未加载');
        }

        // 预处理脚注，再交给 marked 解析
        var processed = processFootnotes(rawMarkdown);
        var html = marked.parse(processed);
        // KaTeX 兼容：\begin{split} → \begin{aligned}
        html = html.replace(/\\begin\{split\}/g, '\\begin{aligned}')
                   .replace(/\\end\{split\}/g, '\\end{aligned}');

        // sanitize 后再注入 DOM，防止 XSS
        $target.innerHTML = sanitizeHtml(html);

        // 后处理
        fixImagePaths($target);
        injectAnchors($target);

        // KaTeX 按需加载
        if (/(?:\$\$|\\\[|\\\(|\\begin\{)/.test(html)) {
            try { await ensureKatex(); } catch(ke) { console.warn('KaTeX 加载失败'); }
        }
        renderKatex($target);

        return html;
    }

    /* ============================================================
       覆盖层模式：加载文件并渲染
       ============================================================ */
    async function loadMarkdown(filename) {
        if (!$mdContent || !$mdTitle) return;

        $mdTitle.textContent = filename;
        $mdContent.innerHTML = '<div class="md-loading">加载中...</div>';

        try {
            var resp = await fetch('/Markdown/' + encodeURIComponent(filename));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            var raw = await resp.text();

            // 使用共享渲染引擎
            await render(raw, $mdContent);

            $mdTitle.textContent = filename;
            document.title = filename + ' - Blog-termux';

            // 覆盖层特有的 TOC 生成
            if ($tocNav) {
                $tocNav.innerHTML = buildToc($mdContent.innerHTML);
                MdViewer.bindTocLinks($tocNav, $overlay.querySelector('.md-content-scroll'), null);
            }

            // 滚动到顶部
            var scrollEl = $overlay.querySelector('.md-content-scroll');
            if (scrollEl) scrollEl.scrollTop = 0;

            // URL hash 锚点
            if (window.location.hash) {
                setTimeout(function() {
                    try {
                        var el = document.querySelector(window.location.hash);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } catch(e) { /* hash 含 CSS 选择器特殊字符时 querySelector 会抛异常 */ }
                }, 200);
            }

        } catch (err) {
            console.error('MdViewer: 加载失败', err);
            $mdContent.innerHTML = '<div class="md-error">加载失败: ' +
                Utils.escapeHtml(err.message) + '</div>';
        }
    }

    /* ---- 关闭覆盖层 ---- */
    function closeOverlay() {
        if (!$overlay) return;
        $overlay.classList.remove('active');
        document.body.style.overflow = '';
        _currentFile = null;
        closeToc();
        closeMdLightbox();
        document.title = '控制台';

        var bar = document.getElementById('mdProgressBar');
        if (bar) bar.style.width = '0%';
    }

    /* ---- TOC 控制 ---- */
    function toggleToc() {
        _tocVisible = !_tocVisible;
        if ($tocSidebar) $tocSidebar.classList.toggle('open', _tocVisible);
        if ($tocOverlay) $tocOverlay.classList.toggle('active', _tocVisible);
    }

    function closeToc() {
        _tocVisible = false;
        if ($tocSidebar) $tocSidebar.classList.remove('open');
        if ($tocOverlay) $tocOverlay.classList.remove('active');
    }

    /* ============================================================
       初始化（覆盖层事件绑定）
       ============================================================ */
    function init() {
        $overlay    = document.getElementById('mdOverlay');
        $mdContent  = document.getElementById('mdContent');
        $mdTitle    = document.getElementById('mdTitle');
        $tocSidebar = document.getElementById('tocSidebar');
        $tocOverlay = document.getElementById('tocOverlay');
        $tocNav     = document.getElementById('tocNav');

        document.addEventListener('scroll', updateProgress, true);

        var closeBtn = document.getElementById('mdCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);

        if ($overlay) {
            $overlay.addEventListener('click', function(e) {
                if (e.target === $overlay) closeOverlay();
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && $overlay && $overlay.classList.contains('active')) {
                var lb = document.getElementById('mdLightbox');
                if (lb && lb.classList.contains('active')) {
                    closeMdLightbox();
                } else {
                    closeOverlay();
                }
            }
        });

        var tocBtn = document.getElementById('mdTocBtn');
        if (tocBtn) tocBtn.addEventListener('click', toggleToc);

        var tocCloseBtn = document.getElementById('tocCloseBtn');
        if (tocCloseBtn) tocCloseBtn.addEventListener('click', closeToc);

        if ($tocOverlay) $tocOverlay.addEventListener('click', closeToc);

        // MD 图片灯箱事件（委托）
        document.addEventListener('click', onMdImageClick);
        var lbCloseBtn = document.querySelector('.md-lightbox-close');
        if (lbCloseBtn) lbCloseBtn.addEventListener('click', closeMdLightbox);
        var mdLb = document.getElementById('mdLightbox');
        if (mdLb) mdLb.addEventListener('click', function(e) {
            if (e.target === mdLb) closeMdLightbox();
        });

        var scrollEl = $overlay ? $overlay.querySelector('.md-content-scroll') : null;
        if (scrollEl) scrollEl.addEventListener('scroll', updateProgress);
    }

    /* ---- 共享 TOC 链接点击绑定 ---- */
    function bindTocLinks($container, scrollEl, closeCtrlEl) {
        if (!$container) return;
        $container.querySelectorAll('a').forEach(function(a) {
            a.addEventListener('click', function(ev) {
                ev.preventDefault();
                var id = a.getAttribute('data-toc-id');
                if (id) {
                    var el = document.getElementById(id);
                    if (el) {
                        if (scrollEl) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start', container: scrollEl });
                        } else {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
                if (closeCtrlEl) closeCtrlEl.checked = false;
            });
        });
    }

    // 暴露 API
    const MdViewer = {
        init: init,
        render: render,
        buildToc: buildToc,
        bindTocLinks: bindTocLinks
    };
    window.MdViewer = MdViewer;


export { MdViewer };
