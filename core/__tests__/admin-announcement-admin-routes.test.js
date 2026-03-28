const test = require('node:test');
const assert = require('node:assert/strict');

const { registerAnnouncementAdminRoutes } = require('../src/controllers/admin/announcement-admin-routes');

function createFakeApp() {
    const routes = { get: new Map(), post: new Map(), put: new Map(), delete: new Map() };
    return {
        routes,
        app: {
            get(path, ...handlers) {
                routes.get.set(path, handlers);
            },
            post(path, ...handlers) {
                routes.post.set(path, handlers);
            },
            put(path, ...handlers) {
                routes.put.set(path, handlers);
            },
            delete(path, ...handlers) {
                routes.delete.set(path, handlers);
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
    assert.equal(typeof handler, 'function');
    middleware.forEach((fn) => assert.equal(typeof fn, 'function'));
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
        getAnnouncements: async () => [],
        saveAnnouncement: async () => {},
        deleteAnnouncement: async () => {},
        parseUpdateLog: () => [],
        getIo: () => null,
        store: {
            getThirdPartyApiConfig: () => ({}),
            setThirdPartyApiConfig: (body) => body,
            getClusterConfig: () => ({ dispatcherStrategy: 'round_robin' }),
            setClusterConfig: (body) => body,
            flushGlobalConfigSave: async () => {},
        },
        ...overrides,
    };
}

test('announcement list route stays public and returns stored announcements', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({
        app,
        getAnnouncements: async () => [{ id: 1, title: '公告' }],
    });

    registerAnnouncementAdminRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'get', '/api/announcement');
    assert.deepEqual(middleware, []);

    const res = createResponse();
    await handler({}, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, data: [{ id: 1, title: '公告' }] });
});

test('announcement put route keeps admin middlewares and emits update event', async () => {
    const { app, routes } = createFakeApp();
    const saveCalls = [];
    const ioCalls = [];
    const deps = createDeps({
        app,
        saveAnnouncement: async (payload) => saveCalls.push(payload),
        getIo: () => ({
            emit: (...args) => ioCalls.push(args),
        }),
    });

    registerAnnouncementAdminRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'put', '/api/announcement');
    assert.deepEqual(middleware, [deps.authRequired, deps.userRequired]);

    const res = createResponse();
    await handler({
        body: { id: '7', title: '标题', version: 'v1', publish_date: '2026-03-10', content: '内容', enabled: 1 },
        currentUser: { username: 'admin-user', role: 'admin' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(saveCalls, [{
        id: 7,
        title: '标题',
        version: 'v1',
        publish_date: '2026-03-10',
        content: '内容',
        enabled: true,
        createdBy: 'admin-user',
    }]);
    assert.deepEqual(ioCalls, [['announcement:update', { ok: true }]]);
    assert.deepEqual(res.body, { ok: true });
});

test('announcement sync route deduplicates parsed entries before saving', async () => {
    const { app, routes } = createFakeApp();
    const saveCalls = [];
    const ioCalls = [];
    const deps = createDeps({
        app,
        parseUpdateLog: () => [
            { date: '2026-03-08', title: '旧公告', version: 'v1', content: 'old' },
            { date: '2026-03-09', title: '新公告', version: 'v2', content: 'new' },
        ],
        getAnnouncements: async () => [
            { title: '旧公告', version: 'v1', publish_date: '2026-03-08' },
        ],
        saveAnnouncement: async (payload) => saveCalls.push(payload),
        getIo: () => ({
            emit: (...args) => ioCalls.push(args),
        }),
    });

    registerAnnouncementAdminRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/announcement/sync');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(saveCalls, [{
        title: '新公告',
        version: 'v2',
        publish_date: '2026-03-09',
        content: 'new',
        enabled: true,
        createdBy: 'system_sync',
    }]);
    assert.deepEqual(ioCalls, [['announcement:update', { ok: true }]]);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            added: 1,
            updated: 0,
            skipped: 1,
            totalParsed: 2,
            latestVersion: 'v2',
            sources: { update_log: 2 },
            sourceStats: { update_log: 2 },
            previewCount: 1,
            entries: [
                {
                    title: '新公告',
                    version: 'v2',
                    publishDate: '2026-03-09',
                    summary: 'new',
                    sourceType: 'update_log',
                    releaseUrl: '',
                },
                {
                    title: '旧公告',
                    version: 'v1',
                    publishDate: '2026-03-08',
                    summary: 'old',
                    sourceType: 'update_log',
                    releaseUrl: '',
                },
            ],
        },
        added: 1,
        updated: 0,
        skipped: 1,
        totalParsed: 2,
        latestVersion: 'v2',
        sources: { update_log: 2 },
        sourceStats: { update_log: 2 },
        previewCount: 1,
        entries: [
            {
                title: '新公告',
                version: 'v2',
                publishDate: '2026-03-09',
                summary: 'new',
                sourceType: 'update_log',
                releaseUrl: '',
            },
            {
                title: '旧公告',
                version: 'v1',
                publishDate: '2026-03-08',
                summary: 'old',
                sourceType: 'update_log',
                releaseUrl: '',
            },
        ],
    });
});

test('announcement sync route prefers structured materializer results when provided', async () => {
    const { app, routes } = createFakeApp();
    const ioCalls = [];
    const deps = createDeps({
        app,
        syncAnnouncements: async () => ({
            added: 2,
            updated: 1,
            skipped: 3,
            totalParsed: 6,
            latestVersion: 'v4.5.52',
            sources: { release_cache: 4, embedded: 2 },
            entries: [
                { title: '版本更新', version: 'v4.5.52', publishDate: '2026-03-29', summary: '发布口径统一、集群部署收口与双机升级复核', sourceType: 'release_cache' },
            ],
        }),
        getIo: () => ({
            emit: (...args) => ioCalls.push(args),
        }),
    });

    registerAnnouncementAdminRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/announcement/sync');
    const res = createResponse();
    await handler({ currentUser: { role: 'admin' } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(ioCalls, [['announcement:update', { ok: true }]]);
    assert.deepEqual(res.body, {
        ok: true,
        data: {
            added: 2,
            updated: 1,
            skipped: 3,
            totalParsed: 6,
            latestVersion: 'v4.5.52',
            sources: { release_cache: 4, embedded: 2 },
            sourceStats: { release_cache: 4, embedded: 2 },
            previewCount: 3,
            entries: [
                {
                    title: '版本更新',
                    version: 'v4.5.52',
                    publishDate: '2026-03-29',
                    summary: '发布口径统一、集群部署收口与双机升级复核',
                    sourceType: 'release_cache',
                    releaseUrl: '',
                },
            ],
        },
        added: 2,
        updated: 1,
        skipped: 3,
        totalParsed: 6,
        latestVersion: 'v4.5.52',
        sources: { release_cache: 4, embedded: 2 },
        sourceStats: { release_cache: 4, embedded: 2 },
        previewCount: 3,
        entries: [
            {
                title: '版本更新',
                version: 'v4.5.52',
                publishDate: '2026-03-29',
                summary: '发布口径统一、集群部署收口与双机升级复核',
                sourceType: 'release_cache',
                releaseUrl: '',
            },
        ],
    });
});

test('announcement sync route supports dry run without emitting updates', async () => {
    const { app, routes } = createFakeApp();
    const syncCalls = [];
    const ioCalls = [];
    const deps = createDeps({
        app,
        syncAnnouncements: async (payload) => {
            syncCalls.push(payload);
            return {
                added: 1,
                updated: 0,
                skipped: 2,
                totalParsed: 3,
                latestVersion: 'v4.5.52',
                sources: { embedded: 3 },
            };
        },
        getIo: () => ({
            emit: (...args) => ioCalls.push(args),
        }),
    });

    registerAnnouncementAdminRoutes(deps);
    const { handler } = getRouteParts(routes, 'post', '/api/announcement/sync');
    const res = createResponse();
    await handler({
        body: {
            dryRun: true,
            sourceTypes: ['embedded'],
            previewLimit: 2,
        },
        currentUser: { username: 'ops-admin', role: 'admin' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(syncCalls, [{
        createdBy: 'ops-admin',
        sourceTypes: ['embedded'],
        dryRun: true,
        limit: undefined,
        markInstalled: undefined,
    }]);
    assert.deepEqual(ioCalls, []);
    assert.equal(res.body.previewCount, 1);
    assert.equal(res.body.data.latestVersion, 'v4.5.52');
});

test('third-party api get route blocks non-admin users', async () => {
    const { app, routes } = createFakeApp();
    const deps = createDeps({ app });

    registerAnnouncementAdminRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'get', '/api/admin/third-party-api');
    assert.deepEqual(middleware, [deps.authRequired, deps.userRequired]);

    const res = createResponse();
    await handler({ currentUser: { role: 'user' } }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { ok: false, error: 'Forbidden' });
});

test('cluster-config post route persists config and flushes global save', async () => {
    const { app, routes } = createFakeApp();
    const flushCalls = [];
    const deps = createDeps({
        app,
        store: {
            setClusterConfig: (body) => ({ ...body, saved: true }),
            flushGlobalConfigSave: async () => { flushCalls.push('flush'); },
        },
    });

    registerAnnouncementAdminRoutes(deps);
    const { middleware, handler } = getRouteParts(routes, 'post', '/api/admin/cluster-config');
    assert.deepEqual(middleware, [deps.authRequired, deps.userRequired]);

    const res = createResponse();
    await handler({
        body: { dispatcherStrategy: 'weighted' },
        currentUser: { role: 'admin' },
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(flushCalls, ['flush']);
    assert.deepEqual(res.body, { ok: true, data: { dispatcherStrategy: 'weighted', saved: true } });
});
