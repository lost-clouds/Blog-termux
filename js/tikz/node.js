/**
 * @module tikz/node
 * @description 节点渲染：\node[(opts)] (name) at (x,y) {text}。
 *              支持相对定位（below=of X / right=<len> of X）、样式应用、
 *              锚点偏移、字体、填充/描边、数学文本、最小尺寸。
 *              坐标约定：Y 向上；anchor 映射见 _anchorOffset。
 *              渲染后把节点几何盒注册进 ctx.boxes，供相对定位/锚点引用。
 * @requires tikz/constants, tikz/color, tikz/options, tikz/expr, tikz/context, tikz/text, tikz/units
 */

'use strict';

import { PX_PER_UNIT, DEFAULT_STROKE, DEFAULT_NODE_FILL, MATH_SPLIT } from './constants.js';
import { resolveColor } from './color.js';
import { parseOptions, splitOpts } from './options.js';
import { parsePoint } from './expr.js';
import { expandBounds, registerBox, picScale } from './context.js';
import { contentLen, plainText, escapeHtml } from './text.js';
import { parseLength } from './units.js';

/**
 * 渲染节点。
 * @param {string} rest
 * @param {string} opts
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
export function renderNode(rest, opts, ctx) {
    // 解析 {text}（可能含嵌套花括号）+ (name) + at 位置
    const parsed = parseNodeHeader(rest);
    let pt = null;
    // 相对定位：below=of X → 以自身半宽高 + 参考盒计算
    if (parsed.at === null && opts && hasRelativePos(opts, ctx)) {
        pt = resolveRelative(parsed.text, opts, ctx);
    } else {
        pt = parsed.at !== null ? parsePoint(parsed.at, ctx) : [0, 0];
    }
    // 应用 xshift/yshift（仅相对定位时由 resolveRelative 内部叠加，这里兜底绝对值）
    if (parsed.at !== null) {
        const o = mergeNodeOptions(opts, ctx);
        pt[0] += o.xshift || 0;
        pt[1] += o.yshift || 0;
    }

    const o = mergeNodeOptions(opts, ctx);
    const hasMath = MATH_SPLIT.test(parsed.text);

    // 计算自身几何盒（半宽高，TikZ 单位），并注册供后续相对定位/锚点使用。
    // 盒子 px 尺寸不随整图 scale 缩放（TikZ 语义：scale 缩放坐标体系而非文字），
    // 因此换算回 TikZ 单位时要除以 picScale，保证 below=of 等相对偏移与像素一致。
    const dims = nodeDims(parsed.text, o, hasMath);
    const ps = picScale(ctx);
    const halfW = dims.w / (2 * PX_PER_UNIT * ps);
    const halfH = dims.h / (2 * PX_PER_UNIT * ps);
    if (parsed.name) registerBox(ctx, parsed.name, pt[0], pt[1], halfW, halfH);
    else ctx.named[''] = [pt[0], pt[1]];

    const html = nodeSvg(pt, o, parsed.text, hasMath, ctx, dims);
    return { html: html, math: hasMath };
}

/**
 * 渲染"路径上的节点"标签（如 \\draw ... node[right] {$x$}）。
 * @param {Array<number>} pt - [x,y]（tikz 单位，Y 向上）
 * @param {string} opts - 节点选项串
 * @param {string} text
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
export function renderNodeLabel(pt, opts, text, ctx) {
    const o = mergeNodeOptions(opts, ctx);
    const hasMath = MATH_SPLIT.test(text);
    const dims = nodeDims(text, o, hasMath);
    return { html: nodeSvg(pt, o, text, hasMath, ctx, dims), math: hasMath };
}

/**
 * 解析节点头部：(name)? [at (coords)]? {text}。
 * @param {string} rest
 * @returns {{name:string, at:string|null, text:string}}
 */
function parseNodeHeader(rest) {
    let tail = rest.trim();
    let text = '';
    const braceIdx = tail.indexOf('{');
    if (braceIdx !== -1) {
        const close = matchBrace(tail, braceIdx);
        text = tail.slice(braceIdx + 1, close);
        tail = tail.slice(0, braceIdx) + ' ' + tail.slice(close + 1);
    }
    const am = tail.match(/^\s*\(([^)]*)\)\s*(?:at\s+\(\s*([^)]*)\s*\))?\s*$/);
    let name = '',
        at = null;
    if (am) {
        name = (am[1] || '').trim();
        at = am[2] != null ? am[2].trim() : null;
    } else {
        // 仅为 at (x,y)，无命名
        const am2 = tail.match(/^\s*at\s*\(\s*([^)]*)\s*\)\s*$/);
        if (am2) {
            at = am2[1].trim();
        }
    }
    return { name: name, at: at, text: text };
}

/**
 * 合并样式与选项：把 opts 中的样式名（来自 ctx.styles）展开为样式体，
 * 再与显式选项合并（显式优先）。返回 parseOptions 结果。
 * @param {string} opts
 * @param {Object} ctx
 * @returns {Object}
 */
function mergeNodeOptions(opts, ctx) {
    let merged = opts || '';
    const styles = ctx && ctx.styles;
    if (styles) {
        // 逐段展开：命中的样式段替换为其定义（可嵌套），其余保留
        merged = splitOpts(merged)
            .map(function (seg) {
                const name = seg.trim();
                if (styles[name]) return styles[name];
                return seg;
            })
            .join(',');
    }
    const o = parseOptions(merged);
    // 显式选项里若有 posRef 的相对距离 posLen，转成 TikZ 单位
    if (o.posLen != null) o.posDist = parseLength(o.posLen);
    return o;
}

/**
 * 判断选项是否含相对定位（below=of X 等）。
 * @param {string} opts
 * @param {Object} ctx
 * @returns {boolean}
 */
function hasRelativePos(opts, ctx) {
    return mergeNodeOptions(opts, ctx).posRef != null;
}

/**
 * 计算相对定位坐标：以参考节点盒的对应边为基准，加上 node distance 与自身半尺寸。
 * Y 向上：below = -Y，above = +Y，right = +X，left = -X。
 * @param {string} text - 自身文本，用于 nodeDims 计算自身尺寸以便相对定位
 * @param {string} opts
 * @param {Object} ctx
 * @returns {Array<number>}
 */
function resolveRelative(text, opts, ctx) {
    const o = mergeNodeOptions(opts, ctx);
    const ref = ctx.boxes && ctx.boxes[o.posRef];
    if (!ref) return [0, 0];
    const dims = nodeDims(text, o, MATH_SPLIT.test(text));
    const ps = picScale(ctx);
    const hw = dims.w / (2 * PX_PER_UNIT * ps);
    const hh = dims.h / (2 * PX_PER_UNIT * ps);
    const nd = o.posDist != null ? o.posDist : ctx.options.nodeDistance;
    // 参考盒的边坐标（TikZ 单位）
    let x = ref.x,
        y = ref.y;
    if (o.posDir === 'right') x = ref.x + ref.hw + nd + hw;
    else if (o.posDir === 'left') x = ref.x - ref.hw - nd - hw;
    else if (o.posDir === 'above') y = ref.y + ref.hh + nd + hh;
    else if (o.posDir === 'below') y = ref.y - ref.hh - nd - hh;
    x += o.xshift || 0;
    y += o.yshift || 0;
    return [x, y];
}

/**
 * 计算节点显示尺寸（px）：文本宽高 + 内边距，含最小宽高约束。
 * @param {string} text
 * @param {Object} o
 * @param {boolean} hasMath
 * @returns {{w:number, h:number}}
 */
function nodeDims(text, o, hasMath) {
    const fs = o.fontSize;
    const innerSep = o.innerSep || 4;
    let w = textWidth(text, fs) + innerSep * 2;
    let h = textHeight(text, fs, hasMath) + innerSep * 2;
    const minW = o.minWidth != null ? o.minWidth * PX_PER_UNIT : 0;
    const minH = o.minHeight != null ? o.minHeight * PX_PER_UNIT : 0;
    if (minW > w) w = minW;
    if (minH > h) h = minH;
    return { w: w, h: h };
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
        else if (s[i] === '}') {
            d--;
            if (d === 0) return i;
        }
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
 * @param {Object} dims - {w,h}
 * @returns {string}
 */
function nodeSvg(pt, o, text, hasMath, ctx, dims) {
    const px = pt[0] * o.scale * picScale(ctx) * PX_PER_UNIT;
    const py = -pt[1] * o.scale * picScale(ctx) * PX_PER_UNIT; // TikZ Y 向上 → SVG Y 向下
    const off = anchorOffset(o.anchor, 8);
    const cx = px + off[0];
    const cy = py + off[1];

    const stroke = resolveColor(o.draw, DEFAULT_STROKE);
    const textColor = resolveColor(o.text || o.bareColor, DEFAULT_STROKE);
    const fs = o.fontSize;
    const fontWeight = o.fontBold ? 'bold' : 'normal';
    const innerSep = o.innerSep || 4;
    const tw = dims.w,
        th = dims.h;

    // 形状：圆形 或 矩形（默认）。仅当显式给出 draw/fill/圆形/矩形 才绘制。
    let shape = '';
    const wantBox = o.draw || o.fill || o.circle || o.rectangle;
    expandBounds(ctx, cx - tw / 2 - 1, cy - th / 2 - 1, cx + tw / 2 + 1, cy + th / 2 + 1);

    if (o.circle && wantBox) {
        const r = Math.max(innerSep + 4, Math.max(tw, th) / 2 + 2);
        expandBounds(ctx, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);
        shape =
            '<circle cx="' +
            cx +
            '" cy="' +
            cy +
            '" r="' +
            r +
            '" fill="' +
            resolveColor(o.fill, 'none') +
            '" stroke="' +
            stroke +
            '" stroke-width="1.4" />';
    } else if (wantBox) {
        const rx = o.rounded ? 5 : o.rectangle ? 1 : 3;
        const fill = resolveColor(o.fill, DEFAULT_NODE_FILL);
        shape =
            '<rect x="' +
            (cx - tw / 2) +
            '" y="' +
            (cy - th / 2) +
            '" width="' +
            tw +
            '" height="' +
            th +
            '" rx="' +
            rx +
            '" fill="' +
            fill +
            '" stroke="' +
            stroke +
            '" stroke-width="1.2" />';
    }

    return shape + labelSvg(cx, cy, text, fs, textColor, fontWeight, hasMath, tw, th);
}

/**
 * 节点锚点偏移（SVG 坐标）。Y-up 下 "above" = +y(tikz) = SVG 向上 = [0,-d]。
 * 支持组合锚点："above right"、"below left" 等。
 * @param {string} anchor
 * @param {number} d
 * @returns {Array<number>}
 */
function anchorOffset(anchor, d) {
    if (!anchor) return [0, 0];
    let x = 0,
        y = 0;
    if (anchor.indexOf('above') !== -1) y -= d;
    if (anchor.indexOf('below') !== -1) y += d;
    if (anchor.indexOf('left') !== -1) x -= d;
    if (anchor.indexOf('right') !== -1) x += d;
    return [x, y];
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
 * @param {number} tw
 * @param {number} th
 * @returns {string}
 */
function labelSvg(cx, cy, text, fs, color, fontWeight, hasMath, tw, th) {
    if (!text) return '';
    if (hasMath) {
        const w = Math.min(Math.max(tw + 8, fs * 2.5), 420);
        const h = Math.max(th, fs + 4) + 4;
        return (
            '<foreignObject x="' +
            (cx - w / 2) +
            '" y="' +
            (cy - h / 2) +
            '" width="' +
            w +
            '" height="' +
            h +
            '"><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-math" data-math="' +
            escapeHtml(text) +
            '" style="text-align:center;line-height:' +
            h +
            'px;font-size:' +
            fs +
            'px;color:' +
            color +
            ';font-weight:' +
            fontWeight +
            ';overflow:hidden"></div></foreignObject>'
        );
    }
    return (
        '<text x="' +
        cx +
        '" y="' +
        cy +
        '" text-anchor="middle" dominant-baseline="central" font-size="' +
        fs +
        '" font-family="sans-serif" font-weight="' +
        fontWeight +
        '" fill="' +
        color +
        '">' +
        escapeHtml(plainText(text)) +
        '</text>'
    );
}
