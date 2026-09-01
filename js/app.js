import { Theme } from './theme.js';
import { Lightbox } from './lightbox.js';
import { Dashboard } from './dashboard.js';
import { Navigation } from './navigation.js';
import { Blog } from './blog.js';
import { Gallery } from './gallery.js';

/**
 * @module app
 * @description 主控制器：启动流程、Tab 路由、事件绑定
 * @requires module:theme
 * @requires module:lightbox
 * @requires module:dashboard
 * @requires module:navigation
 * @requires module:blog
 * @requires module:gallery
 */

('use strict');

const TABS = ['dashboard', 'nav', 'blog', 'gallery'];
let _currentTab = 'dashboard';

let $tabBar, $sections, $bottomNav;

/**
 *
 * @param tabId
 */
function _loadTabData(tabId) {
    if (tabId === 'blog' && !Blog.hasArticles()) {
        Blog.fetchArticles();
    } else if (tabId === 'gallery' && !Gallery.hasImages()) {
        Gallery.fetchImages();
    }
}

/* ---- 标签页切换 ---- */
/**
 *
 * @param tabId
 */
function _switchTab(tabId) {
    if (tabId === _currentTab) {
        _loadTabData(tabId);
        return;
    }

    // Dashboard 按 Tab 启停：离开/进入时控制轮询
    if (_currentTab === 'dashboard') Dashboard.onTabLeave();
    if (tabId === 'dashboard') Dashboard.onTabEnter();

    if ($tabBar) {
        $tabBar.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
    }

    if ($bottomNav) {
        $bottomNav.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
    }

    if ($sections) {
        $sections.forEach(function (sec) {
            sec.classList.toggle('active', sec.id === 'sec-' + tabId);
        });
    }

    _currentTab = tabId;
    _loadTabData(tabId);
    window.location.hash = tabId;
}

/* ---- 标签栏点击 ---- */
/**
 *
 * @param e
 */
function _onTabClick(e) {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tabId = btn.getAttribute('data-tab');
    if (tabId) _switchTab(tabId);
}

/* ---- 标签栏键盘导航 ---- */
/**
 *
 * @param e
 */
function _onTabKeydown(e) {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const bar = btn.closest('.tab-bar, .bottom-nav');
    const btns = bar ? Array.from(bar.querySelectorAll('.tab-btn')) : [];
    if (!btns.length) return;

    const idx = btns.indexOf(btn);
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = btns[(idx + 1) % btns.length];
        next.focus();
        next.click();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = btns[(idx - 1 + btns.length) % btns.length];
        prev.focus();
        prev.click();
    } else if (e.key === 'Home') {
        e.preventDefault();
        btns[0].focus();
        btns[0].click();
    } else if (e.key === 'End') {
        e.preventDefault();
        btns[btns.length - 1].focus();
        btns[btns.length - 1].click();
    }
}

/* ---- 主题切换 ---- */
/**
 *
 */
function _onThemeToggle() {
    Theme.toggleTheme();
}

/* ---- 初始化 ---- */
/**
 *
 */
function _init() {
    $tabBar = document.getElementById('tabBar');
    $sections = document.querySelectorAll('.content-section');
    $bottomNav = document.getElementById('bottomNav');

    Theme.initTheme();
    Lightbox.init();

    // 先解析 hash 确定初始 tab（默认 dashboard）
    const hash = window.location.hash.replace('#', '');
    const initialTab = hash && TABS.indexOf(hash) !== -1 ? hash : 'dashboard';

    // 注册 Dashboard 可见性监听器；仅当初始 tab 是 dashboard 时启动轮询
    Dashboard.init();
    if (initialTab === 'dashboard') Dashboard.onTabEnter();

    Navigation.init();
    Blog.init();
    Gallery.init();

    if ($tabBar) {
        $tabBar.addEventListener('click', _onTabClick);
        $tabBar.addEventListener('keydown', _onTabKeydown);
    }
    if ($bottomNav) {
        $bottomNav.addEventListener('click', _onTabClick);
        $bottomNav.addEventListener('keydown', _onTabKeydown);
    }

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', _onThemeToggle);

    // 激活初始 tab 的 UI 状态（dashboard 由 HTML 默认处理）
    if (initialTab !== 'dashboard') {
        _switchTab(initialTab);
    } else {
        _loadTabData(initialTab);
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(function (err) {
            console.warn('Service Worker 注册失败:', err);
        });
    }

    window.addEventListener('hashchange', function () {
        const nextHash = window.location.hash.replace('#', '');
        if (nextHash && TABS.indexOf(nextHash) !== -1) _switchTab(nextHash);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
} else {
    _init();
}
