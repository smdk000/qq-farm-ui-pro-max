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
        const aiAutostart = require('../ai-autostart');
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

// 打包后 worker 由当前可执行文件以 --worker 模式启动
const isWorkerProcess = process.env.FARM_WORKER === '1';
if (isWorkerProcess) {
    require('./src/core/worker');
} else {
    (async () => {
        // 启动 AI 服务（无感知自动启动）
        startAIServices();

        try {
            await initDatabase();
        } catch (err) {
            mainLogger.error('数据库初始化致命错误', { error: err.message });
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

        // 启动定时任务（每日日志清理与统计汇总）
        initJobs();

        try {
            await runtimeEngine.start({
                startAdminServer: true,
                autoStartAccounts: true,
            });
            mainLogger.info('系统启动完成');
        } catch (err) {
            mainLogger.error('runtime bootstrap failed', { error: err && err.message ? err.message : String(err) });
        }
    })();
}
