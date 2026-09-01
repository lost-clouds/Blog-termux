/**
 * @module tikz/context
 * @description 渲染上下文：命名坐标表、节点几何盒（box）、循环变量、包围盒、
 *              全局布局参数（node distance / 缩放）。支持坐标登记与盒模型锚点解析。
 * @requires 无（与 expr 解耦；坐标/数量解析由调用方负责）
 */

'use strict';

/**
 * 创建渲染上下文。
 * @param {Object} [vars] - foreach/macro 变量
 * @returns {Object} 渲染上下文
 */
export function createContext(vars) {
    return {
        named: {}, // name -> [x, y]（TikZ 单位）保持旧语义
        boxes: {}, // name -> {x,y,hw,hh}（中心与半宽高，TikZ 单位）节点几何盒
        vars: vars || {}, // 循环变量与宏
        last: [0, 0], // 当前笔位置
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        options: { nodeDistance: 1, scale: 1 }, // tikzpicture 全局参数
    };
}

/**
 * 当前整图缩放系数（tikzpicture 级 [scale=X]，默认 1）。
 * @param {Object} ctx
 * @returns {number}
 */
export function picScale(ctx) {
    return (ctx && ctx.options && ctx.options.scale) || 1;
}

/**
 * 更新整体包围盒。
 * @param {Object} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} [x2]
 * @param {number} [y2]
 */
export function expandBounds(ctx, x1, y1, x2, y2) {
    if (x2 === undefined) x2 = x1;
    if (y2 === undefined) y2 = y1;
    if (x1 < ctx.bounds.minX) ctx.bounds.minX = x1;
    if (y1 < ctx.bounds.minY) ctx.bounds.minY = y1;
    if (x2 > ctx.bounds.maxX) ctx.bounds.maxX = x2;
    if (y2 > ctx.bounds.maxY) ctx.bounds.maxY = y2;
}

/**
 * 登记路径中出现的命名坐标（\coordinate 已单独处理，这里兜底）。
 * 只登记纯坐标点，不参与盒模型。
 * @param {string} rest
 * @param {Object} ctx
 * @param {Function} parsePoint
 */
export function registerCoords(rest, ctx, parsePoint) {
    if (!rest) return;
    const m = /^\s*(?:\\coordinate\s+)?\(([^)]+)\)\s+at\s+\(([^)]*)\)/.exec(rest);
    if (m) {
        const pt = parsePoint(m[2], ctx);
        ctx.named[m[1].trim()] = [pt[0], pt[1]];
    }
}

/**
 * 登记一个节点的几何盒（中心 + 半宽/高，TikZ 单位）。
 * 更新 named 点（中心）并存入 boxes，供相对定位（below=of X）与锚点引用。
 * @param {Object} ctx
 * @param {string} name
 * @param {number} x - 中心 x（TikZ 单位）
 * @param {number} y - 中心 y（TikZ 单位）
 * @param {number} hw - 半宽
 * @param {number} hh - 半高
 */
export function registerBox(ctx, name, x, y, hw, hh) {
    ctx.named[name] = [x, y];
    ctx.boxes[name] = { x: x, y: y, hw: hw, hh: hh };
}

/**
 * 解析节点引用（含锚点）为 TikZ 坐标点：支持 "X"、"X.center"、"X.south west"。
 * 锚点取盒子的边界点；若节点无盒（仅坐标点），center 即自身，方位锚点取距离微偏移。
 * 解析失败返回 null。
 * @param {string} ref - 形如 "X" 或 "X.north east"
 * @param {Object} ctx
 * @returns {Array<number>|null} [x,y]
 */
export function resolveAnchor(ref, ctx) {
    if (!ref || !ctx) return null;
    const t = String(ref).trim();
    const dot = t.indexOf('.');
    const name = (dot === -1 ? t : t.slice(0, dot)).trim();
    const anchor = dot === -1 ? 'center' : t.slice(dot + 1).trim();
    if (!name) return null;
    const box = ctx.boxes && ctx.boxes[name];
    if (box) {
        const { x, y, hw, hh } = box;
        let ax = x,
            ay = y;
        if (anchor.indexOf('north') !== -1) ay = y + hh;
        if (anchor.indexOf('south') !== -1) ay = y - hh;
        if (anchor.indexOf('east') !== -1) ax = x + hw;
        if (anchor.indexOf('west') !== -1) ax = x - hw;
        return [ax, ay];
    }
    const pt = ctx.named && ctx.named[name];
    if (pt) return [pt[0], pt[1]];
    return null;
}
