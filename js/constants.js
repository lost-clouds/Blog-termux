/* ============================================================
   constants.js —— 全局路径常量（API + 静态资源）
   ────────────────────────────────────────────────────────────
   用法：import { API, LIBS } from './constants.js'
   ============================================================ */

'use strict';

const API = {
    DASHBOARD:      '/api/dashboard',
    MARKDOWN_LIST:  '/api/md/',
    MARKDOWN_FILE:  '/Markdown/',
    IMAGES_LIST:    '/api/images/',
    HTML_LIST:      '/api/html/',
    IMAGE_INDEX:    '/Image/index.json',
    MARKDOWN_INDEX: '/Markdown/index.json',
    HTML_INDEX:     '/Html/index.json',
    CONFIG:         '/config.json',
};

const LIBS = {
    MARKED:           'lib/marked.min.js',
    KATEX_CSS:        'lib/katex.min.css',
    KATEX_JS:         'lib/katex.min.js',
    KATEX_AUTORENDER: 'lib/auto-render.min.js',
    GITHUB_MD_CSS:    'lib/github-markdown.min.css',
};

export { API, LIBS };
