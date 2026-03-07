const { log, logWarn } = require('../utils/utils');
const { pushNotify } = require('./push');
const store = require('../models/store');

const THRESHOLD = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10分钟
const COOL_DOWN_MS = 60 * 60 * 1000; // 60分钟冷却

class CircuitBreaker {
    constructor() {
        this.failures = [];
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.lastOpenTime = 0;
    }

    recordFailure(reason) {
        if (this.state === 'OPEN') return;

        const now = Date.now();
        this.failures.push(now);

        // 清理窗口外的数据
        this.failures = this.failures.filter(t => now - t < WINDOW_MS);

        if (this.failures.length >= THRESHOLD) {
            this.trip(reason);
        }
    }

    recordSuccess() {
        if (this.state === 'HALF_OPEN') {
            log('安全', '试探性请求成功，断路器恢复闭合状态 (CLOSED)', { module: 'circuit-breaker' });
            this.state = 'CLOSED';
            this.failures = [];
        } else if (this.state === 'CLOSED') {
            // 平时请求成功，偶尔清理一下过期失败
            const now = Date.now();
            this.failures = this.failures.filter(t => now - t < WINDOW_MS);
        }
    }

    trip(reason) {
        this.state = 'OPEN';
        this.lastOpenTime = Date.now();
        logWarn('安全', `【风控告警】账户级断路器被触发 (原因: ${reason})，累计在 10 分钟内异常 ${this.failures.length} 次。挂起本地网络分发以物理断阻黑盒风控！`, { module: 'circuit-breaker' });

        pushNotify({
            title: '⚠️ 账户风控保护性熔断',
            content: `触发断路器，原因：近10分钟内出现 ${this.failures.length} 次风控阻断(${reason})。当前账号已自动丢弃所有排队请求，进入一小时强制冰冻期。`
        });
    }

    allowRequest() {
        if (this.state === 'CLOSED') {
            return true;
        }

        if (this.state === 'OPEN') {
            const now = Date.now();
            if (now - this.lastOpenTime >= COOL_DOWN_MS) {
                this.state = 'HALF_OPEN';
                log('安全', '断路器冷却期结束，进入半开状态 (HALF_OPEN)，允许零星发送试探性请求', { module: 'circuit-breaker' });
                return true;
            }
            return false;
        }

        if (this.state === 'HALF_OPEN') {
            return true;
        }

        return true;
    }
}

const circuitBreaker = new CircuitBreaker();

module.exports = {
    circuitBreaker
};
