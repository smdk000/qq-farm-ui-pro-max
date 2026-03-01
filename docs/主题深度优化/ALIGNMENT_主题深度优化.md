# 【阶段: 1-Align | 状态: 方案对齐中】
# 主题深度优化 开发交接与技术规范文档 (ALIGNMENT_主题深度优化.md)

## 1. 业务目标与需求背景 (Background & Goals)
**背景**：目前系统的皮肤/主题切换仅停留在“侧边栏单色切换”和“亮暗模式”的简单叠加阶段（基础状态），并未达到现代 Web 沉浸式的视觉体验要求。
**目标**：保持现有系统“默认主题”的结构逻辑和干净底色不变。针对另外 4 个主题（网格、赛博、黯金、粉黛），通过 CSS Variables 和动态背景节点，升级为**“整页随主题变幻流动毛玻璃特效 (Dynamic Mesh Gradient + Glassmorphism)”**。

## 2. 核心技术栈与渲染机制 (Tech Stack)
*   **状态管理**: `Pinia` 或 Vue 响应式数据保存当前激活的主题 (如 `ocean`, `cyber`)，并同步到 localStorage。
*   **全局样式标识**: Vue 根节点（`App.vue` 中的顶级包裹层，或直接挂载在 `<body>` 上）动态绑定对应的主题类：`.theme-ocean`, `.theme-cyber` 等。
*   **变量池**: 使用全局 CSS `:root` 根据当前激活的主题加载对应的原生 CSS 变量 (`--color-bg-primary`, `--color-glow-1` 等)。
*   **背景动画 (Mesh Gradient)**: 摒弃静态的大块底色背景，转而使用 `absolute` 定位的带虚化的颜色光球。光球基于 `@keyframes` 执行无限循环的平移动画。
*   **UI层隔离 (Glassmorphism)**: 前端主要的工作区卡片、侧边栏从使用强色彩（如 `bg-white`, `bg-gray-800`），替换为 `rgba(255,255,255,0.7)` 以及加上 `backdrop-filter: blur(x)` 的毛玻璃效果，实现底部流动背景的可视透出。

## 3. 四款新主题的色系变量调色板 (Color Palette)
以下预设调好每个主题所需的关键颜色，以便开发时直接写入 CSS 中：

| 主题标识 | 调色盘主调 (Mesh Colors) | 毛玻璃前景色 (Glass Card) | 发光点缀色 (Neon Accent) |
| :--- | :--- | :--- | :--- |
| `ocean` (深海矩阵) | `#083344` (最深蓝), `#0284c7`, `#0f766e` (青绿) | `rgba(8, 51, 68, 0.6)` | `--primary: #38bdf8` |
| `cyber` (全息赛博) | `#4c1d95` (深紫色), `#c026d3` (紫红色), `#6366f1` | `rgba(15, 23, 42, 0.6)` | `--primary: #a855f7` |
| `sakura` (樱花粉黛) | `#fbcfe8` (浅粉色), `#fce7f3`, `#cffafe` (淡蓝) | `rgba(255, 255, 255, 0.65)` | `--primary: #ec4899` |
| `elegant` (尊贵黯金) | `#18181b` (暗石墨), `#78350f` (暗金), `#b45309` | `rgba(39, 39, 42, 0.7)` | `--primary: #f59e0b` |

> *注：原默认主题保持原样，仅做亮/暗判断。不挂载动态 Mesh 动画层。*

## 4. 前端组件需改动范围 (Impact Scope)
1.  **修改存放全局样式的 CSS 文件** (如 `src/assets/css/index.css` 或 `App.vue` style block)：
    *   增加带有光球和模糊属性的 `.mesh-background` 和对应的 `@keyframes` 动画代码。
    *   增加对应主题类的颜色变量映射。
2.  **根布局组件 (如 `Layout.vue` 或 `App.vue`)**：
    *   最底层下钻一个 `div` 用于承载动画光球。只在开启这 4 个特定主题时渲染或显示。
3.  **大模块页面样式重构 (侧边栏、Navbar、内容卡片)**：
    *   移除强设定的硬编码背景色。
    *   注入 `.glass-panel` 类以激活 `backdrop-filter` 磨砂效果。
4.  **主题切换组件 (`ThemeSwitcher.vue` 或类似的侧边栏设置面板)**：
    *   新增点击事件，触发 Pinia Store 保存目标主题。
    *   修改原有的暗色模式切分逻辑（支持亮/暗与四款进阶主题组合适配）。

## 5. 验收标准 (Acceptance Criteria)
- [ ] 系统现有的“默认”和普通黑暗模式不能发生破损或样式乱版。
- [ ] 切换到 `cyber`, `ocean`, `sakura`, `elegant` 时，可以看到底部背景呈现缓慢无缝的模糊色块流动。
- [ ] 侧边栏和主界面板应成功呈现毛玻璃效果（半透明+背景模糊），能看透底层的动画变换。
- [ ] 主题变量切换过程不要出现明显的色块跳变（应加入 `transition` 平滑过渡）。
- [ ] UI 操作不能因背景动画引入严重的卡顿，确保使用 `transform` / `opacity` 进行 CSS 动画复合，避开 `top`/`left` 布局重排。
