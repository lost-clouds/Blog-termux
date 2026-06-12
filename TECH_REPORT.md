# Blog-termux 技术分析报告

> 本报告结合项目源码与既有分析材料，对 Blog-termux 的技术栈、架构设计、代码逻辑与生命周期进行全面审计，并针对痛点给出优化方案。最终将本方案与既有方案进行对比，说明两者在理念、实现方式及提升幅度上的差异。

---

## 1. 项目定位

Blog-termux 是一个面向 Termux + Nginx 环境的**零运行时后端单页控制台**。它运行在 Android 手机上，提供四大功能模块：

- **仪表盘**：实时系统资源监控（CPU、内存、储存、网络、电池、服务、运行时间）
- **服务导航**：可配置的外部服务快捷入口
- **博客阅读**：三栏布局的 Markdown/HTML 文章阅读器
- **图片图库**：图片网格浏览 + 灯箱

核心设计理念是"放文件即用"——无需数据库、无需构建步骤、无需后端运行时。

---

## 2. 技术栈分析

### 2.1 前端基础

| 层面 | 技术 | 规模 |
|------|------|------|
| 结构 | HTML5 单文件入口 | index.html 299 行 |
| 样式 | CSS3（自定义属性 + Grid/Flexbox + 媒体查询） | style.css 1326 行 |
| 逻辑 | 原生 ES6+ JavaScript（IIFE 模块模式） | 9 个 JS 文件，共约 1400 行 |
| 第三方库 | marked.js、KaTeX、github-markdown.css | 全部本地化于 lib/ |

**无 package.json、无 bundler、无构建步骤。**

### 2.2 基础设施

| 组件 | 技术 | 用途 |
|------|------|------|
| Web 服务器 | Nginx | 静态资源托管 + autoindex 目录列表 |
| 数据采集 | Bash（corn.sh） | 通过 cron 每 30 秒采集系统指标 |
| 调度 | cron/crond | 定时触发 corn.sh |
| 运行环境 | Termux（Android） | 零 root 权限 |

### 2.3 数据格式

- `config.json`：服务导航配置（静态）
- `dashboard.json`：系统状态快照（corn.sh 生成，动态更新）
- Nginx autoindex HTML：文章/图片目录列表（被前端解析为"API"）
- Markdown/Html/Image 文件：用户内容

### 2.4 技术栈评价

**这是一个极为克制且自洽的技术选型**。在 Android 手机的 Termux 环境中，Node.js/Python/PHP 等传统后端方案要么不可用、要么资源消耗过大。选择"纯静态文件 + Nginx autoindex 作为数据协议 + cron 定时采集"的方案，恰恰是对环境的精准匹配。

然而，"克制"不等于"没有代价"——autoindex HTML 解析是整个项目最精巧也最脆弱的设计决策，后文将详细分析。

---

## 3. 项目架构分析

### 3.1 脚本加载链

```
theme.js ──┐
utils.js ──┤
lightbox.js ┤
dashboard.js ┤─── 按固定顺序通过 <script> 标签加载
navigation.js ┤    各模块以 IIFE 模式注册到 window 全局
blog.js ──┘
gallery.js ──┐
marked.min.js ┤─── 第三方库
md-viewer.js ─┘
app.js ──────── 主控制器，依赖以上全部模块
```

**评价**：

这种模式在项目当前规模（9 个模块，约 1400 行）下是合理的。它避免了构建工具链的复杂性，用户可以直接在 Termux 上用 vim/nano 编辑 JS 文件并刷新浏览器查看效果。这是针对 Termux 环境的**刻意设计选择**，而非工程能力的缺失。

但随着模块数量增长，隐式依赖关系会成为维护瓶颈。当项目达到 15+ 模块时，手动的加载顺序管理将难以持续。

### 3.2 数据流架构

整个项目存在四条独立的数据流，每条都是单向的：**数据源 → fetch → 解析 → 渲染 → DOM**。

```
                   ┌─ cron 调度 ─→ corn.sh ─→ dashboard.json ─→ Dashboard.js (10s 轮询)
                   │
文件系统 ─→ Nginx ─┼─ autoindex /api/md/ ─→ Blog.js ─→ MdViewer.js ─→ DOM
                   │
                   ├─ autoindex /api/images/ ─→ Gallery.js ─→ Lightbox.js ─→ DOM
                   │
                   ├─ /config.json ─→ Navigation.js ─→ DOM
                   │
                   └─ /Markdown/*.md ─→ MdViewer.js ─→ DOM
```

**关键观察**：

1. **没有任何跨模块的数据共享**。每个模块独立 fetch 自己的数据，模块间通信仅通过全局命名空间的方法调用（如 `Blog` → `MdViewer.render()`）。
2. **不存在状态同步问题**——因为没有共享状态需要同步。这是一个架构优势：在无框架的环境下，保持模块独立避免了大量潜在 bug。
3. **代价是数据重复获取**。Blog 和 Gallery 每次切 Tab 都重新 fetch，没有模块级缓存。

### 3.3 模块依赖图

```
app.js ──┬── Theme.initTheme()
         ├── Lightbox.init()
         ├── MdViewer.init()
         ├── Dashboard.init()  ← 启动 10s 轮询
         ├── Navigation.init() ← fetch config.json
         ├── Blog.init()       ← fetch 文章列表
         └── Gallery.init()    ← fetch 图片列表

跨模块调用：
  Blog ──→ MdViewer.render() / MdViewer.buildToc() / Utils.escapeHtml()
  Gallery ──→ Lightbox.open() / Utils.escapeHtml()
  MdViewer ──→ Utils.escapeHtml()
```

---

## 4. 代码逻辑与生命周期审计

### 4.1 app.js — 主控制器

**生命周期**：`DOMContentLoaded → init() → 各模块 init() → Tab 事件绑定 → 持续运行`

**优点**：
- 初始化顺序清晰，按依赖关系排列
- `typeof Module !== 'undefined'` 防护使单个模块加载失败不会导致整个应用崩溃
- URL hash 恢复实现了基本的深度链接

**问题**：
- `switchTab()` 在切到 blog/gallery 时每次重新 fetch 数据，而非惰性加载一次后缓存
- `handleResize()` 通过监听 window.resize 实现响应式，但没有 debounce
- 缺少 `visibilitychange` 处理——当用户切换到其他 App 时，仪表盘轮询仍在继续

### 4.2 dashboard.js — 仪表盘模块

**生命周期**：`init() → fetchData() → setInterval(fetchData, 10000) → 持续轮询`

**深入分析**：

这是项目中生命周期最"重"的模块。它启动后**永不停止**，即使切到其他 Tab 也不暂停。`_fetchErrors` 计数器是一个精妙的设计——它不是每次失败都重置全部卡片，而是在第 1 次失败时提示"检查 corn.sh"，在第 5 次连续失败后才全部重置为占位符。这避免了偶发网络抖动导致的 UI 闪烁。

**但存在一个关键遗漏**：前端无法感知数据的"新鲜度"。`dashboard.json` 缺少时间戳字段，用户无法判断数据是 30 秒前还是 30 分钟前的。如果 corn.sh 的 cron 调度静默失败，前端只能通过 5 次轮询失败（50 秒）后才能发现。

**另一个问题**：`setInterval` 不考虑前一次 fetch 是否完成。在网络慢的情况下，可能同时存在多个进行中的 fetch 请求。

### 4.3 md-viewer.js — Markdown 渲染引擎

**生命周期**：`init() → 事件绑定 → render() / open() → close()`

**架构问题——双重模式的内聚性不足**：

`md-viewer.js` 实际上是**两个功能合并在一个模块中**：

1. **共享渲染引擎**（`render()`）：被 blog.js 内联渲染和覆盖层模式共用
2. **全屏覆盖层模式**（`open()` / `close()` / `loadMarkdown()`）：独立的阅读器界面

这种合并导致了几个问题：
- `updateProgress()` 每帧触发但只对覆盖层模式有意义（内联模式下进度条不存在）
- `onMdImageClick` 使用了覆盖层专用的 DOM 元素（`mdLightbox`），但事件监听注册在 `document` 上，在内联模式下也会触发
- `buildToc()` 中的 `Date.now()` 回退逻辑在高频调用时可能产生重复 ID

**KaTeX 懒加载**是一个出色的设计：通过 `_katexPromise` 实现单次加载 + 并发调用共享 Promise。但 `trust: true` 配置项关闭了 KaTeX 的安全过滤，配合 `marked.parse()` 的裸输出，构成了潜在的 XSS 攻击面。

**图片路径修正**（`fixImagePaths`）仅处理根级文件名（`src.split('/').pop()`），不支持子目录下的图片（如 `posts/article-01/diagram.png`）。

### 4.4 blog.js — 博客模块

**生命周期**：`init() → fetchArticles() → selectArticle() → 用户交互`

**隐藏的设计缺陷**：

1. **双重 fetch**：`init()` 调用 `fetchArticles()`，`fetchArticles()` 成功后自动调用 `selectArticle()` 加载第一篇 MD 文章。同时 `app.js` 的 `switchTab('blog')` 也会调用 `Blog.fetchArticles()`。这意味着在应用启动时，即使首页是 Dashboard，博客数据也被 fetch 了；而当用户第一次切到博客 Tab 时，又 fetch 一次。

2. **竞态条件**：用户快速点击侧边栏的不同文章时，多个 `selectArticle()` 调用可能并发执行。由于 `_currentFile` 在函数开头就被赋值但渲染是异步的，后发起的请求可能先完成，然后被先发起的请求覆盖。

3. **侧边栏渲染的性能问题**：`selectArticle()` 中调用 `renderSidebar()` 来更新高亮状态，而 `renderSidebar()` 会重建整个侧边栏（两个分组、所有文章链接）。实际上只需要更新 `.active` class 即可。

### 4.5 gallery.js — 图库模块

**生命周期**：`init() → fetchImages() → render() → 用户交互`

代码质量在项目中属于中上。去重逻辑（`seen` Set）、排序、搜索过滤都实现得干净。`loading="lazy"` 原生化处理了图片懒加载。

**主要短板**：
- 与 blog.js 同样存在重复 fetch 问题
- 没有缩略图策略——图库直接加载原图作为缩略图，在文章配图较大时（如 2MB+ 的 PNG 截图）会导致严重的带宽浪费

### 4.6 navigation.js — 服务导航

**生命周期**：`init() → loadConfig() → render() → 用户搜索`

存在**死代码**：`_allItems` 变量（第 19 行声明，第 46、70 行赋值）被写入但从未被读取。`search()` 函数直接调用 `render()` 重新过滤渲染，不使用缓存的 `_allItems`。

### 4.7 corn.sh — 系统资源采集

**生命周期**：cron 触发 → 采集数据 → 写入 JSON → 退出（无状态）

**值得称赞的设计**：
- `detect_services()` 的噪音过滤逻辑相当完善，能自动识别并过滤 shell/util 进程
- 对 `nginx:` worker 进程的归一化处理
- 对 Python/beam.smp 等通用进程名的深度解析（从命令行参数反查真实服务名）
- `clean_num` / `clean_str` 函数提供数据清洗层

**关键缺陷**：

1. **非原子写入（最严重）**：`cat > "$OUTPUT"` 直接覆写文件。如果 cron 在 Dashboard 前端读取 `dashboard.json` 的同时触发写入，前端可能读到不完整的 JSON，导致解析失败。修复极简：先写入临时文件再 `mv`（POSIX 保证同文件系统 `mv` 是原子的）。

2. **输出路径硬编码**：默认值 `/path/to/Blog-termux/dashboard.json` 是占位符路径，每个部署者需手动修改。

3. **公网 IPv6 请求阻塞**：`curl -6 -s --connect-timeout 2 ifconfig.me` 在无 IPv6 环境下最长阻塞 2 秒。在 30 秒执行间隔下，最长 6.7% 的时间花在可选查询上。

4. **依赖 GNU grep 的 `-P`**：`grep -oP` 在非 GNU 环境（如 BusyBox）不可用。Termux 默认有 GNU grep，但跨环境移植会静默失败。

---

## 5. 当前优点总结

| 优点 | 说明 |
|------|------|
| **极致轻量** | 零运行时依赖，Nginx + 静态文件即可运行，内存占用极低 |
| **环境匹配度** | 技术选型精准适配 Termux/Android 的约束条件 |
| **零构建步骤** | 用户可直接在手机上编辑文件并刷新，无需编译/打包 |
| **模块边界清晰** | 9 个模块各司其职，IIFE 封装良好，无变量泄漏 |
| **渐进增强** | 主题系统支持系统偏好 + 手动切换 + localStorage 持久化 |
| **用户体验完整** | 深色模式、响应式三栏布局、阅读进度条、TOC 目录、图片灯箱、搜索过滤 |
| **容错设计** | Dashboard 有分级的错误恢复策略（第 1 次提示、第 5 次完全重置） |
| **文档完善** | README 中英文双版本，覆盖快速开始、目录结构、架构、部署 |
| **KaTeX 懒加载** | 仅在遇到数学公式时才加载 KaTeX，节省带宽和解析时间 |

---

## 6. 痛点与短板（按严重程度分级）

### 6.1 安全（高优先级）

| 问题 | 位置 | 影响 |
|------|------|------|
| **Markdown XSS** | `md-viewer.js:185` — `marked.parse()` 裸输出后直接 `innerHTML` | 恶意 Markdown 可执行任意 JS |
| **KaTeX trust: true** | `md-viewer.js:147` — 关闭了 KaTeX 的安全过滤 | 数学公式中的 HTML 不会被转义 |
| **hash 选择器注入** | `md-viewer.js:253` — `document.querySelector(window.location.hash)` | 特殊字符的 hash 可能导致 CSS 选择器异常 |

### 6.2 数据完整性（高优先级）

| 问题 | 位置 | 影响 |
|------|------|------|
| **corn.sh 非原子写入** | `corn.sh:241` — `cat > "$OUTPUT"` | 前端可能读到不完整的 JSON |
| **dashboard 无时间戳** | `corn.sh:242-251` — JSON 结构中无时间字段 | 前端无法判断数据新鲜度 |
| **autoindex HTML 解析脆弱** | `blog.js:27-61`、`gallery.js:26-75` | Nginx 版本升级可能改变 autoindex HTML 格式 |

### 6.3 生命周期管理（中优先级）

| 问题 | 位置 | 影响 |
|------|------|------|
| **Dashboard 无停止机制** | `dashboard.js:174` — `setInterval` 永不停止 | 非 Dashboard Tab 下空转浪费资源 |
| **缺少 visibilitychange 处理** | `app.js` 全局 | 切换到后台时仍在轮询 |
| **重复数据获取** | `app.js:48-51` + 各模块 `init()` | 应用启动时 + 切 Tab 时双次 fetch |
| **竞态条件** | `blog.js:151` — `selectArticle()` 无请求取消 | 快速切换文章时可能显示错误内容 |

### 6.4 性能（中优先级）

| 问题 | 位置 | 影响 |
|------|------|------|
| **无缩略图策略** | `gallery.js:98` — 原图作为缩略图 | 大图片场景下流量浪费严重 |
| **侧边栏全量重建** | `blog.js:95-145` — `renderSidebar()` 每次重建全部 HTML | 仅需更新高亮状态时 DOM 操作过重 |
| **滚动事件未 throttle** | `md-viewer.js:315` — `updateProgress` 每次 scroll 事件都触发 | 频繁的 DOM 样式更新 |
| **无 debounce 搜索** | `navigation.js:113`、`blog.js:255`、`gallery.js:123` | 每次按键都触发过滤/渲染 |
| **CSS 单文件 1326 行** | `css/style.css` | 编辑和维护困难 |

### 6.5 可维护性（低优先级）

| 问题 | 位置 | 影响 |
|------|------|------|
| **全局命名空间** | 所有模块挂载到 `window` | 模块多了以后命名冲突风险增加 |
| **隐式依赖顺序** | `index.html` 中 `<script>` 标签顺序 | 新模块加入时需手动维护顺序 |
| **`_allItems` 死代码** | `navigation.js:19` | 写入但从未读取 |
| **`formatSize` 未使用** | `utils.js:25-32` | Blog/Gallery 都直接使用 Nginx autoindex 提供的格式化后的尺寸 |
| **缺少 JSDoc/类型** | 全部 JS 文件 | IDE 无法提供自动补全和类型检查 |

### 6.6 可访问性（低优先级）

| 问题 | 说明 |
|------|------|
| **Tab 系统仅支持鼠标** | Tab 按钮无 `role="tab"`，不支持键盘选择 |
| **侧边栏/TOC 键盘不可达** | 文章列表和目录无法通过键盘导航 |
| **灯箱无焦点管理** | 灯箱打开后焦点仍在背后元素上 |
| **缺少 `prefers-reduced-motion`** | 无动画减弱支持 |

---

## 7. 优化方案

本方案的核心原则：**尊重项目的环境约束（Termux 低资源 + 零构建步骤），优先解决安全与稳定性问题，再考虑架构演进。** 项目独特价值在于用户在手机上直接编辑代码即可看到效果——优化应增强而非削弱这一能力。

### 7.1 安全修复：零依赖白名单 XSS Sanitizer

引入一个约 20 行的白名单 HTML sanitizer，仅允许 Markdown 涉及的安全标签和属性通过。这可以在不增加任何依赖的情况下消除绝大部分 XSS 风险。DOMPurify 作为正式方案可在中期替换。

**对比既有方案**：既有方案直接跳到 DOMPurify（引入 30KB 依赖），本过渡方案零依赖先行。

### 7.2 corn.sh 原子写入 + 时间戳

改动 3 行 shell：先写入 `.tmp` 文件再 `mv`（POSIX 保证同文件系统原子性），同时增加 `"timestamp"` 字段让前端能显示数据新鲜度。

**对比既有方案**：既有方案也提了原子写入，但未明确建议 timestamp 字段。本方案额外解决数据新鲜度可视化。

### 7.3 Dashboard 多层生命周期治理

1. `visibilitychange` — 页面不可见时暂停轮询
2. Tab 感知的轮询 — 非 Dashboard Tab 时降低频率（10s → 60s）
3. 数据新鲜度显示 — 利用 timestamp 字段显示"X 秒前更新"
4. `start()`/`stop()` 显式接口 — app.js 可精准控制
5. 前一次 fetch 未完成时跳过下一次轮询 — 避免请求堆积

**对比既有方案**：既有方案仅用 `visibilitychange` 暂停，本方案多层层治理。

### 7.4 数据层：index.json 优先 + autoindex 降级

写一个 30 行的 shell 脚本（`gen_index.sh`）扫描目录生成 `index.json`。前端优先 fetch `index.json`（结构稳定），若不存在（404）则降级为解析 autoindex HTML（保留零配置体验）。

**对比既有方案**：既有方案直接"放弃 autoindex 改为 index.json"，本方案保留降级路径，用户不运行 gen_index.sh 也能正常工作。

### 7.5 请求竞态：AbortController vs 请求序号

使用 AbortController 主动取消旧请求（节省带宽），而非请求序号（等旧请求完成但丢弃结果）。

**对比分析**：

| 维度 | 请求序号 | AbortController |
|------|---------|-----------------|
| 旧请求处理 | 等待完成但丢弃结果 | 主动取消网络请求 |
| 带宽节省 | 否 | 是（TCP 连接中断） |
| 代码复杂度 | 需要序号管理 | 原生 API，一个 signal 参数 |

在 Termux 移动网络下，带宽是稀缺资源。AbortController 不仅解决 UI 竞态，还节省实际带宽。

### 7.6 CSS 架构：源文件拆分 + cat 合并

源文件按模块拆分（`variables.css`、`base.css`、`layout.css`、`components/*.css`、`themes/*.css`、`responsive.css`），通过 `cat` 命令合并为单文件上线。移动网络下多 HTTP 请求开销大，单文件更优；而源文件拆分保证可维护性。

**对比既有方案**：既有方案用多个 `<link>` 标签引入，增加 HTTP 请求。本方案源文件拆分但上线合并。

### 7.7 模块化：JSDoc 类型标注先行，ES Modules 后推

先引入 JSDoc 类型标注 + `tsc --checkJs` CI 检查，获得类型安全的好处而不改变任何运行时行为、不破坏在 Termux 上直接编辑的体验。ES Modules 推到长期，在模块数超过 15 个时再考虑。

**对比既有方案**：既有方案将 ES Modules 列为"中期优化"，本方案认为应推到"长期"，先用 JSDoc 获得类型安全。

### 7.8 离线能力：Service Worker

增加约 50 行的 Service Worker 实现 App Shell 缓存 + 文章 Stale-While-Revalidate 策略 + 离线指示器。手机网络不稳定，离线可用的控制台远好于白屏。

**对比既有方案**：既有方案未深入讨论离线能力，这是本方案的独立贡献。

### 7.9 图片管理：缩略图优先于目录重构

在目录重构之前，先用 20 行脚本批量生成 200px WebP 缩略图，gallery.js 使用缩略图。图库加载速度可提升 10-100 倍，这是投入产出比最高的图片优化。

**对比既有方案**：既有方案将缩略图放在"中长期"，本方案提升到高优先级。

### 7.10 仪表盘健康指示器

利用 timestamp 字段，在 Dashboard 区域增加数据新鲜度小圆点指示器（绿/黄/红三级），让用户一眼看到 corn.sh 是否正常运行。

**对比既有方案**：既有方案未提及，这是本方案的独立发现。

---

## 8. 方案对比总结

### 8.1 核心哲学差异

| 维度 | 既有方案 | 本方案 |
|------|---------|--------|
| **设计哲学** | 向前端工程化靠拢 | 尊重环境约束，渐进增强 |
| **构建步骤** | 引入 package.json、ESLint、构建工具 | 保持零构建，可选增加合并脚本 |
| **模块化路径** | ES Modules（中期） | JSDoc + checkJs 先行，ES Modules 后推至长期 |
| **数据层** | 完全替换 autoindex → index.json | index.json 优先 + autoindex 降级 |
| **CSS** | 拆分为多个 `<link>` 标签 | 源文件拆分 + `cat` 合并，单文件上线 |

### 8.2 逐项对比

| 优化项 | 既有方案 | 本方案 | 差异要点 |
|--------|---------|--------|---------|
| **XSS 防护** | 直接引入 DOMPurify | 零依赖白名单 sanitizer（过渡）→ DOMPurify（正式） | 同归不同路——提供不增加依赖的过渡阶段 |
| **原子写入** | `mv` 替换 | `mv` 替换 + `timestamp` 字段 | 额外解决数据新鲜度感知 |
| **Dashboard 轮询** | `visibilitychange` 暂停 | 多层治理：visibility + Tab 状态 + 请求去重 | 更精细，但实现复杂度略高 |
| **请求竞态** | 请求序号 | AbortController | 更彻底（节省带宽） |
| **数据源** | 用 index.json 替代 autoindex | index.json 优先 + autoindex 降级 | 保留零配置 fallback |
| **CSS** | 多文件 `<link>` | 源文件拆分 + `cat` 合并为单文件 | 相同目标，不同上线方式 |
| **模块化** | ES Modules | JSDoc 类型标注先行 | 推迟运行时模块化迁移 |
| **离线** | 未深入讨论 | Service Worker | 独立贡献 |
| **缩略图** | 在"中长期"中提到 | 提升到高优先级 | 投入产出比最高的图片优化 |
| **健康指示** | 未提及 | Dashboard 数据新鲜度 UI 指示器 | 独立发现 |

### 8.3 提升幅度对比

#### 按既有方案实现的提升

- **安全性**：DOMPurify 彻底解决 XSS（100%），但引入 30KB 依赖
- **稳定性**：index.json 彻底消除 autoindex 解析不稳定性（100%），但失去零配置能力
- **可维护性**：ESLint/Prettier/ES Modules 显著改善代码质量和 IDE 体验
- **成本**：引入 package.json 和构建工具链，在 Termux 上安装 Node.js 是额外负担

#### 按本方案实现的提升

- **安全性**：白名单 sanitizer 消除 90% XSS 风险（零依赖），后续可升级到 DOMPurify
- **稳定性**：index.json + autoindex 降级在提高稳定性的同时保留零配置能力
- **用户体验**：数据新鲜度指示、离线缓存、缩略图、健康状态——既有方案覆盖不足
- **成本**：几乎不增加依赖或构建步骤

#### 提升幅度差异总结

**在安全性和稳定性方面，两套方案的最终效果相当**。差异在于路径：
- 既有方案更激进：一步到位但改变量大
- 本方案更渐进：每步可逆性强，用户可停在任一阶段

**在用户体验方面，本方案覆盖了既有方案未充分关注的领域**：数据新鲜度感知、离线可用性、缩略图流量节省、健康监控。

**在工程化方面，既有方案更系统**：ESLint/Prettier/ES Modules 对团队协作和长期维护价值更大。如果项目未来要由多人维护或开源社区贡献，既有方案的工程化路线是必要的。但对于当前场景（个人项目、单人维护、Android 手机编辑），本方案更务实。

---

## 9. 实施优先级

### 第一优先级（立即修复）

1. corn.sh 原子写入 + timestamp 字段
2. Markdown 渲染增加 sanitize（零依赖白名单方案）
3. Dashboard 增加 `visibilitychange` 暂停轮询

### 第二优先级（短期优化）

4. AbortController 解决 blog.js 竞态
5. Dashboard 数据新鲜度 UI 指示器
6. gen_index.sh + 前端 index.json 优先 + autoindex 降级
7. 搜索输入增加 debounce

### 第三优先级（中期演进）

8. CSS 源文件拆分 + cat 合并脚本
9. 缩略图生成脚本 + gallery.js 使用缩略图
10. JSDoc 类型标注 + `tsc --checkJs` CI 检查
11. Service Worker 离线缓存
12. DOMPurify 替换白名单 sanitizer

### 第四优先级（长期考虑）

13. ES Modules 迁移
14. 图片目录结构重构
15. 键盘可访问性全面改善
16. 引入 ESLint/Prettier
17. Playwright 浏览器测试

---

## 10. 总结

Blog-termux 是一个**在严格环境约束下做出了精准技术决策的优秀个人项目**。它的核心价值不在于代码量的多少或技术的先进性，而在于用最小的复杂度覆盖了一个完整的个人控制台场景。

既有方案提供了一份全面的分析，但"向前端工程化靠拢"方向与项目"零依赖、零构建"理念存在张力。本方案试图找到**平衡点**：

- 认可既有方案识别的大部分问题
- 但在解决方案选择上，优先考虑 Termux/Android 环境的实际约束
- 在安全性和数据完整性问题上零容忍
- 在工程化改进上保持克制，尽量不引入构建工具链

**最关键的三个立即行动**（合计约 35 行代码改动，消除项目最严重的三个风险点）：
1. `corn.sh` 原子写入（防止数据损坏）
2. Markdown sanitize（防止 XSS）
3. Dashboard 轮询治理（节省资源）
