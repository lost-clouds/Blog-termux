/**
 * @module tikz/node
 * @description 节点渲染：\node[(opts)] (name) at (x,y) {text}。
 *              支持锚点偏移、字体、填充/描边、数学文本。
 *              坐标约定：Y 向上；anchor 映射见 _anchorOffset。
 * @requires tikz/constants, tikz/color, tikz/options, tikz/expr, tikz/context, tikz/text
 */

'use strict';

import { PX_PER_UNIT, DEFAULT_STROKE, DEFAULT_NODE_FILL, MATH_SPLIT } from './constants.js';
import { resolveColor } from './color.js';
import { parseOptions } from './options.js';
import { parsePoint } from './expr.js';
import { expandBounds } from './context.js';
import { contentLen, plainText, escapeHtml } from './text.js';

/**
 * 渲染节点。
 * @param {string} rest
 * @param {string} opts
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
export function renderNode(rest, opts, ctx) {
    // 解析 (name) at (x,y) {text} 或 at (x,y) {text}
    let name = '';
    let atStr = '';
    let text = '';
    let tail = rest.trim();
    // 提取 {text}（可能含嵌套花括号，用配对匹配）
    const braceIdx = tail.indexOf('{');
    if (braceIdx !== -1) {
        const close = matchBrace(tail, braceIdx);
        text = tail.slice(braceIdx + 1, close);
        tail = tail.slice(0, braceIdx) + tail.slice(close + 1);
    }
    // (name)? at (x,y)
    const am = tail.match(/^\s*(?:\(([^)]*)\))?\s*(?:at\s+)?\(([^)]*)\)\s*$/);
    if (am) {
        if (am[1]) name = am[1].trim();
        atStr = am[2];
    } else {
        atStr = tail;
    }
    const pt = parsePoint(atStr, ctx);
    if (name && ctx.named) ctx.named[name] = [pt[0], pt[1]];

    const o = parseOptions(opts);
    const hasMath = MATH_SPLIT.test(text);
    MATH_SPLIT.lastIndex = 0;
    const html = nodeSvg(pt, o, text, hasMath, ctx);
    return { html: html, math: hasMath };
}

/**
 * 找出从 idx 开始（指向 {）的配对右花括号下标。
 * @param {string} s
 * @param {number} idx
 * @returns {number}
 */
function matchBrace(s, idx) {
    let d = 0;
    for (let i = idx; i < s.length; i++) {
        if (s[i] === '{') d++;
        else if (s[i] === '}') { d--; if (d === 0) return i; }
    }
    return idx;
}

/**
 * 构建节点 SVG。
 * @param {Array<number>} pt
 * @param {Object} o
 * @param {string} text
 * @param {boolean} hasMath
 * @param {Object} ctx
 * @returns {string}
 */
function nodeSvg(pt, o, text, hasMath, ctx) {
    const px = pt[0] * o.scale * PX_PER_UNIT;
    const py = -pt[1] * o.scale * PX_PER_UNIT; // TikZ Y 向上 → SVG Y 向下
    const off = anchorOffset(o.anchor, 8);
    const cx = px + off[0];
    const cy = py + off[1];

    const stroke = resolveColor(o.draw, DEFAULT_STROKE);
    const textColor = resolveColor(o.text || o.bareColor, DEFAULT_STROKE);
    const fs = o.fontSize;
    const fontWeight = o.fontBold ? 'bold' : 'normal';
    const innerSep = o.innerSep || 4;

    // 形状：圆形 或 矩形（默认）。仅当显式给出 draw/fill/圆形/矩形 才绘制。
    let shape = '';
    const wantBox = o.draw || o.fill || o.circle || o.rectangle;
    const tw = textWidth(text, fs) + innerSep * 2;
    const th = textHeight(text, fs) + innerSep * 2;

    // 无论是否有边框，节点渲染出的“实际显示范围”都必须计入 viewBox 包围盒
    // （旧代码只登记锚点中心会导致纯文本标签/长标签被裁剪，或包围盒塌缩成一个点）。
    expandBounds(ctx, cx - tw / 2 - 1, cy - th / 2 - 1, cx + tw / 2 + 1, cy + th / 2 + 1);

    if (o.circle && wantBox) {
        const r = Math.max(innerSep + 4, Math.max(tw, th) / 2 + 2);
        expandBounds(ctx, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);
        shape = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + resolveColor(o.fill, 'none') + '" stroke="' + stroke + '" stroke-width="1.4" />';
    } else if (wantBox) {
        const rx = o.rounded ? 5 : (o.rectangle ? 1 : 3);
        const fill = resolveColor(o.fill, DEFAULT_NODE_FILL);
        expandBounds(ctx, cx - tw / 2 - 1, cy - th / 2 - 1, cx + tw / 2 + 1, cy + th / 2 + 1);
        shape = '<rect x="' + (cx - tw / 2) + '" y="' + (cy - th / 2) + '" width="' + tw + '" height="' + th + '" rx="' + rx + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2" />';
    }

    return shape + labelSvg(cx, cy, text, fs, textColor, fontWeight, hasMath);
}

/**
 * 节点锚点偏移（SVG 坐标）。Y-up 下 "above" = +y(tikz) = SVG 向上 = [0,-d]。
 * @param {string} anchor
 * @param {number} d
 * @returns {Array<number>}
 */
function anchorOffset(anchor, d) {
    switch (anchor) {
        case 'above': return [0, -d];
        case 'below': return [0, d];
        case 'left': return [-d, 0];
        case 'right': return [d, 0];
        default: return [0, 0];
    }
}

/**
 * 估算文本宽度（基于有效显示长度），字符宽度系数 ~0.62 em。
 * @param {string} text
 * @param {number} fs
 * @returns {number}
 */
function textWidth(text, fs) {
    return Math.max(fs * 2, Math.ceil(fs * 0.62 * contentLen(text)));
}

/**
 * 估算文本高度：普通文本 1.35em；含数学 1.6em。
 * @param {string} text
 * @param {number} fs
 * @param {boolean} hasMath
 * @returns {number}
 */
function textHeight(text, fs, hasMath) {
    const h = hasMath ? fs * 1.6 : fs * 1.35;
    return Math.max(Math.ceil(h), fs + 4);
}

/**
 * 生成节点文本 SVG：普通文本用 <text>，含数学用 <foreignObject> 占位。
 * @param {number} cx
 * @param {number} cy
 * @param {string} text
 * @param {number} fs
 * @param {string} color
 * @param {string} fontWeight
 * @param {boolean} hasMath
 * @returns {string}
 */
function labelSvg(cx, cy, text, fs, color, fontWeight, hasMath) {
    if (!text) return '';
    if (hasMath) {
        // 用 foreignObject 承载 HTML（KaTeX 数学 + 纯文本），稍后填充。
        const w = Math.min(Math.max(textWidth(text, fs) + 8, fs * 2.5), 420);
        const h = textHeight(text, fs, true) + 4;
        return ('<foreignObject x="' + (cx - w / 2) + '" y="' + (cy - h / 2) + '" width="' + w + '" height="' + h + '"><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-math" data-math="' + escapeHtml(text) + '" style="text-align:center;line-height:' + h + 'px;font-size:' + fs + 'px;color:' + color + ';font-weight:' + fontWeight + ';overflow:hidden"></div></foreignObject>');
    }
    return ('<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="' + fs + '" font-family="sans-serif" font-weight="' + fontWeight + '" fill="' + color + '">' + escapeHtml(plainText(text)) + '</text>');
}