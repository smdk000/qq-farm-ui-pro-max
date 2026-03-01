# QQ 农场智能助手 - 配置模板集

> 版本：v1.0  
> 更新日期：2026-03-01

---

## 📋 目录

- [环境变量模板](#环境变量模板)
- [Docker 配置模板](#docker-配置模板)
- [Nginx 配置模板](#nginx-配置模板)
- [systemd 服务模板](#systemd-服务模板)
- [自动化配置模板](#自动化配置模板)
- [偷菜过滤模板](#偷菜过滤模板)

---

## 🔧 环境变量模板

### 基础配置 (.env)

```bash
# 管理员密码（必须修改为强密码）
ADMIN_PASSWORD=your_strong_password_here

# 服务端口
PORT=3000

# 运行环境
NODE_ENV=production

# 时区
TZ=Asia/Shanghai

# 日志级别 (debug/info/warn/error)
LOG_LEVEL=info

# 数据目录
DATA_DIR=./data
```

### 高级配置 (.env.advanced)

```bash
# 基础配置
ADMIN_PASSWORD=your_strong_password
PORT=3000
NODE_ENV=production

# 性能优化
MAX_WORKERS=5          # 最大 Worker 数量
MEMORY_LIMIT=512       # 内存限制 (MB)
DB_CACHE_SIZE=10000    # 数据库缓存大小（页数）

# 自动化配置
AUTO_START_ACCOUNTS=true      # 启动时自动加载账号
ACCOUNT_OFFLINE_TIMEOUT=3600  # 账号离线超时（秒）
LOG_RETENTION_DAYS=30         # 日志保留天数

# 推送通知配置
PUSHOO_CHANNEL=bark           # 推送渠道
PUSHOO_TOKEN=your_token       # 推送 Token
PUSHOO_USER=your_user         # 推送用户

# 安全配置
SESSION_TIMEOUT=86400         # Session 超时（秒）
MAX_LOGIN_ATTEMPTS=5          # 最大登录尝试
```

---

## 🐳 Docker 配置模板

### docker-compose.yml（基础版）

```yaml
version: '3.8'

services:
  qq-farm-bot:
    image: qq-farm-bot:latest
    container_name: qq-farm-bot
    restart: unless-stopped
    environment:
      - ADMIN_PASSWORD=your_password
      - TZ=Asia/Shanghai
    ports:
      - "3080:3000"
    volumes:
      - ./data:/app/core/data
```

### docker-compose.yml（高级版）

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
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-changeme}
      - TZ=Asia/Shanghai
      - NODE_ENV=production
      - LOG_LEVEL=info
      - MAX_WORKERS=5
    ports:
      - "${PORT:-3080}:3000"
    volumes:
      - ./data:/app/core/data
      - ./logs:/app/core/logs
      - ./config:/app/core/config
    networks:
      - farm-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/ping"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M

networks:
  farm-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Dockerfile

```dockerfile
FROM node:20-alpine

# 安装必要工具
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

# 启用 pnpm
RUN corepack enable

WORKDIR /app

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

# 优化镜像大小
RUN pnpm prune --prod

# 创建数据目录
RUN mkdir -p /app/core/data

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/ping || exit 1

# 启动命令
CMD ["pnpm", "start"]
```

---

## 🌐 Nginx 配置模板

### 基础反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 完整配置（含 HTTPS）

```nginx
# HTTP 重定向
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 安全头
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # 日志
    access_log /var/log/nginx/qq-farm-access.log;
    error_log /var/log/nginx/qq-farm-error.log;

    # 客户端真实 IP
    set_real_ip_from 0.0.0.0/0;
    real_ip_header X-Forwarded-For;

    # 反向代理
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

        # WebSocket 超时
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # 缓冲区
        proxy_buffering off;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # 静态资源缓存
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
}
```

---

## 🔧 systemd 服务模板

### 基础服务配置

```ini
[Unit]
Description=QQ Farm Bot UI
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/qq-farm-bot-ui
Environment=NODE_ENV=production
Environment=ADMIN_PASSWORD=your_password
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 高级服务配置（安全增强）

```ini
[Unit]
Description=QQ Farm Bot UI
Documentation=https://github.com/your-repo/qq-farm-bot-ui
After=network.target remote-fs.target nss-lookup.target

[Service]
Type=simple
User=qq-farm-bot
Group=qq-farm-bot

# 工作目录
WorkingDirectory=/opt/qq-farm-bot-ui

# 环境变量
Environment=NODE_ENV=production
Environment=ADMIN_PASSWORD=your_password
Environment=LOG_LEVEL=info
Environment=TZ=Asia/Shanghai

# 启动命令
ExecStart=/usr/bin/pnpm start
ExecReload=/bin/kill -s HUP $MAINPID
ExecStop=/bin/kill -s TERM $MAINPID

# 重启策略
Restart=always
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=30

# 资源限制
LimitNOFILE=65536
LimitNPROC=4096
MemoryMax=1G
CPUQuota=200%

# 安全增强
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/qq-farm-bot-ui/data
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# 日志
StandardOutput=journal
StandardError=journal
SyslogIdentifier=qq-farm-bot

[Install]
WantedBy=multi-user.target
```

---

## ⚙️ 自动化配置模板

### 新手配置（保守）

```json
{
  "automation": {
    "enabled": true,
    "autoHarvest": true,
    "autoPlant": true,
    "autoWater": false,
    "autoWeed": true,
    "autoBug": false,
    "autoFertilize": false
  },
  "planting": {
    "strategy": "exp",
    "preferSeeds": ["101", "102"],
    "avoidExpensive": true
  },
  "stealFilter": {
    "enabled": false
  },
  "quietHours": {
    "enabled": true,
    "start": "23:00",
    "end": "08:00"
  }
}
```

### 进阶配置（高效）

```json
{
  "automation": {
    "enabled": true,
    "autoHarvest": true,
    "autoPlant": true,
    "autoWater": true,
    "autoWeed": true,
    "autoBug": true,
    "autoFertilize": true,
    "autoSell": true,
    "autoTaskClaim": true
  },
  "planting": {
    "strategy": "profit",
    "preferSeeds": [],
    "autoBuySeeds": true,
    "maxSeedCost": 1000
  },
  "stealFilter": {
    "enabled": true,
    "mode": "blacklist",
    "plantIds": ["105", "106"],
    "friendIds": ["friend_1", "friend_2"]
  },
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "07:00"
  },
  "antiSteal": {
    "enabled": true,
    "protectTime": 600
  }
}
```

### 专业配置（极限）

```json
{
  "automation": {
    "enabled": true,
    "autoHarvest": true,
    "autoPlant": true,
    "autoWater": true,
    "autoWeed": true,
    "autoBug": true,
    "autoFertilize": true,
    "autoSell": true,
    "autoTaskClaim": true,
    "autoHelp": true,
    "autoSteal": true
  },
  "planting": {
    "strategy": "exp_per_hour",
    "preferSeeds": [],
    "autoBuySeeds": true,
    "maxSeedCost": 5000,
    "useOrganicFertilizer": true
  },
  "stealFilter": {
    "enabled": true,
    "mode": "white list",
    "plantIds": ["101", "102", "103", "104"],
    "friendIds": [],
    "stealOnlyMature": true
  },
  "quietHours": {
    "enabled": false
  },
  "antiSteal": {
    "enabled": true,
    "protectTime": 60,
    "useQuickHarvest": true
  },
  "scheduler": {
    "enabled": true,
    "checkInterval": 300,
    "maxConcurrentOps": 3
  }
}
```

---

## 🎯 偷菜过滤模板

### 黑名单模板（不偷这些）

```json
{
  "mode": "blacklist",
  "plantIds": [
    "105",  // 玫瑰
    "106",  // 兰花
    "107",  // 仙人掌
    "201"   // 特殊作物
  ],
  "friendIds": [
    "123456",  // 好友 A
    "789012"   // 好友 B
  ]
}
```

### 白名单模板（只偷这些）

```json
{
  "mode": "whitelist",
  "plantIds": [
    "101",  // 胡萝卜
    "102",  // 番茄
    "103",  // 黄瓜
    "104"   // 玉米
  ],
  "friendIds": [],  // 空表示所有好友
  "stealOnlyMature": true,
  "skipJustPlanted": true
}
```

---

## 📚 使用建议

### 选择建议:
- **新手**: 使用基础配置，逐步开启功能
- **老手**: 使用进阶配置，最大化收益
- **专业**: 使用极限配置，但注意风险

### 注意事项:
1. 修改密码后重启服务
2. 定期备份配置文件
3. 根据服务器性能调整 Worker 数量
4. 生产环境务必启用 HTTPS

---

**最后更新**: 2026-03-01
