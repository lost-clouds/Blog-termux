import { Utils } from './utils.js';
import { Lightbox } from './lightbox.js';
import { API } from './constants.js';

/**
 * @module gallery
 * @description 图片画廊：图片网格 + 灯箱，支持搜索过滤
 * @requires module:utils
 * @requires module:lightbox
 * @requires module:constants
 *
 * 使用：import { Gallery } from './gallery.js'
 */


'use strict';


    const IMG_EXTS = /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i;

    let _images = [];
    let _debounceTimer = null;
    let _fetching = false;

    /* ---- DOM 引用缓存 ---- */
    let $galleryGrid, $gallerySearch;

    /* ---- 获取图片列表（index.json 优先，autoindex 降级）---- */
    /**
     * 获取图片列表（index.json 优先，autoindex 降级），去重后排序渲染。
     * @returns {Promise<void>}
     */ async function _fetchImages() {
        if (_fetching) return;
        if (!$galleryGrid) return;
        _fetching = true;
        $galleryGrid.innerHTML = '<div class="gallery-loading">加载中...</div>';

        try {
            const results = await _fetchIndexOrAutoindex();

            const seen = new Set();
            _images = results.filter(function(f) {
                const key = f.path || f.name;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            }).sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            _render();
        } catch (err) {
            console.error('Gallery: 加载图片列表失败', err);
            $galleryGrid.innerHTML = '<div class="gallery-loading">加载失败，请检查配置</div>';
        } finally {
            _fetching = false;
        }
    }

    /* ---- 优先 fetch index.json，404 时降级为解析 autoindex ---- */
    /**
     * 优先 fetch index.json，404 时降级为解析 autoindex。
     * @returns {Promise<Array>}
     */
    async function _fetchIndexOrAutoindex() {
        return Utils.fetchIndexOrAutoindex(API.IMAGE_INDEX, API.IMAGES_LIST, IMG_EXTS);
    }

    /* ---- 渲染图片网格 ---- */
    /**
     * 渲染图片网格，支持搜索过滤。
     * @returns {void}
     */
    function _render() {
        if (!$galleryGrid) return;

        const query = $gallerySearch ? $gallerySearch.value.trim().toLowerCase() : '';
        const filtered = query
            ? _images.filter(function(img) { return img.name.toLowerCase().includes(query); })
            : _images;

        if (filtered.length === 0) {
            $galleryGrid.innerHTML = '<div class="gallery-empty">' +
                (query ? '未找到匹配的图片' : '暂无图片，请将图片放入 Image/ 目录') +
                '</div>';
            return;
        }

        $galleryGrid.innerHTML = filtered.map(function(img) {
            // 保留路径分隔符 `/`，仅编码各段文件名
            const url = API.IMAGES_LIST + img.name.split('/').map(function(s) {
                return encodeURIComponent(s);
            }).join('/');
            return '<div class="gallery-card" tabindex="0" role="button" aria-label="' +
                   Utils.escapeHtml(img.name) + '" data-src="' + Utils.escapeHtml(url) +
                   '" data-name="' + Utils.escapeHtml(img.name) + '">' +
                '<div class="gallery-thumb">' +
                    '<img src="' + Utils.escapeHtml(url) + '" alt="' + Utils.escapeHtml(img.name) +
                    '" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
                '</div>' +
                '<div class="gallery-info">' +
                    '<span class="gallery-name">' + Utils.escapeHtml(img.name) + '</span>' +
                    '<span class="gallery-size">' + Utils.escapeHtml(img.size) + '</span>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    /* ---- 图片卡片点击 → 灯箱 ---- */
    /**
     * 处理图片卡片点击事件（打开灯箱）。
     * @param e
     */
    function _onCardClick(e) {
        const card = e.target.closest('.gallery-card');
        if (!card) return;
        const src  = card.getAttribute('data-src');
        const name = card.getAttribute('data-name');
        if (src) {
            Lightbox.open(src, name);
        }
    }

    /* ---- 绑定事件 ---- */
    /**
     *
     */
    function _bindEvents() {
        if ($gallerySearch) {
            $gallerySearch.addEventListener('input', function() {
                clearTimeout(_debounceTimer);
                _debounceTimer = setTimeout(_render, 250);
            });
        }
        if ($galleryGrid) {
            $galleryGrid.addEventListener('click', _onCardClick);
            $galleryGrid.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    const card = e.target.closest('.gallery-card');
                    if (card) { e.preventDefault(); card.click(); }
                }
            });
        }
    }

    /* ---- 初始化 ---- */
    /**
     * 初始化画廊模块：缓存 DOM、绑定事件。
     * @returns {void}
     */
    function _init() {
        $galleryGrid   = document.getElementById('galleryGrid');
        $gallerySearch = document.getElementById('gallerySearch');

        _bindEvents();
    }

    /**
     * 检查是否已加载图片。
     * @returns {boolean}
     */
    function _hasImages() { return _images.length > 0; }
    const Gallery = { init: _init, fetchImages: _fetchImages, hasImages: _hasImages };

export { Gallery };
