const { readLatestQqFriendDiagnostics: readLatestQqFriendDiagnosticsDefault } = require('../../services/qq-friend-diagnostics');
const { querySystemLogsForUser } = require('../../services/system-log-query');

function registerSystemPublicRoutes({
    app,
    getPool,
    getAccountsSnapshot,
    inspectSystemSettingsHealth,
    inspectWebDistState,
    version,
    processRef,
    store,
    resolveRequestUser,
    getUserUiConfig,
    mergeUiConfig,
    getUserPreferences,
    getAccId,
    getProvider,
    getSchedulerRegistrySnapshot,
    adminOperationLogService,
    handleApiError,
    readLatestQqFriendDiagnostics,
}) {
    const diagnosticsReader = typeof readLatestQqFriendDiagnostics === 'function'
        ? readLatestQqFriendDiagnostics
        : readLatestQqFriendDiagnosticsDefault;
    const RUNTIME_RELOAD_TARGET_LABELS = Object.freeze({
        farm: '农场模块',
        friend: '好友模块',
        task: '任务模块',
        warehouse: '仓库模块',
        business: '全部业务模块',
    });

    function getRuntimeReloadTargetLabel(target) {
        const normalized = String(target || '').trim();
        return RUNTIME_RELOAD_TARGET_LABELS[normalized] || normalized || '未知模块';
    }

    async function resolveRuntimeReloadAccountLabel(accountId) {
        const normalizedAccountId = String(accountId || '').trim();
        if (!normalizedAccountId) {
            return '';
        }

        try {
            const snapshot = await getAccountsSnapshot();
            const accounts = Array.isArray(snapshot && snapshot.accounts) ? snapshot.accounts : [];
            const matched = accounts.find(item => String(item && item.id || '') === normalizedAccountId);
            return String(
                (matched && (matched.name || matched.nick || matched.username || matched.id))
                || normalizedAccountId
            ).trim() || normalizedAccountId;
        } catch {
            return normalizedAccountId;
        }
    }

    async function recordRuntimeReloadAudit({
        req,
        provider,
        accountId,
        accountLabel,
        target,
        modules,
        source,
        error,
    }) {
        const actorUsername = String(req.currentUser?.username || '').trim();
        const actorRole = String(req.currentUser?.role || '').trim();
        const targetLabel = getRuntimeReloadTargetLabel(target);
        const moduleNames = Array.isArray(modules) ? modules.map(item => String(item || '').trim()).filter(Boolean) : [];
        const reason = String(error || '').trim();
        const actorLabel = actorUsername
            ? `${actorRole === 'admin' ? '管理员' : '用户'} ${actorUsername}`
            : '当前用户';
        const resolvedAccountLabel = String(accountLabel || accountId || '').trim();

        if (provider && typeof provider.addAccountLog === 'function' && accountId) {
            const action = reason ? 'runtime_reload_failed' : 'runtime_reload';
            const message = reason
                ? `${actorLabel} 热重载 ${resolvedAccountLabel} 的${targetLabel}失败: ${reason}`
                : `${actorLabel} 热重载 ${resolvedAccountLabel} 的${targetLabel}${moduleNames.length ? `，重建 ${moduleNames.join(' / ')}` : ''}`;
            provider.addAccountLog(action, message, accountId, resolvedAccountLabel, {
                actorUsername,
                actorRole,
                target,
                targetLabel,
                modules: moduleNames,
                source: String(source || 'admin_api').trim() || 'admin_api',
                result: reason ? 'error' : 'ok',
                reason,
            });
        }

        if (
            req.currentUser?.role === 'admin'
            && adminOperationLogService
            && typeof adminOperationLogService.createAdminOperationLog === 'function'
            && actorUsername
        ) {
            try {
                await adminOperationLogService.createAdminOperationLog({
                    actorUsername,
                    scope: 'runtime',
                    actionLabel: `热重载 ${targetLabel}`,
                    status: reason ? 'error' : 'success',
                    totalCount: 1,
                    successCount: reason ? 0 : 1,
                    failedCount: reason ? 1 : 0,
                    affectedNames: resolvedAccountLabel ? [resolvedAccountLabel] : [],
                    failedNames: reason && resolvedAccountLabel ? [resolvedAccountLabel] : [],
                    detailLines: [
                        resolvedAccountLabel ? `账号：${resolvedAccountLabel}` : '',
                        `目标模块族：${targetLabel} (${String(target || '').trim() || '-'})`,
                        moduleNames.length ? `重建模块：${moduleNames.join('、')}` : '',
                        `来源：${String(source || 'admin_api').trim() || 'admin_api'}`,
                        reason ? `失败原因：${reason}` : '',
                    ].filter(Boolean),
                });
            } catch {
                // 审计日志不能影响主流程
            }
        }
    }

    function buildPublicWebAssetsSnapshot() {
        if (typeof inspectWebDistState !== 'function') {
            return null;
        }
        const state = inspectWebDistState();
        return {
            activeDir: state.activeDirRelative,
            activeSource: state.activeSource,
            selectionReason: state.selectionReason,
            selectionReasonLabel: state.selectionReasonLabel,
            buildTargetDir: state.buildTargetDirRelative,
            buildTargetSource: state.buildTargetSource,
            defaultDir: state.defaultDirRelative,
            defaultHasAssets: state.defaultHasAssets,
            defaultWritable: state.defaultWritable,
            fallbackDir: state.fallbackDirRelative,
            fallbackHasAssets: state.fallbackHasAssets,
            fallbackWritable: state.fallbackWritable,
        };
    }

    app.get('/api/system-logs', async (req, res) => {
        try {
            const result = await querySystemLogsForUser({
                getPool,
                currentUser: req.currentUser,
                getAccountsSnapshot,
                page: req.query.page,
                limit: req.query.limit,
                level: req.query.level,
                accountId: req.query.accountId,
                keyword: req.query.keyword,
            });

            res.json({
                ok: true,
                data: {
                    total: result.total,
                    page: result.page,
                    limit: result.limit,
                    items: result.items,
                }
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    app.get('/api/system-settings/health', async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可查看 system_settings 自检结果' });
            }
            const data = await inspectSystemSettingsHealth();
            res.json({
                ok: true,
                data: {
                    ...data,
                    webAssets: buildPublicWebAssetsSnapshot(),
                },
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    app.get('/api/stats/trend', async (req, res) => {
        try {
            if (req.currentUser && req.currentUser.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '全局统计趋势仅限管理员查看' });
            }
            const pool = getPool();
            const [rows] = await pool.query(
                `SELECT DATE_FORMAT(record_date, '%m-%d') as short_date, total_exp, total_gold, total_steal
                 FROM stats_daily
                 ORDER BY record_date DESC LIMIT 7`
            );

            rows.reverse();

            const dates = [];
            const exp = [];
            const gold = [];
            const steal = [];

            if (rows.length === 0) {
                const d = new Date();
                dates.push(`${d.getMonth() + 1}-${d.getDate()}`);
                exp.push(0);
                gold.push(0);
                steal.push(0);
            } else {
                for (const row of rows) {
                    dates.push(row.short_date);
                    exp.push(row.total_exp || 0);
                    gold.push(row.total_gold || 0);
                    steal.push(row.total_steal || 0);
                }
            }

            res.json({
                ok: true,
                data: { dates, series: { exp, gold, steal } }
            });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    app.get('/api/ping', async (req, res) => {
        res.json({
            ok: true,
            data: {
                ok: true,
                uptime: processRef.uptime(),
                version,
                webAssets: buildPublicWebAssetsSnapshot(),
            },
        });
    });

    app.get('/api/auth/validate', async (req, res) => {
        res.json({
            ok: true,
            data: {
                valid: true,
                user: {
                    username: req.currentUser?.username,
                    role: req.currentUser?.role,
                    card: req.currentUser?.card,
                },
            },
        });
    });

    app.get('/api/ui-config', async (req, res) => {
        const globalUi = store.getUI();
        const currentUser = await resolveRequestUser(req).catch(() => null);
        const userPreferences = currentUser
            ? await getUserPreferences(currentUser.username).catch(() => null)
            : null;
        if (currentUser && currentUser.role !== 'admin') {
            const userUi = await getUserUiConfig(currentUser.username, globalUi);
            return res.json({
                ok: true,
                data: {
                    ...mergeUiConfig(globalUi, userUi),
                    currentAccountId: userPreferences?.currentAccountId || '',
                },
            });
        }
        if (currentUser) {
            return res.json({
                ok: true,
                data: {
                    ...globalUi,
                    currentAccountId: userPreferences?.currentAccountId || '',
                },
            });
        }
        res.json({ ok: true, data: globalUi });
    });

    app.get('/api/scheduler', async (req, res) => {
        try {
            const id = await getAccId(req);
            const provider = getProvider();
            if (provider && typeof provider.getSchedulerStatus === 'function') {
                const data = await provider.getSchedulerStatus(id);
                return res.json({ ok: true, data });
            }
            return res.json({
                ok: true,
                data: {
                    runtime: getSchedulerRegistrySnapshot(),
                    worker: null,
                    workerError: '当前运行环境不支持调度器状态查询',
                    reloadTargets: [],
                    reloadHistory: [],
                    reloadError: '当前运行环境不支持热重载查询',
                },
            });
        } catch (e) {
            return handleApiError(res, e);
        }
    });

    app.post('/api/scheduler/reload', async (req, res) => {
        try {
            const id = await getAccId(req);
            const provider = getProvider();
            const target = String(req.body && req.body.target || '').trim();
            if (!target) {
                return res.status(400).json({ ok: false, error: '缺少热重载目标' });
            }
            if (!provider || typeof provider.reloadRuntimeModule !== 'function') {
                return res.status(400).json({ ok: false, error: '当前运行环境不支持热重载' });
            }
            const options = (req.body && typeof req.body.options === 'object') ? req.body.options : {};
            const source = String(options.source || 'admin_api').trim() || 'admin_api';
            const accountLabel = await resolveRuntimeReloadAccountLabel(id);
            const data = await provider.reloadRuntimeModule(id, target, {
                ...options,
                source,
            });
            await recordRuntimeReloadAudit({
                req,
                provider,
                accountId: id,
                accountLabel,
                target,
                modules: Array.isArray(data && data.modules) ? data.modules : [],
                source,
                error: '',
            });
            return res.json({ ok: true, data });
        } catch (e) {
            try {
                const id = await getAccId(req);
                const provider = getProvider();
                const target = String(req.body && req.body.target || '').trim();
                const options = (req.body && typeof req.body.options === 'object') ? req.body.options : {};
                await recordRuntimeReloadAudit({
                    req,
                    provider,
                    accountId: id,
                    accountLabel: await resolveRuntimeReloadAccountLabel(id),
                    target,
                    modules: [],
                    source: String(options.source || 'admin_api').trim() || 'admin_api',
                    error: e && e.message ? e.message : String(e || 'unknown'),
                });
            } catch {
                // ignore audit failures here
            }
            return handleApiError(res, e);
        }
    });

    app.get('/api/qq-friend-diagnostics', async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可查看 QQ 好友诊断结果' });
            }
            const data = diagnosticsReader(String(req.query.appid || '').trim());
            return res.json({ ok: true, data: data || null });
        } catch (err) {
            return res.status(500).json({ ok: false, error: err.message });
        }
    });
}

function registerNotificationsRoute({
    app,
    parseUpdateLog,
}) {
    app.get('/api/notifications', async (req, res) => {
        try {
            const limit = Number.parseInt(req.query.limit) || 10;
            const entries = parseUpdateLog();
            res.json({ ok: true, data: entries.slice(0, limit) });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = {
    registerSystemPublicRoutes,
    registerNotificationsRoute,
};
