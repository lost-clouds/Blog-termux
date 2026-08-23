/**
 * @module tikz/expr
 * @description 数学表达式求值与坐标解析。
 *              求值注入（pgfmathsetmacro / plot / 坐标 {expr}），支持
 *              + - * / ^、括号、cos/sin/tan/abs/sqrt/exp/ln 及变量替换。
 * @requires tiktoken: 无（纯函数，与其他模块解耦）
 */

'use strict';

/**
 * 求值数学表达式。
 * @param {string} expr
 * @param {Object} vars - 变量字典（如 \x、\y 等）
 * @returns {number}
 */
export function evalExpr(expr, vars) {
    const s = String(expr).trim();
    if (s === '') return 0;
    // 替换变量 \x、\y、\ang 等为数值
    let body = s.replace(/\\[a-zA-Z]+/g, function (v) {
        const key = v.slice(1);
        if (vars && vars[key] !== undefined) return String(vars[key]);
        return '0';
    });
    // 短常量：pi、e
    body = body
        .replace(/\bpi\b/g, String(Math.PI))
        .replace(/\be\b/g, String(Math.E));

    // 用安全函数映射替换常见函数
    body = body
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/abs\(/g, 'Math.abs(')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/exp\(/g, 'Math.exp(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/deg\(/g, '(');
    try {
        // 仅数值运算，捕获执行错误
        const fn = new Function('return (' + body.replace(/\^/g, '**') + ');');
        const v = fn();
        return typeof v === 'number' && isFinite(v) ? v : 0;
    } catch (e) {
        return 0;
    }
}

/**
 * 求值单个坐标分量（可为 {expr}、常量或 \\var）。
 * @param {string} part
 * @param {Object} vars
 * @returns {number}
 */
function evalCoord(part, vars) {
    const t = String(part).trim();
    if (t.startsWith('{') && t.endsWith('}')) return evalExpr(t.slice(1, -1), vars);
    return evalExpr(t, vars);
}

/**
 * 解析坐标文本为 [x,y]（tikz 单位）。
 * 支持 (x,y) / (name) / (angle:radius) / ({expr},{expr}) / (a:b:r)。
 * @param {string} inner - 括号内文本
 * @param {Object} ctx - 含 vars、named 的上下文
 * @returns {Array<number>}
 */
export function parsePoint(inner, ctx) {
    const t = String(inner).trim();
    // 命名坐标引用
    if (ctx && ctx.named && ctx.named[t]) return [ctx.named[t][0], ctx.named[t][1]];
    // 极坐标 (angle:radius)；(a:b:r) 取为 (a:r)
    const polar = /^(?:\{?)(-?[\d.]+)\s*:\s*((?:\{[^}]*\}|-?[\d.]+))$/.exec(t);
    if (polar) {
        const ang = evalExpr(polar[1], ctx.vars) * Math.PI / 180;
        const r = evalExpr(polar[2], ctx.vars);
        return [r * Math.cos(ang), r * Math.sin(ang)];
    }
    // (x,y) 笛卡尔，支持 {expr} 占位
    const parts = t.split(',');
    if (parts.length >= 2) {
        const x = evalCoord(parts[0], ctx.vars);
        const y = evalCoord(parts[1], ctx.vars);
        return [x, y];
    }
    return [0, 0];
}