const WeChatPlatform = require('./WeChatPlatform');
const QQPlatform = require('./QQPlatform');

class PlatformFactory {
    static createPlatform(platformName) {
        const p = String(platformName || '').toLowerCase();
        if (p.startsWith('wx')) {
            return new WeChatPlatform(p);
        }
        // 默认返回 QQ 的常规策略
        return new QQPlatform(p);
    }
}

module.exports = PlatformFactory;
