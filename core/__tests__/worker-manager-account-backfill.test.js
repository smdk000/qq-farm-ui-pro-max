const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const workerManagerModulePath = require.resolve('../src/runtime/worker-manager');
const schedulerModulePath = require.resolve('../src/services/scheduler');

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

function createSchedulerStub() {
    return {
        setTimeoutTask() {},
        setIntervalTask() {},
        clear() {},
        clearAll() {},
    };
}

test('worker-manager backfills qq uin and avatar from live status sync', async () => {
    const restoreScheduler = mockModule(schedulerModulePath, {
        createScheduler() {
            return createSchedulerStub();
        },
    });

    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = () => ({
        unref() {},
    });

    try {
        delete require.cache[workerManagerModulePath];
        const { createWorkerManager } = require(workerManagerModulePath);
        const workers = {};
        const addAccountCalls = [];
        const markLoginCalls = [];
        const sentPayloads = [];
        let child = null;

        const manager = createWorkerManager({
            fork() {
                child = new EventEmitter();
                child.send = (payload) => {
                    sentPayloads.push(payload);
                };
                child.kill = () => {};
                return child;
            },
            WorkerThread: null,
            runtimeMode: 'fork',
            processRef: { env: {}, pkg: false },
            mainEntryPath: '/tmp/main.js',
            workerScriptPath: '/tmp/worker.js',
            workers,
            globalLogs: [],
            log() {},
            addAccountLog() {},
            normalizeStatusForPanel(status) { return status; },
            buildConfigSnapshotForAccount() { return {}; },
            getOfflineAutoDeleteMs() { return 0; },
            triggerOfflineReminder() {},
            addOrUpdateAccount(payload) {
                addAccountCalls.push(payload);
            },
            async markAccountLoginSuccess(accountId, options) {
                markLoginCalls.push({ accountId, options });
            },
            deleteAccount() {},
            upsertFriendBlacklist() { return false; },
            updateFriendsCache() {},
            mergeFriendsCache() {},
            clearFriendsCache() {},
            broadcastConfigToWorkers() {},
            onStatusSync() {},
            onWorkerLog() {},
        });

        await manager.startWorker({
            id: '1004',
            name: '账号1004',
            platform: 'qq',
            code: 'auth-code-1004',
            uin: '',
            qq: '',
        });

        assert.ok(child);
        assert.equal(sentPayloads.length >= 2, true);

        child.emit('message', {
            type: 'status_sync',
            data: {
                connection: { connected: true },
                status: {
                    name: '悠然恍若隔世梦',
                    level: 24,
                    gold: 12345,
                    exp: 67890,
                    coupon: 5,
                    uin: '416409364',
                    avatarUrl: 'https://thirdqq.qlogo.cn/qqapp/1112386029/68AF60B1D1B712B9F41693B3FA378DE1/100',
                    platform: 'qq',
                },
                uptime: 6,
            },
        });

        assert.equal(workers['1004'].account.uin, '416409364');
        assert.equal(workers['1004'].account.qq, '416409364');
        assert.equal(
            workers['1004'].account.avatar,
            'https://thirdqq.qlogo.cn/qqapp/1112386029/68AF60B1D1B712B9F41693B3FA378DE1/100',
        );
        assert.ok(addAccountCalls.some(call =>
            call
            && call.id === '1004'
            && call.uin === '416409364'
            && call.qq === '416409364'
            && call.avatar === 'https://thirdqq.qlogo.cn/qqapp/1112386029/68AF60B1D1B712B9F41693B3FA378DE1/100',
        ));
        assert.equal(markLoginCalls.length, 1);
        assert.equal(markLoginCalls[0].accountId, '1004');
    } finally {
        globalThis.setInterval = originalSetInterval;
        delete require.cache[workerManagerModulePath];
        restoreScheduler();
    }
});

test('worker-manager clears previous friends cache when live login identity changes', async () => {
    const restoreScheduler = mockModule(schedulerModulePath, {
        createScheduler() {
            return createSchedulerStub();
        },
    });

    const originalSetInterval = globalThis.setInterval;
    globalThis.setInterval = () => ({
        unref() {},
    });

    try {
        delete require.cache[workerManagerModulePath];
        const { createWorkerManager } = require(workerManagerModulePath);
        const workers = {};
        const clearCalls = [];
        let child = null;

        const manager = createWorkerManager({
            fork() {
                child = new EventEmitter();
                child.send = () => {};
                child.kill = () => {};
                return child;
            },
            WorkerThread: null,
            runtimeMode: 'fork',
            processRef: { env: {}, pkg: false },
            mainEntryPath: '/tmp/main.js',
            workerScriptPath: '/tmp/worker.js',
            workers,
            globalLogs: [],
            log() {},
            addAccountLog() {},
            normalizeStatusForPanel(status) { return status; },
            buildConfigSnapshotForAccount() { return {}; },
            getOfflineAutoDeleteMs() { return 0; },
            triggerOfflineReminder() {},
            addOrUpdateAccount() {},
            async markAccountLoginSuccess() {},
            deleteAccount() {},
            upsertFriendBlacklist() { return false; },
            updateFriendsCache() {},
            mergeFriendsCache() {},
            async clearFriendsCache(accountId, options) {
                clearCalls.push({ accountId, options });
                return { ok: true, deletedCount: 2 };
            },
            broadcastConfigToWorkers() {},
            onStatusSync() {},
            onWorkerLog() {},
        });

        await manager.startWorker({
            id: '1005',
            name: '账号1005',
            platform: 'qq',
            code: 'auth-code-1005',
            uin: '111111111',
            qq: '111111111',
        });

        child.emit('message', {
            type: 'status_sync',
            data: {
                connection: { connected: true },
                status: {
                    name: '新身份',
                    level: 10,
                    gold: 100,
                    exp: 200,
                    coupon: 1,
                    uin: '222222222',
                    avatarUrl: 'https://img/next.png',
                    platform: 'qq',
                },
                uptime: 3,
            },
        });

        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(clearCalls, [{
            accountId: '1005',
            options: {
                platform: 'qq',
                uin: '111111111',
                qq: '111111111',
                openId: '',
            },
        }]);
        assert.equal(workers['1005'].account.uin, '222222222');
    } finally {
        globalThis.setInterval = originalSetInterval;
        delete require.cache[workerManagerModulePath];
        restoreScheduler();
    }
});
