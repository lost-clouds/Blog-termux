/**
 * @module tikz/shapes
 * @description 特型图形渲染：circle / rectangle / grid / plot 与实心箭头。
 *              坐标约定：所有图元统一在“TikZ→SVG”边界取负 y（Y 向上→SVG Y 向下），
 *              保证函数图、网格、坐标轴、节点完全对齐。
 * @requires tikz/constants, tikz/color, tikz/options, tikz/expr, tikz/context
 */

'use strict';

import { PX_PER_UNIT, DEFAULT_STROKE } from './constants.js';
import { resolveColor } from './color.js';
import { lineWidth, dash } from './options.js';
import { evalExpr, compileEval, parsePoint } from './expr.js';
import { expandBounds } from './context.js';

/**
 * 圆形：\(cx,cy) circle (r)。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @param {boolean} filled
 * @param {?string} fillOpt
 * @returns {{html:string, math:boolean}}
 */
export function circleShape(rest, o, ctx, filled, fillOpt) {
    const m = rest.match(/\(([^)]*)\)\s*circle\s*\(([^)]*)\)/i);
    if (!m) return { html: '', math: false };
    const c = parsePoint(m[1], ctx);
    const rr = evalExpr(m[2], ctx.vars) * (o.scale || 1);
    const cx = c[0] * o.scale * PX_PER_UNIT;
    const cy = -c[1] * o.scale * PX_PER_UNIT; // TikZ Y 向上 → SVG Y 向下
    const cr = Math.max(rr * PX_PER_UNIT, 1);
    expandBounds(ctx, cx - cr, cy - cr, cx + cr, cy + cr);
    const stroke = resolveColor(o.draw || o.bareColor, DEFAULT_STROKE);
    const fc = resolveColor(fillOpt || (filled && o.bareColor ? o.bareColor : null), filled ? DEFAULT_STROKE : 'none');
    const sw = lineWidth(o);
    const dsh = dash(o);
    return { html: '<circle cx="' + cx + '" cy="' + cy + '" r="' + cr + '" fill="' + fc + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (dsh ? ' stroke-dasharray="' + dsh + '"' : '') + ' />', math: false };
}

/**
 * 矩形：\(a) rectangle (b)。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @param {boolean} filled
 * @returns {{html:string, math:boolean}}
 */
export function rectangleShape(rest, o, ctx, filled) {
    const m = rest.match(/\(([^)]*)\)\s*rectangle\s*\(([^)]*)\)/i);
    if (!m) return { html: '', math: false };
    const a = parsePoint(m[1], ctx);
    const b = parsePoint(m[2], ctx);
    const x1 = a[0] * o.scale * PX_PER_UNIT, y1 = -a[1] * o.scale * PX_PER_UNIT;
    const x2 = b[0] * o.scale * PX_PER_UNIT, y2 = -b[1] * o.scale * PX_PER_UNIT;
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    expandBounds(ctx, rx, ry, rx + w, ry + h);
    const rad = o.rounded ? 6 : 0;
    const stroke = resolveColor(o.draw || o.bareColor, DEFAULT_STROKE);
    const fc = resolveColor(o.fill || (filled && o.bareColor ? o.bareColor : null), filled ? DEFAULT_STROKE : 'none');
    const sw = lineWidth(o);
    const dsh = dash(o);
    return { html: '<rect x="' + rx + '" y="' + ry + '" width="' + w + '" height="' + h + '" rx="' + rad + '" fill="' + fc + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (dsh ? ' stroke-dasharray="' + dsh + '"' : '') + ' />', math: false };
}

/**
 * 网格：\(x1,y1) grid (x2,y2)。
 * 两个坐标是网格的角端点，在 TikZ 中网格线绘制在整数坐标（或 step 倍数）位置。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @param {boolean} filled
 * @param {?string} fillOpt
 * @returns {{html:string, math:boolean}}
 */
export function gridShape(rest, o, ctx, filled, fillOpt) {
    const m = rest.match(/\(([^)]*)\)\s*grid\s*\(([^)]*)\)/i);
    if (!m) return { html: '', math: false };
    const a = parsePoint(m[1], ctx);
    const b = parsePoint(m[2], ctx);
    const step = (o.step != null && o.step > 0) ? o.step : 1;

    // 两个角端点的 TikZ 坐标 (Y 向上)
    const x1 = Math.min(a[0], b[0]);
    const x2 = Math.max(a[0], b[0]);
    const y1 = Math.min(a[1], b[1]);
    const y2 = Math.max(a[1], b[1]);

    // 网格线在 step 倍数位置（如整数坐标），落在矩形范围内
    const xStart = Math.ceil(x1 / step) * step;
    const xEnd = Math.floor(x2 / step) * step;
    const yStart = Math.ceil(y1 / step) * step;
    const yEnd = Math.floor(y2 / step) * step;

    // 转换为 SVG 坐标（Y 取负）
    const sx1 = x1 * o.scale * PX_PER_UNIT;
    const sx2 = x2 * o.scale * PX_PER_UNIT;
    const sy1 = -y1 * o.scale * PX_PER_UNIT;
    const sy2 = -y2 * o.scale * PX_PER_UNIT;

    expandBounds(ctx, sx1, sy2, sx2, sy1);

    const stroke = resolveColor(o.draw, 'rgba(120,120,120,0.4)');
    let out = '';
    // \fill[fill=色] ... grid：先铺一张与网格同大的背景填充矩形（等效填充全部单元格），
    // 再在其上叠画网格线，视觉与 TikZ 的"逐格填充"一致。
    const fillCol = resolveColor(fillOpt || (filled && o.bareColor ? o.bareColor : null), filled ? DEFAULT_STROKE : 'none');
    if (fillCol !== 'none') {
        out += '<rect x="' + sx1 + '" y="' + sy2 + '" width="' + (sx2 - sx1) + '" height="' + (sy1 - sy2) + '" fill="' + fillCol + '" stroke="none" />';
    }

    // 垂直线：在 xStart 到 xEnd 之间每隔 step 绘制一条
    for (let x = xStart; x <= xEnd; x += step) {
        const sx = Math.round(x * o.scale * PX_PER_UNIT * 100) / 100;
        out += '<line x1="' + sx + '" y1="' + sy2 + '" x2="' + sx + '" y2="' + sy1 + '" stroke="' + stroke + '" stroke-width="0.5" />';
    }
    // 水平线：在 yStart 到 yEnd 之间每隔 step 绘制一条
    for (let y = yStart; y <= yEnd; y += step) {
        const sy = Math.round(-y * o.scale * PX_PER_UNIT * 100) / 100;
        out += '<line x1="' + sx1 + '" y1="' + sy + '" x2="' + sx2 + '" y2="' + sy + '" stroke="' + stroke + '" stroke-width="0.5" />';
    }
    return { html: out, math: false };
}

/**
 * 函数图：\draw[domain=a:b] plot (\x,{f(\x)})。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
export function plotShape(rest, o, ctx) {
    const dm = /domain\s*=\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)/.exec(rest);
    let a = -2, b = 2;
    if (dm) { a = parseFloat(dm[1]); b = parseFloat(dm[2]); }
    const pm = /plot\s*\(\\?([a-zA-Z])\s*,\s*\{([^}]*)\}\s*\)/.exec(rest);
    if (!pm) return { html: '', math: false };
    const varName = pm[1];
    const exprBody = pm[2];
    const N = 90;
    let pts = '';
    let first = true;
    const scale = o.scale || 1;
    // 表达式只编译一次，热循环中仅做变量替换+取值，避免每次 new Function（性能优化）
    const f = compileEval(exprBody);
    for (let k = 0; k <= N; k++) {
        const xv = a + (b - a) * k / N;
        const vars = Object.assign({}, ctx.vars);
        vars[varName] = xv;
        const yv = f(vars);
        const X = xv * scale * PX_PER_UNIT;
        const Y = -yv * scale * PX_PER_UNIT; // Y 向上 → 取负
        expandBounds(ctx, X, Y);
        pts += (first ? '' : 'L') + X + ' ' + Y;
        first = false;
    }
    const stroke = resolveColor(o.draw, DEFAULT_STROKE);
    const sw = lineWidth(o);
    return { html: '<path d="M' + pts + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" />', math: false };
}

/**
 * 绘制实心箭头（线段端）。
 * @param {Array<number>} from - [x1,y1]
 * @param {Array<number>} to - [x2,y2]
 * @param {string} color
 * @returns {string}
 */
export function arrowHead(from, to, color) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return '';
    const ux = dx / len, uy = dy / len;
    const size = 9;
    const bx = to[0] - ux * size, by = to[1] - uy * size;
    const nx = -uy * (size * 0.38), ny = ux * (size * 0.38);
    return '<polygon points="' + to[0] + ',' + to[1] + ' ' + (bx + nx) + ',' + (by + ny) + ' ' + (bx - nx) + ',' + (by - ny) + '" fill="' + color + '" />';
}