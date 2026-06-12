/* ============================================================
   app.js —— 主控制器模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] DOMContentLoaded 后初始化所有子模块
     [初始化] 按依赖序启动 Theme → Lightbox → MdViewer →
              Dashboard → 标签页路由
     [运行] 管理 4 个标签页切换，响应窗口变化
   ────────────────────────────────────────────────────────────
   依赖：Theme, Utils, Lightbox, Dashboard, Navigation, Blog,
         Gallery, MdViewer（均由前置 <script> 保证加载）
   ============================================================ */

'use strict';

    var TABS = ['dashboard', 'nav', 'blog', 'gallery'];
    var _currentTab = 'dashboard';

    var $tabBar, $sections, $bottomNav;

    /* ---- 标签页切换 ---- */
    function switchTab(tabId) {
        if (tabId === _currentTab) return;

        // 顶部标签栏
        if ($tabBar) {
            $tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
            });
        }
        // 底部导航栏（移动端）
        if ($bottomNav) {
            $bottomNav.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
            });
        }
        // 内容区
        if ($sections) {
            $sections.forEach(function(sec) {
                sec.classList.toggle('active', sec.id === 'sec-' + tabId);
            });
        }

        _currentTab = tabId;

        // 切到博客/图库时懒加载数据（已加载则跳过，避免重复请求）
        if (tabId === 'blog' && typeof Blog !== 'undefined' && !Blog.hasArticles()) {
            Blog.fetchArticles();
        } else if (tabId === 'gallery' && typeof Gallery !== 'undefined' && !Gallery.hasImages()) {
            Gallery.fetchImages();
        }

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
        if (typeof Theme !== 'undefined') Theme.toggleTheme();
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

        // 1. 主题
        if (typeof Theme !== 'undefined') Theme.initTheme();

        // 2. 灯箱
        if (typeof Lightbox !== 'undefined') Lightbox.init();

        // 3. Markdown 阅读器（预绑定事件）
        if (typeof MdViewer !== 'undefined') MdViewer.init();

        // 4. 仪表盘（开始轮询）
        if (typeof Dashboard !== 'undefined') Dashboard.init();

        // 5. 服务导航、博客、图库（预绑定 DOM 和事件）
        if (typeof Navigation !== 'undefined') Navigation.init();
        if (typeof Blog !== 'undefined') Blog.init();
        if (typeof Gallery !== 'undefined') Gallery.init();

        // 6. 标签栏事件
        if ($tabBar) {
            $tabBar.addEventListener('click', onTabClick);
            $tabBar.addEventListener('keydown', onTabKeydown);
        }
        if ($bottomNav) {
            $bottomNav.addEventListener('click', onTabClick);
            $bottomNav.addEventListener('keydown', onTabKeydown);
        }

        // 7. 主题按钮
        var themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.addEventListener('click', onThemeToggle);

        // 8. URL hash 恢复
        var hash = window.location.hash.replace('#', '');
        if (hash && TABS.indexOf(hash) !== -1) switchTab(hash);

        // 9. 响应式
        handleResize();
        window.addEventListener('resize', handleResize);

        // 10. Service Worker 注册
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.warn('Service Worker 注册失败:', err);
            });
        }

        // 11. 浏览器前进/后退 hash 变化监听
        window.addEventListener('hashchange', function() {
            var hash = window.location.hash.replace('#', '');
            if (hash && TABS.indexOf(hash) !== -1) switchTab(hash);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
