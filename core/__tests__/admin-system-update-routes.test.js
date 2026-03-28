const test = require('node:test');
const assert = require('node:assert/strict');

const { registerSystemUpdateAdminRoutes } = require('../src/controllers/admin/system-update-admin-routes');

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
    const middleware = handlers.length > 1 ? handlers.slice(0, -1) : [];
    const handler = handlers[handlers.length - 1];
    return { middleware, handler };
}

function createDeps(overrides = {}) {
    const authRequired = (_req, _res, next) => next && next();
    const userRequired = (_req, _res, next) => next && next();
    return {
        app: null,
        authRequired,
        userRequired,
        adminLogger: { error: () => {} },
        adminOperationLogService: { createAdminOperationLog: async () => null },
        healthProbeService: {
            getDependenciesSnapshot: async () => ({
                ok: true,
                checkedAt: Date.now(),
                dependencies: {
                    mysql: { ok: true, status: 'up', error: '' },
                    redis: { ok: true, status: 'up', error: '' },
                },
            }),
        },
        version: '4.5.18',
        getSystemUpdateConfigRef: async () => ({
            provider: 'github_release',
            preferredScope: 'app',
            preferredStrategy: 'rolling',
            requireDrain: false,
        }),
        saveSystemUpdateConfigRef: async (input) => input,
        getSystemUpdateReleaseCacheRef: async () => ({
            checkedAt: 0,
            source: 'https://api.github.com/repos/demo/repo/releases/latest',
            lastError: '',
            latestRelease: {
                version: '4.5.19',
                versionTag: 'v4.5.19',
                title: 'v4.5.19',
                publishedAt: 1741564800000,
                prerelease: false,
                notes: '',
                url: '',
                source: 'github',
                assets: [],
            },
            releases: [],
        }),
        saveSystemUpdateReleaseCacheRef: async (input) => input,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [],
            clusterNodes: [],
        }),
        saveSystemUpdateRuntimeRef: async (input) => input,
        saveClusterNodeDrainStateRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [],
            clusterNodes: [],
        }),
        loadLatestReleaseRef: async () => ({
            checkedAt: 1741564800000,
            source: 'https://api.github.com/repos/demo/repo/releases/latest',
            lastError: '',
            latestRelease: {
                version: '4.5.19',
                versionTag: 'v4.5.19',
                title: 'v4.5.19',
                publishedAt: 1741564800000,
                prerelease: false,
                notes: '',
                url: '',
                source: 'github',
                assets: [],
            },
            releases: [],
        }),
        listUpdateJobsRef: async () => [],
        getUpdateJobByIdRef: async () => null,
        findActiveUpdateJobRef: async () => null,
        createUpdateJobRef: async (input) => ({
            id: 7,
            jobKey: 'upd_7',
            kind: input.kind || 'app_update',
            scope: input.scope,
            strategy: input.strategy,
            status: 'pending',
            sourceVersion: input.sourceVersion || 'v4.5.18',
            targetVersion: input.targetVersion,
            batchKey: input.batchKey || '',
            createdBy: input.createdBy,
            targetAgentId: input.targetAgentId || '',
            claimAgentId: input.claimAgentId || '',
            drainNodeIds: input.drainNodeIds || [],
            preflight: input.preflight || null,
            rollbackPayload: input.rollbackPayload || null,
            verification: input.verification || null,
            resultSignature: '',
            executionPhase: input.executionPhase || 'preflight',
            payload: input.payload || null,
            result: input.result || null,
        }),
        updateUpdateJobRef: async (idOrKey, patch) => ({
            id: Number(idOrKey) || 7,
            jobKey: `upd_${idOrKey}`,
            kind: 'app_update',
            scope: 'app',
            strategy: 'rolling',
            status: patch.status || 'pending',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: '',
            createdBy: 'root',
            targetAgentId: '',
            claimAgentId: '',
            drainNodeIds: [],
            summaryMessage: patch.summaryMessage || '',
            preflight: patch.preflight || null,
            rollbackPayload: patch.rollbackPayload || null,
            verification: patch.verification || null,
            resultSignature: '',
            executionPhase: patch.executionPhase || 'queued',
            payload: patch.payload || null,
            errorMessage: patch.errorMessage || '',
            result: patch.result || null,
        }),
        listUpdateJobLogsRef: async () => [],
        findLatestSuccessfulRollbackCandidateRef: async () => null,
        getDispatcherRef: () => null,
        getAccountsSnapshotRef: async () => ({ accounts: [] }),
        syncAnnouncementsRef: async () => ({
            added: 0,
            updated: 0,
            skipped: 0,
            totalParsed: 0,
            latestVersion: '',
            sources: {},
            entries: [],
        }),
        getLatestSmokeSummaryRef: async () => null,
        ...overrides,
    };
}

test('system update overview route returns current version and cached latest release', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });
    registerSystemUpdateAdminRoutes(deps);

    const { middleware, handler } = getRouteParts(routes, 'get', '/api/admin/system-update/overview');
    assert.deepEqual(middleware, [deps.authRequired, deps.userRequired]);

    const res = createResponse();
    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.currentVersion, 'v4.5.18');
    assert.equal(res.body.data.latestRelease.versionTag, 'v4.5.19');
    assert.equal(res.body.data.hasUpdate, true);
});

test('system update overview route includes latest smoke summary when available', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getLatestSmokeSummaryRef: async () => ({
            status: 'warning',
            checkedAt: 1742938200000,
            checkedAtLabel: '2026-03-25 21:30:00',
            baseUrl: 'http://127.0.0.1:9527',
            authMode: 'login cookie',
            targetVersion: 'v4.5.19',
            targetScope: 'app',
            targetStrategy: 'rolling',
            targetAgents: '未指定',
            verifyTarget: '/opt/qq-farm-current',
            passCount: 6,
            warnCount: 1,
            failCount: 0,
            passItems: ['更新概览接口可用'],
            warnItems: ['更新预检返回阻断'],
            failItems: [],
            rawFiles: ['04-system-update-overview.json'],
            reportDir: '/tmp/reports/system-update-smoke/20260325_213000',
            summaryPath: '/tmp/reports/system-update-smoke/20260325_213000/SUMMARY.md',
        }),
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'get', '/api/admin/system-update/overview');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.latestSmokeSummary.status, 'warning');
    assert.equal(res.body.data.latestSmokeSummary.warnCount, 1);
    assert.equal(res.body.data.latestSmokeSummary.summaryPath, '/tmp/reports/system-update-smoke/20260325_213000/SUMMARY.md');
});

test('system update check route includes announcement preview and sync recommendation', async () => {
    const { app, routes } = createFakeApp();
    const syncCalls = [];
    const deps = createDeps({
        app,
        syncAnnouncementsRef: async (options = {}) => {
            syncCalls.push(options);
            return {
                added: 2,
                updated: 1,
                skipped: 0,
                totalParsed: 3,
                latestVersion: 'v4.5.19',
                sources: { release_cache: 3 },
                entries: [
                    {
                        title: '版本说明 A',
                        version: 'v4.5.19',
                        publishDate: '2025-03-10',
                        summary: 'A summary',
                        sourceType: 'release_cache',
                        releaseUrl: 'https://example.com/a',
                    },
                ],
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/check');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin', username: 'root' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].dryRun, true);
    assert.equal(syncCalls[0].limit, 6);
    assert.equal(res.body.data.announcementPreview.added, 2);
    assert.equal(res.body.data.announcementPreview.updated, 1);
    assert.equal(res.body.data.announcementPreview.entries[0].title, '版本说明 A');
    assert.deepEqual(res.body.data.syncRecommendation, {
        suggested: true,
        reason: '检测到 2 条可新增公告',
        pendingCount: 3,
        latestVersion: 'v4.5.19',
    });
});

test('system update sync announcements route returns sync result and refreshed overview extras', async () => {
    const { app, routes } = createFakeApp();
    const syncCalls = [];
    const deps = createDeps({
        app,
        syncAnnouncementsRef: async (options = {}) => {
            syncCalls.push(options);
            if (options.dryRun) {
                return {
                    added: 0,
                    updated: 0,
                    skipped: 4,
                    totalParsed: 4,
                    latestVersion: 'v4.5.19',
                    sources: { release_cache: 4 },
                    entries: [],
                };
            }
            return {
                added: 2,
                updated: 1,
                skipped: 1,
                totalParsed: 4,
                latestVersion: 'v4.5.19',
                sources: { release_cache: 4 },
                entries: [
                    {
                        title: '同步公告',
                        version: 'v4.5.19',
                        publishDate: '2025-03-10',
                        summary: 'sync summary',
                        sourceType: 'release_cache',
                        releaseUrl: 'https://example.com/sync',
                    },
                ],
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { middleware, handler } = getRouteParts(routes, 'post', '/api/admin/system-update/sync-announcements');
    assert.deepEqual(middleware, [deps.authRequired, deps.userRequired]);

    const res = createResponse();
    await handler({ currentUser: { role: 'admin', username: 'operator' }, body: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(syncCalls.length, 2);
    assert.equal(syncCalls[0].dryRun, false);
    assert.equal(syncCalls[1].dryRun, true);
    assert.deepEqual(res.body.data.syncResult, {
        added: 2,
        updated: 1,
        skipped: 1,
        totalParsed: 4,
        latestVersion: 'v4.5.19',
        sources: { release_cache: 4 },
        sourceStats: { release_cache: 4 },
        previewCount: 3,
        entries: [{
            title: '同步公告',
            version: 'v4.5.19',
            publishDate: '2025-03-10',
            summary: 'sync summary',
            sourceType: 'release_cache',
            releaseUrl: 'https://example.com/sync',
        }],
    });
    assert.equal(res.body.data.overview.lastAnnouncementSyncResult.added, 2);
    assert.equal(res.body.data.overview.syncRecommendation.suggested, false);
});

test('system update sync announcements route forwards dry-run and markInstalled without persisting sync result', async () => {
    const { app, routes } = createFakeApp();
    const syncCalls = [];
    const deps = createDeps({
        app,
        syncAnnouncementsRef: async (options = {}) => {
            syncCalls.push(options);
            return {
                added: 1,
                updated: 0,
                skipped: 2,
                totalParsed: 3,
                latestVersion: 'v4.5.52',
                sources: { embedded: 3 },
                entries: [],
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/sync-announcements');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'operator' },
        body: {
            dryRun: true,
            limit: 9,
            sourceTypes: ['embedded'],
            markInstalled: 'v4.5.52',
        },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(syncCalls.length, 2);
    assert.deepEqual(syncCalls[0], {
        createdBy: 'operator',
        sourceTypes: ['embedded'],
        limit: 9,
        dryRun: true,
        markInstalled: 'v4.5.52',
    });
    assert.equal(syncCalls[1].dryRun, true);
    assert.equal(res.body.data.syncResult.previewCount, 1);
    assert.equal(res.body.data.overview.lastAnnouncementSyncResult, null);
});

test('system update check route degrades gracefully when announcement preview build fails', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        adminLogger: { error: () => {}, warn: () => {} },
        syncAnnouncementsRef: async () => {
            throw new Error('preview unavailable');
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/check');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin', username: 'root' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.currentVersion, 'v4.5.18');
    assert.equal(res.body.data.announcementPreview, null);
    assert.equal(res.body.data.syncRecommendation, null);
});

test('system update preflight route returns structured blockers', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/preflight');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            targetVersion: 'v4.5.19',
            preflightOverride: {
                minDiskFreeBytes: '9000000000000000',
            },
        },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.ok, false);
    assert.ok(res.body.data.blockerCount >= 1);
    assert.equal(res.body.data.checks.some(item => item.key === 'disk_space'), true);
});

test('system update job logs route returns detail payload', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getUpdateJobByIdRef: async () => ({
            id: 18,
            jobKey: 'upd_18',
            kind: 'app_update',
            scope: 'app',
            strategy: 'rolling',
            status: 'running',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: '',
            preserveCurrent: false,
            requireDrain: false,
            drainNodeIds: [],
            note: '',
            createdBy: 'root',
            targetAgentId: '',
            claimAgentId: 'agent-a',
            progressPercent: 60,
            summaryMessage: 'pulling image',
            payload: null,
            result: { logFile: '/tmp/update.log' },
            preflight: { ok: true, blockerCount: 0, warningCount: 1, checks: [] },
            rollbackPayload: { previousVersion: 'v4.5.18' },
            verification: null,
            resultSignature: 'sig-1',
            executionPhase: 'pull_image',
            errorMessage: '',
            claimedAt: 0,
            startedAt: 0,
            finishedAt: 0,
            createdAt: 1,
            updatedAt: 2,
        }),
        listUpdateJobLogsRef: async () => ([
            {
                id: 91,
                jobId: 18,
                phase: 'pull_image',
                level: 'info',
                message: 'pull started',
                payload: null,
                createdAt: 123,
            },
        ]),
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'get', '/api/admin/system-update/jobs/:jobId/logs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        params: { jobId: '18' },
        query: {},
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.currentPhase, 'pull_image');
    assert.equal(res.body.data.logFilePath, '/tmp/update.log');
    assert.equal(res.body.data.logs.length, 1);
    assert.equal(res.body.data.rollbackPayload.previousVersion, 'v4.5.18');
});

test('system update overview route returns active batch summary when active job belongs to a batch', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        findActiveUpdateJobRef: async () => ({
            id: 31,
            jobKey: 'upd_31',
            batchKey: 'upd_batch_1',
            status: 'running',
            scope: 'cluster',
            strategy: 'rolling',
            targetVersion: 'v4.5.19',
            sourceVersion: 'v4.5.18',
            targetAgentId: 'agent-a',
            claimAgentId: 'agent-a',
            drainNodeIds: ['worker-a'],
            progressPercent: 50,
            summaryMessage: 'agent-a running',
            errorMessage: '',
            createdAt: 10,
            updatedAt: 20,
        }),
        listUpdateJobsRef: async (options = {}) => {
            if (options.batchKey === 'upd_batch_1') {
                return [
                    {
                        id: 31,
                        jobKey: 'upd_31',
                        batchKey: 'upd_batch_1',
                        scope: 'cluster',
                        strategy: 'rolling',
                        status: 'running',
                        sourceVersion: 'v4.5.18',
                        targetVersion: 'v4.5.19',
                        preserveCurrent: false,
                        requireDrain: true,
                        drainNodeIds: ['worker-a'],
                        note: '',
                        createdBy: 'root',
                        targetAgentId: 'agent-a',
                        claimAgentId: 'agent-a',
                        progressPercent: 50,
                        summaryMessage: 'agent-a running',
                        payload: null,
                        result: null,
                        errorMessage: '',
                        claimedAt: 0,
                        startedAt: 0,
                        finishedAt: 0,
                        createdAt: 10,
                        updatedAt: 20,
                    },
                    {
                        id: 32,
                        jobKey: 'upd_32',
                        batchKey: 'upd_batch_1',
                        scope: 'cluster',
                        strategy: 'rolling',
                        status: 'succeeded',
                        sourceVersion: 'v4.5.18',
                        targetVersion: 'v4.5.19',
                        preserveCurrent: false,
                        requireDrain: true,
                        drainNodeIds: ['worker-b'],
                        note: '',
                        createdBy: 'root',
                        targetAgentId: 'agent-b',
                        claimAgentId: 'agent-b',
                        progressPercent: 100,
                        summaryMessage: 'agent-b done',
                        payload: null,
                        result: null,
                        errorMessage: '',
                        claimedAt: 0,
                        startedAt: 0,
                        finishedAt: 0,
                        createdAt: 11,
                        updatedAt: 19,
                    },
                ];
            }
            return [];
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'get', '/api/admin/system-update/overview');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.activeBatch.batchKey, 'upd_batch_1');
    assert.equal(res.body.data.activeBatch.total, 2);
    assert.equal(res.body.data.activeBatch.runningCount, 1);
    assert.equal(res.body.data.activeBatch.succeededCount, 1);
});

test('system update overview route reports drain-and-cutover blockers for running assigned accounts', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [],
            clusterNodes: [
                {
                    nodeId: 'worker-1',
                    role: 'worker',
                    status: 'active',
                    version: 'v4.5.18',
                    connected: true,
                    draining: false,
                    assignedCount: 1,
                    assignedAccountIds: ['1'],
                    updatedAt: 1,
                },
            ],
        }),
        getAccountsSnapshotRef: async () => ({
            accounts: [
                {
                    id: '1',
                    name: '微信测试号',
                    platform: 'wx_car',
                    running: true,
                    code: 'used-code',
                    authTicket: '',
                },
            ],
        }),
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'get', '/api/admin/system-update/overview');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.drainCutoverReadiness.canDrainCutover, false);
    assert.equal(res.body.data.drainCutoverReadiness.blockerCount, 1);
    assert.equal(res.body.data.drainCutoverReadiness.blockers[0].nodeId, 'worker-1');
});

test('system update create job route blocks concurrent active jobs by default', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        findActiveUpdateJobRef: async () => ({
            id: 9,
            jobKey: 'upd_9',
            status: 'running',
            targetVersion: 'v4.5.19',
        }),
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            targetVersion: 'v4.5.19',
        },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /已有待执行或执行中的更新任务/);
});

test('system update create job route blocks when preflight has environment blockers', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        createUpdateJobRef: async () => {
            throw new Error('createUpdateJobRef should not be called when preflight blocks');
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            targetVersion: 'v4.5.19',
            preflightOverride: {
                minDiskFreeBytes: '9000000000000000',
            },
        },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /更新预检未通过/);
    assert.equal(res.body.data.preflight.ok, false);
});

test('system update create job route blocks drain-and-cutover when running assigned accounts would require relogin', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [
                {
                    nodeId: 'agent-a',
                    managedNodeIds: ['worker-1'],
                },
            ],
            clusterNodes: [
                {
                    nodeId: 'worker-1',
                    role: 'worker',
                    status: 'active',
                    version: 'v4.5.18',
                    connected: true,
                    draining: false,
                    assignedCount: 1,
                    assignedAccountIds: ['1'],
                    updatedAt: 1,
                },
            ],
        }),
        getAccountsSnapshotRef: async () => ({
            accounts: [
                {
                    id: '1',
                    name: '微信测试号',
                    platform: 'wx_car',
                    running: true,
                    code: 'used-code',
                    authTicket: '',
                },
            ],
        }),
        createUpdateJobRef: async () => {
            throw new Error('createUpdateJobRef should not be called when precheck blocks');
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            scope: 'worker',
            strategy: 'drain_and_cutover',
            targetVersion: 'v4.5.19',
            targetAgentIds: ['agent-a'],
        },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /不支持无感排空切换/);
    assert.equal(res.body.data.drainCutoverReadiness.blockerCount, 1);
});

test('system update create job route blocks rolling worker update when restarting running code-only accounts would require relogin', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [
                {
                    nodeId: 'agent-a',
                    managedNodeIds: ['worker-1'],
                },
            ],
            clusterNodes: [
                {
                    nodeId: 'worker-1',
                    role: 'worker',
                    status: 'active',
                    version: 'v4.5.18',
                    connected: true,
                    draining: false,
                    assignedCount: 1,
                    assignedAccountIds: ['1'],
                    updatedAt: 1,
                },
            ],
        }),
        getAccountsSnapshotRef: async () => ({
            accounts: [
                {
                    id: '1',
                    name: '微信测试号',
                    platform: 'wx_car',
                    running: true,
                    code: 'used-code',
                    authTicket: '',
                },
            ],
        }),
        createUpdateJobRef: async () => {
            throw new Error('createUpdateJobRef should not be called when worker restart precheck blocks');
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            scope: 'worker',
            strategy: 'rolling',
            targetVersion: 'v4.5.19',
            targetAgentIds: ['agent-a'],
        },
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /目标 worker 上存在运行中的登录码账号/);
    assert.equal(res.body.data.drainCutoverReadiness.blockerCount, 1);
    assert.equal(res.body.data.workerRestartViolations[0].targetAgentId, 'agent-a');
});

test('system update create job route stores rolling update intent with admin defaults', async () => {
    const { app, routes } = createFakeApp();
    const createPayloads = [];
    let runtimePayload = null;
    const deps = createDeps({
        app,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [
                {
                    nodeId: 'agent-a',
                    role: 'host_agent',
                    status: 'idle',
                    version: 'v4.5.18',
                    managedNodeIds: ['worker-a'],
                    updatedAt: Date.now(),
                },
            ],
            clusterNodes: [],
        }),
        createUpdateJobRef: async (input) => {
            createPayloads.push(input);
            return {
                id: 11,
                jobKey: 'upd_11',
                status: 'pending',
                targetVersion: input.targetVersion,
                batchKey: input.batchKey || '',
                scope: input.scope,
                strategy: input.strategy,
                createdBy: input.createdBy,
                targetAgentId: input.targetAgentId || '',
                claimAgentId: input.claimAgentId || '',
                drainNodeIds: input.drainNodeIds || [],
            };
        },
        saveSystemUpdateRuntimeRef: async (input) => {
            runtimePayload = input;
            return input;
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            scope: 'cluster',
            strategy: 'drain_and_cutover',
            preserveCurrent: true,
            requireDrain: true,
            note: 'night rollout',
            targetAgentIds: ['agent-a'],
        },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createPayloads.length, 1);
    assert.equal(createPayloads[0].scope, 'cluster');
    assert.equal(createPayloads[0].strategy, 'drain_and_cutover');
    assert.equal(createPayloads[0].preserveCurrent, true);
    assert.equal(createPayloads[0].requireDrain, true);
    assert.deepEqual(createPayloads[0].drainNodeIds, ['worker-a']);
    assert.equal(createPayloads[0].targetAgentId, 'agent-a');
    assert.equal(createPayloads[0].batchKey, '');
    assert.equal(createPayloads[0].targetVersion, 'v4.5.19');
    assert.equal(createPayloads[0].createdBy, 'root');
    assert.equal(runtimePayload.activeJobId, 11);
    assert.equal(res.body.data.job.jobKey, 'upd_11');
    assert.equal(res.body.data.createdCount, 1);
});

test('system update create job route preserves custom target image tags', async () => {
    const { app, routes } = createFakeApp();
    const createPayloads = [];
    const deps = createDeps({
        app,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [
                {
                    nodeId: 'agent-a',
                    status: 'idle',
                    updatedAt: Date.now(),
                    managedNodeIds: ['worker-a'],
                },
            ],
            clusterNodes: [],
        }),
        createUpdateJobRef: async (input) => {
            createPayloads.push(input);
            return {
                id: 12,
                jobKey: 'upd_12',
                status: 'pending',
                targetVersion: input.targetVersion,
                batchKey: input.batchKey || '',
                scope: input.scope,
                strategy: input.strategy,
                createdBy: input.createdBy,
                targetAgentId: input.targetAgentId || '',
                claimAgentId: input.claimAgentId || '',
                drainNodeIds: input.drainNodeIds || [],
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            scope: 'worker',
            strategy: 'rolling',
            targetVersion: 'test-cluster-v6',
            targetAgentIds: ['agent-a'],
            force: true,
        },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createPayloads[0].targetVersion, 'test-cluster-v6');
    assert.equal(res.body.data.job.targetVersion, 'test-cluster-v6');
});

test('system update create job route fans out cluster update jobs across selected agents', async () => {
    const { app, routes } = createFakeApp();
    const createPayloads = [];
    const deps = createDeps({
        app,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [
                {
                    nodeId: 'agent-a',
                    role: 'host_agent',
                    status: 'idle',
                    version: 'v4.5.18',
                    managedNodeIds: ['worker-a'],
                    updatedAt: Date.now(),
                },
                {
                    nodeId: 'agent-b',
                    role: 'host_agent',
                    status: 'idle',
                    version: 'v4.5.18',
                    managedNodeIds: ['worker-b'],
                    updatedAt: Date.now(),
                },
            ],
            clusterNodes: [],
        }),
        createUpdateJobRef: async (input) => {
            createPayloads.push(input);
            return {
                id: 20 + createPayloads.length,
                jobKey: `upd_${20 + createPayloads.length}`,
                status: 'pending',
                targetVersion: input.targetVersion,
                batchKey: input.batchKey || '',
                scope: input.scope,
                strategy: input.strategy,
                createdBy: input.createdBy,
                targetAgentId: input.targetAgentId || '',
                claimAgentId: input.claimAgentId || '',
                drainNodeIds: input.drainNodeIds || [],
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {
            scope: 'cluster',
            strategy: 'rolling',
            requireDrain: true,
            targetAgentIds: ['agent-a', 'agent-b'],
            note: 'cluster wave',
        },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createPayloads.length, 2);
    assert.deepEqual(createPayloads.map(item => item.targetAgentId), ['agent-a', 'agent-b']);
    assert.deepEqual(createPayloads.map(item => item.drainNodeIds), [['worker-a'], ['worker-b']]);
    assert.ok(createPayloads[0].batchKey);
    assert.equal(createPayloads[0].batchKey, createPayloads[1].batchKey);
    assert.equal(res.body.data.createdCount, 2);
    assert.equal(Array.isArray(res.body.data.jobs), true);
    assert.equal(res.body.data.jobs.length, 2);
    assert.equal(res.body.data.batch.total, 2);
});

test('system update rollback route creates a standard rollback job', async () => {
    const { app, routes } = createFakeApp();
    const createPayloads = [];
    const deps = createDeps({
        app,
        getUpdateJobByIdRef: async () => ({
            id: 88,
            jobKey: 'upd_88',
            kind: 'app_update',
            scope: 'app',
            strategy: 'rolling',
            status: 'failed',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: '',
            preserveCurrent: false,
            requireDrain: false,
            drainNodeIds: [],
            note: '',
            createdBy: 'root',
            targetAgentId: 'agent-a',
            claimAgentId: 'agent-a',
            progressPercent: 0,
            summaryMessage: 'failed',
            payload: { options: { runVerification: true } },
            result: null,
            preflight: null,
            rollbackPayload: { previousVersion: 'v4.5.18' },
            verification: null,
            resultSignature: '',
            executionPhase: 'verify',
            errorMessage: 'boom',
            claimedAt: 0,
            startedAt: 0,
            finishedAt: 0,
            createdAt: 1,
            updatedAt: 2,
        }),
        findLatestSuccessfulRollbackCandidateRef: async () => ({
            id: 77,
            jobKey: 'upd_77',
            sourceVersion: 'v4.5.18',
            rollbackPayload: { previousVersion: 'v4.5.18' },
        }),
        createUpdateJobRef: async (input) => {
            createPayloads.push(input);
            return {
                id: 90,
                jobKey: 'upd_90',
                kind: input.kind,
                scope: input.scope,
                strategy: input.strategy,
                status: 'pending',
                sourceVersion: input.sourceVersion,
                targetVersion: input.targetVersion,
                batchKey: '',
                preserveCurrent: input.preserveCurrent,
                requireDrain: input.requireDrain,
                drainNodeIds: input.drainNodeIds || [],
                note: input.note || '',
                createdBy: input.createdBy,
                targetAgentId: input.targetAgentId || '',
                claimAgentId: '',
                progressPercent: 0,
                summaryMessage: input.summaryMessage || '',
                payload: input.payload || null,
                result: null,
                preflight: null,
                rollbackPayload: input.rollbackPayload || null,
                verification: null,
                resultSignature: '',
                executionPhase: 'preflight',
                errorMessage: '',
                claimedAt: 0,
                startedAt: 0,
                finishedAt: 0,
                createdAt: 1,
                updatedAt: 1,
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs/:jobId/rollback');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        params: { jobId: '88' },
        body: {},
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createPayloads.length, 1);
    assert.equal(createPayloads[0].kind, 'rollback_update');
    assert.equal(createPayloads[0].targetVersion, 'v4.5.18');
    assert.equal(res.body.data.job.kind, 'rollback_update');
});

test('system update retry job route clones failed job with original target agent', async () => {
    const { app, routes } = createFakeApp();
    let createPayload = null;
    const deps = createDeps({
        app,
        getUpdateJobByIdRef: async () => ({
            id: 41,
            jobKey: 'upd_41',
            kind: 'worker_update',
            scope: 'worker',
            strategy: 'rolling',
            status: 'failed',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: '',
            preserveCurrent: true,
            requireDrain: true,
            drainNodeIds: ['worker-a'],
            note: 'retry me',
            createdBy: 'root',
            targetAgentId: 'agent-a',
            claimAgentId: 'agent-a',
            progressPercent: 0,
            summaryMessage: 'failed once',
            payload: { foo: 'bar' },
            result: null,
            errorMessage: 'boom',
            claimedAt: 0,
            startedAt: 0,
            finishedAt: 0,
            createdAt: 1,
            updatedAt: 2,
        }),
        createUpdateJobRef: async (input) => {
            createPayload = input;
            return {
                id: 42,
                jobKey: 'upd_42',
                kind: input.kind,
                scope: input.scope,
                strategy: input.strategy,
                status: 'pending',
                sourceVersion: input.sourceVersion,
                targetVersion: input.targetVersion,
                batchKey: input.batchKey || '',
                preserveCurrent: input.preserveCurrent,
                requireDrain: input.requireDrain,
                drainNodeIds: input.drainNodeIds,
                note: input.note,
                createdBy: input.createdBy,
                targetAgentId: input.targetAgentId || '',
                claimAgentId: '',
                progressPercent: 0,
                summaryMessage: input.summaryMessage || '',
                payload: input.payload || null,
                result: null,
                errorMessage: '',
                claimedAt: 0,
                startedAt: 0,
                finishedAt: 0,
                createdAt: 3,
                updatedAt: 3,
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs/:jobId/retry');
    const res = createResponse();
    await handler({
        params: { jobId: '41' },
        currentUser: { role: 'admin', username: 'root' },
        body: {},
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createPayload.scope, 'worker');
    assert.equal(createPayload.strategy, 'rolling');
    assert.equal(createPayload.targetAgentId, 'agent-a');
    assert.deepEqual(createPayload.drainNodeIds, ['worker-a']);
    assert.equal(createPayload.batchKey, '');
    assert.equal(res.body.data.job.jobKey, 'upd_42');
});

test('system update retry batch route recreates failed child jobs as a new batch', async () => {
    const { app, routes } = createFakeApp();
    const createPayloads = [];
    const deps = createDeps({
        app,
        listUpdateJobsRef: async (options = {}) => {
            if (options.batchKey === 'upd_batch_failed') {
                return [
                    {
                        id: 51,
                        jobKey: 'upd_51',
                        kind: 'cluster_update',
                        scope: 'cluster',
                        strategy: 'rolling',
                        status: 'failed',
                        sourceVersion: 'v4.5.18',
                        targetVersion: 'v4.5.19',
                        batchKey: 'upd_batch_failed',
                        preserveCurrent: false,
                        requireDrain: true,
                        drainNodeIds: ['worker-a'],
                        note: '',
                        createdBy: 'root',
                        targetAgentId: 'agent-a',
                        claimAgentId: 'agent-a',
                        progressPercent: 0,
                        summaryMessage: 'failed-a',
                        payload: null,
                        result: null,
                        errorMessage: 'x',
                        claimedAt: 0,
                        startedAt: 0,
                        finishedAt: 0,
                        createdAt: 1,
                        updatedAt: 10,
                    },
                    {
                        id: 52,
                        jobKey: 'upd_52',
                        kind: 'cluster_update',
                        scope: 'cluster',
                        strategy: 'rolling',
                        status: 'cancelled',
                        sourceVersion: 'v4.5.18',
                        targetVersion: 'v4.5.19',
                        batchKey: 'upd_batch_failed',
                        preserveCurrent: false,
                        requireDrain: true,
                        drainNodeIds: ['worker-b'],
                        note: '',
                        createdBy: 'root',
                        targetAgentId: 'agent-b',
                        claimAgentId: 'agent-b',
                        progressPercent: 0,
                        summaryMessage: 'cancelled-b',
                        payload: null,
                        result: null,
                        errorMessage: '',
                        claimedAt: 0,
                        startedAt: 0,
                        finishedAt: 0,
                        createdAt: 2,
                        updatedAt: 9,
                    },
                ];
            }
            return [];
        },
        createUpdateJobRef: async (input) => {
            createPayloads.push(input);
            return {
                id: 60 + createPayloads.length,
                jobKey: `upd_${60 + createPayloads.length}`,
                kind: input.kind,
                scope: input.scope,
                strategy: input.strategy,
                status: 'pending',
                sourceVersion: input.sourceVersion,
                targetVersion: input.targetVersion,
                batchKey: input.batchKey || '',
                preserveCurrent: input.preserveCurrent,
                requireDrain: input.requireDrain,
                drainNodeIds: input.drainNodeIds,
                note: input.note,
                createdBy: input.createdBy,
                targetAgentId: input.targetAgentId || '',
                claimAgentId: '',
                progressPercent: 0,
                summaryMessage: input.summaryMessage || '',
                payload: input.payload || null,
                result: null,
                errorMessage: '',
                claimedAt: 0,
                startedAt: 0,
                finishedAt: 0,
                createdAt: 3,
                updatedAt: 3,
            };
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/batches/:batchKey/retry-failed');
    const res = createResponse();
    await handler({
        params: { batchKey: 'upd_batch_failed' },
        currentUser: { role: 'admin', username: 'root' },
        body: {},
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createPayloads.length, 2);
    assert.ok(createPayloads[0].batchKey);
    assert.equal(createPayloads[0].batchKey, createPayloads[1].batchKey);
    assert.deepEqual(createPayloads.map(item => item.targetAgentId), ['agent-a', 'agent-b']);
    assert.equal(res.body.data.createdCount, 2);
    assert.equal(res.body.data.batch.total, 2);
});

test('system update cancel job route cancels pending job and keeps next active job in runtime', async () => {
    const { app, routes } = createFakeApp();
    let runtimePayload = null;
    let updatePatch = null;
    const deps = createDeps({
        app,
        getUpdateJobByIdRef: async () => ({
            id: 71,
            jobKey: 'upd_71',
            kind: 'worker_update',
            scope: 'worker',
            strategy: 'rolling',
            status: 'pending',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: 'upd_batch_cancel',
            preserveCurrent: false,
            requireDrain: true,
            drainNodeIds: ['worker-a'],
            note: '',
            createdBy: 'root',
            targetAgentId: 'agent-a',
            claimAgentId: '',
            progressPercent: 0,
            summaryMessage: 'queued',
            payload: null,
            result: null,
            errorMessage: '',
            claimedAt: 0,
            startedAt: 0,
            finishedAt: 0,
            createdAt: 1,
            updatedAt: 1,
        }),
        updateUpdateJobRef: async (_idOrKey, patch) => {
            updatePatch = patch;
            return {
                id: 71,
                jobKey: 'upd_71',
                kind: 'worker_update',
                scope: 'worker',
                strategy: 'rolling',
                status: patch.status,
                sourceVersion: 'v4.5.18',
                targetVersion: 'v4.5.19',
                batchKey: 'upd_batch_cancel',
                preserveCurrent: false,
                requireDrain: true,
                drainNodeIds: ['worker-a'],
                note: '',
                createdBy: 'root',
                targetAgentId: 'agent-a',
                claimAgentId: '',
                progressPercent: patch.progressPercent,
                summaryMessage: patch.summaryMessage,
                payload: null,
                result: patch.result,
                errorMessage: patch.errorMessage,
                claimedAt: 0,
                startedAt: 0,
                finishedAt: patch.finishedAt,
                createdAt: 1,
                updatedAt: patch.finishedAt,
            };
        },
        findActiveUpdateJobRef: async () => ({
            id: 72,
            jobKey: 'upd_72',
            status: 'pending',
            targetVersion: 'v4.5.19',
            batchKey: 'upd_batch_other',
        }),
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 71,
            activeJobStatus: 'pending',
            activeJobKey: 'upd_71',
            activeTargetVersion: 'v4.5.19',
            agentSummary: [],
            clusterNodes: [],
        }),
        saveSystemUpdateRuntimeRef: async (input) => {
            runtimePayload = input;
            return input;
        },
        listUpdateJobsRef: async (options = {}) => {
            if (options.batchKey === 'upd_batch_cancel') {
                return [
                    {
                        id: 71,
                        jobKey: 'upd_71',
                        kind: 'worker_update',
                        scope: 'worker',
                        strategy: 'rolling',
                        status: 'cancelled',
                        sourceVersion: 'v4.5.18',
                        targetVersion: 'v4.5.19',
                        batchKey: 'upd_batch_cancel',
                        preserveCurrent: false,
                        requireDrain: true,
                        drainNodeIds: ['worker-a'],
                        note: '',
                        createdBy: 'root',
                        targetAgentId: 'agent-a',
                        claimAgentId: '',
                        progressPercent: 0,
                        summaryMessage: 'Cancelled from admin panel',
                        payload: null,
                        result: null,
                        errorMessage: '',
                        claimedAt: 0,
                        startedAt: 0,
                        finishedAt: 5,
                        createdAt: 1,
                        updatedAt: 5,
                    },
                ];
            }
            return [];
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/jobs/:jobId/cancel');
    const res = createResponse();
    await handler({
        params: { jobId: '71' },
        currentUser: { role: 'admin', username: 'root' },
        body: { reason: 'stop wave' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(updatePatch.status, 'cancelled');
    assert.equal(updatePatch.errorMessage, 'stop wave');
    assert.equal(res.body.data.job.status, 'cancelled');
    assert.equal(res.body.data.batch.cancelledCount, 1);
    assert.equal(res.body.data.activeJob.id, 72);
    assert.equal(runtimePayload.activeJobId, 72);
});

test('system update cancel batch route cancels pending and claimed jobs only', async () => {
    const { app, routes } = createFakeApp();
    let runtimePayload = null;
    const jobs = [
        {
            id: 81,
            jobKey: 'upd_81',
            kind: 'cluster_update',
            scope: 'cluster',
            strategy: 'rolling',
            status: 'pending',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: 'upd_batch_live',
            preserveCurrent: false,
            requireDrain: true,
            drainNodeIds: ['worker-a'],
            note: '',
            createdBy: 'root',
            targetAgentId: 'agent-a',
            claimAgentId: '',
            progressPercent: 0,
            summaryMessage: 'queued-a',
            payload: null,
            result: null,
            errorMessage: '',
            claimedAt: 0,
            startedAt: 0,
            finishedAt: 0,
            createdAt: 1,
            updatedAt: 1,
        },
        {
            id: 82,
            jobKey: 'upd_82',
            kind: 'cluster_update',
            scope: 'cluster',
            strategy: 'rolling',
            status: 'claimed',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: 'upd_batch_live',
            preserveCurrent: false,
            requireDrain: true,
            drainNodeIds: ['worker-b'],
            note: '',
            createdBy: 'root',
            targetAgentId: 'agent-b',
            claimAgentId: 'agent-b',
            progressPercent: 5,
            summaryMessage: 'claimed-b',
            payload: null,
            result: null,
            errorMessage: '',
            claimedAt: 2,
            startedAt: 0,
            finishedAt: 0,
            createdAt: 2,
            updatedAt: 2,
        },
        {
            id: 83,
            jobKey: 'upd_83',
            kind: 'cluster_update',
            scope: 'cluster',
            strategy: 'rolling',
            status: 'succeeded',
            sourceVersion: 'v4.5.18',
            targetVersion: 'v4.5.19',
            batchKey: 'upd_batch_live',
            preserveCurrent: false,
            requireDrain: true,
            drainNodeIds: ['worker-c'],
            note: '',
            createdBy: 'root',
            targetAgentId: 'agent-c',
            claimAgentId: 'agent-c',
            progressPercent: 100,
            summaryMessage: 'done-c',
            payload: null,
            result: null,
            errorMessage: '',
            claimedAt: 3,
            startedAt: 4,
            finishedAt: 5,
            createdAt: 3,
            updatedAt: 5,
        },
    ];
    const deps = createDeps({
        app,
        listUpdateJobsRef: async (options = {}) => (options.batchKey === 'upd_batch_live' ? jobs : []),
        updateUpdateJobRef: async (idOrKey, patch) => {
            const index = jobs.findIndex(item => item.id === Number(idOrKey));
            assert.ok(index >= 0);
            jobs[index] = {
                ...jobs[index],
                status: patch.status,
                summaryMessage: patch.summaryMessage,
                errorMessage: patch.errorMessage,
                progressPercent: patch.progressPercent,
                finishedAt: patch.finishedAt,
                result: patch.result,
                updatedAt: patch.finishedAt,
            };
            return jobs[index];
        },
        findActiveUpdateJobRef: async () => null,
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 81,
            activeJobStatus: 'pending',
            activeJobKey: 'upd_81',
            activeTargetVersion: 'v4.5.19',
            agentSummary: [],
            clusterNodes: [],
        }),
        saveSystemUpdateRuntimeRef: async (input) => {
            runtimePayload = input;
            return input;
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/batches/:batchKey/cancel-pending');
    const res = createResponse();
    await handler({
        params: { batchKey: 'upd_batch_live' },
        currentUser: { role: 'admin', username: 'root' },
        body: { reason: 'stop remaining wave' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.cancelledCount, 2);
    assert.deepEqual(res.body.data.jobs.map(item => item.id), [81, 82]);
    assert.equal(res.body.data.batch.cancelledCount, 2);
    assert.equal(res.body.data.batch.succeededCount, 1);
    assert.equal(runtimePayload.activeJobId, 0);
});

test('system update check route persists runtime error when remote fetch fails', async () => {
    const { app, routes } = createFakeApp();
    let runtimePayload = null;
    const deps = createDeps({
        app,
        loadLatestReleaseRef: async () => {
            throw new Error('remote offline');
        },
        saveSystemUpdateRuntimeRef: async (input) => {
            runtimePayload = input;
            return input;
        },
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/check');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        body: {},
    }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.ok, false);
    assert.equal(runtimePayload.lastCheckOk, false);
    assert.equal(runtimePayload.lastError, 'remote offline');
});

test('system update node drain route persists drain state and triggers dispatcher rebalance', async () => {
    const { app, routes } = createFakeApp();
    let rebalanceCalls = 0;
    let drainArgs = null;
    const deps = createDeps({
        app,
        saveClusterNodeDrainStateRef: async (nodeId, draining) => {
            drainArgs = { nodeId, draining };
            return {
                lastCheckAt: 0,
                lastCheckOk: true,
                lastError: '',
                activeJobId: 0,
                activeJobStatus: '',
                activeJobKey: '',
                activeTargetVersion: '',
                agentSummary: [],
                clusterNodes: [
                    {
                        nodeId,
                        role: 'worker',
                        status: draining ? 'draining' : 'idle',
                        version: 'v4.5.18',
                        connected: true,
                        draining,
                        assignedCount: 0,
                        assignedAccountIds: [],
                        updatedAt: 1741564800000,
                    },
                ],
            };
        },
        getSystemUpdateRuntimeRef: async () => ({
            lastCheckAt: 0,
            lastCheckOk: true,
            lastError: '',
            activeJobId: 0,
            activeJobStatus: '',
            activeJobKey: '',
            activeTargetVersion: '',
            agentSummary: [],
            clusterNodes: [
                {
                    nodeId: 'worker-a',
                    role: 'worker',
                    status: 'draining',
                    version: 'v4.5.18',
                    connected: true,
                    draining: true,
                    assignedCount: 0,
                    assignedAccountIds: [],
                    updatedAt: 1741564800000,
                },
            ],
        }),
        getDispatcherRef: () => ({
            async rebalance() {
                rebalanceCalls += 1;
            },
        }),
    });
    registerSystemUpdateAdminRoutes(deps);

    const { handler } = getRouteParts(routes, 'post', '/api/admin/system-update/nodes/:nodeId/drain');
    const res = createResponse();
    await handler({
        currentUser: { role: 'admin', username: 'root' },
        params: { nodeId: 'worker-a' },
        body: { draining: true },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(drainArgs, { nodeId: 'worker-a', draining: true });
    assert.equal(rebalanceCalls, 1);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.node.nodeId, 'worker-a');
    assert.equal(res.body.data.node.draining, true);
    assert.equal(res.body.data.dispatcherApplied, true);
});
