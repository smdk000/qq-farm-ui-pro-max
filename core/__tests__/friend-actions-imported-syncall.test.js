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

test('QQ SyncAll uses imported open_ids when imported sync source is active', async () => {
    const syncAllRequests = [];
    const savedSources = [];
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
            getAutomation: () => ({ qqFriendFetchMultiChain: false }),
            getForceGetAllConfig: () => ({ enabled: false }),
            getImportedSyncAllSource: () => ({
                active: true,
                openIds: ['OPEN_A', 'OPEN_B'],
                importedAt: 1,
                updatedAt: 1,
                meta: {},
            }),
            setImportedSyncAllSource: (_accountId, payload) => {
                savedSources.push(payload);
                return payload;
            },
        }),
        mockModule(networkModulePath, {
            sendMsgAsync: async (_serviceName, methodName, body) => {
                if (methodName === 'SyncAll') {
                    syncAllRequests.push(body);
                    return { body: Buffer.from('sync-all-reply') };
                }
                throw new Error(`unexpected method: ${methodName}`);
            },
            sendMsgAsyncUrgent: async () => ({ body: Buffer.alloc(0) }),
            getUserState: () => ({ accountId: '2001', gid: 999 }),
            networkEvents: { emit() {} },
        }),
        mockModule(protoModulePath, {
            types: {
                SyncAllFriendsRequest: {
                    create: (value) => value || {},
                    encode: (value) => ({ finish: () => Buffer.from(JSON.stringify(value)) }),
                },
                SyncAllFriendsReply: {
                    decode: () => ({
                        game_friends: [{ gid: 12345, name: 'friend-a' }],
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
        mockModule(databaseModulePath, { getCachedFriends: async () => [] }),
        mockModule(interactModulePath, { getInteractRecords: async () => [] }),
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

        assert.equal(syncAllRequests.length, 1);
        assert.equal(String(syncAllRequests[0]), JSON.stringify({ open_ids: ['OPEN_A', 'OPEN_B'] }));
        assert.equal(reply._syncSource, 'imported_syncall');
        assert.equal(reply._importOpenIdCount, 2);
        assert.equal(savedSources.length, 1);
        assert.equal(savedSources[0].lastSyncSource, 'imported_syncall');
    } finally {
        delete require.cache[friendActionsModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
