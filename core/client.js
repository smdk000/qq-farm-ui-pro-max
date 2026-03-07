const process = require('node:process');
/**
 * 主程序 - 进程管理器
 * 负责启动 Web 面板，并管理多个 Bot 子进程
 * 自动启动 AI 服务（OpenViking + 千问 3.5 Plus）
 */

const { startAdminServer, emitRealtimeStatus, emitRealtimeLog, emitRealtimeAccountLog } = require('./src/controllers/admin');
const { createRuntimeEngine } = require('./src/runtime/runtime-engine');
const { createModuleLogger } = require('./src/services/logger');
const { initJobs } = require('./src/jobs/index');
const { initDatabase } = require('./src/services/database');

const mainLogger = createModuleLogger('main');

// 自动启动 AI 服务
async function startAIServices() {
    try {
        const aiAutostart = require('../scripts/service/ai-autostart');
        mainLogger.info('[AI 服务] 正在自动启动 AI 编程助手服务...');

        // 静默启动，不阻塞主程序
        setImmediate(() => {
            aiAutostart.start().catch((err) => {
                mainLogger.warn('[AI 服务] 启动失败，但不影响主程序运行', {
                    error: err && err.message ? err.message : String(err)
                });
            });
        });

        mainLogger.info('[AI 服务] AI 服务启动指令已发送（后台运行）');
    } catch (error) {
        mainLogger.warn('[AI 服务] 自动启动模块未找到，跳过 AI 服务启动', {
            error: error && error.message ? error.message : String(error)
        });
    }
}

const isWorkerProcess = process.env.FARM_WORKER === '1';
const currentRole = process.env.ROLE || 'standalone';

if (isWorkerProcess) {
    require('./src/core/worker');
} else if (currentRole === 'worker') {
    // Phase 6 集群架构：纯粹的 Worker 执行节点
    (async () => {
        const { WorkerClient } = require('./src/cluster/worker-client');
        const workerClient = new WorkerClient(process.env.MASTER_URL, process.env.WORKER_TOKEN);
        await workerClient.init();
    })();
} else {
    // standalone 普通模式 或 master 模式
    (async () => {
        // 启动 AI 服务（无感知自动启动）
        startAIServices();

        try {
            await initDatabase();

            const userStore = require('./src/models/user-store');
            if (userStore.loadAllFromDB) {
                await userStore.loadAllFromDB();
            }

            const store = require('./src/models/store');
            if (store.loadAllFromDB) {
                await store.loadAllFromDB();
            }
        } catch (err) {
            console.error(`\n${  '='.repeat(70)}`);
            console.error('🚨 【致命启动拦截】数据库环境未就绪或表结构损坏！');
            console.error('='.repeat(70));
            console.error('系统检测到 MySQL 环境配置异常（例如缺少 `stats_daily` 字段），为了防止产生级联错误风暴，已安全阻断启动。');
            console.error('\n📋 故障可能原因：');
            console.error('1. 这是您第一次运行全新版的代码，但忘记了执行建表操作。');
            console.error('2. 您使用的旧版 SQLite/JSON 未成功转译至新版的 MySQL 连接池。');
            console.error('3. 数据库 3306 端口离线，或者 `.env` 中的账密连不上。');
            console.error('\n💡 【处方建议】：');
            console.error('👉 不想折腾？请直接采用一键容器化启动。在根目录运行: docker-compose up -d');
            console.error('👉 需要裸机部署？请立刻运行: ./quick-start.sh 以完成数据库校验。');
            console.error('\n[底层抛错信息]:', err.message);
            console.error(`${'='.repeat(70)  }\n`);
            process.exit(1);
        }

        const runtimeEngine = createRuntimeEngine({
            processRef: process,
            mainEntryPath: __filename,
            startAdminServer,
            onStatusSync: (accountId, status) => {
                emitRealtimeStatus(accountId, status);
            },
            onLog: (entry) => {
                emitRealtimeLog(entry);
            },
            onAccountLog: (entry) => {
                emitRealtimeAccountLog(entry);
            },
        });

        // 包含每日日志清理与统计汇总的 Cron jobs 必然只应当在 master 或者 standalone 下运行
        initJobs();

        try {
            await runtimeEngine.start({
                startAdminServer: true,
                autoStartAccounts: currentRole !== 'master', // role为master时不再在这里挂起本地账号循环，而交由此处 dispatcher 管理下发
            });
            mainLogger.info(`系统启动完成 (模式: ${currentRole})`);

            if (currentRole === 'master') {
                // 如果定义了 master 模式，再额外启动调度分配器给连进来的 worker 分发任务
                const { initDispatcher } = require('./src/cluster/master-dispatcher');
                // 因为 startAdminServer 中赋值了 io 对象，我们需要直接获取对应的 io。为了无缝接入，
                // 由于 `startAdminServer` 目前没有对外返回 io 实例，稍后我们需要在 admin.js 输出一下 io，
                // 这里我们挂在一个全局延迟函数等待 admin.js 的 io 暴露出。
                setTimeout(() => {
                    const adminControllers = require('./src/controllers/admin');
                    if (adminControllers.getIO) {
                        initDispatcher(adminControllers.getIO());
                    }
                }, 2000);
            }

        } catch (err) {
            mainLogger.error('runtime bootstrap failed', { error: err && err.message ? err.message : String(err) });
        }
    })();
}
