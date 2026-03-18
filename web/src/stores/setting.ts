import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { localizeRuntimeText } from '@/utils/runtime-text'
import { createDefaultTradeConfig, normalizeTradeConfig } from '@/utils/trade-config'

export interface AutomationConfig {
  farm?: boolean
  farm_push?: boolean
  land_upgrade?: boolean
  landUpgradeTarget?: number
  friend?: boolean
  task?: boolean
  sell?: boolean
  fertilizer?: string
  fertilizer_buy?: boolean
  fertilizer_buy_limit?: number
  fertilizer_buy_type?: 'organic' | 'normal' | 'both'
  fertilizer_buy_mode?: 'threshold' | 'unlimited'
  fertilizer_buy_threshold_normal?: number
  fertilizer_buy_threshold_organic?: number
  fertilizer_60s_anti_steal?: boolean
  fertilizer_smart_phase?: boolean
  fastHarvest?: boolean
  friend_steal?: boolean
  friend_help?: boolean
  friend_bad?: boolean
  friend_auto_accept?: boolean
  qqFriendFetchMultiChain?: boolean
  open_server_gift?: boolean
}

export type AccountMode = 'main' | 'alt' | 'safe'

export interface HarvestDelayConfig {
  min?: number
  max?: number
}

export interface ModeScopeConfig {
  zoneScope?: string
  requiresGameFriend?: boolean
  fallbackBehavior?: string
}

export interface IntervalsConfig {
  farm?: number
  friend?: number
  farmMin?: number
  farmMax?: number
  friendMin?: number
  friendMax?: number
  helpMin?: number
  helpMax?: number
  stealMin?: number
  stealMax?: number
}

export interface InventoryPlantingReserveRule {
  seedId: number
  keepCount: number
}

export interface InventoryPlantingConfig {
  mode?: 'disabled' | 'prefer_inventory' | 'inventory_only'
  globalKeepCount?: number
  reserveRules?: InventoryPlantingReserveRule[]
}

export interface StakeoutStealConfig {
  enabled?: boolean
  delaySec?: number
}

export interface QqHighRiskWindowConfig {
  durationMinutes?: number
  expiresAt?: number
  lastIssuedAt?: number
  lastAutoDisabledAt?: number
}

export interface FriendQuietHoursConfig {
  enabled?: boolean
  start?: string
  end?: string
}

export interface TradeSellRareKeepConfig {
  enabled?: boolean
  judgeBy?: 'plant_level' | 'unit_price' | 'either'
  minPlantLevel?: number
  minUnitPrice?: number
}

function resolveLocalizedError(...values: any[]) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text)
      return localizeRuntimeText(text)
  }
  return '操作失败'
}

export interface TradeSellConfig {
  scope?: 'fruit_only'
  keepMinEachFruit?: number
  keepFruitIds?: number[]
  rareKeep?: TradeSellRareKeepConfig
  batchSize?: number
  previewBeforeManualSell?: boolean
}

export interface TradeConfig {
  sell?: TradeSellConfig
}

export interface OfflineConfig {
  channel: string
  reloginUrlMode: string
  endpoint: string
  token: string
  title: string
  msg: string
  offlineDeleteEnabled: boolean
  offlineDeleteSec: number
  webhookCustomJsonEnabled: boolean
  webhookCustomJsonTemplate: string
}

export interface BugReportConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  smtpPassConfigured?: boolean
  emailFrom: string
  emailTo: string
  subjectPrefix: string
  includeFrontendErrors: boolean
  includeSystemLogs: boolean
  includeRuntimeLogs: boolean
  includeAccountLogs: boolean
  systemLogLimit: number
  runtimeLogLimit: number
  accountLogLimit: number
  frontendErrorLimit: number
  maxBodyLength: number
  cooldownSeconds: number
  saveToDatabase: boolean
  allowNonAdminSubmit: boolean
}

export interface ReportConfig {
  enabled: boolean
  channel: string
  endpoint: string
  token: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  emailFrom: string
  emailTo: string
  title: string
  hourlyEnabled: boolean
  hourlyMinute: number
  dailyEnabled: boolean
  dailyHour: number
  dailyMinute: number
  retentionDays: number
}

export interface ReportLogEntry {
  id: number
  accountId: string
  accountName: string
  mode: 'test' | 'hourly' | 'daily' | string
  ok: boolean
  channel: string
  title: string
  content: string
  errorMessage: string
  createdAt: string
}

export interface ReportLogPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ReportLogStats {
  total: number
  successCount: number
  failedCount: number
  testCount: number
  hourlyCount: number
  dailyCount: number
}

export interface TrialCardConfig {
  enabled?: boolean
  days?: number
  adminRenewEnabled?: boolean
  userRenewEnabled?: boolean
  maxAccounts?: number
  dailyLimit?: number
  cooldownMs?: number
}

export interface ThirdPartyApiConfig {
  wxApiKey?: string
  wxApiUrl?: string
  wxAppId?: string
}

export interface UIConfig {
  theme?: string
}

export interface WorkflowNodeConfig {
  id: string
  type: string
  params?: Record<string, any>
}

export interface WorkflowLaneConfig {
  enabled: boolean
  minInterval: number
  maxInterval: number
  nodes: WorkflowNodeConfig[]
}

export interface WorkflowConfig {
  farm: WorkflowLaneConfig
  friend: WorkflowLaneConfig
}

export interface TimingConfig {
  heartbeatIntervalMs: number
  rateLimitIntervalMs: number
  ghostingProbability: number
  ghostingCooldownMin: number
  ghostingMinMin: number
  ghostingMaxMin: number
  inviteRequestDelay: number
  schedulerEngine: string
  optimizedSchedulerNamespaces: string
  optimizedSchedulerTickMs: number
  optimizedSchedulerWheelSize: number
}

export interface TimingParameter {
  key: string
  label: string
  value: any
  group: string
}

export interface ClusterConfig {
  dispatcherStrategy: string
}

export interface SystemUpdateReleaseAsset {
  name: string
  url: string
  size: number
}

export interface SystemUpdateRelease {
  version: string
  versionTag: string
  title: string
  publishedAt: number
  prerelease: boolean
  notes: string
  url: string
  source: string
  assets: SystemUpdateReleaseAsset[]
}

export interface SystemUpdateConfig {
  provider: string
  manifestUrl: string
  releaseApiUrl: string
  githubOwner: string
  githubRepo: string
  channel: string
  allowPreRelease: boolean
  preferredStrategy: string
  preferredScope: string
  requireDrain: boolean
  agentMode: string
  agentPollIntervalSec: number
  defaultDrainNodeIds: string[]
}

export interface SystemUpdateRuntimeAgent {
  nodeId: string
  role: string
  status: string
  version: string
  managedNodeIds: string[]
  jobId?: number
  jobStatus?: string
  targetVersion?: string
  updatedAt: number
}

export interface SystemUpdateClusterNode {
  nodeId: string
  role: string
  status: string
  version: string
  connected: boolean
  draining: boolean
  assignedCount: number
  assignedAccountIds: string[]
  updatedAt: number
}

export interface SystemUpdateRuntime {
  lastCheckAt: number
  lastCheckOk: boolean
  lastError: string
  activeJobId: number
  activeJobStatus: string
  activeJobKey: string
  activeTargetVersion: string
  agentSummary: SystemUpdateRuntimeAgent[]
  clusterNodes: SystemUpdateClusterNode[]
}

export interface SystemUpdateJob {
  id: number
  jobKey: string
  kind: string
  scope: string
  strategy: string
  status: string
  sourceVersion: string
  targetVersion: string
  batchKey: string
  preserveCurrent: boolean
  requireDrain: boolean
  drainNodeIds: string[]
  note: string
  createdBy: string
  targetAgentId: string
  claimAgentId: string
  progressPercent: number
  summaryMessage: string
  payload: Record<string, any> | null
  result: Record<string, any> | null
  errorMessage: string
  claimedAt: number
  startedAt: number
  finishedAt: number
  createdAt: number
  updatedAt: number
}

export interface SystemUpdateBatchSummary {
  batchKey: string
  scope: string
  strategy: string
  targetVersion: string
  sourceVersion: string
  total: number
  pendingCount: number
  claimedCount: number
  runningCount: number
  succeededCount: number
  failedCount: number
  cancelledCount: number
  activeCount: number
  progressPercent: number
  status: string
  targetAgentIds: string[]
  claimAgentIds: string[]
  drainNodeIds: string[]
  jobs: SystemUpdateJob[]
  latestJobId: number
  latestJobKey: string
  latestSummaryMessage: string
  latestErrorMessage: string
  createdAt: number
  updatedAt: number
}

export interface SystemUpdateDrainCutoverBlocker {
  accountId: string
  accountName: string
  platform: string
  nodeId: string
  credentialKind: string
  reasonCode: string
  message: string
  needsReloginAfterStop: boolean
}

export interface SystemUpdateDrainCutoverReadiness {
  checkedAt: number
  canDrainCutover: boolean
  targetNodeIds: string[]
  runningAccountCount: number
  targetedRunningAccountCount: number
  blockerCount: number
  reloginRequiredCount: number
  blockers: SystemUpdateDrainCutoverBlocker[]
}

export interface SystemUpdateReleaseCache {
  checkedAt: number
  source: string
  etag: string
  lastError: string
  latestRelease: SystemUpdateRelease | null
  releases: SystemUpdateRelease[]
}

export interface SystemUpdateOverview {
  currentVersion: string
  latestRelease: SystemUpdateRelease | null
  hasUpdate: boolean
  comparison: number
  config: SystemUpdateConfig
  releaseCache: SystemUpdateReleaseCache
  runtime: SystemUpdateRuntime
  activeJob: SystemUpdateJob | null
  activeBatch: SystemUpdateBatchSummary | null
  drainCutoverReadiness: SystemUpdateDrainCutoverReadiness | null
}

export interface SettingsState {
  accountMode: AccountMode
  harvestDelay: HarvestDelayConfig
  riskPromptEnabled: boolean
  modeScope: ModeScopeConfig
  plantingStrategy: string
  plantingFallbackStrategy: string
  preferredSeedId: number
  bagSeedPriority: number[]
  bagSeedFallbackStrategy: string
  inventoryPlanting: InventoryPlantingConfig
  intervals: IntervalsConfig
  friendQuietHours: FriendQuietHoursConfig
  stakeoutSteal: StakeoutStealConfig
  qqHighRiskWindow: QqHighRiskWindowConfig
  tradeConfig: TradeConfig
  automation: AutomationConfig
  reportConfig: ReportConfig
  ui: UIConfig
  offlineReminder: OfflineConfig
  trialConfig: TrialCardConfig
  thirdPartyApi: ThirdPartyApiConfig
  workflowConfig: WorkflowConfig
  timingConfig: TimingConfig
  defaultTimingConfig: TimingConfig
  readonlyTimingParams: TimingParameter[]
  clusterConfig: ClusterConfig
}

export const useSettingStore = defineStore('setting', () => {
  const normalizeBagSeedPriority = (value: unknown): number[] => {
    if (!Array.isArray(value))
      return []
    const seen = new Set<number>()
    return value
      .map(item => Math.max(0, Number.parseInt(String(item), 10) || 0))
      .filter((seedId) => {
        if (seedId <= 0 || seen.has(seedId))
          return false
        seen.add(seedId)
        return true
      })
  }

  const createDefaultReportLogStats = (): ReportLogStats => ({
    total: 0,
    successCount: 0,
    failedCount: 0,
    testCount: 0,
    hourlyCount: 0,
    dailyCount: 0,
  })

  const settings = ref<SettingsState>({
    accountMode: 'main',
    harvestDelay: { min: 0, max: 0 },
    riskPromptEnabled: true,
    modeScope: {
      zoneScope: 'same_zone_only',
      requiresGameFriend: true,
      fallbackBehavior: 'standalone',
    },
    plantingStrategy: 'preferred',
    plantingFallbackStrategy: 'level',
    preferredSeedId: 0,
    bagSeedPriority: [],
    bagSeedFallbackStrategy: 'level',
    inventoryPlanting: {
      mode: 'disabled',
      globalKeepCount: 0,
      reserveRules: [],
    },
    intervals: {},
    friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
    stakeoutSteal: { enabled: false, delaySec: 3 },
    qqHighRiskWindow: { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0 },
    tradeConfig: createDefaultTradeConfig(),
    automation: {},
    reportConfig: {
      enabled: false,
      channel: 'webhook',
      endpoint: '',
      token: '',
      smtpHost: '',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: '',
      smtpPass: '',
      emailFrom: '',
      emailTo: '',
      title: '经营汇报',
      hourlyEnabled: false,
      hourlyMinute: 5,
      dailyEnabled: true,
      dailyHour: 21,
      dailyMinute: 0,
      retentionDays: 30,
    },
    ui: {},
    offlineReminder: {
      channel: 'webhook',
      reloginUrlMode: 'none',
      endpoint: '',
      token: '',
      title: '账号下线提醒',
      msg: '账号下线',
      offlineDeleteEnabled: false,
      offlineDeleteSec: 1,
      webhookCustomJsonEnabled: false,
      webhookCustomJsonTemplate: '',
    },
    trialConfig: {
      enabled: true,
      days: 1,
      adminRenewEnabled: true,
      userRenewEnabled: false,
      maxAccounts: 1,
      dailyLimit: 50,
      cooldownMs: 4 * 60 * 60 * 1000,
    },
    thirdPartyApi: {
      wxApiKey: '',
      wxApiUrl: '',
      wxAppId: '',
    },
    workflowConfig: {
      farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] },
      friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] },
    },
    timingConfig: {
      heartbeatIntervalMs: 25000,
      rateLimitIntervalMs: 600,
      ghostingProbability: 0.02,
      ghostingCooldownMin: 240,
      ghostingMinMin: 5,
      ghostingMaxMin: 10,
      inviteRequestDelay: 2000,
      schedulerEngine: 'hybrid',
      optimizedSchedulerNamespaces: 'system-jobs,account-report-service,worker_manager',
      optimizedSchedulerTickMs: 100,
      optimizedSchedulerWheelSize: 600,
    },
    defaultTimingConfig: {
      heartbeatIntervalMs: 25000,
      rateLimitIntervalMs: 600,
      ghostingProbability: 0.02,
      ghostingCooldownMin: 240,
      ghostingMinMin: 5,
      ghostingMaxMin: 10,
      inviteRequestDelay: 2000,
      schedulerEngine: 'hybrid',
      optimizedSchedulerNamespaces: 'system-jobs,account-report-service,worker_manager',
      optimizedSchedulerTickMs: 100,
      optimizedSchedulerWheelSize: 600,
    },
    readonlyTimingParams: [],
    clusterConfig: {
      dispatcherStrategy: 'round_robin',
    },
  })
  const loading = ref(false)
  const timingLoading = ref(false)
  const reportLogs = ref<ReportLogEntry[]>([])
  const systemUpdateOverview = ref<SystemUpdateOverview | null>(null)
  const systemUpdateJobs = ref<SystemUpdateJob[]>([])
  const reportLogPagination = ref<ReportLogPagination>({
    page: 1,
    pageSize: 3,
    total: 0,
    totalPages: 1,
  })
  const reportLogStats = ref<ReportLogStats>(createDefaultReportLogStats())

  async function fetchSettings(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/settings', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok && data.data) {
        const d = data.data
        settings.value.accountMode = d.accountMode || 'main'
        settings.value.harvestDelay = d.harvestDelay || { min: 0, max: 0 }
        settings.value.riskPromptEnabled = d.riskPromptEnabled !== false
        settings.value.modeScope = d.modeScope || {
          zoneScope: 'same_zone_only',
          requiresGameFriend: true,
          fallbackBehavior: 'standalone',
        }
        settings.value.plantingStrategy = d.plantingStrategy || d.strategy || 'preferred'
        settings.value.plantingFallbackStrategy = d.plantingFallbackStrategy || 'level'
        settings.value.preferredSeedId = d.preferredSeedId || d.preferredSeed || 0
        settings.value.bagSeedPriority = normalizeBagSeedPriority(d.bagSeedPriority)
        settings.value.bagSeedFallbackStrategy = d.bagSeedFallbackStrategy || 'level'
        settings.value.inventoryPlanting = d.inventoryPlanting || {
          mode: 'disabled',
          globalKeepCount: 0,
          reserveRules: [],
        }
        settings.value.intervals = d.intervals || {}
        settings.value.friendQuietHours = d.friendQuietHours || { enabled: false, start: '23:00', end: '07:00' }
        settings.value.stakeoutSteal = d.stakeoutSteal || { enabled: false, delaySec: 3 }
        settings.value.qqHighRiskWindow = d.qqHighRiskWindow || { durationMinutes: 30, expiresAt: 0, lastIssuedAt: 0, lastAutoDisabledAt: 0 }
        settings.value.tradeConfig = normalizeTradeConfig(d.tradeConfig)
        settings.value.automation = d.automation || {}
        settings.value.reportConfig = d.reportConfig || {
          enabled: false,
          channel: 'webhook',
          endpoint: '',
          token: '',
          smtpHost: '',
          smtpPort: 465,
          smtpSecure: true,
          smtpUser: '',
          smtpPass: '',
          emailFrom: '',
          emailTo: '',
          title: '经营汇报',
          hourlyEnabled: false,
          hourlyMinute: 5,
          dailyEnabled: true,
          dailyHour: 21,
          dailyMinute: 0,
          retentionDays: 30,
        }
        settings.value.ui = d.ui || {}
        settings.value.workflowConfig = d.workflowConfig || { farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] }, friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] } }
        settings.value.offlineReminder = d.offlineReminder || {
          channel: 'webhook',
          reloginUrlMode: 'none',
          endpoint: '',
          token: '',
          title: '账号下线提醒',
          msg: '账号下线',
          offlineDeleteEnabled: false,
          offlineDeleteSec: 1,
          webhookCustomJsonEnabled: false,
          webhookCustomJsonTemplate: '',
        }
      }
    }
    finally {
      loading.value = false
    }
  }

  async function saveSettings(accountId: string, newSettings: any) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 saving 控制按钮加载态
    try {
      // 1. Save general settings
      const settingsPayload: Record<string, any> = {
        accountMode: newSettings.accountMode,
        harvestDelay: newSettings.harvestDelay,
        riskPromptEnabled: newSettings.riskPromptEnabled,
        modeScope: newSettings.modeScope,
        plantingStrategy: newSettings.plantingStrategy,
        plantingFallbackStrategy: newSettings.plantingFallbackStrategy,
        preferredSeedId: newSettings.preferredSeedId,
        bagSeedPriority: normalizeBagSeedPriority(newSettings.bagSeedPriority),
        bagSeedFallbackStrategy: newSettings.bagSeedFallbackStrategy,
        inventoryPlanting: newSettings.inventoryPlanting,
        intervals: newSettings.intervals,
        friendQuietHours: newSettings.friendQuietHours,
        stakeoutSteal: newSettings.stakeoutSteal,
        qqHighRiskWindow: {
          durationMinutes: Math.max(5, Math.min(180, Number.parseInt(String(newSettings.qqHighRiskWindow?.durationMinutes ?? 30), 10) || 30)),
        },
        tradeConfig: normalizeTradeConfig(newSettings.tradeConfig),
        automation: newSettings.automation,
      }
      if (newSettings.acknowledgeShortIntervalRisk === true)
        settingsPayload.acknowledgeShortIntervalRisk = true
      // 蹲守配置透传
      // 工作流配置透传
      if (newSettings.workflowConfig) {
        settingsPayload.workflowConfig = newSettings.workflowConfig
      }
      if (newSettings.reportConfig) {
        settingsPayload.reportConfig = newSettings.reportConfig
      }

      await api.post('/api/settings/save', settingsPayload, {
        headers: { 'x-account-id': accountId },
      })

      // Refresh settings
      await fetchSettings(accountId)
      return { ok: true }
    }
    catch (e: any) {
      const backendError = e.response?.data?.error
      const validationErrors = Array.isArray(e.response?.data?.errors) ? e.response.data.errors.join('；') : ''
      return {
        ok: false,
        error: resolveLocalizedError(backendError, validationErrors, e.message, '保存失败'),
      }
    }
    finally {
      // loading 未在此处修改，无需 finally 中重置
    }
  }

  async function saveOfflineConfig(config: OfflineConfig) {
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 offlineSaving 控制按钮加载态
    try {
      const user = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (user?.role !== 'admin')
        return { ok: false, error: '仅管理员可修改下线提醒设置' }

      const { data } = await api.post('/api/settings/offline-reminder', config)
      if (data && data.ok) {
        settings.value.offlineReminder = data.data || config
        return { ok: true }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '保存失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '保存失败') }
    }
    finally {
      // loading 未在此处修改，无需 finally 中重置
    }
  }

  async function fetchBugReportConfig() {
    try {
      const user = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (user?.role !== 'admin')
        return { ok: false, error: '仅管理员可查看问题反馈设置' }

      const { data } = await api.get('/api/settings/bug-report')
      if (data && data.ok)
        return { ok: true, data: data.data as BugReportConfig }
      return { ok: false, error: resolveLocalizedError(data?.error, '读取失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '读取失败') }
    }
  }

  async function saveBugReportConfig(config: BugReportConfig) {
    try {
      const user = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (user?.role !== 'admin')
        return { ok: false, error: '仅管理员可修改问题反馈设置' }

      const { data } = await api.post('/api/settings/bug-report', config)
      if (data && data.ok)
        return { ok: true, data: data.data as BugReportConfig }
      return { ok: false, error: resolveLocalizedError(data?.error, data?.errors?.join?.('；'), '保存失败') }
    }
    catch (e: any) {
      const validationErrors = Array.isArray(e.response?.data?.errors) ? e.response.data.errors.join('；') : ''
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, validationErrors, e.message, '保存失败') }
    }
  }

  async function sendBugReportTest() {
    try {
      const user = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (user?.role !== 'admin')
        return { ok: false, error: '仅管理员可发送测试反馈邮件' }

      const { data } = await api.post('/api/settings/bug-report/test')
      if (data && data.ok)
        return { ok: true, data: data.data }
      return { ok: false, error: resolveLocalizedError(data?.error, '发送失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '发送失败') }
    }
  }

  async function sendReportTest(accountId: string) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    try {
      const { data } = await api.post('/api/reports/test', {}, {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok)
        return { ok: true, data: data.data }
      return { ok: false, error: resolveLocalizedError(data?.error, '发送失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '发送失败') }
    }
  }

  async function sendReport(accountId: string, mode: 'hourly' | 'daily') {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    try {
      const { data } = await api.post('/api/reports/send', { mode }, {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok)
        return { ok: true, data: data.data }
      return { ok: false, error: resolveLocalizedError(data?.error, '发送失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '发送失败') }
    }
  }

  async function fetchReportLogs(accountId: string, options: { page?: number, pageSize?: number, limit?: number, mode?: string, status?: string, sortOrder?: string, keyword?: string } = {}) {
    if (!accountId) {
      reportLogs.value = []
      reportLogPagination.value = { page: 1, pageSize: 3, total: 0, totalPages: 1 }
      return reportLogPagination.value
    }
    try {
      const page = options.page ?? 1
      const pageSize = 3
      const { data } = await api.get('/api/reports/history', {
        headers: { 'x-account-id': accountId },
        params: {
          page,
          pageSize,
          mode: options.mode || '',
          status: options.status || '',
          sortOrder: options.sortOrder || 'desc',
          keyword: options.keyword || '',
        },
      })
      if (data && data.ok && data.data && Array.isArray(data.data.items)) {
        reportLogs.value = data.data.items
        reportLogPagination.value = {
          page: Number(data.data.page) || 1,
          pageSize: Number(data.data.pageSize) || pageSize,
          total: Number(data.data.total) || 0,
          totalPages: Math.max(1, Number(data.data.totalPages) || 1),
        }
        return reportLogPagination.value
      }
      reportLogs.value = []
      reportLogPagination.value = { page: 1, pageSize: Number(pageSize) || 3, total: 0, totalPages: 1 }
      return reportLogPagination.value
    }
    catch (e) {
      console.error('获取经营汇报历史失败:', e)
      reportLogs.value = []
      reportLogPagination.value = { page: 1, pageSize: 3, total: 0, totalPages: 1 }
      return reportLogPagination.value
    }
  }

  async function fetchReportLogStats(accountId: string, options: { mode?: string, status?: string, sortOrder?: string, keyword?: string } = {}) {
    if (!accountId) {
      reportLogStats.value = createDefaultReportLogStats()
      return reportLogStats.value
    }
    try {
      const { data } = await api.get('/api/reports/history/stats', {
        headers: { 'x-account-id': accountId },
        params: {
          mode: options.mode || '',
          status: options.status || '',
          sortOrder: options.sortOrder || 'desc',
          keyword: options.keyword || '',
        },
      })
      if (data && data.ok && data.data) {
        reportLogStats.value = {
          total: Number(data.data.total) || 0,
          successCount: Number(data.data.successCount) || 0,
          failedCount: Number(data.data.failedCount) || 0,
          testCount: Number(data.data.testCount) || 0,
          hourlyCount: Number(data.data.hourlyCount) || 0,
          dailyCount: Number(data.data.dailyCount) || 0,
        }
        return reportLogStats.value
      }
      reportLogStats.value = createDefaultReportLogStats()
      return reportLogStats.value
    }
    catch (e) {
      console.error('获取经营汇报统计失败:', e)
      reportLogStats.value = createDefaultReportLogStats()
      return reportLogStats.value
    }
  }

  async function clearReportLogs(accountId: string) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    try {
      const { data } = await api.delete('/api/reports/history', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok) {
        reportLogs.value = []
        reportLogPagination.value = { page: 1, pageSize: reportLogPagination.value.pageSize || 3, total: 0, totalPages: 1 }
        reportLogStats.value = createDefaultReportLogStats()
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '清空失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '清空失败') }
    }
  }

  async function deleteReportLogsByIds(accountId: string, ids: number[]) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0)))
    if (normalizedIds.length === 0)
      return { ok: false, error: '未选择任何记录' }
    try {
      const { data } = await api.delete('/api/reports/history/items', {
        headers: { 'x-account-id': accountId },
        data: { ids: normalizedIds },
      })
      if (data && data.ok)
        return { ok: true, data: data.data }
      return { ok: false, error: resolveLocalizedError(data?.error, '删除失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '删除失败') }
    }
  }

  async function exportReportLogs(accountId: string, options: { mode?: string, status?: string, sortOrder?: string, keyword?: string } = {}) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    try {
      const response = await api.get('/api/reports/history/export', {
        headers: { 'x-account-id': accountId },
        params: {
          mode: options.mode || '',
          status: options.status || '',
          sortOrder: options.sortOrder || 'desc',
          keyword: options.keyword || '',
        },
        responseType: 'blob',
      })
      const disposition = String(response.headers['content-disposition'] || '')
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      return {
        ok: true,
        blob: response.data,
        filename: filenameMatch ? filenameMatch[1] : 'report-history.csv',
        count: Number(response.headers['x-export-count']) || 0,
        total: Number(response.headers['x-export-total']) || 0,
        truncated: String(response.headers['x-export-truncated'] || '0') === '1',
      }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '导出失败') }
    }
  }

  /**
   * 修改当前登录用户的密码（自动隔离，基于 token 识别用户）
   */
  async function changePassword(oldPassword: string, newPassword: string) {
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 passwordSaving 控制按钮加载态
    try {
      const res = await api.post('/api/auth/change-password', { oldPassword, newPassword })
      return res.data
    }
    catch (e: any) {
      // axios 对 4xx/5xx 状态码会抛异常，需要从 response.data 中提取后端错误信息
      const backendError = e.response?.data?.error
      return { ok: false, error: resolveLocalizedError(backendError, e.message, '密码修改失败') }
    }
  }

  async function fetchTrialCardConfig() {
    try {
      const { data } = await api.get('/api/trial-card-config')
      if (data && data.ok && data.data) {
        settings.value.trialConfig = data.data
      }
      return data?.data
    }
    catch (e) {
      console.error('获取体验卡配置失败:', e)
    }
  }

  async function fetchThirdPartyApiConfig() {
    try {
      const { data } = await api.get('/api/admin/third-party-api')
      if (data && data.ok && data.data) {
        settings.value.thirdPartyApi = data.data
      }
      return data?.data
    }
    catch (e) {
      console.error('获取第三方 API 配置失败:', e)
    }
  }

  async function saveThirdPartyApiConfig(config: ThirdPartyApiConfig) {
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 thirdPartyApiSaving 控制按钮加载态
    try {
      const { data } = await api.post('/api/admin/third-party-api', config)
      if (data && data.ok) {
        settings.value.thirdPartyApi = config
        return { ok: true }
      }
      return { ok: false, error: '保存失败' }
    }
    finally {
      // loading 未在此处修改，无需 finally 中重置
    }
  }

  async function fetchTimingConfig() {
    timingLoading.value = true
    try {
      const { data } = await api.get('/api/settings/timing-config')
      if (data && data.ok && data.data) {
        settings.value.timingConfig = {
          ...settings.value.timingConfig,
          ...(data.data.config || {}),
        }
        settings.value.defaultTimingConfig = {
          ...settings.value.defaultTimingConfig,
          ...(data.data.defaults || {}),
        }
        settings.value.readonlyTimingParams = data.data.readonlyParams || []
        return data.data
      }
    }
    catch (e) {
      console.error('获取时间参数配置失败:', e)
    }
    finally {
      timingLoading.value = false
    }
  }

  async function saveTimingConfig(config: TimingConfig) {
    try {
      const { data } = await api.post('/api/settings/timing-config', config)
      if (data && data.ok) {
        settings.value.timingConfig = data.data
        return { ok: true }
      }
      return { ok: false, error: data?.error || '保存失败' }
    }
    catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async function fetchClusterConfig() {
    try {
      const u = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (u?.role !== 'admin')
        return

      const { data } = await api.get('/api/admin/cluster-config')
      if (data && data.ok && data.data) {
        settings.value.clusterConfig = data.data
      }
      return data?.data
    }
    catch (e) {
      console.error('获取集群调度配置失败:', e)
    }
  }

  async function saveClusterConfig(config: ClusterConfig) {
    try {
      const { data } = await api.post('/api/admin/cluster-config', config)
      if (data && data.ok) {
        settings.value.clusterConfig = config
        return { ok: true }
      }
      return { ok: false, error: '保存失败' }
    }
    catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async function fetchSystemUpdateOverview() {
    try {
      const u = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (u?.role !== 'admin')
        return null

      const { data } = await api.get('/api/admin/system-update/overview')
      if (data && data.ok && data.data) {
        systemUpdateOverview.value = data.data
      }
      return data?.data || null
    }
    catch (e) {
      console.error('获取系统更新概览失败:', e)
      return null
    }
  }

  async function checkSystemUpdate() {
    try {
      const { data } = await api.post('/api/admin/system-update/check')
      if (data && data.ok && data.data) {
        systemUpdateOverview.value = data.data
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '检查更新失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '检查更新失败') }
    }
  }

  async function saveSystemUpdateConfig(config: SystemUpdateConfig) {
    try {
      const { data } = await api.post('/api/admin/system-update/config', config)
      if (data && data.ok && data.data) {
        if (systemUpdateOverview.value) {
          systemUpdateOverview.value = {
            ...systemUpdateOverview.value,
            config: data.data,
          }
        }
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '保存失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '保存失败') }
    }
  }

  async function fetchSystemUpdateJobs(limit = 10) {
    try {
      const { data } = await api.get('/api/admin/system-update/jobs', {
        params: { limit },
      })
      if (data && data.ok && Array.isArray(data.data)) {
        systemUpdateJobs.value = data.data
      }
      return Array.isArray(data?.data) ? data.data : []
    }
    catch (e) {
      console.error('获取系统更新任务失败:', e)
      systemUpdateJobs.value = []
      return []
    }
  }

  function mergeSystemUpdateMutation(data: any) {
    if (!data)
      return

    const incomingJobs = Array.isArray(data.jobs)
      ? data.jobs
      : (data.job ? [data.job] : [])
    if (incomingJobs.length > 0) {
      const incomingIds = new Set(incomingJobs.map((item: SystemUpdateJob) => item.id))
      systemUpdateJobs.value = [...incomingJobs, ...systemUpdateJobs.value.filter(item => !incomingIds.has(item.id))]
    }

    if (systemUpdateOverview.value && data.runtime) {
      systemUpdateOverview.value = {
        ...systemUpdateOverview.value,
        activeJob: data.activeJob !== undefined
          ? data.activeJob
          : (data.job !== undefined ? data.job : systemUpdateOverview.value.activeJob),
        activeBatch: data.activeBatch !== undefined
          ? data.activeBatch
          : (data.batch !== undefined ? data.batch : systemUpdateOverview.value.activeBatch),
        runtime: data.runtime,
      }
    }
  }

  async function createSystemUpdateJob(payload: Record<string, any>) {
    try {
      const { data } = await api.post('/api/admin/system-update/jobs', payload)
      if (data && data.ok && data.data) {
        mergeSystemUpdateMutation(data.data)
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '创建更新任务失败'), data: data?.data || null }
    }
    catch (e: any) {
      return {
        ok: false,
        error: resolveLocalizedError(e.response?.data?.error, e.message, '创建更新任务失败'),
        data: e.response?.data?.data || null,
      }
    }
  }

  async function retrySystemUpdateJob(jobId: number | string, payload: Record<string, any> = {}) {
    try {
      const { data } = await api.post(`/api/admin/system-update/jobs/${encodeURIComponent(String(jobId))}/retry`, payload)
      if (data && data.ok && data.data) {
        mergeSystemUpdateMutation(data.data)
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '重试更新任务失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '重试更新任务失败') }
    }
  }

  async function retrySystemUpdateBatch(batchKey: string, payload: Record<string, any> = {}) {
    try {
      const { data } = await api.post(`/api/admin/system-update/batches/${encodeURIComponent(batchKey)}/retry-failed`, payload)
      if (data && data.ok && data.data) {
        mergeSystemUpdateMutation(data.data)
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '重试更新批次失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '重试更新批次失败') }
    }
  }

  async function cancelSystemUpdateJob(jobId: number | string, payload: Record<string, any> = {}) {
    try {
      const { data } = await api.post(`/api/admin/system-update/jobs/${encodeURIComponent(String(jobId))}/cancel`, payload)
      if (data && data.ok && data.data) {
        mergeSystemUpdateMutation(data.data)
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '取消更新任务失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '取消更新任务失败') }
    }
  }

  async function cancelSystemUpdateBatch(batchKey: string, payload: Record<string, any> = {}) {
    try {
      const { data } = await api.post(`/api/admin/system-update/batches/${encodeURIComponent(batchKey)}/cancel-pending`, payload)
      if (data && data.ok && data.data) {
        mergeSystemUpdateMutation(data.data)
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '取消更新批次失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '取消更新批次失败') }
    }
  }

  async function setSystemUpdateNodeDrain(nodeId: string, draining: boolean) {
    try {
      const { data } = await api.post(`/api/admin/system-update/nodes/${encodeURIComponent(nodeId)}/drain`, {
        draining,
      })
      if (data && data.ok && data.data) {
        if (systemUpdateOverview.value && data.data.runtime) {
          systemUpdateOverview.value = {
            ...systemUpdateOverview.value,
            runtime: data.data.runtime,
          }
        }
        return { ok: true, data: data.data }
      }
      return { ok: false, error: resolveLocalizedError(data?.error, '更新节点排空状态失败') }
    }
    catch (e: any) {
      return { ok: false, error: resolveLocalizedError(e.response?.data?.error, e.message, '更新节点排空状态失败') }
    }
  }

  return { settings, loading, timingLoading, reportLogs, reportLogPagination, reportLogStats, systemUpdateOverview, systemUpdateJobs, fetchSettings, fetchReportLogs, fetchReportLogStats, clearReportLogs, deleteReportLogsByIds, exportReportLogs, saveSettings, saveOfflineConfig, fetchBugReportConfig, saveBugReportConfig, sendBugReportTest, sendReportTest, sendReport, changePassword, fetchTrialCardConfig, fetchThirdPartyApiConfig, saveThirdPartyApiConfig, fetchTimingConfig, saveTimingConfig, fetchClusterConfig, saveClusterConfig, fetchSystemUpdateOverview, checkSystemUpdate, saveSystemUpdateConfig, fetchSystemUpdateJobs, createSystemUpdateJob, retrySystemUpdateJob, retrySystemUpdateBatch, cancelSystemUpdateJob, cancelSystemUpdateBatch, setSystemUpdateNodeDrain }
})
