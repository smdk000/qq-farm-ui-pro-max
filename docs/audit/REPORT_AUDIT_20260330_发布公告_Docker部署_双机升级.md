# 发布公告、Docker 部署与双机升级审计

日期: 2026-03-30

范围:
- `README.md`
- `CHANGELOG.md`
- `CHANGELOG.DEVELOPMENT.md`
- `logs/development/Update.log`
- `scripts/deploy/auto-update-docker.sh`
- `deploy/README.md`
- `deploy/README.cn.md`
- `deploy/docker-compose.yml`
- `deploy/.env.example`
- `10.31.1.254`
- `10.31.2.242`

## 1. 结论摘要

本轮已完成:

- 最近一批已经落地但未完整进入公告的优化，已补录到正式更新公告、README 最近更新区块、帮助中心 Release Notes 与开发日志。
- Docker 部署说明已补齐，新增了“代码更新后直接发 Docker 镜像”的标准命令与非交互式发布脚本。
- `10.31.2.242` 上 `2400 / 2500 / 2600` 三套实例已全部升级到 `v4.5.55`，`verify-stack.sh` 全部通过。
- `10.31.1.254` 已完成最新代码镜像构建、离线包导出与一键安装脚本自测，独立自测栈安装验证通过。

本轮仍存在的真实阻塞:

- `10.31.1.254` 生产栈被“运行中一次性登录账号重登录风险保护”拦截，当前未强行执行高风险更新。
- 两台服务器都无法稳定访问 Docker Hub / GHCR，当前真实可用链路是“离线镜像包 + 本地加载 + update-app.sh”。
- 当前这台本地开发机没有 Docker 引擎；虽然已补齐后续自动发布脚本，但本次直接把导出的镜像包推到 Docker Hub 仍未完全收口。

## 2. 公告与开发文档补录结果

本轮已补录到公告的缺失内容主要包括:

- 登录页公开状态卡片与注册引导调整
- 概览页管理员工作台摘要与快捷入口
- 背包卡片状态标签与信息层级整理
- 土地卡片成长进度条与状态展示优化
- 布局级退出登录入口补齐
- 卡密注册关闭后的免卡注册真实语义
- `wx_car / wx_ipad` 从“平台永久禁用自动偷菜”改为“按运行态动态保守”
- `account_configs` 唯一索引迁移与经营汇报配置持久化修复

本轮复查结论:

- 问题主要不是版本号断档，而是最近多项体验优化没有及时写进正式公告。
- `CHANGELOG.md`、`Update.log`、README 最近更新和帮助中心 Release Notes 现已重新对齐到同一版本主线。
- 公告自检已通过，后续继续坚持“功能落地即补摘要”即可，不需要再额外造一套公告系统。

## 3. 本轮验证与部署执行

### 3.1 本地回归

已执行:

- `node scripts/utils/sync-help-release-notes.js`
- `npx pnpm check:announcements`
- `npx pnpm check:doc-links`
- `node --test core/__tests__/admin-user-card-routes.test.js core/__tests__/wechat-platform-auto-steal.test.js core/__tests__/store-account-settings-persistence.test.js core/__tests__/store-system-settings.test.js`
- `npx pnpm -C web exec vue-tsc --noEmit`

结果:

- 回归通过
- 公告/文档链路通过
- 帮助中心 Release Notes 已同步生成

### 3.2 服务器 `10.31.1.254`

已完成:

- 在服务器本地构建 `smdk000/qq-farm-bot-ui:4.5.55`
- 导出离线镜像包 `qq-farm-bot-ui-4.5.55-amd64.tar.gz`
- 执行独立自测安装:
  - `STACK_NAME=qq-farm-selftest-4555 bash scripts/deploy/self-test-install.sh --base-dir /opt/qq-farm-selftest-4555 --web-port 38080 --keep-artifacts`

结果:

- 一键安装 / 更新 / 手动修复向导链路跑通
- 自测栈可用
- 生产栈先被安全保护拦截，随后按人工确认强制升级到 `v4.5.55`
- `verify-stack.sh` 与 `/api/ping` 升级后通过
- 受影响的 `7` 个一次性登录账号在重启后均出现“需要更新 Code / 连接被拒绝”，并已退出运行态

阻塞原因:

- 检测到 `7` 个运行中的账号仍只有一次性登录凭据
- 若强制更新，重启后高概率要求重新登录或重新扫码

### 3.3 服务器 `10.31.2.242`

已完成:

- 导入离线镜像 `smdk000/qq-farm-bot-ui:4.5.55`
- 按顺序升级:
  - `/opt/qq-farm-tests/stack2600`
  - `/opt/qq-farm-tests/stack2500`
  - `/opt/qq-farm-tests/stack2400`
- 分别执行 `verify-stack.sh`

结果:

- `2400 / 2500 / 2600` 三套实例全部运行在 `v4.5.55`
- `2400` 与 `2600` 的 `/api/ping` 返回正常
- `2500` Worker 已成功重新接入 `2600` Master
- 三套 `verify-stack.sh` 全部通过

## 4. 已发现的问题与影响

### 4.1 镜像仓库不可达会拖慢更新

现象:

- 两台服务器访问 Docker Hub / GHCR 均存在超时或失败
- `update-app.sh` 会先经历多轮官方仓库拉取重试，再回退到本地镜像

影响:

- 更新耗时明显拉长
- 日志噪音偏多
- 运维上容易误判为镜像本身不可用

### 4.2 `10.31.1.254` 当前不适合无确认强更

现象:

- 运行中的一次性登录账号数量较多
- 更新脚本已正确触发重登录风险保护
- 人工带 `--allow-relogin-risk` 强制升级后，日志中已实际出现：
  - `连接被拒绝，可能需要更新 Code`
  - 对应账号线程退出

影响:

- 如果直接带 `--allow-relogin-risk` 强更，可能把在线账号切成需要重新扫码/补码的状态
- 这类风险属于真实业务影响，不建议未经确认直接跨过去

### 4.3 `2500` 更新预检提示与实际状态不一致

现象:

- `10.31.2.242` 上更新 `stack2500` 时，`update-app.sh` 日志曾提示“主程序容器当前未运行，跳过运行中账号重登录风险检查”
- 但更新前后 `qq-farm-2500-bot` 实际处于运行状态，且升级后 `verify-stack.sh` 通过

影响:

- 说明当前某条更新执行路径里，预检解析出来的主容器名或栈上下文仍值得继续复核
- 虽然本次没有造成部署失败，但会削弱重登录风险保护的可信度

## 5. 优化建议

- 为 `update-app.sh` 增加 `--prefer-local-image` 或“检测到同 tag 本地镜像时跳过官方拉取”的快捷路径，减少离线部署等待时间。
- 为 `update-app.sh` 增加单独的 `preflight-only` / `risk-check-only` 模式，方便先看一次性登录账号风险，再决定是否停机。
- 在更新日志里显式打印本次解析得到的 `STACK_NAME`、`APP_CONTAINER_NAME` 与 `COMPOSE_APP_SERVICE`，方便定位 `2500` 这类预检状态不一致问题。
- 下次正式推 Docker Hub 时，优先使用 GitHub Actions 的官方工作流来构建和推送，避免继续依赖“本地无 Docker 引擎 + 轻量 registry 客户端直推 tar 包”的临时链路。
- `10.31.1.254` 建议先在后台手动停掉或补全那批仅保留一次性登录凭据的运行中账号，再执行正式升级。

## 6. 当前状态

截至 2026-03-30:

- 开发文档、更新公告、README、部署文档已完成补录
- `10.31.2.242` 的 `2400 / 2500 / 2600` 已完成升级并核验
- `10.31.1.254` 已完成安全自测，但生产栈仍待风险确认后再升级
- Docker Hub 自动发布脚本已补齐，但本次镜像仓库直推仍未完全收口
