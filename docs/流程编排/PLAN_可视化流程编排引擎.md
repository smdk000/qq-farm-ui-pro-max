# 农场与好友操作：可视化流程编排系统 (Workflow Engine)

## 🎯 需求背景 (Context)
当前的 QQ 农场辅助系统中，所有“自动判断与执行”的先后顺序均由 Node.js 底层源码的 `await` 堆排硬编码固化写死（例如：固定按除草 -> 除虫 -> 浇水 -> 施肥 -> 偷菜的流水线执行）。
**痛点**：用户如果想要调整自己账号的“行动偏好顺序”，或者想临时插入一些停顿节点（Sleep/Delay），甚至希望农场在部分作物“仅差几分钟成熟”时处于「蹲点暂停执行后续任务」的截断状态，目前系统架构无法实现。

**目标**：引入一套全新的 **工作流节点可视化编排矩阵引擎 (Task Node Workflow)**，允许用户拖拽自定义每个账号的执行编排。

---

## 🏗️ 核心架构设计 (Architecture Blueprint)

系统将全域自动化区分为两个子编排器：**【农场内部巡查编排】** 与 **【好友外围巡查编排】**。
一切零散的函数行为（如：除草、施肥、铲除、偷取等）将被抽象封装为独立的**「行为节点 (Action Node)」**。

### 1. 存储层映射拓扑 (`store.js`)
打破原有的纯 Switch 开关控制，引入全新的串联数组模型：

```javascript
// 账号独立配置将挂载 workflowConfig 字典
workflowConfig: {
    farm: {
        enabled: false,            // 是否覆盖传统执行模式启用流程引擎
        minInterval: 2,           // 循环基础下限(秒)
        maxInterval: 2,             // 循环基础上限(秒)
        nodes: [                  // 用户的编排顺序链
            { id: 'uuid-1', type: 'weed' },
            { id: 'uuid-2', type: 'delay', params: { sec: 5 } },
            { id: 'uuid-3', type: 'fertilize', params: { mode: 'organic' } }
        ]
    },
    // friend 同理...
}
```

### 2. 调度控制层解耦 (`farm.js` / `friend.js`)
- 设立 `runFarmWorkflow(nodesConfig)` 微内核循环引擎。
- 取代原有的平铺 `await` 结构，使用 `for (const node of nodes)` 进行节点弹栈。
- **状态中断指令 (Interrupt Signals)**：引擎需要支持特殊节点（如“等待成熟”），若识别到时间未到，该节点有权返回 `SIGNAL_ABORT_CHAIN` 直接掐断后续序列。

### 3. 可视化前端构筑 (Vue 3)
- 依赖：引入 `vuedraggable` (基于 Sortable.js 的 Vue 3 官方版本)。
- UI 布局基调：提供上方**「已编排队列 (Kanban)」**与下方**「可用节点仓库 (Pool)」**。支持直接跨容器拖拽。
- 定制化参数台：点击队列中支持参数的节点（如延时、施肥），弹出内敛的参数微调表单。

---

## 🛠️ 分步实施计划 (Implementation Phases)

### 阶段一：底层存储库重构 (Storage & Models)
1. 变更 `DEFAULT_ACCOUNT_CONFIG` 并植入 `workflowConfig` 数据桩。
2. 重写 `store.js` 内的 `clone`、`normalize` 以及持久化钩子，确保带有深层参数的对象数据能够无损固化为 JSON 文件。
3. 修缮 `admin.js` API 层，令其支持接收由前端大批量提交的节点 Array。

### 阶段二：前端面板建设 (UI Dashboard)
1. 安装依赖包：`pnpm install vuedraggable@4.1.0`。
2. 创立新页面容器 `web/src/views/Workflow.vue`（置于侧边导航独立路由，避免撑爆原有的 Settings 页面）。
3. 采用暗色 Cyber 风格搭建「货架组件」和「编排带组件」。
4. 挂载 Pinia 接口，打通前端拖拽动作到后端保存的异步状态桥梁。

### 阶段三：解析器引擎对插 (Engine Binding)
1. 拦截 `worker.js` 定时巡查轮询：如果判定账号 `workflowConfig.farm.enabled === true`，剥夺旧 `checkFarm` 函数的执行权。
2. 编写 Action Mapping 字典，将 `weed`、`bug`、`water` 等名称映射至旧版实际 API 请求函数（并剔除旧版函数内部由于历史遗留下来的冗余 Sleep）。
3. 联调测试诸如“施肥”配置透传问题和“延迟”节点的阻塞有效性。

---

## 📋 约束与风险声明
1. **老用户平滑兼容**：流程引擎属于**可选项**，新增的 JSON 属性默认值必须是 `enabled: false`，绝不能影响完全不想折腾高级功能的老用户生态。
2. **死循环死锁防范**：工作流引擎内必须插入「最大执行时长限制 (Timeout/Circuit Breaker)」，防止某些用户在编排里大量串联 `delay(99999)` 导致 Node 异步池完全枯竭。
