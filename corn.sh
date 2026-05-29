#!/bin/bash
# ============================================================
# 系统资源采集脚本（Termux 优化版，无需 root）
# 使用 cron 每 30 秒执行一次
#   crontab -e
#   * * * * * /path/to/Blog/corn.sh
#   * * * * * sleep 30; /path/to/Blog/corn.sh
# ============================================================
set -euo pipefail

OUTPUT="/path/to/Blog/dashboard.json"

# ============================================================
# 1. 设备信息（Android 属性，Termux 直接可用）
# ============================================================
DEVICE_MODEL=$(getprop ro.product.model 2>/dev/null || echo "Unknown")
DEVICE_BRAND=$(getprop ro.product.brand 2>/dev/null || echo "")
ANDROID_VER=$(getprop ro.build.version.release 2>/dev/null || echo "Unknown")
KERNEL_VER=$(uname -r)
HOSTNAME=$(hostname 2>/dev/null || uname -n)

# 品牌 + 型号
if [ -n "$DEVICE_BRAND" ] && [ "$DEVICE_BRAND" != "Unknown" ]; then
    DEVICE_FULL="${DEVICE_BRAND} ${DEVICE_MODEL}"
else
    DEVICE_FULL="$DEVICE_MODEL"
fi

# ============================================================
# 2. CPU 信息
# ============================================================
CPU_CORES=$(nproc 2>/dev/null || grep -c "^processor" /proc/cpuinfo 2>/dev/null || echo "?")

# CPU 型号（优先取 Hardware，其次 model name）
CPU_MODEL=$(grep -m1 "Hardware" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs)
if [ -z "$CPU_MODEL" ]; then
    CPU_MODEL=$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs)
fi
if [ -z "$CPU_MODEL" ]; then
    CPU_MODEL=$(getprop ro.board.platform 2>/dev/null || echo "ARM")
fi

# CPU 使用率（从 /proc/stat 差值计算，无需 root）
cpu_usage() {
    local line stat idle total
    line=$(head -1 /proc/stat)
    # "cpu  user nice system idle iowait irq softirq steal"
    stat=($line)
    unset 'stat[0]'  # 去掉 "cpu" 标签
    total=0
    for v in "${stat[@]}"; do total=$((total + v)); done
    idle=${stat[4]}
    echo "$total $idle"
}

read total1 idle1 <<< $(cpu_usage)
sleep 0.3
read total2 idle2 <<< $(cpu_usage)

if [ "$total2" -gt "$total1" ] 2>/dev/null; then
    total_diff=$((total2 - total1))
    idle_diff=$((idle2 - idle1))
    CPU_USAGE=$(awk "BEGIN { printf \"%.1f\", ($total_diff - $idle_diff) / $total_diff * 100 }")
else
    CPU_USAGE="0.0"
fi

# ============================================================
# 3. 内存信息（从 /proc/meminfo 读取，Termux 可靠）
# ============================================================
MEM_TOTAL=$(awk '/^MemTotal:/  { printf "%.0f", $2 / 1024 }' /proc/meminfo)
MEM_AVAIL=$(awk '/^MemAvailable:/ { printf "%.0f", $2 / 1024 }' /proc/meminfo)
if [ -z "$MEM_AVAIL" ] || [ "$MEM_AVAIL" = "0" ]; then
    # 旧内核没有 MemAvailable，用 MemFree + Buffers + Cached 估算
    MEM_FREE=$(awk '/^MemFree:/  { printf "%.0f", $2 / 1024 }' /proc/meminfo)
    MEM_BUF=$(awk  '/^Buffers:/  { printf "%.0f", $2 / 1024 }' /proc/meminfo)
    MEM_CACHE=$(awk '/^Cached:/  { printf "%.0f", $2 / 1024 }' /proc/meminfo)
    MEM_AVAIL=$((MEM_FREE + MEM_BUF + MEM_CACHE))
fi
MEM_USED=$((MEM_TOTAL - MEM_AVAIL))

# 单位转换
if [ "$MEM_TOTAL" -ge 1024 ] 2>/dev/null; then
    MEM_UNIT="GB"
    MEM_TOTAL_FMT=$(awk "BEGIN { printf \"%.1f\", $MEM_TOTAL / 1024 }")
    MEM_USED_FMT=$(awk "BEGIN { printf \"%.1f\", $MEM_USED / 1024 }")
else
    MEM_UNIT="MB"
    MEM_TOTAL_FMT="$MEM_TOTAL"
    MEM_USED_FMT="$MEM_USED"
fi

# ============================================================
# 4. 储存信息（Termux 主要使用 /data 分区）
# ============================================================
DISK_INFO=$(df -k /data 2>/dev/null | awk 'NR==2 {print $2, $3}')
if [ -n "$DISK_INFO" ]; then
    DISK_TOTAL_KB=$(echo "$DISK_INFO" | awk '{print $1}')
    DISK_USED_KB=$(echo  "$DISK_INFO" | awk '{print $2}')
    DISK_TOTAL_GB=$(awk "BEGIN { printf \"%.0f\", $DISK_TOTAL_KB / 1024 / 1024 }")
    DISK_USED_GB=$(awk  "BEGIN { printf \"%.1f\",  $DISK_USED_KB  / 1024 / 1024 }")
    DISK_UNIT="GB"
else
    DISK_TOTAL_GB="?"
    DISK_USED_GB="?"
    DISK_UNIT="GB"
fi

# ============================================================
# 5. 运行时间
# ============================================================
UPTIME_SEC=$(awk '{printf "%.0f", $1}' /proc/uptime)
UPTIME_DAYS=$((UPTIME_SEC / 86400))
UPTIME_HOURS=$(((UPTIME_SEC % 86400) / 3600))
UPTIME_MINS=$(((UPTIME_SEC % 3600) / 60))

if [ "$UPTIME_DAYS" -gt 0 ] 2>/dev/null; then
    UPTIME="${UPTIME_DAYS}d ${UPTIME_HOURS}h ${UPTIME_MINS}m"
elif [ "$UPTIME_HOURS" -gt 0 ] 2>/dev/null; then
    UPTIME="${UPTIME_HOURS}h ${UPTIME_MINS}m"
else
    UPTIME="${UPTIME_MINS}m"
fi

# ============================================================
# 6. 电池信息（需要 termux-api 包，可选）
# ============================================================
BATTERY_JSON=""
if command -v termux-battery-status &>/dev/null; then
    BATTERY_JSON=$(termux-battery-status 2>/dev/null || echo "")
    if [ -n "$BATTERY_JSON" ]; then
        BAT_LEVEL=$(echo "$BATTERY_JSON" | grep -o '"percentage":[0-9]*' | cut -d: -f2)
        BAT_STATUS=$(echo "$BATTERY_JSON" | grep -o '"status":"[^"]*"' | cut -d: -f2 | tr -d '"')
        BAT_TEMP=$(echo "$BATTERY_JSON"  | grep -o '"temperature":[0-9.]*' | cut -d: -f2)
        # 温度通常以摄氏度 * 10 存储，转换
        if [ -n "$BAT_TEMP" ]; then
            BAT_TEMP=$(awk "BEGIN { printf \"%.1f\", $BAT_TEMP / 10 }")
        fi
    fi
fi

# ============================================================
# 7. 写入 dashboard.json
# ============================================================
# 电池部分（可选）
BATTERY_BLOCK=""
if [ -n "$BAT_LEVEL" ] 2>/dev/null && [ -n "$BAT_STATUS" ]; then
    BATTERY_BLOCK=$(cat <<BEOF
  ,
  "battery": {
    "level": ${BAT_LEVEL:-0},
    "status": "${BAT_STATUS:-Unknown}",
    "temp": ${BAT_TEMP:-0}
  }
BEOF
)
fi

cat > "$OUTPUT" <<EOF
{
  "device": {
    "model": "${DEVICE_FULL}",
    "android": "${ANDROID_VER}",
    "kernel": "${KERNEL_VER}"
  },
  "cpu": {
    "usage": ${CPU_USAGE:-0},
    "cores": ${CPU_CORES:-?},
    "model": "${CPU_MODEL:-Unknown}"
  },
  "memory": {
    "used": ${MEM_USED_FMT:-0},
    "total": ${MEM_TOTAL_FMT:-0},
    "unit": "${MEM_UNIT}"
  },
  "disk": {
    "used": ${DISK_USED_GB:-0},
    "total": ${DISK_TOTAL_GB:-0},
    "unit": "GB"
  },
  "uptime": "${UPTIME}"${BATTERY_BLOCK}
}
EOF
