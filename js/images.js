const Gallery = (() => {
    let allImages = [];
    const searchInput = document.getElementById('searchInput');
    const grid = document.getElementById('imageGrid');

    async function fetchImages() {
        try {
            const resp = await fetch('/api/images/');
            const text = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const links = doc.querySelectorAll('a');
            const images = [];
            for (const link of links) {
                const href = link.getAttribute('href');
                if (!href || href === '../' || href === '/') continue;
                let name;
                try { name = decodeURIComponent(href); } catch(e) { name = href; }
                if (!name.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i)) continue;
                let size = '?', modified = '?';
                const parent = link.parentElement;
                if (parent) {
                    const txt = parent.textContent || '';
                    const dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                    if (dm) modified = dm[1];
                    const sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                    if (sm) size = sm[1] + ' ' + sm[2];
                }
                images.push({ name, size, modified });
            }
            allImages = images.sort((a,b) => a.name.localeCompare(b.name));
            renderImages();
        } catch (err) {
            grid.innerHTML = '<div class="loading">❌ 加载失败</div>';
        }
    }

    function renderImages() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = query
            ? allImages.filter(img => img.name.toLowerCase().includes(query))
            : allImages;

        if (filtered.length === 0) {
            grid.innerHTML = '<div class="loading">📭 没有图片</div>';
            return;
        }

        grid.innerHTML = filtered.map(img => {
            const url = `/api/images/${encodeURIComponent(img.name)}`;
            return `
                <div class="image-card" data-src="${url}" data-name="${Utils.escapeHtml(img.name)}">
                    <img src="${url}" alt="${Utils.escapeHtml(img.name)}" loading="lazy">
                    <div class="info">
                        <span>${Utils.escapeHtml(img.name)}</span>
                        <span>${Utils.escapeHtml(img.size)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function bindEvents() {
        searchInput.addEventListener('input', renderImages);
        // 灯箱事件由 lightbox.js 处理（点击图片卡片）
        document.addEventListener('click', e => {
            const card = e.target.closest('.image-card');
            if (!card) return;
            const src = card.dataset.src;
            const name = card.dataset.name;
            if (src) Lightbox.open(src, name);
        });
    }

    return {
        init: function() {
            bindEvents();
            fetchImages();
        }
    };
})();
