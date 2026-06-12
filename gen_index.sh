#!/bin/bash
# ============================================================
# 静态索引生成器：为 Markdown/Html/Image 目录生成 index.json
# 用法: bash gen_index.sh [项目根目录]
# ============================================================
set -euo pipefail

ROOT="${1:-.}"
MD_DIR="$ROOT/Markdown"
HTML_DIR="$ROOT/Html"
IMG_DIR="$ROOT/Image"

# ---- JSON 字符串转义 ----
json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\n/\\n/g; s/\r/\\r/g'
}

# ---- 扫描目录（递归），生成 JSON 数组 ----
scan_dir() {
    local base_dir="$1" type="$2" output="$3"
    if [ ! -d "$base_dir" ]; then
        # 目录不存在：若已有 index.json 则清除（用户可能删了目录），否则跳过
        [ -f "$output" ] && echo "[]" > "$output" || true
        return
    fi
    local out_tmp="${output}.tmp"

    local first=true
    echo "[" > "$out_tmp"

    while IFS= read -r -d '' f; do
        # 跳过非普通文件、index.json 自身、临时文件、.gitkeep
        [ -f "$f" ] || continue
        local name
        name=$(basename "$f")
        case "$name" in
            index.json|index.json.tmp|.gitkeep) continue ;;
        esac

        # 跳过缩略图和归档目录
        case "$f" in
            */thumbnails/*|*/archive/*) continue ;;
        esac

        local size modified rel
        size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo "0")
        modified=$(stat -c%Y "$f" 2>/dev/null || stat -f%m "$f" 2>/dev/null || echo "0")
        # 相对于 base_dir 的路径（含子目录），如 posts/example.png
        rel="${f#"$base_dir/"}"
        rel=$(json_escape "$rel")

        $first || echo "," >> "$out_tmp"
        first=false

        printf '  {"name":"%s","type":"%s","size":%s,"modified":%s}' \
            "$rel" "$type" "$size" "$modified" >> "$out_tmp"
    done < <(find "$base_dir" -type f -print0 2>/dev/null || true)

    echo "" >> "$out_tmp"
    echo "]" >> "$out_tmp"
    mv "$out_tmp" "$output"
}

scan_dir "$MD_DIR"   "markdown" "$MD_DIR/index.json"
scan_dir "$HTML_DIR" "html"     "$HTML_DIR/index.json"
scan_dir "$IMG_DIR"  "image"    "$IMG_DIR/index.json"

echo "索引已生成:"
for d in "$MD_DIR" "$HTML_DIR" "$IMG_DIR"; do
    idx="$d/index.json"
    cnt=0
    [ -f "$idx" ] && cnt=$(grep '"name"' "$idx" 2>/dev/null | wc -l) || true
    echo "  $idx ($cnt 项)"
done
