# TASK: 农场系统演进 Phase 3 拆解

- [ ] **任务 1**：后端日志检索 API (`core`)
  - [ ] 在 `core/src/routes/` 添置日志专用接口路由。
  - [ ] 实现基于动态参数的分页查询 SQL (支持基于 level, account_id, text_like 的筛选)。
- [ ] **任务 2**：前端审计面板 UI (`web`)
  - [ ] 编写 `web/src/views/SystemLogs.vue` (或内嵌的 LogPanel 组件)。
  - [ ] 添加过滤用表单和 Antd 分页表格映射。
  - [ ] 在主菜单或全局设置内添加进入审计面板的入口。
- [ ] **任务 3**：`friend.js` 底层剥离 (`core`)
  - [ ] 将偷菜、除草、浇水等零碎 API 方法迁移到 `friend-actions.js`。
  - [ ] 将扫描及轮廓梳理搬迁到 `friend-scanner.js` 与 `friend-decision.js`。
  - [ ] 修正引用关系，并通过 `npm run test` (由于无 test 可选 `eslint`) 保障重构不丢失变量。
