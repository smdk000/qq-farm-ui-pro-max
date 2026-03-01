# QQ 农场智能助手 - 故障排除手册

> 版本：v1.0  
> 更新日期：2026-03-01

---

## 🔍 快速诊断流程

### 1. 服务无法启动

**症状:** 运行启动命令后立即退出或报错

**检查步骤:**
```bash
# 1. 检查 Node.js 版本
node -v  # 必须 >= v20

# 2. 检查端口占用
lsof -i :3000  # Linux/macOS
netstat -ano | findstr :3000  # Windows

# 3. 查看错误日志
tail -f logs/app.log

# 4. 检查依赖
pnpm install --force
```

**常见错误:**
- `EADDRINUSE`: 端口被占用 → 修改 PORT 环境变量
- `Cannot find module`: 依赖缺失 → `pnpm install`
- `Permission denied`: 权限不足 → `chmod +x` 或使用 sudo

---

### 2. 账号无法登录

**症状:** 扫码后无法登录或提示认证失败

**解决方案:**
1. 检查网络连接
2. 清除浏览器缓存
3. 重新生成二维码
4. 检查系统时间是否准确
5. 查看日志中的详细错误信息

---

### 3. 账号频繁掉线

**症状:** 账号启动后不久自动停止

**可能原因:**
- 网络不稳定
- 账号被官方检测
- 操作频率过高

**解决方案:**
1. 检查网络延迟
2. 降低自动化频率
3. 添加随机延迟
4. 避免高峰时段操作

---

### 4. 数据库错误

**症状:** 提示 "database is locked" 或 "corrupt"

**解决方案:**
```bash
# 1. 停止服务
sudo systemctl stop qq-farm-bot

# 2. 备份数据
cp data/farm-bot.db data/farm-bot.db.backup

# 3. 尝试修复
sqlite3 data/farm-bot.db "PRAGMA integrity_check;"

# 4. 如果损坏严重，从备份恢复
cp data/backup/farm-bot-*.db data/farm-bot.db

# 5. 重启服务
sudo systemctl start qq-farm-bot
```

---

### 5. WebSocket 连接失败

**症状:** 前端无法连接实时日志

**检查 Nginx 配置:**
```nginx
location / {
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
}
```

**检查防火墙:**
```bash
# 确保 WebSocket 端口开放
sudo ufw allow 3000/tcp
```

---

### 6. 内存泄漏

**症状:** 内存占用持续增长

**解决方案:**
1. 使用 PM2 管理进程
2. 设置内存限制自动重启
```bash
pm2 start qq-farm-bot --max-memory-restart 500M
```
3. 检查 Worker 数量是否过多
4. 定期清理日志文件

---

### 7. CPU 占用过高

**可能原因:**
- Worker 数量过多
- 日志量过大
- 频繁的文件 IO

**优化方案:**
1. 减少并发账号数
2. 启用日志清理
3. 使用 SSD 硬盘
4. 降低日志级别

---

## 📊 日志分析

### 日志级别说明

- `ERROR`: 错误，需要立即处理
- `WARN`: 警告，可能影响功能
- `INFO`: 信息，正常运行日志
- `DEBUG`: 调试，详细执行过程

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| `AUTH_FAILED` | 认证失败 | 重新登录 |
| `NETWORK_ERROR` | 网络错误 | 检查网络 |
| `DATABASE_LOCKED` | 数据库锁 | 重启服务 |
| `ACCOUNT_OFFLINE` | 账号离线 | 检查账号状态 |
| `API_TIMEOUT` | 接口超时 | 稍后重试 |

---

## 🔧 调试技巧

### 启用调试模式

```bash
# 设置环境变量
export DEBUG=true
export LOG_LEVEL=debug

# 重启服务
pnpm start
```

### 抓取问题现场

```bash
# 保存当前日志
journalctl -u qq-farm-bot > issue.log

# 抓取进程信息
ps aux | grep qq-farm >> issue.log

# 网络状态
netstat -tlnp >> issue.log
```

---

## 📞 获取帮助

### 提供以下信息:
1. 系统版本和 Node.js 版本
2. 完整的错误日志
3. 问题复现步骤
4. 已尝试的解决方案

### 联系方式:
- GitHub Issues
- 项目讨论区
- 开发者邮箱

---

**最后更新**: 2026-03-01
