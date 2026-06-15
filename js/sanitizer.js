/* ============================================================
   sanitizer.js —— 白名单 HTML 清理器（零依赖 XSS 防护）
   ────────────────────────────────────────────────────────────
   用法：import { sanitizeHtml } from './sanitizer.js'
   ============================================================ */

'use strict';

    let ALLOWED_TAGS = {
        h1:1, h2:1, h3:1, h4:1, h5:1, h6:1,
        p:1, div:1, span:1, br:1, hr:1,
        strong:1, em:1, b:1, i:1, u:1, s:1, del:1, ins:1,
        code:1, pre:1, kbd:1, mark:1, sub:1, sup:1, small:1,
        a:1, img:1,
        ul:1, ol:1, li:1,
        table:1, thead:1, tbody:1, tr:1, th:1, td:1,
        blockquote:1
    };
    let ALLOWED_ATTRS = {
        a: { href:1, id:1, class:1, 'data-toc-id':1 },
        img: { src:1, alt:1, class:1 },
        p: { id:1, class:1 },
        span: { class:1 },
        div: { class:1 },
        pre: { class:1 },
        code: { class:1 },
        th: { style:1 },
        td: { style:1 }
    };
    let SAFE_HREF = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;
    let UNSAFE_SRC = /^(javascript:|data:|vbscript:)/i;

    function sanitizeHtml(html) {
        let div = document.createElement('div');
        div.innerHTML = html;
        walk(div);
        return div.innerHTML;

        function walk(node) {
            let toRemove = [];
            for (let i = 0; i < node.childNodes.length; i++) {
                let child = node.childNodes[i];
                if (child.nodeType === 1) {
                    let tag = child.tagName.toLowerCase();
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
        function sanitizeAttrs(el, tag) {
            let attrs = ALLOWED_ATTRS[tag] || {};
            let removeAttrs = [];
            for (let i = 0; i < el.attributes.length; i++) {
                let name = el.attributes[i].name;
                if (!attrs[name]) { removeAttrs.push(name); continue; }
                let val = el.getAttribute(name);
                if (name === 'href' && val && !SAFE_HREF.test(val)) {
                    el.setAttribute(name, '#');
                }
                if (name === 'src' && val && UNSAFE_SRC.test(val)) {
                    el.removeAttribute('src');
                }
                if (name === 'class' && val) {
                    let safeClass = val.split(/\s+/).filter(function(c) {
                        return /^(language-|katex|footnote|toc-|anchor|markdown-body|math)/.test(c);
                    }).join(' ');
                    if (safeClass) { el.setAttribute('class', safeClass); } else { el.removeAttribute('class'); }
                }
                if (name === 'style' && val) {
                    let safeStyle = sanitizeStyle(val);
                    if (safeStyle) { el.setAttribute('style', safeStyle); }
                    else { el.removeAttribute('style'); }
                }
            }
            for (let j = 0; j < removeAttrs.length; j++) {
                el.removeAttribute(removeAttrs[j]);
            }
        }
        function sanitizeStyle(style) {
            let safe = [];
            String(style).split(';').forEach(function(rule) {
                let parts = rule.split(':');
                if (parts.length !== 2) return;
                let prop = parts[0].trim().toLowerCase();
                let value = parts[1].trim().toLowerCase();
                if (prop === 'text-align' && /^(left|right|center|justify)$/.test(value)) {
                    safe.push('text-align: ' + value);
                }
            });
            return safe.join('; ');
        }
    }

export { sanitizeHtml };
