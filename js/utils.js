/**
 * @module utils
 * @description 通用工具函数（HTML 转义、URL 校验、文件大小格式化、autoindex 解析）
 * @requires none
 *
 * 使用：import { Utils } from './utils.js'
 */

'use strict';

/* ---- HTML 特殊字符转义（防 XSS）---- */
/**
 * HTML 特殊字符转义（防 XSS）。
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的安全字符串
 */
function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ---- 配置 URL 白名单：允许 http/https/mailto 与站内相对路径 ---- */
/**
 * 校验 URL 是否在白名单内（http/https/mailto/站内相对路径）。
 * @param {string} url - 原始 URL
 * @returns {string} 安全的 URL，无效时返回空字符串
 */
function _getSafeUrl(url) {
    const raw = String(url || '').trim();
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return '';

    if (/^(https?:|mailto:)/i.test(raw)) {
        try {
            const parsed = new URL(raw, window.location.origin);
            return /^(https?:|mailto:)$/i.test(parsed.protocol) ? raw : '';
        } catch (e) {
            return '';
        }
    }

    if (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(raw)) return raw;
    return '';
}

/* ---- 格式化文件大小为可读字符串 ---- */
/**
 * 将字节数格式化为可读字符串（B/KB/MB/GB/TB）。
 * @param {number|string} bytes - 文件大小（字节）
 * @returns {string} 格式化后的字符串，如 "1.5 MB"
 */
function _formatSize(bytes) {
    if (bytes === null || bytes === undefined || bytes === '' || bytes === '?') return '?';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0,
        val = parseFloat(bytes);
    if (isNaN(val)) return String(bytes);
    while (val >= 1024 && i < units.length - 1) {
        val /= 1024;
        i++;
    }
    return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

/* ---- 解析 nginx autoindex HTML 目录列表 ---- */
/**
 * 解析 nginx autoindex HTML 目录列表。
 * @param {Response} resp - fetch 响应对象
 * @param {RegExp} extPattern - 文件扩展名匹配模式
 * @returns {Promise<Array<{name:string, size:string, modified:string}>>}
 */ async function _parseAutoindex(resp, extPattern) {
    const text = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const links = doc.querySelectorAll('a');
    const results = [];

    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const href = link.getAttribute('href');
        if (!href || href === '../' || href === '/') continue;

        let name;
        try {
            name = decodeURIComponent(href);
        } catch (e) {
            name = href;
        }
        if (!extPattern.test(name)) continue;

        let size = '?',
            modified = '?';
        const parent = link.parentElement;
        if (parent) {
            const txt = parent.textContent || '';
            const dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
            if (dm) modified = dm[1];
            const sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
            if (sm) size = sm[1] + ' ' + sm[2];
        }

        results.push({ name: name, size: size, modified: modified });
    }

    return results;
}

/* ---- index.json 优先，autoindex 降级的通用加载器 ---- */
/**
 * 通用加载器：优先 fetch index.json，404 时降级为 autoindex 解析。
 * @param {string} indexUrl - /index.json 路径
 * @param {string} autoindexUrl - 目录列表路径
 * @param {RegExp} extPattern - 文件扩展名匹配模式
 * @param {Function} [itemMapper] - 可选的数据项转换函数
 * @returns {Promise<Array>}
 */ async function fetchIndexOrAutoindex(indexUrl, autoindexUrl, extPattern, itemMapper) {
    try {
        const resp = await fetch(indexUrl);
        if (resp.ok) {
            const json = await resp.json();
            return json.map(function (item) {
                if (typeof item.size === 'number') item.size = _formatSize(item.size);
                if (itemMapper) itemMapper(item);
                return item;
            });
        }
    } catch (e) {
        /* index.json 不存在，降级 */
    }

    const resp = await fetch(autoindexUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return _parseAutoindex(resp, extPattern);
}

const Utils = {
    escapeHtml: _escapeHtml,
    getSafeUrl: _getSafeUrl,
    // 注：_formatSize/_parseAutoindex 仅在模块内被 fetchIndexOrAutoindex 使用，
    // 对外无引用，故不再导出（死代码清理）。
    fetchIndexOrAutoindex: fetchIndexOrAutoindex,
};

export { Utils };
