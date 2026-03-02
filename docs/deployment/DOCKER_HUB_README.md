# Docker Hub README for QQ Farm Bot UI

## 🚀 QQ 农场智能助手 - 多账号挂机 + Web 面板

基于 Node.js 的 QQ 农场自动化工具，支持多账号管理、Web 控制面板、实时日志与数据分析。

![版本](https://img.shields.io/badge/版本-v3.6.0-blue)
![平台](https://img.shields.io/badge/平台-AMD64%20%7C%20ARM64-green)
![Docker Pulls](https://img.shields.io/docker/pulls/smdk000/qq-farm-bot-ui)

---

## 📋 快速开始

### 一键部署（推荐）

**ARM64 服务器（树莓派/鲲鹏/飞腾）:**
```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-arm.sh
chmod +x deploy-arm.sh
./deploy-arm.sh
```

**x86_64 服务器（Intel/AMD）:**
```bash
curl -O https://raw.githubusercontent.com/smdk000/qq-farm-bot-ui/main/scripts/deploy-x86.sh
chmod +x deploy-x86.sh
./deploy-x86.sh
```

### Docker Compose 部署

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
      - ADMIN_PASSWORD=your_secure_password
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/core/data
      - ./logs:/app/core/logs
      - ./backup:/app/core/backup
```

启动服务：
```bash
docker-compose up -d
```

### 手动部署

```bash
docker run -d \
  --name qq-farm-bot-ui \
  --restart unless-stopped \
  -p 3080:3000 \
  -v ./data:/app/core/data \
  -v ./logs:/app/core/logs \
  -v ./backup:/app/core/backup \
  -e ADMIN_PASSWORD=your_password \
  -e TZ=Asia/Shanghai \
  smdk000/qq-farm-bot-ui:latest
```

---

## 🏗️ 多平台支持

本镜像支持以下架构：

- ✅ **linux/amd64** - Intel/AMD x86_64 服务器
- ✅ **linux/arm64** - ARM64 服务器（树莓派 4B/鲲鹏/飞腾等）

Docker 会自动选择适合您系统架构的镜像版本。

---

## 🛡️ 数据保护

### 重要目录挂载

| 宿主机路径 | 容器内路径 | 说明 |
|-----------|-----------|------|
| `./data` | `/app/core/data` | **核心数据库**（账号配置、用户数据） |
| `./logs` | `/app/core/logs` | 日志文件（运行日志、操作日志） |
| `./backup` | `/app/core/backup` | 备份文件目录 |

### ⚠️ 重要提醒

- ❌ **不要删除** `./data` 目录，否则所有数据将丢失
- ✅ **定期备份** 数据：`tar -czf backup.tar.gz ./data`
- ✅ **升级前先备份**，升级失败可快速回滚

### 备份命令

```bash
# 备份数据
tar -czf farm-bot-backup-$(date +%Y%m%d).tar.gz ./data

# 恢复数据
tar -xzf farm-bot-backup-20260301.tar.gz -C ./data
```

---

## 🎯 核心功能

### 多账号管理
- ✅ 账号新增、编辑、删除、启动、停止
- ✅ 扫码登录（支持 QQ 与微信）
- ✅ 账号被踢下线自动删除
- ✅ 账号离线推送通知

### 自动化能力
- ✅ **农场管理**：收获、种植、浇水、除草、除虫
- ✅ **好友互动**：自动偷菜、帮忙、捣乱
- ✅ **智能防护**：60 秒防偷抢收保护
- ✅ **两季作物**：智能识别（不误铲第二季）
- ✅ **任务系统**：自动领取任务奖励

### Web 面板
- ✅ 实时日志，支持多维度筛选
- ✅ 深色/浅色主题切换
- ✅ 5 大精美主题（翠绿/赛博/黯金/深海/樱花粉）
- ✅ 响应式设计，支持移动端

### 多用户系统
- ✅ 用户注册/登录
- ✅ 卡密管理系统（天卡/周卡/月卡/永久卡/体验卡）
- ✅ 用户权限控制
- ✅ 账号续费功能

---

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `ADMIN_PASSWORD` | 管理员密码 | `admin` |
| `TZ` | 时区 | `Asia/Shanghai` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `NODE_ENV` | 运行环境 | `production` |

### 端口映射

- **容器端口**: 3000
- **推荐宿主机端口**: 3080
- **访问地址**: `http://localhost:3080`

---

## 📊 常用命令

```bash
# 查看运行状态
docker ps

# 查看实时日志
docker logs -f qq-farm-bot-ui

# 查看最近 100 行日志
docker logs --tail 100 qq-farm-bot-ui

# 重启容器
docker restart qq-farm-bot-ui

# 停止容器
docker stop qq-farm-bot-ui

# 启动容器
docker start qq-farm-bot-ui

# 进入容器
docker exec -it qq-farm-bot-ui /bin/sh

# 更新镜像
docker pull smdk000/qq-farm-bot-ui:latest
docker-compose pull
docker-compose up -d
```

---

## 🔧 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker logs qq-farm-bot-ui

# 检查端口占用
lsof -i :3080

# 检查容器配置
docker inspect qq-farm-bot-ui
```

### 无法访问网页

1. 检查防火墙设置
2. 确认端口映射正确
3. 查看容器日志

### 数据库丢失

检查数据卷挂载是否正确：
```bash
docker inspect qq-farm-bot-ui | grep -A 10 Mounts
```

---

## 📝 版本更新

### v3.6.0 (2026-03-01) - 最新版本

**前端更新:**
- ✅ 端云同步时间机器：解决多设备切换配置覆盖问题
- ✅ 首屏秒开级切片分离：优化加载速度
- ✅ 多平台扫码引擎：支持微信小程序扫码登录
- ✅ 深度主题联防：修复深色主题加载条颜色问题

**后端更新:**
- ✅ 安全密钥隔离：清除硬编码密钥
- ✅ 网络防永久挂死拦截：10-15 秒超时保护

### 历史版本

- **v3.5.2** - 扫码重构与体验优化
- **v3.4.0** - UI 架构大重构与防刷
- **v3.3.4** - 全局沉浸与平滑操作
- **v3.3.3** - 丝滑防抖与安全限流

[查看完整更新日志](https://github.com/smdk000/qq-farm-bot-ui/blob/main/CHANGELOG.DEVELOPMENT.md)

---

## 📚 完整文档

- **GitHub 仓库**: https://github.com/smdk000/qq-farm-bot-ui
- **部署指南**: https://github.com/smdk000/qq-farm-bot-ui/blob/main/docs/DEPLOYMENT_GUIDE.md
- **配置模板**: https://github.com/smdk000/qq-farm-bot-ui/blob/main/docs/CONFIG_TEMPLATES.md
- **故障排查**: https://github.com/smdk000/qq-farm-bot-ui/blob/main/docs/TROUBLESHOOTING.md
- **帮助中心**: https://github.com/smdk000/qq-farm-bot-ui/blob/main/docs/HELP_CENTER_MAINTENANCE_GUIDE.md

---

## 🆘 获取帮助

### 文档资源

- [README.md](https://github.com/smdk000/qq-farm-bot-ui) - 项目说明
- [DEPLOYMENT_GUIDE.md](https://github.com/smdk000/qq-farm-bot-ui/blob/main/docs/DEPLOYMENT_GUIDE.md) - 部署指南
- [TROUBLESHOOTING.md](https://github.com/smdk000/qq-farm-bot-ui/blob/main/docs/TROUBLESHOOTING.md) - 故障排查
- [CHANGELOG.DEVELOPMENT.md](https://github.com/smdk000/qq-farm-bot-ui/blob/main/CHANGELOG.DEVELOPMENT.md) - 更新日志

### 技术支持

- **GitHub Issues**: https://github.com/smdk000/qq-farm-bot-ui/issues
- **QQ 群**: 227916149
- **Docker Hub**: https://hub.docker.com/r/smdk000/qq-farm-bot-ui

---

## ⚠️ 免责声明

本项目仅供学习与研究用途。使用本工具可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。

---

## 📄 许可证

ISC License

---

**最后更新**: 2026-03-01  
**维护者**: smdk000  
**版本**: v3.6.0
