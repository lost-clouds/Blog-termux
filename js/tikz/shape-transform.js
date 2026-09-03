/**
 * @module tikz/shape-transform
 * @description 形状在 scope/语句级仿射变换下的几何计算：
 *              旋转矩形角点反算与正向重采样。
 *              从 shapes.js 拆出，保证 shapes.js 只负责 SVG 拼装。
 * @requires tikz/constants, tikz/context
 */

'use strict';

import { PX_PER_UNIT } from './constants.js';
import { transformTikzPoint, localTikzPoint } from './context.js';

/**
 * 当前变换是否包含旋转分量（矩阵 b/c 任一非零）。
 * @param {Object} ctx
 * @returns {boolean}
 */
export function isRotatedTransform(ctx) {
    const t = ctx && ctx.transform;
    return !!t && (Math.abs(t.b) > 1e-9 || Math.abs(t.c) > 1e-9);
}

/**
 * 端点串是否为“原始坐标文本”，而不是命名节点/锚点/calc。
 * 只有原始坐标才能安全地反算局部角点；命名节点已是世界坐标。
 * @param {string} s
 * @returns {boolean}
 */
export function isRawCoordText(s) {
    return !/^[a-zA-Z$]/.test(String(s).trim());
}

/**
 * 当前线性变换是否保圆（恒等/平移/旋转/等比缩放）。
 * 保圆时 circle 仍输出 <circle>；否则必须采样为椭圆 path。
 * @param {Object} ctx
 * @returns {boolean}
 */
export function isCirclePreservingTransform(ctx) {
    const t = ctx && ctx.transform;
    if (!t) return true;
    return (
        Math.abs(t.a * t.b + t.c * t.d) < 1e-9 &&
        Math.abs(t.a * t.a + t.c * t.c - (t.b * t.b + t.d * t.d)) < 1e-9
    );
}

/**
 * 非保圆仿射变换下，把局部圆采样为 SVG path 点列。
 * @param {Object} ctx
 * @param {Array<number>} center - parsePoint 后的世界圆心
 * @param {number} r - 局部半径（TikZ 单位）
 * @param {number} sc - SVG 像素缩放系数
 * @returns {Array<string>} SVG path 点列（含 M/L 命令）
 */
export function affineCircleSvgPoints(ctx, center, r, sc) {
    const localC = localTikzPoint(ctx, center[0], center[1]);
    const N = 48;
    const pts = [];
    for (let k = 0; k <= N; k++) {
        const ang = (Math.PI * 2 * k) / N;
        const wp = transformTikzPoint(
            ctx,
            localC[0] + r * Math.cos(ang),
            localC[1] + r * Math.sin(ang)
        );
        pts.push((k === 0 ? 'M' : 'L') + wp[0] * sc * PX_PER_UNIT + ' ' + -wp[1] * sc * PX_PER_UNIT);
    }
    return pts;
}

/**
 * 计算旋转矩形四个角点的 SVG 坐标。
 * 输入 a/b 是 parsePoint 后的世界 TikZ 坐标；先反算局部对角点，
 * 再逐点应用完整变换，避免把旋转矩形画成轴对齐包围盒。
 * @param {Object} ctx
 * @param {Array<number>} a - 世界 TikZ 坐标
 * @param {Array<number>} b - 世界 TikZ 坐标
 * @param {number} sc - SVG 像素缩放系数（已含语句/整图 scale）
 * @returns {Array<Array<number>>} 四个角点 [x,y]（SVG 坐标）
 */
export function rotatedRectSvgPoints(ctx, a, b, sc) {
    const la = localTikzPoint(ctx, a[0], a[1]);
    const lb = localTikzPoint(ctx, b[0], b[1]);
    const lx1 = Math.min(la[0], lb[0]),
        lx2 = Math.max(la[0], lb[0]);
    const ly1 = Math.min(la[1], lb[1]),
        ly2 = Math.max(la[1], lb[1]);
    const corners = [
        [lx1, ly1],
        [lx2, ly1],
        [lx2, ly2],
        [lx1, ly2],
    ];
    const out = [];
    for (const c of corners) {
        const w = transformTikzPoint(ctx, c[0], c[1]);
        out.push([w[0] * sc * PX_PER_UNIT, -w[1] * sc * PX_PER_UNIT]);
    }
    return out;
}
