# QQ 农场 Bot 快速启动指南

本文档将引导您快速启动和配置 QQ 农场 Bot。

## 一键环境检测与启动

我们提供了一个一键式启动检测脚本，自动帮您检查 MySQL, Redis, Node.js 等环境。

1. 在终端中，进入项目根目录：
   ```bash
   cd /path/to/qq-farm-bot-ui
   ```

2. 运行快速启动向导：
   ```bash
   ./quick-start.sh
   ```

该脚本将检查所有必要依赖。如果所有环境正确无误，按回车即可一键启动后端服务和前端。

## 如果遇到依赖缺失

*   **Node.js**: 请去 [Node.js 官网](https://nodejs.org/) 下载安装 18 以上版本。
*   **pnpm**: 运行 `npm install -g pnpm`。
*   **MySQL**: 如果提示 MySQL 密码错误，请尝试运行 `./fix-mysql-password.sh` 来一键尝试修复密码为 `123456`。
*   **Redis**: 确保已安装并启动 redis-server。

## 获取帮助

在根目录下运行：
```bash
./help.sh
```
这会显示包括后台运行方案、常见问题在内的实用小帮助。
