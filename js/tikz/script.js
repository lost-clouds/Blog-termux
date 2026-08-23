/**
 * @module tikz/script
 * @description TikZ 源码脚本层：预处理（剥离包裹/注释）、语句切分、命令解析、
 *              foreach 展开、pgfmathsetmacro 执行。
 * @requires tikz/expr
 */

'use strict';

import { evalExpr } from './expr.js';

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
            if (ch === '\\') { i++; continue; }
            if (ch === '{') inBrace++;
            else if (ch === '}') inBrace--;
            else if (ch === '%' && inBrace === 0) { cut = i; break; }
        }
        out.push(cut === -1 ? line : line.slice(0, cut));
    }
    return out.join('\n');
}

/**
 * 预处理：剥离 begin/end 包裹、整行忽略命令（usetikzlibrary 等）、剔除 % 注释。
 * @param {string} source
 * @returns {string}
 */
export function preprocess(source) {
    let s = stripComments(source);
    s = s
        .replace(/\\begin\{[^}]*\}(?:\[[^\]]*\])?\s*/g, '')
        .replace(/\\end\{[^}]*\}(?:\[[^\]]*\])?\s*/g, '')
        .replace(/^\s*\\usetikzlibrary\{[^}]*\}\s*$/gm, '')
        .replace(/^\s*\\tikzset\{[^}]*\}\s*$/gm, '')
        .replace(/^\s*\\pgfkeys\{[^}]*\}\s*$/gm, '')
        .trim();
    return s;
}

/**
 * 将文本按顶层分号切分为语句数组（花括号内不切割）。
 * @param {string} text
 * @returns {Array<string>}
 */
function splitStatements(text) {
    const out = [];
    let cur = '';
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === ';' && depth === 0) { if (cur.trim()) out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
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
    if (om) { opts = om[1]; rest = after.slice(om[0].length); }
    return { command: cmd, opts: opts, rest: rest.trim() };
}

/**
 * 展开 \foreach 与执行 \pgfmathsetmacro，得到扁平命令序列。
 * 输出 { vars, statements }。
 * @param {string} src - 已除注释与包裹标记的源码
 * @returns {{vars:Object, statements:Array}}
 */
export function expandScript(src) {
    const ctx = { vars: {}, out: [] };
    for (const stmt of splitStatements(src)) {
        expandStatement(stmt, ctx);
    }
    return { vars: ctx.vars, statements: ctx.out };
}

/**
 * 展开单条语句（foreach 块 / pgfmathsetmacro / 普通命令）。
 * @param {string} stmt
 * @param {Object} ctx
 */
function expandStatement(stmt, ctx) {
    const trimmed = stmt.trim();
    const fm = /^\\(foreach|pgfmathsetmacro)\b([\s\S]*)$/.exec(trimmed);
    if (!fm) { ctx.out.push(parseCommand(trimmed)); return; }
    const cmd = fm[1];
    const after = fm[2];

    if (cmd === 'foreach') { expandForeach(after, ctx); return; }
    // pgfmathsetmacro{\name}{expr}（expr 内部不含右花括号）。
    // 兼容写法：宏后面可以再跟其他语句（且不一定以 ; 结尾），此时先把宏
    // 计算存入变量，再继续展开剩余语句；否则按旧行为整条会被吞掉。
    const mm = /^\s*\{\\([a-zA-Z]+)\}\s*\{([^{}]*)\}\s*([\s\S]*)$/.exec(after);
    if (mm) {
        ctx.vars[mm[1]] = evalExpr(mm[2], ctx.vars);
        const rest = (mm[3] || '').trim();
        if (rest) {
            for (const s of splitStatements(rest)) expandStatement(s, ctx);
        }
    }
}

/**
 * 展开 foreach：\x in {list} { body ; ... }。
 * @param {string} after
 * @param {Object} ctx
 */
function expandForeach(after, ctx) {
    const headM = after.match(/^\s*\\?([a-zA-Z]+)\s+in\s*\{([^}]*)\}\s*\{([\s\S]*)\}\s*$/);
    if (!headM) return;
    const varName = headM[1];
    const listStr = headM[2];
    const body = headM[3];
    const values = parseForeachList(listStr);
    for (const val of values) {
        ctx.vars[varName] = val;
        for (const s of splitStatements(body)) expandStatement(s, ctx);
    }
    delete ctx.vars[varName];
}

/**
 * 解析 foreach 值列表：{a,b,c} 或 {a,...,z}（步长自适应）。
 * @param {string} listStr
 * @returns {Array<number>}
 */
function parseForeachList(listStr) {
    const trimmed = listStr.trim();
    // 椭圆展开：a,b,...,z（b 提供步长）或 a,...,z（步长 1）
    const hasDots = /,\s*\.\s*\.\s*\.\s*$/.test(trimmed);
    if (hasDots) {
        const parts = trimmed.split(',');
        const seq = [];
        for (const p of parts) {
            const t = p.replace(/\.\s*$/g, '').trim();
            const n = parseFloat(t);
            if (Number.isFinite(n)) seq.push(n);
        }
        if (seq.length >= 2) {
            const step = seq.length >= 3 ? seq[1] - seq[0] : 1;
            const end = seq[seq.length - 1];
            const arr = [];
            for (let v = seq[0]; step > 0 ? v <= end : v >= end; v += step) {
                arr.push(Math.round(v * 1e6) / 1e6);
            }
            return arr;
        }
    }
    return trimmed.split(',').map(function (x) { return parseFloat(x.trim()); });
}