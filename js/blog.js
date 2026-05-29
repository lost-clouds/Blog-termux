const Blog = (() => {
    let allArticles = [];
    let currentType = 'all';

    const searchInput = document.getElementById('searchInput');
    const articleList = document.getElementById('articleList');

    async function fetchArticles() {
        try {
            const [mdResp, htmlResp] = await Promise.all([
                fetch('/api/md/'),
                fetch('/api/html/')
            ]);
            const parseLinks = async (resp, type) => {
                const text = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                const links = doc.querySelectorAll('a');
                const articles = [];
                for (const link of links) {
                    const href = link.getAttribute('href');
                    if (!href || href === '../' || href === '/') continue;
                    let name;
                    try { name = decodeURIComponent(href); } catch(e) { name = href; }
                    if (!name.match(/\.(md|markdown|html?)$/i)) continue;
                    let size = '?', modified = '?';
                    const parent = link.parentElement;
                    if (parent) {
                        const txt = parent.textContent || '';
                        const dm = txt.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
                        if (dm) modified = dm[1];
                        const sm = txt.match(/(\d+(?:\.\d+)?)\s*(K|M|G|bytes?)/i);
                        if (sm) size = sm[1] + ' ' + sm[2];
                    }
                    articles.push({ name, type, size, modified });
                }
                return articles;
            };

            const mdArticles = await parseLinks(mdResp, 'markdown');
            const htmlArticles = await parseLinks(htmlResp, 'html');
            allArticles = [...mdArticles, ...htmlArticles].sort((a,b) => a.name.localeCompare(b.name));
            renderArticles();
        } catch (err) {
            console.error(err);
            articleList.innerHTML = '<div class="loading">❌ 加载失败</div>';
        }
    }

    function renderArticles() {
        const query = searchInput.value.trim().toLowerCase();
        let filtered = allArticles.filter(a => {
            const nameMatch = a.name.toLowerCase().includes(query);
            const typeMatch = currentType === 'all' || a.type === currentType;
            return nameMatch && typeMatch;
        });

        if (filtered.length === 0) {
            articleList.innerHTML = '<div class="loading">📭 没有找到文章</div>';
            return;
        }

        articleList.innerHTML = filtered.map(a => {
            const viewUrl = a.type === 'markdown'
                ? `/md-viewer.html?file=${encodeURIComponent(a.name)}`
                : `/Html/${encodeURIComponent(a.name)}`;
            return `
                <div class="article-card">
                    <div class="article-info">
                        <h3>${Utils.escapeHtml(a.name)}</h3>
                        <div class="article-meta">${Utils.escapeHtml(a.size)} · ${Utils.escapeHtml(a.modified)} · ${a.type.toUpperCase()}</div>
                    </div>
                    <a href="${viewUrl}" target="_blank" class="view-btn">阅读</a>
                </div>
            `;
        }).join('');
    }

    // 事件绑定
    function bindEvents() {
        searchInput.addEventListener('input', renderArticles);

        document.querySelector('.tabs').addEventListener('click', e => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentType = btn.dataset.type;
            renderArticles();
        });
    }

    return {
        init: function() {
            bindEvents();
            fetchArticles();
        }
    };
})();
