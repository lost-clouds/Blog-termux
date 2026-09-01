/**
 * @module constants
 * @description 全局路径常量（API + 静态资源）
 * @requires none
 *
 * 用法：import { API, LIBS } from './constants.js'
 */

'use strict';

const API = {
    DASHBOARD: '/api/dashboard',
    MARKDOWN_LIST: '/api/md/',
    MARKDOWN_FILE: '/Markdown/',
    IMAGES_LIST: '/api/images/',
    HTML_LIST: '/api/html/',
    IMAGE_INDEX: '/Image/index.json',
    MARKDOWN_INDEX: '/Markdown/index.json',
    HTML_INDEX: '/Html/index.json',
    CONFIG: '/config.json',
};

// 运行时按需加载的库（均无 ?v= 查询串，须与 sw.js SHELL 键一致）。
// 注：marked.min.js（index.html 全局 <script>）、katex.min.css、github-markdown.min.css（<link>）
// 均由 index.html 静态加载，不在此列。
const LIBS = {
    KATEX_JS: 'lib/katex.min.js',
    KATEX_AUTORENDER: 'lib/auto-render.min.js',
    MERMAID_JS: 'lib/mermaid.min.js',
};

export { API, LIBS };
