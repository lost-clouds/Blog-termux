/**
 * @module footnotes
 * @description Markdown 脚注预处理器：将 [^id] 引用和 [^id]: 定义转换为 HTML 上标/脚注区
 * @requires none
 *
 * 使用：import { processFootnotes } from './footnotes.js'
 */


'use strict';

    /**
     * 生成安全脚注锚点 ID。
     * @param id
     * @returns {string}
     */
    function _slugifyFootnoteId(id) {
        const slug = String(id || '')
            .trim()
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fff]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || 'note';
    }

    /**
     * 处理 Markdown 脚注：收集定义、替换引用、追加脚注区。
     * @param raw
     * @returns {string}
     */
    function _processFootnotes(raw) {
        const footnotes = {};
        let counter = 0;
        const usedIds = new Set();

        // 收集定义行 [^id]: content
        raw = raw.replace(/^\[\^([^\]]+)\]:\s*(.+?)\r?$/gm, function(m, id, content) {
            if (!footnotes[id]) {
                const base = _slugifyFootnoteId(id);
                let safeId = base;
                let i = 2;
                while (usedIds.has(safeId)) {
                    safeId = base + '-' + i;
                    i++;
                }
                usedIds.add(safeId);
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
        const ids = Object.keys(footnotes);
        ids.sort(function(a, b) { return footnotes[a].num - footnotes[b].num; });
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const fn = footnotes[id];
            raw += '<p class="footnote" id="fn-' + fn.id + '"><sup>[' + fn.num +
                ']</sup> ' + fn.content +
                ' <a href="#fnref-' + fn.id + '" class="footnote-backref">↩</a></p>\n';
        }

        return raw;
    }

export { _processFootnotes as processFootnotes };
