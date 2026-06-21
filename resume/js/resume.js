/* ============================================================
   resume.js —— 个人简历页面脚本
   ────────────────────────────────────────────────────────────
   单一 ES Module，不 import 任何外部模块
   依赖：无
   生命周期：applyTheme → fetch config → render DOM → bind events → dom-loaded
   ============================================================ */
'use strict';

/* ============================================================
   0. 模块级常量
   ============================================================ */

const STORAGE_KEY = 'resume-theme';
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1000;

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const ARROW_SVG = '<svg width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M11 3a1 1 0 1 0 0 2h6.586L3.293 19.293a1 1 0 1 0 1.414 1.414L19 6.414V13a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1H9z"/></svg>';

const METHOD_ICONS = {
    bolt:    '<svg width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M19.89 9.55A1 1 0 0 0 19 9h-5V3a1 1 0 0 0-.69-1a1 1 0 0 0-1.12.36l-8 11a1 1 0 0 0-.08 1A1 1 0 0 0 5 15h5v6a1 1 0 0 0 .69.95A1.1 1.1 0 0 0 11 22a1 1 0 0 0 .81-.41l8-11a1 1 0 0 0 .08-1.04M12 17.92V14a1 1 0 0 0-1-1H7l5-6.92V10a1 1 0 0 0 1 1h4Z"/></svg>',
    waves:   '<svg width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M20 12h2v2h-2c-1.38 0-2.74-.35-4-1c-2.5 1.3-5.5 1.3-8 0c-1.26.65-2.63 1-4 1H2v-2h2c1.39 0 2.78-.47 4-1.33c2.44 1.71 5.56 1.71 8 0c1.22.86 2.61 1.33 4 1.33m0-6h2v2h-2c-1.38 0-2.74-.35-4-1c-2.5 1.3-5.5 1.3-8 0c-1.26.65-2.63 1-4 1H2V6h2c1.39 0 2.78-.47 4-1.33c2.44 1.71 5.56 1.71 8 0C17.22 5.53 18.61 6 20 6m0 12h2v2h-2c-1.38 0-2.74-.35-4-1c-2.5 1.3-5.5 1.3-8 0c-1.26.65-2.63 1-4 1H2v-2h2c1.39 0 2.78-.47 4-1.33c2.44 1.71 5.56 1.71 8 0c1.22.86 2.61 1.33 4 1.33"/></svg>',
    gavel:   '<svg width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="m2.3 20.28l9.6-9.6l-1.4-1.42l-.72.71a.996.996 0 0 1-1.41 0l-.71-.71a.996.996 0 0 1 0-1.41l5.66-5.66a.996.996 0 0 1 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.69l1.42 1.43a.996.996 0 0 1 1.41 0c.39.39.39 1.03 0 1.42l1.41 1.41l.71-.71c.39-.39 1.03-.39 1.42 0l.7.71c.39.39.39 1.03 0 1.42l-5.65 5.65c-.39.39-1.03.39-1.42 0l-.7-.7a.99.99 0 0 1 0-1.42l.7-.71l-1.41-1.41l-9.61 9.61a.996.996 0 0 1-1.41 0c-.39-.39-.39-1.03 0-1.42M20 19a2 2 0 0 1 2 2v1H12v-1a2 2 0 0 1 2-2z"/></svg>',
    history: '<svg width="1em" height="1em" viewBox="0 0 24 24"><path fill="currentColor" d="M13.5 8H12v5l4.28 2.54l.72-1.21l-3.5-2.08zM13 3a9 9 0 0 0-9 9H1l3.96 4.03L9 12H6a7 7 0 0 1 7-7a7 7 0 0 1 7 7a7 7 0 0 1-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.9 8.9 0 0 0 13 21a9 9 0 0 0 9-9a9 9 0 0 0-9-9"/></svg>'
};

/* ============================================================
   1. 工具函数
   ============================================================ */

/** HTML 转义（防 XSS） */
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function(c) { return ESCAPE_MAP[c]; });
}

/** 将换行符转为 <br>（用于 bio 段落） */
function nl2br(str) {
    return String(str).split('\n').map(function(s) { return escapeHtml(s); }).join('<br>');
}

/** 获取安全的 URL（只允许 http/https/mailto） */
function getSafeUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    return /^(https?:|mailto:)/i.test(trimmed) ? trimmed : '';
}

/* ============================================================
   2. 主题管理
   ============================================================ */

function getStoredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    const isDark = (theme === 'dark');
    document.body.classList.toggle('dark', isDark);
    document.documentElement.setAttribute('data-theme', theme);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.setAttribute('content', isDark ? '#1c1c1e' : '#f5f5f7');
    }

    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.textContent = isDark ? '☀️' : '🌙';
        btn.setAttribute('aria-label', isDark ? '切换浅色主题' : '切换深色主题');
    }

    localStorage.setItem(STORAGE_KEY, theme);
}

function toggleTheme() {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
}

/* ============================================================
   3. 配置加载（带重试）
   ============================================================ */

async function loadConfig() {
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
        try {
            const resp = await fetch('config.json', { cache: 'no-cache' });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.json();
        } catch (err) {
            if (attempt === RETRY_MAX) {
                console.error('Resume: 配置加载失败', err);
                return null;
            }
            await new Promise(function(r) { setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)); });
        }
    }
}

/* ============================================================
   4. 渲染函数
   ============================================================ */

function renderNavLogo(name) {
    const logo = document.querySelector('.nav-logo');
    if (logo) logo.textContent = name;
}

function renderNavSocial(social) {
    const navSocialEl = document.querySelector('.nav-social');
    if (!navSocialEl || !social || social.length === 0) return;
    const gh = social.find(function(s) { return s.name.toLowerCase() === 'github'; });
    if (gh) {
        const url = getSafeUrl(gh.url);
        if (url) navSocialEl.href = url;
    }
}

function renderHero(personal, social) {
    const heroText = document.querySelector('.hero-text');
    if (heroText) {
        heroText.innerHTML =
            '<h1>你好，我是 <strong>' + escapeHtml(personal.name) + '</strong></h1>' +
            '<p class="hero-subtitle">' + escapeHtml(personal.title) + '</p>';
    }

    const heroFigure = document.querySelector('.hero-figure');
    if (heroFigure) {
        if (personal.avatar) {
            heroFigure.innerHTML = '<img src="' + escapeHtml(personal.avatar) + '" alt="' + escapeHtml(personal.name) + ' 的照片" loading="eager">';
        } else {
            const initial = personal.name ? personal.name.charAt(0).toUpperCase() : '?';
            heroFigure.innerHTML = '<div class="card-placeholder" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        }
    }

    const heroSocial = document.querySelector('.hero-social');
    if (heroSocial && social && social.length > 0) {
        heroSocial.innerHTML = social.map(function(item) {
            const url = getSafeUrl(item.url);
            const tag = url ? 'a href="' + escapeHtml(url) + '" target="_blank" rel="noopener"' : 'span';
            return '<' + tag + '>' +
                '<span class="social-full">' + escapeHtml(item.name) + '</span>' +
                '<span class="social-short">' + escapeHtml(item.short || item.name.substring(0, 2)) + '</span>' +
                ARROW_SVG +
                '</' + tag + '>';
        }).join('');
    }
}

function renderAbout(personal, methods) {
    const aboutContent = document.querySelector('.about-content');
    if (aboutContent && personal.bio) {
        aboutContent.innerHTML = '<p>' + nl2br(personal.bio) + '</p>';
    }

    const methodGrid = document.querySelector('.method-grid');
    if (methodGrid && methods && methods.length > 0) {
        methodGrid.innerHTML = methods.map(function(m) {
            const iconSvg = METHOD_ICONS[m.icon] || METHOD_ICONS.bolt;
            return '<div class="method-card">' +
                '<div class="method-icon">' + iconSvg + '</div>' +
                '<h3>' + escapeHtml(m.title) + '</h3>' +
                '<p>' + escapeHtml(m.description) + '</p>' +
                '</div>';
        }).join('');
    }
}

function renderProjects(projects, social) {
    const projectGrid = document.querySelector('.project-grid');
    if (!projectGrid || !projects || projects.length === 0) return;

    let html = '';

    projects.forEach(function(proj) {
        const url = getSafeUrl(proj.url);
        html += '<div class="card">';
        html += '<' + (url ? 'a href="' + escapeHtml(url) + '" target="_blank" rel="noopener"' : 'div') + '>';
        html += '<figure class="card-figure">';
        if (proj.image) {
            html += '<img src="' + escapeHtml(proj.image) + '" alt="' + escapeHtml(proj.title) + '" loading="lazy">';
        } else {
            const initial = proj.title ? proj.title.charAt(0).toUpperCase() : '?';
            html += '<div class="card-placeholder" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        }
        html += '</figure>';
        html += '<div class="card-overlay-blur"></div>';
        html += '<div class="card-content">';
        html += '<h3 class="card-title">' + escapeHtml(proj.title) + '</h3>';
        html += '<p class="card-description">' + escapeHtml(proj.description || '') + '</p>';
        html += '</div>';
        html += '</' + (url ? 'a' : 'div') + '>';
        html += '</div>';
    });

    // 从 social 中查找 GitHub URL
    let githubUrl = 'https://github.com/';
    if (social) {
        const gh = social.find(function(s) { return s.name.toLowerCase() === 'github'; });
        if (gh) {
            const url = getSafeUrl(gh.url);
            if (url) githubUrl = url;
        }
    }

    html += '<div class="card card-more">';
    html += '<a href="' + escapeHtml(githubUrl) + '" target="_blank" rel="noopener">';
    html += '<h3 class="card-title">More...</h3>';
    html += '<p class="card-description">在 GitHub 上查看更多项目</p>';
    html += '</a>';
    html += '</div>';

    projectGrid.innerHTML = html;
}

function renderContact(contact) {
    const contactGrid = document.querySelector('.contact-grid');
    if (!contactGrid || !contact || contact.length === 0) return;

    contactGrid.innerHTML = contact.map(function(item) {
        const url = getSafeUrl(item.url);
        const tag = url ? 'a href="' + escapeHtml(url) + '" target="_blank" rel="noopener"' : 'span';
        return '<' + tag + ' class="contact-link">' +
            escapeHtml(item.name) +
            (url ? ARROW_SVG : '') +
            '</' + tag + '>';
    }).join('');
}

function renderError() {
    const sections = ['about', 'projects', 'contact'];
    sections.forEach(function(id) {
        const grid = document.querySelector('#' + id + ' .method-grid, #' + id + ' .project-grid, #' + id + ' .contact-grid');
        if (grid) {
            grid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:2rem;">⚠️ 内容加载失败，请检查 config.json 文件是否存在。</p>';
        }
    });
    const heroText = document.querySelector('.hero-text');
    if (heroText && !heroText.innerHTML.trim()) {
        heroText.innerHTML = '<h1>个人简历</h1><p class="hero-subtitle">请配置 config.json</p>';
    }
    const aboutContent = document.querySelector('.about-content');
    if (aboutContent && !aboutContent.innerHTML.trim()) {
        aboutContent.innerHTML = '<p>请编辑 resume/config.json 填写个人信息。</p>';
    }
}

/* ============================================================
   5. Hero 视差透视
   ============================================================ */

function setupPerspective() {
    const group = document.querySelector('[data-perspective-group]');
    if (!group) return;

    const elements = Array.from(group.querySelectorAll('[data-perspective]'));
    if (elements.length === 0) return;

    const data = elements.map(function(el) {
        return { el: el, attr: el.getAttribute('data-perspective') };
    });

    let active = false;

    function onMouseMove(event) {
        if (!active) return;
        const vh = window.innerHeight;
        const vy = event.clientY / vh - 0.5;

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            const rect = item.el.getBoundingClientRect();
            const cx = (event.clientX - rect.left) / rect.width - 0.5;
            let x = 0, y = 0;

            switch (item.attr) {
                case 'header':
                    x = Math.max(-20, Math.min(20, cx * 10));
                    y = -vy * (rect.height / 2);
                    break;
                case 'image':
                    x = Math.min(cx * 5, rect.width / 6 - 40);
                    y = vy * (rect.height / 6);
                    break;
                case 'social-links':
                    x = Math.min(cx * 10, -5);
                    y = -vy * rect.height * 0.0125;
                    break;
                default:
                    x = cx * 20;
                    y = vy * 20;
            }
            item.el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        }
    }

    function onMediaChange() {
        const disabled = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
                         window.matchMedia('(pointer: coarse)').matches;

        if (disabled) {
            if (active) {
                document.removeEventListener('mousemove', onMouseMove, { passive: true });
                active = false;
                data.forEach(function(item) { item.el.style.transform = ''; });
            }
        } else {
            if (!active) {
                document.addEventListener('mousemove', onMouseMove, { passive: true });
                active = true;
            }
        }
    }

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', onMediaChange);
    window.matchMedia('(pointer: coarse)').addEventListener('change', onMediaChange);

    onMediaChange();
}

/* ============================================================
   6. 滚动监听（IntersectionObserver）
   ============================================================ */

function setupScrollObserver() {
    const sections = document.querySelectorAll('[data-nav-section]');
    if (sections.length === 0) return;

    const navItems = document.querySelectorAll('.nav-item[href^="#"]');
    let updating = false;

    const observer = new IntersectionObserver(function(entries) {
        if (updating) return;

        let visible = null;
        for (let i = 0; i < entries.length; i++) {
            if (entries[i].intersectionRatio >= 0.25) {
                visible = entries[i].target;
            }
        }
        if (!visible) return;

        const sectionId = visible.getAttribute('data-nav-section');
        if (!sectionId) return;

        updating = true;
        requestAnimationFrame(function() {
            const hash = '#' + sectionId;
            if (window.location.hash !== hash) {
                history.replaceState(null, '', hash);
            }
            navItems.forEach(function(item) {
                item.classList.toggle('active', item.getAttribute('href') === hash);
            });
            updating = false;
        });
    }, { threshold: [0.25], rootMargin: '0px 0px -100px 0px' });

    sections.forEach(function(s) { observer.observe(s); });
}

/* ============================================================
   7. 移动端导航菜单
   ============================================================ */

function setupNavToggle() {
    const nav = document.querySelector('nav');
    const toggle = document.querySelector('.nav-toggle');
    if (!nav || !toggle) return;

    toggle.addEventListener('click', function() {
        nav.classList.toggle('open');
    });

    nav.querySelectorAll('.nav-item[href^="#"]').forEach(function(link) {
        link.addEventListener('click', function() {
            nav.classList.remove('open');
        });
    });
}

/* ============================================================
   8. 主题切换按钮
   ============================================================ */

function setupThemeToggle() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', toggleTheme);
}

/* ============================================================
   9. 初始化入口
   ============================================================ */

async function init() {
    // Phase 1: 同步主题状态
    applyTheme(getStoredTheme());

    // Phase 2: 加载配置
    const config = await loadConfig();
    if (!config) {
        renderError();
        return;
    }

    // Phase 3: 渲染所有区块（必须先于事件绑定）
    renderNavLogo(config.personal.name);
    renderNavSocial(config.social);
    renderHero(config.personal, config.social);
    renderAbout(config.personal, config.methods);
    renderProjects(config.projects, config.social);
    renderContact(config.contact);

    // Phase 4: 绑定事件（DOM 已就绪）
    setupPerspective();
    setupScrollObserver();
    setupNavToggle();
    setupThemeToggle();

    // Phase 5: 启用过渡动画
    document.documentElement.classList.add('dom-loaded');
}

init();
