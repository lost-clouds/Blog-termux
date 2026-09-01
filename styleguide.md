# Blog-termux 代码规范文档

> 本文档定义 Blog-termux 项目中 JavaScript / CSS / Shell / HTML 的模块边界、命名、注释与格式规范。
> 所有新增或修改代码必须遵循本规范；历史代码在后续重构中逐步对齐。

---

## 目录

1. [总体原则](#1-总体原则)
2. [目录与模块边界](#2-目录与模块边界)
3. [JavaScript 规范](#3-javascript-规范)
4. [CSS 规范](#4-css-规范)
5. [Shell 脚本规范](#5-shell-脚本规范)
6. [HTML 规范](#6-html-规范)
7. [注释总则](#7-注释总则)
8. [工具链与门禁](#8-工具链与门禁)
9. [提交规范](#9-提交规范)
10. [模块清单（权威表）](#10-模块清单权威表)

---

## 1. 总体原则

- **单一职责**：一个文件只负责一件事。新功能优先拆成独立模块，而不是塞进现有大文件。
- **显式依赖**：模块之间的依赖关系必须通过 `import`/`export` 显式声明，禁止隐式全局变量耦合（`window.X` 仅用于确有必要的全局单例，见第 3 节）。
- **零动态风格漂移**：格式化交给工具（Prettier/Stylelint），不靠人工统一空格、引号、分号。
- **注释解释"为什么"，代码本身解释"是什么"**：不写"这里加 1"这种废话注释，写"这里 +1 是因为数组从 0 开始但 UI 显示从第 1 页开始"这种。
- **文档与代码同步**：模块的公开接口变化时，必须同步更新本文件第 10 节表格以及 README 的 Module Reference。

---

## 2. 目录与模块边界

```
Blog-termux/
├── index.html          # 唯一入口，不放业务逻辑
├── config.json          # 数据文件，不放逻辑
├── cron.sh               # 系统指标采集（无 root）
├── gen_index.sh           # 静态索引生成
├── sw.js                   # Service Worker，独立运行时，不 import 业务模块
│
├── css/
│   ├── style.css            # 构建产物，禁止手改，只能改 src/ 后重新 build
│   ├── build.sh
│   └── src/                  # 唯一可编辑的 CSS 源
│
├── Html/                    # HTML 页面文件（非入口），由 gen_index.sh 索引
├── Image/                   # 图片资源（posts / gallery / thumbnails）
├── js/                        # 唯一可编辑的 JS 源，全部 ES Module
│
├── lib/                         # 第三方库，禁止修改，禁止在此新增业务代码
│
└── resume/                      # 个人简历子项目（独立入口）
```

**边界规则：**

| 规则 | 说明 |
|---|---|
| `lib/` 只读 | 第三方依赖，不做任何修改；升级时整文件替换 |
| `css/style.css` 只读 | 由 `css/build.sh` 从 `src/` 合并生成，禁止直接编辑 |
| `Html/` 只读 | HTML 页面文件，由 `gen_index.sh` 索引 |
| `Image/` 只读 | 图片资源，由 `gen_index.sh` 索引 |
| `resume/` 独立子项目 | 自含入口 `resume/index.html` + `resume/js/` + `resume/css/`，不引入主项目模块 |
| 业务逻辑只在 `js/` | HTML 里不写 `<script>` 内联逻辑（除 `type="module"` 的单行入口） |
| 新模块先问归属 | 新功能属于"渲染类"放对应的 `xxx.js`；属于"通用工具"放 `utils.js`；两者都不像，考虑新建模块而不是塞进 `app.js` |

---

## 3. JavaScript 规范

### 3.1 模块系统

- 统一使用 **ES Modules**（`import`/`export`），禁止新增 `window.X = ...` 式全局挂载，除非是刻意设计的全局单例（当前允许的例外：`Theme`、`Lightbox`、`Navigation`，因为它们无状态或单实例特性明确）。
- 新模块默认使用 **具名导出**（`export function foo() {}`），不用 `export default`，便于 IDE 跳转和 tree-shaking。
- `main.js` 只做一件事：`import './app.js'`，不允许添加其他逻辑。
- 依赖关系必须能从文件顶部的 `import` 语句直接读出，不允许运行时动态拼接模块路径（`import(variable)` 除非明确标注为按需懒加载，如 KaTeX）。

### 3.2 命名规范

| 类型 | 规则 | 示例 |
|---|---|---|
| 文件名 | 全小写，短横线分隔 | `md-viewer.js` |
| 变量/函数 | camelCase | `fetchArticles`、`isLoaded` |
| 常量（模块级不变量） | UPPER_SNAKE_CASE | `const API_BASE = '/api'` |
| 类/构造函数（如有） | PascalCase | `class MarkdownRenderer` |
| 私有函数（模块内部，不导出） | 前缀 `_` | `function _parseFrontMatter()` |
| DOM 缓存变量 | 前缀 `$` | `const $sidebar = ...` |

### 3.3 JSDoc 注释模板

**每个文件顶部**必须有模块级注释：

```js
/**
 * @module dashboard
 * @description 系统仪表盘：轮询 /api/dashboard 接口并渲染 8 张状态卡片。
 * @requires module:constants
 */
```

**每个导出函数**必须有函数级注释，至少包含用途、参数、返回值：

```js
/**
 * 将 cron.sh 生成的 dashboard.json 数据渲染到 8 张卡片。
 *
 * @param {Object} data - 仪表盘数据
 * @param {Object} data.cpu - CPU 使用率、核心数、集群信息
 * @param {Object} data.memory - 内存使用情况（含 SWAP）
 * @returns {void}
 */
export function update(data) { ... }
```

**非导出（私有）函数**可以用简化的单行注释，除非逻辑复杂：

```js
// 从 ps -e 输出中过滤掉内核线程和噪声进程
function _filterNoise(processList) { ... }
```

**关键但不直观的代码行**，行内注释说明"为什么"：

```js
// 250ms 防抖：避免用户输入时每个按键都触发一次搜索请求
const debouncedSearch = debounce(search, 250);
```

### 3.4 禁止事项

- 禁止 `var`，一律 `const`/`let`。
- 禁止无注释的正则表达式（正则上方必须一行注释说明匹配什么）。
- 禁止 `console.log` 遗留在提交代码中（调试用 `console.debug`，且需在 PR 前清理）。
- 异步函数必须有错误处理（`try/catch` 或 `.catch()`），不允许裸 `await` 导致未捕获异常。

---

## 4. CSS 规范

### 4.1 文件组织

- 只编辑 `css/src/` 下的源文件，`style.css` 由 `build.sh` 生成。
- 新组件样式放 `src/components/` 下独立文件，禁止追加到已有的大文件（如不要把 gallery 样式写进 `blog.css`）。
- 主题相关覆盖（暗色模式等）只放 `src/themes/`，禁止在组件文件里写 `body.dark .xxx {}` 之外的主题逻辑分散到各处。

### 4.2 命名规范

- 采用 **BEM**（Block\_\_Element--Modifier）：
  ```css
  .card { }
  .card__title { }
  .card--highlighted { }
  ```
- CSS 自定义属性（变量）统一在 `variables.css` 声明，命名格式 `--<类别>-<用途>`：
  ```css
  --color-bg-primary: #ffffff;
  --spacing-md: 12px;
  ```
- 禁止在组件文件里写魔法数字颜色/间距，一律引用变量。

### 4.3 注释规范

每个 CSS 文件顶部说明其对应的 DOM 区块：

```css
/**
 * dashboard.css
 * 对应 #sec-dashboard 下的 8 张状态卡片布局与配色。
 * 依赖变量：variables.css 中的 --color-* 与 --spacing-*
 */
```

响应式断点必须注释说明触发的设备类型：

```css
/* 平板及以下：导航栏从顶部横排切换为可滚动横条 */
@media (max-width: 1200px) { ... }
```

---

## 5. Shell 脚本规范

适用于 `cron.sh`、`gen_index.sh`、`css/build.sh`。

- 脚本头部固定注释块：

```bash
#!/bin/bash
#
# cron.sh — 系统指标采集器
#
# 用途：采集 CPU/内存/存储/网络/电池/服务/运行时长，输出为 dashboard.json
# 用法：cron.sh [输出路径，默认 ./dashboard.json]
# 依赖：lscpu / cpufreq sysfs / /proc/stat / top / free / uptime / getprop / ps（无需 root）
# 由 cron 每 30 秒调用一次
```

- 每个函数前一行注释说明输入输出：

```bash
# 获取 CPU 使用率，优先用 /proc/stat 计算，失败则回退 top 单次采样
get_cpu_usage() { ... }
```

- 涉及多级 fallback 的逻辑（如 CPU 型号获取链路：`ro.board.platform` → CPU ABI），必须用注释写清楚 fallback 顺序和触发条件，防止后人删除某一环后不明白为什么。
- 所有脚本必须能通过 [ShellCheck](https://www.shellcheck.net/) 无 error 级别问题。

---

## 6. HTML 规范

- `index.html` 是唯一入口，只做骨架和 `<script type="module">` 引入，不写业务逻辑。
- 每个主要区块（`#sec-dashboard`、`#sec-nav`、`#sec-blog`、`#sec-gallery`）用 HTML 注释标出起止：

```html
<!-- ============ Dashboard 区块：8 张状态卡片，由 dashboard.js 渲染 ============ -->
<section id="sec-dashboard">...</section>
<!-- ============ /Dashboard 区块 ============ -->
```

---

## 7. 注释总则

| 场景 | 要求 |
|---|---|
| 模块/文件 | 顶部必须有用途、依赖说明 |
| 导出函数/接口 | 必须有 JSDoc（参数、返回值、用途） |
| 私有函数 | 至少一行说明用途 |
| 复杂条件判断、正则、fallback 链 | 必须注释"为什么这样写"，不只是"这行做什么" |
| 显而易见的代码 | 不写注释（如 `i++ // 自增` 这种禁止出现） |
| TODO/FIXME | 格式统一为 `// TODO(用户名, 日期): 说明`，避免无主 TODO |

---

## 8. 工具链与门禁

| 工具 | 用途 | 配置文件 |
|---|---|---|
| ESLint + `eslint-plugin-jsdoc` | JS 风格检查、强制导出函数有 JSDoc | `.eslintrc.json` |
| Prettier | 自动格式化 JS/CSS/JSON | `.prettierrc` |
| Stylelint | CSS 风格与变量使用检查 | `.stylelintrc.json` |
| ShellCheck | Shell 脚本静态检查 | 无需配置文件，CI 中直接跑 |
| EditorConfig | 编辑器基础格式（缩进、换行符） | `.editorconfig`（已存在） |

建议在 `package.json` 中加入统一入口脚本：

```json
{
  "scripts": {
    "lint:js": "eslint js/",
    "lint:css": "stylelint css/src/**/*.css",
    "lint:sh": "shellcheck cron.sh gen_index.sh css/build.sh",
    "lint": "npm run lint:js && npm run lint:css && npm run lint:sh",
    "format": "prettier --write \"js/**/*.js\" \"css/src/**/*.css\""
  }
}
```

CI（GitHub Actions）配置了两个 workflow：
- **`lint.yml`** — PR 时自动运行 JS / CSS / Shell 检查，未通过禁止合并
- **`release.yml`** — tag 推送时构建并发布，内含 lint 检查作为阻塞步骤

---

## 9. 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

feat(dashboard): 新增 SWAP 使用率展示
fix(blog): 修复搜索防抖导致的竞态条件
docs(styleguide): 补充 CSS 命名规范
refactor(utils): 拆分 getSafeUrl 的协议白名单逻辑
```

常用 `type`：`feat` / `fix` / `docs` / `style` / `refactor` / `chore` / `test`。

---

## 10. 模块清单（权威表）

> 此表是模块边界的唯一真实来源，新增/删除/重命名模块时必须同步更新。

| 模块 | 全局暴露方式 | 依赖 | 职责 |
|---|---|---|---|
| `theme.js` | `import` | 无 | 主题切换、localStorage 持久化 |
| `utils.js` | `import { Utils }` | 无 | 通用工具函数（转义、URL 校验、格式化） |
| `constants.js` | `import` | 无 | 路径常量 |
| `sanitizer.js` | `import` | 无 | HTML 白名单过滤 |
| `footnotes.js` | `import` | 无 | Markdown 脚注预处理 |
| `lightbox.js` | `import` | 无 | 图片灯箱 |
| `dashboard.js` | `import { Dashboard }` | `constants.js` | 系统状态轮询与渲染 |
| `navigation.js` | `import { Navigation }` | `utils.js` `constants.js` | 服务导航渲染与搜索 |
| `blog.js` | `import { Blog }` | `utils.js` `md-viewer.js` `constants.js` | 文章列表与内联渲染 |
| `gallery.js` | `import { Gallery }` | `utils.js` `lightbox.js` `constants.js` | 图片画廊 |
| `md-viewer.js` | `import { MarkdownRenderer }` | `marked`(全局) `utils.js` `constants.js` `sanitizer.js` `footnotes.js` `lightbox.js` | Markdown 渲染引擎 |
| `mermaid-renderer.js` | `import` | `constants.js` | Mermaid 图表渲染（按需加载 mermaid 库） |
| `tikz-renderer.js` | `import` | 无 | 基础 TikZ → SVG 渲染（纯客户端、零外部依赖） |
| `app.js` | 不挂载 window | 以上全部 | 启动流程、Tab 路由、事件绑定 |
| `main.js` | — | `app.js` | 唯一入口，单行 import |
| `resume/js/resume.js` | 独立 ES Module（自执行入口） | 无 | 个人简历渲染：主题切换/配置加载/DOM 渲染 |

**新增模块检查清单：**
1. 是否已存在职责重叠的模块？如有，扩展而非新建。
2. 依赖是否可以只走 `import`，而不需要挂 `window`？
3. 是否已在本表登记？
4. 是否已在 README 的 Module Reference 和 Script Load Order 图中同步？

---

*本文档随项目演进持续更新，任何规范变更需在 PR 描述中说明原因。*

