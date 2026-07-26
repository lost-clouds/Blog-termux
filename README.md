# Blog-termux — Personal Dashboard + Blog Console

[简体中文](README_ZH.md) | [English](README.md)

A pure static single-page application powered by Nginx. No PHP, Node.js, Python, or any backend runtime. Integrates **system dashboard**, **service navigation**, **Markdown blog reader**, and **image gallery** into one page — responsive across PC, tablet, and mobile.

![Dashboard + Navigation](example/example.png)
![Blog — light theme](example/example0.png)
![Blog — dark theme](example/example1.png)

> Originally forked from [bastienwirtz/homer](https://github.com/bastienwirtz/homer), extensively rewritten into its current form.
> See also: [Termux usage notes](Markdown/termux使用总结.md)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Module Reference](#module-reference)
- [Deployment Guide](#deployment-guide)
- [Usage](#usage)
- [FAQ](#faq)

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/lost-clouds/Blog-termux.git ~/Blog-termux

# 2. Download frontend dependencies (one-time)
cd ~/Blog-termux/lib
curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css

# 3. Copy nginx config and update paths
cp example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
# Edit: replace /path/to/Blog-termux with the actual absolute path

# 4. Setup dashboard cron (every 30s)
# Add to crontab:
#   * * * * * ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
#   * * * * * sleep 30; ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json

# 5. (Optional) Generate static indexes for faster loading
bash ~/Blog-termux/gen_index.sh ~/Blog-termux
# Add to cron: */5 * * * * bash ~/Blog-termux/gen_index.sh ~/Blog-termux

# 6. Reload nginx and open
nginx -s reload
# Visit https://127.0.0.1:7443
```

---

## Architecture

### Layout

```
index.html (SPA)
  │
  ├─ header ─── brand title + theme toggle (☀/☾)
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

All business JS uses **ES Modules** with explicit `import`/`export`. `main.js` is a single line `import './app.js'`. The only regular `<script>` is `lib/marked.min.js` (global `marked`). Module scripts auto-defer until DOM is ready.

### Data Flow

```
                    gen_index.sh (optional)
                    ─────────────────────→  Markdown/index.json
                                            Html/index.json
                    corn.sh (cron every 30s)   Image/index.json
                    ─────────────────────→  dashboard.json
                                               │
                                               │ primary: fetch index.json
                                               │ fallback: DOMParser parse nginx autoindex HTML
                                               ↓
Markdown/Html/Image/ ── nginx autoindex ──→  /api/md/ | /api/html/ | /api/images/
                                               │
GET /api/dashboard ───────────────────────────┘
                                               │
                                               ↓
dashboard.js (poll every 30s)     blog.js / gallery.js
→ updates 8 dashboard cards       → renders article list / image grid
→ auto-detects running services
```

Core idea: **gen_index.sh generates `index.json` as primary data source, with nginx autoindex fallback**. Frontend fetches the structured JSON index first (fast, reliable), falling back to `DOMParser`-based autoindex HTML parsing if the index is missing (404).

---

## Directory Structure

```
Blog-termux/
├── index.html                  # Single entry point — tabbed SPA
├── config.json                 # Service navigation config
├── corn.sh                     # System metrics collector (no root)
├── gen_index.sh                # Static index generator
├── sw.js                       # Service Worker (offline cache + SWR)
├── .gitignore
├── LICENSE                     # MIT
├── favicon.ico
│
├── css/
│   ├── style.css               # Built output — merged full stylesheet
│   ├── build.sh                # CSS build script (cat merge)
│   └── src/
│       ├── variables.css       #   CSS custom properties
│       ├── base.css            #   Reset + typography
│       ├── layout.css          #   Page layout
│       ├── responsive.css      #   Responsive breakpoints
│       ├── components/         #   9 component stylesheets
│       └── themes/dark.css     #   Dark mode overrides
│
├── js/                         # ES Modules (13 files)
│   ├── main.js                 #   Entry — imports app.js
│   ├── app.js                  #   Main controller (boot, routing, coordination)
│   ├── theme.js                #   Theme manager
│   ├── utils.js                #   Utilities + URL safelist validation
│   ├── constants.js            #   Path constants
│   ├── sanitizer.js            #   HTML whitelist sanitizer
│   ├── footnotes.js            #   Markdown footnote preprocessor
│   ├── lightbox.js             #   Image lightbox
│   ├── dashboard.js            #   System dashboard
│   ├── navigation.js           #   Service navigation
│   ├── blog.js                 #   Article list + inline rendering
│   ├── gallery.js              #   Image gallery
│   └── md-viewer.js            #   Markdown rendering engine
│
├── lib/                        # Vendored third-party libraries (zero CDN at runtime)
│   ├── marked.min.js
│   ├── katex.min.js + .css
│   ├── auto-render.min.js
│   └── github-markdown.min.css
│
├── Markdown/                   # .md articles
├── Image/
│   ├── posts/                  #   Article images (shown in gallery)
│   ├── gallery/                #   Standalone images (shown in gallery)
│   ├── thumbnails/             #   Thumbnail cache (skipped by gen_index.sh)
│   └── archive/unused/         #   Orphan images (skipped by gen_index.sh)
│
├── example/
│   ├── Blog.conf               # Nginx config template
│   └── example*.png            # Screenshots
│
└── resume/                     # Standalone resume sub-site
    ├── index.html
    ├── config.json
    ├── css/resume.css
    └── js/resume.js
```

---

## Module Reference

### Overview

| Module | Role | Dependencies | Key Implementation |
|--------|------|-------------|-------------------|
| `app.js` | Boot, tab routing, keyboard nav, SW registration | All modules | Ordered init sequence, lazy-loads blog/gallery on first visit |
| `theme.js` | Light/dark toggle | — | `localStorage` persistence, `prefers-color-scheme` fallback, meta theme-color update |
| `utils.js` | Shared utilities | — | `escapeHtml`, `getSafeUrl` (whitelist validation), `formatSize`, `fetchIndexOrAutoindex` (dual-source loader) |
| `constants.js` | Path registry | — | All API routes + library paths in one place |
| `sanitizer.js` | HTML sanitizer | — | 5-layer whitelist: tags, attributes, URLs, class names, inline styles |
| `footnotes.js` | Footnote preprocessor | — | Extracts `[^id]` definitions, injects numbered footnotes with backlinks |
| `lightbox.js` | Image lightbox | — | Click/ESC/backdrop close, focus restoration |
| `dashboard.js` | System dashboard | `constants.js` | 8-card view, 30s polling with 8s AbortController timeout, page visibility pause, progressive error degradation |
| `navigation.js` | Service launcher | `utils.js`, `constants.js` | Renders grouped service cards from `config.json`, 250ms debounced search |
| `blog.js` | Article reader | `utils.js`, `md-viewer.js`, `constants.js` | 3-column Hugo Book-style layout, `Promise.allSettled` dual-directory fetch, `AbortController` + request ID race protection |
| `gallery.js` | Image gallery | `utils.js`, `lightbox.js`, `constants.js` | Thumbnail grid, lazy-loaded images, 250ms debounced search |
| `md-viewer.js` | Markdown renderer | `utils.js`, `sanitizer.js`, `footnotes.js`, `lightbox.js`, `constants.js` | Full render pipeline: footnotes → math extraction → marked → sanitize → image paths → anchors → KaTeX |
| `sw.js` | Service Worker | — | Cache-first (static), SWR (articles/images), network-first (entry), network-only (dashboard/summary) |

### Core Modules

#### dashboard.js — System Dashboard

Polls `GET /api/dashboard` every **30 seconds** with an **8-second AbortController timeout**. Polling pauses when the tab is inactive or the page is hidden. Progressive error degradation: 1 error shows a hint, 2–5 errors show a stale indicator, 5+ errors reset all cards to `--`.

**8 cards:**

| Card | Content | Progress Bar |
|------|---------|:---:|
| Device | Brand + model, Android version, kernel | — |
| CPU | Usage %, cores, model, per-cluster breakdown (Cortex-A73/A53) | blue |
| Memory | Used / total + SWAP row (hidden when SWAP = 0) | blue |
| Storage | Used / total | blue |
| Network | Local IP, interface, IPv6 | — |
| Battery | Level %, charging status, temperature | green |
| Services | Count + process name list (auto-scanned via `ps -e`) | — |
| Uptime | e.g. "3d 12h 30m" | — |

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
  "services": {"running": ["nginx","crond","sshd","vaultwarden"], "count": 4},
  "uptime": "2 weeks, 1 day, 4h"
}
```

> `cpu.clusters` is optional (absent on systems without cpufreq/lscpu). Cluster names derived from `lscpu` Model name or `/proc/cpuinfo` CPU part → ARM Cortex/X map. `memory.swap_*` is 0 when SWAP is off.

#### blog.js — Blog Reader

Hugo Book-style three-column layout. Fetches Markdown and HTML article lists simultaneously via **`Promise.allSettled`** (one directory failing doesn't block the other). Uses `AbortController` + request ID counter for dual race-condition protection. Articles are sorted alphabetically.

| Feature | Detail |
|---------|--------|
| Data source | `index.json` first → nginx autoindex fallback (Markdown + HTML dual directory) |
| Filter | All / Markdown / HTML type toggle |
| Search | 250ms debounced, matches filename |
| Markdown | Inline rendered via `MarkdownRenderer.render()` with auto-generated ToC |
| HTML | Opens in new tab |

#### md-viewer.js — Markdown Rendering Engine

Pure rendering module — no DOM lifecycle management. Full pipeline:

| Step | Implementation |
|------|---------------|
| 1. Footnotes | Preprocess `[^id]` definitions → numbered footnotes with backlinks |
| 2. Math extraction | 3-phase: `$$...$$` → `\[...\]` → `\(...\)`, split→aligned normalization, double-backslash escaping |
| 3. Markdown parsing | `marked.parse()` with math placeholders |
| 4. XSS sanitization | 5-layer whitelist (tags, attrs, URLs, classes, styles) |
| 5. Image paths | Relative paths rewritten to `/api/images/` |
| 6. Heading anchors | Auto-injected `#` permalinks with CJK-capable slug generation |
| 7. KaTeX rendering | Lazy-loaded on demand, graceful degradation on load failure (retryable) |
| 8. Image binding | Delegated click → shared `Lightbox` |

#### navigation.js — Service Navigation

Reads `config.json`, renders service cards grouped by category. Search filters by `name`, `subtitle`, and `tag` with 250ms debounce. URLs validated via `Utils.getSafeUrl()` — unsafe URLs render as inert `<div>`. External links use `target="_blank" rel="noopener"`.

---

## Deployment Guide

### 1. Requirements

| Component | Purpose | Install |
|-----------|---------|---------|
| Nginx | Web server | `pkg install nginx` |
| cron / crond | Schedule corn.sh | `pkg install cronie termux-services` |
| curl | Download dependencies | One-time use |
| termux-api (optional) | Battery info | `pkg install termux-api` |

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
  "title": "My Console",
  "services": [
    {
      "name": "Server",
      "icon": "🖥",
      "items": [
        {
          "name": "Display Name",
          "icon": "🤖",
          "subtitle": "Short description",
          "tag": "Tag",
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

### 5. Setup Dashboard Cron

```bash
# Test manually
bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
cat ~/Blog-termux/dashboard.json

# Add to crontab (every 30 seconds):
# * * * * * bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
# * * * * * sleep 30; bash ~/Blog-termux/corn.sh ~/Blog-termux/dashboard.json
```

> **Termux**: Start cron service first — `sv-enable crond` (termux-services) or run `crond` manually.

### 6. Add Content

| Content type | Directory | Discovery |
|-------------|-----------|-----------|
| Markdown | `Markdown/` | `index.json` → autoindex fallback |
| HTML | `Html/` | `index.json` → autoindex fallback, opens in new tab |
| Images | `Image/` | `index.json` → autoindex fallback |

> `gen_index.sh` skips `thumbnails/` and `archive/` — images there are not shown in the gallery. Run `bash gen_index.sh ~/Blog-termux` to rebuild indexes, optionally add to cron: `*/5 * * * * bash ~/Blog-termux/gen_index.sh ~/Blog-termux`

### 7. Launch

```bash
nginx -s reload
# Open https://127.0.0.1:7443
```

---

## Usage

| Action | How |
|--------|-----|
| Switch tab | PC/tablet: click top tab bar. Mobile: tap bottom nav |
| Dark mode | Click ☀/☾ button, preference auto-saved |
| Search services | Nav tab → type in search box (matches name/description/tag) |
| Search articles | Blog tab → type keywords → filter by type: All / Markdown / HTML |
| Read article | Click article → inline render in center panel, auto-generated ToC on right |
| Browse images | Gallery tab → search or scroll → click to open lightbox |
| Shortcuts | `←` `→` cycle tabs, `Home` `End` jump to first/last, `ESC` close lightbox |

---

## FAQ

### Blog / Gallery / Nav shows "Loading..." with no data?

```bash
curl http://127.0.0.1:7443/api/md/     # Is autoindex working?
ls ~/Blog-termux/Markdown/              # Are directories empty?
# Check browser console (F12) for fetch errors — usually a path mismatch in nginx config.
```

### Dashboard cards show "--"?

```bash
cat ~/Blog-termux/dashboard.json        # Exists and valid JSON?
bash ~/Blog-termux/corn.sh              # Run manually
ps aux | grep crond                     # Is cron running?
```

### Battery card shows "--"?

Install `termux-api` (also install Termux:API app on Android and grant permissions):

```bash
pkg install termux-api
```

Without it, the battery card shows `--` without affecting other functionality.

### How to change the port?

Edit `listen 7443;` in nginx config → `nginx -s reload`.

### Images in Markdown not displaying?

1. Place images in `Image/` directory, reference by filename (reader auto-rewrites paths to `/api/images/<filename>`)
2. Or use absolute paths: `/api/images/<filename>`

### Math formulas render as raw text?

Verify `katex.min.js` and `auto-render.min.js` exist in `lib/`. KaTeX loads on demand when math delimiters are detected (`$$`, `\[`, `\(`). Check browser console for 404 errors.

---

## Technical Highlights

| Feature | Implementation |
|---------|---------------|
| Zero backend | nginx autoindex + `DOMParser` parsing |
| Zero external deps | All libraries vendored in `lib/` |
| No root | `corn.sh` uses `lscpu`/cpufreq sysfs/`/proc/stat`/`top`/`free`/`getprop`/`ps` |
| Service detection | Auto-scan `ps -e` all processes, noise filter + dedup + name resolution |
| Security | 5-layer HTML sanitizer, URL whitelist validation, `escapeHtml` on user content |
| Offline | Service Worker: cache-first (static), SWR (articles/images), network-only (dashboard/summary) |
| Theming | CSS custom properties + `body.dark` toggle, `prefers-color-scheme` auto-detect |
| Responsive | 3 breakpoints (1024px / 639px / 400px), top tabs → bottom nav on mobile |
| Lazy loading | Inactive tabs don't fetch, KaTeX loads on demand |
| Race protection | `AbortController` + request ID counter, `Promise.allSettled` for multi-source |
| Compatibility | `-webkit-backdrop-filter`, `@supports not (backdrop-filter)` solid-color fallbacks |

---

## Links

[linux.do](https://linux.do)
