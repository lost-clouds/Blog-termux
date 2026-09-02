#!/bin/bash
#
# css/build.sh — CSS 合并构建脚本
#
# 用途：将 css/src/ 源文件合并为 css/style.css
# 用法：bash css/build.sh
# 依赖：cat / cp（POSIX 工具集）
set -euo pipefail

# 定位仓库根目录：任 cwd 调用都正确（audit C12）
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/css/src"
OUT="$ROOT/css/style.css"
TMP="${OUT}.tmp.$$"

# 构建中途失败（如源文件缺失/被截断）时不留在已截断的 style.css：
# 先写临时文件，成功后原子 mv；失败则清理临时文件并保留旧档案。
trap 'rm -f "$TMP"' EXIT

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
    "$SRC/components/tikz.css" \
    "$SRC/components/image-lightbox.css" \
    "$SRC/components/toast.css" \
    "$SRC/components/bottom-nav.css" \
    "$SRC/themes/dark.css" \
    "$SRC/responsive.css" \
    > "$TMP"

mv "$TMP" "$OUT"

echo "构建完成: $OUT ($(wc -l < "$OUT") 行)"
echo "备份: ${OUT}.bak"
