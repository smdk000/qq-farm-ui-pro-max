# QQ 农场智能助手 - 部署文档

## 📋 目录

- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [源码部署](#源码部署)
- [Docker 部署](#docker-部署)
- [配置说明](#配置说明)
- [用户指南](#用户指南)
- [常见问题](#常见问题)

---

## 系统要求

### 基本配置
- **Node.js**: 20+ (推荐使用 pnpm)
- **操作系统**: Windows / Linux / macOS
- **内存**: 最低 512MB，推荐 1GB+
- **存储**: 100MB+ 可用空间

### 浏览器要求
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/Penty-d/qq-farm-bot-ui.git
cd qq-farm-bot-ui

# 2. 配置管理员密码（可选）
# 编辑 docker-compose.yml，设置 ADMIN_PASSWORD 环境变量

# 3. 启动服务
docker compose up -d --build

# 4. 查看日志
docker compose logs -f

# 5. 访问面板
# http://localhost:3080
```

### 方式二：源码部署

```bash
# 1. 安装 Node.js 20+
# 访问 https://nodejs.org/ 下载安装

# 2. 启用 pnpm
corepack enable

# 3. 克隆项目
git clone https://github.com/Penty-d/qq-farm-bot-ui.git
cd qq-farm-bot-ui

# 4. 安装依赖
pnpm install

# 5. 构建前端
pnpm build:web

# 6. 启动服务
pnpm dev:core

# 7. 访问面板
# http://localhost:3000
```

---

## 源码部署（详细步骤）

### Windows 系统

#### 1. 安装 Node.js
1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载并安装 LTS 版本（20.x）
3. 验证安装：
```powershell
node -v
npm -v
```

#### 2. 启用 pnpm
```powershell
corepack enable
pnpm -v
```

#### 3. 安装项目依赖
```powershell
cd D:\Projects\qq-farm-bot-ui
pnpm install
```

#### 4. 构建前端
```powershell
pnpm build:web
```

#### 5. 启动服务
```powershell
# 基本启动
pnpm dev:core

# 设置管理员密码后启动
$env:ADMIN_PASSWORD="你的强密码"
pnpm dev:core
```

#### 6. 访问面板
- 本地访问：`http://localhost:3000`
- 局域网访问：`http://<你的 IP>:3000`

### Linux 系统（Ubuntu/Debian）

#### 1. 安装 Node.js 20+
```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable
```

#### 2. 验证安装
```bash
node -v
pnpm -v
```

#### 3. 安装项目
```bash
cd /path/to/qq-farm-bot-ui
pnpm install
pnpm build:web
```

#### 4. 启动服务
```bash
# 基本启动
pnpm dev:core

# 设置管理员密码
ADMIN_PASSWORD='你的强密码' pnpm dev:core
```

#### 5. 后台运行（使用 systemd）
创建服务文件 `/etc/systemd/system/qq-farm-bot.service`：

```ini
[Unit]
Description=QQ Farm Bot
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/qq-farm-bot-ui
Environment=ADMIN_PASSWORD=你的密码
ExecStart=/usr/bin/pnpm dev:core
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable qq-farm-bot
sudo systemctl start qq-farm-bot
sudo systemctl status qq-farm-bot
```

### macOS 系统

#### 1. 安装 Node.js
```bash
# 使用 Homebrew
brew install node@20
corepack enable
```

#### 2. 安装项目
```bash
cd /path/to/qq-farm-bot-ui
pnpm install
pnpm build:web
pnpm dev:core
```

---

## Docker 部署（详细说明）

### 准备工作

确保已安装 Docker 和 Docker Compose：

```bash
# 检查 Docker 版本
docker --version
docker compose version
```

### 配置文件

#### docker-compose.yml

```yaml
services:
  qq-farm-bot-ui:
    build:
      context: .
      dockerfile: core/Dockerfile
    container_name: qq-farm-bot-ui
    restart: unless-stopped
    environment:
      # 管理员密码（强烈建议修改！）
      ADMIN_PASSWORD: qq007qq008
      # 时区设置
      TZ: Asia/Shanghai
    ports:
      # 外部访问端口:容器内部端口
      - "3080:3000"
    volumes:
      # 数据持久化
      - ./data:/app/core/data
```

### 部署步骤

#### 1. 构建并启动
```bash
docker compose up -d --build
```

#### 2. 查看日志
```bash
# 实时查看日志
docker compose logs -f

# 查看最近 100 行
docker compose logs --tail=100
```

#### 3. 停止服务
```bash
docker compose down
```

#### 4. 重启服务
```bash
docker compose restart
```

#### 5. 更新版本
```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose up -d --build
```

### 数据持久化

数据目录映射：

| 宿主机路径 | 容器内路径 | 说明 |
|-----------|-----------|------|
| `./data` | `/app/core/data` | 数据目录 |

数据文件：
- `data/accounts.json` - 账号数据
- `data/store.json` - 配置数据
- `data/users.json` - 用户数据（多用户模式）
- `data/cards.json` - 卡密数据（多用户模式）

### 端口配置

修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "自定义端口:3000"
```

例如，使用 8080 端口：
```yaml
ports:
  - "8080:3000"
```

---

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 示例 |
|--------|------|--------|------|
| `ADMIN_PASSWORD` | 管理员密码 | `admin` | `your_password` |
| `TZ` | 时区 | `UTC` | `Asia/Shanghai` |
| `PORT` | 服务端口 | `3000` | `3000` |

### 配置文件

#### store.json - 全局配置

```json
{
  "accountConfigs": {},        // 账号配置
  "ui": {
    "theme": "dark"           // 主题：dark/light
  },
  "offlineReminder": {        // 下线提醒配置
    "channel": "webhook",
    "token": "",
    "title": "账号下线提醒",
    "msg": "账号已下线"
  },
  "adminPasswordHash": ""     // 管理员密码哈希
}
```

#### accounts.json - 账号数据

```json
{
  "accounts": [
    {
      "id": "1",
      "name": "账号 1",
      "code": "登录 code",
      "platform": "qq",
      "uin": "QQ 号",
      "avatar": "头像 URL"
    }
  ],
  "nextId": 2
}
```

#### users.json - 用户数据（多用户模式）

```json
{
  "users": [
    {
      "username": "admin",
      "password": "密码哈希",
      "role": "admin",
      "card": {
        "code": "卡密",
        "type": "M",
        "days": 30,
        "expiresAt": 1234567890000,
        "enabled": true
      }
    }
  ]
}
```

### 自动化配置

每个账号可独立配置自动化策略：

```json
{
  "automation": {
    "farm": true,              // 自动种植收获
    "task": true,              // 自动任务
    "sell": true,              // 自动出售
    "friend": true,            // 好友互动
    "friend_steal": true,      // 自动偷菜
    "friend_help": true,       // 自动帮忙
    "friend_bad": false,       // 自动捣乱
    "email": true,             // 自动领取邮件
    "fertilizer_gift": false,  // 自动填充化肥
    "fertilizer_buy": false    // 自动购买化肥
  },
  "intervals": {
    "farmMin": 2,              // 农场巡查最小间隔（秒）
    "farmMax": 2,              // 农场巡查最大间隔（秒）
    "friendMin": 10,           // 好友巡查最小间隔（秒）
    "friendMax": 10            // 好友巡查最大间隔（秒）
  },
  "friendQuietHours": {        // 好友静默时段
    "enabled": false,
    "start": "23:00",
    "end": "07:00"
  },
  "stealFilter": {             // 偷菜过滤
    "enabled": false,
    "mode": "blacklist",       // blacklist/whitelist
    "plantIds": []             // 植物 ID 列表
  }
}
```

---

## 用户指南

### 首次使用

#### 1. 登录管理面板
- 访问：`http://localhost:3000`
- 默认管理员账号：`admin` / `admin`
- **强烈建议首次登录后修改密码！**

#### 2. 添加账号
1. 点击侧边栏"账号"
2. 点击"添加账号"
3. 选择登录方式：
   - **扫码登录**：使用 QQ 扫描二维码
   - **手动输入**：输入获取到的 Code

#### 3. 配置自动化
1. 进入"设置"页面
2. 选择要配置的账号
3. 配置种植策略
4. 设置巡查间隔
5. 启用自动化功能
6. 保存设置

#### 4. 启动账号
1. 进入"账号"页面
2. 找到要启动的账号
3. 点击启动按钮
4. 查看运行日志

### 多用户模式

#### 管理员操作

##### 生成卡密
1. 登录管理员账号
2. 进入"卡密"页面
3. 点击"生成卡密"
4. 选择卡密类型（天卡/周卡/月卡/永久卡）
5. 设置天数和数量
6. 生成并分发卡密

##### 用户管理
1. 进入"用户"页面
2. 查看用户列表
3. 编辑用户（修改到期时间、启用/封禁）
4. 删除用户（普通用户）

#### 普通用户操作

##### 注册账号
1. 在登录页面切换到"注册"标签
2. 输入用户名和密码
3. 输入卡密
4. 点击"注册并登录"

##### 续费账号
1. 登录后在 Dashboard 查看用户信息
2. 点击"续费"按钮
3. 输入新卡密
4. 确认续费

### 偷菜过滤配置

#### 设置偷菜过滤
1. 进入"设置"页面
2. 选择账号
3. 找到"偷菜过滤设置"
4. 启用偷菜过滤
5. 选择过滤模式：
   - **黑名单**：不偷选中的蔬菜
   - **白名单**：只偷选中的蔬菜
6. 勾选蔬菜
7. 保存设置

#### 设置好友过滤
1. 进入"设置"页面
2. 选择账号
3. 找到"偷好友过滤设置"
4. 启用好友过滤
5. 选择过滤模式
6. 勾选好友（需先加载好友列表）
7. 保存设置

---

## 常见问题

### Q1: 无法访问管理面板

**解决方案**：
1. 检查服务是否启动
2. 检查端口是否被占用
3. 检查防火墙设置
4. 尝试使用 `http://127.0.0.1:3000` 访问

### Q2: 忘记密码

**解决方案**：
```bash
# 删除 store.json 重置配置
rm data/store.json

# 重启服务
pnpm dev:core
# 或
docker compose restart
```

### Q3: 账号登录失败

**解决方案**：
1. 检查 Code 是否正确
2. 重新获取 Code
3. 检查网络连接
4. 查看错误日志

### Q4: Docker 部署数据丢失

**解决方案**：
1. 确保正确挂载数据卷
2. 检查 `./data` 目录权限
3. 不要删除 `docker-compose.yml` 中的 volumes 配置

### Q5: 多用户模式无法注册

**解决方案**：
1. 检查卡密是否有效
2. 确认卡密未被使用
3. 查看后端日志
4. 联系管理员

### Q6: 偷菜过滤不生效

**解决方案**：
1. 确认已启用过滤功能
2. 检查过滤模式设置
3. 确认已选择蔬菜/好友
4. 保存设置后重启账号

### Q7: 内存占用过高

**解决方案**：
```bash
# 限制 Node.js 内存
export NODE_OPTIONS="--max-old-space-size=512"
pnpm dev:core
```

或在 Docker 中：
```yaml
services:
  qq-farm-bot-ui:
    deploy:
      resources:
        limits:
          memory: 512M
```

---

## 安全建议

### 1. 修改默认密码
```bash
# Docker 部署
# 编辑 docker-compose.yml，设置 ADMIN_PASSWORD

# 源码部署
export ADMIN_PASSWORD="你的强密码"
pnpm dev:core
```

### 2. 配置防火墙
```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 3. 使用 HTTPS（生产环境）
配置反向代理（Nginx 示例）：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. 定期备份数据
```bash
# 备份脚本示例
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
cp -r data $BACKUP_DIR/data_$DATE
```

---

## 技术支持

- **GitHub Issues**: [提交问题](https://github.com/Penty-d/qq-farm-bot-ui/issues)
- **官方文档**: [查看文档](https://github.com/Penty-d/qq-farm-bot-ui)
- **讨论区**: [参与讨论](https://github.com/Penty-d/qq-farm-bot-ui/discussions)

---

## 更新日志

查看 [Update.log](./Update.log) 了解最新版本信息。

---

## 免责声明

本项目仅供学习与研究用途。使用本工具可能违反游戏服务条款，由此产生的一切后果由使用者自行承担。
