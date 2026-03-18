const test = require('node:test');
const assert = require('node:assert/strict');

const serviceModulePath = require.resolve('../src/services/bug-report-service');
const repositoryModulePath = require.resolve('../src/services/bug-report-repository');
const systemLogQueryModulePath = require.resolve('../src/services/system-log-query');
const loggerModulePath = require.resolve('../src/services/logger');
const pushModulePath = require.resolve('../src/services/push');

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

function loadService(overrides = {}) {
    const calls = {
        inserted: [],
        updated: [],
        sent: [],
        queriedLogs: [],
    };

    const restoreRepository = mockModule(repositoryModulePath, {
        insertBugReport: async (entry) => {
            calls.inserted.push(entry);
            return { id: 77, reportNo: entry.reportNo };
        },
        updateBugReportMailStatus: async (id, payload) => {
            calls.updated.push({ id, payload });
            return true;
        },
        findRecentUserReports: async () => [],
        ...(overrides.repository || {}),
    });

    const restoreSystemLogs = mockModule(systemLogQueryModulePath, {
        querySystemLogsForUser: async (input) => {
            calls.queriedLogs.push(input);
            return {
                total: 1,
                page: 1,
                limit: 10,
                items: [{
                    created_at: '2026-03-18 10:20:00',
                    level: 'warn',
                    text: '系统日志',
                    meta_data: { code: 'W001' },
                }],
            };
        },
        resolveVisibleAccountIds: async () => ['acc-1'],
        ...(overrides.systemLogs || {}),
    });

    const restoreLogger = mockModule(loggerModulePath, {
        redactString: (value) => String(value || ''),
        sanitizeMeta: (value) => value || {},
    });

    const restorePush = mockModule(pushModulePath, {
        sendPushooMessage: async (payload) => {
            calls.sent.push(payload);
            return { ok: true, msg: 'queued' };
        },
        ...(overrides.push || {}),
    });

    delete require.cache[serviceModulePath];
    const { createBugReportService } = require(serviceModulePath);
    const service = createBugReportService({
        store: {
            getBugReportConfig: () => ({
                enabled: true,
                smtpHost: 'smtp.example.com',
                smtpPort: 465,
                smtpSecure: true,
                smtpUser: 'bot@example.com',
                smtpPass: 'secret',
                emailFrom: 'bot@example.com',
                emailTo: 'ops@example.com',
                subjectPrefix: '[BUG反馈]',
                includeFrontendErrors: true,
                includeSystemLogs: true,
                includeRuntimeLogs: true,
                includeAccountLogs: true,
                systemLogLimit: 5,
                runtimeLogLimit: 5,
                accountLogLimit: 5,
                frontendErrorLimit: 5,
                maxBodyLength: 50000,
                cooldownSeconds: 180,
                saveToDatabase: true,
                allowNonAdminSubmit: true,
                ...(overrides.config || {}),
            }),
            setBugReportConfig: (config) => config,
        },
        getPool: () => ({ query: async () => [[]] }),
        getProvider: () => ({
            getLogs: async () => [{
                timestamp: '2026-03-18T10:20:01.000Z',
                level: 'error',
                message: '运行态异常',
            }],
            getAccountLogs: () => [{
                accountId: 'acc-1',
                timestamp: '2026-03-18T10:20:02.000Z',
                level: 'info',
                message: '账号日志',
            }],
            getStatus: async () => ({
                connection: { connected: true },
                wsError: { message: '网络抖动' },
            }),
            ...(overrides.provider || {}),
        }),
        getAccountsSnapshot: async () => ({
            accounts: [{
                id: 'acc-1',
                username: 'tester',
                name: '测试账号',
                running: true,
                platform: 'qq',
            }],
        }),
        logger: {
            info() {},
            warn() {},
            error() {},
        },
        ...(overrides.options || {}),
    });

    const restore = () => {
        delete require.cache[serviceModulePath];
        restoreRepository();
        restoreSystemLogs();
        restoreLogger();
        restorePush();
    };

    return { service, calls, restore };
}

test('submitBugReport inserts record, sends email, and persists mail status', async () => {
    const { service, calls, restore } = loadService();

    try {
        const result = await service.submitBugReport({
            currentUser: { username: 'tester', role: 'user' },
            accountId: 'acc-1',
            payload: {
                title: '好友页异常',
                category: 'friend',
                severity: 'high',
                description: '打开好友页后一直转圈',
                stepsToReproduce: '1. 打开好友页\n2. 等待 10 秒',
                expectedResult: '正常显示好友列表',
                actualResult: '一直加载',
                contact: 'QQ 123456',
                clientContext: {
                    route: '/friends',
                    pageTitle: '好友管理',
                },
                frontendErrors: [{
                    time: '2026-03-18T10:19:00.000Z',
                    message: '好友缓存获取失败',
                }],
            },
        });

        assert.match(result.reportId, /^BR\d{8}-/);
        assert.equal(result.mailSent, true);
        assert.equal(result.mailMessage, 'queued');
        assert.equal(calls.inserted.length, 1);
        assert.equal(calls.updated.length, 1);
        assert.equal(calls.sent.length, 1);
        assert.equal(calls.inserted[0].username, 'tester');
        assert.equal(calls.inserted[0].accountId, 'acc-1');
        assert.equal(calls.inserted[0].title, '好友页异常');
        assert.equal(calls.inserted[0].systemLogsExcerpt.length, 1);
        assert.equal(calls.inserted[0].runtimeLogsExcerpt.length, 1);
        assert.equal(calls.inserted[0].accountLogsExcerpt.length, 1);
        assert.equal(calls.sent[0].channel, 'email');
        assert.match(calls.sent[0].title, /\[BUG反馈\]\[tester\]\[测试账号\]好友页异常/);
        assert.equal(calls.updated[0].id, 77);
        assert.equal(calls.updated[0].payload.mailSent, true);
        assert.equal(calls.updated[0].payload.mailStatus, 'ok');
        assert.ok(calls.updated[0].payload.sentAt instanceof Date);
    } finally {
        restore();
    }
});

test('submitBugReport rejects repeated submissions during cooldown window', async () => {
    const { service, restore } = loadService({
        repository: {
            findRecentUserReports: async () => [{
                id: 1,
                report_no: 'BR20260318-001',
                created_at: new Date(),
            }],
        },
    });

    try {
        await assert.rejects(
            service.submitBugReport({
                currentUser: { username: 'tester', role: 'user' },
                accountId: 'acc-1',
                payload: {
                    title: '重复提交',
                    description: '测试冷却时间',
                },
            }),
            (error) => {
                assert.equal(error.statusCode, 429);
                assert.match(error.message, /提交过于频繁/);
                return true;
            },
        );
    } finally {
        restore();
    }
});

test('admin bug report config masks stored smtpPass and preserves it on blank save', () => {
    const { service, restore } = loadService({
        config: {
            enabled: true,
            smtpPass: 'secret-code',
            emailTo: 'ops@example.com',
        },
        options: {
            store: {
                getBugReportConfig: () => ({
                    enabled: true,
                    smtpHost: 'smtp.example.com',
                    smtpPort: 465,
                    smtpSecure: true,
                    smtpUser: 'bot@example.com',
                    smtpPass: 'secret-code',
                    emailFrom: 'bot@example.com',
                    emailTo: 'ops@example.com',
                    subjectPrefix: '[BUG反馈]',
                    includeFrontendErrors: true,
                    includeSystemLogs: true,
                    includeRuntimeLogs: true,
                    includeAccountLogs: true,
                    systemLogLimit: 5,
                    runtimeLogLimit: 5,
                    accountLogLimit: 5,
                    frontendErrorLimit: 5,
                    maxBodyLength: 50000,
                    cooldownSeconds: 180,
                    saveToDatabase: true,
                    allowNonAdminSubmit: true,
                }),
                setBugReportConfig: (config) => config,
            },
        },
    });

    try {
        const fullConfig = service.getFullConfig();
        assert.equal(fullConfig.smtpPass, '');
        assert.equal(fullConfig.smtpPassConfigured, true);

        const saved = service.saveConfig({
            enabled: true,
            smtpHost: 'smtp.example.com',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: 'bot@example.com',
            smtpPass: '',
            emailFrom: 'bot@example.com',
            emailTo: 'ops@example.com',
            subjectPrefix: '[BUG反馈]',
            includeFrontendErrors: true,
            includeSystemLogs: true,
            includeRuntimeLogs: true,
            includeAccountLogs: true,
            systemLogLimit: 5,
            runtimeLogLimit: 5,
            accountLogLimit: 5,
            frontendErrorLimit: 5,
            maxBodyLength: 50000,
            cooldownSeconds: 180,
            saveToDatabase: true,
            allowNonAdminSubmit: true,
        });

        assert.equal(saved.smtpPass, '');
        assert.equal(saved.smtpPassConfigured, true);
    } finally {
        restore();
    }
});

test('sendTestEmail uses saved smtp config and skips db insert', async () => {
    const { service, calls, restore } = loadService();

    try {
        const result = await service.sendTestEmail({
            currentUser: { username: 'admin', role: 'admin' },
        });

        assert.equal(result.mailSent, true);
        assert.equal(result.mailMessage, 'queued');
        assert.equal(calls.inserted.length, 0);
        assert.equal(calls.updated.length, 0);
        assert.equal(calls.sent.length, 1);
        assert.match(calls.sent[0].title, /问题反馈 SMTP 联调测试/);
        assert.match(calls.sent[0].content, /测试反馈邮件/);
    } finally {
        restore();
    }
});
