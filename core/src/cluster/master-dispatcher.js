const { createModuleLogger } = require('../services/logger');
const masterLogger = createModuleLogger('master-dispatcher');
const store = require('../models/store');

class MasterDispatcher {
    constructor(io) {
        this.io = io;
        this.workers = new Map(); // socketId -> { nodeId, socket, assigned: [] }
        this.accountToWorker = new Map(); // accountId -> socketId (Sticky Sessions)
    }

    init() {
        if (!this.io) {
            masterLogger.error("MasterDispatcher required initialized Socket.IO instance");
            return;
        }

        masterLogger.info('✅ MasterDispatcher(分布式控制面) 初始化成功, 等待 Worker 接入...');

        // 引入定期 GC 机制：每 15 分钟执行一次泄漏检查
        setInterval(() => {
            if (this.accountToWorker) {
                let removed = 0;
                for (const [accId, socketId] of this.accountToWorker.entries()) {
                    if (!this.workers.has(socketId)) {
                        this.accountToWorker.delete(accId);
                        removed++;
                    }
                }
                if (removed > 0) {
                    masterLogger.warn(`[Master GC] 成功清理了 ${removed} 个遗留的幽灵 Session 绑定, 当前路由表大小: ${this.accountToWorker.size}`);
                }
            }
        }, 15 * 60 * 1000).unref();

        // 复用原有的 admin 隧道增加 worker: 开头的命令监听
        this.io.on('connection', (socket) => {

            socket.on('worker:ready', async () => {
                const nodeId = socket.handshake.auth?.nodeId || `unknown-${socket.id}`;
                masterLogger.info(`[Master] 探测到新的 Worker 接入就绪: ${nodeId}`);

                this.workers.set(socket.id, {
                    nodeId,
                    socket,
                    assigned: []
                });

                // 触发负载均衡重新分配
                await this.rebalance();
            });

            socket.on('disconnect', async () => {
                if (this.workers.has(socket.id)) {
                    masterLogger.warn(`[Master] Worker 节点掉线: ${this.workers.get(socket.id).nodeId}`);
                    this.workers.delete(socket.id);
                    // 重新分配孤儿任务
                    await this.rebalance();
                }
            });

            // 监听 Worker 传回的状态快照与日志
            socket.on('worker:status:sync', (payload) => {
                // 收到任意 Worker 传回来的业务执行状态，直接广播给所有挂载页面的 Admin
                // 借用 admin.js 原始机制 (此时 admin.js 中应保留 status 的中转订阅路由)
                const { accountId, status } = payload || {};
                if (accountId) {
                    this.io.to(`account:${accountId}`).emit('status:update', { accountId, status });
                    this.io.to('account:all').emit('status:update', { accountId, status });
                }
            });

            socket.on('worker:log:new', (payload) => {
                const id = String((payload && payload.accountId) || '').trim();
                if (id) this.io.to(`account:${id}`).emit('log:new', payload);
                this.io.to('account:all').emit('log:new', payload);
            });

            socket.on('worker:account-log:new', (payload) => {
                const id = String((payload && payload.accountId) || '').trim();
                if (id) this.io.to(`account:${id}`).emit('account-log:new', payload);
                this.io.to('account:all').emit('account-log:new', payload);
            });
        });
    }

    /**
     * 将目前系统中开启了 running=true 的账号根据策略分发给存活的 worker
     */
    async rebalance() {
        if (this.workers.size === 0) {
            masterLogger.warn(`[Master] 警告: 当前没有可用的 Worker 节点, 全局任务停滞。`);
            return;
        }

        const data = await store.getAccounts();
        const activeAccounts = (data?.accounts || []).filter(a => a.running);

        const clusterConfig = store.getClusterConfig ? store.getClusterConfig() : { dispatcherStrategy: 'round_robin' };
        const isLeastLoad = clusterConfig.dispatcherStrategy === 'least_load';

        masterLogger.info(`[Master] 开始 Rebalance (策略: ${clusterConfig.dispatcherStrategy})! 总执行账号: ${activeAccounts.length}, 可用 Worker 数: ${this.workers.size}`);

        const wList = Array.from(this.workers.values());

        // 如果是传统的 round_robin (洗牌模式)
        if (!isLeastLoad) {
            // 清空所有 Worker 之前的账本
            wList.forEach(w => w.assigned = []);
            this.accountToWorker.clear();

            // 简易 RR 均匀分配算法
            activeAccounts.forEach((acc, index) => {
                const targetWorkerSocketId = Array.from(this.workers.keys())[index % this.workers.size];
                const targetWorker = this.workers.get(targetWorkerSocketId);
                targetWorker.assigned.push(acc);
                this.accountToWorker.set(String(acc.id), targetWorkerSocketId);
            });
        } else {
            // == 智能 Least Load (最小负荷) 粘性路由 ==
            // 阶段1：清理死去的映射 / 移除不再 running 的账号映射
            const activeIds = new Set(activeAccounts.map(a => String(a.id)));
            for (const [accId, socketId] of this.accountToWorker.entries()) {
                if (!activeIds.has(accId) || !this.workers.has(socketId)) {
                    this.accountToWorker.delete(accId);
                }
            }

            // 阶段2：重置 Worker 上的分配账本，我们将使用最新的 this.accountToWorker 进行重新推演
            wList.forEach(w => w.assigned = []);

            // 阶段3：按需推流
            for (const acc of activeAccounts) {
                const sId = String(acc.id);
                let targetSocketId = this.accountToWorker.get(sId);

                // 如果账号暂无归属，则寻找当前分配人数最少的 Worker
                if (!targetSocketId) {
                    let leastWorker = null;
                    let minCount = Infinity;

                    for (const [wSocketId, wBox] of this.workers.entries()) {
                        if (wBox.assigned.length < minCount) {
                            leastWorker = wSocketId;
                            minCount = wBox.assigned.length;
                        }
                    }
                    targetSocketId = leastWorker;
                    this.accountToWorker.set(sId, targetSocketId);
                }

                const wBox = this.workers.get(targetSocketId);
                if (wBox) {
                    wBox.assigned.push(acc);
                }
            }
        }

        // 批量向远端发射最新账本
        for (const worker of wList) {
            masterLogger.info(`[Master] 向 Worker(${worker.nodeId}) 下发分配集: ${worker.assigned.length} 个账号.`);
            worker.socket.emit('master:assign:accounts', {
                accounts: worker.assigned
            });
        }
    }
}

let _instance = null;
function initDispatcher(io) {
    if (!_instance) {
        _instance = new MasterDispatcher(io);
        _instance.init();
    }
    return _instance;
}

function getDispatcher() {
    return _instance;
}

module.exports = { initDispatcher, getDispatcher };
