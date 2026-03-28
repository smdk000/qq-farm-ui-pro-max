const test = require('node:test');
const assert = require('node:assert/strict');

const scannerModulePath = require.resolve('../src/services/friend/friend-scanner');
const configModulePath = require.resolve('../src/config/config');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const utilsModulePath = require.resolve('../src/utils/utils');
const farmModulePath = require.resolve('../src/services/farm');
const statsModulePath = require.resolve('../src/services/stats');
const warehouseModulePath = require.resolve('../src/services/warehouse');
const accountModePolicyModulePath = require.resolve('../src/services/account-mode-policy');
const platformFactoryModulePath = require.resolve('../src/platform/PlatformFactory');
const friendStateModulePath = require.resolve('../src/services/friend/friend-state');
const friendDecisionModulePath = require.resolve('../src/services/friend/friend-decision');
const friendActionsModulePath = require.resolve('../src/services/friend/friend-actions');
const circuitBreakerModulePath = require.resolve('../src/services/circuit-breaker');

function mockModule(modulePath, exports) {
    const previous = require.cache[modulePath];
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };

    return () => {
        if (previous) require.cache[modulePath] = previous;
        else delete require.cache[modulePath];
    };
}

test('getFriendsList keeps QQ uin semantic stable and no longer overloads gid/open_id into uin', async () => {
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq' }, PlantPhase: {}, PHASE_NAMES: {} }),
        mockModule(gameConfigModulePath, {
            getPlantName: () => '',
            getPlantById: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getFriendBlacklist: () => [],
            getStakeoutStealConfig: () => ({ enabled: false }),
        }),
        mockModule(networkModulePath, {
            getUserState: () => ({ gid: 999 }),
            networkEvents: {
                on() {},
                off() {},
                emit() {},
            },
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            toTimeSec: () => 0,
            getServerTimeSec: () => 0,
            log() {},
            logWarn() {},
            sleep: async () => {},
        }),
        mockModule(farmModulePath, {
            getCurrentPhase: () => null,
            setOperationLimitsCallback() {},
        }),
        mockModule(statsModulePath, { recordOperation() {} }),
        mockModule(warehouseModulePath, { sellAllFruits: async () => {} }),
        mockModule(accountModePolicyModulePath, {
            getRuntimeAccountModePolicy: () => ({ collaborationEnabled: true }),
        }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => true }),
        }),
        mockModule(friendStateModulePath, {
            friendScheduler: { setTimeoutTask() {}, clearAll() {} },
            activeStakeouts: new Map(),
        }),
        mockModule(friendDecisionModulePath, {}),
        mockModule(friendActionsModulePath, {
            getAllFriends: async () => ({
                game_friends: [
                    { gid: 20002, open_id: '', uin: 12345678, name: 'QQ好友', remark: '', avatar_url: '' },
                    { gid: 20003, open_id: 'wxid_demo', uin: 87654321, name: '微信好友', remark: '', avatar_url: '' },
                    { gid: 20006, open_id: '', uin: '68AF60B1D1B712B9F41693B3FA378DE1', name: '令牌好友', remark: '', avatar_url: '' },
                    { gid: 999, open_id: '', uin: 999, name: '自己', remark: '', avatar_url: '' },
                    { gid: 20004, open_id: '', uin: '', name: '空标识好友', remark: '', avatar_url: '' },
                    { gid: 20005, open_id: '', uin: '', name: '小小农夫', remark: '', avatar_url: '' },
                ],
            }),
        }),
        mockModule(circuitBreakerModulePath, {
            circuitBreaker: {
                allowRequest: () => true,
            },
        }),
    ];

    try {
        delete require.cache[scannerModulePath];
        const { getFriendsList } = require(scannerModulePath);

        const list = await getFriendsList();

        assert.deepEqual(
            list.map(friend => ({ gid: friend.gid, uin: friend.uin, openId: friend.openId, name: friend.name })),
            [
                { gid: 20004, uin: '', openId: '', name: '空标识好友' },
                { gid: 20006, uin: '', openId: '68AF60B1D1B712B9F41693B3FA378DE1', name: '令牌好友' },
                { gid: 20003, uin: '87654321', openId: 'wxid_demo', name: '微信好友' },
                { gid: 20002, uin: '12345678', openId: '', name: 'QQ好友' },
            ]
        );
    } finally {
        delete require.cache[scannerModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('getFriendsList keeps imported SyncAll friends named 小小农夫 when source is imported_syncall', async () => {
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq' }, PlantPhase: {}, PHASE_NAMES: {} }),
        mockModule(gameConfigModulePath, {
            getPlantName: () => '',
            getPlantById: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getFriendBlacklist: () => [],
            getStakeoutStealConfig: () => ({ enabled: false }),
        }),
        mockModule(networkModulePath, {
            getUserState: () => ({ gid: 999 }),
            networkEvents: {
                on() {},
                off() {},
                emit() {},
            },
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            toTimeSec: () => 0,
            getServerTimeSec: () => 0,
            log() {},
            logWarn() {},
            sleep: async () => {},
        }),
        mockModule(farmModulePath, {
            getCurrentPhase: () => null,
            setOperationLimitsCallback() {},
        }),
        mockModule(statsModulePath, { recordOperation() {} }),
        mockModule(warehouseModulePath, { sellAllFruits: async () => {} }),
        mockModule(accountModePolicyModulePath, {
            getRuntimeAccountModePolicy: () => ({ collaborationEnabled: true }),
        }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => true }),
        }),
        mockModule(friendStateModulePath, {
            friendScheduler: { setTimeoutTask() {}, clearAll() {} },
            activeStakeouts: new Map(),
        }),
        mockModule(friendDecisionModulePath, {}),
        mockModule(friendActionsModulePath, {
            getAllFriends: async () => ({
                _syncSource: 'imported_syncall',
                game_friends: [
                    { gid: 20005, open_id: '', uin: '', name: '小小农夫', remark: '', avatar_url: '' },
                    { gid: 999, open_id: '', uin: '', name: '自己', remark: '', avatar_url: '' },
                ],
            }),
        }),
        mockModule(circuitBreakerModulePath, {
            circuitBreaker: {
                allowRequest: () => true,
            },
        }),
    ];

    try {
        delete require.cache[scannerModulePath];
        const { getFriendsList } = require(scannerModulePath);
        const list = await getFriendsList();
        assert.deepEqual(
            list.map(friend => ({ gid: friend.gid, name: friend.name })),
            [{ gid: 20005, name: '小小农夫' }],
        );
    } finally {
        delete require.cache[scannerModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
