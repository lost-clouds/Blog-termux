/**
 * @module tikz/constants
 * @description TikZ→SVG 渲染引擎的常量与表：单位换算、颜色调色板、字号、正则。
 * @requires none
 */

'use strict';

// 视图坐标 → SVG 坐标的换算系数（一个 tikz 单位对应的像素）
export const PX_PER_UNIT = 32;

// TikZ 颜色名 → hex（基础调色板）
export const COLOR_MAP = {
    black: '#000000',
    white: '#ffffff',
    gray: '#9e9e9e',
    grey: '#9e9e9e',
    red: '#e53935',
    green: '#43a047',
    blue: '#1e88e5',
    orange: '#fb8c00',
    purple: '#8e24aa',
    brown: '#6d4c41',
    yellow: '#fdd835',
    cyan: '#00acc1',
    teal: '#00897b',
    pink: '#ec407a',
    violet: '#5e35b1',
    olive: '#7cb342',
    lime: '#c0ca33',
    magenta: '#d81b60',
    darkgray: '#616161',
    lightgray: '#bdbdbd',
};

// 颜色解析失败时的默认描边色（SVG 变量，自动适配深浅主题）
export const DEFAULT_STROKE = 'var(--text-primary, #1a1a2e)';
// 默认节点填充色（浅灰，适配深浅主题）
export const DEFAULT_NODE_FILL = 'rgba(120,120,120,0.08)';

// 常用但我方无法表达时长的忽略命令（安全跳过）
export const IGNORE_COMMANDS = { usetikzlibrary: true, pgfkeys: true, tikzset: true, scope: true };

// 节点文本中的数学片段分隔（$$\$$...\$$ 或 $...$ 或 \(...\)）
// 注意：KaTeX.renderToString 只接受**去掉分隔符的裸 LaTeX**，因此渲染前
// 必须用 _mathSplit 把整段文本切成“纯文本 / 数学”片段，再逐个渲染。
export const MATH_RUN_RE = /\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\([\s\S]*?\\\)/g;
export const MATH_SPLIT = /\$|\\\(/;

// TikZ 字号 → px（用于 font=small 等选项）
export const FONT_SIZES = {
    tiny: 10,
    scriptsize: 11,
    footnotesize: 12,
    small: 13,
    normalsize: 14,
    large: 17,
    Large: 20,
    LARGE: 24,
    huge: 28,
    Huge: 32,
};
