# QQ 农场 Bot 后台运行方案指南

由于项目包含需要在后台持续运行定时任务的 Node 服务，我们提供了多种开箱即用的后台运行方案。

请在项目根目录执行：
```bash
./choose-background-method.sh
```

此向导脚本会自动询问并指导您使用以下任一方案：

## 1. 简易守护脚本 (推荐本地或轻量使用)

最纯粹的 Bash 守护方式，**无需额外安装任何软件**。日志保存在 `logs/daemon.log`。
后台本质上使用的是 `nohup` 机制，适合大多数轻度运行环境。

直接手动控制也行：
*   启动：`./farm-bot.sh start`
*   停止：`./farm-bot.sh stop`
*   重启：`./farm-bot.sh restart`
*   状态：`./farm-bot.sh status`

## 2. PM2 (Node.js 项目推荐)

专业、强大的 Node 进程管理器。支持内存上限控制、负载均衡、崩溃自启动。

直接一键安装并配置：
```bash
./install-pm2.sh
```
该脚本会自动帮你安装 pm2 全局环境，执行工程，并设置开机自启动。

## 3. Systemd (Linux 服务器首选)

作为 Linux 系统级的服务来运行，稳定性最高。必须使用 root (`sudo`) 执行。

一键安装服务：
```bash
sudo ./install-systemd-service.sh
```
该脚本会自动创建系统服务文件、重新加载守护程序并设置开机自启。

## 4. Screen 终端会话

如果你不想配一堆复杂的设置，仅仅是想在 SSH 断开后程序不挂掉：
```bash
./start-with-screen.sh
```

这会在后台开一个名为 `qqfarm` 的虚拟终端。
*   进去看日志：`screen -r qqfarm`
*   退出终端但不杀程序：依次按下 `Ctrl + A` 然后按 `d`。
