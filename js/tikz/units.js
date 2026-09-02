/**
 * @module tikz/units
 * @description TikZ 长度单位解析与换算：把 "1.8cm" / "2.5cm" / "5pt" / "-1.2cm"
 *              （含正负号）解析为 TikZ 单位（"格"）。无单位后缀时按 TeX 约定
 *              一律看作 pt。所有渲染坐标最终都以 TikZ 单位为基准。
 *
 * 依赖：none（纯函数，供 tikz/context、tikz/expr、tikz/script 复用）。
 */

'use strict';

// 常见长度单位 → 相对 1cm 的倍数（1cm = 1 个 TikZ 单位基准）
const UNIT_CM = Object.freeze({
    cm: 1,                       // 1cm = 1 个默认单位
    mm: 0.1,                     // 1mm = 0.1cm
    in: 2.54,                    // 1in = 2.54cm
    pt: 1 / 28.452756,           // 1pt ≈ 1cm / 28.452756（TeX 基准）
    bp: 1 / 28.34646,            // 1bp ≈ 1cm / 28.34646（PostScript 点）
    px: (96 / 2.54) / 100        // 1px @96dpi 折算到 TikZ 单位（约 0.377）
});

/**
 * 解析单个长度串为 TikZ 单位数值。
 * 支持 "\var"、"<数字><单位>"、"3.5"（裸数字默认按 pt 计）。
 * 解析失败或缺失时返回 0（与 TikZ 对未知长度的容错一致）。
 * @param {string|null|undefined} lengthStr - 长度文本
 * @param {Object} [vars] - 变量字典（如 \len），缺省为 {}
 * @returns {number} 解析出的 TikZ 单位数值
 */
export function parseLength(lengthStr, vars) {
    const s = String(lengthStr == null ? '' : lengthStr).trim();
    if (!s) return 0;
    // 纯数字（可选前导负号/小数）直接返回
    const numOnly = /^-?[\d.]+$/.exec(s);
    if (numOnly) return parseFloat(s);
    // <符号><数字><单位> 形式
    const m = /^(-?)([\d.]+)\s*([a-zA-Z]+)?$/.exec(s);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    const num = parseFloat(m[2]);
    const unit = (m[3] || 'pt').toLowerCase();
    const factor = UNIT_CM[unit];
    if (factor === undefined) return 0;
    return sign * num * factor;
}