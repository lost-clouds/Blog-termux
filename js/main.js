/* ============================================================
   main.js —— ES Module 入口
   ────────────────────────────────────────────────────────────
   按依赖顺序导入所有模块，触发初始化。
   标记为 module 后脚本自动延迟执行（DOM 就绪后运行）。
   ============================================================ */
import './theme.js';
import './utils.js';
import './lightbox.js';
import './dashboard.js';
import './navigation.js';
import './md-viewer.js';
import './blog.js';
import './gallery.js';
// lib/*.js 通过常规 <script> 标签加载，提供全局 marked / KaTeX
// app.js 自执行初始化，DOM ready 后自动启动
import './app.js';
