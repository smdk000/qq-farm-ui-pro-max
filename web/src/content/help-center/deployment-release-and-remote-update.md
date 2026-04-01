# 从本地发版到服务器远程更新

这篇只讲一条最短主线：本地代码改完后，怎样把新版本发出去，再让服务器通过“系统更新中心”完成远程更新。

如果你只关心服务器上的更新与回滚命令，看 [更新、修复与回滚](/help?article=deployment-update-and-recovery&audience=admin)。

如果你主要关心后台里怎么点、怎么看任务，看 [系统更新中心与集群更新](/help?article=system-update-center&audience=admin)。

## 先记住一个前提

远程更新只会读取已经发布到版本源的版本。

- 本地电脑里还没 `git push` 的代码，服务器看不到
- 镜像还没推到镜像仓库，服务器也拉不到
- GitHub Release 或自定义 Release API 还没出现新版本，更新中心就不会提示可升级

## 最短发布清单

### 1. 本地先把版本号和更新记录整理好

- 更新 `core/package.json` 的版本号
- 更新 `CHANGELOG.DEVELOPMENT.md`
- 至少跑一轮最小检查

```bash
cd /path/to/qq-farm-ui-pro-max
pnpm install --frozen-lockfile
pnpm -C web exec vue-tsc --noEmit
pnpm build:web
```

### 2. 把源码推到远端

```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git push origin main
```

### 3. 把新版本真正发布出去

如果你的更新中心版本源依赖 GitHub Release / tag，最短做法是：

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

如果你是手工推 Docker 镜像，也可以直接使用仓库内置脚本：

```bash
docker login
bash scripts/deploy/auto-update-docker.sh --version vX.Y.Z --with-ghcr --with-release-assets
```

只要保证“系统更新中心”配置的版本源已经能读到这个版本，就可以继续下一步。

如果你希望本地发完镜像后顺手滚动多台服务器，也可以继续执行：

```bash
export QQ_FARM_PRIMARY_PASSWORD='***'
export QQ_FARM_CLUSTER_PASSWORD='***'

bash scripts/deploy/publish-and-rollout.sh --version vX.Y.Z --with-ghcr \
  --target "10.31.1.254|root|QQ_FARM_PRIMARY_PASSWORD|update|qq-farm|/opt/qq-farm-current|" \
  --target "10.31.2.242|smdk000|QQ_FARM_CLUSTER_PASSWORD|update|qq-farm-2400|/opt/qq-farm-2400-current|" \
  --target "10.31.2.242|smdk000|QQ_FARM_CLUSTER_PASSWORD|update|qq-farm-2500|/opt/qq-farm-2500-current|" \
  --target "10.31.2.242|smdk000|QQ_FARM_CLUSTER_PASSWORD|update|qq-farm-2600|/opt/qq-farm-2600-current|"
```

## 服务器第一次要准备什么

### 刷新部署脚本

如果服务器比较旧，或者你不确定脚本是不是最新，先修一次部署骨架：

```bash
cd /opt/qq-farm-current
bash repair-deploy.sh --backup
```

### 安装更新代理常驻服务

```bash
cd /opt/qq-farm-current
bash install-update-agent-service.sh
systemctl status qq-farm-update-agent
```

如果服务不在线，后台可以看到更新中心页面，但真正的远程更新任务不会在宿主机上执行。

## 正式更新前建议先跑一次 smoke

```bash
cd /opt/qq-farm-current
bash smoke-system-update-center.sh \
  --username admin \
  --password '你的管理员密码' \
  --deploy-dir /opt/qq-farm-current
```

这条检查默认不会创建更新任务，也不会真的更新，只是先确认：

- 登录和管理员鉴权正常
- 更新中心能检查到新版本
- 公告同步 dry-run 正常
- 独立 preflight 正常
- 最近任务详情和回滚候选能读取
- `verify-stack.sh` 能正常跑

如果宿主机没有安装 `node`，新版本的 smoke 脚本会自动回退到应用容器里的 `node`，所以生产机不需要为了这条检查额外安装一套 Node.js；但 Docker 和主程序容器需要已经处于可用状态。

## 后台远程更新怎么操作

进入“设置 -> 高级设置 -> 系统更新中心”，按下面顺序走：

1. 先点“检查更新”，确认最新版本已经出现。
2. 需要的话先点“同步公告”，让公告和版本说明同步。
3. 点“执行预检”，先看镜像可达、磁盘空间、数据库健康和代理在线状态。
4. 预检通过后，再创建更新任务。
5. 单机一般选 `app`，多节点再考虑 `worker` 或 `cluster`。
6. 任务开始后看阶段日志、verify 结果和最终状态。
7. 如果失败且存在回退信息，优先在任务卡片里创建回滚任务。

## 更新完成后怎么验收

后台看完任务状态后，宿主机最好再跑一次核验：

```bash
cd /opt/qq-farm-current
bash verify-stack.sh
```

建议至少确认：

- 后台“当前版本”已经变化
- 主程序容器健康
- 公告和版本说明已同步
- 关键账号没有异常下线

## 兜底命令

如果后台远程更新临时不可用，仍然可以 SSH 到服务器手工更新：

```bash
cd /opt/qq-farm-current
bash safe-update.sh
```

或者直接更新主程序：

```bash
cd /opt/qq-farm-current
bash update-app.sh
```

这两条是兜底入口，不会替代更新中心里的任务记录、阶段日志和回滚关联。
