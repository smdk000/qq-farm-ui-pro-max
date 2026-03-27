const { createScheduler } = require('../services/scheduler');
const { getPool } = require('../services/mysql-db');
const store = require('../models/store');
const { CONFIG } = require('../config/config');
const { MiniProgramLoginSession } = require('../services/qrlogin');
const { NETWORK_COOL_DOWN_MS } = require('../services/circuit-breaker');

let systemLogBatch = [];
let systemLogFlushHandle = null;

function normalizeNumericQQUin(value) {
    const text = String(value || '').trim();
    return /^\d+$/.test(text) ? text : '';
}

function normalizeAvatarUrl(value) {
    return String(value || '').trim();
}

function normalizeAccountWsError(code, message) {
    const normalizedCode = Number(code) || 0;
    const normalizedMessage = String(message || '').trim();
    if (!normalizedCode && !normalizedMessage) {
        return null;
    }
    return {
        code: normalizedCode,
        message: normalizedMessage,
        at: Date.now(),
    };
}

function isPermanentBanReason(reason) {
    const text = String(reason || '').trim();
    return /已被封禁|账号已被封禁|封禁/.test(text);
}

function flushSystemLogBatch() {
    if (systemLogBatch.length === 0) return;
    const pool = getPool();
    const currentBatch = systemLogBatch;
    systemLogBatch = [];
    try {
        const values = currentBatch.map(b => [b.accountId, b.level || 'info', b.tag || '默认', b.msg || '', JSON.stringify(b.meta || {})]);
        const placeholders = currentBatch.map(() => '(?, ?, ?, ?, ?)').join(',');
        pool.query(`INSERT INTO system_logs (account_id, level, category, text, meta_data) VALUES ${placeholders}`, values.flat())
            .catch(() => {/* 忽略批量写入异常以防日志死循环 */ });
    } catch { }
}

function ensureSystemLogFlushLoop() {
    if (systemLogFlushHandle) return systemLogFlushHandle;
    systemLogFlushHandle = setInterval(flushSystemLogBatch, 5000);
    if (typeof systemLogFlushHandle.unref === 'function') {
        systemLogFlushHandle.unref();
    }
    return systemLogFlushHandle;
}

function createWorkerManager(options) {
    ensureSystemLogFlushLoop();
    const {
        fork,
        WorkerThread,
        runtimeMode = 'thread',
        processRef,
        mainEntryPath,
        workerScriptPath,
        workers,
        globalLogs,
        log,
        addAccountLog,
        normalizeStatusForPanel,
        buildConfigSnapshotForAccount,
        getOfflineAutoDeleteMs,
        triggerOfflineReminder,
        addOrUpdateAccount,
        markAccountLoginSuccess,
        deleteAccount,
        upsertFriendBlacklist,
        updateFriendsCache,
        mergeFriendsCache,
        broadcastConfigToWorkers,
        onStatusSync,
        onWorkerLog,
    } = options;
    const managerScheduler = createScheduler('worker_manager');
    const MAX_WORKER_LOG_LIMIT = Number(processRef.env.FARM_MAX_LOG_LIMIT) || 1000;
    const useThreadRuntime = runtimeMode === 'thread' && !processRef.pkg && typeof WorkerThread === 'function';

    function isWechatPlatform(platform) {
        return platform === 'wx' || platform === 'wx_ipad' || platform === 'wx_car';
    }

    function looksLikeWxId(uin) {
        return /[a-z]/i.test(String(uin || '').trim());
    }

    function isWechatAutoRefreshEnabled() {
        const thirdPartyCfg = store.getThirdPartyApiConfig ? store.getThirdPartyApiConfig() : {};
        const raw = thirdPartyCfg.wechatAutoRefreshAuth ?? processRef.env.WECHAT_AUTO_REFRESH_AUTH;
        if (raw === undefined || raw === null || String(raw).trim() === '') {
            return true;
        }
        if (typeof raw === 'boolean') return raw;
        const text = String(raw).trim().toLowerCase();
        if (['0', 'false', 'no', 'off'].includes(text)) return false;
        return ['1', 'true', 'yes', 'on'].includes(text);
    }

    function isQQAutoRefreshEnabled() {
        const raw = processRef.env.FARM_QQ_AUTO_REFRESH_AUTH ?? '';
        if (typeof raw === 'boolean') return raw;
        const text = String(raw || '').trim().toLowerCase();
        return text === '1' || text === 'true' || text === 'yes' || text === 'on';
    }

    async function refreshQQAuthCode(account) {
        const platform = String(account && account.platform || '').trim();
        const ticket = String(account && account.authTicket || '').trim();
        if (platform !== 'qq' || !ticket) {
            throw new Error('当前账号不满足 QQ 启动换码条件');
        }
        const authCode = String(await MiniProgramLoginSession.getAuthCode(ticket, '1112386029') || '').trim();
        if (!authCode) {
            throw new Error('QQ ticket 未换回新的 authCode');
        }
        return {
            ...account,
            code: authCode,
        };
    }

    async function refreshWechatAuthCode(account) {
        const platform = String(account && account.platform || '').trim();
        const wxid = String(account && account.uin || '').trim();
        if (!isWechatPlatform(platform) || !looksLikeWxId(wxid)) {
            throw new Error('当前账号不满足微信自动续签条件');
        }

        if (platform === 'wx_car' || platform === 'wx_ipad') {
            const thirdPartyCfg = store.getThirdPartyApiConfig ? store.getThirdPartyApiConfig() : {};
            const ipad860Url = thirdPartyCfg.ipad860Url || processRef.env.IPAD860_URL || 'http://127.0.0.1:8058';
            const wxAppId = thirdPartyCfg.wxAppId || CONFIG.wxAppId;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 10000);
            try {
                const jsRes = await fetch(`${ipad860Url}/api/Wxapp/JSLogin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Wxid: wxid, Appid: wxAppId }),
                    signal: ctrl.signal,
                }).then(r => r.json());
                if (!(jsRes && jsRes.Code === 0 && jsRes.Success && jsRes.Data)) {
                    throw new Error(jsRes && (jsRes.Message || jsRes.Msg) || 'JSLogin 失败');
                }
                const authCode = String(jsRes.Data.code || jsRes.Data.Code || '').trim();
                if (!authCode) {
                    throw new Error('JSLogin 未返回新 code');
                }
                return {
                    ...account,
                    code: authCode,
                    uin: wxid,
                };
            } finally {
                clearTimeout(timer);
            }
        }

        throw new Error('当前微信平台暂未实现自动续签');
    }

    function createThreadWorker(account) {
        const worker = new WorkerThread(workerScriptPath, {
            workerData: {
                accountId: String(account.id || ''),
                channel: 'thread',
            },
        });
        // 与 child_process 保持同形接口
        worker.send = (payload) => worker.postMessage(payload);
        worker.kill = () => worker.terminate();
        return worker;
    }

    function createForkWorker(account) {
        if (processRef.pkg) {
            // 打包后也走 fork + execPath，确保 IPC 通道可用
            return fork(mainEntryPath, [], {
                execPath: processRef.execPath,
                stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
                env: { ...processRef.env, FARM_WORKER: '1', FARM_ACCOUNT_ID: String(account.id || '') },
            });
        }
        return fork(workerScriptPath, [], {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: { ...processRef.env, FARM_ACCOUNT_ID: String(account.id || '') },
        });
    }

    function createWorkerProcess(account) {
        if (useThreadRuntime) return createThreadWorker(account);
        return createForkWorker(account);
    }

    async function startWorker(account) {
        if (!account || !account.id) return false;
        if (workers[account.id]) return false; // 已运行

        let launchAccount = { ...account };
        if (String(launchAccount.platform || '') === 'qq' && launchAccount.authTicket && isQQAutoRefreshEnabled()) {
            try {
                const refreshedAccount = await refreshQQAuthCode(launchAccount);
                if (refreshedAccount.code && refreshedAccount.code !== launchAccount.code) {
                    launchAccount = refreshedAccount;
                    addOrUpdateAccount({
                        id: launchAccount.id,
                        code: launchAccount.code,
                        authTicket: launchAccount.authTicket,
                    });
                    addAccountLog('auth_refresh', `账号 ${launchAccount.name} 启动前自动刷新 QQ 授权成功`, launchAccount.id, launchAccount.name);
                }
            } catch (error) {
                log('系统', `账号 ${launchAccount.name} QQ 启动换码失败，回退使用现有登录码`, {
                    accountId: String(launchAccount.id),
                    accountName: launchAccount.name,
                    reason: error && error.message ? error.message : String(error || ''),
                });
            }
        }

        if (isWechatAutoRefreshEnabled() && isWechatPlatform(String(launchAccount.platform || '')) && looksLikeWxId(launchAccount.uin)) {
            try {
                const refreshedAccount = await refreshWechatAuthCode(launchAccount);
                if (refreshedAccount.code && refreshedAccount.code !== launchAccount.code) {
                    launchAccount = refreshedAccount;
                    addOrUpdateAccount({
                        id: launchAccount.id,
                        code: launchAccount.code,
                        uin: launchAccount.uin,
                        qq: launchAccount.qq || '',
                    });
                    addAccountLog('auth_refresh', `账号 ${launchAccount.name} 启动前自动刷新微信授权成功`, launchAccount.id, launchAccount.name);
                }
            } catch (error) {
                log('系统', `账号 ${launchAccount.name} 微信启动续签失败，回退使用现有登录码`, {
                    accountId: String(launchAccount.id),
                    accountName: launchAccount.name,
                    reason: error && error.message ? error.message : String(error || ''),
                });
            }
        }

        log('系统', `正在启动账号: ${launchAccount.name}`, { accountId: String(launchAccount.id), accountName: launchAccount.name });

        let child = null;
        try {
            child = createWorkerProcess(launchAccount);
        } catch (err) {
            const reason = err && err.message ? err.message : String(err || '未知错误');
            log('错误', `账号 ${launchAccount.name} 启动失败: ${reason}`, { accountId: String(launchAccount.id), accountName: launchAccount.name });
            addAccountLog('start_failed', `账号 ${launchAccount.name} 启动失败`, launchAccount.id, launchAccount.name, { reason });
            return false;
        }

        workers[launchAccount.id] = {
            process: child,
            status: null, // 最新状态快照
            logs: [],
            requests: new Map(), // pending API requests
            reqId: 1,
            name: launchAccount.name,
            stopping: false,
            disconnectedSince: 0,
            autoDeleteTriggered: false,
            wsError: null,
            authRefreshing: false,
            account: {
                id: launchAccount.id,
                name: launchAccount.name,
                platform: launchAccount.platform,
                uin: launchAccount.uin || launchAccount.qq || '',
                qq: launchAccount.qq || '',
                code: launchAccount.code || '',
                authTicket: launchAccount.authTicket || '',
            },
        };

        try {
            addOrUpdateAccount({
                id: launchAccount.id,
                running: true,
                connected: false,
                wsError: null,
            });
        } catch { }

        // 发送启动指令
        child.send({
            type: 'start',
            config: {
                code: launchAccount.code,
                platform: launchAccount.platform,
                uin: launchAccount.uin || launchAccount.qq || '',
            },
        });
        child.send({ type: 'config_sync', config: buildConfigSnapshotForAccount(launchAccount.id) });

        // 监听消息
        child.on('message', (msg) => {
            handleWorkerMessage(launchAccount.id, msg);
        });

        child.on('error', (err) => {
            log('系统', `账号 ${launchAccount.name} 子进程启动失败: ${err && err.message ? err.message : err}`, { accountId: String(launchAccount.id), accountName: launchAccount.name });
        });

        child.on('exit', (code, signal) => {
            const current = workers[launchAccount.id];
            const displayName = (current && current.name) || launchAccount.name;
            log('系统', `账号 ${displayName} 进程退出 (code=${code}, signal=${signal || '无'})`, {
                accountId: String(launchAccount.id),
                accountName: displayName,
                runtimeMode: useThreadRuntime ? 'thread' : 'fork',
            });

            managerScheduler.clear(`force_kill_${launchAccount.id}`);
            managerScheduler.clear(`restart_fallback_${launchAccount.id}`);

            if (current && current.requests && current.requests.size > 0) {
                for (const [reqId, req] of current.requests.entries()) {
                    managerScheduler.clear(`api_timeout_${launchAccount.id}_${reqId}`);
                    try {
                        req.reject(new Error('工作进程已退出'));
                    } catch { }
                }
                current.requests.clear();
            }

            if (current && current.process === child) {
                try {
                    addOrUpdateAccount({
                        id: launchAccount.id,
                        running: false,
                        connected: false,
                        wsError: current.wsError || null,
                    });
                } catch { }
                delete workers[launchAccount.id];
            }
        });
        return true;
    }

    function stopWorker(accountId) {
        const worker = workers[accountId];
        if (!worker) return;

        const proc = worker.process;
        worker.stopping = true;
        try {
            addOrUpdateAccount({
                id: accountId,
                running: false,
                connected: false,
                wsError: worker.wsError || null,
            });
        } catch { }
        worker.process.send({ type: 'stop' });
        // process.kill will happen in 'exit' handler or we can force it
        managerScheduler.setTimeoutTask(`force_kill_${accountId}`, 1000, () => {
            const current = workers[accountId];
            if (current && current.process === proc) {
                current.process.kill();
                delete workers[accountId];
            }
        });
    }

    async function restartWorker(account) {
        if (!account) return false;
        const accountId = account.id;
        const worker = workers[accountId];
        if (!worker) return startWorker(account);
        const proc = worker.process;
        let started = false;
        const startOnce = () => {
            if (started) return;
            started = true;
            managerScheduler.clear(`restart_fallback_${accountId}`);
            const current = workers[accountId];
            if (!current) return startWorker(account);
            if (current.process !== proc) return;
            delete workers[accountId];
            startWorker(account);
        };
        const killIfStale = () => {
            const current = workers[accountId];
            if (!current || current.process !== proc) return false;
            try {
                current.process.kill();
            } catch { }
            delete workers[accountId];
            return true;
        };
        if (typeof proc.exitCode === 'number' || proc.signalCode) {
            return startOnce();
        }
        proc.once('exit', startOnce);
        stopWorker(accountId);
        managerScheduler.setTimeoutTask(`restart_fallback_${accountId}`, 1500, () => {
            if (started) return;
            killIfStale();
            startOnce();
        });
        return true;
    }

    function handleWorkerMessage(accountId, msg) {
        const worker = workers[accountId];
        if (!worker) return;

        if (msg.type === 'status_sync') {
            const previousStatus = worker.status || null;
            const wasConnected = !!(previousStatus && previousStatus.connection && previousStatus.connection.connected);
            // 合并状态
            worker.status = normalizeStatusForPanel(msg.data, accountId, worker.name);
            const panelStatus = worker.status || {};
            if (typeof onStatusSync === 'function') {
                onStatusSync(accountId, panelStatus, worker.name);
            }

            // 尝试更新昵称到 store
            if (msg.data && msg.data.status && msg.data.status.name) {
                const newNick = String(msg.data.status.name).trim();
                // 忽略无效昵称
                if (newNick && newNick !== '未知' && newNick !== '未登录') {
                    // 避免频繁写入，只在内存中无昵称或不一致时更新
                    if (worker.nick !== newNick) {
                        const oldNick = worker.nick;
                        worker.nick = newNick;
                        if (worker.account) worker.account.name = newNick;
                        addOrUpdateAccount({
                            id: accountId,
                            nick: newNick,
                        });
                        // 仅在首次同步或名称变更时记录日志
                        if (oldNick !== newNick) {
                            log('系统', `已同步账号昵称: ${oldNick || '空'} -> ${newNick}`, { accountId, accountName: worker.name });
                        }
                    }
                }
            }

            const connected = !!(panelStatus.connection && panelStatus.connection.connected);
            const liveStatus = (panelStatus.status && typeof panelStatus.status === 'object') ? panelStatus.status : {};
            const liveUin = normalizeNumericQQUin(liveStatus.uin);
            const liveAvatar = normalizeAvatarUrl(liveStatus.avatarUrl || liveStatus.avatar);
            if (worker.account) {
                if (liveUin) {
                    worker.account.uin = liveUin;
                    worker.account.qq = liveUin;
                }
                if (liveAvatar) {
                    worker.account.avatar = liveAvatar;
                }
            }
            try {
                const now = Date.now();
                addOrUpdateAccount({
                    id: accountId,
                    running: !worker.stopping,
                    connected,
                    wsError: worker.wsError || null,
                    nick: liveStatus.name || worker.nick || '',
                    level: Number(liveStatus.level) || 0,
                    gold: Number(liveStatus.gold) || 0,
                    exp: Number(liveStatus.exp) || 0,
                    coupon: Number(liveStatus.coupon) || 0,
                    uptime: Number(panelStatus.uptime) || 0,
                    lastStatusAt: now,
                    ...(liveUin ? { uin: liveUin, qq: liveUin } : {}),
                    ...(liveAvatar ? { avatar: liveAvatar } : {}),
                    ...(connected ? { lastOnlineAt: now } : {}),
                });
            } catch { }
            if (connected) {
                const isFreshLogin = !wasConnected;
                worker.disconnectedSince = 0;
                worker.autoDeleteTriggered = false;
                worker.wsError = null;
                try {
                    addOrUpdateAccount({
                        id: accountId,
                        running: true,
                        connected: true,
                        wsError: null,
                    });
                } catch { }
                if (isFreshLogin) {
                    const loginAt = Date.now();
                    if (typeof markAccountLoginSuccess === 'function') {
                        void markAccountLoginSuccess(accountId, {
                            timestamp: loginAt,
                            running: true,
                            connected: true,
                        });
                    } else {
                        try {
                            addOrUpdateAccount({
                                id: accountId,
                                lastLoginAt: loginAt,
                                updatedAt: loginAt,
                            });
                        } catch { }
                    }
                    addAccountLog(
                        'login_success',
                        `账号 ${worker.name} 登录成功，已记录最后登录时间`,
                        accountId,
                        worker.name,
                    );
                }
            } else if (!worker.stopping) {
                const now = Date.now();
                if (!worker.disconnectedSince) worker.disconnectedSince = now;
                const offlineMs = now - worker.disconnectedSince;
                const autoDeleteMs = getOfflineAutoDeleteMs();
                if (autoDeleteMs > 0 && !worker.autoDeleteTriggered && offlineMs >= autoDeleteMs) {
                    worker.autoDeleteTriggered = true;
                    const offlineMin = Math.floor(offlineMs / 60000);
                    log('系统', `账号 ${worker.name} 持续离线 ${offlineMin} 分钟，自动删除账号信息`);
                    triggerOfflineReminder({
                        accountId,
                        accountName: worker.name,
                        reason: 'offline_timeout',
                        offlineMs,
                    });
                    addAccountLog(
                        'offline_delete',
                        `账号 ${worker.name} 持续离线 ${offlineMin} 分钟，已自动删除`,
                        accountId,
                        worker.name,
                        { reason: 'offline_timeout', offlineMs },
                    );
                    stopWorker(accountId);
                    try {
                        deleteAccount(accountId);
                    } catch (e) {
                        log('错误', `删除离线账号失败: ${e.message}`);
                    }
                }
            }
        } else if (msg.type === 'log') {
            // 保存日志到内存与推送到前端
            const logEntry = {
                ...msg.data,
                accountId,
                accountName: worker.name,
                ts: Date.now(),
                meta: msg.data && msg.data.meta ? msg.data.meta : {},
            };
            logEntry._searchText = `${logEntry.msg || ''} ${logEntry.tag || ''} ${JSON.stringify(logEntry.meta || {})}`.toLowerCase();
            worker.logs.push(logEntry);
            if (worker.logs.length > MAX_WORKER_LOG_LIMIT) worker.logs.shift();
            globalLogs.push(logEntry);
            if (globalLogs.length > MAX_WORKER_LOG_LIMIT) globalLogs.shift();

            // 压入持久化批处理队列
            systemLogBatch.push(logEntry);

            if (typeof onWorkerLog === 'function') {
                onWorkerLog(logEntry, accountId, worker.name);
            }
        } else if (msg.type === 'sync_friends_cache') {
            const syncFriendsCache = typeof mergeFriendsCache === 'function'
                ? mergeFriendsCache
                : updateFriendsCache;
            if (typeof syncFriendsCache === 'function' && msg.data) {
                syncFriendsCache(accountId, msg.data, {
                    account: worker.account || null,
                    platform: worker.account && worker.account.platform,
                    uin: worker.account && worker.account.uin,
                    qq: worker.account && worker.account.qq,
                    openId: worker.account && worker.account.openId,
                }).catch(() => {});
            }
        } else if (msg.type === 'error') {
            log('错误', `账号[${accountId}]进程报错: ${msg.error}`, { accountId: String(accountId), accountName: worker.name });
        } else if (msg.type === 'ws_error') {
            const code = Number(msg.code) || 0;
            const message = msg.message || '';
            const wsError = { code, message, at: Date.now() };
            worker.wsError = wsError;
            try {
                addOrUpdateAccount({
                    id: accountId,
                    running: false,
                    connected: false,
                    wsError,
                });
            } catch { }
            if (code === 400) {
                const accountSnapshot = worker.account ? { ...worker.account, id: accountId, name: worker.name } : null;
                if (accountSnapshot && isWechatAutoRefreshEnabled() && isWechatPlatform(accountSnapshot.platform) && looksLikeWxId(accountSnapshot.uin) && !worker.authRefreshing) {
                    worker.authRefreshing = true;
                    log('系统', `账号 ${worker.name} 微信授权已失效，尝试自动续签...`, {
                        accountId: String(accountId),
                        accountName: worker.name,
                    });
                    void (async () => {
                        try {
                            const refreshedAccount = await refreshWechatAuthCode(accountSnapshot);
                            worker.account = {
                                ...worker.account,
                                ...refreshedAccount,
                            };
                            worker.wsError = null;
                            addOrUpdateAccount({
                                id: accountId,
                                code: refreshedAccount.code,
                                uin: refreshedAccount.uin,
                                qq: refreshedAccount.qq || '',
                                wsError: null,
                                running: false,
                                connected: false,
                            });
                            addAccountLog(
                                'auth_refresh',
                                `账号 ${worker.name} 自动续签微信授权成功`,
                                accountId,
                                worker.name,
                            );
                            restartWorker(refreshedAccount);
                        } catch (refreshErr) {
                            addAccountLog(
                                'ws_400',
                                `账号 ${worker.name} 登录失效，请更新 Code`,
                                accountId,
                                worker.name,
                            );
                            log('系统', `账号 ${worker.name} 微信自动续签失败: ${refreshErr.message}`, {
                                accountId: String(accountId),
                                accountName: worker.name,
                            });
                            stopWorker(accountId);
                        } finally {
                            const current = workers[accountId];
                            if (current) current.authRefreshing = false;
                        }
                    })();
                    return;
                }
                addAccountLog(
                    'ws_400',
                    `账号 ${worker.name} 登录失效，请更新 Code`,
                    accountId,
                    worker.name,
                );
                stopWorker(accountId);
            }
        } else if (msg.type === 'account_kicked') {
            const reason = msg.reason || '未知';
            if (isPermanentBanReason(reason)) {
                worker.wsError = normalizeAccountWsError(1000016, reason);
                try {
                    addOrUpdateAccount({
                        id: accountId,
                        running: false,
                        connected: false,
                        wsError: worker.wsError,
                    });
                } catch { }
            }
            log('系统', `账号 ${worker.name} 被踢下线，已自动停止账号`, { accountId: String(accountId), accountName: worker.name });
            triggerOfflineReminder({
                accountId,
                accountName: worker.name,
                reason: `kickout:${reason}`,
                offlineMs: 0,
            });
            addAccountLog('kickout_stop', `账号 ${worker.name} 被踢下线，已自动停止`, accountId, worker.name, { reason });
            stopWorker(accountId);
        } else if (msg.type === 'account_banned') {
            const reason = msg.reason || '未知';
            const coolDownMin = Math.ceil((Number(NETWORK_COOL_DOWN_MS) || (30 * 60 * 1000)) / 60000);
            log('系统', `账号 ${worker.name} 被判定限制 (${reason})，记录日志并推送 Webhook 告警`, { accountId: String(accountId), accountName: worker.name });
            triggerOfflineReminder({
                accountId,
                accountName: worker.name,
                reason: `ban:${reason}`,
                offlineMs: Number(NETWORK_COOL_DOWN_MS) || (30 * 60 * 1000),
            });
            addAccountLog('ban_sleep', `账号 ${worker.name} 当前连接较忙，进入 ${coolDownMin} 分钟休息`, accountId, worker.name, {
                reason,
                coolDownMs: Number(NETWORK_COOL_DOWN_MS) || (30 * 60 * 1000),
            });
        } else if (msg.type === 'friend_blacklist_add') {
            const gid = Number(msg.gid);
            if (!Number.isFinite(gid) || gid <= 0) return;
            if (typeof upsertFriendBlacklist !== 'function') return;
            try {
                const changed = !!upsertFriendBlacklist(accountId, gid);
                if (changed && typeof broadcastConfigToWorkers === 'function') {
                    broadcastConfigToWorkers(accountId);
                }
            } catch { }
        } else if (msg.type === 'api_response') {
            const { id, result, error } = msg;
            managerScheduler.clear(`api_timeout_${accountId}_${id}`);
            const req = worker.requests.get(id);
            if (req) {
                if (error) {
                    if (typeof error === 'object' && error !== null) {
                        const err = new Error(String(error.message || '子进程接口错误'));
                        if (error.code) err.code = String(error.code);
                        req.reject(err);
                    } else {
                        req.reject(new Error(String(error)));
                    }
                } else req.resolve(result);
                worker.requests.delete(id);
            }
        }
    }

    function callWorkerApi(accountId, method, ...args) {
        const worker = workers[accountId];
        if (!worker) return Promise.reject(new Error('账号未运行'));

        return new Promise((resolve, reject) => {
            const id = worker.reqId++;
            worker.requests.set(id, { resolve, reject });

            // 超时处理
            managerScheduler.setTimeoutTask(`api_timeout_${accountId}_${id}`, 10000, () => {
                if (worker.requests.has(id)) {
                    worker.requests.delete(id);
                    reject(new Error('接口调用超时'));
                }
            });

            worker.process.send({ type: 'api_call', id, method, args });
        });
    }

    return {
        startWorker,
        stopWorker,
        restartWorker,
        callWorkerApi,
    };
}

module.exports = {
    createWorkerManager,
};
