# 故障排查

当你觉得“功能没生效”时，先不要急着改设置，建议按照这条顺序排查。

## 第一步：看账号状态

先去“账号”页面确认：

- 是在线、启动中、离线还是封禁
- 当前是否真的已经启动
- 是否存在明显的 `wsError` 或异常状态

## 第二步：看概览

在“概览”里看最近日志和任务状态，确认问题属于哪一类：

- 没启动
- 启动了但没执行
- 执行了但结果不符合预期

## 第三步：看系统日志

管理员优先查“系统日志”，尤其是这些情况：

- QQ 高风险项被自动回退
- 好友链路失败
- 缓存回退
- 任务失败
- 刷新失败

## 好友列表为空怎么办

优先检查：

1. 当前平台是 QQ 还是微信
2. 是否命中了保守链路回退
3. 是否误开或误关了 `qqFriendFetchMultiChain`
4. 系统日志里有没有好友抓取错误

补充说明：

- `wx_car` / `wx_ipad` 这类微信扫码方式主要影响登录与续签链路，本身不再等于“永久关闭自动偷菜”。
- 如果日志里提示微信好友链路回退缓存、只返回自己或进入冷却，说明当前暂停的是“这一轮互动”，不是整个平台被永久禁用。
- 如果账号处于保护窗口，微信自家农场自动操作也会暂时休息，等窗口结束后再恢复。

## 设置保存了但没效果怎么办

优先检查：

- 当前操作的是不是正确账号
- 是否保存到了当前分类下的正确模块
- 是否有 QQ 风险守卫把开关回退了
- 是否需要重启当前账号后才能观察到明显变化

如果是微信账号，再额外确认：

- 概览或账号页里是否显示“好友链路冷却中”
- 当前是否只命中了好友链路保护，而不是设置保存失败
- 是否处于保护窗口，导致本轮农场或好友互动被临时暂停

## 部署环境怎么快速巡检

```bash
docker compose ps
docker compose logs -f qq-farm-bot
curl http://localhost:3080/api/ping
```

## 部署脚本缺失怎么办

```bash
cd /opt/qq-farm-current 2>/dev/null || cd /opt/qq-farm-bot-current 2>/dev/null || cd /opt
curl -fsSLo repair-deploy.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/repair-deploy.sh
chmod +x repair-deploy.sh
./repair-deploy.sh --backup
```

## 数据库结构异常怎么办

```bash
cd /opt/qq-farm-current
bash repair-mysql.sh --backup
```

## 前端构建或文档改动后如何自检

```bash
pnpm -C web build
pnpm check:doc-links
```

## 仍然无法定位问题时

建议把信息按这 4 项整理后再继续排查：

1. 哪个页面或功能异常
2. 当前账号模式与平台
3. 最近一次操作时间
4. 概览 / 系统日志里的核心报错
