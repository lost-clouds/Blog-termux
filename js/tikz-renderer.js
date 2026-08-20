/**
 * @module tikz-renderer
 * @description TikZ → SVG 渲染引擎：解析 TikZ/PGF 常用子集并输出 SVG 图片。
 *              纯客户端、零外部依赖（数学标签按需调用已加载的 KaTeX），
 *              延续项目"零 CDN 运行时 / 完全离线"原则。
 * @requires none
 *
 * 使用：import { prepareTikzBlocks, renderTikz } from './tikz-renderer.js'
 *
 * 支持的子集（覆盖 Blog-termux Math 系列的常用绘图）：
 *   - \begin{document} / \begin{tikzpicture} / \end{...} 包裹（自动剥离）
 *   - \node[(opts)] (name) at (x,y) {...};
 *   - \draw / \fill / \filldraw[(opts)] 路径：
 *       -- 直线、-- cycle、-> / <- 箭头、arc (a:b:r)、.. controls (c) [and (c)] ..、
 *       circle (r)、rectangle (b)、grid (c,r)、plot (\x,{f(\x)})（domain=a:b）
 *   - \coordinate (name) at (x,y);
 *   - \foreach \x in {list} { ... }（展开循环体）
 *   - \pgfmathsetmacro{\name}{expr}（支持 + - * / 幂、cos/sin/abs/sqrt）
 *   - 极坐标 (a:r)；节点锚点 above/below/left/right；颜色混合 red!40!blue
 *   - 节点文本中的 $...$ 数学：自动调用 KaTeX 渲染（未加载时降级为纯文本）
 *
 * 不支持的语法整体降级：保留源码并显示错误提示（与 Mermaid 一致）。
 */
'use strict';

// 视图坐标 → SVG 坐标的换算系数（一个 tikz 单位对应的像素）
const PX_PER_UNIT = 32;

// TikZ 颜色名 → hex（基础调色板）
const COLOR_MAP = {
    black: '#000000', white: '#ffffff', gray: '#9e9e9e', grey: '#9e9e9e',
    red: '#e53935', green: '#43a047', blue: '#1e88e5', orange: '#fb8c00',
    purple: '#8e24aa', brown: '#6d4c41', yellow: '#fdd835', cyan: '#00acc1',
    teal: '#00897b', pink: '#ec407a', violet: '#5e35b1', olive: '#7cb342',
    lime: '#c0ca33', magenta: '#d81b60', darkgray: '#616161', lightgray: '#bdbdbd',
};

// 颜色解析失败时的默认描边色（SVG 变量，自动适配深浅主题）
const DEFAULT_STROKE = 'var(--text-primary, #1a1a2e)';
// 默认节点填充色（浅灰，适配深浅主题）
const DEFAULT_NODE_FILL = 'rgba(120,120,120,0.08)';

// 常用但我方无法表达时长的忽略命令（安全跳过）
const IGNORE_COMMANDS = { usetikzlibrary: true, pgfkeys: true, tikzset: true, scope: true };

// 节点文本中的数学片段分隔（$...$ 或 \(...\)）
const MATH_SPLIT = /\$[^$]+\$/g;

// TikZ 字号 → px（用于 ont=small 等选项）
const FONT_SIZES = {
    'tiny': 10, 'scriptsize': 11, 'footnotesize': 12, 'small': 13,
    'normalsize': 14, 'large': 17, 'Large': 20, 'LARGE': 24, 'huge': 28, 'Huge': 32
};

// 颜色混合前缀解析：red!40!blue → 40% 从 ref 线性混合
/* ------------------------------------------------------------
   将 marked 生成的 <pre><code class="language-tikz"> 转换为
   <div class="tikz">（源码存于 data-tikz），供 renderTikz 消费。
   必须在 sanitizeHtml 之后调用——sanitizer 的 class 白名单
   /^language-/ 会放行 language-tikz，pre/code 均在白名单内。
   返回 boolean：true 表示检测到了 tikz 代码块。
------------------------------------------------------------ */
/**
 * 准备容器内的 TikZ 代码块（替换为渲染占位 div）。
 * @param {HTMLElement} container
 * @returns {boolean}
 */
function prepareTikzBlocks(container) {
    if (!container) return false;

    const blocks = container.querySelectorAll('pre code[class*="language-tikz"]');
    if (!blocks.length) return false;

    blocks.forEach(function (code) {
        const source = code.textContent;
        const pre = code.closest('pre');
        if (!pre) return;

        const div = document.createElement('div');
        div.className = 'tikz';
        div.setAttribute('data-tikz', source);
        pre.replaceWith(div);
    });

    return true;
}


/* ------------------------------------------------------------
   渲染容器内所有 .tikz 元素（异步）：解析 → 生成 SVG → 替换占位。
   单个元素解析失败只影响该元素（降级显示源码），不中断整体。
------------------------------------------------------------ */
/**
 * 渲染容器内的 TikZ 图片。
 * @param {HTMLElement} container
 * @returns {Promise<void>}
 */
async function renderTikz(container) {
    if (!container) return;

    const nodes = container.querySelectorAll('.tikz');
    if (!nodes.length) return;

    for (const el of nodes) {
        const source = el.getAttribute('data-tikz') || '';
        try {
            el.innerHTML = await _buildPicture(source);
        } catch (err) {
            // 降级：显示源码 + 错误提示，保留可用性（与 mermaid 一致）
            el.classList.add('tikz-error');
            el.innerHTML =
                '<pre><code>' + _escapeHtml(source) + '</code></pre>' +
                '<div class="tikz-error-msg">TikZ 渲染失败: ' + _escapeHtml(err.message) + '</div>';
        }
    }
}

/* ------------------------------------------------------------
   解析 TikZ 源码并返回 SVG（异步：可能等待 KaTeX 渲染节点数学）。
------------------------------------------------------------ */
/**
 * 解析单段 TikZ 源码并生成 SVG。
 * @param {string} source
 * @returns {Promise<string>}
 */
async function _buildPicture(source) {
    // 预处理（剥离 begin/end 包裹、剔除 % 注释、删 usetikzlibrary）
    const normalized = _preprocess(source);
    // 展开 foreach、执行 pgfmathsetmacro，得到扁平命令序列
    const script = _expandScript(normalized);

    const ctx = _createContext(script.vars);
    let body = '';
    let hasMath = false;

    for (const stmt of script.statements) {
        const frag = _renderStatement(stmt, ctx);
        body += frag.html;
        if (frag.math) hasMath = true;
    }

    // 根据包围盒计算 viewBox，留 12px 内边距避免裁剪描边/文字
    const pad = 12;
    const minX = ctx.bounds.minX - pad;
    const minY = ctx.bounds.minY - pad;
    const pixW = ctx.bounds.maxX - ctx.bounds.minX + pad * 2;
    const pixH = ctx.bounds.maxY - ctx.bounds.minY + pad * 2;
    if (ctx.bounds.minX === Infinity) {
        // 空块 / 纯模板：无可绘制内容，返回空（不报错）
        return '';
    }
    if (!isFinite(minX) || !isFinite(minY) || pixW <= 0 || pixH <= 0) {
        throw new Error('图片范围无效（缺少有效坐标）');
    }

    let svgBody = body;
    // 含数学的节点文本：等待 KaTeX 并填充 <foreignObject>
    if (hasMath) {
        await _ensureKatex();
        svgBody = _fillMathInSvg(body);
    }

    return (
        '<svg class="tikz-svg" xmlns="http://www.w3.org/2000/svg" ' +
        'viewBox="' + minX + ' ' + minY + ' ' + pixW + ' ' + pixH + '" ' +
        'role="img" aria-label="TikZ 渲染结果">' +
        svgBody +
        '</svg>'
    );
}

/* ------------------------------------------------------------
   预处理：剥离 begin/end 包裹、整行忽略命令（usetikzlibrary 等），
   剔除 % 注释（仅行内 % 到行尾，花括号内不受影响）。
------------------------------------------------------------ */
/**
 * 对源码做预处理。
 * @param {string} source
 * @returns {string}
 */
function _preprocess(source) {
    let s = _stripComments(source);
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
 * 剔除 % 注释（保留花括号内与转义 \%）。
 * @param {string} s
 * @returns {string}
 */
function _stripComments(s) {
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

/* ------------------------------------------------------------
   foreach / pgfmathsetmacro 展开。
   输入为已除注释与包裹标记的源码，输出 { vars, statements }。
------------------------------------------------------------ */
/**
 * 展开 \foreach 与执行 \pgfmathsetmacro，得到扁平命令序列。
 * @param {string} src
 * @returns {{vars:Object, statements:Array}}
 */
function _expandScript(src) {
    const ctx = { vars: {}, out: [] };
    const statements = _splitStatements(src);
    for (const stmt of statements) {
        _expandStatement(stmt, ctx);
    }
    return { vars: ctx.vars, statements: ctx.out };
}

/**
 * 展开单条语句（foreach 块 / pgfmathsetmacro / 普通命令）。
 * @param {string} stmt
 * @param {Object} ctx
 */
function _expandStatement(stmt, ctx) {
    const trimmed = stmt.trim();
    const fm = /^\\(foreach|pgfmathsetmacro)\b([\s\S]*)$/.exec(trimmed);
    if (!fm) { ctx.out.push(_parseCommand(trimmed)); return; }
    const cmd = fm[1];
    const after = fm[2];

    if (cmd === 'foreach') { _expandForeach(after, ctx); return; }
    // pgfmathsetmacro{\name}{expr}
    const mm = after.match(/^\s*\{\\([a-zA-Z]+)\}\s*\{([\s\S]*)\}\s*$/);
    if (mm) { ctx.vars[mm[1]] = _evalExpr(mm[2], ctx.vars); }
}

/**
 * 展开 foreach：\x in {list} { body ; ... }。
 * @param {string} after
 * @param {Object} ctx
 */
function _expandForeach(after, ctx) {
    const headM = after.match(/^\s*\\?([a-zA-Z]+)\s+in\s*\{([^}]*)\}\s*\{([\s\S]*)\}\s*$/);
    if (!headM) return;
    const varName = headM[1];
    const listStr = headM[2];
    const body = headM[3];
    const values = _parseForeachList(listStr);
    for (const val of values) {
        ctx.vars[varName] = val;
        const inner = _splitStatements(body);
        for (const s of inner) _expandStatement(s, ctx);
    }
    delete ctx.vars[varName];
}

/**
 * 解析 foreach 值列表：{a,b,c} 或 {a,...,z}（步长自适应）。
 * @param {string} listStr
 * @returns {Array<number>}
 */
function _parseForeachList(listStr) {
    const trimmed = listStr.trim();
    // 椭圆展开：a,b,...,z（b 提供步长）或 a,...,z（步长 1）
    const hasDots = /,\s*\.\s*\.\s*\.\s*$/.test(trimmed);
    if (hasDots) {
        const parts = trimmed.split(',');
        const named = {};
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

/**
 * 将文本按顶层分号切分为语句数组（花括号内不切割）。
 * @param {string} text
 * @returns {Array<string>}
 */
function _splitStatements(text) {
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
function _parseCommand(s) {
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

/* ------------------------------------------------------------
   渲染上下文：命名坐标表、循环变量、包围盒。
------------------------------------------------------------ */
/**
 * 创建渲染上下文。
 * @param {Object} vars - foreach/macro 变量
 * @returns {Object}
 */
function _createContext(vars) {
    return {
        named: {},      // name -> [x,y]
        vars: vars || {}, // 循环变量与宏
        last: [0,0],
        bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    };
}

/**
 * 更新上下包围盒。
 * @param {Object} ctx
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 */
function _expandBounds(ctx, x1, y1, x2, y2) {
    if (x2 === undefined) x2 = x1;
    if (y2 === undefined) y2 = y1;
    if (x1 < ctx.bounds.minX) ctx.bounds.minX = x1;
    if (y1 < ctx.bounds.minY) ctx.bounds.minY = y1;
    if (x2 > ctx.bounds.maxX) ctx.bounds.maxX = x2;
    if (y2 > ctx.bounds.maxY) ctx.bounds.maxY = y2;
}

/* ------------------------------------------------------------
   表达式求值（pgfmathsetmacro / plot / 坐标 {expr}）：
   支持 + - * / ^、括号、cos/sin/tan/abs/sqrt/exp/ln，以及变量替换。
------------------------------------------------------------ */
/**
 * 求值数学表达式。
 * @param {string} expr
 * @param {Object} vars
 * @returns {number}
 */
function _evalExpr(expr, vars) {
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
        // FA = new Function，限于数值运算，捕获执行错误
        const fn = new Function('return (' + body.replace(/\^/g, '**') + ');');
        const v = fn();
        return typeof v === 'number' && isFinite(v) ? v : 0;
    } catch (e) {
        return 0;
    }
}

/* ------------------------------------------------------------
   坐标解析：\(x,y) / (name) / (angle:radius) / ({expr},{expr}) / (a:b:r)。
   返回视图坐标 [x,y]（tikz 单位），并登记命名坐标。
------------------------------------------------------------ */
/**
 * 解析坐标文本为 [x,y]。
 * @param {string} inner - 括号内文本
 * @param {Object} ctx
 * @returns {Array<number>}
 */
function _parsePoint(inner, ctx) {
    const t = inner.trim();
    // 命名坐标引用
    if (ctx.named && ctx.named[t]) return [ctx.named[t][0], ctx.named[t][1]];
    // (a:b:r) 圆上三点（弧辅助）——取为 (a:r) 极坐标
    // 极坐标 (angle:radius)
    const polar = /^(?:\{?)(-?[\d.]+)\s*:\s*((?:\{[^}]*\}|-?[\d.]+))$/.exec(t);
    if (polar) {
        const ang = _evalExpr(polar[1], ctx.vars) * Math.PI / 180;
        const r = _evalExpr(polar[2], ctx.vars);
        return [r * Math.cos(ang), r * Math.sin(ang)];
    }
    // (x,y) 笛卡尔，支持 {expr} 占位
    const parts = t.split(',');
    if (parts.length >= 2) {
        const x = _evalCoord(parts[0], ctx);
        const y = _evalCoord(parts[1], ctx);
        return [x, y];
    }
    return [0, 0];
}

/**
 * 求值单个坐标分量（可为 {expr}、常量或 \\var）。
 * @param {string} part
 * @param {Object} ctx
 * @returns {number}
 */
function _evalCoord(part, ctx) {
    const t = part.trim();
    if (t.startsWith('{') && t.endsWith('}')) return _evalExpr(t.slice(1, -1), ctx.vars);
    return _evalExpr(t, ctx.vars);
}

/* ------------------------------------------------------------
   选项解析：[draw, fill=red!40, circle, dashed, ->, thick, font=\\small, above, scale=1.2]
------------------------------------------------------------ */
/**
 * 解析方括号选项字符串。
 * @param {string} opts
 * @returns {Object}
 */
/**
 * 是否为可用的颜色记号（命名色或 TikZ 混合）。
 * @param {string} name
 * @returns {boolean}
 */
function _isColorToken(name) {
    if (!name || name.includes('=')) return false;
    const base = name.split('!')[0].toLowerCase();
    if (COLOR_MAP[base] || /^#[0-9a-f]{3,8}$/i.test(base)) return true;
    if (name.includes('!')) return true;
    return false;
}

function _parseOptions(opts) {
    const r = {
        draw: null, fill: null, text: null, thick: false, veryThick: false,
        ultraThick: false, dashed: false, dotted: false, arrow: false, arrowBack: false,
        circle: false, rectangle: false, rounded: false, scale: 1,
        anchor: 'center', fontSize: 14, fontBold: false,
        bareColor: null
    };
    if (!opts) return r;
    const parts = _splitOpts(opts);
    for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        if (p === 'thick') { r.thick = true; continue; }
        if (p === 'very thick') { r.veryThick = true; continue; }
        if (p === 'ultra thick') { r.ultraThick = true; continue; }
        if (p === 'dashed') { r.dashed = true; continue; }
        if (p === 'dotted') { r.dotted = true; continue; }
        if (p === 'circle') { r.circle = true; continue; }
        if (p === 'rectangle') { r.rectangle = true; continue; }
        if (p === 'sharp corners') { continue; }
        if (p === '->' || p === '->>' || p === 'latex' || p === '-latex' || p === '->latex') { r.arrow = true; continue; }
        if (p === '<-' || p === '<<-' || p === '<->' || p === '<->>') { r.arrowBack = true; continue; }
        if (p === 'above') { r.anchor = 'below'; continue; }
        if (p === 'below') { r.anchor = 'above'; continue; }
        if (p === 'left') { r.anchor = 'right'; continue; }
        if (p === 'right') { r.anchor = 'left'; continue; }
        if (p === 'midway') { continue; }

        // 裸颜色（默认 fill / draw / text 色）
        if (_isColorToken(p)) { r.bareColor = p; continue; }

        // 键值对
        const kv = p.match(/^([\w-]+)\s*=\s*(.+)$/);
        if (kv) {
            const key = kv[1].toLowerCase();
            let val = kv[2].trim();
            if (key === 'draw') { r.draw = val || 'var(--text-primary, #1a1a2e)'; }
            else if (key === 'fill') { r.fill = val; }
            else if (key === 'text' || key === 'font') {
                // font=\\small 或 text=color
                if (key === 'text') r.text = val.replace(/[{}]/g,'');
                else {
                    const fm = /\\?([a-zA-Z]+)/.exec(val);
                    if (fm && FONT_SIZES[fm[1]]) r.fontSize = FONT_SIZES[fm[1]];
                    if (/bfseries|textbf/.test(val)) r.fontBold = true;
                }
            }
            else if (key === 'scale') { r.scale = parseFloat(val) || 1; }
            else if (key === 'rounded corners') { r.rounded = true; }
            else if (key === 'line width') { const lw=parseFloat(val); if(lw) r.thick = lw>1.5; }
            continue;
        }
    }
    return r;
}

/**
 * 切分选项（忽略括号内的逗号）。
 * @param {string} opts
 * @returns {Array<string>}
 */
function _splitOpts(opts) {
    const out = []; let cur = ''; let d = 0;
    for (const ch of opts) {
        if (ch === '{') d++;
        else if (ch === '}') d--;
        if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
}

/* ------------------------------------------------------------
   颜色解析：支持命名色、hex、rgb()，以及 TikZ 混合语法 red!40!blue。
------------------------------------------------------------ */
/**
 * 解析 TikZ 颜色（含 !混合）为 CSS 值。
 * @param {string} color
 * @param {string} fallback
 * @returns {string}
 */
function _resolveColor(color, fallback) {
    if (!color) return fallback;
    const c = String(color).trim();
    if (c === 'none') return 'none';
    if (/^(#|rgb|rgba|var\(|hsla)/.test(c)) return c;
    // 混合链：red!40!blue 表示 40% 从 red 到 blue 混合
    const parts = c.split('!').map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length >= 3) {
        const base = parts[0];
        const pct = parseFloat(parts[1]);
        const target = parts[2];
        const from = _hex(base) || '#ffffff';
        const to = _hex(target) || _hex(base) || '#ffffff';
        return _blend(from, to, isNaN(pct) ? 50 : pct);
    }
    if (parts.length === 2 && /^[\d.]+$/.test(parts[1])) {
        const from = _hex(parts[0]) || '#ffffff';
        return _blend(from, '#ffffff', parseFloat(parts[1]));
    }
    return _hex(c) || fallback;
}

/**
 * 命名色 → hex。
 * @param {string} name
 * @returns {string|null}
 */
function _hex(name) {
    if (!name) return null;
    const k = name.toLowerCase();
    if (COLOR_MAP[k]) return COLOR_MAP[k];
    if (/^#[0-9a-f]{3,8}$/i.test(k)) return k;
    return null;
}

/**
 * 线性混合两个 hex 颜色。
 * @param {string} a
 * @param {string} b
 * @param {number} pct - 0..100，混合到 b 的比例
 * @returns {string}
 */
function _blend(a, b, pct) {
    const t = Math.max(0, Math.min(100, pct)) / 100;
    const pa = _rgb(a), pb = _rgb(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

/**
 * hex → [r,g,b]。
 * @param {string} hex
 * @returns {Array<number>}
 */
function _rgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    h = h.slice(0, 6).padEnd(6, '0');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

/**
 * 解析线宽。
 * @param {Object} o
 * @returns {number}
 */
function _lineWidth(o) {
    if (o.ultraThick) return 3.2;
    if (o.veryThick) return 2.6;
    if (o.thick) return 2.0;
    return 1.2;
}

/**
 * 解析虚线。
 * @param {Object} o
 * @returns {string}
 */
function _dash(o) {
    if (o.dashed) return '7,5';
    if (o.dotted) return '2,3';
    return '';
}

/* ------------------------------------------------------------
   命令分发：node / draw / fill / filldraw / path / coordinate。
   返回 { html, math }。
------------------------------------------------------------ */
/**
 * 渲染单条命令，返回片段。
 * @param {Object} stmt - {command, opts, rest}
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
function _renderStatement(stmt, ctx) {
    const { command, opts, rest } = stmt;
    if (!command) return { html: '', math: false };
    if (IGNORE_COMMANDS[command]) return { html: '', math: false };
    switch (command) {
        case 'node': return _renderNode(rest, opts, ctx);
        case 'coordinate':
        case 'path':
        case 'draw': _registerCoords(rest, ctx); return _renderDraw(rest, opts, ctx, false);
        case 'fill': return _renderDraw(rest, opts, ctx, true, true);
        case 'filldraw': {
            // filldraw：既描边又填充。填充色优先用 fill 的，描边用 draw 的
            const o = _parseOptions(opts);
            const fillColor = o.fill || DEFAULT_STROKE;
            return _renderDraw(rest, opts, ctx, true, true, fillColor);
        }
        default:
            // 未知命令安全忽略（不抛错，避免整图降级）；除非是明显的绘图命令
            return { html: '', math: false };
    }
}

/**
 * 先登记路径中出现的命名坐标（\coordinate 已单独处理，这里兜底）。
 * @param {string} rest
 * @param {Object} ctx
 */
function _registerCoords(rest, ctx) {
    if (!rest) return;
    // \coordinate (name) at (x,y) 形式
    const m = /^\s*\coordinate\s+\(([^)]+)\)\s+at\s+\(([^)]*)\)/.exec(rest);
    if (m) {
        const pt = _parsePoint(m[2], ctx);
        ctx.named[m[1].trim()] = pt;
    }
}

/* ------------------------------------------------------------
   节点渲染：\node[(opts)] (name) at (x,y) {text} 或 \node (name) at (x,y) {text}。
   支持锚点偏移、字体、填充/描边、数学文本。
------------------------------------------------------------ */
/**
 * 渲染节点。
 * @param {string} rest
 * @param {string} opts
 * @param {Object} ctx
 * @returns {{html:string, math:boolean}}
 */
function _renderNode(rest, opts, ctx) {
    // 解析 (name) at (x,y) {text} 或 at (x,y) {text}
    let name = '';
    let atStr = '';
    let text = '';
    let tail = rest.trim();
    // 提取 {text}（可能含嵌套花括号，用配对匹配）
    const braceIdx = tail.indexOf('{');
    if (braceIdx !== -1) {
        const close = _matchBrace(tail, braceIdx);
        text = tail.slice(braceIdx + 1, close);
        tail = tail.slice(0, braceIdx) + tail.slice(close + 1);
    }
    // (name)? at (x,y)
    const am = tail.match(/^\s*(?:\(([^)]*)\))?\s*(?:at\s+)?\(([^)]*)\)\s*$/);
    if (am) {
        if (am[1]) name = am[1].trim();
        atStr = am[2];
    } else {
        atStr = tail;
    }
    const pt = _parsePoint(atStr, ctx);
    if (name && ctx.named) ctx.named[name] = [pt[0], pt[1]];

    const o = _parseOptions(opts);
    const hasMath = MATH_SPLIT.test(text);
    MATH_SPLIT.lastIndex = 0;
    const html = _nodeSvg(pt, o, text, hasMath, ctx);
    return { html: html, math: hasMath };
}

/**
 * 找出从 idx 开始（指向 {）的配对右花括号下标。
 * @param {string} s
 * @param {number} idx
 * @returns {number}
 */
function _matchBrace(s, idx) {
    let d = 0;
    for (let i = idx; i < s.length; i++) {
        if (s[i] === '{') d++;
        else if (s[i] === '}') { d--; if (d === 0) return i; }
    }
    return idx;
}

/* ------------------------------------------------------------
   构建节点 SVG：形状（矩形/圆形）+ 文本，支持锚点偏移与数学。
   数学文本以 <foreignObject> 占位，稍后由 _fillMathInSvg 填充 KaTeX。
------------------------------------------------------------ */
/**
 * 构建节点 SVG。
 * @param {Array<number>} pt
 * @param {Object} o - 解析后的选项
 * @param {string} text
 * @param {boolean} hasMath
 * @param {Object} ctx
 * @returns {string}
 */
function _nodeSvg(pt, o, text, hasMath, ctx) {
    const px = pt[0] * o.scale * PX_PER_UNIT;
    const py = pt[1] * o.scale * PX_PER_UNIT;
    const off = _anchorOffset(o.anchor, 8);
    const cx = px + off[0];
    const cy = py + off[1];
    _expandBounds(ctx, cx, cy);

    const stroke = _resolveColor(o.draw, DEFAULT_STROKE);
    const textColor = _resolveColor(o.text || o.bareColor, DEFAULT_STROKE);
    const fs = o.fontSize;
    const fontWeight = o.fontBold ? 'bold' : 'normal';

    // 形状：圆形 或 矩形（默认）
    // 仅当显式给出 draw / fill / 圆形 / 矩形 时才绘制形状；纯文本标签不画框
    let shape = '';
    const wantBox = o.draw || o.fill || o.circle || o.rectangle;
    if (o.circle && wantBox) {
        const r = Math.max(10, fs * 0.7 + text.length * 1.5);
        _expandBounds(ctx, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2);
        shape = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + _resolveColor(o.fill, 'none') + '" stroke="' + stroke + '" stroke-width="1.4" />';
    } else if (wantBox) {
        const tw = _textWidth(text, fs, hasMath) + 16;
        const th = fs + 10;
        const rx = o.rounded ? 5 : (o.rectangle ? 1 : 3);
        const fill = _resolveColor(o.fill, DEFAULT_NODE_FILL);
        _expandBounds(ctx, cx - tw / 2 - 1, cy - th / 2 - 1, cx + tw / 2 + 1, cy + th / 2 + 1);
        shape = '<rect x="' + (cx - tw / 2) + '" y="' + (cy - th / 2) + '" width="' + tw + '" height="' + th + '" rx="' + rx + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2" />';
    }

    const label = _labelSvg(cx, cy, text, fs, textColor, fontWeight, hasMath);
    return shape + label;
}

/**
 * 节点锚点偏移（SVG 坐标）。
 * @param {string} anchor
 * @param {number} d
 * @returns {Array<number>}
 */
function _anchorOffset(anchor, d) {
    switch (anchor) {
        case 'above': return [0, -d];
        case 'below': return [0, d];
        case 'left': return [-d, 0];
        case 'right': return [d, 0];
        default: return [0, 0];
    }
}

/**
 * 估算文本宽度。
 * @param {string} text
 * @param {number} fs
 * @param {boolean} hasMath
 * @returns {number}
 */
function _textWidth(text, fs, hasMath) {
    if (hasMath) return Math.max(fs * 3, fs * 0.7 * text.length + 10);
    const plain = text.replace(/\\\w+/g, 'x').replace(/\s+/g, ' ');
    return fs * 0.62 * plain.length;
}

/**
 * 生成节点文本 SVG：普通文本用 <text>，含数学则用 <foreignObject> 占位。
 * @param {number} cx
 * @param {number} cy
 * @param {string} text
 * @param {number} fs
 * @param {string} color
 * @param {string} fontWeight
 * @param {boolean} hasMath
 * @returns {string}
 */
function _labelSvg(cx, cy, text, fs, color, fontWeight, hasMath) {
    if (!text) return '';
    if (hasMath) {
        // 用 foreignObject 承载 HTML（KaTeX 数学 + 纯文本），稍后填充
        const w = Math.max(fs * text.length, fs * 4);
        const h = fs + 8;
        return ('<foreignObject x="' + (cx - w / 2) + '" y="' + (cy - h / 2) + '" width="' + w + '" height="' + h + '"><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-math" data-math="' + _escapeHtml(text) + '" style="text-align:center;line-height:' + h + 'px;font-size:' + fs + 'px;color:' + color + ';font-weight:' + fontWeight + '"></div></foreignObject>');
    }
    return ('<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="' + fs + '" font-family="sans-serif" font-weight="' + fontWeight + '" fill="' + color + '">' + _escapeHtml(_plainText(text)) + '</text>');
}

/**
 * 将节点文本中的 LaTeX 命令转为可读纯文本（非数学时）。
 * @param {string} text
 * @returns {string}
 */
function _plainText(text) {
    return text
        .replace(/\\vec\{?(\w+)\}?/g, '$1→')
        .replace(/\\text\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, '');
}

/* ------------------------------------------------------------
   路径渲染：\draw rest。处理 -- 直线、arc、.. controls ..、circle、rectangle、grid、plot。
------------------------------------------------------------ */
/**
 * 渲染一条路径/绘图命令。
 */
function _renderDraw(rest, opts, ctx, filled, isFill, fillOverride) {
    const o = _parseOptions(opts);
    if (/\bcircle\b/.test(rest)) return _circleShape(rest, o, ctx, isFill || filled, fillOverride || o.fill);
    if (/\brectangle\b/.test(rest)) return _rectangleShape(rest, o, ctx, isFill || filled);
    if (/\bgrid\b/.test(rest)) return _gridShape(rest, o, ctx);
    if (/\bplot\b/.test(rest)) return _plotShape(rest, o, ctx);

    const path = _tokenizePath(rest, o, ctx);
    if (!path || !path.d) return { html: '', math: false };
    const strokeCol = o.draw || (o.bareColor && !isFill ? o.bareColor : null);
    const fillCol = fillOverride || o.fill || (o.bareColor && isFill ? o.bareColor : null);
    const stroke = _resolveColor(strokeCol, DEFAULT_STROKE);
    const fill = _resolveColor(fillCol, isFill ? DEFAULT_STROKE : 'none');
    const sw = _lineWidth(o);
    const dash = _dash(o);
    let d = path.d + (path.closed ? 'Z' : '');
    let out = '<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />';
    if (o.arrow && path.e2) out += _arrowHead(path.e1, path.e2, stroke);
    if (o.arrowBack && path.s2) out += _arrowHead(path.s2, path.s1, stroke);
    return { html: out, math: false };
}

/* ------------------------------------------------------------
   路径 tokenizer：把 rest 解析为 SVG path d，并记录首末线段用于箭头。
   支持 -- 直线、arc、.. controls ..、cycle；circle/rectangle/grid/plot 走特型。
------------------------------------------------------------ */
/**
 * 解析路径为 SVG path d 数据。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @returns {Object|null} {d, closed, s1, s2, e1, e2}
 */
function _tokenizePath(rest, o, ctx) {
    const raw = rest.replace(/^\s*\\?[a-zA-Z]+\b/, '').trim();
    if (!raw) return null;
    let cur = null;
    let d = '';
    let closed = false;
    let firstSeg = null;
    let lastSeg = null;
    const scale = o.scale || 1;
    const XP = function (p) { return p[0] * scale * PX_PER_UNIT; };
    const YP = function (p) { return p[1] * scale * PX_PER_UNIT; };

    let i = 0;
    const n = raw.length;
    while (i < n) {
        const ch = raw[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '(') {
            const close = _findCloseParen(raw, i);
            const pt = _parsePoint(raw.slice(i + 1, close), ctx);
            _expandBounds(ctx, XP(pt), YP(pt));
            if (cur === null) {
                d += 'M' + XP(pt) + ' ' + YP(pt);
                cur = pt;
            } else {
                d += 'L' + XP(pt) + ' ' + YP(pt);
                const seg = [XP(cur), YP(cur), XP(pt), YP(pt)];
                if (!firstSeg) firstSeg = seg;
                lastSeg = seg;
                cur = pt;
            }
            i = close + 1;
            continue;
        }
        if (ch === '.' && raw[i + 1] === '.') {
            const cm = /^\.\.\s*controls\s*\(([^)]*)\)(?:\s*and\s*\(([^)]*)\))?\s*\.\.\s*\(([^)]*)\)/.exec(raw.slice(i));
            if (cm && cur) {
                const c1 = _parsePoint(cm[1], ctx);
                const c2c = cm[2] ? _parsePoint(cm[2], ctx) : null;
                const q = _parsePoint(cm[3], ctx);
                _expandBounds(ctx, XP(c1), YP(c1), XP(q), YP(q));
                d += c2c
                    ? 'C' + XP(c1) + ' ' + YP(c1) + ' ' + XP(c2c) + ' ' + YP(c2c) + ' ' + XP(q) + ' ' + YP(q)
                    : 'Q' + XP(c1) + ' ' + YP(c1) + ' ' + XP(q) + ' ' + YP(q);
                const seg = [XP(cur), YP(cur), XP(q), YP(q)];
                if (!firstSeg) firstSeg = seg;
                lastSeg = seg;
                cur = q;
                i += cm[0].length;
                continue;
            }
            i += 2; continue;
        }
        if (raw.slice(i, i + 5) === 'cycle') { closed = true; d += 'Z'; i += 5; continue; }
        if (ch === '-' || ch === '<' || ch === '>') { i++; while (i < n && /[-<->]/.test(raw[i])) i++; continue; }
        i++;
    }
    if (!d) return null;
    return { d: d, closed: closed, s1: firstSeg, s2: lastSeg, e1: firstSeg, e2: lastSeg };
}

/**
 * 找到匹配的右括号下标。
 * @param {string} s
 * @param {number} open
 * @returns {number}
 */
function _findCloseParen(s, open) {
    let d = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') { d--; if (d === 0) return i; }
    }
    return open;
}

/* ------------------------------------------------------------
   特型命令：circle / rectangle / grid / plot。
------------------------------------------------------------ */
/**
 * 圆形：\(cx,cy) circle (r)。
 */
function _circleShape(rest, o, ctx, filled, fillOpt) {
    const m = rest.match(/\(([^)]*)\)\s*circle\s*\(([^)]*)\)/i);
    if (!m) return { html: '', math: false };
    const c = _parsePoint(m[1], ctx);
    const rr = _evalExpr(m[2], ctx.vars) * (o.scale || 1);
    const cx = c[0] * o.scale * PX_PER_UNIT;
    const cy = c[1] * o.scale * PX_PER_UNIT;
    const cr = Math.max(rr * PX_PER_UNIT, 1);
    _expandBounds(ctx, cx - cr, cy - cr, cx + cr, cy + cr);
    const stroke = _resolveColor(o.draw || o.bareColor, DEFAULT_STROKE);
    const fc = _resolveColor(fillOpt || (filled && o.bareColor ? o.bareColor : null), filled ? DEFAULT_STROKE : 'none');
    const sw = _lineWidth(o);
    const dash = _dash(o);
    return { html: '<circle cx="' + cx + '" cy="' + cy + '" r="' + cr + '" fill="' + fc + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />', math: false };
}

/**
 * 矩形：\(a) rectangle (b)。
 */
function _rectangleShape(rest, o, ctx, filled) {
    const m = rest.match(/\(([^)]*)\)\s*rectangle\s*\(([^)]*)\)/i);
    if (!m) return { html: '', math: false };
    const a = _parsePoint(m[1], ctx);
    const b = _parsePoint(m[2], ctx);
    const x1 = a[0] * o.scale * PX_PER_UNIT, y1 = a[1] * o.scale * PX_PER_UNIT;
    const x2 = b[0] * o.scale * PX_PER_UNIT, y2 = b[1] * o.scale * PX_PER_UNIT;
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    _expandBounds(ctx, rx, ry, rx + w, ry + h);
    const rad = o.rounded ? 6 : 0;
    const stroke = _resolveColor(o.draw || o.bareColor, DEFAULT_STROKE);
    const fc = _resolveColor(o.fill || (filled && o.bareColor ? o.bareColor : null), filled ? DEFAULT_STROKE : 'none');
    const sw = _lineWidth(o);
    const dash = _dash(o);
    return { html: '<rect x="' + rx + '" y="' + ry + '" width="' + w + '" height="' + h + '" rx="' + rad + '" fill="' + fc + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' />', math: false };
}

/**
 * 网格：\(x,y) grid (c,r)。
 */
function _gridShape(rest, o, ctx) {
    const m = rest.match(/\(([^)]*)\)\s*grid\s*\(([^)]*)\)/i);
    if (!m) return { html: '', math: false };
    const g = _parsePoint(m[1], ctx);
    const dims = m[2].split(',');
    const cols = Math.max(0, Math.round(_evalExpr(dims[0], ctx.vars)));
    const rows = Math.max(0, Math.round(_evalExpr(dims[1], ctx.vars)));
    const gx = g[0] * o.scale * PX_PER_UNIT, gy = g[1] * o.scale * PX_PER_UNIT;
    const gw = cols * o.scale * PX_PER_UNIT, gh = rows * o.scale * PX_PER_UNIT;
    _expandBounds(ctx, gx, gy, gx + gw, gy + gh);
    const stroke = _resolveColor(o.draw, 'rgba(120,120,120,0.4)');
    let out = '';
    for (let c = 0; c <= cols; c++) {
        const x = gx + c * o.scale * PX_PER_UNIT;
        out += '<line x1="' + x + '" y1="' + gy + '" x2="' + x + '" y2="' + (gy + gh) + '" stroke="' + stroke + '" stroke-width="0.5" />';
    }
    for (let r2 = 0; r2 <= rows; r2++) {
        const y = gy + r2 * o.scale * PX_PER_UNIT;
        out += '<line x1="' + gx + '" y1="' + y + '" x2="' + (gx + gw) + '" y2="' + y + '" stroke="' + stroke + '" stroke-width="0.5" />';
    }
    return { html: out, math: false };
}

/**
 * 函数图：\draw[domain=a:b] plot (\x,{f(\x)})。
 * @param {string} rest
 * @param {Object} o
 * @param {Object} ctx
 * @returns {Object}
 */
function _plotShape(rest, o, ctx) {
    const dm = /domain\s*=\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)/.exec(rest);
    let a = -2, b = 2;
    if (dm) { a = parseFloat(dm[1]); b = parseFloat(dm[2]); }
    const pm = /plot\s*\(\\?([a-zA-Z])\s*,\s*\{([^}]*)\}\s*\)/.exec(rest);
    if (!pm) return { html: '', math: false };
    const varName = pm[1];
    const exprBody = pm[2];
    const N = 90;
    let pts = '';
    let first = true;
    const scale = o.scale || 1;
    for (let k = 0; k <= N; k++) {
        const xv = a + (b - a) * k / N;
        const vars = Object.assign({}, ctx.vars);
        vars[varName] = xv;
        const yv = _evalExpr(exprBody, vars);
        const X = xv * scale * PX_PER_UNIT;
        const Y = -yv * scale * PX_PER_UNIT;
        _expandBounds(ctx, X, Y);
        pts += (first ? '' : 'L') + X + ' ' + Y;
        first = false;
    }
    const stroke = _resolveColor(o.draw, DEFAULT_STROKE);
    const sw = _lineWidth(o);
    return { html: '<path d="M' + pts + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" />', math: false };
}

/**
 * 绘制实心箭头（线段端）。
 * @param {Array<number>} from - [x1,y1]
 * @param {Array<number>} to - [x2,y2]
 * @param {string} color
 * @returns {string}
 */
function _arrowHead(from, to, color) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return '';
    const ux = dx / len, uy = dy / len;
    const size = 9;
    const bx = to[0] - ux * size, by = to[1] - uy * size;
    const nx = -uy * (size * 0.38), ny = ux * (size * 0.38);
    return '<polygon points="' + to[0] + ',' + to[1] + ' ' + (bx + nx) + ',' + (by + ny) + ' ' + (bx - nx) + ',' + (by - ny) + '" fill="' + color + '" />';
}

/* ------------------------------------------------------------
   数学文本处理：<foreignObject> 内填充 KaTeX 渲染结果。
------------------------------------------------------------ */
/**
 * 从 candidate 加载 KaTeX（已在页面全局则直接用；否则尝试动态加载存档路径）。
 * @returns {Promise<boolean>}
 */
async function _ensureKatex() {
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
function _fillMathInSvg(svgBody) {
    const hasKatex = typeof window !== 'undefined' && window.katex;
    return svgBody.replace(/<foreignObject([^>]*)><div[^>]*class="tikz-math"[^>]*data-math="([^"]*)"[^>]*><\/div><\/foreignObject>/g, function (all, attrs, mathHtml) {
        const math = _unescapeHtml(mathHtml);
        let rendered = '';
        if (hasKatex) {
            try {
                rendered = window.katex.renderToString(math, { throwOnError: false, displayMode: false });
            } catch (e) {
                rendered = '';
            }
        }
        if (!rendered) rendered = '<span>' + _escapeHtml(_mathToPlain(math)) + '</span>';
        return '<foreignObject' + attrs + '><div xmlns="http://www.w3.org/1999/xhtml" class="tikz-math" style="text-align:center">' + rendered + '</div></foreignObject>';
    });
}

/**
 * 数学文本降级为可读纯文本（无 KaTeX 时）。
 * @param {string} s
 * @returns {string}
 */
function _mathToPlain(s) {
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

/**
 * 转义 HTML。
 * @param {string} s
 * @returns {string}
 */
function _escapeHtml(s) {
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
function _unescapeHtml(s) {
    return String(s)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

export { prepareTikzBlocks, renderTikz };
