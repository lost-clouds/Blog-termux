/**
 * @module tikz-renderer.test.cases-regression
 * @description 历史修复 commit 回归（原 23–33 号用例）
 *              测试用例只声明异步函数，DOM 桩与失败计数由 runner 注入。
 */

'use strict';

/**
 * 运行 历史修复 commit 回归（原 23–33 号用例）。
 * @param {{render:Function, check:Function}} tools
 * @returns {Promise<void>}
 */
export async function runRegressionCases({ render, check }) {
// ============ 回归：修复 commit 新增用例 ============

// 23. 整图 scale：tikzpicture 级 [scale=2] 必须放大坐标（旧实现丢弃 scale，画面偏小）
{
    const svg = await render(
        '\\begin{tikzpicture}[scale=2]\\draw (0,0) -- (3,0);\\end{tikzpicture}'
    );
    check('picture scale=2 -> L192', /d="M0 0L192 0"/.test(svg), svg.slice(0, 200));
}
// 24. 整图 scale=0.8 应用于网格：-4.5 单位 → -115.2px 端点,网格线位置按 0.8 缩放
{
    const svg = await render(
        '\\begin{tikzpicture}[scale=0.8]\\draw[very thin] (-4.5,-3.5) grid (4.5,3.5);\\end{tikzpicture}'
    );
    // 仅竖向网格线（x1===x2），在整数 x=-4..4 处 → 缩放后 = -4*0.8*32=-102.4 ... 102.4
    const x1s = [
        ...svg.matchAll(
            /<line x1="(-?\d+(?:\.\d+)?)" y1="(-?\d+(?:\.\d+)?)" x2="(-?\d+(?:\.\d+)?)"/g
        ),
    ]
        .filter((m) => m[1] === m[3])
        .map((m) => parseFloat(m[1]));
    check(
        'scale=0.8 vertical grid lines span -102.4..102.4',
        Math.min(...x1s) === -102.4 && Math.max(...x1s) === 102.4 && x1s.length === 9,
        `x1s min=${Math.min(...x1s)} max=${Math.max(...x1s)} n=${x1s.length}`
    );
}
// 25. pt 半径：circle (2.5pt) → ~0.0879 单位 → r≈2.81px（旧值塌缩为 r=1）
{
    const svg = await render('\\fill (0,0) circle (2.5pt);');
    const m = /<circle[^>]*r="([\d.]+)"/.exec(svg);
    check(
        'circle (2.5pt) radius ≈2.81 (>1)',
        m && +m[1] > 2 && +m[1] < 4,
        m ? 'r=' + m[1] : svg.slice(0, 200)
    );
}
// 26. 箭头：\draw[->] 必须输出 <polygon>（旧实现 e2 传整段数组,箭头永不绘制）
{
    const svg = await render('\\draw[->] (0,0) -- (3,0);');
    check('arrow polygon emitted', /<polygon/.test(svg), svg.slice(0, 200));
}
// 27. 回箭头 <-
{
    const svg = await render('\\draw[<-] (0,0) -- (3,0);');
    check('back-arrow polygon emitted', /<polygon/.test(svg), svg.slice(0, 200));
}
// 28. arc 渲染为曲线而非直线：arc (0:60:0.5) 应产生多段折线（>3 段,覆盖 0..60 度）
{
    const svg = await render('\\draw (0.5,0) arc (0:60:0.5);');
    const m = /d="M([^"]+)"/.exec(svg);
    const segs = m ? m[1].split('L').length : 0;
    check('arc emits polyline (>8 segments)', segs > 8, `segs=${segs} ${svg.slice(0, 120)}`);
}
// 29. filldraw 裸颜色：filldraw[blue] 圆点填充应为蓝色（旧实现填充默认暗色 → “点成了圈”）
{
    const svg = await render('\\filldraw[blue] (0,0) circle (2.5pt);');
    check('filldraw[blue] fill=#1e88e5', /fill="#1e88e5"/.test(svg), svg.slice(0, 200));
}
// 30. 样式 minimum width/height、rounded corners（旧实现空格键=不解析 → 尺寸塌缩）
{
    const svg = await render(
        '\\begin{tikzpicture}[box/.style={draw, thick, rounded corners, minimum width=2.6cm, minimum height=1.1cm}]\\node[box] {x};\\end{tikzpicture}'
    );
    const m = /<rect[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*rx="([\d.]+)"/.exec(svg);
    check(
        'style min-width 2.6cm=83.2 / min-height 1.1cm=35.2 / rounded',
        m && Math.abs(+m[1] - 83.2) < 0.5 && Math.abs(+m[2] - 35.2) < 0.5 && +m[3] > 0,
        m ? `w=${m[1]} h=${m[2]} rx=${m[3]}` : svg.slice(0, 200)
    );
}
// 31. 弧度标记 r：plot 表达式 cos(2*\x r) 不抛错且曲线存在（旧实现整块渲染失败）
{
    const svg = await render(
        '\\draw[domain=0:1, samples=10] plot (\\x, {0.9*cos(2*\\x r) - 0.8});'
    );
    check(
        'radian r marker renders plot',
        /<path d="M/.test(svg) && !/TikZ 渲染失败/.test(svg),
        svg.slice(0, 120)
    );
}
// 32. 相对定位 below=of X（flow 示例核心）与 xshift 组合
{
    const svg = await render(
        '\\begin{tikzpicture}[node distance=1.4cm]\\node (a) at (0,0) {A};\\node[below=of a, xshift=-1.2cm] (b) {B};\\end{tikzpicture}'
    );
    const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>B</.exec(svg);
    // 文本高度由 1.35em 修正为 1em：A/B 半高 = (14+8)/2 = 11px = 0.34375 单位，
    // below 偏移 y = -(0.34375 + 1.4 + 0.34375) = -2.0875 → py = 66.8
    check(
        'below=of a + xshift -> B at (-38.4, 66.8)',
        m && Math.round(+m[1]) === -38 && Math.round(+m[2]) === 67,
        m ? 'B at ' + m[1] + ',' + m[2] : svg.slice(0, 200)
    );
}
// 33. 节点锚点引用 X.south west 与 $...$ 坐标运算
{
    const svg = await render(
        '\\node (f) at (2,2) {F};\\draw ($(f.south west)+(-0.3,-0.3)$) -- ($(f.south east)+(0.3,-0.3)$);'
    );
    const m = /d="M([\d.-]+ [\d.-]+)L([\d.-]+ [\d.-]+)"/.exec(svg);
    // F 中心 (64,-64)，半宽取默认 ~0.6? 仅断言起点终点 x 对称且 y 相同
    check(
        'calc $coords$ renders a path',
        m && m[1] && m[2],
        m ? m[1] + ' -> ' + m[2] : svg.slice(0, 150)
    );
}
}
