/**
 * @module tikz-renderer.test.cases-audit
 * @description 上一轮修复与本轮审查新增回归（原 34–52 号用例）
 *              测试用例只声明异步函数，DOM 桩与失败计数由 runner 注入。
 */

'use strict';

import { readFileSync } from 'node:fs';

/**
 * 运行 上一轮修复与本轮审查新增回归（原 34–52 号用例）。
 * @param {{render:Function, check:Function}} tools
 * @returns {Promise<void>}
 */
export async function runAuditCases({ render, check }) {
// ============ 回归：本修复 commit 新增用例 ============

// 34. foreach 后紧跟其它语句：不得吞并后续节点（旧贪婪正则把 (box) 吸入 foreach body）
{
    const svg = await render(
        '\\node[draw,circle,blue] (a) at (0,0) {原点};' +
            '\\foreach \\x in {1,...,3} { \\node[circle,red] (p\\x) at (\\x,0) {\\x}; \\draw[->] (a) -- (p\\x); }' +
            '\\node[rectangle,draw,green] (box) at (3,3) {组合图};' +
            '\\draw[->,thick] (a) -- (box);'
    );
    // box 必须被渲染出来（旧实现整句丢失）
    check('foreach 后紧跟 node 不丢失（15.7 回归）', /组合图/.test(svg), svg.slice(0, 200));
    // 到 box 的连线必须是真实路径（而非退化 M0 0L0 0）
    const boxArrow = /<path d="M[0-9.-]+ [0-9.-]+L[0-9.-]+ [0-9.-]+"[^>]*stroke-width="2"/.exec(
        svg
    );
    check(
        '(a)--(box) 为非退化路径',
        boxArrow && !/M0 0L0 0/.test(boxArrow[0]),
        boxArrow ? boxArrow[0] : svg.slice(0, 300)
    );
}

// 35. 箭头/连线端点应为节点边框而非中心（避免箭头埋进文字）
{
    const svg = await render(
        '\\node (start) at (0,0) {开始};\\node (process) at (4,0) {处理};\\draw[->] (start) -- (process);'
    );
    const m = /<path d="M([\d.]+) 0L([\d.]+) 0"/.exec(svg);
    // 文本半宽 = (ceil(14*0.62*2.8)+8)/2 ≈ 16.5；终点 = 128 - 16.5 = 111.5
    check(
        '箭头停在节点边框（非中心 0→128）',
        m && Math.round(+m[1]) === 18 && Math.round(+m[2]) === 111,
        m ? m[1] + '->' + m[2] : svg.slice(0, 200)
    );
}

// 36. 空文本圆节点：应为小圆点（旧实现被 1em 下限撑成 r≈15.5）
{
    const svg = await render('\\node[circle,fill=blue] at (0,0) {};');
    const m = /<circle[^>]*r="([\d.]+)"/.exec(svg);
    check('空节点圆半径 < 8px', m && +m[1] < 8 && +m[1] > 2, m ? 'r=' + m[1] : svg.slice(0, 200));
}

// 37. 圆形节点盒半径 == 绘制半径：箭头到圆边（不是到矩形盒边）
{
    const svg = await render(
        '\\node[circle,draw] (a) at (0,0) {是};\\node (b) at (3,0) {B};\\draw[->] (a) -- (b);'
    );
    const m = /<path d="M([\d.]+) 0L([\d.]+) 0"/.exec(svg);
    // 圆半径 = max(5, max(21,22)/2+1)=12；起点=12；B 半宽 = (9+8)/2=8.5 → 终点=96-8.5=87.5
    check(
        '圆形节点箭头从圆边(12)出发',
        m && Math.round(+m[1]) === 12 && Math.round(+m[2]) === 88,
        m ? m[1] + '->' + m[2] : svg.slice(0, 200)
    );
}

// 38. 节点文本 \\ 换行：两行 tspan，且不得误判为数学（无 foreignObject）
{
    const svg = await render('\\node[draw] at (0,0) {时间域\\\\(Time Domain)};');
    const tspans = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    check(
        '\\\\ 渲染为两行 tspan',
        tspans.length === 2 &&
            tspans[0].indexOf('时间域') === 0 &&
            tspans[1].indexOf('(Time Domain)') === 0,
        JSON.stringify(tspans)
    );
    check('\\\\ 不误判为数学（无 foreignObject）', !/<foreignObject/.test(svg), svg.slice(0, 200));
    // 两行盒高 = (2×14+8)=36
    const rm = /<rect[^>]*height="([\d.]+)"/.exec(svg);
    check('两行盒高 36px', rm && Math.round(+rm[1]) === 36, rm ? rm[1] : svg.slice(0, 200));
}

// 39. 带距离锚点 below=0.4cm：标签应在线下方 0.4cm≈12.8px（旧实现忽略距离 → y=0 压线）
{
    const svg = await render('\\draw (0,0) -- (3,0) node[midway, below=0.4cm] {频率分解};');
    const m = /<text x="([\d.]+)" y="([\d.]+)"[^>]*>频率分解</.exec(svg);
    check(
        'below=0.4cm 标签在线下 ~12.8px',
        m && Math.round(+m[1]) === 48 && Math.round(+m[2]) === 13,
        m ? 'at ' + m[1] + ',' + m[2] : svg.slice(0, 200)
    );
}

// 40. 数学节点盒宽不再过估：15.9 两个节点矩形不得重叠（旧实现 328px 宽 → 121px 重叠）
{
    const svg = await render(
        '\\node[draw,text=red] at (0,2) {块级 $$a^2+b^2=c^2$$ 居中};\\node[draw,text=purple] at (6,2) {$E=mc^2$ 前后混排纯文本};'
    );
    const rs = [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)"/g)].map(
        (m) => ({ x: +m[1], w: +m[3] })
    );
    const overlap = rs.length === 2 && rs[0].x + rs[0].w > rs[1].x;
    check(
        '15.9 数学节点矩形不重叠',
        rs.length === 2 && !overlap,
        rs.map((r) => `${Math.round(r.x)},w=${Math.round(r.w)}`).join(' | ')
    );
}

// ============ 回归：本轮新增（完整覆盖交接单之外发现的隐藏问题） ============

// 41. cycle 只能输出一个 Z（旧实现 tokenizePath 和 renderDraw 各追加一次 → M...ZZ）
{
    const svg = await render('\\draw (0,0) -- (1,1) -- (2,0) -- cycle;');
    check(
        'cycle 路径只有一个 Z 闭合',
        /d="[^"]*Z"/.test(svg) && !/ZZ/.test(svg),
        svg.slice(0, 200)
    );
}

// 42. 通用颜色键 color=...：\draw 着色描边、\node 着色文本；very thin 线宽生效
{
    const line = await render('\\draw[very thin, color=red] (0,0) -- (2,0);');
    const node = await render('\\node[color=cyan] at (0,0) {A};');
    check(
        'color= 通用颜色 + very thin 线宽',
        line.includes('stroke="#e53935"') &&
            line.includes('stroke-width="0.5"') &&
            node.includes('fill="#00acc1"'),
        line.slice(0, 200) + ' || ' + node.slice(0, 200)
    );
}

// 43. \fill 只填充不描边；\filldraw[blue] 同时填充与描边（旧实现 fill 多边形带默认描边）
{
    const fill = await render('\\fill[red] (0,0) -- (2,2) -- (3,0) -- cycle;');
    const filldraw = await render('\\filldraw[blue] (0,0) -- (2,0) -- (1,1) -- cycle;');
    check(
        'fill 无描边 / filldraw 填充+描边同色',
        /<path[^>]*fill="#e53935"[^>]*stroke="none"/.test(fill) &&
            /<path[^>]*fill="#1e88e5"[^>]*stroke="#1e88e5"/.test(filldraw),
        fill.slice(0, 200) + ' || ' + filldraw.slice(0, 200)
    );
}

// 44. 无 KaTeX 时数学降级必须可读：去掉 $ 定界符，不能显示字面 $x(t)$
{
    const svg = await render('\\node[draw] at (0,0) {信号波形\\\\$x(t)$};');
    check(
        '无 KaTeX 数学降级不带 $ 定界符',
        !svg.includes('$x(t)$') && svg.includes('x(t)') && svg.includes('信号波形'),
        svg.slice(0, 300)
    );
}

// 45. foreach 循环体内宏不泄漏：循环结束后 \y 应回到未定义（坐标为 0），
//     而不是沿用最后一次迭代值（变量生命周期/作用域回归）
{
    const svg = await render(
        '\\foreach \\i in {1,2,3} { \\pgfmathsetmacro{\\y}{\\i*2} \\fill (\\i,\\y) circle (1pt); }' +
            '\\node at (\\y,0) {after};'
    );
    check(
        'foreach 宏不泄漏到循环外',
        /<text x="0" y="0"[^>]*>after</.test(svg),
        svg.slice(0, 300)
    );
}

// 46. 极短箭头自适应：原点圆边到数字 1 圆边仅 2.5px 时，箭头大小也必须
//     与线段匹配，不能仍用 9px 大箭头反向盖住原点圆
{
    const svg = await render(
        '\\node[draw,circle,blue] (a) at (0,0) {原点};' +
            '\\node[circle,red] (p1) at (1,0) {1};' +
            '\\draw[->] (a) -- (p1);'
    );
    const m = /<polygon points="20,0 ([\d.]+),/.exec(svg);
    check(
        '短箭头大小随线段自适应（基点在 17.5px 附近）',
        m && Math.abs(parseFloat(m[1]) - 17.5) < 0.01,
        m ? 'base x=' + m[1] : svg.slice(0, 400)
    );
}


// ============ 回归：scope/rotate/brace 与 example.md 15.6–15.8 布局 ============

// 47. scope 坐标变换：xshift/rotate 必须真实影响内部坐标，且 scope 结束后还原
{
    const svg = await render(
        '\\begin{scope}[xshift=2cm]\\draw (0,0) -- (1,0);\\end{scope}' +
            '\\draw (0,0) -- (0.5,0);' +
            '\\begin{scope}[rotate=90]\\draw (1,0) -- (2,0);\\end{scope}'
    );
    const ds = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    check(
        'scope xshift/rotate 应用且作用域可还原',
        ds.some((d) => /^M64 0L96 0$/.test(d)) &&
            ds.some((d) => /^M0 0L16 0$/.test(d)) &&
            ds.some((d) => /^-?[\d.e-]+ -32L-?[\d.e-]+ -64$/.test(d.replace(/M/g, ''))),
        JSON.stringify(ds)
    );
}

// 48. 单条语句 rotate/xshift 选项：不需要 scope 也能变换坐标
{
    const svg = await render('\\draw[rotate=90] (1,0) -- (2,0);');
    const m = /<path d="M([\d.e-]+) (-?\d+)L([\d.e-]+) (-?\d+)"/.exec(svg);
    check(
        '语句级 rotate 生效（1,0)→(0,1)）',
        m && Math.abs(parseFloat(m[1])) < 1e-6 && m[2] === '-32' && m[4] === '-64',
        svg.slice(0, 200)
    );
}

// 49. brace 装饰：不能再退化为普通直线；应输出多段三次曲线的大括号路径
{
    const svg = await render(
        '\\draw[decorate, decoration={brace, amplitude=5pt, mirror, raise=2pt}]' +
            ' (0,0) -- (3,0) node[midway, below=0.4cm] {频率分解};'
    );
    const m = /<path d="([^"]+)"/.exec(svg);
    check(
        'brace decoration 输出曲线大括号',
        m && (m[1].match(/C/g) || []).length >= 4 && !/^M0 0L96 0/.test(m[1]),
        m ? m[1].slice(0, 120) : svg.slice(0, 200)
    );
}

// 50. example.md 15.6–15.8：示例坐标必须按视觉分组错开，不能内容层互相叠放
{
    const md = readFileSync(new URL('../Markdown/example.md', import.meta.url), 'utf8');
    const blocks = [...md.matchAll(/```tikz\n([\s\S]*?)```/g)].map((m) => m[1]);
    const b156 = blocks.find((b) => b.includes('% 折线') && b.includes('% 网格'));
    const b157 = blocks.find((b) => b.includes('{组合图}'));
    const b158 = blocks.find((b) => b.includes('二维嵌套栅格'));
    const svg6 = await render(b156 || '');
    const svg7 = await render(b157 || '');
    const svg8 = await render(b158 || '');

    const orangeRect = /<rect x="([\d.]+)"[^>]*stroke="#fb8c00"/.exec(svg6);
    const greenCircle = /<circle cx="([\d.]+)"[^>]*stroke="#43a047"/.exec(svg6);
    const gridRect157 = /<rect x="([\d.]+)"[^>]*fill="rgb\(75,160,234\)"/.exec(svg7);
    const boxText157 = /<text x="[\d.]+" y="(-?[\d.]+)"[^>]*>组合图</.exec(svg7);
    const firstCircle157 = /<circle cx="([\d.]+)"[^>]*r="12"/.exec(svg7);
    const blue158 = [...svg8.matchAll(/<circle[^>]*fill="#1e88e5"[^>]*\/>/g)].map(
        (m) => /cy="(-?[\d.]+)"/.exec(m[0]) && +RegExp.$1
    );
    const red158 = [...svg8.matchAll(/<text[^>]*fill="#e53935"[^>]*>[\s\S]*?<\/text>/g)].map(
        (m) => /y="(-?[\d.]+)"/.exec(m[0]) && +RegExp.$1
    );
    const grid158 = [...svg8.matchAll(/<circle[^>]*r="2\.2[\d.]*"[^>]*\/>/g)].map(
        (m) => /cy="(-?[\d.]+)"/.exec(m[0]) && +RegExp.$1
    );
    const gray158 = [...svg8.matchAll(/<text[^>]*fill="#9e9e9e"[^>]*>[\s\S]*?<\/text>/g)].map(
        (m) => /y="(-?[\d.]+)"/.exec(m[0]) && +RegExp.$1
    );
    check(
        'example 15.6–15.8 视觉分组互不重叠',
        b156 && b157 && b158 &&
            orangeRect && greenCircle && +orangeRect[1] > +greenCircle[1] &&
            gridRect157 && +gridRect157[1] >= 240 &&
            boxText157 && Math.abs(+boxText157[1] - -128) < 1 &&
            firstCircle157 && +firstCircle157[1] >= 40 &&
            blue158.length === 3 && blue158.every((y) => y === -192) &&
            red158.length === 5 && red158.every((y) => y === -128) &&
            grid158.length === 9 &&
            [0, -32, -64].every((y) => grid158.includes(y)) &&
            gray158.length === 5 && gray158.every((y) => y === 96),
        JSON.stringify({
            o: orangeRect && orangeRect[1],
            g: greenCircle && greenCircle[1],
            grid157: gridRect157 && gridRect157[1],
            box157: boxText157 && boxText157[1],
            blue158: blue158,
            red158: red158,
            grid158: grid158,
            gray158: gray158,
        })
    );
}


// 51. 旋转 scope 内的矩形必须输出真实旋转 polygon，而不是轴对齐包围盒
{
    const svg = await render(
        '\\begin{scope}[shift={(5.2,0.2)}, rotate=25]' +
            '\\filldraw[fill=red!20, draw=red] (0,0) rectangle (2,2);' +
            '\\end{scope}'
    );
    const poly = /<polygon points="([^"]+)" fill="rgb\(234,97,93\)"/.exec(svg);
    check(
        '旋转矩形输出 polygon（非轴对齐 rect）',
        poly && poly[1].split(' ').length === 4,
        svg.slice(0, 300)
    );
}

// 52. scope scale 必须缩放 circle 半径；xscale 必须输出椭圆 path
{
    const scaled = await render('\\begin{scope}[scale=2]\\fill (0,0) circle (1);\\end{scope}');
    const ellipse = await render('\\begin{scope}[xscale=2]\\fill (0,0) circle (1);\\end{scope}');
    const cr = /<circle[^>]*r="([\d.]+)"/.exec(scaled);
    check(
        'scope scale 缩放圆半径 / xscale 圆采样为椭圆',
        cr && Math.abs(+cr[1] - 64) < 0.01 && /<path d="M/.test(ellipse),
        'r=' + (cr && cr[1]) + ' ellipse=' + /<path d="M/.test(ellipse)
    );
}
}
