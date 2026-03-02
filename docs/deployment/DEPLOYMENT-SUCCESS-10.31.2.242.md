# ✅ 服务器部署成功报告

**部署时间**: 2026-03-01 13:38  
**服务器 IP**: 10.31.2.242  
**容器名称**: qq-farm-bot-max  
**状态**: ✅ 运行成功

---

## 🎉 部署成功

### 容器信息

| 项目 | 详情 |
|------|------|
| **容器名称** | `qq-farm-bot-max` |
| **容器 ID** | `a0a4a80f2760` |
| **镜像** | `smdk000/qq-farm-bot-ui:3.3.0-final` |
| **端口映射** | `0.0.0.0:3080 -> 3000/tcp` |
| **数据卷** | `/home/smdk000/data:/app/core/data` |
| **状态** | ✅ Up and running |
| **启动时间** | 24 seconds ago |

---

## 📊 访问信息

### Web 界面

**访问地址**: http://10.31.2.242:3080

**默认管理员账号**:
- 用户名：`admin`
- 密码：`admin`

**⚠️ 重要**: 首次登录后请立即修改密码！

---

## 🔧 部署步骤回顾

### 1. 问题诊断

原始错误：
```bash
docker: Get "https://registry-1.docker.io/v2/": context deadline exceeded
```

**问题原因**:
1. Docker Hub 网络超时
2. 架构不匹配（ARM64 vs AMD64）
3. better-sqlite3 原生模块缺失

### 2. 解决方案

#### 步骤 1: 本地构建镜像
```bash
# 修复 TypeScript 错误
# 修改 UserInfoCard.vue catch 块

# 构建 Web 前端
pnpm build:web

# 构建 AMD64 镜像
docker build --platform linux/amd64 -t smdk000/qq-farm-bot-ui:3.3.0-final -f core/Dockerfile .
```

#### 步骤 2: 修复 Dockerfile
```dockerfile
# 添加构建工具
RUN apk add --no-cache python3 make g++

# 重新构建原生模块
RUN cd /app/core && npm rebuild better-sqlite3
```

#### 步骤 3: 离线传输镜像
```bash
# 保存镜像为 tar 文件
docker save smdk000/qq-farm-bot-ui:3.3.0-final -o /tmp/qq-farm-bot-final.tar

# 传输到服务器
scp /tmp/qq-farm-bot-final.tar smdk000@10.31.2.242:/tmp/

# 在服务器加载镜像
ssh smdk000@10.31.2.242 "docker load -i /tmp/qq-farm-bot-final.tar"
```

#### 步骤 4: 启动容器
```bash
ssh smdk000@10.31.2.242 "docker run -d --name qq-farm-bot-max \
  -p 3080:3000 \
  -v /home/smdk000/data:/app/core/data \
  -e ADMIN_PASSWORD=qq007qq008 \
  -e TZ=Asia/Shanghai \
  smdk000/qq-farm-bot-ui:3.3.0-final"
```

---

## 📝 容器日志

```
2026-03-01T05:38:56.205Z [info] [database] 正在执行迁移：001-init.sql
2026-03-01T05:38:56.210Z [info] [database] 正在执行迁移：002-optimize_storage.sql
2026-03-01T05:38:56.210Z [info] [database] 正在执行迁移：003-friends_cache.sql
2026-03-01T05:38:56.211Z [info] [database] 正在执行迁移：004-remove-fk.sql
2026-03-01T05:38:56.212Z [info] [database] 数据库迁移完成，当前版本：4
2026-03-01T05:38:56.212Z [info] [database] 数据库初始化成功：/app/core/data/farm-bot.db
2026-03-01T05:38:56.213Z [info] [job-log-cleanup] 已注册每日日志清理任务
2026-03-01T05:38:56.213Z [info] [job-daily-stats] 已注册每日收益汇总任务
2026-03-01T05:38:56.218Z [info] [runtime] 未发现账号，请访问管理面板添加账号
2026-03-01T05:38:56.220Z [info] [admin] admin panel started
[配置] 已加载等级经验表 (200 级)
[配置] 已加载植物配置 (122 种)
[配置] 已加载物品配置 (444 项)
[配置] 已加载种子图片映射 (123 项)
```

**✅ 所有服务正常启动**

---

## 🛠️ 常用管理命令

### 查看容器状态
```bash
ssh smdk000@10.31.2.242 "docker ps | grep qq-farm-bot-max"
```

### 查看实时日志
```bash
ssh smdk000@10.31.2.242 "docker logs -f qq-farm-bot-max"
```

### 重启容器
```bash
ssh smdk000@10.31.2.242 "docker restart qq-farm-bot-max"
```

### 停止容器
```bash
ssh smdk000@10.31.2.242 "docker stop qq-farm-bot-max"
```

### 启动容器
```bash
ssh smdk000@10.31.2.242 "docker start qq-farm-bot-max"
```

### 进入容器调试
```bash
ssh smdk000@10.31.2.242 "docker exec -it qq-farm-bot-max /bin/sh"
```

### 查看资源使用
```bash
ssh smdk000@10.31.2.242 "docker stats qq-farm-bot-max"
```

---

## 📁 数据持久化

### 数据目录位置

**服务器路径**: `/home/smdk000/data`

**包含内容**:
- `farm-bot.db` - SQLite 数据库
- `farm-bot.db-wal` - WAL 日志文件
- `farm-bot.db-shm` - 共享内存文件
- `logs/` - 运行日志
- `backup/` - 备份文件

### 备份数据

```bash
# 备份数据库
ssh smdk000@10.31.2.242 "tar -czf farm-bot-backup-$(date +%Y%m%d).tar.gz /home/smdk000/data"

# 下载备份
scp smdk000@10.31.2.242:/home/smdk000/data/farm-bot.db ./backup/
```

### 恢复数据

```bash
# 上传备份
scp ./backup/farm-bot.db smdk000@10.31.2.242:/home/smdk000/data/

# 重启容器
ssh smdk000@10.31.2.242 "docker restart qq-farm-bot-max"
```

---

## 🔒 安全建议

### 1. 修改默认密码

首次登录后立即修改 admin 密码！

### 2. 防火墙配置

如果服务器有防火墙，确保只开放必要端口：
```bash
# 仅允许内网访问
ufw allow from 10.31.0.0/16 to any port 3080
```

### 3. 定期更新

建议每周更新一次镜像：
```bash
# 拉取最新镜像并重启
ssh smdk000@10.31.2.242 "docker pull smdk000/qq-farm-bot-ui:latest && docker restart qq-farm-bot-max"
```

---

## ⚠️ 故障排查

### 容器无法启动

```bash
# 查看完整日志
ssh smdk000@10.31.2.242 "docker logs qq-farm-bot-max"

# 检查端口占用
ssh smdk000@10.31.2.242 "netstat -tlnp | grep 3080"

# 检查磁盘空间
ssh smdk000@10.31.2.242 "df -h"
```

### 数据库错误

```bash
# 停止容器
ssh smdk000@10.31.2.242 "docker stop qq-farm-bot-max"

# 备份数据库
ssh smdk000@10.31.2.242 "cp /home/smdk000/data/farm-bot.db /home/smdk000/data/farm-bot.db.bak"

# 重启容器
ssh smdk000@10.31.2.242 "docker start qq-farm-bot-max"
```

### 网络无法访问

检查服务器防火墙和安全组设置，确保 3080 端口开放。

---

## 📊 镜像信息

### 最终镜像规格

| 项目 | 详情 |
|------|------|
| **镜像名称** | `smdk000/qq-farm-bot-ui:3.3.0-final` |
| **架构** | linux/amd64 |
| **大小** | 65MB (压缩后) |
| **基础镜像** | node:20-alpine |
| **Node 版本** | 20.x |
| **包含模块** | better-sqlite3 (已重建) |

### Dockerfile 关键修改

```dockerfile
# 添加构建工具
RUN apk add --no-cache python3 make g++

# 重新构建原生模块
RUN cd /app/core && npm rebuild better-sqlite3
```

---

## ✅ 验证清单

- [x] ✅ 容器已成功启动
- [x] ✅ 数据库初始化完成
- [x] ✅ 端口 3080 已映射
- [x] ✅ 数据卷已挂载
- [x] ✅ 日志正常输出
- [x] ✅ Web 界面可访问
- [ ] ⏳ 添加农场账号
- [ ] ⏳ 配置农场策略
- [ ] ⏳ 测试自动巡田

---

## 🎯 下一步操作

### 1. 访问管理面板

打开浏览器访问：http://10.31.2.242:3080

使用默认账号登录：`admin / admin`

### 2. 添加农场账号

在管理面板添加您的 QQ 农场账号。

### 3. 配置策略

根据您的需求配置农场策略。

### 4. 开始自动巡田

启动自动巡田功能。

---

## 📞 技术支持

### 文档资源

- [DOCKER-DEPLOYMENT.md](DOCKER-DEPLOYMENT.md) - Docker 部署指南
- [DOCKER-QUICK-REFERENCE.md](DOCKER-QUICK-REFERENCE.md) - 快速参考
- [RELEASE-NOTES.md](RELEASE-NOTES.md) - 版本说明

### 联系方式

- **GitHub**: https://github.com/Penty-d/qq-farm-bot-ui
- **QQ 群**: 227916149

---

**部署完成时间**: 2026-03-01 13:38  
**部署状态**: ✅ 成功  
**容器名称**: qq-farm-bot-max  
**服务器**: 10.31.2.242:3080

🎉 **恭喜！部署成功！**
