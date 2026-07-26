/**
 * @module lightbox
 * @description 图片灯箱：打开/关闭/ESC 键关闭
 * @requires none
 *
 * 使用：import { Lightbox } from './lightbox.js'
 */


'use strict';

    let _lastFocus = null;

    /* ---- 关闭灯箱 ---- */
    /**
     * 关闭灯箱。
     * @returns {void}
     */
    function _close() {
        const lb = document.getElementById('lightbox');
        if (lb) lb.classList.remove('active');
        document.body.style.overflow = '';
        // 恢复焦点
        if (_lastFocus) { _lastFocus.focus(); _lastFocus = null; }
    }

    /* ---- 打开灯箱 ---- */
    /**
     * 打开灯箱展示图片。
     * @param {string} src - 图片 URL
     * @param {string} [name] - 图片名称
     * @returns {void}
     */
    function _open(src, name) {
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
    /**
     * 初始化事件绑定（背景点击/关闭按钮/ESC 键）。
     * @returns {void}
     */
    function _init() {
        // 背景点击或关闭按钮点击 → 关闭
        document.addEventListener('click', function(e) {
            const lb = document.getElementById('lightbox');
            if (!lb || !lb.classList.contains('active')) return;
            if (e.target === lb || e.target.classList.contains('lightbox-close')) {
                _close();
            }
        });

        // ESC 键 → 关闭
        document.addEventListener('keydown', function(e) {
            const lb = document.getElementById('lightbox');
            if (e.key === 'Escape' && lb && lb.classList.contains('active')) {
                _close();
            }
        });
    }

    const Lightbox = { open: _open, init: _init };

export { Lightbox };
