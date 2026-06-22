import { API } from './constants.js';

/* ============================================================
   dashboard.js —— 系统资源仪表盘模块（8 卡片版）
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] ES Module 被 app.js 静态导入
     [init] 启动轮询（默认 Tab）+ 监听页面可见性
     [enter] 进入 dashboard Tab → start()
     [leave] 离开 dashboard Tab → stop()
     [update] 解析 JSON 渲染 8 张卡片
   ────────────────────────────────────────────────────────────
   卡片顺序：设备 → CPU → 内存 → 储存 → 网络 → 电池 → 服务 → 运行时间
   数据源: GET /api/dashboard → corn.sh 生成
   依赖: constants (API)
   使用：import { Dashboard } from './dashboard.js'
   ============================================================ */

'use strict';

    /* ---- DOM 引用 ---- */
    let els = {
        deviceValue:  document.getElementById('deviceValue'),
        deviceSub:    document.getElementById('deviceSub'),
        cpuValue:     document.getElementById('cpuValue'),
        cpuSub:       document.getElementById('cpuSub'),
        cpuFill:      document.getElementById('cpuFill'),
        cpuClusters:  document.getElementById('cpuClusters'),
        memValue:     document.getElementById('memValue'),
        memFill:      document.getElementById('memFill'),
        swapValue:    document.getElementById('swapValue'),
        swapFill:     document.getElementById('swapFill'),
        swapRow:      document.getElementById('swapRow'),
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

    let _timer = null;
    let _fetchErrors = 0;
    let _fetching = false;
    let _paused = false;
    let _tabActive = false;

    function set(el, text) { if (el) el.textContent = text || '--'; }
    function setBar(el, pct) {
        if (!el) return;
        pct = Math.min(100, Math.max(0, parseFloat(pct) || 0));
        el.style.width = pct + '%';
    }

    /* ---- 更新 8 张卡片 ---- */
    function update(data) {
        try {
            // 数据新鲜度指示器
            let ageEl = document.getElementById('dataAge');
            if (data.timestamp && ageEl) {
                let ts = new Date(data.timestamp).getTime();
                let age = isNaN(ts) ? -1 : Math.floor((Date.now() - ts) / 1000);
                let ageText = '', ageClass = '';
                if (age < 0) { ageText = ''; ageClass = ''; }
                else if (age <= 60) { ageText = age + 's 前'; ageClass = 'age-fresh'; }
                else if (age <= 120) { ageText = Math.floor(age / 60) + 'm 前'; ageClass = 'age-warn'; }
                else if (age > 120) { ageText = Math.floor(age / 60) + 'm 前'; ageClass = 'age-stale'; }
                ageEl.textContent = ageText;
                ageEl.className = 'data-age' + (ageClass ? ' ' + ageClass : '');
            }
            // 1. 设备
            if (data.device) {
                set(els.deviceValue, data.device.model || '--');
                let dsub = [];
                if (data.device.android) dsub.push('Android ' + data.device.android);
                if (data.device.kernel)  dsub.push('Kernel ' + data.device.kernel);
                set(els.deviceSub, dsub.join(' · '));
            }

            // 2. CPU
            if (data.cpu) {
                let usage = parseFloat(data.cpu.usage) || 0;
                set(els.cpuValue, usage.toFixed(1) + '%');
                setBar(els.cpuFill, usage);
                let csub = [];
                if (data.cpu.cores) csub.push(data.cpu.cores + ' 核');
                if (data.cpu.model && data.cpu.model !== '?' && data.cpu.model !== 'ARM') csub.push(data.cpu.model);
                set(els.cpuSub, csub.join(' · '));
            }

            // 2.5 CPU 集群信息
            const clustersEl = els.cpuClusters;
            if (clustersEl && data.cpu && data.cpu.clusters && Object.keys(data.cpu.clusters).length > 0) {
                clustersEl.innerHTML = '';
                for (const [name, info] of Object.entries(data.cpu.clusters)) {
                    const row = document.createElement('div');
                    row.className = 'cluster-row';
                    const cores = info.cores || 0;
                    const usage = parseFloat(info.usage) || 0;
                    const fmax = info.freq_max ? (info.freq_max / 1000).toFixed(1) : '?';
                    row.innerHTML =
                        '<span class="cluster-label">' + name + '</span>' +
                        '<span class="cluster-detail">' + cores + ' 核 @ ' + fmax + 'GHz</span>' +
                        '<span class="cluster-usage">' + usage.toFixed(1) + '%</span>';
                    clustersEl.appendChild(row);
                }
                clustersEl.style.display = '';
            } else if (clustersEl) {
                clustersEl.style.display = 'none';
            }

            // 3. 内存
            if (data.memory) {
                let memUsed  = parseFloat(data.memory.used);
                let memTotal = parseFloat(data.memory.total);
                let memPct   = memTotal > 0 ? (memUsed / memTotal * 100) : 0;
                set(els.memValue, data.memory.used + ' / ' + data.memory.total + ' ' + (data.memory.unit || 'MB'));
                setBar(els.memFill, memPct);

                // 3.5 SWAP
                if (els.swapRow && data.memory.swap_total && parseFloat(data.memory.swap_total) > 0) {
                    let swapUsed  = parseFloat(data.memory.swap_used) || 0;
                    let swapTotal = parseFloat(data.memory.swap_total);
                    let swapPct   = swapTotal > 0 ? (swapUsed / swapTotal * 100) : 0;
                    set(els.swapValue, swapUsed.toFixed(1) + ' / ' + swapTotal.toFixed(1) + ' ' + (data.memory.unit || 'GB'));
                    if (els.swapFill) {
                        els.swapFill.style.width = Math.min(100, Math.max(0, swapPct)) + '%';
                    }
                    els.swapRow.style.display = '';
                } else if (els.swapRow) {
                    els.swapRow.style.display = 'none';
                }
            }

            // 4. 储存
            if (data.disk) {
                let diskUsed  = parseFloat(data.disk.used);
                let diskTotal = parseFloat(data.disk.total);
                let diskPct   = diskTotal > 0 ? (diskUsed / diskTotal * 100) : 0;
                set(els.diskValue, data.disk.used + ' / ' + data.disk.total + ' ' + (data.disk.unit || 'GB'));
                setBar(els.diskFill, diskPct);
            }

            // 5. 网络（独立卡片）
            if (data.network && data.network.ip && data.network.ip !== '--' && data.network.ip !== '-') {
                set(els.netValue, data.network.ip);
                let nsub = [];
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
                let bsub = [];
                if (data.battery.status) {
                    let smap = { CHARGING:'充电中', DISCHARGING:'放电中', FULL:'已充满', NOT_CHARGING:'未充电' };
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
                let count = data.services.count || 0;
                let names = data.services.running || [];
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

    /* ---- 获取数据（含请求去重 + 8s 超时）---- */
    async function fetchData() {
        if (_fetching) return;
        _fetching = true;
        let controller = new AbortController();
        let timeout = setTimeout(function() { controller.abort(); }, 8000);
        try {
            let resp = await fetch(API.DASHBOARD, { signal: controller.signal });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            let json = await resp.json();
            _fetchErrors = 0;
            update(json);
        } catch (err) {
            if (err.name === 'AbortError') {
                console.warn('Dashboard: 请求超时');
            }
            _fetchErrors++;
            console.warn('Dashboard: 获取失败 (' + _fetchErrors + ') — ' + err.message);
            if (_fetchErrors === 1) {
                set(els.deviceValue, '无数据');
                set(els.deviceSub, '检查 corn.sh / nginx /api/dashboard');
            } else if (_fetchErrors <= 5) {
                // 中间错误状态：更新数据新鲜度指示器显示过期
                let ageEl = document.getElementById('dataAge');
                if (ageEl) {
                    ageEl.textContent = '数据可能过期';
                    ageEl.className = 'data-age age-stale';
                }
            } else {
                reset();
            }
        } finally {
            clearTimeout(timeout);
            _fetching = false;
        }
    }

    /* ---- 启动轮询 ---- */
    function start() {
        _paused = false;
        _fetchErrors = 0;
        fetchData();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(fetchData, 30000);
    }

    /* ---- 停止轮询 ---- */
    function stop() {
        _paused = true;
        if (_timer) { clearInterval(_timer); _timer = null; }
    }

    /* ---- 页面可见性变化处理 ---- */
    function onVisibilityChange() {
        if (document.hidden) {
            stop();
        } else if (_tabActive) {
            start();
        }
    }

    /* ---- Tab 进入/离开（由 app.js switchTab 调用）---- */
    function onTabEnter() {
        _tabActive = true;
        if (!document.hidden) start();
    }

    function onTabLeave() {
        _tabActive = false;
        stop();
    }

    /* ---- 初始化（仅注册监听器，不启动轮询）---- */
    function init() {
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    const Dashboard = {
        init: init, update: update, fetchData: fetchData,
        start: start, stop: stop,
        onTabEnter: onTabEnter, onTabLeave: onTabLeave
    };

export { Dashboard };
