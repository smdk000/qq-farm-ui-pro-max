# TASK: 原子任务拆解

## 任务列表

### [x] 1. 后端 Models 及常量扩充
- 无需强制修改 `store.js` 原文（因为动态存储支持），如果有给默认值的地方需要配给默认值 `stakeout_steal = false`、`stakeout_delay = 3`。

### [x] 2. Friend 分析逻辑增强 (core/src/services/friend.js)
- `analyzeFriendLands()` 在循环所有 `lands` 时，判断如果 `phaseVal !== PlantPhase.MATURE` 并且 `matureInSec > 0` 的情况。
- 只有被 `shouldStealPlant` 和 `shouldStealFriend` 白名单放行，并且可偷 (`plant.stealable !== false` 也许未成熟无法判断，先根据偷菜设置放行即可，实际以最后偷取时的能否偷为准)。
- 返回结构体中增加 `upcomingMature: [{ landId, matureInSec, plantId, name }]`。

### [x] 3. Friend 蹲守调度机制 (core/src/services/friend.js)
- 新增 `scheduleStakeout(friend, upcomingMature)` 方法：如果开启了蹲守开关，找出这些即将成熟的 lands。按 `matureInSec` 升序。取下一个 4 小时内成熟的所有果实。把 `matureInSec` 相差在 10 秒之内的地块划为一个组（同一个组可以一次踩点全偷）。
- 对每一个组，建立 `friendScheduler.setTimeoutTask('stake_' + friendGid + '_' + index, triggerWait)`。
- 设定的回调内容是：`enterFriendFarm`，然后等待到准点并加上 `automation.stakeout_delay`，接着执行 `stealHarvest(friendGid, 对应 lands)`，发送记录和日志。离开农场。

### [x] 4. 前端设置页开发 (web/src/views/StealSettings.vue)
- 新增加一个选项区域“高级偷菜与蹲守策略”。
- 加入包含 Toggle 开关的 `stakeout_steal`（蹲守偷菜开启）。
- 加入包含 Input（0-60秒数字即可）的延迟配置项。
- 保存操作统一跟随已有的 `saveAccountSettings()` 提交。

### [x] 5. 文档清理与验证
- 更新 `ACCEPTANCE_stakeout_steal.md`。
- 测试确保日志输出正常蹲守挂起和到达后的收获。
