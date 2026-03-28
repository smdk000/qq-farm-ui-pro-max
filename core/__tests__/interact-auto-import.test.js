const test = require('node:test');
const assert = require('node:assert/strict');

const interactModulePath = require.resolve('../src/services/interact');
const configModulePath = require.resolve('../src/config/config');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');

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

test('getInteractRecords auto-imports visitor gids into friends cache seeds', async () => {
    const mergeCalls = [];

    const restoreConfig = mockModule(configModulePath, {
        CONFIG: { accountId: 'acc-9', platform: 'wx_car' },
    });
    const restoreGameConfig = mockModule(gameConfigModulePath, {
        getFruitName: () => '',
        getPlantByFruitId: () => null,
        getPlantById: () => null,
        getPlantName: () => '',
    });
    const restoreFriendCacheSeeds = mockModule(friendCacheSeedsModulePath, {
        resolveFriendSeedAccountId: () => 'acc-9',
        cacheFriendSeeds: async (friends, options) => {
            mergeCalls.push({ options, friends });
        },
    });
    const restoreNetwork = mockModule(networkModulePath, {
        sendMsgAsync: async () => ({ body: Buffer.from('reply') }),
        getUserState: () => ({
            accountId: 'acc-9',
            platform: 'wx_car',
            uin: 'wxid_demo_9001',
            openId: 'wx-open-9001',
        }),
    });
    const restoreProto = mockModule(protoModulePath, {
        types: {
            InteractRecordsRequest: {
                create: (value) => value || {},
                encode: () => ({ finish: () => Buffer.alloc(0) }),
            },
            InteractRecordsReply: {
                decode: () => ({
                    records: [
                        { server_time: 10, action_type: 1, visitor_gid: 3001, nick: '偷菜甲', avatar_url: 'https://img/a.png' },
                        { server_time: 11, action_type: 1, visitor_gid: 3002, nick: '', avatar_url: '' },
                        { server_time: 12, action_type: 2, visitor_gid: 3001, nick: '偷菜甲', avatar_url: 'https://img/a2.png' },
                    ],
                }),
            },
        },
    });
    const restoreUtils = mockModule(utilsModulePath, {
        logWarn() {},
        toNum: (value) => Number(value) || 0,
        toTimeSec: (value) => Number(value) || 0,
    });

    try {
        delete require.cache[interactModulePath];
        const { getInteractRecords } = require(interactModulePath);

        const records = await getInteractRecords(50);
        assert.equal(records.length, 3);
        assert.deepEqual(mergeCalls, [
            {
                options: {
                    accountId: 'acc-9',
                    platform: 'wx_car',
                    uin: 'wxid_demo_9001',
                    openId: 'wx-open-9001',
                    userState: {
                        accountId: 'acc-9',
                        platform: 'wx_car',
                        uin: 'wxid_demo_9001',
                        openId: 'wx-open-9001',
                    },
                    immediate: true,
                },
                friends: [
                    { gid: 3001, name: '偷菜甲', avatarUrl: 'https://img/a2.png' },
                    { gid: 3002, name: '', avatarUrl: '' },
                ],
            },
        ]);
    } finally {
        delete require.cache[interactModulePath];
        restoreUtils();
        restoreProto();
        restoreNetwork();
        restoreFriendCacheSeeds();
        restoreGameConfig();
        restoreConfig();
    }
});
