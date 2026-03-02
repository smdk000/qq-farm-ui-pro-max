/**
 * 通用写入缓冲器 (Write-Behind Buffer)
 * 
 * 功能：将高频 SQL 写操作攒到内存队列中，按时间窗口或条数阈值批量刷盘。
 * 适用场景：操作日志 INSERT、好友缓存批量 UPSERT 等高频写入。
 * 
 * 设计原则：
 * - 每 flushIntervalMs 毫秒 或 累积 maxBatchSize 条时自动 flush
 * - 进程退出时通过 process.on('exit') 同步刷盘
 * - flush 使用 better-sqlite3 事务批量写入，最大化性能
 */

const { createModuleLogger } = require('./logger');
const logger = createModuleLogger('write-buffer');

class WriteBuffer {
    /**
     * 构建写缓冲器实例
     * @param {object} options 配置
     * @param {Function} options.getDb - 获取数据库实例的函数
     * @param {string} options.name - 缓冲器名称，用于日志标识
     * @param {number} [options.flushIntervalMs=5000] - 定时刷盘间隔（毫秒）
     * @param {number} [options.maxBatchSize=200] - 累积条数阈值，达到时立即刷盘
     */
    constructor(options = {}) {
        this.getDb = options.getDb;
        this.name = options.name || 'default';
        this.flushIntervalMs = options.flushIntervalMs || 5000;
        this.maxBatchSize = options.maxBatchSize || 200;

        // 内部队列：每条记录为 { sql: string, params: any[] }
        this._queue = [];
        this._timer = null;
        this._flushing = false;

        // 启动定时器
        this._startTimer();

        // 绑定进程退出时的同步刷盘
        this._exitHandler = () => this.flushSync();
        process.on('exit', this._exitHandler);
    }

    /**
     * 推入一条待写入的 SQL 操作
     * @param {string} sql - SQL 语句
     * @param {Array} params - 参数列表
     */
    push(sql, params = []) {
        this._queue.push({ sql, params });

        // 达到批量阈值，立即触发刷盘
        if (this._queue.length >= this.maxBatchSize) {
            this.flushSync();
        }
    }

    /**
     * 同步刷盘当前队列中的所有待写入记录
     * 使用 better-sqlite3 的事务机制批量执行，减少文件锁竞争
     */
    flushSync() {
        if (this._flushing || this._queue.length === 0) return;

        this._flushing = true;
        const batch = this._queue.splice(0); // 取出全部，清空队列

        try {
            const db = this.getDb();
            if (!db) {
                logger.warn(`[${this.name}] 数据库未初始化，${batch.length} 条记录丢弃`);
                return;
            }

            // 预编译 SQL 语句缓存，避免重复 prepare
            const stmtCache = {};
            const runAll = db.transaction((items) => {
                for (const item of items) {
                    if (!stmtCache[item.sql]) {
                        stmtCache[item.sql] = db.prepare(item.sql);
                    }
                    stmtCache[item.sql].run(...item.params);
                }
            });

            runAll(batch);
            logger.debug(`[${this.name}] 批量刷盘完成: ${batch.length} 条`);
        } catch (err) {
            // 出错时将未写入的记录放回队列头部（有损容忍策略：如果是严重错误则丢弃）
            if (err.code === 'SQLITE_BUSY') {
                // 繁忙重试：放回队列，等待下次 flush
                this._queue.unshift(...batch);
                logger.warn(`[${this.name}] 刷盘遇写锁(SQLITE_BUSY)，${batch.length} 条记录等待下次重试`);
            } else {
                logger.error(`[${this.name}] 批量刷盘失败，${batch.length} 条记录丢弃:`, {
                    errMsg: err.message,
                    errCode: err.code,
                });
            }
        } finally {
            this._flushing = false;
        }
    }

    /**
     * 获取当前队列长度
     * @returns {number}
     */
    get pending() {
        return this._queue.length;
    }

    /**
     * 启动定时器
     */
    _startTimer() {
        if (this._timer) return;
        this._timer = setInterval(() => {
            this.flushSync();
        }, this.flushIntervalMs);

        // 避免定时器阻止进程退出
        if (this._timer.unref) {
            this._timer.unref();
        }
    }

    /**
     * 停止缓冲器，刷盘并关闭定时器
     */
    destroy() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this.flushSync();

        // 移除进程退出监听
        process.removeListener('exit', this._exitHandler);
    }
}

module.exports = { WriteBuffer };
