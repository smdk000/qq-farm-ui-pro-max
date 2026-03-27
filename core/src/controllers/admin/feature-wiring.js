const { createAnnouncementRuntime } = require('../../services/announcement-materializer');
const { createSystemUpdateSmokeSummaryService } = require('../../services/system-update-smoke-report');

function registerAdminFeatureRoutes({
    app,
    webDist,
    fsRef,
    pathRef,
    baseDir,
    createAdminApiGuard,
    createAccountRuntimeHelpers,
    createTrialRateLimiter,
    createUpdateLogParser,
    farmToolsRouter,
    publicPaths,
    authRequired,
    userRequired,
    accountOwnershipRequired,
    resolveRequestUser,
    getProvider,
    getPool,
    getAccountsSnapshot,
    inspectSystemSettingsHealth,
    inspectWebDistState,
    version,
    processRef,
    store,
    getUserUiConfig,
    mergeUiConfig,
    getUserPreferences,
    getSchedulerRegistrySnapshot,
    getClientIP,
    security,
    userStore,
    jwtService,
    adminLogger,
    configRef,
    normalizeAccountRef,
    resolveAccountId,
    getLevelExpProgress,
    buildOfflineSeeds,
    buildOfflineShopCatalog,
    findShopGoodsById,
    buildOfflineMallCatalog,
    buildOfflineMallGoods,
    getAccountBagPreferences,
    saveAccountBagPreferences,
    accountRepository,
    validateSettings,
    buildUserUiBody,
    saveUserUiConfig,
    saveUserPreferences,
    runUiBackgroundCleanup,
    ensureUiBackgroundDir,
    buildReportHistoryCsv,
    getReportLogs,
    getReportLogStats,
    exportReportLogs,
    deleteReportLogsByIds,
    clearReportLogs,
    getAnnouncements,
    saveAnnouncement,
    deleteAnnouncement,
    adminOperationLogService,
    cryptoRef,
    findAccountByRef,
    addOrUpdateAccount,
    deleteAccount,
    compareLeaderboardAccounts,
    toLeaderboardMetricNumber,
    usersController,
    cardsController,
    validateUsername,
    validatePassword,
    validateCardCode,
    miniProgramLoginSession,
    fetchRef,
    AbortControllerRef,
    setTimeoutRef,
    clearTimeoutRef,
    consoleRef,
    getIo,
    getDispatcher,
    healthProbeService,
    statsSummaryService,
    proxyPoolService,
    resolveServiceProfile,
    registerAuthRoutes,
    registerOpenApiRoutes,
    registerLegacyLogoutRoute,
    registerSystemPublicRoutes,
    registerExternalApiRoutes,
    registerPlatformCapabilitiesRoutes,
    registerProxyAdminRoutes,
    registerStatsSummaryRoutes,
    registerAccountStateRoutes,
    registerAutomationRoutes,
    registerFriendOperationRoutes,
    registerFriendBlacklistRoutes,
    registerCommerceRoutes,
    registerAccountControlRoutes,
    registerAccountSettingsRoutes,
    registerSettingsReportRoutes,
    registerBugReportRoutes,
    registerHelpCenterObservabilityRoutes,
    registerHelpCenterAnalyticsRoutes,
    registerHelpCenterFeedbackRoutes,
    registerAccountReadRoutes,
    registerAccountManagementRoutes,
    registerUserCardRoutes,
    registerAdminOperationLogRoutes,
    registerTrialCardRoutes,
    registerAnnouncementAdminRoutes,
    registerSystemUpdateAdminRoutes,
    registerLogReadRoutes,
    registerNotificationsRoute,
    registerQrRoutes,
}) {
    const routeRuntime = createAccountRuntimeHelpers({
        getProvider,
        getAccountsSnapshot,
        normalizeAccountRef,
        resolveAccountId,
    });
    const parseUpdateLog = createUpdateLogParser({
        fsRef,
        pathRef,
        baseDir,
    });
    const announcementRuntime = createAnnouncementRuntime({
        fsRef,
        pathRef,
        projectRoot: pathRef.join(baseDir, '../../../'),
        getAnnouncementsRef: getAnnouncements,
        saveAnnouncementRef: saveAnnouncement,
    });
    const smokeSummaryService = createSystemUpdateSmokeSummaryService({
        fsRef,
        pathRef,
        projectRoot: pathRef.join(baseDir, '../../../'),
    });

    registerAuthRoutes({
        app,
        getClientIP,
        security,
        userStore,
        jwtService,
        adminLogger,
        configRef,
    });

    registerOpenApiRoutes({
        app,
        version,
    });

    registerExternalApiRoutes({
        app,
        authRequired,
        userRequired,
        getAccountsSnapshot,
        statsSummaryService,
        healthProbeService,
    });

    app.use('/api', farmToolsRouter);

    app.use('/api', createAdminApiGuard({
        publicPaths,
        authRequired,
        userRequired,
    }));

    registerSystemPublicRoutes({
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
        getAccId: routeRuntime.getAccId,
        getProvider,
        getSchedulerRegistrySnapshot,
        adminOperationLogService,
        jwtService,
        handleApiError: routeRuntime.handleApiError,
        healthProbeService,
        resolveServiceProfile,
    });

    registerLegacyLogoutRoute({
        app,
        jwtService,
        adminLogger,
    });

    registerStatsSummaryRoutes({
        app,
        authRequired,
        userRequired,
        statsSummaryService,
    });

    registerPlatformCapabilitiesRoutes({
        app,
        authRequired,
        userRequired,
    });

    registerProxyAdminRoutes({
        app,
        authRequired,
        userRequired,
        proxyPoolService,
    });

    registerAccountStateRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        getAccountSnapshotById: routeRuntime.getAccountSnapshotById,
        getProvider,
        handleApiError: routeRuntime.handleApiError,
        getLevelExpProgress,
        loadFriendsCacheApi: () => require('../../services/database'),
    });

    registerAutomationRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        store,
        getProvider,
    });

    registerFriendOperationRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        store,
        getProvider,
        handleApiError: routeRuntime.handleApiError,
    });

    registerFriendBlacklistRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        store,
        getProvider,
    });

    registerCommerceRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        getAccountSnapshotById: routeRuntime.getAccountSnapshotById,
        getProvider,
        buildOfflineSeeds,
        buildOfflineShopCatalog,
        findShopGoodsById,
        buildOfflineMallCatalog,
        buildOfflineMallGoods,
        getAccountBagPreferences,
        saveAccountBagPreferences,
        isSoftRuntimeError: routeRuntime.isSoftRuntimeError,
        handleApiError: routeRuntime.handleApiError,
        formatUseResult: (data, payload) => require('../../services/warehouse').formatUseResult(data, payload),
    });

    registerAccountControlRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        getProvider,
        store,
        resolveAccId: routeRuntime.resolveAccId,
        getAccountList: routeRuntime.getAccountList,
        accountRepository,
        adminLogger,
        handleApiError: routeRuntime.handleApiError,
        loadGenerateSafeModeBlacklist: () => require('../../services/friend').generateSafeModeBlacklist,
        loadGetPlantRankings: () => require('../../services/analytics').getPlantRankings,
    });

    registerAccountSettingsRoutes({
        app,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        getProvider,
        store,
        validateSettings,
        adminLogger,
    });

    registerSettingsReportRoutes({
        app,
        authRequired,
        accountOwnershipRequired,
        getAccId: routeRuntime.getAccId,
        getAccountsSnapshot,
        resolveAccId: routeRuntime.resolveAccId,
        getProvider,
        store,
        adminLogger,
        buildUserUiBody,
        getUserPreferences,
        getUserUiConfig,
        mergeUiConfig,
        saveUserUiConfig,
        saveUserPreferences,
        runUiBackgroundCleanup,
        ensureUiBackgroundDir,
        buildReportHistoryCsv,
        getReportLogs,
        getReportLogStats,
        exportReportLogs,
        deleteReportLogsByIds,
        clearReportLogs,
        crypto: cryptoRef,
        fs: fsRef,
        path: pathRef,
    });

    registerBugReportRoutes({
        app,
        authRequired,
        store,
        getPool,
        getProvider,
        getAccountsSnapshot,
        getAccId: routeRuntime.getAccId,
        adminLogger,
    });

    registerHelpCenterObservabilityRoutes({
        app,
        authRequired,
        adminLogger,
        getPool,
    });

    registerHelpCenterAnalyticsRoutes({
        app,
        authRequired,
        adminLogger,
        getPool,
    });

    registerHelpCenterFeedbackRoutes({
        app,
        authRequired,
        adminLogger,
        getPool,
        adminOperationLogService,
    });

    registerAccountReadRoutes({
        app,
        getProvider,
        compareLeaderboardAccounts,
        toLeaderboardMetricNumber,
    });

    registerAccountManagementRoutes({
        app,
        accountOwnershipRequired,
        getAccountsSnapshot,
        getAccountList: routeRuntime.getAccountList,
        resolveAccId: routeRuntime.resolveAccId,
        findAccountByRef,
        addOrUpdateAccount,
        deleteAccount,
        getProvider,
        store,
        consoleRef,
        adminOperationLogService,
    });

    registerUserCardRoutes({
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
    });

    registerAdminOperationLogRoutes({
        app,
        authRequired,
        userRequired,
        adminOperationLogService,
    });

    const trialRateLimitMap = new Map();
    const trialRateLimiter = createTrialRateLimiter({
        getClientIP,
        trialRateLimitMap,
    });

    registerTrialCardRoutes({
        app,
        authRequired,
        userRequired,
        trialRateLimiter,
        getClientIP,
        userStore,
        store,
    });

    registerAnnouncementAdminRoutes({
        app,
        authRequired,
        userRequired,
        adminLogger,
        getAnnouncements,
        saveAnnouncement,
        deleteAnnouncement,
        parseUpdateLog,
        syncAnnouncements: (options) => announcementRuntime.materializeAnnouncements(options),
        getIo,
        store,
    });

    registerSystemUpdateAdminRoutes({
        app,
        authRequired,
        userRequired,
        adminLogger,
        adminOperationLogService,
        healthProbeService,
        version,
        getDispatcherRef: getDispatcher,
        getAccountsSnapshotRef: getAccountsSnapshot,
        syncAnnouncementsRef: (options) => announcementRuntime.materializeAnnouncements(options),
        getLatestSmokeSummaryRef: () => smokeSummaryService.getLatestSummary(),
    });

    registerLogReadRoutes({
        app,
        getProvider,
        getAccountsSnapshot,
        resolveAccId: routeRuntime.resolveAccId,
        getAccId: routeRuntime.getAccId,
    });

    registerNotificationsRoute({
        app,
        getNotificationEntries: (options) => announcementRuntime.listNotificationEntries(options),
        parseUpdateLog,
    });

    registerQrRoutes({
        app,
        store,
        configRef,
        processRef,
        fetchRef,
        AbortControllerRef,
        setTimeoutRef,
        clearTimeoutRef,
        sleepRef: (ms) => new Promise((resolve) => setTimeoutRef(resolve, ms)),
        miniProgramLoginSession,
        consoleRef,
    });

    app.get('*', async (req, res) => {
        if (
            req.path.startsWith('/api')
            || req.path.startsWith('/game-config')
            || req.path.startsWith('/asset-cache')
            || req.path.startsWith('/ui-backgrounds')
        ) {
            return res.status(404).json({ ok: false, error: 'Not Found' });
        }
        if (fsRef.existsSync(webDist)) {
            res.sendFile(pathRef.join(webDist, 'index.html'));
        } else {
            res.status(404).send('web build not found. Please build the web project.');
        }
    });

    return {
        routeRuntime,
        maintenanceContext: {
            trialRateLimitMap,
        },
    };
}

module.exports = {
    registerAdminFeatureRoutes,
};
