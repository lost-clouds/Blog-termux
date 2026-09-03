/**
 * @module tikz/text
 * @description 文本工具：换行规范化、数学片段扫描、有效显示长度估算、
 *              纯文本转换、HTML 转义与数学降级。
 *
 * 设计要点：
 *  - `\\\\` 是 TikZ 节点文本的显式换行符，进入任何估算/渲染前先规范化为 `\n`；
 *    这一步同时消除了 `\\(` 被误判为行内数学分隔符 `\(` 的经典问题。
 *  - 数学片段用显式扫描器识别，而不是依赖带状态的全局正则，
 *    避免 lastIndex 残留与“转义反斜杠”歧义。
 */

'use strict';

/**
 * 把 TikZ 节点文本的换行符 `\\\\`（两个连续反斜杠）规范化为 `\n`。
 * 所有文本工具与节点渲染统一从这里进入，保证宽高估算和 SVG 输出口径一致。
 * @param {*} text
 * @returns {string}
 */
export function normalizeText(text) {
    return String(text == null ? '' : text).replace(/\\\\/g, '\n');
}

/**
 * 判断文本中是否含有真正的数学片段（`$...$`、`$$...$$`、`\(...\)`）。
 * 转义的 `\$` 与换行符 `\\\\` 不会被误判。
 * @param {*} text
 * @returns {boolean}
 */
export function hasMathText(text) {
    return mathSplit(text).some(function (run) {
        return run.math;
    });
}

/**
 * 估算节点文本的“有效显示长度”：剔除数学分隔符、花括号与 LaTeX 脚手架，
 * 用最终呈现的字符数近似度量，避免按原始源码长度把元素撑得过大。
 * @param {string} text
 * @returns {number}
 */
export function contentLen(text) {
    const s = normalizeText(text)
        .replace(/\$\$|\$|\\\(|\\\)/g, '') // 去数学分隔符 $ $$ \( \)
        .replace(/\\text\{([\s\S]*?)\}/g, '$1') // \text{...} → 内容
        .replace(/\\vec\{?([a-zA-Z]+)\}?/g, '$1') // \vec{x} → x
        .replace(/\\[a-zA-Z]+/g, '') // 其余 LaTeX 命令去掉
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ');
    let len = 0;
    // CJK 字形接近全角，1.5 的权重配合 displayWidth 的 0.62em/字符系数，
    // 得到约 0.93em 的估算宽度，显著降低中文节点盒子偏窄导致的贴边/重叠。
    for (const ch of s) len += /[\u4e00-\u9fff]/.test(ch) ? 1.5 : 1;
    return Math.max(len, 0);
}

/**
 * 剥离数学片段的定界符，得到 KaTeX 可直接消费的裸 LaTeX。
 * @param {string} runText - mathSplit 输出的数学片段（含定界符）
 * @returns {string}
 */
export function mathBody(runText) {
    return String(runText)
        .replace(/^\$\$\s*|\s*\$\$$/g, '')
        .replace(/^\$\s*|\s*\$$/g, '')
        .replace(/^\\\(\s*|\s*\\\)$/g, '');
}

/**
 * 估算节点文本的显示宽度（px）。
 * 按“纯文本 / 数学”片段分别估算后求和；多行（`\\\\` 换行）取最长一行。
 * 数学片段按 0.55em/字符估算（KaTeX 数学斜体较密）并附加 0.3em 余量，
 * 纯文本按 0.62em/字符（CJK 在 contentLen 中加权 1.4 ≈ 0.87em）。
 * 旧实现把全文（含数学内的 ASCII，如 a^2+b^2=c^2）按 0.62em 计再整体 ×1.8，
 * 导致含公式的节点盒宽严重过估、相邻节点横向重叠（example.md 15.9 两框合并）。
 * @param {string} text
 * @param {number} fs
 * @returns {number}
 */
export function displayWidth(text, fs) {
    let maxW = 0;
    const lines = normalizeText(text).split('\n');
    for (const line of lines) {
        let w = 0;
        for (const run of mathSplit(line)) {
            if (run.math) {
                w += contentLen(mathBody(run.text)) * fs * 0.55 + fs * 0.3;
            } else {
                w += contentLen(run.text) * fs * 0.62;
            }
        }
        if (w > maxW) maxW = w;
    }
    return Math.ceil(maxW);
}

/**
 * 文本行数（`\\\\` 视为换行；空白/空文本视为 0 行）。
 * @param {string} text
 * @returns {number}
 */
export function lineCount(text) {
    const s = normalizeText(text).trim();
    if (!s) return 0;
    return s.split('\n').length;
}

/**
 * 将节点文本中的 LaTeX 命令转为可读纯文本（非数学时）。
 * @param {string} text
 * @returns {string}
 */
export function plainText(text) {
    return normalizeText(text)
        // TeX 转义字符还原为字面字符；要放在命令清理之前，
        // 避免 \$、\% 等被误当成 LaTeX 命令或残留下划线符号。
        .replace(/\\\$/g, '$')
        .replace(/\\%/g, '%')
        .replace(/\\#/g, '#')
        .replace(/\\&/g, '&')
        .replace(/\\_/g, '_')
        .replace(/\\vec\{?(\w+)\}?/g, '$1→')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, '');
}

/**
 * 把节点文本切成“纯文本 / 数学”片段（数学片段保留原始分隔符，渲染时再剥）。
 * 显式扫描器规则：
 *   - `$$...$$` 优先于 `$...$`，两者均需有闭合定界符；
 *   - `\(...\)` 是行内数学；`\\(` 已在 normalizeText 中变成长度为 1 的 `\n`；
 *   - `\$` 是字面美元符，不是数学起点（扫描器一次跳过反斜杠+下一字符）。
 * @param {string} text
 * @returns {Array<{math:boolean, text:string}>}
 */
export function mathSplit(text) {
    const s = normalizeText(text);
    const runs = [];
    let plainStart = 0;
    let i = 0;

    while (i < s.length) {
        if (s[i] === '\\') {
            // 真正的行内数学起点 \(...\)
            if (s[i + 1] === '(') {
                const end = s.indexOf('\\)', i + 2);
                if (end !== -1) {
                    if (i > plainStart) runs.push({ math: false, text: s.slice(plainStart, i) });
                    const stop = end + 2; // 包含 \)
                    runs.push({ math: true, text: s.slice(i, stop) });
                    plainStart = stop;
                    i = stop;
                    continue;
                }
            }
            // 其它反斜杠：跳过“反斜杠+下一字符”，使 \$、\)、\left 等不被拆解
            i += 2;
            continue;
        }
        if (s[i] === '$') {
            if (s[i + 1] === '$') {
                const end = s.indexOf('$$', i + 2);
                if (end !== -1) {
                    if (i > plainStart) runs.push({ math: false, text: s.slice(plainStart, i) });
                    const stop = end + 2;
                    runs.push({ math: true, text: s.slice(i, stop) });
                    plainStart = stop;
                    i = stop;
                    continue;
                }
            } else {
                const end = s.indexOf('$', i + 1);
                if (end !== -1) {
                    if (i > plainStart) runs.push({ math: false, text: s.slice(plainStart, i) });
                    const stop = end + 1;
                    runs.push({ math: true, text: s.slice(i, stop) });
                    plainStart = stop;
                    i = stop;
                    continue;
                }
            }
        }
        i++;
    }

    if (plainStart < s.length) runs.push({ math: false, text: s.slice(plainStart) });
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
 * 数学文本降级为可读纯文本（无 KaTeX 或 KaTeX 渲染失败时）。
 * 目标不是复刻 LaTeX 排版，而是保留公式结构与上下标，让降级结果可读。
 * @param {string} s
 * @returns {string}
 */
export function mathToPlain(s) {
    return (
        normalizeText(s)
            // 先把常见结构改成可读记法，再做通用命令清理
            .replace(/^\$\$\s*|\s*\$\$$/g, '')
            .replace(/^\$\s*|\s*\$$/g, '')
            .replace(/^\\\(\s*|\s*\\\)$/g, '')
            .replace(/\\text\{([^{}]*)\}/g, '$1')
            .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
            .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
            .replace(/\\mathcal\{([^{}]*)\}/g, '$1')
            .replace(/\\mathbb\{([^{}]*)\}/g, '$1')
            .replace(/\\mathrm\{([^{}]*)\}/g, '$1')
            .replace(/\\vec\{?(\w+)\}?/g, '$1\u2192')
            .replace(/\\cdot/g, '\u00b7')
            .replace(/\\times/g, '\u00d7')
            .replace(/\\pm/g, '\u00b1')
            .replace(/\\Delta/g, '\u0394')
            .replace(/\\nabla/g, '\u2207')
            .replace(/\\rightarrow|\\to|\\mapsto/g, '\u2192')
            .replace(/\\left|\\right/g, '')
            // 花括号转义 \{ \} 还原为字面花括号（如 \mathcal{F}^{-1}\{X(f)\}）
            .replace(/\\\{/g, '{')
            .replace(/\\\}/g, '}')
            // 保留上下标记号（F^-1、x_i 这类降级结果更接近原公式）
            .replace(/\^\{([^{}]*)\}/g, '^$1')
            .replace(/_\{([^{}]*)\}/g, '_$1')
            .replace(/[{}]/g, '')
            .replace(/\\[a-zA-Z]+/g, '')
            .replace(/\s+/g, ' ')
            .trim()
    );
}
