#!/bin/bash
# ============================================================
# 系统资源采集脚本（Termux 零 root 版）
# 用法: bash corn.sh [输出路径]
# crontab: 每 30 秒执行一次
# ============================================================

OUTPUT="${1:-/path/to/Blog/dashboard.json}"

# ============================================================
# 辅助函数
# ============================================================
sval() { echo "${1:-$2}"; }
fval() { awk "BEGIN { printf \"%.1f\", $1 }" 2>/dev/null || echo "$2"; }

# ============================================================
# 1. 设备信息
# ============================================================
DEV_MODEL=$(getprop ro.product.model 2>/dev/null || echo "Unknown")
DEV_BRAND=$(getprop ro.product.brand 2>/dev/null || echo "")
ANDROID_VER=$(getprop ro.build.version.release 2>/dev/null || echo "?")
KERNEL_VER=$(sval "$(uname -r)" "?")

if [ -n "$DEV_BRAND" ] && [ "$DEV_BRAND" != "Unknown" ]; then
    DEV_FULL="${DEV_BRAND} ${DEV_MODEL}"
else
    DEV_FULL="$DEV_MODEL"
fi

# ============================================================
# 2. 网络信息
# ============================================================
LOCAL_IP=""
IPV6_ADDR=""
IFACE_NAME=""

if command -v ifconfig &>/dev/null; then
    for iface in wlan0 eth0 rmnet_data0; do
        LOCAL_IP=$(ifconfig "$iface" 2>/dev/null | grep 'inet ' | awk '{print $2}' | head -1)
        if [ -n "$LOCAL_IP" ]; then IFACE_NAME="$iface"; break; fi
    done
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
        [ -n "$LOCAL_IP" ] && IFACE_NAME="auto"
    fi
fi

# 公网 IPv6（可选，2s 超时）
IPV6_ADDR=$(curl -6 -s --connect-timeout 2 ifconfig.me 2>/dev/null || echo "")

# ============================================================
# 3. CPU 信息
# ============================================================
CPU_CORES=$(nproc 2>/dev/null || echo "?")
CPU_MODEL=$(getprop ro.board.platform 2>/dev/null || echo "")
[ -z "$CPU_MODEL" ] && CPU_MODEL=$(getprop ro.product.cpu.abi 2>/dev/null || echo "ARM")

CPU_USAGE="0.0"
if command -v top &>/dev/null; then
    TOP_OUT=$(top -bn1 2>/dev/null)
    if [ -n "$TOP_OUT" ]; then
        CPU_IDLE=$(echo "$TOP_OUT" | grep -oP '\d+\.?\d*\s*id' | head -1 | grep -oP '\d+\.?\d*')
        if [ -z "$CPU_IDLE" ]; then
            CPU_IDLE=$(echo "$TOP_OUT" | grep -oP '\d+% idle' | head -1 | grep -oP '\d+')
        fi
        [ -n "$CPU_IDLE" ] && CPU_USAGE=$(fval "100 - $CPU_IDLE" "0.0")
    fi
fi

# ============================================================
# 4. 内存信息
# ============================================================
MEM_TOTAL_FMT="?"
MEM_USED_FMT="?"
MEM_UNIT="MB"

if command -v free &>/dev/null; then
    FREE_OUT=$(free -m 2>/dev/null)
    if [ -n "$FREE_OUT" ]; then
        MEM_TOTAL=$(echo "$FREE_OUT" | awk '/^Mem:/{print $2}')
        MEM_USED=$(echo "$FREE_OUT"  | awk '/^Mem:/{print $3}')
        if [ -n "$MEM_TOTAL" ] && [ -n "$MEM_USED" ]; then
            if [ "$MEM_TOTAL" -ge 1024 ] 2>/dev/null; then
                MEM_UNIT="GB"
                MEM_TOTAL_FMT=$(fval "$MEM_TOTAL / 1024" "?")
                MEM_USED_FMT=$(fval  "$MEM_USED  / 1024" "?")
            else
                MEM_TOTAL_FMT="$MEM_TOTAL"
                MEM_USED_FMT="$MEM_USED"
            fi
        fi
    fi
fi

# ============================================================
# 5. 储存信息
# ============================================================
DISK_USED_GB="?"
DISK_TOTAL_GB="?"
if command -v df &>/dev/null; then
    DISK_INFO=$(df -k /data 2>/dev/null | awk 'NR==2 {print $2, $3}')
    if [ -n "$DISK_INFO" ]; then
        DISK_TOTAL_KB=$(echo "$DISK_INFO" | awk '{print $1}')
        DISK_USED_KB=$(echo  "$DISK_INFO" | awk '{print $2}')
        DISK_TOTAL_GB=$(fval "$DISK_TOTAL_KB / 1024 / 1024" "?")
        DISK_USED_GB=$(fval  "$DISK_USED_KB  / 1024 / 1024" "?")
    fi
fi

# ============================================================
# 6. 运行时间
# ============================================================
UPTIME="?"
UPTIME_RAW=$(uptime -p 2>/dev/null | sed 's/^up //')
[ -z "$UPTIME_RAW" ] && UPTIME_RAW=$(uptime 2>/dev/null | sed 's/.*up \([^,]*\).*/\1/')
[ -n "$UPTIME_RAW" ] && UPTIME="$UPTIME_RAW"

# ============================================================
# 7. 电池信息（需要 termux-api）
# ============================================================
BAT_LEVEL=""
BAT_STATUS=""
BAT_TEMP=""

if command -v termux-battery-status &>/dev/null; then
    BAT_JSON=$(termux-battery-status 2>/dev/null || echo "")
    if [ -n "$BAT_JSON" ]; then
        BAT_LEVEL=$(echo "$BAT_JSON"    | grep -oE '"percentage": *[0-9]+' | cut -d: -f2 | xargs)
        BAT_STATUS=$(echo "$BAT_JSON"   | grep -oE '"status": *"[^"]*"' | cut -d: -f2 | xargs | tr -d '"')
        BAT_TEMP_RAW=$(echo "$BAT_JSON" | grep -oE '"temperature": *[0-9.]+' | cut -d: -f2 | xargs)
        [ -n "$BAT_TEMP_RAW" ] && BAT_TEMP=$(fval "$BAT_TEMP_RAW / 10" "0")
    fi
fi

# ============================================================
# 8. 正在运行的服务（通过 pgrep/ps 检测，无需 root）
# ============================================================
SVC_ARRAY=""
SVC_COUNT=0

# 要检测的服务列表：命令名 显示名
check_svc() {
    local bin="$1" label="$2"
    if command -v pgrep &>/dev/null; then
        if pgrep -x "$bin" >/dev/null 2>&1; then
            [ -n "$SVC_ARRAY" ] && SVC_ARRAY="${SVC_ARRAY},"
            SVC_ARRAY="${SVC_ARRAY}\"${label}\""
            SVC_COUNT=$((SVC_COUNT + 1))
        fi
    elif command -v ps &>/dev/null; then
        if ps -e 2>/dev/null | grep -qw "$bin"; then
            [ -n "$SVC_ARRAY" ] && SVC_ARRAY="${SVC_ARRAY},"
            SVC_ARRAY="${SVC_ARRAY}\"${label}\""
            SVC_COUNT=$((SVC_COUNT + 1))
        fi
    fi
}

check_svc "nginx"    "nginx"
check_svc "crond"    "crond"
check_svc "sshd"     "sshd"
check_svc "couchdb"  "couchdb"
check_svc "mysqld"   "mysqld"
check_svc "mariadbd" "mariadb"
check_svc "code-server" "code-server"

# ============================================================
# 9. 数值清洗 & JSON 生成
# ============================================================
clean_num() {
    local v="$1" def="${2:-0}"
    v=$(echo "$v" | xargs 2>/dev/null)
    if [ -z "$v" ] || [ "$v" = "?" ] || [ "$v" = "-" ]; then
        echo "$def"
    elif echo "$v" | grep -qE '^[0-9]+\.?[0-9]*$'; then
        echo "$v"
    else
        echo "$def"
    fi
}

clean_str() {
    local v="$1" def="${2:--}"
    v=$(echo "$v" | xargs 2>/dev/null)
    if [ -z "$v" ] || [ "$v" = "?" ]; then
        echo "$def"
    else
        echo "$v" | sed 's/\\/\\\\/g; s/"/\\"/g'
    fi
}

# 清洗所有值
V_DEV_MODEL=$(clean_str "$DEV_FULL" "Unknown")
V_ANDROID=$(clean_str "$ANDROID_VER" "-")
V_KERNEL=$(clean_str "$KERNEL_VER" "-")
V_LOCAL_IP=$(clean_str "$LOCAL_IP" "-")
V_IPV6=$(clean_str "$IPV6_ADDR" "-")
V_IFACE=$(clean_str "$IFACE_NAME" "-")
V_CPU_USAGE=$(clean_num "$CPU_USAGE" "0")
V_CPU_CORES=$(clean_num "$CPU_CORES" "0")
V_CPU_MODEL=$(clean_str "$CPU_MODEL" "ARM")
V_MEM_USED=$(clean_num "$MEM_USED_FMT" "0")
V_MEM_TOTAL=$(clean_num "$MEM_TOTAL_FMT" "0")
V_MEM_UNIT=$(clean_str "$MEM_UNIT" "MB")
V_DISK_USED=$(clean_num "$DISK_USED_GB" "0")
V_DISK_TOTAL=$(clean_num "$DISK_TOTAL_GB" "0")
V_UPTIME=$(clean_str "$UPTIME" "-")
V_BAT_LEVEL=$(clean_num "${BAT_LEVEL:--1}" "-1")
V_BAT_STATUS=$(clean_str "${BAT_STATUS:-}" "-")
V_BAT_TEMP=$(clean_num "${BAT_TEMP:-0}" "0")
V_SVC_COUNT="$SVC_COUNT"

mkdir -p "$(dirname "$OUTPUT")" 2>/dev/null || true

cat > "$OUTPUT" <<EOF
{
  "device": {"model": "${V_DEV_MODEL}", "android": "${V_ANDROID}", "kernel": "${V_KERNEL}"},
  "cpu": {"usage": ${V_CPU_USAGE}, "cores": ${V_CPU_CORES}, "model": "${V_CPU_MODEL}"},
  "memory": {"used": ${V_MEM_USED}, "total": ${V_MEM_TOTAL}, "unit": "${V_MEM_UNIT}"},
  "disk": {"used": ${V_DISK_USED}, "total": ${V_DISK_TOTAL}, "unit": "GB"},
  "network": {"ip": "${V_LOCAL_IP}", "ipv6": "${V_IPV6}", "iface": "${V_IFACE}"},
  "services": {"running": [${SVC_ARRAY}], "count": ${V_SVC_COUNT}},
  "battery": {"level": ${V_BAT_LEVEL}, "status": "${V_BAT_STATUS}", "temp": ${V_BAT_TEMP}},
  "uptime": "${V_UPTIME}"
}
EOF
