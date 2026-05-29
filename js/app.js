/* ============================================================
   app.js —— 首页控制台业务逻辑
   依赖：theme.js, utils.js, lightbox.js（需先于本脚本加载）
   ============================================================ */

(function() {
    'use strict';

    const IMG_EXTS = ['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp','.ico'];
    const TABS = ['homer','html','md','image'];
    let allFiles = { html: [], md: [], image: [] };
    let activeTab = 'homer';

    // DOM 引用
    const $search   = document.getElementById('searchInput');
    const $tabBar   = document.getElementById('tabBar');
    const $lightbox = document.getElementById('lightbox');
    const $lbImg    = document.getElementById('lightboxImg');
    const $lbName   = document.getElementById('lightboxName');

    // ── 工具：扩展名匹配 ──
    function extMatch(name, exts) {
        const lower = name.toLowerCase();
        return exts.some(e => lower.endsWith(e));
    }

    // ── 获取文件列表 ──
    async function fetchFiles(apiUrl, exts, cat) {
        const grid = document.getElementById(cat + 'Grid');
        const countEl = document.getElementById('count-' + cat);
        try {
            const resp = await fetch(apiUrl);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const html = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const links = doc.querySelectorAll('a');
            const files = [];
            for (const link of links) {
                const href = link.getAttribute('href');
                if (!href || href === '../' || href === '/') continue;
                let decoded;
                try { decoded = decodeURIComponent(href); } catch(e) { decoded = href; }
                if (!extMatch(decoded, exts)) continue;
                let size = '?', modified = '?';
                const parent = link.parentElement;
                if (parent) {
                    const txt = parent.textContent || '';
                    const dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                    if (dm) modified = dm[1];
                    const sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                    if (sm) size = sm[1] + ' ' + sm[2];
                }
                files.push({ name: decoded, size, modified });
            }
            // 去重
            const seen = new Set();
            const unique = files.filter(f => {
                const k = f.name;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
            unique.sort((a,b) => a.name.localeCompare(b.name));
            allFiles[cat] = unique;
            renderCategory(cat);
        } catch (err) {
            console.error('Fetch ' + cat + ' error:', err);
            grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">无法加载文件列表</div><div class="empty-hint">请检查 nginx 配置</div></div>';
            if (countEl) countEl.textContent = '';
        }
    }

    // ── 渲染分类 ──
    function renderCategory(cat) {
        const grid = document.getElementById(cat + 'Grid');
        const countEl = document.getElementById('count-' + cat);
        const files = allFiles[cat] || [];
        const query = $search.value.trim().toLowerCase();
        const filtered = query ? files.filter(f => f.name.toLowerCase().includes(query)) : files;

        if (countEl) {
            countEl.textContent = query
                ? `找到 ${filtered.length} 个结果（共 ${files.length} 个）`
                : `共 ${files.length} 个文件`;
        }

        if (filtered.length === 0) {
            grid.innerHTML = `<div class="empty-state">
                <div class="empty-icon">📭</div>
                <div class="empty-text">${query ? '没有匹配的文件' : '暂无文件'}</div>
                <div class="empty-hint">${query ? '尝试其他关键词' : '请添加文件到服务器目录'}</div>
            </div>`;
            return;
        }

        grid.innerHTML = (cat === 'image')
            ? filtered.map(f => imageCard(f)).join('')
            : filtered.map(f => fileCard(f, cat)).join('');
    }

    function fileCard(f, cat) {
        const icon = cat === 'html' ? '📄' : '📘';
        const viewHref = cat === 'md'
            ? '/md-viewer.html?file=' + encodeURIComponent(f.name)
            : '/Html/' + encodeURIComponent(f.name);
        const dlHref = cat === 'md'
            ? '/Markdown/' + encodeURIComponent(f.name)
            : '/Html/' + encodeURIComponent(f.name);
        const safe = Utils.escapeHtml(f.name).replace(/"/g, '&quot;');
        return `
            <div class="file-card" data-name="${Utils.escapeHtml(f.name)}">
                <div class="card-icon">${icon}</div>
                <div class="card-info">
                    <div class="card-name" title="${Utils.escapeHtml(f.name)}">${Utils.escapeHtml(f.name)}</div>
                    <div class="card-meta">${Utils.escapeHtml(f.size)} &middot; ${Utils.escapeHtml(f.modified)}</div>
                </div>
                <div class="card-actions">
                    <a href="${viewHref}" class="card-btn primary" target="_blank" title="预览">👁 查看</a>
                    <button class="card-btn" onclick="downloadFile('${dlHref}','${safe}')" title="下载" aria-label="下载">⬇</button>
                </div>
            </div>`;
    }

    function imageCard(f) {
        const imgUrl = '/api/images/' + encodeURIComponent(f.name);
        const safe = Utils.escapeHtml(f.name).replace(/"/g, '&quot;');
        return `
            <div class="image-card" data-name="${Utils.escapeHtml(f.name)}" data-src="${imgUrl}">
                <div class="thumb-wrap">
                    <img src="${imgUrl}" alt="${Utils.escapeHtml(f.name)}" loading="lazy"
                         onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                         onload="this.nextElementSibling.style.display='none';">
                    <span class="thumb-fallback" style="display:none;">🖼️</span>
                </div>
                <div class="card-body">
                    <div class="card-info">
                        <div class="card-name" title="${Utils.escapeHtml(f.name)}">${Utils.escapeHtml(f.name)}</div>
                        <div class="card-meta">${Utils.escapeHtml(f.size)} &middot; ${Utils.escapeHtml(f.modified)}</div>
                    </div>
                    <button class="card-btn" onclick="event.stopPropagation();downloadFile('${imgUrl}','${safe}')" title="下载" aria-label="下载">⬇</button>
                </div>
            </div>`;
    }

    function renderActiveTab() {
        if (activeTab === 'homer') return;
        renderCategory(activeTab);
    }

    // ── 搜索 ──
    $search.addEventListener('input', function() {
        renderActiveTab();
    });

    // ── 标签切换 ──
    $tabBar.addEventListener('click', function(e) {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        if (tab === activeTab) return;

        $tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById('page-' + tab);
        if (page) page.classList.add('active');

        activeTab = tab;
        if (tab !== 'homer') {
            renderCategory(tab);
            $search.focus();
        }
        syncIframeTheme();
        window.location.hash = tab;
    });

    // ── 图片卡片点击 → 灯箱 ──
    document.addEventListener('click', function(e) {
        const card = e.target.closest('.image-card');
        if (!card) return;
        if (e.target.closest('.card-btn')) return;
        const src = card.getAttribute('data-src');
        const name = card.getAttribute('data-name');
        if ($lbImg && $lightbox) {
            $lbImg.src = src;
            $lbImg.alt = name || '';
            if ($lbName) $lbName.textContent = name || '';
            $lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    });

    // ── iframe 主题同步 ──
    function syncIframeTheme() {
        const iframe = document.querySelector('.iframe-container iframe');
        if (iframe && iframe.contentWindow) {
            const theme = document.body.classList.contains('dark') ? 'dark' : 'light';
            iframe.contentWindow.postMessage({ type: 'themeChange', theme: theme }, '*');
        }
    }

    // ── 主题切换按钮 ──
    document.getElementById('themeToggleBtn').addEventListener('click', function() {
        Theme.toggleTheme();
        syncIframeTheme();
    });

    // ── 初始化 ──
    function init() {
        Theme.initTheme();
        Lightbox.init();

        // 从 URL hash 恢复标签
        const hash = window.location.hash.replace('#', '');
        if (hash && TABS.includes(hash)) {
            const btn = $tabBar.querySelector('[data-tab="' + hash + '"]');
            if (btn) btn.click();
        }

        // 预加载所有文件列表
        fetchFiles('/api/html/',  ['.html','.htm'], 'html');
        fetchFiles('/api/md/',    ['.md','.markdown'], 'md');
        fetchFiles('/api/images/', IMG_EXTS, 'image');
    }

    init();

})();
