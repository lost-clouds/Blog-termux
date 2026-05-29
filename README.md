# 项目文件结构
```
HTML/
├── index.html            # 首页：仪表盘 + Homer iframe
├── blog.html             # 博客列表页
├── images.html           # 图片画廊页
├── md-viewer.html        # Markdown 渲染页（保持不变）
├── dashboard.json        # 仪表盘数据（由脚本生成）
├── css/
│   ├── main.css          # 首页样式
│   ├── blog.css          # 博客列表样式
│   ├── images.css        # 图片页样式
│   └── md-viewer.css     # （已有）
├── js/
│   ├── theme.js          # （已有，共享）
│   ├── utils.js          # （已有，共享）
│   ├── lightbox.js       # （已有，共享）
│   ├── dashboard.js      # 仪表盘逻辑
│   ├── blog.js           # 博客列表逻辑
│   └── images.js         # 图片画廊逻辑
├── lib/                  # 第三方库（保持不变）
├── Markdown/             # Markdown 文章
├── Html/                 # HTML 文章
└── Image/                # 图片
```
