/**
 * @module tikz/options
 * @description TikZ 方括号选项解析（[draw=red, circle, thick, font=\small ...]）
 *              与描边/虚线计算。颜色解析委托给 tikz/color。
 * @requires tikz/color, tikz/constants
 */

'use strict';

import { isColorToken, isAllowedColorValue } from './color.js';
import { FONT_SIZES, DEFAULT_STROKE } from './constants.js';
import { parseLength } from './units.js';

/**
 * 解析方括号选项字符串。
 * @param {string} opts
 * @returns {Object}
 */
export function parseOptions(opts) {
    const r = {
        draw: null,
        fill: null,
        text: null,
        thick: false,
        veryThick: false,
        ultraThick: false,
        dashed: false,
        dotted: false,
        arrow: false,
        arrowBack: false,
        circle: false,
        rectangle: false,
        rounded: false,
        scale: 1,
        anchor: 'center',
        fontSize: 14,
        fontBold: false,
        innerSep: 4,
        step: null,
        domain: null,
        bareColor: null,
        pos: null,
        posRef: null,
        posDir: null,
        posLen: null,
        xshift: 0,
        yshift: 0,
        minWidth: null,
        minHeight: null,
        align: 'center',
    };
    if (!opts) return r;
    const parts = splitOpts(opts);
    for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        if (p === 'thick') {
            r.thick = true;
            continue;
        }
        if (p === 'very thick') {
            r.veryThick = true;
            continue;
        }
        if (p === 'ultra thick') {
            r.ultraThick = true;
            continue;
        }
        if (p === 'dashed') {
            r.dashed = true;
            continue;
        }
        if (p === 'dotted') {
            r.dotted = true;
            continue;
        }
        if (p === 'circle') {
            r.circle = true;
            continue;
        }
        if (p === 'rectangle') {
            r.rectangle = true;
            continue;
        }
        // 裸 draw/fill：表示"绘制边框/填充"，交给调用方以默认色处理
        if (p === 'draw' || p === 'draw=') {
            r.draw = r.draw || DEFAULT_STROKE;
            continue;
        }
        if (p === 'fill') {
            r.fill = r.fill || DEFAULT_STROKE;
            continue;
        }
        if (p === 'rounded corners') {
            r.rounded = true;
            continue;
        }
        if (p === 'sharp corners') {
            continue;
        }
        if (p === '->' || p === '->>' || p === 'latex' || p === '-latex' || p === '->latex') {
            r.arrow = true;
            continue;
        }
        // 单向：仅回箭头（起点）；双向：起终点各一个箭头
        if (p === '<-' || p === '<<-') {
            r.arrowBack = true;
            continue;
        }
        if (p === '<->' || p === '<->>') {
            r.arrow = true;
            r.arrowBack = true;
            continue;
        }
        // 相对定位：below=of X / below=1cm of X / below of X（方向在前、可选间距）
        const relPos =
            /^(above|below|right|left)\s*=?(?:([0-9.]+[a-zA-Z]*)\s+)?of\s+([a-zA-Z_][\w-]*)$/.exec(
                p
            );
        if (relPos) {
            r.posDir = relPos[1];
            r.posLen = relPos[2] || null; // 可选间距
            r.posRef = relPos[3];
            continue;
        }
        // 锚点含 direction 词（可组合："above right"、"below left" 等，逗号分隔）
        const dirs = { above: true, below: true, left: true, right: true };
        if (dirs[p]) {
            // 单锚点
            if (r.anchor === 'center') r.anchor = p;
            continue;
        }
        // 组合锚点（空格分隔，如 "above right"）：按空格切成 direction 词
        const multi = /^(above|below|left|right)(\s+(above|below|left|right))*$/.exec(p);
        if (multi) {
            r.anchor = p.replace(/\s+/g, ' ');
            continue;
        }
        if (p === 'midway') {
            r.pos = 0.5;
            continue;
        }

        // 裸颜色（默认 fill / draw / text 色）
        if (isColorToken(p)) {
            r.bareColor = p;
            continue;
        }

        // 键值对（键可含空格："minimum width"、"inner sep" 等，因此用非贪婪多字符匹配）
        const kv = p.match(/^([a-zA-Z][\w -]*?)\s*=\s*(.+)$/);
        if (kv) {
            const key = kv[1].toLowerCase().trim();
            const val = kv[2].trim();
            // 颜色类值必须先过统一白名单（isAllowedColorValue：命名/hex/混合/var/rgb(a)/hsl(a)，
            // 与 resolveColor 口径一致），杜绝把任意字符串拼进 SVG 属性（audit H2/Fix）；
            // 最终 resolveColor 仍会严格兜底，非法值忽略并由默认色兜底。
            const okColor = isAllowedColorValue;
            if (key === 'draw') {
                if (okColor(val)) r.draw = val || DEFAULT_STROKE;
            } else if (key === 'fill') {
                if (okColor(val)) r.fill = val;
            } else if (key === 'text' || key === 'font') {
                // font=\small 或 text=color
                if (key === 'text') {
                    if (okColor(val)) r.text = val.replace(/[{}]/g, '');
                } else {
                    const fm = /\\?([a-zA-Z]+)/.exec(val);
                    if (fm && FONT_SIZES[fm[1]]) r.fontSize = FONT_SIZES[fm[1]];
                    if (/bfseries|textbf/.test(val)) r.fontBold = true;
                }
            } else if (key === 'scale') {
                r.scale = parseFloat(val) || 1;
            } else if (key === 'step') {
                r.step = parseFloat(val);
                if (r.step <= 0) r.step = null;
            } else if (key === 'domain') {
                const dm = /^\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*$/.exec(val);
                if (dm) r.domain = [parseFloat(dm[1]), parseFloat(dm[2])];
            } else if (key === 'pos') {
                const pp = parseFloat(val);
                if (isFinite(pp)) r.pos = pp;
            } else if (key === 'rounded corners') {
                r.rounded = true;
            } else if (key === 'line width') {
                const lw = parseFloat(val);
                if (lw) r.thick = lw > 1.5;
            } else if (key === 'inner sep') {
                // inner sep=Xpt → 内边距像素；0pt → 0，避免小圆点被撑大
                const ip = parseFloat(val);
                r.innerSep = isFinite(ip) && ip >= 0 ? Math.max(0, (ip * 96) / 72) : 4;
            } else if (key === 'xshift') {
                r.xshift = parseLength(val);
            } else if (key === 'yshift') {
                r.yshift = parseLength(val);
            } else if (key === 'minimum width') {
                const v = parseLength(val);
                r.minWidth = v > 0 ? v : null;
            } else if (key === 'minimum height') {
                const v = parseLength(val);
                r.minHeight = v > 0 ? v : null;
            } else if (key === 'align') {
                r.align = val;
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
export function splitOpts(opts) {
    const out = [];
    let cur = '';
    let brace = 0;
    let paren = 0;
    for (const ch of opts) {
        if (ch === '{') brace++;
        else if (ch === '}') brace--;
        else if (ch === '(') paren++;
        else if (ch === ')') paren--;
        // 仅在花括号与圆括号深度都为 0 时的逗号才算分隔符，
        // 避免 var(--x, #fff) / rgba(1,2,3,0.5) 这类颜色值被误切（audit H1 关联）
        if (ch === ',' && brace === 0 && paren === 0) {
            out.push(cur);
            cur = '';
            continue;
        }
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
