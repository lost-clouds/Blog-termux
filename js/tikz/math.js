/**
 * @module tikz/math
 * @description KaTeX 加载与节点数学文本填充。<foreignObject> 内含数学时，
 *              在此把 data-math 换成 KaTeX 渲染结果（未加载时降级为可读纯文本）。
 * @requires tikz/text
 */

'use strict';

import { mathSplit, mathBody, plainText, mathToPlain, escapeHtml, unescapeHtml } from './text.js';

/**
 * 从页面加载 KaTeX（已在全局则直接用；否则尝试动态加载存档路径）。
 * @returns {Promise<boolean>}
 */
export async function ensureKatex() {
    if (typeof window !== 'undefined' && window.katex) return true;
    // 非浏览器/无 DOM 环境：不要抛 ReferenceError，直接按“KaTeX 不可用”降级
    if (typeof document === 'undefined') return false;
    try {
        const scr = document.createElement('script');
        scr.src = 'lib/katex.min.js';
        scr.async = false;
        await new Promise(function (res, rej) {
            scr.onload = res;
            scr.onerror = rej;
            document.head.appendChild(scr);
        });
    } catch (e) {
        return false;
    }
    return !!window.katex;
}

/**
 * 将 SVG 字符串中所有 tikz-math foreignObject 替换为 KaTeX（或降级纯文本）。
 * 纯文本与数学片段都按 mathSplit 切分后渲染；即使 KaTeX 未加载，
 * 也会把 $...$ 的定界符剥掉并转换为可读文本，而不是把源码原样显示。
 * @param {string} svgBody
 * @returns {string}
 */
export function fillMathInSvg(svgBody) {
    const hasKatex = typeof window !== 'undefined' && window.katex;
    return svgBody.replace(
        /<foreignObject([^>]*)><div[^>]*class="tikz-math"[^>]*data-math="([^"]*)"[^>]*><\/div><\/foreignObject>/g,
        function (all, attrs, mathHtml) {
            const math = unescapeHtml(mathHtml);
            const html = mathSplit(math)
                .map(function (run) {
                    if (run.math) {
                        const body = mathBody(run.text);
                        // $$...$$ → 块级（displayMode），$...$ / \(...\) → 行内
                        const display = run.text.slice(0, 2) === '$$';
                        if (hasKatex) {
                            try {
                                return window.katex.renderToString(body, {
                                    throwOnError: false,
                                    displayMode: display,
                                });
                            } catch (e) {
                                // 单条公式失败只降级该片段，不影响其它文本/公式
                            }
                        }
                        return '<span>' + escapeHtml(mathToPlain(body)) + '</span>';
                    }
                    // 纯文本片段：换行（\\\\ 已规范化为 \n）渲染为 <br>
                    return (
                        '<span>' +
                        escapeHtml(plainText(run.text)).replace(/\n/g, '<br>') +
                        '</span>'
                    );
                })
                .join('');
            return (
                '<foreignObject' +
                attrs +
                '><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-math" style="text-align:center;line-height:1.4">' +
                html +
                '</div></foreignObject>'
            );
        }
    );
}
