# Phase 7: 系统演进与隐患治理 (SystemEvolution7) - Task

## Atomize 原子任务拆解

### [ ] Task 1: 启动阻断防错机制 (Bootstrap Guard)
- 在 `data-provider.js` 或初始化时提供 `checkDatabaseReady()` 函数。
- 捕获异常拦截点，抛弃并包装系统的堆栈跟踪报错，改写成基于 `console.error` 的友好处方输出（涵盖检测本地 3306、密码等）。

### [ ] Task 2: Worker 端账户差分重载 (Account Diff Loading)
- 改造 `core/src/cluster/worker-client.js` 的 `master:assign:accounts` 监听器。
- 实现 `diffAccounts(oldList, newList)` 业务流：
  - 剔除不再此 Worker 的账号 (Trigger `worker.stopAccount`)。
  - 新增/凭据变化的账号 (Trigger `worker.startAccount`)。
  - 无需改变的账号池维持运行 (Do nothing 极简通行)。

### [ ] Task 3: Vue 异步组件 Suspense 遮罩
- 查阅 `web/src/views/FarmTools.vue` 之前改为了动态加载逻辑未完善？不，是 `Dashboard.vue` 或 `router/index.ts` 里的按需。
- 或在 `App.vue` 中的 `<router-view>` 包一层 `<Suspense>`：
  ```vue
  <router-view v-slot="{ Component }">
    <transition name="fade">
      <Suspense>
        <component :is="Component" />
        <template #fallback>
          <div class="flex items-center justify-center p-20..."><Loading/></div>
        </template>
      </Suspense>
    </transition>
  </router-view>
  ```

### [ ] Task 4: 清理旧纪元包与脚本 (Legacy Scripts Deprecation)
- 将旧的引导启动 `.sh` 归档到新建文件夹。
- 梳理根目录，只留 `docker-compose.yml` 与标准依赖库。
