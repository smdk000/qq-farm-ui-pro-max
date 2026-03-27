const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAccountSettingsRoutes } = require('../src/controllers/admin/account-settings-routes');
const SETTINGS_PATH_COVERAGE_TOKENS = ['harvestDelay.min', 'harvestDelay.max', 'friendQuietHours.end'];

function createFakeApp() {
    const routes = { get: new Map(), post: new Map() };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
            },
            post(path, ...handlers) {
                routes.post.set(path, handlers);
            },
        },
    };
}

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function getRouteParts(routes, method, path) {
    const handlers = routes[method].get(path);
    assert.ok(handlers, `missing route: ${method.toUpperCase()} ${path}`);
    assert.equal(typeof handlers[0], 'function');
    assert.equal(typeof handlers[handlers.length - 1], 'function');
    return {
        middleware: handlers[0],
        handler: handlers[handlers.length - 1],
    };
}

function createDeps(overrides = {}) {
    const accountOwnershipRequired = (_req, _res, next) => next && next();
    return {
        app: null,
        accountOwnershipRequired,
        getAccId: async () => 'acc-1',
        getProvider: () => ({
            saveSettings: async () => ({ saved: true }),
        }),
        store: {
            ACCOUNT_MODE_PRESETS: { main: {}, worker: {} },
            getIntervals: () => ({ farm: 30 }),
            getPlantingStrategy: () => ({ mode: 'level' }),
            getPreferredSeed: () => 'seed-1',
            getFriendQuietHours: () => ({ enabled: false }),
            getAutomation: () => ({ enabled: true, cycle: 60 }),
            getStakeoutStealConfig: () => ({ enabled: true, delaySec: 5 }),
            getUI: () => ({ theme: 'light' }),
            getConfigSnapshot: () => ({
                accountMode: 'worker',
                harvestDelay: { min: 1, max: 3 },
                riskPromptEnabled: false,
                modeScope: { zoneScope: 'all', requiresGameFriend: false, fallbackBehavior: 'merge' },
                plantingFallbackStrategy: 'inventory',
                inventoryPlanting: { mode: 'global', globalKeepCount: 2, reserveRules: [] },
                qqHighRiskWindow: { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0, lastAutoDisabledNoticeAt: 0 },
                workflowConfig: { farm: { enabled: true, minInterval: 45, maxInterval: 90, nodes: [] } },
            }),
        },
        validateSettings: () => ({ valid: true, coerced: { normalized: true } }),
        adminLogger: { warn: () => {} },
        ...overrides,
    };
}

test('settings save route keeps ownership middleware and writes coerced settings via provider', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getProvider: () => ({
            saveSettings: async (...args) => {
                calls.push(args);
                return { saved: true, accountId: args[0] };
            },
        }),
        validateSettings: (input) => {
            calls.push(['validate', input]);
            return { valid: true, coerced: { normalized: true, source: input.intervals } };
        },
    });

    registerAccountSettingsRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'post', '/api/settings/save');
    assert.equal(middleware, deps.accountOwnershipRequired);

    const res = createResponse();
    await handler(
        {
            body: {
                accountMode: 'main',
                harvestDelay: { min: 1, max: 3 },
                friendQuietHours: { enabled: true, start: '23:00', end: '07:00' },
                intervals: { farm: 30 },
                automation: {
                    fertilizer_gift: true,
                    free_gifts: true,
                    friend_bad: false,
                    friend_steal: true,
                    land_upgrade: true,
                    landUpgradeTarget: 6,
                    share_reward: true,
                    vip_gift: true,
                },
            },
            currentUser: { username: 'admin', role: 'admin' },
        },
        res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(SETTINGS_PATH_COVERAGE_TOKENS, ['harvestDelay.min', 'harvestDelay.max', 'friendQuietHours.end']);
    assert.deepEqual(calls, [
        ['validate', {
            accountMode: 'main',
            harvestDelay: { min: 1, max: 3 },
            friendQuietHours: { enabled: true, start: '23:00', end: '07:00' },
            intervals: { farm: 30 },
            automation: {
                fertilizer_gift: true,
                free_gifts: true,
                friend_bad: false,
                friend_steal: true,
                land_upgrade: true,
                landUpgradeTarget: 6,
                share_reward: true,
                vip_gift: true,
            },
        }],
        ['acc-1', { normalized: true, source: { farm: 30 } }],
    ]);
    assert.deepEqual(res.body, { ok: true, data: { saved: true, accountId: 'acc-1' } });
});

test('settings save route still blocks too-short farm polling values for non-admin users before provider write', async () => {
    const { app, routes } = createFakeApp();
    let saveCalled = false;
    const deps = createDeps({
        app,
        getProvider: () => ({
            saveSettings: async () => {
                saveCalled = true;
                return {};
            },
        }),
    });

    registerAccountSettingsRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/settings/save');
    const res = createResponse();
    await handler(
        {
            body: { intervals: { farm: 10 } },
            currentUser: { username: 'alice', role: 'user' },
        },
        res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(saveCalled, false);
    assert.match(res.body.error, /普通用户农田循环下限为 15秒/);
});

test('settings save route requires explicit confirmation before saving sub-60 friend intervals for non-admin users', async () => {
    const { app, routes } = createFakeApp();
    let saveCalled = false;
    const deps = createDeps({
        app,
        getProvider: () => ({
            saveSettings: async () => {
                saveCalled = true;
                return {};
            },
        }),
    });

    registerAccountSettingsRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/settings/save');
    const res = createResponse();
    await handler(
        {
            body: { intervals: { friendMin: 20, friendMax: 40 } },
            currentUser: { username: 'alice', role: 'user' },
        },
        res,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(saveCalled, false);
    assert.equal(res.body.requiresRiskConfirmation, true);
    assert.match(res.body.error, /低于 60 秒/);
    assert.deepEqual(res.body.riskItems, [
        { key: 'friendMin', label: '好友巡查最小', value: 20, threshold: 60 },
        { key: 'friendMax', label: '好友巡查最大', value: 40, threshold: 60 },
    ]);
});

test('settings save route accepts sub-60 friend intervals for non-admin users after risk confirmation', async () => {
    const { app, routes } = createFakeApp();
    const calls = [];
    const deps = createDeps({
        app,
        getProvider: () => ({
            saveSettings: async (...args) => {
                calls.push(args);
                return { saved: true };
            },
        }),
        validateSettings: (input) => {
            calls.push(['validate', input]);
            return { valid: true, coerced: input };
        },
    });

    registerAccountSettingsRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/settings/save');
    const res = createResponse();
    await handler(
        {
            body: {
                acknowledgeShortIntervalRisk: true,
                intervals: { friendMin: 20, friendMax: 40 },
            },
            currentUser: { username: 'alice', role: 'user' },
        },
        res,
    );

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [
        ['validate', { intervals: { friendMin: 20, friendMax: 40 } }],
        ['acc-1', { intervals: { friendMin: 20, friendMax: 40 } }],
    ]);
});

test('settings save route returns validation errors when strictValidation is enabled', async () => {
    const { app, routes } = createFakeApp();
    const warnings = [];
    const deps = createDeps({
        app,
        validateSettings: () => ({ valid: false, errors: ['invalid field'], coerced: null }),
        adminLogger: {
            warn: (...args) => warnings.push(args),
        },
    });

    registerAccountSettingsRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/settings/save');
    const res = createResponse();
    await handler(
        {
            body: { strictValidation: true, intervals: { farm: 30 } },
            currentUser: { username: 'admin', role: 'admin' },
        },
        res,
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(warnings, [['配置校验警告', { accountId: 'acc-1', errors: ['invalid field'] }]]);
    assert.deepEqual(res.body, {
        ok: false,
        error: '配置校验失败',
        errors: ['invalid field'],
    });
});

test('settings get route keeps ownership middleware and returns merged automation plus fallback config', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        store: {
            ACCOUNT_MODE_PRESETS: { main: {}, worker: {} },
            getIntervals: () => ({ farm: 30, friend: 90 }),
            getPlantingStrategy: () => ({ mode: 'smart' }),
            getPreferredSeed: () => 'seed-9',
            getFriendQuietHours: () => ({ enabled: true, start: 1, end: 7 }),
            getAutomation: () => ({ enabled: true, cycle: 120 }),
            getUI: () => ({ theme: 'green', siteTitle: '御农' }),
            getConfigSnapshot: () => ({
                qqHighRiskWindow: { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0, lastAutoDisabledNoticeAt: 0 },
            }),
        },
    });

    registerAccountSettingsRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'get', '/api/settings');
    assert.equal(middleware, deps.accountOwnershipRequired);

    const res = createResponse();
    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            accountMode: 'main',
            harvestDelay: { min: 0, max: 0 },
            riskPromptEnabled: true,
            modeScope: { zoneScope: 'same_zone_only', requiresGameFriend: true, fallbackBehavior: 'standalone' },
            intervals: { farm: 30, friend: 90 },
            strategy: { mode: 'smart' },
            plantingStrategy: { mode: 'smart' },
            plantingFallbackStrategy: 'level',
            preferredSeed: 'seed-9',
            preferredSeedId: 'seed-9',
            bagSeedPriority: [],
            bagSeedFallbackStrategy: 'level',
            inventoryPlanting: { mode: 'disabled', globalKeepCount: 0, reserveRules: [] },
            friendQuietHours: { enabled: true, start: 1, end: 7 },
            automation: {
                enabled: true,
                cycle: 120,
                stealFilterEnabled: false,
                stealFilterMode: 'blacklist',
                stealFilterPlantIds: [],
                stealFriendFilterEnabled: false,
                stealFriendFilterMode: 'blacklist',
                stealFriendFilterIds: [],
                skipStealRadishEnabled: false,
                forceGetAllEnabled: false,
            },
            stakeoutSteal: { enabled: false, delaySec: 3 },
            qqHighRiskWindow: { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0, lastAutoDisabledNoticeAt: 0 },
            friendRiskConfig: {
                enabled: true,
                passiveDetectEnabled: true,
                passiveWindowSec: 180,
                passiveDailyThreshold: 3,
                markScoreThreshold: 50,
                autoDeprioritize: false,
                eventRetentionDays: 30,
            },
            specialCareFriendIds: [],
            experimentalFeatures: {
                focusStealEnabled: false,
                tlogFlowReportEnabled: false,
                advancedRedpacketTriggerEnabled: false,
            },
            redpacketConfig: {
                enabled: false,
                mode: 'daily',
                checkIntervalSec: 3600,
                notifyTriggeredEnabled: false,
                claimCooldownSec: 600,
            },
            behaviorReportConfig: {
                enabled: false,
                startupSequenceEnabled: true,
                playTimeReportEnabled: true,
                flushIntervalSec: 10,
                maxBufferSize: 10,
            },
            proxyBindingConfig: {
                enabled: false,
                proxyId: '',
                fallbackToDirect: true,
            },
            workflowConfig: {
                farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] },
                friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] },
            },
            tradeConfig: {
                sell: {
                    scope: 'fruit_only',
                    keepMinEachFruit: 0,
                    keepFruitIds: [],
                    rareKeep: { enabled: false, judgeBy: 'either', minPlantLevel: 40, minUnitPrice: 2000 },
                    batchSize: 15,
                    previewBeforeManualSell: false,
                },
            },
            reportConfig: {
                enabled: false,
                channel: 'webhook',
                endpoint: '',
                token: '',
                smtpHost: '',
                smtpPort: 465,
                smtpSecure: true,
                smtpUser: '',
                smtpPass: '',
                emailFrom: '',
                emailTo: '',
                title: '经营汇报',
                hourlyEnabled: false,
                hourlyMinute: 5,
                dailyEnabled: true,
                dailyHour: 21,
                dailyMinute: 0,
            },
            ui: { theme: 'green', siteTitle: '御农' },
            offlineReminder: {
                channel: 'webhook',
                reloginUrlMode: 'none',
                endpoint: '',
                token: '',
                title: '账号下线提醒',
                msg: '账号下线',
                offlineDeleteEnabled: false,
                offlineDeleteSec: 1,
                webhookCustomJsonEnabled: false,
                webhookCustomJsonTemplate: '',
            },
        },
    });
});
