# 任务拆解：农场工具插件化集成 (Atomize)

## 状态：[进行中] - 阶段 3

### 1. 资源探测与挂载 (Vite & Router)
- [ ] 修改 `web/vite.config.ts`：将 `nc_api_version` 代理到开发环境以便前端拉取静态 `index.html`。
- [ ] 修改 `web/src/router/menu.ts`：暴露动态菜单或通过状态管理按需添加。
- [ ] 修改 `web/src/components/Sidebar.vue`：
  - 增加对 `/nc_api_version/index.html` 的 `fetch(HEAD)` 存活性检查。
  - 控制边栏显示“农场工具”入口。

### 2. 构建 FarmTools 视图页面
- [ ] 创建 `web/src/views/FarmTools.vue`。
- [ ] **左侧**：抄袭 HelpCenter 的折叠二级分类 UI（保持 5 个功能：经验计算、氪金计算、作物图鉴、土地图鉴、使用说明/首页）。
- [ ] **右侧**：编写屏铺自适应全屏 `iframe` 容器用于承载对应的 HTML 资源。

### 3. 主题与样式双向通讯 (Theming)
- [ ] 编写全局挂载或内联的 JS 通讯逻辑（`window.postMessage` 或 DOM 注入）。
- [ ] 在 `FarmTools.vue` 监听当前的主题 (`html.classList`) 及自定义主题系统，并将其通过消息发送给 `iframe`。
- [ ] 为了不修改原 HTML 代码而且不产生跨域限制，在加载后通过对 `iframe.contentDocument.head` 注入定制覆盖样式 (主要针对原本使用 `farm`/`green` 的 Tailwind 类属性替换成 CSS 变量响应变化)。

### 4. 交付清理与文档更新
- [ ] 更新 `说明文档.md` 表明新特性的加入。
- [ ] 生成提交日志并进行系统完整性功能验证。
