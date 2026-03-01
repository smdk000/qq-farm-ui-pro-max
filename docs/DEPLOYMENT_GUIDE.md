# QQ 农场智能助手 - 生产环境部署指南

> 版本：v1.0  
> 更新日期：2026-03-01  
> 适用环境：Linux / macOS / Windows / Docker

---

## 📋 目录

- [部署前准备](#部署前准备)
- [方案一：Linux/macOS 部署](#方案一-linuxmacos-部署)
- [方案二：Windows 部署](#方案二-windows-部署)
- [方案三：Docker 部署](#方案三-docker-部署)
- [方案四：二进制文件部署](#方案四-二进制文件部署)
- [Nginx 反向代理配置](#nginx-反向代理配置)
- [HTTPS 配置](#https-配置)
- [性能优化](#性能优化)
- [监控与日志](#监控与日志)
- [备份与恢复](#备份与恢复)
- [常见问题](#常见问题)

---

## 🎯 部署前准备

### 系统要求

**最低配置:**
- CPU: 1 核
- 内存：512MB
- 磁盘：1GB 可用空间
- 系统：Linux/macOS/Windows 10+

**推荐配置:**
- CPU: 2 核+
- 内存：2GB+
- 磁盘：5GB+ SSD
- 系统：Ubuntu 20.04+ / CentOS 7+ / macOS 11+

### 软件依赖

**方案一/二需要:**
- Node.js 20+
- pnpm 10+
- Git（可选，用于拉取代码）

**方案三需要:**
- Docker 20+
- Docker Compose 2+

**方案四:**
- 无需任何依赖

### 网络要求

- 开放端口：3000（可自定义）
- 出站访问：需要访问 QQ 游戏服务器
- 入站访问：Web 面板访问

---

## 🐧 方案一：Linux/macOS 部署

### 步骤 1: 安装 Node.js

**Ubuntu/Debian:**
```bash
# 使用 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v  # 应显示 v20.x.x
npm -v   # 应显示 10.x.x
```

**CentOS/RHEL:**
```bash
# 使用 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node -v
npm -v
```

**macOS:**
```bash
# 使用 Homebrew
brew install node@20

# 验证安装
node -v
npm -v
```

### 步骤 2: 安装 pnpm

```bash
# 启用 Corepack（Node.js 16.9+ 自带）
corepack enable

# 验证安装
pnpm -v  # 应显示 10.x.x
```

### 步骤 3: 克隆项目

```bash
# 克隆代码
git clone https://github.com/your-repo/qq-farm-bot-ui.git
cd qq-farm-bot-ui

# 或使用下载的二进制包（跳过此步）
```

### 步骤 4: 安装依赖

```bash
# 安装项目依赖
pnpm install

# 构建前端
pnpm build:web
```

### 步骤 5: 配置环境变量

```bash
# 创建环境变量文件
cat > .env << EOF
ADMIN_PASSWORD=your_strong_password_here
PORT=3000
NODE_ENV=production
EOF

# 设置权限
chmod 600 .env
```

### 步骤 6: 创建 systemd 服务（推荐）

**创建服务文件:**
```bash
sudo nano /etc/systemd/system/qq-farm-bot.service
```

**服务内容:**
```ini
[Unit]
Description=QQ Farm Bot UI
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/qq-farm-bot-ui
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production
Environment=ADMIN_PASSWORD=your_strong_password
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=qq-farm-bot

# 安全增强
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

**启用服务:**
```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用开机自启
sudo systemctl enable qq-farm-bot

# 启动服务
sudo systemctl start qq-farm-bot

# 查看状态
sudo systemctl status qq-farm-bot

# 查看日志
sudo journalctl -u qq-farm-bot -f
```

### 步骤 7: 配置防火墙

**UFW (Ubuntu):**
```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

**firewalld (CentOS):**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## 🪟 方案二：Windows 部署

### 步骤 1: 安装 Node.js

1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载并安装 LTS 版本（v20.x）
3. 安装时勾选"Automatically install necessary tools"

**验证安装:**
```powershell
node -v
npm -v
```

### 步骤 2: 安装 pnpm

```powershell
# 启用 Corepack
corepack enable

# 验证
pnpm -v
```

### 步骤 3: 克隆或下载项目

```powershell
# 使用 Git
git clone https://github.com/your-repo/qq-farm-bot-ui.git
cd qq-farm-bot-ui

# 或直接下载 ZIP 解压
```

### 步骤 4: 安装依赖

```powershell
# 安装依赖
pnpm install

# 构建前端
pnpm build:web
```

### 步骤 5: 创建启动脚本

**创建 start.bat:**
```batch
@echo off
echo ======================================
echo   QQ 农场智能助手 - Windows 启动脚本
echo ======================================
echo.

cd /d "%~dp0"

REM 设置环境变量
set NODE_ENV=production
set ADMIN_PASSWORD=your_strong_password

REM 启动服务
echo 正在启动服务...
pnpm start

pause
```

### 步骤 6: 配置 Windows 服务（可选）

**使用 NSSM (Non-Sucking Service Manager):**

1. 下载 [NSSM](https://nssm.cc/download)
2. 解压到项目目录

**安装服务:**
```powershell
# 以管理员身份运行 PowerShell
.\nssm.exe install QQFarmBot

# 在 GUI 中配置:
# Path: C:\path\to\pnpm.cmd
# Startup directory: C:\path\to\qq-farm-bot-ui
# Arguments: start
# Log on: Local System account
```

**或使用 NSSM 命令行:**
```powershell
.\nssm.exe set QQFarmBot Application "C:\path\to\pnpm.cmd"
.\nssm.exe set QQFarmBot ApplicationParameters "start"
.\nssm.exe set QQFarmBot AppDirectory "C:\path\to\qq-farm-bot-ui"
.\nssm.exe set QQFarmBot DisplayName "QQ 农场智能助手"
.\nssm.exe set QQFarmBot Description "QQ 农场自动化机器人"
.\nssm.exe set QQFarmBot StartService SERVICE_AUTO_START

# 启动服务
.\nssm.exe start QQFarmBot
```

---

## 🐳 方案三：Docker 部署

### 步骤 1: 安装 Docker

**Ubuntu/Debian:**
```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
docker -v
docker-compose -v
```

### 步骤 2: 准备配置文件

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  qq-farm-bot:
    image: qq-farm-bot:latest
    build:
      context: .
      dockerfile: core/Dockerfile
    container_name: qq-farm-bot
    restart: unless-stopped
    environment:
      - ADMIN_PASSWORD=your_strong_password
      - TZ=Asia/Shanghai
    ports:
      - "3080:3000"
    volumes:
      - ./data:/app/core/data
    networks:
      - farm-network

networks:
  farm-network:
    driver: bridge
```

**Dockerfile (如果自行构建):**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装 pnpm
RUN corepack enable

# 复制依赖文件
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY core/package.json ./core/
COPY web/package.json ./web/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建前端
RUN pnpm build:web

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["pnpm", "start"]
```

### 步骤 3: 构建并启动

```bash
# 构建镜像
docker-compose build

# 启动容器
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看状态
docker-compose ps
```

### 步骤 4: 管理容器

```bash
# 停止容器
docker-compose down

# 重启容器
docker-compose restart

# 进入容器
docker-compose exec qq-farm-bot sh

# 查看资源使用
docker stats qq-farm-bot
```

### 步骤 5: 更新容器

```bash
# 拉取最新代码
git pull

# 重新构建
docker-compose build --no-cache

# 重启容器
docker-compose up -d --force-recreate

# 清理旧镜像
docker image prune -f
```

---

## 📦 方案四：二进制文件部署

### 步骤 1: 下载二进制文件

从 [Releases](https://github.com/your-repo/qq-farm-bot-ui/releases) 下载对应平台的可执行文件：

- Windows: `qq-farm-bot-win-x64.exe`
- Linux: `qq-farm-bot-linux-x64`
- macOS Intel: `qq-farm-bot-macos-x64`
- macOS Apple Silicon: `qq-farm-bot-macos-arm64`

### 步骤 2: 创建目录结构

```bash
qq-farm-bot/
├── qq-farm-bot-linux-x64  # 可执行文件
├── data/                   # 数据目录（自动创建）
└── .env                    # 环境配置（可选）
```

### 步骤 3: 配置环境变量

**创建 .env 文件:**
```bash
ADMIN_PASSWORD=your_strong_password
PORT=3000
TZ=Asia/Shanghai
```

### 步骤 4: 设置执行权限（Linux/macOS）

```bash
chmod +x qq-farm-bot-linux-x64
```

### 步骤 5: 运行程序

**直接运行:**
```bash
./qq-farm-bot-linux-x64
```

**后台运行（Linux/macOS）:**
```bash
# 使用 nohup
nohup ./qq-farm-bot-linux-x64 > output.log 2>&1 &

# 或使用 screen
screen -S qq-farm
./qq-farm-bot-linux-x64
# 按 Ctrl+A, D 脱离 screen
```

### 步骤 6: 配置 systemd 服务（推荐）

参考方案一的 systemd 配置，修改 `ExecStart`:

```ini
ExecStart=/path/to/qq-farm-bot-linux-x64
```

---

## 🔀 Nginx 反向代理配置

### 安装 Nginx

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y nginx
```

**CentOS:**
```bash
sudo yum install -y nginx
```

### 配置 Nginx

**创建配置文件:**
```bash
sudo nano /etc/nginx/sites-available/qq-farm-bot
```

**配置内容:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 日志
    access_log /var/log/nginx/qq-farm-bot-access.log;
    error_log /var/log/nginx/qq-farm-bot-error.log;
    
    # 客户端真实 IP
    set_real_ip_from 0.0.0.0/0;
    real_ip_header X-Forwarded-For;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket 支持
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
    
    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
}
```

### 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/qq-farm-bot /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 🔒 HTTPS 配置

### 使用 Let's Encrypt（免费）

**安装 Certbot:**
```bash
# Ubuntu/Debian
sudo apt install -y certbot python3-certbot-nginx

# CentOS
sudo yum install -y certbot python3-certbot-nginx
```

**获取证书:**
```bash
sudo certbot --nginx -d your-domain.com
```

**自动续期:**
```bash
# 添加定时任务
sudo crontab -e

# 添加以下内容（每月 1 号凌晨 3 点检查续期）
0 3 1 * * certbot renew --quiet
```

### 配置 HTTPS

**Certbot 会自动更新 Nginx 配置:**
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # ... 其他配置 ...
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## ⚡ 性能优化

### 系统级优化

**Linux 文件描述符限制:**
```bash
# 编辑配置
sudo nano /etc/security/limits.conf

# 添加
www-data soft nofile 65536
www-data hard nofile 65536
```

**TCP 优化:**
```bash
# 编辑 sysctl.conf
sudo nano /etc/sysctl.conf

# 添加
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
```

### Node.js 优化

**使用 PM2 进程管理:**
```bash
# 安装 PM2
pnpm add -g pm2

# 启动应用
pm2 start core/client.js --name qq-farm-bot

# 开机自启
pm2 startup
pm2 save

# 监控
pm2 monit
```

### 数据库优化

**SQLite 优化配置:**
```javascript
// 已在代码中配置
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('cache_size = 10000');
```

**定期清理日志:**
```bash
# 添加 cron 任务
crontab -e

# 每天凌晨 3 点清理 30 天前的日志
0 3 * * * find /path/to/qq-farm-bot-ui -name "*.log" -mtime +30 -delete
```

---

## 📊 监控与日志

### 使用 PM2 监控

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs qq-farm-bot

# 查看详细信息
pm2 show qq-farm-bot

# 重启
pm2 restart qq-farm-bot
```

### 使用系统工具

**htop（进程监控）:**
```bash
sudo apt install htop
htop
```

**iotop（IO 监控）:**
```bash
sudo apt install iotop
sudo iotop
```

### 日志管理

**查看实时日志:**
```bash
# systemd 日志
sudo journalctl -u qq-farm-bot -f

# 应用日志
tail -f logs/app.log
```

**日志轮转:**
```bash
# 创建 logrotate 配置
sudo nano /etc/logrotate.d/qq-farm-bot

# 内容
/path/to/qq-farm-bot-ui/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
}
```

---

## 💾 备份与恢复

### 数据备份

**手动备份:**
```bash
# 备份数据目录
tar -czf qq-farm-backup-$(date +%Y%m%d).tar.gz \
    /path/to/qq-farm-bot-ui/data/

# 或使用 Docker 卷备份
docker-compose run --rm \
  -v $(pwd)/backup:/backup \
  qq-farm-bot tar -czf /backup/qq-farm-backup.tar.gz /app/core/data
```

**自动备份脚本:**
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/qq-farm-backup-$DATE.tar.gz"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据
tar -czf $BACKUP_FILE /path/to/qq-farm-bot-ui/data/

# 删除 30 天前的备份
find $BACKUP_DIR -name "qq-farm-backup-*.tar.gz" -mtime +30 -delete

echo "备份完成：$BACKUP_FILE"
```

**定时备份:**
```bash
# 添加 cron 任务
crontab -e

# 每天凌晨 2 点备份
0 2 * * * /path/to/backup.sh
```

### 数据恢复

**从备份恢复:**
```bash
# 停止服务
sudo systemctl stop qq-farm-bot

# 解压备份
tar -xzf qq-farm-backup-20260301.tar.gz -C /

# 启动服务
sudo systemctl start qq-farm-bot
```

**Docker 恢复:**
```bash
# 解压备份
tar -xzf qq-farm-backup.tar.gz

# 重启容器
docker-compose down
docker-compose up -d
```

---

## ❓ 常见问题

### Q1: 服务无法启动
**A:** 检查端口是否被占用：
```bash
# Linux
sudo lsof -i :3000

# Windows
netstat -ano | findstr :3000
```

### Q2: 内存占用过高
**A:** 检查 Worker 数量和日志量，适当减少并发账号数。

### Q3: 数据库锁死
**A:** 检查是否有多个进程同时写入，确保只有一个实例运行。

### Q4: WebSocket 连接失败
**A:** 检查 Nginx 配置，确保正确转发 Upgrade 头。

### Q5: 无法访问游戏服务器
**A:** 检查防火墙规则，确保出站访问未被阻止。

### Q6: Docker 容器无法启动
**A:** 检查日志：
```bash
docker-compose logs qq-farm-bot
```

### Q7: 如何重置管理员密码？
**A:** 修改环境变量 `ADMIN_PASSWORD` 后重启服务。

---

## 📚 相关文档

- [API 参考](./API_REFERENCE.md)
- [故障排除](./TROUBLESHOOTING.md)
- [配置模板](./CONFIG_TEMPLATES.md)

---

**最后更新**: 2026-03-01  
**维护人员**: QQ 农场智能助手团队
