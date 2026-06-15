/* ============================================================
   lightbox.js —— 图片灯箱模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] ES Module 被 app.js/gallery.js 静态导入
     [初始化] Lightbox.init() → 绑定关闭事件
     [运行] Lightbox.open(src, name) → 展示图片
           Lightbox.close() → 关闭灯箱
   ────────────────────────────────────────────────────────────
   事件：背景点击关闭、关闭按钮、ESC 键关闭
   依赖：无（直接操作 DOM 元素 #lightbox, #lightboxImg, #lightboxName）
   使用：import { Lightbox } from './lightbox.js'
   ============================================================ */

'use strict';

    let _lastFocus = null;

    /* ---- 关闭灯箱 ---- */
    function close() {
        const lb = document.getElementById('lightbox');
        if (lb) lb.classList.remove('active');
        document.body.style.overflow = '';
        // 恢复焦点
        if (_lastFocus) { _lastFocus.focus(); _lastFocus = null; }
    }

    /* ---- 打开灯箱 ---- */
    function open(src, name) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightboxImg');
        const lbl = document.getElementById('lightboxName');
        if (!lb || !img) return;

        _lastFocus = document.activeElement;

        img.src = src;
        img.alt = name || '';
        if (lbl) lbl.textContent = name || '';
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 将焦点移到灯箱，方便键盘关闭
        lb.setAttribute('tabindex', '-1');
        lb.focus();
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

    const Lightbox = { open: open, close: close, init: init };

export { Lightbox };
