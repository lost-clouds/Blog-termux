/* ============================================================
   footnotes.js —— Markdown 脚注预处理器
   ────────────────────────────────────────────────────────────
   将 [^id] 引用和 [^id]: 定义转换为 HTML 上标/脚注区
   用法：import { processFootnotes } from './footnotes.js'
   ============================================================ */

'use strict';

    function slugifyFootnoteId(id) {
        let slug = String(id || '')
            .trim()
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fff]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'note';
    }

    function processFootnotes(raw) {
        let footnotes = {};
        let counter = 0;
        let usedIds = {};

        // 收集定义行 [^id]: content
        raw = raw.replace(/^\[\^([^\]]+)\]:\s*(.+?)\r?$/gm, function(m, id, content) {
            if (!footnotes[id]) {
                let base = slugifyFootnoteId(id);
                let safeId = base;
                let i = 2;
                while (usedIds[safeId]) {
                    safeId = base + '-' + i;
                    i++;
                }
                usedIds[safeId] = true;
                counter++;
                footnotes[id] = { num: counter, id: safeId, content: content.trim() };
            }
            return '';
        });

        if (counter === 0) return raw;

        // 替换引用 [^id] 为上标链接
        raw = raw.replace(/\[\^([^\]]+)\]/g, function(m, id) {
            if (footnotes[id]) {
                return '<sup><a href="#fn-' + footnotes[id].id + '" id="fnref-' + footnotes[id].id + '">[' +
                    footnotes[id].num + ']</a></sup>';
            }
            return m;
        });

        // 追加脚注区
        raw += '\n\n---\n\n';
        let ids = Object.keys(footnotes);
        ids.sort(function(a, b) { return footnotes[a].num - footnotes[b].num; });
        for (let i = 0; i < ids.length; i++) {
            let id = ids[i];
            let fn = footnotes[id];
            raw += '<p class="footnote" id="fn-' + fn.id + '"><sup>[' + fn.num +
                ']</sup> ' + fn.content +
                ' <a href="#fnref-' + fn.id + '" class="footnote-backref">↩</a></p>\n';
        }

        return raw;
    }

export { processFootnotes };
