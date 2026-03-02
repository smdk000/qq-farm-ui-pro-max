# 阶段 3: Atomize (拆解) - 侧边栏主题切换重构

## 步骤 1: 基础设施配置 (Store & Composables)
- 修改/新建 `useTheme.js` (如果存在) 或在全局 Store 中加入持久化配置。
- **状态项**:
  - `isDark`: 是否深色模式
  - `primaryColor`: 当前主题色 (例如 `#22c55e`)
  - `showBreadcrumb`: 是否显示面包屑等 UI 变量

## 步骤 2: Tailwind 变量介入与 UI 挂载
- 更新全局 CSS (可能在 `index.css` 或 `App.vue` 样式里)，注册 CSS 变量：
  ```css
  :root {
      --theme-primary: #22c55e;
      --theme-primary-50: color-mix(in srgb, var(--theme-primary, #22c55e) 10%, transparent);
  }
  ```
- 更新 `tailwind.config.js`，将 `extend.colors.primary` 绑定为 `var(--theme-primary)`。

## 步骤 3: 编写 ThemeSettingDrawer 组件
- 创建 `src/components/ThemeSettingDrawer.vue` 
- 结构包含：
  - 侧拉弹窗 `a-drawer`
  - 深浅色切换开关
  - 主题色卡片 (5个预设)
  - 触发函数：修改 `useTheme` 里的变量并调用 `document.documentElement.style.setProperty` 实时修改页面颜色。

## 步骤 4: 注入触发入口并移除老入口
- 在应用的顶栏或全悬浮位置注入一个齿轮图标 `<SettingOutlined />`，点击打开该 Drawer。
- 在 `Sidebar` 或 `User` 组件附近，移除掉原本遗留的圆球主题切换器。

## 步骤 5: Ant Design 样式跟随
- 通过修改 `ConfigProvider` 配置的 `theme` 或者覆盖 `ant-primary-color` 以使得 AntD 的表单、按钮和我们的主色调一致。
