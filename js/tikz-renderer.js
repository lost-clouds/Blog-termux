/**
 * @module tikz-renderer
 * @description TikZ → SVG 渲染引擎（入口）。逻辑已拆分为 js/tikz/* 若干模块，
 *              本文件保持与旧公共 API 完全一致，仅负责转发：
 *                  import { prepareTikzBlocks, renderTikz } from './tikz-renderer.js'
 *              依赖注入后台使用。mermaid 之外的三反引号 tikz 代码块渲染。
 *
 * 支持的子集（覆盖 Blog-termux Math 系列的常用绘图）：
 *   - \begin{document} / \begin{tikzpicture} / \end{...} 包裹（自动剥离）
 *   - \node[(opts)] (name) at (x,y) {...};
 *   - \draw / \fill / \filldraw[(opts)] 路径：
 *       -- 直线、-- cycle、-> / <- 箭头、arc (a:b:r)、.. controls (c) [and (c)] ..、
 *       circle (r)、rectangle (b)、grid (c,r)、plot (\x,{f(\x)})（domain=a:b）
 *   - \coordinate (name) at (x,y);
 *   - \foreach \x in {list} { ... }（展开循环体）
 *   - \pgfmathsetmacro{\name}{expr}（+ - * / 幂、cos/sin/abs/sqrt）
 *   - 极坐标 (a:r)；节点锚点 above/below/left/right；颜色混合 red!40!blue
 *   - 节点文本中的 $...$ 数学：自动调用 KaTeX 渲染（未加载时降级为纯文本）
 *
 * 不支持的语法整体降级：保留源码并显示错误提示（与 Mermaid 一致）。
 * @requires js/tikz/render.js
 */
'use strict';

export { prepareTikzBlocks, renderTikz } from './tikz/render.js';