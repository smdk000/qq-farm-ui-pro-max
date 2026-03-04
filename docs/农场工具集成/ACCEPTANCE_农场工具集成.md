# 农场工具集成验收清单 (ACCEPTANCE)

## 状态：[已完成] - 阶段 5 

### 验收项目
- [x] **动态菜单控制**: 在 `Sidebar.vue` 添加了检测逻辑（`useFarmToolsStore` 通过 HEAD 方法检测 `/nc_api_version/index.html` 是否就绪）。
- [x] **组件高度风格融合**: 新增了 `FarmTools.vue`，左侧为可折叠原帮助风格的导航按钮（图标区分），右侧抛离 `p-4` 内边距，使用 100% 满屏的无边框 Iframe 提供更广阔视野。
- [x] **完全零入侵设计**: 不需要对 `nc_api_version` 中的 5 个文件做任何业务逻辑或者 CSS 修改。
- [x] **跨框架主题无缝适配**:
  - `FarmTools.vue` 在检测到 iframe iframeLoad 回调后，强制注入 `<style id="yunong-theme-override">`
  - 读取主项目 CSS 变量 (`--color-primary-500` / `--glass-bg`)。
  - 使用 `!important` 覆盖原厂写的 `bg-green-100` 或 `bg-gray-100`，使之跟随 Vue 系统的明暗和主题色。
  - 接管滚动条与表单、表格颜色的透明度。

### 测试预演
- 如果不想看到它：直接删除项目根目录下的 `nc_api_version`，刷新系统后 Sidebar 会自动剔除该入口。
- 若想更新图鉴：直接用新图片和 HTML 替换 `nc_api_version` 中的文件即可，不需要重新编译。
