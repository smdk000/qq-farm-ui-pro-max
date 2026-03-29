const PUBLIC_API_PATHS = Object.freeze([
    '/login',
    '/auth/register',
    '/auth/bootstrap-status',
    '/auth/init-password',
    '/auth/refresh',
    '/auth/logout',
    '/qr/create',
    '/qr/check',
    '/notifications',
    '/announcement',
    '/trial-card',
    '/public-card-feature-config',
    '/ui-config',
    '/ping',
    '/health/basic',
    '/system/service-profile',
]);

const EXPIRED_WHITELIST = new Set([
    '/auth/renew',
    '/auth/trial-renew',
    '/trial-card-config',
    '/auth/validate',
    '/auth/change-password',
    '/ping',
    '/announcement',
]);

const BANNED_WHITELIST = new Set([
    '/auth/validate',
    '/ping',
]);

function createAdminAuthMiddlewares({
    jwtService,
    userStore,
    getAccountsSnapshot,
}) {
    const resolveRequestUser = async (req) => {
        const accessToken = req.cookies?.access_token || req.headers?.['x-admin-token'] || '';
        if (!accessToken) {
            return null;
        }

        const decoded = jwtService.verifyAccessToken(accessToken);
        if (!decoded) {
            return null;
        }

        const userInfo = await userStore.getUserInfo(decoded.username);
        if (!userInfo) {
            return null;
        }

        req.currentUser = userInfo;
        return userInfo;
    };

    const authRequired = async (req, res, next) => {
        try {
            const userInfo = await resolveRequestUser(req);
            if (!userInfo) {
                return res.status(401).json({ ok: false, error: 'Unauthorized' });
            }
            next();
        } catch {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
    };

    const userRequired = (req, res, next) => {
        if (!req.currentUser) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }

        if (req.currentUser.role === 'admin') {
            return next();
        }

        const currentPath = String(req.path || '').replace(/^\/api/, '');
        if (req.currentUser.status === 'banned') {
            if (BANNED_WHITELIST.has(currentPath)) {
                return next();
            }
            return res.status(403).json({ ok: false, error: '账号已被封禁' });
        }

        if (req.currentUser.isExpired) {
            if (EXPIRED_WHITELIST.has(currentPath)) {
                return next();
            }
            return res.status(403).json({ ok: false, error: '账号已过期，请续费后操作' });
        }

        next();
    };

    const accountOwnershipRequired = async (req, res, next) => {
        const routeAccountId = String(req.params?.id || '').trim();
        const headerAccountId = String(req.headers?.['x-account-id'] || '').trim();
        const accountId = routeAccountId || headerAccountId;
        if (!accountId) {
            return res.status(400).json({ ok: false, error: 'Missing account ID' });
        }

        if (req.currentUser?.role === 'admin') {
            return next();
        }

        const allAccounts = await getAccountsSnapshot();
        const account = (allAccounts.accounts || []).find(a => String(a.id) === String(accountId));
        if (!account) {
            return res.status(404).json({ ok: false, error: '账号不存在' });
        }

        if (!account.username || account.username !== req.currentUser.username) {
            return res.status(403).json({ ok: false, error: '无权操作此账号' });
        }

        next();
    };

    return {
        resolveRequestUser,
        authRequired,
        userRequired,
        accountOwnershipRequired,
        publicPaths: new Set(PUBLIC_API_PATHS),
    };
}

module.exports = {
    PUBLIC_API_PATHS,
    createAdminAuthMiddlewares,
};
