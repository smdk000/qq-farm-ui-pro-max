function registerAccountStateRoutes({
    app,
    accountOwnershipRequired,
    getAccId,
    getAccountSnapshotById,
    getProvider,
    handleApiError,
    getLevelExpProgress,
    loadFriendsCacheApi,
}) {
    async function getAccountCacheOptions(id) {
        if (typeof getAccountSnapshotById !== 'function') {
            return {};
        }
        try {
            const account = await getAccountSnapshotById(id);
            if (!account || typeof account !== 'object') {
                return {};
            }
            return {
                account,
                platform: String(account.platform || '').trim(),
                uin: String(account.uin || '').trim(),
                qq: String(account.qq || '').trim(),
                openId: String(account.openId || account.open_id || '').trim(),
            };
        } catch {
            return {};
        }
    }

    async function getCachedFriendsData(id, cacheOptions = null) {
        const { getCachedFriends } = loadFriendsCacheApi();
        if (!getCachedFriends) return [];
        const options = cacheOptions && typeof cacheOptions === 'object'
            ? cacheOptions
            : await getAccountCacheOptions(id);
        const data = await getCachedFriends(id, options);
        return Array.isArray(data) ? data : [];
    }

    async function getCachedFriendsSnapshot(id, cacheOptions = null) {
        const { getCachedFriendsDetails, getCachedFriends } = loadFriendsCacheApi();
        const options = cacheOptions && typeof cacheOptions === 'object'
            ? cacheOptions
            : await getAccountCacheOptions(id);
        if (typeof getCachedFriendsDetails === 'function') {
            const details = await getCachedFriendsDetails(id, options);
            return {
                data: Array.isArray(details && details.friends) ? details.friends : [],
                meta: normalizeFriendsMeta(details),
            };
        }
        if (typeof getCachedFriends === 'function') {
            const data = await getCachedFriends(id, options);
            return {
                data: Array.isArray(data) ? data : [],
                meta: null,
            };
        }
        return {
            data: [],
            meta: null,
        };
    }

    async function syncFriendsCache(id, data, cacheOptions = null) {
        const { updateFriendsCache, mergeFriendsCache } = loadFriendsCacheApi();
        const syncFn = mergeFriendsCache || updateFriendsCache;
        if (!syncFn || !Array.isArray(data) || data.length === 0) return;
        const options = cacheOptions && typeof cacheOptions === 'object'
            ? cacheOptions
            : await getAccountCacheOptions(id);
        syncFn(id, data, options).catch(() => { });
    }

    function normalizeFriendsMeta(meta) {
        if (!meta || typeof meta !== 'object') {
            return null;
        }
        const source = String(meta.source || '').trim();
        const reason = String(meta.reason || '').trim();
        const platform = String(meta.platform || '').trim();
        const cacheSource = String(meta.cacheSource || '').trim();
        const cacheScope = String(meta.cacheScope || '').trim();
        const identityType = String(meta.identityType || '').trim();
        const updatedAt = Math.max(0, Number(meta.updatedAt || 0));
        const entryCount = Math.max(0, Number(meta.entryCount || 0));
        const seededCount = Math.max(0, Number(meta.seededCount || 0));
        const conservative = typeof meta.conservative === 'boolean' ? meta.conservative : undefined;
        const realtimeAvailable = typeof meta.realtimeAvailable === 'boolean' ? meta.realtimeAvailable : undefined;
        const cooldownUntil = Math.max(0, Number(meta.cooldownUntil || 0));
        const syncAllUnsupportedUntil = Math.max(0, Number(meta.syncAllUnsupportedUntil || 0));
        const hasPayload = source || reason || platform || cacheSource || cacheScope || identityType || conservative !== undefined || realtimeAvailable !== undefined || cooldownUntil > 0 || syncAllUnsupportedUntil > 0 || seededCount > 0 || updatedAt > 0 || entryCount > 0;
        if (!hasPayload) {
            return null;
        }
        const normalized = {};
        if (source) normalized.source = source;
        if (reason) normalized.reason = reason;
        if (platform) normalized.platform = platform;
        if (cacheSource) normalized.cacheSource = cacheSource;
        if (cacheScope) normalized.cacheScope = cacheScope;
        if (identityType) normalized.identityType = identityType;
        if (updatedAt > 0) normalized.updatedAt = updatedAt;
        if (entryCount > 0) normalized.entryCount = entryCount;
        if (seededCount > 0) normalized.seededCount = seededCount;
        if (conservative !== undefined) normalized.conservative = conservative;
        if (realtimeAvailable !== undefined) normalized.realtimeAvailable = realtimeAvailable;
        if (cooldownUntil > 0) normalized.cooldownUntil = cooldownUntil;
        if (syncAllUnsupportedUntil > 0) normalized.syncAllUnsupportedUntil = syncAllUnsupportedUntil;
        return normalized;
    }

    function extractFriendsDataAndMeta(payload) {
        if (Array.isArray(payload)) {
            return {
                data: payload,
                meta: normalizeFriendsMeta(payload._meta),
            };
        }
        if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
            return {
                data: payload.data,
                meta: normalizeFriendsMeta(payload.meta),
            };
        }
        return {
            data: [],
            meta: null,
        };
    }

    function buildFriendsCacheMeta(baseMeta, fallbackReason) {
        const normalized = normalizeFriendsMeta(baseMeta) || {};
        return normalizeFriendsMeta({
            ...normalized,
            source: 'cache',
            reason: normalized.reason || fallbackReason || 'cache_fallback',
        });
    }

    function isTruthyQueryFlag(value) {
        const text = String(value || '').trim().toLowerCase();
        return text === '1' || text === 'true' || text === 'yes' || text === 'on';
    }

    function normalizeImportedSyncAllSource(source) {
        if (!source || typeof source !== 'object') return null;
        const openIds = Array.isArray(source.openIds)
            ? source.openIds.map(item => String(item || '').trim()).filter(Boolean)
            : [];
        const meta = (source.meta && typeof source.meta === 'object') ? source.meta : {};
        const normalized = {
            active: !!source.active,
            sourceHash: String(source.sourceHash || '').trim(),
            openIds,
            openIdCount: Math.max(0, Number(source.openIdCount || openIds.length || 0)),
            importedAt: Math.max(0, Number(source.importedAt || 0)),
            updatedAt: Math.max(0, Number(source.updatedAt || 0)),
            lastUsedAt: Math.max(0, Number(source.lastUsedAt || 0)),
            lastSyncAt: Math.max(0, Number(source.lastSyncAt || 0)),
            lastSyncFriendCount: Math.max(0, Number(source.lastSyncFriendCount || 0)),
            lastSyncSource: String(source.lastSyncSource || '').trim(),
            lastErrorCode: String(source.lastErrorCode || '').trim(),
            meta: {
                serviceName: String(meta.serviceName || '').trim(),
                methodName: String(meta.methodName || '').trim(),
                messageType: Math.max(0, Number(meta.messageType || 0)),
                clientSeq: Math.max(0, Number(meta.clientSeq || 0)),
                serverSeq: Math.max(0, Number(meta.serverSeq || 0)),
                wireBytes: Math.max(0, Number(meta.wireBytes || 0)),
                bodyBytes: Math.max(0, Number(meta.bodyBytes || 0)),
            },
        };
        return normalized;
    }

    function countInteractSeedCandidates(records) {
        return [...new Set(
            (Array.isArray(records) ? records : [])
                .map(record => Number(record && record.visitorGid) || 0)
                .filter(gid => gid > 0)
        )].length;
    }

    async function getAccountPlatform(id) {
        try {
            const status = await getProvider().getStatus(id);
            return String(status && status.status && status.status.platform || '').trim();
        } catch {
            return '';
        }
    }

    async function getFriendsWithFallback(id, options = {}) {
        const cacheOptions = options.cacheOptions && typeof options.cacheOptions === 'object'
            ? options.cacheOptions
            : await getAccountCacheOptions(id);
        try {
            const payload = await getProvider().getFriends(id, options);
            const { data, meta } = extractFriendsDataAndMeta(payload);
            if (Array.isArray(data) && data.length > 0) {
                void syncFriendsCache(id, data, cacheOptions);
                return { data, meta };
            }
            const cachedSnapshot = await getCachedFriendsSnapshot(id, cacheOptions);
            const cached = Array.isArray(cachedSnapshot.data) ? cachedSnapshot.data : [];
            if (cached.length > 0) {
                return {
                    data: cached,
                    meta: buildFriendsCacheMeta({
                        ...(cachedSnapshot.meta || {}),
                        ...(meta || {}),
                    }, 'cache_fallback'),
                };
            }
            return {
                data: Array.isArray(data) ? data : [],
                meta,
            };
        } catch (err) {
            const cachedSnapshot = await getCachedFriendsSnapshot(id, cacheOptions);
            const cached = Array.isArray(cachedSnapshot.data) ? cachedSnapshot.data : [];
            if (cached.length > 0) {
                return {
                    data: cached,
                    meta: buildFriendsCacheMeta({
                        ...(cachedSnapshot.meta || {}),
                        source: 'cache',
                        reason: 'worker_error',
                    }, 'worker_error'),
                };
            }
            throw err;
        }
    }

    app.get('/api/status', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.json({ ok: false, error: '缺少账号标识 (x-account-id)' });

        try {
            const data = await getProvider().getStatus(id);
            if (data && data.status) {
                const { level, exp } = data.status;
                data.levelProgress = getLevelExpProgress(level, exp);
            }
            res.json({ ok: true, data });
        } catch (e) {
            res.json({ ok: false, error: e.message });
        }
    });

    app.get('/api/lands', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await getProvider().getLands(id);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.get('/api/friends', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const result = await getFriendsWithFallback(id, {
                manualRefresh: isTruthyQueryFlag(req.query && req.query.refresh),
            });
            res.json({
                ok: true,
                data: Array.isArray(result.data) ? [...result.data] : [],
                ...(result.meta ? { meta: result.meta } : {}),
            });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.get('/api/friends/cache', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const cacheOptions = await getAccountCacheOptions(id);
            let cachedSnapshot = await getCachedFriendsSnapshot(id, cacheOptions);
            let data = Array.isArray(cachedSnapshot.data) ? cachedSnapshot.data : [];
            if (data.length === 0) {
                const result = await getFriendsWithFallback(id, { cacheOptions });
                data = Array.isArray(result && result.data) ? result.data : [];
                cachedSnapshot = {
                    data,
                    meta: normalizeFriendsMeta(result && result.meta),
                };
            }
            res.json({
                ok: true,
                data,
                ...(cachedSnapshot.meta ? { meta: cachedSnapshot.meta } : {}),
            });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.post('/api/friends/cache/clear', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        try {
            const { clearFriendsCache } = loadFriendsCacheApi();
            if (typeof clearFriendsCache !== 'function') {
                return res.status(501).json({ ok: false, error: '当前运行环境不支持清理好友缓存' });
            }

            const cacheOptions = await getAccountCacheOptions(id);
            const cleared = await clearFriendsCache(id, cacheOptions);
            if (!cleared || cleared.ok !== true) {
                return res.status(503).json({
                    ok: false,
                    error: String((cleared && (cleared.error || cleared.reason)) || '清理好友缓存失败'),
                    cleared: cleared || null,
                });
            }
            const refreshRequested = isTruthyQueryFlag(
                (req.body && req.body.refresh) !== undefined
                    ? req.body.refresh
                    : (req.query && req.query.refresh)
            );

            let refreshed = null;
            if (refreshRequested) {
                const result = await getFriendsWithFallback(id, {
                    manualRefresh: true,
                    cacheOptions,
                    disableVisitorSeed: true,
                });
                refreshed = {
                    data: Array.isArray(result && result.data) ? [...result.data] : [],
                    count: Array.isArray(result && result.data) ? result.data.length : 0,
                    meta: result && result.meta ? result.meta : null,
                };
            }

            res.json({
                ok: true,
                cleared,
                ...(refreshed ? { refreshed } : {}),
            });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.post('/api/friends/seed-cache', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });

        const limit = Math.max(1, Math.min(200, Number(req.body && req.body.limit || 100) || 100));
        const platform = await getAccountPlatform(id);
        let records = [];
        let interactError = null;
        let interactErrorCode = '';

        try {
            records = await getProvider().getInteractRecords(id, limit);
        } catch (e) {
            interactError = e;
            interactErrorCode = String((e && e.code) || '').trim();
        }

        const cacheOptions = await getAccountCacheOptions(id);
        const cached = await getCachedFriendsData(id, cacheOptions);
        const seededCount = countInteractSeedCandidates(records);
        const baseMeta = normalizeFriendsMeta({
            source: cached.length > 0 ? 'cache' : 'empty',
            reason: cached.length > 0
                ? (seededCount > 0 ? 'interact_seeded' : 'cache_fallback')
                : (interactError ? 'interact_seed_error' : 'interact_seed_empty'),
            platform,
            conservative: true,
            realtimeAvailable: false,
            cacheSource: 'interact_records',
            seededCount,
        });

        if (cached.length > 0) {
            return res.json({
                ok: true,
                data: cached,
                meta: baseMeta,
                seededCount,
                interactCount: Array.isArray(records) ? records.length : 0,
            });
        }

        if (interactError && interactErrorCode.startsWith('INTERACT_')) {
            return res.json({
                ok: false,
                error: String(interactError.message || '访客记录接口失败'),
                errorCode: interactErrorCode,
                data: [],
                meta: baseMeta,
                seededCount,
                interactCount: Array.isArray(records) ? records.length : 0,
            });
        }

        if (interactError) {
            return handleApiError(res, interactError);
        }

        return res.json({
            ok: true,
            data: [],
            meta: baseMeta,
            seededCount,
            interactCount: Array.isArray(records) ? records.length : 0,
        });
    });

    app.get('/api/friend/:gid/lands', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false });
        try {
            const data = await getProvider().getFriendLands(id, req.params.gid);
            res.json({ ok: true, data });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.post('/api/friends/import-hex', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        try {
            const hex = String((req.body && req.body.hex) || '').trim();
            if (!hex) {
                return res.status(400).json({ ok: false, error: '请输入 Hex 内容' });
            }
            const result = await getProvider().importFriendsByHex(id, hex);
            const refreshed = await getFriendsWithFallback(id, {
                cacheOptions: await getAccountCacheOptions(id),
            });
            res.json({
                ...result,
                refreshed: {
                    data: Array.isArray(refreshed.data) ? refreshed.data : [],
                    meta: refreshed.meta || null,
                },
            });
        } catch (e) {
            const errorCode = String((e && e.code) || '').trim();
            if (errorCode.startsWith('FRIEND_SYNC_IMPORT_')) {
                return res.status(400).json({
                    ok: false,
                    error: String(e.message || '导入好友同步 Hex 失败'),
                    errorCode,
                });
            }
            handleApiError(res, e);
        }
    });

    app.get('/api/friends/imported-syncall', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        try {
            const source = await getProvider().getImportedSyncAllSource(id);
            res.json({ ok: true, data: normalizeImportedSyncAllSource(source) });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.delete('/api/friends/imported-syncall', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        try {
            const source = await getProvider().clearImportedSyncAllSource(id);
            res.json({ ok: true, data: normalizeImportedSyncAllSource(source) });
        } catch (e) {
            handleApiError(res, e);
        }
    });

    app.get('/api/interact-records', accountOwnershipRequired, async (req, res) => {
        const id = await getAccId(req);
        if (!id) return res.status(400).json({ ok: false, error: '缺少账号标识 (x-account-id)' });
        try {
            const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50) || 50));
            const data = await getProvider().getInteractRecords(id, limit);
            res.json({ ok: true, data });
        } catch (e) {
            const errorCode = String((e && e.code) || '').trim();
            if (errorCode.startsWith('INTERACT_')) {
                return res.json({ ok: false, error: String(e.message || '访客记录接口失败'), errorCode });
            }
            handleApiError(res, e);
        }
    });
}

module.exports = {
    registerAccountStateRoutes,
};
