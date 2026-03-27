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

test('QQ getAllFriends falls back to GetGameFriends when SyncAll is self-only and cached gids exist', async () => {
    let syncAllCalls = 0;
    let getGameFriendsCalls = 0;
    let getAllCalls = 0;
    const previousAccountId = process.env.FARM_ACCOUNT_ID;
    process.env.FARM_ACCOUNT_ID = '3001';

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
                if (methodName === 'GetGameFriends') {
                    getGameFriendsCalls += 1;
                    return { body: Buffer.from('game-friends') };
                }
                if (methodName === 'GetAll') {
                    getAllCalls += 1;
                    return { body: Buffer.from('get-all') };
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
                GetGameFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetAllFriendsReply: {
                    decode: (body) => {
                        const key = Buffer.from(body).toString();
                        if (key === 'game-friends') {
                            return {
                                game_friends: [
                                    { gid: 101, name: '阿甲' },
                                    { gid: 102, name: '阿乙' },
                                ],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        if (key === 'get-all') {
                            return { game_friends: [], invitations: [], application_count: 0 };
                        }
                        return { game_friends: [], invitations: [], application_count: 0 };
                    },
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
                { gid: 101, uin: '', name: '阿甲', avatarUrl: '' },
                { gid: 102, uin: '', name: '阿乙', avatarUrl: '' },
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
        assert.deepEqual(firstReply.game_friends.map(friend => Number(friend.gid)), [101, 102]);

        const secondReply = await getAllFriends();
        assert.deepEqual(secondReply.game_friends.map(friend => String(friend.name)), ['阿甲', '阿乙']);

        assert.equal(syncAllCalls, 1);
        assert.equal(getGameFriendsCalls, 2);
        assert.equal(getAllCalls, 0);
    } finally {
        if (previousAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccountId;
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('QQ getAllFriends seeds gids from recent visitors when local cache is empty', async () => {
    let syncAllCalls = 0;
    let getGameFriendsCalls = 0;
    let interactCalls = 0;
    let visitorSeeded = false;
    const previousAccountId = process.env.FARM_ACCOUNT_ID;
    process.env.FARM_ACCOUNT_ID = '3003';

    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq', accountId: '3003', uin: '8888' }, PlantPhase: {}, PHASE_NAMES: {} }),
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
            sendMsgAsync: async (_serviceName, methodName, body) => {
                if (methodName === 'SyncAll') {
                    syncAllCalls += 1;
                    return { body: Buffer.from('sync-all') };
                }
                if (methodName === 'GetGameFriends') {
                    getGameFriendsCalls += 1;
                    const parsed = JSON.parse(Buffer.from(body).toString() || '{}');
                    const gids = Array.isArray(parsed.gids) ? parsed.gids.map(Number) : [];
                    if (gids.length === 0) {
                        return { body: Buffer.from('game-friends-direct') };
                    }
                    return { body: Buffer.from('game-friends-batch') };
                }
                throw new Error(`unexpected method: ${methodName}`);
            },
            sendMsgAsyncUrgent: async () => ({ body: Buffer.alloc(0) }),
            getUserState: () => ({ gid: 999, name: '当前账号' }),
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
                GetGameFriendsRequest: {
                    create: (value) => value || {},
                    encode: (value) => ({
                        finish: () => Buffer.from(JSON.stringify(value || {})),
                    }),
                },
                GetAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetAllFriendsReply: {
                    decode: (body) => {
                        const key = Buffer.from(body).toString();
                        if (key === 'game-friends-direct') {
                            return {
                                game_friends: [{ gid: 999, name: 'self' }],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        if (key === 'game-friends-batch') {
                            return {
                                game_friends: [
                                    { gid: 301, name: '访客甲' },
                                    { gid: 302, name: '访客乙' },
                                ],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        return { game_friends: [], invitations: [], application_count: 0 };
                    },
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
            getCachedFriends: async () => (visitorSeeded
                ? [
                    { gid: 301, uin: '', name: '访客甲', avatarUrl: '' },
                    { gid: 302, uin: '', name: '访客乙', avatarUrl: '' },
                ]
                : []),
            findReusableFriendsCache: async () => null,
            mergeFriendsCache: async () => {},
        }),
        mockModule(interactModulePath, {
            getInteractRecords: async () => {
                interactCalls += 1;
                visitorSeeded = true;
                return [
                    { visitorGid: 301, nick: '访客甲' },
                    { visitorGid: 302, nick: '访客乙' },
                ];
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

        const reply = await getAllFriends();
        assert.deepEqual(reply.game_friends.map(friend => Number(friend.gid)), [301, 302]);
        assert.equal(syncAllCalls, 1);
        assert.equal(interactCalls, 1);
        assert.equal(getGameFriendsCalls, 2);
    } finally {
        if (previousAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccountId;
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});

test('QQ getAllFriends does not reuse cross-account shared cache when local cache is empty', async () => {
    let syncAllCalls = 0;
    let getGameFriendsCalls = 0;
    let getAllCalls = 0;
    let interactCalls = 0;
    const previousAccountId = process.env.FARM_ACCOUNT_ID;
    process.env.FARM_ACCOUNT_ID = '3004';

    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq', accountId: '3004', uin: '9999' }, PlantPhase: {}, PHASE_NAMES: {} }),
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
            sendMsgAsync: async (_serviceName, methodName, body) => {
                if (methodName === 'SyncAll') {
                    syncAllCalls += 1;
                    return { body: Buffer.from('sync-all') };
                }
                if (methodName === 'GetGameFriends') {
                    getGameFriendsCalls += 1;
                    const parsed = JSON.parse(Buffer.from(body).toString() || '{}');
                    const gids = Array.isArray(parsed.gids) ? parsed.gids.map(Number) : [];
                    if (gids.length === 0) {
                        return { body: Buffer.from('game-friends-direct') };
                    }
                    return { body: Buffer.from('game-friends-batch') };
                }
                if (methodName === 'GetAll') {
                    getAllCalls += 1;
                    return { body: Buffer.from('get-all-empty') };
                }
                throw new Error(`unexpected method: ${methodName}`);
            },
            sendMsgAsyncUrgent: async () => ({ body: Buffer.alloc(0) }),
            getUserState: () => ({ gid: 999, name: '当前账号' }),
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
                GetGameFriendsRequest: {
                    create: (value) => value || {},
                    encode: (value) => ({
                        finish: () => Buffer.from(JSON.stringify(value || {})),
                    }),
                },
                GetAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: () => ({ finish: () => Buffer.alloc(0) }),
                },
                GetAllFriendsReply: {
                    decode: (body) => {
                        const key = Buffer.from(body).toString();
                        if (key === 'game-friends-direct') {
                            return {
                                game_friends: [{ gid: 999, name: 'self' }],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        if (key === 'game-friends-batch') {
                            return {
                                game_friends: [
                                    { gid: 401, name: '共享甲' },
                                    { gid: 402, name: '共享乙' },
                                ],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        if (key === 'get-all-empty') {
                            return {
                                game_friends: [],
                                invitations: [],
                                application_count: 0,
                            };
                        }
                        return { game_friends: [], invitations: [], application_count: 0 };
                    },
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
            mergeFriendsCache: async () => {},
        }),
        mockModule(interactModulePath, {
            getInteractRecords: async () => {
                interactCalls += 1;
                return [];
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

        const reply = await getAllFriends();
        assert.deepEqual(reply.game_friends.map(friend => Number(friend.gid)), []);
        assert.equal(syncAllCalls, 1);
        assert.equal(getGameFriendsCalls, 1);
        assert.equal(getAllCalls, 3);
        assert.equal(interactCalls, 1);
    } finally {
        if (previousAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousAccountId;
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
