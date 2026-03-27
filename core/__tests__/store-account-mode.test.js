const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const storeModulePath = require.resolve('../src/models/store');
const runtimePathsModulePath = require.resolve('../src/config/runtime-paths');
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

function createMysqlMock(dbRows = []) {
    return {
        isMysqlInitialized() {
            return false;
        },
        getPool() {
            return {
                async query(sql) {
                    if (String(sql).includes('SELECT * FROM account_configs')) {
                        return [dbRows];
                    }
                    if (String(sql).includes('SELECT * FROM accounts')) {
                        return [[]];
                    }
                    return [[]];
                },
            };
        },
        async transaction(handler) {
            return await handler({
                async query() {
                    return [[]];
                },
            });
        },
    };
}

function createMysqlPersistMock({ accountRows = [] } = {}) {
    const insertCalls = [];
    return {
        mock: {
            isMysqlInitialized() {
                return true;
            },
            getPool() {
                return {
                    async query(sql, params = []) {
                        if (String(sql).includes('SELECT * FROM account_configs')) {
                            return [[]];
                        }
                        if (String(sql).includes('SELECT * FROM accounts')) {
                            return [accountRows];
                        }
                        if (String(sql).includes('INSERT INTO accounts')) {
                            insertCalls.push(params);
                            return [[]];
                        }
                        return [[]];
                    },
                };
            },
            async transaction(handler) {
                return await handler({
                    async query() {
                        return [[]];
                    },
                });
            },
        },
        insertCalls,
    };
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('ensureMainAccountUnique only downgrades same-owner accounts in the same zone', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-mode-'));
    const dataDir = path.join(tempRoot, 'data');
    const storeFile = path.join(dataDir, 'store.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ accountConfigs: {}, defaultAccountConfig: {}, accounts: [] }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const restoreMysql = mockModule(mysqlDbModulePath, createMysqlMock());

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        store.addOrUpdateAccount({ name: 'QQ主号A', platform: 'qq', uin: '10001', username: 'admin' });
        store.addOrUpdateAccount({ name: 'QQ主号B', platform: 'qq', uin: '10002', username: 'admin' });
        store.addOrUpdateAccount({ name: '微信主号', platform: 'wx_car', uin: 'wx-10003', username: 'admin' });

        const accounts = store.getAccounts().accounts;
        const qqA = accounts.find(item => String(item.uin) === '10001');
        const qqB = accounts.find(item => String(item.uin) === '10002');
        const wechat = accounts.find(item => String(item.uin) === 'wx-10003');

        assert.ok(qqA);
        assert.ok(qqB);
        assert.ok(wechat);

        store.applyAccountMode(qqA.id, 'main');
        store.applyAccountMode(qqB.id, 'main');
        store.applyAccountMode(wechat.id, 'main');

        const downgraded = await store.ensureMainAccountUnique(qqA.id, 'admin');

        assert.equal(store.getConfigSnapshot(qqA.id).accountMode, 'main');
        assert.equal(store.getConfigSnapshot(qqB.id).accountMode, 'alt');
        assert.equal(store.getConfigSnapshot(wechat.id).accountMode, 'main');
        assert.deepEqual(
            downgraded.map(item => item.id),
            [String(qqB.id)],
        );

        await wait(3200);
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('addOrUpdateAccount can explicitly create a missing id and advances nextId', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-create-'));
    const dataDir = path.join(tempRoot, 'data');
    const storeFile = path.join(dataDir, 'store.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ accountConfigs: {}, defaultAccountConfig: {}, accounts: [] }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const restoreMysql = mockModule(mysqlDbModulePath, createMysqlMock());

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        store.addOrUpdateAccount({ name: '旧账号', platform: 'qq', uin: '10001', username: 'admin' });
        const created = store.addOrUpdateAccount({
            id: '1009',
            name: '指定ID账号',
            platform: 'qq',
            uin: '10009',
            username: 'admin',
            __createIfMissing: true,
        });
        const nextCreated = store.addOrUpdateAccount({ name: '后续账号', platform: 'qq', uin: '10010', username: 'admin' });

        const explicitAccount = created.accounts.find(item => String(item.id) === '1009');
        const laterAccount = nextCreated.accounts.find(item => String(item.uin) === '10010');

        assert.ok(explicitAccount);
        assert.equal(explicitAccount.name, '指定ID账号');
        assert.ok(laterAccount);
        assert.equal(String(laterAccount.id), '1010');

        await wait(3200);
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('addOrUpdateAccount does not overwrite an existing account when explicit create id collides', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-collision-'));
    const dataDir = path.join(tempRoot, 'data');
    const storeFile = path.join(dataDir, 'store.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ accountConfigs: {}, defaultAccountConfig: {}, accounts: [] }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const restoreMysql = mockModule(mysqlDbModulePath, createMysqlMock());

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        store.addOrUpdateAccount({
            id: '1008',
            name: '旧账号1008',
            platform: 'qq',
            uin: '',
            username: 'admin',
            __createIfMissing: true,
        });

        const created = store.addOrUpdateAccount({
            id: '1008',
            name: '新建账号',
            platform: 'qq',
            uin: '',
            code: 'dummy-code',
            username: 'admin',
            __createIfMissing: true,
        });

        const accounts = created.accounts;
        const original = accounts.find(item => String(item.id) === '1008');
        const collisionCreated = accounts.find(item => String(item.id) === '1009');

        assert.equal(created.touchedAccountId, '1009');
        assert.equal(accounts.length, 2);
        assert.ok(original);
        assert.equal(original.name, '旧账号1008');
        assert.ok(collisionCreated);
        assert.equal(collisionCreated.name, '新建账号');

        await wait(3200);
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('persistAccountsNow stores a unique placeholder uin for accounts without identifiers', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-persist-empty-uin-'));
    const dataDir = path.join(tempRoot, 'data');
    const storeFile = path.join(dataDir, 'store.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ accountConfigs: {}, defaultAccountConfig: {}, accounts: [] }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysql = createMysqlPersistMock();
    const restoreMysql = mockModule(mysqlDbModulePath, mysql.mock);

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        const created = store.addOrUpdateAccount({
            name: '空标识账号',
            platform: 'qq',
            code: 'dummy-code',
            username: 'admin',
        });
        const createdId = String(created.touchedAccountId);

        await store.persistAccountsNow(createdId, { strict: true });

        assert.equal(mysql.insertCalls.length, 1);
        assert.equal(mysql.insertCalls[0][0], createdId);
        assert.equal(mysql.insertCalls[0][1], `__ACCOUNT_ID__:${createdId}`);
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('getAccountsFresh decodes placeholder uin values from database rows', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'store-account-decode-empty-uin-'));
    const dataDir = path.join(tempRoot, 'data');
    const storeFile = path.join(dataDir, 'store.json');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify({ accountConfigs: {}, defaultAccountConfig: {}, accounts: [] }, null, 2), 'utf8');

    const restoreRuntimePaths = mockModule(runtimePathsModulePath, createRuntimePathsMock(tempRoot));
    const mysql = createMysqlPersistMock({
        accountRows: [{
            id: 1008,
            uin: '__ACCOUNT_ID__:1008',
            code: 'dummy-code',
            nick: '',
            name: '空标识账号',
            platform: 'qq',
            running: 0,
            avatar: '',
            auth_data: JSON.stringify({}),
            username: 'admin',
            created_at: new Date('2026-03-10T08:00:00Z'),
            updated_at: new Date('2026-03-10T08:00:00Z'),
        }],
    });
    const restoreMysql = mockModule(mysqlDbModulePath, mysql.mock);

    try {
        delete require.cache[storeModulePath];
        const store = require(storeModulePath);

        const fresh = await store.getAccountsFresh({ force: true });

        assert.equal(fresh.accounts.length, 1);
        assert.equal(String(fresh.accounts[0].id), '1008');
        assert.equal(fresh.accounts[0].uin, '');
    } finally {
        delete require.cache[storeModulePath];
        restoreRuntimePaths();
        restoreMysql();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
