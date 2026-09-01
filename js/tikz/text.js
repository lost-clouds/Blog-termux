/**
 * @module tikz/text
 * @description 文本工具：有效显示长度估算、纯文本转换、HTML 转义、数学片段切分。
 * @requires tikz/constants (MATH_RUN_RE)
 */

'use strict';

import { MATH_RUN_RE } from './constants.js';

/**
 * 估算节点文本的“有效显示长度”：剔除数学分隔符、花括号与 LaTeX 脚手架，
 * 用最终呈现的字符数近似度量，避免按原始源码长度把元素撑得过大。
 * @param {string} text
 * @returns {number}
 */
export function contentLen(text) {
    const s = String(text)
        .replace(/\$\$|\$|\\\(|\\\)/g, '') // 去数学分隔符 $ $$ \( \)
        .replace(/\\text\{([\s\S]*?)\}/g, '$1') // \text{...} → 内容
        .replace(/\\vec\{?([a-zA-Z]+)\}?/g, '$1') // \vec{x} → x
        .replace(/\\[a-zA-Z]+/g, '') // 其余 LaTeX 命令去掉
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ');
    let len = 0;
    for (const ch of s) len += /[\u4e00-\u9fff]/.test(ch) ? 1.4 : 1;
    return Math.max(len, 0);
}

/**
 * 将节点文本中的 LaTeX 命令转为可读纯文本（非数学时）。
 * @param {string} text
 * @returns {string}
 */
export function plainText(text) {
    return text
        .replace(/\\vec\{?(\w+)\}?/g, '$1→')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, '');
}

/**
 * 把节点文本切成“纯文本 / 数学”片段（数学片段保留原始分隔符，渲染时再剥）。
 * @param {string} text
 * @returns {Array<{math:boolean, text:string}>}
 */
export function mathSplit(text) {
    const runs = [];
    let last = 0;
    MATH_RUN_RE.lastIndex = 0;
    let m;
    while ((m = MATH_RUN_RE.exec(text))) {
        if (m.index > last) runs.push({ math: false, text: text.slice(last, m.index) });
        runs.push({ math: true, text: m[0] });
        last = m.index + m[0].length;
    }
    if (last < text.length) runs.push({ math: false, text: text.slice(last) });
    return runs;
}

/**
 * 转义 HTML。
 * @param {*} s
 * @returns {string}
 */
export function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 反转义 HTML（取出 data-math 属性内嵌数学源码）。
 * @param {string} s
 * @returns {string}
 */
export function unescapeHtml(s) {
    return String(s)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

/**
 * 数学文本降级为可读纯文本（无 KaTeX 时）。
 * @param {string} s
 * @returns {string}
 */
export function mathToPlain(s) {
    return s
        .replace(/\\vec\{?(\w+)\}?/g, '$1\u2192')
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
        .replace(/\\cdot/g, '\u00b7')
        .replace(/\\times/g, '\u00d7')
        .replace(/\\rightarrow|\\to/g, '\u2192')
        .replace(/\\left|\\right/g, '')
        .replace(/[_^]\{?([^}]*)\}?/g, '$1')
        .replace(/\\[a-zA-Z]+/g, '');
}
