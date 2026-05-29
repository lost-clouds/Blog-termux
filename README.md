# Blog — 个人导航 + 博客控制台

基于 Nginx 的纯静态单页面应用，无需 PHP/Node/Python 等后端运行时。集成了系统仪表盘、服务导航、Markdown 博客阅读器和图片画廊四大功能模块，通过标签页切换，自适应 PC / 平板 / 手机。

## 目录结构

```
Blog/
├── index.html                  # 【唯一入口】单页面应用，标签页切换所有功能
├── config.json                 # 服务导航配置（Homer 替代方案）
├── dashboard.json              # 仪表盘数据（由 corn.sh 定时写入）
├── corn.sh                     # 系统资源采集脚本（crontab 定时执行）
├── favicon.ico                 # 站点图标
│
├── css/
│   └── style.css               # 全站样式（600+ 行，含浅色/深色主题变量）
│
├── js/
│   ├── theme.js                # 主题管理模块
│   ├── utils.js                # 通用工具函数
│   ├── lightbox.js             # 图片灯箱组件
│   ├── dashboard.js            # 系统仪表盘模块
│   ├── navigation.js           # 服务导航模块（Homer 替代）
│   ├── blog.js                 # 博客文章列表模块
│   ├── gallery.js              # 图片画廊模块
│   ├── md-viewer.js            # Markdown 阅读器模块
│   └── app.js                  # 主控制器（引导入口）
│
├── lib/                        # 第三方库（本地，无 CDN 依赖）
│   ├── marked.min.js           #   Markdown → HTML 解析
│   ├── katex.min.js            #   LaTeX 数学公式渲染
│   ├── katex.min.css           #   KaTeX 样式
│   ├── auto-render.min.js      #   KaTeX 自动发现 + 渲染
│   └── github-markdown.min.css #   GitHub 风格 Markdown 样式
│
├── Markdown/                   # 存放 .md 文章，由 nginx autoindex 暴露文件列表
├── Image/                      # 存放图片，由 nginx autoindex 暴露文件列表
│
└── example/
    ├── Blog.conf               # Nginx 配置参考
    ├── homer_config.yml        # 原始 Homer 配置（参考，已转换为 config.json）
    └── homer_index.html        # 原始 Homer 入口（参考，已废弃）
```

## 设计逻辑

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                       index.html                            │
│  ┌─────────┐  ┌──────────────────────────────────────────┐ │
│  │ header  │  │  标签栏（PC 顶部 / 手机底部 fixed）       │ │
│  │ 品牌名  │  │  [仪表盘] [导航] [博客] [图库]           │ │
│  │ 主题按钮│  └──────────────────────────────────────────┘ │
│  └─────────┘                                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  内容区（同时只显示一个 section）                       ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  ││
│  │  │仪表盘    │ │服务导航  │ │博客列表  │ │图片画廊  │  ││
│  │  │CPU/内存  │ │分组卡片  │ │搜索/过滤 │ │网格缩略  │  ││
│  │  │磁盘/时间 │ │点击跳转  │ │点击→MD  │ │点击→灯箱 │  ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────┐                    │
│  │ Markdown 阅读器（全屏覆盖层）        │ ← 点击文章时滑入  │
│  │ [TOC 侧边栏] [进度条] [内容渲染]     │                    │
│  └──────────────────────────────────────┘                    │
│  ┌──────────────────────────────────────┐                    │
│  │ 图片灯箱（全屏覆盖层）               │ ← 点击图片时弹出  │
│  └──────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 脚本加载顺序与依赖链

```
theme.js         无依赖，最先加载，挂载 window.Theme
utils.js         无依赖，挂载 window.Utils / window.downloadFile
lightbox.js      无依赖，挂载 window.Lightbox
dashboard.js     无依赖，直接操作 DOM，挂载 window.Dashboard
navigation.js    依赖 utils.js（escapeHtml），读取 /config.json
blog.js          依赖 utils.js，运行时引用 MdViewer（由用户点击触发）
gallery.js       依赖 utils.js + lightbox.js
marked.min.js    Markdown 解析引擎（window.marked）
md-viewer.js     依赖 marked + utils.js + lightbox.js，挂载 window.MdViewer
app.js           依赖所有以上模块，最后加载，作为引导入口
```

所有模块通过 `<script>` 标签顺序保证依赖关系，不使用 ES modules 或打包工具，浏览器直接解释执行。

### 数据流

```
┌─────────────┐    corn.sh 定时写入    ┌────────────────┐
│ 系统命令     │ ───────────────────→  │ dashboard.json │
│ top/free/df │                       └───────┬────────┘
└─────────────┘                               │ GET /api/dashboard
                                              ↓
┌─────────────┐    nginx autoindex    ┌────────────────┐
│ Markdown/   │ ←─────────────────── │ /api/md/       │
│ Image/      │   生成 HTML 目录列表   │ /api/images/   │
│ Html/       │                       │ /api/html/     │
└─────────────┘                       └───────┬────────┘
                                              │ JS DOMParser 解析
                                              ↓
                                       ┌────────────────┐
                                       │ 前端渲染模块    │
                                       │ blog.js        │
                                       │ gallery.js     │
                                       └────────────────┘
```

- **无后端动态接口**：所有"API"都是 nginx 的 `autoindex` 生成的 HTML 目录列表，前端通过 `DOMParser` 解析出文件列表
- **仪表盘数据**：由 `corn.sh` 采集系统信息写入 `dashboard.json`，前端每 10 秒轮询
- **服务导航**：读取本地 `config.json` 静态文件

## 模块详解

### theme.js — 主题管理

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Theme` |
| 存储键 | `localStorage["app-theme"]` |
| 职责 | 深色/浅色主题切换，状态持久化 |
| 生命周期 | 脚本加载时注册 API → `initTheme()` 应用存储的主题 → 用户点击按钮时 `toggleTheme()` |
| 对外方法 | `initTheme()`, `toggleTheme()`, `applyTheme(theme)`, `getStoredTheme()` |

切换逻辑：`document.body.classList.toggle('dark')` + 更新 `<meta name="theme-color">` + 更新按钮图标（☀️/🌙）。

### utils.js — 工具函数

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Utils` / `window.downloadFile` |
| 职责 | HTML 特殊字符转义、文件大小格式化、Blob 下载 |
| 生命周期 | 脚本加载时注册，各模块按需调用 |
| 对外方法 | `escapeHtml(str)`, `formatSize(bytes)`, `downloadFile(url, name)` |

`escapeHtml` 用于防止 XSS：所有用户可控的文件名在插入 DOM 前都会转义 `& < > "`。`downloadFile` 通过 `fetch → Blob → ObjectURL` 解决跨域 `<a download>` 失效问题。

### lightbox.js — 图片灯箱

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Lightbox` |
| 职责 | 全屏图片预览 |
| 生命周期 | `init()` 绑定全局事件（点击背景/关闭按钮/ESC）→ `open(src, name)` 展示图片 → `close()` 关闭 |
| 对外方法 | `init()`, `open(src, name)`, `close()` |

支持多个调用源（画廊、Markdown 内图片）共享同一个灯箱实例。

### dashboard.js — 系统仪表盘

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Dashboard` |
| 数据源 | `GET /api/dashboard`（每 10 秒轮询） |
| 职责 | 渲染 CPU / 内存 / 磁盘 / 运行时间四张卡片 |
| 生命周期 | `init()` 立即拉取 + 开启 10s 定时器 → `update(data)` 更新进度条和数值 |

期望的 JSON 格式：
```json
{
  "cpu": 23.5,
  "memory": { "used": 2048, "total": 4096, "unit": "MB" },
  "disk": { "used": 32.5, "total": 128, "unit": "GB" },
  "uptime": "3 days, 2 hours"
}
```

失败时显示 `--` 占位符，不阻塞其他模块。

### navigation.js — 服务导航

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Navigation` |
| 数据源 | `GET /config.json` |
| 职责 | 替代原 Homer iframe，原生渲染服务分组卡片 |
| 生命周期 | `init()` 加载配置 → `render()` 按分组渲染 → 搜索框 `input` 事件触发过滤 |

`config.json` 结构：
```json
{
  "title": "站点标题",
  "services": [
    {
      "name": "分组名",
      "icon": "🖥️",
      "items": [
        { "name": "服务名", "icon": "🤖", "subtitle": "描述", "tag": "标签", "url": "https://..." }
      ]
    }
  ]
}
```

卡片点击后 `target="_blank"` 打开服务 URL。搜索框支持按名称、描述、标签过滤。

### blog.js — 博客文章列表

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Blog` |
| 数据源 | `GET /api/md/` + `GET /api/html/` |
| 职责 | 展示文章列表，支持搜索和类型过滤，点击打开 Markdown 阅读器 |
| 生命周期 | `init()` 拉取文件列表 → `render()` 渲染卡片 → 用户点击 → `MdViewer.open(filename)` |

Markdown 文章点击后通过 `MdViewer.open()` 打开全屏阅读器；HTML 文件通过 `window.open()` 新标签页打开。

### gallery.js — 图片画廊

| 项目 | 内容 |
|------|------|
| 全局名 | `window.Gallery` |
| 数据源 | `GET /api/images/` |
| 职责 | 网格展示图片缩略图，支持搜索，点击打开灯箱 |
| 生命周期 | `init()` 拉取图片列表 → `render()` 渲染网格 → 点击卡片 → `Lightbox.open(src, name)` |

图片加载失败时自动隐藏（`onerror="this.style.opacity=0"`），不显示破损图标。

### md-viewer.js — Markdown 阅读器

| 项目 | 内容 |
|------|------|
| 全局名 | `window.MdViewer` |
| 数据源 | `GET /Markdown/<filename>` |
| 依赖 | marked（Markdown 解析）、KaTeX（数学公式，懒加载） |
| 职责 | 全屏覆盖层渲染 Markdown，含 TOC 目录、阅读进度、图片灯箱 |
| 生命周期 | `init()` 预绑定事件 → `open(filename)` 加载渲染 → 用户浏览 → `close()` 关闭 |

功能细节：
- **marked** 解析 Markdown 为 HTML
- **KaTeX** 按需懒加载：仅当检测到 `$$`/`$`/`\[` 等数学分隔符时才加载 katex.min.js
- **TOC 目录**：解析 h1-h6 标题，生成层级链接，侧边栏滑入/滑出，移动端覆盖层模式
- **图片处理**：自动将相对路径重写为 `/api/images/<filename>`，点击在独立灯箱中放大
- **阅读进度**：顶部 3px 蓝色进度条，随滚动实时更新
- **快捷键**：ESC 关闭阅读器（优先关闭图片灯箱）

### app.js — 主控制器

| 项目 | 内容 |
|------|------|
| 职责 | 引导初始化顺序，管理标签页路由，响应式适配 |
| 生命周期 | `DOMContentLoaded` → 依次初始化各模块 → `switchTab()` 管理标签切换 → `handleResize()` 响应窗口变化 |

初始化序列：
1. `Theme.initTheme()` — 应用存储的主题
2. `Lightbox.init()` — 绑定灯箱事件
3. `MdViewer.init()` — 预绑定阅读器事件
4. `Dashboard.init()` — 开始仪表盘轮询
5. 绑定标签栏和主题按钮事件
6. 从 URL hash 恢复上次标签状态
7. 移动端显示底部导航栏

标签切换采用"显示/隐藏"模式：所有 section 默认 `display:none`，仅当前激活的 section 可见。非当前标签的模块不会发送网络请求（懒加载）。

## CSS 设计

### 主题系统

通过 CSS 变量实现双主题，切换 `body.dark` 类即可全局生效：

```css
:root          { --bg-primary: #e8e8ed; --text-primary: #1c1c1e; ... }
body.dark      { --bg-primary: #0d0d0f; --text-primary: #f5f5f7; ... }
```

### 磨砂玻璃效果

统一使用 `backdrop-filter: blur(20px) saturate(180%)` + 半透明背景，所有卡片、导航栏、输入框均采用此风格。对于不支持 `backdrop-filter` 的浏览器有纯色回退。

### 响应式断点

| 断点 | 目标设备 | 布局调整 |
|------|----------|----------|
| > 1200px | 大屏 PC | 导航 3 列、内容最大宽度 1200px |
| 1024-1200px | 笔记本 | 导航 2-3 列、字体略小 |
| 640-1024px | 平板 | 仪表盘 2 列、导航 2 列、图库 3 列 |
| < 640px | 手机 | 全部单列、隐藏顶部标签栏、显示底部固定导航、仪表盘隐藏进度条、按钮仅显示图标 |

## 部署指南

### 1. 准备第三方库

将以下文件放入 `lib/` 目录（必须，项目不依赖 CDN）：

| 文件 | 下载地址 |
|------|----------|
| `marked.min.js` | `https://cdn.jsdelivr.net/npm/marked/marked.min.js` |
| `katex.min.js` | `https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js` |
| `katex.min.css` | `https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css` |
| `auto-render.min.js` | `https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js` |
| `github-markdown.min.css` | `https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css` |

```bash
# 一次性下载所有依赖
cd lib/
curl -O  https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -O  https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -O  https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -O  https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -OL https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css
```

### 2. 配置 Nginx

参考 [example/Blog.conf](example/Blog.conf) 创建站点配置。核心要点：

- **autoindex on**：`/api/md/`、`/api/html/`、`/api/images/` 三个路径必须开启 `autoindex`，前端依赖 nginx 生成的目录列表来发现文件
- **根目录**：`location /` 指向 Blog 项目根目录，`index index.html`
- **仪表盘 API**：`/api/dashboard` 指向 `dashboard.json`，关闭缓存
- **config.json**：`/config.json` 直接指向项目根目录的配置文件

### 3. 配置服务导航

编辑 `config.json`，参照 `example/homer_config.yml` 中的原始配置，修改为自己的服务列表。每组服务支持 `name`、`icon`（emoji）、`subtitle`、`tag`、`url`。

### 4. 配置仪表盘自动更新

将 `corn.sh` 中的输出路径改为实际的 `dashboard.json` 路径，然后加入 crontab：

```bash
# 每 30 秒更新一次
* * * * * /path/to/corn.sh
* * * * * sleep 30; /path/to/corn.sh
```

`corn.sh` 需要修改底部 `cat > /path/to/HTML/dashboard.json` 为实际路径。

### 5. 添加内容

- **Markdown 文章**：将 `.md` 文件放入 `Markdown/` 目录，nginx 重启后自动可发现
- **HTML 文章**：将 `.html` 文件放入 `Html/` 目录
- **图片**：将图片文件放入 `Image/` 目录

无需重启 nginx，文件增删后刷新页面即可看到变化。

### 6. 启动

```bash
nginx -s reload
# 访问 https://<你的IP>:7443
```

## 使用方式

| 操作 | 方法 |
|------|------|
| 切换功能标签 | 点击顶部标签栏（手机端：底部导航栏） |
| 切换深色/浅色 | 点击右上角 ☀️/🌙 按钮 |
| 搜索服务 | 在导航标签页搜索框输入关键词 |
| 搜索博客文章 | 在博客标签页搜索框输入，可选 Markdown/HTML 过滤 |
| 阅读 Markdown | 点击文章卡片 → 全屏阅读器打开，左侧可展开目录 |
| 查看图片 | 切到图库标签页，搜索或浏览，点击图片打开灯箱 |
| 下载图片 | 在灯箱中右键保存，或通过 nginx 直接访问 `/api/images/<文件名>` |

## 技术要点

- **零后端运行时**：纯静态 HTML + CSS + JS，只需 nginx 提供文件服务
- **零外部网络依赖**：所有字体、图标、样式库均在本地 `lib/` 目录
- **文件发现机制**：利用 nginx `autoindex` 生成的 HTML 目录列表，前端 `DOMParser` 解析提取文件名/大小/日期
- **安全性**：所有用户输入和文件名在插入 DOM 前均通过 `escapeHtml()` 转义
- **性能**：非激活标签页的模块不发送网络请求（懒加载），KaTeX 仅在检测到数学公式时加载
- **兼容性**：对不支持 `backdrop-filter` 的浏览器有纯色回退，`-webkit-` 前缀覆盖 Safari
