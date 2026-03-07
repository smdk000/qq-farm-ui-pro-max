# 农场简易后台守护脚本 (`farm-bot.sh`) 详细指南

这是一个最简单的守护进程实现方式。如果您不想配置复杂的 systemd 或 PM2，可以使用这个轻量级脚本。

它是基于 bash 的 `nohup ... &` 实现的后台运行机制，并将程序的进程 ID (PID) 记录到 `.farm-bot.pid` 文件中以避免重复启动。

## 支持的命令

您可以将这几个命令想象成本地服务的遥控器：

1. **启动服务**
   ```bash
   ./farm-bot.sh start
   ```
   *会将被启动程序的输出重定向到 `logs/daemon.log`，并将应用静默切入后台。*

2. **停止服务**
   ```bash
   ./farm-bot.sh stop
   ```
   *会自动根据 PID 优雅地终止正在后台运行的 Node 服务。*

3. **重启服务**
   ```bash
   ./farm-bot.sh restart
   ```
   *实质上就是依次执行 stop 然后执行 start。*

4. **查看状态**
   ```bash
   ./farm-bot.sh status
   ```
   *通过探测 `kill -0` 来验证进程是否依然存活。*

## 常见问题

**Q: 为什么我启动了但是无法访问控制台？**
A: 请使用 `cat logs/daemon.log` 查看日志，看看是否是端口冲突 (`Port 3000 is already in use`) 或 MySQL 连接不上导致的崩溃。

**Q: `Uncaught TypeError: process.exit is not a function`？**
A: 此脚本当作轻量级开发测试时非常有用，但没有崩溃重启机制。如需高可用性，建议使用 `pm2` 或 `systemd`。(请运行 `./choose-background-method.sh`)
