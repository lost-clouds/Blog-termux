/**
 * @module tikz/color
 * @description 颜色解析：命名色、hex、rgb，以及 TikZ 混合语法 red!40!blue。
 * @requires tikz/constants
 */

'use strict';

import { COLOR_MAP } from './constants.js';

/**
 * 是否为可用的颜色记号（命名色或 TikZ 混合）。
 * @param {string} name
 * @returns {boolean}
 */
export function isColorToken(name) {
    if (!name || name.includes('=') || name.trim() === '') return false;
    const parts = name.split('!');
    const base = parts[0].trim().toLowerCase();
    if (COLOR_MAP[base] || /^#[0-9a-f]{3,8}$/i.test(base)) return true;
    return false;
}

/**
 * 判断单个颜色分量是否为合法 CSS 颜色字面量（命名色 / hex / rgb(a) / hsl(a) / var）。
 * 用于白名单校验，杜绝 SVG 属性注入（如 fill 值里的引号/尖括号/分号）。
 * @param {string} c
 * @returns {boolean}
 */
function isSingleColor(c) {
    if (COLOR_MAP[c.toLowerCase()]) return true;
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return true;
    // 仅允许纯数字/空格/逗号/% 组成的函数式颜色，并拒绝一切注入字符
    if (/^(?:rgba?|hsla?)\([\d\s.,%]+\)$/.test(c)) return !/["'<>\\`;]/.test(c);
    // var(--x[, fallback])：fallback 仅允许 hex，且整体不含注入字符
    if (/^var\(--[\w-]+(?:,\s*#[0-9a-f]{3,8})?\)$/i.test(c)) return !/["'<>\\`;]/.test(c);
    return false;
}

/**
 * 单一颜色 → [r,g,b]，非法返回 null。
 * @param {string} c
 * @returns {Array<number>|null}
 */
function rgbOf(c) {
    if (COLOR_MAP[c.toLowerCase()]) return rgb(COLOR_MAP[c.toLowerCase()]);
    if (/^#[0-9a-f]{3,8}$/i.test(c)) return rgb(c);
    return null;
}

/**
 * 解析 TikZ 混合颜色链（red!40!blue 或 red!40）为 CSS 颜色。
 * 所有分量都先经 rgbOf 严格校验，任一非法即整体回退。
 * @param {string} c
 * @returns {string|null}
 */
function resolveMix(c) {
    const clamped = c.replace(/^#/g, '');
    const parts = clamped
        .split('!')
        .map(function (x) {
            return x.trim().toLowerCase();
        })
        .filter(Boolean);
    const pct = parseFloat(parts[1]);
    if (isNaN(pct)) return null;
    if (parts.length >= 3) {
        const from = rgbOf(parts[0]);
        const to = rgbOf(parts[2]);
        if (from && to) return blend(from, to, pct);
        return null;
    }
    if (parts.length === 2 && /^[\d.]+$/.test(parts[1])) {
        const from = rgbOf(parts[0]);
        if (from) return blend(from, [255, 255, 255], pct);
        return null;
    }
    return null;
}

/**
 * 解析 TikZ 颜色（含 !混合）为 CSS 值。
 * 输出保证为"命名色映射后的 hex / 合法 hex / rgb() / var()"，
 * 非法输入一律返回 fallback——这是 SVG 属性注入（audit H2）的最后一道防线。
 * @param {string} color
 * @param {string} fallback
 * @returns {string}
 */
export function resolveColor(color, fallback) {
    if (!color) return fallback;
    const c = String(color).trim();
    if (c === 'none') return 'none';
    // 混合链：red!40!blue 表示 40% 从 red 到 blue 混合
    if (c.includes('!')) return resolveMix(c) || fallback;
    if (!isSingleColor(c)) return fallback;
    if (COLOR_MAP[c.toLowerCase()]) return COLOR_MAP[c.toLowerCase()];
    return c;
}

/**
 * 线性混合两个 rgb 三元组（[r,g,b]）。
 * @param {Array<number>} pa - 起点色
 * @param {Array<number>} pb - 终点色
 * @param {number} pct - 0..100，混合到 b 的比例
 * @returns {string}
 */
function blend(pa, pb, pct) {
    const t = Math.max(0, Math.min(100, pct)) / 100;
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

/**
 * hex → [r,g,b]。
 * @param {string} hexColor
 * @returns {Array<number>}
 */
function rgb(hexColor) {
    let h = hexColor.replace('#', '');
    if (h.length === 3)
        h = h
            .split('')
            .map(function (c) {
                return c + c;
            })
            .join('');
    h = h.slice(0, 6).padEnd(6, '0');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
