/* ============================================================
   lightbox.js —— 图片灯箱（被 index.html 和 md-viewer.html 共享）
   通过事件委托自动绑定，无需手动初始化
   ============================================================ */

(function(global) {
    'use strict';

    let $lightbox = null;
    let $lbImg = null;
    let $lbName = null;

    /**
     * 查找最近的 lightbox 容器（支持多灯箱实例）
     */
    function findLightboxElements(root) {
        return {
            lb: root.querySelector('.lightbox') || document.getElementById('lightbox'),
            img: root.querySelector('.lightbox img') || document.getElementById('lightboxImg'),
            name: root.querySelector('.lightbox-name') || document.getElementById('lightboxName')
        };
    }

    function openLightbox(src, name) {
        const els = findLightboxElements(document);
        if (!els.lb || !els.img) return;
        els.img.src = src;
        els.img.alt = name || '';
        if (els.name) els.name.textContent = name || '';
        els.lb.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        const els = findLightboxElements(document);
        if (els.lb) {
            els.lb.classList.remove('active');
        }
        document.body.style.overflow = '';
    }

    /**
     * 初始化灯箱事件（页面加载后调用一次）
     */
    function initLightbox() {
        // 关闭按钮 & 背景点击
        document.addEventListener('click', function(e) {
            const lb = document.querySelector('.lightbox.active');
            if (!lb) return;
            if (e.target === lb || e.target.classList.contains('lightbox-close')) {
                closeLightbox();
            }
        });

        // ESC 关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && document.querySelector('.lightbox.active')) {
                closeLightbox();
            }
        });
    }

    global.Lightbox = {
        open: openLightbox,
        close: closeLightbox,
        init: initLightbox
    };

})(window);
