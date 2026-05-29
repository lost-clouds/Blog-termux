/* ============================================================
   lightbox.js —— 图片灯箱模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，在 window 上挂载 Lightbox API
     [初始化] 外部调用 Lightbox.init() → 绑定关闭事件
     [运行] Lightbox.open(src, name) → 展示图片
           Lightbox.close() → 关闭灯箱
   ────────────────────────────────────────────────────────────
   事件：背景点击关闭、关闭按钮、ESC 键关闭
   依赖：无（直接操作 DOM 元素 #lightbox, #lightboxImg, #lightboxName）
   使用：Lightbox.init() / Lightbox.open(src) / Lightbox.close()
   ============================================================ */

(function(global) {
    'use strict';

    /* ---- 关闭灯箱 ---- */
    function close() {
        const lb = document.getElementById('lightbox');
        if (lb) lb.classList.remove('active');
        document.body.style.overflow = '';
    }

    /* ---- 打开灯箱 ---- */
    function open(src, name) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightboxImg');
        const lbl = document.getElementById('lightboxName');
        if (!lb || !img) return;
        img.src = src;
        img.alt = name || '';
        if (lbl) lbl.textContent = name || '';
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /* ---- 初始化事件绑定 ---- */
    function init() {
        // 背景点击或关闭按钮点击 → 关闭
        document.addEventListener('click', function(e) {
            const lb = document.getElementById('lightbox');
            if (!lb || !lb.classList.contains('active')) return;
            if (e.target === lb || e.target.classList.contains('lightbox-close')) {
                close();
            }
        });

        // ESC 键 → 关闭
        document.addEventListener('keydown', function(e) {
            const lb = document.getElementById('lightbox');
            if (e.key === 'Escape' && lb && lb.classList.contains('active')) {
                close();
            }
        });
    }

    global.Lightbox = { open: open, close: close, init: init };

})(window);
