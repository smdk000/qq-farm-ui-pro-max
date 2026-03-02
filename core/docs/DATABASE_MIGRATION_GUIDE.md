# QQ 农场机器人 - 数据库升级指南

> 版本：v1.0  
> 日期：2026-02-28  

---

## 📋 目录

- [简介](#简介)
- [安装步骤](#安装步骤)
- [数据迁移](#数据迁移)
- [验证功能](#验证功能)
- [常见问题](#常见问题)
- [回滚方案](#回滚方案)

---

## 🎯 简介

本次升级将数据存储从 JSON 文件迁移到 SQLite 数据库，解决以下核心问题：

1. ✅ **账号设置持久化**：掉线重连后设置不丢失
2. ✅ **数据安全性**：ACID 事务保证，防止数据损坏
3. ✅ **性能提升**：查询速度提升 10-100 倍
4. ✅ **并发支持**：支持多账号同时操作

---

## 📦 安装步骤

### 1. 安装 SQLite 驱动

```bash
# 进入 core 目录
cd core

# 安装 better-sqlite3
pnpm add better-sqlite3
```

### 2. 备份数据（自动）

迁移脚本会自动备份原有 JSON 文件到 `data/backup/` 目录。

---

## 🔄 数据迁移

### 运行迁移脚本

```bash
# 在项目根目录执行
node core/scripts/migrate-to-sqlite.js
```

### 迁移过程

迁移脚本会执行以下步骤：

1. **备份旧文件** → `data/backup/*.timestamp`
2. **创建数据库** → `data/farm-bot.db`
3. **迁移账号数据**
4. **迁移配置数据**
5. **迁移用户数据**
6. **迁移卡密数据**

### 迁移成功示例输出

```
========================================
  QQ 农场机器人 - 数据迁移工具
========================================

📦 步骤 1: 备份旧数据文件...
  ✅ 已备份：data/store.json
  ✅ 已备份：data/accounts.json
  ✅ 已备份：data/users.json
  ✅ 已备份：data/cards.json
✅ 备份完成，共 4 个文件

📦 步骤 2: 初始化数据库...
  ✅ 数据库表结构创建成功

📦 步骤 3: 迁移账号数据...
  ✅ 迁移账号：12345678 (测试账号)
✅ 账号迁移完成，共 1 个账号

📦 步骤 4: 迁移配置数据...
  ✅ 迁移配置：12345678
✅ 配置迁移完成，共 1 条记录

📦 步骤 5: 迁移用户数据...
  ✅ 迁移用户：admin
✅ 用户迁移完成，共 1 个用户

📦 步骤 6: 迁移卡密数据...
  ✅ 迁移卡密：FARM-XXXX-XXXX
✅ 卡密迁移完成，共 3 个卡密

========================================
  ✅ 数据迁移完成！
  ⏱️  耗时：0.52 秒
========================================

📋 后续步骤：
  1. 验证数据完整性
  2. 重启服务
  3. 测试账号设置持久化功能
  4. 如有问题，可从备份恢复

💾 备份文件位置：data/backup
📄 数据库文件位置：data/farm-bot.db
```

---

## ✅ 验证功能

### 1. 启动服务

```bash
# 开发模式
pnpm dev

# 或生产模式
pnpm start
```

### 2. 测试设置持久化

1. 登录管理面板
2. 进入账号设置页面
3. 修改任意配置（如巡查间隔、种植策略等）
4. 点击保存
5. **重启服务**
6. 再次查看设置 → **应该保留之前的修改**

### 3. 检查数据库文件

```bash
# 查看数据库文件
ls -lh data/farm-bot.db

# 查看 WAL 文件（应该存在）
ls -lh data/farm-bot.db-wal
ls -lh data/farm-bot.db-shm
```

---

## ❓ 常见问题

### Q1: 迁移失败怎么办？

**A:** 检查以下几点：

1. 确保已安装 `better-sqlite3`
2. 确保 `data/` 目录有写权限
3. 确保服务未运行（数据库文件未被占用）
4. 查看详细错误信息

### Q2: 如何验证数据迁移成功？

**A:** 使用 SQLite 客户端查看：

```bash
# 安装 SQLite 客户端（如果还没有）
# macOS: brew install sqlite
# Windows: 下载 sqlite-tools
# Linux: apt install sqlite3

# 查看数据库
sqlite3 data/farm-bot.db

# 查看账号
SELECT * FROM accounts;

# 查看配置
SELECT * FROM account_configs;

# 退出
.exit
```

### Q3: 迁移后服务无法启动？

**A:** 检查日志：

```bash
# 查看应用日志
tail -f logs/app.log

# 查看数据库日志
tail -f logs/database.log
```

常见错误及解决：

- `Error: Cannot find module 'better-sqlite3'` → 未安装依赖
- `database is locked` → 服务正在运行，先停止
- `no such table: accounts` → 迁移未完成

---

## 🔙 回滚方案

如果迁移后遇到问题，可以从备份恢复：

### 方法一：自动回滚脚本

```bash
node core/scripts/rollback-from-sqlite.js
```

### 方法二：手动恢复

```bash
# 1. 停止服务
# 2. 删除数据库文件
rm data/farm-bot.db*

# 3. 恢复备份
cp data/backup/accounts.json.* data/accounts.json
cp data/backup/store.json.* data/store.json
cp data/backup/users.json.* data/users.json
cp data/backup/cards.json.* data/cards.json

# 4. 重启服务
pnpm start
```

---

## 📊 数据库表结构

### 核心表

| 表名 | 说明 | 用途 |
|------|------|------|
| `accounts` | 账号表 | 存储 QQ 账号信息 |
| `account_configs` | 配置表 | **核心！存储账号设置** |
| `users` | 用户表 | 管理面板用户 |
| `cards` | 卡密表 | 卡密信息 |
| `account_friend_blacklist` | 好友黑名单 | 不偷的好友列表 |
| `account_plant_filter` | 植物过滤 | 不偷的作物列表 |

### 配置表字段说明

`account_configs` 表包含所有账号设置：

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `automation_farm` | 自动农场巡查 | true |
| `automation_friend` | 自动好友互动 | true |
| `automation_friend_steal` | 自动偷菜 | true |
| `automation_friend_help` | 自动帮忙 | true |
| `planting_strategy` | 种植策略 | 'preferred' |
| `preferred_seed_id` | 偏好种子 ID | 0 |
| `interval_farm` | 农场巡查间隔（分钟） | 2 |
| `interval_friend` | 好友互动间隔（分钟） | 10 |
| `steal_filter_enabled` | 偷菜过滤开关 | false |
| `steal_filter_mode` | 过滤模式 | 'blacklist' |

---

## 🎯 升级后的新功能

### 1. 配置历史查询

```javascript
const accountRepo = require('./src/repositories/account-repository');

// 获取配置变更历史
const history = accountRepo.getConfigHistory(accountId, 10);
console.log(history);
```

### 2. 配置审计日志

所有配置变更都会记录到 `config_audit_log` 表，包含：

- 变更前配置（JSON）
- 变更后配置（JSON）
- 变更人
- 变更时间

### 3. 未来计划

- [ ] 配置模板系统
- [ ] 一键应用配置到多个账号
- [ ] 配置智能推荐
- [ ] 数据统计分析

---

## 📞 技术支持

如有问题，请查看：

- **完整计划文档**：`docs/DATABASE_UPGRADE_PLAN.md`
- **应用日志**：`logs/app.log`
- **数据库日志**：`logs/database.log`

---

## 📝 更新日志

### v1.0 (2026-02-28)

- ✅ 创建 SQLite 数据库
- ✅ 迁移账号配置数据
- ✅ 实现设置持久化
- ✅ 提供回滚方案

---

**文档结束**
