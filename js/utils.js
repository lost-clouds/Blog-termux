/* ============================================================
   utils.js —— 通用工具函数模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] ES Module 被多个业务模块静态导入
     [运行] 提供 HTML 转义、文件大小格式化、autoindex 解析
   ────────────────────────────────────────────────────────────
   依赖：无
   使用：import { Utils } from './utils.js'
   ============================================================ */

'use strict';

    /* ---- HTML 特殊字符转义（防 XSS）---- */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ---- 格式化文件大小为可读字符串 ---- */
    function formatSize(bytes) {
        if (!bytes || bytes === '?') return '?';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0, val = parseFloat(bytes);
        if (isNaN(val)) return String(bytes);
        while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
        return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    /* ---- 解析 nginx autoindex HTML 目录列表 ---- */
    async function parseAutoindex(resp, extPattern) {
        var text = await resp.text();
        var parser = new DOMParser();
        var doc = parser.parseFromString(text, 'text/html');
        var links = doc.querySelectorAll('a');
        var results = [];

        for (var i = 0; i < links.length; i++) {
            var link = links[i];
            var href = link.getAttribute('href');
            if (!href || href === '../' || href === '/') continue;

            var name;
            try { name = decodeURIComponent(href); } catch(e) { name = href; }
            if (!extPattern.test(name)) continue;

            var size = '?', modified = '?';
            var parent = link.parentElement;
            if (parent) {
                var txt = parent.textContent || '';
                var dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                if (dm) modified = dm[1];
                var sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                if (sm) size = sm[1] + ' ' + sm[2];
            }

            results.push({ name: name, size: size, modified: modified });
        }

        return results;
    }

    const Utils = {
        escapeHtml: escapeHtml,
        formatSize: formatSize,
        parseAutoindex: parseAutoindex
    };

export { Utils };
