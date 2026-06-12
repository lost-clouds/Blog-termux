import { Theme } from './theme.js';
import { Lightbox } from './lightbox.js';
import { MdViewer } from './md-viewer.js';
import { Dashboard } from './dashboard.js';
import { Navigation } from './navigation.js';
import { Blog } from './blog.js';
import { Gallery } from './gallery.js';

/* ============================================================
   app.js —— 主控制器模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] ES Module 静态导入依赖，DOMContentLoaded 后初始化
     [初始化] 按依赖序启动 Theme → Lightbox → MdViewer →
              Dashboard → Navigation/Blog/Gallery 事件绑定 → 标签页路由
     [运行] 管理 4 个标签页切换，首次进入 Blog/Gallery 时懒加载数据
   ────────────────────────────────────────────────────────────
   依赖：Theme, Lightbox, Dashboard, Navigation, Blog, Gallery, MdViewer
   ============================================================ */

'use strict';

var TABS = ['dashboard', 'nav', 'blog', 'gallery'];
var _currentTab = 'dashboard';

var $tabBar, $sections, $bottomNav;

function loadTabData(tabId) {
    if (tabId === 'blog' && !Blog.hasArticles()) {
        Blog.fetchArticles();
    } else if (tabId === 'gallery' && !Gallery.hasImages()) {
        Gallery.fetchImages();
    }
}

/* ---- 标签页切换 ---- */
function switchTab(tabId) {
    if (tabId === _currentTab) {
        loadTabData(tabId);
        return;
    }

    // Dashboard 按 Tab 启停：离开/进入时控制轮询
    if (_currentTab === 'dashboard') Dashboard.onTabLeave();
    if (tabId === 'dashboard') Dashboard.onTabEnter();

    if ($tabBar) {
        $tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
    }

    if ($bottomNav) {
        $bottomNav.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
    }

    if ($sections) {
        $sections.forEach(function(sec) {
            sec.classList.toggle('active', sec.id === 'sec-' + tabId);
        });
    }

    _currentTab = tabId;
    loadTabData(tabId);
    window.location.hash = tabId;
}

/* ---- 标签栏点击 ---- */
function onTabClick(e) {
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    var tabId = btn.getAttribute('data-tab');
    if (tabId) switchTab(tabId);
}

/* ---- 标签栏键盘导航 ---- */
function onTabKeydown(e) {
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    var bar = btn.closest('.tab-bar, .bottom-nav');
    var btns = bar ? Array.from(bar.querySelectorAll('.tab-btn')) : [];
    if (!btns.length) return;

    var idx = btns.indexOf(btn);
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        var next = btns[(idx + 1) % btns.length];
        next.focus(); next.click();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        var prev = btns[(idx - 1 + btns.length) % btns.length];
        prev.focus(); prev.click();
    } else if (e.key === 'Home') {
        e.preventDefault();
        btns[0].focus(); btns[0].click();
    } else if (e.key === 'End') {
        e.preventDefault();
        btns[btns.length - 1].focus(); btns[btns.length - 1].click();
    }
}

/* ---- 主题切换 ---- */
function onThemeToggle() {
    Theme.toggleTheme();
}

/* ---- 响应式 ---- */
function handleResize() {
    var isMobile = window.innerWidth < 640;
    if ($bottomNav) $bottomNav.style.display = isMobile ? 'flex' : 'none';
}

/* ---- 初始化 ---- */
function init() {
    $tabBar  = document.getElementById('tabBar');
    $sections = document.querySelectorAll('.content-section');
    $bottomNav = document.getElementById('bottomNav');

    Theme.initTheme();
    Lightbox.init();
    MdViewer.init();
    Dashboard.init();

    Navigation.init();
    Blog.init();
    Gallery.init();

    if ($tabBar) {
        $tabBar.addEventListener('click', onTabClick);
        $tabBar.addEventListener('keydown', onTabKeydown);
    }
    if ($bottomNav) {
        $bottomNav.addEventListener('click', onTabClick);
        $bottomNav.addEventListener('keydown', onTabKeydown);
    }

    var themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', onThemeToggle);

    var hash = window.location.hash.replace('#', '');
    if (hash && TABS.indexOf(hash) !== -1) {
        switchTab(hash);
    } else {
        loadTabData(_currentTab);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(function(err) {
            console.warn('Service Worker 注册失败:', err);
        });
    }

    window.addEventListener('hashchange', function() {
        var nextHash = window.location.hash.replace('#', '');
        if (nextHash && TABS.indexOf(nextHash) !== -1) switchTab(nextHash);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
