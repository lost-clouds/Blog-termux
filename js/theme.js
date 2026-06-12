/* ============================================================
   theme.js —— 主题管理模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] ES Module 被 app.js 静态导入
     [初始化] Theme.initTheme() → 应用存储的主题
     [运行] Theme.toggleTheme() 在深色/浅色间切换
     [持久化] 主题偏好存储在 localStorage key: "app-theme"
   ────────────────────────────────────────────────────────────
   依赖：无（DOM / localStorage / matchMedia）
   使用：import { Theme } from './theme.js'
   ============================================================ */

'use strict';

    const STORAGE_KEY = 'app-theme';

    /* ---- 获取存储的主题 ---- */
    function getStoredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /* ---- 应用主题到页面 ---- */
    function applyTheme(theme) {
        const isDark = (theme === 'dark');
        document.body.classList.toggle('dark', isDark);
        document.documentElement.setAttribute('data-theme', theme);

        // 更新 meta theme-color（影响浏览器地址栏颜色）
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', isDark ? '#1c1c1e' : '#f5f5f7');
        }

        // 更新主题切换按钮图标
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.textContent = isDark ? '☀️' : '🌙';
        }

        localStorage.setItem(STORAGE_KEY, theme);
        return theme;
    }

    /* ---- 切换主题（深色 ↔ 浅色）---- */
    function toggleTheme() {
        const next = document.body.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(next);
        return next;
    }

    /* ---- 初始化：应用已存储的主题 ---- */
    function initTheme() {
        applyTheme(getStoredTheme());
    }

    // 暴露 API
    const Theme = {
        getStoredTheme: getStoredTheme,
        applyTheme: applyTheme,
        toggleTheme: toggleTheme,
        initTheme: initTheme
    };

export { Theme };
