const test = require('node:test');
const assert = require('node:assert/strict');

const redisCacheModulePath = require.resolve('../src/services/redis-cache');
const loadEnvModulePath = require.resolve('../src/config/load-env');
const loggerModulePath = require.resolve('../src/services/logger');
const circuitBreakerModulePath = require.resolve('../src/services/circuit-breaker');
const redisDriverModulePath = require.resolve('ioredis');

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

function createLoggerMock() {
    return {
        createModuleLogger() {
            return {
                info() { },
                warn() { },
                error() { },
                debug() { },
            };
        },
    };
}

function createRedisDriverMock() {
    const state = {
        constructCalls: 0,
        connectCalls: 0,
        pingCalls: 0,
        quitCalls: 0,
        disconnectCalls: 0,
        lastInstance: null,
    };

    class MockRedis {
        constructor(options) {
            this.options = options;
            this.status = 'wait';
            this.handlers = new Map();
            state.constructCalls += 1;
            state.lastInstance = this;
        }

        on(eventName, handler) {
            this.handlers.set(eventName, handler);
            return this;
        }

        async connect() {
            state.connectCalls += 1;
            this.status = 'ready';
        }

        async ping() {
            state.pingCalls += 1;
            return 'PONG';
        }

        async quit() {
            state.quitCalls += 1;
            this.status = 'end';
        }

        disconnect() {
            state.disconnectCalls += 1;
            this.status = 'end';
        }

        async set() {
            return 'OK';
        }

        async get() {
            return null;
        }

        async del() {
            return 1;
        }
    }

    return {
        state,
        exports: MockRedis,
    };
}

test('requiring redis-cache stays side-effect free until Redis is actually used', async () => {
    const redisDriver = createRedisDriverMock();
    const restoreLoadEnv = mockModule(loadEnvModulePath, {
        loadProjectEnv() { },
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            allowRequest() { return true; },
            recordSuccess() { },
            recordFailure() { },
        },
        cacheCircuitBreaker: {
            allowRequest() { return true; },
            recordSuccess() { },
            recordFailure() { },
        },
    });
    const restoreRedisDriver = mockModule(redisDriverModulePath, redisDriver.exports);

    try {
        delete require.cache[redisCacheModulePath];
        const redisCache = require(redisCacheModulePath);

        assert.equal(redisDriver.state.constructCalls, 0);

        await redisCache.closeRedis();
        assert.equal(redisDriver.state.constructCalls, 0);

        const firstClient = redisCache.getRedisClient();
        assert.equal(redisDriver.state.constructCalls, 1);
        assert.ok(firstClient);
        assert.equal(redisCache.getRedisClient(), firstClient);
        assert.deepEqual(
            [...redisDriver.state.lastInstance.handlers.keys()].sort(),
            ['close', 'connect', 'error', 'ready', 'reconnecting'],
        );

        await redisCache.closeRedis();
        assert.equal(redisDriver.state.disconnectCalls, 1);

        const secondClient = redisCache.getRedisClient();
        assert.equal(redisDriver.state.constructCalls, 2);
        assert.notEqual(secondClient, firstClient);
    } finally {
        delete require.cache[redisCacheModulePath];
        restoreRedisDriver();
        restoreCircuitBreaker();
        restoreLogger();
        restoreLoadEnv();
    }
});

test('initRedis lazily creates Redis client and performs connect plus ping once', async () => {
    const redisDriver = createRedisDriverMock();
    const restoreLoadEnv = mockModule(loadEnvModulePath, {
        loadProjectEnv() { },
    });
    const restoreLogger = mockModule(loggerModulePath, createLoggerMock());
    const restoreCircuitBreaker = mockModule(circuitBreakerModulePath, {
        circuitBreaker: {
            allowRequest() { return true; },
            recordSuccess() { },
            recordFailure() { },
        },
        cacheCircuitBreaker: {
            allowRequest() { return true; },
            recordSuccess() { },
            recordFailure() { },
        },
    });
    const restoreRedisDriver = mockModule(redisDriverModulePath, redisDriver.exports);

    try {
        delete require.cache[redisCacheModulePath];
        const redisCache = require(redisCacheModulePath);
        const ok = await redisCache.initRedis();

        assert.equal(ok, true);
        assert.equal(redisDriver.state.constructCalls, 1);
        assert.equal(redisDriver.state.connectCalls, 1);
        assert.equal(redisDriver.state.pingCalls, 1);
    } finally {
        delete require.cache[redisCacheModulePath];
        restoreRedisDriver();
        restoreCircuitBreaker();
        restoreLogger();
        restoreLoadEnv();
    }
});
