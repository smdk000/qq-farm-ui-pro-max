/**
 * 公共工具库
 *
 * 将散落各处的工具函数统一抽取到此处：
 *   createDailyCooldown  - 每日冷却管理器
 *   withRetry            - 重试包装器
 *   withTimeout          - 超时包装器
 *   withRateLimit        - 简易限流包装器
 *   formatDuration       - 时长格式化
 *   summarizeRewards     - 奖励汇总
 */

// ============ 每日冷却管理器 ============

/**
 * 创建一个每日冷却管理器
 * 用于限制某些操作每天只能执行 N 次（跨 0 点重置）
 *
 * @param {string} key - 冷却标识
 * @param {number} maxPerDay - 每天最大次数
 * @returns {{ canProceed: () => boolean, record: () => void, getCount: () => number, reset: () => void }}
 */
function createDailyCooldown(key, maxPerDay) {
    let currentDate = '';
    let count = 0;

    function getTodayStr() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function checkReset() {
        const today = getTodayStr();
        if (currentDate !== today) {
            currentDate = today;
            count = 0;
        }
    }

    return {
        canProceed() {
            checkReset();
            return count < maxPerDay;
        },
        record() {
            checkReset();
            count++;
        },
        getCount() {
            checkReset();
            return count;
        },
        getRemaining() {
            checkReset();
            return Math.max(0, maxPerDay - count);
        },
        reset() {
            count = 0;
            currentDate = '';
        },
    };
}

// ============ 重试包装器 ============

/**
 * 带重试的异步函数包装器
 *
 * @param {Function} fn        - 异步函数
 * @param {number} maxRetries  - 最大重试次数(默认3)
 * @param {number} delay       - 重试间隔(ms，默认1000)
 * @param {object} options
 * @param {boolean} options.exponentialBackoff - 指数退避(默认true)
 * @param {Function} options.onRetry - 重试回调 (error, attempt) => void
 * @param {Function} options.shouldRetry - 判断是否应该重试 (error) => boolean
 * @returns {Promise<*>}
 */
async function withRetry(fn, maxRetries = 3, delay = 1000, options = {}) {
    const { exponentialBackoff = true, onRetry, shouldRetry } = options;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;

            if (attempt >= maxRetries) break;
            if (shouldRetry && !shouldRetry(e)) break;

            if (onRetry) {
                try { onRetry(e, attempt + 1); } catch { /* ignore */ }
            }

            const waitMs = exponentialBackoff
                ? delay * 2**attempt
                : delay;
            await new Promise(r => setTimeout(r, waitMs));
        }
    }

    throw lastError;
}

// ============ 超时包装器 ============

/**
 * 为异步函数添加超时限制
 *
 * 注意：超时仅会 reject 调用方 Promise，不会取消原任务。JavaScript 无法取消已启动的
 * Promise，原 fn() 仍会继续执行直至完成。若需真正取消，请让 fn 支持 AbortSignal。
 *
 * @param {Function} fn - 异步函数
 * @param {number} ms   - 超时(ms)
 * @param {string} message - 超时错误消息
 * @returns {Promise<*>}
 */
async function withTimeout(fn, ms, message) {
    return Promise.race([
        fn(),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(message || `操作超时 (${ms}ms)`)), ms)
        ),
    ]);
}

// ============ 简易限流包装器 ============

/**
 * 为函数添加调用间隔限制
 * 两次调用之间至少间隔 intervalMs
 *
 * @param {Function} fn         - 要限流的函数
 * @param {number} intervalMs   - 最小调用间隔(ms)
 * @returns {Function} 限流后的函数
 */
function withRateLimit(fn, intervalMs) {
    let lastCallTime = 0;

    return async function (...args) {
        const now = Date.now();
        const elapsed = now - lastCallTime;
        if (elapsed < intervalMs) {
            await new Promise(r => setTimeout(r, intervalMs - elapsed));
        }
        lastCallTime = Date.now();
        return fn.apply(this, args);
    };
}

// ============ 时长格式化 ============

/**
 * 将毫秒格式化为可读时长
 *
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化后的字符串
 *
 * @example
 * formatDuration(65000)     // "1分5秒"
 * formatDuration(3661000)   // "1时1分1秒"
 * formatDuration(90061000)  // "1天1时1分"
 */
function formatDuration(ms) {
    if (!ms || ms < 0) return '0秒';

    const sec = Math.floor(ms / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}时`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (parts.length < 2 && seconds > 0) parts.push(`${seconds}秒`);

    return parts.join('') || '0秒';
}

// ============ 奖励汇总 ============

/**
 * 将奖励数组聚合为汇总对象
 *
 * @param {Array<{type: string, amount: number, name?: string}>} rewards
 * @returns {{ summary: string, details: object }}
 *
 * @example
 * summarizeRewards([
 *   { type: 'exp', amount: 100 },
 *   { type: 'gold', amount: 500 },
 *   { type: 'exp', amount: 50 },
 * ])
 * // { summary: "经验+150, 金币+500", details: { exp: 150, gold: 500 } }
 */
function summarizeRewards(rewards) {
    if (!Array.isArray(rewards) || rewards.length === 0) {
        return { summary: '无奖励', details: {} };
    }

    const TYPE_NAMES = {
        exp: '经验',
        gold: '金币',
        coin: '金币',
        fertilizer: '肥料',
        seed: '种子',
        item: '道具',
    };

    const aggregated = {};
    for (const r of rewards) {
        const type = String(r.type || 'unknown');
        const amount = Number(r.amount) || 0;
        aggregated[type] = (aggregated[type] || 0) + amount;
    }

    const parts = [];
    for (const [type, amount] of Object.entries(aggregated)) {
        const name = TYPE_NAMES[type] || type;
        parts.push(`${name}+${amount}`);
    }

    return {
        summary: parts.join(', ') || '无奖励',
        details: aggregated,
    };
}

// ============ 安全 sleep ============

/**
 * 带最大时长保护的 sleep
 * @param {number} ms - 等待毫秒数
 * @param {number} maxMs - 最大等待(默认 5 分钟)
 * @returns {Promise<void>}
 */
function safeSleep(ms, maxMs = 300000) {
    const wait = Math.max(0, Math.min(ms, maxMs));
    return new Promise(r => setTimeout(r, wait));
}

// ============ 去重工具 ============

/**
 * 按指定 key 对数组去重
 * @param {Array} arr - 输入数组
 * @param {Function} keyFn - 提取 key 的函数
 * @returns {Array}
 */
function uniqueBy(arr, keyFn) {
    const seen = new Set();
    return arr.filter(item => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = {
    createDailyCooldown,
    withRetry,
    withTimeout,
    withRateLimit,
    formatDuration,
    summarizeRewards,
    safeSleep,
    uniqueBy,
};
