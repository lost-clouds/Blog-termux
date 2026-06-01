/* ============================================================
   dashboard.js —— 系统资源仪表盘模块（8 卡片版）
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] IIFE 执行，缓存 DOM 引用
     [init] 立即拉取 /api/dashboard + 每 10s 轮询
     [update] 解析 JSON 渲染 8 张卡片
   ────────────────────────────────────────────────────────────
   卡片顺序：设备 → CPU → 内存 → 储存 → 网络 → 电池 → 服务 → 运行时间
   数据源: GET /api/dashboard → corn.sh 生成
   依赖: 无
   使用: Dashboard.init()
   ============================================================ */

(function(global) {
    'use strict';

    /* ---- DOM 引用 ---- */
    var els = {
        deviceValue:  document.getElementById('deviceValue'),
        deviceSub:    document.getElementById('deviceSub'),
        cpuValue:     document.getElementById('cpuValue'),
        cpuSub:       document.getElementById('cpuSub'),
        cpuFill:      document.getElementById('cpuFill'),
        memValue:     document.getElementById('memValue'),
        memFill:      document.getElementById('memFill'),
        diskValue:    document.getElementById('diskValue'),
        diskFill:     document.getElementById('diskFill'),
        netValue:     document.getElementById('netValue'),
        netSub:       document.getElementById('netSub'),
        batteryValue: document.getElementById('batteryValue'),
        batterySub:   document.getElementById('batterySub'),
        batteryFill:  document.getElementById('batteryFill'),
        svcValue:     document.getElementById('svcValue'),
        svcSub:       document.getElementById('svcSub'),
        uptimeValue:  document.getElementById('uptimeValue')
    };

    var _timer = null;
    var _fetchErrors = 0;

    function set(el, text) { if (el) el.textContent = text || '--'; }
    function setBar(el, pct) {
        if (!el) return;
        pct = Math.min(100, Math.max(0, parseFloat(pct) || 0));
        el.style.width = pct + '%';
    }

    /* ---- 更新 8 张卡片 ---- */
    function update(data) {
        try {
            // 1. 设备
            if (data.device) {
                set(els.deviceValue, data.device.model || '--');
                var dsub = [];
                if (data.device.android) dsub.push('Android ' + data.device.android);
                if (data.device.kernel)  dsub.push('Kernel ' + data.device.kernel);
                set(els.deviceSub, dsub.join(' · '));
            }

            // 2. CPU
            if (data.cpu) {
                var usage = parseFloat(data.cpu.usage) || 0;
                set(els.cpuValue, usage.toFixed(1) + '%');
                setBar(els.cpuFill, usage);
                var csub = [];
                if (data.cpu.cores) csub.push(data.cpu.cores + ' 核');
                if (data.cpu.model && data.cpu.model !== '?' && data.cpu.model !== 'ARM') csub.push(data.cpu.model);
                set(els.cpuSub, csub.join(' · '));
            }

            // 3. 内存
            if (data.memory) {
                var memUsed  = parseFloat(data.memory.used);
                var memTotal = parseFloat(data.memory.total);
                var memPct   = memTotal > 0 ? (memUsed / memTotal * 100) : 0;
                set(els.memValue, data.memory.used + ' / ' + data.memory.total + ' ' + (data.memory.unit || 'MB'));
                setBar(els.memFill, memPct);
            }

            // 4. 储存
            if (data.disk) {
                var diskUsed  = parseFloat(data.disk.used);
                var diskTotal = parseFloat(data.disk.total);
                var diskPct   = diskTotal > 0 ? (diskUsed / diskTotal * 100) : 0;
                set(els.diskValue, data.disk.used + ' / ' + data.disk.total + ' ' + (data.disk.unit || 'GB'));
                setBar(els.diskFill, diskPct);
            }

            // 5. 网络（独立卡片）
            if (data.network && data.network.ip && data.network.ip !== '--' && data.network.ip !== '-') {
                set(els.netValue, data.network.ip);
                var nsub = [];
                if (data.network.iface) nsub.push(data.network.iface);
                if (data.network.ipv6 && data.network.ipv6 !== '--') nsub.push('IPv6: ' + data.network.ipv6);
                set(els.netSub, nsub.join(' · '));
            } else {
                set(els.netValue, '--');
                set(els.netSub, '');
            }

            // 6. 电池（始终显示）
            if (data.battery && data.battery.level !== undefined && data.battery.level >= 0) {
                set(els.batteryValue, data.battery.level + '%');
                setBar(els.batteryFill, data.battery.level);
                var bsub = [];
                if (data.battery.status) {
                    var smap = { CHARGING:'充电中', DISCHARGING:'放电中', FULL:'已充满', NOT_CHARGING:'未充电' };
                    bsub.push(smap[data.battery.status] || data.battery.status);
                }
                if (data.battery.temp && parseFloat(data.battery.temp) > 0) bsub.push(data.battery.temp + '°C');
                set(els.batterySub, bsub.join(' · '));
            } else {
                set(els.batteryValue, '--');
                set(els.batterySub, '?');
                setBar(els.batteryFill, 0);
            }

            // 7. 正在运行的服务
            if (data.services) {
                var count = data.services.count || 0;
                var names = data.services.running || [];
                set(els.svcValue, count + ' 个运行中');
                set(els.svcSub, names.length > 0 ? names.join(', ') : '');
            } else {
                set(els.svcValue, '--');
                set(els.svcSub, '');
            }

            // 8. 运行时间
            set(els.uptimeValue, data.uptime || '--');

        } catch (e) {
            console.warn('Dashboard: 数据格式错误', e);
        }
    }

    /* ---- 全部置为占位符 ---- */
    function reset() {
        set(els.deviceValue, '--'); set(els.deviceSub, '');
        set(els.cpuValue, '--'); set(els.cpuSub, ''); setBar(els.cpuFill, 0);
        set(els.memValue, '--'); setBar(els.memFill, 0);
        set(els.diskValue, '--'); setBar(els.diskFill, 0);
        set(els.netValue, '--'); set(els.netSub, '');
        set(els.batteryValue, '--'); set(els.batterySub, ''); setBar(els.batteryFill, 0);
        set(els.svcValue, '--'); set(els.svcSub, '');
        set(els.uptimeValue, '--');
    }

    /* ---- 获取数据 ---- */
    async function fetchData() {
        try {
            var resp = await fetch('/api/dashboard');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var json = await resp.json();
            _fetchErrors = 0;
            update(json);
        } catch (err) {
            _fetchErrors++;
            console.warn('Dashboard: 获取失败 (' + _fetchErrors + ') — ' + err.message);
            if (_fetchErrors === 1) {
                set(els.deviceValue, '无数据');
                set(els.deviceSub, '检查 corn.sh / nginx /api/dashboard');
            } else if (_fetchErrors > 5) {
                reset();
            }
        }
    }

    /* ---- 初始化 ---- */
    function init() {
        fetchData();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(fetchData, 10000);
    }

    global.Dashboard = { init: init, update: update, fetchData: fetchData };

})(window);
