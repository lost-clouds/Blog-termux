/**
 * @module tikz/styles
 * @description TikZ 样式定义解析：从 tikzpicture 选项块中提取 `name/.style={...}`
 *              样式定义、`node distance` 与 `scale` 等全局参数，供节点应用与
 *              相对布局/整图缩放使用。样式体保留原始选项串，应用时由 options.parseOptions 解析。
 * @requires tikz/units
 */

'use strict';

import { parseLength } from './units.js';

/**
 * 解析 tikzpicture 的方括号选项块内容。
 * @param {string} optsStr - `\begin{tikzpicture}[...]` 中 [...] 内的原始文本
 * @returns {{styles:Object, nodeDistance:number, scale:number}}
 *          styles: {样式名: 选项串}；nodeDistance: 全局节点间距（TikZ 单位）；
 *          scale: 整图缩放倍数（默认 1，无单位，与 TikZ 语义一致）
 */
export function parsePreamble(optsStr) {
    const styles = {};
    let nodeDistance = 1; // 默认 1cm ≈ 1 个 TikZ 单位
    let scale = 1;
    if (!optsStr) return { styles: styles, nodeDistance: nodeDistance, scale: scale };

    // 顶层按逗号切分（忽略嵌套花括号内的逗号）
    const parts = splitTopLevel(optsStr);
    for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        // name/.style={...} 样式定义
        const styleM = /^([a-zA-Z_][\w-]*)\/\.style\s*=\s*\{([\s\S]*)\}$/.exec(p);
        if (styleM) {
            styles[styleM[1].trim()] = styleM[2];
            continue;
        }
        // node distance=1.8cm 全局间距
        const distM = /^node\s+distance\s*=\s*(.+)$/.exec(p);
        if (distM) {
            nodeDistance = parseLength(distM[1]);
            continue;
        }
        // scale=0.8 整图缩放（TikZ 中 scale 无单位，可带小数；也兼容 scale=1.2 写法）
        const scaleM = /^scale\s*=\s*(-?[\d.]+)$/.exec(p);
        if (scaleM) {
            const v = parseFloat(scaleM[1]);
            scale = isFinite(v) && v > 0 ? v : 1;
            continue;
        }
    }
    return { styles: styles, nodeDistance: nodeDistance, scale: scale };
}

/**
 * 顶层逗号切分：花括号深度为 0 时逗号分隔。
 * @param {string} s
 * @returns {Array<string>}
 */
function splitTopLevel(s) {
    const out = [];
    let cur = '';
    let d = 0;
    for (const ch of s) {
        if (ch === '{') d++;
        else if (ch === '}') d--;
        if (ch === ',' && d === 0) {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
}
