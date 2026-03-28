const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const dataProviderModulePath = require.resolve('../src/runtime/data-provider');
const storeModulePath = require.resolve('../src/models/store');
const systemSettingsModulePath = require.resolve('../src/services/system-settings');
const runtimePathsModulePath = require.resolve('../src/config/runtime-paths');
const mysqlDbModulePath = require.resolve('../src/services/mysql-db');
const warehouseModulePath = require.resolve('../src/services/warehouse');

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
    const resourceRoot = path.join(process.cwd(), 'core', 'src');
    return {
        getResourcePath(...segments) {
            return path.join(resourceRoot, ...segments);
        },
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
        getAssetCacheDir(...segments) {
            return path.join(dataDir, 'asset-cache', ...segments);
        },
        ensureAssetCacheDir(...segments) {
            const dir = path.join(dataDir, 'asset-cache', ...segments);
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        },
    };
}

function createMysqlMock(initialState = {}) {
    const state = {
        accountConfigs: { ...(initialState.accountConfigs || {}) },
        systemSettings: { ...(initialState.systemSettings || {}) },
    };

    async function handleQuery(sql, params = []) {
        const normalizedSql = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

        if (normalizedSql.startsWith('select * from account_configs')) {
            return [Object.values(state.accountConfigs)];
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
            const [
                accountId,
                accountMode,
                harvestDelayMin,
                harvestDelayMax,
                plantingStrategy,
                preferredSeedId,
                automationFarm,
                automationFarmPush,
                automationLandUpgrade,
                automationFriend,
                automationFriendSteal,
                automationFriendHelp,
                automationFriendBad,
                automationTask,
                automationEmail,
                automationFreeGifts,
                automationShareReward,
                automationVipGift,
                automationMonthCard,
                automationSell,
                automationFertilizer,
                advancedSettings,
            ] = params;

            state.accountConfigs[String(accountId)] = {
                account_id: String(accountId),
                account_mode: accountMode,
                harvest_delay_min: harvestDelayMin,
                harvest_delay_max: harvestDelayMax,
                planting_strategy: plantingStrategy,
                preferred_seed_id: preferredSeedId,
                automation_farm: automationFarm,
                automation_farm_push: automationFarmPush,
                automation_land_upgrade: automationLandUpgrade,
                automation_friend: automationFriend,
                automation_friend_steal: automationFriendSteal,
                automation_friend_help: automationFriendHelp,
                automation_friend_bad: automationFriendBad,
                automation_task: automationTask,
                automation_email: automationEmail,
                automation_free_gifts: automationFreeGifts,
                automation_share_reward: automationShareReward,
                automation_vip_gift: automationVipGift,
                automation_month_card: automationMonthCard,
                automation_sell: automationSell,
                automation_fertilizer: automationFertilizer,
                advanced_settings: advancedSettings,
            };
            return [{ affectedRows: 1 }];
        }

        if (normalizedSql.startsWith('select * from accounts')) {
            return [[]];
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

test('account config persistence keeps tradeConfig and advanced account settings after MySQL reload', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-settings-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        let store = require(storeModulePath);

        const createdAccounts = store.addOrUpdateAccount({ name: '测试账号', platform: 'qq', uin: '1001', username: 'admin' });
        const accountId = String((createdAccounts.accounts[createdAccounts.accounts.length - 1] || {}).id || '');
        assert.equal(accountId, '1');
        store.applyConfigSnapshot({
            accountMode: 'safe',
            harvestDelay: { min: 45, max: 90 },
            riskPromptEnabled: false,
            modeScope: { zoneScope: 'same_zone_only', requiresGameFriend: false, fallbackBehavior: 'strict_block' },
            plantingFallbackStrategy: 'level',
            inventoryPlanting: {
                mode: 'prefer_inventory',
                globalKeepCount: 3,
                reserveRules: [{ seedId: 20059, keepCount: 8 }],
            },
            intervals: {
                farmMin: 45,
                farmMax: 90,
                friendMin: 120,
                friendMax: 240,
                helpMin: 180,
                helpMax: 300,
                stealMin: 210,
                stealMax: 360,
            },
            friendQuietHours: {
                enabled: true,
                start: '00:30',
                end: '06:45',
            },
            stakeoutSteal: {
                enabled: true,
                delaySec: 8,
            },
            forceGetAll: {
                enabled: true,
            },
            automation: {
                farm: false,
                friend: false,
                friend_auto_accept: true,
                friend_help_exp_limit: false,
                fertilizer_buy: true,
                fertilizer_buy_limit: 77,
                fertilizer_60s_anti_steal: true,
                fertilizer_smart_phase: true,
                fastHarvest: true,
                open_server_gift: false,
            },
            tradeConfig: {
                sell: {
                    scope: 'fruit_only',
                    keepMinEachFruit: 12,
                    keepFruitIds: [20059, 20060],
                    rareKeep: { enabled: true, judgeBy: 'either', minPlantLevel: 50, minUnitPrice: 8888 },
                    batchSize: 9,
                    previewBeforeManualSell: true,
                },
            },
            importedSyncAllSource: {
                active: true,
                sourceHash: 'abc123',
                openIds: ['OPEN_A', 'OPEN_B', 'OPEN_C'],
                openIdCount: 3,
                importedAt: 1711550000000,
                updatedAt: 1711550001000,
                lastUsedAt: 1711550002000,
                lastSyncAt: 1711550003000,
                lastSyncFriendCount: 7,
                lastSyncSource: 'imported_syncall',
                lastErrorCode: '',
                meta: {
                    serviceName: 'gamepb.friendpb.FriendService',
                    methodName: 'SyncAll',
                    messageType: 1,
                    clientSeq: 12,
                    serverSeq: 34,
                    wireBytes: 512,
                    bodyBytes: 256,
                },
            },
            reportConfig: {
                enabled: true,
                channel: 'webhook',
                endpoint: 'https://example.com/report',
                token: 'abc123',
                title: '经营汇报测试',
                hourlyEnabled: true,
                hourlyMinute: 15,
                dailyEnabled: true,
                dailyHour: 20,
                dailyMinute: 30,
                retentionDays: 14,
            },
        }, { accountId });

        await store.flushGlobalConfigSave();

        const persisted = mysqlMock.__state.accountConfigs[accountId];
        assert.ok(persisted);

        const advancedSettings = JSON.parse(String(persisted.advanced_settings || '{}'));
        assert.deepEqual(advancedSettings.tradeConfig, {
            sell: {
                scope: 'fruit_only',
                keepMinEachFruit: 12,
                keepFruitIds: [20059, 20060],
                rareKeep: { enabled: true, judgeBy: 'either', minPlantLevel: 50, minUnitPrice: 8888 },
                batchSize: 9,
                previewBeforeManualSell: true,
            },
        });
        assert.deepEqual(advancedSettings.importedSyncAllSource, {
            active: true,
            sourceHash: 'abc123',
            openIds: ['OPEN_A', 'OPEN_B', 'OPEN_C'],
            openIdCount: 3,
            importedAt: 1711550000000,
            updatedAt: 1711550001000,
            lastUsedAt: 1711550002000,
            lastSyncAt: 1711550003000,
            lastSyncFriendCount: 7,
            lastSyncSource: 'imported_syncall',
            lastErrorCode: '',
            meta: {
                serviceName: 'gamepb.friendpb.FriendService',
                methodName: 'SyncAll',
                messageType: 1,
                clientSeq: 12,
                serverSeq: 34,
                wireBytes: 512,
                bodyBytes: 256,
            },
        });
        assert.deepEqual(advancedSettings.inventoryPlanting, {
            mode: 'prefer_inventory',
            globalKeepCount: 3,
            reserveRules: [{ seedId: 20059, keepCount: 8 }],
        });
        assert.deepEqual(advancedSettings.intervals, {
            farm: 30,
            friend: 60,
            farmMin: 45,
            farmMax: 90,
            friendMin: 120,
            friendMax: 240,
            helpMin: 180,
            helpMax: 300,
            stealMin: 210,
            stealMax: 360,
        });
        assert.deepEqual(advancedSettings.friendQuietHours, {
            enabled: true,
            start: '00:30',
            end: '06:45',
        });
        assert.deepEqual(advancedSettings.stakeoutSteal, {
            enabled: true,
            delaySec: 8,
        });
        assert.deepEqual(advancedSettings.forceGetAll, {
            enabled: true,
        });
        assert.equal(advancedSettings.automation.farm, false);
        assert.equal(advancedSettings.automation.friend, false);
        assert.equal(advancedSettings.automation.friend_auto_accept, true);
        assert.equal(advancedSettings.automation.friend_help_exp_limit, false);
        assert.equal(advancedSettings.automation.fertilizer_buy, true);
        assert.equal(advancedSettings.automation.fertilizer_buy_limit, 77);
        assert.equal(advancedSettings.automation.fertilizer_60s_anti_steal, true);
        assert.equal(advancedSettings.automation.fertilizer_smart_phase, true);
        assert.equal(advancedSettings.automation.fastHarvest, true);
        assert.equal(advancedSettings.automation.open_server_gift, false);
        assert.equal(advancedSettings.riskPromptEnabled, false);
        assert.deepEqual(advancedSettings.modeScope, {
            zoneScope: 'same_zone_only',
            requiresGameFriend: false,
            fallbackBehavior: 'strict_block',
        });
        assert.deepEqual(advancedSettings.reportConfig, {
            enabled: true,
            channel: 'webhook',
            endpoint: 'https://example.com/report',
            token: 'abc123',
            smtpHost: '',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: '',
            smtpPass: '',
            emailFrom: '',
            emailTo: '',
            title: '经营汇报测试',
            hourlyEnabled: true,
            hourlyMinute: 15,
            dailyEnabled: true,
            dailyHour: 20,
            dailyMinute: 30,
            retentionDays: 14,
        });

        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        store = require(storeModulePath);
        await store.initStoreRuntime();

        const snapshot = store.getConfigSnapshot(accountId);
        assert.equal(snapshot.accountMode, 'safe');
        assert.deepEqual(snapshot.harvestDelay, { min: 45, max: 90 });
        assert.equal(snapshot.riskPromptEnabled, false);
        assert.deepEqual(snapshot.modeScope, {
            zoneScope: 'same_zone_only',
            requiresGameFriend: false,
            fallbackBehavior: 'strict_block',
        });
        assert.deepEqual(snapshot.inventoryPlanting, {
            mode: 'prefer_inventory',
            globalKeepCount: 3,
            reserveRules: [{ seedId: 20059, keepCount: 8 }],
        });
        assert.deepEqual(snapshot.intervals, {
            farm: 30,
            friend: 60,
            farmMin: 45,
            farmMax: 90,
            friendMin: 120,
            friendMax: 240,
            helpMin: 180,
            helpMax: 300,
            stealMin: 210,
            stealMax: 360,
        });
        assert.deepEqual(snapshot.friendQuietHours, {
            enabled: true,
            start: '00:30',
            end: '06:45',
        });
        assert.deepEqual(snapshot.stakeoutSteal, {
            enabled: true,
            delaySec: 8,
        });
        assert.equal(snapshot.automation.farm, false);
        assert.equal(snapshot.automation.friend, false);
        assert.equal(snapshot.automation.friend_auto_accept, true);
        assert.equal(snapshot.automation.friend_help_exp_limit, false);
        assert.equal(snapshot.automation.fertilizer_buy, true);
        assert.equal(snapshot.automation.fertilizer_buy_limit, 77);
        assert.equal(snapshot.automation.fertilizer_60s_anti_steal, true);
        assert.equal(snapshot.automation.fertilizer_smart_phase, true);
        assert.equal(snapshot.automation.fastHarvest, true);
        assert.equal(snapshot.automation.open_server_gift, false);
        assert.deepEqual(snapshot.forceGetAll, {
            enabled: true,
        });
        assert.deepEqual(snapshot.tradeConfig, {
            sell: {
                scope: 'fruit_only',
                keepMinEachFruit: 12,
                keepFruitIds: [20059, 20060],
                rareKeep: { enabled: true, judgeBy: 'either', minPlantLevel: 50, minUnitPrice: 8888 },
                batchSize: 9,
                previewBeforeManualSell: true,
            },
        });
        assert.deepEqual(snapshot.importedSyncAllSource, {
            active: true,
            sourceHash: 'abc123',
            openIds: ['OPEN_A', 'OPEN_B', 'OPEN_C'],
            openIdCount: 3,
            importedAt: 1711550000000,
            updatedAt: 1711550001000,
            lastUsedAt: 1711550002000,
            lastSyncAt: 1711550003000,
            lastSyncFriendCount: 7,
            lastSyncSource: 'imported_syncall',
            lastErrorCode: '',
            meta: {
                serviceName: 'gamepb.friendpb.FriendService',
                methodName: 'SyncAll',
                messageType: 1,
                clientSeq: 12,
                serverSeq: 34,
                wireBytes: 512,
                bodyBytes: 256,
            },
        });
        assert.deepEqual(snapshot.reportConfig, {
            enabled: true,
            channel: 'webhook',
            endpoint: 'https://example.com/report',
            token: 'abc123',
            smtpHost: '',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: '',
            smtpPass: '',
            emailFrom: '',
            emailTo: '',
            title: '经营汇报测试',
            hourlyEnabled: true,
            hourlyMinute: 15,
            dailyEnabled: true,
            dailyHour: 20,
            dailyMinute: 30,
            retentionDays: 14,
        });
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('trade config normalization deduplicates keepFruitIds and clamps sell thresholds before persistence', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-trade-config-normalize-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);

    try {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        let store = require(storeModulePath);

        const createdAccounts = store.addOrUpdateAccount({ name: '测试账号', platform: 'qq', uin: '2001', username: 'admin' });
        const accountId = String((createdAccounts.accounts[createdAccounts.accounts.length - 1] || {}).id || '');
        assert.equal(accountId, '1');

        const normalizedTradeConfig = store.setTradeConfig(accountId, {
            sell: {
                keepMinEachFruit: -9,
                keepFruitIds: [20059, '20059', 0, -1, 20060, '20060'],
                rareKeep: {
                    enabled: 1,
                    judgeBy: 'unexpected',
                    minPlantLevel: 5000,
                    minUnitPrice: 9999999999,
                },
                batchSize: 999,
                previewBeforeManualSell: 1,
            },
        });

        assert.deepEqual(normalizedTradeConfig, {
            sell: {
                scope: 'fruit_only',
                keepMinEachFruit: 0,
                keepFruitIds: [20059, 20060],
                rareKeep: {
                    enabled: true,
                    judgeBy: 'either',
                    minPlantLevel: 999,
                    minUnitPrice: 999999999,
                },
                batchSize: 50,
                previewBeforeManualSell: true,
            },
        });

        await store.flushGlobalConfigSave();

        const persisted = mysqlMock.__state.accountConfigs[accountId];
        assert.ok(persisted);
        const advancedSettings = JSON.parse(String(persisted.advanced_settings || '{}'));
        assert.deepEqual(advancedSettings.tradeConfig, normalizedTradeConfig);

        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        store = require(storeModulePath);
        await store.initStoreRuntime();

        assert.deepEqual(store.getTradeConfig(accountId), normalizedTradeConfig);
    } finally {
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('saveSettings tradeConfig drives sell preview before and after store reload', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-preview-persist-'));
    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysqlMock = createMysqlMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysqlMock);
    const previousFarmAccountId = process.env.FARM_ACCOUNT_ID;
    const mockBag = {
        items: [
            { id: 40005, name: '土豆', count: 5, price: 22, category: 'fruit' },
            { id: 40006, name: '茄子', count: 4, price: 28, category: 'fruit' },
        ],
        originalItems: [
            { id: 40005, name: '土豆', count: 5, price: 22, category: 'fruit', uid: 10001 },
            { id: 40006, name: '茄子', count: 4, price: 28, category: 'fruit', uid: 10002 },
        ],
    };

    try {
        delete require.cache[dataProviderModulePath];
        delete require.cache[warehouseModulePath];
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];

        let store = require(storeModulePath);
        const { createDataProvider } = require(dataProviderModulePath);
        let warehouse = require(warehouseModulePath);

        const createdAccounts = store.addOrUpdateAccount({ name: '预览测试账号', platform: 'qq', uin: '3001', username: 'admin' });
        const accountId = String((createdAccounts.accounts[createdAccounts.accounts.length - 1] || {}).id || '');
        assert.equal(accountId, '1');
        process.env.FARM_ACCOUNT_ID = accountId;

        function createProvider(currentStore, currentWarehouse) {
            return createDataProvider({
                workers: {},
                globalLogs: [],
                accountLogs: [],
                store: currentStore,
                accountRepository: {
                    async updateConfig() {
                        return { changes: 1 };
                    },
                },
                getAccounts: async () => ({
                    accounts: [{ id: accountId, username: 'admin', platform: 'qq' }],
                }),
                callWorkerApi: async (_accountRef, method, tradeConfig) => {
                    if (method === 'getSellPreview') {
                        return currentWarehouse.buildSellPlanByPolicy(mockBag, tradeConfig);
                    }
                    throw new Error(`unexpected worker method: ${method}`);
                },
                buildDefaultStatus: () => ({}),
                normalizeStatusForPanel: status => status,
                filterLogs: logs => logs,
                addAccountLog: () => {},
                nextConfigRevision: () => 7,
                broadcastConfigToWorkers: () => {},
                startWorker: async () => {},
                stopWorker: async () => {},
                restartWorker: async () => {},
            });
        }

        const provider = createProvider(store, warehouse);
        const saved = await provider.saveSettings(accountId, {
            tradeConfig: {
                sell: {
                    keepMinEachFruit: 2,
                    keepFruitIds: [40006, '40006'],
                    rareKeep: {
                        enabled: false,
                        judgeBy: 'either',
                        minPlantLevel: 50,
                        minUnitPrice: 5000,
                    },
                    batchSize: 9,
                    previewBeforeManualSell: true,
                },
            },
        });

        const expectedTradeConfig = {
            sell: {
                scope: 'fruit_only',
                keepMinEachFruit: 2,
                keepFruitIds: [40006],
                rareKeep: {
                    enabled: false,
                    judgeBy: 'either',
                    minPlantLevel: 50,
                    minUnitPrice: 5000,
                },
                batchSize: 9,
                previewBeforeManualSell: true,
            },
        };

        assert.deepEqual(saved.tradeConfig, expectedTradeConfig);

        const preview = await provider.getSellPreview(accountId);
        assert.equal(preview.totalSellCount, 3);
        assert.equal(preview.totalKeepCount, 6);
        assert.equal(preview.expectedGold, 66);
        assert.deepEqual(
            preview.items.map(item => ({
                id: item.id,
                sellCount: item.sellCount,
                keepCount: item.keepCount,
                keepReasons: item.keepReasons,
            })),
            [
                { id: 40005, sellCount: 3, keepCount: 2, keepReasons: [] },
                { id: 40006, sellCount: 0, keepCount: 4, keepReasons: ['白名单保留'] },
            ],
        );

        delete require.cache[warehouseModulePath];
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        store = require(storeModulePath);
        warehouse = require(warehouseModulePath);
        await store.initStoreRuntime();

        assert.deepEqual(store.getTradeConfig(accountId), expectedTradeConfig);

        const reloadedProvider = createProvider(store, warehouse);
        const reloadedPreview = await reloadedProvider.getSellPreview(accountId);
        assert.equal(reloadedPreview.totalSellCount, 3);
        assert.equal(reloadedPreview.totalKeepCount, 6);
        assert.equal(reloadedPreview.expectedGold, 66);
        assert.deepEqual(
            reloadedPreview.items.map(item => ({
                id: item.id,
                sellCount: item.sellCount,
                keepCount: item.keepCount,
                keepReasons: item.keepReasons,
            })),
            [
                { id: 40005, sellCount: 3, keepCount: 2, keepReasons: [] },
                { id: 40006, sellCount: 0, keepCount: 4, keepReasons: ['白名单保留'] },
            ],
        );
    } finally {
        delete require.cache[dataProviderModulePath];
        delete require.cache[warehouseModulePath];
        delete require.cache[storeModulePath];
        delete require.cache[systemSettingsModulePath];
        if (previousFarmAccountId === undefined) delete process.env.FARM_ACCOUNT_ID;
        else process.env.FARM_ACCOUNT_ID = previousFarmAccountId;
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
