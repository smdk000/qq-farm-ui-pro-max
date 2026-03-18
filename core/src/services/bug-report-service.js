const { version } = require('../../package.json');
const { insertBugReport, updateBugReportMailStatus, findRecentUserReports } = require('./bug-report-repository');
const { renderBugReportEmailHtml, renderBugReportEmailText } = require('./bug-report-email-template');
const { querySystemLogsForUser, resolveVisibleAccountIds } = require('./system-log-query');
const { redactString, sanitizeMeta } = require('./logger');
const { sendPushooMessage } = require('./push');

const MAX_TITLE_LENGTH = 120;
const MAX_FIELD_LENGTH = 5000;
const CATEGORY_OPTIONS = Object.freeze([
    { label: '登录问题', value: 'login' },
    { label: '账号运行', value: 'runtime' },
    { label: '好友功能', value: 'friend' },
    { label: '农场功能', value: 'farm' },
    { label: '页面显示', value: 'ui' },
    { label: '性能卡顿', value: 'performance' },
    { label: '其他问题', value: 'other' },
]);
const SEVERITY_OPTIONS = Object.freeze([
    { label: '低', value: 'low' },
    { label: '中', value: 'medium' },
    { label: '高', value: 'high' },
    { label: '阻断', value: 'critical' },
]);
const CATEGORY_SET = new Set(CATEGORY_OPTIONS.map(item => item.value));
const SEVERITY_SET = new Set(SEVERITY_OPTIONS.map(item => item.value));

function trimText(value, max = MAX_FIELD_LENGTH) {
    return String(value || '').trim().slice(0, max);
}

function formatDateParts(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const pad = value => String(value).padStart(2, '0');
    return {
        ymd: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
        time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${String(d.getMilliseconds()).padStart(3, '0')}`,
    };
}

function createReportNo() {
    const parts = formatDateParts();
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `BR${parts.ymd}-${parts.time}-${suffix}`;
}

function normalizeClientContext(input = {}) {
    const src = (input && typeof input === 'object') ? input : {};
    const entries = Object.entries(src)
        .map(([key, value]) => [String(key || '').trim().slice(0, 60), trimText(value, 1000)])
        .filter(([key, value]) => key && value);
    return Object.fromEntries(entries);
}

function normalizeFrontendErrors(input = [], limit = 10) {
    if (!Array.isArray(input)) {
        return [];
    }
    return input
        .slice(-Math.max(1, limit))
        .map((item) => {
            const src = (item && typeof item === 'object') ? item : {};
            return {
                time: trimText(src.time || src.timestamp || '', 64),
                message: redactString(trimText(src.message || src.msg || src.reason || '', 500)),
                stack: redactString(trimText(src.stack || '', 1200)),
            };
        })
        .filter(item => item.message || item.time || item.stack);
}

function sanitizeLogEntry(entry = {}) {
    const raw = (entry && typeof entry === 'object') ? entry : {};
    return {
        time: trimText(raw.time || raw.created_at || raw.timestamp || '', 64),
        level: trimText(raw.level || raw.tag || '', 32),
        action: trimText(raw.action || '', 48),
        message: redactString(trimText(raw.text || raw.msg || raw.message || raw.reason || '', 500)),
        meta: sanitizeMeta(raw.meta || raw.meta_data || {}),
    };
}

function normalizeServerContext(input = {}) {
    const src = (input && typeof input === 'object') ? input : {};
    const out = {};
    for (const [key, value] of Object.entries(src)) {
        const normalizedKey = String(key || '').trim().slice(0, 60);
        if (!normalizedKey) {
            continue;
        }
        if (value && typeof value === 'object') {
            out[normalizedKey] = sanitizeMeta(value);
        } else {
            out[normalizedKey] = redactString(trimText(value, 500));
        }
    }
    return out;
}

function isMailConfigured(config = {}) {
    return !!(
        trimText(config.smtpHost, 255)
        && trimText(config.emailTo, 1000)
        && trimText(config.emailFrom || config.smtpUser, 255)
    );
}

function buildPublicBugReportConfig(config = {}, currentUser) {
    const isAdmin = currentUser && currentUser.role === 'admin';
    const canSubmit = !!config.enabled && (isAdmin || config.allowNonAdminSubmit !== false);
    return {
        enabled: !!config.enabled,
        canSubmit,
        requiresAdmin: !isAdmin && config.allowNonAdminSubmit === false,
        maxTitleLength: MAX_TITLE_LENGTH,
        maxDescriptionLength: MAX_FIELD_LENGTH,
        categoryOptions: CATEGORY_OPTIONS,
        severityOptions: SEVERITY_OPTIONS,
    };
}

function buildAdminBugReportConfig(config = {}) {
    return {
        ...config,
        smtpPass: '',
        smtpPassConfigured: !!trimText(config.smtpPass, 1000),
    };
}

async function resolveSelectedAccount({ accountId, currentUser, getAccountsSnapshot }) {
    const normalizedAccountId = String(accountId || '').trim();
    if (!normalizedAccountId) {
        return null;
    }
    const snapshot = await getAccountsSnapshot();
    const accounts = Array.isArray(snapshot && snapshot.accounts) ? snapshot.accounts : [];
    const matched = accounts.find(item => String(item && item.id || '').trim() === normalizedAccountId);
    if (!matched) {
        const error = new Error('当前账号不存在');
        error.statusCode = 404;
        throw error;
    }
    if (currentUser && currentUser.role !== 'admin' && String(matched.username || '').trim() !== String(currentUser.username || '').trim()) {
        const error = new Error('无权提交此账号的问题反馈');
        error.statusCode = 403;
        throw error;
    }
    return matched;
}

async function collectSystemLogsExcerpt({ getPool, currentUser, getAccountsSnapshot, accountId, limit }) {
    const result = await querySystemLogsForUser({
        getPool,
        currentUser,
        getAccountsSnapshot,
        page: 1,
        limit,
        accountId,
    });
    return (result.items || []).map(sanitizeLogEntry);
}

async function collectRuntimeLogsExcerpt({ getProvider, accountId, limit }) {
    const provider = getProvider();
    const logs = provider && typeof provider.getLogs === 'function'
        ? await provider.getLogs(accountId, { limit })
        : [];
    return Array.isArray(logs) ? logs.map(sanitizeLogEntry) : [];
}

async function collectAccountLogsExcerpt({ getProvider, currentUser, getAccountsSnapshot, accountId, limit }) {
    const provider = getProvider();
    const logs = provider && typeof provider.getAccountLogs === 'function'
        ? provider.getAccountLogs(Math.max(limit * 3, limit))
        : [];
    if (!Array.isArray(logs) || logs.length === 0) {
        return [];
    }
    const visibleAccountIds = await resolveVisibleAccountIds(currentUser, getAccountsSnapshot);
    return logs
        .filter((item) => {
            const itemAccountId = String(item && item.accountId || '').trim();
            if (accountId) {
                return itemAccountId === String(accountId).trim();
            }
            if (Array.isArray(visibleAccountIds)) {
                return itemAccountId && visibleAccountIds.includes(itemAccountId);
            }
            return true;
        })
        .slice(0, Math.max(1, limit))
        .map(sanitizeLogEntry);
}

async function collectServerContext({ getProvider, selectedAccount }) {
    const provider = getProvider();
    const accountId = String(selectedAccount && selectedAccount.id || '').trim();
    let status = {};
    if (accountId && provider && typeof provider.getStatus === 'function') {
        status = await provider.getStatus(accountId);
    }
    const connection = status && typeof status === 'object' && status.connection && typeof status.connection === 'object'
        ? status.connection
        : {};
    const wsError = status && typeof status === 'object' && status.wsError
        ? status.wsError
        : (selectedAccount && selectedAccount.wsError ? selectedAccount.wsError : null);
    return normalizeServerContext({
        appVersion: version,
        serverTime: new Date().toISOString(),
        accountConnected: connection.connected ? 'true' : 'false',
        accountRunning: selectedAccount && selectedAccount.running ? 'true' : 'false',
        accountPlatform: selectedAccount && selectedAccount.platform ? selectedAccount.platform : '',
        wsError: wsError || '',
    });
}

function normalizeInput(input = {}) {
    const category = trimText(input.category, 32).toLowerCase();
    const severity = trimText(input.severity, 16).toLowerCase();
    const title = trimText(input.title, MAX_TITLE_LENGTH);
    const description = trimText(input.description, MAX_FIELD_LENGTH);

    if (!title) {
        const error = new Error('问题标题不能为空');
        error.statusCode = 400;
        throw error;
    }
    if (!description) {
        const error = new Error('问题描述不能为空');
        error.statusCode = 400;
        throw error;
    }

    return {
        title,
        category: CATEGORY_SET.has(category) ? category : 'other',
        severity: SEVERITY_SET.has(severity) ? severity : 'medium',
        description,
        stepsToReproduce: trimText(input.stepsToReproduce, MAX_FIELD_LENGTH),
        expectedResult: trimText(input.expectedResult, MAX_FIELD_LENGTH),
        actualResult: trimText(input.actualResult, MAX_FIELD_LENGTH),
        contact: trimText(input.contact, 255),
        clientContext: normalizeClientContext(input.clientContext),
    };
}

function buildMailSubject(config = {}, report = {}) {
    const prefix = trimText(config.subjectPrefix, 40) || '[BUG反馈]';
    const userLabel = trimText(report.username, 64);
    const accountLabel = trimText(report.accountName || report.accountId, 120);
    const subjectParts = [prefix];
    if (userLabel) subjectParts.push(`[${userLabel}]`);
    if (accountLabel) subjectParts.push(`[${accountLabel}]`);
    subjectParts.push(report.title || '未命名问题');
    return subjectParts.join('');
}

function ensureMailReady(config = {}, currentUser) {
    if (!currentUser || !currentUser.username) {
        const error = new Error('未登录，无法发送问题反馈邮件');
        error.statusCode = 401;
        throw error;
    }
    if (!isMailConfigured(config)) {
        const error = new Error('管理员尚未完成问题反馈邮箱配置');
        error.statusCode = 400;
        throw error;
    }
}

function ensureSubmitAllowed(config = {}, currentUser) {
    if (!config.enabled) {
        const error = new Error('问题反馈功能尚未开启');
        error.statusCode = 403;
        throw error;
    }
    ensureMailReady(config, currentUser);
    if (currentUser.role !== 'admin' && config.allowNonAdminSubmit === false) {
        const error = new Error('当前仅管理员可提交问题反馈');
        error.statusCode = 403;
        throw error;
    }
}

function computeRemainingCooldownSeconds(createdAt, cooldownSeconds) {
    const createdAtMs = createdAt instanceof Date
        ? createdAt.getTime()
        : Date.parse(String(createdAt || ''));
    if (!Number.isFinite(createdAtMs)) {
        return Math.max(0, cooldownSeconds);
    }
    const diff = Date.now() - createdAtMs;
    return Math.max(0, Math.ceil((cooldownSeconds * 1000 - diff) / 1000));
}

function trimExcerptList(list, limit) {
    return (Array.isArray(list) ? list : []).slice(0, Math.max(1, limit));
}

function capPayloadSize(payload = {}, maxBodyLength = 50000) {
    const max = Math.max(5000, Number.parseInt(maxBodyLength, 10) || 50000);
    const capText = value => trimText(value, Math.floor(max / 2));
    return {
        ...payload,
        description: capText(payload.description),
        stepsToReproduce: capText(payload.stepsToReproduce),
        expectedResult: capText(payload.expectedResult),
        actualResult: capText(payload.actualResult),
        frontendErrors: trimExcerptList(payload.frontendErrors, 20),
        systemLogsExcerpt: trimExcerptList(payload.systemLogsExcerpt, 100),
        runtimeLogsExcerpt: trimExcerptList(payload.runtimeLogsExcerpt, 100),
        accountLogsExcerpt: trimExcerptList(payload.accountLogsExcerpt, 100),
    };
}

function createBugReportService(options = {}) {
    const {
        store,
        getPool,
        getProvider,
        getAccountsSnapshot,
        logger = { info() { }, warn() { }, error() { } },
    } = options;

    return {
        getPublicConfig(currentUser) {
            const config = store.getBugReportConfig ? store.getBugReportConfig() : {};
            return buildPublicBugReportConfig(config, currentUser);
        },

        getFullConfig() {
            const config = store.getBugReportConfig ? store.getBugReportConfig() : {};
            return buildAdminBugReportConfig(config);
        },

        saveConfig(config) {
            const current = store.getBugReportConfig ? store.getBugReportConfig() : {};
            const payload = { ...(config || {}) };
            if (!trimText(payload.smtpPass, 1000) && trimText(current.smtpPass, 1000)) {
                payload.smtpPass = current.smtpPass;
            }
            const saved = store.setBugReportConfig ? store.setBugReportConfig(payload) : payload;
            return buildAdminBugReportConfig(saved);
        },

        async sendTestEmail({ currentUser }) {
            const config = store.getBugReportConfig ? store.getBugReportConfig() : {};
            ensureMailReady(config, currentUser);
            if (!currentUser || currentUser.role !== 'admin') {
                const error = new Error('仅管理员可发送测试反馈邮件');
                error.statusCode = 403;
                throw error;
            }

            const now = new Date();
            const bugPayload = {
                reportNo: `BR-TEST-${formatDateParts(now).time}`,
                username: currentUser.username,
                accountId: '',
                accountName: '',
                category: 'other',
                severity: 'low',
                title: '问题反馈 SMTP 联调测试',
                description: '这是一封由管理员在设置页触发的测试反馈邮件，用于验证问题反馈邮箱配置是否可用。',
                stepsToReproduce: '',
                expectedResult: '目标邮箱可以正常收到测试邮件。',
                actualResult: '',
                contact: '',
                route: '/settings',
                pageTitle: '系统设置',
                clientContext: {
                    trigger: 'admin-settings-test',
                    submittedAt: now.toISOString(),
                    mailTo: trimText(config.emailTo, 255),
                    smtpHost: trimText(config.smtpHost, 255),
                    smtpPort: String(config.smtpPort || ''),
                },
                frontendErrors: [],
                systemLogsExcerpt: [],
                runtimeLogsExcerpt: [],
                accountLogsExcerpt: [],
                serverContext: {
                    appVersion: version,
                    serverTime: now.toISOString(),
                    mode: 'smtp-test',
                },
            };

            const subject = buildMailSubject(config, bugPayload);
            const content = renderBugReportEmailText(bugPayload);
            const html = renderBugReportEmailHtml(bugPayload);
            let sendResult;
            try {
                sendResult = await sendPushooMessage({
                    channel: 'email',
                    title: subject,
                    content,
                    html,
                    smtpHost: config.smtpHost,
                    smtpPort: config.smtpPort,
                    smtpSecure: config.smtpSecure,
                    smtpUser: config.smtpUser,
                    smtpPass: config.smtpPass,
                    emailFrom: config.emailFrom,
                    emailTo: config.emailTo,
                });
            } catch (error) {
                sendResult = {
                    ok: false,
                    msg: error && error.message ? error.message : String(error || 'send failed'),
                };
            }

            if (sendResult.ok) {
                logger.info('问题反馈测试邮件发送成功', {
                    username: currentUser.username,
                    emailTo: config.emailTo,
                });
            } else {
                logger.warn('问题反馈测试邮件发送失败', {
                    username: currentUser.username,
                    emailTo: config.emailTo,
                    error: sendResult.msg,
                });
            }

            return {
                mailSent: !!sendResult.ok,
                mailMessage: trimText(sendResult.msg || '', 500),
            };
        },

        async submitBugReport({ currentUser, accountId, payload }) {
            const config = store.getBugReportConfig ? store.getBugReportConfig() : {};
            ensureSubmitAllowed(config, currentUser);

            const recent = await findRecentUserReports(currentUser.username, config.cooldownSeconds);
            if (recent.length > 0) {
                const remaining = computeRemainingCooldownSeconds(recent[0].created_at, config.cooldownSeconds);
                const error = new Error(`提交过于频繁，请在 ${remaining} 秒后重试`);
                error.statusCode = 429;
                throw error;
            }

            const input = normalizeInput(payload);
            const selectedAccount = await resolveSelectedAccount({
                accountId,
                currentUser,
                getAccountsSnapshot,
            });
            const reportNo = createReportNo();

            const [systemLogsExcerpt, runtimeLogsExcerpt, accountLogsExcerpt, serverContext] = await Promise.all([
                config.includeSystemLogs
                    ? collectSystemLogsExcerpt({
                        getPool,
                        currentUser,
                        getAccountsSnapshot,
                        accountId: selectedAccount ? selectedAccount.id : '',
                        limit: config.systemLogLimit,
                    })
                    : Promise.resolve([]),
                config.includeRuntimeLogs
                    ? collectRuntimeLogsExcerpt({
                        getProvider,
                        accountId: selectedAccount ? selectedAccount.id : '',
                        limit: config.runtimeLogLimit,
                    })
                    : Promise.resolve([]),
                config.includeAccountLogs
                    ? collectAccountLogsExcerpt({
                        getProvider,
                        currentUser,
                        getAccountsSnapshot,
                        accountId: selectedAccount ? selectedAccount.id : '',
                        limit: config.accountLogLimit,
                    })
                    : Promise.resolve([]),
                collectServerContext({
                    getProvider,
                    selectedAccount,
                }),
            ]);

            const bugPayload = capPayloadSize({
                reportNo,
                username: currentUser.username,
                accountId: selectedAccount ? String(selectedAccount.id || '').trim() : '',
                accountName: selectedAccount ? trimText(selectedAccount.name || selectedAccount.nick || selectedAccount.id, 120) : '',
                category: input.category,
                severity: input.severity,
                title: input.title,
                description: input.description,
                stepsToReproduce: input.stepsToReproduce,
                expectedResult: input.expectedResult,
                actualResult: input.actualResult,
                contact: input.contact,
                route: trimText(input.clientContext.route, 255),
                pageTitle: trimText(input.clientContext.pageTitle, 255),
                clientContext: input.clientContext,
                frontendErrors: config.includeFrontendErrors ? normalizeFrontendErrors(payload && payload.frontendErrors, config.frontendErrorLimit) : [],
                systemLogsExcerpt,
                runtimeLogsExcerpt,
                accountLogsExcerpt,
                serverContext,
            }, config.maxBodyLength);

            let bugReportId = 0;
            if (config.saveToDatabase !== false) {
                const created = await insertBugReport({
                    ...bugPayload,
                    mailSent: false,
                    mailStatus: 'pending',
                    mailMessage: '',
                });
                bugReportId = created.id;
            }

            const subject = buildMailSubject(config, bugPayload);
            const content = renderBugReportEmailText(bugPayload);
            const html = renderBugReportEmailHtml(bugPayload);
            let sendResult;
            try {
                sendResult = await sendPushooMessage({
                    channel: 'email',
                    title: subject,
                    content,
                    html,
                    smtpHost: config.smtpHost,
                    smtpPort: config.smtpPort,
                    smtpSecure: config.smtpSecure,
                    smtpUser: config.smtpUser,
                    smtpPass: config.smtpPass,
                    emailFrom: config.emailFrom,
                    emailTo: config.emailTo,
                });
            } catch (error) {
                sendResult = {
                    ok: false,
                    msg: error && error.message ? error.message : String(error || 'send failed'),
                };
            }

            const mailStatusPayload = {
                mailSent: !!sendResult.ok,
                mailStatus: sendResult.ok ? 'ok' : 'error',
                mailMessage: trimText(sendResult.msg || '', 500),
                sentAt: sendResult.ok ? new Date() : null,
            };

            if (bugReportId > 0) {
                await updateBugReportMailStatus(bugReportId, mailStatusPayload);
            }

            if (sendResult.ok) {
                logger.info('问题反馈发送成功', {
                    username: currentUser.username,
                    accountId: bugPayload.accountId,
                    reportNo,
                });
            } else {
                logger.warn('问题反馈发送失败', {
                    username: currentUser.username,
                    accountId: bugPayload.accountId,
                    reportNo,
                    error: sendResult.msg,
                });
            }

            return {
                reportId: reportNo,
                mailSent: !!sendResult.ok,
                mailMessage: trimText(sendResult.msg || '', 500),
            };
        },
    };
}

module.exports = {
    CATEGORY_OPTIONS,
    SEVERITY_OPTIONS,
    createBugReportService,
};
