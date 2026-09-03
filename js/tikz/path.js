/**
 * @module tikz/path
 * @description 路径渲染编排：\draw/\fill/\filldraw rest。
 *              处理形状/函数图特型分发、行内 node 标签定位与描边填充语义；
 *              具体 SVG path 词法解析委托给 tikz/path-tokenizer。
 * @requires tikz/constants, tikz/color, tikz/options, tikz/expr, tikz/context, tikz/shapes, tikz/node, tikz/path-tokenizer
 */

'use strict';

import { PX_PER_UNIT, DEFAULT_STROKE } from './constants.js';
import { resolveColor } from './color.js';
import { parseOptions, lineWidth, dash } from './options.js';
import { parsePoint } from './expr.js';
import { picScale } from './context.js';
import { circleShape, rectangleShape, gridShape, plotShape, arrowHead } from './shapes.js';
import { renderNodeLabel } from './node.js';
import { tokenizePath } from './path-tokenizer.js';

/**
 * 提取路径 rest 中的行内 node[...] {text} 段。
 * 支持三种位置写法：node[...] {...}、node[...] at (x,y) {...}、
 * node[pos=0.5] {...}（pos/midway 由调用方结合 path 末段求解）。
 * @param {string} rest
 * @returns {{rest:string, nodes:Array<{opts:string, text:string, at:?string}>}}
 */
function extractInlineNodes(rest) {
    const nodes = [];
    let out = '';
    let i = 0;
    while (i < rest.length) {
        // 从 i 起查找 "node[opts]? [at (x,y)]? {text}"
        const m = /node\s*(\[[^\]]*\])?\s*(?:at\s*(\([^)]*\)))?\s*(\{\{?)/.exec(rest.slice(i));
        if (!m) {
            out += rest.slice(i);
            break;
        }
        const start = i + m.index;
        out += rest.slice(i, start);
        const braceAt = start + m[0].lastIndexOf('{');
        const opts = (m[1] || '').replace(/^\[|\]$/g, '');
        const atCoor = m[2] || null;
        const close = matchBrace(rest, braceAt);
        const text = rest.slice(braceAt + 1, close);
        const after = rest.slice(close + 1);
        // 吸收 node 段之后的 "at (x,y)"（若 regex 未捕获到）
        let at = atCoor ? atCoor.slice(1, -1) : null;
        let consumed = close + 1;
        if (!at) {
            const atM = /^\s*at\s+(\([^)]*\))/.exec(after);
            if (atM) {
                at = atM[1].slice(1, -1);
                consumed += atM[0].length;
            }
        }
        // 若 node 之后还有路径坐标（如 "a -- node{x} b"），该标签应贴所在线段中点
        const restAfter = rest.slice(consumed);
        let middle = false;
        if (!at && /^\s*\(\s*[^)]/.test(restAfter)) middle = true;
        nodes.push({ opts: opts, text: text, at: at, midBefore: middle });
        i = consumed;
    }
    const cleaned = out.replace(/\s{2,}/g, ' ').trim();
    return { rest: cleaned, nodes: nodes };
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
 * 根据路径首段生成 TikZ brace 装饰的 SVG path d。
 * 只支持单段路径（F.md 中 $(... ) -- $(... ) 的横向大括号）；
 * 多段路径或未识别时调用方会回退为普通折线。
 * 局部坐标 t ∈ [0,1] 沿线段方向；y 为垂直偏移（单位为 amplitude）。
 * 四个三次贝塞尔片段组成两个卷曲和中间尖端，视觉上接近 TikZ brace。
 * @param {Array<number>} seg - [x1,y1,x2,y2]（SVG 像素坐标）
 * @param {Object} o - parseOptions 结果
 * @returns {string}
 */
function bracePathD(seg, o) {
    const x1 = seg[0],
        y1 = seg[1],
        x2 = seg[2],
        y2 = seg[3];
    const dx = x2 - x1,
        dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return '';
    const amp = (o.braceAmplitude != null ? o.braceAmplitude : 5 / 28.452756) * PX_PER_UNIT;
    const raise = (o.braceRaise || 0) * PX_PER_UNIT;
    const ux = dx / len,
        uy = dy / len;
    // SVG y 向下；水平线左→右时法向为 (0,1)（下方）。
    // TikZ 默认 brace 在路径上方，mirror 则翻到下方。
    let nx = -uy,
        ny = ux;
    if (!o.braceMirror) {
        nx = -nx;
        ny = -ny;
    }
    // 四个三次贝塞尔片段在局部坐标 (t,y) 下的端点/控制点
    const segments = [
        [0, 0, 0.08, 0.85, 0.22, 0.85, 0.3, 0.35],
        [0.3, 0.35, 0.38, -0.12, 0.46, 0.45, 0.5, 1.0],
        [0.5, 1.0, 0.54, 0.45, 0.62, -0.12, 0.7, 0.35],
        [0.7, 0.35, 0.78, 0.85, 0.92, 0.85, 1.0, 0],
    ];
    /**
     * 把局部参数 (t,y) 映射为 SVG 坐标点。
     * @param {number} t - 沿线方向 0..1
     * @param {number} y - 垂直偏移（amplitude 倍数）
     * @returns {Array<number>}
     */
    function pt(t, y) {
        return [
            x1 + ux * t * len + nx * (amp * y + raise),
            y1 + uy * t * len + ny * (amp * y + raise),
        ];
    }
    let d = '';
    segments.forEach(function (segDef, idx) {
        const p0 = pt(segDef[0], segDef[1]);
        const c1 = pt(segDef[2], segDef[3]);
        const c2 = pt(segDef[4], segDef[5]);
        const p1 = pt(segDef[6], segDef[7]);
        if (idx === 0) {
            // 首段显式 moveto；后续段沿用上一段终点作为当前点
            d = 'M' + p0[0] + ' ' + p0[1];
        }
        d += 'C' + c1[0] + ' ' + c1[1] + ' ' + c2[0] + ' ' + c2[1] + ' ' + p1[0] + ' ' + p1[1];
    });
    return d;
}

/**
 * 渲染一条路径/绘图命令。
 * @param {string} rest
 * @param {string} opts
 * @param {Object} ctx
 * @param {boolean} filled
 * @param {boolean} isFill
 * @param {?string} fillOverride
 * @returns {{html:string, math:boolean}}
 */
export function renderDraw(rest, opts, ctx, filled, isFill, fillOverride) {
    const o = parseOptions(opts);
    // render.js 中 fill 与 filldraw 都传 isFill=true；用 fillOverride 是否显式传入
    // 来区分二者：filldraw 一定带 fillOverride，fill 不带。
    const isFillOnly = isFill === true && fillOverride === undefined;
    const extracted = extractInlineNodes(rest);
    const drawRest = extracted.rest || '';

    // 依次生成行内 node 标签（定位由调用方按图形/路径几何给出）。
    // pt 为 tikz 单位，renderNodeLabel 内部再乘 scale。
    /**
     * 渲染该路径/图形的所有行内 node 标签。
     * @param {Array<number>} defaultPt - 标签默认锚点（tikz 单位）
     * @returns {{html:string, math:boolean}}
     */
    function inlineLabels(defaultPt) {
        let html = '';
        let hasMath = false;
        for (const nd of extracted.nodes) {
            const atPt = nd.at ? parsePoint(nd.at, ctx) : defaultPt;
            const frag = renderNodeLabel(atPt, nd.opts, nd.text, ctx);
            html += frag.html;
            if (frag.math) hasMath = true;
        }
        return { html: html, math: hasMath };
    }

    const shapeMatch = /\(([^)]*)\)\s*(circle|rectangle|grid)\s*\(([^)]*)\)/i.exec(drawRest);
    if (shapeMatch) {
        const kind = shapeMatch[2];
        let fr;
        let center = [0, 0];
        if (kind === 'circle') {
            // \fill 只填充不描边；\filldraw 与 \draw 保持描边（裸颜色即描边色）。
            const strokeOverride = isFillOnly && !o.draw ? 'none' : undefined;
            fr = circleShape(drawRest, o, ctx, isFill || filled, fillOverride || o.fill, strokeOverride);
            center = parsePoint(shapeMatch[1], ctx);
        } else if (kind === 'rectangle') {
            const strokeOverride = isFillOnly && !o.draw ? 'none' : undefined;
            fr = rectangleShape(drawRest, o, ctx, isFill || filled, strokeOverride);
            const a = parsePoint(shapeMatch[1], ctx),
                b = parsePoint(shapeMatch[3], ctx);
            center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        } else {
            fr = gridShape(drawRest, o, ctx, isFill || filled, fillOverride || o.fill);
            const a = parsePoint(shapeMatch[1], ctx),
                b = parsePoint(shapeMatch[3], ctx);
            center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        }
        const lab = inlineLabels(center);
        return { html: fr.html + lab.html, math: lab.math };
    }

    if (/\bplot\b/.test(drawRest)) {
        const fr = plotShape(drawRest, o, ctx);
        const lab = inlineLabels([0, 0]);
        return { html: fr.html + lab.html, math: lab.math };
    }

    const path = tokenizePath(drawRest, o, ctx);
    if (!path || !path.d) return { html: '', math: false };
    // 描边颜色：\draw[red] / \filldraw[red] 用裸颜色描边；
    // \fill[red] 只填充不描边（显式 draw=... 除外，兼容 TikZ \path[fill,draw] 写法）。
    const strokeCol = o.draw || (o.bareColor && !isFillOnly ? o.bareColor : null);
    const fillCol = fillOverride || o.fill || (o.bareColor && isFill ? o.bareColor : null);
    const stroke = resolveColor(isFillOnly && !o.draw ? 'none' : strokeCol, DEFAULT_STROKE);
    const fill = resolveColor(fillCol, isFill ? DEFAULT_STROKE : 'none');
    const sw = lineWidth(o);
    const dsh = dash(o);
    // brace 装饰：优先绘制大括号路径；无法生成时回退普通路径，避免整图降级
    const braceD = o.brace && path.firstSeg ? bracePathD(path.firstSeg, o) : '';
    const d = braceD || path.d + (path.closed ? 'Z' : '');
    let out =
        '<path d="' +
        d +
        '" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="' +
        sw +
        '" stroke-linecap="round" stroke-linejoin="round"' +
        (dsh ? ' stroke-dasharray="' + dsh + '"' : '') +
        ' />';
    // 箭头：arrowHead(from, to) 从 from 指向 to，终点在 to。e2 为末段 [x1,y1,x2,y2]，
    // 需取末段终点 (x2,y2)；回箭头取首段起点。旧代码误把整段数组当 [x,y] 点传，
    // 导致单段路径 dx=dy=0 → 箭头永不绘制（本例中所有 -> 都缺箭头）。
    if (o.arrow && path.e2)
        out += arrowHead([path.e2[0], path.e2[1]], [path.e2[2], path.e2[3]], stroke);
    if (o.arrowBack && path.s1)
        out += arrowHead([path.s1[2], path.s1[3]], [path.s1[0], path.s1[1]], stroke);

    // 行内 node 标签：无 pos/midway 时贴末点（默认），有 pos 时沿末段插值
    let labelHtml = '';
    let hasMath = false;
    for (const nd of extracted.nodes) {
        const no = parseOptions(nd.opts);
        let pt = null;
        if (nd.at) {
            pt = parsePoint(nd.at, ctx);
        } else if (nd.midBefore && path.firstSeg) {
            // 形如 "a -- node{...} b"：标签贴 node 前一线段的中点
            const s = path.firstSeg;
            const sc = o.scale * picScale(ctx) * PX_PER_UNIT;
            pt = [(s[0] + (s[2] - s[0]) * 0.5) / sc, -(s[1] + (s[3] - s[1]) * 0.5) / sc];
        } else if (no.pos != null && path.lastSeg) {
            const s = path.lastSeg; // [x1px,y1px,x2px,y2px]
            const t = no.pos;
            // 换算回 tikz 单位（nodeSvg 会再乘 scale）
            const sc = o.scale * picScale(ctx) * PX_PER_UNIT;
            pt = [(s[0] + (s[2] - s[0]) * t) / sc, -(s[1] + (s[3] - s[1]) * t) / sc];
        } else if (path.lastSeg) {
            const s = path.lastSeg;
            const sc = o.scale * picScale(ctx) * PX_PER_UNIT;
            pt = [s[2] / sc, -s[3] / sc];
        } else {
            pt = [0, 0];
        }
        const frag = renderNodeLabel(pt, nd.opts, nd.text, ctx);
        labelHtml += frag.html;
        if (frag.math) hasMath = true;
    }
    return { html: out + labelHtml, math: hasMath };
}

