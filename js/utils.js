/* ============================================================
   utils.js —— 工具函数（HTML 转义、Blob 下载）
   ============================================================ */

(function(global) {
    'use strict';

    /**
     * HTML 特殊字符转义
     */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * 通过 Blob 方式下载文件（解决跨域 <a download> 失效问题）
     * @param {string} url  文件 URL
     * @param {string} filename  下载文件名
     */
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
        downloadFile: downloadFile
    };

    // 同时挂载 downloadFile 到全局（供 onclick 属性调用）
    global.downloadFile = downloadFile;

})(window);
