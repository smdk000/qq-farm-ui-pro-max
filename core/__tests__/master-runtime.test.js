const test = require('node:test');
const assert = require('node:assert/strict');

const { initMasterRuntimeDispatcher, disposeMasterRuntimeDispatcher } = require('../src/cluster/master-runtime');

test('initMasterRuntimeDispatcher skips non-master roles', () => {
    const result = initMasterRuntimeDispatcher({
        currentRole: 'standalone',
        getIO: () => ({ id: 'io' }),
        initDispatcher: () => {
            throw new Error('should not initialize dispatcher');
        },
        logger: {},
    });

    assert.equal(result, null);
});

test('initMasterRuntimeDispatcher initializes dispatcher immediately after admin socket is ready', () => {
    const loggerCalls = [];
    const io = { id: 'admin-io' };
    const dispatcher = { id: 'dispatcher' };
    const result = initMasterRuntimeDispatcher({
        currentRole: 'master',
        getIO: () => io,
        initDispatcher: (incomingIo) => {
            assert.equal(incomingIo, io);
            return dispatcher;
        },
        logger: {
            info: (...args) => loggerCalls.push(args),
        },
    });

    assert.equal(result, dispatcher);
    assert.deepEqual(loggerCalls, [['master dispatcher initialized']]);
});

test('initMasterRuntimeDispatcher logs warning and returns null when admin socket is not ready', () => {
    const loggerCalls = [];
    const result = initMasterRuntimeDispatcher({
        currentRole: 'master',
        getIO: () => null,
        initDispatcher: () => ({}),
        logger: {
            warn: (...args) => loggerCalls.push(args),
        },
    });

    assert.equal(result, null);
    assert.deepEqual(loggerCalls, [['master dispatcher skipped: Admin Socket.IO 未就绪']]);
});

test('disposeMasterRuntimeDispatcher skips non-master roles', () => {
    const result = disposeMasterRuntimeDispatcher({
        currentRole: 'standalone',
        disposeDispatcher: () => {
            throw new Error('should not dispose dispatcher');
        },
        logger: {},
    });

    assert.equal(result, null);
});

test('disposeMasterRuntimeDispatcher disposes dispatcher for master role', () => {
    const loggerCalls = [];
    let disposed = false;

    const result = disposeMasterRuntimeDispatcher({
        currentRole: 'master',
        disposeDispatcher: () => {
            disposed = true;
        },
        logger: {
            info: (...args) => loggerCalls.push(args),
        },
    });

    assert.equal(result, null);
    assert.equal(disposed, true);
    assert.deepEqual(loggerCalls, [['master dispatcher disposed']]);
});
