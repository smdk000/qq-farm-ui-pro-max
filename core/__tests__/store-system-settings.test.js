const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const storeModulePath = require.resolve('../src/models/store');
const systemSettingsModulePath = require.resolve('../src/services/system-settings');
const runtimePathsModulePath = require.resolve('../src/config/runtime-paths');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const secretCryptoModulePath = require.resolve('../src/services/secret-crypto');

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

function createMysqlMock(initialState = {}) {
    const state = {
        accountConfigs: Array.isArray(initialState.accountConfigs)
            ? initialState.accountConfigs.map(item => ({ ...item }))
            : [],
        systemSettings: { ...(initialState.systemSettings || {}) },
    };

    async function handleQuery(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalizedSql.startsWith('select * from account_configs')) {
            return [state.accountConfigs];
        }

        if (normalizedSql.startsWith('select setting_key, setting_value from system_settings')) {
            const keys = Array.isArray(params) ? params.map(item => String(item)) : [];
            const rows = Object.entries(state.systemSettings)
                .filter(([key]) => keys.length === 0 || keys.includes(key))
                .map(([setting_key, value]) => ({
                    setting_key,
                    setting_value: JSON.stringify(value),
                }));
            return [rows];
        }

        if (normalizedSql.startsWith('insert into system_settings')) {
            const [key, value] = params;
            state.systemSettings[String(key)] = JSON.parse(String(value));
            return [{ affectedRows: 1 }];
        }

        if (normalizedSql.startsWith('insert into account_configs')) {
            return [{ affectedRows: 1 }];
        }

        return [[]];
    }

    return {
        getPool() {
            return {
                query: handleQuery,
                execute: handleQuery,
            };
        },
        async transaction(handler) {
            return await handler({
                query: handleQuery,
                execute: handleQuery,
            });
        },
        __state: state,
    };
}

test('global settings persist to system_settings and reload from MySQL without store.json', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-system-settings-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        let store = require(storeModulePath);

        store.setTrialCardConfig({
            enabled: false,
            days: 30,
            dailyLimit: 88,
            cooldownMs: 6 * 60 * 60 * 1000,
            adminRenewEnabled: false,
            userRenewEnabled: true,
            maxAccounts: 5,
        });

        await store.flushGlobalConfigSave();

        assert.deepEqual(mysqlMock.__state.systemSettings.global_config.trialCardConfig, {
            enabled: false,
            dailyLimit: 88,
            cooldownMs: 6 * 60 * 60 * 1000,
            days: 30,
            maxAccounts: 5,
            adminRenewEnabled: false,
            userRenewEnabled: true,
        });
        const storeFile = path.join(tempRoot, 'data', 'store.json');
        assert.equal(fs.existsSync(storeFile), true);
        assert.deepEqual(JSON.parse(fs.readFileSync(storeFile, 'utf8')).trialCardConfig, {
            enabled: false,
            dailyLimit: 88,
            cooldownMs: 6 * 60 * 60 * 1000,
            days: 30,
            maxAccounts: 5,
            adminRenewEnabled: false,
            userRenewEnabled: true,
        });
        fs.rmSync(storeFile, { force: true });

        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        store = require(storeModulePath);
        await store.initStoreRuntime();

        assert.deepEqual(store.getTrialCardConfig(), {
            enabled: false,
            dailyLimit: 88,
            cooldownMs: 6 * 60 * 60 * 1000,
            days: 30,
            maxAccounts: 5,
            adminRenewEnabled: false,
            userRenewEnabled: true,
        });
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('bug report config persists to system_settings and reloads with normalization', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-bug-report-settings-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        let store = require(storeModulePath);

        store.setBugReportConfig({
            enabled: true,
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'bot@example.com',
            smtpPass: 'secret',
            emailFrom: 'bot@example.com',
            emailTo: 'ops@example.com,dev@example.com',
            subjectPrefix: '[BUG]',
            includeFrontendErrors: true,
            includeSystemLogs: true,
            includeRuntimeLogs: false,
            includeAccountLogs: true,
            systemLogLimit: 66,
            runtimeLogLimit: 12,
            accountLogLimit: 8,
            frontendErrorLimit: 6,
            maxBodyLength: 32000,
            cooldownSeconds: 240,
            saveToDatabase: true,
            allowNonAdminSubmit: false,
        });

        await store.flushGlobalConfigSave();

        const persistedBugReportConfig = mysqlMock.__state.systemSettings.global_config.bugReportConfig;
        assert.equal(persistedBugReportConfig.enabled, true);
        assert.equal(persistedBugReportConfig.smtpHost, 'smtp.example.com');
        assert.equal(persistedBugReportConfig.smtpPort, 587);
        assert.equal(persistedBugReportConfig.smtpSecure, false);
        assert.equal(persistedBugReportConfig.smtpUser, 'bot@example.com');
        assert.equal(persistedBugReportConfig.emailFrom, 'bot@example.com');
        assert.equal(persistedBugReportConfig.emailTo, 'ops@example.com,dev@example.com');
        assert.equal(persistedBugReportConfig.subjectPrefix, '[BUG]');
        assert.equal(persistedBugReportConfig.includeRuntimeLogs, false);
        assert.equal(persistedBugReportConfig.cooldownSeconds, 240);
        assert.equal(persistedBugReportConfig.allowNonAdminSubmit, false);
        assert.notEqual(persistedBugReportConfig.smtpPass, 'secret');
        assert.match(persistedBugReportConfig.smtpPass, /^enc:v1:/);

        const storeFile = path.join(tempRoot, 'data', 'store.json');
        const stored = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
        assert.match(stored.bugReportConfig.smtpPass, /^enc:v1:/);
        assert.notEqual(stored.bugReportConfig.smtpPass, 'secret');

        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        store = require(storeModulePath);
        await store.initStoreRuntime();

        assert.deepEqual(store.getBugReportConfig(), {
            enabled: true,
            smtpHost: 'smtp.example.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'bot@example.com',
            smtpPass: 'secret',
            emailFrom: 'bot@example.com',
            emailTo: 'ops@example.com,dev@example.com',
            subjectPrefix: '[BUG]',
            includeFrontendErrors: true,
            includeSystemLogs: true,
            includeRuntimeLogs: false,
            includeAccountLogs: true,
            systemLogLimit: 66,
            runtimeLogLimit: 12,
            accountLogLimit: 8,
            frontendErrorLimit: 6,
            maxBodyLength: 32000,
            cooldownSeconds: 240,
            saveToDatabase: true,
            allowNonAdminSubmit: false,
        });
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('offline reminder persists to system_settings and reloads without store.json fallback', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-offline-reminder-settings-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        let store = require(storeModulePath);

        store.setOfflineReminder({
            channel: 'webhook',
            reloginUrlMode: 'all',
            endpoint: 'https://example.com/offline-hook',
            token: 'offline-token',
            title: '账号下线提醒',
            msg: '检测到账号离线，请及时处理',
            offlineDeleteEnabled: true,
            offlineDeleteSec: 9,
            webhookCustomJsonEnabled: true,
            webhookCustomJsonTemplate: '{\"msg\":\"{{title}}\"}',
        });

        await store.flushGlobalConfigSave();

        assert.deepEqual(mysqlMock.__state.systemSettings.global_config.offlineReminder, {
            channel: 'webhook',
            reloginUrlMode: 'all',
            endpoint: 'https://example.com/offline-hook',
            token: 'offline-token',
            title: '账号下线提醒',
            msg: '检测到账号离线，请及时处理',
            offlineDeleteEnabled: true,
            offlineDeleteSec: 9,
            webhookCustomJsonEnabled: true,
            webhookCustomJsonTemplate: '{"msg":"{{title}}"}',
        });

        const storeFile = path.join(tempRoot, 'data', 'store.json');
        assert.equal(fs.existsSync(storeFile), true);
        assert.deepEqual(JSON.parse(fs.readFileSync(storeFile, 'utf8')).offlineReminder, {
            channel: 'webhook',
            reloginUrlMode: 'all',
            endpoint: 'https://example.com/offline-hook',
            token: 'offline-token',
            title: '账号下线提醒',
            msg: '检测到账号离线，请及时处理',
            offlineDeleteEnabled: true,
            offlineDeleteSec: 9,
            webhookCustomJsonEnabled: true,
            webhookCustomJsonTemplate: '{"msg":"{{title}}"}',
        });
        fs.rmSync(storeFile, { force: true });

        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        store = require(storeModulePath);
        await store.initStoreRuntime();

        assert.deepEqual(store.getOfflineReminder(), {
            channel: 'webhook',
            reloginUrlMode: 'all',
            endpoint: 'https://example.com/offline-hook',
            token: 'offline-token',
            title: '账号下线提醒',
            msg: '检测到账号离线，请及时处理',
            offlineDeleteEnabled: true,
            offlineDeleteSec: 9,
            webhookCustomJsonEnabled: true,
            webhookCustomJsonTemplate: '{"msg":"{{title}}"}',
        });
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('account settings are mirrored to store.json and can recover before db refresh', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-mirror-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        let store = require(storeModulePath);

        store.applyConfigSnapshot({
            intervals: {
                farmMin: 45,
                farmMax: 90,
                friendMin: 120,
                friendMax: 240,
            },
            reportConfig: {
                enabled: true,
                channel: 'email',
                smtpHost: 'smtp.example.com',
                smtpPort: 465,
                smtpSecure: true,
                smtpUser: 'bot@example.com',
                smtpPass: 'secret',
                emailFrom: 'bot@example.com',
                emailTo: 'user@example.com',
                title: '经营汇报',
                hourlyEnabled: true,
                hourlyMinute: 10,
                dailyEnabled: true,
                dailyHour: 20,
                dailyMinute: 30,
                retentionDays: 15,
            },
        }, { accountId: '1009' });

        await store.flushGlobalConfigSave();

        const storeFile = path.join(tempRoot, 'data', 'store.json');
        const stored = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
        assert.equal(stored.accountConfigs['1009'].intervals.farmMin, 45);
        assert.equal(stored.accountConfigs['1009'].intervals.friendMax, 240);
        assert.equal(stored.accountConfigs['1009'].reportConfig.channel, 'email');
        assert.equal(stored.accountConfigs['1009'].reportConfig.smtpHost, 'smtp.example.com');
        assert.equal(stored.accountConfigs['1009'].reportConfig.emailTo, 'user@example.com');

        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        store = require(storeModulePath);

        assert.equal(store.getIntervals('1009').farmMin, 45);
        assert.equal(store.getIntervals('1009').friendMax, 240);
        assert.equal(store.getReportConfig('1009').channel, 'email');
        assert.equal(store.getReportConfig('1009').smtpHost, 'smtp.example.com');
        assert.equal(store.getReportConfig('1009').emailTo, 'user@example.com');
        assert.equal(store.getReportConfig('1009').retentionDays, 15);
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('applyConfigSnapshot updates in-memory timing config for runtime sync without persisting', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-runtime-timing-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];

        const store = require(storeModulePath);
        await store.initStoreRuntime();
        const beforePersisted = JSON.stringify(mysqlMock.__state.systemSettings.global_config || null);

        assert.equal(store.getTimingConfig().ghostingMinMin, 5);
        assert.equal(store.getTimingConfig().ghostingMaxMin, 10);

        store.applyConfigSnapshot({
            timingConfig: {
                ghostingMinMin: 7,
                ghostingMaxMin: 9,
                ghostingProbability: 0.4,
            },
        }, { persist: false });

        assert.equal(store.getTimingConfig().ghostingMinMin, 7);
        assert.equal(store.getTimingConfig().ghostingMaxMin, 9);
        assert.equal(store.getTimingConfig().ghostingProbability, 0.4);
        assert.equal(JSON.stringify(mysqlMock.__state.systemSettings.global_config || null), beforePersisted);
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        delete require.cache[secretCryptoModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
