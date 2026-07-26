import { Utils } from './utils.js';
import { Lightbox } from './lightbox.js';
import { sanitizeHtml } from './sanitizer.js';
import { processFootnotes } from './footnotes.js';
import { prepareMermaidBlocks, ensureMermaid, renderMermaid } from './mermaid-renderer.js';
import { API, LIBS } from './constants.js';

/**
 * @module md-viewer
 * @description Markdown 渲染引擎：解析 → 安全 HTML → 锚点/ToC/KaTeX/图片灯箱
 * @requires module:utils
 * @requires module:sanitizer
 * @requires module:footnotes
 * @requires module:constants
 * @requires module:lightbox
 *
 * 使用：import { MarkdownRenderer } from './md-viewer.js'
 */


'use strict';

let _katexReady = false;
let _katexPromise = null;
const _tocBound = new WeakSet();
const _imageBound = new WeakSet();

function _extractMathBlocks(text) {
    const blocks = [];

    function processContent(content) {
        return content
            .replace(/\\begin\{split\}/g, '\\begin{aligned}')
            .replace(/\\end\{split\}/g, '\\end{aligned}')
            .replace(/\\\\/g, '\\\\\\\\');
    }

    // Phase 1: $$...$$
    let result = text.replace(/\$\$([\s\S]*?)\$\$/g, function(match, content) {
        let idx = blocks.length;
        blocks.push('$$' + processContent(content) + '$$');
        return '<span class="math-' + idx + '"></span>';
    });

    // Phase 2: \[...\]
    result = result.replace(/\\\[([\s\S]*?)\\\]/g, function(match, content) {
        let idx = blocks.length;
        blocks.push('\\[' + processContent(content) + '\\]');
        return '<span class="math-' + idx + '"></span>';
    });

    // Phase 3: \(...\)
    result = result.replace(/\\\(([\s\S]*?)\\\)/g, function(match, content) {
        let idx = blocks.length;
        blocks.push('\\(' + processContent(content) + '\\)');
        return '<span class="math-' + idx + '"></span>';
    });

    return { text: result, blocks: blocks };
}

function _restoreMathBlocks(container, blocks) {
    if (!blocks.length) return;
    container.querySelectorAll('span[class^="math-"]').forEach(function(span) {
        const m = span.className.match(/^math-(\d+)$/);
        if (m) {
            const idx = parseInt(m[1], 10);
            if (blocks[idx] !== undefined) {
                span.parentNode.replaceChild(
                    document.createTextNode(blocks[idx]),
                    span
                );
            }
        }
    });
}

function _ensureKatex() {
    if (_katexReady) return Promise.resolve();
    if (_katexPromise) return _katexPromise;
    if (typeof renderMathInElement !== 'undefined') {
        _katexReady = true;
        return Promise.resolve();
    }

    _katexPromise = new Promise(function(resolve, reject) {
        let katexScript = document.createElement('script');
        katexScript.src = LIBS.KATEX_JS;
        katexScript.onload = function() {
            let autoRenderScript = document.createElement('script');
            autoRenderScript.src = LIBS.KATEX_AUTORENDER;
            autoRenderScript.onload = function() {
                _katexReady = true;
                resolve();
            };
            autoRenderScript.onerror = function() {
                _katexPromise = null;
                reject(new Error('KaTeX auto-_render 加载失败'));
            };
            document.head.appendChild(autoRenderScript);
        };
        katexScript.onerror = function() {
            _katexPromise = null;
            reject(new Error('KaTeX 核心库加载失败'));
        };
        document.head.appendChild(katexScript);
    });

    return _katexPromise;
}

function _slugify(text) {
    let slug = String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'section';
}

function _uniqueSlug(base, used) {
    let slug = base;
    let i = 2;
    while (used[slug]) {
        slug = base + '-' + i;
        i++;
    }
    used[slug] = true;
    return slug;
}

function _getHeadingText(heading) {
    let clone = heading.cloneNode(true);
    clone.querySelectorAll('.anchor').forEach(function(anchor) {
        anchor.remove();
    });
    return (clone.textContent || '').trim();
}

function _getImageUrl(src) {
    if (!src || /^(https?:|\/\/|data:|\/api\/)/i.test(src)) return src;

    let cleanPath = src.replace(/^\.\/|^\/?Image\//i, '');
    let segments = cleanPath.split('/').filter(Boolean);
    if (!segments.length || segments.indexOf('..') !== -1) return src;

    let filename = segments[segments.length - 1];
    if (!/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)(\?.*)?$/i.test(filename)) return src;

    return API.IMAGES_LIST + segments.map(function(segment) {
        return encodeURIComponent(segment);
    }).join('/');
}

function _fixImagePaths(container) {
    if (!container) return;
    container.querySelectorAll('img').forEach(function(img) {
        let src = img.getAttribute('src') || '';
        let fixed = _getImageUrl(src);
        if (fixed && fixed !== src) img.setAttribute('src', fixed);
    });
}

function _injectAnchors(container) {
    if (!container) return;
    let used = {};
    container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function(heading) {
        let text = _getHeadingText(heading);
        heading.id = _uniqueSlug(_slugify(text), used);

        if (!heading.querySelector('.anchor')) {
            let anchor = document.createElement('a');
            anchor.href = '#' + heading.id;
            anchor.className = 'anchor';
            anchor.setAttribute('aria-label', '链接到 ' + text);
            anchor.textContent = '#';
            heading.style.position = 'relative';
            heading.insertBefore(anchor, heading.firstChild);
        }
    });
}

function _renderKatex(container) {
    if (typeof renderMathInElement !== 'function') return;

    renderMathInElement(container, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,
        strict: false,
        trust: false
    });
}

function _bindMarkdownImages(container) {
    if (!container || _imageBound.has(container)) return;
    _imageBound.add(container);

    container.addEventListener('click', function(e) {
        let img = e.target.closest('img');
        if (!img || !container.contains(img)) return;

        let src = img.getAttribute('src');
        if (!src) return;
        Lightbox.open(src, img.getAttribute('alt') || '');
    });
}

/**
     * 从已渲染的 DOM 生成目录 HTML。
     * @param {HTMLElement} container - 已渲染的 Markdown 容器
     * @returns {string} 目录 HTML 字符串
     */
    function _buildTocFromDom(container) {
    if (!container) return '<div class="toc-empty">无标题</div>';

    let headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (!headings.length) return '<div class="toc-empty">无标题</div>';

    let html = '<ul>';
    headings.forEach(function(heading) {
        let level = parseInt(heading.tagName[1], 10);
        let text = _getHeadingText(heading);
        let title = text.length > 40 ? text.slice(0, 37) + '...' : text;

        html += '<li class="toc-level-' + level + '">';
        html += '<a href="#' + heading.id + '" data-toc-id="' + heading.id + '">' +
            Utils.escapeHtml(title) + '</a></li>';
    });
    html += '</ul>';
    return html;
}

function _scrollToHeading(target, scrollEl) {
    if (!target) return;

    if (scrollEl) {
        let targetBox = target.getBoundingClientRect();
        let scrollBox = scrollEl.getBoundingClientRect();
        let top = targetBox.top - scrollBox.top + scrollEl.scrollTop - 12;
        scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
     * 绑定目录点击滚动事件。
     * @param {HTMLElement} container - ToC 容器
     * @param {HTMLElement} scrollEl - 滚动容器元素
     * @param {HTMLElement} [closeCtrlEl] - 移动端关闭控制元素
     * @returns {void}
     */
    function _bindTocLinks(container, scrollEl, closeCtrlEl) {
    if (!container || _tocBound.has(container)) return;
    _tocBound.add(container);

    container.addEventListener('click', function(e) {
        let link = e.target.closest('a[data-toc-id]');
        if (!link || !container.contains(link)) return;

        e.preventDefault();
        let id = link.getAttribute('data-toc-id');
        if (id) _scrollToHeading(document.getElementById(id), scrollEl);
        if (closeCtrlEl) closeCtrlEl.checked = false;
    });
}

/**
     * 渲染 Markdown 原始文本到目标元素：解析 → sanitize → 锚点 → KaTeX → 图片绑定。
     * @param {string} rawMarkdown - Markdown 原始文本
     * @param {HTMLElement} target - 目标渲染容器
     * @returns {Promise<HTMLElement>}
     */ async function _render(rawMarkdown, target) {
    if (!target) throw new Error('目标元素缺失');
    if (typeof marked === 'undefined') {
        throw new Error('Markdown 解析组件 (marked) 未加载');
    }

    let processed = processFootnotes(rawMarkdown);
    const { text: protectedText, blocks: mathBlocks } = _extractMathBlocks(processed);
    let html = marked.parse(protectedText);

    target.innerHTML = sanitizeHtml(html);
// 将 marked 生成的 <pre><code class="language-mermaid"> 转换为
    // <div class="mermaid">，供 mermaid.run() 渲染
    // 必须在 sanitize 之后、其他 DOM 操作之前执行
    let hasMermaid = prepareMermaidBlocks(target);

    _fixImagePaths(target);
    _injectAnchors(target);
    _bindMarkdownImages(target);

    _restoreMathBlocks(target, mathBlocks);

    // Mermaid 图表渲染（懒加载，检测到图表才加载库）
    if (hasMermaid) {
        try {
            await ensureMermaid();
            await renderMermaid(target);
        } catch (err) {
            console.warn('Mermaid 渲染失败:', err.message);
        }
    }

    // KaTeX 数学公式渲染（懒加载，检测到公式才加载库）
    if (mathBlocks.length > 0) {
        try {
            await _ensureKatex();
        } catch (err) {
            console.warn('KaTeX 加载失败:', err.message);
        }
    }
    _renderKatex(target);

    return target;
}

const MarkdownRenderer = {
    render: _render,
    buildTocFromDom: _buildTocFromDom,
    bindTocLinks: _bindTocLinks
};

export { MarkdownRenderer };
