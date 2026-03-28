const test = require('node:test');
const assert = require('node:assert/strict');

const visitorIdentityModulePath = require.resolve('../src/services/visitor-identity');
const interactModulePath = require.resolve('../src/services/interact');
const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');
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

test('resolveVisitorIdentity backfills anonymous visitor from interact records', async () => {
    const cacheCalls = [];
    const restoreInteract = mockModule(interactModulePath, {
        getInteractRecords: async () => ([
            {
                serverTimeSec: 2000,
                actionType: 3,
                landId: 15,
                visitorGid: 9001,
                nick: '捣乱者甲',
                avatarUrl: 'https://img/visitor.png',
            },
        ]),
    });
    const restoreFriendCacheSeeds = mockModule(friendCacheSeedsModulePath, {
        cacheFriendSeeds: async (friends, options) => {
            cacheCalls.push({ friends, options });
        },
    });
    const restoreUtils = mockModule(utilsModulePath, {
        getServerTimeSec: () => 2002,
        logWarn() {},
        toNum: (value) => Number(value) || 0,
    });

    try {
        delete require.cache[visitorIdentityModulePath];
        const { resolveVisitorIdentity, __resetVisitorIdentityCacheForTest } = require(visitorIdentityModulePath);
        __resetVisitorIdentityCacheForTest();

        const actor = await resolveVisitorIdentity({
            gid: 0,
            kind: 'weed',
            landId: 15,
            accountId: '1016',
            platform: 'qq',
            uin: '3400470486',
            openId: 'wx-open-1016',
            userState: {
                accountId: '1016',
                platform: 'qq',
                uin: '3400470486',
                openId: 'wx-open-1016',
            },
            getFriendNameByGid: async () => '',
        });

        assert.deepEqual(actor, {
            gid: 9001,
            name: '捣乱者甲',
            source: 'interact_records',
            known: true,
        });
        assert.deepEqual(cacheCalls, [{
            friends: [{
                gid: 9001,
                name: '捣乱者甲',
                avatarUrl: 'https://img/visitor.png',
            }],
            options: {
                accountId: '1016',
                platform: 'qq',
                uin: '3400470486',
                qq: '',
                openId: 'wx-open-1016',
                userState: {
                    accountId: '1016',
                    platform: 'qq',
                    uin: '3400470486',
                    openId: 'wx-open-1016',
                },
                account: null,
                immediate: true,
            },
        }]);
    } finally {
        delete require.cache[visitorIdentityModulePath];
        restoreUtils();
        restoreFriendCacheSeeds();
        restoreInteract();
    }
});

test('resolveVisitorIdentity prefers direct gid lookup when land notify already has source gid', async () => {
    const restoreInteract = mockModule(interactModulePath, {
        getInteractRecords: async () => {
            throw new Error('should not query interact records');
        },
    });
    const restoreFriendCacheSeeds = mockModule(friendCacheSeedsModulePath, {
        cacheFriendSeeds: async () => {},
    });
    const restoreUtils = mockModule(utilsModulePath, {
        getServerTimeSec: () => 2002,
        logWarn() {},
        toNum: (value) => Number(value) || 0,
    });

    try {
        delete require.cache[visitorIdentityModulePath];
        const { resolveVisitorIdentity, __resetVisitorIdentityCacheForTest } = require(visitorIdentityModulePath);
        __resetVisitorIdentityCacheForTest();

        const actor = await resolveVisitorIdentity({
            gid: 7001,
            kind: 'steal',
            landId: 8,
            accountId: '1016',
            getFriendNameByGid: async (gid) => gid === 7001 ? '老朋友' : '',
        });

        assert.deepEqual(actor, {
            gid: 7001,
            name: '老朋友',
            source: 'land_owner',
            known: true,
        });
    } finally {
        delete require.cache[visitorIdentityModulePath];
        restoreUtils();
        restoreFriendCacheSeeds();
        restoreInteract();
    }
});

test('resolveVisitorIdentity upgrades generic gid display name from interact records', async () => {
    const cacheCalls = [];
    const restoreInteract = mockModule(interactModulePath, {
        getInteractRecords: async () => ([
            {
                serverTimeSec: 3000,
                actionType: 3,
                landId: 11,
                visitorGid: 1172159984,
                nick: '放虫好友甲',
                avatarUrl: 'https://img/insect.png',
            },
        ]),
    });
    const restoreFriendCacheSeeds = mockModule(friendCacheSeedsModulePath, {
        cacheFriendSeeds: async (friends, options) => {
            cacheCalls.push({ friends, options });
        },
    });
    const restoreUtils = mockModule(utilsModulePath, {
        getServerTimeSec: () => 3002,
        logWarn() {},
        toNum: (value) => Number(value) || 0,
    });

    try {
        delete require.cache[visitorIdentityModulePath];
        const { resolveVisitorIdentity, __resetVisitorIdentityCacheForTest } = require(visitorIdentityModulePath);
        __resetVisitorIdentityCacheForTest();

        const actor = await resolveVisitorIdentity({
            gid: 1172159984,
            kind: 'insect',
            landId: 11,
            accountId: '1',
            platform: 'wx_car',
            uin: 'wxid_demo_001',
            openId: 'wx-open-1',
            userState: {
                accountId: '1',
                platform: 'wx_car',
                uin: 'wxid_demo_001',
                openId: 'wx-open-1',
            },
            getFriendNameByGid: async () => 'GID:1172159984',
        });

        assert.deepEqual(actor, {
            gid: 1172159984,
            name: '放虫好友甲',
            source: 'interact_records',
            known: true,
        });
        assert.deepEqual(cacheCalls, [{
            friends: [{
                gid: 1172159984,
                name: '放虫好友甲',
                avatarUrl: 'https://img/insect.png',
            }],
            options: {
                accountId: '1',
                platform: 'wx_car',
                uin: 'wxid_demo_001',
                qq: '',
                openId: 'wx-open-1',
                userState: {
                    accountId: '1',
                    platform: 'wx_car',
                    uin: 'wxid_demo_001',
                    openId: 'wx-open-1',
                },
                account: null,
                immediate: true,
            },
        }]);
    } finally {
        delete require.cache[visitorIdentityModulePath];
        restoreUtils();
        restoreFriendCacheSeeds();
        restoreInteract();
    }
});
