/**
 * @module tikz/path
 * @description 路径渲染：\draw/\fill rest。处理 -- 直线、.. controls ..、cycle、
 *              circle/rectangle/grid/plot 特型分发，以及行内 node[...] 标签。
 * @requires tikz/constants, tikz/color, tikz/options, tikz/expr, tikz/context, tikz/shapes, tikz/node
 */

'use strict';

import { PX_PER_UNIT, DEFAULT_STROKE } from './constants.js';
import { resolveColor } from './color.js';
import { parseOptions, lineWidth, dash } from './options.js';
import { parsePoint } from './expr.js';
import { expandBounds, picScale } from './context.js';
import { circleShape, rectangleShape, gridShape, plotShape, arrowHead } from './shapes.js';
import { renderNodeLabel } from './node.js';
import { parseLength } from './units.js';

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
            fr = circleShape(drawRest, o, ctx, isFill || filled, fillOverride || o.fill);
            center = parsePoint(shapeMatch[1], ctx);
        } else if (kind === 'rectangle') {
            fr = rectangleShape(drawRest, o, ctx, isFill || filled);
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
    const strokeCol = o.draw || (o.bareColor && !isFill ? o.bareColor : null);
    const fillCol = fillOverride || o.fill || (o.bareColor && isFill ? o.bareColor : null);
    const stroke = resolveColor(strokeCol, DEFAULT_STROKE);
    const fill = resolveColor(fillCol, isFill ? DEFAULT_STROKE : 'none');
    const sw = lineWidth(o);
    const dsh = dash(o);
    const d = path.d + (path.closed ? 'Z' : '');
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

/**
 * 解析路径为 SVG path d 数据。
 * 支持 -- 直线、arc、.. controls ..、cycle。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @returns {Object|null} {d, closed, s1, s2, e1, e2, lastSeg}
 */
function tokenizePath(rest, o, ctx) {
    const raw = rest.replace(/^\s*\\?[a-zA-Z]+\b/, '').trim();
    if (!raw) return null;
    let cur = null;
    let d = '';
    let closed = false;
    let firstSeg = null;
    let lastSeg = null;
    const scale = (o.scale || 1) * picScale(ctx);
    // TikZ Y 轴向上，SVG Y 轴向下 → y 取负，保证绘图与网格/坐标轴对齐。
    const XP = function (p) {
        return p[0] * scale * PX_PER_UNIT;
    };
    const YP = function (p) {
        return -p[1] * scale * PX_PER_UNIT;
    };

    let i = 0;
    const n = raw.length;
    while (i < n) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === '(') {
            const close = findCloseParen(raw, i);
            const pt = parsePoint(raw.slice(i + 1, close), ctx);
            expandBounds(ctx, XP(pt), YP(pt));
            if (cur === null) {
                d += 'M' + XP(pt) + ' ' + YP(pt);
                cur = pt;
            } else {
                d += 'L' + XP(pt) + ' ' + YP(pt);
                const seg = [XP(cur), YP(cur), XP(pt), YP(pt)];
                if (!firstSeg) firstSeg = seg;
                lastSeg = seg;
            }
            i = close + 1;
            continue;
        }
        if (ch === '.' && raw[i + 1] === '.') {
            const cm =
                /^\.\.\s*controls\s*\(([^)]*)\)(?:\s*and\s*\(([^)]*)\))?\s*\.\.\s*\(([^)]*)\)/.exec(
                    raw.slice(i)
                );
            if (cm && cur) {
                const c1 = parsePoint(cm[1], ctx);
                const c2c = cm[2] ? parsePoint(cm[2], ctx) : null;
                const q = parsePoint(cm[3], ctx);
                expandBounds(ctx, XP(c1), YP(c1), XP(q), YP(q));
                d += c2c
                    ? 'C' +
                      XP(c1) +
                      ' ' +
                      YP(c1) +
                      ' ' +
                      XP(c2c) +
                      ' ' +
                      YP(c2c) +
                      ' ' +
                      XP(q) +
                      ' ' +
                      YP(q)
                    : 'Q' + XP(c1) + ' ' + YP(c1) + ' ' + XP(q) + ' ' + YP(q);
                const seg = [XP(cur), YP(cur), XP(q), YP(q)];
                if (!firstSeg) firstSeg = seg;
                lastSeg = seg;
                cur = q;
                i += cm[0].length;
                continue;
            }
            i += 2;
            continue;
        }
        // arc：从当前点 (cur) 出发，以 start:end:radius 画圆弧。
        // 圆心 C = cur - r·(cos a1, sin a1)（TikZ 角度逆时针，Y 向上）；
        // 端点 Q = C + r·(cos a2, sin a2)。用折线采样近似（与 plot 同思路），
        // 避免 SVG arc 大弧/扫掠标志的朝向换算错误。
        if (raw.slice(i, i + 3) === 'arc' && cur) {
            const am = /^arc\s*\(\s*([-0-9.]+)\s*:\s*([-0-9.]+)\s*:\s*([^{}()]+)\s*\)/.exec(
                raw.slice(i)
            );
            if (am) {
                const a1 = (parseFloat(am[1]) * Math.PI) / 180;
                const a2 = (parseFloat(am[2]) * Math.PI) / 180;
                const rr = parseLengthArc(am[3], ctx);
                const cx = cur[0] - rr * Math.cos(a1);
                const cy = cur[1] - rr * Math.sin(a1);
                const N = 24;
                let prev = cur;
                for (let k = 1; k <= N; k++) {
                    const a = a1 + ((a2 - a1) * k) / N;
                    const q = [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
                    d += 'L' + XP(q) + ' ' + YP(q);
                    expandBounds(ctx, XP(q), YP(q));
                    prev = q;
                }
                const seg = [XP(cur), YP(cur), XP(prev), YP(prev)];
                if (!firstSeg) firstSeg = seg;
                lastSeg = seg;
                cur = prev;
                i += am[0].length;
                continue;
            }
        }
        if (raw.slice(i, i + 5) === 'cycle') {
            closed = true;
            d += 'Z';
            i += 5;
            continue;
        }
        if (ch === '-' || ch === '<' || ch === '>') {
            i++;
            while (i < n && /[-<->]/.test(raw[i])) i++;
            continue;
        }
        i++;
    }
    if (!d) return null;
    return {
        d: d,
        closed: closed,
        s1: firstSeg,
        s2: lastSeg,
        e1: firstSeg,
        e2: lastSeg,
        lastSeg: lastSeg,
        firstSeg: firstSeg,
    };
}

/**
 * 找到匹配的右括号下标。
 * @param {string} s
 * @param {number} open
 * @returns {number}
 */
function findCloseParen(s, open) {
    let d = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') {
            d--;
            if (d === 0) return i;
        }
    }
    return open;
}

/**
 * 解析 arc 半径：纯数字按 TikZ 单位；带单位后缀（pt/cm 等）按长度换算。
 * @param {string} s
 * @param {Object} ctx
 * @returns {number}
 */
function parseLengthArc(s, ctx) {
    const t = String(s).trim();
    if (!t) return 0;
    if (/^-?[\d.]+$/.test(t)) return parseFloat(t);
    return parseLength(t, ctx.vars);
}
