# QQ 农场智能助手 - 部署说明

本部署包对应当前标准运行栈：

- `qq-farm-bot`：主程序
- `qq-farm-mysql`：MySQL 8.0
- `qq-farm-redis`：Redis 7
- `qq-farm-ipad860`：微信扫码协议服务

后续版本迭代默认只更新主程序，MySQL / Redis / ipad860 复用现有部署。

## 环境要求

- Docker 24+
- Docker Compose v2+
- 推荐系统：Ubuntu 22.04+ / Debian 12+
- 推荐资源：2C / 2G / 20G+

## 场景 1：全新服务器完整部署

### 一键脚本

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy/fresh-install.sh)
```

脚本会自动：

- 安装或检查 Docker / Docker Compose
- 检查 Web 端口占用
- 在 `/opt/YYYY_MM_DD/qq-farm-bot` 创建部署目录
- 下载 `docker-compose.yml`、`.env`、初始化 SQL、更新脚本
- 启动全部 4 个容器并等待健康检查

### 手动部署

```bash
mkdir -p /opt/$(date +%Y_%m_%d)/qq-farm-bot
cd /opt/$(date +%Y_%m_%d)/qq-farm-bot

cp /path/to/deploy/docker-compose.yml .
cp /path/to/deploy/.env .
mkdir -p init-db
cp /path/to/deploy/init-db/01-init.sql init-db/
cp /path/to/scripts/deploy/update-app.sh .
chmod +x update-app.sh

# 按需修改密码、端口、第三方扫码参数
vi .env

docker compose pull
docker compose up -d
docker compose ps
```

## 场景 2：已部署环境只更新主程序

此模式不会重启 MySQL / Redis / ipad860，也不会清理数据卷。

### 一键更新

```bash
cd /opt/YYYY_MM_DD/qq-farm-bot
./update-app.sh
```

### 手动更新

```bash
cd /opt/YYYY_MM_DD/qq-farm-bot
docker compose pull qq-farm-bot
docker compose up -d --no-deps qq-farm-bot
docker compose ps
```

## 验证部署

```bash
docker compose ps
docker compose logs -f qq-farm-bot
curl http://localhost:3080/api/ping
```

预期状态：

- `qq-farm-bot` 为 `Up (healthy)`
- `qq-farm-mysql` 为 `Up (healthy)`
- `qq-farm-redis` 为 `Up`
- `qq-farm-ipad860` 为 `Up`

默认登录信息：

- 用户名：`admin`
- 密码：`.env` 中的 `ADMIN_PASSWORD`

## 目录结构

```text
qq-farm-bot/
├── docker-compose.yml
├── .env
├── update-app.sh
├── README.md
└── init-db/
    └── 01-init.sql
```

## 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f qq-farm-bot

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 只更新主程序
./update-app.sh
```

## 说明

- `deploy/init-db/01-init.sql` 用于 MySQL 空数据卷首次初始化。
- 默认管理员会在首次启动时自动创建，不会写死在 SQL 里。
- `REDIS_PASSWORD` 默认为空；如启用密码，主程序与 ipad860 会使用同一值。
- ARM64 服务器上，`ipad860` 以 `linux/amd64` 方式运行，依赖宿主机的 QEMU 兼容能力。
