# Blog-termux — 个人导航 + 博客控制台

[简体中文](README_ZH.md) | [English](README.md)

纯静态单页面应用，基于 Nginx 运行，无需 PHP / Node.js / Python 等后端运行时。集成 **系统仪表盘**、**服务导航**、**Markdown 博客阅读器**、**图片画廊** 四大模块，自适应 PC / 平板 / 手机。

![仪表盘 + 导航](example/example.png)
![博客三栏布局 — 浅色](example/example0.png)
![博客三栏布局 — 深色](example/example1.png)

> 项目最初 fork 自 [bastienwirtz/homer](https://github.com/bastienwirtz/homer)，经长期使用中不断修改，最终演变为现在的形态。
> 附：[Termux 使用总结](Markdown/termux使用总结.md)

---

## 目录

- [快速开始](#快速开始)
- [架构设计](#架构设计)
- [目录结构](#目录结构)
- [模块详解](#模块详解)
- [部署教程](#部署教程)
- [使用指南](#使用指南)
- [常见问题](#常见问题)

---

## 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/lost-clouds/Blog-termux.git ~/Blog-termux

# 2. 下载前端依赖库（一次性）
cd ~/Blog-termux/lib
curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css

# 3. 复制 nginx 配置并修改路径
cp example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
# 编辑：将所有 /path/to/Blog-termux 替换为实际绝对路径

# 4. 配置仪表盘定时采集（每 30 秒）
# 添加 crontab：
#   * * * * * ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
#   * * * * * sleep 30; ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json

# 5. （可选）生成静态索引，加速文章/图片加载
bash ~/Blog-termux/gen_index.sh ~/Blog-termux
# 可加入 cron：*/5 * * * * bash ~/Blog-termux/gen_index.sh ~/Blog-termux

# 6. 重载 nginx 并访问
nginx -s reload
# 浏览器打开 https://127.0.0.1:7443
```

---

## 架构设计

### 整体布局

```
index.html (单页面)
  │
  ├─ header ─── 品牌标题 + 主题切换按钮 (☀/☾)
  │
  ├─ tab-bar ── [仪表盘] [导航] [博客] [图库]
  │             PC/平板顶部 | 手机底部固定
  │
  ├─ 内容区 (4 个 section，同时显示 1 个)
  │   ├── #sec-dashboard    8 张卡片：设备 / CPU / 内存 / 储存 / 网络 / 电池 / 服务 / 运行时间
  │   ├── #sec-nav          服务分组卡片 + 搜索过滤
  │   ├── #sec-blog         三栏：文章目录 | 内联渲染 | ToC，HTML 文章新标签页打开
  │   └── #sec-gallery      图片网格 + 搜索 + 灯箱
  │
  └─ lightbox ─── Markdown 图片 + 画廊共享
```

### 脚本加载链

```
main.js  →  app.js  →  theme.js, utils.js, lightbox.js
                    →  dashboard.js   (constants.js)
                    →  navigation.js  (utils.js, constants.js)
                    →  blog.js        (utils.js, md-viewer.js, constants.js)
                    →  gallery.js     (utils.js, lightbox.js, constants.js)
                    →  md-viewer.js   (utils.js, sanitizer.js, footnotes.js, lightbox.js, constants.js)
```

所有业务 JS 使用 **ES Modules**（`import`/`export` 显式声明依赖）。`main.js` 精简为单行 `import './app.js'`。唯一保留的常规 `<script>` 是 `lib/marked.min.js`（提供全局 `marked`）。Module 脚本自动延迟到 DOM 就绪后执行。

### 数据流

```
                    gen_index.sh (可选)
                    ─────────────────────→  Markdown/index.json
                                            Html/index.json
                    corn.sh (cron 每30s)       Image/index.json
                    ─────────────────────→  dashboard.json
                                               │
                                               │ 优先: fetch index.json
                                               │ 降级: DOMParser 解析 nginx autoindex HTML
                                               ↓
Markdown/Html/Image/ ── nginx autoindex ──→  /api/md/ | /api/html/ | /api/images/
                                               │
GET /api/dashboard ───────────────────────────┘
                                               │
                                               ↓
dashboard.js (每30s 轮询)        blog.js / gallery.js
→ 更新 8 张仪表盘卡片              → 渲染文章列表 / 图片网格
→ 自动检测运行中的服务
```

核心思路：**gen_index.sh 生成 `index.json` 优先 + nginx autoindex 降级**。前端优先 fetch 结构化 JSON 索引（快速、可靠），若索引未生成（404）则降级为 `DOMParser` 解析 nginx autoindex HTML，实现零后端的文件发现。

---

## 目录结构

```
Blog-termux/
├── index.html                  # 唯一入口 — 标签页 SPA
├── config.json                 # 服务导航配置
├── corn.sh                     # 系统资源采集脚本（零 root）
├── gen_index.sh                # 静态索引生成器
├── sw.js                       # Service Worker（离线缓存 + SWR 策略）
├── .gitignore
├── LICENSE                     # MIT 许可证
├── favicon.ico
│
├── css/
│   ├── style.css               # 构建产物 — 合并后的全站样式
│   ├── build.sh                # CSS 构建脚本（cat 合并）
│   └── src/
│       ├── variables.css       #   CSS 自定义属性
│       ├── base.css            #   重置 + 排版
│       ├── layout.css          #   页面布局
│       ├── responsive.css      #   响应式断点
│       ├── components/         #   9 个组件样式
│       └── themes/dark.css     #   深色模式覆盖
│
├── js/                         # ES Modules (13 个文件)
│   ├── main.js                 #   入口 — 导入 app.js
│   ├── app.js                  #   主控制器（引导、路由、协调）
│   ├── theme.js                #   主题管理
│   ├── utils.js                #   工具函数 + URL 安全验证
│   ├── constants.js            #   路径常量
│   ├── sanitizer.js            #   HTML 白名单清理器
│   ├── footnotes.js            #   Markdown 脚注预处理器
│   ├── lightbox.js             #   图片灯箱
│   ├── dashboard.js            #   系统仪表盘
│   ├── navigation.js           #   服务导航
│   ├── blog.js                 #   文章列表 + 内联渲染
│   ├── gallery.js              #   图片画廊
│   └── md-viewer.js            #   Markdown 渲染引擎
│
├── lib/                        # 第三方库（本地化，零 CDN 运行时依赖）
│   ├── marked.min.js
│   ├── katex.min.js + .css
│   ├── auto-render.min.js
│   └── github-markdown.min.css
│
├── Markdown/                   # .md 文章
├── Image/
│   ├── posts/                  #   文章配图（图库展示）
│   ├── gallery/                #   独立图片（图库展示）
│   ├── thumbnails/             #   缩略图缓存（gen_index.sh 跳过）
│   └── archive/unused/         #   未使用图片（gen_index.sh 跳过）
│
├── example/
│   ├── Blog.conf               # Nginx 配置模板
│   └── example*.png            # 界面截图
│
└── resume/                     # 独立简历子站点
    ├── index.html
    ├── config.json
    ├── css/resume.css
    └── js/resume.js
```

---

## 模块详解

### 总览

| 模块 | 职责 | 依赖 | 关键实现 |
|------|------|------|----------|
| `app.js` | 引导、标签路由、键盘导航、SW 注册 | 全部模块 | 有序初始化序列，首次访问时懒加载博客/画廊数据 |
| `theme.js` | 浅色/深色切换 | — | `localStorage` 持久化，`prefers-color-scheme` 回退，meta theme-color 更新 |
| `utils.js` | 共享工具 | — | `escapeHtml`、`getSafeUrl`（白名单验证）、`formatSize`、`fetchIndexOrAutoindex`（双源加载器） |
| `constants.js` | 路径注册 | — | 所有 API 路由 + 库路径集中管理 |
| `sanitizer.js` | HTML 清理 | — | 五层白名单：标签、属性、URL、class 名、style 属性 |
| `footnotes.js` | 脚注预处理 | — | 提取 `[^id]` 定义，生成带返回链接的编号脚注 |
| `lightbox.js` | 图片灯箱 | — | 点击/ESC/背景 关闭，焦点恢复 |
| `dashboard.js` | 系统仪表盘 | `constants.js` | 8 卡片视图，30s 轮询 + 8s AbortController 超时，页面可见性暂停，渐进式错误降级 |
| `navigation.js` | 服务导航 | `utils.js`, `constants.js` | 从 `config.json` 按分组渲染卡片，250ms 防抖搜索 |
| `blog.js` | 博客阅读器 | `utils.js`, `md-viewer.js`, `constants.js` | 三栏 Hugo Book 风格布局，`Promise.allSettled` 双目录获取，`AbortController` + 请求 ID 竞态防护 |
| `gallery.js` | 图片画廊 | `utils.js`, `lightbox.js`, `constants.js` | 缩略图网格，懒加载图片，250ms 防抖搜索 |
| `md-viewer.js` | Markdown 渲染引擎 | `utils.js`, `sanitizer.js`, `footnotes.js`, `lightbox.js`, `constants.js` | 完整管道：脚注 → 数学提取 → marked → 清理 → 图片路径 → 锚点 → KaTeX |
| `sw.js` | Service Worker | — | Cache-first（静态）、SWR（文章/图片）、Network-first（入口）、Network-only（dashboard/summary） |

### 核心模块

#### dashboard.js — 系统仪表盘

每 **30 秒**轮询 `GET /api/dashboard`，带 **8 秒 AbortController 超时**。离开标签页或页面隐藏时暂停轮询。渐进式错误降级：1 次失败显示提示，2–5 次显示过期指示，5 次以上全部重置为 `--`。

**8 张卡片：**

| 卡片 | 内容 | 进度条 |
|------|------|:---:|
| 设备 | 品牌+型号 · Android 版本 · 内核版本 | — |
| CPU | 使用率% · 核心数 · 型号 · 集群负载（Cortex-A73/A53） | 蓝色 |
| 内存 | used / total + SWAP 行（SWAP=0 时隐藏） | 蓝色 |
| 储存 | used / total | 蓝色 |
| 网络 | 局域网 IP · 接口 · IPv6 | — |
| 电池 | 电量% · 充电状态 · 温度 | 绿色 |
| 服务 | N 个运行中 · 进程名列表（`ps -e` 自动扫描） | — |
| 运行时间 | 如 "3d 12h 30m" | — |

`dashboard.json` 格式（由 corn.sh 生成）：

```json
{
  "timestamp": "2026-06-12T14:30:00+08:00",
  "device": {"model": "OnePlus KB2000", "android": "14", "kernel": "4.19"},
  "cpu": {
    "usage": 46.6, "cores": 8, "model": "kona",
    "clusters": {
      "Cortex-A73": {"cores": 4, "usage": 95.5, "freq_max": 2400, "freq_min": 300},
      "Cortex-A53": {"cores": 4, "usage": 0.0,  "freq_max": 1901, "freq_min": 300}
    }
  },
  "memory": {"used": 4.3, "total": 11.2, "unit": "GB", "swap_used": 2.0, "swap_total": 8.0},
  "disk": {"used": 64.8, "total": 224.5, "unit": "GB"},
  "network": {"ip": "192.168.1.5", "ipv6": "240e:...", "iface": "wlan0"},
  "battery": {"level": 85, "status": "FULL", "temp": 40.0},
  "services": {"running": ["nginx","crond","sshd","vaultwarden"], "count": 4},
  "uptime": "2 weeks, 1 day, 4h"
}
```

> `cpu.clusters` 为可选字段（无 cpufreq/lscpu 时不出现）。集群名优先从 `lscpu` Model name 获取，其次 `/proc/cpuinfo` CPU part → ARM Cortex/X 映射。`memory.swap_*` 在 SWAP 未开启时为 0。

#### blog.js — 博客阅读器

Hugo Book 风格三栏布局。通过 **`Promise.allSettled`** 同时获取 Markdown 和 HTML 文章列表（一个目录失败不影响另一个）。`AbortController` + 请求 ID 计数器双重竞态防护。文章按名称排序。

| 特性 | 说明 |
|------|------|
| 数据源 | `index.json` 优先 → nginx autoindex 降级（Markdown + HTML 双目录） |
| 过滤 | 全部 / Markdown / HTML 类型切换 |
| 搜索 | 250ms 防抖，匹配文件名 |
| Markdown | 内联渲染 `MarkdownRenderer.render()` + 自动生成 ToC |
| HTML | 新标签页打开 |

#### md-viewer.js — Markdown 渲染引擎

纯渲染模块，不管理 DOM 生命周期。完整管道：

| 步骤 | 实现 |
|------|------|
| 1. 脚注 | 预处理 `[^id]` 定义 → 编号脚注 + 返回链接 |
| 2. 数学提取 | 三阶段：`$$...$$` → `\[...\]` → `\(...\)`，split→aligned 标准化，双反斜杠转义 |
| 3. Markdown 解析 | `marked.parse()` + 数学占位符 |
| 4. XSS 清理 | 五层白名单（标签、属性、URL、class、style） |
| 5. 图片路径 | 相对路径重写为 `/api/images/` |
| 6. 标题锚点 | 自动注入 `#` 链接，支持中文 slug |
| 7. KaTeX 渲染 | 按需懒加载，加载失败时优雅降级（可重试） |
| 8. 图片绑定 | 委托点击 → 共享 `Lightbox` |

#### navigation.js — 服务导航

读取 `config.json`，按分组渲染服务卡片。搜索匹配 `name`、`subtitle`、`tag`，250ms 防抖。URL 经 `Utils.getSafeUrl()` 安全验证 — 不安全 URL 渲染为无操作 `<div>`。外部链接使用 `target="_blank" rel="noopener"`。

---

## 部署教程

### 1. 环境要求

| 组件 | 用途 | 安装 |
|------|------|------|
| Nginx | Web 服务器 | `pkg install nginx` |
| cron / crond | 定时执行 corn.sh | `pkg install cronie termux-services` |
| curl | 下载依赖库 | 一次性使用 |
| termux-api (可选) | 电池信息 | `pkg install termux-api` |

> **无需**：PHP、Node.js、Python、MySQL、Docker。

### 2. 下载依赖库

以下 5 个文件放入 `lib/`。**下载一次，后续完全离线。**

```bash
mkdir -p ~/Blog-termux/lib && cd ~/Blog-termux/lib

curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js

ls -lh lib/   # 应显示 6 个文件，约 2.3MB
```

### 3. 配置 Nginx

```bash
cp ~/Blog-termux/example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
sed -i 's|/path/to/Blog-termux|/实际/路径|g' $PREFIX/etc/nginx/conf.d/Blog.conf

# 确保 nginx.conf 引入站点配置：
#   http { include conf.d/*.conf; }

nginx -t && nginx -s reload
```

### 4. 配置服务导航

编辑 `config.json`：

```json
{
  "title": "我的控制台",
  "services": [
    {
      "name": "Server",
      "icon": "🖥",
      "items": [
        {
          "name": "显示名称",
          "icon": "🤖",
          "subtitle": "简短描述",
          "tag": "标签",
          "url": "https://your-server.local:8443/"
        }
      ]
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `name` | 显示名称 |
| `icon` | emoji 图标（无需图标字体） |
| `subtitle` | 卡片描述 |
| `tag` | 右上角标签 |
| `url` | 跳转地址 |

修改后刷新页面即可生效。

### 5. 配置仪表盘定时更新

```bash
# 手动测试
bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
cat ~/Blog-termux/dashboard.json

# 添加 crontab（每 30 秒）：
# * * * * * bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
# * * * * * sleep 30; bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
```

> **Termux 注意**：先启动 cron 服务 — `sv-enable crond` (termux-services) 或手动 `crond`。

### 6. 添加内容

| 内容类型 | 目录 | 发现方式 |
|----------|------|----------|
| Markdown | `Markdown/` | `index.json` 优先 → autoindex 降级 |
| HTML | `Html/` | `index.json` 优先 → autoindex 降级，新标签页打开 |
| 图片 | `Image/` | `index.json` 优先 → autoindex 降级 |

> `gen_index.sh` 跳过 `thumbnails/` 和 `archive/`，这两目录下的图片不会在图库中展示。运行 `bash gen_index.sh ~/Blog-termux` 生成静态索引，可选加入 cron：`*/5 * * * * bash ~/Blog-termux/gen_index.sh ~/Blog-termux`

### 7. 启动

```bash
nginx -s reload
# 浏览器打开 https://127.0.0.1:7443
```

---

## 使用指南

| 操作 | 方式 |
|------|------|
| 切换标签 | PC/平板：点击顶部标签栏。手机：点击底部导航栏 |
| 深色模式 | 点击右上角 ☀/☾ 按钮，偏好自动保存 |
| 搜索服务 | "导航"标签 → 搜索框输入（匹配名称/描述/标签） |
| 搜索文章 | "博客"标签 → 搜索框输入 → 类型过滤：全部 / Markdown / HTML |
| 阅读文章 | 点击文章 → 正文内联渲染在中间栏，右侧自动生成目录 |
| 浏览图片 | "图库"标签 → 搜索或滚动 → 点击灯箱放大 |
| 快捷键 | `←` `→` 切换标签，`Home` `End` 跳转首/末，`ESC` 关闭灯箱 |

---

## 常见问题

### 博客 / 图库 / 导航显示"加载中"，没有数据？

```bash
curl http://127.0.0.1:7443/api/md/     # autoindex 是否正常？
ls ~/Blog-termux/Markdown/              # 目录是否为空？
# 检查浏览器控制台 (F12) 有无 fetch 错误 — 通常是 nginx 路径配置问题
```

### 仪表盘卡片显示 "--"？

```bash
cat ~/Blog-termux/dashboard.json        # 是否存在且为有效 JSON？
bash ~/Blog-termux/corn.sh              # 手动执行一次
ps aux | grep crond                     # cron 是否运行？
```

### 电池卡片显示 "--"？

安装 `termux-api`（Android 上还需安装 Termux:API 应用并授权）：

```bash
pkg install termux-api
```

未安装时电池卡片显示 `--` 占位符，不影响其他功能。

### 如何修改端口？

编辑 nginx 配置中的 `listen 7443;` → `nginx -s reload`。

### Markdown 中图片不显示？

1. 将图片放入 `Image/` 目录，文章中引用文件名（阅读器自动重写为 `/api/images/<文件名>`）
2. 或使用绝对路径：`/api/images/<文件名>`

### 数学公式显示为原始文本？

确认 `lib/` 中存在 `katex.min.js` 和 `auto-render.min.js`。KaTeX 仅在检测到数学分隔符时按需加载（支持 `$$`、`\[`、`\(`）。检查浏览器控制台有无 404 错误。

---

## 技术要点

| 特性 | 实现方式 |
|------|----------|
| 零后端 | nginx autoindex 生成目录列表，`DOMParser` 解析 |
| 零外部依赖 | 所有库本地化在 `lib/` |
| 无 root | `corn.sh` 使用 `lscpu`/cpufreq sysfs/`/proc/stat`/`top`/`free`/`getprop`/`ps` |
| 服务检测 | 自动扫描 `ps -e` 全部进程，噪音过滤 + 去重 + 通用名解析 |
| 安全 | 五层 HTML 白名单清理、URL 白名单验证、用户内容 `escapeHtml` 转义 |
| 离线 | Service Worker：cache-first（静态）、SWR（文章/图片）、network-only（dashboard/summary） |
| 主题 | CSS 自定义属性 + `body.dark` 切换，`prefers-color-scheme` 自动检测 |
| 响应式 | 3 个断点（1024px / 639px / 400px），顶部标签 → 底部导航 |
| 懒加载 | 非活跃标签不请求数据，KaTeX 按需加载 |
| 竞态防护 | `AbortController` + 请求 ID 计数器，`Promise.allSettled` 多源容错 |
| 兼容性 | `-webkit-backdrop-filter`，`@supports not (backdrop-filter)` 纯色降级 |

---

## 友链

[linux.do](https://linux.do)
