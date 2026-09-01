/**
 * @module sanitizer
 * @description 白名单 HTML 清理器（零依赖 XSS 防护）
 * @requires none
 *
 * 使用：import { sanitizeHtml } from './sanitizer.js'
 */

'use strict';

const ALLOWED_TAGS = {
    h1: 1,
    h2: 1,
    h3: 1,
    h4: 1,
    h5: 1,
    h6: 1,
    p: 1,
    div: 1,
    span: 1,
    br: 1,
    hr: 1,
    strong: 1,
    em: 1,
    b: 1,
    i: 1,
    u: 1,
    s: 1,
    del: 1,
    ins: 1,
    code: 1,
    pre: 1,
    kbd: 1,
    mark: 1,
    sub: 1,
    sup: 1,
    small: 1,
    a: 1,
    img: 1,
    ul: 1,
    ol: 1,
    li: 1,
    table: 1,
    thead: 1,
    tbody: 1,
    tr: 1,
    th: 1,
    td: 1,
    blockquote: 1,
};
const ALLOWED_ATTRS = {
    a: { href: 1, id: 1, class: 1, 'data-toc-id': 1 },
    img: { src: 1, alt: 1, class: 1 },
    p: { id: 1, class: 1 },
    span: { class: 1 },
    div: { class: 1 },
    pre: { class: 1 },
    code: { class: 1 },
    th: { style: 1 },
    td: { style: 1 },
};
const SAFE_HREF = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;
const UNSAFE_SRC = /^(javascript:|data:|vbscript:)/i;

/**
 * 清理 HTML 字符串（白名单过滤）。
 * @param {string} html
 * @returns {string}
 */
function _sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    walk(div);
    return div.innerHTML;

    /**
     * 递归遍历 DOM 节点，移除白名单外的元素。
     * @param {Node} node
     */
    function walk(node) {
        const toRemove = [];
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType === 1) {
                const tag = child.tagName.toLowerCase();
                if (!ALLOWED_TAGS[tag]) {
                    toRemove.push(child);
                } else {
                    sanitizeAttrs(child, tag);
                    walk(child);
                }
            }
        }
        for (let j = toRemove.length - 1; j >= 0; j--) {
            toRemove[j].parentNode.removeChild(toRemove[j]);
        }
    }
    /**
     * 清理单个元素（移除白名单外的属性、应用样式过滤）。
     * @param {Element} el
     * @param {string} tag
     */
    function sanitizeAttrs(el, tag) {
        const attrs = ALLOWED_ATTRS[tag] || {};
        const removeAttrs = [];
        for (let i = 0; i < el.attributes.length; i++) {
            const name = el.attributes[i].name;
            if (!attrs[name]) {
                removeAttrs.push(name);
                continue;
            }
            const val = el.getAttribute(name);
            if (name === 'href' && val && !SAFE_HREF.test(val)) {
                el.setAttribute(name, '#');
            }
            if (name === 'src' && val && UNSAFE_SRC.test(val)) {
                el.removeAttribute('src');
            }
            if (name === 'class' && val) {
                const safeClass = val
                    .split(/\s+/)
                    .filter(function (c) {
                        return /^(language-|katex|footnote|toc-|anchor|markdown-body|math)/.test(c);
                    })
                    .join(' ');
                if (safeClass) {
                    el.setAttribute('class', safeClass);
                } else {
                    el.removeAttribute('class');
                }
            }
            if (name === 'style' && val) {
                const safeStyle = sanitizeStyle(val);
                if (safeStyle) {
                    el.setAttribute('style', safeStyle);
                } else {
                    el.removeAttribute('style');
                }
            }
        }
        for (let j = 0; j < removeAttrs.length; j++) {
            el.removeAttribute(removeAttrs[j]);
        }
    }
    /**
     * 过滤 CSS 样式（仅允许安全属性）。
     * @param {string} style
     * @returns {string}
     */
    function sanitizeStyle(style) {
        const safe = [];
        String(style)
            .split(';')
            .forEach(function (rule) {
                const parts = rule.split(':');
                if (parts.length !== 2) return;
                const prop = parts[0].trim().toLowerCase();
                const value = parts[1].trim().toLowerCase();
                if (prop === 'text-align' && /^(left|right|center|justify)$/.test(value)) {
                    safe.push('text-align: ' + value);
                }
            });
        return safe.join('; ');
    }
}

// _sanitizeHtml is the only export; callers use import { sanitizeHtml }
export { _sanitizeHtml as sanitizeHtml };
