const test = require('node:test');
const assert = require('node:assert/strict');

const friendActionsModulePath = require.resolve('../src/services/friend/friend-actions');
const configModulePath = require.resolve('../src/config/config');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');
const farmModulePath = require.resolve('../src/services/farm');
const statsModulePath = require.resolve('../src/services/stats');
const warehouseModulePath = require.resolve('../src/services/warehouse');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const databaseModulePath = require.resolve('../src/services/database');
const interactModulePath = require.resolve('../src/services/interact');
const platformFactoryModulePath = require.resolve('../src/platform/PlatformFactory');
const friendStateModulePath = require.resolve('../src/services/friend/friend-state');
const friendScannerModulePath = require.resolve('../src/services/friend/friend-scanner');
const friendDecisionModulePath = require.resolve('../src/services/friend/friend-decision');

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

test('getAllFriends falls back to cached friends when QQ GetAll returns parameter error', async () => {
    let syncAllCalls = 0;
    let getAllCalls = 0;
    const previousAccountId = process.env.FARM_ACCOUNT_ID;
    process.env.FARM_ACCOUNT_ID = '1005';

    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq' }, PlantPhase: {}, PHASE_NAMES: {} }),
        mockModule(gameConfigModulePath, {
            getPlantName: () => '',
            getPlantById: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getFriendQuietHours: () => ({ enabled: false }),
            getFriendBlacklist: () => [],
            setFriendBlacklist: () => [],
            getStealFilterConfig: () => ({ enabled: false, mode: 'blacklist', plantIds: [] }),
            getStealFriendFilterConfig: () => ({ enabled: false, mode: 'blacklist', friendIds: [] }),
            getStakeoutStealConfig: () => ({ enabled: false, delaySec: 3 }),
            getAutomation: () => ({ qqFriendFetchMultiChain: true }),
            getConfigSnapshot: () => ({}),
            getForceGetAllConfig: () => ({ enabled: false }),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async (_serviceName, methodName) => {
                if (methodName === 'SyncAll') {
                    syncAllCalls += 1;
                    return { body: Buffer.from('sync-all') };
                }
                if (methodName === 'GetAll') {
                    getAllCalls += 1;
                    throw new Error('gamepb.friendpb.FriendService.GetAll 错误: code=1000020 请求参数错误');
                }
                throw new Error(`unexpected method: ${methodName}`);
            },
            sendMsgAsyncUrgent: async () => ({ body: Buffer.alloc(0) }),
            getUserState: () => ({ gid: 999 }),
            networkEvents: { emit() {} },
        }),
        mockModule(protoModulePath, {
            types: {
                SyncAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                SyncAllFriendsReply: {
                    decode: () => ({
                        game_friends: [{ gid: 999, name: 'self' }],
                        invitations: [],
                        application_count: 0,
                    }),
                },
                GetAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetAllFriendsReply: {
                    decode: () => ({ game_friends: [], invitations: [], application_count: 0 }),
                },
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
        mockModule(mysqlDbModulePath, { getPool: () => ({}) }),
        mockModule(databaseModulePath, {
            getCachedFriends: async () => ([
                { gid: 1087791399, uin: '', name: '悠然恍若隔世梦', avatarUrl: 'https://example.com/a.png' },
                { gid: 1170082154, uin: '', name: '尤隔情窗换梦回', avatarUrl: 'https://example.com/b.png' },
            ]),
        }),
        mockModule(interactModulePath, {
            getInteractRecords: async () => [],
        }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => true }),
        }),
        mockModule(friendStateModulePath, {}),
        mockModule(friendScannerModulePath, {}),
        mockModule(friendDecisionModulePath, {}),
    ];

    try {
        delete require.cache[friendActionsModulePath];
        const { getAllFriends } = require(friendActionsModulePath);

        const firstReply = await getAllFriends();
        assert.deepEqual(firstReply.game_friends.map(friend => Number(friend.gid)), [1087791399, 1170082154]);
        assert.equal(firstReply._fromCache, true);

        const secondReply = await getAllFriends();
        assert.deepEqual(secondReply.game_friends.map(friend => String(friend.name)), ['悠然恍若隔世梦', '尤隔情窗换梦回']);

        assert.equal(syncAllCalls, 2);
        assert.equal(getAllCalls, 1);
    } finally {
        if (previousAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccountId;
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('QQ conservative manual refresh with disableVisitorSeed does not rebuild cache from interact records', async () => {
    let interactCalls = 0;
    const previousAccountId = process.env.FARM_ACCOUNT_ID;
    process.env.FARM_ACCOUNT_ID = '1005';

    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq' }, PlantPhase: {}, PHASE_NAMES: {} }),
        mockModule(gameConfigModulePath, {
            getPlantName: () => '',
            getPlantById: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: () => false,
            getFriendQuietHours: () => ({ enabled: false }),
            getFriendBlacklist: () => [],
            setFriendBlacklist: () => [],
            getStealFilterConfig: () => ({ enabled: false, mode: 'blacklist', plantIds: [] }),
            getStealFriendFilterConfig: () => ({ enabled: false, mode: 'blacklist', friendIds: [] }),
            getStakeoutStealConfig: () => ({ enabled: false, delaySec: 3 }),
            getAutomation: () => ({ qqFriendFetchMultiChain: false }),
            getConfigSnapshot: () => ({}),
            getForceGetAllConfig: () => ({ enabled: false }),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async (_serviceName, methodName) => {
                if (methodName === 'SyncAll') {
                    return { body: Buffer.from('sync-all') };
                }
                throw new Error(`unexpected method: ${methodName}`);
            },
            sendMsgAsyncUrgent: async () => ({ body: Buffer.alloc(0) }),
            getUserState: () => ({ gid: 999 }),
            networkEvents: { emit() {} },
        }),
        mockModule(protoModulePath, {
            types: {
                SyncAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                SyncAllFriendsReply: {
                    decode: () => ({
                        game_friends: [{ gid: 999, name: 'self' }],
                        invitations: [],
                        application_count: 0,
                    }),
                },
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
        mockModule(mysqlDbModulePath, { getPool: () => ({}) }),
        mockModule(databaseModulePath, {
            getCachedFriends: async () => [],
        }),
        mockModule(interactModulePath, {
            getInteractRecords: async () => {
                interactCalls += 1;
                return [{ visitorGid: 123 }];
            },
        }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => true }),
        }),
        mockModule(friendStateModulePath, {}),
        mockModule(friendScannerModulePath, {}),
        mockModule(friendDecisionModulePath, {}),
    ];

    try {
        delete require.cache[friendActionsModulePath];
        const { getAllFriends } = require(friendActionsModulePath);
        const reply = await getAllFriends({ manualRefresh: true, disableVisitorSeed: true });
        assert.deepEqual(reply.game_friends.map(friend => Number(friend.gid)), [999]);
        assert.equal(interactCalls, 0);
    } finally {
        if (previousAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccountId;
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
