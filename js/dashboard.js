import { API } from './constants.js';

/**
 * @module dashboard
 * @description 系统资源仪表盘：轮询 /api/dashboard 接口并渲染 8 张状态卡片
 * @requires module:constants
 *
 * 使用：import { Dashboard } from './dashboard.js'
 */

('use strict');

/* ---- DOM 引用 ---- */
const els = {
    dataAge: document.getElementById('dataAge'),
    deviceValue: document.getElementById('deviceValue'),
    deviceSub: document.getElementById('deviceSub'),
    cpuValue: document.getElementById('cpuValue'),
    cpuSub: document.getElementById('cpuSub'),
    cpuFill: document.getElementById('cpuFill'),
    cpuClusters: document.getElementById('cpuClusters'),
    memValue: document.getElementById('memValue'),
    memFill: document.getElementById('memFill'),
    swapValue: document.getElementById('swapValue'),
    swapFill: document.getElementById('swapFill'),
    swapRow: document.getElementById('swapRow'),
    diskValue: document.getElementById('diskValue'),
    diskFill: document.getElementById('diskFill'),
    netValue: document.getElementById('netValue'),
    netSub: document.getElementById('netSub'),
    batteryValue: document.getElementById('batteryValue'),
    batterySub: document.getElementById('batterySub'),
    batteryFill: document.getElementById('batteryFill'),
    svcValue: document.getElementById('svcValue'),
    svcSub: document.getElementById('svcSub'),
    uptimeValue: document.getElementById('uptimeValue'),
};

let _timer = null;
let _fetchErrors = 0;
let _fetching = false;
let _tabActive = false;

/* 电池状态机（充电/放电/已满/未充电）→ 中文文案，模块级缓存避免每次轮询重建。 */
const BATTERY_STATUS_MAP = {
    CHARGING: '充电中',
    DISCHARGING: '放电中',
    FULL: '已充满',
    NOT_CHARGING: '未充电',
};

/**
 * 设置元素文本。
 * @param {HTMLElement} el
 * @param {string} text
 */
function _set(el, text) {
    if (el) el.textContent = text || '--';
}
/**
 * 设置进度条宽度。
 * @param {HTMLElement} el
 * @param {number|string} pct
 */
function _setBar(el, pct) {
    if (!el) return;
    pct = Math.min(100, Math.max(0, parseFloat(pct) || 0));
    el.style.width = pct + '%';
}

/* ---- 更新 8 张卡片 ---- */
/**
 * 将 cron.sh 生成的 dashboard.json 数据渲染到 8 张卡片。
 * @param {Object} data - 仪表盘数据
 * @param {Object} [data.device] - 设备信息
 * @param {Object} [data.cpu] - CPU 使用率、核心数、集群信息
 * @param {Object} [data.memory] - 内存使用情况（含 SWAP）
 * @param {Object} [data.disk] - 存储使用情况
 * @param {Object} [data.network] - 网络状态
 * @param {Object} [data.battery] - 电池信息
 * @param {Object} [data.services] - 服务运行状态
 * @param {string} [data.uptime] - 运行时间
 * @returns {void}
 */
function _update(data) {
    try {
        // 数据新鲜度指示器
        const ageEl = els.dataAge;
        if (data.timestamp && ageEl) {
            const ts = new Date(data.timestamp).getTime();
            const age = isNaN(ts) ? -1 : Math.floor((Date.now() - ts) / 1000);
            let ageText = '',
                ageClass = '';
            if (age < 0) {
                ageText = '';
                ageClass = '';
            } else if (age <= 60) {
                ageText = age + 's 前';
                ageClass = 'age-fresh';
            } else if (age <= 120) {
                ageText = Math.floor(age / 60) + 'm 前';
                ageClass = 'age-warn';
            } else if (age > 120) {
                ageText = Math.floor(age / 60) + 'm 前';
                ageClass = 'age-stale';
            }
            ageEl.textContent = ageText;
            ageEl.className = 'data-age' + (ageClass ? ' ' + ageClass : '');
        }
        // 1. 设备
        if (data.device) {
            _set(els.deviceValue, data.device.model || '--');
            const dsub = [];
            if (data.device.android) dsub.push('Android ' + data.device.android);
            if (data.device.kernel) dsub.push('Kernel ' + data.device.kernel);
            _set(els.deviceSub, dsub.join(' · '));
        }

        // 2. CPU
        if (data.cpu) {
            const usage = parseFloat(data.cpu.usage) || 0;
            _set(els.cpuValue, usage.toFixed(1) + '%');
            _setBar(els.cpuFill, usage);
            const csub = [];
            if (data.cpu.cores) csub.push(data.cpu.cores + ' 核');
            if (data.cpu.model && data.cpu.model !== '?' && data.cpu.model !== 'ARM')
                csub.push(data.cpu.model);
            _set(els.cpuSub, csub.join(' · '));
        }

        // 2.5 CPU 集群信息
        const clustersEl = els.cpuClusters;
        if (
            clustersEl &&
            data.cpu &&
            data.cpu.clusters &&
            Object.keys(data.cpu.clusters).length > 0
        ) {
            clustersEl.innerHTML = '';
            for (const [name, info] of Object.entries(data.cpu.clusters)) {
                const row = document.createElement('div');
                row.className = 'cluster-row';
                const cores = info.cores || 0;
                const usage = parseFloat(info.usage) || 0;
                const fmax = info.freq_max ? (info.freq_max / 1000).toFixed(1) : '?';
                row.innerHTML =
                    '<span class="cluster-label">' +
                    name +
                    '</span>' +
                    '<span class="cluster-detail">' +
                    cores +
                    ' 核 @ ' +
                    fmax +
                    'GHz</span>' +
                    '<span class="cluster-usage">' +
                    usage.toFixed(1) +
                    '%</span>';
                clustersEl.appendChild(row);
            }
            clustersEl.style.display = '';
        } else if (clustersEl) {
            clustersEl.style.display = 'none';
        }

        // 3. 内存
        if (data.memory) {
            const memUnit = data.memory.unit || 'MB'; // 与 SWAP 共用同一缺省，避免单位错配
            const memUsed = parseFloat(data.memory.used);
            const memTotal = parseFloat(data.memory.total);
            const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
            _set(els.memValue, data.memory.used + ' / ' + data.memory.total + ' ' + memUnit);
            _setBar(els.memFill, memPct);

            // 3.5 SWAP
            if (els.swapRow && data.memory.swap_total && parseFloat(data.memory.swap_total) > 0) {
                const swapUsed = parseFloat(data.memory.swap_used) || 0;
                const swapTotal = parseFloat(data.memory.swap_total);
                const swapPct = swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0;
                _set(
                    els.swapValue,
                    swapUsed.toFixed(1) + ' / ' + swapTotal.toFixed(1) + ' ' + memUnit
                );
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
            const diskUsed = parseFloat(data.disk.used);
            const diskTotal = parseFloat(data.disk.total);
            const diskPct = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
            _set(
                els.diskValue,
                data.disk.used + ' / ' + data.disk.total + ' ' + (data.disk.unit || 'GB')
            );
            _setBar(els.diskFill, diskPct);
        }

        // 5. 网络（独立卡片）
        if (
            data.network &&
            data.network.ip &&
            data.network.ip !== '--' &&
            data.network.ip !== '-'
        ) {
            _set(els.netValue, data.network.ip);
            const nsub = [];
            if (data.network.iface) nsub.push(data.network.iface);
            if (data.network.ipv6 && data.network.ipv6 !== '--')
                nsub.push('IPv6: ' + data.network.ipv6);
            _set(els.netSub, nsub.join(' · '));
        } else {
            _set(els.netValue, '--');
            _set(els.netSub, '');
        }

        // 6. 电池（始终显示）
        if (data.battery && data.battery.level !== undefined && data.battery.level >= 0) {
            _set(els.batteryValue, data.battery.level + '%');
            _setBar(els.batteryFill, data.battery.level);
            const bsub = [];
            if (data.battery.status) {
                bsub.push(BATTERY_STATUS_MAP[data.battery.status] || data.battery.status);
            }
            if (data.battery.temp && parseFloat(data.battery.temp) > 0)
                bsub.push(parseFloat(data.battery.temp).toFixed(1) + '°C');
            _set(els.batterySub, bsub.join(' · '));
        } else {
            _set(els.batteryValue, '--');
            _set(els.batterySub, '?');
            _setBar(els.batteryFill, 0);
        }

        // 7. 正在运行的服务
        if (data.services) {
            const count = data.services.count || 0;
            const names = data.services.running || [];
            _set(els.svcValue, count + ' 个运行中');
            _set(els.svcSub, names.length > 0 ? names.join(', ') : '');
        } else {
            _set(els.svcValue, '--');
            _set(els.svcSub, '');
        }

        // 8. 运行时间
        _set(els.uptimeValue, data.uptime || '--');
    } catch (e) {
        console.warn('Dashboard: 数据格式错误', e);
    }
}

/* ---- 全部置为占位符 ---- */
/**
 * 将所有卡片置为占位符 "--"。
 * @returns {void}
 */
function _reset() {
    _set(els.deviceValue, '--');
    _set(els.deviceSub, '');
    _set(els.cpuValue, '--');
    _set(els.cpuSub, '');
    _setBar(els.cpuFill, 0);
    _set(els.memValue, '--');
    _setBar(els.memFill, 0);
    _set(els.diskValue, '--');
    _setBar(els.diskFill, 0);
    _set(els.netValue, '--');
    _set(els.netSub, '');
    _set(els.batteryValue, '--');
    _set(els.batterySub, '');
    _setBar(els.batteryFill, 0);
    _set(els.svcValue, '--');
    _set(els.svcSub, '');
    _set(els.uptimeValue, '--');
}

/* ---- 获取数据（含请求去重 + 8s 超时）---- */
/** 获取仪表盘数据（含请求去重 + 8s 超时）。 */ async function _fetchData() {
    if (_fetching) return;
    _fetching = true;
    const controller = new AbortController();
    const timeout = setTimeout(function () {
        controller.abort();
    }, 8000);
    try {
        const resp = await fetch(API.DASHBOARD, { signal: controller.signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();
        _fetchErrors = 0;
        _update(json);
    } catch (err) {
        if (err.name === 'AbortError') {
            console.warn('Dashboard: 请求超时');
        }
        _fetchErrors++;
        console.warn('Dashboard: 获取失败 (' + _fetchErrors + ') — ' + err.message);
        if (_fetchErrors === 1) {
            _set(els.deviceValue, '无数据');
            _set(els.deviceSub, '检查 cron.sh / nginx /api/dashboard');
        } else if (_fetchErrors <= 5) {
            // 中间错误状态：更新数据新鲜度指示器显示过期
            const ageEl = els.dataAge;
            if (ageEl) {
                ageEl.textContent = '数据可能过期';
                ageEl.className = 'data-age age-stale';
            }
        } else {
            _reset();
        }
    } finally {
        clearTimeout(timeout);
        _fetching = false;
    }
}

/* ---- 启动轮询 ---- */
/**
 * 启动轮询（立即获取一次后每 30s 重复）。
 * @returns {void}
 */
function _start() {
    _fetchErrors = 0;
    _fetchData();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(_fetchData, 30000);
}

/* ---- 停止轮询 ---- */
/**
 * 停止轮询。
 * @returns {void}
 */
function _stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
}

/* ---- 页面可见性变化处理 ---- */
/**
 * 页面可见性变化时自动启停轮询。
 */
function _onVisibilityChange() {
    if (document.hidden) {
        _stop();
    } else if (_tabActive) {
        _start();
    }
}

/* ---- Tab 进入/离开（由 app.js switchTab 调用）---- */
/**
 * 进入 Dashboard Tab：若页面可见则启动轮询。
 * @returns {void}
 */
function _onTabEnter() {
    _tabActive = true;
    if (!document.hidden) _start();
}

/**
 * 离开 Dashboard Tab 时停止轮询。
 */
function _onTabLeave() {
    _tabActive = false;
    _stop();
}

/* ---- 初始化（仅注册监听器，不启动轮询）---- */
/**
 * 初始化：注册页面可见性变化监听器（不启动轮询）。
 * @returns {void}
 */
function _init() {
    document.addEventListener('visibilitychange', _onVisibilityChange);
}

const Dashboard = {
    init: _init,
    onTabEnter: _onTabEnter,
    onTabLeave: _onTabLeave,
};

export { Dashboard };
