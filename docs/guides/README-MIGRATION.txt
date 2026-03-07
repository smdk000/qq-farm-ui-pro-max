# 部署方式演进通知 (Deprecation Notice)

自 `v4.3.0` 版本起，系统正式升级为 **分布式 Master-Worker 架构**。
为了消除新老用户的运维认知混淆，并为后续的大规模高并发（千号级）提供物理隔离基础，项目组决定**全面推荐并转向基于 Docker / Docker-Compose 的容器化部署方案**。

## ⚠️ 变更说明 (Changes)
曾经存放于项目根目录的裸机部署与守护进程脚本（如：`quick-start.sh`，`farm-bot.sh`，`install-pm2.sh`，`install-systemd-service.sh` 等），现已全部归档迁移至 `docs/legacy_scripts/` 目录下。

这些脚本**已不再被官方推荐作为首选启动方式**。继续在裸机环境混杂使用这些脚本与新的容器化环境可能会导致 3000 / 3306 等端口产生严重的抢占隔离问题。

## 🐳 新版推荐启动方式 (Recommended)
请确保您的服务器已安装 Docker 与 Docker-Compose，并在项目根目录直接执行：

```bash
# 1. 默认启动单机版（含 MySQL 底座）
docker-compose up -d

# 2. 横向扩容启动分布式挂机集群 (例如启动 3 个 worker 节点分担压力)
docker-compose up -d --scale farm-worker=3
```

如果您非常清楚自己在做什么（例如二次开发调试），可以继续使用根目录保留的 `dev.sh` 脚本或进入 `docs/legacy_scripts` 寻回旧版。
