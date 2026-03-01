const userStore = require('../models/user-store');

/**
 * 卡密管理控制器
 * 处理卡密相关的 HTTP 请求
 */

/**
 * 获取所有卡密
 */
function getAllCards(req, res) {
    try {
        const cards = userStore.getAllCards();
        res.json({ ok: true, cards });
    } catch (error) {
        console.error('获取卡密列表失败:', error.message);
        res.status(500).json({ ok: false, error: '获取卡密列表失败' });
    }
}

/**
 * 生成卡密
 */
function createCard(req, res) {
    try {
        const { description, type, days, count = 1 } = req.body;
        
        if (!description || !type) {
            return res.status(400).json({ ok: false, error: '缺少必要参数' });
        }
        
        const cards = [];
        for (let i = 0; i < count; i++) {
            const card = userStore.createCard(description, type, days);
            cards.push(card);
        }
        
        res.json({ ok: true, cards });
    } catch (error) {
        console.error('生成卡密失败:', error.message);
        res.status(500).json({ ok: false, error: '生成卡密失败' });
    }
}

/**
 * 更新卡密
 */
function updateCard(req, res) {
    try {
        const { code } = req.params;
        const { description, enabled } = req.body;
        
        const updates = {};
        if (description !== undefined) updates.description = description;
        if (enabled !== undefined) updates.enabled = enabled;
        
        const result = userStore.updateCard(code, updates);
        if (!result) {
            return res.status(404).json({ ok: false, error: '卡密不存在' });
        }
        
        res.json({ ok: true, card: result });
    } catch (error) {
        console.error('更新卡密失败:', error.message);
        res.status(500).json({ ok: false, error: '更新卡密失败' });
    }
}

/**
 * 删除卡密
 */
function deleteCard(req, res) {
    try {
        const { code } = req.params;
        const result = userStore.deleteCard(code);
        
        if (!result) {
            return res.status(404).json({ ok: false, error: '卡密不存在' });
        }
        
        res.json({ ok: true });
    } catch (error) {
        console.error('删除卡密失败:', error.message);
        res.status(500).json({ ok: false, error: '删除卡密失败' });
    }
}

/**
 * 批量删除卡密
 */
function batchDeleteCards(req, res) {
    try {
        const { codes } = req.body;
        
        if (!Array.isArray(codes)) {
            return res.status(400).json({ ok: false, error: '卡密列表格式错误' });
        }
        
        let deletedCount = 0;
        for (const code of codes) {
            if (userStore.deleteCard(code)) {
                deletedCount++;
            }
        }
        
        res.json({ ok: true, deletedCount });
    } catch (error) {
        console.error('批量删除卡密失败:', error.message);
        res.status(500).json({ ok: false, error: '批量删除卡密失败' });
    }
}

module.exports = {
    getAllCards,
    createCard,
    updateCard,
    deleteCard,
    batchDeleteCards
};
