class BasePlatform {
    constructor(platformName) {
        this.platformName = platformName || 'unknown';
    }

    /**
     * 是否允许执行好友 SyncAll 请求
     * @returns {boolean}
     */
    allowSyncAll() { return true; }

    /**
     * 是否允许批量偷菜群发请求
     * @returns {boolean}
     */
    allowAutoSteal() { return true; }

    /**
     * 获取基础的心跳与循环间隔 (ms)
     * @param {number} defaultInterval 默认配置的间隔
     * @returns {number} 处理后的间隔
     */
    getFriendScanInterval(defaultInterval) {
        return defaultInterval;
    }
}

module.exports = BasePlatform;
