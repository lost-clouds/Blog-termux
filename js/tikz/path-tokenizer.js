/**
 * @module tikz/path-tokenizer
 * @description 纯折线/贝塞尔/圆弧路径的 SVG d 数据解析，以及“节点边框偏移”计算。
 *              从 path.js 拆出，保证单一模块只承担一个职责、代码量保持在 300 行以内。
 * @requires tikz/constants, tikz/expr, tikz/context, tikz/units
 */

'use strict';

import { PX_PER_UNIT } from './constants.js';
import { parsePoint } from './expr.js';
import { expandBounds, picScale } from './context.js';
import { parseLength } from './units.js';

/**
 * 解析路径为 SVG path d 数据。
 * 支持 -- 直线、arc、.. controls ..、cycle。
 * 当路径首/末端点是"裸命名节点"（如 (a)、(box)，不含 .anchor 与坐标运算）时，
 * 把端点从节点中心偏移到节点边框，避免箭头/连线埋进节点内部（audit：元素叠加）。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @returns {Object|null} {d, closed, s1, s2, e1, e2, lastSeg}
 */
export function tokenizePath(rest, o, ctx) {
    const raw = rest.replace(/^\s*\\?[a-zA-Z]+\b/, '').trim();
    if (!raw) return null;
    let cur = null;
    let d = '';
    let closed = false;
    let firstSeg = null;
    let lastSeg = null;
    let hasCurve = false; // 是否出现 controls / arc（这类路径不做边框偏移，保持原语义）
    const scale = (o.scale || 1) * picScale(ctx);
    // TikZ Y 轴向上，SVG Y 轴向下 → y 取负，保证绘图与网格/坐标轴对齐。
    const XP = function (p) {
        return p[0] * scale * PX_PER_UNIT;
    };
    const YP = function (p) {
        return -p[1] * scale * PX_PER_UNIT;
    };

    // 登记路径锚点（M/L 顶点）及其原始坐标串，供结尾做节点边框偏移。
    const verts = []; // { x, y, raw } —— SVG 坐标

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
            const rawCoord = raw.slice(i + 1, close);
            const pt = parsePoint(rawCoord, ctx);
            const sx = XP(pt);
            const sy = YP(pt);
            verts.push({ x: sx, y: sy, raw: rawCoord });
            expandBounds(ctx, sx, sy);
            if (cur === null) {
                d += 'M' + sx + ' ' + sy;
                cur = pt;
            } else {
                d += 'L' + sx + ' ' + sy;
                const seg = [XP(cur), YP(cur), sx, sy];
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
                hasCurve = true;
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
                hasCurve = true;
                i += am[0].length;
                continue;
            }
        }
        if (raw.slice(i, i + 5) === 'cycle') {
            closed = true;
            // 只记录 closed 标志；Z 命令由 renderDraw 统一追加，
            // 否则会生成 M...ZZ 这类重复闭合路径（SVG 虽容错但不符合规范）。
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

    // 节点边框偏移：仅纯折线（无 controls/arc）且首末为裸命名节点时生效。
    if (!hasCurve) {
        const adj = applyBorderOffsets(verts, ctx, scale);
        // 两点路径只有一个线段：firstSeg 与 lastSeg 原为同一数组引用。
        // 先调整起点会创建新数组，必须记住这个关系，否则末段起点会停留在
        // 旧的中心点，导致箭头长度/方向计算错误（15.7 中 p1 箭头被放成 9px）。
        const sameSegment = firstSeg != null && firstSeg === lastSeg;
        if (adj.first) {
            d = d.replace(/^M-?[\d.e]+ -?[\d.e]+/, 'M' + adj.first[0] + ' ' + adj.first[1]);
            if (firstSeg) firstSeg = [adj.first[0], adj.first[1], firstSeg[2], firstSeg[3]];
        }
        if (adj.last) {
            d = replaceLastVertex(d, adj.last);
            if (lastSeg) {
                const sx = sameSegment && firstSeg ? firstSeg[0] : lastSeg[0];
                const sy = sameSegment && firstSeg ? firstSeg[1] : lastSeg[1];
                lastSeg = [sx, sy, adj.last[0], adj.last[1]];
            }
        }
    }

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
 * 计算首/末顶点的节点边框偏移点。
 * @param {Array<{x:number,y:number,raw:string}>} verts - 路径锚点（SVG 坐标）
 * @param {Object} ctx
 * @param {number} scale - 已含 o.scale 与整图 scale 的缩放系数
 * @returns {{first:Array<number>|null, last:Array<number>|null}}
 */
function applyBorderOffsets(verts, ctx, scale) {
    const n = verts.length;
    if (n < 2) return { first: null, last: null }; // 单点无方向，无法偏移
    const px = scale * PX_PER_UNIT;
    return {
        first: borderPoint(verts[0], verts[1], ctx, px),
        last: borderPoint(verts[n - 1], verts[n - 2], ctx, px),
    };
}

/**
 * 计算节点中心沿 from→toward 方向到边框的点（SVG 坐标）。
 * 若 from 不是带盒的裸命名节点，返回 null（保持中心不变）。
 * @param {{x:number,y:number,raw:string}} v - 当前顶点
 * @param {{x:number,y:number}} toward - 相邻顶点（决定方向）
 * @param {Object} ctx
 * @param {number} px - 1 个 TikZ 单位对应的 SVG 像素（已含 scale）
 * @returns {Array<number>|null}
 */
function borderPoint(v, toward, ctx, px) {
    const box = bareNodeBox(v.raw, ctx);
    if (!box) return null;
    const dx = toward.x - v.x;
    const dy = toward.y - v.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return [v.x, v.y]; // 重合：退回中心
    const hw = box.hw * px;
    const hh = box.hh * px;
    const ux = dx / len;
    const uy = dy / len;
    // 从中心沿方向射线到矩形边框的距离：取 x/y 两个方向上先触达者
    const tx = Math.abs(ux) < 1e-9 ? Infinity : hw / Math.abs(ux);
    const ty = Math.abs(uy) < 1e-9 ? Infinity : hh / Math.abs(uy);
    const t = Math.min(tx, ty);
    return [v.x + ux * t, v.y + uy * t];
}

/**
 * 判断原始坐标串是否为"带盒的裸命名节点"（可做边框偏移）。
 * 仅接受纯节点名（无 .anchor、无坐标运算），且 ctx.boxes 中存在其几何盒。
 * @param {string} raw
 * @param {Object} ctx
 * @returns {Object|null}
 */
function bareNodeBox(raw, ctx) {
    if (!raw || !ctx || !ctx.boxes) return null;
    const t = String(raw).trim();
    if (!/^[a-zA-Z_][\w-]*$/.test(t)) return null;
    return ctx.boxes[t] || null;
}

/**
 * 替换 SVG path d 末尾的最后一个坐标对（适配 L/C/Q 等结尾）。
 * @param {string} d
 * @param {Array<number>} pt - [x,y]
 * @returns {string}
 */
function replaceLastVertex(d, pt) {
    const m = /-?[\d.e]+[\s,]-?[\d.e]+$/.exec(d);
    if (!m) return d;
    return d.slice(0, m.index) + pt[0] + ' ' + pt[1];
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
