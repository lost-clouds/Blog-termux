# Markdown 渲染能力演示

本文演示 Blog-termux Markdown 阅读器支持的全部语法特性：**标题层级**、**文字样式**、**图片引用**、**数学公式**、**表格**、**代码块**、**任务列表**、**脚注式链接** 等。

---

## 1. 标题层级与目录生成

阅读器右侧 TOC 目录由 h1–h6 标题自动生成，h1 为文章标题，正文从 h2 开始。

### 1.1 三级标题

#### 1.1.1 四级标题

##### 1.1.1.1 五级标题（较少使用）

###### 1.1.1.1.1 六级标题（极少使用）

---

## 2. 文字样式

| 样式 | 语法 | 效果 |
|------|------|------|
| **粗体** | `**text**` | 加重强调 |
| *斜体* | `*text*` | 轻微强调 |
| ***粗斜体*** | `***text***` | 双重强调 |
| ~~删除线~~ | `~~text~~` | 标记已删除 |
| `行内代码` | `` `code` `` | 文件名、命令等 |
| <u>下划线</u> | `<u>text</u>` | HTML 标签（白名单放行） |
| <mark>高亮</mark> | `<mark>text</mark>` | HTML5 高亮 |
| 上标<sup>注</sup> | `<sup>text</sup>` | 脚注标记 |
| 下标<sub>底</sub> | `<sub>text</sub>` | 化学式等 |

---

## 3. 图片引用

### 3.1 相对路径（推荐）

放在 `Image/posts/` 或子目录中，Markdown 里引用相对于 `Image/` 的路径：

```markdown
![仪表盘截图](posts/example.png)
![博客浅色主题](posts/example0.png)
![博客深色主题](posts/example1.png)
```

![仪表盘截图](Image/posts/example.png)
![博客浅色主题](Image/posts/example0.png)
![博客深色主题](Image/posts/example1.png)

### 3.2 路径写法对照

以下写法**均可**正确解析到同一张图：

| 写法 | 说明 |
|------|------|
| `![img](posts/example.png)` | 相对于 Image/ 的子路径（推荐） |
| `![img](Image/posts/example.png)` | 带 `Image/` 前缀（自动剥离） |
| `![img](./example.png)` | 当前目录平级文件 |
| `![img](example.png)` | Image/ 根目录下的文件 |
| `![img](/api/images/posts/example.png)` | 绝对路径（不重写，直接信任） |

### 3.3 外部图片

外部 URL 不会被重写，直接保留原链接：

```markdown
![外部图片](https://www.gnu.org/graphics/gplv3-127x51.png)
```

> **提示**：点击正文中的任意图片可打开灯箱放大查看，按 ESC 或点击背景关闭。

---

## 4. 数学公式（KaTeX）

阅读器在检测到数学分隔符时**按需加载 KaTeX**，不会影响无公式文章的加载速度。

### 4.1 行内公式

勾股定理 $a^2 + b^2 = c^2$，欧拉公式 $e^{i\pi} + 1 = 0$。

质能方程 $E = mc^2$，求和符号 $\sum_{i=1}^{n} x_i$。

### 4.2 块级公式

二次方程求根公式：

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

贝叶斯定理：

$$
P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}
$$

矩阵乘法：

$$
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\begin{pmatrix}
x \\
y
\end{pmatrix}
=
\begin{pmatrix}
ax + by \\
cx + dy
\end{pmatrix}
$$

### 4.3 分隔符变体

`\[ ... \]` 和 `\( ... \)` 同样支持：

\[ \int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2} \]

行内使用 \( \alpha + \beta = \gamma \)。

---

## 5. 代码块

### 5.1 语法高亮（围栏代码块）

```python
#!/usr/bin/env python3
"""计算斐波那契数列"""
def fibonacci(n: int) -> list[int]:
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print(fibonacci(10))  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

```bash
# 一键部署脚本
cd ~/Blog-termux
bash gen_index.sh .
bash corn.sh ~/Blog-termux/dashboard.json
nginx -s reload
```

```javascript
// AbortController 防竞态示例
let controller = null;
async function loadArticle(name) {
    controller?.abort();
    controller = new AbortController();
    const resp = await fetch(`/Markdown/${name}`, {
        signal: controller.signal
    });
    return resp.text();
}
```

### 5.2 行内代码

项目核心文件：`index.html`、`js/main.js`、`css/style.css`、`corn.sh`。

Nginx 配置路径：`/api/dashboard` → `dashboard.json`。

---

## 6. 表格

### 6.1 基本表格

| 模块 | 文件 | 职责 |
|------|------|------|
| 仪表盘 | `dashboard.js` | 系统资源监控，10s 轮询 |
| 导航 | `navigation.js` | 服务入口，搜索过滤 |
| 博客 | `blog.js` | 文章列表 + 三栏阅读 |
| 图库 | `gallery.js` | 图片网格 + 灯箱 |
| 阅读器 | `md-viewer.js` | Markdown 渲染引擎 |

### 6.2 对齐方式

| 左对齐（默认） | 居中对齐 | 右对齐 |
|:---------------|:--------:|-------:|
| `:---` | `:---:` | `---:` |
| Markdown | 标记语言 | 2004 |
| KaTeX | 数学公式 | 2013 |

### 6.3 混合内容

| 特性 | 语法示例 | 支持 |
|------|----------|:----:|
| 粗体 | `**bold**` | ✓ |
| 代码 | `` `code` `` | ✓ |
| 链接 | `[text](url)` | ✓ |
| 图片 | `![alt](src)` | ✓ |

---

## 7. 列表

### 7.1 无序列表

- 系统仪表盘
  - CPU 使用率（含进度条）
  - 内存占用（含进度条）
  - 磁盘使用（含进度条）
- 服务导航
  - 按分组渲染卡片
  - 搜索过滤（名称、描述、标签）
- 博客阅读器
  - 三栏布局（目录 | 正文 | TOC）
  - 类型过滤（Markdown / HTML）

### 7.2 有序列表

1. 安装 Nginx 并配置 `Blog.conf`
2. 克隆项目到 `~/Blog-termux`
3. 运行 `bash gen_index.sh .` 生成索引
4. 配置 cron 定时采集仪表盘数据
5. 浏览器访问 `https://127.0.0.1:7443`

### 7.3 任务列表（GFM）

- [x] corn.sh 原子写入 + timestamp
- [x] Markdown 白名单 XSS 防护
- [x] Dashboard 页面可见性控制轮询
- [x] ES Modules 迁移
- [x] Service Worker 离线缓存
- [ ] 缩略图自动生成
- [ ] 图片目录结构迁移

---

## 8. 引用与嵌套

> **设计原则**：尊重 Termux/Android 环境的约束，保持零构建步骤，优先解决安全与稳定性问题。
>
> 项目核心价值在于用户在手机上直接编辑代码即可看到效果——优化应**增强**而非削弱这一能力。
>
>> 嵌套引用：在 Termux 的移动网络环境下，带宽是稀缺资源。AbortController 不仅解决了 UI 竞态，还节省了实际带宽。
>>
>> —— 《技术分析报告》

---

## 9. 链接

### 9.1 外部链接

- 项目原始上游：[bastienwirtz/homer](https://github.com/bastienwirtz/homer)
- Markdown 解析器：[marked.js v15](https://marked.js.org/)
- 数学公式引擎：[KaTeX](https://katex.org/)

### 9.2 名词解释式链接

以下术语在文中出现时附带链接：

- **SPA**（[单页应用](https://en.wikipedia.org/wiki/Single-page_application)）
- **IIFE**（[立即调用函数表达式](https://en.wikipedia.org/wiki/Immediately_invoked_function_expression)）
- **ES Module**（[ECMAScript 模块](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)）
- **SWR**（[Stale-While-Revalidate](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#stale-while-revalidate)）缓存策略
- **XSS**（[跨站脚本攻击](https://owasp.org/www-community/attacks/xss/)）

---

## 10. 脚注

脚注使用 `[^标识符]` 语法——引用处自动编号并生成上标链接，点击跳转到文末脚注区域，脚注末尾 `↩` 可跳回引用位置[^fn-marked]。

本项目在 Markdown 解析前进行**脚注预处理**：收集 `[^id]: 内容` 定义行，将引用替换为编号上标，并自动生成脚注区[^fn-zero-dep]。整个过程不依赖 marked 扩展，兼容任意版本[^fn-compat]。

脚注内容本身支持 **Markdown 内联格式**[^fn-format]，如粗体、代码、链接等。

[^fn-marked]: 项目使用 marked.js v15，其默认配置**不含**脚注支持（GFM 标准未纳入脚注）。因此使用自定义预处理器实现。
[^fn-zero-dep]: 预处理方案与项目"零依赖"理念一致——不引入额外库，仅约 30 行 JS 即实现完整脚注功能。
[^fn-format]: 支持的格式包括：**粗体**、*斜体*、`行内代码`、[链接](https://example.com)等。但不支持块级元素（如代码块、表格）。
[^fn-compat]: 兼容性警告：`[^id]` 语法虽在部分 Markdown 方言中内置，但 CommonMark / GFM 均未标准化。本预处理方案不依赖特定 marked 版本，移植到其他解析器只需替换 `marked.parse()` 调用即可。

---

## 11. 分隔线

使用三个或更多 `---` / `***` / `___`：

---

## 12. HTML 标签白名单

白名单放行的 HTML 标签可直接使用：

<details>
<summary><b>点击展开：安全过滤器说明</b></summary>

白名单允许的标签：`h1-h6` `p` `div` `span` `br` `hr` `strong` `em` `b` `i` `u` `s` `del` `ins` `code` `pre` `kbd` `mark` `sub` `sup` `small` `a` `img` `ul` `ol` `li` `table` `thead` `tbody` `tr` `th` `td` `blockquote`

不允许的标签（会被自动移除）：`script` `iframe` `style` `object` `embed` `form` `button` `input` 等。

不允许的属性（会被自动移除）：`onclick` `onerror` `onload` 等事件处理器。

</details>

---

## 13. 安全边界验证

以下内容在渲染时会被**自动过滤**，不影响页面安全：

```html
<!-- 这些不会执行——sanitizer 会移除 script 标签 -->
<script>alert('XSS')</script>
```

```html
<!-- 事件处理器会被移除 -->
<img src="x" onerror="alert(1)">
```

```html
<!-- 不安全的 href 会被替换为 # -->
<a href="javascript:alert(1)">点击我</a>
```

---

> **本文档完整覆盖**：多级标题（TOC 生成）、文字样式、图片引用（相对/绝对/子目录）、KaTeX 数学公式（行内/块级/多种分隔符）、代码块（语法高亮）、表格（对齐/混合内容）、列表（无序/有序/任务）、嵌套引用、链接（外部/名词解释）、分隔线、HTML 标签白名单、XSS 安全过滤。可据此验证阅读器的全部渲染能力。
