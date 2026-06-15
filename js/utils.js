/* ============================================================
   utils.js —— 通用工具函数模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] ES Module 被多个业务模块静态导入
   [运行] 提供 HTML 转义、URL 校验、文件大小格式化、autoindex 解析
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

    /* ---- 配置 URL 白名单：允许 http/https/mailto 与站内相对路径 ---- */
    function getSafeUrl(url) {
        let raw = String(url || '').trim();
        if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return '';

        if (/^(https?:|mailto:)/i.test(raw)) {
            try {
                let parsed = new URL(raw, window.location.origin);
                return /^(https?:|mailto:)$/i.test(parsed.protocol) ? raw : '';
            } catch(e) {
                return '';
            }
        }

        if (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(raw)) return raw;
        return '';
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
        let text = await resp.text();
        let parser = new DOMParser();
        let doc = parser.parseFromString(text, 'text/html');
        let links = doc.querySelectorAll('a');
        let results = [];

        for (let i = 0; i < links.length; i++) {
            let link = links[i];
            let href = link.getAttribute('href');
            if (!href || href === '../' || href === '/') continue;

            let name;
            try { name = decodeURIComponent(href); } catch(e) { name = href; }
            if (!extPattern.test(name)) continue;

            let size = '?', modified = '?';
            let parent = link.parentElement;
            if (parent) {
                let txt = parent.textContent || '';
                let dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                if (dm) modified = dm[1];
                let sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                if (sm) size = sm[1] + ' ' + sm[2];
            }

            results.push({ name: name, size: size, modified: modified });
        }

        return results;
    }

    /* ---- index.json 优先，autoindex 降级的通用加载器 ---- */
    async function fetchIndexOrAutoindex(indexUrl, autoindexUrl, extPattern, itemMapper) {
        try {
            let resp = await fetch(indexUrl);
            if (resp.ok) {
                let json = await resp.json();
                return json.map(function(item) {
                    if (typeof item.size === 'number') item.size = formatSize(item.size);
                    if (itemMapper) itemMapper(item);
                    return item;
                });
            }
        } catch(e) { /* index.json 不存在，降级 */ }

        let resp = await fetch(autoindexUrl);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return parseAutoindex(resp, extPattern);
    }

    const Utils = {
        escapeHtml: escapeHtml,
        getSafeUrl: getSafeUrl,
        formatSize: formatSize,
        parseAutoindex: parseAutoindex,
        fetchIndexOrAutoindex: fetchIndexOrAutoindex
    };

export { Utils };
