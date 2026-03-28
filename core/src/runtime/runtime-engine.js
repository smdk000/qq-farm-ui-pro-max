const { fork } = require('node:child_process')
const path = require('node:path')
const process = require('node:process');
const { Worker } = require('node:worker_threads')
const store = require('../models/store')
const { sendPushooMessage } = require('../services/push')
const { MiniProgramLoginSession } = require('../services/qrlogin')
const { createDataProvider } = require('./data-provider')
const { createReloginReminderService } = require('./relogin-reminder')
const { createRuntimeState } = require('./runtime-state')
const { createWorkerManager } = require('./worker-manager')
const { updateFriendsCache, mergeFriendsCache, clearFriendsCache } = require('../services/database')
const { createReportService } = require('../services/report-service')
const accountRepository = require('../repositories/account-repository')

const OPERATION_KEYS = ['harvest', 'water', 'weed', 'bug', 'fertilize', 'plant', 'steal', 'helpWater', 'helpWeed', 'helpBug', 'taskClaim', 'sell', 'upgrade']

function requiresRelogin(account) {
  return Number(account && account.wsError && account.wsError.code) === 400
}

function isBannedAccount(account) {
  const wsError = account && account.wsError && typeof account.wsError === 'object' ? account.wsError : null
  const code = Number(wsError && wsError.code) || 0
  const message = String(wsError && wsError.message || '').trim()
  return code === 1000016 || /已被封禁|账号已被封禁|封禁/.test(message)
}

function createRuntimeEngine(options = {}) {
  const processRef = options.processRef || process
  const mainEntryPath = options.mainEntryPath || path.join(__dirname, '../../client.js')
  const workerScriptPath = options.workerScriptPath || path.join(__dirname, '../core/worker.js')
  const runtimeMode = String(options.runtimeMode || processRef.env.FARM_RUNTIME_MODE || 'thread').toLowerCase()
  const onStatusSync = typeof options.onStatusSync === 'function' ? options.onStatusSync : null
  const onLog = typeof options.onLog === 'function' ? options.onLog : null
  const onAccountLog = typeof options.onAccountLog === 'function' ? options.onAccountLog : null
  const startAdminServer = typeof options.startAdminServer === 'function' ? options.startAdminServer : null
  const stopAdminServer = typeof options.stopAdminServer === 'function' ? options.stopAdminServer : null

  const workerControls = { startWorker: null, restartWorker: null }
  const runtimeState = createRuntimeState({
    store,
    operationKeys: OPERATION_KEYS,
  })
  const {
    workers,
    globalLogs: GLOBAL_LOGS,
    accountLogs: ACCOUNT_LOGS,
    runtimeEvents,
    nextConfigRevision,
    buildConfigSnapshotForAccount,
    log,
    addAccountLog,
    normalizeStatusForPanel,
    buildDefaultStatus,
    filterLogs,
  } = runtimeState
  const getAccountsForProvider = typeof store.getAccountsFresh === 'function'
    ? store.getAccountsFresh
    : store.getAccounts

  const reloginReminder = createReloginReminderService({
    store,
    miniProgramLoginSession: MiniProgramLoginSession,
    sendPushooMessage,
    log,
    addAccountLog,
    getAccounts: store.getAccounts,
    addOrUpdateAccount: store.addOrUpdateAccount,
    resolveWorkerControls: () => workerControls,
  })

  const {
    getOfflineAutoDeleteMs,
    triggerOfflineReminder,
  } = reloginReminder

  const { startWorker, stopWorker, restartWorker, callWorkerApi } = createWorkerManager({
    fork,
    WorkerThread: Worker,
    runtimeMode,
    processRef,
    mainEntryPath,
    workerScriptPath,
    workers,
    globalLogs: GLOBAL_LOGS,
    log,
    addAccountLog,
    normalizeStatusForPanel,
    buildConfigSnapshotForAccount,
    getOfflineAutoDeleteMs,
    triggerOfflineReminder,
    addOrUpdateAccount: store.addOrUpdateAccount,
    markAccountLoginSuccess: store.markAccountLoginSuccess,
    deleteAccount: store.deleteAccount,
    updateFriendsCache,
    mergeFriendsCache,
    clearFriendsCache,
    onStatusSync: (accountId, status, accountName) => {
      runtimeEvents.emit('status', { accountId, status, accountName })
      if (onStatusSync) onStatusSync(accountId, status, accountName)
    },
    onWorkerLog: (entry, accountId, accountName) => {
      runtimeEvents.emit('worker_log', { entry, accountId, accountName })
      if (onLog) onLog(entry, accountId, accountName)
    },
  })
  workerControls.startWorker = startWorker
  workerControls.restartWorker = restartWorker

  const dataProvider = createDataProvider({
    workers,
    globalLogs: GLOBAL_LOGS,
    accountLogs: ACCOUNT_LOGS,
    currentRole: processRef.env.ROLE || 'standalone',
    store,
    accountRepository,
    getAccounts: getAccountsForProvider,
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
  })

  const reportService = createReportService({
    store,
    dataProvider,
    getAccounts: getAccountsForProvider,
    sendPushooMessage,
    log,
    addAccountLog,
  })

  dataProvider.sendAccountReportTest = async (accountRef) => {
    return await reportService.sendTestReport(accountRef)
  }
  dataProvider.sendAccountReport = async (accountRef, mode) => {
    if (mode === 'hourly')
      return await reportService.sendHourlyReport(accountRef)
    if (mode === 'daily')
      return await reportService.sendDailyReport(accountRef)
    throw new Error('不支持的经营汇报模式')
  }

  runtimeEvents.on('log', (entry) => {
    if (onLog) onLog(entry, entry && entry.accountId ? entry.accountId : '', entry && entry.accountName ? entry.accountName : '')
  })
  runtimeEvents.on('account_log', (entry) => {
    if (onAccountLog) onAccountLog(entry)
  })

  function broadcastConfigToWorkers(targetAccountId = '') {
    const targetId = String(targetAccountId || '').trim()
    for (const [accId, worker] of Object.entries(workers)) {
      if (targetId && String(accId) !== targetId) continue
      const snapshot = buildConfigSnapshotForAccount(accId)
      try {
        worker.process.send({ type: 'config_sync', config: snapshot })
      }
      catch {
        // ignore IPC failures for exited workers
      }
    }
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  async function startAllAccounts() {
    let page = 1
    const pageSize = 50
    let hasMore = true
    let totalStarted = 0
    let totalSkippedRelogin = 0
    let totalSkippedBanned = 0

    log('系统', `正在准备分批唤醒账号群...`)

    while (hasMore) {
      const data = await store.getAccountsFullPaged(page, pageSize)
      const accounts = (data.accounts || [])
      const startableAccounts = accounts.filter(acc => !requiresRelogin(acc) && !isBannedAccount(acc))
      const skippedReloginCount = accounts.filter(acc => requiresRelogin(acc)).length
      const skippedBannedCount = accounts.filter(acc => isBannedAccount(acc)).length

      if (startableAccounts.length > 0) {
        log('系统', `[启动批次 ${page}] 正在拉起 ${startableAccounts.length} 个账号...`)
        startableAccounts.forEach(acc => startWorker(acc))
        totalStarted += startableAccounts.length
      }

      if (skippedReloginCount > 0) {
        totalSkippedRelogin += skippedReloginCount
        log('系统', `[启动批次 ${page}] 跳过 ${skippedReloginCount} 个登录已失效账号，等待重新登录`)
      }
      if (skippedBannedCount > 0) {
        totalSkippedBanned += skippedBannedCount
        log('系统', `[启动批次 ${page}] 跳过 ${skippedBannedCount} 个已封禁账号，保持停用`)
      }

      if (data.total <= page * pageSize || accounts.length === 0) {
        hasMore = false
      } else {
        page++
        // Phase 3 优化：强制释放一小段时间使得主线程 Event Loop 舒缓，避免解析万条巨型 JSON 拥塞
        await sleep(600)
      }
    }

    if (totalStarted === 0) {
      if (totalSkippedRelogin > 0 || totalSkippedBanned > 0) {
        const reasons = []
        if (totalSkippedRelogin > 0) reasons.push(`${totalSkippedRelogin} 个需要重新登录`)
        if (totalSkippedBanned > 0) reasons.push(`${totalSkippedBanned} 个已封禁`)
        log('系统', `本次未自动启动任何账号，已跳过 ${reasons.join('，')} 的账号`)
      } else {
        log('系统', '未发现账号，请访问管理面板添加账号')
      }
    } else {
      log('系统', `所有批次下发完成，共唤醒 ${totalStarted} 个账号！`)
      if (totalSkippedRelogin > 0) {
        log('系统', `另有 ${totalSkippedRelogin} 个账号因登录已失效被跳过，避免重复拉起`)
      }
      if (totalSkippedBanned > 0) {
        log('系统', `另有 ${totalSkippedBanned} 个账号因已封禁被跳过，避免重复撞线`)
      }
    }
  }

  async function start(options = {}) {
    const shouldStartAdminServer = options.startAdminServer !== false
    const shouldAutoStartAccounts = options.autoStartAccounts !== false

    if (shouldStartAdminServer && startAdminServer) {
      await Promise.resolve(startAdminServer(dataProvider))
      reportService.start()
    }

    if (shouldAutoStartAccounts) {
      await startAllAccounts()
    }
  }

  function stopAllAccounts() {
    for (const accountId of Object.keys(workers)) {
      stopWorker(accountId)
    }
  }

  async function stop(options = {}) {
    const shouldStopAccounts = options.stopAccounts !== false
    const shouldStopReports = options.stopReportService !== false
    const shouldStopAdminServer = options.stopAdminServer !== false

    if (shouldStopReports) {
      reportService.stop()
    }

    if (shouldStopAccounts) {
      stopAllAccounts()
    }

    if (shouldStopAdminServer && stopAdminServer) {
      await Promise.resolve(stopAdminServer())
    }
  }

  return {
    store,
    runtimeEvents,
    workers,
    dataProvider,
    start,
    stop,
    startAllAccounts,
    stopAllAccounts,
    broadcastConfigToWorkers,
    reportService,
    startWorker,
    stopWorker,
    restartWorker,
    callWorkerApi,
    log,
    addAccountLog,
  }
}

module.exports = {
  createRuntimeEngine,
}
