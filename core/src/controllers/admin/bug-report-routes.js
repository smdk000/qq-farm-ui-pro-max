const { validateBugReportConfig } = require('../../services/config-validator');
const { createBugReportService } = require('../../services/bug-report-service');

function registerBugReportRoutes({
    app,
    authRequired,
    store,
    getPool,
    getProvider,
    getAccountsSnapshot,
    getAccId,
    adminLogger,
}) {
    const service = createBugReportService({
        store,
        getPool,
        getProvider,
        getAccountsSnapshot,
        logger: adminLogger,
    });

    app.get('/api/bug-report/config', authRequired, async (req, res) => {
        try {
            return res.json({
                ok: true,
                data: service.getPublicConfig(req.currentUser),
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/bug-report/submit', authRequired, async (req, res) => {
        try {
            const accountId = typeof getAccId === 'function' ? await getAccId(req) : '';
            const data = await service.submitBugReport({
                currentUser: req.currentUser,
                accountId,
                payload: req.body || {},
            });
            return res.json({ ok: true, data });
        } catch (e) {
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/settings/bug-report', authRequired, async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可查看问题反馈设置' });
            }
            return res.json({
                ok: true,
                data: service.getFullConfig(),
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/settings/bug-report', authRequired, async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可修改问题反馈设置' });
            }
            const validation = validateBugReportConfig(req.body || {});
            if (!validation.valid) {
                return res.status(400).json({
                    ok: false,
                    error: '问题反馈配置校验失败',
                    errors: validation.errors,
                });
            }
            const data = service.saveConfig(validation.coerced || {});
            if (typeof store.flushGlobalConfigSave === 'function') {
                await store.flushGlobalConfigSave();
            }
            return res.json({ ok: true, data });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/settings/bug-report/test', authRequired, async (req, res) => {
        try {
            if (req.currentUser?.role !== 'admin') {
                return res.status(403).json({ ok: false, error: '仅管理员可发送测试反馈邮件' });
            }
            const data = await service.sendTestEmail({
                currentUser: req.currentUser,
            });
            return res.json({ ok: true, data });
        } catch (e) {
            return res.status(e.statusCode || 500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = {
    registerBugReportRoutes,
};
