/**
 * @module tikz/path
 * @description 路径渲染：\draw/\fill rest。处理 -- 直线、.. controls ..、cycle、
 *              circle/rectangle/grid/plot 特型分发。
 * @requires tikz/constants, tikz/color, tikz/options, tikz/expr, tikz/context, tikz/shapes
 */

'use strict';

import { PX_PER_UNIT, DEFAULT_STROKE } from './constants.js';
import { resolveColor } from './color.js';
import { parseOptions, lineWidth, dash } from './options.js';
import { parsePoint } from './expr.js';
import { expandBounds } from './context.js';
import { circleShape, rectangleShape, gridShape, plotShape, arrowHead } from './shapes.js';

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
    if (/\bcircle\b/.test(rest)) return circleShape(rest, o, ctx, isFill || filled, fillOverride || o.fill);
    if (/\brectangle\b/.test(rest)) return rectangleShape(rest, o, ctx, isFill || filled);
    if (/\bgrid\b/.test(rest)) return gridShape(rest, o, ctx);
    if (/\bplot\b/.test(rest)) return plotShape(rest, o, ctx);

    const path = tokenizePath(rest, o, ctx);
    if (!path || !path.d) return { html: '', math: false };
    const strokeCol = o.draw || (o.bareColor && !isFill ? o.bareColor : null);
    const fillCol = fillOverride || o.fill || (o.bareColor && isFill ? o.bareColor : null);
    const stroke = resolveColor(strokeCol, DEFAULT_STROKE);
    const fill = resolveColor(fillCol, isFill ? DEFAULT_STROKE : 'none');
    const sw = lineWidth(o);
    const dsh = dash(o);
    const d = path.d + (path.closed ? 'Z' : '');
    let out = '<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"' + (dsh ? ' stroke-dasharray="' + dsh + '"' : '') + ' />';
    if (o.arrow && path.e2) out += arrowHead(path.e1, path.e2, stroke);
    if (o.arrowBack && path.s2) out += arrowHead(path.s2, path.s1, stroke);
    return { html: out, math: false };
}

/**
 * 解析路径为 SVG path d 数据。
 * 支持 -- 直线、arc、.. controls ..、cycle。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @returns {Object|null} {d, closed, s1, s2, e1, e2}
 */
function tokenizePath(rest, o, ctx) {
    const raw = rest.replace(/^\s*\\?[a-zA-Z]+\b/, '').trim();
    if (!raw) return null;
    let cur = null;
    let d = '';
    let closed = false;
    let firstSeg = null;
    let lastSeg = null;
    const scale = o.scale || 1;
    // TikZ Y 轴向上，SVG Y 轴向下 → y 取负，保证绘图与网格/坐标轴对齐。
    const XP = function (p) { return p[0] * scale * PX_PER_UNIT; };
    const YP = function (p) { return -p[1] * scale * PX_PER_UNIT; };

    let i = 0;
    const n = raw.length;
    while (i < n) {
        const ch = raw[i];
        if (/\s/.test(ch)) { i++; continue; }
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
            const cm = /^\.\.\s*controls\s*\(([^)]*)\)(?:\s*and\s*\(([^)]*)\))?\s*\.\.\s*\(([^)]*)\)/.exec(raw.slice(i));
            if (cm && cur) {
                const c1 = parsePoint(cm[1], ctx);
                const c2c = cm[2] ? parsePoint(cm[2], ctx) : null;
                const q = parsePoint(cm[3], ctx);
                expandBounds(ctx, XP(c1), YP(c1), XP(q), YP(q));
                d += c2c
                    ? 'C' + XP(c1) + ' ' + YP(c1) + ' ' + XP(c2c) + ' ' + YP(c2c) + ' ' + XP(q) + ' ' + YP(q)
                    : 'Q' + XP(c1) + ' ' + YP(c1) + ' ' + XP(q) + ' ' + YP(q);
                const seg = [XP(cur), YP(cur), XP(q), YP(q)];
                if (!firstSeg) firstSeg = seg;
                lastSeg = seg;
                cur = q;
                i += cm[0].length;
                continue;
            }
            i += 2; continue;
        }
        if (raw.slice(i, i + 5) === 'cycle') { closed = true; d += 'Z'; i += 5; continue; }
        if (ch === '-' || ch === '<' || ch === '>') { i++; while (i < n && /[-<->]/.test(raw[i])) i++; continue; }
        i++;
    }
    if (!d) return null;
    return { d: d, closed: closed, s1: firstSeg, s2: lastSeg, e1: firstSeg, e2: lastSeg };
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
        else if (s[i] === ')') { d--; if (d === 0) return i; }
    }
    return open;
}