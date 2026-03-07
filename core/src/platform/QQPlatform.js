const BasePlatform = require('./BasePlatform');

class QQPlatform extends BasePlatform {
    constructor(platformName) {
        super(platformName);
    }

    // QQ 环境保持所有默认特性，不需要覆盖 BasePlatform

    getFriendScanInterval(defaultInterval) {
        // QQ 环境默认增加 ±2%~8% 的 Jitter 抖动即可
        const jitter = Math.floor((Math.random() * 0.06 + 0.02) * defaultInterval);
        return defaultInterval + jitter;
    }
}

module.exports = QQPlatform;
