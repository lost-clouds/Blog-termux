/**
 * @module tikz/context
 * @description 渲染上下文：命名坐标表、循环变量、包围盒；坐标登记。
 * @requires 无（与 expr 解耦，坐标解析由调用方负责）
 */

'use strict';

/**
 * 创建渲染上下文。
 * @param {Object} vars - foreach/macro 变量
 * @returns {Object}
 */
export function createContext(vars) {
    return {
        named: {},      // name -> [x,y]
        vars: vars || {}, // 循环变量与宏
        last: [0, 0],
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    };
}

/**
 * 更新上下包围盒。
 * @param {Object} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
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
 * @param {string} rest
 * @param {Object} ctx
 * @param {Function} parsePoint
 */
export function registerCoords(rest, ctx, parsePoint) {
    if (!rest) return;
    // \coordinate (name) at (x,y) 形式
    const m = /^\s*\coordinate\s+\(([^)]+)\)\s+at\s+\(([^)]*)\)/.exec(rest);
    if (m) {
        const pt = parsePoint(m[2], ctx);
        ctx.named[m[1].trim()] = pt;
    }
}