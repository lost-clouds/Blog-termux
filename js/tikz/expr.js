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
    body = body.replace(/\bpi\b/g, String(Math.PI)).replace(/\be\b/g, String(Math.E));

    // TikZ 弧度标记：cos(2*\x r) 中独立的 " r"（radian 记号）对 JS 无意义，
    // 删掉避免 new Function 抛错（旧代码因此整块渲染失败）。
    body = body.replace(/\s+r\b/g, '');

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
 * 编译数学表达式为可重复调用的求值函数（避免 plot 热循环中每样本都 new Function）。
 * @param {string} expr
 * @returns {function(Object):number} 输入 vars 输出数值
 */
export function compileEval(expr) {
    const s = String(expr || '').trim();
    // 预编译一次替换（与 evalExpr 逻辑一致），运行时仅做变量替换 + 取值
    const head = s.replace(/\\[a-zA-Z]+/g, function (v) {
        const key = v.slice(1);
        return '(vars["' + key + '"]||0)';
    });
    const body = head
        .replace(/\bpi\b/g, String(Math.PI))
        .replace(/\be\b/g, String(Math.E))
        // 弧度标记 " r"：见 evalExpr 注释
        .replace(/\s+r\b/g, '')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/abs\(/g, 'Math.abs(')
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/exp\(/g, 'Math.exp(')
        .replace(/ln\(/g, 'Math.log(')
        .replace(/log\(/g, 'Math.log10(')
        .replace(/deg\(/g, '(');
    const fn = new Function('vars', 'return (' + body.replace(/\^/g, '**') + ');');
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
