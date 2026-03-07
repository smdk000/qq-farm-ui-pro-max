# 🌾 QQ 农场智能助手 - 一键部署指南

> 只需 **3 步**，即可在你的服务器上运行 QQ 农场智能助手。

---

## 📋 环境要求

| 项目 | 最低要求 |
|------|---------|
| 操作系统 | Ubuntu 22.04+ / Debian 12+ / CentOS 9+ |
| 架构 | **x86_64 (amd64)**（ARM 不支持微信协议服务） |
| CPU | 2 核 |
| 内存 | 2 GB |
| 硬盘 | 20 GB |
| 软件 | Docker 24+ 和 Docker Compose v2+ |

---

## 🚀 三步部署

### 第 1 步：安装 Docker

如果服务器还没有 Docker：

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable docker
sudo systemctl start docker
```

> **国内服务器**可使用镜像加速：
> ```bash
> sudo mkdir -p /etc/docker
> sudo tee /etc/docker/daemon.json <<-'EOF'
> {
>   "registry-mirrors": [
>     "https://docker.mirrors.ustc.edu.cn",
>     "https://registry.docker-cn.com"
>   ]
> }
> EOF
> sudo systemctl restart docker
> ```

### 第 2 步：下载部署包并配置

#### 方式 A：在线部署

```bash
# 创建部署目录
mkdir -p /opt/qq-farm-bot && cd /opt/qq-farm-bot

# 下载部署文件（4个文件）
# 将 docker-compose.yml、.env、init-db/01-init.sql 放入此目录
```

#### 方式 B：离线部署

```bash
# 解压离线包
tar xzf qq-farm-bot-deploy.tar.gz
cd qq-farm-bot-deploy

# 加载 Docker 镜像（无需联网）
docker load < qq-farm-bot-images.tar.gz
```

#### 修改配置（可选）

编辑 `.env` 文件，修改管理员密码和端口：

```bash
vi .env
```

```env
# Web 管理后台密码
ADMIN_PASSWORD=你的密码

# 对外端口（默认 3080）
WEB_PORT=3080
```

### 第 3 步：一键启动

```bash
docker compose up -d
```

首次启动约需 1-2 分钟（拉取镜像 + 初始化数据库）。

---

## ✅ 验证部署

```bash
# 查看容器状态（应该有 4 个 Running）
docker compose ps

# 查看实时日志
docker compose logs -f qq-farm-bot
```

预期输出：4 个容器全部 `Up`：

| 容器名 | 服务 | 状态 |
|--------|------|------|
| qq-farm-bot | 主应用 | Up (healthy) |
| qq-farm-mysql | MySQL 数据库 | Up (healthy) |
| qq-farm-redis | Redis 缓存 | Up |
| qq-farm-ipad860 | 微信协议 | Up |

打开浏览器访问：**http://服务器IP:3080**

- 默认账号：`admin`
- 密码：你在 `.env` 中设置的 `ADMIN_PASSWORD`

---

## 📁 目录结构

```
qq-farm-bot-deploy/
├── docker-compose.yml      # Docker 编排配置
├── .env                    # 环境变量（密码、端口等）
├── init-db/
│   └── 01-init.sql         # 数据库自动初始化脚本
└── README.md               # 本文档
```

---

## 🔧 常用操作

```bash
# 停止所有服务
docker compose down

# 重启所有服务
docker compose restart

# 查看日志
docker compose logs -f

# 更新到最新版本
docker compose pull && docker compose up -d

# 备份 MySQL 数据
docker exec qq-farm-mysql mysqldump -u root -pqq007qq008 qq_farm > backup.sql

# 恢复 MySQL 数据
docker exec -i qq-farm-mysql mysql -u root -pqq007qq008 qq_farm < backup.sql
```

---

## ❓ 常见问题

### 端口被占用

修改 `.env` 中的 `WEB_PORT` 为其他端口（如 8080）：
```env
WEB_PORT=8080
```
然后重启：`docker compose up -d`

### 镜像拉取慢/失败

配置 Docker 镜像加速器（见第 1 步），或使用离线部署方式。

### MySQL 初始化失败

如需重新初始化数据库（会清空数据）：
```bash
docker compose down
docker volume rm qq-farm-bot-deploy_mysql-data
docker compose up -d
```

### ARM 服务器能否使用？

微信协议服务（ipad860）**仅支持 x86_64 架构**。ARM 服务器（如 Apple Silicon Mac、AWS Graviton）上会通过 QEMU 模拟运行，性能较差且可能不稳定。建议使用 x86_64 服务器。

---

## 📞 技术支持

- **GitHub Issues**: https://github.com/smdk000/qq-farm-ui-pro-max/issues
- **QQ 群**: 227916149

---

**版本**: v4.1.0  
**最后更新**: 2026-03-04
