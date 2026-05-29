/* 仪表盘模块：获取 /api/dashboard 并更新界面 */
const Dashboard = (() => {
    const elements = {
        cpuValue: document.getElementById('cpuValue'),
        cpuFill: document.getElementById('cpuFill'),
        memValue: document.getElementById('memValue'),
        memFill: document.getElementById('memFill'),
        diskValue: document.getElementById('diskValue'),
        diskFill: document.getElementById('diskFill'),
        uptimeValue: document.getElementById('uptimeValue')
    };

    function update(data) {
        try {
            // CPU
            elements.cpuValue.textContent = data.cpu.toFixed(1) + '%';
            elements.cpuFill.style.width = data.cpu + '%';

            // 内存
            const memPercent = (data.memory.used / data.memory.total * 100).toFixed(1);
            elements.memValue.textContent = `${data.memory.used} / ${data.memory.total} ${data.memory.unit}`;
            elements.memFill.style.width = memPercent + '%';

            // 磁盘
            const diskPercent = (data.disk.used / data.disk.total * 100).toFixed(1);
            elements.diskValue.textContent = `${data.disk.used} / ${data.disk.total} ${data.disk.unit}`;
            elements.diskFill.style.width = diskPercent + '%';

            // 运行时间
            elements.uptimeValue.textContent = data.uptime;
        } catch (e) {
            console.warn('仪表盘数据格式错误', e);
        }
    }

    async function fetchData() {
        try {
            const resp = await fetch('/api/dashboard');
            if (!resp.ok) throw new Error('无法获取仪表盘数据');
            const data = await resp.json();
            update(data);
        } catch (err) {
            console.warn('仪表盘数据获取失败，显示占位符', err);
            // 显示默认值
            elements.cpuValue.textContent = '--';
            elements.cpuFill.style.width = '0%';
            elements.memValue.textContent = '--';
            elements.memFill.style.width = '0%';
            elements.diskValue.textContent = '--';
            elements.diskFill.style.width = '0%';
            elements.uptimeValue.textContent = '--';
        }
    }

    return {
        init: function() {
            fetchData();
            // 每 10 秒刷新一次仪表盘
            setInterval(fetchData, 10000);
        }
    };
})();
