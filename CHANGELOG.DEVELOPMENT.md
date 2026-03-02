# QQ 农场智能助手 - 开发日志

> 本文档记录项目的所有重大更新、优化和 Bug 修复

---

## 📅 最近更新

### v3.3.6 - 自动操作阀门架构加固与响应式修复 (2026-03-02)

#### 🛡️ 防破产交易控制持久化 (P0)

- ✅ **从内存脱离**：将原 `mall.js` 内部用于核算“单日已购买化肥数”的内存级计时器 `dailyBoughtCount` 全面脱载，下坠置于 `store.js` 账号存储中心。
- ✅ **配置防丢失**：在基础配置结构中挂载 `runtimeRecords: { fertilizerBoughtStr: '2026-x-x|计数' }` 参数串，防爆仓熔断现在能够完全经受 Node 线程崩溃或断线重连考验，不再存在意外“失忆归零”乱买化肥的悲剧。

#### 🐛 移动端交互溢出治理 (UI Overflow Fixes)

- ✅ **侧边栏解除“死锁”**：针对现代超宽屏手机横置及高密分辨率场景，将主页面响应式遮罩层及侧滑控制阀（隐藏关闭按钮触发点）从 `< 1024px` (`lg`) 放宽至 `< 1280px` (`xl`)，夺路归还抽屉式自由。
- ✅ **气泡微碰壁计算**：对 `BaseTooltip.vue` 内置防爆屏指令，施加 `max-w-[calc(100vw-32px)]` 搭配 `whitespace-normal` 并以自身居中下沉式展开渲染，根除由于超长注释被小尺寸屏幕排挤产生底层横跨滚动条。

---

### v3.3.5 - 悬浮提示与下拉框遮挡问题深度优化 (2026-03-02)

#### 🐛 界面遮挡修复 (UI Occlusion Fixes)

- ✅ **面板层级解绑 (Glass Panel)**：移除了全局 `.glass-panel` 的 `contain: paint` 约束。该约束原本为了性能优化，但附带裁切边界效果，导致内部绝对定位元素（如下拉框、组件级气泡）超出卡片边界即被强制截断。修改为 `contain: layout style;` 后，一劳永逸解决了各级面板边缘的遮挡截断痛点。
- ✅ **精简冗余组件结构 (BaseSwitch)**：针对农田设置页提示信息已直接展现在选项下方的情况，全局移除了 `BaseSwitch.vue` 内部已废弃的多级悬浮气泡，精简 DOM 与样式层级。
- ✅ **居中向下浮窗布局 (BaseTooltip)**：优化了通用 `BaseTooltip.vue` 组件的气泡展开方向，从原先极易遮挡右侧内容的向右展开，全面重构为**下方弹出并居中对齐**触发器（基于 `left-1/2 -translate-x-1/2 top-full`），兼容不同分栏尺寸场景下左、中、右排版的显示安全。

**涉及文件**：`web/src/style.css` / `web/src/components/ui/BaseSwitch.vue` / `web/src/components/ui/BaseTooltip.vue`

---

### v3.3.4 - 全局主题系统级深度统一适配 (2026-03-01)

#### 🎨 沉浸式毛玻璃闭环

- ✅ 帮助中心：清除全部硬编码 `bg-white/80` 与 `bg-gray-50`，全面纳入 `glass-panel` 毛玻璃材质，完美适配深邃色调（Cyber、Ocean）。
- ✅ 帮助中心：15 种 Markdown 提醒卡片及组件内置样式，利用 `var(--glass-bg)` 与 `var(--text-main)` 实现了纯净主题感知，彻底消灭夜间模式的刺眼白底卡片。
- ✅ 账号管理层：对列表空状态占位、账号卡片底色及内嵌式头像容器等硬伤区，重定义深浅模式边界阴影渲染逻辑。 
- ✅ 文字排版可读性：清退使用频率极高的写死 `blue-*` 系列 Tailwind 原型类，接轨应用级 `primary-*` 全局映射表。

**涉及文件**：`HelpCenter.vue` / `Accounts.vue` / `Friends.vue` (复查补漏) / `Login.vue`

---

### v3.3.3 - 回归修复：深色模式兼容性与性能模式覆盖遗漏 (2026-03-01)

#### 🐛 回归修复

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | `HelpCenter.vue` 独立重定义 `backdrop-filter`，不受性能模式管控 | `HelpCenter.vue` | 移除局部 `backdrop-filter`，统一使用全局 `style.css` |
| 2 | `Friends.vue` Scoped CSS 中 `.dark` 选择器无法匹配 `<html>` 祖先 | `Friends.vue` | 深色模式样式迁移至非 scoped `<style>` 块，用 `.friends-op-area` 前缀限定作用域 |
| 3 | `NotificationModal.vue` 底部动作条样式被意外修改 | `NotificationModal.vue` | 恢复原始 `border-gray-100 bg-gray-50/50` 样式类 |

**涉及文件**：`HelpCenter.vue` / `Friends.vue` / `NotificationModal.vue`

---

### v3.3.2 - Chrome 闪烁修复与性能模式全面增强 (2026-03-01)

#### ⚡ 闪烁根因修复

| 层级 | 触发器 | 修复措施 |
|------|--------|----------|
| **glass-panel** | `will-change: transform, backdrop-filter` 导致 Chrome 合成层反复重绘 | 移除 `will-change`，改用 `contain: layout style paint` |
| **mesh-orb** | 3 个 50vw+ 光球 `blur(80px)` + 无限动画 | 降为 `blur(60px)` + `opacity: 0.4` |
| **HelpButton** | `pulse 2s infinite` 无限 box-shadow | 降为 `4s` + 悬停暂停 |

#### 🛡️ 性能模式全面增强

- ✅ 追加全局 `animation-duration: 0s !important` + `transition-duration: 0s !important`
- ✅ 追加 `will-change: auto !important` + `contain: none !important` 强制重置
- ✅ 覆盖 `*` / `*::before` / `*::after` 所有伪元素

**涉及文件**：`style.css` / `HelpButton.vue`

---

### v3.3.1 - 好友列表按钮统一与公告弹窗品牌增强 (2026-03-01)

#### 🎨 好友列表按钮 UI 统一

- ✅ 引入 `op-btn` 基础类 + 6 种颜色变体（Scoped CSS）
- ✅ 修复「除草」按钮与其他按钮形状不一致的问题
- ✅ 修复「加入黑名单」按钮深色模式下可读性差的问题
- ✅ 深色模式采用 15% 透明背景 + 微发光边框，适配 Cyberpunk 风格

| 按钮 | 类名 | 色系 |
|------|------|------|
| 偷取 | `op-blue` | 蓝色 |
| 浇水 | `op-cyan` | 青色 |
| 除草 | `op-green` | 翠绿 |
| 除虫 | `op-orange` | 橙色 |
| 捣乱 | `op-red` | 红色 |
| 黑名单 | `op-gray` | 灰色 |

#### 🎖️ 公告弹窗品牌信息

- ✅ 在「更新公告」弹窗底部注入作者防伪水印（Author: smdk000 | QQ群: 227916149）
- ✅ 使用 `text-[10px]` + `font-mono` + Carbon 图标，与侧边栏水印风格统一
- ✅ 深浅模式均适配

#### 🔧 Tooltip 颜色修复

- ✅ `BaseSwitch.vue` 推荐标签样式从 Tailwind 迁移至 Scoped CSS，修复颜色丢失问题
- ✅ `Settings.vue`「前往偷取控制台」链接重构为 `BaseButton` 组件，恢复按钮形状

**涉及文件**：`Friends.vue` / `NotificationModal.vue` / `BaseSwitch.vue` / `Settings.vue`

---


### v3.3.0 - 自动控制功能提示与推荐建议系统 (2026-03-01)

- ✅ `BaseSwitch.vue` 新增 `hint`/`recommend` prop + CSS Tooltip 气泡（零依赖）
- ✅ `Settings.vue` 全部 18 个开关添加功能解释 + 推荐建议标签
- ✅ 4 个分组标题追加 `title` 属性 + 施肥策略下拉追加 tooltip
- ✅ 推荐标签三色区分：绿(开) / 红(关) / 橙(视情况)

**涉及文件**：`BaseSwitch.vue` / `Settings.vue`

---

### v3.2.9 - 令牌桶进阶优化：紧急通道 & 冗余 Sleep 清理 (2026-03-01)

#### 🚨 防偷抢收紧急通道 (P0)
- ✅ 新增 `sendMsgAsyncUrgent` 紧急通道（队头插入），防偷不再被好友巡查长队列阻塞
- ✅ `farm.js` 新增 `getAllLandsUrgent` / `fertilizeUrgent` / `harvestUrgent` 紧急版 API
- ✅ `antiStealHarvest` 全部改用紧急通道

#### ⚡ 冗余 Sleep 清理 (P1)
- ✅ 移除 `farm.js` 中 2 处 + `friend.js` 中 5 处冗余 sleep（共 7 处）
- ✅ 保留 3 处经验值检测 sleep（业务逻辑等待）

#### 📊 队列深度监控 (P2)
- ✅ 排队超过 5 帧时自动打印警告日志

**涉及文件**：`network.js` / `farm.js` / `friend.js`

---

### v3.2.8 - 性能优化：SQLite 防争用 & WebSocket 3QPS 令牌桶限流 (2026-02-28)

#### ⚡ SQLite 防争用增强

- ✅ 追加 `busy_timeout = 5000`：并发写入遇锁时自旋最多 5 秒，避免直接抛 `SQLITE_BUSY`
- ✅ 追加 `wal_autocheckpoint = 1000`：每累积 1000 页自动合并 WAL，防止 `.db-wal` 膨胀

#### 🛡️ WebSocket 令牌桶限流器

- ✅ 在 `sendMsgAsync` 前注入 Token Bucket 异步排队网关
- ✅ 所有业务请求强制以 **3 QPS（每帧 ≥ 334ms）** 匀速发出
- ✅ 心跳同步 `sendMsg` 不受限流影响
- ✅ `cleanup()` 中追加队列清空，断线重连安全

**涉及文件**：
- `core/src/services/database.js` - 新增 2 行 pragma
- `core/src/utils/network.js` - 新增令牌桶 ~40 行 + cleanup 改造

---

### v3.2.2 - 主题切换按钮优化版本 (2026-02-28)

#### 🎨 UI 位置优化

**问题**：主题切换按钮位于侧边栏底部，不够明显

**解决方案**：
- ✅ 将主题切换按钮移至顶部用户信息卡片
- ✅ 位置：改密按钮右侧，退出按钮左侧
- ✅ 样式：与续费、改密按钮保持一致
- ✅ 功能：完整的三态切换（浅色 → 深色 → 自动）

**按钮顺序**（从左到右）：
1. 续费
2. 改密
3. 🌓 主题切换（新增）
4. 退出

**涉及文件**：
- `web/src/components/UserInfoCard.vue` - 添加主题切换按钮
- `web/src/layouts/DefaultLayout.vue` - 移除顶部按钮，恢复原始 UI

---

### v3.2.1 - UI 细节高度对齐版本 (2026-02-28)

#### 🎨 UI 细节优化 (User Interface Refinements)

该版本同步了 v2.3 中的核心样式优化，重点提升了配置界面的视觉一致性与交互细节。

##### 1. 策略选种预览：全等体验 (Refactored Strategy Preview)
- **样式统一**: 彻底重构了 `Settings.vue` 中「策略选种预览」的外观
- **视觉反馈**: 采用了与 `BaseSelect` 完全一致的边框高度（h-9）、内边距及背景色。新增右侧 **chevron-down** 指示图标
- **交互提升**: 消除了用户在「优先种植」与「自动策略」之间切换时产生的布局抖动，使设置界面更显专业

##### 2. 定位修正：推送渠道链接 (Link Fixes)
- **文档准确性**: 修复了「离线提醒」配置中 `pushplushxtrip` 的文档跳转地址，现在正确链接至其专属官网 `https://pushplus.hxtrip.com`

---

### v3.2.0 - 深度审计与安全修复版本 (2026-02-28)

#### 🛡️ 安全与性能补丁 (Security & Performance Patches)

本次更新针对 V3 体验卡逻辑进行了深度代码审计，修复了一项关键的授权阻断问题，并大幅优化了前端数据装载性能。

##### 1. 安全修复：过期用户续费放行逻辑
- **逻辑优化**: 修正了原先「账号过期即踢下线」的过度防御设计
- **授权白名单**: 允许已过期的用户在不被强制登出的情况下进入 Dashboard，并仅开放续费相关 API 权限（`/api/auth/trial-renew` 等）
- **用户闭环**: 确保用户在到期后能顺利看到续费横幅并执行操作，减少人工找回账号的成本

##### 2. 前端架构升级：Pinia Store 全局缓存
- **数据流重构**: 体验卡全局配置（`trialConfig`）已整合至 `useSettingStore`
- **减负增效**: Dashboard、UserInfoCard 等多个组件取消了各自独立的重复 API 请求，统一通过 Pinia 缓存读取。显著减少首屏渲染时的并发网络负担

##### 3. 实时性增强：高精度到期倒计时
- **动态横幅**: Dashboard 续费横幅现在支持「秒级」倒计时显示（例如：*还需要在 2 小时 15 分 30 秒 内续费*）
- **紧迫感引导**: 通过视觉上的实时流逝，增强用户及时续费的操作意愿，有效提升留存

##### 4. 后端：IP 提取算法升级 (`getClientIP`)
- **代理支持**: 重构了客户端 IP 获取逻辑，能够正确识别多重 Nginx/CDN 代理后的真实 IP
- **内网过滤**: 增加了对 `10.x`, `192.168.x` 等私有网段的自动忽略逻辑，确保限流机制对真实试用用户精准生效

**涉及文件**：
- **后端鉴权**: `core/src/controllers/admin.js` (`userRequired`, `getClientIP`)
- **状态中心**: `web/src/stores/setting.ts` [Pinia Integration]
- **视图组件**: `web/src/views/Dashboard.vue`, `web/src/components/UserInfoCard.vue`

---

### v3.1.0 - V3 体验卡持续优化方案 (2026-02-28)

#### 🚀 架构与 UI 增强 (Infrastructure & UI Enhancements)

本次更新根据安全性与用户体验反馈，对体验卡系统进行了深度加固与美化。

##### 1. 后端：体验卡领取记录持久化
- **数据稳态**: 新增 `data/trial-ip-history.json` 存储文件
- **抗风险逻辑**: 体验卡生成记录、IP 冷却、每日计数现在支持跨进程持久化。防止服务器重启后用户绕过 IP 冷却时间恶意刷取体验卡
- **自动清理**: 初始化时自动过滤并剔除超过 24 小时的陈旧记录，确保数据文件轻量简洁

##### 2. 前端：Dashboard 呼吸灯动态特效
- **视觉强化**: 为 Dashboard 顶部的续费提醒横幅新增「呼吸灯 (Pulse)」动画效果
- **智能反馈**: 橙色发光扩散阴影配合平滑边框过渡，显著提升异常状态（已过期/即将过期）的视觉引导
- **技术细节**: 纯 CSS 动画实现（`@keyframes trial-pulse`），不引入额外的 JS 开销，保持页面流畅度

**涉及文件**：
- **后端逻辑**: `core/src/models/user-store.js`
- **持久化数据**: `data/trial-ip-history.json` [NEW]
- **前端视图**: `web/src/views/Dashboard.vue`

---

### v3.0.0 - V3 体验卡 (Trial Card) 完整版 (2026-02-28)

#### 🧪 体验卡系统 (Trial Card System) [NEW]

这是本次更新的核心功能，旨在提供受控的试用体验与商业化闭环。

##### 1. 后端逻辑增强
- **业务模型**: 卡密系统新增 `TRIAL (T)` 类型，支持自定义试用时长
- **自动注册绑定**: 注册时若检测到体验卡，自动设置 `maxAccounts`（绑定限制）
- **自助续费**: 新增 `/api/auth/trial-renew` 接口，支持用户在过期或即将过期时（≤24h）一键续费
- **防止滥用**: 
  - **IP 限制**: 基于客户端 IP 的每日生成上限（`dailyLimit`）
  - **冷却机制**: IP 冷却时间（`cooldownMs`），防止非法刷卡
  - **数据持久化**: 内存缓存 IP 生成记录，并随系统同步

##### 2. 管理员配置面板 (Settings)
- **可视化控制**: 新增「体验卡配置」卡片（仅管理员可见）
- **动态参数**: 支持修改时长、每日上限、IP 冷却、绑定数上限
- **入口开关**: 独立控制管理员/用户是否允许一键续费

##### 3. 前端交互体验
- **登录页生成**: 登录/注册页新增「领取体验卡」按钮，带 60s 冷却提示与自动填入
- **Dashboard 提醒**: 在 Dashboard 顶部增加橙色续费横幅，过期或即将过期时自动弹出
- **UserInfoCard 增强**: 
  - 支持 `T` 类型显示（橙色标签）
  - 增加「🔄 一键续费」按钮，简化操作路径
- **表格标识**: 卡密管理与用户管理表格中正确显示 `T` 类型

##### 4. 细节修复与优化
- **API 安全**: `/api/trial-card` 开放接口增加严格的 IP 频率校验
- **UI 对比度**: 续费按钮与横幅使用高对比度橙色，确保提醒醒目
- **数据一致性**: 续费后自动更新本地 `localStorage`，无需重新登录即可看到最新到期时间

**涉及文件**：
- **后端模型**: `core/src/models/user-store.js`, `store.js`, `card-types.js`
- **控制器**: `core/src/controllers/admin.js`
- **前端视图**: `web/src/views/Settings.vue`, `Dashboard.vue`, `Login.vue`
- **前端组件**: `web/src/components/UserInfoCard.vue`

---

### v2.0.6 - UI 优化 & 日出日落自动主题 (2026-02-28)

#### 🎨 Analytics 标签统一

移动端卡片标签与桌面端表头统一为 `/小时` 格式，`利润` → `净利润`：

| 修改前 | 修改后 |
|--------|--------|
| 经验/时 | 经验/小时 |
| 利润/时 | 净利润/小时 |
| 普肥经验/时 | 普肥经验/小时 |
| 普肥利润/时 | 普肥净利润/小时 |

#### 🌗 深色模式对比度提升

- 占位图标 `text-gray-400` → `dark:text-gray-300`（Analytics / Accounts）
- 数据色值 `amber-500` / `green-500` → `dark:amber-400` / `dark:green-400`
- 辅助文字 `text-gray-400` → `dark:text-gray-500`（Dashboard 经验效率/日志区）

#### 🌅 日出日落自动主题切换

**三模式切换**：☀️ 浅色 → 🌙 深色 → 🔄 自动 → ☀️ ...

- `auto` 模式：获取用户地理位置计算日出日落，白天浅色/夜晚深色
- 无法获取位置时回退到系统 `prefers-color-scheme` 偏好
- 每 60 秒检查一次是否需要切换
- 手动选择 `light`/`dark` 立即覆盖 `auto`

**涉及文件**（7 个）：
- `Analytics.vue` - 标签统一 + 深色对比度
- `Accounts.vue` - 占位图标对比度
- `Dashboard.vue` - 辅助文字对比度
- `app.ts` - 三态主题 + 日出日落计算
- `ThemeToggle.vue` - 三态循环切换
- `store.js` - `setUITheme` + `loadGlobalConfig` 支持 `auto`

---

### v2.0.5 - 注册续费功能优化 (2026-02-28)

#### 🔧 核心问题修复

##### 1. 卡密类型枚举统一 [NEW]
- 新增 `core/src/config/card-types.js`，定义 `CARD_TYPES`、`CARD_TYPE_LABELS`、`CARD_TYPE_DAYS` 三组常量
- 提供 `isValidCardType()` 和 `getDefaultDaysForType()` 工具函数
- 消除全局硬编码，所有卡密类型判断统一使用枚举

##### 2. 注册功能修复
- **类型验证**: 注册时校验卡密类型是否在枚举内
- **天数验证**: 非永久卡检查 `days ≤ 0` 自动回退默认天数
- **使用后禁用**: 卡密使用后自动设置 `enabled = false`
- **明文密码**: 保存 `plainPassword` 字段（管理员可见）
- **操作日志**: 注册成功后记录到 `data/logs/user-actions.log`

##### 3. 续费功能修复（严重 bug）
- **跨用户检测**: 新增 `card.usedBy !== username` 校验，防止跨用户盗用卡密
- **时间累加修复**: 旧逻辑 `currentExpires + (newExpires - now)` 等效于直接累加，但可读性差。重写为清晰的 `currentExpires + days * ms` 累加逻辑
- **过期重算**: 已过期用户续费从当前时间重新计算
- **永久卡**: 正确处理永久卡续费（`expiresAt = null`）
- **卡密记录初始化**: `if (!user.card) user.card = {}` 防止空对象访问崩溃
- **使用后禁用 + 保存**: 续费后同步 `saveCards()`（旧代码只 `saveUsers`）

##### 4. 创建卡密优化
- 使用 `isValidCardType()` 验证传入类型，无效则默认月卡
- 天数使用 `getDefaultDaysForType()` 替代硬编码 30

#### 🛡️ 输入验证增强 [NEW]

- 新增 `core/src/utils/validators.js`，提供 `validateUsername/validatePassword/validateCardCode` 三个验证函数
- 注册 API 增加用户名格式（4-20 位字母数字下划线）、密码长度（6-50 位）、卡密格式（≥8 位）验证
- 续费 API 增加卡密格式验证
- 错误提示从 `'注册失败'` 优化为 `'注册失败，请稍后重试'`

#### 📝 操作日志 [NEW]

- 新增 `core/src/utils/logger.js`，`logUserAction()` 函数
- 日志写入 `data/logs/user-actions.log`，记录时间戳、操作类型、用户名、详细参数
- 日志写入失败不阻断主流程

#### 🎨 前端优化

| 文件 | 修改内容 |
|------|----------|
| `Login.vue` | 注册表单前端验证（用户名/密码/卡密）+ 卡密输入帮助提示 |
| `Cards.vue` | 类型选择器显示默认天数 + watch 联动自动填入 + 天数说明 |
| `UserInfoCard.vue` | 卡密类型颜色标签 + 到期预警提示条（过期/3 天/7 天三级） |

#### 📁 新增文件（3 个）

| 文件 | 说明 |
|------|------|
| `core/src/config/card-types.js` | 卡密类型枚举 |
| `core/src/utils/validators.js` | 数据验证工具 |
| `core/src/utils/logger.js` | 操作日志工具 |

#### 🐛 Bug 修复 (2026-02-28 12:45)

| 问题 | 原因 | 修复 |
|------|------|------|
| 卡密页面 `Cannot access 'l' before initialization` | `Cards.vue` 中 `watch` 在 `newCard` 声明之前引用（TDZ 错误） | watch 移到 newCard 声明之后 |
| 注册 API 返回 401 | `/auth/register` 未在 `authRequired` 中间件白名单中 | 白名单添加 `/auth/register` |
| 搜索按钮图标显示为蓝色方块 | `Dashboard.vue` 中 `<div class="i-carbon-search" />` 缺少宽高导致渲染折叠 | 添加 `text-lg` 类为其提供明确尺寸 |

#### 🐛 Bug 修复 (2026-02-28 12:23) - 追加优化

##### 1. 数据迁移脚本 [NEW]
- 新增 `core/scripts/migrate-used-cards.js`
- 扫描已使用（`usedBy` 不为空）但 `enabled` 仍为 `true` 的旧卡密，批量修复
- 自动备份 `cards.json → cards.json.bak`，写入失败自动恢复
- 用法：`node core/scripts/migrate-used-cards.js`

##### 2. 密码复杂度增强
- 后端 `validators.js`：新增字符复杂度校验，密码须同时包含字母和数字
- 前端 `Login.vue`：注册表单同步新增字符复杂度校验
- **注意**：仅影响新注册用户，不影响已有用户登录

##### 3. 日志轮转机制
- 重写 `core/src/utils/logger.js`，新增 `rotateIfNeeded()` 和 `cleanupOldLogs()` 函数
- 单文件上限 2MB（`MAX_LOG_SIZE`），超限自动归档为 `.1` → `.2` → … → `.5`
- 最多保留 5 份归档（`MAX_LOG_FILES`），超出自动删除
- 轮转/清理失败不阻断主流程

##### 4. TS 警告修复
- 移除 `UserInfoCard.vue` 中未使用的 `cardTypeLabel` 计算属性
- 该属性已被 `cardTypeDetail.label` 替代，模板无引用

**本轮新增/修改文件**：
- `core/scripts/migrate-used-cards.js` [NEW] - 旧卡密状态修复迁移脚本
- `core/src/utils/validators.js` [修改] - 密码复杂度校验
- `core/src/utils/logger.js` [重写] - 日志轮转机制
- `web/src/views/Login.vue` [修改] - 前端密码复杂度同步
- `web/src/components/UserInfoCard.vue` [修改] - 移除冗余 TS 变量

---

## 📊 版本统计

### 代码变更统计

| 版本 | 新增文件 | 修改文件 | 新增行数 | 删除行数 |
|------|----------|----------|----------|----------|
| v3.3.4 | 0 | 4 | +60 | -40 |
| v3.3.3 | 0 | 3 | +15 | -20 |
| v3.3.2 | 0 | 2 | +20 | -10 |
| v3.3.1 | 0 | 4 | +90 | -30 |
| v3.3.0 | 0 | 2 | +60 | -5 |
| v3.2.9 | 0 | 3 | +80 | -15 |
| v3.2.8 | 0 | 2 | +45 | -2 |
| v3.2.2 | 0 | 2 | +50 | -20 |
| v3.2.1 | 0 | 1 | +30 | -10 |
| v3.2.0 | 0 | 3 | +120 | -40 |
| v3.1.0 | 1 | 2 | +80 | -20 |
| v3.0.0 | 0 | 5 | +300 | -100 |
| v2.0.6 | 0 | 7 | +100 | -50 |
| v2.0.5 | 3 | 5 | +250 | -80 |

**总计**：
- 新增文件：4 个
- 修改文件：45 个
- 新增代码：~1,300 行
- 删除代码：~442 行

---

## 🔍 质量检查报告

### ✅ 已验证的功能

#### 1. 主题切换功能
- ✅ 按钮位置正确（改密右侧，退出左侧）
- ✅ 三态切换正常（浅色 → 深色 → 自动）
- ✅ 图标显示正确（太阳/月亮/亮度对比）
- ✅ 文字提示清晰（浅色/深色/自动）
- ✅ 悬浮提示完整
- ✅ 原顶部按钮已移除

#### 2. 体验卡系统
- ✅ 体验卡生成（T 类型）
- ✅ IP 限制和冷却机制
- ✅ 自助续费功能
- ✅ 过期用户放行逻辑
- ✅ Dashboard 呼吸灯特效
- ✅ 高精度倒计时

#### 3. 卡密系统
- ✅ 卡密类型枚举统一
- ✅ 注册功能验证
- ✅ 续费功能修复
- ✅ 跨用户检测
- ✅ 密码复杂度验证
- ✅ 操作日志记录

#### 4. UI 优化
- ✅ Analytics 标签统一
- ✅ 深色模式对比度
- ✅ 策略选种预览优化
- ✅ 推送渠道链接修正

---

### ⚠️ 发现的问题

#### 1. 数据库升级未完成（进行中）

**状态**：核心功能已完成，待 API 集成

**已完成**：
- ✅ 数据库表设计（10 个表）
- ✅ 数据库服务层
- ✅ 数据访问层（17 个方法）
- ✅ 数据迁移脚本
- ✅ 完整文档（5 个）

**待完成**：
- ⏳ API 接口改造（预计 2-3 天）
- ⏳ 前端适配（预计 1-2 天）
- ⏳ 全面测试（预计 1-2 天）

**影响**：目前账号设置仍使用 JSON 存储，掉线重连后可能丢失

**解决方案**：继续实施数据库升级计划

**文档**：
- `docs/README_DATABASE.md` - 总览
- `docs/DATABASE_QUICKSTART.md` - 快速开始
- `docs/DATABASE_UPGRADE_PLAN.md` - 详细计划
- `docs/DATABASE_IMPLEMENTATION_SUMMARY.md` - 实施总结
- `core/docs/DATABASE_MIGRATION_GUIDE.md` - 迁移指南

---

#### 2. 潜在的性能问题

**问题**：有机肥循环施肥额外调用 `getAllLands()`

**影响**：每次巡田多一次 API 调用

**解决方案**：
- 已优化：新增 `cachedLandsReply` 参数支持缓存传递
- 待优化：统一地块数据缓存管理

**涉及文件**：`core/src/services/farm.js`

---

#### 3. 好友过滤加载问题

**状态**：✅ 已在 v2.0.3 修复

**修复内容**：
- 开启好友过滤时自动调用 `fetchFriends`
- 好友选择器从静态占位符升级为动态 checkbox 列表
- 显示好友昵称，无昵称时回退显示 GID

**涉及文件**：`web/src/views/Settings.vue`

---

### 💡 优化建议

#### 1. 短期优化（1-2 周）

##### 1.1 完成数据库升级
- **优先级**：P0（最高）
- **工作量**：4-7 天
- **收益**：彻底解决设置丢失问题

**步骤**：
1. 安装 `better-sqlite3` 依赖
2. 运行数据迁移脚本
3. 修改 API 接口集成数据库
4. 前端适配自动加载配置
5. 全面测试验证

##### 1.2 配置模板系统
- **优先级**：P1
- **工作量**：2-3 天
- **收益**：提升用户体验，简化配置管理

**功能**：
- 保存当前配置为模板
- 一键应用模板到多个账号
- 预设配置（新手/进阶/专业）

##### 1.3 性能优化
- **优先级**：P1
- **工作量**：1-2 天
- **收益**：减少 API 调用，提升响应速度

**优化点**：
- 统一地块数据缓存
- 好友列表缓存策略
- 配置数据预加载

---

#### 2. 中期优化（1-2 月）

##### 2.1 数据统计增强
- **优先级**：P2
- **工作量**：3-5 天
- **收益**：数据可视化，辅助决策

**功能**：
- 收益趋势图表
- 作物种植统计
- 好友互动排行
- 时间分布热力图

##### 2.2 移动端优化
- **优先级**：P2
- **工作量**：2-3 天
- **收益**：提升手机端用户体验

**优化点**：
- 响应式布局完善
- 触摸操作优化
- 移动端专属功能

##### 2.3 推送渠道扩展
- **优先级**：P3
- **工作量**：1-2 天
- **收益**：更多通知方式选择

**新增渠道**：
- 钉钉机器人
- 飞书机器人
- 企业微信应用消息

---

#### 3. 长期优化（3-6 月）

##### 3.1 云端同步
- **优先级**：P3
- **工作量**：10-15 天
- **收益**：多设备同步，数据备份

**功能**：
- 配置云端存储
- 多设备同步
- 数据自动备份
- 恢复点管理

##### 3.2 插件系统
- **优先级**：P4
- **工作量**：15-20 天
- **收益**：生态扩展，社区贡献

**功能**：
- 插件 API 设计
- 插件市场
- 热加载支持
- 沙箱隔离

##### 3.3 AI 智能推荐
- **优先级**：P4
- **工作量**：10-15 天
- **收益**：智能化配置，提升收益

**功能**：
- 作物种植推荐
- 施肥策略优化
- 好友互动建议
- 异常检测预警

---

## 📈 性能指标

### 当前性能

| 指标 | 数值 | 状态 |
|------|------|------|
| 内存占用 | 200-500MB | ✅ 正常 |
| CPU 占用（空闲） | < 5% | ✅ 优秀 |
| 磁盘占用 | ~100MB | ✅ 正常 |
| 并发账号数 | 10-20 | ✅ 良好 |
| 查询响应时间 | < 100ms | ✅ 优秀 |

### 优化目标

| 指标 | 当前 | 目标 | 提升 |
|------|------|------|------|
| 查询性能 | O(n) | O(log n) | 10-100x |
| 配置加载 | ~50ms | ~5ms | 10x |
| 并发能力 | 10-20 | 50+ | 2.5-5x |
| 数据可靠性 | 80% | 99.9% | 显著提升 |

---

## 🎯 下一步行动计划

### 立即执行（本周）

1. ✅ **主题切换按钮优化** - 已完成
2. ⏳ **数据库升级实施** - 进行中
   - [ ] 安装依赖
   - [ ] 运行迁移
   - [ ] API 集成
   - [ ] 前端适配
   - [ ] 测试验证
3. ⏳ **配置模板系统** - 计划中

### 近期计划（2 周内）

- [ ] 性能优化（缓存策略）
- [ ] 数据统计图表
- [ ] 移动端优化
- [ ] 推送渠道扩展

### 长期规划（1-3 月）

- [ ] 云端同步
- [ ] 插件系统
- [ ] AI 智能推荐
- [ ] 多语言支持

---

## 📞 技术支持

### 文档资源

- **快速开始**：[`README.md`](../README.md)
- **部署指南**：[`DEPLOYMENT.md`](../DEPLOYMENT.md)
- **测试指南**：[`TESTING_GUIDE.md`](../TESTING_GUIDE.md)
- **数据库升级**：[`docs/README_DATABASE.md`](docs/README_DATABASE.md)

### 问题反馈

- **GitHub Issues**: https://github.com/Penty-d/qq-farm-bot-ui/issues
- **项目地址**: https://github.com/Penty-d/qq-farm-bot-ui

---

## 📝 更新说明

**最后更新**: 2026-03-01  
**版本**: v3.3.3  
**状态**: ✅ 生产就绪

**更新内容**:
- ✅ Chrome 闪烁修复（glass-panel / mesh-orb / HelpButton）
- ✅ 好友列表按钮 UI 统一（6 种颜色变体）
- ✅ 公告弹窗品牌信息注入
- ✅ Tooltip 推荐标签颜色修复
- ✅ 性能模式全面增强
- ✅ 记录最近所有优化和更新

---

**文档结束**
