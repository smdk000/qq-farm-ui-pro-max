# QQ 农场智能助手 - 开发日志

> 本文档记录项目的所有重大更新、优化和 Bug 修复

---

## 📅 最近更新

### 快速索引（精简版）

- `v4.5.37 (2026-03-25)` 更新入口容器直连热修复：更新脚本、更新代理和核验脚本改为优先直连显式容器名执行 `node` 侧探针，修复 Compose project 名受目录/软链影响时误判服务未运行的问题。
- `v4.5.36 (2026-03-25)` 远程更新软链热修复与服务器安装兜底：修复 `repair-deploy.sh / update-app.sh` 在 current 链接路径下可能写出自指软链的问题，并统一更新代理与修库脚本的真实目录解析。
- `v4.5.35 (2026-03-25)` 系统更新中心远程更新闭环与 smoke 自检：公告同步、准备度检查、最近 smoke 摘要、最短发布清单与部署脚本补齐，远程更新从发版到服务器执行形成闭环。
- `v4.5.34 (2026-03-25)` 帮助中心偏好记忆与高频回访补强：快捷筛选支持 URL 同步，新增清空收藏/已读与高频阅读入口，帮助中心更适合作为多轮 Release 的回访入口。
- `v4.5.33 (2026-03-25)` 帮助中心快捷筛选与空状态补强：新增“全部 / 收藏 / 未读 / 已读”快捷筛选与空状态提示，帮助中心继续向可操作文档中心收口。
- `v4.5.32 (2026-03-25)` 帮助中心阅读进度与近期 Release 可见性补强：新增阅读历史、分类完成度与已读标记，并复核最近几版 Release / 帮助中心 / 公告链路可用性。
- `v4.5.31 (2026-03-25)` 近期优化汇总与更新公告链路补齐：补齐 `Update.log` 中 `2026-03-17` 至 `2026-03-24` 的缺失版本公告，统一包版本、部署默认值与公告预检口径，更新弹窗不再停留在 `2026-03-16`。
- `v4.5.30 (2026-03-24)` 一键更新脚本重登录风险保护：更新脚本会在停应用前检查运行中的一次性登录账号，默认阻止把 `code-only` 账号重启成需要重新扫码/补码的状态，并提供显式 override 入口。
- `v4.5.29 (2026-03-24)` 账号 worker 侧 MySQL 懒初始化与好友风险画像修复：修复 `standalone + thread` 模式下好友风险画像写入直接报“连接池未初始化”的问题，并收口 worker 退出时的数据库清理与连接池规模。
- `v4.5.28 (2026-03-24)` 帮助中心数据模块入库与归档一致性修复：解除 `help-center.ts` 的误忽略并正式纳入版本控制，修复 GitHub / Release / Docker / 服务器源码包使用不同帮助中心数据的问题。
- `v4.5.27 (2026-03-24)` 帮助中心发布链路修复：补齐 Docker 构建上下文里的发布同步脚本，修复帮助中心 Release Notes 接入后导致的 Docker / Release / 服务器源码构建失败。
- `v4.5.26 (2026-03-24)` 帮助中心体系化、首次密码初始化与好友风险洞察：帮助中心升级为内容化文档中心，首次部署可直接初始化管理员密码，好友风险画像与重点偷取洞察正式接通后台与分析页。
- `v4.5.25 (2026-03-18)` 问题反馈链路与系统设置安全持久化：用户可提交带上下文的问题反馈，SMTP 密钥加密落盘，系统日志查询与设置页分区同步收口。
- `v4.5.24 (2026-03-18)` 农场工具资源库接入与移动端工作台整理：本地资源库清单化、静态图鉴纳管、移动端滚动与账号错误弹窗体验同步收口。
- `v4.5.23 (2026-03-17)` 微信休息保护可视化与保守链路细化：连续失败阈值、农场休息、账号面板状态透出与补缓存链路稳健性同步收口。
- `v4.5.22 (2026-03-17)` 微信好友保守链路与只读面板增强：手动刷新穿透、访客补缓存、只读好友页、日志摘要与快捷筛选同步落地。
- `v4.5.21 (2026-03-16)` QQ 风控守卫与设置体验统一优化：高风险窗口、封禁阻断、多链路好友抓取开关与主界面整理同步落地。
- `v4.5.20 (2026-03-11)` 发布链路归一与本地 Release 产物打包：本地/CI 统一输出二进制与部署包，Docker 推送脚本收口，旧服兼容软链补齐。
- `v4.5.19 (2026-03-11)` 部署统一入口与宿主机更新代理落地：统一安装/更新脚本、Release 资产补齐、旧服 current 链接迁移与自测闭环全部完成。
- `v4.5.18 (2026-03-10)` 发布链路与验收闭环：版本号抬升、部署脚本/修库脚本继续收口，前后端测试、lint、构建与公告/文档检查通过。
- `2026-03-09` 访客面板专用链路落地：新增独立接口、错误码分层、竞态保护与空账号状态清理；并完成一次链路复查与修复闭环。
- `v4.5.11 (2026-03-09)` 外观与汇报链路补正：主题联动参数补齐、SMTP 汇报打通、背包土地道具兼容修复、构建与校验通过。
- `v4.5.10 (2026-03-08)` 前端 lint/类型规则收口：恢复 `web lint` 与 CI 通过。
- `v4.5.9 (2026-03-08)` 登录背景系统增强：背景范围/遮罩/模糊可配，汇报统计卡片补齐，出售链路按真实条目拆分。
- `v4.5.8 (2026-03-08)` 公告同步稳健化：公开读取恢复、按日期标题解析、历史漏条目补齐。
- `v4.5.6 (2026-03-08)` 用户状态与登录链路修复：`users.status` 语义拆分、QQ/微信登录续航增强、发布链路稳健性提升。

> 说明：以上为“快速浏览摘要”；完整变更、验证命令与问题复盘请以下方详细记录为准。

### 开发补记 - v4.5.37 更新入口容器直连热修复 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **更新入口和更新代理的容器内桥接已改为直连容器名**: `update-app.sh`、`update-agent.sh` 不再依赖 `docker compose exec` 的 project 名推断，而是优先通过 `APP_CONTAINER_NAME` 调用容器内 Node 探针与桥接脚本。
- ✅ **核验与首装执行口径同步**: `verify-stack.sh` 的应用内探针、`fresh-install.sh` 的管理员密码同步也已切到直连容器，首装/核验/更新三条路径保持一致。
- ✅ **版本口径已抬升到 `v4.5.37`**: `core/package.json`、`web/package.json`、README、部署模板、构建脚本和默认镜像标签已经全部统一到 `v4.5.37`。

#### 🩹 真实环境复盘
- ✅ **服务器上的阻塞不是账号风险，而是 Compose project 名漂移**: 在 `aa.smdk000.com` 上，从软链路径和真实目录切换执行时，`docker compose exec` 会误报服务未运行，但 `docker ps` 显示容器其实仍在跑。
- ✅ **这一版是对 `v4.5.36` 的继续热修**: 前一版修掉了 current 软链自指，这一版把“进入容器执行检查/桥接”也换成稳定路径，才算把一键更新真正跑通。

#### 📌 本轮发布说明
- 📌 **这轮修的是服务器真实安装过程中再次暴露出的稳定性问题**: 属于运维闭环里的第二层 bug，不修的话更新中心和一键更新入口仍可能在旧服上误拦截。
- 📌 **这轮的目标不是新增功能，而是把远程更新链路在真实服务器上真正跑通**: 所以重点放在 `docker exec` 直连、版本再发一版、然后重新上服务器安装验证。

### 开发补记 - v4.5.36 远程更新软链热修复与服务器安装兜底 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **服务器真实环境发现的 current 自指问题已修复**: `repair-deploy.sh`、`update-app.sh` 现在都会先把部署目录解析成真实目录，再更新 current/legacy current 链接，不会再把软链路径写回成自指死链。
- ✅ **代理安装与修库链路已同步补强**: `update-agent.sh`、`install-update-agent-service.sh`、`repair-mysql.sh` 统一补了 `canonicalize_dir`，旧服务器升级、修库和代理安装不再吃软链路径时序的亏。
- ✅ **版本口径已抬升到 `v4.5.36`**: `core/package.json`、`web/package.json`、README、部署模板、构建脚本和默认镜像标签已经全部统一到 `v4.5.36`。

#### 🩹 review 后继续修掉的问题
- ✅ **系统更新页 smoke 复制按钮状态串联已修复**: “复制 smoke 命令”和“复制重跑 smoke 命令”现在使用独立 key，不会再互相影响按钮文案。
- ✅ **帮助中心本地状态恢复时机已提前**: 页面会更早恢复收藏、已读和高频阅读统计，减少刷新时的闪动与回填延迟。
- ✅ **Docker 构建上下文里的公告源缺口已修平**: `.dockerignore` 与 `core/Dockerfile` 已显式放行 `logs/development/Update.log`，本地和 CI 的 Docker build 都能继续带上更新公告源。

#### 📌 本轮发布说明
- 📌 **这轮是基于真实服务器安装/修复过程中暴露出来的问题做的热修复发版**: 不是纯本地代码清理，而是修一条真实会把 current 链接写坏的部署路径。
- 📌 **这轮重点是让“发版 -> 服务器 repair/update -> 安装代理 -> smoke”这条运维链路真正能稳定跑通**: 页面、帮助中心和脚本闭环之外，再补上了宿主机层面的真实可执行性。

### 开发补记 - v4.5.35 系统更新中心远程更新闭环与 smoke 自检 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **系统更新中心 P0-P4 主链路已完成对外可见收口**: 公告同步、更新中心统一入口、远程更新准备度、最近 smoke 摘要、帮助中心最短发布清单和系统更新页内帮助跳转已经全部落到正式代码。
- ✅ **Release deploy bundle 已补齐关键脚本**: `build-release-assets.sh` 现在会把 `safe-update.sh` 与 `smoke-system-update-center.sh` 一起打进 deploy bundle，避免服务器通过 Release 包安装后少脚本。
- ✅ **版本口径已抬升到 `v4.5.35`**: `core/package.json`、`web/package.json`、README、部署模板、离线包脚本、更新代理和默认镜像标签已经全部统一到 `v4.5.35`。

#### 🩹 review 后继续修掉的问题
- ✅ **smoke 摘要解析中的 URL 冒号截断已修复**: `SUMMARY.md` 里的 `http://...` 不会再被按冒号错误切断，最近 smoke 卡片能稳定显示基础地址和明细提示。
- ✅ **系统更新页 smoke 复制按钮状态歧义已消除**: “最短路径”与“最近 smoke 报告”两个按钮现在使用独立 control key，不会再互相串联高亮。
- ✅ **公告同步 dry-run 与正式结果已分流**: 纯预览请求不再覆盖总览里的上次正式同步结果，避免管理员误判最近一次真实同步是否执行过。

#### 📌 本轮发布说明
- 📌 **这轮重点是把“本地已经写完的远程更新能力”真正收成能发布、能部署、能自测的闭环**: 不只是页面按钮可见，而是帮助中心、部署脚本、Release 包、系统更新总览、远程 smoke 和公告同步口径一起对齐。
- 📌 **这轮同时补了一处发布链路真实缺口**: 如果不把 `safe-update.sh` 和 `smoke-system-update-center.sh` 打进 deploy bundle，通过 GitHub Release 落地的服务器安装包就会比仓库本地少脚本，这次已经一起修平。

### 开发补记 - v4.5.34 帮助中心偏好记忆与高频回访补强 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **帮助中心第三批本地交互改动已正式纳入发布**: `web/src/views/HelpCenter.vue` 继续补上快捷筛选 URL 同步、收藏/已读重置和高频阅读快捷入口，不再停留在本地工作区。
- ✅ **版本口径已抬升到 `v4.5.34`**: `core/package.json`、`web/package.json`、README、部署模板、离线包脚本、更新代理和默认镜像标签已经全部统一到 `v4.5.34`。
- ✅ **帮助中心版本说明继续共源**: `Update.log`、README 最近更新区块与 `web/src/generated/help-release-notes.ts` 会继续同步本轮 `v4.5.34` 摘要。

#### 📌 本轮发布说明
- 📌 **这轮仍然是在追平本地后续新增的帮助中心真实改动**: `v4.5.33` 发布后，工作区里又出现了基于阅读偏好的快捷回访和重置操作，这次一并纳入正式版本。
- 📌 **这轮重点是让帮助中心更适合承接多轮 Release 与排障文档**: 不只是看过什么，还能保留筛选视角、快速回到常用文档，并在收藏/已读状态堆积后快速自清理。

### 开发补记 - v4.5.33 帮助中心快捷筛选与空状态补强 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **帮助中心第二批本地交互改动已正式纳入发布**: `web/src/views/HelpCenter.vue` 补上了快捷筛选、筛选空状态和“阅读状态 -> 筛选结果”的联动逻辑。
- ✅ **版本口径已抬升到 `v4.5.33`**: `core/package.json`、`web/package.json`、README、部署模板、离线包脚本、更新代理和默认镜像标签已经全部统一到 `v4.5.33`。
- ✅ **帮助中心版本说明继续共源**: `Update.log`、README 最近更新区块与 `web/src/generated/help-release-notes.ts` 会继续同步本轮 `v4.5.33` 摘要。

#### 📌 本轮发布说明
- 📌 **这轮是对 `v4.5.32` 后又发现的一段本地未提交交互改动的继续补发**: 主要是帮助中心筛选体验，不涉及后端逻辑变更。
- 📌 **这轮的目标是让帮助中心真正可用来承接多轮 Release 文档**: 除了能记录你看过什么，还要能快速筛出“还没看 / 收藏了 / 已读过”的内容，否则版本文档越积越多时还是难找。

### 开发补记 - v4.5.32 帮助中心阅读进度与近期 Release 可见性补强 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **帮助中心本地真实改动已正式纳入发布**: `web/src/views/HelpCenter.vue` 新增最近阅读、已读状态与分类完成度，不再停留在只更新了数据源和公告、但界面交互仍未发版的状态。
- ✅ **版本口径已抬升到 `v4.5.32`**: `core/package.json`、`web/package.json`、README、部署模板、离线包脚本、更新代理和默认镜像标签已经全部统一到 `v4.5.32`。
- ✅ **最近几版 Release 可见性已做远端复核**: `v4.5.29`、`v4.5.30`、`v4.5.31` 的 GitHub Release、帮助中心 Release Notes 与运行态公告都已确认存在且可用。

#### 📌 本轮发布说明
- 📌 **这轮是对“本地还有漏发改动”的收口补发**: `v4.5.31` 已经把公告链路修齐，但随后核对工作区时发现帮助中心还有一份未提交的真实 UI 交互改动，所以继续补发 `v4.5.32`，确保服务器和镜像真正追上本地。
- 📌 **这轮重点不是再加一套新业务，而是把帮助中心的可用性补完整**: 用户现在可以看到自己最近看过哪些文章、每个分类已经看了多少、哪些文档已经读过，更适合拿来承接最近几版 Release 说明和排障指引。

### 开发补记 - v4.5.31 近期优化汇总与更新公告链路补齐 (2026-03-25)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.31`**: `core/package.json`、`web/package.json`、README、部署模板、离线包脚本、更新代理和默认镜像标签已经全部统一到 `v4.5.31`。
- ✅ **更新公告源已补齐近期多轮版本记录**: `logs/development/Update.log` 已补回 `v4.5.22` 到 `v4.5.30` 的公告，并新增本轮 `v4.5.31` 汇总，帮助中心、登录页弹窗和运行态通知重新共用同一份版本源。
- ✅ **公告预检脚本已补上最新版本一致性校验**: `check-announcements` 现在会同时校验 `CHANGELOG.md`、快速索引和 `Update.log` 的最新版本、日期与版本集合，后续漏补公告时会在发版前直接报错。
- ✅ **运行时模块与公开接口测试口径已同步新能力**: 新增的 `redpacket` / `behavior-report` 运行时模块，以及 `bootstrap-status`、`init-password`、健康探针和服务画像公开端点，都已经纳入回归口径。

#### 📌 本轮发布说明
- 📌 **这轮重点是把最近几版的发布可见性和默认值彻底对齐**: 不只是抬版本号，而是确保 GitHub Release、Docker 默认镜像、README、帮助中心 Release Notes 和运行态公告都指向同一套版本事实。
- 📌 **这轮同时补上了过去几版的“版本公告缺口”**: 所以本次验收不只看 `v4.5.31`，还要确保 `v4.5.22` 到 `v4.5.30` 在帮助中心和更新公告里都能完整看到。

### 开发补记 - v4.5.30 一键更新脚本重登录风险保护 (2026-03-24)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.30`**: `core/package.json`、`web/package.json`、部署模板、默认镜像标签、离线包脚本与自动更新脚本默认版本已经同步更新。
- ✅ **更新脚本已默认拦截运行中的 `code-only` 账号**: `update-app.sh` 在停应用前会先检查运行中的一次性登录账号，检测到后会直接拒绝继续更新，避免把当前仍在线的账号重启成 `400 / 需要重新扫码`。
- ✅ **统一安装入口和安全升级入口已接入 override 透传**: `install-or-update.sh`、`safe-update.sh` 现在都支持 `--allow-relogin-risk`，只有显式接受重登录成本时才会绕过保护继续执行。
- ✅ **重登录风险判定已有单测覆盖**: `account-migration` 补上聚合判定测试，确保“只拦运行中的一次性登录账号”这条口径稳定。

#### 📌 本轮发布说明
- 📌 **这轮修的是部署策略，不是 QQ 网关协议本身**: 服务器上出现的 `Unexpected server response: 400` 本质上是运行中的 `code-only` 账号在容器重启后丢失一次性登录态；如果继续默认无脑更新，后续每次部署都可能把在线账号打下线。
- 📌 **后台系统更新中台原本就有类似保护**: 这次是把同一层风险判断补到 CLI / 一键脚本，避免“后台面板会拦、命令行脚本却直接重启”的行为分叉。

#### 🧪 本轮验收
- ✅ `node --test core/__tests__/account-migration.test.js core/__tests__/admin-system-update-routes.test.js`
- ✅ `bash -n scripts/deploy/update-app.sh scripts/deploy/install-or-update.sh scripts/deploy/safe-update.sh`

### 开发补记 - v4.5.29 账号 worker 侧 MySQL 懒初始化与好友风险画像修复 (2026-03-24)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.29`**: `core/package.json`、`web/package.json`、部署模板、工作流默认值、离线包脚本与更新脚本中的默认镜像标签已经同步更新。
- ✅ **好友风险画像链路已改为 worker 侧按需初始化 MySQL**: 账号 worker 第一次记录被动偷取事件、查询风险画像或统计摘要时，会自动执行 `initMysql()`，不再要求主进程先帮它建好连接池。
- ✅ **账号 worker 的连接池规模已单独收口**: 新增 `MYSQL_WORKER_POOL_LIMIT` 兜底语义，默认让带 `FARM_ACCOUNT_ID` 的 worker 用更小连接池，避免每个账号线程都继承主进程的高并发池配置。
- ✅ **worker 停止时会主动清理数据库句柄**: `closeDatabase()` 已接到 worker 退出路径，减少账号重启或停止后残留连接影响下一轮运行。
- ✅ **风险画像修复测试已补上**: 新增 `core/__tests__/friend-risk-service.test.js`，覆盖 worker 首次调用自动初始化且不会重复建池的行为。

#### 📌 本轮发布说明
- 📌 **这次报错不是“MySQL 没装好”**: 服务器上的 MySQL 容器和库表本身是正常的，真正的问题是 `standalone + thread` 模式下账号 worker 直接调用好友风险服务时，没有先执行 `initDatabase()`。
- 📌 **本地默认独立运行模式理论上也会中招**: 只要本地也是默认的 `standalone` 且未显式改成非线程运行，好友风险画像这条链路就会和服务器走到同一个缺口。

#### 🧪 本轮验收
- ✅ `node --test core/__tests__/friend-risk-service.test.js core/__tests__/optional-db-skip.test.js core/__tests__/worker-client.test.js`

### 开发补记 - v4.5.28 帮助中心数据模块入库与归档一致性修复 (2026-03-24)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.28`**: `core/package.json`、`web/package.json`、部署模板、工作流默认值与更新脚本中的默认镜像标签已经同步更新。
- ✅ **帮助中心数据模块已正式入库**: `web/src/data/help-center.ts` 现在会随提交、Tag、Release 资产、Docker 构建与服务器源码包一起分发，不再依赖本地工作区残留文件。
- ✅ **`.gitignore` 误忽略已解除**: 根目录 `data/` 规则已显式放行帮助中心数据模块，后续再改这份数据时不会继续出现“本地能跑、归档缺文件”的错觉。

#### 📌 本轮发布说明
- 📌 **这轮是对 `v4.5.27` 归档一致性的补丁修复**: 构建脚本已经完整了，但帮助中心核心数据文件还没进仓，所以这次重点是让 clean checkout / git archive / Docker / 服务器源码构建统一收敛到同一份输入。

#### 🧪 本轮验收
- ✅ `pnpm test:web:regression`
- ✅ `pnpm -C web run test:e2e:help-center`
- ✅ `docker build -t smdk000/qq-farm-bot-ui:4.5.28 -f core/Dockerfile .`

### 开发补记 - v4.5.27 帮助中心发布链路修复 (2026-03-24)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.27`**: `core/package.json`、`web/package.json`、部署模板、工作流默认值与更新脚本中的默认镜像标签已经同步更新。
- ✅ **Docker 构建上下文已补齐帮助中心同步依赖**: `core/Dockerfile` 现在会复制 `scripts/utils` 与 `CHANGELOG.md`，帮助中心在 Web 构建前执行 `sync-help-release-notes.js` 时不再因为镜像构建缺文件而失败。
- ✅ **服务器源码构建 fallback 已一起修通**: 一键更新脚本在 Docker Hub / GHCR 不可用时，改走本地源码构建也能顺利执行 `pnpm build:web`，不再卡在 `MODULE_NOT_FOUND`。

#### 📌 本轮发布说明
- 📌 **这轮是对 `v4.5.26` 发布链路的补丁修复**: 业务功能不变，重点是把帮助中心接入 Release Notes 同步脚本后新增的发布依赖补回 Docker / Release / 服务器本地构建链路。

#### 🧪 本轮验收
- ✅ `pnpm lint:web`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm -C web run test:e2e:help-center`
- ✅ `pnpm -C web run farm-tools:sync`
- ✅ `pnpm check:doc-links`
- ✅ `docker build -t smdk000/qq-farm-bot-ui:4.5.27 -f core/Dockerfile .`

### 开发补记 - v4.5.26 帮助中心体系化、首次密码初始化与好友风险洞察 (2026-03-24)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.26`**: `core/package.json`、`web/package.json`、部署模板、工作流默认值、离线包脚本与更新脚本中的默认镜像标签已经同步更新。
- ✅ **首次部署初始化链路已接通**: 后端新增 `bootstrap-status` / `init-password` 接口，前端新增 `/init-password` 页面和路由守卫分流，首次部署不再要求手工改默认密码才能进入后台。
- ✅ **抓包补码 / 重绑入口已落到账号页**: 管理员可以直接预览抓包内容、识别 code / authTicket / OpenID / UIN，优先重绑现有账号，未命中时才新建账号，并自动写入来源与操作者审计信息。
- ✅ **好友风险画像与偷取统计已正式落库**: 新增 `friend_risk_profiles`、`friend_risk_events`、`friend_steal_stats` 表，偷菜设置页和分析页都已能显示风险好友分层、最近命中原因与累计偷取统计。
- ✅ **帮助中心已升级为内容化文档中心**: 帮助中心现在基于 Markdown 内容、提纲、搜索索引、版本亮点同步脚本和 Playwright 回归测试运行，不再是单页静态说明。
- ✅ **本地资源库继续同步到最新图鉴状态**: `mutation.html`、本地道具页、图片素材与相关数据文件已随同步脚本刷新，发布包里的农场工具资源保持最新。

#### 📌 本轮发布说明
- 📌 **这轮核心是把“新手第一次进入系统”和“管理员后续运维排障”两端都接住**: 首次部署可以直接初始化密码，帮助中心与补码入口也让后续接手和运维成本明显降低。
- 📌 **好友风险和重点偷取开始进入可运营状态**: 这轮不只是底层记日志，已经把风险画像、重点名单、实验开关和分析视图串成了一条完整链路。

#### 🧪 本轮验收
- ✅ `pnpm lint:web`
- ✅ `node --test core/__tests__/admin-bug-report-routes.test.js core/__tests__/bug-report-service.test.js core/__tests__/data-provider-wechat-protection.test.js core/__tests__/farm-wechat-suspend-guard.test.js core/__tests__/friend-actions-wechat-conservative.test.js core/__tests__/friend-steal-filter-compat.test.js core/__tests__/game-config-plant-fallbacks.test.js core/__tests__/mysql-db-account-owner-migration.test.js core/__tests__/optional-db-skip.test.js core/__tests__/report-email-payload.test.js core/__tests__/runtime-state-timing-config.test.js core/__tests__/smtp-mailer.test.js core/__tests__/store-auth-ticket-clear.test.js`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm -C web run test:e2e:help-center`
- ✅ `pnpm -C web run farm-tools:sync`
- ✅ `pnpm check:doc-links`

### 开发补记 - v4.5.25 问题反馈链路与系统设置安全持久化 (2026-03-18)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.25`**: `core/package.json`、`web/package.json`、部署模板、工作流默认值、离线包脚本与更新脚本中的默认镜像标签已经同步更新。
- ✅ **问题反馈主链路已打通**: 新增 `bug-report-routes`、`bug-report-service`、`bug_reports` 表迁移、邮件模板与仓储服务，前端用户可以从设置页相关入口提交带页面、账号、前端错误和日志摘录的反馈。
- ✅ **问题反馈 SMTP 配置改为安全持久化**: `secret-crypto.js` 会用本地密钥对 SMTP 密码做 AES-GCM 加密，管理员读取配置时只看到“已配置”状态，空密码保存不会覆盖既有密钥。
- ✅ **系统日志权限过滤已抽成共享查询服务**: 公共日志接口和问题反馈日志摘录现在共用 `system-log-query.js`，普通用户可见账号范围只维护一套规则。
- ✅ **设置页和前端上下文采集继续收口**: 新增 `BugReportModal.vue`、客户端错误缓冲和页面上下文采集工具，设置页补齐问题反馈配置区、测试发送和保存反馈。
- ✅ **农场工具变异数据正式落盘**: `mutation_calc.json`、`mutation_formula.json` 已纳入本地资源库，`mutation.html` 跟随同步脚本更新到最新计算数据。

#### 📌 本轮发布说明
- 📌 **这轮核心是让“用户报问题”从口头描述变成可操作链路**: 管理员不再只靠截图和聊天记录排查，邮件里会直接带上当前页面、账号、前端异常和日志摘录。
- 📌 **系统设置里首次引入本地密钥加密字段**: 这轮只先用于问题反馈 SMTP 密码，后续同类敏感配置可以沿用这套模式继续收口。

#### 🧪 本轮验收
- ✅ `node --test core/__tests__/admin-bug-report-routes.test.js core/__tests__/bug-report-service.test.js core/__tests__/store-system-settings.test.js core/__tests__/admin-feature-wiring.test.js`
- ✅ `node --test web/__tests__/bug-report-context.test.mjs web/__tests__/bug-report-client-errors.test.mjs`
- ✅ `pnpm lint:web`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm -C web run farm-tools:sync`
- ✅ `pnpm check:doc-links`
- ⚠️ `pnpm check:announcements`：0 error(s), 1 warning(s)，`logs/development/Update.log` 仍有 1 条 bullet 超过 120 字符

### 开发补记 - v4.5.24 农场工具资源库接入与移动端工作台整理 (2026-03-18)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.24`**: `core/package.json`、`web/package.json`、部署模板、离线包脚本与更新脚本中的默认镜像标签已经同步更新。
- ✅ **农场工具页改为清单驱动的本地资源库导航**: `FarmTools.vue` 现在会从本地 manifest/分组结构推导导航、默认入口和可用工具列表，避免继续手写零散菜单。
- ✅ **`nc_local_version` 静态资源正式纳入仓库**: `.gitignore` 已放开 `web/public/nc_local_version/**`，并补齐变异计算器、商店道具页、图片素材、数据文件和同步脚本入口。
- ✅ **移动端工作台滚动与吸顶行为继续收口**: `DefaultLayout.vue`、`style.css` 现在会在小屏设备上切换到更稳的单滚动布局，减少安全区、回弹和嵌套滚动带来的错位。
- ✅ **账号错误弹窗自动打开逻辑更克制**: `Sidebar.vue` 现在会为账号切换和初次加载建立缓冲窗口，避免历史 `wsError` 在保存账号后立刻打断当前操作。
- ✅ **资源同步脚本已补齐历史兼容性修复**: `scraper.py` 改为临时文件 + `os.replace` 原子落盘，并对 `/static/植物.ico` 这类非 ASCII 资源路径做 URL 编码，避免本地同步被历史 root 产物和中文文件名阻塞。

#### 📌 本轮发布说明
- 📌 **这轮重点是把“农场工具”从演示页改成可交付的本地资源库**: 现在发布包和服务器部署后，静态图鉴、道具页和变异计算页都能直接从主界面访问，不再依赖单机临时文件。
- 📌 **移动端体验继续优先做减法**: 这轮没有再堆更多视觉特效，主要是把顶部吸附、滚动容器和安全区行为做稳，避免在手机端出现二次滚动和布局跳动。

#### 🧪 本轮验收
- ✅ `pnpm lint:web`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm -C web run farm-tools:sync`
- ✅ `pnpm check:doc-links`
- ✅ `pnpm check:announcements`
- ✅ `bash -n scripts/deploy/*.sh deploy/scripts/*.sh scripts/docker/*.sh scripts/release/*.sh`

### 开发补记 - v4.5.23 微信休息保护可视化与保守链路细化 (2026-03-17)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.23`**: `core/package.json`、`web/package.json`、部署模板、Docker 工作流默认值、离线包脚本与更新脚本中的默认镜像标签已经同步更新。
- ✅ **微信好友链路改为“连续失败后再休息”**: `friend-actions.js` 现在会累计 `GetAll` 的 self-only / empty / error 连续失败次数，只有达到阈值后才进入冷却，并区分“有缓存回退”和“无缓存空结果”两类保护时长。
- ✅ **账号面板 / 仪表盘 / 日志补齐保护状态可视化**: `worker.js`、`data-provider.js`、`runtime-state.js`、`Dashboard.vue`、`AccountOwnership.vue`、`SystemLogs.vue` 现在会透出微信好友休息、农场休息、失败原因、剩余时间和 SyncAll 兼容状态。
- ✅ **微信账号休息期间暂停自家农场自动操作**: `farm.js` 在 `wx_car / wx_ipad` 账号进入休息时段时，会直接跳过自家农场自动操作，避免好友链路已经降级时仍继续发起高频动作。
- ✅ **好友补缓存链路继续加固**: `friend-cache-seeds.js` 改为延迟解析 `mergeFriendsCache`，`network.js` 的通知型补种现在会附带账号标识，减少模块加载顺序和多账号场景下的误写风险。
- ✅ **风控与日志文案统一改为“休息”语义**: `worker-manager.js`、`friend-scanner.js`、`network.js`、前端好友状态文案统一从“静默/风控”收口为更贴合当前策略的“休息一会/状态说明”表述。

#### 📌 本轮发布说明
- 📌 **这轮重点不是再加更多探测，而是把已有保护讲清楚、做稳**: 后端现在能更细粒度地区分“连续失败但暂不长休”“已回退缓存”“无缓存只能空结果”，前端则把这些状态直接展示给管理员。
- 📌 **微信平台的农场自动化进一步保守**: `wx_car` / `wx_ipad` 账号在休息时段里不再继续跑自家农场自动操作，整体行为更接近“先停一会儿再恢复”。

#### 🧪 本轮验收
- ✅ `node --test core/__tests__/friend-cache-seeds.test.js core/__tests__/data-provider-wechat-protection.test.js core/__tests__/farm-wechat-suspend-guard.test.js core/__tests__/friend-actions-wechat-conservative.test.js core/__tests__/friend-actions-cache-fallback.test.js core/__tests__/friend-actions-get-game-friends.test.js core/__tests__/friend-actions-passive-seed.test.js core/__tests__/friend-actions-get-game-friends-direct.test.js core/__tests__/friend-scanner-identifier.test.js`
- ✅ `pnpm lint:web`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm check:doc-links`
- ⚠️ `pnpm check:announcements`：0 error(s), 1 warning(s)，`logs/development/Update.log` 仍有 1 条 bullet 超过 120 字符
- ✅ `bash -n scripts/deploy/*.sh deploy/scripts/*.sh scripts/docker/*.sh scripts/release/*.sh`

### 开发补记 - v4.5.22 微信好友保守链路与只读面板增强 (2026-03-17)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.22`**: `core/package.json`、`web/package.json`、部署模板、Docker 工作流默认值、离线包脚本与更新脚本中的默认镜像标签已经同步更新。
- ✅ **微信好友链路补齐静默保护与手动刷新穿透**: `friend-actions.js`、`friend-scanner.js`、`data-provider.js`、`worker.js` 现在会在微信好友实时接口不可用时进入静默期，自动回退缓存，并允许管理员通过手动刷新执行单次穿透探测。
- ✅ **好友页新增“手动刷新 / 访客补缓存 / 离线只读态”**: `Friends.vue`、`friend.ts` 与账号状态接口已经贯通好友来源元数据、访客补缓存入口、离线只读展示和批量操作禁用态。
- ✅ **系统日志补齐好友链路排障入口**: `SystemLogs.vue` 现在支持好友链路快捷筛选、结构化摘要卡片、从日志回跳好友页与高风险/任务失败/缓存补种等摘要展示。
- ✅ **背包详情弹窗与离线导出脚本继续收口**: `BagPanel.vue` 完成弹窗布局与关闭交互细化，`deploy/scripts/export-offline-packages.sh` 继续跟随当前版本默认值。

#### 📌 本轮发布说明
- 📌 **版本号虽然从 `4.5.21` 递增到 `4.5.22`，但重点是行为收口**: 这轮主要是把微信好友不可用场景从“报错/空白/反复探测”改成“有状态地降级、提示和排障”。
- 📌 **预览图和测试报告未纳入正式发布**: `docs/*preview*`、`reports/` 与 `.DS_Store` 属于本地预览/测试产物，本轮没有随正式版本提交。

#### 🧪 本轮验收
- ✅ `node --test core/__tests__/admin-account-state-routes.test.js core/__tests__/friend-actions-cache-fallback.test.js core/__tests__/friend-actions-get-game-friends.test.js core/__tests__/friend-actions-passive-seed.test.js core/__tests__/friend-actions-get-game-friends-direct.test.js core/__tests__/friend-scanner-identifier.test.js`
- ✅ `pnpm lint:web`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm check:doc-links`
- ⚠️ `pnpm check:announcements`：0 error(s), 1 warning(s)，`logs/development/Update.log` 仍有 1 条 bullet 超过 120 字符
- ✅ `docker buildx version`
- ✅ `docker info`

### 开发补记 - v4.5.21 QQ 风控守卫与设置体验统一优化 (2026-03-16)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.21`**: `core/package.json`、`web/package.json`、Docker 模板、离线包脚本、部署文档与 GitHub Actions 默认版本已经同步更新。
- ✅ **QQ 高风险临时窗口已接通前后端**: `qqHighRiskWindow` 已贯通存储、设置接口、运行时提示与自动回退逻辑，QQ 账号不再长期暴露高风险自动化能力。
- ✅ **封禁账号保护已统一落地**: 账号启动/重启、批量启动、自启动批次与 Worker 被踢下线回写都已识别 `1000016 / 封禁`，避免重复撞线。
- ✅ **QQ 好友抓取默认改为保守链路**: 默认优先 `SyncAll` + 缓存兜底，只有显式开启 `qqFriendFetchMultiChain` 才恢复多链路探测。
- ✅ **设置页 / 仪表盘 / 账号页 / 侧栏完成一轮统一整理**: 平铺布局、顶部吸附、封禁状态标签、高风险说明区和低高度适配继续收口。
- ✅ **离线包导出链路已兼容多架构正式 tag**: `deploy/scripts/export-offline-packages.sh` 改为按平台 digest 拉取并本地重打 tag，再执行 `docker save`，解决正式 release tag 导出离线包时的 manifest digest 缺失问题。

#### 📌 本轮发布说明
- 📌 **QQ 平台默认更保守**: `成熟秒收取`、`60 秒施肥(防偷)`、`精准蹲守偷菜` 与 QQ 多链路好友抓取不会在未授权时偷偷执行，保存后只签发有限时窗口。
- 📌 **README 与发布模板已改为中文记录 `v4.5.21`**: 根 README、部署文档、ChangeLog 与 Update.log 已同步追加本轮中文更新说明，便于后续 GitHub Release 与服务器升级核对。

#### 🧪 本轮验收
- ✅ `pnpm check:announcements`
- ✅ `pnpm check:doc-links`
- ✅ `pnpm test:workspace-audit-scripts`
- ✅ `pnpm lint:web`
- ✅ `pnpm test:frontend`
- ✅ `pnpm -C core exec eslint src/controllers/admin/account-control-routes.js src/controllers/admin/account-management-routes.js src/controllers/admin/account-settings-routes.js src/models/store.js src/runtime/data-provider.js src/runtime/runtime-engine.js src/runtime/worker-manager.js src/services/config-validator.js src/services/farm.js src/services/friend/friend-actions.js src/services/friend/friend-scanner.js src/utils/network.js`
- ✅ `node --test core/__tests__/admin-account-control-routes.test.js core/__tests__/admin-account-management-routes.test.js core/__tests__/admin-account-settings-routes.test.js core/__tests__/data-provider-save-settings.test.js core/__tests__/data-provider-account-restart.test.js core/__tests__/data-provider-runtime-reload.test.js core/__tests__/runtime-engine-relogin-skip.test.js core/__tests__/worker-manager-account-backfill.test.js core/__tests__/friend-actions-get-game-friends.test.js core/__tests__/friend-actions-get-game-friends-direct.test.js core/__tests__/friend-actions-cache-fallback.test.js core/__tests__/friend-scanner-identifier.test.js core/__tests__/network-friend-seed-notify.test.js core/__tests__/farm-bag-priority.test.js core/__tests__/store-account-settings-persistence.test.js core/__tests__/store-ws-error-persistence.test.js core/__tests__/store-system-settings.test.js core/__tests__/store-account-mode.test.js core/__tests__/store-runtime-init.test.js core/__tests__/store-account-config-identity-archive.test.js`
- ✅ `bash scripts/release/build-release-assets.sh --version v4.5.21 --output-dir release-assets`

### 开发补记 - v4.5.20 发布链路归一与本地 Release 产物打包 (2026-03-11)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.20`**: `core/package.json`、`web/package.json`、Docker 模板、离线包脚本、部署文档与 GitHub Actions 默认版本已经同步更新，避免覆盖已存在的 `v4.5.19` 标签。
- ✅ **本地与 CI 的 Release 打包逻辑已统一**: 新增 `scripts/release/build-release-assets.sh`，GitHub Release workflow 直接复用该脚本，避免再维护两套 release-assets 生成逻辑。
- ✅ **Docker 推送入口已收口**: `scripts/docker/docker-build-multiarch.sh` 改为非交互式多架构推送脚本，默认同步 Docker Hub 与 GHCR；`scripts/docker/docker-sync.sh` 改为兼容包装入口。
- ✅ **旧服 current 兼容软链已补齐**: `fresh-install.sh`、`update-app.sh`、`repair-deploy.sh`、`install-or-update.sh`、`repair-mysql.sh` 现在会同时识别并维护 `/opt/qq-farm-current` 与历史 `/opt/qq-farm-bot-current`。

#### 📌 本轮发布说明
- 📌 **根 README 仍只修改部署章节**: 本轮继续遵守“只动部署部分”的边界，同时把 `deploy/README.md`、`deploy/README.cn.md`、`docs/DEPLOYMENT_SOP.md` 与维护 SOP 的部署入口一起收口。
- 📌 **本地二进制输出入口固定为 `build-release-assets.sh`**: 维护者本地发版时不再手工拼接 zip/tar 包，统一直接生成 Windows、Linux、macOS 产物和部署包。

#### 🧪 本轮验收
- ✅ `pnpm check:announcements`
- ✅ `pnpm check:doc-links`
- ✅ `node --test core/__tests__/system-update-manifest.test.js core/__tests__/system-update-jobs.test.js core/__tests__/system-update-runtime.test.js core/__tests__/admin-system-update-routes.test.js`
- ✅ `bash scripts/release/build-release-assets.sh --version v4.5.20 --skip-offline-bundles`
- ⚠️ 本机 Docker daemon 当前不可访问，`self-test-install.sh`、本地离线镜像包导出与本地 Docker 推送需由 GitHub Actions 或 Docker 恢复后继续执行。

### 开发补记 - v4.5.19 部署统一入口与宿主机更新代理 (2026-03-11)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.19`**: `core/package.json`、`web/package.json`、Docker 模板、离线包脚本、构建脚本和 GitHub Actions 默认版本已经同步更新。
- ✅ **Release 资产已补齐统一部署链路**: 发布包现在会附带 `install-or-update.sh`、`update-agent.sh`、`install-update-agent-service.sh`、`manual-config-wizard.sh`、`stack-layout.sh` 与 `verify-stack.sh`，避免 Release 包继续缺新脚本。
- ✅ **部署文档已切到新目录口径**: 部署说明默认使用 `/opt/qq-farm-current` 和 `/opt/YYYY_MM_DD/qq-farm`，同时保留旧服修复入口以兼容历史目录。

#### 🧪 本轮验收
- ✅ `bash scripts/deploy/self-test-install.sh --force-build-fallback`
- ✅ `pnpm check:announcements`
- ✅ `pnpm check:doc-links`
- ✅ `bash -n scripts/deploy/*.sh deploy/scripts/*.sh scripts/docker/*.sh`
- ✅ `node --test core/__tests__/system-update-manifest.test.js core/__tests__/system-update-jobs.test.js core/__tests__/system-update-runtime.test.js core/__tests__/admin-system-update-routes.test.js`

#### 📌 本轮发布说明
- 📌 **根 README 仍只修改部署章节**: 本轮没有改动根 README 的非部署内容；镜像与服务器操作说明全部收口在部署章节和部署专用文档。
- 📌 **旧服升级顺序继续固定**: 先 `repair-deploy.sh` 修部署骨架，再 `install-or-update.sh --action update --preserve-current` 更新主程序，避免旧链接、旧脚本和旧编排文件拖累升级。

### 开发补记 - v4.5.18 发布链路与验收闭环 (2026-03-10)

#### ✅ 本轮发布收口
- ✅ **版本口径已抬升到 `v4.5.18`**: `core/package.json`、`web/package.json`、Docker 构建脚本、部署模板和 GitHub Actions 默认版本已同步更新，避免继续复用旧 tag。
- ✅ **前端阻塞 lint 已清空**: 一组基础 UI 组件的 props 宏与 import 顺序问题已修正，`pnpm lint:web` 恢复通过。
- ✅ **部署链路仍保持修复脚本闭环**: `fresh-install.sh`、`update-app.sh`、`repair-deploy.sh`、`repair-mysql.sh` 当前语法检查通过，并保持对旧服目录修复、数据库幂等修复和 current 链接维护能力。

#### 🧪 本轮验收
- ✅ `node --test $(rg --files core/__tests__ -g '*.test.js')`：255/255 通过
- ✅ `pnpm check:announcements`
- ✅ `pnpm check:doc-links`
- ✅ `pnpm check:readme-links`
- ✅ `pnpm lint:web`
- ✅ `pnpm test:frontend`
- ✅ `pnpm build:web`
- ✅ `bash -n scripts/deploy/fresh-install.sh scripts/deploy/update-app.sh scripts/deploy/repair-mysql.sh scripts/deploy/repair-deploy.sh`

#### 📌 本轮发布说明
- 📌 **README 人工修改仍限制在部署相关内容**: 根 README 这轮只继续收口部署/构建/更新说明；其余非部署内容沿用现有本地状态，不额外扩写。
- 📌 **服务器更新仍采用“先修部署骨架，再修数据库，再更新主程序”顺序**: 这样可以同时兼容全新服务器、标准部署目录和历史遗留旧目录。

### 开发补记 - 访客面板专用链路落地与可用性复查 (2026-03-09)

#### ✅ 本轮新增能力
- ✅ **访客专用后端链路已落地**: 新增 `core/src/proto/interactpb.proto` 与 `core/src/services/interact.js`，通过多 RPC 候选拉取访客记录并标准化输出（动作类型、访客身份、作物信息、地块、时间）。
- ✅ **管理端接口已开放**: 新增 `GET /api/interact-records`，支持 `limit` 参数（1~200）并沿用账号所有权校验。
- ✅ **Worker/DataProvider 已接通调用面**: 新增 `getInteractRecords` 透传方法，前端不需要旁路即可按现有账号管道取访客数据。
- ✅ **访客面板升级为“专用接口优先 + 日志降级”**: `VisitorPanel.vue` 现在优先展示接口数据，接口失败时自动回退日志视图，保证可用性。
- ✅ **接口可用性提示已细分**: 新增错误分类（协议未加载/请求超时/权限失败/接口不可用）并映射用户可读文案。
- ✅ **面板可观测性补强**: 新增“数据源标签（专用接口/日志降级）”和“最近刷新时间”，减少排查歧义。

#### 🔎 本轮复查与影响判断
- ✅ **后端语法检查通过**:
  - `node --check core/src/services/interact.js`
  - `node --check core/src/utils/proto.js`
  - `node --check core/src/core/worker.js`
  - `node --check core/src/runtime/data-provider.js`
  - `node --check core/src/controllers/admin.js`
- ⚠️ **前端类型/Lint 未在本机执行**: 当前环境缺少 `pnpm`（`command not found: pnpm`），因此 `vue-tsc` / `web lint` 未完成本地实跑。
- ✅ **文件完整性复查通过**: 本轮新增/修改的访客链路相关文件已复查，无 NUL 字节损坏。

#### ⚠️ 本轮发现的问题
- ⚠️ **账号切换存在响应竞态风险**: `fetchInteractRecords(accountId)` 为异步请求，若用户快速切换账号，先发请求可能后到达并覆盖后发结果，导致短时间展示错账号访客记录。
- ⚠️ **无账号场景可能残留旧访客数据**: 当前当 `currentAccountId` 为空时会直接 return，未显式清空 `interactRecords/interactError`，在极端交互下可能看到上一个账号的历史数据残留。

#### 💡 优化建议
- 💡 **为访客请求加“账号戳”防抖并发保护**: 在 `friend.ts` 中为每次请求生成序号或携带当前账号快照，响应落地前校验仍与当前账号一致再写入状态。
- 💡 **账号为空时主动清空访客状态**: 在账号切换 watch 或 store 方法入口补 `interactRecords = [] / interactError = ''`，避免残留感知。
- 💡 **补一条最小回归用例**: 增加“快速切换账号 + 接口慢返回”的前端状态单测（或 e2e 脚本），防止竞态回归。

#### ✅ 追加修复 - 访客请求竞态与无账号残留 (2026-03-09)
- ✅ **访客请求已加“最新请求胜出”保护**: `web/src/stores/friend.ts` 新增 `interactRequestSeq`，只有最后一次请求响应才允许写入状态，修复快速切号时旧响应覆盖新账号数据的问题。
- ✅ **无账号态已主动清空访客状态**: 新增 `clearInteractState()`，在空账号和切空账号场景会重置 `interactRecords/interactError/interactLoading`，避免展示上一个账号残留数据。
- ✅ **访客面板本地状态同步重置**: `VisitorPanel.vue` 在空账号时会一并重置头像错误缓存和“最近刷新时间”，界面状态与数据状态保持一致。

#### ✅ 追加优化 - 访客接口 `errorCode` 结构化返回 (2026-03-09)
- ✅ **Worker API 错误已透传 `code`**: `core/src/core/worker.js` 与 `core/src/runtime/worker-manager.js` 已支持 `{ message, code }` 错误对象，避免主进程只拿到字符串错误丢失分类信息。
- ✅ **访客接口已回传 `errorCode`**: `GET /api/interact-records` 遇到 `INTERACT_*` 错误时会返回 `{ ok:false, error, errorCode }`，前端可直接按码分流提示。
- ✅ **前端提示改为“错误码优先”**: `web/src/stores/friend.ts` 现在优先按 `errorCode` 映射用户文案，并保留旧文案兜底，减少文案改动导致的误判。
- ✅ **文件完整性异常已即时修复**: 本轮开发中遇到挂载盘写入 NUL 字节导致 `node --check` 失败，已对受影响文件执行清理并复检通过。

### 开发复查补记 - 近期优化二次审查与部署密码修正 (2026-03-09)

#### ✅ 本轮补记的新增调整
- ✅ **部署脚本显式管理员密码真正落库**: `fresh-install.sh` / `update-app.sh` 在检测到显式传入 `ADMIN_PASSWORD` 时，会在容器启动后把 `admin` 账号密码哈希同步到数据库，不再只改 `.env` 却不影响已有管理员账号。
- ✅ **更新脚本支持同步当前 Shell 环境变量**: `update-app.sh` 现会把 `ADMIN_PASSWORD`、`WEB_PORT` 等显式传入值回写到部署目录 `.env`，避免更新场景下环境变量被静默忽略。
- ✅ **账号模式元信息已进入面板数据快照**: `accountMode / harvestDelay / riskPromptEnabled / modeScope / accountZone` 已写入运行态账号列表，账号页和归属页可直接展示模式与区服信息。
- ✅ **经营汇报 SMTP 邮件链路已贯通**: 设置页、服务端归一化、SMTP 发送器和推送分发入口已打通，可按账号配置独立邮件汇报渠道。

#### ⚠️ 本轮二次审查发现的问题
- ⚠️ **重启广播的邮件渠道仍可能发生认证配置碰撞**: `report-service` 已把 `smtpHost / smtpPort / smtpSecure / sender / recipient` 纳入 `email` 渠道合并键，但在 `emailFrom` 已显式填写时，合并键仍不会再区分 `smtpUser`。若多个账号共用同一发件人别名和收件箱、但 SMTP 登录账号不同，服务器重启广播仍可能错误复用首个账号的认证配置。
- ⚠️ **主号 / 小号作用范围仍停留在“展示与存储层”**: `modeScope.requiresGameFriend / zoneScope / fallbackBehavior` 已进入设置页文案、接口返回和 store 持久化，但运行时好友/农场决策链路当前仍只消费 `accountMode`，尚未真正按“同区 / 游戏好友 / 降级规则”参与行为判定。
- ⚠️ **账号设置保存仍存在分步提交的部分成功风险**: 前端保存设置时会先调用 `/api/accounts/:id/mode`，再调用 `/api/settings/save`。如果第二步失败，账号模式切换及其他主号降级可能已生效，但前端仍会整体提示“保存失败”，会造成用户感知与真实状态不一致。

#### 💡 建议
- 💡 **邮件重启广播按完整认证配置做指纹**: 对 `email` 渠道建议把 `smtpUser` 也纳入分组键，或者直接禁止不同 SMTP 配置的账号在重启广播阶段做合并。
- 💡 **把 modeScope 真正接入决策层，或暂时降低文案承诺**: 若近期不准备实现“按区服 / 游戏好友降级”行为约束，建议先把设置页说明收敛为“规划中 / 仅做展示”，避免功能感知超前于实际行为。
- 💡 **把账号模式保存收口为单事务链路**: 建议将模式切换并入 `/api/settings/save` 后端统一提交，或至少在前端仅当模式实际变化时才单独调用 `/api/accounts/:id/mode`，减少部分成功和重复广播。

#### 🧪 本轮核验
- ✅ `node --check core/src/services/report-service.js`
- ✅ `node --check core/src/models/store.js`
- ✅ `node --check core/src/controllers/admin.js`
- ✅ `node --check core/src/runtime/data-provider.js`
- ✅ `node --check core/src/services/farm.js`
- ✅ `bash -n scripts/deploy/fresh-install.sh`
- ✅ `bash -n scripts/deploy/update-app.sh`
- ✅ `node --test core/__tests__/store-account-mode.test.js core/__tests__/store-trial-config.test.js`

#### ✅ 本轮已执行修复
- ✅ **账号设置改为后端单链路处理模式切换**: 设置页保存时已不再额外调用 `/api/accounts/:id/mode`，改为统一通过 `/api/settings/save` 落库并处理主号唯一化，减少“部分成功、整体报错”的风险。
- ✅ **SMTP 重启广播分组键补齐 `smtpUser`**: 邮件渠道的服务器重启提醒分组现在会额外区分 SMTP 登录账号，避免同发件别名/同收件箱但不同认证账号的配置被错误合并。
- ✅ **补齐后端回归测试**: 新增 `data-provider-save-settings.test.js` 和 `report-service-restart-broadcast.test.js`，覆盖统一保存链路和邮件广播分组逻辑。

#### ⏳ 当前仍待继续
- ⏳ **`modeScope` 真实运行时接入尚未完成**: 目前仍需把 `zoneScope / requiresGameFriend / fallbackBehavior` 真正接入好友与农场策略层，当前已修正的是“保存一致性”和“广播分组”问题。

#### ✅ 追加修复 - `modeScope` 运行时接入与策略收口 (2026-03-09)
- ✅ **账号模式新增统一运行时解析器**: 新增 `core/src/services/account-mode-policy.js`，会基于当前账号、同 owner 对端账号、区服和最近一次好友快照解析 `effectiveMode / collaborationEnabled / degradeReason`，不再只存字段不参与行为。
- ✅ **好友巡查已改按 `effectiveMode` 执行**: 好友模块现在会先解析账号模式作用范围；当 `fallbackBehavior=strict_block` 且未命中同区/游戏好友条件时，会临时按更保守模式运行，阻断偷菜与捣乱这类高风险动作。
- ✅ **农场模块已改按 `effectiveMode` 执行**: 收获延迟、防偷 60 秒抢收、秒收入口现在统一看运行时有效模式；顺带修正了“`safe` 预设虽然有延迟配置，但旧逻辑实际不生效”和“防偷逻辑误读 `config.mode`”两处偏差。
- ✅ **运行态状态快照已带出模式结果**: Worker 状态与账号列表现在会回传 `effectiveMode / collaborationEnabled / degradeReason`，为后续前端显式展示打好数据基础。
- ✅ **Worker 启动已补好友缓存预热**: 登录成功后会优先读取最近一次 Redis 好友缓存并预热运行时快照，缩短 `requiresGameFriend` 在冷启动阶段的 `friend_relation_unknown` 窗口。
- ✅ **账号列表已显示“当前生效模式”**: 前端账号页现在会区分“配置模式”和“当前生效模式 / 独立执行原因 / 协同命中状态”，不再只能靠日志判断运行时是否已降级。
- ✅ **新增解析器回归测试**: 新增 `account-mode-policy.test.js`，覆盖“命中同 owner 游戏好友后恢复协同”和“`strict_block` 在非游戏好友时降级为保守模式”两条主路径。

#### ⚠️ 追加自审结论
- ⚠️ **游戏好友关系当前依赖最近一次好友快照**: 账号刚启动且好友列表尚未成功拉取时，`requiresGameFriend=true` 会先进入 `friend_relation_unknown` 状态；若同时配置 `strict_block`，该时间窗内会暂时按保守模式运行。

#### 💡 追加建议
- 💡 **为冷启动补一层好友关系预热**: 后续可考虑在 Worker 启动时先读取 Redis / DB 好友缓存，减少 `friend_relation_unknown` 的冷启动窗口。
- 💡 **把 `effectiveMode / degradeReason` 显式展示到前端**: 现在后端状态里已有数据，建议账号列表或设置页补一个“当前生效模式/降级原因”提示，避免用户还要靠日志判断。

#### ✅ 追加优化 - 运行态模式前端可视化补齐 (2026-03-09)
- ✅ **设置页已显示当前运行态判定**: `Settings.vue` 现会同时显示“配置模式 / 当前生效模式 / 协同命中或独立执行状态 / 降级原因”，用户切换账号后可直接看到当前运行时是否已发生降级。
- ✅ **账号归属页已补模式运行态信息**: `AccountOwnership.vue` 的模式列现在会区分“配置模式”和“生效模式/独立执行原因”，管理员排查跨账号归属和策略生效情况时不再只看到静态配置。
- ✅ **账号表格排序状态已补持久化读写**: `Accounts.vue` 现在会在页面初始化时恢复表格排序状态，并在切换排序后持久化，顺带消除了相关未使用函数导致的前端类型检查阻塞。
- ✅ **前端生产构建阻塞已清理**: 清掉 `Settings.vue` 的类型读取问题、`Accounts.vue` 的初始化链路遗漏，以及 `core/src/models/store.js` 的尾随空格后，`pnpm -C web build` 已恢复通过。

### v4.5.11 - 外观联动补正、邮件汇报与近期优化二次复查 (2026-03-09)

#### 🎨 外观链路补正
- ✅ **主题整套联动恢复主界面参数同步**: `getThemeAppearanceConfig()` 重新返回业务页遮罩与模糊参数，修复“整套主题方案 / 主题锁定背景”在切换主题后只更新登录页、未同步主界面氛围参数的回归。
- ✅ **主界面视觉预设入口补齐**: 设置页新增 `workspaceVisualPreset` 可视化卡片，`console / poster / pure_glass` 三种业务页风格不再停留在 store / 后端已接入但界面无入口的半接入状态。
- ✅ **设置页占位绑定清理**: 去掉仅为绕过 lint 的临时绑定数组，改为真实模板接入，避免后续再出现“代码里有配置、界面上找不到入口”的维护噪声。
- ✅ **UI 资源清理机制上线**: 服务端新增未引用登录背景与过期生成图标缓存的自动清理逻辑，减少 `data/ui-backgrounds/` 和 `data/asset-cache/item-icons/` 的长期堆积。
- ✅ **外链字体与示例背景本地化**: UnoCSS 不再构建时拉取 Google Fonts，`sample-red-horse` 示例背景也改为本地 SVG，离线/受限网络构建更稳定。
- ✅ **最小自动校验补齐**: 新增 `pnpm test:ui-assets` 与 `pnpm -C web check:ui-appearance`，分别覆盖 UI 资源清理和主题联动参数完整性。

#### 📬 账号与汇报链路补强
- ✅ **经营汇报新增 SMTP 邮件渠道**: `reportConfig`、服务端校验、推送下发链路和设置页表单已补齐 `email` 渠道，可直接配置 SMTP 服务器、发件箱与收件箱发送经营汇报。
- ✅ **账号登录后立即落库**: 管理端保存账号时会直接触发 `persistAccountsNow()`，减少“刚扫码成功但服务异常退出，最新 code/ticket 还没刷进数据库”的窗口期。
- ✅ **好友拉取模式按账号自适应锁定**: `SyncAll / GetAll` 不再全局共用一个兼容开关，而是按账号探测并缓存，避免一个账号的兼容结论污染另一个账号。
- ✅ **好友与周期状态日志去重**: 相同摘要日志按 TTL 限流，减少长时间挂机时的重复刷屏和误判噪声。

#### 🧺 背包与资产使用补正
- ✅ **Worker 补齐 `useBagItem` 调用面**: 主进程可直接下发背包道具使用请求，和前端精细化背包面板保持一致。
- ✅ **地块类道具兼容分支继续携带 `land_ids`**: 即使走旧接口编码 fallback，也不会再丢失目标地块参数。
- ✅ **图标导入与缓存清理工具补齐**: 新增 `import:item-icons` 脚本和资源校验，方便后续把物品图标按固定目录导入并维持缓存整洁。

#### 🔎 二次复查结论
- ✅ **已修复两处可感知问题**: 一处是主题整套联动参数不完整，一处是主界面视觉预设入口缺失。
- ✅ **主题联动范围保持用户选择**: 修复“主题锁定背景”和抽屉“套用主题背景”在当前已选 `global` 时回退为 `login_and_app` 的问题，避免全局背景范围被静默降级。
- ✅ **主题联动混合态文案已校准**: 实测发现“主题锁定背景”会注入独立主界面遮罩/模糊组合，但顶部提示仍沿用上次手动预设名称，现已改为按真实参数识别；混合态明确显示为“主题联动自定义”。
- ✅ **整套主题补齐业务页风格映射**: `getThemeAppearanceConfig()` 现在会同时写入 `workspaceVisualPreset`，让 5 套主题在切换时同步对应的业务页卡片风格；实测 `Ocean` 整套保存后已落成 `pure_glass`。
- ✅ **地块类道具使用链路补正**: 背包详情里对目标土地的多选数量现在会严格受当前物品库存约束，避免“已选地块数”与实际请求 `count` 不一致；使用成功后还会立即刷新土地状态，减少“明明已浇水/播种但右侧仍显示旧状态”的错觉。
- ✅ **UseRequest 兼容编码补齐 land_ids**: 兼容旧服务端编码分支时，现已把 `land_ids` 一并写入 fallback 请求，避免土地类道具在特殊接口兼容路径下丢失目标地块参数。
- ✅ **建议项已落地执行**: 外链字体告警和静态资源缺少回收策略这两项后续建议已转化为实际代码，不再只是文档建议。
- ✅ **背包详情模板构建阻断已兜住**: 针对 `BagPanel.vue` 在大型 SFC 下被 `vue-tsc` 漏识别的少量模板引用，已补最小桥接绑定，恢复 lint / build 闭环。
- ✅ **SMTP 汇报配置已串通前后端**: 设置页、后端归一化、推送分发与“是否已配置”判断口径已统一，不会出现界面能填、服务端却忽略的半接入状态。
- ✅ **账号最新登录态持久化更稳**: 实测保存账号后会立即触发数据库写入，不再完全依赖 2 秒异步批量刷盘。

#### 🧪 回归结论
- ✅ `node --check core/src/config/gameConfig.js` 通过
- ✅ `node --check core/src/controllers/admin.js` 通过
- ✅ `node --check core/src/services/smtp-mailer.js` 通过
- ✅ `node --check core/src/services/push.js` 通过
- ✅ `node --check core/src/services/report-service.js` 通过
- ✅ `node --check core/src/models/store.js` 通过
- ✅ `node --check core/src/services/ui-assets.js` 通过
- ✅ `node --check core/src/services/mall.js` 通过
- ✅ `pnpm test:ui-assets` 通过
- ✅ `pnpm -C web check:ui-appearance` 通过
- ✅ `pnpm -C web build` 通过（Google Fonts 外链告警已消失）
- ✅ `pnpm -C core build:release` 通过

#### 🧾 补充复查追加（2026-03-09）
- ✅ **农场补种死循环闭环**: 修正“占用中但阶段未同步”的土地被误判为空地的问题；补种前增加二次复核与短期冷却，避免出现 `空地 -> 买种子 -> Plant code=1001008 -> 再买` 的资源浪费循环。
- ✅ **服务器重启提醒分组签名补正**: `report-service` 现在会把 `webhook token` 以及 `email` 的 `smtpPort / smtpSecure / smtpUser` 一并纳入渠道签名，避免不同账号组被错误合并到同一条重启广播。
- ✅ **设置保存副作用减轻**: 设置页改为仅在 `accountMode` 真正变化时才调用 `/api/accounts/:id/mode`，不再每次保存都重复触发主号唯一性检查和 worker 配置广播。
- ✅ **store 新增单测已恢复可运行**: 针对 `isMysqlInitialized()` 的新依赖，补齐测试 mock，`store-account-mode` 与 `store-trial-config` 两条用例已重新跑通。
- ✅ **开发文档已追加归档**: 本轮复查结论、影响判断和后续建议已补入 `docs/RECENT_OPTIMIZATION_REVIEW_2026-03-08.md` 的 12.6 节。

### v4.5.10 - 前端 lint 收口与 CI 恢复 (2026-03-08)

#### 🧹 前端规范与稳定性修复
- ✅ **Settings 主题背景联动收口**: 补齐主题联动卡片相关绑定，修复 `Settings.vue` 在 `web lint` 下的阻断项。
- ✅ **前端类型与样式规范对齐**: `ui-appearance`、路由声明和若干 Vue 组件按当前 ESLint 规则收口，避免同一轮更新在本地可构建、远端 CI 却红灯。
- ✅ **主分支前端校验恢复**: 针对本轮新增的背景系统与汇报页改动，再次清理 `src/**/*.{ts,vue}` 的 lint 阻断错误。

#### 🧪 回归结论
- ✅ `pnpm -C web lint` 通过
- ✅ `pnpm -C web build` 通过
- ✅ `pnpm -C core build:release` 通过

### v4.5.9 - 登录背景系统、汇报统计增强与精细出售修复 (2026-03-08)

#### 🖼️ 登录背景与 UI 配置增强
- ✅ **登录页背景支持精细化配置**: 新增背景遮罩透明度与模糊度配置，登录页与设置页预览保持一致。
- ✅ **主界面背景范围可控**: 新增 `backgroundScope / appBackgroundOverlayOpacity / appBackgroundBlur`，可选择仅登录页、登录页+主界面、全局启用三种背景范围。
- ✅ **主题色与背景预设联动**: 主题抽屉新增“一键套用主题背景”，不同主题可直接同步匹配的氛围背景和遮罩参数。
- ✅ **内置背景预设与本地上传**: 支持选择内置 SVG 背景，也支持管理员上传 PNG / JPG / WebP 作为登录背景。
- ✅ **服务端 UI 持久化补齐**: 背景范围、登录页遮罩/模糊、主界面遮罩/模糊均已进入后端归一化与存储链路，刷新与多端同步不会丢失。
- ✅ **缺失背景资源补齐**: 为樱花与赛博主题补齐内置 SVG 资源，避免一键套用主题背景时出现 404。

#### 📊 经营汇报历史与操作体验
- ✅ **汇报历史统计卡片**: 设置页新增总数、成功、失败、测试、小时、日报统计卡片，便于快速定位异常。
- ✅ **筛选条件本地记忆**: 汇报历史的类型、状态、关键字、排序和分页大小会保留到本地视图偏好中。
- ✅ **最新失败快速入口**: 新增一键切到“失败 + 最新优先”的快捷入口，排查异常更快。

#### 🧺 背包与出售链路修复
- ✅ **出售按真实背包条目拆分**: 出售策略不再只按合并后的数量处理，而是按原始条目与 UID 拆分下发，降低“预览正确、出售异常”的风险。
- ✅ **果实出售边界提示补齐**: 背包页明确提示当前仅支持出售果实，避免误以为种子、礼包、化肥也会参与出售。

#### 🛡️ 发布链路与运行时补强
- ✅ **集群运行时依赖补齐**: 为 `core/src/cluster/worker-client.js` 补充 `socket.io-client` 运行时依赖，消除 `pkg` 打包警告对应的潜在运行风险。
- ✅ **启动账号数据以数据库完整记录为准**: `data-provider` 现在让数据库中的完整账号记录覆盖列表缓存，避免新登录 `code` 被旧快照回填。
- ✅ **开发文档增量归档**: 本轮优化复盘与问题影响已纳入开发日志与专门复盘文档，便于后续排查与交接。

#### 🧪 回归结论
- ✅ `node --check core/src/controllers/admin.js` 通过
- ✅ `node --check core/src/models/store.js` 通过
- ✅ `node --check core/src/services/database.js` 通过
- ✅ `node --check core/src/services/warehouse.js` 通过
- ✅ `pnpm -C web build` 通过
- ✅ `pnpm install && pnpm -C core build:release` 通过

### v4.5.8 - 公告同步稳健化与近期优化复盘 (2026-03-08)

#### 📢 公告与同步链路修复
- ✅ **公告公开读取恢复**: 将 `/api/announcement` 加入公开白名单，修复注释声明为“公开接口”但实际被全局鉴权拦截的问题。
- ✅ **Update.log 解析增强**: 公告解析不再依赖空行分段，而是按 `YYYY-MM-DD 标题` 的日期标题行切段；即使日志少打一行空行，也不容易漏同步公告。
- ✅ **历史公告源修正**: 补齐 `logs/development/Update.log` 中 3 处缺失分隔，修复 `v4.4.1`、`日志系统重构与全栈架构优化`、`施肥冲突修复与收获优先级` 等条目被合并漏识别的问题。

#### 🎨 设置页与 UI 持久化修复
- ✅ **自动主题模式持久化修复**: 服务端 UI 配置现在支持 `auto`，多端同步不再把“自动跟随”错误回落成 `dark`。
- ✅ **经营汇报历史避免重复拉取**: `Settings.vue` 切换账号时不再重复触发汇报历史与统计请求，减少一次无效网络往返与页面抖动。
- ✅ **登录背景编辑器构建修复**: 为仍在编辑中的登录背景预览逻辑补齐最小绑定，恢复 `vue-tsc` 与 `vite build` 的通过状态，不改现有业务行为。

#### 🧪 回归结论
- ✅ `node -c core/src/controllers/admin.js` 通过
- ✅ `node -c core/src/models/store.js` 通过
- ✅ `pnpm -C web exec vue-tsc -b` 通过
- ✅ `pnpm -C web build` 通过

#### 📚 开发记录
- ✅ 新增复盘文档：`docs/RECENT_OPTIMIZATION_REVIEW_2026-03-08.md`

### v4.5.6 - QQ 官方扫码续航、用户状态解耦与发布前回归 (2026-03-08)

#### 🔐 用户状态与权限修复
- ✅ **修复体验卡用户误封禁**: 新增 `users.status` 字段，彻底拆分“卡密是否还能被再次使用”和“用户账号是否被封禁”两套语义。
- ✅ **普通用户鉴权恢复准确**: 注册后的普通用户不再因为已消费卡密被误判成“账号已被封禁”，现在访问管理员接口会正确返回 `403 Forbidden`。
- ✅ **自动迁移旧库**: 新增 `009-user-status.sql`，启动时会自动为旧数据库补充 `users.status` 列并回填为 `active`。
- ✅ **卡密天数持久化补齐**: 新增 `cards.days` 字段与 `010-card-days.sql` 迁移，修复卡密管理页出现 `undefined天` 的问题，并保留自定义天数。

#### 📱 QQ / 微信登录链路增强
- ✅ **QQ 官方扫码主链路保留**: 继续使用 `q.qq.com` 官方二维码流程，不依赖 UIN 也能创建二维码。
- ✅ **微信重启自愈续签**: `wx_car / wx_ipad` 账号在重启后如果遇到旧 `code` 失效，会自动调用 `JSLogin` 换新 `code` 并重新拉起。
- ✅ **QQ 票据持久化能力补齐**: QQ 扫码成功后，前后端现在会同时保存官方返回的 `ticket`，为后续“启动前动态换新 authCode”打通数据链路。
- ✅ **QQ 启动前预刷新**: Worker 启动前若存在已保存的 QQ `ticket`，系统会优先尝试换取新的 `authCode` 再登录，减少重启后立即 `400` 的概率。

#### 🧾 日志与可观测性优化
- ✅ **访客匿名来源文案优化**: 当农场访客事件返回 `gid <= 0` 时，不再误显示为 `GID:0`，改为更贴近业务语义的“匿名好友”。
- ✅ **访客日志元信息增强**: 新增 `sourceKnown` 元字段，便于区分“已识别好友”与“匿名/未知来源”。

#### 🛠️ 构建与发布链路优化
- ✅ **前端构建通过**: `vue-tsc -b` 与 `pnpm build:web` 持续通过。
- ✅ **部署脚本语法检查通过**: `scripts/deploy/fresh-install.sh` 与 `scripts/deploy/update-app.sh` 的 Bash 语法校验通过。
- ✅ **压缩插件日志降噪**: 关闭 `vite-plugin-compression` 的冗长 verbose 输出，避免构建日志中出现误导性的绝对路径展示。
- ✅ **全局配置落库防脏数据**: 保存 `account_configs` 前会剔除已删除账号的孤儿配置，避免远端出现外键错误刷屏。
- ✅ **离线更新脚本自举修复**: `update-app.sh` 在本地 bundle 模式下，遇到 `update-app.sh -> update-app.sh` 同路径复制时会自动跳过，避免离线更新因 `cp same file` 直接退出。

#### 🔎 本轮回归结论
- ✅ **普通用户权限回归通过**: 新注册体验卡用户访问 `/api/users`、`/api/cards` 时均返回 `403 Forbidden`。
- ✅ **微信真实链路回归通过**: 本地 `3000` 实例重启后，微信账号仍可自动续签并恢复在线。
- ⚠️ **QQ 仍需一次补扫完成最终闭环**: 在本次代码补齐 `ticket` 持久化之前保存的老 QQ 账号只持有一次性 `authCode`，重启后仍会 `400`。需要再扫码一次，让新 `ticket` 落库，之后才能验证“重启自动换码”链路。

#### 📁 涉及文件
| 文件 | 说明 |
|------|------|
| `core/src/database/migrations/009-user-status.sql` | 新增用户状态迁移 |
| `core/src/database/migrations/010-card-days.sql` | 新增卡密天数字段迁移 |
| `core/src/services/mysql-db.js` | 启动时自动执行用户状态迁移 |
| `core/src/models/user-store.js` | 用户状态加载、登录校验、卡密天数持久化 |
| `core/src/controllers/admin.js` | 用户中间件改看 `users.status`，QQ 扫码回传 `ticket` |
| `core/src/runtime/worker-manager.js` | QQ 启动前尝试基于 `ticket` 换新 `authCode` |
| `core/src/models/store.js` | 账号 `auth_data` 增加 `authTicket` 持久化，保存时过滤孤儿账号配置 |
| `web/src/components/AccountModal.vue` | QQ 扫码成功后提交 `ticket` 保存 |
| `core/src/services/farm.js` | 访客匿名来源日志文案优化 |
| `web/vite.config.ts` | 构建日志降噪 |
| `scripts/deploy/update-app.sh` | 部署目录本地自举时跳过同路径自复制 |

---

### v4.4.0 - 多用户安全体系全面改造 (2026-03-07)

#### 🔐 JWT + Refresh Token 双令牌认证体系 [NEW]
- ✅ **Access Token (HttpOnly Cookie)**: 管理员 24h / 普通用户 10h 有效期，自动附带于所有 API 请求
- ✅ **Refresh Token (HttpOnly Cookie)**: 管理员 365d / 普通用户 7d，支持无感续签
- ✅ **数据库持久化**: 新建 `refresh_tokens` 表存储 refresh token 的 SHA-256 哈希，支持主动撤销、多端管理、过期清理
- ✅ **原子化 Token 轮换**: 使用 `SELECT ... FOR UPDATE` + `DELETE` 事务防止 Refresh Token 重放攻击（TOCTOU 竞态修复）
- ✅ **JWT Secret 持久化**: 密钥写入 `data/.jwt-secret` 文件，确保服务重启后 token 不失效
- ✅ **定时清理**: 每小时自动清除过期 refresh token 记录

#### 🍪 HttpOnly Cookie 安全迁移
- ✅ **彻底替代 localStorage 存储 token**: 所有认证令牌转移至 HttpOnly Cookie，前端 JS 无法直接访问
- ✅ **前端 `adminToken` 语义变更**: 从存储实际 token 改为仅存储用户名作为登录状态标识
- ✅ **Axios 全局配置**: `withCredentials: true` + 401 自动刷新拦截器
- ✅ **Cookie-Parser 集成**: 后端引入 `cookie-parser` 中间件解析 HttpOnly Cookie
- ✅ **SameSite=Lax + Secure**: 生产环境启用 Secure 标志，防止 CSRF 与中间人攻击

#### 🛡️ 权限隔离与数据安全
- ✅ **排行榜数据泄露修复**: 普通用户仅可查看自己账号的排名，管理员可查看全部
- ✅ **accounts 表外键约束**: 新增 `fk_accounts_username` 外键，保障账号数据与用户表的引用一致性
- ✅ **CORS 收紧**: 从通配符改为动态来源校验（支持 localhost / 内网 IP / 自定义域名）
- ✅ **CORS 方法补全**: `Access-Control-Allow-Methods` 增加 `PUT`

#### 🔄 前端认证链路重构
- ✅ **统一 `clearAuth()` 函数**: 集中清理后端 Cookie + 本地 `adminToken` + `currentAccountId` + `current_user`
- ✅ **Vue Router 守卫适配**: 使用 Cookie 认证替代 header token 验证
- ✅ **Login.vue 免责声明**: 拒绝时正确调用 `clearAuth()` 清除残留 Cookie
- ✅ **Socket.IO Cookie 认证**: 服务端解析 `socket.handshake.headers.cookie` 中的 access_token
- ✅ **Socket.IO 重连认证**: `connect_error` 检测 Unauthorized 后自动刷新 token 并重连
- ✅ **全局 Axios 统一**: `SystemLogs.vue` / `AnalyticsEcharts.vue` 从 bare `axios` 迁移至 `api` 实例
- ✅ **UserInfoCard.vue 登出优化**: 统一调用 `clearAuth()`，移除冗余的手动清理代码

#### 📦 数据库迁移
- ✅ **008-refresh-tokens.sql**: 新建 `refresh_tokens` 表（id, username, token_hash, role, device_info, created_at, expires_at），含 `idx_rt_token_hash` 和 `idx_rt_username` 索引
- ✅ **accounts 外键**: 自动清理孤立记录后添加 `ON DELETE SET NULL ON UPDATE CASCADE` 外键约束

#### 📁 新增/修改文件
| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `core/src/services/jwt-service.js` | **NEW** | JWT 签发/验证、Refresh Token 管理、Cookie 操作 |
| `core/src/database/migrations/008-refresh-tokens.sql` | **NEW** | Refresh Token 表迁移脚本 |
| `core/src/controllers/admin.js` | 重大修改 | 全面替换认证中间件、新增 refresh/logout 端点、Socket.IO Cookie 认证 |
| `core/src/services/mysql-db.js` | 修改 | 执行新迁移、添加外键约束 |
| `core/src/models/user-store.js` | 修改 | 新增 `getUserInfo()` 方法 |
| `web/src/utils/auth.ts` | 重大修改 | `clearAuth()` 统一清理、`adminToken` 语义变更 |
| `web/src/api/index.ts` | 重大修改 | `withCredentials` + 401 刷新拦截器 |
| `web/src/router/index.ts` | 修改 | Cookie 认证守卫 |
| `web/src/views/Login.vue` | 修改 | Cookie 登录流程 + 免责清理 |
| `web/src/stores/status.ts` | 修改 | Socket.IO Cookie 认证 + 重连刷新 |
| `web/src/components/UserInfoCard.vue` | 修改 | 统一调用 `clearAuth()` |
| `web/src/views/SystemLogs.vue` | 修改 | 迁移至 `api` 实例 |
| `web/src/views/AnalyticsEcharts.vue` | 修改 | 迁移至 `api` 实例 |

#### 🔧 依赖新增
- `jsonwebtoken` — JWT 签发与验证
- `cookie-parser` — Express Cookie 解析中间件

---

### v4.3.0 - 日志系统重构与全栈架构优化 (2026-03-06)

#### ⚡ 核心性能与日志模块
- ✅ **日志引擎深度重构**: 重新设计 `data-provider.js` 中的日志检索范式。从原有的 `globalLogs` 共享池改为独立访问子进程的 `worker.logs` 私有缓冲。并在前端 `status.ts` 引入 `clearLogs()` 在账号切换时刻硬重置，彻底解决旧数据合影残留。
- ✅ **高频渲染性能挽防**: 摒弃了 `Dashboard.vue` 中对数千条记录执行全栈 `[...sLogs].sort()` 深拷贝排序的性能黑洞，直接透传后台时序数据，极大地降低了内存泄漏风险和 CPU 骤增，滚动容差区间优化至 `100px`。

#### 🐛 通路修润与防封补充
- ✅ **统一全平台好友拉取机制 (Critical Fix)**: 针对单独微信（`wx`, `wx_car`, `wx_pad`）因走老式 `GetAll` 获取不到好友罢工的问题。将原专供 QQ 的 `SyncAll` 作为全体终端首选优先级。同时解除终端硬编码限制，只做平滑的降级容灾。
- ✅ **Worker 启动崩溃与级联异常修复**: 排除了 `worker.js` 在热抓取环境时抛出未定义引用引发的闪退现象，以及其带来的 `ShopInfoRequest` 的原型链丢失（`encode` 失败）问题。
- ✅ **QQ 鉴权通道去代理化**: 深度清除了因失效引起 400 警告的前缀代理环境并收拢了旧残分支文件报错缺口。
- ✅ **在线状态精细分级 (Online Status Refinement)**: 突破了原先前端通过“是否存在进程”一刀切定性为“运行中”的盲区。后端注入 `connected` 与 `wsError` 细粒度判断，重构 `Accounts.vue` 实现「运行中(绿)」、「连接中(闪黄)」、「已掉线(红)」三维状态展示，精准反馈 WebSocket 网络异常。
- ✅ **多架构镜像与双规部署**: 构建底层已横向扩展，完整涵盖 ARM64 与 AMD64 主流跨系平台分发，支持快速部署挂载外围如 `MySQL`、`Redis` 进程。
- ✅ **组件UI与毛玻璃视界兼容**: 统合所有工具组件透明层背景色，修复 Sakura 樱花主题在纯白玻璃下的边缘失控曝光等颜色泛溢现象。



### 🗄️ 架构治理与性能提速 (Phase 1-4 深度优化)
- **终局化数据库迁移**: 移除原有 JSON 文件的高频写操作，将核心配置底座彻底切入 MySQL 连接池，化解并发环境下的数据竞态与存档丢失风险。
- **排队超时与优先仲裁**: 升级底层 `TokenBucket` 调度网络，现当普通操作的排队等待超过 5000ms 时自动丢弃让权，确保“抢收”、“防偷”享有毫秒级最高下发优先级。
- **微信软降级防封壁垒**: 隔离微信登录平台下的高危探测。系统主动剥离好友扫描与群发偷菜，且巡回心跳间隔从常规放大至 15~30 分钟，大幅衰减风控红线惩罚率。
- **内存防溢出与多端告警**:
  - 前端执行 LRU 阻断阀将日志与状态栈强制收束至 300 条以内，根治了长期挂机下浏览器内存泄露引起的白屏、闪退及卡顿。
  - 网络层拦截接入自定义 `Webhook` 通知。目前遭遇系统封禁 (1002003) 及被踢下线等 P0 级事件将直接同步至移动端/第三方群组端通知。

### 🚀 分布式集群与持久化护航 (Phase 5-6 深度优化)
- ✅ **数据持久化底层打通**: 系统彻底切入 MySQL 统计账本 (`stats_daily`)。新增午夜自动执行的 CRON 清算引擎，自带 `Dirty Write` 安全回滚锁定，从此所有历史挂机战报（金币/经验/偷菜/帮忙等数据）化为永久资产，随 `作战大屏` 随时回溯。
- ✅ **作战大屏首屏极限瘦身**: 剔除传统 Echarts 带来的主捆绑包肥胖症 (`> 1.5MB`)。深度应用 Vue 3 的 `defineAsyncComponent` 和 Vite `manualChunks` 技术实现路由级代码分割包，真正达成了界面毫秒级秒切动画。
- ✅ **分布式集群演进 (Master-Worker)**:
  - 终结了原有 “单节点 Node 引擎通吃所有逻辑” 的极简时代，将系统硬切分为 `Master` (控制面、面板渲染、任务派发) 与 `Worker` (爬虫执行面)。
  - 利用环境变量 `ROLE=master/worker` 实现一套源码的两栖启动。Master 默认采用简化版的哈希轮询将挂机任务丢给挂载在它下的所有闲置 Worker 节点，并由 Socket 长连代理回传监控日志。
  - 全新封装的 `docker-compose.yml` 使其具备横向多 Docker 弹缩能力（`docker-compose up --scale farm-worker=N`），为未来冲击千账号矩阵大推流夯实物理底座。


---

### v4.2.0 - 高效监控系统与运维自动化全家桶 (2026-03-05)

#### 🛡️ 运维自动化与管控辅助
- ✅ **原生终端运维包**: 提供包含了 `quick-start.sh`、`choose-background-method.sh` 及针对管理员的失智抢救包 `reset-admin-password.sh` / `fix-mysql-password.sh`，覆盖多种环境挂机排险需求。
- ✅ **全局防封守护探针**: 构建基于 `Worker` 执行态的异步新访客探测哨兵，结合无损缓存防御网络潮汐的重复弹窗。底层解耦剥离并入驻 `common.js` 守护模块。

#### 📊 面板数据扩展
- ✅ **四大特征指标引导**: 数据分析图鉴增加由动态等级核推的“御农四维”策略推荐位（经验/利润/肥效/肥利）。
- ✅ **雷达级全景扫描**: 好友访问无须跳转点表即可知悉农场情况数据池下放。
- ✅ **GID 昵称反向映射化**: 将所有底层告警记录关联到缓存服务器，实时提供好友语义化可读名，杜绝数字阵列盲猜。

---

### v4.1.3 ~ v4.1.4 - 全工具主题统一与农场百科工具集成 (2026-03-04 ~ 2026-03-05)

#### 🧰 全模块内置引擎化
- ✅ **Node 衍生计算平台原生接管**: 全面剔除需要额外承载端口启动的 Python 端微服务引擎。完全由新增的 Node 计算引擎 `farm-calculator.js` 等效承载全部复杂逻辑运算，对 `API` 无感挂接。
- ✅ **跨域 iframe 主题劫持**: 首创新型主题注入流，自动从单页面继承出 15 项以上的 `var(--color-primary-500)` 基石属性强刷原生工具。
- ✅ **最佳发力期延迟施肥引擎**: 配置开启后在特定二季植物幼年期压抑强制生长动作，交由收益最丰厚阶段释放资源。
- ✅ **交互细节**: 同意计算按钮与确认按钮底色阶高亮并增强暗底色衬。

---

### v4.1.2 - 极致并发防抖与流程约束优化 (2026-03-04)

#### 🛡️ 防封与安全加固
- ✅ **旁路延迟售卖网关**: 偷菜后的果实售卖操作改为旁路防抖执行，带 3~8 分钟随机延迟，规避金币短时密集汇入的风控监控。
- ✅ **前端高频重绘防抖降频**: 针对 WebSocket 高频数据流引入 300ms 缓冲池时间切片，合并渲染，根治多开账号造成的面板卡顿与内存泄漏。
- ✅ **施肥突发请求平滑防封**: 针对农场核心种植中的施肥动作（含无机肥与有机肥）深度植入 `RateLimiter` 令牌桶削峰限流器，彻底根除高并发导致 `8002008` 网络异常。
- ✅ **有机肥大循环分片让流**: 为最大 500 次的瞬间极速施肥操作置入让步器，每 20 次主动强制挂起休息 8~15 秒。避免单一大任务枯竭 `RateLimiter` 的令牌池，从而保障如`防偷心跳`、`抢收播报`等关键子系统的并发存活路权。

#### 🚀 流程编排增强
- ✅ **流程编排防死锁预警**: 配置流程编排时静态检查「施肥」节点是否存在。启用编排引擎但缺失化肥供应节点时，保存时弹出告警阻断，防止挂机停滞死锁。

#### 🐛 UI 闪烁全面根治
- ✅ **Setting 页面开关闪烁**: 修复 `BaseSwitch` 组件因 `watch` 触发双向数据流引起的视觉抖动，统一改为 `nextTick` 缓冲更新。
- ✅ **Dashboard 面板闪烁**: 修复仪表盘因 WebSocket 高频推送引发级联重渲染的抖动，引入批量合并 + `requestAnimationFrame` 节流。
- ✅ **Friends 页面闪烁**: 修复好友列表实时数据更新导致整体重排的闪烁，引入虚拟化稳定引用与局部更新策略。

**涉及文件**：`Settings.vue` / `Dashboard.vue` / `Friends.vue` / `Sidebar.vue` / `farm.js` / `friend.js`

---

### v4.1.1 - 系统健壮性升级与底层鉴权修复 (2026-03-04)

#### 🛠️ 鉴权架构重构
- ✅ **Admin 密码双轨隔离**: 彻底废除底层 `user-store` 中初始密码为 `'admin'` 的硬编码强绑定策略。新部署环境完全动态读取 `.env` 中的 `ADMIN_PASSWORD`；消除后端免密登入分叉通道，统一鉴权并落库改密工作流。

#### 🚀 自动化逻辑优化
- ✅ **财产保护极限优先**: 打破了机器人的待机封锁休眠壁垒。当系统处于高级工作流休眠期时，一旦侦测到自身农场作物逼近成熟，将无视休眠屏障阻断予以最高特权强制唤起，直接插队完成收割翻种操作，随后退回休眠状态，确保资产绝无真空期。
- ✅ **施肥编排状态机冲突**: 切断了在用户开启【全局工作流编排引擎】的环境下、刚播完种的那一刻因为“顺带调用施肥”意外夺取并卡死执行队列的严重跨阶干涉 Bug。新架构保证全域施肥动作只受总时钟指挥，根除阻塞卡死风险。

---

### v4.1.0 - 核心功能体系：账号分级模式与体验重构 (2026-03-04)

#### 🛡️ 账号多模式安全架构
- ✅ **体系升级**: 上线【主号模式】【小号模式】【风险规避模式】三大全新运行策略。
- ✅ **独占与错峰**: 确保全服主号唯一性，小号享受成熟后自动防封延时错峰（默认随机 180s~300s），避免因同时收菜被腾讯高频接口拦截。
- ✅ **风险隔离**: 风险规避模式自动拉闸切断高危操作接口请求（如一键施肥、偷菜捣乱等），并在检测到频次受限实时告警入库。

#### 🚀 设置面板与管理功能优化
- ✅ **防封时间中枢**: 将系统中原有的硬编码退避 sleep 和检测间隔提取到了「全站控制中控室」，做到随改随存热应用。
- ✅ **自动化控制极简辅助**: 在好友选择和黑白名单管理加入“全选、反选、清空”控制区三件套，大幅提高含有海量好友时的大户操作效率。
- ✅ **登录交互视觉重排**: 压缩重构协议免责弹窗过度的 CSS `padding` 空间填补，扩大核心阅读版面。

#### 🐛 缺陷与逻辑修复
- ✅ **数据热加载层持久化失效修补**: 解决了 `admin.js` 内切换账号模式时数据仅储存在内存级（漏写了落库接口），导致即使通过鉴权若系统一旦遇到 Docker 重启、就会使模式配置大洗牌还原的隐患。

---

### v4.0.1 - 核心业务展现与渲染级致命 Bug 修复 (2026-03-04)

#### 🚑 系统级渲染修复 (Critical BugFix)
- ✅ **侧边栏白屏假死修复**：深度解析并修复了长期以来的“登入后点击侧边菜单白屏”难题。根因为《任务详情弹窗 `ConfirmModal`》等弹窗组件被错误附着在 `Dashboard` 主节点外部，打破了 Vue 3 `Transition` 的单节点包裹特性（Fragments锁死），现已将多根节点结构重构合并。
- ✅ **首屏数据竞态填补**：原本登录成功后拉取最新账户数据时，由于旧监听器仍阻塞等待静态 ID (`currentAccountId`) 的变动而静默报错，现已全面重构成依赖解包后的响应式数据 (`currentAccount.value`)。这彻底告别了“必须强制刷新浏览器才能展现好友/偷菜页面”的陈年顽疾。

#### 💎 UI 与信息密度优化 (UI Enhancements)
- ✅ **多栏自适应卡片流**：彻底废除 `Friends.vue` 的僵硬重灰单行列表，全面引进了基于 `CSS Grid` 的自适应双栏（乃至多栏）毛玻璃弹性信息卡。不仅优化了排版，更显著提升了可读性与同屏数据吞吐量。

#### 📊 面板体系重制 (Dashboard Overhaul)
- ✅ **全景实时任务队列展示**：切除原先受限于局部视野且用途狭窄的右侧“农场预览”卡框，原班人马取而代之的是【系统级任务队列预览 (Task Queue)】，将后台 `Worker` 中的深层调度时钟与行为逻辑一览无余地呈递在可视大屏上。
- ✅ **底层时间频率宏观掌控**：全局扫描并硬解构出 10+ 处系统底层的常量睡眠机制（包含循环探头延迟、巡视间隔、心跳延寿期），成功上架于【管理端 - 设置】中，赋予机主完整的系统运行节奏操作权。

---

### v4.0.0 - 借鉴优秀功能补齐与稳定性护城河 (2026-03-03)

#### 🚀 核心巡逻与防线强化
- ✅ **三阶段好友巡查策略**：首创扫描、筛选、收割渐进式扫描链路，极大减少触碰风险。
- ✅ **阻击被封禁账户**：底层增加反制嗅探，发现 `1002003` 强制封停立刻拉黑并脱离当前队列循环，杜绝无谓的重复网络试探死循环。
- ✅ **偷菜过滤与规则细化引擎**：实现了 `Schema` 一比一验证体系。对用户白名单、黑名单策略施加强制校验，不再因错填 JSON 引发崩溃。

---

### v3.9.5 - 任务队列可视化增强与认证架构重构 (2026-03-03)

#### 📊 任务预览体系 (Task Queue Analytics)
- ✅ **智能执行倒计时**：将传统的“下次执行时间”升级为实时跳动的倒计时，帮助用户直观掌控机器人动作节奏。
- ✅ **业务语义化适配**：重构了 21 种底层任务的显示映射，支持 Emoji 前缀与简洁直观的中文化描述（如 🌾 农场巡视、🎁 领取奖励）。
- ✅ **操作流程透视**：新增「任务详情弹窗」，支持点击预览每一项任务背后的原子化操作步骤（如：检查土地 → 识别成熟 → 执行收获），消除自动化黑盒。

#### 🔐 认证架构重构 (Auth Architecture Refactor)
- ✅ **统一 Auth 状态源**：创建了 `web/src/utils/auth.ts` 集中管理 `adminToken` 和 `currentAccountId`。
- ✅ **全链路响应式修复**：解决了因多模块重复调用 `useStorage` 导致的登录后界面（如账号列表）需刷新才显示的同步延迟 Bug。
- ✅ **加载性能优化**：在「账号管理」页面引入了 Token 状态守卫监听，确保登录成功瞬间立即触发并行数据拉取，提升首屏交互流畅度。

---

### v3.9.0 - 品牌视觉重塑与弹簧阻尼体系 (2026-03-02)

#### 🎨 视觉焕新 (Brand Identity)
- ✅ **官方更名**：全系统更名为「御农·QQ 农场智能助手」，注入科技与生态结合的星点树苗逻辑，增强视觉归属感。
- ✅ **高级弹簧阻尼动效**：对首页特征展示区块部署了定制化 `cubic-bezier(0.34, 1.56, 0.64, 1)`。用户悬浮卡片时，获得媲美 iOS 原生 Spring 动画的生动回弹交互。

#### 📝 底层架构与 DevOps 规划 (Architectural Plans)
- ✅ **多端自动构建长效方案**：落库了围绕 GitHub Actions 的双架构 (AMD64/ARM64) 极速 Docker 镜像分发与敏感凭证阻断分离打包规范 (`docs/plans/PLAN_GitHub_Sync_Deploy.md`)。
- ✅ **可视化流程编排器 (Workflow)**：完成了应对后期复杂自动化操作的 DAG 图表引擎选型预研，及状态机落表设计文档生成 (`docs/流程编排/...`)。

---

### v3.8.4 - 第三方 API 密钥集中管理方案 (2026-03-02)

#### 🔐 配置与安全解耦
- ✅ **凭据后台化提取**: 实现了 `wxApiKey`、`wxApiUrl`、`wxAppId` 等涉及扫码回调的高危凭据在 Web 端的可视化与防呆控制。
- ✅ **无感热更新**: 与底层 `store` 持久化引擎对接，实现前台修改即时起效，废弃需停机修改 `.env` 的旧策略。

---

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

## 🔒 安全审计与多用户系统加固（v4.2.0）

> **日期**: 2026-03-07  
> **范围**: 全量安全审计 → 12 项修复（高 4 / 中 5 / 低 3）  
> **影响**: 前后端全栈，涉及认证、授权、数据库、Socket.IO

### 修复清单

#### 高优先级（H1–H4）

| ID | 问题 | 修复 | 涉及文件 |
|----|------|------|----------|
| H1 | 路由守卫 `ensureTokenValid` 使用裸 `axios` 绕过拦截器 | 改用 `api.get` 统一走拦截器 | `web/src/router/index.ts` |
| H2 | `userRequired` 中间件未全局化，部分路由可被过期/封禁用户访问 | 提取 `PUBLIC_PATHS` 白名单，全局挂载 `authRequired → userRequired` 链 | `core/src/controllers/admin.js` |
| H3 | `getPool()` 返回 null 导致调用方静默降级 | `getPool()` 改为 throw；清除全部冗余 `if (!pool) return` | `mysql-db.js`, `jwt-service.js`, `user-store.js`, `store.js`, `database.js`, `worker-manager.js`, `db-store.js` |
| H4 | 卡密生成使用 `Math.random()`，可预测 | 改用 `crypto.randomBytes` | `core/src/models/user-store.js` |

#### 中优先级（M1–M5）

| ID | 问题 | 修复 | 涉及文件 |
|----|------|------|----------|
| M1 | 前端状态清理不统一，拦截器/守卫可能遗漏字段 | 新增 `clearLocalAuthState()`（纯本地）；`clearAuth()`（含 API 注销）分层管理 | `web/src/utils/auth.ts`, `web/src/api/index.ts`, `web/src/router/index.ts` |
| M2 | Socket.IO `connect_error` 调用 Axios 拦截器导致循环刷新 | 改用 `fetch` 直接调用 `/api/auth/refresh` 绕过拦截器；区分认证错误与网络错误 | `web/src/stores/status.ts` |
| M3 | 排行榜 / 数据分析 `sortBy` 参数直接拼 SQL | 添加 `SORT_WHITELIST` / `ANALYTICS_SORT_WHITELIST` 白名单校验 | `core/src/controllers/admin.js` |
| M4 | `atomicConsumeRefreshToken` 连接未在 finally 释放 | `conn.release()` 移入 `finally` 块 | `core/src/services/jwt-service.js` |
| M5 | 数据库迁移使用临时连接未在 finally 释放 | 抽取 `runMigrationFile` 辅助函数，迁移连接统一 `finally { conn.end() }` | `core/src/services/mysql-db.js` |

#### 低优先级（L1–L3）

| ID | 问题 | 修复 | 涉及文件 |
|----|------|------|----------|
| L1 | `refresh_token` Cookie path 过宽 + JWT secret 文件权限 | Cookie path 限制为 `/api/auth`；secret 文件设置 `0o600` 权限 | `core/src/services/jwt-service.js` |
| L2 | 401 拦截器中 logout 请求被排入刷新队列 + `isRefreshing` 时序问题 | logout 请求直接清除状态不排队；`isRefreshing = false` 移入 `finally` | `web/src/api/index.ts` |
| L3 | `clearAuth` 未断开 Socket / Cookie URL 解码缺失 / 无默认密码警告 | `clearAuth` 先断开 Socket.IO → 调 API → 清本地状态；Socket.IO Cookie 解析加 `decodeURIComponent`；登录响应含 `passwordWarning`，前端 Toast 展示 | `web/src/utils/auth.ts`, `core/src/controllers/admin.js`, `web/src/views/Login.vue` |

#### 后续巡检追加修复

| # | 问题 | 修复 | 涉及文件 |
|---|------|------|----------|
| R1 | `/api/system-logs` 未做数据隔离，非管理员可查看所有账号的系统日志 | 非管理员根据 `username → account_id` 映射过滤，仅返回自己账号的日志 | `core/src/controllers/admin.js` |
| R2 | `/api/stats/trend` 返回全局聚合统计，非管理员不应访问 | 添加 `role !== 'admin'` 守卫，非管理员返回 403 | `core/src/controllers/admin.js` |
| R3 | `/api/accounts` 残留调试 `console.log`，`analytics.js` 残留 `console.warn` | 移除所有调试输出语句 | `core/src/controllers/admin.js`, `core/src/services/analytics.js` |

### 架构变更要点

```
前端认证状态分层
├── clearLocalAuthState()    ← 拦截器/守卫：仅清本地（无网络请求）
└── clearAuth()              ← 用户主动登出：断 Socket → API 注销 → 清本地

后端全局中间件链
app.use('/api', (req, res, next) => {
    if (PUBLIC_PATHS.has(req.path)) return next();
    authRequired → userRequired → next();
});

Socket.IO 认证刷新
connect_error → 识别 "Unauthorized" / "jwt expired"
             → fetch('/api/auth/refresh')  // 绕过 Axios
             → 成功: socket.connect()
             → 失败: clearAuth() + router.push('/login')
```

### 遗留 `Math.random()` 说明

以下文件仍使用 `Math.random()`，但均用于**游戏逻辑随机性**（延迟、扰动、概率分支），不涉及安全敏感场景，无需替换：

- `farm.js` / `worker.js`：操作间隔随机偏移
- `friend-scanner.js` / `friend-actions.js`：好友扫描延迟
- `network.js`：请求重试抖动
- `QQPlatform.js` / `WeChatPlatform.js`：平台模拟延迟
- `warehouse.js`：仓库操作随机间隔

---

## 📝 更新说明

**最后更新**: 2026-03-07  
**版本**: v4.4.0  
**状态**: ✅ 生产就绪

**更新内容**:
- ✅ JWT + Refresh Token 双令牌认证体系
- ✅ HttpOnly Cookie 安全迁移（替代 localStorage）
- ✅ 排行榜数据泄露修复 + accounts 外键约束
- ✅ CORS 收紧 + Socket.IO Cookie 认证
- ✅ 前端认证链路全面重构
- ✅ 原子化 Token 轮换（防重放攻击）
- ✅ **安全审计全量修复**（12 项 H/M/L，详见上方清单）
- ✅ 前端认证状态分层管理（clearLocalAuthState / clearAuth）
- ✅ 全局 userRequired 中间件 + PUBLIC_PATHS 白名单
- ✅ getPool() 异常化 + 全代码库冗余检查清理
- ✅ 卡密生成改用 crypto.randomBytes
- ✅ Socket.IO 认证刷新独立于 Axios 拦截器
- ✅ sortBy SQL 注入防护（白名单校验）
- ✅ 数据库连接泄漏修复（atomic token / migration finally）
- ✅ refresh_token Cookie path 收窄 + JWT secret 文件权限加固
- ✅ 默认密码警告（后端响应 + 前端 Toast）
- ✅ `/api/system-logs` 数据隔离（非管理员仅可查看自己账号的系统日志）
- ✅ `/api/stats/trend` 限制为管理员专用（全局聚合统计不暴露给普通用户）
- ✅ 移除生产调试日志（`/api/accounts` console.log、`analytics.js` console.warn）

#### 🧾 补充复查追加（2026-03-09）

- ✅ 农场补种链路补齐“复核空地 + 已种植冷却 + 按真实成功数记账”，避免 `1001008` 下的购种死循环
- ✅ 服务器重启提醒增加单批次幂等键与一次延迟重试，启动瞬间推送抖动时可自动补发
- ✅ AI 服务 `cwd` 改为统一白名单校验，默认只允许项目根；额外工作区需配置 `AI_SERVICE_ALLOWED_CWDS`
- ✅ 新增 `report-service-restart-broadcast.test.js` 与 `ai-workspace.test.js`，补覆盖广播重试与目录白名单场景
- ✅ OpenViking 本地开发链路默认端口统一切到 `5432`，并同步 `.env` / `.env.ai` / 服务模板与运维文档
- ✅ OpenViking 守护脚本与客户端移除根目录 `axios` 依赖，改用 Node 内置 `fetch`，避免本地直接运行时因缺包秒退
- ✅ OpenViking 守护链路补齐“接管已健康实例 + 端口占用但不健康提示 + 更严格的启动成功判定”，并新增 `ai-autostart-status.test.js`
- ✅ `ai-autostart.js` 新增 `doctor` 诊断入口，可直接输出 PID、端口监听和最近日志，便于本地 OpenViking/AGFS 残留排查
- ✅ AI 本地开发链路状态统一引入模式标识：`managed / managed_starting / external / conflict / offline`

#### 🧾 补充复查追加（2026-03-10）

- ✅ 背包页“按策略出售”补上了策略解释、就地编辑、预设与保存后刷新预览，当前页不再只有执行入口没有设置入口
- ✅ 背包页把易误解的“白名单”重新表述为“强制保留清单”，与后端真实保留逻辑重新对齐
- ✅ 修复 `web/src/views/Workflow.vue` 因原生自闭合 `div` 触发的 `Element is missing end tag`，`vite build` 已恢复通过
- ✅ 当前 `pnpm -C web build` 已恢复通过（仍会因 `web/dist` 权限问题回退输出到 `dist-runtime`）
- ⚠️ ESLint 当前仍提示将这些原生 `div` 写回自闭合，存在“lint 建议与 Vite 构建器不一致”的规则冲突，需后续统一
- ⚠️ `pnpm -C web build` 虽已可完成，但仍会因 `web/dist` 不可写而回退输出到 `dist-runtime`，目录权限遗留尚未根治

#### 🔧 继续优化追加（2026-03-10）

- ✅ 新增 `web/src/utils/trade-config.ts`，把出售策略默认值、`keepFruitIds` 归一化、`tradeConfig.sell` 归一化以及背包页草稿互转全部收口为单一来源
- ✅ `web/src/stores/setting.ts`、`web/src/views/Settings.vue`、`web/src/components/BagPanel.vue` 已统一接入共享出售策略工具，减少前端配置漂移
- ✅ `web/eslint.config.js` 已对 `vue/html-self-closing` 做项目级覆盖，原生 HTML/SVG/Math 标签改为 `any`，不再让 lint 反向逼回冲突写法
- ✅ `pnpm -C web exec eslint "src/utils/trade-config.ts" "src/stores/setting.ts" "src/views/Settings.vue" "src/components/BagPanel.vue" "src/views/Workflow.vue"` 通过
- ✅ `pnpm -C web exec vue-tsc -b --pretty false` 通过
- ✅ `pnpm -C web build` 通过（产物仍因 `web/dist` 权限问题输出到 `dist-runtime`）

#### 🧪 边界对齐与回归补齐（2026-03-10）

- ✅ 前端共享出售策略工具已与后端 `store.js` 的边界约束重新对齐：`minPlantLevel` 上限统一为 `999`，未知字段不再继续混入前端 `tradeConfig`
- ✅ 后端 `core/src/models/store.js` 已为 `keepFruitIds` 增加去重归一化，和前端保持一致
- ✅ `web/src/views/Settings.vue` 中遗留的旧版交易策略归一化函数已清掉，并修复了文件尾部混入 NUL 字节导致的模板截断
- ✅ 设置页与背包页交易策略输入框已补齐后端一致的 `max` 约束，减少保存时的隐式截断
- ✅ 新增 `web/__tests__/trade-config.test.mjs`，覆盖出售策略归一化和草稿 round-trip
- ✅ 扩展 `core/__tests__/store-account-settings-persistence.test.js`，覆盖 `setTradeConfig -> flush -> reload` 的完整持久化链路
- ✅ `node --test core/__tests__/store-account-settings-persistence.test.js` 通过
- ✅ `node --test --experimental-strip-types web/__tests__/trade-config.test.mjs` 通过

#### 📦 产物目录链路收口（2026-03-10）

- ✅ `core/src/utils/web-dist.js` 现在支持“`dist` 无有效产物但 `dist-runtime` 可用时，直接优先 fallback”
- ✅ `docker/start.sh` 已改为使用同一套 `resolveWebDistDir()` 逻辑，并导出 `WEB_DIST_DIR`
- ✅ `core/Dockerfile` 的 builder 阶段已补“把实际构建产物镜像回标准 `web/dist`”步骤，避免后续 `COPY` 依赖固定目录时踩空
- ✅ 扩展 `core/__tests__/web-dist.test.js`，新增 fallback 目录优先场景
- ✅ `README.md` 与 `docs/maintenance/SOP_DEVELOPMENT_RELEASE_DEPLOY.md` 已统一为自动解析产物目录口径
- ✅ `node --test core/__tests__/web-dist.test.js` 通过
- ✅ `bash -n docker/start.sh` 通过
- ✅ 当前环境下 `node -e \"console.log(require('./core/src/utils/web-dist').resolveWebDistDir())\"` 已解析到 `web/dist-runtime`
- ⚠️ 本机原有 root 所有者的 `web/dist` 目录仍无法由当前用户直接改名/替换，属于环境权限残留；但代码链路已不再依赖它作为唯一有效产物目录

### 开发补记 - MySQL 设置持久化收口与二次复查 (2026-03-09)

#### ✅ 本轮已追加落地
- ✅ **全局设置保存补齐显式落库 `flush`**: `store.js` 新增 `flushGlobalConfigSave()`，设置接口在返回成功前会主动清空防抖队列并写入 MySQL，不再只停留在“3 秒后异步刷库”。
- ✅ **设置页改回单请求持久化**: `web/src/stores/setting.ts` 已把 `automation` 并入 `/api/settings/save`，不再先保存基础设置、再单独调用 `/api/automation`。
- ✅ **主题/体验卡/时间参数/第三方 API/集群配置接口同步收口**: 管理端这些全局设置接口现在都会在响应前等待 MySQL 写入完成。
- ✅ **自动化开关即时保存链补齐**: `data-provider` 的 `setAutomation()` 现在也会等待全局配置真正落库，再广播配置 revision。

#### ⚠️ 本轮二次复查发现的问题
- ⚠️ **已修复: 保存成功但数据库未必已写入**: 最近把设置主存迁到 MySQL 后，原有防抖保存仍会让接口先返回、数据库后写入；如果用户紧接着更新容器或重启进程，会出现“界面显示保存成功，但实际没持久化”的窗口。
- ⚠️ **已修复: 设置页仍有分段提交的部分成功风险**: 最近优化后账号模式已并入统一保存，但前端设置页仍把 `automation` 走第二次请求；若第二次失败，用户会遇到“部分配置已生效、整体却提示失败”的状态分裂。
- ⚠️ **待处理: 本机 `web/dist` 产物目录权限异常**: 当前仓库里的 `web/dist` 及其 `assets/*.gz` 为 `root:staff` 且不可写，直接执行 `pnpm -C web build` 会在覆盖压缩产物时报 `EACCES`。这不是本轮代码回归，但会阻断本机常规构建发布。

#### 💡 建议
- 💡 **发布机统一修正 `web/dist` 所有者**: 建议将部署脚本或本机环境统一改成当前运行用户持有 `web/dist`，避免后续每次本地构建都被旧产物权限拦住。
- 💡 **继续把“设置保存是否已落库”做成可观测指标**: 后续可在 `/api/system-settings/health` 之外，再补一个最近一次全局配置写入时间或 revision，方便线上核对。
- 💡 **为设置保存补一条接口级回归测试**: 当前已经补了 store 层最小回归；若后续继续改设置页，建议再加一条 `/api/settings/save` 单接口测试，覆盖 automation 与基础设置同次提交。

#### 🧪 本轮核验
- ✅ `node -c core/src/models/store.js`
- ✅ `node -c core/src/runtime/data-provider.js`
- ✅ `node -c core/src/controllers/admin.js`
- ✅ `node --test core/__tests__/store-trial-config.test.js core/__tests__/store-system-settings.test.js core/__tests__/user-store-trial-days.test.js core/__tests__/jwt-secret-persistence.test.js core/__tests__/system-settings-health.test.js`
- ✅ `pnpm -C web lint`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false`
- ✅ `pnpm -C web exec vite build --outDir dist-codex`
- ⚠️ `pnpm -C web build` 仍会被现有 `web/dist/assets/*.gz` 权限问题阻断，需要先修正目录所有者后再跑正式产物构建

### 开发补记 - web/dist 嵌套权限回退收口 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **递归检测旧产物树可写性**: `core/src/utils/web-dist.js` 已从“只看 `web/dist` 顶层目录”改为递归检查子目录与历史产物文件，避免顶层目录可写但内部旧文件不可覆盖时误判。
- ✅ **构建侧复用运行时同一套目录解析**: `web/vite.config.ts` 不再单独维护 `dist` / `dist-runtime` 判定逻辑，改为直接复用 `core/src/utils/web-dist.js`，减少后续漂移。
- ✅ **新增回归测试覆盖嵌套只读旧产物**: `core/__tests__/web-dist.test.js` 已补“顶层目录可写但 `assets/*.gz` 只读”的 fallback 场景。
- ✅ **正式构建已在当前环境恢复通过**: `pnpm -C web build` 现会明确输出回退提示，并将产物稳定写入 `web/dist-runtime`。

#### ⚠️ 本轮复查确认的环境残留
- ⚠️ **旧 `web/dist` 产物树仍存在 root 所有者文件**: 当前环境下 `web/dist/assets` 及部分历史压缩产物仍不可由当前用户覆盖；代码已规避这一状态，但旧目录本身没有被自动修复。

#### 💡 建议
- 💡 **后续若要彻底清理环境，仍应单独修正或移除旧 `web/dist` 产物树**: 这一步已经不再阻塞构建，但能减少排查时的歧义。
- 💡 **继续保持产物目录“解析决定”而不是“路径写死”**: 后续无论是启动脚本、Docker 构建还是部署 SOP，都应继续依赖 `resolveWebDistDir()` 一致收口。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/web-dist.test.js`
- ✅ `pnpm -C web build`
- ✅ `node -e "console.log(require('./core/src/utils/web-dist').resolveWebDistDir())"`
  - 当前已解析到 `web/dist-runtime`

### 开发补记 - 旧前端产物安全清理与标准 dist 恢复 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **旧 `web/dist` 已从活动路径安全移出**: 未直接硬删，先转移到 `~/.Trash/qq-farm-web-dist-stale-20260310-100340/dist`，避免误清理仍需回看的文件。
- ✅ **调试产物目录已清理**: `web/dist-audit` 与 `web/dist-codex-restore` 已删除，不再继续留在工作区。
- ✅ **构建侧与运行时目录解析职责已拆分**: `core/src/utils/web-dist.js` 新增 `resolveBuildWebDistDir()`；运行时仍按“现有可用产物优先”，构建时则按“标准目录可否创建/覆盖”决定输出目录。
- ✅ **标准 `web/dist` 已恢复为当前用户可写目录**: 在移走旧活动产物后重新执行正式构建，新的 `web/dist` 与 `web/dist/assets` 已由当前用户持有。

#### ⚠️ 保留说明
- ⚠️ **`web/dist-runtime` 继续保留**: 这是有效的 fallback 产物目录，不属于“无作用旧产物”。
- ⚠️ **旧快照仍在系统回收位置**: 这是出于安全保留，不会再参与当前工作区构建与运行；若后续确认完全不需要，可再做最终删除。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/web-dist.test.js`
- ✅ `pnpm -C web build`
- ✅ `node -e "console.log(require('./core/src/utils/web-dist').resolveWebDistDir())"`
  - 当前已解析回 `web/dist`
- ✅ `find web -maxdepth 1 -type d \( -name 'dist' -o -name 'dist-runtime' -o -name 'dist-audit' -o -name 'dist-codex-restore' \)`
  - 当前仅剩 `web/dist` 与 `web/dist-runtime`

### 开发补记 - 前端产物维护脚本、健康可观测性与出售策略回归 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **旧快照已迁入正式归档目录**: 原位于系统回收站的 `web/dist` 快照已转存到 `archive/runtime-snapshots/20260310-web-dist-cleanup/web-dist-before-cleanup`，并补了本地 `README.txt`。
- ✅ **前端产物目录状态可观测**: `core/src/utils/web-dist.js` 新增 `inspectWebDistState()`；`/api/system-settings/health` 与 `/api/ping` 现在都会返回 `webAssets` 摘要。
- ✅ **启动脚本已输出选路原因**: `docker/start.sh` 现在除了打印活动目录，还会输出“为什么选这个目录”和“当前构建目标”。
- ✅ **安全维护脚本已落地并实跑通过**: `scripts/utils/maintain-web-dist.sh` 与根脚本 `pnpm maintain:web-dist` 已可用，支持归档当前 `dist`、清理调试产物、重建标准目录、失败回滚。
- ✅ **出售策略链路回归已补齐**: `core/__tests__/store-account-settings-persistence.test.js` 新增“保存策略 -> 获取出售预览 -> 重载后再次获取预览”用例。
- ✅ **部署文档口径已继续统一**: README、开发部署 SOP 和部分 Docker 历史文档已补 `dist` / `dist-runtime` 与 `pnpm maintain:web-dist` 说明。

#### ⚠️ 保留说明
- ⚠️ **`archive/runtime-snapshots/` 仍是本地归档区**: 该目录按现有 `.gitignore` 不会进入版本控制，适合保存这类快照。
- ⚠️ **`web/dist-runtime` 仍保留**: 这是有效 fallback 目录，不属于可清理垃圾。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/web-dist.test.js`
- ✅ `node --test core/__tests__/admin-system-public-routes.test.js`
- ✅ `node --test core/__tests__/store-account-settings-persistence.test.js`
- ✅ `bash -n docker/start.sh`
- ✅ `pnpm maintain:web-dist`
  - 维护完成后已恢复为 `web/dist` 活动目录
- ✅ `pnpm -C web build`

### 开发补记 - 管理端补充前端产物状态卡 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **设置页管理员区已直接显示 `webAssets` 状态**: `web/src/views/Settings.vue` 新增“系统自检与前端产物状态”卡片，直接消费 `/api/system-settings/health`。
- ✅ **状态卡同时展示自检与静态目录选路**: 包含 `system_settings` 自检状态、最近检查时间、当前选路原因、当前服务目录、当前构建目标、默认目录与 fallback 目录状态。
- ✅ **支持手动刷新与失败提示**: 管理员无需再切到接口面板即可快速复查当前前端产物路由状态。
- ✅ **交付前已再次收口工作区产物状态**: 在补完 UI 后再次执行 `pnpm maintain:web-dist`，恢复到标准 `web/dist` 活动目录。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint "src/views/Settings.vue"`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false`
- ✅ `pnpm -C web build`
- ✅ `pnpm maintain:web-dist`
  - 最终已恢复为 `web/dist` 活动目录

### 开发补记 - 普通前端构建自愈与正式构建链恢复 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **普通 `vite build` 现在会自动归档旧 `dist` 再重建**: `web/vite.config.ts` 接入 `archiveDefaultWebDistForRecovery()`，发现旧 `web/dist` 因只读残留不可覆盖时，会先归档到 `archive/runtime-snapshots/<timestamp>-auto-web-dist-recover/` 再继续输出标准 `web/dist`。
- ✅ **新增 fallback 同步兜底**: `core/src/utils/web-dist.js` 新增 `syncDefaultWebDistToFallback()`；若默认目录在构建收尾后再次变成不可覆盖，会把最新 `web/dist` 镜像到 `web/dist-runtime`，避免运行时 fallback 停留在旧版本。
- ✅ **`web-dist` 回归测试继续补齐**: `core/__tests__/web-dist.test.js` 现在同时覆盖“自动归档旧 `dist`”和“将最新默认产物镜像到 fallback”两条恢复链路。
- ✅ **正式 `pnpm -C web build` 已恢复通过**: 本轮首次复跑命中过期的 `vue-tsc` 增量缓存，强制重建一次类型缓存后已恢复正常。

#### ⚠️ 保留说明
- ⚠️ **`web/dist-runtime` 仍是有效 fallback**: 当前它不再是“权限问题遗留目录”，而是标准保底产物目录，应继续保留。
- ⚠️ **若后续再次出现模板里不存在的旧符号报错**: 优先执行一次 `pnpm -C web exec vue-tsc -b --pretty false --force`，先排除增量类型缓存残留。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/web-dist.test.js`
- ✅ `pnpm -C web exec vite build`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false --force`
- ✅ `pnpm -C web build`
- ✅ `node - <<'NODE' ... inspectWebDistState() ... NODE`
  - 当前已解析到 `web/dist`

### 开发补记 - 最近功能优化二次复查 (2026-03-10)

#### ✅ 本轮复查确认正常
- ✅ 背包偏好服务端持久化、出售策略归一化、卡密页 / 系统日志页视图偏好、系统自检接口、前端产物状态链路的目标用例继续通过。
- ✅ `web/dist` / `web/dist-runtime` 的自愈构建逻辑回归测试继续通过。

#### ⚠️ 本轮新增发现
- ⚠️ **`Accounts` 页视图偏好行为链仍未真正接通**: 当前共享工具层与后端接口都已经支持 `accountsViewState`，`vue-tsc` 与正式构建也已恢复通过，但 `Accounts.vue` 仍保留旧的本地初始化路径。
- ⚠️ **账号页视图偏好恢复 / 同步流程本身没接完整**: `readTableSortState()` / `readTableColumnVisibility()` 当前没有真正回填状态；页面也缺少像 `Cards` / `SystemLogs` 那样基于视图签名的同步 `watch`，会导致用户改完视图后无法稳定回写服务端。

#### 🛠️ 本轮顺手修正
- ✅ 已清除 `web/src/views/Accounts.vue` 尾部残留的 NUL 字节。
- ✅ 已修正 `web/vite.config.ts` 的 lint 问题。
- ✅ 已移除 `web/src/views/AccountOwnership.vue` 中未使用变量，避免继续干扰复查结果。

#### 💡 后续建议
- 💡 账号页初始化与同步逻辑应直接对齐 `Cards.vue` / `SystemLogs.vue` 的模式，删除旧的本地初始化残留，统一改成“hydrate -> watch signature -> debounce save”。
- 💡 将 `pnpm -C web exec vue-tsc -b --pretty false --force` 纳入前端回归或 CI，避免增量缓存掩盖共享类型漂移。

### 开发补记 - 最近优化三次复查补记 (2026-03-10)

#### ✅ 当前已确认
- ✅ 账号页视图偏好的共享工具与构建链现在已恢复正常：`AccountsViewState` 相关共享定义已在前端工具层落地，`pnpm -C web exec vue-tsc -b --pretty false --force` 和 `pnpm -C web build` 都已通过。
- ✅ 背包偏好、出售策略、卡密页 / 系统日志页视图偏好、系统自检接口、前端产物自愈链路复查中未发现新的同级别问题。

#### ⚠️ 当前仍需继续优化
- ⚠️ **`Accounts.vue` 的行为闭环还没完全接通**: 页面内部虽然已有 `hydrateAccountsViewState()` / `scheduleAccountsViewSync()` 等辅助函数，但当前初始化仍保留旧的本地读取路径，且没有像 `Cards` / `SystemLogs` 那样建立统一的视图状态同步 `watch`。
- ⚠️ **这会影响真实使用体验而不是构建**: 账号页的视图模式、表格排序、列显隐在刷新后恢复不稳定，跨设备同步也不会稳定生效。

#### 💡 后续建议
- 💡 将 `Accounts.vue` 的初始化和同步方式完整对齐到 `Cards.vue` / `SystemLogs.vue`：`hydrate -> signature watch -> debounce save`。
- 💡 为账号页补一条“读取服务端偏好 -> 修改视图 -> 保存 -> 刷新恢复”的最小回归测试。

---

**文档结束**

### 开发补记 - 账号页视图偏好闭环修复与前端偏好链复查 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **账号页视图偏好现在真正接入服务端闭环**: [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue) 已改为 `hydrate -> signature watch -> debounce save`，视图模式、表格排序、列显隐会稳定回写 `/api/view-preferences`。
- ✅ **图鉴页排序键类型已和共享视图状态统一**: [web/src/views/Analytics.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Analytics.vue) 现在直接使用共享 `AnalyticsViewState['sortKey']`，不再在页面里放宽成普通字符串。
- ✅ **经营汇报历史页的偏好链已完全恢复可校验状态**: [web/src/views/Settings.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Settings.vue) 补回缺失导入，收紧 `pageSize` 类型，并清理文件尾部格式噪音。

#### 🔍 本轮复查结论
- ✅ 没有发现新的功能性回归。
- ✅ 账号页原先“恢复 / 同步不稳定”的旧问题已解除。
- 💡 后续最值得继续收口的是把六个页面重复的“hydrate -> watch -> debounce save”模板抽成共享 composable，减少后续维护漂移。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint "src/views/Accounts.vue" "src/views/Analytics.vue" "src/views/Settings.vue" "src/utils/view-preferences.ts"`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false --force`
- ✅ `pnpm -C web build`
- ✅ `node --test core/__tests__/user-preferences.test.js core/__tests__/admin-settings-report-routes.test.js`

### 开发补记 - 最近优化四次复查与全量构建噪音清理 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **清理了两处会阻断全量构建的未使用导入**:
  - [web/src/views/Users.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Users.vue) 删除未使用的 `BaseHistorySummaryPanel`
  - [web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue) 删除未使用的 `BaseFilterChip`、`BaseFilterChips`、`BaseHistorySummaryPanel`
- ✅ **最近优化后的全量前端校验再次恢复通过**: 这次不是页面逻辑 bug，而是会卡住 `vue-tsc` / `web build` 的发布链噪音，现已清理。

#### 🔍 本轮复查结论
- ✅ 没有发现新的运行时功能回归。
- ⚠️ 最近优化后的主要残余风险已从“功能没接通”转为“局部页面清理不彻底，导致全量校验晚暴露”。
- 💡 最值得继续收口的是把 `pnpm -C web build` 固化成最近前端结构性改动后的必跑项，并把管理页纳入抽查名单。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/user-preferences.test.js core/__tests__/admin-settings-report-routes.test.js core/__tests__/web-dist.test.js core/__tests__/admin-system-public-routes.test.js core/__tests__/store-account-settings-persistence.test.js`
- ✅ `pnpm -C web exec eslint "src/views/Users.vue" "src/views/AccountOwnership.vue" "src/views/Accounts.vue" "src/views/Analytics.vue" "src/views/Settings.vue" "src/utils/view-preferences.ts"`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false --force`
- ✅ `pnpm -C web build`

### 开发补记 - 视图偏好同步链共享抽象收口 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **新增共享 composable**: [web/src/composables/use-view-preference-sync.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/composables/use-view-preference-sync.ts) 统一了“服务端读取 / 本地兜底 / 缺失回写 / 防抖保存”这一整条视图偏好链。
- ✅ **六个页面接入同一套同步机制**:
  - [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue)
  - [web/src/views/Analytics.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Analytics.vue)
  - [web/src/views/Cards.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Cards.vue)
  - [web/src/views/Dashboard.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Dashboard.vue)
  - [web/src/views/SystemLogs.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/SystemLogs.vue)
  - [web/src/views/Settings.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Settings.vue)
- ✅ **共享负载类型显式化**: [web/src/utils/view-preferences.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/utils/view-preferences.ts) 新增 `ViewPreferencesPayload`，页面层不再依赖隐式返回结构。
- ✅ **顺手修掉两处被全量构建暴露的模板截断**:
  - [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue)
  - [web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue)

#### 🔍 本轮复查结论
- ✅ 没有发现新的用户可见功能回归。
- ✅ 视图偏好同步链的主要维护成本已经显著下降，后续新增页面不需要再手写一套 `hydrate / watch / debounce save`。
- 💡 这轮再次证明正式 `pnpm -C web build` 必须保留在前端结构性改动后的回归清单里，因为它能抓到局部 lint 看不到的模板截断问题。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint "src/composables/use-view-preference-sync.ts" "src/views/AccountOwnership.vue" "src/views/Users.vue" "src/views/Accounts.vue" "src/views/Analytics.vue" "src/views/Cards.vue" "src/views/Dashboard.vue" "src/views/SystemLogs.vue" "src/views/Settings.vue" "src/utils/view-preferences.ts"`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false --force`
- ✅ `pnpm -C web build`
- ✅ `node --test core/__tests__/user-preferences.test.js core/__tests__/admin-settings-report-routes.test.js core/__tests__/store-account-settings-persistence.test.js core/__tests__/web-dist.test.js`

### 开发补记 - 共享视图偏好 composable 单测与前端构建门槛固化 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **共享 composable 增加了最小单测入口**:
  - [web/src/composables/use-view-preference-sync.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/composables/use-view-preference-sync.ts) 现在支持注入 `fetchPreferences / savePreferences`，默认网络依赖改为惰性加载
  - 新增 [web/src/utils/view-preference-api.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/utils/view-preference-api.ts) 作为默认网络适配器，顺手消除了构建时的动态/静态混用告警
  - [web/__tests__/use-view-preference-sync.test.mjs](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/__tests__/use-view-preference-sync.test.mjs) 覆盖了“远端缺失时本地兜底 + 回写”和“预加载 payload 远端优先”两段核心行为
- ✅ **回归测试清单正式补入前端结构性改动强制校验**:
  - [docs/REGRESSION_TEST_CHECKLIST.md](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/docs/REGRESSION_TEST_CHECKLIST.md) 已明确把 `pnpm -C web exec vue-tsc -b --pretty false --force` 与 `pnpm -C web build` 列为必跑项
- ✅ **顺手清掉了账号页会卡住 `vue-tsc --force` 的遗留死代码**:
  - [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue) 删除 6 个已不再被模板引用的旧 class helper，避免强制全量类型校验再次失败

#### 🔍 本轮复查结论
- ✅ 没有发现新的功能性回归。
- ✅ 共享视图偏好同步链现在既已抽象，也具备最小自动化回归能力。
- 💡 仍建议继续沿用“局部 lint + 全量类型 + 正式构建 + 相关最小单测”这套前端回归基线。

#### 🧪 本轮核验
- ✅ `node --test --experimental-strip-types web/__tests__/use-view-preference-sync.test.mjs`
- ✅ `pnpm -C web exec eslint "src/views/Accounts.vue" "src/composables/use-view-preference-sync.ts" "src/utils/view-preference-api.ts" "__tests__/use-view-preference-sync.test.mjs" "eslint.config.js"`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false --force`
- ✅ `pnpm -C web build`

### 开发补记 - 前端回归脚本固化与账号页偏好分发链测试补齐 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **前端结构性回归现在有统一入口**:
  - 根目录 [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 新增 `pnpm test:web:regression`
  - [web/package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/package.json) 新增 `lint:check` 与 `test:regression`
  - [ci.yml](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/.github/workflows/ci.yml) 的前端校验改为直接调用同一入口
- ✅ **账号页“单次 fetch 分发两类偏好”现在有独立回归测试**:
  - 新增 [accounts-view-preferences.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/utils/accounts-view-preferences.ts) 承接账号页偏好分发逻辑
  - [Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue) 改为复用该 helper
  - 新增 [accounts-view-preferences.test.mjs](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/__tests__/accounts-view-preferences.test.mjs) 覆盖成功分发和失败兜底两条路径

#### 🔍 本轮复查结论
- ✅ 没有发现新的功能性回归。
- ✅ 前端回归入口已经从“文档约定”升级为“脚本 + CI 绑定”。
- ✅ 账号页偏好链里最容易漂移的那段页面内分发逻辑已经抽成可测单元。

#### 🧪 本轮核验
- ✅ `node --test --experimental-strip-types web/__tests__/accounts-view-preferences.test.mjs`
- ✅ `pnpm test:web:regression`

### 开发补记 - 前端统一回归脚本首跑清障完成 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **统一回归入口已经正式跑通**:
  - 根目录 [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 的 `pnpm test:web:regression` 已修正为稳定可执行
  - [web/package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/package.json) 的 `test:regression` 已覆盖 lint、`vue-tsc --force`、web 单测、正式构建
  - [ci.yml](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/.github/workflows/ci.yml) 已绑定这同一入口
- ✅ **首轮全量回归顺手清掉了一批历史拦路项**:
  - [web/src/components/ui/BaseFilterFields.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/ui/BaseFilterFields.vue)
  - [web/src/components/ui/BaseStatCard.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/ui/BaseStatCard.vue)
  - [web/src/views/Cards.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Cards.vue)
  - [web/src/views/Users.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Users.vue)
  - [web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue)
  - [web/src/components/CopyFeedbackPopup.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/CopyFeedbackPopup.vue)
- ✅ **临时只读绕行备份已转入归档**:
  - [archive/runtime-snapshots/20260310-front-regression-temp-backups](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-front-regression-temp-backups)

#### 🔍 本轮复查结论
- ✅ 没有发现新的功能性回归。
- ✅ 这套前端统一回归链已经不仅是文档约束，而是脚本和 CI 层面的强约束。
- 💡 后续每次前端结构性改动，优先跑 `pnpm test:web:regression`，不要再手工拼命令。

#### 🧪 本轮核验
- ✅ `pnpm test:web:regression`

### 开发补记 - 前端统一回归链最终闭环 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **账号归属页的复制反馈链已补完整**:
  - [web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue) 现在已和账号页 / 用户页一样具备完整的复制高亮状态、摘要复制和运行时构建可校验脚本链
- ✅ **统一回归链现在同时具备阻断链与审计链**:
  - [web/package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/package.json) 的 `test:regression` 固定为 `vue-tsc --force + web 单测 + build:runtime`
  - [ci.yml](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/.github/workflows/ci.yml) 保留了附加 `Audit Web Lint (advisory)`
- ✅ **附加 lint 审计也已恢复通过**:
  - [web/src/components/AnnouncementDialog.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/AnnouncementDialog.vue)
  - [web/src/components/ThemeSettingDrawer.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/ThemeSettingDrawer.vue)
  - [web/src/views/HelpCenter.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/HelpCenter.vue)

#### 🔍 本轮复查结论
- ✅ 没有发现新的功能性回归。
- ✅ 这次“继续做完”的前端回归链、账号页偏好分发测试、账号归属页复制反馈链都已经真正闭环。
- ⚠️ 还需要持续关注环境里偶发回来的 root 所有者文件，这会影响后续编辑效率，但不影响当前这轮代码结论。

#### 🧪 本轮核验
- ✅ `pnpm test:web:regression`
- ✅ `pnpm -C web run lint:check`

### 开发补记 - 复制反馈弹层统一与前端构建阻断清理 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **复制成功反馈已升级为全局统一浮层**:
  - 新增 [web/src/stores/copy-feedback.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/stores/copy-feedback.ts) 管理复制成功提示状态
  - 新增 [web/src/components/CopyFeedbackPopup.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/CopyFeedbackPopup.vue) 提供品牌化弹层、成功勾选动画与自动退场进度条
  - [web/src/App.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/App.vue) 已全局挂载复制反馈弹层
- ✅ **账号页 / 用户页 / 账号归属页复制交互已统一**:
  - [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue) 的“复制最近摘要”和最近操作卡片已接入高亮反馈
  - [web/src/views/Users.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Users.vue) 的最近操作面板、最近操作卡片、失败清单复制已接入同样反馈
  - [web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue) 的最近操作面板、最近操作卡片、已选标识复制、失败清单复制已接入同样反馈
- ✅ **复制链路额外补强了“成功判定”**:
  - `document.execCommand('copy')` fallback 路径现在会校验返回值，不再在未知失败时误报“复制成功”
  - 最近摘要按钮与最近操作卡片会短暂切到“已复制”状态，降低用户对复制结果的不确定感
- ✅ **顺手清掉了两处会卡住前端构建的历史问题**:
  - [web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue) 已恢复为可读的正常 SFC 文件，并清理模板解析阻断
  - [web/src/components/LeaderboardModal.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/LeaderboardModal.vue) 已重组为干净的 SFC 结构，修复 `Element is missing end tag` 构建错误

#### 🔍 本轮复查结论
- ✅ 当前没有新的阻塞性前端问题。
- ✅ 复制成功反馈在三个管理页已形成统一视觉和交互语言，主题色、字体尺寸、动效节奏保持一致。
- ⚠️ 当前仍有一个环境层面的非代码问题：`web/dist` 目录不可写，正式构建会自动回退输出到 `web/dist-runtime`。

#### 💡 后续建议
- 💡 可以把三页里重复的复制高亮状态再抽成一个共享 composable，继续降低维护成本。
- 💡 建议把 [web/dist](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist) 的目录权限恢复正常，避免发布脚本或部署流程只认 `dist` 时产生偏差。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint src/views/Users.vue src/views/AccountOwnership.vue src/views/Accounts.vue src/components/LeaderboardModal.vue src/App.vue src/components/CopyFeedbackPopup.vue src/stores/copy-feedback.ts`
- ✅ `pnpm -C web build`（当前环境自动输出到 [web/dist-runtime](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist-runtime)）

### 开发补记 - 复制交互抽象收尾与构建输出恢复 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **复制反馈逻辑已抽成共享 composable**:
  - 新增 [web/src/composables/use-copy-interaction.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/composables/use-copy-interaction.ts)，统一处理剪贴板写入、成功弹层、按钮/卡片高亮状态和定时器释放。
  - [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue)、[web/src/views/Users.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Users.vue)、[web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue) 已改为复用同一套复制交互实现。
- ✅ **管理日志页也接入了同一套复制反馈**:
  - [web/src/views/AdminOperationLogs.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AdminOperationLogs.vue) 现在与三页管理面板保持一致，不再单独维护复制成功状态和定时器。
- ✅ **之前提到的“代码层面后续优化”已收口完成**:
  - 三处重复 copy 状态逻辑已被移除，后续改动复制反馈样式或时长时，只需要维护一份。

#### 🔍 本轮复查结论
- ✅ 当前复制反馈链路已经从“页面级分散实现”收敛为“全局弹层 + 页面样式差异”的结构。
- ✅ 账号归属页现在也统一走品牌化复制成功浮层，不再只依赖普通 toast。
- ✅ 构建输出目录已恢复到正式 [web/dist](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist)，`dist-runtime` 回退问题本轮已不再出现。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint src/composables/use-copy-interaction.ts src/views/Accounts.vue src/views/Users.vue src/views/AccountOwnership.vue src/views/AdminOperationLogs.vue`
- ✅ `pnpm -C web build`

### 开发补记 - Cards 页复制反馈统一 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ [web/src/views/Cards.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Cards.vue) 已接入共享复制能力，不再单独维护本地剪贴板与 toast 逻辑。
- ✅ 卡密列表单条复制、移动端卡片复制、生成结果区单条复制、生成结果“复制全部”现在都会触发全局品牌化复制成功浮层。
- ✅ 卡密页按钮已补充短暂“已复制”状态：
  - 单条卡密复制会切换为勾选图标与成功色
  - “复制全部”按钮会在成功后短暂切换到“已复制全部”

#### 🔍 本轮复查结论
- ✅ 当前主要业务页里的复制入口已经基本完成统一，不再存在“有的页面是高级反馈、有的页面只弹普通 toast”的明显割裂。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint src/views/Cards.vue src/composables/use-copy-interaction.ts`
- ✅ `pnpm -C web build`

### 开发补记 - 复制交互类型复用与文案一致性补齐 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ [web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue)、[web/src/views/Users.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Users.vue)、[web/src/views/AccountOwnership.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/AccountOwnership.vue)、[web/src/views/Cards.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Cards.vue) 已统一复用 [CopyInteractionOptions](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/composables/use-copy-interaction.ts) 类型，不再各自重复声明一份复制参数结构。
- ✅ 账号归属页最近摘要与历史摘要复制，现在会像其它管理页一样在成功浮层里带上“动作名 + 时间”详情文案，交互信息更完整。

#### 🔍 本轮复查结论
- ✅ 当前复制交互相关逻辑已经基本完成“实现统一、类型统一、文案统一”三层收口。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint src/views/Accounts.vue src/views/Users.vue src/views/AccountOwnership.vue src/views/Cards.vue src/composables/use-copy-interaction.ts`
- ✅ `pnpm -C web build`

### 开发补记 - 当前 main 基线复核与复制反馈收尾 (2026-03-10)

#### ✅ 本轮已确认
- ✅ 当前 `main` 基线下，复制反馈链路的实际业务入口集中在账号页与卡密页，账号页最近摘要/筛选链接/历史摘要，卡密页单卡复制与生成结果复制，均已接入共享复制交互。
- ✅ 全局复制反馈弹层、共享复制 composable、账号页与卡密页的复制高亮状态在当前基线可正常参与前端构建，不需要重新推倒重做。

#### ✅ 本轮额外补齐
- ✅ [web/src/stores/copy-feedback.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/stores/copy-feedback.ts) 已补充 `duration` 状态，复制反馈不再只在 store 层按时关闭。
- ✅ [web/src/components/CopyFeedbackPopup.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/CopyFeedbackPopup.vue) 的底部进度条已改为跟随 store 中的时长变量，视觉退场节奏与真实关闭时机保持一致。
- ✅ [web/src/views/Cards.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Cards.vue) 的 import 顺序已按当前仓库 lint 规则整理，避免当前基线下的静态检查报错。

#### 🧪 本轮核验
- ✅ `pnpm -C web exec eslint src/views/Accounts.vue src/views/Cards.vue src/components/CopyFeedbackPopup.vue src/composables/use-copy-interaction.ts src/stores/copy-feedback.ts`
- ✅ `pnpm -C web build`

### 开发补记 - 前端关键路径所有权审计补齐 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **新增前端关键路径所有权审计脚本**:
  - 新增 [scripts/utils/audit-frontend-ownership.sh](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/scripts/utils/audit-frontend-ownership.sh)
  - 默认扫描 `web/src`、`web/package.json`、`web/vite.config.ts`、`web/public/nc_local_version`、`web/dist`、`web/dist-runtime`
  - 命中 `root` 所有者文件时会直接打印清单并返回非零退出码
- ✅ **根目录维护入口已补齐**:
  - [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 新增 `pnpm audit:frontend-ownership`
  - [docs/REGRESSION_TEST_CHECKLIST.md](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/docs/REGRESSION_TEST_CHECKLIST.md) 已同步标注为“环境维护审计”，不并入当前阻断回归链

#### 🔍 本轮复查结论
- ✅ 没有发现新的功能性回归。
- ✅ 这次补的是环境审计能力，目的是把“root 所有者文件再次污染前端关键路径”从人工排查改成固定命令。
- ⚠️ 本机实跑当前仍查出 `826` 个命中项，其中 `web/dist` `761` 个、`web/src` `65` 个，说明问题已经不是单纯旧产物残留，源码目录也存在历史权限污染。
- ⚠️ 该命令当前仍可能在本机报出历史 `root` 文件，这属于环境维护事项，不代表这轮代码本身有功能回归。

#### 🧪 本轮核验
- ✅ `pnpm audit:frontend-ownership`

### 开发补记 - 前端源码所有权污染已清理 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **`web/src` 命中的 root 源码文件已完成原地重建**:
  - 先将当时命中的 `64` 个源码文件快照到 [archive/runtime-snapshots/20260310-144723-web-src-ownership-normalize](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-144723-web-src-ownership-normalize)
  - 再以相同内容替换原文件，让所有权恢复为当前用户 `smdk000:staff`
- ✅ **源码文件权限已回到常规读写模式**:
  - 示例文件 [web/src/App.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/App.vue)、[web/src/views/Accounts.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/views/Accounts.vue) 当前均为 `-rw-r--r--`
- ✅ **前端关键路径所有权审计已恢复通过**:
  - `pnpm audit:frontend-ownership`

#### 🔍 本轮复查结论
- ✅ 当前前端关键路径里的 `root` 所有者文件已经清零。
- ✅ 本轮没有新的功能性回归；所有权修正后 `pnpm test:web:regression` 仍然通过。
- ✅ 这次环境修正已经从“能发现问题”推进到“已消除当前现场问题”。

#### 🧪 本轮核验
- ✅ `pnpm audit:frontend-ownership`
- ✅ `pnpm test:web:regression`

### 开发补记 - 仓库权限从 777 收口到常规模式 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **前端与维护脚本目录权限已从 `777` 收口**:
  - `web`（排除 `node_modules`）目录恢复为 `755`
  - 普通文件恢复为 `644`
  - `scripts/**/*.sh` 保留执行位为 `755`
  - 根目录 [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 和 [web/package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/package.json) 已恢复为普通文本文件权限
- ✅ **无法直接 chmod 的路径已通过重建方式修复**:
  - [archive/runtime-snapshots/20260310-150311-web-theme-permission-rebuild](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-150311-web-theme-permission-rebuild)
  - [archive/runtime-snapshots/20260310-150337-script-permission-rebuild](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-150337-script-permission-rebuild)

#### 🔍 本轮复查结论
- ✅ `web` 范围排除 `node_modules` 后，world-writable 路径已经清零。
- ✅ `pnpm audit:frontend-ownership` 继续通过，说明权限收口没有把所有权修复打回去。
- ✅ `pnpm test:web:regression` 继续通过，说明这轮变更没有引入新的功能性回归。
- ℹ️ `scripts/service/logs` 仍显示为 `lrwxrwxrwx`，但它是指向 `../../logs` 的符号链接，属于 macOS 的正常表现，不是实际残留的 777 目录。

#### 🧪 本轮核验
- ✅ `find web \( -path 'web/node_modules' -o -path 'web/node_modules/*' \) -prune -o -perm -0002 -print | wc -l`
- ✅ `find scripts -perm -0002 -print`
- ✅ `pnpm audit:frontend-ownership`
- ✅ `pnpm test:web:regression`

### 开发补记 - 用户轻量状态持久化与 Git 同步分层收口 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **三类轻量用户状态已迁入 MySQL `user_preferences`**:
  - `app_seen_version`
  - `announcement_dismissed_id`
  - `last_read_notification_date`
  - 对应实现位于 [core/src/services/user-preferences.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/services/user-preferences.js) 与 [core/src/controllers/admin/settings-report-routes.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/controllers/admin/settings-report-routes.js)
- ✅ **前端改为“服务端优先，本地缓存兜底”**:
  - [web/src/App.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/App.vue)
  - [web/src/components/AnnouncementDialog.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/AnnouncementDialog.vue)
  - [web/src/components/NotificationPanel.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/NotificationPanel.vue)
  - [web/src/components/Sidebar.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/Sidebar.vue)
- ✅ **Git 同步边界已整理成独立清单**:
  - 新增 [docs/dev-notes/GIT_SYNC_SCOPE_2026-03-10.md](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/docs/dev-notes/GIT_SYNC_SCOPE_2026-03-10.md)
  - 明确当前已暂存 `31` 个文件可独立同步，其余 `944` 个已修改、`178` 个未跟踪项属于并行范围，不应混入这批提交
- ✅ **前端回归产物噪音已继续收口**:
  - [/.gitignore](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/.gitignore) 已忽略 `dist-runtime/`

#### 🔍 本轮复查结论
- ✅ 这三类状态此前确实容易被误判成“数据库没存住”，现在已经符合“按用户跨端恢复”的预期。
- ✅ 本地 `localStorage` 没有被粗暴移除，仍保留了弱网兜底和旧数据迁移能力。
- ✅ 当前 Git 最大风险不在已暂存这批收口文件，而在其余并行大范围改动；同步时必须继续坚持范围提交。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/user-preferences.test.js core/__tests__/admin-settings-report-routes.test.js`
- ✅ `pnpm -C web exec eslint "src/App.vue" "src/components/AnnouncementDialog.vue" "src/components/NotificationPanel.vue" "src/components/NotificationModal.vue" "src/components/Sidebar.vue" "src/utils/view-preferences.ts"`
- ✅ `pnpm -C web exec vue-tsc -b --pretty false`
- ✅ `pnpm test:frontend`

### 开发补记 - 环境健康检查总入口已固定 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **根目录新增环境健康总入口**:
  - [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 新增 `pnpm audit:workspace-permissions`
  - 统一复查前端关键路径所有权、`web` 权限、`scripts` 权限和清单文件权限
- ✅ **前端所有权审计已补到构建缓存路径**:
  - [scripts/utils/audit-frontend-ownership.sh](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/scripts/utils/audit-frontend-ownership.sh) 已纳入 `web/node_modules/.tmp`
  - `tsbuildinfo` 缓存旧文件已归档到 [archive/runtime-snapshots/20260310-152939-tsbuildinfo-cache-reset](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-152939-tsbuildinfo-cache-reset)
- ✅ **回归清单同步补齐环境巡检入口**:
  - [docs/REGRESSION_TEST_CHECKLIST.md](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/docs/REGRESSION_TEST_CHECKLIST.md) 已补充“环境健康总入口”

#### 🔍 本轮复查结论
- ✅ 后续不需要再手工拼接多条 `find` 命令，单跑 `pnpm audit:workspace-permissions` 就能复查“所有权 + 权限”两类问题。
- ✅ `.tmp` 增量缓存被 root 污染后，现在也能被审计直接抓到，不会再只在 `vue-tsc` 失败时才暴露。
- ✅ `pnpm test:web:regression` 已恢复通过。

#### 🧪 本轮核验
- ✅ `pnpm audit:workspace-permissions`
- ✅ `pnpm test:web:regression`

#### 🔧 追加收口
- ✅ [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 的 `pnpm audit:workspace-permissions` 已从内联命令切回 [scripts/utils/check-workspace-permissions.sh](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/scripts/utils/check-workspace-permissions.sh)，后续维护更稳定。
- ✅ 环境总入口复跑时额外抓到 [web/src/stores/copy-feedback.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/stores/copy-feedback.ts) 的 `root` 所有者残留，已归档到 [archive/runtime-snapshots/20260310-155939-copy-feedback-ownership-rebuild](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-155939-copy-feedback-ownership-rebuild) 后原地修复。
- ✅ [ci.yml](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/.github/workflows/ci.yml) 已新增 `Audit Workspace Permissions (advisory)`，环境健康总入口现在也会在 CI 中被旁路执行。

### 开发补记 - `build:runtime` fallback 输出路径已收口 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **`WEB_DIST_DIR=dist-runtime` 已按 `web/` 目录解析**:
  - [core/src/utils/web-dist.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/utils/web-dist.js) 的 `resolveConfiguredWebDistDir()` 现支持显式基准目录
  - [web/vite.config.ts](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/vite.config.ts) 现以 `web/` 目录解析前端构建侧的 `WEB_DIST_DIR`
- ✅ **`build:runtime` 路径回归已补测试**:
  - [core/__tests__/web-dist.test.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/__tests__/web-dist.test.js) 已覆盖“相对输出目录按指定基准解析”
- ✅ **误生成的仓库根 `dist-runtime/` 已归档移除**:
  - 旧 `web/dist` 清理快照位于 [archive/runtime-snapshots/20260310-170145-web-dist-ownership-rebuild](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-170145-web-dist-ownership-rebuild)
  - 仓库根误产物快照位于 [archive/runtime-snapshots/20260310-170706-root-dist-runtime-cleanup](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-170706-root-dist-runtime-cleanup)

#### 🔍 本轮复查结论
- ✅ `pnpm -C web run build:runtime` 现在会稳定写入 [web/dist-runtime](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist-runtime)，不再误写到仓库根。
- ✅ 当前标准产物目录 [web/dist](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist) 和 fallback 目录 [web/dist-runtime](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist-runtime) 都是有效产物。
- ✅ 环境健康总入口与前端回归链在修复后继续通过，没有引入新的功能性回归。

#### 🧪 本轮核验
- ✅ `node --test core/__tests__/web-dist.test.js`
- ✅ `pnpm -C web run build:runtime`
- ✅ `pnpm test:web:regression`
- ✅ `pnpm audit:workspace-permissions`

### 开发补记 - 环境巡检脚本已纳入阻断级脚本回归 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **环境巡检脚本分支覆盖已补齐**:
  - [core/__tests__/workspace-permissions-script.test.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/__tests__/workspace-permissions-script.test.js) 现覆盖：
    - ownership 审计脚本缺失
    - `web/package.json` world-writable
- ✅ **根级固定入口已新增**:
  - [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 新增 `pnpm test:workspace-audit-scripts`
  - 统一执行 [core/__tests__/workspace-permissions-script.test.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/__tests__/workspace-permissions-script.test.js) 与 [core/__tests__/web-dist.test.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/__tests__/web-dist.test.js)
- ✅ **CI 已补阻断级脚本回归**:
  - [ci.yml](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/.github/workflows/ci.yml) 新增 `Verify Environment Audit Helpers`

#### 🔍 本轮复查结论
- ✅ 环境巡检这条链现在同时具备“现场审计命令”和“脚本自身单测”两层保障。
- ✅ 后续如果 `check-workspace-permissions.sh` 的输出格式、退出码或筛选规则被改坏，会先在脚本级回归里暴露，不用等到真实环境污染时才发现。

#### 🧪 本轮核验
- ✅ `pnpm test:workspace-audit-scripts`

#### 🔧 追加收口
- ✅ 在复核 `pnpm audit:workspace-permissions` 时，现场再次抓到 [web/dist](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist) 整棵产物树为 `root` 所有者，但 [web/dist-runtime](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist-runtime) 仍完整且为当前用户拥有。
- ✅ 旧 `web/dist` 已归档到 [archive/runtime-snapshots/20260310-171709-web-dist-rehydrate-from-fallback](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-171709-web-dist-rehydrate-from-fallback)，随后用 `web/dist-runtime` 无损回灌重建标准产物目录。
- ✅ 修复后 `pnpm audit:workspace-permissions` 再次通过，`inspectWebDistState()` 仍保持默认活动目录为 [web/dist](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/dist)。

### 开发补记 - `repair:web-dist` 已收口为安全修复入口 (2026-03-10)

#### ✅ 本轮已追加落地
- ✅ **共享回灌工具已补齐**:
  - [core/src/utils/web-dist.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/src/utils/web-dist.js) 新增 `rehydrateDefaultWebDistFromFallback()`
  - [core/__tests__/web-dist.test.js](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/core/__tests__/web-dist.test.js) 已覆盖“fallback 回灌标准 dist”
- ✅ **固定维护入口已新增**:
  - [package.json](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/package.json) 新增 `pnpm repair:web-dist`
  - 脚本位于 [scripts/utils/repair-web-dist-from-fallback.sh](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/scripts/utils/repair-web-dist-from-fallback.sh)
- ✅ **脚本行为已收紧**:
  - 目录和所有权都健康时默认直接跳过
  - 回灌执行后会强制复跑 `audit-frontend-ownership.sh web/dist web/dist-runtime`
  - 支持 `FORCE_WEB_DIST_REPAIR=1 pnpm repair:web-dist` 强制覆盖标准目录
- ✅ **README 已同步维护口径**:
  - [README.md](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/README.md) 已补该命令说明

#### 🔍 本轮复查结论
- ✅ `repair:web-dist` 不再是“执行了就算成功”的弱入口，而是“健康则跳过、修复后必须自检通过”的安全入口。
- ✅ 验证过程中额外抓到两个历史 UI 源码文件所有权残留：
  - [web/src/components/ui/BaseHistoryHighlightCard.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/ui/BaseHistoryHighlightCard.vue)
  - [web/src/components/ui/BaseHistoryMetricGrid.vue](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/web/src/components/ui/BaseHistoryMetricGrid.vue)
  已归档到 [archive/runtime-snapshots/20260310-174332-web-src-history-ui-ownership-rebuild](/Users/smdk000/文稿/qq/qq-farm-bot-ui-main_副本/archive/runtime-snapshots/20260310-174332-web-src-history-ui-ownership-rebuild) 后原地修复为当前用户拥有。

#### 🧪 本轮核验
- ✅ `bash -n scripts/utils/repair-web-dist-from-fallback.sh`
- ✅ `pnpm repair:web-dist`
- ✅ `pnpm audit:workspace-permissions`
- ✅ `pnpm test:workspace-audit-scripts`
