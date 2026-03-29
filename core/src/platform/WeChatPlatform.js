const BasePlatform = require('./BasePlatform');

class WeChatPlatform extends BasePlatform {
    constructor(platformName) {
        super(platformName);
    }

    allowSyncAll() {
        return false; // 微信环境不支持 SyncAll
    }

    allowAutoSteal() {
        // 仅把 wx* 登录方式当成登录/取 code 的入口，不再因为平台名本身永久禁用好友偷菜。
        // 真正的风险控制改由好友链路实时状态和 suspend/保护窗口决定。
        return true;
    }

    getFriendScanInterval(defaultInterval) {
        // 微信端专设长巡周期 (15-30分钟)
        const wxDelay = 900000 + Math.floor(Math.random() * 900000);
        return Math.max(defaultInterval, wxDelay);
    }
}

module.exports = WeChatPlatform;
