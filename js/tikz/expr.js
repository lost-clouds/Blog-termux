/**
 * @module tikz/expr
 * @description 数学表达式求值与坐标解析。
 *              求值注入（pgfmathsetmacro / plot / 坐标 {expr}），支持
 *              + - * / ^、括号、cos/sin/tan/abs/sqrt/exp/ln 及变量替换。
 * @requires tiktoken: 无（纯函数，与其他模块解耦）
 */

'use strict';

import { transformTikzPoint } from './context.js';

// 白名单函数表：表达式仅允许出现这些函数（杜绝任意 JS 执行，见 audit H1）。
const FUNCS = {
    cos: Math.cos,
    sin: Math.sin,
    tan: Math.tan,
    abs: Math.abs,
    sqrt: Math.sqrt,
    exp: Math.exp,
    ln: Math.log,
    log: Math.log10,
    deg: function (x) {
        return x; // TikZ 中 deg() 仅做角度→弧度标记，本引擎角度一律按度处理，故恒等
    },
};

/**
 * 将表达式文本切分为词法单元。
 * 仅识别：数字、'\\name' 变量、字母词（函数/常量）、四则与乘方运算符 ^ 及括号。
 * 未知字符静默跳过（容错）；'r' 作为 TikZ 弧度标记被忽略（无实际作用）。
 * @param {string} str - 表达式文本
 * @returns {Array<Object>} 词法单元数组，以 {t:'eof'} 结尾
 */
function tokenize(str) {
    const out = [];
    const s = String(str);
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (ch === '\\') {
            const wm = /^\\[a-zA-Z]+/.exec(s.slice(i));
            if (wm) {
                out.push({ t: 'var', name: wm[0].slice(1) });
                i += wm[0].length;
                continue;
            }
            i++;
            continue;
        }
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        const nm = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
        if (nm) {
            out.push({ t: 'num', v: parseFloat(nm[0]) });
            i += nm[0].length;
            continue;
        }
        if (/[a-zA-Z]/.test(ch)) {
            const wm = /^[a-zA-Z]+/.exec(s.slice(i));
            // 'r' 为 TikZ 弧度记号（cos(2x r)），对求值无意义，直接丢弃
            if (wm[0] !== 'r') out.push({ t: 'word', v: wm[0] });
            i += wm[0].length;
            continue;
        }
        if ('+-*/^()'.indexOf(ch) !== -1) {
            out.push({ t: ch });
            i++;
            continue;
        }
        i++;
    }
    out.push({ t: 'eof' });
    return out;
}

/**
 * 将词法单元编译为求值闭包（一次解析，多次求值）。
 * 优先级（对齐 TeX/pgfmath）：幂 ^ 高于一元负号，故 -x^2 = -(x^2)。
 *    Expr := Term (('+'|'-') Term)*
 *    Term := Unary (('*'|'/') Unary)*
 *    Unary := ('-'|'+') Unary | Power
 *    Power := Atom ('^' Unary)?          // 右结合
 *    Atom := number | '\\name' | '(' Expr ')' | func '(' Expr ')' | pi | e | 0
 * @param {Array<Object>} tokens - tokenize 的输出
 * @returns {function(Object):number} 输入 vars 输出数值
 */
function compileTokens(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => {
        const t = tokens[pos];
        if (t.t !== 'eof') pos++;
        return t;
    };
    const parseExpr = () => {
        let left = parseTerm();
        while (peek().t === '+' || peek().t === '-') {
            const op = next().t;
            const right = parseTerm();
            const L = left;
            left =
                op === '+'
                    ? (v) => L(v) + right(v)
                    : (v) => L(v) - right(v);
        }
        return left;
    };
    const parseTerm = () => {
        let left = parseUnary();
        while (peek().t === '*' || peek().t === '/') {
            const op = next().t;
            const right = parseUnary();
            const L = left;
            left =
                op === '*'
                    ? (v) => L(v) * right(v)
                    : (v) => L(v) / right(v);
        }
        return left;
    };
    const parseUnary = () => {
        const t = peek().t;
        if (t === '-') {
            next();
            const inner = parseUnary();
            return (v) => -inner(v);
        }
        if (t === '+') {
            next();
            return parseUnary();
        }
        return parsePower();
    };
    const parsePower = () => {
        const base = parseAtom();
        if (peek().t === '^') {
            next();
            const exp = parseUnary(); // 右结合且允许 2^-3
            const B = base;
            return (v) => Math.pow(B(v), exp(v));
        }
        return base;
    };
    const parseAtom = () => {
        const t = peek();
        if (t.t === 'num') {
            next();
            const val = t.v;
            return () => val;
        }
        if (t.t === 'var') {
            next();
            const name = t.name;
            return (v) => {
                const x = v && v[name];
                return x === undefined || x === null ? 0 : Number(x) || 0;
            };
        }
        if (t.t === '(') {
            next();
            const inner = parseExpr();
            next(); // ')'
            return inner;
        }
        if (t.t === 'word') {
            const word = t.v;
            next();
            if (word === 'pi') return () => Math.PI;
            if (word === 'e') return () => Math.E;
            const fn = FUNCS[word];
            if (fn && peek().t === '(') {
                next();
                const arg = parseExpr();
                next(); // ')'
                const F = fn;
                return (v) => F(arg(v));
            }
            // 未知词（非 pi/e、非白名单函数）按 0 容错处理，绝不执行代码
            return () => 0;
        }
        // eof / 未识别的单字符：视作 0，供上层容错
        return () => 0;
    };
    return parseExpr();
}

/**
 * 求值数学表达式。
 * @param {string} expr
 * @param {Object} vars - 变量字典（如 \x、\y 等）
 * @returns {number}
 */
export function evalExpr(expr, vars) {
    const s = String(expr).trim();
    if (s === '') return 0;
    try {
        const fn = compileTokens(tokenize(s));
        const v = fn(vars || {});
        return typeof v === 'number' && isFinite(v) ? v : 0;
    } catch (e) {
        return 0;
    }
}

/**
 * 编译数学表达式为可重复调用的求值函数（避免 plot 热循环中每样本都重解析）。
 * 仅解析一次为求值闭包，运行时只做变量替换 + 取值。
 * @param {string} expr
 * @returns {function(Object):number} 输入 vars 输出数值
 */
export function compileEval(expr) {
    let fn;
    try {
        fn = compileTokens(tokenize(String(expr || '').trim()));
    } catch (e) {
        fn = function () {
            return 0;
        };
    }
    return function (vars) {
        try {
            const v = fn(vars || {});
            return typeof v === 'number' && isFinite(v) ? v : 0;
        } catch (e) {
            return 0;
        }
    };
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
 * 支持 (x,y) / (name) / (name.anchor) / (angle:radius) / ({expr},{expr}) / (a:b:r)
 * / ($(ref)+...$ 坐标运算)。
 * @param {string} inner - 括号内文本
 * @param {Object} ctx - 含 vars、named、boxes 的上下文
 * @returns {Array<number>}
 */
export function parsePoint(inner, ctx) {
    const t = String(inner).trim();
    // $...$ 坐标运算：$(a)+(b)+...$ 或 $(a)-...$，支持参考锚点 ref.anchor
    if (t.charAt(0) === '$' && t.charAt(t.length - 1) === '$') {
        return parseCalc(t.slice(1, -1), ctx);
    }
    // 命名坐标引用（含锚点 X.north east）
    const anchorPt = resolveAnchorRef(t, ctx);
    if (anchorPt) return anchorPt;
    // 极坐标 (angle:radius)；(a:b:r) 取为 (a:r)
    const polar = /^(?:\{?)(-?[\d.]+)\s*:\s*((?:\{[^}]*\}|-?[\d.]+))$/.exec(t);
    if (polar) {
        const ang = (evalExpr(polar[1], ctx.vars) * Math.PI) / 180;
        const r = evalExpr(polar[2], ctx.vars);
        return transformTikzPoint(ctx, r * Math.cos(ang), r * Math.sin(ang));
    }
    // (x,y) 笛卡尔，支持 {expr} 占位
    const parts = t.split(',');
    if (parts.length >= 2) {
        const x = evalCoord(parts[0], ctx.vars);
        const y = evalCoord(parts[1], ctx.vars);
        return transformTikzPoint(ctx, x, y);
    }
    // 无法识别时按原点容错；原点同样要经过当前 scope 变换
    return transformTikzPoint(ctx, 0, 0);
}

/**
 * 解析命名坐标引用（含锚点）为 [x,y]。
 * 仅当 t 是纯引用名或 "name.anchor" 才命中（避免误判笛卡尔坐标）。
 * @param {string} t
 * @param {Object} ctx
 * @returns {Array<number>|null}
 */
function resolveAnchorRef(t, ctx) {
    if (!ctx || (!ctx.boxes && !ctx.named)) return null;
    // 支持多词锚点：south west / north east
    const m = /^([a-zA-Z_][\w-]*)(?:\s*\.\s*([a-zA-Z]+(?:\s+[a-zA-Z]+)*))?$/.exec(t);
    if (!m) return null;
    const name = m[1];
    if (ctx.boxes && ctx.boxes[name]) {
        const box = ctx.boxes[name];
        if (!m[2] || m[2].toLowerCase() === 'center') return [box.x, box.y];
        // 从 context 复用的锚点解析
        const pt = anchorOfBox(box, m[2]);
        if (pt) return pt;
    }
    if (ctx.named && ctx.named[name]) {
        return [ctx.named[name][0], ctx.named[name][1]];
    }
    return null;
}

/**
 * 计算盒模型上某个方位锚点的绝对坐标。
 * @param {{x:number,y:number,hw:number,hh:number}} box
 * @param {string} anchor - 如 north / south west / center
 * @returns {Array<number>|null}
 */
function anchorOfBox(box, anchor) {
    let ax = box.x,
        ay = box.y;
    const a = anchor.toLowerCase();
    if (a.indexOf('north') !== -1) ay += box.hh;
    if (a.indexOf('south') !== -1) ay -= box.hh;
    if (a.indexOf('east') !== -1) ax += box.hw;
    if (a.indexOf('west') !== -1) ax -= box.hw;
    return [ax, ay];
}

/**
 * 计算 TikZ 坐标运算 $...(a)+(b)-...$，返回 [x,y]。
 * 运算项为 (ref) 或 (x,y)，符号驱动矢量加减。
 * @param {string} calc - $ 内部的表达式
 * @param {Object} ctx
 * @returns {Array<number>}
 */
function parseCalc(calc, ctx) {
    const acc = [0, 0];
    let sign = 1;
    let i = 0;
    const s = calc.trim();
    while (i < s.length) {
        const ch = s[i];
        if (ch === '+' || ch === '-') {
            sign = ch === '+' ? 1 : -1;
            i++;
            continue;
        }
        if (ch === '(') {
            const end = findCloseParen(s, i);
            const inner = s.slice(i + 1, end);
            const pt = parseCoordinateOperand(inner, ctx);
            acc[0] += sign * pt[0];
            acc[1] += sign * pt[1];
            sign = 1;
            i = end + 1;
            continue;
        }
        i++;
    }
    return acc;
}

/**
 * 解析坐标运算的操作数项，(ref.anchor) 或 (x,y)。
 * @param {string} inner
 * @param {Object} ctx
 * @returns {Array<number>}
 */
function parseCoordinateOperand(inner, ctx) {
    const anchorPt = resolveAnchorRef(inner.trim(), ctx);
    if (anchorPt) return anchorPt;
    return parsePoint(inner, ctx);
}

/**
 * 找到从 open 起配套的右括号下标。
 * @param {string} s
 * @param {number} open
 * @returns {number}
 */
function findCloseParen(s, open) {
    let d = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') {
            d--;
            if (d === 0) return i;
        }
    }
    return open;
}
