# QQ 农场助手 - Docker 部署指南

> 📦 使用 Docker 快速部署 QQ 农场智能助手

---

## 📋 目录

- [快速开始](#快速开始)
- [构建镜像](#构建镜像)
- [推送镜像](#推送镜像)
- [同步镜像](#同步镜像)
- [生产环境部署](#生产环境部署)
- [故障排查](#故障排查)

---

## 🚀 快速开始

### 1. 拉取镜像

```bash
# 从 Docker Hub 拉取最新版本
docker pull qq-farm-bot-ui:3.3.0

# 或拉取 latest 标签
docker pull qq-farm-bot-ui:latest
```

### 2. 启动容器

```bash
docker run -d \
  --name qq-farm-bot \
  -p 3080:3000 \
  -v ./data:/app/core/data \
  -e ADMIN_PASSWORD=your_password \
  -e TZ=Asia/Shanghai \
  qq-farm-bot-ui:3.3.0
```

### 3. 访问界面

打开浏览器访问：`http://localhost:3080`

**默认密码**: 您在 `ADMIN_PASSWORD` 中设置的密码

---

## 🔨 构建镜像

### 方法一：使用脚本（推荐）

```bash
# 赋予执行权限
chmod +x scripts/docker-build-push.sh

# 执行构建（默认版本 3.3.0）
./scripts/docker-build-push.sh

# 或指定版本
./scripts/docker-build-push.sh 3.3.0
```

### 方法二：手动构建

```bash
# 1. 构建 Web 前端
pnpm build:web

# 2. 构建 Docker 镜像
docker build -t qq-farm-bot-ui:3.3.0 -f core/Dockerfile .

# 3. 同时构建 latest 标签
docker tag qq-farm-bot-ui:3.3.0 qq-farm-bot-ui:latest
```

### 方法三：多平台构建

```bash
# 启用 buildx
docker buildx create --use

# 构建多平台镜像（AMD64 + ARM64）
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t qq-farm-bot-ui:3.3.0 \
  -f core/Dockerfile . \
  --push
```

---

## 📤 推送镜像

### 登录 Docker Hub

```bash
docker login
# 输入用户名和密码
```

### 推送镜像

```bash
# 推送特定版本
docker push qq-farm-bot-ui:3.3.0

# 推送 latest 标签
docker push qq-farm-bot-ui:latest

# 或使用脚本
./scripts/docker-build-push.sh 3.3.0
```

### 推送到其他仓库

```bash
# 阿里云容器镜像服务
docker tag qq-farm-bot-ui:3.3.0 registry.cn-hangzhou.aliyuncs.com/your-namespace/qq-farm-bot-ui:3.3.0
docker push registry.cn-hangzhou.aliyuncs.com/your-namespace/qq-farm-bot-ui:3.3.0

# Docker Hub 完整路径
docker tag qq-farm-bot-ui:3.3.0 docker.io/your-username/qq-farm-bot-ui:3.3.0
docker push docker.io/your-username/qq-farm-bot-ui:3.3.0
```

---

## 🔄 同步镜像

### 使用同步脚本

```bash
# 赋予执行权限
chmod +x scripts/docker-sync.sh

# 同步到 Docker Hub（默认）
./scripts/docker-sync.sh docker.io 3.3.0

# 同步到其他仓库
./scripts/docker-sync.sh registry.cn-hangzhou.aliyuncs.com 3.3.0
```

### 手动同步

```bash
# 1. 拉取源镜像
docker pull qq-farm-bot-ui:3.3.0

# 2. 标记为目标仓库
docker tag qq-farm-bot-ui:3.3.0 target-registry/qq-farm-bot-ui:3.3.0

# 3. 推送到目标仓库
docker push target-registry/qq-farm-bot-ui:3.3.0
```

---

## 🏭 生产环境部署

### 使用 Docker Compose（推荐）

```bash
# 1. 使用生产环境配置
docker-compose -f docker-compose.prod.yml up -d

# 2. 查看运行状态
docker-compose -f docker-compose.prod.yml ps

# 3. 查看日志
docker-compose -f docker-compose.prod.yml logs -f

# 4. 停止服务
docker-compose -f docker-compose.prod.yml down
```

### 环境变量配置

创建 `.env` 文件：

```bash
# 管理员密码
ADMIN_PASSWORD=your_secure_password

# 时区
TZ=Asia/Shanghai

# 日志级别
LOG_LEVEL=info

# 推送通知配置（可选）
PUSH_PLUS_TOKEN=your_token
PUSH_PLUS_USER=your_user
```

### 数据备份

```bash
# 备份数据目录
tar -czf qq-farm-backup-$(date +%Y%m%d).tar.gz ./data

# 定期备份（添加到 crontab）
0 2 * * * tar -czf /backup/qq-farm-$(date +\%Y\%m\%d).tar.gz /path/to/data
```

### 自动更新

```bash
# 安装 watchtower
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 86400 \
  qq-farm-bot-ui

# 或手动更新
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🔧 故障排查

### 容器无法启动

```bash
# 查看容器日志
docker logs qq-farm-bot

# 查看容器详细信息
docker inspect qq-farm-bot

# 进入容器调试
docker exec -it qq-farm-bot /bin/sh
```

### 端口冲突

```bash
# 检查端口占用
lsof -i :3080

# 修改映射端口
docker run -d -p 3081:3000 ...
```

### 数据丢失

```bash
# 检查数据卷挂载
docker volume ls
docker volume inspect qq-farm-data

# 恢复备份
tar -xzf qq-farm-backup-20260301.tar.gz -C ./data
```

### 内存不足

```bash
# 查看容器资源使用
docker stats qq-farm-bot

# 限制内存使用
docker run -d --memory="1g" --memory-swap="1g" ...
```

### 网络问题

```bash
# 测试容器网络
docker exec qq-farm-bot wget -qO- http://localhost:3000/api/ping

# 检查网络配置
docker network ls
docker network inspect qq-farm-network
```

---

## 📊 监控和日志

### 查看日志

```bash
# 实时日志
docker logs -f qq-farm-bot

# 最近 100 行
docker logs --tail 100 qq-farm-bot

# 带时间戳
docker logs -f --timestamps qq-farm-bot

# 最近 1 小时
docker logs --since 1h qq-farm-bot
```

### 资源监控

```bash
# 实时资源使用
docker stats qq-farm-bot

# 容器详细信息
docker inspect qq-farm-bot

# 健康检查状态
docker inspect --format='{{.State.Health.Status}}' qq-farm-bot
```

---

## 🔒 安全建议

### 1. 修改默认密码

```bash
# 务必修改 ADMIN_PASSWORD
-e ADMIN_PASSWORD=your_secure_password
```

### 2. 使用 HTTPS

```bash
# 使用 Nginx 反向代理
docker run -d \
  --name nginx-proxy \
  -p 443:443 \
  -v /path/to/certs:/etc/nginx/certs \
  -v /path/to/nginx.conf:/etc/nginx/nginx.conf \
  nginx
```

### 3. 限制网络访问

```bash
# 仅允许本地访问
-p 127.0.0.1:3080:3000

# 或使用防火墙限制
ufw allow from 192.168.1.0/24 to any port 3080
```

### 4. 定期更新

```bash
# 每周更新一次
0 0 * * 0 docker-compose -f docker-compose.prod.yml pull && docker-compose -f docker-compose.prod.yml up -d
```

---

## 📋 检查清单

部署前请确认：

- [ ] Docker 已安装并运行
- [ ] 端口 3080 未被占用
- [ ] 数据目录已创建
- [ ] 管理员密码已修改
- [ ] 时区设置正确
- [ ] 日志级别合适
- [ ] 备份策略已制定
- [ ] 监控方案已配置

---

## 🆘 获取帮助

### 文档资源

- [README.md](README.md) - 项目说明
- [RELEASE-NOTES.md](RELEASE-NOTES.md) - 版本说明
- [CHANGELOG.DEVELOPMENT.md](CHANGELOG.DEVELOPMENT.md) - 开发日志

### 技术支持

- **GitHub Issues**: https://github.com/Penty-d/qq-farm-bot-ui/issues
- **QQ 群**: 227916149
- **邮箱**: smdk000@example.com

---

## 📈 性能优化

### 1. 使用本地镜像仓库

```bash
# 搭建本地 Registry
docker run -d \
  -p 5000:5000 \
  --name registry \
  -v /path/to/data:/var/lib/registry \
  registry:2

# 推送到本地
docker tag qq-farm-bot-ui:3.3.0 localhost:5000/qq-farm-bot-ui:3.3.0
docker push localhost:5000/qq-farm-bot-ui:3.3.0
```

### 2. 使用 BuildKit 加速构建

```bash
# 启用 BuildKit
export DOCKER_BUILDKIT=1

# 构建缓存
docker build --build-arg BUILDKIT_INLINE_CACHE=1 -t qq-farm-bot-ui:3.3.0 .
```

### 3. 多阶段构建优化

当前 Dockerfile 已使用多阶段构建：
- **builder**: 构建 Web 前端
- **prod-deps**: 安装运行时依赖
- **runner**: 最终运行镜像

---

**最后更新**: 2026-03-01  
**版本**: v3.3.0  
**维护者**: smdk000
