import { Utils } from './utils.js';
import { Lightbox } from './lightbox.js';
import { sanitizeHtml } from './sanitizer.js';
import { processFootnotes } from './footnotes.js';
import { API, LIBS } from './constants.js';

/* ============================================================
   md-viewer.js —— Markdown 渲染器
   ────────────────────────────────────────────────────────────
   只负责 Markdown → 安全 HTML 的渲染、标题锚点、ToC、图片路径修正、
   KaTeX 懒加载，以及 Markdown 图片复用全局 Lightbox。
   ============================================================ */

'use strict';

let _katexReady = false;
let _katexPromise = null;
const _tocBound = new WeakSet();
const _imageBound = new WeakSet();

function extractMathBlocks(text) {
    const blocks = [];
    const protected_ = text.replace(
        /\$\$([\s\S]*?)\$\$/g,
        function(match, content) {
            content = content
                .replace(/\\begin\{split\}/g, '\\begin{aligned}')
                .replace(/\\end\{split\}/g, '\\end{aligned}')
                .replace(/\\\\/g, '\\\\\\\\');
            const idx = blocks.length;
            blocks.push('$$' + content + '$$');
            return '<span class="math-' + idx + '"></span>';
        }
    );
    return { text: protected_, blocks: blocks };
}

function restoreMathBlocks(container, blocks) {
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

function ensureKatex() {
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
                reject(new Error('KaTeX auto-render 加载失败'));
            };
            document.head.appendChild(autoRenderScript);
        };
        katexScript.onerror = function() {
            reject(new Error('KaTeX 核心库加载失败'));
        };
        document.head.appendChild(katexScript);
    });

    return _katexPromise;
}

function slugify(text) {
    let slug = String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'section';
}

function uniqueSlug(base, used) {
    let slug = base;
    let i = 2;
    while (used[slug]) {
        slug = base + '-' + i;
        i++;
    }
    used[slug] = true;
    return slug;
}

function getHeadingText(heading) {
    let clone = heading.cloneNode(true);
    clone.querySelectorAll('.anchor').forEach(function(anchor) {
        anchor.remove();
    });
    return (clone.textContent || '').trim();
}

function getImageUrl(src) {
    if (!src || /^(https?:|\/\/|data:|\/api\/)/i.test(src)) return src;

    let cleanPath = src.replace(/^\.\/|^\/?Image\//, '');
    let segments = cleanPath.split('/').filter(Boolean);
    if (!segments.length || segments.indexOf('..') !== -1) return src;

    let filename = segments[segments.length - 1];
    if (!/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)(\?.*)?$/i.test(filename)) return src;

    return API.IMAGES_LIST + segments.map(function(segment) {
        return encodeURIComponent(segment);
    }).join('/');
}

function fixImagePaths(container) {
    if (!container) return;
    container.querySelectorAll('img').forEach(function(img) {
        let src = img.getAttribute('src') || '';
        let fixed = getImageUrl(src);
        if (fixed && fixed !== src) img.setAttribute('src', fixed);
    });
}

function injectAnchors(container) {
    if (!container) return;
    let used = {};
    container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(function(heading) {
        let text = getHeadingText(heading);
        heading.id = uniqueSlug(slugify(text), used);

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

function renderKatex(container) {
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

function bindMarkdownImages(container) {
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

function buildTocFromDom(container) {
    if (!container) return '<div class="toc-empty">无标题</div>';

    let headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (!headings.length) return '<div class="toc-empty">无标题</div>';

    let html = '<ul>';
    headings.forEach(function(heading) {
        let level = parseInt(heading.tagName[1], 10);
        let text = getHeadingText(heading);
        let title = text.length > 40 ? text.slice(0, 37) + '...' : text;

        html += '<li class="toc-level-' + level + '">';
        html += '<a href="#' + heading.id + '" data-toc-id="' + heading.id + '">' +
            Utils.escapeHtml(title) + '</a></li>';
    });
    html += '</ul>';
    return html;
}

function scrollToHeading(target, scrollEl) {
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

function bindTocLinks(container, scrollEl, closeCtrlEl) {
    if (!container || _tocBound.has(container)) return;
    _tocBound.add(container);

    container.addEventListener('click', function(e) {
        let link = e.target.closest('a[data-toc-id]');
        if (!link || !container.contains(link)) return;

        e.preventDefault();
        let id = link.getAttribute('data-toc-id');
        if (id) scrollToHeading(document.getElementById(id), scrollEl);
        if (closeCtrlEl) closeCtrlEl.checked = false;
    });
}

async function render(rawMarkdown, target) {
    if (!target) throw new Error('目标元素缺失');
    if (typeof marked === 'undefined') {
        throw new Error('Markdown 解析组件 (marked) 未加载');
    }

    let processed = processFootnotes(rawMarkdown);
    const { text: protectedText, blocks: mathBlocks } = extractMathBlocks(processed);
    let html = marked.parse(protectedText);

    target.innerHTML = sanitizeHtml(html);
    fixImagePaths(target);
    injectAnchors(target);
    bindMarkdownImages(target);

    restoreMathBlocks(target, mathBlocks);

    if (mathBlocks.length > 0) {
        try {
            await ensureKatex();
        } catch (err) {
            console.warn('KaTeX 加载失败:', err.message);
        }
    }
    renderKatex(target);

    return target;
}

const MarkdownRenderer = {
    render: render,
    buildTocFromDom: buildTocFromDom,
    bindTocLinks: bindTocLinks
};

export { MarkdownRenderer };
