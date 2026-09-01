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
    if (!name || name.includes('=')) return false;
    const base = name.split('!')[0].toLowerCase();
    if (COLOR_MAP[base] || /^#[0-9a-f]{3,8}$/i.test(base)) return true;
    if (name.includes('!')) return true;
    return false;
}

/**
 * 解析 TikZ 颜色（含 !混合）为 CSS 值。
 * @param {string} color
 * @param {string} fallback
 * @returns {string}
 */
export function resolveColor(color, fallback) {
    if (!color) return fallback;
    const c = String(color).trim();
    if (c === 'none') return 'none';
    if (/^(#|rgb|rgba|var\(|hsla)/.test(c)) return c;
    // 混合链：red!40!blue 表示 40% 从 red 到 blue 混合
    const parts = c
        .split('!')
        .map(function (x) {
            return x.trim();
        })
        .filter(Boolean);
    if (parts.length >= 3) {
        const base = parts[0];
        const pct = parseFloat(parts[1]);
        const target = parts[2];
        const from = hex(base) || '#ffffff';
        const to = hex(target) || hex(base) || '#ffffff';
        return blend(from, to, isNaN(pct) ? 50 : pct);
    }
    if (parts.length === 2 && /^[\d.]+$/.test(parts[1])) {
        const from = hex(parts[0]) || '#ffffff';
        return blend(from, '#ffffff', parseFloat(parts[1]));
    }
    return hex(c) || fallback;
}

/**
 * 命名色 → hex。
 * @param {string} name
 * @returns {string|null}
 */
function hex(name) {
    if (!name) return null;
    const k = name.toLowerCase();
    if (COLOR_MAP[k]) return COLOR_MAP[k];
    if (/^#[0-9a-f]{3,8}$/i.test(k)) return k;
    return null;
}

/**
 * 线性混合两个 hex 颜色。
 * @param {string} a
 * @param {string} b
 * @param {number} pct - 0..100，混合到 b 的比例
 * @returns {string}
 */
function blend(a, b, pct) {
    const t = Math.max(0, Math.min(100, pct)) / 100;
    const pa = rgb(a),
        pb = rgb(b);
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
