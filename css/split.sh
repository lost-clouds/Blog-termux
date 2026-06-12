#!/bin/bash
# ============================================================
# CSS 拆分脚本：将 style.css 按模块拆分为独立源文件
# 用法: bash css/split.sh
# ============================================================
set -euo pipefail

SRC="css/style.css"
DIST="css/src"

rm -rf "$DIST"
mkdir -p "$DIST/components" "$DIST/themes"

# 提取文件头部注释（第 1-21 行）→ _header.css
sed -n '1,21p' "$SRC" > "$DIST/_header.css"

# 1. CSS 变量 (22-66)
sed -n '22,66p' "$SRC" > "$DIST/variables.css"

# 2. 基础重置 (67-104)
sed -n '67,104p' "$SRC" > "$DIST/base.css"

# 3. 页面布局 (105-152)
sed -n '105,152p' "$SRC" > "$DIST/layout.css"

# 4. 头部 (153-198)
sed -n '153,198p' "$SRC" > "$DIST/components/header.css"

# 5. Tab 切换栏 (199-242)
sed -n '199,242p' "$SRC" > "$DIST/components/tabs.css"

# 6. 仪表盘 (243-316)
sed -n '243,316p' "$SRC" > "$DIST/components/dashboard.css"

# 7. 服务导航 (317-414)
sed -n '317,414p' "$SRC" > "$DIST/components/navigation.css"

# 8. 博客 (415-659)
sed -n '415,659p' "$SRC" > "$DIST/components/blog.css"

# 9. 图库 (660-725)
sed -n '660,725p' "$SRC" > "$DIST/components/gallery.css"

# 10. Markdown 阅读器覆盖层 (726-934)
sed -n '726,934p' "$SRC" > "$DIST/components/md-overlay.css"

# 11. TOC 侧边栏 (935-1012)
sed -n '935,1012p' "$SRC" > "$DIST/components/toc.css"

# 12. 图片灯箱（Markdown 内） (1013-1116)
sed -n '1013,1116p' "$SRC" > "$DIST/components/image-lightbox.css"

# 13. 阅读进度条 (1117-1129)
sed -n '1117,1129p' "$SRC" > "$DIST/components/progress-bar.css"

# 14. 底部导航栏 (1130-1158)
sed -n '1130,1158p' "$SRC" > "$DIST/components/bottom-nav.css"

# 15. 深色模式覆盖 (1159-1220)
sed -n '1159,1220p' "$SRC" > "$DIST/themes/dark.css"

# 16+17. 响应式 + 浏览器兼容 (1221-$)
sed -n '1221,$p' "$SRC" > "$DIST/responsive.css"

echo "CSS 源文件已拆分到 $DIST/"
find "$DIST" -type f | sort
