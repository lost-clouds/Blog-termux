/* ============================================================
   md-viewer.js —— Markdown 预览页业务逻辑
   依赖：theme.js, utils.js, lightbox.js, marked.min.js
   ============================================================ */

(function() {
    'use strict';

    // ============ 主题 ============
    Theme.initTheme();
    document.getElementById('themeToggleBtn').addEventListener('click', function() {
        Theme.toggleTheme();
    });

    // ============ 阅读进度 ============
    function updateReadingProgress() {
        const winScroll = document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
        document.getElementById('readingProgress').style.width = scrolled + '%';
    }
    window.addEventListener('scroll', updateReadingProgress);

    // ============ TOC 侧边栏 ============
    let tocVisible = false;

    window.toggleToc = function() {
        const sidebar = document.getElementById('tocSidebar');
        const overlay = document.getElementById('tocOverlay');
        const mainContent = document.getElementById('mainContent');
        tocVisible = !tocVisible;

        if (window.innerWidth > 768) {
            sidebar.classList.toggle('open', tocVisible);
            mainContent.classList.toggle('shifted', tocVisible);
        } else {
            sidebar.classList.toggle('open', tocVisible);
            overlay.classList.toggle('active', tocVisible);
        }
    };

    window.closeToc = function() {
        const sidebar = document.getElementById('tocSidebar');
        const overlay = document.getElementById('tocOverlay');
        const mainContent = document.getElementById('mainContent');
        tocVisible = false;
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        mainContent.classList.remove('shifted');
    };

    // 移动端滑动手势关闭 TOC
    let touchStartX = 0;
    document.addEventListener('touchstart', function(e) {
        touchStartX = e.touches[0].clientX;
    });
    document.addEventListener('touchend', function(e) {
        const touchEndX = e.changedTouches[0].clientX;
        if (tocVisible && touchEndX - touchStartX > 50 && touchStartX < 50) {
            window.closeToc();
        }
    });

    // ============ 生成 TOC ============
    function generateToc(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headings.length === 0) {
            return '<div style="text-align:center;color:var(--text-secondary);padding:1rem;">📭 无标题</div>';
        }
        let tocHtml = '<ul>';
        headings.forEach(function(heading) {
            const level = parseInt(heading.tagName[1]);
            let text = heading.textContent;
            if (text.length > 40) text = text.slice(0, 37) + '...';
            if (!heading.id) {
                heading.id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '')
                    + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
            }
            tocHtml += '<li><a href="#' + heading.id + '" class="level-' + level + '" onclick="closeToc()">'
                + Utils.escapeHtml(text) + '</a></li>';
        });
        tocHtml += '</ul>';
        return tocHtml;
    }

    function addHeadingAnchors() {
        const headings = document.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
        headings.forEach(function(heading) {
            if (!heading.id) {
                const text = heading.textContent;
                heading.id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
            }
            if (!heading.querySelector('.anchor')) {
                const anchor = document.createElement('a');
                anchor.href = '#' + heading.id;
                anchor.className = 'anchor';
                anchor.setAttribute('aria-label', '复制链接');
                anchor.innerHTML = '#';
                heading.style.position = 'relative';
                heading.insertBefore(anchor, heading.firstChild);
            }
        });
    }

    // ============ 图片路径修正 ============
    function fixMdImagePaths() {
        const ct = document.getElementById('content');
        if (!ct) return;
        const imgs = ct.querySelectorAll('img');
        const IMG_RE = /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)(\?.*)?$/i;
        imgs.forEach(function(img) {
            let src = img.getAttribute('src') || '';
            if (!src) return;
            if (/^(https?:|\/\/|data:|\/api\/image\/)/i.test(src)) return;
            const filename = src.split('/').pop();
            if (!filename || !IMG_RE.test(filename)) return;
            img.src = '/api/images/' + encodeURIComponent(filename);
        });
    }

    // ============ 图片灯箱（Markdown 内图片） ============
    function bindMdImageLightbox() {
        const ct = document.getElementById('content');
        if (!ct) return;
        ct.addEventListener('click', function(e) {
            const img = e.target.closest('img');
            if (!img) return;
            const src = img.getAttribute('src');
            if (!src) return;
            openMdLightbox(src, img.alt || '');
        });
    }

    function openMdLightbox(src, alt) {
        const lb = document.getElementById('mdLightbox');
        const lbImg = document.getElementById('mdLightboxImg');
        const lbName = document.getElementById('mdLightboxName');
        if (!lb || !lbImg) return;
        lbImg.src = src;
        lbImg.alt = alt || '';
        if (lbName) lbName.textContent = alt || '';
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMdLightbox() {
        const lb = document.getElementById('mdLightbox');
        if (!lb) return;
        lb.classList.remove('active');
        document.body.style.overflow = '';
    }

    // MD灯箱事件
    document.addEventListener('click', function(e) {
        const lb = document.getElementById('mdLightbox');
        if (!lb || !lb.classList.contains('active')) return;
        if (e.target === lb || e.target.classList.contains('md-lightbox-close')) {
            closeMdLightbox();
        }
    });
    document.addEventListener('keydown', function(e) {
        const lb = document.getElementById('mdLightbox');
        if (!lb || !lb.classList.contains('active')) return;
        if (e.key === 'Escape') closeMdLightbox();
    });

    // ============ 加载并渲染 Markdown ============
    async function loadMarkdown() {
        const urlParams = new URLSearchParams(window.location.search);
        const filePath = urlParams.get('file');

        if (!filePath) {
            document.getElementById('content').innerHTML = '<div class="error">❌ 未指定文件参数</div>';
            document.getElementById('pageTitle').textContent = '错误';
            return;
        }

        try {
            // 路径已从 /plan/ 改为 /Markdown/
            const response = await fetch('/Markdown/' + filePath);
            if (!response.ok) throw new Error('HTTP ' + response.status + ' - ' + response.statusText);

            const markdown = await response.text();
            if (typeof marked === 'undefined') {
                throw new Error('Markdown 解析组件未加载');
            }
            let html = marked.parse(markdown);
            // 兼容 KaTeX：\begin{split} → \begin{aligned}
            html = html.replace(/\\begin\{split\}/g, '\\begin{aligned}')
                       .replace(/\\end\{split\}/g, '\\end{aligned}');

            document.getElementById('content').innerHTML = html;

            fixMdImagePaths();
            bindMdImageLightbox();

            document.getElementById('pageTitle').textContent = filePath;
            document.title = filePath + ' - Markdown 预览';

            // 按需加载 KaTeX
            const hasMath = /(?:\$\$|\\\[|\\\(|\\begin\{)/.test(html);
            if (hasMath) {
                try {
                    await ensureKatex();
                } catch(ke) {
                    console.warn('KaTeX 加载失败，数学公式将以原始文本显示');
                }
            }
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(document.getElementById('content'), {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\[', right: '\\]', display: true},
                        {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#f85149',
                    strict: false,
                    trust: true
                });
            }

            addHeadingAnchors();
            document.getElementById('tocNav').innerHTML = generateToc(html);

            // 处理 URL hash 锚点
            if (window.location.hash) {
                setTimeout(function() {
                    const el = document.querySelector(window.location.hash);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        } catch (error) {
            console.error(error);
            document.getElementById('content').innerHTML = '<div class="error">❌ 加载失败: ' + Utils.escapeHtml(error.message) + '</div>';
            document.getElementById('pageTitle').textContent = '加载失败';
        }
    }

    loadMarkdown();

})();
