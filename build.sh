#!/bin/bash
#
# build.sh — 站点统一构建：重建 CSS + 内容指纹统一重写 sw.js 的 CACHE 与 index.html 的 ?v=
#
# 用途：
#   1) 重建 css/style.css（复用 css/build.sh）
#   2) 一致性检查：js/ 源模块必须全部列入 sw.js SHELL（防新增模块导致离线首屏崩）
#   3) 用 js/ css/src/ lib/ 的内容指纹重写 sw.js 的 CACHE 常量，以及
#      sw.js / index.html 中所有资产 ?v= 查询串——两个位置共用同一编号，杜绝手改漏配
# 用法：bash build.sh
# 依赖：bash / find / sort / xargs / sha1sum / awk / sed / grep（GNU 可用品即可）
# 注意：指纹只算源文件（js/ css/src/ lib/），不含 sw.js/index.html/css 产物，
#       因此重复运行幂等；release.yml 打包前必须执行一次（H5/A1）
set -euo pipefail

# 仓库根目录（支持任意 cwd 调用）
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=> [1/3] 重建 CSS"
bash css/build.sh

# ---- 一致性检查：js/ 源模块（排除 *.test.mjs）必须都在 sw.js SHELL 中 ----
check_shell() {
    local missing="" f rel
    while IFS= read -r f; do
        rel="/${f#./}"
        # SHELL 条目形如 '/js/theme.js' 或 '/js/main.js?v=N'；此处校验路径片段是否出现
        if ! grep -qF "$rel" sw.js; then
            missing="${missing}  ${rel}"
        fi
    done < <(find js -name '*.js' ! -name '*.test.mjs' ! -path '*/node_modules/*' | sort)
    if [ -n "$missing" ]; then
        echo "build.sh: 以下 js 模块未列入 sw.js SHELL，离线首屏将加载失败：" >&2
        echo "$missing" >&2
        echo "请将上述路径加入 sw.js 的 SHELL 数组后重跑 build.sh。" >&2
        return 1
    fi
}

echo "=> [2/3] 校验 sw.js SHELL 覆盖全部 js 源模块"
check_shell

# ---- 计算内容指纹（源文件）----
compute_version() {
    find js css/src lib -type f \
        ! -name '*.test.mjs' ! -name '*.tmp' ! -name '*.bak' \
        -print0 | sort -z | xargs -0 sha1sum | sha1sum | awk '{print $1}'
}

if [ -n "${VERSION:-}" ]; then
    V="$VERSION"
else
    FP="$(compute_version)"
    V="${FP:0:8}"
fi

echo "=> [3/3] 用版本号 '$V' 重写 sw.js CACHE 与 ?v= 查询串"
# sw.js: CACHE 常量整体替换
sed -i "s/const CACHE = 'blog-[^']*';/const CACHE = 'blog-${V}';/" sw.js
# sw.js / index.html: 所有 ?v=<旧值> → ?v=<新值>（无 ?v= 的运行时懒加载库不受影响）
sed -i "s/?v=[0-9A-Za-z]*/?v=${V}/g" sw.js index.html

echo "构建完成: CACHE='blog-${V}'（sw.js 与 index.html 的 ?v= 已同步）"