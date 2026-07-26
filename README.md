# Blog-termux — Personal Dashboard + Blog Console

[简体中文](README_ZH.md) | [English](README.md)

> Pure static single-page application powered by Nginx. **Zero backend runtime** (no PHP/Node.js/Python).
> Integrates system dashboard, service navigation, Markdown blog reader, and image gallery — responsive across PC, tablet, and mobile.

![Dashboard + Navigation](example/example.png)
![Blog — light theme](example/example0.png)
![Blog — dark theme](example/example1.png)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔋 **Zero backend** | Pure static files, relies only on Nginx autoindex |
| 📊 **System dashboard** | CPU/memory/storage/network/battery/services/uptime, 30s polling |
| 🧭 **Service navigation** | Configurable grouped service cards, one-click launch |
| 📝 **Markdown blog** | 3-column Hugo Book-style reader with inline rendering, ToC, KaTeX math |
| 🖼️ **Image gallery** | Grid view + search + lightbox |
| 🌙 **Dark mode** | One-click toggle, preference auto-saved |
| 📡 **Offline ready** | Service Worker caching: articles/images available offline |
| 🛡️ **Security** | 5-layer HTML sanitizer, URL whitelist validation, content escaping |
| 🔧 **No root** | All system metrics collected without root privileges |
| 🧹 **Code quality** | ES Modules + JSDoc + ESLint + Prettier + Stylelint + CI gate |

> Originally forked from [bastienwirtz/homer](https://github.com/bastienwirtz/homer), extensively rewritten into its current form.
> See also: [Termux usage notes](Markdown/termux使用总结.md)

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/lost-clouds/Blog-termux.git ~/Blog-termux

# 2. Download frontend dependencies (one-time, fully offline afterwards)
cd ~/Blog-termux/lib
curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css

# 3. Configure Nginx
cp example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
# Edit: replace /path/to/Blog-termux with the actual absolute path

# 4. Setup dashboard cron (every 30s)
# Add to crontab:
#   * * * * * bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
#   * * * * * sleep 30; bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json

# 5. (Optional) Generate static indexes for faster loading
bash ~/Blog-termux/gen_index.sh ~/Blog-termux
# Add to cron: */5 * * * * bash ~/Blog-termux/gen_index.sh ~/Blog-termux

# 6. Reload Nginx and open
nginx -s reload
# Visit https://127.0.0.1:7443
```

---

## 🏗️ Architecture

### Layout

```
index.html (SPA entry point)
  │
  ├─ header ─── brand title + theme toggle
  │
  ├─ tab-bar ── [Dashboard] [Nav] [Blog] [Gallery]
  │             top bar on PC/tablet | bottom-fixed on mobile
  │
  ├─ content (4 sections, 1 visible)
  │   ├── #sec-dashboard    8 cards: device / CPU / memory / storage / network / battery / services / uptime
  │   ├── #sec-nav          grouped service cards with search filter
  │   ├── #sec-blog         3-column: sidebar | inline render | ToC, HTML articles open in new tab
  │   └── #sec-gallery      image grid with search + lightbox
  │
  └─ lightbox ─── shared by Markdown images + gallery
```

### Script Load Chain

```
main.js  →  app.js  →  theme.js, utils.js, lightbox.js
                    →  dashboard.js   (constants.js)
                    →  navigation.js  (utils.js, constants.js)
                    →  blog.js        (utils.js, md-viewer.js, constants.js)
                    →  gallery.js     (utils.js, lightbox.js, constants.js)
                    →  md-viewer.js   (utils.js, sanitizer.js, footnotes.js, lightbox.js, constants.js)
```

All business JS uses **ES Modules** with explicit `import`/`export`. `main.js` is a single line `import './app.js'`. The only regular `<script>` is `lib/marked.min.js`.

### Data Flow

```
                    gen_index.sh (optional cron)
                    ──────────────────────→  Markdown/index.json
                                              Html/index.json
                    corn.sh (cron 30s)         Image/index.json
                    ──────────────────────→  dashboard.json
                                               │
                                               │ primary: fetch index.json
                                               │ fallback: DOMParser parse nginx autoindex HTML
                                               ↓
Markdown/Html/Image/ ── nginx autoindex ──→  /api/md/ | /api/html/ | /api/images/
                                               │
GET /api/dashboard ───────────────────────────┘
                                               ↓
dashboard.js (30s polling)       blog.js / gallery.js
→ updates 8 dashboard cards      → renders article list / image grid
```

**Core design**: `index.json` as primary data source, nginx autoindex as fallback. Frontend fetches structured JSON first (fast, reliable), falling back to `DOMParser`-based autoindex HTML parsing when the index is missing (404).

---

## 📁 Directory Structure

```
Blog-termux/
├── index.html                  # Single entry point — tabbed SPA
├── config.json                 # Service navigation config
├── corn.sh                     # System metrics collector (no root)
├── gen_index.sh                # Static index generator
├── sw.js                       # Service Worker (offline cache)
├── styleguide.md               # Coding standards (naming/comments/module boundaries/toolchain)
│
├── css/
│   ├── style.css               # Build output (generated by build.sh, do not edit)
│   ├── build.sh                # Merge script
│   └── src/                    # Only editable CSS source
│       ├── variables.css       #   CSS custom properties
│       ├── base.css            #   Reset + typography
│       ├── layout.css          #   Page layout
│       ├── responsive.css      #   Responsive breakpoints
│       ├── components/         #   9 component stylesheets
│       └── themes/dark.css     #   Dark mode overrides
│
├── js/                         # ES Modules (12 business + 1 entry)
│   ├── main.js                 #   Entry (import './app.js')
│   ├── app.js                  #   Main controller (boot, routing, coordination)
│   ├── theme.js                #   Theme manager
│   ├── utils.js                #   Utilities + URL safelist validation
│   ├── constants.js            #   Path constants
│   ├── sanitizer.js            #   HTML whitelist sanitizer
│   ├── footnotes.js            #   Footnote preprocessor
│   ├── lightbox.js             #   Image lightbox
│   ├── dashboard.js            #   System dashboard
│   ├── navigation.js           #   Service navigation
│   ├── blog.js                 #   Article list + inline rendering
│   ├── gallery.js              #   Image gallery
│   └── md-viewer.js            #   Markdown rendering engine
│
├── Html/                       # HTML pages (indexed by gen_index.sh)
├── Image/                      # Image assets (posts / gallery / thumbnails)
├── Markdown/                   # .md articles
│
├── lib/                        # Vendored third-party libraries (zero CDN at runtime)
│   ├── marked.min.js
│   ├── katex.min.js + .css
│   ├── auto-render.min.js
│   └── github-markdown.min.css
│
├── example/
│   ├── Blog.conf               # Nginx config template
│   └── example*.png            # Screenshots
│
├── resume/                     # Self-contained resume sub-project
│   ├── index.html
│   ├── config.json
│   ├── css/resume.css
│   └── js/resume.js
│
└── .github/workflows/
    ├── lint.yml                # PR gate: JS/CSS/Shell checks
    └── release.yml             # Tag release: build + package + Release
```

---

## 📦 Module Reference

### Overview

| Module | Role | Dependencies | Key Implementation |
|--------|------|-------------|-------------------|
| `app.js` | Boot, tab routing, keyboard nav, SW registration | All modules | Ordered init, lazy-loads blog/gallery on first visit |
| `theme.js` | Light/dark toggle | — | `localStorage` persistence, `prefers-color-scheme` fallback |
| `utils.js` | Shared utilities | — | `escapeHtml`, `getSafeUrl` (whitelist), `fetchIndexOrAutoindex` (dual-source) |
| `constants.js` | Path registry | — | All API routes + lib paths centralized |
| `sanitizer.js` | HTML sanitizer | — | 5-layer whitelist: tags, attributes, URLs, classes, styles |
| `footnotes.js` | Footnote preprocessor | — | `[^id]` definitions → numbered footnotes with backlinks |
| `lightbox.js` | Image lightbox | — | Click/ESC/backdrop close, focus restoration |
| `dashboard.js` | System dashboard | `constants.js` | 8 cards, 30s polling + 8s timeout, visibility pause, progressive degradation |
| `navigation.js` | Service navigation | `utils.js`, `constants.js` | `config.json` grouped rendering, 250ms debounced search |
| `blog.js` | Article reader | `utils.js`, `md-viewer.js`, `constants.js` | 3-column layout, `Promise.allSettled` dual-directory, request ID race protection |
| `gallery.js` | Image gallery | `utils.js`, `lightbox.js`, `constants.js` | Thumbnail grid, lazy loading, 250ms debounced search |
| `md-viewer.js` | Markdown renderer | `utils.js`, `sanitizer.js`, `footnotes.js`, `lightbox.js`, `constants.js` | Full pipeline: footnotes → math → marked → sanitize → image paths → anchors → KaTeX |
| `sw.js` | Service Worker | — | Cache-first (static), SWR (articles/images), Network-first (entry), Network-only (realtime) |

### Core Modules

#### dashboard.js — System Dashboard

Polls `GET /api/dashboard` every **30 seconds** with an **8-second AbortController timeout**. Polling pauses when tab is inactive or page hidden. Error degradation: 1 error → hint, 2–5 errors → stale indicator, 5+ errors → full reset.

**8 cards:**

| Card | Content | Progress Bar |
|------|---------|:---:|
| 📱 Device | Brand + model, Android version, kernel | — |
| 🧠 CPU | Usage %, cores, model, per-cluster breakdown | blue |
| 💾 Memory | Used / total + SWAP row (hidden when SWAP = 0) | blue |
| 🗄️ Storage | Used / total | blue |
| 🌐 Network | Local IP, interface, IPv6 | — |
| 🔋 Battery | Level %, charging status, temperature | green |
| ⚙️ Services | Count + process name list | — |
| ⏱️ Uptime | e.g. "3d 12h 30m" | — |

`dashboard.json` schema (generated by `corn.sh`):

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
  "services": {"running": ["nginx", "crond", "sshd", "vaultwarden"], "count": 4},
  "uptime": "2 weeks, 1 day, 4h"
}
```

> `cpu.clusters` is optional (absent on systems without cpufreq/lscpu). Cluster names derived from `lscpu` Model name or `/proc/cpuinfo` CPU part → ARM Cortex/X map.

#### blog.js — Blog Reader

Hugo Book-style 3-column layout. `Promise.allSettled` fetches Markdown + HTML dual directories simultaneously (one failure doesn't block the other). Dual race-condition protection via `AbortController` + request ID counter.

| Feature | Detail |
|---------|--------|
| Data source | `index.json` first → nginx autoindex fallback (Markdown + HTML dual directory) |
| Filter | All / Markdown / HTML type toggle |
| Search | 250ms debounced, matches filename |
| Markdown | Inline render + auto-generated ToC |
| HTML | Opens in new tab |

#### md-viewer.js — Markdown Rendering Engine

Pure rendering module — no DOM lifecycle management. Complete 8-step pipeline:

| Step | Implementation |
|------|---------------|
| 1. Footnotes | Preprocess `[^id]` definitions → numbered footnotes with backlinks |
| 2. Math extraction | 3-phase: `$$` → `\[` → `\(`, split→aligned normalization |
| 3. Markdown parsing | `marked.parse()` with math placeholders |
| 4. XSS sanitization | 5-layer whitelist (tags, attrs, URLs, classes, styles) |
| 5. Image paths | Relative paths rewritten to `/api/images/` |
| 6. Heading anchors | Auto-injected `#` permalinks with CJK slug support |
| 7. KaTeX rendering | Lazy-loaded on demand, graceful degradation on failure |
| 8. Image binding | Delegated click → shared `Lightbox` |

#### navigation.js — Service Navigation

Reads `config.json`, renders service cards grouped by category. Search filters by `name`, `subtitle`, and `tag` with 250ms debounce. URLs validated via `Utils.getSafeUrl()` — unsafe URLs render as inert `<div>`. External links use `target="_blank" rel="noopener"`.

---

## 📋 Deployment Guide

### Requirements

| Component | Purpose | Install |
|-----------|---------|---------|
| Nginx | Web server | `pkg install nginx` |
| cron / crond | Schedule corn.sh | `pkg install cronie termux-services` |
| curl | Download dependencies (one-time) | Pre-installed |
| Node.js + npm | Code linting (optional) | `pkg install nodejs-lts` |
| termux-api | Battery info (optional) | `pkg install termux-api` |

> **NOT required**: PHP, Node.js, Python, MySQL, Docker.

### 2. Download Dependencies

Place these 5 files in `lib/`. **Download once, then fully offline.**

```bash
mkdir -p ~/Blog-termux/lib && cd ~/Blog-termux/lib

curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js

ls -lh lib/   # Should show 6 files, ~2.3MB total
```

### 3. Configure Nginx

```bash
cp ~/Blog-termux/example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
sed -i 's|/path/to/Blog-termux|/your/real/path|g' $PREFIX/etc/nginx/conf.d/Blog.conf

# Ensure nginx.conf includes site configs:
#   http { include conf.d/*.conf; }

nginx -t && nginx -s reload
```

### 4. Configure Service Navigation

Edit `config.json`:

```json
{
  "services": [
    {
      "name": "Server",
      "icon": "🖥️",
      "items": [
        {
          "name": "My Service",
          "icon": "🤖",
          "subtitle": "Short description",
          "tag": "AI",
          "url": "https://your-server.local:8443/"
        }
      ]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `name` | Display name |
| `icon` | Emoji (no icon font needed) |
| `subtitle` | Card description |
| `tag` | Corner badge |
| `url` | Target URL |

Refresh the page to apply.

### Add Content

| Content type | Directory | Discovery |
|-------------|-----------|-----------|
| Markdown | `Markdown/` | `index.json` → autoindex fallback |
| HTML | `Html/` | `index.json` → autoindex fallback, opens in new tab |
| Images | `Image/` | `index.json` → autoindex fallback |

> `gen_index.sh` automatically skips `thumbnails/` and `archive/` directories. Run `bash gen_index.sh ~/Blog-termux` to build indexes, optionally add to cron: `*/5 * * * * bash ~/Blog-termux/gen_index.sh ~/Blog-termux`

---

## 🎮 Usage

| Action | How |
|--------|-----|
| Switch tab | PC/tablet: click top tab bar. Mobile: tap bottom nav |
| Toggle dark mode | Click ☀/☾ button, preference auto-saved |
| Search services | Nav tab → type in search box (matches name/description/tag) |
| Search articles | Blog tab → type keywords → filter by type |
| Read article | Click article → inline render in center panel, auto-generated ToC |
| Browse images | Gallery tab → search or scroll → click for lightbox |
| Shortcuts | `←` `→` cycle tabs, `Home` `End` jump to first/last, `ESC` close lightbox |

---

## ❓ FAQ

### Blog/gallery/nav shows "Loading..." with no data?

```bash
curl http://127.0.0.1:7443/api/md/     # Is autoindex working?
ls ~/Blog-termux/Markdown/              # Are directories empty?
# Check browser console (F12) — usually a path mismatch in nginx config
```

### Dashboard cards show "--"?

```bash
cat ~/Blog-termux/dashboard.json        # Exists and valid JSON?
bash ~/Blog-termux/corn.sh              # Run manually
ps aux | grep crond                     # Is cron running?
```

### Battery card shows "--"?

Install `termux-api` (also install Termux:API app on Android and grant permissions). Other functionality unaffected.

### Images in Markdown not displaying?

Place images in `Image/` directory, reference by filename (reader auto-rewrites paths to `/api/images/<filename>`).

### Math formulas render as raw text?

Verify `katex.min.js` and `auto-render.min.js` exist in `lib/`. KaTeX loads on demand. Check browser console for 404s.

---

## 🔧 Development

### Coding Standards

The project provides [`styleguide.md`](styleguide.md) defining complete code conventions:

- **Module boundaries** — Read/write rules per directory (`lib/` read-only, `css/style.css` is build output, etc.)
- **JavaScript conventions** — ES Modules, naming, JSDoc templates
- **CSS conventions** — Variable naming, component partitioning, BEM
- **Shell script conventions** — Header format, fallback chain comments
- **HTML conventions** — Section comment format
- **Toolchain** — ESLint + Prettier + Stylelint + ShellCheck
- **Module registry** — All modules with exposure method, dependencies, responsibilities

```bash
npm install     # Install dev dependencies
npm run lint    # JS/CSS/Shell code check
npm run format  # Auto-format
```

### CI Workflows

| Workflow | Trigger | Checks |
|----------|---------|--------|
| `lint.yml` | PR push (on JS/CSS/Shell changes) | ESLint + Stylelint + ShellCheck |
| `release.yml` | Tag push | Lint pass (blocking) then build + package + release |

---

## 📄 Technical Highlights

| Feature | Implementation |
|---------|---------------|
| 🔌 Zero backend | nginx autoindex + `DOMParser` fallback parsing |
| 📦 Zero external deps | All libraries vendored in `lib/`, fully offline after first download |
| 🔒 No root | `corn.sh` uses `/proc/stat` / `free` / `df` / `ps` / `getprop` |
| 🛡️ Security | 5-layer HTML sanitizer + URL whitelist + `escapeHtml` on user content |
| 📡 Offline | Service Worker 4 strategies: cache-first, SWR, network-first, network-only |
| 🌙 Theming | CSS custom properties + `body.dark` toggle, system preference auto-detect |
| 📱 Responsive | 3 breakpoints (1024px / 639px / 400px), top tabs → bottom nav on mobile |
| ⚡ Performance | Inactive tabs don't fetch, KaTeX lazy-loaded, dashboard visibility pause |
| 🛡️ Race protection | `AbortController` + request ID counter, `Promise.allSettled` multi-source |
| 🧹 Code quality | JSDoc coverage, ES Modules, ESLint + Prettier + Stylelint + CI gate |

---

## 🔗 Links

[linux.do](https://linux.do)