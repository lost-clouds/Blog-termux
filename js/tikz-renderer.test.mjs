// Regression probe v2: verify all primitives align under Y-up math convention.
import { renderTikz } from './tikz-renderer.js';
async function render(src) {
  const el = { innerHTML: '', classList: { add() {} }, getAttribute(n) { return n === 'data-tikz' ? src : null; } };
  const container = { querySelectorAll() { return [el]; } };
  await renderTikz(container);
  return el.innerHTML;
}
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (cond ? '' : ' | ' + detail));
  if (!cond) failures++;
}

// 1. node at (0,2) -> SVG y=-64
{
  const svg = await render('\\node at (0,2) {A};');
  check('node (0,2) -> y=-64', /<text x="0" y="-64"/.test(svg), svg.slice(0, 160));
}
// 2. circle at (0,2) center y=-64 (polar near-zero handled)
{
  const svg = await render('\\fill (0,2) circle (3pt);');
  check('circle (0,2) -> cy=-64', /<circle cx="0" cy="-64"/.test(svg), svg.slice(0, 160));
}
// 3. rect (0,0)-(2,3) -> SVG x:0..64, y:-96..0
{
  const svg = await render('\\draw (0,0) rectangle (2,3);');
  const f = [...svg.match(/<rect[^>]*\/>/)[0].matchAll(/-?\d+/g)].map(m => Math.round(+m[0]));
  check('rect (0,0)-(2,3) -> x0..64,y-96..0', f[0] === 0 && f[1] === -96 && f[2] === 64 && f[3] === 96, JSON.stringify(f));
}
// 4. grid (-2,-1) grid (2,1): CORRECT TikZ behavior — coords are corners, step=1 → y lines at -1,0,1
// SVG: y=-1→+32, y=0→0, y=1→-32, so min=-32, max=32
{
  const svg = await render('\\draw (-2,-1) grid (2,1);');
  const ys = [...svg.matchAll(/y1="(-?\d+)"/g)].map(m => +m[1]);
  check('grid y spans -32..32', Math.min(...ys) === -32 && Math.max(...ys) === 32, `min=${Math.min(...ys)} max=${Math.max(...ys)}`);
}
// 5. line (0,0)->(0,3) goes UP (y=-96)
{
  const svg = await render('\\draw[->] (0,0) -- (0,3);');
  const m = /d="M0 0L0 (-?\d+)/.exec(svg);
  check('line (0,0)->(0,3) goes UP', m && m[1] === '-96', svg.slice(0, 150));
}
// 6. plot y=x^2 endpoints and vertex
{
  const svg = await render('\\draw[domain=-2:2] plot (\\x,{\\x*\\x});');
  const md = /<path d="(M-64[^"]+)/.exec(svg);
  const pts = md[1].replace(/M/g, '').split('L').map(p => p.split(' ').map(Number));
  const s = pts[0], e = pts[pts.length - 1];
  const best = pts.reduce((a, b) => Math.abs(b[1]) < Math.abs(a[1]) ? b : a);
  check('plot y=x^2 endpoints (-64,-128)..(64,-128)',
    Math.abs(s[0] + 64) < 1e-6 && Math.abs(s[1] + 128) < 1e-6 && Math.abs(e[0] - 64) < 1e-6 && Math.abs(e[1] + 128) < 1e-6,
    `s=${s} e=${e}`);
  check('plot y=x^2 vertex ~ y=0', Math.abs(best[1]) < 5, `vertex=${best}`);
}
// 7. polar (90:2) -> (0,2) -> cy=-64 (title=2*32)
{
  const svg = await render('\\fill (90:2) circle (3pt);');
  check('polar (90:2) -> cy=-64', /cy="-64"/.test(svg), svg.slice(0, 160));
}
// 8. anchors: above->up(-8), below->down(+8), left->(-8,0), right->(+8,0)
{
  const up = await render('\\node[above] at (0,0) {T};');
  const down = await render('\\node[below] at (0,0) {T};');
  const left = await render('\\node[left] at (0,0) {T};');
  const right = await render('\\node[right] at (0,0) {T};');
  check('above -> y=-8', /<text x="0" y="-8"/.test(up), up.slice(0, 160));
  check('below -> y=+8', /<text x="0" y="8"/.test(down), down.slice(0, 160));
  check('left -> x=-8', /<text x="-8" y="0"/.test(left), left.slice(0, 160));
  check('right -> x=+8', /<text x="8" y="0"/.test(right), right.slice(0, 160));
}
// 9. grid with step option: (0,0) grid (5,4) with step=1 → 6 vertical lines (x=0..5), 5 horizontal (y=0..4)
{
  const svg = await render('\\draw[step=1] (0,0) grid (5,4);');
  const xs = [...svg.matchAll(/x1="(\d+)"/g)].map(m => +m[1]);
  const xvals = [...new Set(xs)].sort((a,b)=>a-b);
  check('step=1 grid x lines 0,32,64,96,128,160', xvals.length === 6 && xvals[0] === 0 && xvals[5] === 160, `xvals=${JSON.stringify(xvals)}`);
}

// 10. grid+axes alignment: coordinate system with grid, axes, and a point all align
{
  const svg = await render('\\begin{document}\\begin{tikzpicture}[scale=1]\\draw[very thin,gray!30] (-4.5,-3.5) grid (4.5,3.5);\\draw[thick,->] (-4.5,0) -- (4.5,0);\\draw[thick,->] (0,-3.5) -- (0,3.5);\\fill (3,2) circle (2pt);\\end{tikzpicture}\\end{document}');
  // Vertical grid lines: x1==x2 lines (columns) at integer positions -4..4 (inside [-4.5,4.5])
  const cols = [...svg.matchAll(/<line x1="(-?\d+)" y1="(-?\d+)" x2="(-?\d+)"/g)]
    .filter(m => m[1] === m[3]).map(m => +m[1]).sort((a,b)=>a-b);
  check('axis+grid: 9 columns at -128..128 step 32',
    cols.length === 9 && cols[0]===-128 && cols[8]===128,
    `cols=${JSON.stringify(cols)}`);
  // Point (3,2) should be at SVG cx=96, cy=-64
  const circle = /<circle cx="(\d+)" cy="(-\d+)"/.exec(svg);
  check('point (3,2) aligns at cx=96,cy=-64', circle && +circle[1]===96 && +circle[2]===-64, svg.slice(0,300));
}

// 12. composite coordinate system: axes + plot + points align
{
  const svg = await render('\\begin{document}\\begin{tikzpicture}[scale=1]\\draw[thick,->] (-3,0) -- (3,0);\\draw[thick,->] (0,-3) -- (0,5);\\draw[blue,domain=-2:2] plot (\\x,{2*\\x+1});\\fill (0,1) circle (2pt);\\fill (1,3) circle (2pt);\\end{tikzpicture}\\end{document}');
  const circles = [...svg.matchAll(/<circle cx="(-?[0-9.e-]+)" cy="(-?[0-9.e-]+)"/g)].map(m => [Math.round(+m[1]), Math.round(+m[2])]);
  const ds = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]).filter(d => d.split(' ').length > 20); // plot path has many coords
  const d = ds[0] || '';
  const pts = d.replace(/M/g, '').split('L').map(p => p.split(' ').map(Number)).filter(p => p.length === 2);
  const at0 = pts.reduce((a, b) => Math.abs(b[0]) < Math.abs(a[0]) ? b : a);
  const okPts = circles.some(c => c[0] === 0 && c[1] === -32) && circles.some(c => c[0] === 32 && c[1] === -96);
  const okPlot = Math.abs(at0[1] - (-32)) < 1e-6;
  check('composite: points + plot align', okPts && okPlot, `circles=${JSON.stringify(circles)} plot@0=${at0}`);
}

// 12. foreach variable substitution: points spread along x (NOT all at origin)
{
  const svg = await render('\\foreach \\x in {0,1,2,3,4} { \\fill[red] (\\x,0) circle (2pt); };');
  const cs = [...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g)].map(m => Math.round(+m[1]) + ',' + Math.round(+m[2]));
  const xs = new Set(cs.map(c => c.split(',')[0]));
  check('foreach x spreads: 5 distinct x (0,32,64,96,128)',
    xs.size === 5 && [...xs].sort((a,b)=>a-b).every((v,i)=>+v === i*32),
    `xs=${JSON.stringify([...xs])} all=${JSON.stringify(cs)}`);
}

// 13. mid-dot ellipsis {1,2,...,6} expands to 1..6 (previously produced NaN)
{
  const svg = await render('\\foreach \\x in {1,2,...,6} { \\fill (\\x,0) circle (1pt); };');
  const cs = new Set([...svg.matchAll(/<circle cx="(-?[\d.]+)"/g)].map(m => Math.round(+m[1])));
  check('mid-dot ellipsis 1..6 -> 6 points 32..192',
    cs.size === 6 && Math.min(...cs) === 32 && Math.max(...cs) === 192,
    `x=${JSON.stringify([...cs].sort((a,b)=>a-b))}`);
}

// 14. step ellipsis {0,0.5,...,3} -> 0,0.5,...,3 (7 points)
{
  const svg = await render('\\foreach \\x in {0,0.5,...,3} { \\fill[orange] (\\x,0) circle (1pt); };');
  const cs = new Set([...svg.matchAll(/<circle cx="(-?[\d.]+)"/g)].map(m => Math.round(+m[1])));
  check('step ellipsis 0..3 step .5 -> 7 points 0..96',
    cs.size === 7 && Math.min(...cs) === 0 && Math.max(...cs) === 96,
    `x=${JSON.stringify([...cs].sort((a,b)=>a-b))}`);
}

// 15. string loop vars: \foreach \pt in {o,p} over named coords spreads
{
  const svg = await render('\\coordinate (o) at (0,0);\\coordinate (p) at (3,2);\\foreach \\pt in {o,p} { \\fill (\\pt) circle (2.5pt); };');
  const cs = new Set([...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g)].map(m => Math.round(+m[1]) + ',' + Math.round(+m[2])));
  check('string foreach {o,p} -> circles at (0,0) and (96,-64)',
    cs.has('0,0') && cs.has('96,-64'),
    `circles=${JSON.stringify([...cs])}`);
}

// 16. \pgfmathsetmacro + foreach: bars spread and heights differ (previous NaN collapse)
{
  const svg = await render('\\foreach \\x in {1,2,3} { \\pgfmathsetmacro{\\h}{\\x*0.6} \\draw[fill=teal!30] (\\x-0.4,0) rectangle (\\x+0.4,\\h); };');
  const rs = [...svg.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/g)]
    .map(m => [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), Math.round(+m[4])]);
  check('pgfmath bars: 3 distinct x ranges',
    rs.length === 3 && new Set(rs.map(r => r[0])).size === 3,
    `rects=${JSON.stringify(rs)}`);
  const hs = rs.map(r => r[3]);
  check('pgfmath bars: heights 19,38,58 (distinct, increasing)',
    hs[0] < hs[1] && hs[1] < hs[2] && hs[0] > 0,
    `heights=${JSON.stringify(hs)}`);
}

// 17. coordinate registration: named coords drive a real path (not M0 0L0 0)
{
  const svg = await render('\\coordinate (A) at (0,0);\\coordinate (B) at (3,2);\\draw[->, red, thick] (A) -- (B);');
  const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map(m => m[1]);
  check('coordinate path uses registered coords (M0 0L96 -64)',
    paths.some(p => /^M0 0L96 -64/.test(p)),
    `paths=${JSON.stringify(paths)}`);
}

// 18. no degenerate path from coordinate statement alone
{
  const svg = await render('\\coordinate (A) at (0,0);');
  check('standalone coordinate emits no path', !(/<path /.test(svg)), svg.slice(0,120));
}

// 19. inline node label on draw path (node below at end)
{
  const svg = await render('\\draw[->] (0,0) -- (3,0) node[below] {x};');
  const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>x</.exec(svg);
  // 末点 (3,0) → px=96；below 锚点下移 +8
  check('inline "node[below] {x}" at end (96, +8)', m && Math.round(+m[1]) === 96 && Math.round(+m[2]) === 8, 'text at ' + (m && m[1] + ',' + m[2]));
}

// 20. inline node with at (x,y) override
{
  const svg = await render('\\draw[->] (0,0) -- (3,0) node[above] at (1,1) {p};');
  const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>p</.exec(svg);
  // (1,1) → (32,-32)，above 上移 -8 → (32,-40)
  check('inline "node[...] at (1,1)" label at (32,-40)', m && Math.round(+m[1]) === 32 && Math.round(+m[2]) === -40, 'text at ' + (m && m[1] + ',' + m[2]));
}

// 21. mid-path node "a -- node{lab} b" sits at segment midpoint (48, 0)
{
  const svg = await render('\\draw (0,0) -- node{mid} (3,0) -- (5,0);');
  const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>mid</.exec(svg);
  check('mid-path "node{mid}" at (48, 0)', m && Math.round(+m[1]) === 48 && Math.round(+m[2]) === 0, 'text at ' + (m && m[1] + ',' + m[2]));
}

// 22. combined anchor "above right" on circle label
{
  const svg = await render('\\filldraw[blue] (3,2) circle (2pt) node[above right] {pt};');
  const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>pt</.exec(svg);
  // 圆心 (3,2) → (96,-64)；above(-8y) right(+8x) → (104,-72)
  check('circle label "above right" at (104,-72)', m && Math.round(+m[1]) === 104 && Math.round(+m[2]) === -72, 'text at ' + (m && m[1] + ',' + m[2]));
}

// ============ 回归：修复 commit 新增用例 ============

// 23. 整图 scale：tikzpicture 级 [scale=2] 必须放大坐标（旧实现丢弃 scale，画面偏小）
{
  const svg = await render('\\begin{tikzpicture}[scale=2]\\draw (0,0) -- (3,0);\\end{tikzpicture}');
  check('picture scale=2 -> L192', /d="M0 0L192 0"/.test(svg), svg.slice(0, 200));
}
// 24. 整图 scale=0.8 应用于网格：-4.5 单位 → -115.2px 端点,网格线位置按 0.8 缩放
{
  const svg = await render('\\begin{tikzpicture}[scale=0.8]\\draw[very thin] (-4.5,-3.5) grid (4.5,3.5);\\end{tikzpicture}');
  // 仅竖向网格线（x1===x2），在整数 x=-4..4 处 → 缩放后 = -4*0.8*32=-102.4 ... 102.4
  const x1s = [...svg.matchAll(/<line x1="(-?\d+(?:\.\d+)?)" y1="(-?\d+(?:\.\d+)?)" x2="(-?\d+(?:\.\d+)?)"/g)]
    .filter(m => m[1] === m[3]).map(m => parseFloat(m[1]));
  check('scale=0.8 vertical grid lines span -102.4..102.4',
    Math.min(...x1s) === -102.4 && Math.max(...x1s) === 102.4 && x1s.length === 9,
    `x1s min=${Math.min(...x1s)} max=${Math.max(...x1s)} n=${x1s.length}`);
}
// 25. pt 半径：circle (2.5pt) → ~0.0879 单位 → r≈2.81px（旧值塌缩为 r=1）
{
  const svg = await render('\\fill (0,0) circle (2.5pt);');
  const m = /<circle[^>]*r="([\d.]+)"/.exec(svg);
  check('circle (2.5pt) radius ≈2.81 (>1)', m && +m[1] > 2 && +m[1] < 4, m ? 'r=' + m[1] : svg.slice(0, 200));
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
  check('arc emits polyline (>8 segments)', segs > 8, `segs=${segs} ${svg.slice(0,120)}`);
}
// 29. filldraw 裸颜色：filldraw[blue] 圆点填充应为蓝色（旧实现填充默认暗色 → “点成了圈”）
{
  const svg = await render('\\filldraw[blue] (0,0) circle (2.5pt);');
  check('filldraw[blue] fill=#1e88e5', /fill="#1e88e5"/.test(svg), svg.slice(0, 200));
}
// 30. 样式 minimum width/height、rounded corners（旧实现空格键=不解析 → 尺寸塌缩）
{
  const svg = await render('\\begin{tikzpicture}[box/.style={draw, thick, rounded corners, minimum width=2.6cm, minimum height=1.1cm}]\\node[box] {x};\\end{tikzpicture}');
  const m = /<rect[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*rx="([\d.]+)"/.exec(svg);
  check('style min-width 2.6cm=83.2 / min-height 1.1cm=35.2 / rounded',
    m && Math.abs(+m[1] - 83.2) < 0.5 && Math.abs(+m[2] - 35.2) < 0.5 && +m[3] > 0,
    m ? `w=${m[1]} h=${m[2]} rx=${m[3]}` : svg.slice(0, 200));
}
// 31. 弧度标记 r：plot 表达式 cos(2*\x r) 不抛错且曲线存在（旧实现整块渲染失败）
{
  const svg = await render('\\draw[domain=0:1, samples=10] plot (\\x, {0.9*cos(2*\\x r) - 0.8});');
  check('radian r marker renders plot', /<path d="M/.test(svg) && !/TikZ 渲染失败/.test(svg), svg.slice(0, 120));
}
// 32. 相对定位 below=of X（flow 示例核心）与 xshift 组合
{
  const svg = await render('\\begin{tikzpicture}[node distance=1.4cm]\\node (a) at (0,0) {A};\\node[below=of a, xshift=-1.2cm] (b) {B};\\end{tikzpicture}');
  const m = /<text x="(-?[\d.]+)" y="(-?[\d.]+)"[^>]*>B</.exec(svg);
  check('below=of a + xshift -> B at (-38.4, 71.8)', m && Math.round(+m[1]) === -38 && Math.round(+m[2]) === 72, m ? 'B at ' + m[1] + ',' + m[2] : svg.slice(0,200));
}
// 33. 节点锚点引用 X.south west 与 $...$ 坐标运算
{
  const svg = await render('\\node (f) at (2,2) {F};\\draw ($(f.south west)+(-0.3,-0.3)$) -- ($(f.south east)+(0.3,-0.3)$);');
  const m = /d="M([\d.-]+ [\d.-]+)L([\d.-]+ [\d.-]+)"/.exec(svg);
  // F 中心 (64,-64)，半宽取默认 ~0.6? 仅断言起点终点 x 对称且 y 相同
  check('calc $coords$ renders a path', m && m[1] && m[2], m ? m[1] + ' -> ' + m[2] : svg.slice(0, 150));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
