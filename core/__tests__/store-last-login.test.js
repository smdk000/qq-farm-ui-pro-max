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

test('store loads and persists lastLoginAt for account list ordering', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-last-login-'));
    const loginAt = Date.parse('2026-03-10T01:02:03.000Z');
    const reloginAt = Date.parse('2026-03-11T08:09:10.000Z');
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
                            running: 1,
                            code: 'old-code',
                            username: 'alice',
                            avatar: '',
                            last_login_at: new Date(loginAt),
                            auth_data: JSON.stringify({
                                qq: '10001',
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
                            running: 1,
                            code: 'old-code',
                            username: 'alice',
                            avatar: '',
                            last_login_at: new Date(loginAt),
                            auth_data: JSON.stringify({
                                qq: '10001',
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
        assert.equal(fresh.accounts[0].lastLoginAt, loginAt);

        recordedQueries.length = 0;
        const updated = await store.markAccountLoginSuccess('1', { timestamp: reloginAt, running: true, connected: true });
        assert.equal(updated && updated.lastLoginAt, reloginAt);

        const upsertEntry = recordedQueries.find(([sql]) => sql.includes('INSERT INTO accounts'));
        assert.ok(upsertEntry, 'expected INSERT INTO accounts upsert query');
        assert.equal(new Date(upsertEntry[1][10]).getTime(), reloginAt);
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreSystemSettings();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
