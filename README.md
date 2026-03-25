# QQ 农场智能助手 - 多账号挂机 + Web 面板

> 🔴 **醒目提醒：现在扫码登录失效，等其他大佬修复，本仓库暂停更新功能，仅修复bug了。**基于 Node.js 的 QQ 农场自动化工具，支持多账号管理、Web 控制面板、实时日志与数据分析。

![版本](https://img.shields.io/badge/版本-v4.5.36-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![MySQL](https://img.shields.io/badge/MySQL-8.0-orange)
![Redis](https://img.shields.io/badge/Redis-6.0-red)
![License](https://img.shields.io/badge/License-ISC-yellow)

---



## 技术栈

### 后端技术

**核心框架**
- **运行时**: Node.js 20+ (推荐 Node.js 22+)
- **Web 框架**: Express 4.21.0
- **实时通信**: Socket.io 4.8.3
- **HTTP 客户端**: Axios 1.16.0

**数据库与存储**
- **主数据库**: MySQL 8.0 (mysql2 3.18.2)
- **缓存**: Redis (ioredis 5.10.0)
- **兼容依赖**: better-sqlite3 12.6.2（仅保留历史兼容代码，不再作为部署或账号持久化方案）
- **协议缓冲**: Protobuf.js 8.0.0 (腾讯 QQ 农场私有协议)

**日志与通知**
- **日志框架**: Winston 3.18.3
- **推送服务**: pushoo 0.1.11 (支持 Bark、Webhook 等)

**打包与部署**
- **打包工具**: pkg 5.8.1 (跨平台二进制打包)
- **支持平台**: Windows x64, Linux x64, macOS x64/arm64

[<img src="https://skillicons.dev/icons?i=nodejs" height="48" title="Node.js 20+" />](https://nodejs.org/)
[<img src="https://skillicons.dev/icons?i=express" height="48" title="Express 4" />](https://expressjs.com/)
[<img src="https://skillicons.dev/icons?i=socketio" height="48" title="Socket.io 4" />](https://socket.io/)
[<img src="https://skillicons.dev/icons?i=mysql" height="48" title="MySQL 8" />](https://www.mysql.com/)
[<img src="https://skillicons.dev/icons?i=redis" height="48" title="Redis" />](https://redis.io/)

### 前端技术

**核心框架**
- **框架**: Vue 3.5.28 (Composition API)
- **构建工具**: Vite 7.3.1
- **语言**: TypeScript 5.9.3
- **状态管理**: Pinia 3.0.4
- **路由**: Vue Router 5.0.3
- **HTTP 客户端**: Axios 1.13.5
- **WebSocket**: Socket.io-client 4.8.3
- **工具库**: @vueuse/core 14.2.1

**UI 与样式**
- **原子化 CSS**: UnoCSS 66.5.12
- **图标**: 
  - @iconify-json/carbon 1.2.18
  - @iconify-json/fa-solid 1.2.2
  - @iconify-json/svg-spinners 1.2.4
- **重置样式**: @unocss/reset 66.5.12

**开发与质量**
- **类型检查**: vue-tsc 3.2.5
- **代码规范**: 
  - ESLint 9.39.1
  - @antfu/eslint-config 7.4.3
  - eslint-plugin-format 1.4.0
- **可视化分析**: rollup-plugin-visualizer 7.0.0
- **压缩插件**: vite-plugin-compression 0.5.1

[<img src="https://skillicons.dev/icons?i=vue" height="48" title="Vue 3.5" />](https://vuejs.org/)
[<img src="https://skillicons.dev/icons?i=vite" height="48" title="Vite 7" />](https://vitejs.dev/)
[<img src="https://skillicons.dev/icons?i=ts" height="48" title="TypeScript 5" />](https://www.typescriptlang.org/)
[<img src="https://cdn.simpleicons.org/pinia/FFD859" height="48" title="Pinia 3" />](https://pinia.vuejs.org/)
[<img src="https://skillicons.dev/icons?i=unocss" height="48" title="UnoCSS" />](https://unocss.dev/)

### 部署与 DevOps

**容器化**
- **Docker**: Docker Compose v2+
- **多平台构建**: Docker Buildx (linux/amd64, linux/arm64)
- **镜像仓库**: 
  - Docker Hub: smdk000/qq-farm-bot-ui
  - GitHub Container Registry: ghcr.io/smdk000/qq-farm-ui-pro-max

**包管理**
- **包管理器**: pnpm 10.30.2
- **工作空间**: pnpm workspace

**CI/CD**
- **GitHub Actions**: 自动构建、测试、发布
- **自动发布**: GitHub Releases 自动上传二进制文件
- **镜像同步**: 自动推送到 Docker Hub 和 GHCR

[<img src="https://skillicons.dev/icons?i=docker" height="48" title="Docker" />](https://www.docker.com/)
[<img src="https://skillicons.dev/icons?i=pnpm" height="48" title="pnpm 10" />](https://pnpm.io/)
[<img src="https://skillicons.dev/icons?i=githubactions" height="48" title="GitHub Actions" />](https://github.com/features/actions)

---

## 功能特性

### 多账号与模式管理
- 账号新增、编辑、删除、启动、停止
- 提供三种核心运作模式：
  - **主号模式**：享有最高优先度和全部操作权限
  - **小号模式**：对高危操作免疫，执行自动的秒级防风控收获延迟（可自主调参）
  - **风险规避模式**：切断高危互动并基于历史封禁日志生成一键防御黑名单罩
- 扫码登录（支持 QQ 与 微信）与手动输入 Code
- 账号被踢下线自动删除
- 账号连续离线超时自动删除
- 账号离线推送通知（支持 Bark、自定义 Webhook 等）

### 自动化能力
- **农场管理**：收获、种植、浇水、除草、除虫、铲除、土地升级
- **仓库管理**：收获后自动出售果实
- **好友互动**：自动偷菜 / 帮忙 / 捣乱
- **任务系统**：自动检查并领取任务奖励
- **智能防护**：
  - 好友黑名单：跳过指定好友
  - 静默时段：指定时间段内不执行好友操作
  - 60 秒防偷抢收保护
  - 两季作物智能识别

### Web 面板
- 概览 / 农场 / 背包 / 好友 / 分析 / 账号 / 设置 / 帮助中心页面
- 实时日志，支持按账号、模块、事件、级别、关键词、时间范围筛选
- 深色 / 浅色主题切换
- 响应式设计，支持移动端访问

![Dashboard](assets/screenshots/screenshot-01.png)

### 分析页
支持按以下维度排序作物：
- 经验效率 / 普通肥经验效率
- 净利润效率 / 普通肥净利润效率
- 等级要求

![分析页面](assets/screenshots/screenshot-02.png)

### 帮助中心
- 新手入门指南
- 详细设置说明
- 高级功能教程
- 故障排查指南
- 配置模板推荐

![帮助中心](assets/screenshots/screenshot-03.png)

---

## 环境要求

### 源码运行
- **Node.js**: 20+ (推荐 Node.js 22+)
- **包管理器**: pnpm 10+ (推荐通过 `corepack enable` 启用)
- **可选数据库**: 
  - MySQL 8.0+ (生产环境推荐)
  - Redis 6.0+ (缓存加速，可选)

### 二进制发布版
- **无需安装 Node.js**
- 直接从 GitHub Releases 下载对应平台的可执行文件

### Docker 部署
- **Docker**: Docker Engine 20+
- **Docker Compose**: v2+
- **支持架构**: 
  - linux/amd64 (Intel/AMD 服务器)
  - linux/arm64 (树莓派/鲲鹏/飞腾/Apple Silicon)

---

## 快速启动

### 🚀 一键启动（推荐）

**Linux/macOS:**
```bash
./docker/start.sh
```

**ARM Mac 本地开发（一键编译 + 启动）：**
```bash
./dev.sh
```
脚本会自动关闭占用端口、编译前端、启动后端，适合改代码和测试。

**Windows:**
```cmd
docker\\start.bat
```

### 手动启动

#### Windows

```powershell
# 1. 安装 Node.js 20+（https://nodejs.org/）并启用 pnpm
node -v
corepack enable
pnpm -v

# 2. 安装依赖并构建前端
cd D:\Projects\qq-farm-bot-ui
pnpm install
pnpm build:web

# 3. 启动
pnpm dev:core

# （可选）设置管理密码后启动
$env:ADMIN_PASSWORD="你的强密码"
pnpm dev:core
```

#### Linux（Ubuntu/Debian）

```bash
# 1. 安装 Node.js 20+
sudo apt update && sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable

# 2. 安装依赖并构建前端
cd /path/to/qq-farm-bot-ui
pnpm install
pnpm build:web

# 3. 启动
pnpm dev:core

# （可选）设置管理密码后启动
ADMIN_PASSWORD='你的强密码' pnpm dev:core
```

启动后访问面板：
- 本机：`http://localhost:3000`
- 局域网：`http://<你的 IP>:3000`

![设置页面](assets/screenshots/screenshot-04.png)

---

# 🐳 Docker 部署完整指南（整合版）

部署文档入口：

- 海外 / 官方源服务器：[deploy/README.md](deploy/README.md)
- 国内网络服务器：[deploy/README.cn.md](deploy/README.cn.md)

发布前文档/公告自检（推荐）：

```bash
pnpm check:announcements
pnpm check:doc-links
```

> `check:announcements` 用于校验 `Update.log` / `CHANGELOG` 的标题、bullet 与文件完整性；`check:doc-links` 用于校验 README、部署文档与关键说明文件中的本地链接、图片引用和 NUL 字节问题。

## 🚀 场景 1：全新服务器完整部署

标准部署栈固定为 4 个服务：`主程序 + MySQL + Redis + ipad860`。后续版本主要更新主程序；MySQL、Redis、ipad860 默认复用已部署版本。
如果你的服务器在中国大陆网络环境，优先查看 [deploy/README.cn.md](deploy/README.cn.md)。

自 `v4.5.20` 起，部署目录固定带上两类修复脚本，并统一附带安装/更新/核验辅助脚本：

- `repair-mysql.sh`：修复旧 MySQL 结构、补齐缺失表/列并回填历史数据
- `repair-deploy.sh`：修复旧部署目录缺脚本、缺 `docker-compose.yml`、缺 `init-db`、缺 `/opt/qq-farm-current`（以及历史 `/opt/qq-farm-bot-current`）链接的问题

### 一键脚本

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-or-update.sh) --action install
```

脚本会自动完成这些事情：

- （可用时）执行公告预检：`check-announcements.js`（缺少 Node 或脚本时自动跳过，不阻断部署）
- 检查并安装 Docker / Docker Compose
- 检查端口占用并提示修改 `WEB_PORT`，非交互模式下会自动顺延到下一个可用端口
- 在 `/opt/YYYY_MM_DD/qq-farm` 创建部署目录，并自动维护 `/opt/qq-farm-current` 当前版本链接
- 下载 `docker-compose.yml`、`.env.example`、初始化 SQL、部署说明、一键部署/更新/修复/核验脚本
- 启动 `qq-farm-bot`、`mysql`、`redis`、`ipad860`
- 等待容器健康检查通过
- 主程序镜像按 `APP_IMAGE -> Docker Hub -> GHCR -> 本地缓存 -> 源码构建` 顺序回退
- 支持 `--image-archive /path/to/qq-farm-bot-images-<arch>.tar.gz` 或 `.env` 里的 `IMAGE_ARCHIVE=/path/to/...`
- 启动前会检查主程序镜像架构是否和宿主机一致，避免把 `arm64` 镜像误装到 `amd64` 服务器
- 启动完成后自动执行一次 `repair-mysql.sh`

常用无交互写法：

```bash
WEB_PORT=3080 ADMIN_PASSWORD='你的强密码' NON_INTERACTIVE=1 \
bash <(curl -fsSL https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-or-update.sh) --action install
```

弱网或离线首装示例：

```bash
IMAGE_ARCHIVE=/root/qq-farm-bot-images-amd64.tar.gz \
bash <(curl -fsSL https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-or-update.sh) --action install
```

如需固定镜像版本或覆盖仓库，可在 `.env` 中设置：

```bash
APP_IMAGE=smdk000/qq-farm-bot-ui:4.5.36
MYSQL_IMAGE=mysql:8.0
REDIS_IMAGE=redis:7-alpine
IPAD860_IMAGE=smdk000/ipad860:latest
```

### 手动分步骤部署

```bash
mkdir -p /opt/$(date +%Y_%m_%d)/qq-farm
cd /opt/$(date +%Y_%m_%d)/qq-farm

curl -fsSLO https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/deploy/docker-compose.yml
curl -fsSLo .env.example https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/deploy/.env.example
curl -fsSLo init-db/01-init.sql --create-dirs https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/deploy/init-db/01-init.sql
curl -fsSLo install-or-update.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-or-update.sh
curl -fsSLo update-app.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/update-app.sh
curl -fsSLo update-agent.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/update-agent.sh
curl -fsSLo install-update-agent-service.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-update-agent-service.sh
curl -fsSLo manual-config-wizard.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/manual-config-wizard.sh
curl -fsSLo repair-mysql.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/repair-mysql.sh
curl -fsSLo repair-deploy.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/repair-deploy.sh
curl -fsSLo stack-layout.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/stack-layout.sh
curl -fsSLo verify-stack.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/verify-stack.sh
curl -fsSLo fresh-install.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/fresh-install.sh
curl -fsSLo quick-deploy.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/quick-deploy.sh
chmod +x install-or-update.sh update-app.sh update-agent.sh install-update-agent-service.sh manual-config-wizard.sh repair-mysql.sh repair-deploy.sh stack-layout.sh verify-stack.sh fresh-install.sh quick-deploy.sh

# 按需修改端口、管理员密码、第三方扫码配置
cp .env.example .env
vi .env

bash install-or-update.sh --action install --non-interactive
```

## 🔄 场景 2：服务器已部署过，只更新主程序

该模式只更新 `qq-farm-bot` 容器，不会重启或替换 `MySQL / Redis / ipad860`，也不会清理数据卷。

### 一键更新脚本

```bash
/opt/qq-farm-current/install-or-update.sh --action update --preserve-current
```

### 手动分步骤更新

```bash
cd /opt/qq-farm-current
bash install-or-update.sh --action update --preserve-current

# 如需只更新主程序
bash update-app.sh

# 如需切到指定版本
bash update-app.sh --image smdk000/qq-farm-bot-ui:4.5.36

# 弱网 / 离线环境：先 docker load，再用离线镜像包更新
bash update-app.sh --image-archive /root/qq-farm-bot-images-amd64.tar.gz

# 只想单独修复旧 MySQL 结构
bash repair-mysql.sh --backup
```

补充说明：

- `deploy/init-db/01-init.sql` 只会在 MySQL 空数据卷首次启动时执行。
- `repair-mysql.sh` 会对旧数据库执行幂等修复，补齐缺失表/列、回填 `cards.days / used_at / expires_at`，可重复执行。
- `update-app.sh` 会在更新前尝试执行公告预检（检测到脚本与 Node 时执行）。
- `update-app.sh` 会先执行 `repair-mysql.sh`，再更新主程序镜像。
- `update-app.sh` 会同步部署目录里的 `docker-compose.yml`、`.env.example`、README 和修复脚本。
- `install-or-update.sh --action update --preserve-current` 会在更新前先备份当前部署目录。
- `update-app.sh` 会重新维护 `/opt/qq-farm-current` 链接，避免旧服 current 链接丢失。
- `update-app.sh` 同样会按 `APP_IMAGE -> Docker Hub -> GHCR -> 本地缓存 -> 源码构建` 回退，并在启动前做主程序镜像架构预检。

## 🩹 场景 3：旧服务器先修部署包，再升级

适用于这些情况：

- 部署目录里没有 `repair-mysql.sh` / `update-app.sh`
- `docker-compose.yml`、`init-db/01-init.sql`、`.env.example` 已经很旧
- `/opt/qq-farm-current` 丢失或指向错误目录

```bash
cd /opt/qq-farm-current 2>/dev/null || cd /opt/qq-farm-bot-current 2>/dev/null || cd /opt
curl -fsSLo repair-deploy.sh https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/repair-deploy.sh
chmod +x repair-deploy.sh
./repair-deploy.sh --backup
./install-or-update.sh --action update --preserve-current --non-interactive
```

## 📊 验证部署成功

```bash
# 检查 4 个容器状态
docker compose ps

# 查看主程序日志
docker compose logs -f qq-farm-bot

# 测试接口
curl http://localhost:3080/api/ping
```

### Release 离线包

从本版本开始，Release 与本地导出都会同时产出：

- `qq-farm-bot-images-amd64.tar.gz`
- `qq-farm-bot-images-arm64.tar.gz`
- `qq-farm-bot-v4.5.36-offline-amd64.tar.gz`
- `qq-farm-bot-v4.5.36-offline-arm64.tar.gz`

其中 `arm64` 离线包里的 `ipad860` 仍是 `linux/amd64`，目标宿主机需支持 QEMU。

访问地址：`http://服务器IP:3080`

- 默认用户名：`admin`
- 默认密码：见部署目录 `.env` 中的 `ADMIN_PASSWORD`

---

## 🏗️ Docker 多平台构建

### 构建并推送到 Docker Hub 和 GitHub

#### 1. 环境准备

```bash
# 检查 Docker 和 Buildx
docker --version
docker buildx version

# 登录 Docker Hub
docker login

# 登录 GitHub Container Registry
echo $GH_PAT | docker login ghcr.io -u smdk000 --password-stdin
```

#### 2. 构建多平台镜像

**使用脚本构建（推荐）**:
```bash
chmod +x scripts/docker/docker-build-multiarch.sh
./scripts/docker/docker-build-multiarch.sh --version 4.5.36
```

**手动构建**:
```bash
# 构建并推送到 Docker Hub
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t smdk000/qq-farm-bot-ui:4.5.36 \
  -t smdk000/qq-farm-bot-ui:latest \
  -f core/Dockerfile . \
  --push

# 构建并推送到 GitHub Container Registry
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/smdk000/qq-farm-ui-pro-max:4.5.36 \
  -t ghcr.io/smdk000/qq-farm-ui-pro-max:latest \
  -f core/Dockerfile . \
  --push
```

#### 3. 输出 GitHub Release 同款二进制与部署包

```bash
chmod +x scripts/release/build-release-assets.sh
./scripts/release/build-release-assets.sh --version v4.5.36

# 产物默认输出到 ./release-assets
ls release-assets
```

#### 4. 验证构建

```bash
# 查看镜像信息
docker buildx imagetools inspect smdk000/qq-farm-bot-ui:4.5.36

# Docker Hub 查看
# https://hub.docker.com/r/smdk000/qq-farm-bot-ui/tags

# GitHub Packages 查看
# https://github.com/users/smdk000/packages/container/package/qq-farm-ui-pro-max
```

---

## 🔄 版本升级

### 从旧版本升级

```bash
# 1. 进入现有部署目录
cd /opt/YYYY_MM_DD/qq-farm-bot

# 2. 先备份当前数据（推荐）
docker compose exec qq-farm-mysql sh -lc 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup-$(date +%Y%m%d).sql

# 3. 只更新主程序
./update-app.sh
```

---

## 🛡️ 数据保护

### 数据卷挂载说明

| 宿主机路径 | 容器内路径 | 说明 |
|-----------|-----------|------|
| `./data` | `/app/core/data` | **核心数据库**（账号配置、用户数据） |
| `./logs` | `/app/logs` | 日志文件（运行日志、操作日志） |
| `./backup` | `/app/core/backup` | 备份文件目录 |

### 备份策略

**定期备份**:
```bash
# 每天凌晨 2 点备份
0 2 * * * tar -czf /backup/farm-bot-$(date +\%Y\%m\%d).tar.gz ./data
```

**升级前备份**:
```bash
tar -czf farm-bot-backup-$(date +%Y%m%d).tar.gz ./data
```

**从备份恢复**:
```bash
tar -xzf farm-bot-backup-20260301.tar.gz -C ./data
```

### ⚠️ 重要提醒

- ❌ **不要删除** `./data` 目录，否则所有数据将丢失
- ❌ **不要手动修改** 数据库文件，可能导致数据损坏
- ✅ **定期备份** 数据到安全位置
- ✅ **升级前先备份**

---

## ⚠️ 常见错误与解决方案

### 错误 1: 镜像拉取失败 ❌

**错误信息**:
```
Error response from daemon: pull access denied
```

**原因**: 
- 使用了错误的镜像名称
- Docker Hub 账号未登录

**解决方案**:
```bash
# ✅ 正确的镜像名称
docker pull smdk000/qq-farm-bot-ui:latest

# ❌ 错误的镜像名称
docker pull qq-farm-bot-ui:latest  # 缺少用户名

# 如果需要登录
docker login
```

---

### 错误 2: 端口被占用 ❌

**错误信息**:
```
Error starting userland proxy: listen tcp 0.0.0.0:3080: bind: address already in use
```

**解决方案**:
```bash
# 检查端口占用
lsof -i :3080

# 使用不同端口
export WEB_PORT=3081
bash <(curl -fsSL https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-or-update.sh) --action install
```

---

### 错误 3: 权限错误 ❌

**错误信息**:
```
permission denied while trying to connect to the Docker daemon socket
```

**解决方案**:
```bash
# 使用 sudo
sudo bash <(curl -fsSL https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/install-or-update.sh) --action install

# 或将用户添加到 docker 组
sudo usermod -aG docker $USER
newgrp docker
```

---

## 📊 多平台支持

- ✅ **linux/amd64** - Intel/AMD x86_64 服务器
- ✅ **linux/arm64** - ARM64 服务器（树莓派 4B/鲲鹏/飞腾等）

Docker 会自动选择适合您系统架构的镜像版本。

---

## 📝 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ADMIN_PASSWORD` | 管理员密码 | `qq007qq008` |
| `TZ` | 时区 | `Asia/Shanghai` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `NODE_ENV` | 运行环境 | `production` |

### 端口映射

| 容器端口 | 宿主机端口 | 说明 |
|---------|-----------|------|
| 3000 | 3080 | Web 界面访问端口 |

---

## 📚 完整文档

- **GitHub 仓库**: https://github.com/smdk000/qq-farm-ui-pro-max
- **Docker Hub**: https://hub.docker.com/r/smdk000/qq-farm-bot-ui
- **GitHub Packages**: https://github.com/users/smdk000/packages/container/package/qq-farm-bot-ui
- **部署指南**: [deploy/README.md](deploy/README.md)
- **国内网络部署**: [deploy/README.cn.md](deploy/README.cn.md)
- **故障排查**: [docs/guides/TROUBLESHOOTING.md](docs/guides/TROUBLESHOOTING.md)
- **配置模板**: [docs/guides/CONFIG_TEMPLATES.md](docs/guides/CONFIG_TEMPLATES.md)

---

## 🆘 获取帮助

### 文档资源

- [README.md](https://github.com/smdk000/qq-farm-ui-pro-max) - 项目说明
- [DEPLOYMENT_FIX_REPORT.md](docs/archive/reports/DEPLOYMENT_FIX_REPORT.md) - 部署问题修复报告
- [DOCKER_BUILD_COMPLETE.md](docs/archive/reports/DOCKER_BUILD_COMPLETE.md) - Docker 构建完成总结

### 技术支持

- **GitHub Issues**: https://github.com/smdk000/qq-farm-ui-pro-max/issues
- **QQ 群**: 227916149
- **Docker Hub**: https://hub.docker.com/r/smdk000/qq-farm-bot-ui

---

## 程序截图

### 登录
支持多模式验证、Token安全保护、体验卡自助领取与一键全自动登录入驻。

![登录控制台1](assets/screenshots/login-01.png)
![登录控制台2](assets/screenshots/login-02.png)
![登录控制台3](assets/screenshots/login-03.png)

### 主题
内置多种玻璃态 (Glassmorphism) 梦幻色彩主题，全面适配深浅双模与性能自适应。

![主题切换1](assets/screenshots/theme-01.png)
![主题切换2](assets/screenshots/theme-02.png)
![主题切换3](assets/screenshots/theme-03.png)
![主题切换4](assets/screenshots/theme-04.png)
![主题切换5](assets/screenshots/theme-05.png)
![主题切换6](assets/screenshots/theme-06.png)
![主题切换7](assets/screenshots/theme-07.png)
![主题切换8](assets/screenshots/theme-08.png)
![主题切换9](assets/screenshots/theme-09.png)
![主题切换10](assets/screenshots/theme-10.png)

### 功能
全网独家挂载系统，支持好友队列并行与精准到秒的农作物防风控安全蹲守拦截。

![核心功能1](assets/screenshots/feature-01.png)
![核心功能2](assets/screenshots/feature-02.png)
![核心功能3](assets/screenshots/feature-03.png)
![核心功能4](assets/screenshots/feature-04.png)
![核心功能5](assets/screenshots/feature-05.png)
![核心功能6](assets/screenshots/feature-06.png)
![核心功能7](assets/screenshots/feature-07.png)
![核心功能8](assets/screenshots/feature-08.png)
![核心功能9](assets/screenshots/feature-09.png)
![核心功能10](assets/screenshots/feature-10.png)
![核心功能11](assets/screenshots/feature-11.png)
![核心功能12](assets/screenshots/feature-12.png)
![核心功能13](assets/screenshots/feature-13.png)
![核心功能14](assets/screenshots/feature-14.png)
![核心功能15](assets/screenshots/feature-15.png)
![核心功能16](assets/screenshots/feature-16.png)
![核心功能17](assets/screenshots/feature-17.png)

---

**维护者**: smdk000
**最后更新**: 2026-03-25
**版本**: v4.5.36

## 多用户模式

### 管理员操作

#### 1. 生成卡密
1. 登录管理员账号（默认：admin / admin）
2. 进入"卡密"页面
3. 点击"生成卡密"
4. 选择类型：天卡 (D) / 周卡 (W) / 月卡 (M) / 永久卡 (F)
5. 设置天数和数量
6. 生成并分发卡密

#### 2. 用户管理
1. 进入"用户"页面
2. 查看用户列表
3. 编辑用户（修改到期时间、启用/封禁）
4. 删除普通用户

![用户管理](assets/screenshots/screenshot-05.png)

### 普通用户操作

#### 注册账号
1. 在登录页面切换到"注册"标签
2. 输入用户名和密码
3. 输入卡密
4. 点击"注册并登录"

#### 账号续费
1. 登录后在 Dashboard 查看用户信息
2. 点击"续费"按钮
3. 输入新卡密
4. 确认续费

![卡密管理](assets/screenshots/screenshot-06.png)

---

## 偷菜过滤配置

### 设置步骤
1. 进入"设置"页面
2. 选择要配置的账号
3. 找到"偷菜过滤设置"
4. 启用偷菜过滤
5. 选择过滤模式：
   - **黑名单**：不偷选中的蔬菜
   - **白名单**：只偷选中的蔬菜
6. 勾选蔬菜 (支持一键全选、反选、清空)
7. 保存设置

### 好友过滤
1. 进入"设置"页面
2. 选择账号
3. 找到"偷好友过滤设置"
4. 启用好友过滤
5. 选择过滤模式
6. 勾选好友（支持一键全选、反选、清空）
7. 保存设置

![偷菜设置](assets/screenshots/screenshot-07.png)

---

## 二进制发布版（无需 Node.js）

### 下载预编译版本

**从 GitHub Releases 下载**:
访问 https://github.com/smdk000/qq-farm-ui-pro-max/releases 下载对应平台的可执行文件。

| 平台 | 文件名 |
|------|--------|
| Windows x64 | `qq-farm-bot-vX.Y.Z-windows-x64.zip` |
| Linux x64 | `qq-farm-bot-vX.Y.Z-linux-x64.tar.gz` |
| macOS Intel | `qq-farm-bot-vX.Y.Z-macos-x64.tar.gz` |
| macOS Apple Silicon | `qq-farm-bot-vX.Y.Z-macos-arm64.tar.gz` |
| 部署包 | `qq-farm-bot-vX.Y.Z-deploy.tar.gz` |

### 运行

**Windows**:
```cmd
# 先解压 zip，再双击 exe 文件或在终端执行
.\qq-farm-bot-win-x64.exe
```

**Linux / macOS**:
```bash
# 先解压 tar.gz，再赋予执行权限并运行
chmod +x ./qq-farm-bot-linux-x64
./qq-farm-bot-linux-x64
```

### 访问

启动后访问：`http://localhost:3000`

- **默认用户名**: `admin`
- **默认密码**: `admin`

### 数据存储

程序会在可执行文件同级目录自动创建 `data/` 并写入 `farm-bot.db` 数据库文件。

⚠️ **重要**: 不要删除 `data/` 目录，否则数据将丢失。

---

### 自行编译

如果您想从源码编译二进制版本：

```bash
# 1. 安装依赖
pnpm install

# 2. 构建前端
pnpm build:web

# 3. 打包二进制文件
pnpm package:release
```

- 前端静态资源默认输出到 `web/dist/`
- 若 `web/dist/` 不可写，构建会自动回退到 `web/dist-runtime/`
- 若要安全归档旧 `dist`、清理调试产物并重建标准目录，可执行 `pnpm maintain:web-dist`
- 若 `web/dist-runtime/` 已健康、但 `web/dist/` 被历史权限污染，可执行 `pnpm repair:web-dist`
  - 默认会先自检，只有目录或所有权异常时才真正回灌
  - 若确认需要强制覆盖标准目录，可执行 `FORCE_WEB_DIST_REPAIR=1 pnpm repair:web-dist`
- 二进制产物输出在 `core/dist/` 目录

---

## 登录与安全

- 面板首次访问需要登录
- 默认管理密码：`admin`
- **建议部署后立即修改为强密码**
- 支持 Token 认证机制
- 用户状态实时验证（封禁/过期自动踢出）

---

## 项目结构

```
qq-farm-bot-ui/
├── core/                  # 后端（Node.js 机器人引擎）
│   ├── src/
│   │   ├── config/        # 配置管理
│   │   ├── controllers/   # HTTP API
│   │   ├── database/      # 数据库迁移脚本
│   │   ├── gameConfig/    # 游戏静态数据
│   │   ├── models/        # 数据模型与持久化
│   │   ├── proto/         # Protobuf 协议定义
│   │   ├── runtime/       # 运行时引擎与 Worker 管理
│   │   └── services/      # 业务逻辑（农场、好友、任务等）
│   ├── data/              # 运行时数据（farm-bot.db）
│   └── client.js          # 主进程入口
├── web/                   # 前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── api/           # API 客户端
│   │   ├── components/    # Vue 组件
│   │   ├── stores/        # Pinia 状态管理
│   │   └── views/         # 页面视图
│   ├── dist/              # 默认前端构建产物
│   └── dist-runtime/      # 默认目录不可写时的回退构建产物
├── assets/screenshots/    # 截图资源
├── docs/                  # 详细文档
├── docker/                    # Docker 配置
├── pnpm-workspace.yaml
└── package.json
```

---

## 核心架构

### 运行时架构

```
┌─────────────────────────────────────────┐
│           主进程 (client.js)            │
│  ┌─────────────────────────────────┐    │
│  │   运行时引擎 (Runtime Engine)   │    │
│  │  ┌──────────┐  ┌──────────┐    │    │
│  │  │ Worker 1 │  │ Worker 2 │    │    │
│  │  │ (账号 1)  │  │ (账号 2)  │    │    │
│  │  └──────────┘  └──────────┘    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
           │                │
           ▼                ▼
    ┌─────────────┐  ┌─────────────┐
    │  Express    │  │  Socket.io  │
    │  HTTP Server│  │  WebSocket  │
    └─────────────┘  └─────────────┘
           │                │
           ▼                ▼
    ┌─────────────────────────────────┐
    │      Vue 3 Web 面板 (前端)       │
    └─────────────────────────────────┘
```

### 数据流

#### MySQL/Redis 架构（生产环境）
```
用户操作 → Web 面板 → HTTP API → DataProvider → Worker
                                           ↓
                                      游戏服务器
                                           ↓
                          ┌────────────────┴────────────────┐
                          ↓                                 ↓
                    MySQL 数据库                      Redis 缓存
                    (持久化存储)                    (热点数据/锁)
```

#### SQLite 架构（单机/离线模式）
> 以下内容仅用于历史版本迁移说明，当前版本不再作为正式部署方案。

```
用户操作 → Web 面板 → HTTP API → DataProvider → Worker
                                           ↓
                                      游戏服务器
                                           ↓
                                    SQLite 数据库
                                    (本地存储)
```

---

## 数据库架构

### 数据库架构演进

#### v3.8.0+ - MySQL/Redis 架构（生产环境推荐）
- **主数据库**: MySQL 8.0 - 存储用户、账号、配置、日志等核心数据
- **缓存层**: Redis 6.0+ - 高频数据缓存、分布式锁、Pub/Sub 通信
- **优势**: 
  - 高并发支持（多用户同时访问）
  - 数据持久化与备份
  - 分布式部署能力
  - 性能优化（Redis 缓存热点数据）

#### v3.7.x 及之前 - SQLite 架构（单机/离线模式）
- **本地数据库**: SQLite (better-sqlite3)
- **适用场景**: 
  - 单机部署
  - 离线模式
  - 轻量级使用
- **特性**: 
  - WAL 模式（预写日志）
  - 自动检查点合并
  - 忙等待超时保护

### 核心表结构（MySQL）

- **users** - 用户信息表
  - 用户名、密码（SHA256）、角色、创建时间、到期时间
  
- **cards** - 卡密表
  - 卡密代码、类型（D/W/M/F）、天数、使用状态、使用时间
  
- **accounts** - 账号配置表
  - 账号 ID、QID、密码（加密）、备注、所有者、创建时间
  
- **account_configs** - 账号配置表
  - 自动化开关、偷菜过滤、静默时段、蹲守设置等
  
- **operation_logs** - 操作日志表
  - 账号 ID、操作类型、时间戳、结果、耗时
  
- **config_audit_logs** - 配置审计日志
  - 配置变更历史、时间戳、操作者
  
- **friend_lists** - 好友列表缓存
  - 账号 ID、好友列表、更新时间
  
- **farm_data** - 农场数据缓存
  - 账号 ID、农田状态、作物信息、成熟时间

---

## 特别感谢

- 核心功能：[linguo2625469/qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot)
- 部分功能：[QianChenJun/qq-farm-bot](https://github.com/QianChenJun/qq-farm-bot)
- 扫码登录：[lkeme/QRLib](https://github.com/lkeme/QRLib)
- 推送通知：[imaegoo/pushoo](https://github.com/imaegoo/pushoo)
- 主体框架：[Penty-d/qq-farm-bot-ui](https://github.com/Penty-d/qq-farm-bot-ui)

---

## 常见问题

### Q1: 如何添加账号？
A: 登录管理面板后，进入"账号"页面，点击"添加账号"，支持扫码登录或手动输入 QID 和密码。

### Q1.1: 如何配置微信扫码登录？
A: **标准 Docker 部署**：`deploy/docker-compose.yml` 和 `scripts/deploy/fresh-install.sh` 已包含 ipad860 服务，主程序会自动使用 `IPAD860_URL=http://ipad860:8058`。**本地开发**：需单独启动 ipad860 服务，或在 `.env` 中设置 `IPAD860_URL` 指向已有 ipad860 实例。添加账号时选择「微信扫码」，页面会展示二维码，用微信扫码即可完成登录。

### Q2: 账号离线了怎么办？
A: 系统会自动检测账号离线状态，并发送推送通知（如果已配置）。可以手动重启账号或等待自动重连。

### Q3: 如何配置偷菜过滤？
A: 进入"设置"页面，选择账号后找到"偷菜过滤设置"，可以选择黑名单或白名单模式，并勾选相应的植物或好友。

### Q4: 数据库如何备份？
A: 源码模式默认数据库路径为 `core/data/farm-bot.db`。当前整理后的工作区已将物理入口统一到根目录 `data/`，因此本机直接备份 `data/farm-bot.db` 即可；兼容路径 `core/data/farm-bot.db` 仍然可用。系统会在迁移时自动创建备份到 `data/backup/` 目录。

### Q5: 如何查看日志？
A: 在 Dashboard 页面可以查看实时日志，支持按账号、模块、事件、级别等维度筛选。

---

## 开发指南

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动后端（监听模式）
pnpm dev:core

# 启动前端（热重载）
pnpm dev:web
```

### 构建发布

```bash
# 构建前端
pnpm build:web

# 构建二进制文件
pnpm package:release
```

---

## 更新日志

- 开发变更：[CHANGELOG.DEVELOPMENT.md](CHANGELOG.DEVELOPMENT.md)
- 部署与版本记录：[logs/development/Update.log](logs/development/Update.log)

---

## 免责声明

本项目仅供学习与研究用途。使用本工具可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

---

## 许可证

ISC License

---

## 联系方式

- GitHub Issues: [提交问题](https://github.com/your-repo/issues)
- 讨论区：[GitHub Discussions](https://github.com/your-repo/discussions)

---

## 🎉 最近更新

### v4.5.36 - 远程更新软链热修复与服务器安装兜底 (2026-03-25)
- ✅ 修复 `repair-deploy.sh` 与 `update-app.sh` 在 current 软链路径下可能把 `/opt/qq-farm-current` 回写成自指死链的问题，旧服务器修复/升级更稳。
- ✅ `update-agent.sh`、`install-update-agent-service.sh`、`repair-mysql.sh` 已统一按真实目录解析 current 链接，远程更新代理、修库和安装脚本不再吃软链路径的亏。
- ✅ 系统更新页 smoke 按钮状态与帮助中心本地状态恢复做了 review 修正；`core/package.json`、`web/package.json`、README、部署模板和默认镜像标签已统一抬升到 `v4.5.36`。

### v4.5.35 - 系统更新中心远程更新闭环与 smoke 自检 (2026-03-25)
- ✅ 系统更新中心现在会直接显示远程更新最短路径、准备度检查和最近一次 smoke 联动检查摘要，正式创建更新任务前更容易判断链路是否真的可用。
- ✅ 后端新增最近 smoke 报告回读能力，能把 `reports/system-update-smoke/*/SUMMARY.md` 的通过 / 提醒 / 失败计数、关键提示和报告路径回显到总览。
- ✅ Release deploy bundle 已补齐 `safe-update.sh` 与 `smoke-system-update-center.sh`；`core/package.json`、`web/package.json`、README、部署模板和默认镜像标签已统一抬升到 `v4.5.35`。

### v4.5.34 - 帮助中心偏好记忆与高频回访补强 (2026-03-25)
- ✅ 帮助中心快捷筛选现在会同步到 URL，并在文章直链复制时保留当前筛选视角，跨刷新和分享场景更稳。
- ✅ 新增“清空收藏 / 重置已读 / 空状态快捷操作”，筛选为空时可以直接回到全部、收藏当前文章或重置阅读记录。
- ✅ 基于本地阅读次数与最近打开时间生成“高频阅读”快捷入口，并支持一键重置偏好；`core/package.json`、`web/package.json`、README、部署模板和默认镜像标签已统一抬升到 `v4.5.34`。

### v4.5.33 - 帮助中心快捷筛选与空状态补强 (2026-03-25)
- ✅ 帮助中心新增“全部 / 收藏 / 未读 / 已读”快捷筛选，最近几版 Release 说明和排障文档可以按阅读状态快速切换。
- ✅ 导航区补齐筛选空状态提示，筛选结果为空时不再只有空白列表。
- ✅ `core/package.json`、`web/package.json`、README、部署模板和默认镜像标签已统一抬升到 `v4.5.33`，与本地当前最新代码再次对齐。

### v4.5.32 - 帮助中心阅读进度与近期 Release 可见性补强 (2026-03-25)
- ✅ 帮助中心新增最近阅读历史、分类完成度和文章已读标记，文档不再只是“能打开”，而是更适合持续回访和排障查阅。
- ✅ 最近几版 `v4.5.29`、`v4.5.30`、`v4.5.31` 的 GitHub Release、帮助中心 Release Notes 与运行态公告链路已复核可用。
- ✅ `core/package.json`、`web/package.json`、README、部署模板和默认镜像标签已统一抬升到 `v4.5.32`，对外显示版本与实际程序再次对齐。

### v4.5.31 - 近期优化汇总与更新公告链路补齐 (2026-03-25)
- ✅ 更新公告源 `logs/development/Update.log` 已补齐 `2026-03-17` 到 `2026-03-24` 的多轮版本记录，并新增本轮 `v4.5.31` 汇总公告，登录页和侧栏里的“更新公告”不再停留在 `2026-03-16`。
- ✅ `core/package.json`、`web/package.json`、README、部署模板和默认镜像标签已统一抬升到 `v4.5.31`，对外展示版本与实际程序版本重新对齐。
- ✅ 公告预检脚本新增 `CHANGELOG.md` 与 `Update.log` 的最新版本一致性校验，后续再发版时如果只改了其中一处，会在预检阶段直接报错提醒。
- ✅ 本轮同步汇总了最近多次优化方向，包括微信保守链路与休息保护、农场工具资源库接入、问题反馈与 SMTP 安全持久化、帮助中心体系化、好友风险画像、worker 侧 MySQL 懒初始化，以及一键更新脚本的重登录风险保护。

### v4.5.30 - 一键更新脚本重登录风险保护 (2026-03-24)
- ✅ 一键更新脚本现在会在停应用前先检查运行中的一次性登录账号；如果发现账号仍在线但只保存了 `code`、没有 `authTicket`，更新会默认拒绝继续，避免把账号重启成需要重新扫码 / 补码的状态。
- ✅ `install-or-update.sh`、`safe-update.sh` 和 `update-app.sh` 已统一支持 `--allow-relogin-risk`，只有在明确接受重登录代价时才会显式绕过这层保护。
- ✅ 运行态“重启后是否需要重新登录”的聚合判定已补到共享服务和测试里，和后台系统更新中台的风控口径保持一致。

### v4.5.29 - 账号 worker 侧 MySQL 懒初始化与好友风险画像修复 (2026-03-24)
- ✅ 修复 `standalone + thread` 模式下账号 worker 记录被动偷取事件时直接报“`MySQL 连接池未初始化`”的问题，好友风险画像链路现在会在 worker 首次使用时自动初始化 MySQL。
- ✅ 账号 worker 停止时会主动执行数据库清理；连接池也区分主进程和账号 worker 的默认规模，避免多账号并发时把主进程的大池配置原样复制到每个 worker。
- ✅ 新增 `friend-risk-service` 回归测试，覆盖 worker 首次调用只初始化一次连接池的行为，防止同类问题在后续版本里再次回归。

### v4.5.28 - 帮助中心数据模块入库与归档一致性修复 (2026-03-24)
- ✅ 帮助中心核心数据模块 `web/src/data/help-center.ts` 正式纳入版本控制，GitHub checkout、`git archive`、Docker 构建和服务器源码包现在都使用同一份帮助中心数据。
- ✅ 根目录 `.gitignore` 已显式放行这份文件，后续帮助中心数据更新不会再被 `data/` 规则静默吞掉。
- ✅ 版本默认值、部署模板和工作流默认版本统一更新到 `v4.5.28`，避免继续引用已知在干净归档中缺文件的 `v4.5.27`。

### v4.5.27 - 帮助中心发布链路修复 (2026-03-24)
- ✅ 修复 Docker / Release / 服务器源码构建缺少 `scripts/utils` 的问题，帮助中心接入 Release Notes 同步脚本后仍可正常构建镜像和离线包。
- ✅ 一键更新脚本在 Docker Hub / GHCR 不可用时，回退到本地源码构建也能继续完成 Web 构建与容器切换。
- ✅ 部署模板、默认镜像标签和工作流默认版本统一更新到 `v4.5.27`，后续发布不再误指向已知失败的 `v4.5.26`。

### v4.5.26 - 帮助中心体系化、首次密码初始化与好友风险洞察 (2026-03-24)
- ✅ 新增首次部署密码初始化链路，未初始化实例会直接跳到 `/init-password` 页面，管理员可在页面内设置首个密码并继续进入后台。
- ✅ 账号页新增抓包补码 / 重绑入口，支持预览后再提交，优先按账号 ID、OpenID、UIN 匹配现有账号，未命中时才新建账号并记录来源与操作者。
- ✅ 帮助中心重构为内容化文档中心，接入 Markdown 文档、提纲导航、版本亮点同步脚本、上下文帮助按钮与 Playwright 回归测试。
- ✅ 好友风险画像、偷取统计、特别关照名单与实验性重点偷取开关已经串到设置页、分析页和后端持久化模型。
- ✅ 农场工具本地资源库继续同步刷新，变异页、道具页、图片素材与相关数据都随本轮版本一并更新。

### v4.5.25 - 问题反馈链路与系统设置安全持久化 (2026-03-18)
- ✅ 新增面向用户的问题反馈弹窗和后端收件链路，反馈内容会自动附带当前页面、账号状态、前端错误、系统日志与运行态摘要，管理员可在设置页直接配置 SMTP 并发送测试邮件。
- ✅ 系统设置新增 `bugReportConfig` 持久化模型，SMTP 密码改为本地密钥加密保存；管理员读取配置时只会看到掩码态，空密码保存也不会误清除已配置密钥。
- ✅ 公共系统日志接口改成独立查询服务，普通用户账号可见范围和问题反馈日志摘录共用一套过滤逻辑，避免两条链路再次分叉。
- ✅ 设置页继续整合，问题反馈配置被纳入现有高级设置分区；前端补齐客户端错误缓冲、页面上下文采集和提交后的反馈编号回显。
- ✅ 农场工具变异页同步补齐 `mutation_calc.json` / `mutation_formula.json`，发布包内的本地资源库现在包含完整计算数据。

### v4.5.24 - 农场工具资源库接入与移动端工作台整理 (2026-03-18)
- ✅ 农场工具页改为清单驱动的本地资源库导航，新增快捷入口、图鉴分组、道具分类计数和默认回退逻辑，管理端可以直接切到对应静态页。
- ✅ `web/public/nc_local_version` 资源正式纳入版本控制，补齐变异计算器、商店道具页、图鉴素材与同步脚本，离线服务器也能直接使用完整工具页。
- ✅ 主工作台的移动端滚动、吸顶头部与安全区处理继续收口，避免小屏设备出现双滚动、内容截断或顶部回弹不稳定的问题。
- ✅ 账号切换后的 `wsError` 自动弹窗节流进一步修正，保存账号或刚切换账号时不会立刻被历史错误抢焦点。
- ✅ 农场工具同步脚本额外补齐了“原子覆盖写入 + 非 ASCII 资源 URL 编码”，历史 `root` 产物和 `/static/植物.ico` 这类资源不会再阻塞本地同步。

### v4.5.23 - 微信休息保护可视化与保守链路细化 (2026-03-17)
- ✅ 微信好友链路现在只有在连续多次 `GetAll` 自己可见 / 空结果 / 请求异常后才进入“休息一会”，并会区分“缓存回退”和“无缓存空结果”两种状态。
- ✅ 账号归属页、仪表盘与系统日志已补齐微信保护状态展示，可直接看到好友休息、农场休息、失败原因与剩余时长。
- ✅ `wx_car` / `wx_ipad` 在账号休息期间会暂停自家农场自动操作，同时好友、网络和日志文案统一改为更温和的“休息”表达。
- ✅ 好友补缓存链路继续加固：通知型补种现在会带上账号标识，`mergeFriendsCache` 改为延迟解析，避免测试或模块加载顺序影响运行。

### v4.5.22 - 微信好友保守链路与只读面板增强 (2026-03-17)
- ✅ 微信好友拉取新增静默保护、手动刷新穿透与缓存回退，减少接口不可用时的重复探测与误判。
- ✅ 好友页新增“手动刷新 / 访客补缓存”入口，账号离线时自动切换为只读缓存视图，避免误操作。
- ✅ 系统日志新增好友链路快捷筛选、摘要卡片和返回好友页的快捷入口，排障路径更短。
- ✅ 背包详情弹窗、账号状态接口与离线包导出默认版本继续收口，发布与运维体验更一致。

### v4.5.21 - QQ 风控守卫与设置体验统一优化 (2026-03-16)
- ✅ QQ 高风险自动化功能新增临时窗口与到期自动回退，默认不再长期暴露高风险开关。
- ✅ 账号封禁态识别继续收口，已封禁账号会被阻止启动、重启与批量误操作，后台批次启动也会自动跳过。
- ✅ QQ 好友拉取默认改为更保守的单链路模式，并提供可显式开启的多链路开关，减少额外探测面。
- ✅ 设置页、账号页、仪表盘、侧栏与确认弹窗继续统一整理，顶部吸附、平铺布局与低高度适配进一步完善。

### v4.5.20 - 发布链路统一与本地产物打包 (2026-03-11)
- ✅ 统一本地与远程发布流程，可一次性输出多平台可执行文件、部署压缩包和离线压缩包。
- ✅ 容器镜像推送链路完成收口，避免继续混用旧脚本和旧标签，发布口径更加稳定。
- ✅ 历史部署目录兼容进一步补齐，旧服升级时缺少软链接和脚本的问题可自动修复。

### v4.5.19 - 宿主机更新代理与部署统一入口 (2026-03-11)
- ✅ 一键安装与一键更新入口正式统一，在线部署、离线部署和发布资产全部改用同一套标准流程。
- ✅ 部署目录结构与当前版本链接口径统一，旧目录、旧链接和旧脚本可自动补齐与迁移。
- ✅ 宿主机更新代理能力落地，支持批次更新、失败重试、节点排空和进度核验。

### v4.5.18 - 发布链路与持久化收口 (2026-03-10)
- ✅ 一键部署、一键更新、部署修复和数据库修复脚本继续补强，旧环境可直接修复后再升级。
- ✅ 账号视图偏好、管理页状态和运行态配置的持久化能力继续完善，减少刷新后丢状态的问题。
- ✅ 访客链路、管理后台和错误处理进一步补齐，整体运行稳定性明显提升。

### v4.5.0 - 微信生态与公告中台重构 (2026-03-07)
- ✅ 微信好友拉取增加更稳妥的兼容降级方案，纯微信号和受限账号的好友同步能力显著增强。
- ✅ 系统公告从零散配置升级为独立管理模块，支持草稿、预览、权限控制和数据库存储。
- ✅ 偷菜过滤与策略控制继续细化，低价值作物与相关肥料的过滤逻辑更准确。

### v4.4.1 - 全局界面与排行榜重构 (2026-03-06)
- ✅ 排行榜改为真实运行数据驱动，在线账号优先展示，列表排序更加符合实际使用场景。
- ✅ 账号管理页、工具页和主题样式完成一轮细致修复，深色模式与主题一致性更好。
- ✅ 高并发连接、数据库排队和幽灵会话问题进一步治理，长时间运行更加稳定。

### v4.4.0 - 分布式流控与网关演进 (2026-03-06)
- ✅ 多节点调度能力升级，可按负载自动分发任务，减少热点节点堆积和资源倾斜。
- ✅ 连接保活与会话粘性机制完善，节点短时波动不再轻易导致账号掉线或重复分配。
- ✅ 网关与前端流控能力同步升级，为后续多节点扩容和跨机部署打下基础。

### v4.3.0 - 日志系统与架构优化 (2026-03-06)
- ✅ 日志读取与账号切换逻辑重构，旧日志串流、切号残留和高频排序卡顿问题得到解决。
- ✅ 好友拉取与登录通路继续补强，在线状态分级更细，掉线、异常和休眠状态更容易识别。
- ✅ 双架构部署与持久化能力进一步完善，运行数据、告警与挂机战报更适合长期保存。

### v4.2.0 - 监控与运维工具集 (2026-03-05)
- ✅ 访客探针与名称映射能力上线，偷菜、捣乱和异常访客可直接显示昵称，告警信息更直观。
- ✅ 图鉴推荐改为多维度策略推送，可按经验、利润和肥料收益自动给出更实用的种植建议。
- ✅ 运维脚本体系同步补齐，后台守护、快速启动、密码修复和环境排查更容易落地。

### v4.1.2 - 并发防抖与流程约束 (2026-03-04)
- ✅ 售卖、施肥和高频渲染全部加入更稳妥的防抖与限流策略，降低短时间密集操作带来的风控压力。
- ✅ 大批量施肥支持分段让流，优先把执行资源让给防偷和抢收，避免挂机过程出现长时间卡死。
- ✅ 工作流保存前会主动检查关键步骤缺失，防止因为配置不完整导致编排长期停滞。

### v4.1.1 - 健壮性修复 (2026-03-04)
- ✅ 管理员密码与鉴权流程完成收口，新环境不再依赖固定默认密码，安全性更高。
- ✅ 休眠期间若自家作物即将成熟，系统会强制唤醒并优先完成收割与翻种，减少资产损失。
- ✅ 施肥编排与全局工作流之间的抢占冲突得到修复，避免执行队列被意外锁死。

### v4.1.0 - 账号分级模式 (2026-03-04)
- ✅ 新增主号、小号和风险规避三种运行模式，不同账号可按风险等级使用不同策略。
- ✅ 全站防封时间与检测间隔被统一收口到设置面板，可在线调整并即时生效。
- ✅ 好友选择、黑白名单和登录交互完成一轮体验优化，大批量账号管理更高效。

### v4.0.1 - 核心体验重构与稳定性维护 (2026-03-04)
- ✅ 首页升级为系统调度看板，可直接查看运行状态、线程分布和下次唤醒时间。
- ✅ 社交与管理面板改为更清晰的卡片化布局，内容承载能力和检索效率明显提高。
- ✅ 路由白屏、登录竞态和连接生命周期等历史遗留问题完成集中修复。

### v3.8.5 - 反检测网络延时微调 (2026-03-02)
- ✅ 仓库、礼包、商城等连续操作的等待时间调整为更自然的随机区间，整体行为更接近人工操作。
- ✅ 在不影响使用体感的前提下，进一步降低高频连续请求带来的风险。

### v3.8.4 - 第三方接口密钥集中管理 (2026-03-02)
- ✅ 第三方扫码与相关接口密钥改为后台集中配置，不再依赖写死在代码中的固定参数。
- ✅ 配置修改支持即时生效，跨服务器迁移、失效换绑和日常维护都更方便。

### v3.8.3 - 架构隐患终局堵漏 (2026-03-02)
- ✅ 大批量账号启动改为分批平滑下发，避免一次性解析大量数据把主线程拖入阻塞。
- ✅ 风控休眠状态改为写入数据库持久保存，即使重启服务也不会丢失冷却时间。
- ✅ 高并发场景下的底层稳定性进一步补强，为后续大规模挂机奠定基础。

### v3.7.0 - 蹲守偷菜架构实现 (2026-03-02)
- ✅ 新增精准蹲守能力，可自定义防风控延迟时间，并提前分析未来数小时的成熟时刻表。
- ✅ 蹲守逻辑与常规巡检逻辑实现并行运行，到点抢收互不阻塞，命中率更稳定。

### v3.6.0 - 极速挂载与端云同步架构 (2026-03-01)
- ✅ **Asset Chunking 极速拉起**: 为弹窗级组件启用异步加载墙，首屏秒开。
- ✅ **防抖端云追踪**: 解决切设备导致主题与性能模式重置覆盖的问题。

### v3.5.2 - UI 重构防锁死安全加固 (2026-03-01)
- ✅ **API密钥脱敏**: 采用 `.env` 全面接管并提取隔离所有第三方轮询通讯中的敏感配置。

### v3.4.0 - UI 架构大重构与体验版放发 (2026-03-01)
- ✅ 本地界面新增“免费领取体验卡”逻辑及自动补全交互支持。
- ✅ 提取全局挂载的高级换肤抽屉，并加入偷菜参数高级选择视窗。

### v3.3.3 - 回归修复：深色模式兼容性与性能模式覆盖遗漏 (2026-03-01)

**修复内容：**
- ✅ 修复 `HelpCenter.vue` 独立重定义 `backdrop-filter`，不受性能模式管控
- ✅ 修复 `Friends.vue` Scoped CSS 中 `.dark` 选择器无法匹配 `<html>` 祖先
- ✅ 修复 `NotificationModal.vue` 底部动作条样式被意外修改

**涉及文件：** `HelpCenter.vue` / `Friends.vue` / `NotificationModal.vue`

---

### v3.3.2 - Chrome 闪烁修复与性能模式全面增强 (2026-03-01)

**闪烁根因修复：**
- ✅ 移除 `glass-panel` 的 `will-change`，改用 `contain: layout style paint`
- ✅ 降低 `mesh-orb` 光球模糊值 `blur(80px)` → `blur(60px)` + `opacity: 0.4`
- ✅ 降低 `HelpButton` 脉冲动画频率 `2s` → `4s` + 悬停暂停

**性能模式全面增强：**
- ✅ 追加全局 `animation-duration: 0s !important` + `transition-duration: 0s !important`
- ✅ 追加 `will-change: auto !important` + `contain: none !important` 强制重置
- ✅ 覆盖 `*` / `*::before` / `*::after` 所有伪元素

**涉及文件：** `style.css` / `HelpButton.vue`

---

### v3.3.1 - 好友列表按钮统一与公告弹窗品牌增强 (2026-03-01)

**好友列表按钮 UI 统一：**
- ✅ 引入 `op-btn` 基础类 + 6 种颜色变体（偷取 - 蓝/浇水 - 青/除草 - 绿/除虫 - 橙/捣乱 - 红/黑名单 - 灰）
- ✅ 修复「除草」按钮与其他按钮形状不一致的问题
- ✅ 修复「加入黑名单」按钮深色模式下可读性差的问题

**公告弹窗品牌信息：**
- ✅ 在「更新公告」弹窗底部注入作者防伪水印（Author: smdk000 | QQ 群:227916149）

**涉及文件：** `Friends.vue` / `NotificationModal.vue` / `BaseSwitch.vue` / `Settings.vue`

---

### v3.3.0 - 自动控制功能提示与推荐建议系统 (2026-03-01)

- ✅ `BaseSwitch.vue` 新增 `hint`/`recommend` prop + CSS Tooltip 气泡（零依赖）
- ✅ `Settings.vue` 全部 18 个开关添加功能解释 + 推荐建议标签
- ✅ 推荐标签三色区分：绿 (开) / 红 (关) / 橙 (视情况)

**涉及文件：** `BaseSwitch.vue` / `Settings.vue`

---

### v3.2.9 - 令牌桶进阶优化：紧急通道 & 冗余 Sleep 清理 (2026-03-01)

**防偷抢收紧急通道 (P0)：**
- ✅ 新增 `sendMsgAsyncUrgent` 紧急通道（队头插入），防偷不再被好友巡查长队列阻塞
- ✅ `farm.js` 新增 `getAllLandsUrgent` / `fertilizeUrgent` / `harvestUrgent` 紧急版 API
- ✅ `antiStealHarvest` 全部改用紧急通道

**冗余 Sleep 清理 (P1)：**
- ✅ 移除 `farm.js` 中 2 处 + `friend.js` 中 5 处冗余 sleep（共 7 处）
- ✅ 保留 3 处经验值检测 sleep（业务逻辑等待）

**队列深度监控 (P2)：**
- ✅ 排队超过 5 帧时自动打印警告日志

**涉及文件：** `network.js` / `farm.js` / `friend.js`

---

### v3.2.8 - 性能优化：SQLite 防争用 & WebSocket 3QPS 令牌桶限流 (2026-02-28)

**SQLite 防争用增强：**
- ✅ 追加 `busy_timeout = 5000`：并发写入遇锁时自旋最多 5 秒，避免直接抛 `SQLITE_BUSY`
- ✅ 追加 `wal_autocheckpoint = 1000`：每累积 1000 页自动合并 WAL，防止 `.db-wal` 膨胀

**WebSocket 令牌桶限流器：**
- ✅ 在 `sendMsgAsync` 前注入 Token Bucket 异步排队网关
- ✅ 所有业务请求强制以 **3 QPS（每帧 ≥ 334ms）** 匀速发出
- ✅ 心跳同步 `sendMsg` 不受限流影响

**涉及文件：** `database.js` / `network.js`

---

## 🎉 历史版本功能（v3.2.5）

### 底层与存储基建 (v3.2.5)
- ✅ 数据库原生支持版本迁移架构
- ✅ 引入轻量级 Cron 自动化释放老旧日志，降低 SQLite 读写耗时
- ✅ 前端列表操作状态按需记忆并启用防抖
- ✅ 配置非范式 JSON 弹性扩容化

### 多用户系统
- ✅ 用户注册/登录
- ✅ 卡密管理系统（天卡/周卡/月卡/永久卡）
- ✅ 用户权限控制（管理员/普通用户）
- ✅ 账号续费功能
- ✅ 用户状态管理（正常/封禁/过期）

### 偷菜过滤增强
- ✅ 植物黑名单/白名单
- ✅ 好友黑名单/白名单
- ✅ 可视化多选界面
- ✅ 实时配置保存

### 智能自动化
- ✅ 自动同意好友请求
- ✅ 60 秒防偷与抢收保护
- ✅ 两季作物智能识别（不误铲第二季）
- ✅ 自动领取任务奖励

### 界面优化
- ✅ 玻璃态UI (Glassmorphism) 全站渲染重构，提供完美沉浸感
- ✅ GPU 硬件加速的流动网格渐变背景（流畅降耗无闪白）
- ✅ 全新左下角响应式主题设置侧拉抽屉 
- ✅ 5 大高定系统变色主题（御农翠绿、赛博紫、黯金黄、深海蓝、猛男粉）
- ✅ UI/UX 文字全对比度校准，白天与深色模式自适应修正
- ✅ 修复跨页面/菜单跳转时颜色配置重置失效的深层数据同步缺陷
- ✅ 修复全站毛玻璃渲染动画闪烁并增加系统性能极简自适应机制
- ✅ 全新登录/注册页面
- ✅ 用户信息卡片
- ✅ 用户管理页面
- ✅ 卡密管理页面
- ✅ 帮助中心系统
