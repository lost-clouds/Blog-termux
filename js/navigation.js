import { Utils } from './utils.js';

/* ============================================================
   navigation.js —— 服务导航模块（替代 Homer iframe）
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 作为 ES Module 被 app.js 静态导入
     [初始化] 外部调用 Navigation.init() → 加载 config.json 并渲染
     [运行] Navigation.search(query) → 过滤服务卡片
     [渲染] 按分组渲染服务卡片，支持点击跳转到外部服务 URL
   ────────────────────────────────────────────────────────────
   数据源：GET /config.json → 服务分组配置
   依赖：Utils.escapeHtml
   使用：import { Navigation } from './navigation.js'
   ============================================================ */

'use strict';


    let _config = null;
    let _debounceTimer = null;

    /* ---- DOM 引用缓存 ---- */
    let $navGrid, $navSearch;

    /* ---- 加载配置文件 ---- */
    async function loadConfig() {
        try {
            const resp = await fetch('/config.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            _config = await resp.json();
        } catch (err) {
            console.error('Navigation: 配置加载失败', err);
            _config = null;
        }
    }

    /* ---- 渲染服务分组 ---- */
    function render() {
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
                html += '<a href="' + Utils.escapeHtml(item.url) + '" ';
                html += 'class="nav-card" target="_blank" rel="noopener" ';
                html += 'title="' + Utils.escapeHtml(item.subtitle || item.name) + '">';
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
                html += '</a>';
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
    function search() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(render, 250);
    }

    /* ---- 初始化 ---- */
    async function init() {
        $navGrid  = document.getElementById('navGrid');
        $navSearch = document.getElementById('navSearch');

        await loadConfig();
        render();

        // 搜索框事件绑定
        if ($navSearch) {
            $navSearch.addEventListener('input', search);
        }
    }

    const Navigation = { init: init, render: render, search: search };

export { Navigation };
