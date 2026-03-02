#!/usr/bin/env node
/**
 * 数据迁移脚本：将已使用的旧卡密批量设为 enabled: false
 *
 * 背景：v2.0.5 新增了"卡密使用后自动禁用"机制，但旧版本注册/续费
 *       使用过的卡密 `enabled` 可能仍为 true，需要批量修复。
 *
 * 用法：node core/scripts/migrate-used-cards.js
 *       脚本会自动备份 cards.json → cards.json.bak，再原地更新
 */

const fs = require('fs');
const path = require('path');

// 计算 data 目录路径（兼容开发和打包环境）
const dataDir = path.join(__dirname, '../../data');
const cardsFile = path.join(dataDir, 'cards.json');
const backupFile = cardsFile + '.bak';

function run() {
    // 检查文件是否存在
    if (!fs.existsSync(cardsFile)) {
        console.log('[迁移] cards.json 不存在，无需迁移');
        return;
    }

    // 读取数据
    let data;
    try {
        data = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
    } catch (e) {
        console.error('[迁移] 读取 cards.json 失败:', e.message);
        return;
    }

    const cards = Array.isArray(data.cards) ? data.cards : [];
    if (cards.length === 0) {
        console.log('[迁移] 无卡密数据，无需迁移');
        return;
    }

    // 统计需要修复的卡密
    let fixedCount = 0;
    for (const card of cards) {
        // 已被使用（usedBy 不为空）但 enabled 仍为 true → 修复
        if (card.usedBy && card.enabled !== false) {
            card.enabled = false;
            fixedCount++;
            console.log(`  [修复] 卡密 ${card.code} (被 ${card.usedBy} 使用) → enabled: false`);
        }
    }

    if (fixedCount === 0) {
        console.log('[迁移] 所有已使用卡密状态正常，无需修复');
        return;
    }

    // 备份原文件
    try {
        fs.copyFileSync(cardsFile, backupFile);
        console.log(`[迁移] 已备份 → ${backupFile}`);
    } catch (e) {
        console.error('[迁移] 备份失败，终止迁移:', e.message);
        return;
    }

    // 写入修复后的数据
    try {
        fs.writeFileSync(cardsFile, JSON.stringify(data, null, 2), 'utf8');
        console.log(`[迁移] 完成！共修复 ${fixedCount} 个卡密`);
    } catch (e) {
        console.error('[迁移] 写入失败:', e.message);
        // 尝试恢复备份
        try {
            fs.copyFileSync(backupFile, cardsFile);
            console.log('[迁移] 已从备份恢复');
        } catch (_) {
            console.error('[迁移] 恢复也失败，请手动从 .bak 文件恢复');
        }
    }
}

run();
