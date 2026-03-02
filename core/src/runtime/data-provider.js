const { findAccountByRef, normalizeAccountRef, resolveAccountId: resolveAccountIdByList } = require('../services/account-resolver');
const { getSchedulerRegistrySnapshot } = require('../services/scheduler');

function createDataProvider(options) {
    const {
        workers,
        globalLogs,
        accountLogs,
        store,
        getAccounts,
        callWorkerApi,
        buildDefaultStatus,
        normalizeStatusForPanel,
        filterLogs,
        addAccountLog,
        nextConfigRevision,
        broadcastConfigToWorkers,
        startWorker,
        stopWorker,
        restartWorker,
    } = options;

    async function getStoredAccountsList() {
        const data = await getAccounts();
        return Array.isArray(data.accounts) ? data.accounts : [];
    }

    async function resolveAccountRefId(accountRef) {
        const raw = normalizeAccountRef(accountRef);
        if (!raw) return '';
        const list = await getStoredAccountsList();
        const resolved = resolveAccountIdByList(list, raw);
        return resolved || raw;
    }

    async function findAccountByAnyRef(accountRef) {
        const list = await getStoredAccountsList();
        return findAccountByRef(list, accountRef);
    }

    return {
        resolveAccountId: async (accountRef) => await resolveAccountRefId(accountRef),

        // 获取指定账号的状态 (如果 accountId 为空，返回概览?)
        getStatus: async (accountRef) => {
            const accountId = await resolveAccountRefId(accountRef);
            if (!accountId) return buildDefaultStatus('');
            const w = workers[accountId];
            if (!w || !w.status) return buildDefaultStatus(accountId);
            return {
                ...buildDefaultStatus(accountId),
                ...normalizeStatusForPanel(w.status, accountId, w.name),
                wsError: w.wsError || null,
            };
        },

        getLogs: async (accountRef, optionsOrLimit) => {
            const opts = (typeof optionsOrLimit === 'object' && optionsOrLimit) ? optionsOrLimit : { limit: optionsOrLimit };
            const max = Math.max(1, Number(opts.limit) || 100);
            const rawRef = normalizeAccountRef(accountRef);
            const accountId = await resolveAccountRefId(accountRef);
            if (!rawRef) {
                return filterLogs(globalLogs, opts).slice(-max);
            }
            if (!accountId) return [];
            const accId = String(accountId || '');
            return filterLogs(globalLogs.filter(l => String(l.accountId || '') === accId), opts).slice(-max);
        },

        getAccountLogs: (limit) => accountLogs.slice(-limit).reverse(),
        addAccountLog: (action, msg, accountId, accountName, extra) => addAccountLog(action, msg, accountId, accountName, extra),

        // 透传方法
        getLands: async (accountRef) => callWorkerApi(await resolveAccountRefId(accountRef), 'getLands'),
        getFriends: async (accountRef) => callWorkerApi(await resolveAccountRefId(accountRef), 'getFriends'),
        getFriendLands: async (accountRef, gid) => callWorkerApi(await resolveAccountRefId(accountRef), 'getFriendLands', gid),
        doFriendOp: async (accountRef, gid, opType) => callWorkerApi(await resolveAccountRefId(accountRef), 'doFriendOp', gid, opType),
        getBag: async (accountRef) => callWorkerApi(await resolveAccountRefId(accountRef), 'getBag'),
        getDailyGifts: async (accountRef) => callWorkerApi(await resolveAccountRefId(accountRef), 'getDailyGiftOverview'),
        getSeeds: async (accountRef) => callWorkerApi(await resolveAccountRefId(accountRef), 'getSeeds'),

        setAutomation: async (accountRef, key, value) => {
            const accountId = await resolveAccountRefId(accountRef);
            if (!accountId) {
                throw new Error('Missing x-account-id');
            }
            store.setAutomation(key, value, accountId);
            const rev = nextConfigRevision();
            broadcastConfigToWorkers(accountId);
            return { automation: store.getAutomation(accountId), configRevision: rev };
        },

        doFarmOp: async (accountRef, opType) => callWorkerApi(await resolveAccountRefId(accountRef), 'doFarmOp', opType),
        doAnalytics: async (accountRef, sortBy) => callWorkerApi(await resolveAccountRefId(accountRef), 'getAnalytics', sortBy),
        saveSettings: async (accountRef, payload) => {
            const accountId = await resolveAccountRefId(accountRef);
            if (!accountId) {
                throw new Error('Missing x-account-id');
            }
            const body = (payload && typeof payload === 'object') ? payload : {};
            const plantingStrategy = (body.plantingStrategy !== undefined) ? body.plantingStrategy : body.strategy;
            const preferredSeedId = (body.preferredSeedId !== undefined) ? body.preferredSeedId : body.seedId;
            const snapshot = {
                plantingStrategy,
                preferredSeedId,
                intervals: body.intervals,
                friendQuietHours: body.friendQuietHours,
            };
            if (body.automation !== undefined) {
                snapshot.automation = body.automation;
            }
            if (body.stealFilter !== undefined) {
                snapshot.stealFilter = body.stealFilter;
            }
            if (body.stealFriendFilter !== undefined) {
                snapshot.stealFriendFilter = body.stealFriendFilter;
            }
            if (body.stakeoutSteal !== undefined) {
                snapshot.stakeoutSteal = body.stakeoutSteal;
            }
            store.applyConfigSnapshot(snapshot, { accountId });
            const rev = nextConfigRevision();
            broadcastConfigToWorkers(accountId);
            return {
                strategy: store.getPlantingStrategy(accountId),
                preferredSeed: store.getPreferredSeed(accountId),
                intervals: store.getIntervals(accountId),
                friendQuietHours: store.getFriendQuietHours(accountId),
                configRevision: rev,
            };
        },

        setUITheme: async (theme) => {
            const snapshot = store.setUITheme(theme);
            return { ui: snapshot.ui || store.getUI() };
        },

        broadcastConfig: (accountId) => {
            broadcastConfigToWorkers(accountId);
        },

        setRuntimeAccountName: async (accountRef, accountName) => {
            const accountId = await resolveAccountRefId(accountRef);
            if (!accountId) return;
            const worker = workers[accountId];
            if (worker) {
                worker.name = String(accountName || worker.name || accountId);
            }
        },

        // 账号管理直接操作 store
        getAccounts: async () => {
            const data = await getAccounts();
            data.accounts.forEach((a) => {
                const worker = workers[a.id];
                a.running = !!worker;
                if (worker && worker.status && worker.status.status && worker.status.status.name) {
                    a.nick = worker.status.status.name;
                }
            });
            return data;
        },

        startAccount: async (accountRef) => {
            const accountId = await resolveAccountRefId(accountRef);
            let acc = await findAccountByAnyRef(accountId || accountRef);
            if (!acc) return false;
            // 解决精简版数据遗漏 code 字段导致连接 websocket 时抛出 400 失败的问题
            if (store && typeof store.getAccountFull === 'function') {
                const fullAcc = await store.getAccountFull(acc.id);
                if (fullAcc) {
                    acc = { ...acc, ...fullAcc };
                }
            }
            startWorker(acc);
            return true;
        },

        stopAccount: async (accountRef) => {
            const accountId = await resolveAccountRefId(accountRef);
            const acc = await findAccountByAnyRef(accountId || accountRef);
            if (!acc) return false;
            if (accountId) stopWorker(accountId);
            return true;
        },

        restartAccount: async (accountRef) => {
            const accountId = await resolveAccountRefId(accountRef);
            const acc = await findAccountByAnyRef(accountId || accountRef);
            if (!acc) return false;
            restartWorker(acc);
            return true;
        },

        isAccountRunning: async (accountRef) => {
            const accountId = await resolveAccountRefId(accountRef);
            return !!(accountId && workers[accountId]);
        },

        getSchedulerStatus: async (accountRef) => {
            const accountId = await resolveAccountRefId(accountRef);
            const runtime = getSchedulerRegistrySnapshot();
            let worker = null;
            let workerError = '';

            if (!accountId) {
                return { accountId: '', runtime, worker, workerError };
            }

            if (!workers[accountId]) {
                return { accountId, runtime, worker, workerError: '账号未运行' };
            }

            try {
                worker = await callWorkerApi(accountId, 'getSchedulers');
            } catch (e) {
                workerError = (e && e.message) ? e.message : String(e || 'unknown');
            }
            return { accountId, runtime, worker, workerError };
        },
    };
}

module.exports = {
    createDataProvider,
};
