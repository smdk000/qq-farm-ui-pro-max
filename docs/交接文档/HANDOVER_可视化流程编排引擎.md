# 开发交接报告 (HANDOVER) - 流程编排系统

**交接时间**: 2026-03-02 02:27
**目标任务**: 实现类似竞品《农场/好友自动化流程编排》，并提供拖拽式（`vuedraggable`）UI看板与后端的解释器机制引擎。

---

## 🛑 当前进度与状态切片 (Where we stopped)

1. **整体蓝图规划**已就绪。所有可行性验证、架构路由、数据 Schema 均已成型。
   - 参考文档: `docs/流程编排/PLAN_可视化流程编排引擎.md` (Markdown版本)
   - 参考文档: `docs/plans/可视化流程编排引擎_全景解析报告.html` (深色HTML版本)
2. 刚刚申请执行为前端目录 `./web` **安装 `vuedraggable@4.1.0` 依赖包，但由于外部系统中断因素，终端执行命令被用户主动或意外取消。**
3. 试图向底座 `core/src/models/store.js` 内植入 `workflowConfig` 全系数据桩位与深拷贝序列化的代码修改步骤**未执行并被回滚**，底层代码仍处于原样。

---

## 🛣️ 接任者执行路线图 (Next Steps)

下一位接手任务的工程师，请严格遵循《极简 6A 生命周期与聚合文档管理》的 S 规范行事，并按照以下顺序复工：

### 1. 挂接依赖 (环境基建)
进入 `web` 目录，执行包管理器挂载拖拽引擎。
建议命令: `cd web && pnpm install vuedraggable@4.1.0`

### 2. 打通后端的存储穴位 (Backend Storage)
在 `core/src/models/store.js` 内的 `DEFAULT_ACCOUNT_CONFIG` 尾部定义流程池：
```javascript
workflowConfig: {
    farm: { enabled: false, minInterval: 2, maxInterval: 2, nodes: [] },
    friend: { enabled: false, minInterval: 10, maxInterval: 10, nodes: [] }
}
```
并且切记在 `cloneAccountConfig` 和 `normalizeAccountConfig` 里完成容错递归处理（防止未配置的旧账号抛错）。

### 3. 改写发动机链路 (Backend Dispatcher)
在 `worker.js` 内的 `runFarmTick` 中介入拦截：判断 `if(workflowConfig.farm.enabled)` 则调用新建的 `runFarmWorkflow(config.nodes)`，屏蔽基于纯开关堆砌的历史代码。

### 4. 搭建前端组件 (Frontend UI)
由于现有 `Settings.vue` 的复杂性极高，**强烈建议**为该流程独立开设一个新的 Vue 路由页面，用两个容器包裹 `vuedraggable` 实现左侧（预制卡片仓库节点）拖入右侧（激活排序的节点串），最终在组件内保存成 JSON Array 数据上报至 `admin.js`。

---

**备注**: 本次中止发生于刚进入 `EXECUTION`（写盘阶段之前）。当前代码库绝对干净安全，没有一半残留的不健康逻辑，您可以直接切入。
