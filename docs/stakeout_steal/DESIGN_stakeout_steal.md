# DESIGN: 蹲守偷菜功能架构设计

## 1. 整体流程序列图

```mermaid
sequenceDiagram
    participant UI as StealSettings(Vue)
    participant Worker as Worker(Node)
    participant FriendSvc as friend.js
    participant Scheduler as scheduler.js
    participant Server as QQ Farm Backend

    UI->>Worker: 保存配置(开启蹲守, 延迟 3s)
    Worker->>FriendSvc: 挂机开启, checkFriends() 循环
    FriendSvc->>Server: 获取所有好友信息
    Server-->>FriendSvc: 好友及作物概况
    opt 发现自己有资格且尚未成熟的土地
        FriendSvc->>Server: enterFriendFarm()
        Server-->>FriendSvc: Lands Info
        FriendSvc-->>FriendSvc: analyzeFriendLands() 分析每块土地成熟倒计时
        opt 距离成熟 > 5秒
            FriendSvc->>Scheduler: setTimeoutTask('stakeout_好友gid', 触发于 (成熟时间-3秒))
        end
    end

    note over Scheduler: 经过一段时间...
    Scheduler-->>FriendSvc: 触发 stakeout_好友gid 定时蹲守任务
    FriendSvc->>Server: enterFriendFarm(踩点进入)
    FriendSvc->>FriendSvc: sleep(3秒 + 用户配置的延迟秒数)
    FriendSvc->>Server: stealHarvest(偷取请求)
    Server-->>FriendSvc: 返回偷取结果
    FriendSvc->>Server: leaveFriendFarm(离开)
```

## 2. 数据结构变化
**`models/store.js`** 的 `automation` 配置对象新增：
```json
{
  "stakeout_steal": true,
  "stakeout_delay": 3
}
```

## 3. 代码模块设计
1. **`core/src/services/friend.js`**:
   - `analyzeFriendLands`: 扩充返回的 `summary` 的数据，把未成熟但可以作为蹲守目标的地块加入返回列表（`upcomingMature: [{landId, matureInSec, plantId}]`）。目前已计算出 `matureInSec`。需要对黑白名单 `shouldStealPlant(plantId)` 和 `shouldStealFriend(gid)` 进行校验后过滤。
   - `checkFriends` 循环：在拿到 `status.upcomingMature` 时，如果开启了 `stakeout_steal`，就按最快的那个果实的 `matureInSec` 减去 3 秒，建立 `setTimeoutTask`。
   - 新增方法 `runStakeoutSteal(friendGid, landIds, waitSec, delaySec, name)`。
     被触发时：`await enterFriendFarm` -> `sleep(waitSec + delaySec)` -> `stealHarvest` -> 记录并离开 -> `leaveFriendFarm`。
     （此处应加入一层时间判定，如果是很长时间之后成熟的就不安排）。
2. **`web/src/views/StealSettings.vue`**:
   - 在 UI 顶部（搜索框和 Mode 这一层，或者作为一个配置卡片）增加“蹲守偷菜”开关以及秒数输入框。
3. **`web/src/stores/setting.ts` （无需修改直接透传）**:
   - 因为已经是 `Object.assign(fullSettingsToSave.automation, localSettings.value.automation)` 所以前端只要增加 `localSettings.value.automation.stakeoutEnabled` 和 `stakeoutDelayNum`。
