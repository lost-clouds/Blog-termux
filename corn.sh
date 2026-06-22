#!/bin/bash
# ============================================================
# 系统资源采集脚本（Termux 零 root 版）
# 用法: bash corn.sh [输出路径]
# crontab: 每 30 秒执行一次
# ============================================================

OUTPUT="${1:-./dashboard.json}"

# ============================================================
# 辅助函数
# ============================================================
sval() { echo "${1:-$2}"; }
fval() { awk "BEGIN { printf \"%.1f\", $1 }" 2>/dev/null || echo "$2"; }

# ARM CPU part → 核心微架构名称映射
map_cpu_part() {
    case "$1" in
        # ARM Cortex-A 系列
        0xd03) echo "Cortex-A53" ;;  0xd04) echo "Cortex-A35" ;;
        0xd05) echo "Cortex-A55" ;;  0xd07) echo "Cortex-A57" ;;
        0xd08) echo "Cortex-A72" ;;  0xd09) echo "Cortex-A73" ;;
        0xd0a) echo "Cortex-A75" ;;  0xd0b) echo "Cortex-A76" ;;
        0xd0c) echo "Cortex-A77" ;;  0xd0d) echo "Cortex-A78" ;;
        0xd0e) echo "Cortex-A78AE" ;;
        0xd41) echo "Cortex-A78C" ;;
        # ARM Cortex-X 系列
        0xd42) echo "Cortex-X2" ;;   0xd44) echo "Cortex-X1" ;;
        0xd48) echo "Cortex-X3" ;;   0xd4b) echo "Cortex-X4" ;;
        0xd4c) echo "Cortex-X925" ;; 0xd4f) echo "Cortex-X5" ;;
        # ARM Cortex-A 系列 (ARMv9 / 新一代)
        0xd43) echo "Cortex-A710" ;; 0xd46) echo "Cortex-A510" ;;
        0xd47) echo "Cortex-A715" ;; 0xd49) echo "Cortex-A520" ;;
        0xd4a) echo "Cortex-A720" ;; 0xd4d) echo "Cortex-A725" ;;
        0xd4e) echo "Cortex-A730" ;;
        # Qualcomm Kryo (implementer 0x51)
        0x801) echo "Cortex-A53" ;;  0x802) echo "Cortex-A75" ;;
        0x803) echo "Cortex-A55" ;;  0x804) echo "Cortex-A76" ;;
        0x805) echo "Cortex-A55" ;;
        0x000) echo "Unknown" ;;
        *)     echo "Unknown" ;;
    esac
}

# CPU 使用率（多层回退：lscpu → cpufreq+/proc/cpuinfo → /proc/stat → top → loadavg）
# 同时按核心微架构名称分组 → CPU_CLUSTERS_JSON
get_cpu_usage() {
    local cache_file="${TMPDIR:-/tmp}/.cpu_stat_cache"
    local cpu_fields ci ct pi pt top_out idle_val load1
    local cur_freq max_freq min_freq core_usage total_usage core_count
    local cpu_path cpu_num core_n core_name

    CPU_CLUSTERS_JSON=""

    # ================================================================
    # 方法零：lscpu（最优，直接提供 core 名 + 每核频率）
    # ================================================================
    if command -v lscpu &>/dev/null; then
        total_usage=0
        core_count=0
        local cluster_tmp="${TMPDIR:-/tmp}/.cpu_cluster_tmp"
        rm -rf "$cluster_tmp" 2>/dev/null
        mkdir -p "$cluster_tmp" 2>/dev/null

        # --- 解析 lscpu 获取 cluster Model name (kHz key) ---
        # lscpu 按 cluster 分组输出，配对 Model name + CPU max MHz
        local model_names="" model max_val_khz
        while IFS= read -r line; do
            case "$line" in
                "Model name:"*)
                    model=$(echo "$line" | sed 's/^Model name:\s*//' | xargs)
                    ;;
                "CPU max MHz:"*)
                    max_val_khz=$(echo "$line" | grep -oP '[\d.]+' | awk '{printf "%d", $1 * 1000}')
                    [ -n "$model" ] && [ -n "$max_val_khz" ] && model_names="${model_names}${max_val_khz}=${model}"$'\n'
                    model=""
                    ;;
            esac
        done < <(lscpu 2>/dev/null)

        # --- 用 awk 解析 lscpu -e（空格对齐列，非 tab）---
        # 输出格式: cpu key_khz core_usage maxmhz minmhz
        # key_khz = maxmhz * 1000，与 model_names 的 key 一致
        lscpu -e 2>/dev/null | awk 'NR>1 && NF>=8 && $6+0 > $7+0 {
            printf "%s %.0f %.1f %.4f %.4f\n", $1, $6*1000, ($8-$7)/($6-$7)*100, $6, $7;
        }' > "${cluster_tmp}/.lscpu_parsed"

        while read -r cpu mhz_key core_usage maxmhz minmhz; do
            [ -z "$mhz_key" ] && continue

            total_usage=$(awk "BEGIN { printf \"%.1f\", $total_usage + $core_usage }" 2>/dev/null)
            core_count=$((core_count + 1))

            local cfile="${cluster_tmp}/${mhz_key}"
            if [ -f "$cfile" ]; then
                read -r old_cores old_usum old_fmax old_fmin < "$cfile"
                new_cores=$((old_cores + 1))
                new_usum=$(awk "BEGIN { printf \"%.1f\", $old_usum + $core_usage }" 2>/dev/null)
                [ "$(awk -v a="$maxmhz" -v b="$old_fmax" 'BEGIN { print (a+0 > b+0 ? 1 : 0) }' 2>/dev/null)" = "1" ] && old_fmax="$maxmhz"
                echo "$new_cores $new_usum $old_fmax $old_fmin" > "$cfile"
            else
                echo "1 $core_usage $maxmhz $minmhz" > "$cfile"
            fi
        done < "${cluster_tmp}/.lscpu_parsed"

        if [ "$core_count" -gt 0 ] 2>/dev/null; then
            CPU_USAGE=$(fval "$total_usage / $core_count" "0.0")

            # --- 生成集群 JSON ---
            local first=1 c_cores c_usum c_fmax c_fmin c_usage c_max_int c_min_int cluster_name
            CPU_CLUSTERS_JSON=""
            for cfile in "${cluster_tmp}"/*; do
                [ -f "$cfile" ] || continue
                read -r c_cores c_usum c_fmax c_fmin < "$cfile"
                c_usage=$(fval "$c_usum / $c_cores" "0.0")
                c_max_int=$(echo "$c_fmax" | awk '{printf "%d", $1}')
                c_min_int=$(echo "$c_fmin" | awk '{printf "%d", $1}')

                # 通过文件名（kHz key）匹配 model name
                cluster_name=""
                local key_khz
                key_khz=$(basename "$cfile")
                cluster_name=$(echo "$model_names" | grep "^${key_khz}=" | cut -d= -f2)
                [ -z "$cluster_name" ] && cluster_name="Cluster-${c_max_int}MHz"

                if [ "$first" -eq 1 ]; then first=0; else CPU_CLUSTERS_JSON="${CPU_CLUSTERS_JSON},"; fi
                CPU_CLUSTERS_JSON="${CPU_CLUSTERS_JSON}\"${cluster_name}\":{\"cores\":${c_cores},\"usage\":${c_usage},\"freq_max\":${c_max_int},\"freq_min\":${c_min_int}}"
            done
            if [ -n "$CPU_CLUSTERS_JSON" ]; then
                CPU_CLUSTERS_JSON="{${CPU_CLUSTERS_JSON}}"
            fi

            rm -rf "$cluster_tmp" 2>/dev/null
            return
        fi
        rm -rf "$cluster_tmp" 2>/dev/null
    fi

    # ================================================================
    # 方法零(备)：cpufreq sysfs + /proc/cpuinfo（lscpu 不可用时）
    # ================================================================
    total_usage=0
    core_count=0

    # 读 /proc/cpuinfo 获取每核 CPU part → 核心名
    local cpuinfo_names="" cpu_line cpu_idx part
    if [ -r /proc/cpuinfo ]; then
        while IFS= read -r cpu_line; do
            case "$cpu_line" in
                processor*) cpu_idx=$(echo "$cpu_line" | grep -oP '\d+') ;;
                "CPU part"*)
                    part=$(echo "$cpu_line" | awk '{print $NF}')
                    cpuinfo_names="${cpuinfo_names}${cpu_idx}=$(map_cpu_part "$part")"$'\n'
                    ;;
            esac
        done < /proc/cpuinfo
    fi

    local cluster_tmp="${TMPDIR:-/tmp}/.cpu_cluster_tmp"
    rm -rf "$cluster_tmp" 2>/dev/null
    mkdir -p "$cluster_tmp" 2>/dev/null

    for cpu_path in /sys/devices/system/cpu/cpu[0-9]*/cpufreq; do
        [ -d "$cpu_path" ] || continue
        cpu_num=$(basename "$(dirname "$cpu_path")")
        core_n=$(echo "$cpu_num" | sed 's/cpu//')

        cur_freq=$(cat "$cpu_path/scaling_cur_freq" 2>/dev/null)
        max_freq=$(cat "$cpu_path/cpuinfo_max_freq" 2>/dev/null)
        min_freq=$(cat "$cpu_path/scaling_min_freq" 2>/dev/null)
        [ -z "$cur_freq" ] || [ -z "$max_freq" ] || [ -z "$min_freq" ] && continue
        [ "$max_freq" -le "$min_freq" ] 2>/dev/null && continue

        core_usage=$(awk -v c="$cur_freq" -v x="$max_freq" -v n="$min_freq" \
            'BEGIN { printf "%.1f", (c - n) / (x - n) * 100 }' 2>/dev/null)
        [ -z "$core_usage" ] && continue

        total_usage=$(awk "BEGIN { printf \"%.1f\", $total_usage + $core_usage }" 2>/dev/null)
        core_count=$((core_count + 1))

        core_name=$(echo "$cpuinfo_names" | grep "^${core_n}=" | cut -d= -f2)
        [ -z "$core_name" ] && core_name="Unknown"

        local cfile="${cluster_tmp}/${core_name}"
        if [ -f "$cfile" ]; then
            read -r old_cores old_usum old_fmax old_fmin < "$cfile"
            new_cores=$((old_cores + 1))
            new_usum=$(awk "BEGIN { printf \"%.1f\", $old_usum + $core_usage }" 2>/dev/null)
            [ "$max_freq" -gt "$old_fmax" ] 2>/dev/null && old_fmax="$max_freq"
            [ "$min_freq" -lt "$old_fmin" ] 2>/dev/null || [ "$old_fmin" = "0" ] && old_fmin="$min_freq"
            echo "$new_cores $new_usum $old_fmax $old_fmin" > "$cfile"
        else
            echo "1 $core_usage $max_freq $min_freq" > "$cfile"
        fi
    done

    if [ "$core_count" -gt 0 ] 2>/dev/null; then
        CPU_USAGE=$(fval "$total_usage / $core_count" "0.0")

        local first=1 c_cores c_usum c_fmax c_fmin c_usage c_fmax_mhz c_fmin_mhz
        CPU_CLUSTERS_JSON=""
        for cfile in "${cluster_tmp}"/*; do
            [ -f "$cfile" ] || continue
            core_name=$(basename "$cfile")
            read -r c_cores c_usum c_fmax c_fmin < "$cfile"
            c_usage=$(fval "$c_usum / $c_cores" "0.0")
            c_fmax_mhz=$((c_fmax / 1000))
            c_fmin_mhz=$((c_fmin / 1000))
            if [ "$first" -eq 1 ]; then first=0; else CPU_CLUSTERS_JSON="${CPU_CLUSTERS_JSON},"; fi
            CPU_CLUSTERS_JSON="${CPU_CLUSTERS_JSON}\"${core_name}\":{\"cores\":${c_cores},\"usage\":${c_usage},\"freq_max\":${c_fmax_mhz},\"freq_min\":${c_fmin_mhz}}"
        done
        if [ -n "$CPU_CLUSTERS_JSON" ]; then
            CPU_CLUSTERS_JSON="{${CPU_CLUSTERS_JSON}}"
        fi

        rm -rf "$cluster_tmp" 2>/dev/null
        return
    fi

    rm -rf "$cluster_tmp" 2>/dev/null

    # 方法一：/proc/stat（最可靠，标准 Linux / 部分 Termux）
    if [ -r /proc/stat ]; then
        cpu_fields=$(awk '/^cpu /{print $2, $3, $4, $5, $6, $7, $8, $9}' /proc/stat 2>/dev/null)
        if [ -n "$cpu_fields" ]; then
            ci=$(echo "$cpu_fields" | awk '{print $4}')
            ct=$(echo "$cpu_fields" | awk '{print $1+$2+$3+$4+$5+$6+$7+$8}')

            if [ -f "$cache_file" ]; then
                pi=$(sed -n 's/^IDLE=//p' "$cache_file" 2>/dev/null)
                pt=$(sed -n 's/^TOTAL=//p' "$cache_file" 2>/dev/null)
            fi

            { echo "IDLE=$ci"; echo "TOTAL=$ct"; } > "$cache_file"

            if [ -n "$pi" ] && [ -n "$pt" ]; then
                CPU_USAGE=$(awk -v pi="$pi" -v pt="$pt" -v ci="$ci" -v ct="$ct" \
                    'BEGIN {
                        di = ci - pi; dt = ct - pt;
                        if (dt <= 0) printf "0.0";
                        else printf "%.1f", 100 * (1 - di / dt);
                    }' 2>/dev/null || echo "0.0")
                return
            fi
            CPU_USAGE="0.0"
            return
        fi
    fi

    # 方法二：top -bn1（Termux toybox / 标准 Linux 回退）
    if command -v top &>/dev/null; then
        top_out=$(top -bn1 2>/dev/null)
        if [ -n "$top_out" ]; then
            # 标准 Linux top: "92.0 id"
            idle_val=$(echo "$top_out" | grep -oP '\d+\.?\d+\s+id\b' | head -1 | grep -oP '\d+\.?\d+')
            if [ -n "$idle_val" ]; then
                CPU_USAGE=$(fval "100 - $idle_val" "0.0")
                return
            fi
            # toybox top: "800%idle"（全核汇总，需除以核心数）
            idle_val=$(echo "$top_out" | grep -oP '\d+\.?\d*%idle' | head -1 | grep -oP '\d+\.?\d*')
            if [ -n "$idle_val" ] && [ -n "$CPU_CORES" ] && [ "$CPU_CORES" -gt 0 ] 2>/dev/null; then
                CPU_USAGE=$(fval "100 - ($idle_val / $CPU_CORES)" "0.0")
                # 交叉验证：若 top 报告近乎空闲但 uptime load 明显偏高，
                # 说明 top 数据为 Android sandbox 假值，改用 load average
                local top_idle_pct
                load1=$(uptime 2>/dev/null | grep -oP 'load average: \K[\d.]+')
                if [ -n "$load1" ]; then
                    top_idle_pct=$(echo "$CPU_USAGE" | cut -d. -f1)
                    if [ "$top_idle_pct" -le 5 ] 2>/dev/null; then
                        if [ "$(awk -v l="$load1" 'BEGIN { print (l >= 1 ? 1 : 0) }' 2>/dev/null)" = "1" ]; then
                            CPU_USAGE=$(fval "($load1 / $CPU_CORES) * 100" "0.0")
                            [ "$(echo "$CPU_USAGE" | cut -d. -f1)" -gt 100 ] 2>/dev/null && CPU_USAGE="100.0"
                        fi
                    fi
                fi
                return
            fi
        fi
    fi

    # 方法三：uptime load average（最通用回退，Android/Termux 均可用）
    load1=$(uptime 2>/dev/null | grep -oP 'load average: \K[\d.]+')
    if [ -n "$load1" ] && [ -n "$CPU_CORES" ] && [ "$CPU_CORES" -gt 0 ] 2>/dev/null; then
        CPU_USAGE=$(fval "($load1 / $CPU_CORES) * 100" "0.0")
        [ "$(echo "$CPU_USAGE" | cut -d. -f1)" -gt 100 ] 2>/dev/null && CPU_USAGE="100.0"
        return
    fi

    CPU_USAGE="0.0"
}

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

# 公网 IPv6（直接 curl，短超时；Termux 无 root 无法预检查 /proc 或 ifconfig）
IPV6_ADDR=$(curl -6 -s --connect-timeout 1 ifconfig.me 2>/dev/null || echo "")

# ============================================================
# 3. CPU 信息
# ============================================================
CPU_CORES=$(nproc 2>/dev/null || echo "?")
CPU_MODEL=$(getprop ro.board.platform 2>/dev/null || echo "")
[ -z "$CPU_MODEL" ] && CPU_MODEL=$(getprop ro.product.cpu.abi 2>/dev/null || echo "ARM")

get_cpu_usage

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
        if [ -n "$MEM_TOTAL" ] && [ -n "$MEM_USED" ] && [ "$MEM_TOTAL" -eq "$MEM_TOTAL" ] 2>/dev/null && [ "$MEM_USED" -eq "$MEM_USED" ] 2>/dev/null; then
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

# Swap 解析（同一 free -m 输出中提取）
SWAP_TOTAL_FMT="0"
SWAP_USED_FMT="0"
if [ -n "$FREE_OUT" ]; then
    SWAP_TOTAL=$(echo "$FREE_OUT" | awk '/^Swap:/{print $2}')
    SWAP_USED=$(echo  "$FREE_OUT" | awk '/^Swap:/{print $3}')
    if [ -n "$SWAP_TOTAL" ] && [ -n "$SWAP_USED" ] && [ "$SWAP_TOTAL" -eq "$SWAP_TOTAL" ] 2>/dev/null && [ "$SWAP_USED" -eq "$SWAP_USED" ] 2>/dev/null; then
        if [ "$SWAP_TOTAL" -ge 0 ] 2>/dev/null; then
            if [ "$SWAP_TOTAL" -ge 1024 ] 2>/dev/null; then
                SWAP_TOTAL_FMT=$(fval "$SWAP_TOTAL / 1024" "0")
                SWAP_USED_FMT=$(fval  "$SWAP_USED  / 1024" "0")
            else
                SWAP_TOTAL_FMT="$SWAP_TOTAL"
                SWAP_USED_FMT="$SWAP_USED"
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
        [ -n "$BAT_TEMP_RAW" ] && BAT_TEMP="$BAT_TEMP_RAW"
    fi
fi

# ============================================================
# 8. 正在运行的服务（自动检测，无需 root）
#    策略：扫描所有进程 → 过滤噪音 → 去重 → 必要时从参数解析真实名称
#    如需排除某服务，添加到下面 NOISE 列表中即可
# ============================================================
SVC_ARRAY=""
SVC_COUNT=0

add_svc() {
    local name
    name=$(echo "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
    [ -n "$SVC_ARRAY" ] && SVC_ARRAY="${SVC_ARRAY},"
    SVC_ARRAY="${SVC_ARRAY}\"${name}\""
    SVC_COUNT=$((SVC_COUNT + 1))
}

# 噪音列表（basename 后匹配，不视为服务的进程）
NOISE="bash|zsh|sh|dash|fish|-bash|-zsh|-sh|su|sudo|login|ps|grep|awk|sed|find|cat|ls|top|head|tail|wc|sort|uniq|xargs|cut|tr|sleep|echo|pstree|pgrep|kill|killall|tmux|screen|dbus-daemon|logcat|getprop|erl_child_setup|inet_gethost|epmd|disksup"

detect_services() {
    local seen="" comm raw name pid

    while IFS= read -r raw; do
        [ -z "$raw" ] && continue

        # 1. 路径压缩：取 basename（/usr/bin/proot → proot）
        comm=$(basename "$raw" 2>/dev/null || echo "$raw")

        # 2. nginx 变体归一化
        case "$comm" in nginx:*) comm="nginx" ;; esac

        # 3. 跳过噪音和系统进程
        echo "$comm" | grep -qE "^(${NOISE})$" && continue
        echo "$comm" | grep -q '^com\.' && continue

        name="$comm"

        # 4. 通用进程名 → 从命令参数解析真实服务
        case "$comm" in
            python|python3)
                for pid in $(pgrep -x "$comm" 2>/dev/null); do
                    pname=$(ps -p "$pid" -o args= 2>/dev/null | grep -oP '[^/ ]+\.py' | head -1)
                    [ -z "$pname" ] && pname="$comm"
                    echo " $seen " | grep -qF " $pname " && continue
                    seen="${seen} ${pname}"
                    add_svc "$pname"
                done
                continue
                ;;
            beam\.smp)
                pid=$(pgrep -x beam.smp 2>/dev/null | head -1)
                [ -n "$pid" ] && name=$(ps -p "$pid" -o args= 2>/dev/null | grep -oP '/opt/\K[^/]+' | head -1)
                [ -z "$name" ] && name="beam.smp"
                ;;
        esac

        # 去重
        echo " $seen " | grep -qF " $name " && continue
        seen="${seen} ${name}"
        add_svc "$name"
    done < <(ps -e -o comm= --no-headers 2>/dev/null | sort -u)
}

detect_services

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
V_SWAP_USED=$(clean_num "$SWAP_USED_FMT" "0")
V_SWAP_TOTAL=$(clean_num "$SWAP_TOTAL_FMT" "0")
V_DISK_USED=$(clean_num "$DISK_USED_GB" "0")
V_DISK_TOTAL=$(clean_num "$DISK_TOTAL_GB" "0")
V_UPTIME=$(clean_str "$UPTIME" "-")
V_BAT_LEVEL=$(clean_num "${BAT_LEVEL:--1}" "-1")
V_BAT_STATUS=$(clean_str "${BAT_STATUS:-}" "-")
V_BAT_TEMP=$(clean_num "${BAT_TEMP:-0}" "0")
V_SVC_COUNT="$SVC_COUNT"

mkdir -p "$(dirname "$OUTPUT")" 2>/dev/null || true

TS=$(date -Iseconds 2>/dev/null || date +"%Y-%m-%dT%H:%M:%S%z" 2>/dev/null || date 2>/dev/null || echo "?")

# 构建 CPU JSON 行（可选集群信息）
CPU_JSON_LINE="\"cpu\": {\"usage\": ${V_CPU_USAGE}, \"cores\": ${V_CPU_CORES}, \"model\": \"${V_CPU_MODEL}\"}"
if [ -n "$CPU_CLUSTERS_JSON" ]; then
    CPU_JSON_LINE="\"cpu\": {\"usage\": ${V_CPU_USAGE}, \"cores\": ${V_CPU_CORES}, \"model\": \"${V_CPU_MODEL}\", \"clusters\": ${CPU_CLUSTERS_JSON}}"
fi

# 构建内存 JSON 行（可选 SWAP 信息）
MEM_JSON_LINE="\"memory\": {\"used\": ${V_MEM_USED}, \"total\": ${V_MEM_TOTAL}, \"unit\": \"${V_MEM_UNIT}\"}"
if [ "$V_SWAP_TOTAL" != "0" ] && [ -n "$V_SWAP_TOTAL" ]; then
    MEM_JSON_LINE="\"memory\": {\"used\": ${V_MEM_USED}, \"total\": ${V_MEM_TOTAL}, \"unit\": \"${V_MEM_UNIT}\", \"swap_used\": ${V_SWAP_USED}, \"swap_total\": ${V_SWAP_TOTAL}}"
fi

# 原子写入：先写临时文件再 mv（同文件系统内为原子操作），避免前端读到不完整 JSON
cat > "${OUTPUT}.tmp" <<EOF
{
  "timestamp": "${TS}",
  "device": {"model": "${V_DEV_MODEL}", "android": "${V_ANDROID}", "kernel": "${V_KERNEL}"},
  ${CPU_JSON_LINE},
  ${MEM_JSON_LINE},
  "disk": {"used": ${V_DISK_USED}, "total": ${V_DISK_TOTAL}, "unit": "GB"},
  "network": {"ip": "${V_LOCAL_IP}", "ipv6": "${V_IPV6}", "iface": "${V_IFACE}"},
  "services": {"running": [${SVC_ARRAY}], "count": ${V_SVC_COUNT}},
  "battery": {"level": ${V_BAT_LEVEL}, "status": "${V_BAT_STATUS}", "temp": ${V_BAT_TEMP}},
  "uptime": "${V_UPTIME}"
}
EOF
mv "${OUTPUT}.tmp" "$OUTPUT"
