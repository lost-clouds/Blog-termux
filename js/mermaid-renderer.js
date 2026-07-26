import { LIBS } from './constants.js';

/* ============================================================
   mermaid-renderer.js —— Mermaid 图表渲染器

   参照 md-viewer.js 中 KaTeX 的懒加载模式：
   - 检测到 mermaid 代码块才加载库（体积 ~2MB，避免首屏阻塞）
   - 加载失败时 _mermaidPromise 置 null 允许重试
   - 渲染失败时降级显示源码 + 错误提示
   ============================================================ */

'use strict';

let _mermaidReady = false;
let _mermaidPromise = null;

/* ------------------------------------------------------------
   将 marked 生成的 <pre><code class="language-mermaid"> 转换为
   可供 mermaid.run() 消费的 <div class="mermaid">
   必须在 sanitizeHtml 之后调用，因为 sanitizer 的 class 正则
   /^language-/ 会放行 language-mermaid，code/pre 都在白名单中

   返回 boolean：true 表示检测到了图表代码块
   ------------------------------------------------------------ */
function prepareMermaidBlocks(container) {
    if (!container) return false;

    // 同时匹配 code[class~="language-mermaid"] 和 code.language-mermaid
    let blocks = container.querySelectorAll('pre code[class*="language-mermaid"]');
    if (!blocks.length) return false;

    blocks.forEach(function(code) {
        let source = code.textContent;
        let pre = code.closest('pre');
        if (!pre) return;

        let div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = source;
        pre.replaceWith(div);
    });

    return true;
}

/* ------------------------------------------------------------
   懒加载 mermaid 库（防重复加载，模式与 ensureKatex 一致）
   加载成功时调用 mermaid.initialize() 进行一次性全局配置
   ------------------------------------------------------------ */
function ensureMermaid() {
    if (_mermaidReady) return Promise.resolve();
    if (_mermaidPromise) return _mermaidPromise;

    _mermaidPromise = new Promise(function(resolve, reject) {
        let script = document.createElement('script');
        script.src = LIBS.MERMAID_JS;
        script.onload = function() {
            // mermaid 挂载到 window.mermaid（全局对象）
            if (typeof mermaid !== 'undefined') {
                mermaid.initialize({
                    startOnLoad: false,
                    // strict：禁止 HTML 标签注入，最安全的级别
                    securityLevel: 'strict',
                    // base 主题输出基础 SVG，由项目 CSS 变量控制颜色，
                    // 自动适配深色/浅色模式
                    theme: 'base'
                });
                _mermaidReady = true;
                resolve();
            } else {
                _mermaidPromise = null;
                reject(new Error('Mermaid 库加载后未找到全局 mermaid 对象'));
            }
        };
        script.onerror = function() {
            // 置 null 允许下次重试（与 KaTeX 的 _katexPromise 模式一致）
            _mermaidPromise = null;
            reject(new Error('Mermaid 库加载失败'));
        };
        document.head.appendChild(script);
    });

    return _mermaidPromise;
}

/* ------------------------------------------------------------
   调用 mermaid.run() 将容器内所有 .mermaid 元素渲染为 SVG
   渲染失败时给对应元素追加 .mermaid-error 类，保留源码可见

   注意：mermaid.run() 是 mermaid@11 的推荐 API，
   自动处理元素查找和替换，生成的 SVG 使用 securityLevel 配置
   ------------------------------------------------------------ */
async function renderMermaid(container) {
    if (typeof mermaid === 'undefined' || !container) return;

    let nodes = container.querySelectorAll('.mermaid');
    if (!nodes.length) return;

    try {
        await mermaid.run({ nodes: nodes });
    } catch (err) {
        console.warn('Mermaid 渲染失败:', err.message);

        // 降级：渲染失败的图表显示源码 + 错误提示
        // 注意：mermaid.run() 可能部分成功，只标记未生成 SVG 的节点
        container.querySelectorAll('.mermaid').forEach(function(el) {
            if (!el.querySelector('svg')) {
                el.classList.add('mermaid-error');
                let source = el.textContent || '';
                el.innerHTML =
                    '<pre><code>' + escapeMermaidSource(source) + '</code></pre>' +
                    '<div class="mermaid-error-msg">图表渲染失败: ' +
                    escapeMermaidSource(err.message) + '</div>';
            }
        });
    }
}

/* ------------------------------------------------------------
   对 mermaid 源码做基本的 HTML 转义，防止注入
   用于渲染失败时将源码安全显示在 <pre><code> 中
   ------------------------------------------------------------ */
function escapeMermaidSource(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export { prepareMermaidBlocks, ensureMermaid, renderMermaid };
