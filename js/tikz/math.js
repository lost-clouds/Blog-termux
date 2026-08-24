/**
 * @module tikz/math
 * @description KaTeX 加载与节点数学文本填充。<foreignObject> 内含数学时，
 *              在此把 data-math 换成 KaTeX 渲染结果（未加载时降级为纯文本）。
 * @requires tikz/text
 */

'use strict';

import { mathSplit, plainText, mathToPlain, escapeHtml, unescapeHtml } from './text.js';

/**
 * 从页面加载 KaTeX（已在全局则直接用；否则尝试动态加载存档路径）。
 * @returns {Promise<boolean>}
 */
export async function ensureKatex() {
    if (window.katex) return true;
    if (typeof window.__KATEX_LOAD__ === 'function') {
        try { await window.__KATEX_LOAD__(); if (window.katex) return true; } catch (e) { /* continue */ }
    }
    try {
        const scr = document.createElement('script');
        scr.src = 'lib/katex.min.js';
        scr.async = false;
        await new Promise(function (res, rej) { scr.onload = res; scr.onerror = rej; document.head.appendChild(scr); });
    } catch (e) {
        return false;
    }
    return !!window.katex;
}

/**
 * 将 SVG 字符串中所有 tikz-math foreignObject 替换为 KaTeX（或降级纯文本）。
 * @param {string} svgBody
 * @returns {string}
 */
export function fillMathInSvg(svgBody) {
    const hasKatex = typeof window !== 'undefined' && window.katex;
    return svgBody.replace(/<foreignObject([^>]*)><div[^>]*class="tikz-math"[^>]*data-math="([^"]*)"[^>]*><\/div><\/foreignObject>/g, function (all, attrs, mathHtml) {
        const math = unescapeHtml(mathHtml);
        let html = '';
        if (hasKatex) {
            const runs = mathSplit(math);
            html = runs.map(function (run) {
                if (run.math) {
                    const body = run.text
                        .replace(/^\$\$\s*|\s*\$\$$/g, '')
                        .replace(/^\$\s*|\s*\$$/g, '')
                        .replace(/^\\\(\s*|\s*\\\)$/g, '');
                    try {
                        return window.katex.renderToString(body, { throwOnError: false, displayMode: false });
                    } catch (e) {
                        return '<span>' + escapeHtml(mathToPlain(body)) + '</span>';
                    }
                }
                return '<span>' + escapeHtml(plainText(run.text)) + '</span>';
            }).join('');
        }
        if (!html) html = '<span>' + escapeHtml(mathToPlain(math)) + '</span>';
        return '<foreignObject' + attrs + '><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-math" style="text-align:center">' + html + '</div></foreignObject>';
    });
}