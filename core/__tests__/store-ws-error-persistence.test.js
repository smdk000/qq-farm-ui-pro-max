const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const storeModulePath = require.resolve('../src/models/store');
const runtimePathsModulePath = require.resolve('../src/config/runtime-paths');
const systemSettingsModulePath = require.resolve('../src/services/system-settings');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');

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

function createRuntimePathsMock(rootDir) {
    const dataDir = path.join(rootDir, 'data');
    const logDir = path.join(rootDir, 'logs');
    return {
        getDataFile(filename) {
            fs.mkdirSync(dataDir, { recursive: true });
            return path.join(dataDir, filename);
        },
        ensureLogDir() {
            fs.mkdirSync(logDir, { recursive: true });
            return logDir;
        },
    };
}

test('store persists and reloads wsError account state via auth_data', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ws-error-'));
    const recordedQueries = [];

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const restoreSystemSettings = mockModule(systemSettingsModulePath, {
        SYSTEM_SETTING_KEYS: {
            GLOBAL_CONFIG: 'global_config',
        },
        async getSystemSettings() {
            return {};
        },
        async setSystemSettings() {},
    });
    const restoreMysql = mockModule(mysqlDbModulePath, {
        isMysqlInitialized() {
            return true;
        },
        getPool() {
            return {
                async query(sql, params = []) {
                    recordedQueries.push([String(sql), params]);
                    if (String(sql).includes('SELECT * FROM accounts WHERE id = ? LIMIT 1')) {
                        return [[{
                            id: '1',
                            uin: '10001',
                            nick: '旧昵称',
                            name: '测试账号',
                            platform: 'qq',
                            running: 0,
                            code: 'old-code',
                            username: 'alice',
                            avatar: '',
                            last_login_at: null,
                            auth_data: JSON.stringify({
                                qq: '10001',
                                wsError: {
                                    code: 400,
                                    message: 'Unexpected server response: 400',
                                    at: 123456,
                                },
                                runtimeSnapshot: {},
                            }),
                            created_at: new Date('2026-03-01T00:00:00.000Z'),
                            updated_at: new Date('2026-03-09T00:00:00.000Z'),
                        }]];
                    }
                    if (String(sql).includes('SELECT * FROM accounts')) {
                        return [[{
                            id: '1',
                            uin: '10001',
                            nick: '旧昵称',
                            name: '测试账号',
                            platform: 'qq',
                            running: 0,
                            code: 'old-code',
                            username: 'alice',
                            avatar: '',
                            last_login_at: null,
                            auth_data: JSON.stringify({
                                qq: '10001',
                                wsError: {
                                    code: 400,
                                    message: 'Unexpected server response: 400',
                                    at: 123456,
                                },
                                runtimeSnapshot: {},
                            }),
                            created_at: new Date('2026-03-01T00:00:00.000Z'),
                            updated_at: new Date('2026-03-09T00:00:00.000Z'),
                        }]];
                    }
                    return [[]];
                },
            };
        },
        transaction: async (handler) => handler({ query: async () => [[]] }),
    });

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        const fresh = await store.getAccountsFresh({ force: true });
        assert.equal(fresh.accounts.length, 1);
        assert.deepEqual(fresh.accounts[0].wsError, {
            code: 400,
            message: 'Unexpected server response: 400',
            at: 123456,
        });

        recordedQueries.length = 0;
        store.addOrUpdateAccount({
            id: '1',
            wsError: {
                code: 400,
                message: 'Code expired',
                at: 987654,
            },
        });
        await store.persistAccountsNow('1', { strict: true });

        const upsertEntry = recordedQueries.find(([sql]) => sql.includes('INSERT INTO accounts'));
        assert.ok(upsertEntry, 'expected INSERT INTO accounts upsert query');
        const authData = JSON.parse(upsertEntry[1][15]);
        assert.deepEqual(authData.wsError, {
            code: 400,
            message: 'Code expired',
            at: 987654,
        });
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreSystemSettings();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
