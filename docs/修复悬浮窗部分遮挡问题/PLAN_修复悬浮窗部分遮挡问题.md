# 修复悬浮窗部分遮挡问题

## 需求共识
现有系统在 `Settings` 等页面中的提示气泡（Tooltip，带有 `.hint-bubble` 类）显示时，如果超出了所在卡片（`.glass-panel` 类）的边界，会被截断遮挡，导致无法看清完整的提示内容。

## 根因分析
在 `web/src/style.css` 中，`.glass-panel` 使用了如下样式定义：
```css
  /* 使用 contain 替代 will-change 以避免 Chrome 重绘风暴 */
  contain: layout style paint;
```
`contain: paint` 会强制设定该元素的后代（即内部子元素）绝对不会在该元素的几何边界以外绘制，产生类似于 `overflow: hidden;` 或将元素变为裁剪容器的效果。这导致悬浮窗溢出卡片的部分全都被剪裁掉了。

## 系统设计与修复方案
修改 `web/src/style.css` 文件中 `.glass-panel` 的规则，将 `contain` 属性修改为：
```css
  contain: layout style;
```
这样既维持了布局和样式的隔离优化，又去除了绘制裁剪效果，允许工具提示悬浮窗正常突破父容器的视觉边界。

## 接口契约
无接口变更。纯前端样式优化。
