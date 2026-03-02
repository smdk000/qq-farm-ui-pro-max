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
        
        console.log('💾 备份文件位置：', BACKUP_DIR);
        console.log('📄 数据库文件位置：', NEW_DB);
        console.log('');
        
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
