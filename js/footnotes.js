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
 * 围栏代码块与行内代码先替换为哨兵再处理，避免代码示例中形如
 * `[^1]: xxx` / `[^1]` 的行被误判为脚注定义或被替换成上标链接。
 * @param raw
 * @returns {string}
 */
function _processFootnotes(raw) {
    const footnotes = {};
    let counter = 0;
    const usedIds = new Set();
    const fenced = [];
    const SENTINEL = (i) => '㊤FN㊥' + i + '㊥FN㊤';
    // 保护围栏代码块与行内代码
    let protectedRaw = raw.replace(/```[\s\S]*?```/g, function (m) {
        const i = fenced.length;
        fenced.push(m);
        return SENTINEL(i);
    });
    protectedRaw = protectedRaw.replace(/`[^`\n]*`/g, function (m) {
        const i = fenced.length;
        fenced.push(m);
        return SENTINEL(i);
    });

    // 收集定义行 [^id]: content
    protectedRaw = protectedRaw.replace(
        /^\[\^([^\]]+)\]:\s*(.+?)\r?$/gm,
        function (m, id, content) {
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
        }
    );

    if (counter === 0) {
        // 无脚注时还原代码块原样返回
        return protectedRaw.replace(/㊤FN㊥(\d+)㊥FN㊤/g, function (m, i) {
            return fenced[parseInt(i, 10)];
        });
    }

    // 替换引用 [^id] 为上标链接
    protectedRaw = protectedRaw.replace(/\[\^([^\]]+)\]/g, function (m, id) {
        if (footnotes[id]) {
            return (
                '<sup><a href="#fn-' +
                footnotes[id].id +
                '" id="fnref-' +
                footnotes[id].id +
                '">[' +
                footnotes[id].num +
                ']</a></sup>'
            );
        }
        return m;
    });

    // 还原围栏/行内代码
    protectedRaw = protectedRaw.replace(/㊤FN㊥(\d+)㊥FN㊤/g, function (m, i) {
        return fenced[parseInt(i, 10)];
    });

    // 追加脚注区
    protectedRaw += '\n\n---\n\n';
    const ids = Object.keys(footnotes);
    ids.sort(function (a, b) {
        return footnotes[a].num - footnotes[b].num;
    });
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const fn = footnotes[id];
        protectedRaw +=
            '<p class="footnote" id="fn-' +
            fn.id +
            '"><sup>[' +
            fn.num +
            ']</sup> ' +
            fn.content +
            ' <a href="#fnref-' +
            fn.id +
            '" class="footnote-backref">↩</a></p>\n';
    }

    return protectedRaw;
}

export { _processFootnotes as processFootnotes };
