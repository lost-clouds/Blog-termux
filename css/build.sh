#!/bin/bash
# ============================================================
# CSS 合并构建脚本：将 css/src/ 源文件合并为 css/style.css
# 无需任何构建工具依赖，cat 命令在 Termux 中天然可用
# 用法: bash css/build.sh
# ============================================================
set -euo pipefail

SRC="css/src"
OUT="css/style.css"

if [ -f "$OUT" ]; then
    cp "$OUT" "${OUT}.bak"
fi

cat \
    "$SRC/_header.css" \
    "$SRC/variables.css" \
    "$SRC/base.css" \
    "$SRC/layout.css" \
    "$SRC/components/header.css" \
    "$SRC/components/tabs.css" \
    "$SRC/components/dashboard.css" \
    "$SRC/components/navigation.css" \
    "$SRC/components/blog.css" \
    "$SRC/components/gallery.css" \
    "$SRC/components/md-overlay.css" \
    "$SRC/components/toc.css" \
    "$SRC/components/image-lightbox.css" \
    "$SRC/components/progress-bar.css" \
    "$SRC/components/bottom-nav.css" \
    "$SRC/themes/dark.css" \
    "$SRC/responsive.css" \
    > "$OUT"

echo "构建完成: $OUT ($(wc -l < "$OUT") 行)"
echo "备份: ${OUT}.bak"
