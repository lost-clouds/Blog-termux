#!/bin/bash
#
# css/build.sh — CSS 合并构建脚本
#
# 用途：将 css/src/ 源文件合并为 css/style.css
# 用法：bash css/build.sh
# 依赖：cat / cp（POSIX 工具集）
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
    "$SRC/components/markdown-content.css" \
    "$SRC/components/image-lightbox.css" \
    "$SRC/components/bottom-nav.css" \
    "$SRC/themes/dark.css" \
    "$SRC/responsive.css" \
    > "$OUT"

echo "构建完成: $OUT ($(wc -l < "$OUT") 行)"
echo "备份: ${OUT}.bak"
