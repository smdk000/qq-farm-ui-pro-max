/**
 * Redis 熔断器 (Circuit Breaker)
 * 
 * 三态状态机：CLOSED（正常）→ OPEN（熔断）→ HALF_OPEN（探测）
 * 
 * 当 Redis 连续失败超过阈值时自动切换到 OPEN 状态，
 * 冷却期后进入 HALF_OPEN 允许单次探测，
 * 探测成功恢复到 CLOSED，失败则回到 OPEN。
 * 
 * 用途：防止 Redis 宕机时所有查询回源 MySQL 造成雪崩。
 */

const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('circuit-breaker');

// === 熔断器参数 ===
const FAILURE_THRESHOLD = 5;       // 连续失败 N 次触发熔断
const COOLDOWN_MS = 30000;         // 熔断冷却期（毫秒）
const HALF_OPEN_MAX_PROBES = 1;    // HALF_OPEN 时允许通过的最大探测数

// === 状态常量 ===
const STATE = {
    CLOSED: 'CLOSED',         // 正常 — 所有请求通过
    OPEN: 'OPEN',             // 熔断 — 所有请求被拦截
    HALF_OPEN: 'HALF_OPEN',   // 探测 — 允许少量请求通过验证恢复
};

// === 熔断器内部状态 ===
let currentState = STATE.CLOSED;
let consecutiveFailures = 0;
let lastFailureTime = 0;
let lastSuccessTime = Date.now();
let openedAt = 0;              // 进入 OPEN 状态的时间戳
let halfOpenProbes = 0;        // HALF_OPEN 期间已发出的探测数

/**
 * 判断 Redis 是否可用（业务层在调用 Redis 前应检查此方法）
 * @returns {boolean} true = 可以调用 Redis，false = 应跳过 Redis
 */
function isAvailable() {
    switch (currentState) {
        case STATE.CLOSED:
            return true;

        case STATE.OPEN: {
            // 检查冷却期是否已结束
            const elapsed = Date.now() - openedAt;
            if (elapsed >= COOLDOWN_MS) {
                // 冷却期结束，切换到 HALF_OPEN 允许探测
                _transitionTo(STATE.HALF_OPEN);
                halfOpenProbes = 0;
                return true; // 允许第一次探测通过
            }
            return false; // 仍在冷却期，拒绝请求
        }

        case STATE.HALF_OPEN: {
            // HALF_OPEN 阶段只允许有限的探测请求
            if (halfOpenProbes < HALF_OPEN_MAX_PROBES) {
                halfOpenProbes++;
                return true;
            }
            return false; // 已达到探测上限，拒绝多余请求
        }

        default:
            return false;
    }
}

/**
 * 记录一次 Redis 操作成功
 * 在 HALF_OPEN 状态下，一次成功即恢复到 CLOSED
 */
function recordSuccess() {
    consecutiveFailures = 0;
    lastSuccessTime = Date.now();

    if (currentState === STATE.HALF_OPEN) {
        // 探测成功 → 恢复正常
        _transitionTo(STATE.CLOSED);
        logger.info('✅ Redis 熔断器恢复: HALF_OPEN → CLOSED（探测成功）');
    } else if (currentState === STATE.OPEN) {
        // 异常情况下直接恢复
        _transitionTo(STATE.CLOSED);
        logger.info('✅ Redis 熔断器恢复: OPEN → CLOSED');
    }
}

/**
 * 记录一次 Redis 操作失败
 * 连续失败次数超过阈值时触发熔断
 */
function recordFailure() {
    consecutiveFailures++;
    lastFailureTime = Date.now();

    if (currentState === STATE.HALF_OPEN) {
        // 探测失败 → 重新打开熔断
        _transitionTo(STATE.OPEN);
        openedAt = Date.now();
        logger.warn(`⚠️ Redis 熔断器重新打开: HALF_OPEN → OPEN（探测失败）, 冷却 ${COOLDOWN_MS / 1000}s`);
        return;
    }

    if (currentState === STATE.CLOSED && consecutiveFailures >= FAILURE_THRESHOLD) {
        // 连续失败达到阈值 → 触发熔断
        _transitionTo(STATE.OPEN);
        openedAt = Date.now();
        logger.error(`🔴 Redis 熔断器触发: CLOSED → OPEN（连续失败 ${consecutiveFailures} 次，阈值 ${FAILURE_THRESHOLD}）, 冷却 ${COOLDOWN_MS / 1000}s`);
    }
}

/**
 * 获取熔断器当前状态（用于监控 / API 暴露）
 */
function getStatus() {
    return {
        state: currentState,
        consecutiveFailures,
        failureThreshold: FAILURE_THRESHOLD,
        cooldownMs: COOLDOWN_MS,
        lastSuccessTime,
        lastFailureTime,
        openedAt: currentState === STATE.OPEN ? openedAt : null,
    };
}

/**
 * 手动重置熔断器（管理员操作）
 */
function reset() {
    _transitionTo(STATE.CLOSED);
    consecutiveFailures = 0;
    lastFailureTime = 0;
    openedAt = 0;
    halfOpenProbes = 0;
    logger.info('🔄 Redis 熔断器已手动重置为 CLOSED');
}

// === 内部辅助 ===

function _transitionTo(newState) {
    if (currentState !== newState) {
        currentState = newState;
    }
}

module.exports = {
    isAvailable,
    recordSuccess,
    recordFailure,
    getStatus,
    reset,
    // 便捷别名
    isRedisAvailable: isAvailable,
};
