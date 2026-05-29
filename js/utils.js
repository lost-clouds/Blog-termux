/* ============================================================
   utils.js —— 通用工具函数模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，在 window 上挂载 Utils API
     [运行] 各模块调用 Utils 方法进行 HTML 转义、文件下载等
   ────────────────────────────────────────────────────────────
   依赖：无
   使用：Utils.escapeHtml(str) / Utils.downloadFile(url, name)
   ============================================================ */

(function(global) {
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

    /* ---- 通过 Blob 下载文件（解决跨域 <a download> 失效）---- */
    async function downloadFile(url, filename) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const blob = await resp.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
        } catch (err) {
            console.error('下载失败:', err);
            alert('下载失败: ' + err.message);
        }
    }

    global.Utils = {
        escapeHtml: escapeHtml,
        formatSize: formatSize,
        downloadFile: downloadFile
    };

    // 同时挂载 downloadFile 到全局（供 onclick 属性调用）
    global.downloadFile = downloadFile;

})(window);
