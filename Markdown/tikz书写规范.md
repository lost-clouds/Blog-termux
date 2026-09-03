# Blog-termux · TikZ 书写规范

> 本规范是 **Blog-termux** 自带 TikZ→SVG 渲染引擎（`js/tikz-renderer.js`，逻辑位于
> `js/tikz/*` 13 个模块）的**完整语法子集与写法学**，并附带大量**可直接照抄的示例代码**。
> 它同时是本站 Math 系列（`Markdown/Math/`，80+ 个 ```tikz``` 代码块）的唯一事实标准。
>
> 一切书写都以**本规范**为准，而不是以完整 LaTeX/TikZ 手册为准——超出子集的语法会被
> 忽略或整块降级为源码（降级样式见 `css/src/components/tikz.css` 的 `.tikz-error`）。

---

## 目录

1. [代码块格式](#1-代码块格式)
2. [支持的渲染命令](#2-支持的渲染命令)
3. [坐标系与坐标](#3-坐标系与坐标)
4. [node 节点](#4-node-节点)
5. [数学公式](#5-数学公式)
6. [颜色](#6-颜色)
7. [draw / fill / filldraw 路径](#7-draw--fill--filldraw-路径)
8. [网格 grid（重要）](#8-网格-grid重要)
9. [foreach 循环](#9-foreach-循环)
10. [pgfmathsetmacro 计算宏](#10-pgfmathsetmacro-计算宏)
11. [综合实例](#11-综合实例)
12. [兼容红线](#12-兼容红线)

---

## 1. 代码块格式

TikZ 图用 Markdown 的三反引号 `tikz` 围栏包裹，渲染管线会自动识别并替换为 SVG：

```tikz
\begin{document}
\begin{tikzpicture}[scale=1.2]
  % 图内容
  \draw (0,0) -- (2,1);
\end{tikzpicture}
\end{document}
```

### 1.1 包裹环境（可选但推荐）

- `\begin{document}` / `\end{document}`、`\begin{tikzpicture}` / `\end{tikzpicture}` ——
  渲染前会被自动剥离。**必须一一配对**。
- 环境方括号参数支持**整体缩放 (`scale`)、节点间距 (`node distance`) 与坐标变换**：
  `\begin{tikzpicture}[scale=0.8]` 会**整图缩放**（坐标、半径、网格均按该因子换算）；
  `\begin{tikzpicture}[node distance=1.4cm]` 设置相对定位默认间距；
  `xshift/yshift`、`rotate`、`xscale/yscale` 会作为 tikzpicture 级坐标变换应用。
- 也可以**不写包裹环境**，直接写命令。多条命令用分号分隔即可：

```tikz
\draw (0,0) -- (2,1);
\fill (3,3) circle (2pt);
```

### 1.2 注释

- 注释用 `%` 到行尾。花括号内与转义 `\%` 不受影响。
- **不要在 node 文本里写裸 `%`**（会被当注释吞掉）；要字面百分号用 `\%`。

---

## 2. 支持的渲染命令

| 命令 | 说明 |
|------|------|
| `\node[(opts)] (name) at (x,y) {文本}` | 节点（带形状+文本，或纯文本标签） |
| `\coordinate (name) at (x,y);` | 命名坐标点 |
| `\draw[(opts)] path` | 画线 / 形状 |
| `\fill[(opts)] path` | 填充 |
| `\filldraw[(opts)] path` | 填充 + 描边 |
| `\foreach \x in {list} { ... }` | 循环（支持单层与嵌套，见 §9） |
| `\pgfmathsetmacro{\name}{expr}` | 计算宏（foreach 内外均可，见 §10） |

**不支持/会被忽略的命令**：`\usetikzlibrary{...}`、`\tikzset{...}`、`\pgfkeys{...}`。
`\begin{scope}[xshift/yshift/rotate/xscale/yscale]` 现已支持坐标变换；变换作用于
scope 内的点、直线、节点中心与函数图采样点。

---

## 3. 坐标系与坐标

引擎默认缩放：**1 个 tikz 单位 = 32px**。坐标系遵循 TikZ 约定：**Y 轴向上**，
这与 SVG 的 Y 向下在渲染时取负统一，因此网格、坐标轴、节点、函数图天然对齐。

### 3.1 坐标的四种写法

| 写法 | 说明 | 示例 |
|------|------|------|
| 直角坐标 | `(x,y)` | `(0,0)`、`(-2.5,4)` |
| 极坐标 | `(angle:radius)`，角度单位度 | `(60:3)`、`(90:2.2)` |
| 计算坐标 | `({expr})`，花括号内支持四则/函数 | `({0.25*\x*\x})` |
| 命名坐标 | 路径中出现过的 `(name)` 可复用 | `(A)`、`(origin)` |

### 3.2 命名坐标（coordinate）

`\coordinate` 只是"记住一个点"，画图时直接引用：

```tikz
\coordinate (A) at (0,0);
\coordinate (B) at (3,2);
\draw[->, red, thick] (A) -- (B);
\draw[blue, dashed] (A) -- (0,3) -- (B);
\fill (A) circle (2pt);
\fill (B) circle (2pt);
```

### 3.3 一个完整的坐标系范例

这是本期修复（网格/坐标轴对齐）后的**标准写法**：网格、坐标轴、点、象限标记全部对齐。

```tikz
\begin{tikzpicture}[scale=0.7]
  \draw[very thin, gray!30] (-4.5,-3.5) grid (4.5,3.5);
  \draw[thick, ->] (-4.5,0) -- (4.5,0) node[below] {$x$};
  \draw[thick, ->] (0,-3.5) -- (0,3.5) node[above] {$y$};
  \node[below left] at (0,0) {$0$};
  \filldraw[blue] (3,2) circle (2pt) node[above right] {$(3,2)$};
  \filldraw[red] (-1,4) circle (2pt) node[above] {$(-1,4)$};
  \filldraw[green!50!black] (-2.5,-2) circle (2pt) node[below] {$(-2.5,-2)$};
  \node[gray, above right] at (3.5,3) {I};
  \node[gray, above left] at (-3.5,3) {II};
  \node[gray, below left] at (-3.5,-3) {III};
  \node[gray, below right] at (3.5,-3) {IV};
\end{tikzpicture}
```

> 思路：先把网格写在最前（铺底），坐标轴其次，点/标记最后——SVG 按声明顺序叠加，后画的盖住先画的。

---

## 4. node 节点

### 4.1 通用形式

```text
\node[选项] (名字) at (坐标) {文本};
```

- 名字可省略；文本中的数学用 `$...$`（推荐）或 `$$...$$`、`\(...\)` 包裹。
- 文本可以是"纯文本 + 数学"混排，例：`{值 $\vec{v}$ 与 $x^2$ 混合}`。
- 三种节点类型：**圆点**（`circle`）、**圆角/直角框**（`rectangle`、`rounded corners`）、
  **纯文本标签**（不带任何形状选项）。

### 4.2 支持的节点选项

| 选项 | 作用 | 示例 |
|------|------|------|
| `draw=<color>` | 描边色（**必须带颜色**，见下） | `draw=blue` |
| `fill=<color>` | 填充色 | `fill=orange!40` |
| `circle` | 圆形节点（配合 draw/fill；不带内容时可调 inner sep） | `circle, draw, fill=red` |
| `rectangle` | 矩形节点 | `rectangle, draw=green` |
| `rounded corners=<n>pt` | 圆角矩形 | `rounded corners=4pt` |
| `font=...` | 字号 tiny/scriptsize/footnotesize/small/normalsize/large/Large/LARGE/huge/Huge | `font=\small` |
| `font=...\bfseries` | 加粗 | `font=\large\bfseries` |
| `text=<color>` | 文本颜色 | `text=blue!70!black` |
| `color=<color>` | 通用颜色：节点文本 / draw 描边 / fill 填充按语境生效 | `color=violet!80!black` |
| `above/below/left/right` | 锚点偏移（约 8px = 0.25 单位） | `node[above]` |
| `scale=<n>` | 节点自身缩放 | `scale=1.2` |
| `inner sep=<n>pt` | 内边距（pt→px；0pt 可让小红点不被撑大） | `inner sep=2pt` |
| `sharp corners` | 直角（忽略） | — |

### 4.3 画框的规则（重要）

节点只有在显式给出 `draw=<色>`、`fill=<色>`、`circle`、`rectangle` **至少一项**时，
才会画出形状；否则只画文本（纯标签、无框）。

- 裸 `draw`（不带颜色）**会画框**，边框用默认描边色（修复 commit 后支持）。
- `filldraw[<色>]` 填充与描边都用该色（修复前填充误用默认暗色 → “点成了圈/颜色不对”）。
- 路径语义与 TikZ 一致：`\draw` 只描边、`\fill` 只填充（无描边）、`\filldraw` 填充并描边。

### 4.4 node 示例集合

**纯文本标签 + 锚点（先画锚点圆点，标签贴着锚点偏移 8px）：**

```tikz
\fill (0,2) circle (2pt);\node[above] at (0,2) {上方};
\fill (0,-2) circle (2pt);\node[below] at (0,-2) {下方};
\fill (-4,0) circle (2pt);\node[left] at (-4,0) {左边};
\fill (4,0) circle (2pt);\node[right, blue] at (4,0) {右边};
```

> ⚠️ 注意：锚点选项写在 **`[opts]` 括号里、且必须在 `(name)` 之前**：
> `\node[以上选项] (名字) at (坐标) {文本}`。把 `[opts]` 写在 `at (x,y)` 之后会被忽略。

**画框的节点（决策 / 流程图常用）：**

```tikz
\node[rectangle, draw=black, rounded corners=4pt] (start) at (0,0) {开始};
\node[rectangle, draw=blue, rounded corners=4pt] (process) at (4,0) {处理};
\node[rectangle, draw=black, rounded corners=4pt] (end) at (8,0) {结束};
\draw[->] (start) -- (process);
\draw[->] (process) -- (end);
```

**圆点（配合 foreach、坐标标定）：**

```tikz
\fill[red] (1,1) circle (3pt);
\fill[blue!60] (2,2) circle (2pt);
\foreach \x in {0,1,...,5} { \fill[green!50!black] (\x,0) circle (2pt); };
```

**空圆点（inner sep=0pt 防止被撑大）：**

```tikz
\node[circle, fill=orange!40, draw=black!60, inner sep=2.5pt] at (0,0) {};
\node[circle, fill=orange!40, draw=black!60, inner sep=2.5pt] at (1.5,0) {};
\filldraw (3,0) circle (2.5pt);
```

---

## 5. 数学公式

节点文本里的数学片段支持三种写法，渲染时**去掉分隔符**后交给 KaTeX：

| 写法 | 说明 | 示例 |
|------|------|------|
| `$...$` | 推荐，行内 | `{$\frac12$}` |
| `$$...$$` | 亦支持（渲染为行内样式） | `{$$E = mc^2$$}` |
| `\(...\)` | 亦支持 | `{\(a+b\)}` |
| 混合 | 纯文本 + 数学混排 | `{6 个 $=$ $\sqrt{2}$ 是小坑}` |

### 5.1 渲染过程

整段文本先被切成"纯文本 / 数学"片段；数学片段**剥掉分隔符**后单独交给
`katex.renderToString`（裸 LaTeX，不带 `$`）。KaTeX 未加载时降级为可读纯文本。

### 5.2 常用数学命令

`\frac \sqrt \vec \cdot \times \rightarrow \to \left( \right)
\log \ln \sum \int \lim \cos \sin`，下标 `_`、上标 `^`。

```tikz
\node at (0,3) {$\frac{1}{2}$ 与 $\sqrt{2}$};
\node at (0,2) {$\vec{v}$ 与 $\vec{u}\cdot\vec{v}$};
\node at (0,1) {$\sum_{i=1}^{n} i$ 与 $\int_0^1 x\,dx$};
\node[blue] at (0,0) {$y = \frac{1}{2}x + 1$};
```

### 5.3 文本尺寸约定（Bug #2 修复）

- 盒子长宽按**有效显示字符数**估算（剔除 `$`/花括号/LaTeX 命令骨架），不再按源码长度把盒子撑得过大。
- 含数学的节点文本放在 `<foreignObject>` 中；标签最大宽度上限 **1000px**，防止长内联公式把元素撑得巨大。
- `text width=4.2cm` **会被忽略**：盒子总是自适应内容宽（要更大间距用 `inner sep=`）。

---

## 6. 颜色

命名调色板：`black white gray grey red green blue orange purple indigo brown yellow cyan teal
pink violet olive lime magenta darkgray lightgray`。

支持 TikZ 风格**混合**：`fill=blue!20!white`、`draw=red!70!black`、`fill=orange!50` 等，
也支持 **hex**：`draw=#123456`。

```tikz
\draw[red] (0,0) -- (1,0);
\draw[blue!60] (0,-1) -- (1,-1);
\draw[red!70!black] (0,-2) -- (1,-2);
\fill[orange!50!white] (2,0) circle (3pt);
\filldraw[color=green!40!black, fill=green!10] (2,-2) circle (3pt);
```

---

## 7. draw / fill / filldraw 路径

### 7.1 支持的全部路径语法

| 语法 | 示例 | 说明 |
|------|------|------|
| 直线段 | `\draw (0,0) -- (1,1) -- (2,0);` | `--` 连线 |
| 闭合 | `\fill (a) -- (b) -- (c) -- cycle;` | `-- cycle` 闭合 |
| 箭头 | `\draw[->] (0,0) -- (3,0);` | `-> ->> latex -latex <- <<- <->` |
| 贝塞尔 | `\draw (0,0) .. controls (1,1) and (2,-1) .. (3,0);` | `.. controls .. and ..` |
| 圆弧 | `\draw (0.5,0) arc (0:60:0.5);` | `(起点) arc (起始角:终止角:半径)`，折线采样近似 |
| 圆 | `\fill[orange!50] (-2,0) circle (2pt);` | `circle (r)`，r 可带 `pt`（如 `2pt`/`2.5pt`）求值正确 |
| 矩形 | `\draw[fill=blue!20] (a) rectangle (b);` | `(左下) rectangle (右上)` |
| 网格 | `\draw[gray!40] (-0.5,-0.5) grid (4.5,3.5);` | `(左下) grid (右上)`，见 §8 |
| 函数曲线 | `\draw[domain=0:4.2] plot (\x,{0.25*\x*\x});` | `plot (\x,{expr})`，`domain=a:b` |
| 大括号装饰 | `\draw[decorate, decoration={brace, amplitude=5pt, mirror, raise=2pt}] (a) -- (b);` | 单段路径 brace；支持 `amplitude/mirror/raise` |

### 7.2 常见 draw 选项

`very thin thin thick very thick ultra thick dashed dotted -> <- domain=a:b smooth` 等，
颜色混合与调色板同 §6。

### 7.3 直线 / 折线 / 箭头示例

```tikz
\draw (0,0) -- (2,1) -- (4,0);                    % 折线
\draw[red, very thick, ->>] (0,2) -- (3,3);       % 双箭头
\draw[blue, thick, <-] (0,4) -- (4,4);            % 反向箭头
\draw[dashed] (5,0) -- (5,3);                     % 虚线
\draw[dotted] (6,0) -- (6,3);                     % 点线
\draw[<->, green, thick] (7,0) -- (9,2);          % 双向箭头
```

### 7.4 贝塞尔曲线

```tikz
\draw[purple, thick] (0,0) .. controls (1,2) and (2,2) .. (3,0);
\draw[orange] (0,-3) .. controls (1,-1) and (2,-1) .. (3,-3);
```

### 7.5 圆弧 arc

`(起点) arc (起始角:终止角:半径)` 从当前点沿逆时针画圆弧（TikZ 角度、Y 向上），
以折线采样近似曲线（约 24 段），通常用于角度标注/扇形：

```tikz
% 半径为 0.5 单位、从 0° 扫到 60° 的弧（圆心在 (0,0)）
\draw[orange, thick] (0.5,0) arc (0:60:0.5);
% 反向角度的弧
\draw[blue] (3.5,0) arc (180:143.13:0.5);
```

> 注意：`arc` 需要前一坐标作为起点（当前点）。单独用 `arc` 而没有前置 `(x,y)` 会退化。
> 若圆弧需精确 SVG 大弧语义，可改用贝塞尔近似替代；本近似适用于角度标注等常见场景。

### 7.5 圆与矩形

```tikz
\fill[orange!50] (-2,0) circle (2pt);       % 实心小圆点
\draw[blue] (3,0) circle (1);               % 圆，半径 1 单位
\draw[red, dashed] (6,0) circle (1.5);      % 虚线圆
\filldraw[red!70!black] (0,-3) circle (3pt);
\draw[fill=blue!20] (2,-4) rectangle (5,-2.5);   % 填充矩形
\draw[green, rounded corners=6pt] (7,-2) rectangle (10,-4);  % 圆角矩形
```

### 7.6 函数曲线 plot

`plot (\x,{表达式})`，用 `domain=a:b` 指定 x 范围（默认 `-2:2`），
采样 90 点。支持表达式内的四则、函数、\x 变量。**推荐每条曲线单独一张图、
并配一张网格 + 坐标轴作参照**（比例更好看，也方便读值）：

**抛物线 y=x^2：**

```tikz
\draw[very thin, gray!25] (-2,-0.5) grid (2,4.5);
\draw[thick,->] (-2,0) -- (2,0) node[below] {$x$};
\draw[domain=-2:2, blue, thick] plot (\x,{\x*\x});
```

**正弦 sin(\x)：**

```tikz
\draw[very thin, gray!25] (-3.5,-1.5) grid (3.5,1.5);
\draw[thick,->] (-3.5,0) -- (3.5,0) node[below] {$x$};
\draw[domain=-3:3, red, thick] plot (\x,{sin(\x)});
```

**反比例 y=1/\x（两段分别画在 x<0 与 x>0，避免 x=0 附近爆炸）：**

```tikz
\draw[very thin, gray!25] (-4.5,-3.5) grid (4.5,3.5);
\draw[thick,->] (-4.5,0) -- (4.5,0) node[below] {$x$};
\draw[thick,->] (0,-3.5) -- (0,3.5) node[left] {$y$};
\draw[domain=-4:-0.5, purple, thick] plot (\x,{1/\x});
\draw[domain=0.5:4, purple, thick] plot (\x,{1/\x});
```

> 注：`r` 弧度标记会被识别并忽略，表达式仍按 TikZ 角度/弧度语义求值。

### 7.7 网格 + 曲线 + 采样点（函数图标准样式）

```tikz
\draw[very thin, gray!30] (-1,-1) grid (4,4);
\draw[domain=-1:4, blue, thick] plot (\x,{0.5*\x*\x - \x + 1});
\foreach \x in {0,1,2,3} { \fill[red] (\x,{0.5*\x*\x - \x + 1}) circle (2pt); };
```

---

## 8. 网格 grid（重要）

### 8.1 语义：两个坐标是对角端点

**这是全站最重要的约定**。`\(x1,y1) grid (x2,y2)` 的两个坐标是网格矩形的
**左下角与右上角**（顺序可颠倒），网格线画在整数坐标（默认 `step=1`）处：

```tikz
\draw[gray!40] (-0.5,-0.5) grid (4.5,3.5);
```

上面的网格从 `(-0.5,-0.5)` 铺到 `(4.5,3.5)`，横线画在 y=-0…3（5 条）、
竖线画在 x=0…4（5 条），与坐标轴 / 刻度完全对齐。

### 8.2 与坐标轴对齐的标准骨架

**网格必须与外面的坐标轴使用同一组边界坐标**，否则会产生视觉错位：

```tikz
\begin{tikzpicture}[scale=0.8]
  \draw[very thin, gray!25] (-4.5,-3.5) grid (4.5,3.5);
  \draw[thick, ->] (-4.5,0) -- (4.5,0) node[below] {$x$};
  \draw[thick, ->] (0,-3.5) -- (0,3.5) node[left] {$y$};
\end{tikzpicture}
```

### 8.3 指定步长 step

`step=N` 控制网格线间隔（默认 1；支持小数）：

```tikz
\draw[step=0.5, gray!40] (0,0) grid (2,1);     % 每半格一条线
\draw[step=1, gray!25] (-1,-1) grid (3,3);     % 每格一条（默认即此）
```

### 8.4 填充网格

`\fill[色] ... grid` 会先铺一张与网格同大的填充矩形，再叠网格线（等效于 TikZ"逐格填充"）：

```tikz
\fill[blue!20!white] (0,0) grid (3,2);         % 淡蓝打底 + 格线
\draw (4,0) grid (7,2);                        % 普通网格
```

### 8.5 非整数边界示例（Math 系列真实写法）

```tikz
\draw[very thin, gray!25] (-3,-1) grid (4,3);      % x从-3到4、y从-1到3
\draw[very thin, gray!25] (-2.0,-1.5) grid (3.5,4.5);
\draw[very thin, gray!25] (-0.5,-0.5) grid (4.5,4.5);
```

---

## 9. foreach 循环

```text
\foreach \x in {0,1,2,3} { \fill (\x,0) circle (1pt); }
\foreach \y in {1,2,...,4} { \draw (0,\y) -- (2,\y); }
```

- 列表：`{a,b,c}` 或 `{a,b,...,z}`（第三项给出步长，如 `{1,3,...,9}` 步长 2）。
- 循环体内可叠多条语句，用分号分隔。
- 循环变量可用于坐标、node 文本（数学 `$\x$`）、`\pgfmathsetmacro`。

### 9.1 基础用法

```tikz
\foreach \x in {0,1,2,3,4} { \fill[red] (\x,0) circle (2pt); };
\foreach \y in {0,1,...,3} { \fill[blue] (0,\y) circle (2pt); };
```

### 9.2 带步长的列表

```tikz
\foreach \x in {0,0.5,...,3} {
  \fill[orange] (\x,0) circle (1.2pt);
  \node[below, font=\tiny] at (\x,0) {\x};
};
```

### 9.3 二维栅格（嵌套 foreach）

```tikz
\foreach \x in {0,1,2,3} {
  \foreach \y in {0,1,2,3} {
    \fill (\x,\y) circle (2pt);
  };
};
```

### 9.4 交互网格（颜色随位置变化）

```tikz
\foreach \x in {0,1,2,3,4} {
  \foreach \y in {0,1,2,3} {
    \fill[green!50!black] (\x,\y) circle (1.8pt);
  };
};
```

### 9.5 foreach 的必踩坑（务必遵守）

1. **foreach 之后若紧跟另一条语句**，请在循环体 `}` 之后补一个分号：

   ```text
   \foreach \x in {0,1,2} { \fill (\x,0) circle (2pt); };
   \draw (-1,0) -- (3,0);
   ```

   否则后面的语句会被 foreach 的解析**吞掉**（实测：缺分号时，紧跟在循环体后的
   `\draw` 等命令会整段静默消失，不报错也不渲染）。

2. **嵌套 foreach 的每个循环体都要加分号**（内层 `};`、外层再 `};`），
   原因同第 1 条：内外层共用解析器。

---

## 10. pgfmathsetmacro 计算宏

`\pgfmathsetmacro{\name}{expr}` 做数值计算并存成变量，供坐标 / 文本复用。
最常用于 foreach 循环体内，循环体之外也可以独立使用：

```text
\foreach \x in {0,0.5,...,3} {
  \pgfmathsetmacro{\y}{0.25*\x*\x}
  \draw[fill=blue!12] (\x,0) rectangle (\x+0.5,\y);
}
```

### 10.1 支持的操作

`+ - * / 幂(^) cos sin abs sqrt exp ln log deg`。
变量在 foreach 内外均可用；嵌套 foreach 内同样可用。

### 10.2 画柱状图 / 条形图

```tikz
\foreach \x in {1,2,...,6} {
  \pgfmathsetmacro{\h}{\x*0.6}
  \draw[fill=teal!30] (\x-0.4,0) rectangle (\x+0.4,\h);
  \node[below, font=\tiny] at (\x,0) {\x};
};
```

### 10.3 极坐标放射图（foreach + 计算）

```tikz
\foreach \a in {0,30,...,330} {
  \draw[red!80] (0,0) -- (\a:2.4);
  \fill[orange] (\a:2.4) circle (2pt);
};
\fill[red] (0,0) circle (3pt);
```

---

## 11. 综合实例

### 11.1 坐标系、直线、点、网格的完整图

```tikz
\begin{document}
\begin{tikzpicture}[scale=0.9]
  \draw[very thin, gray!30] (-4.5,-3.5) grid (4.5,3.5);
  \draw[thick, ->] (-4.5,0) -- (4.5,0) node[below] {$x$};
  \draw[thick, ->] (0,-3.5) -- (0,3.5) node[left] {$y$};
  \node[below left] at (0,0) {$0$};
  \draw[blue, domain=-2:2, thick] plot (\x,{2*\x+1});
  \filldraw[blue] (1,3) circle (2.5pt) node[above right] {$y=2x+1$};
  \filldraw[red] (-1,-1) circle (2.5pt) node[below] {$(-1,-1)$};
\end{tikzpicture}
\end{document}
```

### 11.2 foreach + pgfmathsetmacro + node + plot 组合

```tikz
\begin{document}
\begin{tikzpicture}[scale=1]
  \draw[gray!40] (-0.5,-0.5) grid (4.5,3.5);
  \draw[->, thick] (-1,0) -- (5,0) node[below] {$x$};
  \draw[->, thick] (0,-1) -- (0,4) node[left] {$y$};
  \draw[domain=0:4.5, thick, blue] plot (\x,{0.9 + 0.55*sin(\x*60)});
  \foreach \i in {0,1,...,4} { \fill[red!70] (\i,0) circle (2pt); \node[above, font=\tiny] at (\i,0) {$\i$}; };
  \draw[orange, dashed] (0,0) -- (60:3);
  \node[circle, fill=orange!30, draw=black!60, inner sep=2.5pt] at (60:3) {};
  \node[font=\scriptsize, blue] at (2.5,3.6) {混合 $\frac12$ 与 $\sqrt{2}$};
\end{tikzpicture}
\end{document}
```

### 11.3 流程图

```tikz
\node[rectangle, draw=black, rounded corners=4pt] (start) at (0,0) {开始};
\node[rectangle, draw=black, rounded corners=4pt] (q) at (3,0) {是否满足？};
\node[rectangle, draw=green, rounded corners=4pt] (y) at (5,1) {是};
\node[rectangle, draw=red, rounded corners=4pt] (n) at (5,-1) {否};
\node[rectangle, draw=black, rounded corners=4pt] (end) at (8,0) {结束};
\draw[->] (start) -- (q);
\draw[->] (q) -- (y);
\draw[->] (q) -- (n);
\draw[->, dashed] (y) -| (end);
\draw[->, dashed] (n) -- (5,-2) -- (8,-2) -- (8,0);
```

### 11.4 动态向量图（带箭头 + 命名坐标）

```tikz
\coordinate (o) at (0,0);
\coordinate (p) at (3,2);
\draw[->, thick, blue] (o) -- (p) node[midway, above] {$\vec{v}$};
\draw[->, thick, orange] (p) -- (5,1) node[midway, above right] {$\vec{w}$};
\draw[->, thick, red, dashed] (o) -- (5,1) node[pos=0.6, below] {$\vec{v}+\vec{w}$};
\foreach \pt in {o,p} { \fill (\pt) circle (2.5pt); };
\node[below left] at (o) {$O$};
```

---

## 12. 兼容红线（写作时务必避免）

1. 不要写没有颜色的 `draw`——请写 `draw=<色>`。
2. foreach 后紧跟语句时，循环体 `}` 后补 `;`；嵌套 foreach 时内外层循环体都要加分号（§9.5）。
3. 嵌套 foreach 可用，但务必给内层与整体循环体都补上分号。
4. 不要在 node 文本里写裸 `%`（要用 `\%`）。
5. `\begin{scope}[xshift=...]`、`rotate=...`、`xscale/yscale` 与 `shift={(x,y)}` 均已支持；旋转矩形会输出真实旋转 polygon。
6. 不要写 `\usetikzlibrary`（会被忽略，缺库图形不渲染）。
7. 超长内联公式受 1000px 上限约束；长公式可拆成多节点或用 `font=\small`。
8. 节点文本尽量用英文/数学；中文可渲染但字体依赖主题（推荐保持 Math 站既有英文习惯）。

---

## 附：常见问题速查

| 现象 | 原因 | 处理 |
|------|------|------|
| 整块降级成源码 + 红字错误 | 用了不支持的命令/语法 | 对照 §1–§10 改写 |
| 网格与坐标轴错位 | 网格边界与轴边界坐标不一致，或想用"列/行数"语义 | 都用角端点坐标，见 §8.2 |
| 节点文本贼大 | 长内联公式 | 拆分数/用 `font=\small`，§5.3 |
| 小圆点被撑大 | inner sep 默认偏大 | `inner sep=0pt` 或 `2.5pt`，§4.4 |
| foreach 后面的线不见了 | 循环体 `}` 后缺分号 | 补 `;`，§9.5 |
| 中文 node 不渲染 | 主题字体不含 CJK | 改用英文/数学，§12.8 |
