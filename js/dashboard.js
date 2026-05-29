/* ============================================================
   dashboard.js —— 系统资源仪表盘模块（Termux 优化版）
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，缓存 DOM 引用
     [初始化] 外部调用 Dashboard.init() → 立即拉取 + 定时轮询
     [运行] Dashboard.fetchData() 每 10s 请求 /api/dashboard
           Dashboard.update(data) 渲染全部 6 张卡片
     [销毁] 页面关闭时自动停止
   ────────────────────────────────────────────────────────────
   数据源：GET /api/dashboard → 由 corn.sh 生成
   依赖：无
   使用：Dashboard.init()
   ============================================================ */

(function(global) {
    'use strict';

    /* ---- DOM 元素引用 ---- */
    var els = {
        deviceValue:   document.getElementById('deviceValue'),
        deviceSub:     document.getElementById('deviceSub'),
        cpuValue:      document.getElementById('cpuValue'),
        cpuSub:        document.getElementById('cpuSub'),
        cpuFill:       document.getElementById('cpuFill'),
        memValue:      document.getElementById('memValue'),
        memFill:       document.getElementById('memFill'),
        diskValue:     document.getElementById('diskValue'),
        diskFill:      document.getElementById('diskFill'),
        uptimeValue:   document.getElementById('uptimeValue'),
        batteryCard:   document.getElementById('batteryCard'),
        batteryValue:  document.getElementById('batteryValue'),
        batterySub:    document.getElementById('batterySub'),
        batteryFill:   document.getElementById('batteryFill')
    };

    var _timer = null;

    /* ---- 安全设置文本 ---- */
    function set(el, text) { if (el) el.textContent = text; }

    /* ---- 安全设置进度 ---- */
    function setBar(el, pct) {
        if (!el) return;
        pct = Math.min(100, Math.max(0, parseFloat(pct) || 0));
        el.style.width = pct + '%';
    }

    /* ---- 更新界面数据 ---- */
    function update(data) {
        try {
            // 设备信息
            if (data.device) {
                set(els.deviceValue, data.device.model || '--');
                var sub = [];
                if (data.device.android) sub.push('Android ' + data.device.android);
                if (data.device.kernel)  sub.push('Kernel ' + data.device.kernel);
                set(els.deviceSub, sub.join(' · '));
            }

            // CPU
            if (data.cpu) {
                var usage = parseFloat(data.cpu.usage) || 0;
                set(els.cpuValue, usage.toFixed(1) + '%');
                setBar(els.cpuFill, usage);
                var cpuSub = [];
                if (data.cpu.cores) cpuSub.push(data.cpu.cores + ' 核');
                if (data.cpu.model) cpuSub.push(data.cpu.model);
                set(els.cpuSub, cpuSub.join(' · '));
            }

            // 内存
            if (data.memory) {
                var memPct = (parseFloat(data.memory.used) / parseFloat(data.memory.total) * 100) || 0;
                set(els.memValue, data.memory.used + ' / ' + data.memory.total + ' ' + (data.memory.unit || 'MB'));
                setBar(els.memFill, memPct);
            }

            // 储存
            if (data.disk) {
                var diskTotal = parseFloat(data.disk.total);
                var diskUsed  = parseFloat(data.disk.used);
                var diskPct = diskTotal > 0 ? (diskUsed / diskTotal * 100) : 0;
                set(els.diskValue, data.disk.used + ' / ' + data.disk.total + ' ' + (data.disk.unit || 'GB'));
                setBar(els.diskFill, diskPct);
            }

            // 运行时间
            set(els.uptimeValue, data.uptime || '--');

            // 电池（可选，仅 termux-api 装好后才有数据）
            if (data.battery && data.battery.level !== undefined) {
                if (els.batteryCard) els.batteryCard.style.display = '';
                set(els.batteryValue, data.battery.level + '%');
                setBar(els.batteryFill, data.battery.level);

                var batSub = [];
                if (data.battery.status) {
                    // 中文状态映射
                    var statusMap = {
                        'CHARGING': '充电中', 'DISCHARGING': '放电中',
                        'FULL': '已充满', 'NOT_CHARGING': '未充电'
                    };
                    batSub.push(statusMap[data.battery.status] || data.battery.status);
                }
                if (data.battery.temp) batSub.push(data.battery.temp + '°C');
                set(els.batterySub, batSub.join(' · '));
            } else {
                if (els.batteryCard) els.batteryCard.style.display = 'none';
            }

        } catch (e) {
            console.warn('Dashboard: 数据格式错误', e);
        }
    }

    /* ---- 重置为占位状态 ---- */
    function reset() {
        set(els.deviceValue, '--');
        set(els.deviceSub, '');
        set(els.cpuValue, '--');
        set(els.cpuSub, '');
        setBar(els.cpuFill, 0);
        set(els.memValue, '--');
        setBar(els.memFill, 0);
        set(els.diskValue, '--');
        setBar(els.diskFill, 0);
        set(els.uptimeValue, '--');
        set(els.batteryValue, '--');
        set(els.batterySub, '');
        setBar(els.batteryFill, 0);
        if (els.batteryCard) els.batteryCard.style.display = 'none';
    }

    /* ---- 获取仪表盘数据 ---- */
    async function fetchData() {
        try {
            var resp = await fetch('/api/dashboard');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            update(await resp.json());
        } catch (err) {
            console.warn('Dashboard: 数据获取失败', err);
            reset();
        }
    }

    /* ---- 初始化：首次拉取 + 定时轮询 ---- */
    function init() {
        fetchData();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(fetchData, 10000);
    }

    global.Dashboard = { init: init, update: update, fetchData: fetchData };

})(window);
