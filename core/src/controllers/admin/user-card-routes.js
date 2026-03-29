const { createModuleLogger } = require('../../services/logger');

const userCardRoutesLogger = createModuleLogger('user-card-routes');

function logUserCardRoutesError(message, error, meta = {}) {
    userCardRoutesLogger.error(message, {
        ...meta,
        error: error && error.message ? error.message : String(error || ''),
    });
}

function rejectUnlessAdmin(req, res) {
    if (req.currentUser.role !== 'admin') {
        res.status(403).json({ ok: false, error: 'Forbidden' });
        return true;
    }
    return false;
}

function getCardFeatureConfigSafe(store) {
    if (!store || typeof store.getCardFeatureConfig !== 'function') {
        return {
            enabled: true,
            registerEnabled: true,
            renewEnabled: true,
            trialEnabled: true,
            adminIssueEnabled: true,
        };
    }
    return store.getCardFeatureConfig();
}

function rejectWhenCardFeatureDisabled(res, store, featureKey, error) {
    const config = getCardFeatureConfigSafe(store);
    if (config.enabled === false || config[featureKey] === false) {
        res.status(400).json({ ok: false, error });
        return true;
    }
    return false;
}

function registerUserCardRoutes({
    app,
    authRequired,
    userRequired,
    userStore,
    usersController,
    cardsController,
    validateUsername,
    validatePassword,
    validateCardCode,
    jwtService,
    store,
}) {
    app.post('/api/auth/register', async (req, res) => {
        try {
            const { username, password, cardCode } = req.body || {};
            const config = getCardFeatureConfigSafe(store);
            const cardRegistrationEnabled = config.enabled !== false && config.registerEnabled !== false;

            if (!username || !password || (cardRegistrationEnabled && !cardCode)) {
                return res.status(400).json({
                    ok: false,
                    error: '缺少必要参数',
                    details: {
                        username: username ? '已提供' : '必填',
                        password: password ? '已提供' : '必填',
                        cardCode: cardRegistrationEnabled
                            ? (cardCode ? '已提供' : '必填')
                            : (cardCode ? '已提供' : '当前模式非必填'),
                    },
                });
            }

            const usernameValidation = validateUsername(username);
            if (!usernameValidation.valid) {
                return res.status(400).json({ ok: false, error: usernameValidation.error });
            }

            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ ok: false, error: passwordValidation.error });
            }

            if (cardRegistrationEnabled || String(cardCode || '').trim()) {
                const cardCodeValidation = validateCardCode(cardCode);
                if (!cardCodeValidation.valid) {
                    return res.status(400).json({ ok: false, error: cardCodeValidation.error });
                }
            }

            const result = await userStore.registerUser(username, password, cardCode);
            if (!result.ok) {
                return res.status(400).json(result);
            }

            const accessToken = jwtService.signAccessToken(result.user);
            const refreshToken = jwtService.generateRefreshToken();
            await jwtService.storeRefreshToken(result.user.username, refreshToken, result.user.role, req);
            jwtService.setTokenCookies(req, res, accessToken, refreshToken, result.user.role);

            res.json({ ok: true, data: { user: result.user } });
        } catch (error) {
            logUserCardRoutesError('用户注册失败', error, { username: req.body?.username || '' });
            res.status(500).json({ ok: false, error: '注册失败，请稍后重试' });
        }
    });

    app.post('/api/auth/renew', authRequired, async (req, res) => {
        try {
            if (rejectWhenCardFeatureDisabled(res, store, 'renewEnabled', '当前系统已暂停卡密续费')) {
                return;
            }
            const { cardCode } = req.body || {};
            if (!cardCode) {
                return res.status(400).json({ ok: false, error: '缺少卡密' });
            }

            const cardCodeValidation = validateCardCode(cardCode);
            if (!cardCodeValidation.valid) {
                return res.status(400).json({ ok: false, error: cardCodeValidation.error });
            }

            const result = await userStore.renewUser(req.currentUser.username, cardCode);
            if (!result.ok) {
                return res.status(400).json(result);
            }

            req.currentUser.card = result.card;
            res.json({ ok: true, data: { card: result.card } });
        } catch (error) {
            logUserCardRoutesError('用户续费失败', error, { username: req.currentUser?.username || '' });
            res.status(500).json({ ok: false, error: '续费失败，请稍后重试' });
        }
    });

    app.get('/api/users', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        usersController.getAllUsers(req, res);
    });

    app.post('/api/users', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        usersController.createUser(req, res);
    });

    app.put('/api/users/:username', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        usersController.updateUser(req, res);
    });

    app.post('/api/users/:username/renew', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        if (rejectWhenCardFeatureDisabled(res, store, 'renewEnabled', '当前系统已暂停卡密续费')) {
            return;
        }
        usersController.renewUserCard(req, res);
    });

    app.delete('/api/users/:username', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        usersController.deleteUser(req, res);
    });

    app.post('/api/auth/change-password', authRequired, async (req, res) => {
        usersController.changePassword(req, res);
    });

    app.get('/api/cards', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        cardsController.getAllCards(req, res);
    });

    app.get('/api/cards/:code', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        cardsController.getCardDetail(req, res);
    });

    app.post('/api/cards', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        if (rejectWhenCardFeatureDisabled(res, store, 'adminIssueEnabled', '当前系统已关闭卡密发码功能')) {
            return;
        }
        cardsController.createCard(req, res);
    });

    app.put('/api/cards/:code', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        cardsController.updateCard(req, res);
    });

    app.delete('/api/cards/:code', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        cardsController.deleteCard(req, res);
    });

    app.post('/api/cards/batch-delete', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        cardsController.batchDeleteCards(req, res);
    });

    app.post('/api/cards/batch-update', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        cardsController.batchUpdateCards(req, res);
    });
}

function registerTrialCardRoutes({
    app,
    authRequired,
    userRequired,
    trialRateLimiter,
    getClientIP,
    userStore,
    store,
}) {
    app.post('/api/trial-card', trialRateLimiter, async (req, res) => {
        try {
            if (rejectWhenCardFeatureDisabled(res, store, 'trialEnabled', '当前系统已暂停体验卡发放')) {
                return;
            }
            const clientIP = getClientIP(req);
            const result = await userStore.createTrialCard(clientIP);
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({ ok: true, data: { code: result.code, days: result.days } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/trial-card-config', authRequired, async (req, res) => {
        try {
            const config = store.getTrialCardConfig();
            if (req.currentUser && req.currentUser.role === 'admin') {
                return res.json({ ok: true, data: config });
            }
            res.json({ ok: true, data: { userRenewEnabled: config.userRenewEnabled, days: config.days } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/public-card-feature-config', async (_req, res) => {
        try {
            const config = getCardFeatureConfigSafe(store);
            res.set('Cache-Control', 'no-store');
            res.json({
                ok: true,
                data: {
                    enabled: config.enabled,
                    registerEnabled: config.registerEnabled,
                    trialEnabled: config.trialEnabled,
                },
            });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/trial-card-config', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = store.setTrialCardConfig(body);
            if (typeof store.flushGlobalConfigSave === 'function') {
                await store.flushGlobalConfigSave();
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/card-feature-config', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        try {
            res.json({ ok: true, data: getCardFeatureConfigSafe(store) });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/card-feature-config', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        try {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const data = typeof store.setCardFeatureConfig === 'function'
                ? store.setCardFeatureConfig(body, { updatedBy: req.currentUser?.username || 'admin' })
                : { ...body };
            if (typeof store.flushGlobalConfigSave === 'function') {
                await store.flushGlobalConfigSave();
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/users/:username/trial-renew', authRequired, userRequired, async (req, res) => {
        if (rejectUnlessAdmin(req, res)) {
            return;
        }
        try {
            const result = await userStore.renewTrialUser(req.params.username, 'admin');
            if (!result.ok) {
                return res.status(400).json(result);
            }
            res.json({ ok: true, data: { card: result.card } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/auth/trial-renew', authRequired, async (req, res) => {
        try {
            const result = await userStore.renewTrialUser(req.currentUser.username, 'user');
            if (!result.ok) {
                return res.status(400).json(result);
            }
            req.currentUser.card = result.card;
            res.json({ ok: true, data: { card: result.card } });
        } catch (e) {
            res.status(500).json({ ok: false, error: e.message });
        }
    });
}

module.exports = {
    registerUserCardRoutes,
    registerTrialCardRoutes,
};
