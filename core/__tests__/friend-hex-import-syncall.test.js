const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../src/services/friend/friend-hex-import');
const configModulePath = require.resolve('../src/config/config');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const protoModulePath = require.resolve('../src/utils/proto');
const cryptoWasmModulePath = require.resolve('../src/utils/crypto-wasm');

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

test('importFriendsByHex stores imported SyncAll open_ids for current account', async () => {
    const saved = [];
    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq', accountId: '2001' } }),
        mockModule(storeModulePath, {
            getImportedSyncAllSource: () => ({ active: false, openIds: [], importedAt: 0, meta: {} }),
            setImportedSyncAllSource: (_accountId, payload) => {
                saved.push(payload);
                return payload;
            },
        }),
        mockModule(networkModulePath, {
            getUserState: () => ({ accountId: '2001' }),
        }),
        mockModule(protoModulePath, {
            types: {
                GateMessage: {
                    decode: () => ({
                        meta: {
                            service_name: 'gamepb.friendpb.FriendService',
                            method_name: 'SyncAll',
                            message_type: 1,
                            client_seq: 12,
                            server_seq: 34,
                        },
                        body: Buffer.from('encrypted'),
                    }),
                },
                SyncAllFriendsRequest: {
                    decode: () => ({ open_ids: [' OPEN_A ', 'open_b', 'OPEN_B', 'bad value'] }),
                    toObject: (value) => value,
                },
            },
        }),
        mockModule(cryptoWasmModulePath, {
            decryptBuffer: async () => Buffer.from('decrypted'),
        }),
    ];

    try {
        delete require.cache[modulePath];
        const { importFriendsByHex } = require(modulePath);
        const result = await importFriendsByHex('AA55');

        assert.equal(result.ok, true);
        assert.equal(result.meta.importOpenIdCount, 2);
        assert.equal(saved.length, 1);
        assert.deepEqual(saved[0].openIds, ['OPEN_A', 'OPEN_B']);
        assert.equal(saved[0].active, true);
        assert.equal(saved[0].meta.serviceName, 'gamepb.friendpb.FriendService');
    } finally {
        delete require.cache[modulePath];
        restoreFns.reverse().forEach(restore => restore());
    }
});
