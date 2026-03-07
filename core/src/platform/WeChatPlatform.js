const BasePlatform = require('./BasePlatform');

class WeChatPlatform extends BasePlatform {
    constructor(platformName) {
        super(platformName);
    }

    allowSyncAll() {
        return false; // 微信环境不支持 SyncAll
    }

    allowAutoSteal() {
        return false; // 微信弱网与安全机制，禁用批量偷菜
    }

    getFriendScanInterval(defaultInterval) {
        // 微信端专设长巡周期 (15-30分钟)
        const wxDelay = 900000 + Math.floor(Math.random() * 900000);
        return Math.max(defaultInterval, wxDelay);
    }
}

module.exports = WeChatPlatform;
