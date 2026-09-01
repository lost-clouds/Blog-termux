/**
 * @module theme
 * @description 主题切换、localStorage 持久化
 * @requires none
 *
 * 生命周期：Theme.initTheme() → 应用存储的主题；Theme.toggleTheme() 在深色/浅色间切换
 * 使用：import { Theme } from './theme.js'
 */

'use strict';

const STORAGE_KEY = 'app-theme';

/* ---- 获取存储的主题 ---- */
/**
 * 从 localStorage 获取存储的主题，未设置时根据系统偏好返回。
 * @returns {string} "dark" | "light"
 */
function _getStoredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ---- 应用主题到页面 ---- */
/**
 * 应用主题到页面：切换 body 的 dark 类、data-theme 属性、meta theme-color、按钮图标。
 * @param {string} theme - "dark" | "light"
 * @returns {string} 应用后的主题值
 */
function _applyTheme(theme) {
    const isDark = theme === 'dark';
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
/**
 * 在深色/浅色间切换并持久化到 localStorage。
 * @returns {string} 切换后的主题值
 */
function _toggleTheme() {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    _applyTheme(next);
    return next;
}

/* ---- 初始化：应用已存储的主题 ---- */
/**
 * 初始化主题：读取已存储的主题并应用到页面。
 * @returns {void}
 */
function _initTheme() {
    _applyTheme(_getStoredTheme());
}

// 暴露 API
const Theme = {
    toggleTheme: _toggleTheme,
    initTheme: _initTheme,
};

export { Theme };
