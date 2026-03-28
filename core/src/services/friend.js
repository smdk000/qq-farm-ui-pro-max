/**
 * 好友操作门面 (Facade)
 * 此文件已在 Phase 3 重构中作为架构接缝被提取。
 * 底层逻辑剥离到 friend/ 目录的多个子域：
 * - friend-actions.js (原子操作级API)
 * - friend-decision.js (过滤/策略大脑)
 * - friend-scanner.js (核心轮询)
 * - friend-state.js (状态)
 */

const actions = require('./friend/friend-actions');
const decision = require('./friend/friend-decision');
const scanner = require('./friend/friend-scanner');
const { importFriendsByHex } = require('./friend/friend-hex-import');
const { resetRuntimeAccountModePolicyState } = require('./account-mode-policy');

function resetFriendRuntimeState() {
    if (typeof scanner.resetFriendScannerRuntimeState === 'function') {
        scanner.resetFriendScannerRuntimeState();
    }
    if (typeof actions.resetFriendActionRuntimeState === 'function') {
        actions.resetFriendActionRuntimeState();
    }
    if (typeof resetRuntimeAccountModePolicyState === 'function') {
        resetRuntimeAccountModePolicyState();
    }
}

module.exports = {
    // 原有的扫描控制入口
    checkFriends: scanner.checkFriends,
    startFriendCheckLoop: scanner.startFriendCheckLoop,
    stopFriendCheckLoop: scanner.stopFriendCheckLoop,
    resetFriendRuntimeState,
    refreshFriendCheckLoop: scanner.refreshFriendCheckLoop,

    // 原有申请入口
    checkAndAcceptApplications: scanner.checkAndAcceptApplications,

    // 数据获取入口
    getOperationLimits: actions.getOperationLimits,
    getFriendFetchDiagnostics: actions.getFriendFetchDiagnostics,
    getFriendsList: scanner.getFriendsList,
    getFriendLandsDetail: scanner.getFriendLandsDetail,

    // 操作指令入口
    doFriendOperation: actions.doFriendOperation,
    doFriendBatchOperation: actions.doFriendBatchOperation,
    importFriendsByHex,

    // 蹲守暴露
    getActiveStakeouts: scanner.getActiveStakeouts,
    clearAllStakeouts: scanner.clearAllStakeouts,

    // 独立工具函数暴露
    generateSafeModeBlacklist: decision.generateSafeModeBlacklist,
};
