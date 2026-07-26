import { Utils } from './utils.js';
import { API } from './constants.js';

/**
 * @module navigation
 * @description 服务导航模块：加载 config.json 并渲染服务卡片分组，支持搜索过滤
 * @requires module:utils
 * @requires module:constants
 *
 * 使用：import { Navigation } from './navigation.js'
 */


'use strict';


    let _config = null;
    let _debounceTimer = null;

    /* ---- DOM 引用缓存 ---- */
    let $navGrid, $navSearch;

    /* ---- 加载配置文件（带指数退避重试）---- */
    /**
     * 加载服务配置（带指数退避重试，最多 3 次）。
     * @param {number} [retries=3] - 重试次数
     * @returns {Promise<void>}
     */ async function _loadConfig(retries) {
        retries = retries || 3;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const resp = await fetch(API.CONFIG);
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                _config = await resp.json();
                return;
            } catch (err) {
                if (attempt === retries) {
                    console.error('Navigation: 配置加载失败', err);
                    _config = null;
                    return;
                }
                await new Promise(function(r) { setTimeout(r, 1000 * Math.pow(2, attempt)); });
            }
        }
    }

    /* ---- 渲染服务分组 ---- */
    /**
     * 渲染服务卡片分组，支持搜索过滤。
     * @returns {void}
     */
    function _render() {
        if (!$navGrid) return;

        if (!_config || !_config.services || _config.services.length === 0) {
            $navGrid.innerHTML = '<div class="nav-empty">暂无服务配置</div>';
            return;
        }

        const query = $navSearch ? $navSearch.value.trim().toLowerCase() : '';

        let html = '';
        _config.services.forEach(function(group) {
            // 过滤该分组下的服务项
            const filtered = query
                ? group.items.filter(function(item) {
                    return item.name.toLowerCase().includes(query) ||
                           (item.subtitle && item.subtitle.toLowerCase().includes(query)) ||
                           (item.tag && item.tag.toLowerCase().includes(query));
                  })
                : group.items;

            if (filtered.length === 0) return;

            html += '<div class="nav-group">';
            html += '<div class="nav-group-header">';
            html += '<span class="nav-group-icon">' + Utils.escapeHtml(group.icon || '📦') + '</span>';
            html += '<span class="nav-group-name">' + Utils.escapeHtml(group.name) + '</span>';
            html += '<span class="nav-group-count">' + filtered.length + '</span>';
            html += '</div>';
            html += '<div class="nav-items">';

            filtered.forEach(function(item) {
                let safeUrl = Utils.getSafeUrl(item.url);
                let tag = safeUrl ? 'a' : 'div';
                html += '<' + tag;
                if (safeUrl) {
                    html += ' href="' + Utils.escapeHtml(safeUrl) + '" target="_blank" rel="noopener"';
                }
                html += ' class="nav-card" title="' + Utils.escapeHtml(item.subtitle || item.name) + '">';
                html += '<span class="nav-card-icon">' + Utils.escapeHtml(item.icon || '🔗') + '</span>';
                html += '<span class="nav-card-body">';
                html += '<span class="nav-card-name">' + Utils.escapeHtml(item.name) + '</span>';
                if (item.subtitle) {
                    html += '<span class="nav-card-sub">' + Utils.escapeHtml(item.subtitle) + '</span>';
                }
                html += '</span>';
                if (item.tag) {
                    html += '<span class="nav-card-tag">' + Utils.escapeHtml(item.tag) + '</span>';
                }
                html += '</' + tag + '>';
            });

            html += '</div></div>';
        });

        if (!html) {
            $navGrid.innerHTML = '<div class="nav-empty">未找到匹配的服务</div>';
        } else {
            $navGrid.innerHTML = html;
        }
    }

    /* ---- 搜索过滤（debounce 250ms）---- */
    /**
     * 搜索过滤服务卡片（250ms 防抖）。
     * @returns {void}
     */
    function _search() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(_render, 250);
    }

    /* ---- 初始化 ---- */
    /**
     * 初始化导航模块：加载配置、渲染、绑定搜索事件。
     * @returns {Promise<void>}
     */ async function _init() {
        $navGrid  = document.getElementById('navGrid');
        $navSearch = document.getElementById('navSearch');

        await _loadConfig();
        _render();

        // 搜索框事件绑定
        if ($navSearch) {
            $navSearch.addEventListener('input', _search);
        }
    }

    const Navigation = { init: _init };

export { Navigation };
