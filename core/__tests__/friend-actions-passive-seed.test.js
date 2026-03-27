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
const commonModulePath = require.resolve('../src/services/common');
const platformFactoryModulePath = require.resolve('../src/platform/PlatformFactory');
const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');
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

test('friend actions cache gids from applications, accepts and friend farm basics', async () => {
    const cacheCalls = [];
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq', accountId: 'acc-8' }, PlantPhase: {}, PHASE_NAMES: {} }),
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
            getConfigSnapshot: () => ({}),
            getForceGetAllConfig: () => ({ enabled: false }),
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async (_serviceName, methodName) => {
                if (methodName === 'GetApplications') return { body: Buffer.from('applications') };
                if (methodName === 'AcceptFriends') return { body: Buffer.from('accept') };
                if (methodName === 'Enter') return { body: Buffer.from('enter') };
                throw new Error(`unexpected method: ${methodName}`);
            },
            sendMsgAsyncUrgent: async (_serviceName, methodName) => {
                if (methodName === 'Enter') return { body: Buffer.from('enter') };
                throw new Error(`unexpected urgent method: ${methodName}`);
            },
            getUserState: () => ({ gid: 999, accountId: 'acc-8' }),
            networkEvents: { emit() {} },
        }),
        mockModule(protoModulePath, {
            types: {
                GetApplicationsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetApplicationsReply: {
                    decode: () => ({
                        applications: [
                            { gid: 2001, name: '申请甲', open_id: '2001', avatar_url: 'https://img/app.png', level: 12 },
                        ],
                        block_applications: false,
                    }),
                },
                AcceptFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                AcceptFriendsReply: {
                    decode: () => ({
                        friends: [
                            { gid: 2001, name: '申请甲', avatar_url: 'https://img/friend.png' },
                        ],
                    }),
                },
                VisitEnterRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                VisitEnterReply: {
                    decode: () => ({
                        basic: {
                            gid: 3001,
                            name: '好友甲',
                            open_id: '',
                            avatar_url: 'https://img/basic.png',
                        },
                        lands: [],
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
        mockModule(databaseModulePath, { getCachedFriends: async () => [] }),
        mockModule(interactModulePath, {
            getInteractRecords: async () => [],
        }),
        mockModule(commonModulePath, { isParamError: () => false }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => true }),
        }),
        mockModule(friendCacheSeedsModulePath, {
            cacheFriendSeeds: async (friends, options) => {
                cacheCalls.push({ friends, options });
            },
        }),
        mockModule(friendStateModulePath, {}),
        mockModule(friendScannerModulePath, {}),
        mockModule(friendDecisionModulePath, {}),
    ];

    try {
        delete require.cache[friendActionsModulePath];
        const { getApplications, acceptFriends, enterFriendFarm } = require(friendActionsModulePath);

        await getApplications();
        await acceptFriends([2001, 2002]);
        await enterFriendFarm(3001);

        assert.equal(cacheCalls.length, 3);
        assert.deepEqual(cacheCalls[0].friends, [
            { gid: 2001, name: '申请甲', open_id: '2001', avatar_url: 'https://img/app.png', level: 12 },
        ]);
        assert.deepEqual(cacheCalls[1].friends, [
            { gid: 2001, name: '申请甲', avatar_url: 'https://img/friend.png' },
            { gid: 2001 },
            { gid: 2002 },
        ]);
        assert.deepEqual(cacheCalls[2].friends, [
            { gid: 3001, name: '好友甲', open_id: '', avatar_url: 'https://img/basic.png' },
            { gid: 3001 },
        ]);
        cacheCalls.forEach(({ options }) => {
            assert.deepEqual(options, {
                accountId: 'acc-8',
                platform: 'qq',
                uin: '',
                openId: '',
                userState: { gid: 999, accountId: 'acc-8' },
            });
        });
    } finally {
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
