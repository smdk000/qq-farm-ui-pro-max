# TASK: 60秒防偷施肥 - 实况二次校验 (Double Check)

## 1. 拆解行动清单

### 阶段 1: 定制防呆探测逻辑 (State Probing)
- [x] 1.1 修改 `core/src/services/farm.js` 中的 `antiStealHarvest` 方法。
- [x] 1.2 在请求最初，新增 `getAllLands()` 以拉取实时情况。
- [x] 1.3 通过 `landId` 抽出需要执行探测的地块信息：
  - [x] 若地块不存在，或植物为死亡状态，产生防呆跳回，输出拦截日志。
  - [x] 借由 `getCurrentPhase()` 获取状态和倒计时，如果 `matureInSec` 为负数或大于一个容差边界（比如 65 秒），表明此该植物经历过用户人为改变生命历程，立即跳出抛弃施肥指令。
  - [x] 若检查均符合正常预期，方可放行下方施加化肥及采摘的代码段。

### 阶段 2: 文档更新 (Docs update)
- [x] 2.1 将更新细节汇入对应说明与日志中，形成代码闭环。

---
**架构图参考**:
[Plan_20260228_DoubleCheck.html](../plans/Plan_20260228_DoubleCheck.html)
