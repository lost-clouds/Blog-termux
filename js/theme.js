/* ============================================================
   theme.js —— 主题管理（被 index.html 和 md-viewer.html 共享）
   使用统一的 localStorage key: "app-theme"
   ============================================================ */

(function(global) {
    'use strict';

    const STORAGE_KEY = 'app-theme';

    /**
     * 获取存储的主题（优先 localStorage，其次系统偏好）
     */
    function getStoredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * 应用主题到当前页面
     * @param {string} theme  "dark" | "light"
     */
    function applyTheme(theme) {
        const isDark = (theme === 'dark');
        document.body.classList.toggle('dark', isDark);

        // 更新 meta theme-color
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', isDark ? '#1c1c1e' : '#f5f5f7');
        }

        // 更新主题切换按钮图标（如果存在）
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.textContent = isDark ? '☀️' : '🌙';
        }

        localStorage.setItem(STORAGE_KEY, theme);
    }

    /**
     * 切换主题
     */
    function toggleTheme() {
        const next = document.body.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(next);
        return next;
    }

    /**
     * 初始化：应用存储的主题
     */
    function initTheme() {
        applyTheme(getStoredTheme());
    }

    // 暴露 API
    global.Theme = {
        getStoredTheme: getStoredTheme,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        initTheme: initTheme
    };

})(window);
