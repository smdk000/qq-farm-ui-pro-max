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
            return path.join(dataDir, filename);
        },
        ensureDataDir() {
            fs.mkdirSync(dataDir, { recursive: true });
            return dataDir;
        },
        ensureLogDir() {
            fs.mkdirSync(logDir, { recursive: true });
            return logDir;
        },
    };
}

test('store require loads file fallback only and defers DB refresh until initStoreRuntime', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-runtime-init-'));
    const dataDir = path.join(tempRoot, 'data');
    const storeFile = path.join(dataDir, 'store.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({
        trialCardConfig: {
            enabled: true,
            days: 7,
            dailyLimit: 9,
            cooldownMs: 60_000,
            adminRenewEnabled: true,
            userRenewEnabled: false,
            maxAccounts: 2,
        },
    }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const systemSettingsCalls = {
        get: 0,
        set: 0,
    };
    const mysqlCalls = {
        query: 0,
    };
    const restoreSystemSettings = mockModule(systemSettingsModulePath, {
        SYSTEM_SETTING_KEYS: {
            GLOBAL_CONFIG: 'global_config',
        },
        async getSystemSettings() {
            systemSettingsCalls.get += 1;
            return {
                global_config: {
                    trialCardConfig: {
                        enabled: false,
                        days: 14,
                        dailyLimit: 12,
                        cooldownMs: 120_000,
                        adminRenewEnabled: false,
                        userRenewEnabled: true,
                        maxAccounts: 5,
                    },
                },
            };
        },
        async setSystemSettings() {
            systemSettingsCalls.set += 1;
        },
    });
    const restoreMysql = mockModule(mysqlDbModulePath, {
        isMysqlInitialized() {
            return true;
        },
        getPool() {
            return {
                async query(sql) {
                    mysqlCalls.query += 1;
                    if (String(sql).includes('SELECT * FROM account_configs')) {
                        return [[]];
                    }
                    return [[]];
                },
            };
        },
        transaction: async (handler) => handler({ query: async () => [] }),
    });

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        assert.equal(systemSettingsCalls.get, 0);
        assert.equal(mysqlCalls.query, 0);
        assert.deepEqual(store.getTrialCardConfig(), {
            enabled: true,
            days: 7,
            dailyLimit: 9,
            cooldownMs: 60_000,
            adminRenewEnabled: true,
            userRenewEnabled: false,
            maxAccounts: 2,
        });

        await store.initStoreRuntime();

        assert.equal(mysqlCalls.query, 1);
        assert.equal(systemSettingsCalls.get, 1);
        assert.equal(systemSettingsCalls.set, 0);
        assert.deepEqual(store.getTrialCardConfig(), {
            enabled: false,
            days: 14,
            dailyLimit: 12,
            cooldownMs: 120_000,
            adminRenewEnabled: false,
            userRenewEnabled: true,
            maxAccounts: 5,
        });
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreSystemSettings();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('store initStoreRuntime skips DB refresh quietly before mysql initialization', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-runtime-init-no-mysql-'));
    const dataDir = path.join(tempRoot, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'store.json'), JSON.stringify({
        trialCardConfig: {
            enabled: true,
            days: 3,
            dailyLimit: 5,
            cooldownMs: 30_000,
            adminRenewEnabled: true,
            userRenewEnabled: false,
            maxAccounts: 1,
        },
    }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    let systemSettingsCalls = 0;
    let getPoolCalls = 0;
    const restoreSystemSettings = mockModule(systemSettingsModulePath, {
        SYSTEM_SETTING_KEYS: {
            GLOBAL_CONFIG: 'global_config',
        },
        async getSystemSettings() {
            systemSettingsCalls += 1;
            return {};
        },
        async setSystemSettings() {},
    });
    const restoreMysql = mockModule(mysqlDbModulePath, {
        isMysqlInitialized() {
            return false;
        },
        getPool() {
            getPoolCalls += 1;
            throw new Error('MySQL pool is not initialized. Call initMysql() first.');
        },
        transaction: async (handler) => handler({ query: async () => [] }),
    });

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        const consoleErrors = [];
        const originalConsoleError = console.error;
        console.error = (...args) => {
            consoleErrors.push(args.join(' '));
        };

        try {
            const result = await store.initStoreRuntime();
            assert.equal(result, false);
        } finally {
            console.error = originalConsoleError;
        }

        assert.equal(systemSettingsCalls, 0);
        assert.equal(getPoolCalls, 0);
        assert.deepEqual(consoleErrors, []);
        assert.deepEqual(store.getTrialCardConfig(), {
            enabled: true,
            days: 3,
            dailyLimit: 5,
            cooldownMs: 30_000,
            adminRenewEnabled: true,
            userRenewEnabled: false,
            maxAccounts: 1,
        });
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreSystemSettings();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
