# 🚀 AI 服务自动启动 - 快速参考

## ⚡ 30 秒快速开始

### 第一次使用

```bash
# 1. 安装 Python 依赖
cd openviking-service
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..

# 2. 启动项目（就像往常一样）
pnpm start
```

### 以后每次使用

```bash
# 直接启动即可！AI 服务会自动运行
pnpm start
```

## 📋 常用命令

```bash
# 查看状态
pnpm status:ai

# 启动服务
pnpm start:ai

# 停止服务
pnpm stop:ai

# 重启服务
pnpm restart:ai

# 查看日志
pnpm logs:ai

# 运行测试
pnpm test:ai
```

## 🎯 核心功能

### ✅ 已实现

- **自动启动**: 启动主程序时自动启动 AI 服务
- **进程守护**: 崩溃自动重启（最多 5 次）
- **健康检查**: 每 30 秒检查一次
- **后台运行**: 完全无感知，不影响主程序
- **日志记录**: 详细的运行日志
- **开机自启**: 支持 macOS/Linux/Windows

### 🎉 无需操作

- ❌ 不需要手动启动 AI 服务
- ❌ 不需要额外配置
- ❌ 不需要担心服务状态
- ❌ 失败不影响主程序

## 📊 监控状态

### 命令行

```bash
# 快速查看
node ai-autostart.js status

# 实时日志
tail -f logs/ai-services.log
```

### Web 面板

访问：`http://localhost:3000/api/ai/status`

## 🔧 故障排查

### 服务未启动？

```bash
# 手动启动
node ai-autostart.js start

# 查看日志
tail -f logs/ai-autostart.log
```

### 服务异常？

```bash
# 重启服务
node ai-autostart.js restart

# 查看错误
tail -f logs/ai-services-error.log
```

### 需要帮助？

```bash
# 运行测试
pnpm test:ai

# 查看完整文档
cat AUTO-START-GUIDE.md
```

## 📁 重要文件

```
ai-services-daemon.js     # 守护进程
ai-autostart.js           # 自动启动器
logs/ai-services.log      # 运行日志
AUTO-START-GUIDE.md       # 详细文档
```

## 💡 提示

1. **正常使用**: 直接 `pnpm start` 即可
2. **查看状态**: 使用 `pnpm status:ai`
3. **查看日志**: 使用 `pnpm logs:ai`
4. **遇到问题**: 查看 `AUTO-START-GUIDE.md`

---

**就这么简单！享受 AI 辅助编程的乐趣吧！** 🎉
