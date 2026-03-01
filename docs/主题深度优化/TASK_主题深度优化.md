# 【阶段: 3-Atomize | 状态: 进行中】
# 主题深度优化 任务拆解与执行标准 (TASK_主题深度优化.md)

## 任务背景
在 Align 阶段，我们明确了 4 个新主题（全息赛博、深海矩阵、樱花粉黛、尊贵黯金）的流动网格呈现方式，并以 `ui-ux-pro-max` 指导，确保采用 GPU 硬件加速的动画。
> **关于 GPU 加速与性能的答疑**: 
> 1. 您不用担心服务器！这些都是 **前端客户端渲染**（浏览器承担），跟后端的 Node.js / Docker 运行没有任何关系，0 服务器压力。
> 2. `transform: translate()` 是目前 Web 端性能最优的动画方案。它会被浏览器直接扔给电脑/手机的 GPU 处理，不会导致系统卡顿，远优于修改宽度/位置造成的发热和卡顿。

---

## 任务列表 (Task Breakdown)

### Task 1: 核心样式与变量基建 (CSS Variables & Glassmorphism)
- **目标**: 将主题色彩映射、流动网格帧动画、通用毛玻璃类写入全局样式系统。
- **文件涉及**: `web/src/assets/main.css` (或对应的主样式文件)
- **原子动作**:
  - [x] 注入 `@keyframes float`。
  - [x] 定义 `:root.theme-xxx` 中关于 `--bg-base`, `--glass-bg`, `--orb-1/2/3` 的色值变量。
  - [x] 增加 `.glass-panel` 通用卡片属性（包含 `backdrop-filter: blur(x)`）。

### Task 2: 背景动画引擎挂载 (Layout Rendering)
- **目标**: 在全局页面（通常是根路由组件）插入执行光点动画的 DIV，并绑定背景底色。
- **文件涉及**: `web/src/App.vue` 或 `web/src/layout/index.vue`
- **原子动作**:
  - [x] 在 `router-view` 的外层或同级结构下方插入 `<div class="mesh-bg">...</div>` 代码片段。
  - [x] 修改 `<body class="...">` 或 `<div id="app">` 的容器，让它能够接受动态类的绑定。

### Task 3: 状态控制台与侧边栏改造 (Store & Switcher Implementation)
- **目标**: 原有的单色/亮暗切换，要重置为支持持久化 5 种模式的 Pinia 存储方案，并提供用户界面。
- **文件涉及**: `web/src/store/index.js` (或者其他 settings store), `web/src/components/Sidebar.vue` (或 Theme切换区)
- **原子动作**:
  - [x] 升级存储逻辑：添加 `currentTheme` 状态。
  - [x] 完成 Vue 视图：将 `[默认, 赛博, 深海, 樱花, 黯金]` 的选项球呈现在界面上。
  - [x] 当用户点击选项时，动态移除 document.body 的旧 class，叠加新的 `theme-xxx` class。

### Task 4: 主体 UI 去除硬色，呈现透视光感 (UI Cleansing)
- **目标**: 目前的大量白色/黑色底色块是实心的（会将我们做的流动动画挡住）。现在需要全盘清除。
- **文件涉及**: `web/src/views/Dashboard.vue`, `web/src/views/Settings.vue`, `Navbar.vue` 等主体卡片。
- **原子动作**:
  - [x] 全局检索和替换写死的 `bg-white dark:bg-gray-800` 等属性，换签 `.glass-panel`。
  - [x] 校验所有大面板被修改后的可读性（尤其是亮模式与暗模式的文字对比）。

---

## 防冻结与验收警示 (Anti-Freeze Guard)
- [执行纪律] 在大规模替换 CSS 类之前，必须先将基础的 `<div class="mesh-bg">` 在页面里跑通，确保它不会阻挡鼠标点击 (必须搭配 `pointer-events: none`)。
