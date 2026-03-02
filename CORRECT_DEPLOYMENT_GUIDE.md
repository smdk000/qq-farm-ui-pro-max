# 🚀 QQ 农场助手 - 正确部署指南

**版本**: v3.6.0  
**最后更新**: 2026-03-01  
**状态**: ✅ 已验证

---

## ⚠️ 重要提示

如果您之前部署失败，请检查以下几点：

1. ✅ **Docker Hub 镜像名称**: `smdk000/qq-farm-bot-ui`（不是 `qq-farm-bot-ui`）
2. ✅ **版本号**: 使用 `latest` 标签（不是固定的 `3.3.3` 或 `3.3.0`）
3. ✅ **GitHub 仓库**: `https://github.com/smdk000/qq-farm-ui-pro-max`
4. ✅ **数据卷挂载**: 必须包含 `./data`, `./logs`, `./backup`

---

## 🎯 快速部署（三种方法）

### 方法 1: 一键部署脚本（最简单 ✅ 推荐）

**ARM64 服务器**（树莓派/鲲鹏/飞腾）:
```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy-arm.sh
chmod +x deploy-arm.sh
./deploy-arm.sh
```

**x86_64 服务器**（Intel/AMD）:
```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/scripts/deploy-x86.sh
chmod +x deploy-x86.sh
./deploy-x86.sh
```

**部署成功后**:
- 访问地址：`http://localhost:3080`
- 默认密码：`qq007qq008`
- 自定义密码：`ADMIN_PASSWORD=your_password ./deploy-arm.sh`
- 自定义端口：`PORT=3081 ./deploy-arm.sh`

---

### 方法 2: Docker Compose（生产环境 ✅ 推荐）

**步骤 1: 下载配置文件**
```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-ui-pro-max/main/docker-compose.prod.yml
```

**步骤 2: 启动服务**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

**步骤 3: 查看状态**
```bash
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f
```

**配置文件内容** (`docker-compose.prod.yml`):
```yaml
version: '3.8'

services:
  qq-farm-bot-ui:
    image: smdk000/qq-farm-bot-ui:latest
    container_name: qq-farm-bot-ui
    restart: unless-stopped
    ports:
      - "3080:3000"
    environment:
      - ADMIN_PASSWORD=qq007qq008
      - TZ=Asia/Shanghai
      - NODE_ENV=production
      - LOG_LEVEL=info
    volumes:
      - ./data:/app/core/data
      - ./logs:/app/core/logs
      - ./backup:/app/core/backup
```

---

### 方法 3: Docker 命令（灵活配置）

```bash
docker run -d \
  --name qq-farm-bot-ui \
  --restart unless-stopped \
  -p 3080:3000 \
  -v ./data:/app/core/data \
  -v ./logs:/app/core/logs \
  -v ./backup:/app/core/backup \
  -e ADMIN_PASSWORD=qq007qq008 \
  -e TZ=Asia/Shanghai \
  -e LOG_LEVEL=info \
  smdk000/qq-farm-bot-ui:latest
```

---

## 📊 验证部署成功

### 检查清单

运行以下命令验证部署：

```bash
# 1. 检查容器状态
docker ps

# 应该看到：
# CONTAINER ID   IMAGE                             STATUS
# xxxxxxx        smdk000/qq-farm-bot-ui:latest     Up 2 minutes

# 2. 查看实时日志
docker logs -f qq-farm-bot-ui

# 应该看到启动日志，没有错误

# 3. 检查数据卷挂载
docker inspect qq-farm-bot-ui | grep -A 10 Mounts

# 应该看到：
# "Source": "/path/to/data",
# "Destination": "/app/core/data"
# "Source": "/path/to/logs",
# "Destination": "/app/core/logs"
# "Source": "/path/to/backup",
# "Destination": "/app/core/backup"

# 4. 测试访问
curl http://localhost:3080/api/ping

# 应该返回：pong 或 HTTP 200
```

### 访问 Web 界面

打开浏览器访问：`http://localhost:3080`

- **默认用户名**: `admin`
- **默认密码**: `qq007qq008`（或您设置的密码）

---

## 🔄 版本升级

### 从旧版本升级到最新版

```bash
# 1. 备份数据（重要！）
tar -czf farm-bot-backup-$(date +%Y%m%d).tar.gz ./data

# 2. 停止旧容器
docker stop qq-farm-bot-ui
docker rm qq-farm-bot-ui

# 3. 拉取最新镜像
docker pull smdk000/qq-farm-bot-ui:latest

# 4. 启动新容器
# 使用一键部署脚本
./scripts/deploy-arm.sh  # 或 deploy-x86.sh

# 或使用 Docker 命令
docker run -d \
  --name qq-farm-bot-ui \
  -p 3080:3000 \
  -v ./data:/app/core/data \
  -e ADMIN_PASSWORD=qq007qq008 \
  smdkk000/qq-farm-bot-ui:latest
```

---

## ⚠️ 常见错误与解决方案

### 错误 1: 镜像拉取失败 ❌

**错误信息**:
```
Error response from daemon: pull access denied
repository not found or does not exist
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
docker pull qq-farm-bot-ui:3.3.3   # 版本号可能不存在

# 如果需要登录
docker login
```

---

### 错误 2: 端口被占用 ❌

**错误信息**:
```
Error starting userland proxy: listen tcp 0.0.0.0:3080: bind: address already in use
```

**原因**: 3080 端口已被其他程序使用

**解决方案**:
```bash
# 方法 1: 检查并停止占用端口的程序
lsof -i :3080
kill <PID>

# 方法 2: 使用不同端口
export PORT=3081
./scripts/deploy-arm.sh

# 或修改 docker-compose.yml
ports:
  - "3081:3000"  # 改为 3081
```

---

### 错误 3: 权限错误 ❌

**错误信息**:
```
permission denied while trying to connect to the Docker daemon socket
```

**原因**: 当前用户没有 Docker 权限

**解决方案**:
```bash
# 方法 1: 使用 sudo（临时）
sudo ./scripts/deploy-arm.sh

# 方法 2: 将用户添加到 docker 组（永久）
sudo usermod -aG docker $USER
newgrp docker

# 然后重新登录或使用以下命令
su - $USER
```

---

### 错误 4: 架构不匹配 ❌

**错误信息**:
```
standard_init linux.go: exec format error
```

**原因**: 使用了错误架构的镜像

**解决方案**:
```bash
# 检查服务器架构
uname -m

# x86_64 → 使用 deploy-x86.sh
# aarch64/arm64 → 使用 deploy-arm.sh

# Docker 会自动选择正确的架构镜像
docker pull smdk000/qq-farm-bot-ui:latest
```

---

### 错误 5: 数据卷挂载失败 ❌

**错误信息**:
```
Error response from daemon: Mounts denied
```

**原因**: 
- 目录不存在
- 权限问题

**解决方案**:
```bash
# 创建必要的目录
mkdir -p ./data ./logs ./backup

# 设置正确权限
chmod -R 755 ./data ./logs ./backup

# 重新启动容器
docker restart qq-farm-bot-ui
```

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

### 数据卷挂载

| 宿主机路径 | 容器内路径 | 说明 |
|-----------|-----------|------|
| `./data` | `/app/core/data` | **核心数据库**（必须挂载） |
| `./logs` | `/app/core/logs` | 日志文件（推荐挂载） |
| `./backup` | `/app/core/backup` | 备份文件（推荐挂载） |

⚠️ **重要**: 不要删除 `./data` 目录，否则所有数据将丢失！

---

## 🛠️ 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker logs qq-farm-bot-ui

# 检查容器配置
docker inspect qq-farm-bot-ui

# 进入容器调试
docker exec -it qq-farm-bot-ui /bin/sh
```

### 无法访问 Web 界面

```bash
# 检查容器是否运行
docker ps

# 检查端口监听
netstat -tlnp | grep 3080

# 检查防火墙
sudo ufw status
sudo ufw allow 3080/tcp
```

### 数据库问题

```bash
# 检查数据库文件
ls -lh ./data/

# 应该看到：
# farm-bot.db
# farm-bot.db-wal
# farm-bot.db-shm

# 如果数据库文件损坏，从备份恢复
tar -xzf farm-bot-backup-20260301.tar.gz -C ./data
```

---

## 📚 相关文档

- **GitHub 仓库**: https://github.com/smdk000/qq-farm-ui-pro-max
- **Docker Hub**: https://hub.docker.com/r/smdk000/qq-farm-bot-ui
- **GitHub Packages**: https://github.com/users/smdk000/packages/container/package/qq-farm-bot-ui
- **完整部署指南**: DEPLOYMENT_GUIDE_v3.6.0.md
- **故障排查**: docs/TROUBLESHOOTING.md
- **配置模板**: docs/CONFIG_TEMPLATES.md

---

## 🆘 获取帮助

### 文档资源

- [README.md](https://github.com/smdk000/qq-farm-ui-pro-max) - 项目说明
- [DEPLOYMENT_FIX_REPORT.md](DEPLOYMENT_FIX_REPORT.md) - 部署问题修复报告
- [DOCKER_BUILD_COMPLETE.md](DOCKER_BUILD_COMPLETE.md) - Docker 构建完成总结

### 技术支持

- **GitHub Issues**: https://github.com/smdk000/qq-farm-ui-pro-max/issues
- **QQ 群**: 227916149
- **Docker Hub**: https://hub.docker.com/r/smdk000/qq-farm-bot-ui

---

## ✅ 部署成功检查清单

部署完成后，请确认：

- [ ] Docker 容器正常运行 (`docker ps`)
- [ ] 可以访问 `http://localhost:3080`
- [ ] 使用密码可以登录 Web 界面
- [ ] 日志输出正常，无错误信息
- [ ] 数据卷正确挂载 (`./data`, `./logs`, `./backup`)
- [ ] 数据库文件存在 (`./data/farm-bot.db`)

如果以上都正常，恭喜您部署成功！🎉

---

**维护者**: smdk000  
**最后更新**: 2026-03-01  
**版本**: v3.6.0
