const io = require('socket.io-client');
const { createModuleLogger } = require('../services/logger');
const { createRuntimeEngine } = require('../runtime/runtime-engine');
const { initJobs } = require('../jobs/index');
const process = require('node:process');
const workerLogger = createModuleLogger('worker-client');

class WorkerClient {
    constructor(masterUrl, workerToken) {
        this.masterUrl = masterUrl || process.env.MASTER_URL || 'http://localhost:3000';
        this.workerToken = workerToken || process.env.WORKER_TOKEN || 'default_cluster_token';
        this.socket = null;
        this.runtimeEngine = null;
        this.assignedAccounts = new Set();
        this.assignedAccountData = new Map(); // 用于差分比对 (Diff Loading)
    }

    async init() {
        workerLogger.info(`[Worker] 正在初始化工作节点...`);
        // 初始化必要的执行队列 (不包括写库操作，纯业务运行库)
        initJobs();

        this.runtimeEngine = createRuntimeEngine({
            processRef: process,
            mainEntryPath: __filename,
            startAdminServer: () => { /* Worker不启动Admin */ },
            onStatusSync: (accountId, status) => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('worker:status:sync', { accountId, status });
                }
            },
            onLog: (entry) => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('worker:log:new', entry);
                }
            },
            onAccountLog: (entry) => {
                if (this.socket && this.socket.connected) {
                    this.socket.emit('worker:account-log:new', entry);
                }
            }
        });

        // 启动本地引擎（但不自动加载本地DB账号）
        await this.runtimeEngine.start({
            startAdminServer: false,
            autoStartAccounts: false, // 全部由 Master 下放
        });

        this.connectToMaster();
    }

    connectToMaster() {
        workerLogger.info(`[Worker] 尝试连接到 Master: ${this.masterUrl}`);
        this.socket = io(this.masterUrl, {
            path: '/socket.io',
            transports: ['websocket'],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 10000,
            auth: {
                token: this.workerToken,
                nodeId: `worker-${process.pid}-${Date.now().toString().slice(-4)}`
            }
        });

        this.socket.on('connect', () => {
            workerLogger.info(`[Worker] 已成功连接到 Master，准备接收任务...`);
            this.socket.emit('worker:ready');
        });

        this.socket.on('disconnect', () => {
            workerLogger.warn(`[Worker] 与 Master 的连接已断开，进入离线保护模式`);
        });

        this.socket.on('connect_error', (err) => {
            workerLogger.error(`[Worker] 连接 Master 失败: ${err.message}`);
        });

        // 接收 Master 委派的账户任务集 (差分重载 Diff Loading)
        this.socket.on('master:assign:accounts', async (payload) => {
            const { accounts } = payload || {};
            if (!Array.isArray(accounts)) return;

            workerLogger.info(`[Worker] 收到 Master 分配: ${accounts.length} 个账号`);

            const newSet = new Set();
            const newMap = new Map();

            // 构建新分配的指纹字典
            for (const acc of accounts) {
                const id = String(acc.id);
                newSet.add(id);
                newMap.set(id, JSON.stringify(acc)); // 以字串作为指纹比对凭据变化
            }

            let changesDetected = false;

            // Step 1: 对比找出被移除或已变更的旧账号 (执行 Stop)
            for (const [oldId, oldDataStr] of this.assignedAccountData.entries()) {
                if (!newMap.has(oldId)) {
                    workerLogger.info(`[Worker 差分] 移除掉线账号，执行停止: ${oldId}`);
                    try { this.runtimeEngine.stopAccount(oldId); } catch (e) { }
                    changesDetected = true;
                } else if (newMap.get(oldId) !== oldDataStr) {
                    workerLogger.info(`[Worker 差分] 账号配置发生改变，清空原有调度: ${oldId}`);
                    try { this.runtimeEngine.stopAccount(oldId); } catch (e) { }
                    changesDetected = true;
                }
            }

            // Step 2: 启动全新下发，或配置刚刚发生变更重载的账号
            for (const [newId, newDataStr] of newMap.entries()) {
                if (!this.assignedAccountData.has(newId) || this.assignedAccountData.get(newId) !== newDataStr) {
                    workerLogger.info(`[Worker 差分] 挂载并启动账号: ${newId}`);
                    try {
                        this.runtimeEngine.startAccount(newId);
                    } catch (e) {
                        workerLogger.error(`[Worker 差分] 启动账号失败: ${newId}`, { error: e.message });
                    }
                    changesDetected = true;
                }
            }

            if (!changesDetected) {
                workerLogger.debug(`[Worker 差分] 侦测到状态完全吻合，未影响任何正在运行的排队调度。`);
            }

            // 更新引用
            this.assignedAccounts = newSet;
            this.assignedAccountData = newMap;
        });
    }
}

module.exports = { WorkerClient };
