# QQ 农场机器人 - 数据库存储优化方案

> 文档版本：v1.0  
> 创建日期：2026-02-28  
> 最后更新：2026-02-28  

---

## 📋 目录

- [现状分析](#现状分析)
- [解决方案对比](#解决方案对比)
- [推荐方案：SQLite 数据库升级](#推荐方案 sqlite-数据库升级)
- [详细实施计划](#详细实施计划)
- [预期效果](#预期效果)
- [更高层次的建议](#更高层次的建议)
- [实施时间表](#实施时间表)
- [快速开始](#快速开始)

---

## 🔍 现状分析

### 当前架构

- **前端**：Vue 3.5 + TypeScript + Pinia + UnoCSS
- **后端**：Node.js + Express + Socket.IO
- **存储方式**：JSON 文件存储（`store.json`、`accounts.json`、`users.json`）

### 核心问题

1. ❌ **账号设置无法持久化**：掉线重连后设置丢失
2. ❌ **数据同步问题**：前端设置与后端存储不同步
3. ❌ **并发安全性差**：JSON 文件读写无事务保护
4. ❌ **查询效率低**：无索引，数据量大时性能差
5. ❌ **扩展性受限**：难以支持复杂查询和数据分析

### 需要持久化的数据

根据代码分析，需要持久化的数据包括：

- ✅ 账号配置（automation、plantingStrategy、intervals 等）
- ✅ 用户信息（users.json）
- ✅ 卡密数据（cards.json）
- ✅ UI 主题设置
- ✅ 好友黑名单/白名单
- ✅ 偷菜过滤配置
- ✅ 操作日志

---

## 💡 解决方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **方案 A：SQLite** | 轻量、零配置、ACID 事务、支持 SQL | 需要学习 SQL | ⭐⭐⭐⭐⭐ |
| **方案 B：LowDB** | JSON 格式、API 简单、无需迁移 | 性能一般、无事务 | ⭐⭐⭐ |
| **方案 C：NeDB** | MongoDB API、内存数据库 | 已停止维护 | ⭐⭐ |
| **方案 D：保持 JSON + 优化** | 改动最小 | 无法根本解决问题 | ⭐⭐ |

---

## 🎯 推荐方案：SQLite 数据库升级

### 选择理由

1. ✅ **零配置**：无需安装数据库服务，单文件数据库
2. ✅ **事务安全**：ACID 保证数据一致性
3. ✅ **性能优秀**：支持索引，查询速度快
4. ✅ **易于迁移**：从 JSON 迁移简单
5. ✅ **扩展性强**：支持复杂查询、报表统计
6. ✅ **社区活跃**：Node.js 生态成熟（better-sqlite3）

---

## 📝 详细实施计划

### 阶段一：数据库设计与依赖安装（1-2 天）

#### 1.1 安装依赖

```bash
# 进入 core 目录
cd core

# 安装 SQLite 驱动
pnpm add better-sqlite3

# 安装数据库迁移工具（可选但推荐）
pnpm add -D db-migrate db-migrate-sqlite3
```

#### 1.2 数据库表结构设计

**文件路径**：`core/src/database/migrations/001-init.sql`

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',  -- 'admin' | 'user'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 卡密表
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,  -- D|W|M|F
  description TEXT,
  used_by INTEGER,     -- users.id
  enabled BOOLEAN DEFAULT true,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (used_by) REFERENCES users(id)
);

-- 账号表
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uin TEXT UNIQUE NOT NULL,  -- QQ 号
  nick TEXT,
  name TEXT,  -- 备注名
  platform TEXT DEFAULT 'qq',  -- qq|wx
  running BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 账号配置表（核心！解决设置丢失问题）
CREATE TABLE IF NOT EXISTS account_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  
  -- 自动化开关
  automation_farm BOOLEAN DEFAULT true,
  automation_farm_push BOOLEAN DEFAULT true,
  automation_land_upgrade BOOLEAN DEFAULT true,
  automation_friend BOOLEAN DEFAULT true,
  automation_friend_help_exp_limit BOOLEAN DEFAULT true,
  automation_friend_steal BOOLEAN DEFAULT true,
  automation_friend_help BOOLEAN DEFAULT true,
  automation_friend_bad BOOLEAN DEFAULT false,
  automation_task BOOLEAN DEFAULT true,
  automation_email BOOLEAN DEFAULT true,
  automation_fertilizer_gift BOOLEAN DEFAULT false,
  automation_fertilizer_buy BOOLEAN DEFAULT false,
  automation_free_gifts BOOLEAN DEFAULT true,
  automation_share_reward BOOLEAN DEFAULT true,
  automation_vip_gift BOOLEAN DEFAULT true,
  automation_month_card BOOLEAN DEFAULT true,
  automation_open_server_gift BOOLEAN DEFAULT true,
  automation_sell BOOLEAN DEFAULT true,
  automation_fertilizer TEXT DEFAULT 'none',
  
  -- 种植策略
  planting_strategy TEXT DEFAULT 'preferred',
  preferred_seed_id INTEGER DEFAULT 0,
  
  -- 时间间隔
  interval_farm INTEGER DEFAULT 2,
  interval_friend INTEGER DEFAULT 10,
  interval_farm_min INTEGER DEFAULT 2,
  interval_farm_max INTEGER DEFAULT 2,
  interval_friend_min INTEGER DEFAULT 10,
  interval_friend_max INTEGER DEFAULT 10,
  
  -- 好友静默时段
  friend_quiet_hours_enabled BOOLEAN DEFAULT false,
  friend_quiet_hours_start TEXT DEFAULT '23:00',
  friend_quiet_hours_end TEXT DEFAULT '07:00',
  
  -- 偷菜过滤
  steal_filter_enabled BOOLEAN DEFAULT false,
  steal_filter_mode TEXT DEFAULT 'blacklist',  -- 'blacklist' | 'whitelist'
  
  -- 偷好友过滤
  steal_friend_filter_enabled BOOLEAN DEFAULT false,
  steal_friend_filter_mode TEXT DEFAULT 'blacklist',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 好友黑名单表
CREATE TABLE IF NOT EXISTS account_friend_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  friend_id TEXT NOT NULL,
  friend_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, friend_id)
);

-- 偷菜植物过滤表
CREATE TABLE IF NOT EXISTS account_plant_filter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  plant_id INTEGER NOT NULL,
  plant_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, plant_id)
);

-- 偷好友过滤表
CREATE TABLE IF NOT EXISTS account_friend_steal_filter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  friend_id TEXT NOT NULL,
  friend_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, friend_id)
);

-- UI 设置表
CREATE TABLE IF NOT EXISTS ui_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  theme TEXT DEFAULT 'dark',  -- 'light' | 'dark' | 'auto'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 操作日志表（可选，用于分析）
CREATE TABLE IF NOT EXISTS operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  action TEXT NOT NULL,
  result TEXT,
  details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 配置变更审计日志
CREATE TABLE IF NOT EXISTS config_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  old_config JSON,
  new_config JSON,
  changed_by TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_accounts_uin ON accounts(uin);
CREATE INDEX IF NOT EXISTS idx_account_configs_account_id ON account_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_cards_code ON cards(code);
CREATE INDEX IF NOT EXISTS idx_operation_logs_account_id ON operation_logs(account_id);
CREATE INDEX IF NOT EXISTS idx_friend_blacklist_account_id ON account_friend_blacklist(account_id);
CREATE INDEX IF NOT EXISTS idx_plant_filter_account_id ON account_plant_filter(account_id);
```

---

### 阶段二：数据库层实现（2-3 天）

#### 2.1 创建数据库服务

**文件路径**：`core/src/services/database.js`

```javascript
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getDataFile } = require('../config/runtime-paths');
const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('database');
const DB_PATH = getDataFile('farm-bot.db');

let db = null;

/**
 * 初始化数据库
 */
function initDatabase() {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL'); // 性能优化：Write-Ahead Logging
        db.pragma('foreign_keys = ON');  // 启用外键约束
        db.pragma('cache_size = 10000'); // 缓存大小（页）
        db.pragma('temp_store = MEMORY'); // 临时存储使用内存
        
        // 运行迁移
        runMigrations();
        
        logger.info(`数据库初始化成功：${DB_PATH}`);
        return db;
    } catch (error) {
        logger.error('数据库初始化失败:', error);
        throw error;
    }
}

/**
 * 运行数据库迁移
 */
function runMigrations() {
    try {
        const migrationPath = path.join(__dirname, '../database/migrations/001-init.sql');
        if (!fs.existsSync(migrationPath)) {
            logger.warn('迁移文件不存在，跳过迁移');
            return;
        }
        
        const sql = fs.readFileSync(migrationPath, 'utf8');
        db.exec(sql);
        logger.info('数据库迁移完成');
    } catch (error) {
        logger.error('数据库迁移失败:', error);
        throw error;
    }
}

/**
 * 获取数据库实例
 */
function getDb() {
    if (!db) {
        throw new Error('数据库未初始化');
    }
    return db;
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
    if (db) {
        try {
            db.close();
            logger.info('数据库已关闭');
        } catch (error) {
            logger.error('关闭数据库失败:', error);
        } finally {
            db = null;
        }
    }
}

/**
 * 执行事务（便捷方法）
 */
function transaction(fn) {
    const database = getDb();
    return database.transaction(fn)();
}

module.exports = {
    initDatabase,
    getDb,
    closeDatabase,
    transaction,
};
```

#### 2.2 创建数据访问层（DAL）

**文件路径**：`core/src/repositories/account-repository.js`

```javascript
const { getDb, transaction } = require('../services/database');
const { createModuleLogger } = require('../services/logger');

const logger = createModuleLogger('account-repository');

class AccountRepository {
    /**
     * 获取所有账号（含配置）
     */
    findAll() {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT 
                    a.id,
                    a.uin,
                    a.nick,
                    a.name,
                    a.platform,
                    a.running,
                    a.created_at,
                    a.updated_at,
                    c.automation_farm,
                    c.automation_friend,
                    c.automation_friend_steal,
                    c.automation_friend_help,
                    c.planting_strategy,
                    c.preferred_seed_id,
                    c.interval_farm,
                    c.interval_friend,
                    c.steal_filter_enabled,
                    c.steal_filter_mode
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                ORDER BY a.created_at DESC
            `);
            return stmt.all();
        } catch (error) {
            logger.error('查询所有账号失败:', error);
            throw error;
        }
    }

    /**
     * 根据 ID 查找账号
     */
    findById(id) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT a.*, c.*
                FROM accounts a
                LEFT JOIN account_configs c ON a.id = c.account_id
                WHERE a.id = ?
            `);
            return stmt.get(id);
        } catch (error) {
            logger.error('根据 ID 查询账号失败:', error);
            throw error;
        }
    }

    /**
     * 根据 UIN 查找账号
     */
    findByUin(uin) {
        try {
            const db = getDb();
            const stmt = db.prepare('SELECT * FROM accounts WHERE uin = ?');
            return stmt.get(uin);
        } catch (error) {
            logger.error('根据 UIN 查询账号失败:', error);
            throw error;
        }
    }

    /**
     * 创建账号（含默认配置）
     */
    create(accountData) {
        try {
            const db = getDb();
            
            return transaction(() => {
                // 1. 插入账号
                const insertAccount = db.prepare(`
                    INSERT INTO accounts (uin, nick, name, platform, running)
                    VALUES (?, ?, ?, ?, ?)
                `);
                
                const accountResult = insertAccount.run(
                    accountData.uin,
                    accountData.nick || '',
                    accountData.name || '',
                    accountData.platform || 'qq',
                    false
                );
                
                const accountId = accountResult.lastInsertRowid;
                
                // 2. 插入默认配置
                const insertConfig = db.prepare(`
                    INSERT INTO account_configs (account_id)
                    VALUES (?)
                `);
                
                insertConfig.run(accountId);
                
                logger.info(`创建账号成功：${accountData.uin}, ID: ${accountId}`);
                
                return { id: accountId, ...accountData };
            });
        } catch (error) {
            logger.error('创建账号失败:', error);
            throw error;
        }
    }

    /**
     * 更新账号配置
     */
    updateConfig(accountId, configData) {
        try {
            const db = getDb();
            
            // 构建动态更新语句
            const fields = Object.keys(configData);
            if (fields.length === 0) {
                return { changes: 0 };
            }
            
            const setClause = fields.map(f => `${f} = ?`).join(', ');
            const stmt = db.prepare(`
                UPDATE account_configs 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP
                WHERE account_id = ?
            `);
            
            const values = fields.map(f => configData[f]);
            values.push(accountId);
            
            const result = stmt.run(...values);
            
            logger.info(`更新账号配置成功：${accountId}, 影响行数：${result.changes}`);
            
            return result;
        } catch (error) {
            logger.error('更新账号配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取账号配置
     */
    getConfig(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare('SELECT * FROM account_configs WHERE account_id = ?');
            return stmt.get(accountId);
        } catch (error) {
            logger.error('获取账号配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取账号好友黑名单
     */
    getFriendBlacklist(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT friend_id, friend_name, created_at
                FROM account_friend_blacklist
                WHERE account_id = ?
                ORDER BY created_at DESC
            `);
            return stmt.all(accountId);
        } catch (error) {
            logger.error('获取好友黑名单失败:', error);
            throw error;
        }
    }

    /**
     * 添加好友到黑名单
     */
    addToFriendBlacklist(accountId, friendId, friendName) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO account_friend_blacklist (account_id, friend_id, friend_name)
                VALUES (?, ?, ?)
            `);
            const result = stmt.run(accountId, friendId, friendName || '');
            logger.info(`添加好友到黑名单：${accountId}, ${friendId}`);
            return result;
        } catch (error) {
            logger.error('添加好友到黑名单失败:', error);
            throw error;
        }
    }

    /**
     * 从好友黑名单移除
     */
    removeFromFriendBlacklist(accountId, friendId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                DELETE FROM account_friend_blacklist
                WHERE account_id = ? AND friend_id = ?
            `);
            const result = stmt.run(accountId, friendId);
            logger.info(`从好友黑名单移除：${accountId}, ${friendId}`);
            return result;
        } catch (error) {
            logger.error('从好友黑名单移除失败:', error);
            throw error;
        }
    }

    /**
     * 获取偷菜植物过滤列表
     */
    getPlantFilter(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                SELECT plant_id, plant_name, created_at
                FROM account_plant_filter
                WHERE account_id = ?
                ORDER BY created_at DESC
            `);
            return stmt.all(accountId);
        } catch (error) {
            logger.error('获取植物过滤列表失败:', error);
            throw error;
        }
    }

    /**
     * 添加植物到过滤列表
     */
    addToPlantFilter(accountId, plantId, plantName) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO account_plant_filter (account_id, plant_id, plant_name)
                VALUES (?, ?, ?)
            `);
            const result = stmt.run(accountId, plantId, plantName || '');
            logger.info(`添加植物到过滤列表：${accountId}, ${plantId}`);
            return result;
        } catch (error) {
            logger.error('添加植物到过滤列表失败:', error);
            throw error;
        }
    }

    /**
     * 从植物过滤列表移除
     */
    removeFromPlantFilter(accountId, plantId) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                DELETE FROM account_plant_filter
                WHERE account_id = ? AND plant_id = ?
            `);
            const result = stmt.run(accountId, plantId);
            logger.info(`从植物过滤列表移除：${accountId}, ${plantId}`);
            return result;
        } catch (error) {
            logger.error('从植物过滤列表移除失败:', error);
            throw error;
        }
    }

    /**
     * 删除账号
     */
    delete(accountId) {
        try {
            const db = getDb();
            const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
            const result = stmt.run(accountId);
            logger.info(`删除账号成功：${accountId}`);
            return result;
        } catch (error) {
            logger.error('删除账号失败:', error);
            throw error;
        }
    }

    /**
     * 更新账号运行状态
     */
    updateRunningStatus(accountId, running) {
        try {
            const db = getDb();
            const stmt = db.prepare(`
                UPDATE accounts 
                SET running = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            const result = stmt.run(running ? 1 : 0, accountId);
            logger.info(`更新账号运行状态：${accountId}, running: ${running}`);
            return result;
        } catch (error) {
            logger.error('更新账号运行状态失败:', error);
            throw error;
        }
    }
}

module.exports = new AccountRepository();
```

---

### 阶段三：数据迁移（1 天）

#### 3.1 创建迁移脚本

**文件路径**：`core/scripts/migrate-to-sqlite.js`

```javascript
#!/usr/bin/env node

/**
 * JSON 到 SQLite 数据迁移脚本
 * 
 * 使用方法：
 * node scripts/migrate-to-sqlite.js
 * 
 * 注意：
 * - 运行前请确保已备份原有 JSON 文件
 * - 迁移过程中会创建新的数据库文件
 * - 迁移完成后需重启服务
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getDataFile } = require('../src/config/runtime-paths');

// 文件路径
const OLD_STORE = getDataFile('store.json');
const OLD_ACCOUNTS = getDataFile('accounts.json');
const OLD_USERS = getDataFile('users.json');
const OLD_CARDS = getDataFile('cards.json');
const NEW_DB = getDataFile('farm-bot.db');

// 备份路径
const BACKUP_DIR = getDataFile('backup');
const BACKUP_DATE = new Date().toISOString().replace(/[:.]/g, '-');

console.log('========================================');
console.log('  QQ 农场机器人 - 数据迁移工具');
console.log('========================================\n');

/**
 * 备份旧数据文件
 */
function backupOldFiles() {
    console.log('📦 步骤 1: 备份旧数据文件...');
    
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    const filesToBackup = [
        OLD_STORE,
        OLD_ACCOUNTS,
        OLD_USERS,
        OLD_CARDS,
    ];
    
    let backedUp = 0;
    filesToBackup.forEach(file => {
        if (fs.existsSync(file)) {
            const backupPath = path.join(
                BACKUP_DIR,
                `${path.basename(file)}.${BACKUP_DATE}`
            );
            fs.copyFileSync(file, backupPath);
            console.log(`  ✅ 已备份：${file}`);
            backedUp++;
        } else {
            console.log(`  ⚠️  文件不存在，跳过：${file}`);
        }
    });
    
    console.log(`✅ 备份完成，共 ${backedUp} 个文件\n`);
}

/**
 * 初始化数据库
 */
function initDatabase() {
    console.log('📦 步骤 2: 初始化数据库...');
    
    const db = new Database(NEW_DB);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    // 读取并执行迁移 SQL
    const migrationPath = path.join(__dirname, '../src/database/migrations/001-init.sql');
    if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        db.exec(sql);
        console.log('  ✅ 数据库表结构创建成功\n');
    } else {
        console.log('  ❌ 迁移文件不存在:', migrationPath);
        db.close();
        throw new Error('迁移文件不存在');
    }
    
    return db;
}

/**
 * 迁移账号数据
 */
function migrateAccounts(db) {
    console.log('📦 步骤 3: 迁移账号数据...');
    
    if (!fs.existsSync(OLD_ACCOUNTS)) {
        console.log('  ⚠️  账号文件不存在，跳过\n');
        return 0;
    }
    
    const accountsData = JSON.parse(fs.readFileSync(OLD_ACCOUNTS, 'utf8'));
    const accounts = accountsData.accounts || [];
    
    const insertAccount = db.prepare(`
        INSERT OR IGNORE INTO accounts (uin, nick, name, platform, running)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    const insertConfig = db.prepare(`
        INSERT INTO account_configs (account_id)
        VALUES (?)
    `);
    
    let migrated = 0;
    accounts.forEach(acc => {
        try {
            const result = insertAccount.run(
                acc.uin,
                acc.nick || '',
                acc.name || '',
                acc.platform || 'qq',
                acc.running ? 1 : 0
            );
            
            if (result.changes > 0) {
                const accountId = result.lastInsertRowid;
                insertConfig.run(accountId);
                migrated++;
                console.log(`  ✅ 迁移账号：${acc.uin} (${acc.name || acc.nick || '未命名'})`);
            }
        } catch (error) {
            console.log(`  ❌ 迁移账号失败：${acc.uin}`, error.message);
        }
    });
    
    console.log(`✅ 账号迁移完成，共 ${migrated} 个账号\n`);
    return migrated;
}

/**
 * 迁移配置数据
 */
function migrateConfigs(db) {
    console.log('📦 步骤 4: 迁移配置数据...');
    
    if (!fs.existsSync(OLD_STORE)) {
        console.log('  ⚠️  存储文件不存在，跳过\n');
        return 0;
    }
    
    const storeData = JSON.parse(fs.readFileSync(OLD_STORE, 'utf8'));
    let migrated = 0;
    
    // 迁移账号配置
    if (storeData.accountConfigs) {
        const updateConfig = db.prepare(`
            UPDATE account_configs 
            SET 
                planting_strategy = ?,
                preferred_seed_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE account_id = (SELECT id FROM accounts WHERE uin = ?)
        `);
        
        Object.entries(storeData.accountConfigs).forEach(([uin, config]) => {
            try {
                updateConfig.run(
                    config.plantingStrategy || 'preferred',
                    config.preferredSeedId || 0,
                    uin
                );
                migrated++;
                console.log(`  ✅ 迁移配置：${uin}`);
            } catch (error) {
                console.log(`  ❌ 迁移配置失败：${uin}`, error.message);
            }
        });
    }
    
    console.log(`✅ 配置迁移完成，共 ${migrated} 条记录\n`);
    return migrated;
}

/**
 * 迁移用户数据
 */
function migrateUsers(db) {
    console.log('📦 步骤 5: 迁移用户数据...');
    
    if (!fs.existsSync(OLD_USERS)) {
        console.log('  ⚠️  用户文件不存在，跳过\n');
        return 0;
    }
    
    const usersData = JSON.parse(fs.readFileSync(OLD_USERS, 'utf8'));
    const users = usersData.users || [];
    
    const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (username, password_hash, role)
        VALUES (?, ?, ?)
    `);
    
    let migrated = 0;
    users.forEach(user => {
        try {
            insertUser.run(
                user.username,
                user.password,
                user.role || 'user'
            );
            migrated++;
            console.log(`  ✅ 迁移用户：${user.username}`);
        } catch (error) {
            console.log(`  ❌ 迁移用户失败：${user.username}`, error.message);
        }
    });
    
    console.log(`✅ 用户迁移完成，共 ${migrated} 个用户\n`);
    return migrated;
}

/**
 * 迁移卡密数据
 */
function migrateCards(db) {
    console.log('📦 步骤 6: 迁移卡密数据...');
    
    if (!fs.existsSync(OLD_CARDS)) {
        console.log('  ⚠️  卡密文件不存在，跳过\n');
        return 0;
    }
    
    const cardsData = JSON.parse(fs.readFileSync(OLD_CARDS, 'utf8'));
    const cards = cardsData.cards || [];
    
    const insertCard = db.prepare(`
        INSERT OR IGNORE INTO cards (code, type, description, enabled, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    let migrated = 0;
    cards.forEach(card => {
        try {
            insertCard.run(
                card.code,
                card.type,
                card.description || '',
                card.enabled !== false ? 1 : 0,
                card.expiresAt || null
            );
            migrated++;
            console.log(`  ✅ 迁移卡密：${card.code}`);
        } catch (error) {
            console.log(`  ❌ 迁移卡密失败：${card.code}`, error.message);
        }
    });
    
    console.log(`✅ 卡密迁移完成，共 ${migrated} 个卡密\n`);
    return migrated;
}

/**
 * 主函数
 */
function main() {
    try {
        const startTime = Date.now();
        
        // 1. 备份旧文件
        backupOldFiles();
        
        // 2. 初始化数据库
        const db = initDatabase();
        
        // 3-6. 迁移数据
        migrateAccounts(db);
        migrateConfigs(db);
        migrateUsers(db);
        migrateCards(db);
        
        // 关闭数据库
        db.close();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('========================================');
        console.log('  ✅ 数据迁移完成！');
        console.log(`  ⏱️  耗时：${duration}秒`);
        console.log('========================================\n');
        
        console.log('📋 后续步骤：');
        console.log('  1. 验证数据完整性');
        console.log('  2. 重启服务');
        console.log('  3. 测试账号设置持久化功能');
        console.log('  4. 如有问题，可从备份恢复\n');
        
    } catch (error) {
        console.error('\n❌ 迁移失败:', error);
        console.error('\n💡 建议：');
        console.error('  1. 检查文件权限');
        console.error('  2. 确保数据库文件未被占用');
        console.error('  3. 查看详细错误信息\n');
        process.exit(1);
    }
}

// 运行迁移
main();
```

---

## 📊 预期效果

### 改进前后对比

| 指标 | 改进前（JSON） | 改进后（SQLite） | 提升 |
|------|----------------|------------------|------|
| **设置持久化** | ❌ 掉线丢失 | ✅ 永久保存 | ∞ |
| **数据安全性** | ❌ 无事务 | ✅ ACID 保证 | ⭐⭐⭐⭐⭐ |
| **查询性能** | O(n) | O(log n) | 10-100x |
| **并发支持** | ❌ 文件锁冲突 | ✅ 行级锁 | ⭐⭐⭐⭐⭐ |
| **扩展性** | ❌ 难以扩展 | ✅ 支持复杂查询 | ⭐⭐⭐⭐⭐ |
| **数据完整性** | ❌ 易损坏 | ✅ 外键约束 | ⭐⭐⭐⭐⭐ |

### 功能提升

1. ✅ **彻底解决设置丢失问题**：掉线重连后自动恢复配置
2. ✅ **数据安全可靠**：ACID 事务保证，不再担心数据损坏
3. ✅ **性能大幅提升**：查询速度提升 10-100 倍
4. ✅ **支持高级功能**：
   - 配置模板系统
   - 配置版本控制
   - 智能配置推荐
   - 操作审计日志
   - 数据统计分析

---

## 🎯 更高层次的建议

### 1. 架构优化建议

#### 1.1 引入 CQRS 模式

- **命令端**：写入数据库（SQLite）
- **查询端**：内存缓存 + 数据库
- **好处**：提升读取性能，降低数据库压力

#### 1.2 事件溯源（Event Sourcing）

- 记录所有配置变更事件
- 支持配置历史回溯
- 支持配置版本管理

#### 1.3 配置模板系统

```typescript
interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  config: AccountConfig;
  createdAt: Date;
}

// 功能
- 保存当前配置为模板
- 一键应用模板到多个账号
- 分享配置模板（社区）
```

#### 1.4 配置版本控制

```typescript
interface ConfigVersion {
  id: string;
  accountId: string;
  version: number;
  config: AccountConfig;
  changedAt: Date;
  changedBy: string;
  comment?: string;
}

// 功能
- 自动保存配置历史
- 支持回滚到任意版本
- 配置差异对比
```

### 2. 监控与告警

#### 2.1 配置变更审计

```sql
CREATE TABLE config_audit_log (
  id INTEGER PRIMARY KEY,
  account_id INTEGER,
  old_config JSON,
  new_config JSON,
  changed_by TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.2 异常检测

```javascript
// 检测配置异常（如间隔时间过短导致封号风险）
function validateConfig(config) {
  if (config.intervals.farm < 2) {
    throw new Error('农场巡查间隔过短，可能触发风控');
  }
  if (config.intervals.friend < 5) {
    throw new Error('好友互动间隔过短，可能触发风控');
  }
}
```

---

## 📅 实施时间表

| 阶段 | 任务 | 预计时间 | 优先级 | 状态 |
|------|------|----------|--------|------|
| **阶段一** | 数据库设计与依赖安装 | 1-2 天 | P0 | ✅ 已完成 |
| **阶段二** | 数据库层实现 | 2-3 天 | P0 | 🔄 进行中 |
| **阶段三** | 数据迁移脚本 | 1 天 | P0 | ⏳ 待开始 |
| **阶段四** | API 接口改造 | 2-3 天 | P0 | ⏳ 待开始 |
| **阶段五** | 前端优化 | 1-2 天 | P1 | ⏳ 待开始 |
| **阶段六** | 测试与优化 | 1-2 天 | P1 | ⏳ 待开始 |
| **总计** | | **8-13 天** | | |

---

## 🚀 快速开始

### 安装依赖

```bash
cd core
pnpm add better-sqlite3
```

### 运行迁移

```bash
# 备份并迁移数据
node scripts/migrate-to-sqlite.js
```

### 启动服务

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm start
```

### 验证功能

1. 登录管理面板
2. 修改账号设置
3. 重启服务
4. 验证设置是否保留

---

## 📞 技术支持

如有问题，请查看：

- 数据库日志：`logs/database.log`
- 应用日志：`logs/app.log`
- 迁移日志：控制台输出

---

## 📝 更新日志

### v1.0 (2026-02-28)

- ✅ 创建数据库设计方案
- ✅ 创建数据访问层
- ✅ 创建数据迁移脚本
- ⏳ API 接口改造（进行中）
- ⏳ 前端优化（待开始）
- ⏳ 测试与优化（待开始）

---

**文档结束**
