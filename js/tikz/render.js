/**
 * @module tikz/render
 * @description TikZ→SVG 渲染引擎的编排层：接收容器 DOM，把其中的 ```tikz 代码块
 *              解析/渲染为 SVG。这是本模块唯一的公共入口。
 * @requires tikz/{constants, script, context, expr, options, node, path, text, math}
 */

'use strict';

import { DEFAULT_STROKE, IGNORE_COMMANDS } from './constants.js';
import { preprocess, expandScript } from './script.js';
import { createContext, registerCoords } from './context.js';
import { parsePoint } from './expr.js';
import { parseOptions } from './options.js';
import { renderNode } from './node.js';
import { renderDraw } from './path.js';
import { escapeHtml } from './text.js';
import { fillMathInSvg, ensureKatex } from './math.js';

/**
 * 渲染期间按命令分发到节点/路径渲染器。
 * @param {Object} stmt
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
function renderStatement(stmt, ctx) {
    const { command, opts, rest } = stmt;
    if (!command) return { html: '', math: false };
    if (IGNORE_COMMANDS[command]) return { html: '', math: false };
    switch (command) {
        case 'node': return renderNode(rest, opts, ctx);
        case 'coordinate':
        case 'path':
        case 'draw': registerCoords(rest, ctx, parsePoint); return renderDraw(rest, opts, ctx, false);
        case 'fill': return renderDraw(rest, opts, ctx, true, true);
        case 'filldraw': {
            // filldraw：既描边又填充。填充色优先用 fill 的，描边用 draw 的
            const o = parseOptions(opts);
            const fillColor = o.fill || DEFAULT_STROKE;
            return renderDraw(rest, opts, ctx, true, true, fillColor);
        }
        default:
            // 未知命令安全忽略（不抛错，避免整图降级）
            return { html: '', math: false };
    }
}

/**
 * 解析单段 TikZ 源码并生成 SVG 字符串。
 * @param {string} source
 * @returns {Promise<string>}
 */
async function buildPicture(source) {
    // 预处理（剥离 begin/end 包裹、剔除 % 注释）
    const normalized = preprocess(source);
    // 展开 foreach、执行 pgfmathsetmacro，得到扁平命令序列
    const script = expandScript(normalized);

    const ctx = createContext(script.vars);
    let body = '';
    let hasMath = false;

    for (const stmt of script.statements) {
        const frag = renderStatement(stmt, ctx);
        body += frag.html;
        if (frag.math) hasMath = true;
    }

    // 根据包围盒计算 viewBox，留 12px 内边距避免裁剪描边/文字
    const pad = 12;
    const minX = ctx.bounds.minX - pad;
    const minY = ctx.bounds.minY - pad;
    const pixW = ctx.bounds.maxX - ctx.bounds.minX + pad * 2;
    const pixH = ctx.bounds.maxY - ctx.bounds.minY + pad * 2;
    if (ctx.bounds.minX === Infinity) {
        // 空块 / 纯模板：无可绘制内容，返回空（不报错）
        return '';
    }
    if (!isFinite(minX) || !isFinite(minY) || pixW <= 0 || pixH <= 0) {
        throw new Error('图片范围无效（缺少有效坐标）');
    }

    let svgBody = body;
    // 含数学的节点文本：等待 KaTeX 并填充 <foreignObject>
    if (hasMath) {
        await ensureKatex();
        svgBody = fillMathInSvg(body);
    }

    return (
        '<svg class="tikz-svg" xmlns="http://www.w3.org/2000/svg" ' +
        'width="' + pixW + '" height="' + pixH + '" ' +
        'viewBox="' + minX + ' ' + minY + ' ' + pixW + ' ' + pixH + '" ' +
        'role="img" aria-label="TikZ 渲染结果">' +
        svgBody +
        '</svg>'
    );
}

/**
 * 准备容器内的 TikZ 代码块（替换为渲染占位 div <div class="tikz">）。
 * 必须在 sanitizeHtml 之后调用；返回是否检测到 tikz 代码块。
 * @param {HTMLElement} container
 * @returns {boolean}
 */
function prepareTikzBlocks(container) {
    if (!container) return false;
    const blocks = container.querySelectorAll('pre code[class*="language-tikz"]');
    if (!blocks.length) return false;
    blocks.forEach(function (code) {
        const source = code.textContent;
        const pre = code.closest('pre');
        if (!pre) return;
        const div = document.createElement('div');
        div.className = 'tikz';
        div.setAttribute('data-tikz', source);
        pre.replaceWith(div);
    });
    return true;
}

/**
 * 渲染容器内所有 .tikz 元素（异步）：解析 → 生成 SVG → 替换占位。
 * 单个元素解析失败只影响该元素（降级显示源码），不中断整体。
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
async function renderTikz(container) {
    if (!container) return;
    const nodes = container.querySelectorAll('.tikz');
    if (!nodes.length) return;
    for (const el of nodes) {
        const source = el.getAttribute('data-tikz') || '';
        try {
            el.innerHTML = await buildPicture(source);
        } catch (err) {
            // 降级：显示源码 + 错误提示，保留可用性（与 mermaid 一致）
            el.classList.add('tikz-error');
            el.innerHTML =
                '<pre><code>' + escapeHtml(source) + '</code></pre>' +
                '<div class="tikz-error-msg">TikZ 渲染失败: ' + escapeHtml(err.message) + '</div>';
        }
    }
}

export { prepareTikzBlocks, renderTikz };