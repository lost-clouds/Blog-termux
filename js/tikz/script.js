/**
 * @module tikz/script
 * @description TikZ 源码脚本层：预处理（剥离包裹/注释）、语句切分、命令解析、
 *              foreach 展开、pgfmathsetmacro 执行。
 * @requires tikz/expr
 */

'use strict';

import { evalExpr } from './expr.js';
import { parsePreamble } from './styles.js';

/**
 * 剔除 % 注释（保留花括号内与转义 \%）。
 * @param {string} s
 * @returns {string}
 */
function stripComments(s) {
    const out = [];
    const lines = s.split('\n');
    for (const line of lines) {
        let inBrace = 0;
        let cut = -1;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '\\') {
                i++;
                continue;
            }
            if (ch === '{') inBrace++;
            else if (ch === '}') inBrace--;
            else if (ch === '%' && inBrace === 0) {
                cut = i;
                break;
            }
        }
        out.push(cut === -1 ? line : line.slice(0, cut));
    }
    return out.join('\n');
}

/**
 * 提取 tikzpicture 前置选项块（样式、node distance、scale）并解析。
 * 找出 \begin{tikzpicture}[...] 中的 [...]（花括号配对切分）。
 * @param {string} source - 原始源码
 * @returns {{styles:Object, nodeDistance:number, scale:number, body:string}}
 *          body 为去掉前置选项块后的源码
 */
function extractPreamble(source) {
    // 查找 tikzpicture 前置块
    const m = /\\begin\{tikzpicture\}\s*\[/.exec(source);
    if (!m) return { styles: {}, nodeDistance: 1, scale: 1, transform: null, body: source };
    const start = m.index + m[0].length - 1; // 指向 '['
    const end = findCloseBracket(source, start);
    if (end === -1) return { styles: {}, nodeDistance: 1, scale: 1, transform: null, body: source };
    const optsStr = source.slice(start + 1, end);
    const preamble = parsePreamble(optsStr);
    const body = source.slice(0, m.index) + source.slice(end + 1);
    return {
        styles: preamble.styles,
        nodeDistance: preamble.nodeDistance,
        scale: preamble.scale,
        transform: preamble.transform,
        body: body,
    };
}

/**
 * 找出从 open 起配套的右方括号下标（花括号深度计入，忽略内部嵌套）。
 * @param {string} s
 * @param {number} open - 指向 '['
 * @returns {number}
 */
function findCloseBracket(s, open) {
    let depth = 0;
    let brace = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') brace++;
        else if (ch === '}') brace--;
        else if (ch === '[' && brace === 0) depth++;
        else if (ch === ']' && brace === 0) {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

/**
 * 预处理：剥离 begin/end 包裹、整行忽略命令（usetikzlibrary 等）、剔除 % 注释。
 * @param {string} source
 * @returns {string}
 */
export function preprocess(source) {
    let s = stripComments(source);
    // 普通环境（document/tikzpicture）直接剥离；scope 环境必须保留，
    // 由 expandScript 转换为 __scopePush / __scopePop 语句，驱动坐标变换栈。
    s = s
        .replace(
            /\\begin\{([^}]*)\}(?:\[[^\]]*\])?\s*/g,
            function (all, name) {
                return name === 'scope' ? all : '';
            }
        )
        .replace(
            /\\end\{([^}]*)\}(?:\[[^\]]*\])?\s*/g,
            function (all, name) {
                return name === 'scope' ? all : '';
            }
        )
        .replace(/^\s*\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*$/gm, '')
        .replace(/^\s*\\usepackage(?:\[[^\]]*\])?\{[^}]*\}\s*$/gm, '')
        .replace(/^\s*\\usetikzlibrary\{[^}]*\}\s*$/gm, '')
        .replace(/^\s*\\tikzset\{[^}]*\}\s*$/gm, '')
        .replace(/^\s*\\pgfkeys\{[^}]*\}\s*$/gm, '')
        .trim();
    return s;
}

export { extractPreamble };

/**
 * 从 i 起读到下一个"顶层分号"（花括号内的分号不计），返回分号之后的下标；
 * 若一直未遇到顶层分号，则返回文本末尾。分号本身被消费（含在返回值中）。
 * @param {string} text
 * @param {number} i
 * @returns {number}
 */
function readToSemicolon(text, i) {
    let depth = 0;
    const n = text.length;
    while (i < n) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === ';' && depth === 0) {
            return i + 1; // 含分号
        }
        i++;
    }
    return i;
}

/**
 * 读取从 openIdx（指向左花括号）开始的配对花括号块。
 * 返回 { inner, end }：inner 为花括号内的文本，end 为配对右花括号下标。
 * 找不到配对时退化为"到文本末尾"，保证不抛错。
 * @param {string} text
 * @param {number} openIdx
 * @returns {{inner:string, end:number}}
 */
function readBalanced(text, openIdx) {
    let depth = 0;
    const n = text.length;
    for (let i = openIdx; i < n; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return { inner: text.slice(openIdx + 1, i), end: i };
        }
    }
    return { inner: text.slice(openIdx + 1), end: n - 1 };
}

/**
 * 解析普通命令：\\cmd[opts]? rest → {command, opts, rest}。
 * @param {string} s
 * @returns {Object}
 */
function parseCommand(s) {
    const m = /^\\([a-zA-Z]+)([\s\S]*)$/.exec(s);
    if (!m) return { command: '', opts: '', rest: s };
    const cmd = m[1];
    const after = m[2];
    const om = after.match(/^\s*\[([^\]]*)\]/);
    let opts = '';
    let rest = after;
    if (om) {
        opts = om[1];
        rest = after.slice(om[0].length);
    }
    return { command: cmd, opts: opts, rest: rest.trim() };
}

/**
 * 展开 \foreach 与执行 \pgfmathsetmacro，得到扁平命令序列。
 * 输出 { vars, statements }。
 *
 * 与旧版"先按分号切分、再逐条展开"不同，这里直接按语法结构推进顶层解析器，
 * 使 \foreach / \pgfmathsetmacro 能精确消费自己的花括号块，绝不吞并后续语句——
 * 旧实现用贪婪正则 `\{([\s\S]*)\}\s*$` 抓 foreach 的 body，会把 foreach 之后
 * 紧跟的语句（直至源码最后一个 `}`）一并吸入并解析错乱（见 example.md 15.7
 * 中 `\node[rectangle,...] (box) ...` 被吞、`(a)--(box)` 退化为 M0 0L0 0 的 bug）。
 * @param {string} src - 已除注释与包裹标记的源码
 * @returns {{vars:Object, statements:Array}}
 */
export function expandScript(src) {
    const ctx = { vars: {}, out: [] };
    parseStatements(src, ctx);
    return { vars: ctx.vars, statements: ctx.out };
}

/**
 * 解析一段语句序列（顶层循环与 foreach body 递归复用）。
 * @param {string} text
 * @param {Object} ctx - { vars, out }
 */
function parseStatements(text, ctx) {
    let i = 0;
    const n = text.length;
    while (i < n) {
        // 跳过空白（注释已在 preprocess 中剥离）
        while (i < n && /\s/.test(text[i])) i++;
        if (i >= n) break;
        if (text.startsWith('\\foreach', i)) {
            i = parseForeach(text, i, ctx);
        } else if (text.startsWith('\\pgfmathsetmacro', i)) {
            i = parseMacro(text, i, ctx);
        } else if (text.startsWith('\\begin{scope}', i)) {
            i = parseScopeBegin(text, i, ctx);
        } else if (text.startsWith('\\end{scope}', i)) {
            i = parseScopeEnd(text, i, ctx);
        } else {
            // 普通命令：读到顶层分号，并去掉结尾分号后交给命令解析器
            const start = i;
            const end = readToSemicolon(text, i);
            let stop = end;
            if (stop > start && text[stop - 1] === ';') stop--;
            const stmt = text.slice(start, stop).trim();
            if (stmt) ctx.out.push(parseCommand(substituteVars(stmt, ctx.vars)));
            i = end;
        }
    }
}

/**
 * 把已知循环变量/宏在其文本形式（坐标、节点文本等）替换为数值。
 * 仅在“压入语句”时执行一次，后续渲染期 ctx.vars 已还原，不会再求值到 0。
 * @param {string} text
 * @param {Object} vars
 * @returns {string}
 */
function substituteVars(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\\[a-zA-Z]+/g, function (tok) {
        const key = tok.slice(1);
        if (vars[key] !== undefined) return String(vars[key]);
        return tok;
    });
}

/**
 * 解析 \begin{scope}[opts]，压入一条 scope 变换语句。
 * scope 本身不产生图元，只把 opts 保存到 __scopePush，渲染阶段应用坐标变换。
 * @param {string} text
 * @param {number} i - 指向 '\' 的下标
 * @param {Object} ctx
 * @returns {number}
 */
function parseScopeBegin(text, i, ctx) {
    const m = /^\\begin\{scope\}\s*\[([^\]]*)\]/.exec(text.slice(i));
    if (!m) return readToSemicolon(text, i); // 语法异常：按普通语句容错
    ctx.out.push({ command: '__scopePush', opts: substituteVars(m[1], ctx.vars), rest: '' });
    return i + m[0].length;
}

/**
 * 解析 \end{scope}，压入一条 scope 弹出语句。
 * @param {string} text
 * @param {number} i - 指向 '\' 的下标
 * @param {Object} ctx
 * @returns {number}
 */
function parseScopeEnd(text, i, ctx) {
    const m = /^\\end\{scope\}/.exec(text.slice(i));
    if (!m) return readToSemicolon(text, i);
    ctx.out.push({ command: '__scopePop', opts: '', rest: '' });
    let j = i + m[0].length;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (j < text.length && text[j] === ';') j++;
    return j;
}

/**
 * 解析 \foreach \x in {list} { body }，展开 body 并返回消费后的下标。
 * 使用花括号配对（readBalanced）精确抓取 list 与 body，避免贪婪匹配吞并后续语句。
 * @param {string} text
 * @param {number} i - 指向 '\' 的下标
 * @param {Object} ctx
 * @returns {number}
 */
function parseForeach(text, i, ctx) {
    // 匹配 \foreach \x in { …（head[0] 以 list 的 '{' 结尾）
    const head = /^\\foreach\s+\\?([a-zA-Z]+)\s+in\s*\{/.exec(text.slice(i));
    if (!head) return readToSemicolon(text, i); // 语法异常：按普通语句容错
    const varName = head[1];
    let j = i + head[0].length; // 指向 list '{' 之后的第一个字符
    const listBlock = readBalanced(text, j - 1);
    const listStr = listBlock.inner;
    j = listBlock.end + 1;
    // 跳过空白，期望 body 的左花括号
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== '{') return readToSemicolon(text, i); // 缺少 body：容错
    const bodyBlock = readBalanced(text, j);
    const body = bodyBlock.inner;
    j = bodyBlock.end + 1;

    const values = parseForeachList(listStr);
    // foreach 循环体在 TikZ 中形成一个分组：循环变量与循环体内定义的宏
    // 都不应泄漏到后续语句。这里保存进入循环前的变量表，每次迭代从同一
    // 基线开始；循环结束后整体还原，避免 \pgfmathsetmacro 污染后续 \draw。
    const outerVars = ctx.vars;
    for (const val of values) {
        ctx.vars = Object.assign({}, outerVars);
        ctx.vars[varName] = val;
        parseStatements(body, ctx); // 递归展开 body（支持嵌套 foreach / 宏）
    }
    ctx.vars = outerVars;
    return j;
}

/**
 * 解析 \pgfmathsetmacro{\name}{expr}（可选尾随分号），返回消费后的下标。
 * @param {string} text
 * @param {number} i - 指向 '\' 的下标
 * @param {Object} ctx
 * @returns {number}
 */
function parseMacro(text, i, ctx) {
    const m = /^\\pgfmathsetmacro\s*\{\\([a-zA-Z]+)\}\s*\{/.exec(text.slice(i));
    if (!m) return readToSemicolon(text, i);
    const name = m[1];
    let j = i + m[0].length; // 指向表达式 '{' 之后的第一个字符
    const exprBlock = readBalanced(text, j - 1);
    ctx.vars[name] = evalExpr(exprBlock.inner, ctx.vars);
    j = exprBlock.end + 1;
    // 吸收可选尾随分号
    while (j < text.length && /\s/.test(text[j])) j++;
    if (j < text.length && text[j] === ';') j++;
    return j;
}

/**
 * 解析 foreach 值列表。
 * 支持两种形式：
 *  - 显式列举：{a,b,c}（可含字符串，如 {o,p}，保留原样）
 *  - 椭圆展开：{a,b,...,z}（mid/末位 ...，步长由第二项提供）或 {a,...,z}（步长 1）
 * @param {string} listStr
 * @returns {Array<number|string>}
 */
function parseForeachList(listStr) {
    const trimmed = listStr.trim();
    const parts = trimmed.split(',').map((x) => x.trim());

    // 椭圆展开：某一段为 "..."（可出现在列表中部或末尾）
    const dotIdx = parts.findIndex((p) => /^\.\.\.$/.test(p));
    if (dotIdx !== -1) {
        const nums = parts.filter((p) => p !== '...' && /^-?\d+(\.\d+)?$/.test(p)).map(Number);
        if (nums.length >= 2) {
            const step = nums.length >= 3 ? nums[1] - nums[0] : 1;
            const end = nums[nums.length - 1];
            const arr = [];
            for (let v = nums[0]; step > 0 ? v <= end : v >= end; v += step) {
                arr.push(Math.round(v * 1e6) / 1e6);
            }
            return arr;
        }
    }

    // 显式列举：数值转 number，其余（如坐标名 o,p）保留字符串原样
    return parts
        .filter((p) => p !== '...')
        .map((p) => {
            const n = parseFloat(p);
            return p.trim() !== '' && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(p) ? n : p;
        })
        .filter((v) => v !== '');
}
