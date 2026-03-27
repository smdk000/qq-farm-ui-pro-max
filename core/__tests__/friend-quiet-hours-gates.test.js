const test = require('node:test');
const assert = require('node:assert/strict');

const scannerModulePath = require.resolve('../src/services/friend/friend-scanner');
const configModulePath = require.resolve('../src/config/config');
const gameConfigModulePath = require.resolve('../src/config/gameConfig');
const storeModulePath = require.resolve('../src/models/store');
const networkModulePath = require.resolve('../src/utils/network');
const utilsModulePath = require.resolve('../src/utils/utils');
const farmModulePath = require.resolve('../src/services/farm');
const statsModulePath = require.resolve('../src/services/stats');
const warehouseModulePath = require.resolve('../src/services/warehouse');
const accountModePolicyModulePath = require.resolve('../src/services/account-mode-policy');
const platformFactoryModulePath = require.resolve('../src/platform/PlatformFactory');
const friendStateModulePath = require.resolve('../src/services/friend/friend-state');
const friendDecisionModulePath = require.resolve('../src/services/friend/friend-decision');
const friendActionsModulePath = require.resolve('../src/services/friend/friend-actions');
const circuitBreakerModulePath = require.resolve('../src/services/circuit-breaker');

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

function loadScannerWithQuietHours(overrides = {}) {
    const scheduled = [];
    const acceptCalls = [];
    const getApplicationsCalls = [];
    const enterFriendFarmCalls = [];

    const restoreFns = [
        mockModule(configModulePath, { CONFIG: { platform: 'qq' }, PlantPhase: {}, PHASE_NAMES: {} }),
        mockModule(gameConfigModulePath, {
            getPlantName: () => '',
            getPlantById: () => null,
            getSeedImageBySeedId: () => '',
        }),
        mockModule(storeModulePath, {
            isAutomationOn: (key) => key === 'friend_auto_accept',
            getFriendBlacklist: () => [],
            getStakeoutStealConfig: () => ({ enabled: true, delaySec: 5 }),
            getFriendQuietHours: () => ({ enabled: true, start: '23:00', end: '07:00' }),
            ...overrides.store,
        }),
        mockModule(networkModulePath, {
            getUserState: () => ({ gid: 10001 }),
            networkEvents: {
                on() {},
                off() {},
                emit() {},
            },
        }),
        mockModule(utilsModulePath, {
            toLong: (value) => value,
            toNum: (value) => Number(value) || 0,
            toTimeSec: () => 0,
            getServerTimeSec: () => 0,
            log() {},
            logWarn() {},
            sleep: async () => {},
        }),
        mockModule(farmModulePath, {
            getCurrentPhase: () => null,
            setOperationLimitsCallback() {},
        }),
        mockModule(statsModulePath, { recordOperation() {} }),
        mockModule(warehouseModulePath, { sellAllFruits: async () => {} }),
        mockModule(accountModePolicyModulePath, {
            getRuntimeAccountModePolicy: () => ({ collaborationEnabled: true }),
        }),
        mockModule(platformFactoryModulePath, {
            createPlatform: () => ({ allowSyncAll: () => true }),
        }),
        mockModule(friendStateModulePath, {
            friendScheduler: {
                setTimeoutTask(key, waitMs, fn) {
                    scheduled.push({ key, waitMs, fn });
                },
                clear() {},
                clearAll() {},
            },
            activeStakeouts: new Map(),
        }),
        mockModule(friendDecisionModulePath, {
            inFriendQuietHours: () => true,
            parseTimeToMinutes: (value) => {
                if (value === '23:00') return 23 * 60;
                if (value === '07:00') return 7 * 60;
                return null;
            },
            ...overrides.decision,
        }),
        mockModule(friendActionsModulePath, {
            acceptFriends: async (gids) => {
                acceptCalls.push(gids);
                return { friends: [] };
            },
            getApplications: async () => {
                getApplicationsCalls.push(true);
                return { applications: [] };
            },
            enterFriendFarm: async () => {
                enterFriendFarmCalls.push(true);
                return {};
            },
            leaveFriendFarm: async () => ({}),
            ...overrides.actions,
        }),
        mockModule(circuitBreakerModulePath, {
            circuitBreaker: {
                allowRequest: () => true,
            },
        }),
    ];

    delete require.cache[scannerModulePath];
    const previousHighRiskEnv = process.env.FARM_ALLOW_HIGH_RISK_QQ_AUTOMATION;
    process.env.FARM_ALLOW_HIGH_RISK_QQ_AUTOMATION = '1';
    const scanner = require(scannerModulePath);

    return {
        scanner,
        scheduled,
        acceptCalls,
        getApplicationsCalls,
        enterFriendFarmCalls,
        restore() {
            delete require.cache[scannerModulePath];
            if (previousHighRiskEnv === undefined) {
                delete process.env.FARM_ALLOW_HIGH_RISK_QQ_AUTOMATION;
            } else {
                process.env.FARM_ALLOW_HIGH_RISK_QQ_AUTOMATION = previousHighRiskEnv;
            }
            restoreFns.reverse().forEach((fn) => fn());
        },
    };
}

test('friend application push defers auto accept during quiet hours', () => {
    const harness = loadScannerWithQuietHours();

    try {
        harness.scanner.onFriendApplicationReceived([{ gid: 20001, name: '阿甲' }]);

        assert.equal(harness.acceptCalls.length, 0);
        assert.equal(harness.scheduled.length, 1);
        assert.equal(harness.scheduled[0].key, 'friend_auto_accept_after_quiet');
        assert.ok(harness.scheduled[0].waitMs >= 5000);
    } finally {
        harness.restore();
    }
});

test('friend application polling is skipped and deferred during quiet hours', async () => {
    const harness = loadScannerWithQuietHours();

    try {
        await harness.scanner.checkAndAcceptApplications();

        assert.equal(harness.getApplicationsCalls.length, 0);
        assert.equal(harness.acceptCalls.length, 0);
        assert.equal(harness.scheduled.length, 1);
        assert.equal(harness.scheduled[0].key, 'friend_auto_accept_after_quiet');
        assert.ok(harness.scheduled[0].waitMs >= 5000);
    } finally {
        harness.restore();
    }
});

test('stakeout steal is deferred during quiet hours before entering friend farm', async () => {
    const harness = loadScannerWithQuietHours();

    try {
        await harness.scanner.runStakeoutSteal(30001, '阿乙', [7, 9], 5);

        assert.equal(harness.enterFriendFarmCalls.length, 0);
        assert.equal(harness.scheduled.length, 1);
        assert.equal(harness.scheduled[0].key, 'stake_quiet_30001_7_9');
        assert.ok(harness.scheduled[0].waitMs >= 5000);
    } finally {
        harness.restore();
    }
});
