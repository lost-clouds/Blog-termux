/**
 * @module tikz/options
 * @description TikZ 方括号选项解析（[draw=red, circle, thick, font=\small ...]）
 *              与描边/虚线计算。颜色解析委托给 tikz/color。
 * @requires tikz/color, tikz/constants
 */

'use strict';

import { isColorToken } from './color.js';
import { FONT_SIZES, DEFAULT_STROKE } from './constants.js';

/**
 * 解析方括号选项字符串。
 * @param {string} opts
 * @returns {Object}
 */
export function parseOptions(opts) {
    const r = {
        draw: null, fill: null, text: null, thick: false, veryThick: false,
        ultraThick: false, dashed: false, dotted: false, arrow: false, arrowBack: false,
        circle: false, rectangle: false, rounded: false, scale: 1,
        anchor: 'center', fontSize: 14, fontBold: false, innerSep: 4,
        step: null, domain: null, bareColor: null, pos: null
    };
    if (!opts) return r;
    const parts = splitOpts(opts);
    for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        if (p === 'thick') { r.thick = true; continue; }
        if (p === 'very thick') { r.veryThick = true; continue; }
        if (p === 'ultra thick') { r.ultraThick = true; continue; }
        if (p === 'dashed') { r.dashed = true; continue; }
        if (p === 'dotted') { r.dotted = true; continue; }
        if (p === 'circle') { r.circle = true; continue; }
        if (p === 'rectangle') { r.rectangle = true; continue; }
        if (p === 'sharp corners') { continue; }
        if (p === '->' || p === '->>' || p === 'latex' || p === '-latex' || p === '->latex') { r.arrow = true; continue; }
        if (p === '<-' || p === '<<-' || p === '<->' || p === '<->>') { r.arrowBack = true; continue; }
        // 锚点含 direction 词（可组合："above right"、"below left" 等，逗号分隔）
        const dirs = { above: true, below: true, left: true, right: true };
        if (dirs[p]) {
            // 单锚点
            if (r.anchor === 'center' || r.anchor === '') r.anchor = p;
            continue;
        }
        // 组合锚点（空格分隔，如 "above right"）：按空格切成 direction 词
        const multi = /^(above|below|left|right)(\s+(above|below|left|right))*$/.exec(p);
        if (multi) {
            r.anchor = p.replace(/\s+/g, ' ');
            continue;
        }
        if (p === 'midway') { r.pos = 0.5; continue; }

        // 裸颜色（默认 fill / draw / text 色）
        if (isColorToken(p)) { r.bareColor = p; continue; }

        // 键值对
        const kv = p.match(/^([\w-]+)\s*=\s*(.+)$/);
        if (kv) {
            const key = kv[1].toLowerCase();
            const val = kv[2].trim();
            if (key === 'draw') { r.draw = val || DEFAULT_STROKE; }
            else if (key === 'fill') { r.fill = val; }
            else if (key === 'text' || key === 'font') {
                // font=\small 或 text=color
                if (key === 'text') r.text = val.replace(/[{}]/g, '');
                else {
                    const fm = /\\?([a-zA-Z]+)/.exec(val);
                    if (fm && FONT_SIZES[fm[1]]) r.fontSize = FONT_SIZES[fm[1]];
                    if (/bfseries|textbf/.test(val)) r.fontBold = true;
                }
            }
            else if (key === 'scale') { r.scale = parseFloat(val) || 1; }
            else if (key === 'step') { r.step = parseFloat(val); if (r.step <= 0) r.step = null; }
            else if (key === 'domain') { const dm = /^\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*$/.exec(val); if (dm) r.domain = [parseFloat(dm[1]), parseFloat(dm[2])]; }
            else if (key === 'pos') { const pp = parseFloat(val); if (isFinite(pp)) r.pos = pp; }
            else if (key === 'rounded corners') { r.rounded = true; }
            else if (key === 'line width') { const lw = parseFloat(val); if (lw) r.thick = lw > 1.5; }
            else if (key === 'inner sep') {
                // inner sep=Xpt → 内边距像素；0pt → 0，避免小圆点被撑大
                const ip = parseFloat(val);
                r.innerSep = (isFinite(ip) && ip >= 0) ? Math.max(0, ip * 96 / 72) : 4;
            }
        }
    }
    return r;
}

/**
 * 切分选项（忽略括号内的逗号）。
 * @param {string} opts
 * @returns {Array<string>}
 */
function splitOpts(opts) {
    const out = []; let cur = ''; let d = 0;
    for (const ch of opts) {
        if (ch === '{') d++;
        else if (ch === '}') d--;
        if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
}

/**
 * 解析线宽。
 * @param {Object} o
 * @returns {number}
 */
export function lineWidth(o) {
    if (o.ultraThick) return 3.2;
    if (o.veryThick) return 2.6;
    if (o.thick) return 2.0;
    return 1.2;
}

/**
 * 解析虚线数组。
 * @param {Object} o
 * @returns {string}
 */
export function dash(o) {
    if (o.dashed) return '7,5';
    if (o.dotted) return '2,3';
    return '';
}