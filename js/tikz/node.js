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

import { PX_PER_UNIT, DEFAULT_STROKE, DEFAULT_NODE_FILL } from './constants.js';
import { resolveColor } from './color.js';
import { parseOptions, splitOpts } from './options.js';
import { parsePoint } from './expr.js';
import { expandBounds, registerBox, picScale, transformTikzPoint } from './context.js';
import { displayWidth, hasMathText, lineCount, normalizeText, plainText, escapeHtml } from './text.js';
import { parseLength } from './units.js';

/**
 * 渲染节点。
 * @param {string} rest
 * @param {string} opts
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
export function renderNode(rest, opts, ctx) {
    // 解析 {text}（可能含嵌套花括号）+ (name) + at 位置；文本先做换行规范化
    const parsed = parseNodeHeader(rest);
    const text = normalizeText(parsed.text);
    let pt = null;
    const relative = parsed.at === null && opts && hasRelativePos(opts, ctx);
    // 相对定位：below=of X → 以自身半宽高 + 参考盒计算
    if (relative) {
        pt = resolveRelative(text, opts, ctx);
        // scope 变换同样作用于相对定位结果（平移/旋转 scope 内的流程图）
        pt = transformTikzPoint(ctx, pt[0], pt[1]);
    } else if (parsed.at !== null) {
        // parsePoint 内部已应用当前 scope 变换
        pt = parsePoint(parsed.at, ctx);
    } else {
        // 无 at 的节点默认位于原点；原点也属于局部坐标，需要经过 scope 变换
        pt = transformTikzPoint(ctx, 0, 0);
    }
    // 应用 xshift/yshift（仅相对定位时由 resolveRelative 内部叠加，这里兜底绝对值）
    if (parsed.at !== null) {
        const o = mergeNodeOptions(opts, ctx);
        pt[0] += o.xshift || 0;
        pt[1] += o.yshift || 0;
    }

    const o = mergeNodeOptions(opts, ctx);
    // 计算自身几何盒（半宽高，TikZ 单位），并注册供后续相对定位/锚点使用。
    // 盒子 px 尺寸不随整图 scale 缩放（TikZ 语义：scale 缩放坐标体系而非文字），
    // 因此换算回 TikZ 单位时要除以 picScale，保证 below=of 等相对偏移与像素一致。
    // 圆形节点使用“实际绘制半径”作为盒半径，使边框偏移 / 锚点与圆边对齐。
    const box = nodeBoxDims(text, o, ctx);
    if (parsed.name) registerBox(ctx, parsed.name, pt[0], pt[1], box.hw, box.hh);
    else ctx.named[''] = [pt[0], pt[1]];

    const html = nodeSvg(pt, o, text, box.hasMath, ctx, box.dims);
    return { html: html, math: box.hasMath };
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
    const t = normalizeText(text);
    const hasMath = hasMathText(t);
    const dims = nodeDims(t, o, hasMath);
    return { html: nodeSvg(pt, o, t, hasMath, ctx, dims), math: hasMath };
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
 * 统一计算节点的显示尺寸与盒半宽高（TikZ 单位）。
 * 圆形节点与矩形节点的盒模型都从同一入口生成，避免相对定位、路径边框偏移、
 * 锚点引用三处各自计算而出现半径/半宽不一致的问题。
 * @param {string} text
 * @param {Object} o
 * @param {Object} ctx
 * @returns {{dims:Object, hw:number, hh:number, hasMath:boolean}}
 */
function nodeBoxDims(text, o, ctx) {
    const hasMath = hasMathText(text);
    const dims = nodeDims(text, o, hasMath);
    const ps = picScale(ctx);
    if (o.circle) {
        const r = circleRadiusPx(o, dims);
        return { dims: dims, hw: r / (PX_PER_UNIT * ps), hh: r / (PX_PER_UNIT * ps), hasMath: hasMath };
    }
    return {
        dims: dims,
        hw: dims.w / (2 * PX_PER_UNIT * ps),
        hh: dims.h / (2 * PX_PER_UNIT * ps),
        hasMath: hasMath,
    };
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
    const box = nodeBoxDims(text, o, ctx);
    const hw = box.hw;
    const hh = box.hh;
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
 * 计算圆形节点的绘制半径（px）。圆形节点与其几何盒共享此公式，
 * 保证"绘制半径 == 盒半宽"，使边框偏移 / 锚点与圆边严格一致。
 * +1 的余量保证圆恰好包住文本；旧值 +2 会把相邻圆（间距 1 单位 = 32px）
 * 撑到共边甚至叠加（example.md 15.7 的圆圈链）。
 * @param {Object} o - parseOptions 结果
 * @param {{w:number,h:number}} dims - nodeDims 结果
 * @returns {number}
 */
function circleRadiusPx(o, dims) {
    const innerSep = o.innerSep || 4;
    return Math.max(innerSep + 1, Math.max(dims.w, dims.h) / 2 + 1);
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
    // 锚点偏移：优先用带距离的锚点（below=0.4cm → o.anchorDist），默认 8px
    const off = anchorOffset(o.anchor, o.anchorDist != null ? o.anchorDist : 8);
    const cx = px + off[0];
    const cy = py + off[1];

    const stroke = resolveColor(o.draw, DEFAULT_STROKE);
    const textColor = resolveColor(o.text || o.bareColor, DEFAULT_STROKE);
    const fs = o.fontSize;
    const fontWeight = o.fontBold ? 'bold' : 'normal';
    const tw = dims.w,
        th = dims.h;

    // 形状：圆形 或 矩形（默认）。仅当显式给出 draw/fill/圆形/矩形 才绘制。
    let shape = '';
    const wantBox = o.draw || o.fill || o.circle || o.rectangle;
    expandBounds(ctx, cx - tw / 2 - 1, cy - th / 2 - 1, cx + tw / 2 + 1, cy + th / 2 + 1);

    if (o.circle && wantBox) {
        // 半径与盒模型共用 circleRadiusPx，保证绘制圆边 == 盒半宽（audit：元素叠加/大小异常）
        const r = circleRadiusPx(o, dims);
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
 * 估算文本宽度（px）：纯文本 0.62em/字符（CJK 加权 1.4），
 * 数学片段 0.55em/字符 + 0.3em 余量，多行取最长行（见 text.displayWidth）。
 * 空文本宽度为 0（节点只剩内边距，避免空节点被撑成 31px 大圆点）。
 * 旧实现的"全文 ×1.8 + 2em"会把含 ASCII 公式（a^2+b^2=c^2）的节点
 * 估得过宽，导致相邻数学节点横向重叠（example.md 15.9 两框合并）。
 * @param {string} text
 * @param {number} fs
 * @returns {number}
 */
function textWidth(text, fs) {
    return displayWidth(text, fs);
}

/**
 * 估算文本高度：每行 1em；含数学再补 1em（分式/根号/上下标可达 2em）。
 * 空文本高度为 0（与 textWidth 同理）。
 * @param {string} text
 * @param {number} fs
 * @param {boolean} hasMath
 * @returns {number}
 */
function textHeight(text, fs, hasMath) {
    const lines = lineCount(text);
    if (lines === 0) return 0;
    return Math.ceil(fs * (lines + (hasMath ? 1 : 0)));
}

/**
 * 生成节点文本 SVG：普通文本用 <text>（多行用 <tspan>），含数学用 <foreignObject> 占位。
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
        // 宽高按渲染余量放宽（tw 已含数学放大），去 overflow:hidden，
        // 防 KaTeX 实际内容被 foreignObject 裁剪/与相邻元素互相遮挡（audit B 修复）。
        // line-height 用 1.4（不用 th 固定值），多行数学/文本才不会被挤压成一行。
        const w = Math.min(Math.max(tw + 16, fs * 4), 1000);
        const h = Math.max(th + 6, fs * 2.4);
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
            '" style="text-align:center;line-height:1.4;font-size:' +
            fs +
            'px;color:' +
            color +
            ';font-weight:' +
            fontWeight +
            '"></div></foreignObject>'
        );
    }
    // 多行：拆分为 tspan，逐行下移 1em（`\\\\` 已在 renderNode 规范化为 \n）
    const lines = text.split('\n');
    if (lines.length > 1) {
        const lh = fs; // 行高 1em
        const startY = cy - ((lines.length - 1) * lh) / 2;
        let body = '';
        for (let i = 0; i < lines.length; i++) {
            body +=
                '<tspan x="' +
                cx +
                '"' +
                (i > 0 ? ' dy="' + lh + '"' : '') +
                '>' +
                escapeHtml(plainText(lines[i])) +
                '</tspan>';
        }
        return (
            '<text x="' +
            cx +
            '" y="' +
            startY +
            '" text-anchor="middle" dominant-baseline="central" font-size="' +
            fs +
            '" font-family="sans-serif" font-weight="' +
            fontWeight +
            '" fill="' +
            color +
            '">' +
            body +
            '</text>'
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
