const test = require('node:test');
const assert = require('node:assert/strict');

const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const redisCacheModulePath = require.resolve('../src/services/redis-cache');
const circuitBreakerModulePath = require.resolve('../src/services/circuit-breaker');
const jwtServiceModulePath = require.resolve('../src/services/jwt-service');
const loggerModulePath = require.resolve('../src/services/logger');
const databaseModulePath = require.resolve('../src/services/database');

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

function createLoggerMock() {
    return {
        createModuleLogger() {
            return {
                info() {},
                warn() {},
                error() {},
                debug() {},
            };
        },
    };
}

test('mergeFriendsCache preserves meaningful fields while adding visitor seeds', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key));
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async () => [[]],
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, mergeFriendsCache, getCachedFriends } = require(databaseModulePath);

        await updateFriendsCache('acc-1', [
            { gid: 1001, uin: '123456', name: '老朋友', avatarUrl: 'https://img/a.png' },
        ]);
        await mergeFriendsCache('acc-1', [
            { gid: 1001, name: 'GID:1001', avatarUrl: '' },
            { gid: 1002, name: '', avatarUrl: '' },
        ]);

        const friends = await getCachedFriends('acc-1');
        assert.deepEqual(friends, [
            { gid: 1001, uin: '123456', openId: '', name: '老朋友', avatarUrl: 'https://img/a.png' },
            { gid: 1002, uin: '', openId: '', name: 'GID:1002', avatarUrl: '' },
        ]);
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('mergeFriendsCache drops fallback uin values that are actually gid echoes', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key));
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async () => [[]],
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, mergeFriendsCache, getCachedFriends } = require(databaseModulePath);

        await updateFriendsCache('acc-2', [
            { gid: 20004, uin: '20004', name: '空标识好友', avatarUrl: '' },
        ]);
        await mergeFriendsCache('acc-2', [
            { gid: 20004, uin: '', name: '空标识好友', avatarUrl: '' },
        ]);

        const friends = await getCachedFriends('acc-2');
        assert.deepEqual(friends, [
            { gid: 20004, uin: '', openId: '', name: '空标识好友', avatarUrl: '' },
        ]);
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('getCachedFriends normalizes legacy openId tokens that were historically stored in uin', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key));
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async () => [[]],
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        kv.set('account:acc-legacy:friends_cache', JSON.stringify([
            {
                gid: 1093441253,
                uin: '68AF60B1D1B712B9F41693B3FA378DE1',
                name: '♡',
                avatarUrl: 'https://thirdqq.qlogo.cn/qqapp/1112386029/68AF60B1D1B712B9F41693B3FA378DE1/100',
            },
        ]));

        delete require.cache[databaseModulePath];
        const { getCachedFriends } = require(databaseModulePath);

        const friends = await getCachedFriends('acc-legacy');
        assert.deepEqual(friends, [
            {
                gid: 1093441253,
                uin: '',
                openId: '68AF60B1D1B712B9F41693B3FA378DE1',
                name: '♡',
                avatarUrl: 'https://thirdqq.qlogo.cn/qqapp/1112386029/68AF60B1D1B712B9F41693B3FA378DE1/100',
            },
        ]);
        assert.equal(
            kv.get('account:acc-legacy:friends_cache'),
            JSON.stringify(friends),
        );
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('mergeFriendsCache preserves openId separately from QQ uin', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key));
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async () => [[]],
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, getCachedFriends } = require(databaseModulePath);

        await updateFriendsCache('acc-3', [
            { gid: 30003, uin: '', openId: 'wxid_friend_demo', name: '微信同玩好友', avatarUrl: 'https://img/openid.png' },
        ]);

        const friends = await getCachedFriends('acc-3');
        assert.deepEqual(friends, [
            { gid: 30003, uin: '', openId: 'wxid_friend_demo', name: '微信同玩好友', avatarUrl: 'https://img/openid.png' },
        ]);
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('getCachedFriends reuses the same QQ identity scope across account ids', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key)).sort();
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async (sql, params) => {
                    if (String(sql).includes('FROM accounts WHERE id = ? LIMIT 1')) {
                        const id = String(params && params[0] || '');
                        if (id === '1016') {
                            return [[{
                                id,
                                uin: '__ACCOUNT_ID__:1016',
                                open_id: '',
                                platform: 'qq',
                                auth_data: JSON.stringify({ qq: '416409364', uin: '416409364' }),
                            }]];
                        }
                    }
                    return [[]];
                },
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, getCachedFriends, findReusableFriendsCache } = require(databaseModulePath);

        await updateFriendsCache('1008', [
            { gid: 1087791399, name: '悠然恍若隔世梦', avatarUrl: 'https://img/self.png' },
            { gid: 1098611337, name: '未来可期', avatarUrl: 'https://img/friend.png' },
        ], {
            platform: 'qq',
            uin: '416409364',
        });

        const reused = await getCachedFriends('1016');
        assert.deepEqual(reused, [
            { gid: 1087791399, uin: '', openId: '', name: '悠然恍若隔世梦', avatarUrl: 'https://img/self.png' },
            { gid: 1098611337, uin: '', openId: '', name: '未来可期', avatarUrl: 'https://img/friend.png' },
        ]);

        const reusable = await findReusableFriendsCache('1016', {
            platform: 'qq',
            uin: '416409364',
        });

        assert.deepEqual(reusable, {
            sourceAccountId: '',
            friends: [
                { gid: 1087791399, uin: '', openId: '', name: '悠然恍若隔世梦', avatarUrl: 'https://img/self.png' },
                { gid: 1098611337, uin: '', openId: '', name: '未来可期', avatarUrl: 'https://img/friend.png' },
            ],
        });
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('getCachedFriends does not reuse unrelated account cache scopes', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key)).sort();
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async (sql, params) => {
                    if (String(sql).includes('FROM accounts WHERE id = ? LIMIT 1')) {
                        const id = String(params && params[0] || '');
                        if (id === '1002') {
                            return [[{
                                id,
                                uin: '__ACCOUNT_ID__:1002',
                                open_id: '',
                                platform: 'qq',
                                auth_data: JSON.stringify({ qq: '777000999', uin: '777000999' }),
                            }]];
                        }
                    }
                    return [[]];
                },
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, getCachedFriends, findReusableFriendsCache } = require(databaseModulePath);

        await updateFriendsCache('1001', [
            { gid: 1093441253, name: '♡', avatarUrl: 'https://img/a.png' },
            { gid: 1172159984, name: '我是大飞哥', avatarUrl: 'https://img/b.png' },
            { gid: 1182182338, name: '桀殇→辉', avatarUrl: 'https://img/c.png' },
        ], {
            platform: 'qq',
            uin: '416409364',
        });

        const reused = await getCachedFriends('1002');
        assert.deepEqual(reused, []);

        const reusable = await findReusableFriendsCache('1002', {
            platform: 'qq',
            uin: '777000999',
        });

        assert.equal(reusable, null);
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('clearFriendsCache removes both scoped and legacy keys for the target account', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async del(...keys) {
            let deleted = 0;
            for (const key of keys.flat()) {
                if (kv.delete(String(key))) deleted += 1;
            }
            return deleted;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key)).sort();
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async () => [[]],
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, clearFriendsCache, getCachedFriends } = require(databaseModulePath);

        await updateFriendsCache('acc-9', [
            { gid: 9001, name: '目标好友', avatarUrl: 'https://img/target.png' },
        ], {
            platform: 'qq',
            uin: '90009',
        });
        await updateFriendsCache('acc-other', [
            { gid: 9002, name: '其他好友', avatarUrl: 'https://img/other.png' },
        ], {
            platform: 'qq',
            uin: '90010',
        });

        const cleared = await clearFriendsCache('acc-9', {
            platform: 'qq',
            uin: '90009',
        });

        assert.deepEqual(cleared, {
            ok: true,
            deletedCount: 4,
            keys: [
                'friends_scope:qq:qq:90009:friends_cache',
                'account:acc-9:friends_cache',
            ],
            metaKeys: [
                'friends_scope:qq:qq:90009:friends_cache:meta',
                'account:acc-9:friends_cache:meta',
            ],
            scopeKey: 'friends_scope:qq:qq:90009:friends_cache',
            legacyKey: 'account:acc-9:friends_cache',
        });
        assert.deepEqual(await getCachedFriends('acc-9', {
            platform: 'qq',
            uin: '90009',
        }), []);
        assert.deepEqual(await getCachedFriends('acc-other', {
            platform: 'qq',
            uin: '90010',
        }), [
            { gid: 9002, uin: '', openId: '', name: '其他好友', avatarUrl: 'https://img/other.png' },
        ]);
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});

test('findFriendInSharedCaches does not cross unrelated account scopes', async () => {
    const kv = new Map();
    const redis = {
        async set(key, value) {
            kv.set(String(key), String(value));
        },
        async get(key) {
            return kv.get(String(key)) || null;
        },
        async keys(pattern) {
            if (pattern !== 'account:*:friends_cache') return [];
            return Array.from(kv.keys()).filter(key => /^account:.+:friends_cache$/.test(key)).sort();
        },
    };

    const restoreMysqlDb = mockModule(mysqlDbModulePath, {
        async initMysql() {},
        async closeMysql() {},
        getPool() {
            return {
                query: async (sql, params) => {
                    if (String(sql).includes('FROM accounts WHERE id = ? LIMIT 1')) {
                        const id = String(params && params[0] || '');
                        if (id === '1003') {
                            return [[{
                                id,
                                uin: '__ACCOUNT_ID__:1003',
                                open_id: '',
                                platform: 'qq',
                                auth_data: JSON.stringify({ qq: '10003', uin: '10003' }),
                            }]];
                        }
                    }
                    return [[]];
                },
                execute: async () => [[]],
            };
        },
        isMysqlInitialized() {
            return true;
        },
    });
    const restoreRedisCache = mockModule(redisCacheModulePath, {
        async initRedis() { return true; },
        async closeRedis() {},
        getRedisClient() { return redis; },
    });
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
        cacheCircuitBreaker: {
            isAvailable() { return true; },
            recordSuccess() {},
            recordFailure() {},
        },
    });
    const restoreJwtService = mockModule(jwtServiceModulePath, {
        async initJwtSecretPersistence() {},
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());

    try {
        delete require.cache[databaseModulePath];
        const { updateFriendsCache, findFriendInSharedCaches } = require(databaseModulePath);

        await updateFriendsCache('1001', [
            { gid: 1172159984, name: '我是大飞哥', avatarUrl: 'https://img/friend.png' },
        ], {
            platform: 'qq',
            uin: '10001',
        });
        await updateFriendsCache('1003', [
            { gid: 1172159984, name: 'GID:1172159984', avatarUrl: '' },
        ], {
            platform: 'qq',
            uin: '10003',
        });

        const reusable = await findFriendInSharedCaches(1172159984, {
            accountId: '1003',
            platform: 'qq',
            uin: '10003',
        });

        assert.equal(reusable, null);
    } finally {
        delete require.cache[databaseModulePath];
        restoreLogger();
        restoreJwtService();
        restoreCircuitBreaker();
        restoreRedisCache();
        restoreMysqlDb();
    }
});
