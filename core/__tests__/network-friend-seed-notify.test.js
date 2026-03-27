const test = require('node:test');
const assert = require('node:assert/strict');

const networkModulePath = require.resolve('../src/utils/network');
const configModulePath = require.resolve('../src/config/config');
const schedulerModulePath = require.resolve('../src/services/scheduler');
const statusModulePath = require.resolve('../src/services/status');
const statsModulePath = require.resolve('../src/services/stats');
const protoModulePath = require.resolve('../src/utils/proto');
const utilsModulePath = require.resolve('../src/utils/utils');
const storeModulePath = require.resolve('../src/models/store');
const circuitBreakerModulePath = require.resolve('../src/services/circuit-breaker');
const cryptoWasmModulePath = require.resolve('../src/utils/crypto-wasm');
const friendCacheSeedsModulePath = require.resolve('../src/services/friend-cache-seeds');

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

test('network notify passively seeds gids from lands, applications and friend adds', () => {
    const cacheCalls = [];
    const emitted = [];

    const restoreFns = [
        mockModule(configModulePath, {
            CONFIG: {
                accountId: '',
                heartbeatInterval: 30000,
                clientVersion: 'test',
                platform: 'qq',
                os: 'ios',
                serverUrl: 'ws://localhost',
            },
        }),
        mockModule(schedulerModulePath, {
            createScheduler() {
                return {
                    setTimeoutTask() {},
                    setIntervalTask() {},
                    clear() {},
                    clearAll() {},
                };
            },
        }),
        mockModule(statusModulePath, {
            updateStatusFromLogin() {},
            updateStatusGold() {},
            updateStatusLevel() {},
        }),
        mockModule(statsModulePath, {
            recordOperation() {},
        }),
        mockModule(protoModulePath, {
            types: {
                EventMessage: {
                    decode(body) {
                        const key = Buffer.from(body).toString();
                        if (key === 'lands') {
                            return { message_type: 'gamepb.plantpb.LandsNotify', body: Buffer.from('lands-body') };
                        }
                        if (key === 'apps') {
                            return { message_type: 'gamepb.friendpb.FriendApplicationReceivedNotify', body: Buffer.from('apps-body') };
                        }
                        if (key === 'friends') {
                            return { message_type: 'gamepb.friendpb.FriendAddedNotify', body: Buffer.from('friends-body') };
                        }
                        return { message_type: '', body: Buffer.alloc(0) };
                    },
                },
                LandsNotify: {
                    decode() {
                        return {
                            host_gid: 999,
                            lands: [
                                { plant: { stealers: [3001], weed_owners: [3002], insect_owners: [999] } },
                            ],
                        };
                    },
                },
                FriendApplicationReceivedNotify: {
                    decode() {
                        return {
                            applications: [
                                { gid: 4001, name: '申请甲', open_id: '4001', avatar_url: 'https://img/app.png' },
                            ],
                        };
                    },
                },
                FriendAddedNotify: {
                    decode() {
                        return {
                            friends: [
                                { gid: 5001, name: '新好友', avatar_url: 'https://img/friend.png' },
                            ],
                        };
                    },
                },
            },
        }),
        mockModule(utilsModulePath, {
            toLong(value) { return value; },
            toNum(value) { return Number(value) || 0; },
            syncServerTime() {},
            log() {},
            logWarn() {},
        }),
        mockModule(storeModulePath, {
            getSuspendUntil() { return 0; },
            getTimingConfig() { return {}; },
        }),
        mockModule(circuitBreakerModulePath, {
            circuitBreaker: {
                allowRequest() { return true; },
            },
        }),
        mockModule(cryptoWasmModulePath, {
            async encryptBuffer(buffer) {
                return buffer;
            },
        }),
        mockModule(friendCacheSeedsModulePath, {
            buildFriendSeedsFromLands(lands, selfGid) {
                assert.equal(selfGid, 999);
                assert.equal(Array.isArray(lands), true);
                return [{ gid: 3001 }, { gid: 3002 }];
            },
            cacheFriendSeeds(friends, options) {
                cacheCalls.push({ friends, options });
                return Promise.resolve(true);
            },
        }),
    ];

    try {
        delete require.cache[networkModulePath];
        const network = require(networkModulePath);
        network.getUserState().gid = 999;
        network.networkEvents.on('landsChanged', (lands) => emitted.push(lands));

        network.__testHandleNotify({ body: Buffer.from('lands') });
        network.__testHandleNotify({ body: Buffer.from('apps') });
        network.__testHandleNotify({ body: Buffer.from('friends') });

        assert.equal(emitted.length, 1);
        assert.equal(cacheCalls.length, 3);
        assert.deepEqual(cacheCalls[0].friends, [{ gid: 3001 }, { gid: 3002 }]);
        assert.deepEqual(cacheCalls[1].friends, [
            { gid: 4001, name: '申请甲', open_id: '4001', avatar_url: 'https://img/app.png' },
        ]);
        assert.deepEqual(cacheCalls[2].friends, [
            { gid: 5001, name: '新好友', avatar_url: 'https://img/friend.png' },
        ]);
        cacheCalls.forEach(({ options }) => {
            assert.equal(options.delayMs, 250);
            assert.equal(options.userState.gid, 999);
            assert.equal(options.userState.platform, 'qq');
        });
    } finally {
        delete require.cache[networkModulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
