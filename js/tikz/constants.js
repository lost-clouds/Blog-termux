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
    indigo: '#3f51b5',
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
export const IGNORE_COMMANDS = { usetikzlibrary: true, pgfkeys: true, tikzset: true };

// 数学分隔符的识别与切分统一放在 tikz/text.js 的 mathSplit() 中实现。
// 这里刻意不再导出“裸正则”：正则无法同时正确处理以下三种情况——
//   1) `\\` 表示节点内换行，不能被误判为行内数学起点 `\(`；
//   2) `\$` 表示字面美元符，不应开启数学模式；
//   3) `$$...$$`、`$...$`、`\(...\)` 三种数学片段共存。
// 因此采用显式扫描器，避免正则状态污染与跨调用 lastIndex 副作用。

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
