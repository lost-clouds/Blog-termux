/* ============================================================
   dashboard.js —— 系统资源仪表盘模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，缓存 DOM 引用
     [初始化] 外部调用 Dashboard.init() → 立即拉取 + 定时轮询
     [运行] Dashboard.fetchData() 每 10s 请求 /api/dashboard
           Dashboard.update(data) 渲染 CPU/内存/磁盘/运行时间
     [销毁] 页面关闭时自动停止（无需手动清理）
   ────────────────────────────────────────────────────────────
   数据源：GET /api/dashboard → {"cpu":N,"memory":{...},"disk":{...},"uptime":"..."}
   依赖：无
   使用：Dashboard.init()
   ============================================================ */

(function(global) {
    'use strict';

    /* ---- DOM 元素引用 ---- */
    const els = {
        cpuValue:  document.getElementById('cpuValue'),
        cpuFill:   document.getElementById('cpuFill'),
        memValue:  document.getElementById('memValue'),
        memFill:   document.getElementById('memFill'),
        diskValue: document.getElementById('diskValue'),
        diskFill:  document.getElementById('diskFill'),
        uptimeValue: document.getElementById('uptimeValue')
    };

    let _timer = null;

    /* ---- 更新界面数据 ---- */
    function update(data) {
        try {
            // CPU 使用率
            if (els.cpuValue) els.cpuValue.textContent = data.cpu.toFixed(1) + '%';
            if (els.cpuFill)  els.cpuFill.style.width = Math.min(100, Math.max(0, data.cpu)) + '%';

            // 内存
            if (data.memory) {
                const memPct = (data.memory.used / data.memory.total * 100).toFixed(1);
                if (els.memValue) els.memValue.textContent = data.memory.used + ' / ' + data.memory.total + ' ' + (data.memory.unit || 'MB');
                if (els.memFill)  els.memFill.style.width = Math.min(100, Math.max(0, memPct)) + '%';
            }

            // 磁盘
            if (data.disk) {
                const diskPct = (data.disk.used / data.disk.total * 100).toFixed(1);
                if (els.diskValue) els.diskValue.textContent = data.disk.used + ' / ' + data.disk.total + ' ' + (data.disk.unit || 'GB');
                if (els.diskFill)  els.diskFill.style.width = Math.min(100, Math.max(0, diskPct)) + '%';
            }

            // 运行时间
            if (els.uptimeValue) els.uptimeValue.textContent = data.uptime || '--';
        } catch (e) {
            console.warn('Dashboard: 数据格式错误', e);
        }
    }

    /* ---- 重置为占位状态 ---- */
    function reset() {
        if (els.cpuValue)  els.cpuValue.textContent = '--';
        if (els.cpuFill)   els.cpuFill.style.width = '0%';
        if (els.memValue)  els.memValue.textContent = '--';
        if (els.memFill)   els.memFill.style.width = '0%';
        if (els.diskValue) els.diskValue.textContent = '--';
        if (els.diskFill)  els.diskFill.style.width = '0%';
        if (els.uptimeValue) els.uptimeValue.textContent = '--';
    }

    /* ---- 获取仪表盘数据 ---- */
    async function fetchData() {
        try {
            const resp = await fetch('/api/dashboard');
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
