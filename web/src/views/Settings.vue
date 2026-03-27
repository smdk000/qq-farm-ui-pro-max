/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import type { LoginBackgroundPreset } from '@/constants/ui-appearance'
import type { BugReportConfig, ReportLogEntry, SystemUpdateAnnouncementPreview, SystemUpdateBatchSummary, SystemUpdateClusterNode, SystemUpdateConfig, SystemUpdateDrainCutoverBlocker, SystemUpdateDrainCutoverReadiness, SystemUpdateJob, SystemUpdateJobDetail, SystemUpdateOverview, SystemUpdatePreflight, SystemUpdateRuntimeAgent, SystemUpdateSmokeSummary } from '@/stores/setting'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api' // Apply config from server if possible
import ConfirmModal from '@/components/ConfirmModal.vue'
import ContextHelpButton from '@/components/help/ContextHelpButton.vue'
import SystemUpdateBatchDetail from '@/components/settings/SystemUpdateBatchDetail.vue'
import SystemUpdateJobDetailPanel from '@/components/settings/SystemUpdateJobDetailPanel.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import BaseTooltip from '@/components/ui/BaseTooltip.vue'
import { useCopyInteraction } from '@/composables/use-copy-interaction'
import { useViewPreferenceSync } from '@/composables/use-view-preference-sync'
import { getThemeAppearanceConfig, getThemeBackgroundPreset, getThemeOption, getThemeWorkspaceVisualPreset, getWorkspaceAppearanceConfig, getWorkspaceVisualPreset, LOGIN_BACKGROUND_PRESETS, THEME_OPTIONS, UI_BACKGROUND_SCOPE_OPTIONS, UI_WORKSPACE_VISUAL_PRESETS } from '@/constants/ui-appearance'
import { createHelpAnchorId } from '@/data/help-articles'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useFarmStore } from '@/stores/farm'
import { useFriendStore } from '@/stores/friend'
import { useSettingStore } from '@/stores/setting'
import { useToastStore } from '@/stores/toast'
import { createDefaultTradeConfig, normalizeTradeConfig, normalizeTradeKeepFruitIds } from '@/utils/trade-config'
import { DEFAULT_REPORT_HISTORY_VIEW_STATE, normalizeReportHistoryViewState } from '@/utils/view-preferences'

const REPORT_HISTORY_VIEW_STORAGE_KEY = 'qq-farm-bot:report-history-view:v1'
const REPORT_HISTORY_BROWSER_PREF_NOTE = '这里的筛选类型、筛选结果、关键字和排序方式会跟随当前登录用户同步到服务器；列表固定每页 3 条，超过后自动翻页。汇报记录本身仍来自数据库。'
const QQ_HIGH_RISK_CONFIRM_PHRASE = '我已知晓风险'
const QQ_HIGH_RISK_AUTO_DISABLE_SEEN_KEY_PREFIX = 'qq-farm-bot:qq-high-risk-auto-disable-seen:'
const SETTINGS_CATEGORY_QUERY_KEY = 'category'
const ADVANCED_SECTION_QUERY_KEY = 'advancedSection'
const UPDATE_TAB_QUERY_KEY = 'updateTab'

interface WebAssetsHealthSnapshot {
  activeDir: string
  activeSource: string
  selectionReason: string
  selectionReasonLabel: string
  buildTargetDir: string
  buildTargetSource: string
  defaultDir: string
  defaultHasAssets: boolean
  defaultWritable: boolean
  fallbackDir: string
  fallbackHasAssets: boolean
  fallbackWritable: boolean
}

interface SystemSettingsHealthSnapshot {
  ok: boolean
  checkedAt: number
  missingRequiredKeys: string[]
  fallbackWouldActivateKeys: string[]
  webAssets?: WebAssetsHealthSnapshot | null
}

interface SessionStatusSnapshot {
  authenticated: boolean
  username: string
  role: string
  accessIssuedAt: number
  accessExpiresAt: number
  accessRemainingSec: number
  refreshIssuedAt: number
  refreshExpiresAt: number
  refreshRemainingSec: number
  needsRefreshSoon: boolean
  checkedAt: number
}

interface ServiceProfileSnapshot {
  profile: string
  defaultProfile?: string
  webPanelEnabled: boolean
  apiEnabled: boolean
  runtimeEnabled: boolean
  autoStartAccounts: boolean
  source?: string
  checkedAt: number
}

interface OpenApiConfigSnapshot {
  enabled: boolean
  title: string
  version: string
  serverBaseUrl: string
  exposeExternalApiOnly: boolean
  includeAdminReadOnlyRoutes: boolean
}

interface HealthProbeConfigSnapshot {
  dependencyTimeoutMs: number
  runtimeWorkerOfflineThresholdSec: number
  warnReloginQueueCount: number
  warnFailedAccountCount: number
  includeAiService: boolean
}

interface ServiceProfileConfigSnapshot {
  defaultProfile: 'full' | 'headless-api' | 'headless-runtime'
  allowAutoStartAccountsInHeadlessApi: boolean
}

interface ProxyPoolConfigSnapshot {
  enabled: boolean
  healthCheckTimeoutMs: number
  healthCheckBatchSize: number
  defaultMaxUsersPerProxy: number
  cooldownMs: number
  selectionStrategy: 'round_robin' | 'least_load' | 'healthy_first'
  autoAssignEnabled: boolean
}

interface PlatformCapabilitiesSnapshot {
  openapiConfig: OpenApiConfigSnapshot
  healthProbeConfig: HealthProbeConfigSnapshot
  serviceProfileConfig: ServiceProfileConfigSnapshot
  proxyPoolConfig: ProxyPoolConfigSnapshot
}

interface HealthDependenciesSnapshot {
  ok: boolean
  checkedAt: number
  config?: Record<string, any>
  dependencies?: Record<string, any>
}

interface HealthRuntimeSnapshot {
  ok: boolean
  checkedAt: number
  accounts?: {
    total: number
    running: number
    reloginRequired: number
    banned: number
  }
  schedulers?: {
    schedulerCount?: number
  }
  warning?: string
}

interface ExternalApiClientSnapshot {
  id: string
  name: string
  status: string
  scopes: string[]
  allowedPaths: string[]
  allowedAccountIds: string[]
  expiresAt: number
  lastUsedAt: number
  createdAt: number
  createdBy: string
  updatedAt: number
  note: string
}

interface ProxyRecordSnapshot {
  id: string
  maskedProxyUrl: string
  protocol: string
  host: string
  port: number
  note: string
  status: string
  maxUsers: number
  successCount: number
  failCount: number
  avgLatencyMs: number
  lastCheckedAt: number
  cooldownUntil: number
}

interface StatsSummarySnapshot {
  checkedAt: number
  accounts?: {
    total: number
    reloginRequired: number
    banned: number
  }
  buckets?: Record<string, {
    label?: string
    exp?: number
    gold?: number
    steal?: number
    help?: number
  }>
  history?: Array<{
    date: string
    exp: number
    gold: number
    steal: number
    help: number
  }>
}

interface QqFriendDiagnosticsCachePreviewItem {
  gid?: number | string
  name?: string
  uin?: string
}

interface QqFriendDiagnosticsCacheEntry {
  key: string
  count: number
  preview: QqFriendDiagnosticsCachePreviewItem[]
}

interface QqFriendDiagnosticsSnapshot {
  file: string
  fileName: string
  appid: string
  createdAt: string
  qqVersion: string
  miniProject: {
    appid: string
    projectname: string
    openDataContext: boolean
  }
  authBridge: {
    authoritySynchronized: boolean | null
    shareFriendshipScope: number | null
    getAuthStatusSeen: boolean
    setAuthStatusSeen: boolean
  }
  hostFriendProtocol: {
    reqCount: number
    rspCount: number
    latestRequest: {
      selfUid: string
      startIndex: number
      socialStyle: number
      socialSwitch: number
      hasLocal: number
    } | null
    latestResponse: {
      onlineInfoCount: number
    } | null
  }
  summary: {
    protocolLikely: string
    latestOnlineInfoCount: number
    cacheAccountCount: number
    cacheFriendCount: number
  }
  redisCaches: QqFriendDiagnosticsCacheEntry[]
  source?: {
    path: string
    name: string
    size: number
    modifiedAt: string
  } | null
  availableFiles?: Array<{
    name: string
    appid: string
    size: number
    modifiedAt: string
  }>
}

interface SystemUpdateRemoteReadinessItem {
  key: string
  label: string
  tone: 'success' | 'warning' | 'danger'
  stateLabel: string
  summary: string
  detail: string
}

const QQ_FRIEND_DIAGNOSTICS_APPID = '1112386029'
const SYSTEM_UPDATE_AGENT_OFFLINE_THRESHOLD_MS = 120 * 1000
const SYSTEM_UPDATE_SMOKE_STALE_MS = 3 * 24 * 60 * 60 * 1000
const SYSTEM_UPDATE_REPAIR_DEPLOY_COMMAND = [
  'cd /opt/qq-farm-current',
  'bash repair-deploy.sh --backup',
].join('\n')
const SYSTEM_UPDATE_INSTALL_AGENT_COMMAND = [
  'cd /opt/qq-farm-current',
  'bash install-update-agent-service.sh',
  'systemctl status qq-farm-update-agent',
].join('\n')
const SYSTEM_UPDATE_SMOKE_COMMAND = [
  'cd /opt/qq-farm-current',
  'bash smoke-system-update-center.sh \\',
  '  --username admin \\',
  "  --password '你的管理员密码' \\",
  '  --deploy-dir /opt/qq-farm-current',
].join('\n')

function loadReportHistoryViewPreferences(): typeof DEFAULT_REPORT_HISTORY_VIEW_STATE {
  const fallback = DEFAULT_REPORT_HISTORY_VIEW_STATE
  const modeOptions = ['all', 'test', 'hourly', 'daily'] as const
  const statusOptions = ['all', 'success', 'failed'] as const
  const sortOrderOptions = ['asc', 'desc'] as const
  const pageSizeOptions = [3] as const
  try {
    const raw = localStorage.getItem(REPORT_HISTORY_VIEW_STORAGE_KEY)
    if (!raw)
      return { ...fallback }
    const parsed = JSON.parse(raw)
    const mode = modeOptions.includes(parsed?.mode)
      ? parsed.mode as typeof modeOptions[number]
      : fallback.mode
    const status = statusOptions.includes(parsed?.status)
      ? parsed.status as typeof statusOptions[number]
      : fallback.status
    const sortOrder = sortOrderOptions.includes(parsed?.sortOrder)
      ? parsed.sortOrder as typeof sortOrderOptions[number]
      : fallback.sortOrder
    const pageSizeValue = Number(parsed?.pageSize)
    const pageSize = pageSizeOptions.includes(pageSizeValue as typeof pageSizeOptions[number])
      ? pageSizeValue as typeof pageSizeOptions[number]
      : fallback.pageSize
    const keyword = String(parsed?.keyword || '').slice(0, 100)
    return { mode, status, keyword, sortOrder, pageSize }
  }
  catch {
    return { ...fallback }
  }
}

const settingStore = useSettingStore()
const appStore = useAppStore()
appStore.fetchUIConfig()
const accountStore = useAccountStore()
const farmStore = useFarmStore()
const friendStore = useFriendStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()
const { copiedControlKey, copyText: copyWithFeedback } = useCopyInteraction({
  successTitle: '运维命令已复制',
  failureMessage: '复制失败，请手动复制命令',
})
const reportHistoryViewPrefs = loadReportHistoryViewPreferences()

const { settings, loading, reportLogs, reportLogPagination, reportLogStats, systemUpdateOverview, systemUpdateJobs } = storeToRefs(settingStore)
const { currentAccountId, accounts } = storeToRefs(accountStore)
const { seeds, bagSeeds } = storeToRefs(farmStore)
const { friends } = storeToRefs(friendStore)

const saving = ref(false)
const passwordSaving = ref(false)
const offlineSaving = ref(false)
const bugReportSaving = ref(false)
const bugReportTesting = ref(false)
const trialSaving = ref(false)
const timingSaving = ref(false)
const reportTesting = ref(false)
const reportSendingMode = ref<'hourly' | 'daily' | ''>('')
const systemUpdateRefreshing = ref(false)
const reportHistoryLoading = ref(false)
const reportHistoryClearing = ref(false)
const reportHistoryExporting = ref(false)
const reportHistoryBatchDeleting = ref(false)
const reportHistoryDeletingIds = ref<number[]>([])
const expandedReportLogIds = ref<number[]>([])
const selectedReportLogIds = ref<number[]>([])
const reportDetailVisible = ref(false)
const reportDetailItem = ref<ReportLogEntry | null>(null)
const reportFilters = ref({
  mode: reportHistoryViewPrefs.mode,
  status: reportHistoryViewPrefs.status,
})
const reportKeyword = ref(reportHistoryViewPrefs.keyword)
const reportSortOrder = ref<'desc' | 'asc'>(reportHistoryViewPrefs.sortOrder)
const reportPageSize = ref<typeof DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize>(
  reportHistoryViewPrefs.pageSize as typeof DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize,
)

function buildReportHistoryViewState() {
  return normalizeReportHistoryViewState({
    mode: reportFilters.value.mode,
    status: reportFilters.value.status,
    keyword: reportKeyword.value,
    sortOrder: reportSortOrder.value,
    pageSize: reportPageSize.value as typeof DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize,
  }, DEFAULT_REPORT_HISTORY_VIEW_STATE)
}

function normalizeReportHistoryPageSize(value: number | undefined): typeof DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize {
  return normalizeReportHistoryViewState(
    { pageSize: value as typeof DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize | undefined },
    buildReportHistoryViewState(),
  ).pageSize
}

const {
  hydrating: reportHistoryViewHydrating,
  hydrate: hydrateReportHistoryViewState,
  enableSync: enableReportHistoryViewSync,
} = useViewPreferenceSync({
  key: 'reportHistoryViewState',
  label: '经营汇报历史视图偏好',
  buildState: buildReportHistoryViewState,
  applyState: applyReportHistoryViewState,
  defaultState: DEFAULT_REPORT_HISTORY_VIEW_STATE,
})

function applyReportHistoryViewState(state: Partial<typeof DEFAULT_REPORT_HISTORY_VIEW_STATE> | null | undefined) {
  const normalized = normalizeReportHistoryViewState(state, DEFAULT_REPORT_HISTORY_VIEW_STATE)
  reportHistoryViewHydrating.value = true
  reportFilters.value = {
    mode: normalized.mode,
    status: normalized.status,
  }
  reportKeyword.value = normalized.keyword
  reportSortOrder.value = normalized.sortOrder
  reportPageSize.value = normalized.pageSize
  reportHistoryViewHydrating.value = false
}

const reportHistoryStatsCards = computed(() => [
  {
    key: 'total',
    label: '当前结果总数',
    value: reportLogStats.value.total,
    tone: 'settings-report-card-tone-main',
    bg: 'settings-report-card-tone-surface',
    active: reportFilters.value.mode === 'all' && reportFilters.value.status === 'all',
  },
  {
    key: 'success',
    label: '成功',
    value: reportLogStats.value.successCount,
    tone: 'settings-report-card-tone-success',
    bg: 'settings-report-card-bg-success',
    active: reportFilters.value.status === 'success',
  },
  {
    key: 'failed',
    label: '失败',
    value: reportLogStats.value.failedCount,
    tone: 'settings-report-card-tone-danger',
    bg: 'settings-report-card-bg-danger',
    active: reportFilters.value.status === 'failed',
  },
  {
    key: 'test',
    label: '测试汇报',
    value: reportLogStats.value.testCount,
    tone: 'settings-report-card-tone-info',
    bg: 'settings-report-card-bg-info',
    active: reportFilters.value.mode === 'test',
  },
  {
    key: 'hourly',
    label: '小时汇报',
    value: reportLogStats.value.hourlyCount,
    tone: 'settings-report-card-tone-warning',
    bg: 'settings-report-card-bg-warning',
    active: reportFilters.value.mode === 'hourly',
  },
  {
    key: 'daily',
    label: '日报',
    value: reportLogStats.value.dailyCount,
    tone: 'settings-report-card-tone-accent',
    bg: 'settings-report-card-bg-accent',
    active: reportFilters.value.mode === 'daily',
  },
])

function collectShortIntervalRiskItems(payload: any = null) {
  const source = payload && typeof payload === 'object' ? payload : buildSettingsPayload()
  const intervals = source?.intervals && typeof source.intervals === 'object' ? source.intervals : {}
  const items: string[] = []
  const appendRisk = (value: any, label: string) => {
    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds < 60)
      items.push(`${label} ${seconds} 秒`)
  }

  appendRisk(intervals.friendMin, '好友巡查最小')
  appendRisk(intervals.friendMax, '好友巡查最大')
  appendRisk(intervals.helpMin, '帮忙最小')
  appendRisk(intervals.helpMax, '帮忙最大')
  appendRisk(intervals.stealMin, '偷菜最小')
  appendRisk(intervals.stealMax, '偷菜最大')

  return items
}

// === 危险频率拦截警告 ===
const farmIntervalHardBlockVisible = computed(() => {
  // eslint-disable-next-line ts/no-use-before-define
  if (!localSettings.value.intervals)
    return false
  // eslint-disable-next-line ts/no-use-before-define
  const { farmMin, farmMax } = localSettings.value.intervals
  return (
    (typeof farmMin === 'number' && farmMin < 15)
    || (typeof farmMax === 'number' && farmMax < 15)
  )
})

const timeWarningVisible = computed(() => collectShortIntervalRiskItems().length > 0)

// ============ 用户身份识别 ============
const isAdmin = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('current_user') || 'null')
    return u?.role === 'admin'
  }
  catch { return false }
})

// 当前登录用户名（用于密码修改等用户隔离场景）
const currentUsername = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('current_user') || 'null')
    return u?.username || ''
  }
  catch { return '' }
})

type SettingsPrimaryCategoryKey = 'common' | 'plant' | 'auto' | 'notice' | 'security' | 'advanced'
type AdvancedDetailSectionKey = 'health' | 'timing' | 'update' | 'cluster' | 'theme' | 'trial' | 'api'
type SystemUpdateDetailTabKey = 'overview' | 'jobs' | 'nodes'

const settingsPrimaryCategoryTabs: Array<{
  key: SettingsPrimaryCategoryKey
  label: string
  icon: string
  description: string
}> = [
  {
    key: 'common',
    label: '常用设置',
    icon: 'i-carbon-home',
    description: '聚合高频入口：当前账号策略、密码与通知、外观调优。',
  },
  {
    key: 'plant',
    label: '种植策略',
    icon: 'i-carbon-sprout',
    description: '专注种植参数：选种策略、库存规则、巡查节奏与收获延迟。',
  },
  {
    key: 'auto',
    label: '自动任务',
    icon: 'i-carbon-automation',
    description: '集中自动化开关：农场动作、好友互动、化肥策略与任务领取。',
  },
  {
    key: 'notice',
    label: '通知提醒',
    icon: 'i-carbon-notification',
    description: '管理下线提醒与经营汇报：渠道、文案、发送时段与历史记录。',
  },
  {
    key: 'security',
    label: '账号与安全',
    icon: 'i-carbon-user-avatar',
    description: '账号风险相关能力：密码管理、风控提示、关键接口与权限项。',
  },
  {
    key: 'advanced',
    label: '高级设置',
    icon: 'i-carbon-settings-adjust',
    description: '管理员高级面板：系统自检、时间参数、更新中心与集群能力。',
  },
]

const settingsPrimaryCategoryFallback = settingsPrimaryCategoryTabs[0]!
const advancedDetailSectionTabs: Array<{
  key: AdvancedDetailSectionKey
  label: string
  icon: string
  hint: string
}> = [
  {
    key: 'health',
    label: '系统体检',
    icon: 'i-carbon-data-check',
    hint: '查看 system_settings 自检、静态资源选路和好友协议诊断。',
  },
  {
    key: 'timing',
    label: '时间参数',
    icon: 'i-carbon-time',
    hint: '调整心跳、限流、调度器等系统级运行节奏。',
  },
  {
    key: 'update',
    label: '系统更新',
    icon: 'i-carbon-upgrade',
    hint: '独立管理版本检查、更新配置和任务执行记录。',
  },
  {
    key: 'cluster',
    label: '集群流控',
    icon: 'i-carbon-flow-stream',
    hint: '单独维护集群路由策略与分布式派发行为。',
  },
  {
    key: 'theme',
    label: '主题外观',
    icon: 'i-carbon-paint-brush',
    hint: '专注主题、背景、视觉预设等界面外观能力。',
  },
  {
    key: 'trial',
    label: '体验卡配置',
    icon: 'i-carbon-chemistry',
    hint: '独立维护体验卡时长、续费与频率控制参数。',
  },
  {
    key: 'api',
    label: '第三方 API',
    icon: 'i-carbon-api-1',
    hint: '集中管理扫码登录网关和外部接口授权参数。',
  },
]
const advancedDetailSectionFallback = advancedDetailSectionTabs[0]!
const systemUpdateDetailTabs: Array<{
  key: SystemUpdateDetailTabKey
  label: string
  icon: string
  hint: string
}> = [
  {
    key: 'overview',
    label: '总览配置',
    icon: 'i-carbon-chart-line-data',
    hint: '查看版本状态、更新预检与默认配置，并可创建更新任务。',
  },
  {
    key: 'jobs',
    label: '任务执行',
    icon: 'i-carbon-task',
    hint: '聚焦活跃任务、批次进度与历史任务重试操作。',
  },
  {
    key: 'nodes',
    label: '节点状态',
    icon: 'i-carbon-network-4',
    hint: '独立管理更新代理心跳与集群节点排空操作。',
  },
]
const systemUpdateDetailTabFallback = systemUpdateDetailTabs[0]!

const activeSettingsPrimaryCategory = ref<SettingsPrimaryCategoryKey>('common')
const activeAdvancedDetailSection = ref<AdvancedDetailSectionKey>('health')
const activeSystemUpdateDetailTab = ref<SystemUpdateDetailTabKey>('overview')
const noticeDetailExpanded = ref(false)
const securityDetailExpanded = ref(false)
const advancedDetailExpanded = ref(false)

const activeSettingsPrimaryCategoryMeta = computed(() => {
  return settingsPrimaryCategoryTabs.find(item => item.key === activeSettingsPrimaryCategory.value) || settingsPrimaryCategoryFallback
})

function normalizeSettingsCategoryQuery(value: unknown): SettingsPrimaryCategoryKey {
  const raw = String(Array.isArray(value) ? value[0] : value || '').trim()
  return settingsPrimaryCategoryTabs.some(item => item.key === raw)
    ? raw as SettingsPrimaryCategoryKey
    : 'common'
}

function normalizeAdvancedSectionQuery(value: unknown): AdvancedDetailSectionKey {
  const raw = String(Array.isArray(value) ? value[0] : value || '').trim()
  return advancedDetailSectionTabs.some(item => item.key === raw)
    ? raw as AdvancedDetailSectionKey
    : 'health'
}

function normalizeSystemUpdateTabQuery(value: unknown): SystemUpdateDetailTabKey {
  const raw = String(Array.isArray(value) ? value[0] : value || '').trim()
  return systemUpdateDetailTabs.some(item => item.key === raw)
    ? raw as SystemUpdateDetailTabKey
    : 'overview'
}

function resolveSettingsAnchorId(
  category = activeSettingsPrimaryCategory.value,
  advancedSection = activeAdvancedDetailSection.value,
  updateTab = activeSystemUpdateDetailTab.value,
  advancedExpanded?: boolean,
) {
  const expanded = advancedExpanded ?? advancedDetailExpanded.value
  if (category === 'advanced' && !expanded)
    return 'settings-category-advanced'
  if (category !== 'advanced')
    return `settings-category-${category}`
  if (advancedSection === 'update')
    return `settings-update-${updateTab}`
  return `settings-advanced-${advancedSection}`
}

async function scrollToSettingsAnchor(anchorId: string, behavior: ScrollBehavior = 'smooth') {
  if (!anchorId)
    return false

  await nextTick()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const target = document.getElementById(anchorId)
    if (target) {
      target.scrollIntoView({ behavior, block: 'start' })
      return true
    }
    await new Promise(resolve => window.requestAnimationFrame(() => resolve(undefined)))
  }

  return false
}

const settingsHelpArticleId = computed(() => {
  if (activeSettingsPrimaryCategory.value === 'advanced' && activeAdvancedDetailSection.value === 'update')
    return 'system-update-center'
  if (activeSettingsPrimaryCategory.value === 'plant' || activeSettingsPrimaryCategory.value === 'auto')
    return 'planting-and-automation'
  if (activeSettingsPrimaryCategory.value === 'notice')
    return 'notifications-and-reports'
  if (activeSettingsPrimaryCategory.value === 'security')
    return 'account-modes-and-risk'
  if (activeSettingsPrimaryCategory.value === 'advanced')
    return 'advanced-settings'
  return 'settings-overview'
})

const settingsHelpAudience = computed(() => {
  return activeSettingsPrimaryCategory.value === 'advanced' ? 'admin' : 'recommended'
})

const showSystemUpdateChecklistHelpEntry = computed(() => {
  return activeSettingsPrimaryCategory.value === 'advanced' && activeAdvancedDetailSection.value === 'update'
})

const systemUpdateChecklistHelpSectionId = computed(() => {
  return createHelpAnchorId('最短发布清单')
})

const systemUpdateUpdateRecoveryHelpSectionId = computed(() => {
  return createHelpAnchorId('标准更新')
})

const settingsHelpSectionId = computed(() => {
  if (activeSettingsPrimaryCategory.value === 'common')
    return createHelpAnchorId('常用设置')
  if (activeSettingsPrimaryCategory.value === 'plant')
    return createHelpAnchorId('种植策略')
  if (activeSettingsPrimaryCategory.value === 'auto')
    return createHelpAnchorId('自动任务')
  if (activeSettingsPrimaryCategory.value === 'notice')
    return createHelpAnchorId('下线提醒')
  if (activeSettingsPrimaryCategory.value === 'security')
    return createHelpAnchorId('QQ 高风险临时窗口')

  if (activeAdvancedDetailSection.value === 'health')
    return createHelpAnchorId('系统体检')
  if (activeAdvancedDetailSection.value === 'timing')
    return createHelpAnchorId('时间参数')
  if (activeAdvancedDetailSection.value === 'update') {
    if (activeSystemUpdateDetailTab.value === 'jobs')
      return createHelpAnchorId('任务执行')
    if (activeSystemUpdateDetailTab.value === 'nodes')
      return createHelpAnchorId('节点状态')
    return createHelpAnchorId('总览配置')
  }
  if (activeAdvancedDetailSection.value === 'cluster')
    return createHelpAnchorId('集群流控')
  if (activeAdvancedDetailSection.value === 'theme')
    return createHelpAnchorId('主题外观')
  if (activeAdvancedDetailSection.value === 'trial')
    return createHelpAnchorId('体验卡配置')
  return createHelpAnchorId('第三方 API')
})
const activeAdvancedDetailSectionMeta = computed(() => {
  return advancedDetailSectionTabs.find(item => item.key === activeAdvancedDetailSection.value) || advancedDetailSectionFallback
})
const activeSystemUpdateDetailTabMeta = computed(() => {
  return systemUpdateDetailTabs.find(item => item.key === activeSystemUpdateDetailTab.value) || systemUpdateDetailTabFallback
})

const showSettingsCategoryEmptyState = computed(() => {
  if (loading.value)
    return false
  return activeSettingsPrimaryCategory.value === 'advanced' && !isAdmin.value
})

const settingsCategoryEmptyHint = computed(() => {
  if (activeSettingsPrimaryCategory.value === 'advanced' && !isAdmin.value)
    return '当前账号不是管理员，无法查看高级设置。'
  return '当前分类暂无可显示内容。'
})

function switchSettingsPrimaryCategory(key: SettingsPrimaryCategoryKey) {
  activeSettingsPrimaryCategory.value = key
}

function isSettingsCategoryVisible(categories: SettingsPrimaryCategoryKey[]) {
  return categories.includes(activeSettingsPrimaryCategory.value)
}

const strategyCategoryGuideMap: Record<SettingsPrimaryCategoryKey, {
  title: string
  hint: string
  tags: string[]
}> = {
  common: {
    title: '常用设置视图',
    hint: '首屏仅保留 8 项高频快捷配置；详细参数请切换到对应分类继续完善。',
    tags: ['账号模式', '风控提示', '巡查区间', '静默时段'],
  },
  plant: {
    title: '种植策略视图',
    hint: '只展示种植、库存、巡查节奏和出售策略，避免被其他内容干扰。',
    tags: ['选种策略', '背包优先顺序', '库存保留规则', '巡查与静默时段'],
  },
  auto: {
    title: '自动任务视图',
    hint: '集中查看自动化开关和好友互动策略，便于一次性校准执行行为。',
    tags: ['自动控制总开关', '每日收益领取', '化肥策略', '社交互动'],
  },
  notice: {
    title: '通知提醒视图',
    hint: '当前策略卡片已隐藏。请在右侧配置下线提醒和经营汇报。',
    tags: ['下线提醒', '经营汇报'],
  },
  security: {
    title: '账号与安全视图',
    hint: '先看安全快捷项，再按需展开详细配置；先控风险再调收益。',
    tags: ['账号模式', '风控提示', '高风险区间', '静默时段'],
  },
  advanced: {
    title: '高级设置视图',
    hint: '优先使用快捷总览完成巡检；需要细调时再展开系统级详细配置。',
    tags: ['系统体检', '时间参数', '系统更新', '集群流控', '主题外观', '接入配置'],
  },
}

const strategyCategoryGuide = computed(() => {
  return strategyCategoryGuideMap[activeSettingsPrimaryCategory.value]
})

const isCommonSettingsCategory = computed(() => activeSettingsPrimaryCategory.value === 'common')
const isNoticeSettingsCategory = computed(() => activeSettingsPrimaryCategory.value === 'notice')
const isSecuritySettingsCategory = computed(() => activeSettingsPrimaryCategory.value === 'security')
const isAdvancedSettingsCategory = computed(() => activeSettingsPrimaryCategory.value === 'advanced')
const strategyPanelFullWidth = computed(() => isSettingsCategoryVisible(['plant', 'auto']))
const accountPanelFullWidth = computed(() => isSettingsCategoryVisible(['notice']))
const showNoticeQuickPanel = computed(() => isSettingsCategoryVisible(['common', 'notice']))
const noticeHasDetailPanels = computed(() => isAdmin.value || !!currentAccountId.value)
const securityCrossPanelsVisible = computed(() => !isSecuritySettingsCategory.value || securityDetailExpanded.value)
const advancedPanelsVisible = computed(() => !isAdvancedSettingsCategory.value || advancedDetailExpanded.value)

function switchAdvancedDetailSection(key: AdvancedDetailSectionKey) {
  activeAdvancedDetailSection.value = key
}

function isAdvancedDetailSectionVisible(sections: AdvancedDetailSectionKey[]) {
  if (!isAdvancedSettingsCategory.value)
    return true
  return sections.includes(activeAdvancedDetailSection.value)
}

function switchSystemUpdateDetailTab(key: SystemUpdateDetailTabKey) {
  activeSystemUpdateDetailTab.value = key
}

function isSystemUpdateDetailTabVisible(tabs: SystemUpdateDetailTabKey[]) {
  return tabs.includes(activeSystemUpdateDetailTab.value)
}

let applyingSettingsRouteState = false

function syncSettingsRouteState() {
  const nextAdvancedSection = activeSettingsPrimaryCategory.value === 'advanced' && advancedDetailExpanded.value
    ? activeAdvancedDetailSection.value
    : ''
  const nextUpdateTab = activeSettingsPrimaryCategory.value === 'advanced' && advancedDetailExpanded.value && activeAdvancedDetailSection.value === 'update'
    ? activeSystemUpdateDetailTab.value
    : ''
  const nextQuery = {
    ...route.query,
    [SETTINGS_CATEGORY_QUERY_KEY]: activeSettingsPrimaryCategory.value,
    [ADVANCED_SECTION_QUERY_KEY]: nextAdvancedSection || undefined,
    [UPDATE_TAB_QUERY_KEY]: nextUpdateTab || undefined,
  }
  const nextHash = `#${resolveSettingsAnchorId()}`
  const currentCategory = normalizeSettingsCategoryQuery(route.query[SETTINGS_CATEGORY_QUERY_KEY])
  const currentAdvancedSection = String(Array.isArray(route.query[ADVANCED_SECTION_QUERY_KEY])
    ? route.query[ADVANCED_SECTION_QUERY_KEY][0]
    : route.query[ADVANCED_SECTION_QUERY_KEY] || '').trim()
  const currentUpdateTab = String(Array.isArray(route.query[UPDATE_TAB_QUERY_KEY])
    ? route.query[UPDATE_TAB_QUERY_KEY][0]
    : route.query[UPDATE_TAB_QUERY_KEY] || '').trim()

  if (
    currentCategory === activeSettingsPrimaryCategory.value
    && currentAdvancedSection === nextAdvancedSection
    && currentUpdateTab === nextUpdateTab
    && route.hash === nextHash
  ) {
    return
  }

  void router.replace({
    query: nextQuery,
    hash: nextHash,
  })
}

async function applySettingsRouteState() {
  const nextCategory = normalizeSettingsCategoryQuery(route.query[SETTINGS_CATEGORY_QUERY_KEY])
  const nextAdvancedSection = normalizeAdvancedSectionQuery(route.query[ADVANCED_SECTION_QUERY_KEY])
  const nextUpdateTab = normalizeSystemUpdateTabQuery(route.query[UPDATE_TAB_QUERY_KEY])
  const anchorId = String(route.hash || '').replace(/^#/, '').trim()

  applyingSettingsRouteState = true
  activeSettingsPrimaryCategory.value = nextCategory
  if (nextCategory === 'advanced') {
    activeAdvancedDetailSection.value = nextAdvancedSection
    activeSystemUpdateDetailTab.value = nextAdvancedSection === 'update' ? nextUpdateTab : 'overview'
    if (route.query[ADVANCED_SECTION_QUERY_KEY] || anchorId.startsWith('settings-advanced-') || anchorId.startsWith('settings-update-'))
      advancedDetailExpanded.value = true
  }
  else {
    activeAdvancedDetailSection.value = 'health'
    activeSystemUpdateDetailTab.value = 'overview'
  }
  await nextTick()
  applyingSettingsRouteState = false

  void scrollToSettingsAnchor(anchorId || resolveSettingsAnchorId(nextCategory, nextAdvancedSection, nextUpdateTab), 'auto')
}

watch(activeSettingsPrimaryCategory, () => {
  if (applyingSettingsRouteState)
    return
  noticeDetailExpanded.value = false
  securityDetailExpanded.value = false
  advancedDetailExpanded.value = false
  activeAdvancedDetailSection.value = 'health'
  activeSystemUpdateDetailTab.value = 'overview'
})

watch(
  () => [
    route.query[SETTINGS_CATEGORY_QUERY_KEY],
    route.query[ADVANCED_SECTION_QUERY_KEY],
    route.query[UPDATE_TAB_QUERY_KEY],
    route.hash,
  ],
  () => {
    void applySettingsRouteState()
  },
  { immediate: true },
)

watch(
  () => [
    activeSettingsPrimaryCategory.value,
    activeAdvancedDetailSection.value,
    activeSystemUpdateDetailTab.value,
    advancedDetailExpanded.value,
  ],
  () => {
    if (applyingSettingsRouteState)
      return
    syncSettingsRouteState()
  },
)

const trialConfig = ref({
  enabled: true,
  days: 1,
  dailyLimit: 50,
  cooldownMs: 14400000,
  adminRenewEnabled: true,
  userRenewEnabled: false,
  maxAccounts: 1,
})

const clusterConfig = ref({
  dispatcherStrategy: 'round_robin',
})
const clusterSaving = ref(false)

const clusterStrategyOptions = [
  { label: '轮询洗牌 (Round Robin)', value: 'round_robin' },
  { label: '最小负荷与粘性推流 (Least Load)', value: 'least_load' },
]

const trialDaysOptions = [
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '永久', value: 0 },
]

const thirdPartyApiConfig = ref({
  wxApiKey: '',
  wxApiUrl: '',
  wxAppId: '',
  ipad860Url: '',
  aineisheKey: '',
})
const thirdPartyApiSaving = ref(false)
const externalApiClients = ref<ExternalApiClientSnapshot[]>([])
const externalApiClientsLoading = ref(false)
const externalApiMutatingKey = ref('')
const externalApiCreateDraft = ref({
  name: '默认只读客户端',
  note: '',
  allowedAccountIdsText: '',
  expiresAt: '',
})
const externalApiLastPlainToken = ref('')
const proxyPoolRecords = ref<ProxyRecordSnapshot[]>([])
const proxyPoolLoading = ref(false)
const proxyPoolMutatingKey = ref('')
const proxyPoolCreateDraft = ref({
  proxyUrl: '',
  maxUsers: 10,
  note: '',
})
const proxyPoolImportDraft = ref({
  text: '',
  mode: 'append',
})
const redpacketModeOptions = [
  { label: '定时巡检', value: 'daily' },
  { label: '事件触发补查', value: 'notify' },
  { label: '混合模式', value: 'hybrid' },
]
const proxyImportModeOptions = [
  { label: '追加导入', value: 'append' },
  { label: '跳过重复', value: 'dedupe' },
]
const serviceProfileDefaultOptions = [
  { label: 'Full：面板 + API + 运行时', value: 'full' },
  { label: 'Headless API：仅停运行时', value: 'headless-api' },
  { label: 'Headless Runtime：仅保留运行时', value: 'headless-runtime' },
]
const proxySelectionStrategyOptions = [
  { label: '优先健康节点', value: 'healthy_first' },
  { label: '最小负载', value: 'least_load' },
  { label: '轮询分配', value: 'round_robin' },
]
const defaultPlatformCapabilities: PlatformCapabilitiesSnapshot = {
  openapiConfig: {
    enabled: true,
    title: 'QQ Farm Bot External API',
    version: '1.0.0',
    serverBaseUrl: '',
    exposeExternalApiOnly: true,
    includeAdminReadOnlyRoutes: true,
  },
  healthProbeConfig: {
    dependencyTimeoutMs: 2500,
    runtimeWorkerOfflineThresholdSec: 120,
    warnReloginQueueCount: 5,
    warnFailedAccountCount: 3,
    includeAiService: true,
  },
  serviceProfileConfig: {
    defaultProfile: 'full',
    allowAutoStartAccountsInHeadlessApi: false,
  },
  proxyPoolConfig: {
    enabled: true,
    healthCheckTimeoutMs: 6000,
    healthCheckBatchSize: 20,
    defaultMaxUsersPerProxy: 10,
    cooldownMs: 300000,
    selectionStrategy: 'healthy_first',
    autoAssignEnabled: false,
  },
}
const platformCapabilities = ref<PlatformCapabilitiesSnapshot>(JSON.parse(JSON.stringify(defaultPlatformCapabilities)))
const platformCapabilitiesLoading = ref(false)
const platformCapabilitiesSaving = ref(false)
const systemUpdateChecking = ref(false)
const systemUpdateAnnouncementSyncing = ref(false)
const systemUpdatePreflighting = ref(false)
const systemUpdateSaving = ref(false)
const systemUpdateLaunching = ref(false)
const systemUpdateNodeMutatingId = ref('')
const systemUpdateRetryingKey = ref('')
const systemUpdateCancellingKey = ref('')
const systemUpdateRollingBackKey = ref('')
const systemUpdateJobDetailLoading = ref(false)
const systemUpdateJobDetail = ref<SystemUpdateJobDetail | null>(null)
const systemUpdatePreflightSnapshot = ref<SystemUpdatePreflight | null>(null)
const systemHealthLoading = ref(false)
const systemHealthError = ref('')
const systemHealthSnapshot = ref<SystemSettingsHealthSnapshot | null>(null)
const dependencyHealthSnapshot = ref<HealthDependenciesSnapshot | null>(null)
const runtimeHealthSnapshot = ref<HealthRuntimeSnapshot | null>(null)
const serviceProfileSnapshot = ref<ServiceProfileSnapshot | null>(null)
const statsSummarySnapshot = ref<StatsSummarySnapshot | null>(null)
const extendedHealthLoading = ref(false)
const extendedHealthError = ref('')
const qqFriendDiagnosticsLoading = ref(false)
const qqFriendDiagnosticsError = ref('')
const qqFriendDiagnosticsSnapshot = ref<QqFriendDiagnosticsSnapshot | null>(null)
const systemUpdateConfig = ref<SystemUpdateConfig>({
  provider: 'github_release',
  manifestUrl: '',
  releaseApiUrl: '',
  githubOwner: '',
  githubRepo: '',
  channel: 'stable',
  allowPreRelease: false,
  preferredStrategy: 'rolling',
  preferredScope: 'app',
  requireDrain: false,
  agentMode: 'db_polling',
  agentPollIntervalSec: 15,
  defaultDrainNodeIds: [],
  maintenanceWindow: '',
  autoSyncAnnouncements: false,
  autoRunVerification: true,
  promptRollbackOnFailure: true,
  defaultLogTailLines: 80,
})
const systemUpdateDraft = ref({
  targetVersion: '',
  scope: 'app',
  strategy: 'rolling',
  preserveCurrent: false,
  requireDrain: false,
  syncAnnouncements: false,
  runVerification: true,
  allowAutoRollback: false,
  includeDeployTemplates: true,
  note: '',
  targetAgentIdsText: '',
  drainNodeIdsText: '',
})

const systemUpdateProviderOptions = [
  { label: 'GitHub Releases', value: 'github_release' },
  { label: 'Manifest URL', value: 'manifest_url' },
  { label: 'Custom Release API', value: 'release_api_url' },
]

const systemUpdateScopeOptions = [
  { label: '仅主程序', value: 'app' },
  { label: '单批 Worker', value: 'worker' },
  { label: '整个集群', value: 'cluster' },
]

const systemUpdateStrategyOptions = [
  { label: '原地覆盖', value: 'in_place' },
  { label: '滚动更新', value: 'rolling' },
  { label: '平行新目录安装', value: 'parallel_new_dir' },
  { label: '排空后切换', value: 'drain_and_cutover' },
]

const webAssetsSnapshot = computed(() => systemHealthSnapshot.value?.webAssets ?? null)
const systemHealthCheckedAtLabel = computed(() => formatTimestamp(systemHealthSnapshot.value?.checkedAt))
const dependencyHealthCheckedAtLabel = computed(() => formatTimestamp(dependencyHealthSnapshot.value?.checkedAt))
const runtimeHealthCheckedAtLabel = computed(() => formatTimestamp(runtimeHealthSnapshot.value?.checkedAt))
const serviceProfileCheckedAtLabel = computed(() => formatTimestamp(serviceProfileSnapshot.value?.checkedAt))
const systemHealthStatusLabel = computed(() => {
  if (!systemHealthSnapshot.value)
    return '未加载'
  return systemHealthSnapshot.value.ok ? '自检通过' : '存在待处理项'
})
const systemHealthStatusClass = computed(() => {
  if (!systemHealthSnapshot.value)
    return 'settings-health-pill ui-meta-chip--neutral'
  return systemHealthSnapshot.value.ok
    ? 'settings-health-pill ui-meta-chip--success'
    : 'settings-health-pill ui-meta-chip--warning'
})
const qqFriendDiagnosticsStatusLabel = computed(() => {
  if (!qqFriendDiagnosticsSnapshot.value)
    return '未采集'
  return qqFriendDiagnosticsSnapshot.value.summary.protocolLikely === 'qq-host-bridge'
    ? '宿主桥接协议'
    : '未识别'
})
const qqFriendDiagnosticsStatusClass = computed(() => {
  if (!qqFriendDiagnosticsSnapshot.value)
    return 'settings-health-pill ui-meta-chip--neutral'
  return qqFriendDiagnosticsSnapshot.value.summary.protocolLikely === 'qq-host-bridge'
    ? 'settings-health-pill ui-meta-chip--info'
    : 'settings-health-pill ui-meta-chip--warning'
})
const qqFriendDiagnosticsCheckedAtLabel = computed(() => formatTimestamp(
  qqFriendDiagnosticsSnapshot.value?.source?.modifiedAt
  || qqFriendDiagnosticsSnapshot.value?.createdAt,
))
const qqFriendDiagnosticsRedisSummaryLabel = computed(() => {
  const summary = qqFriendDiagnosticsSnapshot.value?.summary
  if (!summary)
    return '未获取'
  return `${summary.cacheAccountCount} 个账号 / ${summary.cacheFriendCount} 个好友`
})
const dependencyHealthStatusLabel = computed(() => {
  if (!dependencyHealthSnapshot.value)
    return '未加载'
  return dependencyHealthSnapshot.value.ok ? '依赖正常' : '存在告警'
})
const runtimeHealthStatusLabel = computed(() => {
  if (!runtimeHealthSnapshot.value)
    return '未加载'
  return runtimeHealthSnapshot.value.ok ? '运行平稳' : (runtimeHealthSnapshot.value.warning || '存在告警')
})
const serviceProfileLabel = computed(() => {
  const profile = serviceProfileSnapshot.value?.profile
  if (!profile)
    return '未加载'
  if (profile === 'headless-api')
    return 'Headless API'
  if (profile === 'headless-runtime')
    return 'Headless Runtime'
  return 'Full'
})
const externalApiClientCount = computed(() => externalApiClients.value.length)
const proxyPoolOptions = computed(() =>
  proxyPoolRecords.value.map(proxy => ({
    label: `${proxy.maskedProxyUrl} · ${proxy.status || 'unknown'}`,
    value: proxy.id,
  })),
)
const statsSummaryTodayGoldLabel = computed(() => {
  const gold = Number(statsSummarySnapshot.value?.buckets?.today?.gold || 0)
  return `${gold.toLocaleString('zh-CN')} 金豆`
})
void [
  webAssetsSnapshot,
  systemHealthCheckedAtLabel,
  dependencyHealthCheckedAtLabel,
  runtimeHealthCheckedAtLabel,
  serviceProfileCheckedAtLabel,
  systemHealthStatusLabel,
  systemHealthStatusClass,
  qqFriendDiagnosticsStatusLabel,
  qqFriendDiagnosticsStatusClass,
  qqFriendDiagnosticsCheckedAtLabel,
  qqFriendDiagnosticsRedisSummaryLabel,
  dependencyHealthStatusLabel,
  runtimeHealthStatusLabel,
  serviceProfileLabel,
  externalApiClientCount,
  proxyPoolOptions,
  statsSummaryTodayGoldLabel,
]

const trialCooldownOptions = [
  { label: '1 小时', value: 3600000 },
  { label: '2 小时', value: 7200000 },
  { label: '4 小时', value: 14400000 },
  { label: '8 小时', value: 28800000 },
]
const trialDurationLabel = computed(() => {
  return trialDaysOptions.find(item => item.value === trialConfig.value.days)?.label
    || `${trialConfig.value.days} 天`
})
const trialCooldownLabel = computed(() => {
  return trialCooldownOptions.find(item => item.value === trialConfig.value.cooldownMs)?.label
    || `${Math.round(trialConfig.value.cooldownMs / 3600000)} 小时`
})
const trialRenewModeLabel = computed(() => {
  if (trialConfig.value.adminRenewEnabled && trialConfig.value.userRenewEnabled)
    return '管理员 + 用户续费'
  if (trialConfig.value.adminRenewEnabled)
    return '仅管理员续费'
  if (trialConfig.value.userRenewEnabled)
    return '仅用户续费'
  return '未启用续费'
})
const thirdPartyApiConfiguredCount = computed(() => {
  return [
    thirdPartyApiConfig.value.wxApiKey,
    thirdPartyApiConfig.value.wxAppId,
    thirdPartyApiConfig.value.wxApiUrl,
    thirdPartyApiConfig.value.ipad860Url,
    thirdPartyApiConfig.value.aineisheKey,
  ].filter(value => !!String(value || '').trim()).length
})
const thirdPartyApiGatewayHost = computed(() => {
  const raw = String(thirdPartyApiConfig.value.wxApiUrl || '').trim()
  if (!raw)
    return '未配置'
  try {
    return new URL(raw).host || raw
  }
  catch {
    return raw
  }
})

async function loadTrialConfig() {
  if (!isAdmin.value)
    return
  try {
    const res = await api.get('/api/trial-card-config')
    if (res.data.ok && res.data.data) {
      trialConfig.value = { ...trialConfig.value, ...res.data.data }
    }
  }
  catch { /* 静默 */ }
}

async function saveTrialConfig() {
  trialSaving.value = true
  try {
    const res = await api.post('/api/trial-card-config', trialConfig.value)
    if (res.data.ok) {
      showAlert('体验卡配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.data.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    trialSaving.value = false
  }
}

async function loadClusterConfig() {
  if (!isAdmin.value)
    return
  const data = await settingStore.fetchClusterConfig()
  if (data) {
    clusterConfig.value = { ...clusterConfig.value, ...data }
  }
}

async function saveClusterConfig() {
  clusterSaving.value = true
  try {
    const res = await settingStore.saveClusterConfig(clusterConfig.value)
    if (res.ok) {
      showAlert('分布式与集群策略已保存并即时生效')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    clusterSaving.value = false
  }
}

async function loadThirdPartyApiConfig() {
  if (!isAdmin.value)
    return
  try {
    const res = await api.get('/api/admin/third-party-api')
    if (res.data.ok && res.data.data) {
      thirdPartyApiConfig.value = { ...thirdPartyApiConfig.value, ...res.data.data }
    }
  }
  catch { /* 静默 */ }
}

async function loadPlatformCapabilities(showFailureAlert = false) {
  if (!isAdmin.value)
    return
  platformCapabilitiesLoading.value = true
  try {
    const res = await api.get('/api/admin/platform-capabilities')
    if (res.data?.ok && res.data.data) {
      platformCapabilities.value = {
        openapiConfig: {
          ...defaultPlatformCapabilities.openapiConfig,
          ...(res.data.data.openapiConfig || {}),
        },
        healthProbeConfig: {
          ...defaultPlatformCapabilities.healthProbeConfig,
          ...(res.data.data.healthProbeConfig || {}),
        },
        serviceProfileConfig: {
          ...defaultPlatformCapabilities.serviceProfileConfig,
          ...(res.data.data.serviceProfileConfig || {}),
        },
        proxyPoolConfig: {
          ...defaultPlatformCapabilities.proxyPoolConfig,
          ...(res.data.data.proxyPoolConfig || {}),
        },
      }
      if (!String(proxyPoolCreateDraft.value.proxyUrl || '').trim()) {
        proxyPoolCreateDraft.value.maxUsers = platformCapabilities.value.proxyPoolConfig.defaultMaxUsersPerProxy
      }
      return
    }
    throw new Error(res.data?.error || '系统级能力配置返回异常')
  }
  catch (e: any) {
    platformCapabilities.value = JSON.parse(JSON.stringify(defaultPlatformCapabilities))
    if (showFailureAlert)
      showAlert(`加载系统级能力配置失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    platformCapabilitiesLoading.value = false
  }
}

async function savePlatformCapabilities() {
  if (!isAdmin.value)
    return
  platformCapabilitiesSaving.value = true
  try {
    const res = await api.post('/api/admin/platform-capabilities', platformCapabilities.value)
    if (res.data?.ok && res.data.data) {
      platformCapabilities.value = {
        openapiConfig: {
          ...defaultPlatformCapabilities.openapiConfig,
          ...(res.data.data.openapiConfig || {}),
        },
        healthProbeConfig: {
          ...defaultPlatformCapabilities.healthProbeConfig,
          ...(res.data.data.healthProbeConfig || {}),
        },
        serviceProfileConfig: {
          ...defaultPlatformCapabilities.serviceProfileConfig,
          ...(res.data.data.serviceProfileConfig || {}),
        },
        proxyPoolConfig: {
          ...defaultPlatformCapabilities.proxyPoolConfig,
          ...(res.data.data.proxyPoolConfig || {}),
        },
      }
      if (!String(proxyPoolCreateDraft.value.proxyUrl || '').trim()) {
        proxyPoolCreateDraft.value.maxUsers = platformCapabilities.value.proxyPoolConfig.defaultMaxUsersPerProxy
      }
      showAlert('系统级能力配置已保存，服务模式类配置将在下次重启后生效')
      return
    }
    throw new Error(res.data?.error || '保存失败')
  }
  catch (e: any) {
    showAlert(`保存系统级能力配置失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    platformCapabilitiesSaving.value = false
  }
}

async function loadExtendedHealthSnapshots(showFailureAlert = false) {
  if (!isAdmin.value)
    return
  extendedHealthLoading.value = true
  try {
    const [dependenciesRes, runtimeRes, profileRes, statsRes] = await Promise.all([
      api.get('/api/health/dependencies'),
      api.get('/api/health/runtime'),
      api.get('/api/system/service-profile'),
      api.get('/api/stats/summary'),
    ])
    dependencyHealthSnapshot.value = dependenciesRes.data?.ok ? (dependenciesRes.data.data || null) as HealthDependenciesSnapshot | null : null
    runtimeHealthSnapshot.value = runtimeRes.data?.ok ? (runtimeRes.data.data || null) as HealthRuntimeSnapshot | null : null
    serviceProfileSnapshot.value = profileRes.data?.ok ? (profileRes.data.data || null) as ServiceProfileSnapshot | null : null
    statsSummarySnapshot.value = statsRes.data?.ok ? (statsRes.data.data || null) as StatsSummarySnapshot | null : null
    extendedHealthError.value = ''
  }
  catch (e: any) {
    extendedHealthError.value = e.response?.data?.error || e.message || '扩展健康信息加载失败'
    if (showFailureAlert)
      showAlert(`加载扩展健康信息失败: ${extendedHealthError.value}`, 'danger')
  }
  finally {
    extendedHealthLoading.value = false
  }
}

async function saveThirdPartyApiConfig() {
  thirdPartyApiSaving.value = true
  try {
    const res = await api.post('/api/admin/third-party-api', thirdPartyApiConfig.value)
    if (res.data.ok) {
      showAlert('第三方 API 配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.data.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    thirdPartyApiSaving.value = false
  }
}

async function loadExternalApiClients(showFailureAlert = false) {
  if (!isAdmin.value)
    return
  externalApiClientsLoading.value = true
  try {
    const res = await api.get('/api/admin/external-api-clients')
    if (res.data?.ok) {
      externalApiClients.value = Array.isArray(res.data.data) ? res.data.data : []
      return
    }
    throw new Error(res.data?.error || '外部 API 客户端列表返回异常')
  }
  catch (e: any) {
    externalApiClients.value = []
    if (showFailureAlert)
      showAlert(`加载外部 API 客户端失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    externalApiClientsLoading.value = false
  }
}

function buildExternalApiClientPayload() {
  return {
    name: String(externalApiCreateDraft.value.name || '').trim() || '默认只读客户端',
    note: String(externalApiCreateDraft.value.note || '').trim(),
    scopes: ['read:health', 'read:accounts', 'read:stats'],
    allowedPaths: ['/api/external/'],
    allowedAccountIds: String(externalApiCreateDraft.value.allowedAccountIdsText || '')
      .split(/[,\s]+/)
      .map(item => item.trim())
      .filter(Boolean),
    expiresAt: externalApiCreateDraft.value.expiresAt
      ? new Date(externalApiCreateDraft.value.expiresAt).getTime()
      : 0,
  }
}

async function createExternalApiClientNow() {
  externalApiMutatingKey.value = 'create'
  try {
    const res = await api.post('/api/admin/external-api-clients', buildExternalApiClientPayload())
    if (res.data?.ok) {
      externalApiLastPlainToken.value = String(res.data.data?.plainToken || '').trim()
      await loadExternalApiClients()
      showAlert('外部 API 客户端已创建，新的 Key 只会展示这一次')
      return
    }
    throw new Error(res.data?.error || '创建失败')
  }
  catch (e: any) {
    showAlert(`创建外部 API 客户端失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    externalApiMutatingKey.value = ''
  }
}

async function rotateExternalApiClientNow(client: ExternalApiClientSnapshot) {
  externalApiMutatingKey.value = `rotate:${client.id}`
  try {
    const res = await api.post(`/api/admin/external-api-clients/${encodeURIComponent(client.id)}/rotate`)
    if (res.data?.ok) {
      externalApiLastPlainToken.value = String(res.data.data?.plainToken || '').trim()
      await loadExternalApiClients()
      showAlert(`已轮换 ${client.name} 的外部 API Key`)
      return
    }
    throw new Error(res.data?.error || '轮换失败')
  }
  catch (e: any) {
    showAlert(`轮换外部 API Key 失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    externalApiMutatingKey.value = ''
  }
}

async function revokeExternalApiClientNow(client: ExternalApiClientSnapshot) {
  externalApiMutatingKey.value = `revoke:${client.id}`
  try {
    const res = await api.post(`/api/admin/external-api-clients/${encodeURIComponent(client.id)}/revoke`)
    if (res.data?.ok) {
      await loadExternalApiClients()
      showAlert(`已吊销 ${client.name} 的外部 API Key`)
      return
    }
    throw new Error(res.data?.error || '吊销失败')
  }
  catch (e: any) {
    showAlert(`吊销外部 API Key 失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    externalApiMutatingKey.value = ''
  }
}

async function loadProxyPoolRecords(showFailureAlert = false) {
  if (!isAdmin.value)
    return
  proxyPoolLoading.value = true
  try {
    const res = await api.get('/api/admin/proxies')
    if (res.data?.ok) {
      proxyPoolRecords.value = Array.isArray(res.data.data) ? res.data.data : []
      return
    }
    throw new Error(res.data?.error || '代理池列表返回异常')
  }
  catch (e: any) {
    proxyPoolRecords.value = []
    if (showFailureAlert)
      showAlert(`加载代理池失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    proxyPoolLoading.value = false
  }
}

async function createProxyPoolRecord() {
  proxyPoolMutatingKey.value = 'create'
  try {
    const res = await api.post('/api/admin/proxies', {
      proxyUrl: proxyPoolCreateDraft.value.proxyUrl,
      maxUsers: proxyPoolCreateDraft.value.maxUsers,
      note: proxyPoolCreateDraft.value.note,
    })
    if (res.data?.ok) {
      proxyPoolCreateDraft.value = { proxyUrl: '', maxUsers: 10, note: '' }
      await loadProxyPoolRecords()
      showAlert('代理已加入代理池')
      return
    }
    throw new Error(res.data?.error || '创建失败')
  }
  catch (e: any) {
    showAlert(`创建代理失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    proxyPoolMutatingKey.value = ''
  }
}

async function importProxyPoolRecords() {
  proxyPoolMutatingKey.value = 'import'
  try {
    const res = await api.post('/api/admin/proxies/import', {
      text: proxyPoolImportDraft.value.text,
      mode: proxyPoolImportDraft.value.mode,
    })
    if (res.data?.ok) {
      await loadProxyPoolRecords()
      showAlert(`代理导入完成：新增 ${res.data.data?.added || 0} 条`)
      return
    }
    throw new Error(res.data?.error || '导入失败')
  }
  catch (e: any) {
    showAlert(`导入代理失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    proxyPoolMutatingKey.value = ''
  }
}

async function runProxyHealthCheck(targetId = '') {
  proxyPoolMutatingKey.value = targetId ? `health:${targetId}` : 'health'
  try {
    const res = await api.post('/api/admin/proxies/health-check', {
      ids: targetId ? [targetId] : [],
      timeoutMs: 6000,
    })
    if (res.data?.ok) {
      proxyPoolRecords.value = Array.isArray(res.data.data?.list) ? res.data.data.list : []
      showAlert(targetId ? '代理健康检查完成' : '全部代理健康检查完成')
      return
    }
    throw new Error(res.data?.error || '健康检查失败')
  }
  catch (e: any) {
    showAlert(`代理健康检查失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    proxyPoolMutatingKey.value = ''
  }
}

async function removeProxyPoolRecord(record: ProxyRecordSnapshot) {
  proxyPoolMutatingKey.value = `remove:${record.id}`
  try {
    const res = await api.delete(`/api/admin/proxies/${encodeURIComponent(record.id)}`)
    if (res.data?.ok) {
      await loadProxyPoolRecords()
      clearSelectedProxyBinding(record.id)
      showAlert('代理已移除')
      return
    }
    throw new Error(res.data?.error || '删除失败')
  }
  catch (e: any) {
    showAlert(`删除代理失败: ${e.response?.data?.error || e.message || '未知错误'}`, 'danger')
  }
  finally {
    proxyPoolMutatingKey.value = ''
  }
}

function formatTimestamp(value?: number | string | null) {
  if (value === undefined || value === null || value === '' || value === 0)
    return '未获取'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

const systemUpdateStatusLabel = computed(() => {
  if (!systemUpdateOverview.value)
    return '未检查'
  if (systemUpdateOverview.value.runtime?.lastError)
    return '检查失败'
  return systemUpdateOverview.value.hasUpdate ? '检测到可更新版本' : '当前已是最新版本'
})

const systemUpdateLatestVersionLabel = computed(() => systemUpdateOverview.value?.latestRelease?.versionTag || '未获取')
const systemUpdateCurrentVersionLabel = computed(() => systemUpdateOverview.value?.currentVersion || '未获取')
const systemUpdateLastCheckLabel = computed(() => formatTimestamp(systemUpdateOverview.value?.runtime?.lastCheckAt || systemUpdateOverview.value?.releaseCache?.checkedAt))
const systemUpdateSourceLabel = computed(() => systemUpdateOverview.value?.releaseCache?.source || '未配置')
const systemUpdateLatestReleaseNotes = computed(() => String(systemUpdateOverview.value?.latestRelease?.notes || '').trim())
const systemUpdateLatestReleaseAssets = computed(() => systemUpdateOverview.value?.latestRelease?.assets || [])
const systemUpdateAnnouncementPreview = computed<SystemUpdateAnnouncementPreview | null>(() => systemUpdateOverview.value?.announcementPreview || null)
const systemUpdateLastAnnouncementSyncResult = computed<SystemUpdateAnnouncementPreview | null>(() => systemUpdateOverview.value?.lastAnnouncementSyncResult || null)
const systemUpdateLatestSmokeSummary = computed<SystemUpdateSmokeSummary | null>(() => systemUpdateOverview.value?.latestSmokeSummary || null)
const systemUpdateSmokeSummaryStale = computed(() => {
  const checkedAt = Number(systemUpdateLatestSmokeSummary.value?.checkedAt || 0)
  return checkedAt > 0 && (Date.now() - checkedAt) > SYSTEM_UPDATE_SMOKE_STALE_MS
})
const systemUpdateSmokeSummaryTone = computed<'success' | 'warning' | 'danger'>(() => {
  const summary = systemUpdateLatestSmokeSummary.value
  if (!summary)
    return 'warning'
  if ((summary.failCount || 0) > 0)
    return 'danger'
  if ((summary.warnCount || 0) > 0 || systemUpdateSmokeSummaryStale.value)
    return 'warning'
  return 'success'
})
const systemUpdateSmokeSummaryStateLabel = computed(() => {
  const summary = systemUpdateLatestSmokeSummary.value
  if (!summary)
    return '未执行'
  if ((summary.failCount || 0) > 0)
    return '存在失败'
  if (systemUpdateSmokeSummaryStale.value)
    return '报告较旧'
  if ((summary.warnCount || 0) > 0)
    return '有提醒'
  return '已通过'
})
const systemUpdateSmokeSummaryHighlightLines = computed(() => {
  const summary = systemUpdateLatestSmokeSummary.value
  if (!summary)
    return []
  if (summary.failItems?.length)
    return summary.failItems.slice(0, 3)
  if (summary.warnItems?.length)
    return summary.warnItems.slice(0, 3)
  if (summary.passItems?.length)
    return summary.passItems.slice(0, 3)
  return []
})
const systemUpdateSyncRecommendation = computed(() => systemUpdateOverview.value?.syncRecommendation || null)
const activeSystemUpdateJob = computed<SystemUpdateJob | null>(() => systemUpdateOverview.value?.activeJob || systemUpdateJobs.value[0] || null)
const activeSystemUpdateJobDetail = computed<SystemUpdateJobDetail | null>(() => {
  if (!activeSystemUpdateJob.value)
    return systemUpdateJobDetail.value
  if (systemUpdateJobDetail.value?.job?.id === activeSystemUpdateJob.value.id)
    return systemUpdateJobDetail.value
  return {
    job: activeSystemUpdateJob.value,
    logs: [],
    currentPhase: activeSystemUpdateJob.value.executionPhase || activeSystemUpdateJob.value.status || 'queued',
    preflight: activeSystemUpdateJob.value.preflight || systemUpdatePreflightSnapshot.value,
    verification: activeSystemUpdateJob.value.verification || null,
    rollbackPayload: activeSystemUpdateJob.value.rollbackPayload || null,
    resultSignature: activeSystemUpdateJob.value.resultSignature || '',
    logFilePath: String(activeSystemUpdateJob.value.result?.logFile || '').trim(),
    latestLogId: 0,
  }
})
const systemUpdateDrainCutoverReadiness = computed<SystemUpdateDrainCutoverReadiness | null>(() => systemUpdateOverview.value?.drainCutoverReadiness || null)
const systemUpdateDrainCutoverBlockers = computed<SystemUpdateDrainCutoverBlocker[]>(() => systemUpdateDrainCutoverReadiness.value?.blockers || [])
const systemUpdateLatestPreflight = computed<SystemUpdatePreflight | null>(() => (
  systemUpdatePreflightSnapshot.value
  || activeSystemUpdateJobDetail.value?.preflight
  || activeSystemUpdateJob.value?.preflight
  || null
))
const systemUpdatePreflightChecks = computed(() => systemUpdateLatestPreflight.value?.checks || [])
const activeSystemUpdateBatch = computed<SystemUpdateBatchSummary | null>(() => {
  const overviewBatch = systemUpdateOverview.value?.activeBatch || null
  if (overviewBatch)
    return overviewBatch

  const batchKey = String(activeSystemUpdateJob.value?.batchKey || '').trim()
  if (!batchKey)
    return null

  const batchJobs = systemUpdateJobs.value.filter(job => job.batchKey === batchKey)
  if (batchJobs.length <= 1)
    return null
  const [primaryJob] = batchJobs
  if (!primaryJob)
    return null

  const total = batchJobs.length
  const pendingCount = batchJobs.filter(job => job.status === 'pending').length
  const claimedCount = batchJobs.filter(job => job.status === 'claimed').length
  const runningCount = batchJobs.filter(job => job.status === 'running').length
  const succeededCount = batchJobs.filter(job => job.status === 'succeeded').length
  const failedCount = batchJobs.filter(job => job.status === 'failed').length
  const cancelledCount = batchJobs.filter(job => job.status === 'cancelled').length
  const progressPercent = Math.round(batchJobs.reduce((sum, job) => sum + (Number(job.progressPercent) || 0), 0) / total)
  return {
    batchKey,
    scope: primaryJob.scope,
    strategy: primaryJob.strategy,
    targetVersion: primaryJob.targetVersion,
    sourceVersion: primaryJob.sourceVersion,
    total,
    pendingCount,
    claimedCount,
    runningCount,
    succeededCount,
    failedCount,
    cancelledCount,
    activeCount: pendingCount + claimedCount + runningCount,
    progressPercent,
    status: runningCount > 0 ? 'running' : (claimedCount > 0 ? 'claimed' : (pendingCount > 0 ? 'pending' : (failedCount > 0 ? 'failed' : 'succeeded'))),
    targetAgentIds: Array.from(new Set(batchJobs.map(job => job.targetAgentId).filter(Boolean))),
    claimAgentIds: Array.from(new Set(batchJobs.map(job => job.claimAgentId).filter(Boolean))),
    drainNodeIds: Array.from(new Set(batchJobs.flatMap(job => job.drainNodeIds || []))),
    jobs: batchJobs,
    latestJobId: primaryJob.id,
    latestJobKey: primaryJob.jobKey,
    latestSummaryMessage: primaryJob.summaryMessage,
    latestErrorMessage: primaryJob.errorMessage,
    executionPhase: primaryJob.executionPhase || primaryJob.status || 'queued',
    createdAt: Math.min(...batchJobs.map(job => job.createdAt || Date.now())),
    updatedAt: Math.max(...batchJobs.map(job => job.updatedAt || job.createdAt || 0)),
  }
})
const systemUpdateAgents = computed<SystemUpdateRuntimeAgent[]>(() => systemUpdateOverview.value?.runtime?.agentSummary || [])
const systemUpdateClusterNodes = computed<SystemUpdateClusterNode[]>(() => systemUpdateOverview.value?.runtime?.clusterNodes || [])
const clusterConnectedNodeCount = computed(() => systemUpdateClusterNodes.value.filter(node => node.connected).length)
const clusterDrainingNodeCount = computed(() => systemUpdateClusterNodes.value.filter(node => node.draining).length)
const clusterAgentErrorCount = computed(() => systemUpdateAgents.value.filter(agent => agent.status === 'error').length)
const systemUpdateRemoteReadinessItems = computed<SystemUpdateRemoteReadinessItem[]>(() => {
  const overview = systemUpdateOverview.value
  const config = overview?.config || systemUpdateConfig.value
  const provider = String(config?.provider || '').trim()
  const releaseSource = String(overview?.releaseCache?.source || '').trim()
  const latestRelease = overview?.latestRelease || null
  const latestVersion = String(latestRelease?.versionTag || '').trim()
  const lastCheckAt = Number(overview?.runtime?.lastCheckAt || overview?.releaseCache?.checkedAt || 0)
  const lastError = String(overview?.runtime?.lastError || '').trim()
  const repoPath = [config?.githubOwner, config?.githubRepo].filter(Boolean).join('/')
  const sourceConfigured = (
    (provider === 'github_release' && !!repoPath)
    || (provider === 'manifest_url' && !!String(config?.manifestUrl || '').trim())
    || (provider === 'release_api_url' && !!String(config?.releaseApiUrl || '').trim())
  )
  const sourceSummary = provider === 'github_release'
    ? (repoPath ? `GitHub Releases · ${repoPath}` : 'GitHub Releases 仓库未配齐')
    : provider === 'manifest_url'
      ? (String(config?.manifestUrl || '').trim() || 'Manifest URL 未配置')
      : provider === 'release_api_url'
        ? (String(config?.releaseApiUrl || '').trim() || 'Release API URL 未配置')
        : '尚未配置版本源'

  const agents = systemUpdateAgents.value
  const onlineAgents = agents.filter((agent) => {
    const updatedAt = Number(agent.updatedAt || 0)
    return agent.status !== 'error'
      && updatedAt > 0
      && (Date.now() - updatedAt) <= SYSTEM_UPDATE_AGENT_OFFLINE_THRESHOLD_MS
  })
  const offlineAgents = agents.filter(agent => !onlineAgents.includes(agent))
  const latestAgentHeartbeatAt = onlineAgents.reduce((latestAt, agent) => {
    return Math.max(latestAt, Number(agent.updatedAt || 0))
  }, 0)
  const currentScope = String(systemUpdateDraft.value.scope || config?.preferredScope || 'app').trim() || 'app'
  const nodes = systemUpdateClusterNodes.value
  const connectedNodeCount = nodes.filter(node => node.connected).length
  const preflight = systemUpdateLatestPreflight.value
  const preflightChecked = !!(preflight?.checkedAt || preflight?.checks?.length)

  return [
    {
      key: 'release_source',
      label: '发布版本源',
      tone: sourceConfigured ? 'success' : 'danger',
      stateLabel: sourceConfigured ? '已配置' : '待配置',
      summary: sourceSummary,
      detail: sourceConfigured
        ? (releaseSource ? `当前检查源：${releaseSource}` : '保存配置后执行一次“检查更新”，这里会显示实际拉取来源。')
        : '先补齐版本源配置，否则服务器无法看到你刚发布的新版本。',
    },
    {
      key: 'release_visibility',
      label: '最新版本检查',
      tone: lastError
        ? 'danger'
        : latestVersion
          ? 'success'
          : 'warning',
      stateLabel: lastError
        ? '检查失败'
        : latestVersion
          ? '已检查'
          : '待检查',
      summary: lastError
        ? `最近检查失败：${lastError}`
        : latestVersion
          ? (overview?.hasUpdate
              ? `已检测到可更新版本 ${latestVersion}`
              : `当前已是最新版本 ${latestVersion}`)
          : '还没有最新版本信息',
      detail: lastError
        ? '先修正版本源或网络问题，再重新执行“检查更新”。'
        : latestVersion
          ? `最近检查时间：${formatTimestamp(lastCheckAt)}`
          : '如果刚发版，这一步一定要先做，否则“系统更新中心”不会出现新版本。',
    },
    {
      key: 'host_agent',
      label: '更新代理心跳',
      tone: onlineAgents.length > 0
        ? (offlineAgents.length > 0 ? 'warning' : 'success')
        : 'danger',
      stateLabel: onlineAgents.length > 0
        ? (offlineAgents.length > 0 ? '部分离线' : '在线')
        : '未就绪',
      summary: onlineAgents.length > 0
        ? `在线代理 ${onlineAgents.length} / ${agents.length || onlineAgents.length}`
        : '未检测到在线更新代理',
      detail: onlineAgents.length > 0
        ? `最近在线心跳：${formatTimestamp(latestAgentHeartbeatAt)}${offlineAgents.length > 0 ? `；另有 ${offlineAgents.length} 个代理心跳超时或状态异常。` : '。'}`
        : '先在服务器执行 install-update-agent-service.sh，并确认 systemctl status qq-farm-update-agent 正常。',
    },
    {
      key: 'cluster_scope',
      label: '托管节点与更新范围',
      tone: nodes.length === 0
        ? (currentScope === 'app' ? 'success' : 'warning')
        : connectedNodeCount > 0
          ? (connectedNodeCount === nodes.length ? 'success' : 'warning')
          : (currentScope === 'app' ? 'warning' : 'danger'),
      stateLabel: nodes.length === 0
        ? (currentScope === 'app' ? '单机可用' : '需补节点')
        : connectedNodeCount > 0
          ? (connectedNodeCount === nodes.length ? '节点在线' : '部分离线')
          : '节点离线',
      summary: nodes.length === 0
        ? (currentScope === 'app' ? '当前没有托管集群节点，单机远程更新可直接执行。' : `当前范围是 ${currentScope}，但还没有托管节点。`)
        : `托管节点在线 ${connectedNodeCount} / ${nodes.length}，当前范围 ${currentScope}`,
      detail: nodes.length === 0
        ? (currentScope === 'app'
            ? '如果只更新当前宿主机，不需要额外节点；如要做 worker / cluster 更新，再补托管节点。'
            : '如果要做 worker / cluster 更新，先让代理上报 managedNodeIds 并保持节点在线。')
        : `${clusterDrainingNodeCount.value > 0 ? `其中 ${clusterDrainingNodeCount.value} 个节点处于排空中；` : ''}如需滚动或排空切换，建议先确认节点都已恢复接流。`,
    },
    {
      key: 'preflight',
      label: '最近独立预检',
      tone: preflightChecked
        ? (preflight?.blockerCount
            ? 'danger'
            : ((preflight?.warningCount || 0) > 0 ? 'warning' : 'success'))
        : 'warning',
      stateLabel: preflightChecked
        ? (preflight?.blockerCount
            ? '存在阻断'
            : ((preflight?.warningCount || 0) > 0 ? '有提醒' : '已通过'))
        : '未执行',
      summary: preflightChecked
        ? (preflight?.blockerCount
            ? `发现 ${preflight.blockerCount} 个阻断项`
            : `最近预检通过${(preflight?.warningCount || 0) > 0 ? `，含 ${preflight?.warningCount || 0} 项提醒` : ''}`)
        : '正式创建任务前，建议至少跑一次独立预检。',
      detail: preflightChecked
        ? (preflight?.blockers?.[0]?.message
            || preflight?.warnings?.[0]?.message
            || `检查时间：${formatTimestamp(preflight?.checkedAt)}`)
        : '它不会创建任务，只会提前发现版本、磁盘、依赖和代理在线性问题。',
    },
  ]
})
const systemUpdateRemoteReadinessBlockerCount = computed(() => systemUpdateRemoteReadinessItems.value.filter(item => item.tone === 'danger').length)
const systemUpdateRemoteReadinessWarningCount = computed(() => systemUpdateRemoteReadinessItems.value.filter(item => item.tone === 'warning').length)
const systemUpdateRemoteReadinessTone = computed<'success' | 'warning' | 'danger'>(() => {
  if (systemUpdateRemoteReadinessBlockerCount.value > 0)
    return 'danger'
  if (systemUpdateRemoteReadinessWarningCount.value > 0)
    return 'warning'
  return 'success'
})
const systemUpdateRemoteReadinessSummary = computed(() => {
  if (systemUpdateRemoteReadinessBlockerCount.value > 0)
    return `还有 ${systemUpdateRemoteReadinessBlockerCount.value} 项阻断需要先处理，建议按卡片里的顺序先补版本源、代理或预检。`
  if (systemUpdateRemoteReadinessWarningCount.value > 0)
    return `主链路已基本就绪，但还有 ${systemUpdateRemoteReadinessWarningCount.value} 项建议确认，避免正式更新时临场补救。`
  return '远程更新主链路已经就绪，可以继续检查更新、同步公告、执行预检并创建任务。'
})
const clusterActiveStrategyLabel = computed(() => {
  return clusterStrategyOptions.find(item => item.value === clusterConfig.value.dispatcherStrategy)?.label
    || clusterConfig.value.dispatcherStrategy
    || '未配置'
})
const SYSTEM_UPDATE_ACTIVE_STATUSES = ['pending', 'claimed', 'running'] as const
const SYSTEM_UPDATE_AUTO_REFRESH_MS = 15000
let systemUpdateAutoRefreshTimer: ReturnType<typeof window.setInterval> | null = null
let systemUpdateAutoRefreshInFlight = false

function getSystemUpdateAnnouncementSourceLabel(sourceType?: string) {
  switch (String(sourceType || '').trim()) {
    case 'release_cache':
      return 'Release'
    case 'update_log':
      return 'Update.log'
    case 'embedded':
      return '内置索引'
    default:
      return sourceType || '未知来源'
  }
}

function summarizeSystemUpdateAnnouncementSources(sources?: Record<string, number> | null) {
  if (!sources)
    return '-'

  const parts = Object.entries(sources)
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `${getSystemUpdateAnnouncementSourceLabel(key)} ${count}`)
  return parts.length ? parts.join(' · ') : '-'
}

function formatSystemUpdateAssetSize(size?: number) {
  const normalized = Number(size) || 0
  if (normalized <= 0)
    return '未知大小'
  if (normalized >= 1024 * 1024 * 1024)
    return `${(normalized / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (normalized >= 1024 * 1024)
    return `${(normalized / (1024 * 1024)).toFixed(1)} MB`
  if (normalized >= 1024)
    return `${Math.round(normalized / 1024)} KB`
  return `${normalized} B`
}

function getSystemUpdatePreflightCheckTone(check: SystemUpdatePreflight['checks'][number]) {
  if (check.blocker)
    return 'danger'
  if (check.warning)
    return 'warning'
  return 'success'
}

function getSystemUpdatePhaseLabel(phase?: string) {
  switch (String(phase || '').trim()) {
    case 'preflight':
      return '预检'
    case 'backup':
      return '备份'
    case 'pull_image':
      return '拉取镜像'
    case 'stop_stack':
      return '停栈'
    case 'apply_update':
      return '应用更新'
    case 'start_stack':
      return '启动服务'
    case 'verify':
      return '更新核验'
    case 'sync_announcements':
      return '同步公告'
    case 'rollback':
      return '回滚'
    case 'done':
      return '完成'
    default:
      return phase || '待开始'
  }
}

async function copySystemUpdateQuickCommand(
  command: string,
  successMessage: string,
  controlKey: string,
  detail: string,
) {
  await copyWithFeedback(command, successMessage, {
    controlKey,
    detail,
    title: '运维命令已复制',
  })
}

function copySystemUpdateRepairDeployCommand() {
  void copySystemUpdateQuickCommand(
    SYSTEM_UPDATE_REPAIR_DEPLOY_COMMAND,
    '部署骨架修复命令已复制',
    'system-update-repair-deploy',
    '适合旧服务器或脚本不完整场景，执行后会补齐部署辅助脚本。',
  )
}

function copySystemUpdateInstallAgentCommand() {
  void copySystemUpdateQuickCommand(
    SYSTEM_UPDATE_INSTALL_AGENT_COMMAND,
    '更新代理安装命令已复制',
    'system-update-install-agent',
    '会安装并检查 qq-farm-update-agent，确认后台远程更新具备宿主机执行能力。',
  )
}

function copySystemUpdateSmokeCommand() {
  void copySystemUpdateQuickCommand(
    SYSTEM_UPDATE_SMOKE_COMMAND,
    '更新中心 smoke 命令已复制',
    'system-update-smoke',
    '这条 smoke 默认只做检查，不会直接创建更新任务或执行回滚。',
  )
}

function copySystemUpdateSmokeRerunCommand() {
  void copySystemUpdateQuickCommand(
    SYSTEM_UPDATE_SMOKE_COMMAND,
    '重跑 smoke 命令已复制',
    'system-update-smoke-rerun',
    '适合在正式更新前重新跑一遍联动检查，确认远程更新链路仍然可用。',
  )
}

function describeWebAssetDir(dir: string | undefined, hasAssets: boolean | undefined, writable: boolean | undefined) {
  const parts = [dir || '-']
  parts.push(hasAssets ? '有产物' : '无产物')
  parts.push(writable ? '可覆盖' : '不可覆盖')
  return parts.join(' · ')
}
void describeWebAssetDir

function formatQqFriendBoolean(value: boolean | null | undefined, truthy = '是', falsy = '否') {
  if (value === null || value === undefined)
    return '未获取'
  return value ? truthy : falsy
}

function formatQqFriendCachePreview(cache: QqFriendDiagnosticsCacheEntry) {
  if (!cache.preview?.length)
    return '无预览'
  return cache.preview
    .map((item) => {
      const label = item.name || (item.gid ? `GID:${item.gid}` : '未知好友')
      return item.gid ? `${label} (${item.gid})` : label
    })
    .join('、')
}

function formatQqFriendLatestRequest(snapshot: QqFriendDiagnosticsSnapshot | null) {
  const request = snapshot?.hostFriendProtocol?.latestRequest
  if (!request)
    return '未观测到'
  return `startIndex=${request.startIndex} · socialStyle=${request.socialStyle} · socialSwitch=${request.socialSwitch} · hasLocal=${request.hasLocal}`
}

function normalizeNodeIdList(text: string) {
  return Array.from(new Set(String(text || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)))
}

function syncSystemUpdateForms(overview?: SystemUpdateOverview | null) {
  const next = overview || systemUpdateOverview.value
  if (!next)
    return
  systemUpdateConfig.value = {
    ...systemUpdateConfig.value,
    ...(next.config || {}),
  }
  systemUpdateDraft.value = {
    ...systemUpdateDraft.value,
    targetVersion: next.latestRelease?.versionTag || systemUpdateDraft.value.targetVersion,
    scope: next.config?.preferredScope || systemUpdateDraft.value.scope,
    strategy: next.config?.preferredStrategy || systemUpdateDraft.value.strategy,
    requireDrain: next.config?.requireDrain ?? systemUpdateDraft.value.requireDrain,
    syncAnnouncements: next.config?.autoSyncAnnouncements ?? systemUpdateDraft.value.syncAnnouncements,
    runVerification: next.config?.autoRunVerification ?? systemUpdateDraft.value.runVerification,
    targetAgentIdsText: systemUpdateDraft.value.targetAgentIdsText,
    drainNodeIdsText: next.config?.defaultDrainNodeIds?.join(',') || systemUpdateDraft.value.drainNodeIdsText,
  }
}

async function loadSystemUpdateJobDetail(jobId?: number | string | null, params: Record<string, any> = {}) {
  if (!jobId) {
    systemUpdateJobDetail.value = null
    return
  }
  systemUpdateJobDetailLoading.value = true
  try {
    const res = await settingStore.fetchSystemUpdateJobDetail(jobId, {
      limit: systemUpdateConfig.value.defaultLogTailLines || 80,
      ...params,
    })
    if (res.ok && res.data) {
      systemUpdateJobDetail.value = res.data
    }
    else if (!params?.silent) {
      showAlert(`加载任务详情失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateJobDetailLoading.value = false
  }
}

async function loadSystemUpdateData() {
  if (!isAdmin.value)
    return
  const [overview] = await Promise.all([
    settingStore.fetchSystemUpdateOverview(),
    settingStore.fetchSystemUpdateJobs(8),
  ])
  if (overview)
    syncSystemUpdateForms(overview)
  const activeJobId = overview?.activeJob?.id || systemUpdateOverview.value?.activeJob?.id || systemUpdateJobs.value[0]?.id
  if (activeJobId)
    await loadSystemUpdateJobDetail(activeJobId, { limit: 40, silent: true })
}

function shouldAutoRefreshSystemUpdate() {
  if (!isAdmin.value)
    return false
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    return false

  const activeStatus = String(activeSystemUpdateJob.value?.status || '')
  if (SYSTEM_UPDATE_ACTIVE_STATUSES.includes(activeStatus as typeof SYSTEM_UPDATE_ACTIVE_STATUSES[number]))
    return true

  return (systemUpdateOverview.value?.runtime?.agentSummary?.length || 0) > 0
    || (systemUpdateOverview.value?.runtime?.clusterNodes?.length || 0) > 0
}

async function refreshSystemUpdateStatus(options: { silent?: boolean } = {}) {
  if (!isAdmin.value)
    return
  if (!options.silent)
    systemUpdateRefreshing.value = true

  try {
    await loadSystemUpdateData()
  }
  catch (e: any) {
    if (!options.silent)
      showAlert(`刷新更新状态失败: ${e?.message || '未知错误'}`, 'danger')
  }
  finally {
    if (!options.silent)
      systemUpdateRefreshing.value = false
  }
}

function stopSystemUpdateAutoRefresh() {
  if (systemUpdateAutoRefreshTimer !== null) {
    window.clearInterval(systemUpdateAutoRefreshTimer)
    systemUpdateAutoRefreshTimer = null
  }
}

function startSystemUpdateAutoRefresh() {
  if (systemUpdateAutoRefreshTimer !== null || !isAdmin.value || typeof window === 'undefined')
    return

  systemUpdateAutoRefreshTimer = window.setInterval(async () => {
    if (systemUpdateAutoRefreshInFlight || !shouldAutoRefreshSystemUpdate())
      return

    systemUpdateAutoRefreshInFlight = true
    try {
      await refreshSystemUpdateStatus({ silent: true })
    }
    finally {
      systemUpdateAutoRefreshInFlight = false
    }
  }, SYSTEM_UPDATE_AUTO_REFRESH_MS)
}

watch(() => activeSystemUpdateJob.value?.id, (jobId) => {
  if (jobId)
    void loadSystemUpdateJobDetail(jobId, { limit: 40, silent: true })
  else
    systemUpdateJobDetail.value = null
}, { immediate: false })

async function checkSystemUpdateNow() {
  systemUpdateChecking.value = true
  try {
    const res = await settingStore.checkSystemUpdate()
    if (res.ok && res.data) {
      syncSystemUpdateForms(res.data)
      await settingStore.fetchSystemUpdateJobs(8)
      const pendingCount = Number(res.data.syncRecommendation?.pendingCount || 0)
      if (res.data.hasUpdate) {
        showAlert(
          pendingCount > 0
            ? `检测到新版本 ${res.data.latestRelease?.versionTag || ''}，可同步 ${pendingCount} 条公告`
            : `检测到新版本 ${res.data.latestRelease?.versionTag || ''}`,
        )
      }
      else {
        showAlert(pendingCount > 0 ? `当前已是最新版本，但仍有 ${pendingCount} 条公告可同步` : '当前已经是最新版本')
      }
    }
    else {
      showAlert(`检查更新失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateChecking.value = false
  }
}

async function syncSystemUpdateAnnouncementsNow() {
  systemUpdateAnnouncementSyncing.value = true
  try {
    const res = await settingStore.syncSystemUpdateAnnouncements()
    if (res.ok && res.data) {
      if (res.data.overview)
        syncSystemUpdateForms(res.data.overview)
      const syncResult = res.data.syncResult
      if (syncResult) {
        showAlert(`公告同步完成：新增 ${syncResult.added || 0} 条，更新 ${syncResult.updated || 0} 条，跳过 ${syncResult.skipped || 0} 条`)
      }
      else {
        showAlert('公告同步完成')
      }
    }
    else {
      showAlert(`同步公告失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateAnnouncementSyncing.value = false
  }
}

async function runSystemUpdatePreflightNow(showSuccessAlert = true) {
  systemUpdatePreflighting.value = true
  try {
    const res = await settingStore.runSystemUpdatePreflight({
      targetVersion: systemUpdateDraft.value.targetVersion,
      scope: systemUpdateDraft.value.scope,
      strategy: systemUpdateDraft.value.strategy,
      targetAgentIds: normalizeNodeIdList(systemUpdateDraft.value.targetAgentIdsText),
      preflightOverride: {},
    })
    if (res.ok && res.data) {
      systemUpdatePreflightSnapshot.value = res.data
      if (showSuccessAlert) {
        showAlert(
          res.data.ok
            ? `更新预检通过，共 ${res.data.warningCount || 0} 项提醒`
            : `更新预检未通过，存在 ${res.data.blockerCount || 0} 个阻断项`,
          res.data.ok ? 'primary' : 'danger',
        )
      }
    }
    else {
      showAlert(`执行更新预检失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdatePreflighting.value = false
  }
}

async function saveSystemUpdateConfigForm() {
  systemUpdateSaving.value = true
  try {
    const res = await settingStore.saveSystemUpdateConfig(systemUpdateConfig.value)
    if (res.ok && res.data) {
      systemUpdateConfig.value = { ...systemUpdateConfig.value, ...res.data }
      if (systemUpdateOverview.value) {
        systemUpdateOverview.value = {
          ...systemUpdateOverview.value,
          config: res.data,
        }
      }
      showAlert('系统更新配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateSaving.value = false
  }
}

async function createSystemUpdateTask() {
  systemUpdateLaunching.value = true
  try {
    const payload = {
      targetVersion: systemUpdateDraft.value.targetVersion,
      scope: systemUpdateDraft.value.scope,
      strategy: systemUpdateDraft.value.strategy,
      preserveCurrent: systemUpdateDraft.value.preserveCurrent,
      requireDrain: systemUpdateDraft.value.requireDrain,
      syncAnnouncements: systemUpdateDraft.value.syncAnnouncements,
      runVerification: systemUpdateDraft.value.runVerification,
      allowAutoRollback: systemUpdateDraft.value.allowAutoRollback,
      includeDeployTemplates: systemUpdateDraft.value.includeDeployTemplates,
      note: systemUpdateDraft.value.note,
      targetAgentIds: normalizeNodeIdList(systemUpdateDraft.value.targetAgentIdsText),
      drainNodeIds: normalizeNodeIdList(systemUpdateDraft.value.drainNodeIdsText),
    }
    const res = await settingStore.createSystemUpdateJob(payload)
    if (res.ok) {
      systemUpdatePreflightSnapshot.value = res.data?.job?.preflight || null
      await refreshSystemUpdateStatus({ silent: true })
      const createdCount = Number(res.data?.createdCount || (Array.isArray(res.data?.jobs) ? res.data.jobs.length : (res.data?.job ? 1 : 0))) || 1
      showAlert(`更新任务已创建，共 ${createdCount} 个，目标版本 ${payload.targetVersion || '未指定'}`)
    }
    else {
      const readiness = res.data?.drainCutoverReadiness as SystemUpdateDrainCutoverReadiness | undefined
      const preflight = res.data?.preflight as SystemUpdatePreflight | undefined
      if (preflight) {
        systemUpdatePreflightSnapshot.value = preflight
      }
      if (readiness?.blockerCount) {
        const firstBlocker = readiness.blockers?.[0]
        const blockerLabel = firstBlocker
          ? `${firstBlocker.accountName || firstBlocker.accountId}${firstBlocker.nodeId ? ` @ ${firstBlocker.nodeId}` : ''}`
          : '存在运行中账号'
        showAlert(`创建任务失败: ${res.error}。阻断对象: ${blockerLabel}`, 'danger')
      }
      else if (preflight?.blockerCount) {
        const blockerLabel = preflight.blockers?.[0]?.message || '存在环境阻断项'
        showAlert(`创建任务失败: ${res.error}。预检阻断: ${blockerLabel}`, 'danger')
      }
      else {
        showAlert(`创建任务失败: ${res.error}`, 'danger')
      }
    }
  }
  finally {
    systemUpdateLaunching.value = false
  }
}

function describeSystemUpdateJob(job?: SystemUpdateJob | null) {
  if (!job)
    return '暂无任务'
  const progress = Number.isFinite(job.progressPercent) ? `${job.progressPercent}%` : '-'
  const base = `${job.scope} / ${job.strategy} / ${job.status} / ${getSystemUpdatePhaseLabel(job.executionPhase)}`
  return job.summaryMessage ? `${base} · ${progress} · ${job.summaryMessage}` : `${base} · ${progress}`
}

function describeSystemUpdateNode(node: SystemUpdateClusterNode) {
  const parts = [
    node.connected ? '在线' : '离线',
    node.draining ? '排空中' : '接流中',
    `账号 ${node.assignedCount}`,
  ]
  return parts.join(' · ')
}

function describeSystemUpdateAgent(agent: SystemUpdateRuntimeAgent) {
  const parts = [
    agent.role || 'host_agent',
    agent.version || '-',
    formatTimestamp(agent.updatedAt),
  ]
  if (agent.managedNodeIds?.length)
    parts.push(`管理节点 ${agent.managedNodeIds.join(', ')}`)
  return parts.join(' · ')
}

function describeSystemUpdateDrainCutoverReadiness(readiness?: SystemUpdateDrainCutoverReadiness | null) {
  if (!readiness)
    return '未获取切换预检结果'
  if (readiness.canDrainCutover)
    return `当前没有发现排空切换阻断账号，目标节点运行账号 ${readiness.targetedRunningAccountCount} 个`
  return `发现 ${readiness.blockerCount} 个阻断账号，其中 ${readiness.reloginRequiredCount} 个在切换后通常需要重新登录`
}

function describeSystemUpdateBatch(batch?: SystemUpdateBatchSummary | null) {
  if (!batch)
    return '暂无批次任务'
  const parts = [
    `${batch.scope} / ${batch.strategy} / ${batch.status} / ${getSystemUpdatePhaseLabel(batch.executionPhase)}`,
    `总计 ${batch.total}`,
    `进度 ${batch.progressPercent}%`,
  ]
  if (batch.runningCount)
    parts.push(`运行中 ${batch.runningCount}`)
  if (batch.succeededCount)
    parts.push(`成功 ${batch.succeededCount}`)
  if (batch.failedCount)
    parts.push(`失败 ${batch.failedCount}`)
  return parts.join(' · ')
}

function canCancelSystemUpdateJob(job?: SystemUpdateJob | null) {
  return job ? ['pending', 'claimed'].includes(job.status) : false
}

function canRollbackSystemUpdateJob(job?: SystemUpdateJob | null) {
  if (!job)
    return false
  if (['pending', 'claimed', 'running'].includes(job.status))
    return false
  return !!(job.sourceVersion || job.rollbackPayload?.previousVersion)
}

function getBatchCancelableCount(batch?: SystemUpdateBatchSummary | null) {
  if (!batch)
    return 0
  return Number(batch.pendingCount || 0) + Number(batch.claimedCount || 0)
}

function isSystemUpdateTargetAgentSelected(agentId: string) {
  return normalizeNodeIdList(systemUpdateDraft.value.targetAgentIdsText).includes(agentId)
}

function toggleSystemUpdateTargetAgent(agentId: string) {
  const next = new Set(normalizeNodeIdList(systemUpdateDraft.value.targetAgentIdsText))
  if (next.has(agentId))
    next.delete(agentId)
  else
    next.add(agentId)
  systemUpdateDraft.value.targetAgentIdsText = Array.from(next).join(',')
}

async function toggleSystemUpdateNodeDrain(node: SystemUpdateClusterNode, draining: boolean) {
  const readinessSummary = systemUpdateLatestPreflight.value?.drainCutoverReadiness
  const confirmMessage = draining
    ? `是否将节点 ${node.nodeId} 置为排空？\n当前账号数：${node.assignedCount}\n当前阻断账号：${readinessSummary?.blockerCount || 0}\n建议：排空后等待账号迁移完成，再创建更新任务。`
    : `是否让节点 ${node.nodeId} 恢复接流？\n当前状态：${node.draining ? '排空中' : '接流中'}\n建议：确认更新完成且服务健康后再恢复。`
  if (!window.window.confirm(confirmMessage))
    return

  systemUpdateNodeMutatingId.value = node.nodeId
  try {
    const res = await settingStore.setSystemUpdateNodeDrain(node.nodeId, draining)
    if (res.ok) {
      await refreshSystemUpdateStatus({ silent: true })
      showAlert(draining ? `节点 ${node.nodeId} 已进入排空状态` : `节点 ${node.nodeId} 已恢复接流`)
    }
    else {
      showAlert(`更新节点状态失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateNodeMutatingId.value = ''
  }
}

async function retrySystemUpdateJobNow(job: SystemUpdateJob) {
  systemUpdateRetryingKey.value = `job:${job.id}`
  try {
    const res = await settingStore.retrySystemUpdateJob(job.id)
    if (res.ok) {
      await refreshSystemUpdateStatus({ silent: true })
      showAlert(`已重新创建任务 ${job.jobKey} 的重试任务`)
    }
    else {
      showAlert(`重试任务失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateRetryingKey.value = ''
  }
}

async function retrySystemUpdateBatchNow(batch: SystemUpdateBatchSummary) {
  systemUpdateRetryingKey.value = `batch:${batch.batchKey}`
  try {
    const res = await settingStore.retrySystemUpdateBatch(batch.batchKey)
    if (res.ok) {
      await refreshSystemUpdateStatus({ silent: true })
      const createdCount = Number(res.data?.createdCount || 0)
      showAlert(`已重新创建批次 ${batch.batchKey} 的失败子任务，共 ${createdCount} 个`)
    }
    else {
      showAlert(`重试批次失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateRetryingKey.value = ''
  }
}

async function rollbackSystemUpdateJobNow(job: SystemUpdateJob) {
  const rollbackTarget = job.rollbackPayload?.previousVersion || job.sourceVersion || '上一版本'
  if (!window.window.confirm(`是否基于任务 ${job.jobKey} 创建回滚任务？\n回滚目标：${rollbackTarget}\n该操作会生成新的标准更新任务。`))
    return

  systemUpdateRollingBackKey.value = `job:${job.id}`
  try {
    const res = await settingStore.rollbackSystemUpdateJob(job.id)
    if (res.ok) {
      await refreshSystemUpdateStatus({ silent: true })
      showAlert(`已创建回滚任务，目标版本 ${rollbackTarget}`)
    }
    else {
      showAlert(`创建回滚任务失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateRollingBackKey.value = ''
  }
}

async function cancelSystemUpdateJobNow(job: SystemUpdateJob) {
  systemUpdateCancellingKey.value = `job:${job.id}`
  try {
    const res = await settingStore.cancelSystemUpdateJob(job.id)
    if (res.ok) {
      await refreshSystemUpdateStatus({ silent: true })
      showAlert(`任务 ${job.jobKey} 已取消`)
    }
    else {
      showAlert(`取消任务失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateCancellingKey.value = ''
  }
}

async function cancelSystemUpdateBatchNow(batch: SystemUpdateBatchSummary) {
  systemUpdateCancellingKey.value = `batch:${batch.batchKey}`
  try {
    const res = await settingStore.cancelSystemUpdateBatch(batch.batchKey)
    if (res.ok) {
      await refreshSystemUpdateStatus({ silent: true })
      const cancelledCount = Number(res.data?.cancelledCount || 0)
      showAlert(`已取消批次 ${batch.batchKey} 中 ${cancelledCount} 个待执行子任务`)
    }
    else {
      showAlert(`取消批次失败: ${res.error}`, 'danger')
    }
  }
  finally {
    systemUpdateCancellingKey.value = ''
  }
}

async function loadSystemSettingsHealth(showFailureAlert = false) {
  if (!isAdmin.value)
    return
  systemHealthLoading.value = true
  try {
    const res = await api.get('/api/system-settings/health')
    if (res.data?.ok) {
      systemHealthSnapshot.value = (res.data.data || null) as SystemSettingsHealthSnapshot | null
      systemHealthError.value = ''
      return
    }
    throw new Error(res.data?.error || '系统自检返回异常')
  }
  catch (e: any) {
    systemHealthError.value = e.response?.data?.error || e.message || '系统自检加载失败'
    if (showFailureAlert)
      showAlert(`加载系统自检失败: ${systemHealthError.value}`, 'danger')
  }
  finally {
    systemHealthLoading.value = false
  }
}

async function loadQqFriendDiagnostics(showFailureAlert = false) {
  if (!isAdmin.value)
    return
  qqFriendDiagnosticsLoading.value = true
  try {
    const res = await api.get('/api/qq-friend-diagnostics', {
      params: { appid: QQ_FRIEND_DIAGNOSTICS_APPID },
    })
    if (res.data?.ok) {
      qqFriendDiagnosticsSnapshot.value = (res.data.data || null) as QqFriendDiagnosticsSnapshot | null
      qqFriendDiagnosticsError.value = ''
      return
    }
    throw new Error(res.data?.error || 'QQ 好友诊断返回异常')
  }
  catch (e: any) {
    qqFriendDiagnosticsError.value = e.response?.data?.error || e.message || 'QQ 好友诊断加载失败'
    if (showFailureAlert)
      showAlert(`加载 QQ 好友诊断失败: ${qqFriendDiagnosticsError.value}`, 'danger')
  }
  finally {
    qqFriendDiagnosticsLoading.value = false
  }
}

async function refreshAdminHealthPanels(showFailureAlert = false) {
  await Promise.all([
    loadSystemSettingsHealth(showFailureAlert),
    loadExtendedHealthSnapshots(showFailureAlert),
    loadQqFriendDiagnostics(showFailureAlert),
  ])
}

const modalVisible = ref(false)
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})
const DEFAULT_LOGIN_BACKGROUND_OVERLAY_OPACITY = 30
const DEFAULT_LOGIN_BACKGROUND_BLUR = 2
const DEFAULT_WORKSPACE_VISUAL_CONFIG = getWorkspaceAppearanceConfig('console')
const DEFAULT_APP_BACKGROUND_OVERLAY_OPACITY = DEFAULT_WORKSPACE_VISUAL_CONFIG.appBackgroundOverlayOpacity
const DEFAULT_APP_BACKGROUND_BLUR = DEFAULT_WORKSPACE_VISUAL_CONFIG.appBackgroundBlur
const loginBackgroundPresets = LOGIN_BACKGROUND_PRESETS
const workspaceVisualPresets = UI_WORKSPACE_VISUAL_PRESETS

const loginPreviewVisible = ref(false)
const loginPreviewLoading = ref(false)
const loginPreviewLoadFailed = ref(false)
const backgroundSaving = ref(false)
const backgroundUploading = ref(false)
const backgroundFileInput = ref<HTMLInputElement | null>(null)
let loginPreviewRequestId = 0

const loginPreviewUsesCustomBackground = computed(() => {
  return !!appStore.loginBackground.trim() && !loginPreviewLoadFailed.value
})

const loginPreviewBackgroundStyle = computed(() => {
  if (loginPreviewUsesCustomBackground.value) {
    return {
      backgroundImage: `url(${appStore.loginBackground.trim()})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }

  return {
    background: 'linear-gradient(135deg, color-mix(in srgb, var(--ui-brand-100) 72%, var(--ui-bg-surface) 28%) 0%, color-mix(in srgb, var(--ui-brand-200) 58%, var(--ui-bg-surface) 42%) 100%)',
  }
})

const loginPreviewMaskStyle = computed(() => ({
  backgroundColor: `color-mix(in srgb, var(--ui-overlay-backdrop) ${appStore.loginBackgroundOverlayOpacity}%, transparent)`,
  backdropFilter: `blur(${appStore.loginBackgroundBlur}px)`,
  WebkitBackdropFilter: `blur(${appStore.loginBackgroundBlur}px)`,
}))
const appScenePreviewMaskStyle = computed(() => ({
  backgroundColor: `color-mix(in srgb, var(--ui-overlay-backdrop) ${appStore.appBackgroundOverlayOpacity}%, transparent)`,
  backdropFilter: `blur(${appStore.appBackgroundBlur}px)`,
  WebkitBackdropFilter: `blur(${appStore.appBackgroundBlur}px)`,
}))
const currentThemeOption = computed(() => getThemeOption(appStore.colorTheme))
const currentThemeBackgroundPreset = computed(() => getThemeBackgroundPreset(appStore.colorTheme))
const currentBackgroundScopeOption = computed(() => {
  return UI_BACKGROUND_SCOPE_OPTIONS.find(option => option.value === appStore.backgroundScope) || UI_BACKGROUND_SCOPE_OPTIONS[0]
})
const currentWorkspaceVisualSummary = computed(() => {
  const activePreset = workspaceVisualPresets.find(preset => isWorkspaceVisualPresetApplied(preset.key))
  if (activePreset) {
    return {
      name: activePreset.name,
      badge: activePreset.badge,
      description: `控制业务页卡片的通透度与氛围感。当前为「${activePreset.name}」，适合根据屏幕环境切换阅读风格。`,
    }
  }

  if (appStore.themeBackgroundLinked) {
    return {
      name: '主题联动自定义',
      badge: '联动',
      description: '当前主界面参数已被主题锁定背景注入为独立组合，下面 3 档视觉预设仍可手动改写。',
    }
  }

  return {
    name: '自定义参数',
    badge: '自定义',
    description: '当前主界面参数已脱离预设组合，可继续手动微调遮罩与模糊强度。',
  }
})
function getWorkspacePreviewCardStyle(presetKey: string) {
  if (presetKey === 'poster') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--ui-text-on-brand) 10%, transparent)',
      borderColor: 'color-mix(in srgb, var(--ui-text-on-brand) 22%, transparent)',
      backdropFilter: 'blur(22px)',
      WebkitBackdropFilter: 'blur(22px)',
    }
  }
  if (presetKey === 'pure_glass') {
    return {
      backgroundColor: 'color-mix(in srgb, var(--ui-text-on-brand) 7%, transparent)',
      borderColor: 'color-mix(in srgb, var(--ui-text-on-brand) 30%, transparent)',
      backdropFilter: 'blur(28px)',
      WebkitBackdropFilter: 'blur(28px)',
    }
  }
  return {
    backgroundColor: 'color-mix(in srgb, var(--ui-text-on-brand) 14%, transparent)',
    borderColor: 'color-mix(in srgb, var(--ui-text-on-brand) 16%, transparent)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  }
}

const themePresetBundles = computed(() => {
  return THEME_OPTIONS.map(theme => ({
    theme,
    preset: getThemeBackgroundPreset(theme.key),
    workspacePreset: getWorkspaceVisualPreset(getThemeWorkspaceVisualPreset(theme.key)),
  }))
})
const orderedLoginBackgroundPresets = computed(() => {
  const currentThemeKey = appStore.colorTheme
  return [...loginBackgroundPresets].sort((a, b) => {
    const aRank = a.themeKey === currentThemeKey ? 0 : (a.builtIn ? 1 : 2)
    const bRank = b.themeKey === currentThemeKey ? 0 : (b.builtIn ? 1 : 2)
    return aRank - bRank
  })
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

function openLoginPreview() {
  loginPreviewVisible.value = true
}

function isSelectedLoginBackgroundPreset(preset: LoginBackgroundPreset) {
  return preset.url.trim() === appStore.loginBackground.trim()
}

function applyBackgroundPreset(preset: LoginBackgroundPreset) {
  appStore.loginBackground = preset.url
  if (preset.themeKey) {
    appStore.colorTheme = preset.themeKey
  }
  appStore.loginBackgroundOverlayOpacity = preset.overlayOpacity
  appStore.loginBackgroundBlur = preset.blur
  if (!preset.url) {
    loginPreviewLoadFailed.value = false
  }
}

function applyCurrentThemeBackgroundPreset() {
  applyBackgroundPreset(currentThemeBackgroundPreset.value)
}

function isThemeBundleApplied(themeKey: string) {
  const preset = getThemeBackgroundPreset(themeKey)
  const workspacePresetKey = getThemeWorkspaceVisualPreset(themeKey)
  return appStore.colorTheme === themeKey
    && appStore.workspaceVisualPreset === workspacePresetKey
    && appStore.loginBackground.trim() === preset.url.trim()
    && appStore.loginBackgroundOverlayOpacity === preset.overlayOpacity
    && appStore.loginBackgroundBlur === preset.blur
    && appStore.appBackgroundOverlayOpacity === preset.appOverlayOpacity
    && appStore.appBackgroundBlur === preset.appBlur
}

function applyThemeBundle(themeKey: string) {
  Object.assign(appStore, getThemeAppearanceConfig(
    themeKey,
    appStore.backgroundScope === 'global' ? 'global' : 'login_and_app',
  ))
}

function isWorkspaceVisualPresetApplied(presetKey: string) {
  const preset = getWorkspaceAppearanceConfig(presetKey)
  return appStore.workspaceVisualPreset === preset.workspaceVisualPreset
    && appStore.appBackgroundOverlayOpacity === preset.appBackgroundOverlayOpacity
    && appStore.appBackgroundBlur === preset.appBackgroundBlur
}

function applyWorkspaceVisualPreset(presetKey: string) {
  const preset = getWorkspaceAppearanceConfig(presetKey)
  appStore.workspaceVisualPreset = preset.workspaceVisualPreset
  appStore.appBackgroundOverlayOpacity = preset.appBackgroundOverlayOpacity
  appStore.appBackgroundBlur = preset.appBackgroundBlur
  if (appStore.loginBackground.trim() && appStore.backgroundScope === 'login_only') {
    appStore.backgroundScope = 'login_and_app'
  }
}

function toggleThemeBackgroundLinked(enabled: boolean) {
  appStore.themeBackgroundLinked = enabled
  if (enabled) {
    applyThemeBundle(appStore.colorTheme)
  }
}

async function saveLoginAppearance() {
  backgroundSaving.value = true
  try {
    await appStore.setUIConfig({
      colorTheme: appStore.colorTheme,
      loginBackground: appStore.loginBackground.trim(),
      backgroundScope: appStore.backgroundScope,
      loginBackgroundOverlayOpacity: appStore.loginBackgroundOverlayOpacity,
      loginBackgroundBlur: appStore.loginBackgroundBlur,
      workspaceVisualPreset: appStore.workspaceVisualPreset,
      appBackgroundOverlayOpacity: appStore.appBackgroundOverlayOpacity,
      appBackgroundBlur: appStore.appBackgroundBlur,
      themeBackgroundLinked: appStore.themeBackgroundLinked,
    })
    showAlert('登录页背景设置已保存')
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message || '未知错误'}`, 'danger')
  }
  finally {
    backgroundSaving.value = false
  }
}

async function restoreDefaultLoginAppearance() {
  appStore.loginBackground = ''
  appStore.backgroundScope = 'login_only'
  appStore.loginBackgroundOverlayOpacity = DEFAULT_LOGIN_BACKGROUND_OVERLAY_OPACITY
  appStore.loginBackgroundBlur = DEFAULT_LOGIN_BACKGROUND_BLUR
  appStore.workspaceVisualPreset = 'console'
  appStore.appBackgroundOverlayOpacity = DEFAULT_APP_BACKGROUND_OVERLAY_OPACITY
  appStore.appBackgroundBlur = DEFAULT_APP_BACKGROUND_BLUR
  appStore.themeBackgroundLinked = false
  loginPreviewLoadFailed.value = false
  await saveLoginAppearance()
}

function triggerBackgroundUpload() {
  backgroundFileInput.value?.click()
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      }
      else {
        reject(new Error('图片读取失败'))
      }
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

async function compressLoginBackgroundImage(file: File) {
  const source = await readFileAsDataUrl(file)
  const img = await loadImageElement(source)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  const maxEdge = 2200
  const scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('当前浏览器不支持图片压缩')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const candidates: Array<{ mime: string, quality?: number }> = [
    { mime: 'image/webp', quality: 0.88 },
    { mime: 'image/webp', quality: 0.76 },
    { mime: 'image/jpeg', quality: 0.82 },
    { mime: 'image/jpeg', quality: 0.7 },
  ]

  let fallbackDataUrl = ''
  for (const candidate of candidates) {
    try {
      const dataUrl = canvas.toDataURL(candidate.mime, candidate.quality)
      if (!fallbackDataUrl) {
        fallbackDataUrl = dataUrl
      }
      if (dataUrl.length <= 7_000_000) {
        return {
          dataUrl,
          mimeType: dataUrl.match(/^data:([^;]+);/i)?.[1] || candidate.mime,
        }
      }
    }
    catch {
      // ignore unsupported mime types and try the next candidate
    }
  }

  if (!fallbackDataUrl) {
    fallbackDataUrl = canvas.toDataURL('image/png')
  }

  return {
    dataUrl: fallbackDataUrl,
    mimeType: fallbackDataUrl.match(/^data:([^;]+);/i)?.[1] || 'image/png',
  }
}

async function handleBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (input) {
    input.value = ''
  }
  if (!file)
    return

  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
    showAlert('仅支持上传 JPG / PNG / WebP 图片', 'danger')
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    showAlert('原图超过 8MB，请先压缩后再上传', 'danger')
    return
  }

  backgroundUploading.value = true
  try {
    const payload = await compressLoginBackgroundImage(file)
    const res = await api.post('/api/settings/ui-background/upload', {
      filename: file.name,
      mimeType: payload.mimeType,
      dataUrl: payload.dataUrl,
    })

    if (res.data?.ok && res.data?.data?.url) {
      appStore.loginBackground = res.data.data.url
      loginPreviewLoadFailed.value = false
      showAlert('图片已上传并填充到背景地址，点击“应用背景设置”后全局生效')
    }
    else {
      showAlert(`上传失败: ${res.data?.error || '未知错误'}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`上传失败: ${e.message || '未知错误'}`, 'danger')
  }
  finally {
    backgroundUploading.value = false
  }
}

watch(() => appStore.loginBackground, (value) => {
  const nextUrl = value.trim()
  const requestId = ++loginPreviewRequestId

  loginPreviewLoading.value = false
  loginPreviewLoadFailed.value = false

  if (!nextUrl)
    return

  loginPreviewLoading.value = true

  const img = new Image()

  img.onload = () => {
    if (requestId !== loginPreviewRequestId)
      return
    loginPreviewLoading.value = false
    loginPreviewLoadFailed.value = false
  }

  img.onerror = () => {
    if (requestId !== loginPreviewRequestId)
      return
    loginPreviewLoading.value = false
    loginPreviewLoadFailed.value = true
  }

  img.src = nextUrl
}, { immediate: true })

const currentAccountSnapshot = computed(() => {
  return accounts.value.find((a: any) => String(a.id || '') === String(currentAccountId.value || '')) as any || null
})

const currentAccountName = computed(() => {
  const acc = currentAccountSnapshot.value
  return acc ? (acc.name || acc.nick || acc.id) : null
})

const localSettings = ref<any>({})

function clearSelectedProxyBinding(proxyId: string | number) {
  if (String(localSettings.value.proxyBindingConfig?.proxyId || '') === String(proxyId))
    localSettings.value.proxyBindingConfig.proxyId = ''
}

function isCurrentAccountQqValue() {
  return String(currentAccountSnapshot.value?.platform || '').trim().toLowerCase() === 'qq'
}

function getQqHighRiskAutoDisableSeenKey(accountId: string) {
  return `${QQ_HIGH_RISK_AUTO_DISABLE_SEEN_KEY_PREFIX}${accountId}`
}

function maybeNotifyQqHighRiskAutoDisable() {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId || !isCurrentAccountQqValue())
    return

  const windowState = buildNormalizedQqHighRiskWindow(localSettings.value?.qqHighRiskWindow)
  const disabledAt = windowState.lastAutoDisabledAt
  if (!disabledAt)
    return

  const storageKey = getQqHighRiskAutoDisableSeenKey(accountId)
  const seenAt = Math.max(0, Number.parseInt(localStorage.getItem(storageKey) || '0', 10) || 0)
  if (disabledAt <= seenAt)
    return

  localStorage.setItem(storageKey, String(disabledAt))
  const accountLabel = String(currentAccountName.value || accountId)
  toast.warning(`账号 ${accountLabel} 的 QQ 高风险临时窗口已到期，相关高风险开关已自动关闭。`, 6000)
}

const defaultModeScope = {
  zoneScope: 'same_zone_only',
  requiresGameFriend: true,
  fallbackBehavior: 'standalone',
}

function resolveAccountZone(rawPlatform: any) {
  const platform = String(rawPlatform || '').trim().toLowerCase()
  if (platform === 'qq')
    return 'qq_zone'
  if (platform.startsWith('wx'))
    return 'wechat_zone'
  return 'unknown_zone'
}

function getAccountZoneLabel(zone: string) {
  if (zone === 'qq_zone')
    return 'QQ区'
  if (zone === 'wechat_zone')
    return '微信区'
  return '未识别区服'
}

const currentAccountZoneLabel = computed(() => {
  return getAccountZoneLabel(resolveAccountZone(currentAccountSnapshot.value?.platform))
})

const isCurrentAccountQq = computed(() => {
  return isCurrentAccountQqValue()
})

const qqHighRiskEnabledLabels = computed(() => {
  if (!isCurrentAccountQq.value)
    return []

  const enabled: string[] = []
  if (localSettings.value?.automation?.fertilizer_60s_anti_steal)
    enabled.push('60秒施肥(防偷)')
  if (localSettings.value?.automation?.fastHarvest)
    enabled.push('成熟秒收取')
  if (localSettings.value?.stakeoutSteal?.enabled)
    enabled.push('精准蹲守偷菜')
  if (localSettings.value?.automation?.qqFriendFetchMultiChain)
    enabled.push('QQ 多链路好友拉取')
  return enabled
})

function buildNormalizedQqHighRiskWindow(rawWindow: any) {
  const durationMinutes = Math.max(5, Math.min(180, Number.parseInt(String(rawWindow?.durationMinutes ?? 30), 10) || 30))
  return {
    durationMinutes,
    expiresAt: Math.max(0, Number.parseInt(String(rawWindow?.expiresAt ?? 0), 10) || 0),
    lastIssuedAt: Math.max(0, Number.parseInt(String(rawWindow?.lastIssuedAt ?? 0), 10) || 0),
    lastAutoDisabledAt: Math.max(0, Number.parseInt(String(rawWindow?.lastAutoDisabledAt ?? 0), 10) || 0),
  }
}

function formatQqHighRiskDateTime(value: any) {
  const timestamp = Math.max(0, Number(value) || 0)
  if (!timestamp)
    return '未激活'
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatQqHighRiskRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0)
    return `${hours}小时 ${String(minutes).padStart(2, '0')}分 ${String(seconds).padStart(2, '0')}秒`
  if (minutes > 0)
    return `${minutes}分 ${String(seconds).padStart(2, '0')}秒`
  return `${seconds}秒`
}

const qqHighRiskCountdownNow = ref(Date.now())
let qqHighRiskCountdownTimer: ReturnType<typeof window.setInterval> | null = null

const qqHighRiskRemainingMs = computed(() => {
  const windowState = buildNormalizedQqHighRiskWindow(localSettings.value?.qqHighRiskWindow)
  return Math.max(0, windowState.expiresAt - qqHighRiskCountdownNow.value)
})

const qqHighRiskRemainingText = computed(() => {
  if (qqHighRiskRemainingMs.value <= 0)
    return ''
  return formatQqHighRiskRemaining(qqHighRiskRemainingMs.value)
})

function shouldRunQqHighRiskCountdown() {
  if (!isCurrentAccountQq.value || typeof window === 'undefined')
    return false
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    return false
  return qqHighRiskRemainingMs.value > 0
}

function stopQqHighRiskCountdown() {
  if (qqHighRiskCountdownTimer !== null) {
    window.clearInterval(qqHighRiskCountdownTimer)
    qqHighRiskCountdownTimer = null
  }
}

function syncQqHighRiskCountdown() {
  qqHighRiskCountdownNow.value = Date.now()
  if (!shouldRunQqHighRiskCountdown()) {
    stopQqHighRiskCountdown()
    return
  }
  if (qqHighRiskCountdownTimer !== null)
    return

  qqHighRiskCountdownTimer = window.setInterval(() => {
    qqHighRiskCountdownNow.value = Date.now()
    if (!shouldRunQqHighRiskCountdown())
      stopQqHighRiskCountdown()
  }, 1000)
}

const qqHighRiskWindowStatusText = computed(() => {
  if (!isCurrentAccountQq.value)
    return ''

  const windowState = buildNormalizedQqHighRiskWindow(localSettings.value?.qqHighRiskWindow)
  const hasEnabledItems = qqHighRiskEnabledLabels.value.length > 0
  if (qqHighRiskRemainingMs.value > 0)
    return `当前临时窗口截止 ${formatQqHighRiskDateTime(windowState.expiresAt)}，剩余 ${qqHighRiskRemainingText.value}，到期后后端会自动关闭这 4 项。`
  if (hasEnabledItems)
    return `当前高风险项已开启，但没有有效临时窗口；后端会在下一次读取配置时自动回退为关闭。`
  if (windowState.lastAutoDisabledAt > 0)
    return `当前没有高风险项开启。最近一次自动回退时间：${formatQqHighRiskDateTime(windowState.lastAutoDisabledAt)}。`
  return `当前没有高风险项开启。新开启高风险项后，会获得 ${windowState.durationMinutes} 分钟的临时窗口。`
})

function buildNormalizedModeScope(rawScope: any) {
  return {
    ...defaultModeScope,
    ...(rawScope || {}),
    zoneScope: String(rawScope?.zoneScope || defaultModeScope.zoneScope),
    requiresGameFriend: rawScope?.requiresGameFriend !== false,
    fallbackBehavior: String(rawScope?.fallbackBehavior || defaultModeScope.fallbackBehavior),
  }
}

function resolveAccountMode(rawMode: any): 'main' | 'alt' | 'safe' {
  if (rawMode === 'alt' || rawMode === 'safe')
    return rawMode
  return 'main'
}

function resolveModeMeta(mode?: string) {
  if (mode === 'alt') {
    return {
      label: '小号',
      badge: 'settings-mode-badge ui-meta-chip--warning',
    }
  }
  if (mode === 'safe') {
    return {
      label: '避险',
      badge: 'settings-mode-badge ui-meta-chip--success',
    }
  }
  return {
    label: '主号',
    badge: 'settings-mode-badge ui-meta-chip--brand',
  }
}

function resolveEffectiveMode(rawMode: any): 'main' | 'alt' | 'safe' {
  if (rawMode === 'alt' || rawMode === 'safe')
    return rawMode
  return 'main'
}

function resolveDegradeReasonLabel(reason?: string) {
  const raw = String(reason || '').trim()
  if (raw === 'missing_mode_peer')
    return '未找到可协同的对端账号'
  if (raw === 'cross_zone_peer_only')
    return '仅存在跨区账号，未命中同区约束'
  if (raw === 'friend_relation_unknown')
    return '好友关系尚未完成预热'
  if (raw === 'not_game_friend')
    return '同 owner 对端账号不是游戏好友'
  return ''
}

function resolveNumberWithFallback(value: any, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getCurrentAccountBaseline() {
  const currentSettings = settings.value as any
  const acc = currentAccountSnapshot.value
  const rawHarvestDelay = acc?.harvestDelay || {}
  return {
    accountMode: resolveAccountMode(currentSettings?.accountMode || acc?.accountMode || acc?.account_mode),
    harvestDelay: {
      min: resolveNumberWithFallback(currentSettings?.harvestDelay?.min ?? rawHarvestDelay.min ?? acc?.harvest_delay_min, 0),
      max: resolveNumberWithFallback(currentSettings?.harvestDelay?.max ?? rawHarvestDelay.max ?? acc?.harvest_delay_max, 0),
    },
    riskPromptEnabled: currentSettings?.riskPromptEnabled !== false,
    modeScope: buildNormalizedModeScope(currentSettings?.modeScope),
  }
}

const defaultReportConfig = {
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

const defaultRedpacketConfig = {
  enabled: false,
  mode: 'daily' as 'daily' | 'notify' | 'hybrid',
  checkIntervalSec: 3600,
  notifyTriggeredEnabled: false,
  claimCooldownSec: 600,
}

const defaultBehaviorReportConfig = {
  enabled: false,
  startupSequenceEnabled: true,
  playTimeReportEnabled: true,
  flushIntervalSec: 10,
  maxBufferSize: 10,
}

const defaultProxyBindingConfig = {
  enabled: false,
  proxyId: '',
  fallbackToDirect: true,
}

const defaultExperimentalFeatures = {
  focusStealEnabled: false,
  tlogFlowReportEnabled: false,
  advancedRedpacketTriggerEnabled: false,
}

const defaultBugReportConfig: BugReportConfig = {
  enabled: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  smtpPassConfigured: false,
  emailFrom: '',
  emailTo: '',
  subjectPrefix: '[BUG反馈]',
  includeFrontendErrors: true,
  includeSystemLogs: true,
  includeRuntimeLogs: true,
  includeAccountLogs: true,
  systemLogLimit: 50,
  runtimeLogLimit: 40,
  accountLogLimit: 20,
  frontendErrorLimit: 10,
  maxBodyLength: 50000,
  cooldownSeconds: 180,
  saveToDatabase: true,
  allowNonAdminSubmit: true,
}

const defaultIntervals = {
  farmMin: 30,
  farmMax: 200,
  friendMin: 60,
  friendMax: 180,
  helpMin: 60,
  helpMax: 180,
  stealMin: 60,
  stealMax: 180,
}

const defaultFriendQuietHours = {
  enabled: false,
  start: '23:00',
  end: '07:00',
}

const defaultStakeoutSteal = {
  enabled: false,
  delaySec: 3,
}

const defaultQqHighRiskWindow = {
  durationMinutes: 30,
  expiresAt: 0,
  lastIssuedAt: 0,
  lastAutoDisabledAt: 0,
}

const defaultAutomationConfig = {
  farm: false,
  task: false,
  sell: false,
  friend: false,
  farm_push: false,
  land_upgrade: false,
  landUpgradeTarget: 6,
  friend_steal: false,
  friend_help: false,
  friend_bad: false,
  friend_help_exp_limit: false,
  email: false,
  fertilizer_gift: false,
  fertilizer_buy: false,
  fertilizer_buy_limit: 100,
  fertilizer_buy_type: 'organic',
  fertilizer_buy_mode: 'unlimited',
  fertilizer_buy_threshold_normal: 24,
  fertilizer_buy_threshold_organic: 24,
  free_gifts: false,
  share_reward: false,
  vip_gift: false,
  month_card: false,
  open_server_gift: false,
  fertilizer: 'none',
  stealFilterEnabled: false,
  stealFilterMode: 'blacklist',
  stealFilterPlantIds: [] as number[],
  stealFriendFilterEnabled: false,
  stealFriendFilterMode: 'blacklist',
  stealFriendFilterIds: [] as number[],
  friend_auto_accept: false,
  qqFriendFetchMultiChain: false,
  fertilizer_60s_anti_steal: false,
  fertilizer_smart_phase: false,
  fastHarvest: false,
  forceGetAllEnabled: false,
}

function buildNormalizedAutomationConfig(rawAutomation: any) {
  return {
    ...defaultAutomationConfig,
    ...(rawAutomation || {}),
    stealFilterPlantIds: Array.isArray(rawAutomation?.stealFilterPlantIds) ? [...rawAutomation.stealFilterPlantIds] : [],
    stealFriendFilterIds: Array.isArray(rawAutomation?.stealFriendFilterIds) ? [...rawAutomation.stealFriendFilterIds] : [],
  }
}

function buildAccountSettingsStateFromSources() {
  const currentSettings = settings.value as any
  const accountBaseline = getCurrentAccountBaseline()
  return {
    accountMode: accountBaseline.accountMode,
    harvestDelay: accountBaseline.harvestDelay,
    riskPromptEnabled: accountBaseline.riskPromptEnabled,
    modeScope: accountBaseline.modeScope,
    plantingStrategy: currentSettings?.plantingStrategy || 'preferred',
    plantingFallbackStrategy: currentSettings?.plantingFallbackStrategy || 'level',
    preferredSeedId: currentSettings?.preferredSeedId || 0,
    bagSeedPriority: Array.isArray(currentSettings?.bagSeedPriority) ? [...currentSettings.bagSeedPriority] : [],
    bagSeedFallbackStrategy: currentSettings?.bagSeedFallbackStrategy || 'level',
    inventoryPlanting: buildNormalizedInventoryPlantingConfig(currentSettings?.inventoryPlanting),
    intervals: {
      ...defaultIntervals,
      ...(currentSettings?.intervals || {}),
    },
    friendQuietHours: {
      ...defaultFriendQuietHours,
      ...(currentSettings?.friendQuietHours || {}),
    },
    stakeoutSteal: {
      ...defaultStakeoutSteal,
      ...((currentSettings?.stakeoutSteal) || {}),
    },
    qqHighRiskWindow: buildNormalizedQqHighRiskWindow(currentSettings?.qqHighRiskWindow),
    tradeConfig: normalizeTradeConfig(currentSettings?.tradeConfig),
    reportConfig: {
      ...defaultReportConfig,
      ...((currentSettings?.reportConfig) || {}),
    },
    redpacketConfig: {
      ...defaultRedpacketConfig,
      ...((currentSettings?.redpacketConfig) || {}),
    },
    behaviorReportConfig: {
      ...defaultBehaviorReportConfig,
      ...((currentSettings?.behaviorReportConfig) || {}),
    },
    experimentalFeatures: {
      ...defaultExperimentalFeatures,
      ...((currentSettings?.experimentalFeatures) || {}),
    },
    proxyBindingConfig: {
      ...defaultProxyBindingConfig,
      ...((currentSettings?.proxyBindingConfig) || {}),
    },
    automation: buildNormalizedAutomationConfig(currentSettings?.automation),
  }
}

function buildSettingsPayloadFromState(state: any, keepFruitIdsSource?: any) {
  const payload = JSON.parse(JSON.stringify(state || {}))
  const ids = normalizeTradeKeepFruitIds(keepFruitIdsSource ?? payload?.tradeConfig?.sell?.keepFruitIds)
  const bagSeedPriority = Array.isArray(payload?.bagSeedPriority)
    ? payload.bagSeedPriority
        .map((seedId: any) => Math.max(0, Number.parseInt(String(seedId), 10) || 0))
        .filter((seedId: number, index: number, arr: number[]) => seedId > 0 && arr.indexOf(seedId) === index)
    : []

  payload.accountMode = resolveAccountMode(payload.accountMode)
  payload.riskPromptEnabled = payload.riskPromptEnabled !== false
  payload.modeScope = buildNormalizedModeScope(payload.modeScope)
  payload.harvestDelay = {
    min: resolveNumberWithFallback(payload?.harvestDelay?.min, 0),
    max: resolveNumberWithFallback(payload?.harvestDelay?.max, 0),
  }
  payload.plantingStrategy = String(payload?.plantingStrategy || 'preferred')
  payload.plantingFallbackStrategy = String(payload?.plantingFallbackStrategy || 'level')
  payload.bagSeedPriority = bagSeedPriority
  payload.bagSeedFallbackStrategy = String(payload?.bagSeedFallbackStrategy || 'level')
  payload.inventoryPlanting = buildNormalizedInventoryPlantingConfig(payload?.inventoryPlanting)
  payload.intervals = {
    ...defaultIntervals,
    ...(payload.intervals || {}),
  }
  payload.friendQuietHours = {
    ...defaultFriendQuietHours,
    ...(payload.friendQuietHours || {}),
  }
  payload.stakeoutSteal = {
    ...defaultStakeoutSteal,
    ...(payload.stakeoutSteal || {}),
  }
  payload.qqHighRiskWindow = {
    durationMinutes: buildNormalizedQqHighRiskWindow(payload.qqHighRiskWindow).durationMinutes,
  }
  payload.tradeConfig = normalizeTradeConfig(payload.tradeConfig)
  payload.tradeConfig.sell.keepFruitIds = ids
  payload.reportConfig = {
    ...defaultReportConfig,
    ...(payload.reportConfig || {}),
  }
  payload.redpacketConfig = {
    ...defaultRedpacketConfig,
    ...(payload.redpacketConfig || {}),
  }
  payload.behaviorReportConfig = {
    ...defaultBehaviorReportConfig,
    ...(payload.behaviorReportConfig || {}),
  }
  payload.experimentalFeatures = {
    ...defaultExperimentalFeatures,
    ...(payload.experimentalFeatures || {}),
  }
  payload.proxyBindingConfig = {
    ...defaultProxyBindingConfig,
    ...(payload.proxyBindingConfig || {}),
  }
  payload.automation = buildNormalizedAutomationConfig(payload.automation)
  return payload
}

const reportModeOptions = [
  { label: '全部类型', value: 'all' },
  { label: '测试汇报', value: 'test' },
  { label: '小时汇报', value: 'hourly' },
  { label: '日报', value: 'daily' },
]

const reportStatusOptions = [
  { label: '全部结果', value: 'all' },
  { label: '仅成功', value: 'success' },
  { label: '仅失败', value: 'failed' },
]

const reportSortOrderOptions = [
  { label: '最新优先', value: 'desc' },
  { label: '最早优先', value: 'asc' },
]

const defaultInventoryPlanting = {
  mode: 'disabled' as 'disabled' | 'prefer_inventory' | 'inventory_only',
  globalKeepCount: 0,
  reserveRules: [] as Array<{ seedId: number, keepCount: number }>,
}

function buildNormalizedInventoryPlantingConfig(input: any) {
  const raw = input && typeof input === 'object' ? input : {}
  const reserveRules = Array.isArray(raw.reserveRules)
    ? raw.reserveRules
        .map((rule: any) => ({
          seedId: resolveNumberWithFallback(rule?.seedId, 0),
          keepCount: resolveNumberWithFallback(rule?.keepCount, 0),
        }))
        .filter((rule: any) => rule.seedId > 0)
    : []
  const seen = new Set<number>()
  return {
    mode: ['disabled', 'prefer_inventory', 'inventory_only'].includes(String(raw.mode))
      ? String(raw.mode) as 'disabled' | 'prefer_inventory' | 'inventory_only'
      : defaultInventoryPlanting.mode,
    globalKeepCount: resolveNumberWithFallback(raw.globalKeepCount, 0),
    reserveRules: reserveRules.filter((rule: any) => {
      if (seen.has(rule.seedId))
        return false
      seen.add(rule.seedId)
      return true
    }),
  }
}

const selectedReportLogCount = computed(() => selectedReportLogIds.value.length)
const allVisibleReportLogsSelected = computed(() => (
  reportLogs.value.length > 0
  && reportLogs.value.every(item => selectedReportLogIds.value.includes(item.id))
))

localSettings.value = {
  accountMode: 'main' as 'main' | 'alt' | 'safe',
  harvestDelay: { min: 0, max: 0 },
  riskPromptEnabled: true,
  modeScope: { ...defaultModeScope },
  plantingStrategy: 'preferred',
  plantingFallbackStrategy: 'level',
  preferredSeedId: 0,
  bagSeedPriority: [] as number[],
  bagSeedFallbackStrategy: 'level',
  inventoryPlanting: { ...defaultInventoryPlanting, reserveRules: [] as Array<{ seedId: number, keepCount: number }> },
  intervals: { ...defaultIntervals },
  friendQuietHours: { ...defaultFriendQuietHours },
  stakeoutSteal: { ...defaultStakeoutSteal },
  qqHighRiskWindow: { ...defaultQqHighRiskWindow },
  tradeConfig: createDefaultTradeConfig(),
  reportConfig: { ...defaultReportConfig },
  redpacketConfig: { ...defaultRedpacketConfig },
  behaviorReportConfig: { ...defaultBehaviorReportConfig },
  experimentalFeatures: { ...defaultExperimentalFeatures },
  proxyBindingConfig: { ...defaultProxyBindingConfig },
  automation: {
    ...defaultAutomationConfig,
    stealFilterPlantIds: [...defaultAutomationConfig.stealFilterPlantIds],
    stealFriendFilterIds: [...defaultAutomationConfig.stealFriendFilterIds],
  },
}
const tradeKeepFruitIdsText = ref('')

const currentModeExecutionMeta = computed(() => {
  const acc = currentAccountSnapshot.value as any
  const configuredMode = resolveAccountMode(localSettings.value?.accountMode || acc?.accountMode || acc?.account_mode)
  const effectiveMode = resolveEffectiveMode(acc?.effectiveMode || configuredMode)
  const configuredMeta = resolveModeMeta(configuredMode)
  const effectiveMeta = resolveModeMeta(effectiveMode)
  const backendLabel = String(acc?.degradeReasonLabel || '').trim()
  const degradeLabel = backendLabel || resolveDegradeReasonLabel(acc?.degradeReason)

  if (acc?.collaborationEnabled) {
    return {
      configuredMeta,
      effectiveMeta,
      statusBadge: {
        label: '协同命中',
        badge: 'settings-mode-badge ui-meta-chip--info',
      },
      note: '同区 / 游戏好友约束已命中',
      noteClass: 'settings-mode-note-info',
    }
  }

  if (degradeLabel || effectiveMode !== configuredMode) {
    return {
      configuredMeta,
      effectiveMeta,
      statusBadge: {
        label: '独立执行',
        badge: effectiveMode !== configuredMode
          ? 'settings-mode-badge ui-meta-chip--warning'
          : 'settings-mode-badge ui-meta-chip--neutral',
      },
      note: degradeLabel || '当前已按更保守模式执行',
      noteClass: effectiveMode !== configuredMode
        ? 'settings-mode-note-warning'
        : 'settings-mode-note-muted',
    }
  }

  return {
    configuredMeta,
    effectiveMeta,
    statusBadge: null,
    note: '当前运行模式与配置一致',
    noteClass: 'glass-text-muted',
  }
})

const localOffline = ref({
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '',
  msg: '',
  offlineDeleteEnabled: false,
  offlineDeleteSec: 1,
  webhookCustomJsonEnabled: false,
  webhookCustomJsonTemplate: '',
})
const localBugReport = ref<BugReportConfig>({ ...defaultBugReportConfig })

const localTiming = ref({
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
  humanModeEnabled: true,
  humanModeIntensity: 'medium',
  schedulerJitterRatio: 0.12,
  interTaskDelayMinMs: 250,
  interTaskDelayMaxMs: 900,
  restIntervalMinMs: 45 * 60 * 1000,
  restIntervalMaxMs: 90 * 60 * 1000,
  restDurationMinMs: 2 * 60 * 1000,
  restDurationMaxMs: 8 * 60 * 1000,
  eventTriggerDebounceMs: 600,
})

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})
const sessionStatus = ref<SessionStatusSnapshot | null>(null)
const sessionStatusLoading = ref(false)
const sessionStatusNow = ref(Date.now())
let sessionStatusTimer: ReturnType<typeof setInterval> | null = null

function syncLocalSettings() {
  if (settings.value) {
    localSettings.value = JSON.parse(JSON.stringify(buildAccountSettingsStateFromSources()))
    tradeKeepFruitIdsText.value = ((localSettings.value.tradeConfig.sell.keepFruitIds || []) as number[]).join(', ')

    // Sync offline settings (global)
    if (settings.value.offlineReminder) {
      localOffline.value = JSON.parse(JSON.stringify(settings.value.offlineReminder))
      localOffline.value.offlineDeleteEnabled = !!localOffline.value.offlineDeleteEnabled
      localOffline.value.offlineDeleteSec = Math.max(1, Number(localOffline.value.offlineDeleteSec || 1))
      localOffline.value.webhookCustomJsonEnabled = !!localOffline.value.webhookCustomJsonEnabled
      localOffline.value.webhookCustomJsonTemplate = String(localOffline.value.webhookCustomJsonTemplate || '')
    }
  }
}

function normalizeSessionStatus(input: any): SessionStatusSnapshot | null {
  const next = (input && typeof input === 'object') ? input : null
  if (!next)
    return null
  return {
    authenticated: !!next.authenticated,
    username: String(next.username || '').trim(),
    role: String(next.role || '').trim(),
    accessIssuedAt: Math.max(0, Number(next.accessIssuedAt || 0)),
    accessExpiresAt: Math.max(0, Number(next.accessExpiresAt || 0)),
    accessRemainingSec: Math.max(0, Number(next.accessRemainingSec || 0)),
    refreshIssuedAt: Math.max(0, Number(next.refreshIssuedAt || 0)),
    refreshExpiresAt: Math.max(0, Number(next.refreshExpiresAt || 0)),
    refreshRemainingSec: Math.max(0, Number(next.refreshRemainingSec || 0)),
    needsRefreshSoon: !!next.needsRefreshSoon,
    checkedAt: Math.max(0, Number(next.checkedAt || Date.now())),
  }
}

function formatSessionDuration(seconds: number) {
  if (seconds <= 0)
    return '已过期'
  const day = Math.floor(seconds / 86400)
  const hour = Math.floor((seconds % 86400) / 3600)
  const minute = Math.floor((seconds % 3600) / 60)
  if (day > 0)
    return `${day}天${hour}小时`
  if (hour > 0)
    return `${hour}小时${minute}分钟`
  if (minute > 0)
    return `${minute}分钟`
  return `${seconds}秒`
}

function getLiveSessionRemainingSec(expiresAt: number, fallbackSec: number) {
  const target = Math.max(0, Number(expiresAt || 0))
  if (target > 0)
    return Math.max(0, Math.ceil((target - sessionStatusNow.value) / 1000))
  return Math.max(0, Number(fallbackSec || 0))
}

const sessionAccessRemainingSec = computed(() =>
  getLiveSessionRemainingSec(sessionStatus.value?.accessExpiresAt || 0, sessionStatus.value?.accessRemainingSec || 0),
)

const sessionRefreshRemainingSec = computed(() =>
  getLiveSessionRemainingSec(sessionStatus.value?.refreshExpiresAt || 0, sessionStatus.value?.refreshRemainingSec || 0),
)

const sessionStatusCards = computed(() => {
  const status = sessionStatus.value
  const baseCards = [
    {
      key: 'access',
      label: '访问令牌',
      value: sessionStatusLoading.value ? '同步中' : formatSessionDuration(sessionAccessRemainingSec.value),
      hint: status?.accessExpiresAt
        ? `到期时间 ${new Date(status.accessExpiresAt).toLocaleString()}`
        : '当前未拿到访问令牌到期时间',
      tone: status?.needsRefreshSoon ? 'settings-report-card-tone-warning' : 'settings-report-card-tone-main',
      bg: status?.needsRefreshSoon ? 'settings-report-card-bg-warning' : 'settings-report-card-tone-surface',
    },
    {
      key: 'refresh',
      label: '刷新令牌',
      value: sessionStatusLoading.value ? '同步中' : formatSessionDuration(sessionRefreshRemainingSec.value),
      hint: status?.refreshExpiresAt
        ? `到期时间 ${new Date(status.refreshExpiresAt).toLocaleString()}`
        : '当前未拿到刷新令牌到期时间',
      tone: 'settings-report-card-tone-info',
      bg: 'settings-report-card-bg-info',
    },
    {
      key: 'state',
      label: '登录状态',
      value: status?.authenticated ? (status.needsRefreshSoon ? '即将续期' : '在线') : (sessionStatusLoading.value ? '同步中' : '未知'),
      hint: status?.checkedAt
        ? `最近检查 ${new Date(status.checkedAt).toLocaleTimeString()}`
        : '页面会自动同步会话状态',
      tone: status?.authenticated ? (status.needsRefreshSoon ? 'settings-report-card-tone-warning' : 'settings-report-card-tone-success') : 'settings-report-card-tone-muted',
      bg: status?.authenticated ? (status.needsRefreshSoon ? 'settings-report-card-bg-warning' : 'settings-report-card-bg-success') : 'settings-report-card-tone-surface',
    },
  ]
  return baseCards
})

async function loadSessionStatus() {
  if (!currentUsername.value) {
    sessionStatus.value = null
    return
  }
  sessionStatusLoading.value = true
  try {
    const res = await api.get('/api/auth/session-status')
    if (res.data?.ok)
      sessionStatus.value = normalizeSessionStatus(res.data.data)
  }
  catch (error) {
    console.warn('获取会话状态失败', error)
  }
  finally {
    sessionStatusLoading.value = false
    sessionStatusNow.value = Date.now()
  }
}

function handleSessionStatusRefresh(event: Event) {
  const detail = (event as CustomEvent).detail
  const normalized = normalizeSessionStatus(detail)
  if (normalized)
    sessionStatus.value = normalized
  else
    void loadSessionStatus()
  sessionStatusNow.value = Date.now()
}

function startSessionStatusTicker() {
  if (sessionStatusTimer !== null || typeof window === 'undefined')
    return
  sessionStatusTimer = window.setInterval(() => {
    sessionStatusNow.value = Date.now()
  }, 15000)
}

function stopSessionStatusTicker() {
  if (sessionStatusTimer !== null) {
    window.clearInterval(sessionStatusTimer)
    sessionStatusTimer = null
  }
}

async function loadBugReportConfig() {
  if (!isAdmin.value) {
    localBugReport.value = { ...defaultBugReportConfig }
    return
  }

  const res = await settingStore.fetchBugReportConfig()
  if (res.ok && res.data) {
    localBugReport.value = {
      ...defaultBugReportConfig,
      ...res.data,
    }
    return
  }

  localBugReport.value = { ...defaultBugReportConfig }
  showAlert(`问题反馈配置加载失败: ${res.error || '未知错误'}`, 'danger')
}

function buildSettingsPayload() {
  return buildSettingsPayloadFromState(localSettings.value, tradeKeepFruitIdsText.value)
}

// 策略预设应用函数
function applyPreset(type: 'conservative' | 'balanced' | 'aggressive') {
  if (!window.window.confirm('应用预设将覆盖当前页面的配置（不会改变过滤名单），应用后请点击“保存”以生效。是否继续？')) {
    return
  }

  // 基础共用配置 (3 种模板共同开启项)
  const baseAutomation = {
    farm: true,
    task: true,
    sell: true,
    friend: true,
    farm_push: true,
    email: true,
    free_gifts: true,
    share_reward: true,
    vip_gift: true,
    month_card: true,
    open_server_gift: true,
    fertilizer_gift: true,
    fertilizer_buy: true,
    friend_steal: true,
    friend_help: true,
    friend_help_exp_limit: true,
  }

  if (type === 'conservative') {
    localSettings.value.intervals = {
      ...defaultIntervals,
      farmMin: 300,
      farmMax: 600,
      friendMin: 900,
      friendMax: 1200,
      helpMin: 900,
      helpMax: 1200,
      stealMin: 900,
      stealMax: 1200,
    }
    localSettings.value.friendQuietHours = { enabled: true, start: '23:00', end: '07:00' }
    localSettings.value.automation = {
      ...localSettings.value.automation,
      ...baseAutomation,
      fertilizer: 'normal',
      friend_bad: false,
      stealFilterEnabled: false,
      stealFriendFilterEnabled: false,
    }
    showAlert('已应用【保守配置】：最高安全性，建议主号使用。', 'primary')
  }
  else if (type === 'balanced') {
    localSettings.value.intervals = {
      ...defaultIntervals,
      farmMin: 180,
      farmMax: 300,
      friendMin: 600,
      friendMax: 900,
      helpMin: 600,
      helpMax: 900,
      stealMin: 600,
      stealMax: 900,
    }
    localSettings.value.friendQuietHours = { enabled: true, start: '23:00', end: '07:00' }
    localSettings.value.automation = {
      ...localSettings.value.automation,
      ...baseAutomation,
      fertilizer: 'both',
      friend_bad: false,
      stealFilterEnabled: true,
      stealFilterMode: 'blacklist',
      stealFriendFilterEnabled: true,
      stealFriendFilterMode: 'blacklist',
    }
    showAlert('已应用【平衡配置】：兼顾收益与安全，强烈推荐！', 'primary')
  }
  else if (type === 'aggressive') {
    localSettings.value.intervals = {
      ...defaultIntervals,
      farmMin: 120,
      farmMax: 180,
      friendMin: 300,
      friendMax: 600,
      helpMin: 300,
      helpMax: 600,
      stealMin: 300,
      stealMax: 600,
    }
    localSettings.value.friendQuietHours = { enabled: true, start: '00:00', end: '06:00' }
    localSettings.value.automation = {
      ...localSettings.value.automation,
      ...baseAutomation,
      fertilizer: 'both',
      friend_bad: true,
      stealFilterEnabled: true,
      stealFilterMode: 'whitelist',
      stealFriendFilterEnabled: true,
      stealFriendFilterMode: 'whitelist',
    }
    showAlert('已应用【激进配置】：极大提升收益，但也有极高风险，请谨慎点击保存。', 'primary')
  }
}

const safeChecking = ref(false)
async function handleSafeCheck() {
  if (!currentAccountId.value)
    return
  // TODO: remove confirm
  if (window.window.confirm(`是否分析当前账号的历史封禁日志并自动补充黑名单？`)) {
    try {
      safeChecking.value = true
      const res = await accountStore.applySafeModeBlacklist(currentAccountId.value)
      if (res && res.ok && res.data && res.data.length >= 0) {
        showAlert(`一键分析完成！\n新增了 ${res.data.length} 个风险账号到黑名单。\n${res.data.join(', ')}`)
      }
      else {
        showAlert('暂无新增记录。')
      }
    }
    catch (e: any) {
      showAlert(`分析失败: ${e.message}`, 'danger')
    }
    finally {
      safeChecking.value = false
    }
  }
}

async function loadData() {
  await loadSessionStatus()
  if (currentAccountId.value) {
    await settingStore.fetchSettings(currentAccountId.value)
    await refreshReportLogs()
    syncLocalSettings()
    maybeNotifyQqHighRiskAutoDisable()
    // Always fetch seeds to ensure correct locked status for current account
    await Promise.allSettled([
      farmStore.fetchSeeds(currentAccountId.value),
      farmStore.fetchPlantableBagSeeds(currentAccountId.value, {
        includeZeroUsable: true,
        includeLocked: true,
      }),
    ])
    // 好友过滤已开启时自动拉取好友列表
    if (localSettings.value.automation.stealFriendFilterEnabled && friends.value.length === 0) {
      friendStore.fetchFriends(currentAccountId.value)
    }
  }
  else {
    seeds.value = []
    bagSeeds.value = []
    reportLogs.value = []
    reportLogPagination.value = { page: 1, pageSize: reportPageSize.value || 3, total: 0, totalPages: 1 }
    await settingStore.fetchReportLogStats('')
  }
  // 管理员加载体验卡配置
  loadTrialConfig()
  loadThirdPartyApiConfig()
  if (isAdmin.value) {
    await loadBugReportConfig()
    loadTimingConfig()
    loadClusterConfig()
    loadPlatformCapabilities()
    loadExternalApiClients()
    loadProxyPoolRecords()
    loadSystemUpdateData()
    loadSystemSettingsHealth()
    loadExtendedHealthSnapshots()
    loadQqFriendDiagnostics()
  }
  else {
    localBugReport.value = { ...defaultBugReportConfig }
    systemUpdateOverview.value = null
    systemUpdateJobs.value = []
    systemHealthSnapshot.value = null
    systemHealthError.value = ''
    dependencyHealthSnapshot.value = null
    runtimeHealthSnapshot.value = null
    serviceProfileSnapshot.value = null
    statsSummarySnapshot.value = null
    extendedHealthError.value = ''
    externalApiClients.value = []
    externalApiLastPlainToken.value = ''
    platformCapabilities.value = JSON.parse(JSON.stringify(defaultPlatformCapabilities))
    proxyPoolRecords.value = []
    qqFriendDiagnosticsSnapshot.value = null
    qqFriendDiagnosticsError.value = ''
  }
}

onMounted(async () => {
  await hydrateReportHistoryViewState()
  await loadData()
  enableReportHistoryViewSync()
  startSystemUpdateAutoRefresh()
  startSessionStatusTicker()
  if (typeof window !== 'undefined')
    window.addEventListener('auth-session-refreshed', handleSessionStatusRefresh as EventListener)
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', syncQqHighRiskCountdown)
  syncQqHighRiskCountdown()
})

onBeforeUnmount(() => {
  stopSystemUpdateAutoRefresh()
  stopQqHighRiskCountdown()
  stopSessionStatusTicker()
  if (typeof window !== 'undefined')
    window.removeEventListener('auth-session-refreshed', handleSessionStatusRefresh as EventListener)
  if (typeof document !== 'undefined')
    document.removeEventListener('visibilitychange', syncQqHighRiskCountdown)
})

// 【关键修复】仅监听 accountId 字符串值，而非 currentAccount 对象引用
// 原因：Sidebar 每 10 秒轮询 fetchAccounts() 会替换 accounts 数组，
// 导致 currentAccount computed 返回新对象引用（即使数据内容相同），
// 从而误触发 loadData()，引发页面闪烁和滚动位置重置
watch(() => currentAccountId.value, () => {
  expandedReportLogIds.value = []
  selectedReportLogIds.value = []
  closeReportLogDetail()
  loadData()
})

watch(
  () => [
    currentAccountId.value,
    isCurrentAccountQq.value,
    buildNormalizedQqHighRiskWindow(localSettings.value?.qqHighRiskWindow).expiresAt,
  ],
  () => {
    syncQqHighRiskCountdown()
  },
)

watch(() => isAdmin.value, (enabled) => {
  if (enabled)
    startSystemUpdateAutoRefresh()
  else
    stopSystemUpdateAutoRefresh()
}, { immediate: false })

// 好友过滤开关切换时自动加载好友列表
watch(() => localSettings.value.automation.stealFriendFilterEnabled, (enabled) => {
  if (enabled && currentAccountId.value && friends.value.length === 0) {
    friendStore.fetchFriends(currentAccountId.value)
  }
})

const accountModeOptions = [
  { label: '主号模式', value: 'main' },
  { label: '小号模式', value: 'alt' },
  { label: '风险规避', value: 'safe' },
]

const fertilizerOptions = [
  { label: '普通 + 有机', value: 'both', description: '极速成长与改良双管齐下，全包化肥方案。' },
  { label: '仅普通化肥', value: 'normal', description: '仅在防偷等关键时刻加速生长，节约高阶成本。' },
  { label: '仅有机化肥', value: 'organic', description: '优先消耗可循环产出的有机肥改善土壤。' },
  { label: '不施肥', value: 'none', description: '佛系种植，绝不消耗任何额外物资。' },
]

const fertilizerScopeText = computed(() => {
  const mode = String(localSettings.value?.automation?.fertilizer || 'none')
  if (mode === 'none')
    return '范围：不施肥，不会选择任何地块。'
  if (mode === 'organic')
    return '范围：全农场已种植地块（循环有机施肥）。'
  if (mode === 'normal')
    return '范围：本轮新种植地块（普通肥补一次）。'
  return '范围：普通肥用于本轮新种植地块；有机肥用于全农场已种植地块。'
})

const plantingStrategyOptions = [
  { label: '背包种子优先', value: 'bag_priority' },
  { label: '优先种植种子', value: 'preferred' },
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
]

const bagSeedFallbackStrategyOptions = plantingStrategyOptions.filter(option => option.value !== 'bag_priority')

const plantingFallbackStrategyOptions = [
  { label: '回退最高等级', value: 'level' },
  { label: '回退优先种子', value: 'preferred' },
  { label: '回退最低成本', value: 'cheapest' },
  { label: '暂停本轮种植', value: 'pause' },
]

const inventoryPlantingModeOptions = [
  { label: '关闭库存优先', value: 'disabled' },
  { label: '优先消耗库存', value: 'prefer_inventory' },
  { label: '仅使用库存', value: 'inventory_only' },
]

const fertilizerBuyTypeOptions = [
  { label: '仅有机化肥', value: 'organic', description: '只补有机肥容器，保持土壤收益循环。' },
  { label: '仅普通化肥', value: 'normal', description: '只补普通肥容器，偏向成熟提速。' },
  { label: '普通 + 有机', value: 'both', description: '两个容器都纳入自动购买，低余量优先补。' },
]

const fertilizerBuyModeOptions = [
  { label: '按阈值触发', value: 'threshold', description: '低于设定小时数才购买，适合精细控量。' },
  { label: '持续补满容器', value: 'unlimited', description: '忽略阈值，尽量把目标容器持续补满。' },
]

const rareKeepJudgeOptions = [
  { label: '任一条件命中', value: 'either' },
  { label: '按作物等级', value: 'plant_level' },
  { label: '按果实单价', value: 'unit_price' },
]

const filterModeOptions = [
  { label: '黑名单', value: 'blacklist' },
  { label: '白名单', value: 'whitelist' },
]

const channelOptions = [
  { label: 'Webhook(自定义接口)', value: 'webhook' },
  { label: 'Qmsg 酱', value: 'qmsg' },
  { label: 'Server 酱', value: 'serverchan' },
  { label: 'Push Plus', value: 'pushplus' },
  { label: 'Push Plus Hxtrip', value: 'pushplushxtrip' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '企业微信', value: 'wecom' },
  { label: 'Bark', value: 'bark' },
  { label: 'Go-cqhttp', value: 'gocqhttp' },
  { label: 'OneBot', value: 'onebot' },
  { label: 'Atri', value: 'atri' },
  { label: 'PushDeer', value: 'pushdeer' },
  { label: 'iGot', value: 'igot' },
  { label: 'Telegram', value: 'telegram' },
  { label: '飞书', value: 'feishu' },
  { label: 'IFTTT', value: 'ifttt' },
  { label: '企业微信群机器人', value: 'wecombot' },
  { label: 'Discord', value: 'discord' },
  { label: 'WxPusher', value: 'wxpusher' },
]

const reportChannelOptions = [
  ...channelOptions,
  { label: '邮件 (SMTP)', value: 'email' },
]

const reloginUrlModeOptions = [
  { label: '不需要', value: 'none' },
  { label: 'QQ直链', value: 'qq_link' },
  { label: '二维码图片', value: 'qr_code' },
  { label: '直链 + 二维码', value: 'all' },
]

// 推送渠道官方文档链接
const CHANNEL_DOCS: Record<string, string> = {
  webhook: '',
  qmsg: 'https://qmsg.zendee.cn',
  serverchan: 'https://sct.ftqq.com',
  pushplus: 'https://www.pushplus.plus',
  pushplushxtrip: 'https://pushplus.hxtrip.com',
  dingtalk: 'https://open.dingtalk.com/document/robots/custom-robot-access',
  wecom: 'https://developer.work.weixin.qq.com/document/path/90236',
  bark: 'https://bark.day.app',
  gocqhttp: 'https://docs.go-cqhttp.org',
  onebot: 'https://onebot.dev',
  atri: '',
  pushdeer: 'https://pushdeer.com',
  igot: 'https://igot.getui.com',
  telegram: 'https://core.telegram.org/bots/api',
  feishu: 'https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot',
  ifttt: 'https://ifttt.com',
  wecombot: 'https://developer.work.weixin.qq.com/document/path/91770',
  discord: 'https://discord.com/developers/docs/resources/webhook',
  wxpusher: 'https://wxpusher.zjiecode.com',
}

const channelDocUrl = computed(() => {
  return CHANNEL_DOCS[localOffline.value.channel] || ''
})

const reportChannelDocUrl = computed(() => {
  return CHANNEL_DOCS[localSettings.value.reportConfig.channel] || ''
})

const isReportEmailChannel = computed(() => localSettings.value.reportConfig.channel === 'email')

const noticeQuickOverviewItems = computed(() => {
  const offlineChannelLabel = isAdmin.value
    ? (channelOptions.find(option => option.value === localOffline.value.channel)?.label || '未设置')
    : '仅管理员'
  const reportEnabledLabel = currentAccountId.value
    ? (localSettings.value.reportConfig.enabled ? '已启用' : '已关闭')
    : '未登录账号'
  const reportChannelLabel = currentAccountId.value
    ? (reportChannelOptions.find(option => option.value === localSettings.value.reportConfig.channel)?.label || '未设置')
    : '不可用'

  return [
    {
      key: 'offline-channel',
      label: '下线提醒',
      value: offlineChannelLabel,
      note: isAdmin.value ? '全局提醒渠道' : '无权限修改',
    },
    {
      key: 'report-enabled',
      label: '经营汇报',
      value: reportEnabledLabel,
      note: currentAccountId.value ? '当前账号级开关' : '登录账号后可配置',
    },
    {
      key: 'report-channel',
      label: '汇报渠道',
      value: reportChannelLabel,
      note: currentAccountId.value ? '当前账号推送通道' : '当前不可配置',
    },
    {
      key: 'detail-mode',
      label: '显示层级',
      value: noticeDetailExpanded.value ? '详细模式' : '快捷模式',
      note: noticeHasDetailPanels.value ? '可展开详细面板' : '当前仅快捷项',
    },
  ]
})

const preferredSeedOptions = computed(() => {
  const options = [{ label: '自动选择', value: 0 }]
  if (seeds.value) {
    options.push(...seeds.value.map(seed => ({
      label: `${seed.requiredLevel}级 ${seed.name} (${seed.price}金)`,
      value: seed.seedId,
      disabled: seed.locked || seed.soldOut,
    })))
  }
  return options
})

const inventoryReserveSeedOptions = computed(() => {
  if (!seeds.value)
    return []
  return seeds.value.map(seed => ({
    label: `${seed.requiredLevel}级 ${seed.name}`,
    value: seed.seedId,
  }))
})

function normalizeBagSeedPriorityIds(seedIds: any) {
  const seen = new Set<number>()
  return (Array.isArray(seedIds) ? seedIds : [])
    .map(seedId => Number.parseInt(String(seedId), 10) || 0)
    .filter((seedId) => {
      if (seedId <= 0 || seen.has(seedId))
        return false
      seen.add(seedId)
      return true
    })
}

function compareBagSeedsRecommended(a: any, b: any) {
  return (
    Number(b?.requiredLevel || 0) - Number(a?.requiredLevel || 0)
    || Number(b?.plantSize || 1) - Number(a?.plantSize || 1)
    || Number(b?.usableCount || 0) - Number(a?.usableCount || 0)
    || Number(a?.seedId || 0) - Number(b?.seedId || 0)
  )
}

function getBagSeedReserveCount(seedId: number) {
  const reserveRules = Array.isArray(localSettings.value.inventoryPlanting.reserveRules)
    ? localSettings.value.inventoryPlanting.reserveRules
    : []
  const matched = reserveRules.find((rule: any) => Number(rule?.seedId || 0) === Number(seedId || 0))
  return Math.max(0, Number(matched?.keepCount ?? localSettings.value.inventoryPlanting.globalKeepCount) || 0)
}

const bagPrioritySeeds = computed(() => {
  const priorityMap = new Map(normalizeBagSeedPriorityIds(localSettings.value.bagSeedPriority).map((seedId, index) => [seedId, index]))
  return [...(bagSeeds.value || [])]
    .map((seed: any) => {
      const seedId = Number(seed?.seedId || 0)
      const count = Math.max(0, Number(seed?.count || 0))
      const reservedCount = Math.max(0, getBagSeedReserveCount(seedId))
      return {
        ...seed,
        seedId,
        count,
        reservedCount,
        usableCount: Math.max(0, count - reservedCount),
        unlocked: seed?.unlocked !== false,
        plantSize: Math.max(1, Number(seed?.plantSize || 1)),
        requiredLevel: Math.max(0, Number(seed?.requiredLevel || 0)),
      }
    })
    .sort((a: any, b: any) => {
      const aIndex = priorityMap.has(a.seedId) ? Number(priorityMap.get(a.seedId)) : Number.POSITIVE_INFINITY
      const bIndex = priorityMap.has(b.seedId) ? Number(priorityMap.get(b.seedId)) : Number.POSITIVE_INFINITY
      return (
        aIndex - bIndex
        || b.requiredLevel - a.requiredLevel
        || b.plantSize - a.plantSize
        || a.seedId - b.seedId
      )
    })
})

const bagPriorityPreviewLabel = computed(() => {
  const candidate = bagPrioritySeeds.value.find((seed: any) => seed.unlocked && seed.usableCount > 0)
  if (!candidate)
    return '当前背包中没有可参与优先种植的种子'
  return `优先消耗 ${candidate.requiredLevel}级 ${candidate.name}（可用 ${candidate.usableCount}）`
})

const bagPriorityDragSeedId = ref<number | null>(null)
const bagPrioritySorting = ref(false)

const configuredBagPriorityIdSet = computed(() => new Set(normalizeBagSeedPriorityIds(localSettings.value.bagSeedPriority)))
const unconfiguredBagPrioritySeeds = computed(() => {
  return bagPrioritySeeds.value.filter((seed: any) => !configuredBagPriorityIdSet.value.has(Number(seed.seedId || 0)))
})

function syncVisibleBagSeedPriority(seedIds: number[]) {
  syncBagSeedPriorityOrder(seedIds)
}

function syncBagSeedPriorityOrder(visibleSeedIds: number[]) {
  const normalizedVisible = normalizeBagSeedPriorityIds(visibleSeedIds)
  const visibleSet = new Set(normalizedVisible)
  const hiddenIds = normalizeBagSeedPriorityIds(localSettings.value.bagSeedPriority).filter(seedId => !visibleSet.has(seedId))
  localSettings.value.bagSeedPriority = [...normalizedVisible, ...hiddenIds]
}

function sortBagSeedPriorityRows(sorter: (a: any, b: any) => number) {
  const ordered = [...bagPrioritySeeds.value].sort(sorter)
  syncVisibleBagSeedPriority(ordered.map((seed: any) => Number(seed.seedId || 0)))
}

function resetBagSeedPriorityRecommended() {
  sortBagSeedPriorityRows(compareBagSeedsRecommended)
}

function sortBagSeedPriorityByLevel() {
  sortBagSeedPriorityRows((a: any, b: any) => (
    Number(b.requiredLevel || 0) - Number(a.requiredLevel || 0)
    || Number(b.plantSize || 1) - Number(a.plantSize || 1)
    || Number(a.seedId || 0) - Number(b.seedId || 0)
  ))
}

function appendNewBagSeedsToPriority() {
  const configuredIds = bagPrioritySeeds.value
    .filter((seed: any) => configuredBagPriorityIdSet.value.has(Number(seed.seedId || 0)))
    .map((seed: any) => Number(seed.seedId || 0))
  const newIds = [...unconfiguredBagPrioritySeeds.value]
    .sort(compareBagSeedsRecommended)
    .map((seed: any) => Number(seed.seedId || 0))
  syncVisibleBagSeedPriority([...configuredIds, ...newIds])
}

function moveSeedIdInOrder(seedIds: number[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= seedIds.length || toIndex >= seedIds.length)
    return seedIds
  const next = [...seedIds]
  const [moved] = next.splice(fromIndex, 1)
  if (moved === undefined)
    return seedIds
  next.splice(toIndex, 0, moved)
  return next
}

const analyticsSortByMap: Record<string, string> = {
  max_exp: 'exp',
  max_fert_exp: 'fert',
  max_profit: 'profit',
  max_fert_profit: 'fert_profit',
}

async function sortBagSeedPriorityByFallbackStrategy() {
  const strategy = localSettings.value.bagSeedFallbackStrategy
  if (strategy === 'level') {
    sortBagSeedPriorityByLevel()
    return
  }
  if (strategy === 'preferred') {
    const preferredSeedId = Number(localSettings.value.preferredSeedId || 0)
    sortBagSeedPriorityRows((a: any, b: any) => {
      const aPreferred = Number(a.seedId || 0) === preferredSeedId ? 1 : 0
      const bPreferred = Number(b.seedId || 0) === preferredSeedId ? 1 : 0
      return bPreferred - aPreferred || compareBagSeedsRecommended(a, b)
    })
    return
  }
  const sortBy = analyticsSortByMap[strategy]
  if (!sortBy || !currentAccountId.value) {
    resetBagSeedPriorityRecommended()
    return
  }
  bagPrioritySorting.value = true
  try {
    const res = await api.get('/api/analytics', {
      params: {
        sort: sortBy,
        timingMode: 'actual',
      },
    })
    const rankings: any[] = res.data?.ok ? (res.data.data || []) : []
    const rankMap = new Map(rankings.map((row: any, index: number) => [Number(row?.seedId || 0), index]))
    sortBagSeedPriorityRows((a: any, b: any) => {
      const aIndex = rankMap.has(Number(a.seedId || 0)) ? Number(rankMap.get(Number(a.seedId || 0))) : Number.POSITIVE_INFINITY
      const bIndex = rankMap.has(Number(b.seedId || 0)) ? Number(rankMap.get(Number(b.seedId || 0))) : Number.POSITIVE_INFINITY
      return aIndex - bIndex || compareBagSeedsRecommended(a, b)
    })
  }
  catch {
    resetBagSeedPriorityRecommended()
  }
  finally {
    bagPrioritySorting.value = false
  }
}

function moveBagSeedPriority(seedId: number, direction: -1 | 1) {
  const visibleSeedIds = bagPrioritySeeds.value.map((seed: any) => Number(seed.seedId || 0)).filter((id: number) => id > 0)
  const currentIndex = visibleSeedIds.findIndex(id => id === Number(seedId || 0))
  const targetIndex = currentIndex + direction
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleSeedIds.length)
    return
  const currentValue = visibleSeedIds[currentIndex]
  const targetValue = visibleSeedIds[targetIndex]
  if (currentValue === undefined || targetValue === undefined)
    return
  visibleSeedIds[currentIndex] = targetValue
  visibleSeedIds[targetIndex] = currentValue
  syncBagSeedPriorityOrder(visibleSeedIds)
}

function handleBagSeedDragStart(seedId: number) {
  bagPriorityDragSeedId.value = Number(seedId || 0) || null
}

function handleBagSeedDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
}

function handleBagSeedDrop(targetSeedId: number) {
  const draggedSeedId = Number(bagPriorityDragSeedId.value || 0)
  const nextTargetSeedId = Number(targetSeedId || 0)
  bagPriorityDragSeedId.value = null
  if (!draggedSeedId || !nextTargetSeedId || draggedSeedId === nextTargetSeedId)
    return
  const visibleSeedIds = bagPrioritySeeds.value.map((seed: any) => Number(seed.seedId || 0)).filter((id: number) => id > 0)
  const fromIndex = visibleSeedIds.findIndex(id => id === draggedSeedId)
  const toIndex = visibleSeedIds.findIndex(id => id === nextTargetSeedId)
  if (fromIndex < 0 || toIndex < 0)
    return
  syncVisibleBagSeedPriority(moveSeedIdInOrder(visibleSeedIds, fromIndex, toIndex))
}

function handleBagSeedDragEnd() {
  bagPriorityDragSeedId.value = null
}

function getBagSeedLabel(seedId: number) {
  const bagSeed = bagPrioritySeeds.value.find((seed: any) => Number(seed.seedId || 0) === Number(seedId || 0))
  if (bagSeed)
    return `${bagSeed.requiredLevel}级 ${bagSeed.name}`
  const seed = seeds.value?.find((item: any) => Number(item.seedId || 0) === Number(seedId || 0))
  if (seed)
    return `${seed.requiredLevel}级 ${seed.name}`
  return `种子#${seedId}`
}

function addInventoryReserveRule() {
  const usedSeedIds = new Set((localSettings.value.inventoryPlanting.reserveRules || []).map((rule: any) => Number(rule.seedId || 0)))
  const firstSeed = inventoryReserveSeedOptions.value.find(option => !usedSeedIds.has(Number(option.value || 0)))
  localSettings.value.inventoryPlanting.reserveRules.push({
    seedId: Number(firstSeed?.value || 0),
    keepCount: 0,
  })
}

function removeInventoryReserveRule(index: number | string) {
  const resolvedIndex = Number(index)
  if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0)
    return
  localSettings.value.inventoryPlanting.reserveRules.splice(resolvedIndex, 1)
}

const strategyPreviewLabel = ref<string | null>(null)

watchEffect(async () => {
  const strategy = localSettings.value.plantingStrategy
  if (!currentAccountId.value) {
    strategyPreviewLabel.value = null
    return
  }
  if (strategy === 'preferred' || strategy === 'bag_priority') {
    strategyPreviewLabel.value = null
    return
  }
  if (!seeds.value || seeds.value.length === 0) {
    strategyPreviewLabel.value = null
    return
  }
  const available = seeds.value.filter(s => !s.locked && !s.soldOut)
  if (available.length === 0) {
    strategyPreviewLabel.value = '暂无可用种子'
    return
  }
  if (strategy === 'level') {
    const best = [...available].sort((a, b) => b.requiredLevel - a.requiredLevel)[0]
    strategyPreviewLabel.value = best ? `${best.requiredLevel}级 ${best.name}` : null
    return
  }
  const sortBy = analyticsSortByMap[strategy]
  if (sortBy) {
    try {
      const res = await api.get('/api/analytics', {
        params: {
          sort: sortBy,
          timingMode: 'actual',
        },
      })
      const rankings: any[] = res.data.ok ? (res.data.data || []) : []
      const availableIds = new Set(available.map(s => s.seedId))
      const match = rankings.find(r => availableIds.has(Number(r.seedId)))
      if (match) {
        const seed = available.find(s => s.seedId === Number(match.seedId))
        strategyPreviewLabel.value = seed ? `${seed.requiredLevel}级 ${seed.name}` : null
      }
      else {
        strategyPreviewLabel.value = '暂无匹配种子'
      }
    }
    catch {
      strategyPreviewLabel.value = null
    }
  }
})

const diffModalVisible = ref(false)
const diffItems = ref<{ label: string, from: string, to: string }[]>([])
const diffModalTitle = ref('确认保存改动')
const diffModalConfirmText = ref('确认并保存')
const diffModalHint = ref('提示：点击「确认并保存」后，后端调度器将立即应用新策略。')
let diffConfirmAction: null | (() => Promise<void>) = null
const shortIntervalRiskModalVisible = ref(false)
const shortIntervalRiskItems = ref<string[]>([])
let shortIntervalRiskConfirmAction: null | (() => Promise<void>) = null
const qqHighRiskModalVisible = ref(false)
const qqHighRiskModalItems = ref<Array<{ label: string, detail: string }>>([])
const qqHighRiskConfirmText = ref('')
let qqHighRiskConfirmAction: null | (() => Promise<void>) = null
const qqHighRiskConfirmMatched = computed(() => qqHighRiskConfirmText.value.trim() === QQ_HIGH_RISK_CONFIRM_PHRASE)

// 翻译映射
const fieldLabels: Record<string, string> = {
  accountMode: '账号模式',
  farm: '自动种植收获',
  task: '自动任务领奖',
  sell: '自动卖果实',
  friend: '自动好友互动',
  farm_push: '推送触发巡田',
  land_upgrade: '自动升级土地',
  landUpgradeTarget: '土地升级目标等级',
  friend_steal: '自动偷菜',
  friend_help: '自动帮忙',
  friend_bad: '自动捣乱',
  friend_auto_accept: '自动同意好友',
  friend_help_exp_limit: '经验上限停止帮忙',
  qqFriendFetchMultiChain: 'QQ 多链路好友拉取',
  forceGetAllEnabled: '强制好友兼容模式',
  email: '自动领取邮件',
  fertilizer_gift: '自动填充化肥',
  fertilizer_buy: '自动购买化肥',
  fertilizer_buy_limit: '自动购买化肥上限',
  fertilizer_buy_type: '自动购肥类型',
  fertilizer_buy_mode: '自动购肥模式',
  fertilizer_buy_threshold_normal: '普通肥触发阈值',
  fertilizer_buy_threshold_organic: '有机肥触发阈值',
  fertilizer_60s_anti_steal: '60秒施肥(防偷)',
  fertilizer_smart_phase: '智能二季施肥',
  fastHarvest: '成熟秒收取',
  free_gifts: '自动商城礼包',
  share_reward: '自动分享奖励',
  vip_gift: '自动VIP礼包',
  month_card: '自动月卡奖励',
  open_server_gift: '自动开服红包',
  fertilizer: '施肥策略',
  stealFilterEnabled: '作物过滤开关',
  stealFilterMode: '作物过滤模式',
  stealFilterPlantIds: '作物过滤名单',
  stealFriendFilterEnabled: '好友过滤开关',
  stealFriendFilterMode: '好友过滤模式',
  stealFriendFilterIds: '好友过滤名单',
  plantingStrategy: '种植策略',
  plantingFallbackStrategy: '失配回退策略',
  preferredSeedId: '优先种植种子',
  bagSeedPriority: '背包种子优先顺序',
  bagSeedFallbackStrategy: '第二优先策略',
  inventoryPlanting: '库存种植',
  qqHighRiskWindow: 'QQ 高风险自动回退窗口',
}

const diffFieldLabels: Record<string, string> = {
  'accountMode': '账号模式',
  'harvestDelay.min': '随机延迟下限 (秒)',
  'harvestDelay.max': '随机延迟上限 (秒)',
  'riskPromptEnabled': '显示风控提示',
  'plantingStrategy': '种植策略',
  'plantingFallbackStrategy': '失配回退策略',
  'preferredSeedId': '优先种植种子',
  'bagSeedPriority': '背包种子优先顺序',
  'bagSeedFallbackStrategy': '第二优先策略',
  'inventoryPlanting.mode': '库存种植模式',
  'inventoryPlanting.globalKeepCount': '全局保留数量',
  'inventoryPlanting.reserveRules': '库存保留规则',
  'automation.fertilizer_buy_type': '自动购肥类型',
  'automation.fertilizer_buy_mode': '自动购肥模式',
  'automation.fertilizer_buy_threshold_normal': '普通肥触发阈值',
  'automation.fertilizer_buy_threshold_organic': '有机肥触发阈值',
  'intervals.farmMin': '农场巡查最小 (秒)',
  'intervals.farmMax': '农场巡查最大 (秒)',
  'intervals.friendMin': '好友巡查最小 (秒)',
  'intervals.friendMax': '好友巡查最大 (秒)',
  'intervals.helpMin': '帮忙最小 (秒)',
  'intervals.helpMax': '帮忙最大 (秒)',
  'intervals.stealMin': '偷菜最小 (秒)',
  'intervals.stealMax': '偷菜最大 (秒)',
  'friendQuietHours.enabled': '启用静默时段',
  'friendQuietHours.start': '静默开始时间',
  'friendQuietHours.end': '静默结束时间',
  'stakeoutSteal.enabled': '精准蹲守偷菜',
  'stakeoutSteal.delaySec': '蹲守延迟',
  'qqHighRiskWindow.durationMinutes': 'QQ 高风险自动回退时长',
  'tradeConfig.sell.keepMinEachFruit': '每种果实至少保留',
  'tradeConfig.sell.batchSize': '出售批大小',
  'tradeConfig.sell.keepFruitIds': '强制保留果实 ID',
  'tradeConfig.sell.rareKeep.enabled': '启用稀有果实保留',
  'tradeConfig.sell.rareKeep.judgeBy': '稀有判定方式',
  'tradeConfig.sell.rareKeep.minPlantLevel': '最低作物等级',
  'tradeConfig.sell.rareKeep.minUnitPrice': '最低单价',
  'tradeConfig.sell.previewBeforeManualSell': '手动出售前先刷新预览',
  'reportConfig.enabled': '启用经营汇报',
  'reportConfig.channel': '汇报渠道',
  'reportConfig.title': '汇报标题',
  'reportConfig.endpoint': '汇报接口地址',
  'reportConfig.token': '汇报 Token',
  'reportConfig.smtpHost': 'SMTP 服务器',
  'reportConfig.smtpPort': 'SMTP 端口',
  'reportConfig.smtpUser': 'SMTP 用户名',
  'reportConfig.smtpPass': 'SMTP 密码 / 授权码',
  'reportConfig.emailFrom': '发件邮箱',
  'reportConfig.emailTo': '收件邮箱',
  'reportConfig.smtpSecure': '直连 TLS',
  'reportConfig.hourlyEnabled': '小时汇报',
  'reportConfig.hourlyMinute': '小时汇报发送分钟',
  'reportConfig.dailyEnabled': '每日汇报',
  'reportConfig.dailyHour': '日报发送小时',
  'reportConfig.dailyMinute': '日报发送分钟',
  'reportConfig.retentionDays': '汇报保留天数',
}

function getDiffFieldLabel(path: string) {
  if (diffFieldLabels[path])
    return diffFieldLabels[path]
  if (path.startsWith('automation.')) {
    const key = path.slice('automation.'.length)
    return fieldLabels[key] || path
  }
  return path
}

function findOptionLabel(options: Array<{ label: string, value: any }>, value: any) {
  return options.find(option => option.value === value)?.label || String(value)
}

function maskSecretValue(value: any) {
  const text = String(value || '')
  if (!text)
    return '未设置'
  if (text.length <= 4)
    return '*'.repeat(text.length)
  return `${text.slice(0, 2)}***${text.slice(-2)}`
}

function formatDiffValue(path: string, value: any) {
  if (typeof value === 'boolean')
    return value ? '开启' : '关闭'
  if (value === undefined || value === null || value === '')
    return '未设置'
  if (path === 'accountMode')
    return findOptionLabel(accountModeOptions, resolveAccountMode(value))
  if (path === 'plantingStrategy')
    return findOptionLabel(plantingStrategyOptions, value)
  if (path === 'plantingFallbackStrategy')
    return findOptionLabel(plantingFallbackStrategyOptions, value)
  if (path === 'bagSeedFallbackStrategy')
    return findOptionLabel(bagSeedFallbackStrategyOptions, value)
  if (path === 'preferredSeedId')
    return findOptionLabel(preferredSeedOptions.value, value)
  if (path === 'bagSeedPriority') {
    return Array.isArray(value) && value.length > 0
      ? value.map((seedId: number) => getBagSeedLabel(Number(seedId || 0))).join(' → ')
      : '未设置'
  }
  if (path === 'inventoryPlanting.mode')
    return findOptionLabel(inventoryPlantingModeOptions, value)
  if (path === 'automation.fertilizer')
    return findOptionLabel(fertilizerOptions, value)
  if (path === 'automation.fertilizer_buy_type')
    return findOptionLabel(fertilizerBuyTypeOptions, value)
  if (path === 'automation.fertilizer_buy_mode')
    return findOptionLabel(fertilizerBuyModeOptions, value)
  if (path === 'tradeConfig.sell.rareKeep.judgeBy')
    return findOptionLabel(rareKeepJudgeOptions, value)
  if (path === 'automation.stealFilterMode' || path === 'automation.stealFriendFilterMode')
    return findOptionLabel(filterModeOptions, value)
  if (path === 'reportConfig.channel')
    return findOptionLabel(reportChannelOptions, value)
  if (path === 'reportConfig.token' || path === 'reportConfig.smtpPass')
    return maskSecretValue(value)
  if (path.startsWith('intervals.') || path.startsWith('harvestDelay.') || path === 'stakeoutSteal.delaySec')
    return `${value} 秒`
  if (path === 'qqHighRiskWindow.durationMinutes')
    return `${value} 分钟`
  if (path === 'automation.fertilizer_buy_limit')
    return `${value} 袋`
  if (path === 'automation.fertilizer_buy_threshold_normal' || path === 'automation.fertilizer_buy_threshold_organic')
    return `${value} 小时`
  if (path === 'reportConfig.hourlyMinute' || path === 'reportConfig.dailyMinute')
    return `${value} 分`
  if (path === 'reportConfig.dailyHour')
    return `${value} 时`
  if (path === 'reportConfig.retentionDays')
    return Number(value) === 0 ? '不自动清理' : `${value} 天`
  if (path === 'inventoryPlanting.reserveRules') {
    return Array.isArray(value) && value.length > 0
      ? value.map((rule: any) => `${findOptionLabel(inventoryReserveSeedOptions.value, rule?.seedId)} 保留 ${rule?.keepCount || 0}`).join('；')
      : '未设置'
  }
  if (Array.isArray(value))
    return value.length > 0 ? value.join(', ') : '未设置'
  return String(value)
}

function isPlainObject(value: any) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getValueByPath(source: any, path: string) {
  return path.split('.').reduce((acc, key) => acc?.[key], source)
}

function normalizeLeafForCompare(value: any, path = '') {
  if (Array.isArray(value)) {
    if (path === 'bagSeedPriority') {
      return value.map(item => String(item))
    }
    return value.map((item) => {
      if (item && typeof item === 'object')
        return JSON.stringify(item)
      return String(item)
    }).sort()
  }
  return value
}

function collectPathDiffItems(oldValue: any, newValue: any, currentPath = '', changes: Array<{ label: string, from: string, to: string }> = []) {
  if (isPlainObject(oldValue) || isPlainObject(newValue)) {
    const oldObj = isPlainObject(oldValue) ? oldValue : {}
    const newObj = isPlainObject(newValue) ? newValue : {}
    const keys = [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])]
    for (const key of keys) {
      collectPathDiffItems(oldObj[key], newObj[key], currentPath ? `${currentPath}.${key}` : key, changes)
    }
    return changes
  }

  const oldComparable = normalizeLeafForCompare(oldValue, currentPath)
  const newComparable = normalizeLeafForCompare(newValue, currentPath)
  if (JSON.stringify(oldComparable) !== JSON.stringify(newComparable)) {
    changes.push({
      label: getDiffFieldLabel(currentPath),
      from: formatDiffValue(currentPath, oldValue),
      to: formatDiffValue(currentPath, newValue),
    })
  }
  return changes
}

function getAccountSettingsDiffItems() {
  if (!settings.value)
    return []
  return collectPathDiffItems(
    buildSettingsPayloadFromState(buildAccountSettingsStateFromSources()),
    buildSettingsPayload(),
  )
}

const accountSettingsDiffItems = computed(() => getAccountSettingsDiffItems())
const accountSettingsDirtyCount = computed(() => accountSettingsDiffItems.value.length)
const hasUnsavedAccountSettings = computed(() => accountSettingsDirtyCount.value > 0)

function closeDiffModal() {
  diffModalVisible.value = false
  diffConfirmAction = null
}

function closeShortIntervalRiskModal() {
  shortIntervalRiskModalVisible.value = false
  shortIntervalRiskConfirmAction = null
  shortIntervalRiskItems.value = []
}

function closeQqHighRiskModal() {
  qqHighRiskModalVisible.value = false
  qqHighRiskConfirmAction = null
  qqHighRiskModalItems.value = []
  qqHighRiskConfirmText.value = ''
}

function openShortIntervalRiskModal(
  items: string[],
  onConfirm: () => Promise<void>,
) {
  shortIntervalRiskItems.value = [...items]
  shortIntervalRiskConfirmAction = onConfirm
  shortIntervalRiskModalVisible.value = true
}

function openQqHighRiskModal(
  items: Array<{ label: string, detail: string }>,
  onConfirm: () => Promise<void>,
) {
  qqHighRiskModalItems.value = items.map(item => ({ ...item }))
  qqHighRiskConfirmText.value = ''
  qqHighRiskConfirmAction = onConfirm
  qqHighRiskModalVisible.value = true
}

function openDiffModal(
  changes: Array<{ label: string, from: string, to: string }>,
  options: {
    title?: string
    confirmText?: string
    hint?: string
    onConfirm: () => Promise<void>
  },
) {
  diffItems.value = changes
  diffModalTitle.value = options.title || '确认保存改动'
  diffModalConfirmText.value = options.confirmText || '确认并保存'
  diffModalHint.value = options.hint || '提示：点击「确认并保存」后，后端调度器将立即应用新策略。'
  diffConfirmAction = options.onConfirm
  diffModalVisible.value = true
}

async function handleDiffModalConfirm() {
  const action = diffConfirmAction
  closeDiffModal()
  if (action)
    await action()
}

async function handleShortIntervalRiskModalConfirm() {
  const action = shortIntervalRiskConfirmAction
  closeShortIntervalRiskModal()
  if (action)
    await action()
}

async function handleQqHighRiskModalConfirm() {
  const action = qqHighRiskConfirmAction
  closeQqHighRiskModal()
  if (action)
    await action()
}

function collectQqHighRiskActivationItems(payload: any) {
  if (!isCurrentAccountQq.value || !settings.value)
    return []

  const previousPayload = buildSettingsPayloadFromState(buildAccountSettingsStateFromSources())
  const definitions = [
    {
      path: 'automation.fertilizer_60s_anti_steal',
      label: '60秒施肥(防偷)',
      detail: '会在成熟前集中施肥并抢收，形成非常强的临界时点请求特征。',
    },
    {
      path: 'automation.fastHarvest',
      label: '成熟秒收取',
      detail: '会提前预设精确收获时机，容易表现出近乎固定的秒级操作节奏。',
    },
    {
      path: 'stakeoutSteal.enabled',
      label: '精准蹲守偷菜',
      detail: '会围绕好友成熟时间做精确蹲点，属于典型的自动化蹲守行为。',
    },
    {
      path: 'automation.qqFriendFetchMultiChain',
      label: 'QQ 多链路好友拉取',
      detail: '会恢复旧版多接口探测链路，显著扩大 QQ 侧好友列表接口探测面。',
    },
  ]

  return definitions.filter((item) => {
    const beforeEnabled = Boolean(getValueByPath(previousPayload, item.path))
    const afterEnabled = Boolean(getValueByPath(payload, item.path))
    return !beforeEnabled && afterEnabled
  })
}

async function runAccountSettingsRiskConfirmations(
  payload: any,
  onConfirm: (options?: { acknowledgeShortIntervalRisk?: boolean }) => Promise<any>,
) {
  const qqRiskItems = collectQqHighRiskActivationItems(payload)
  const shortIntervalItems = isAdmin.value ? [] : collectShortIntervalRiskItems(payload)

  const continueWithShortIntervalRisk = async () => {
    if (shortIntervalItems.length === 0)
      return await onConfirm()

    openShortIntervalRiskModal(shortIntervalItems, async () => {
      await onConfirm({ acknowledgeShortIntervalRisk: true })
    })
    return null
  }

  if (qqRiskItems.length > 0) {
    openQqHighRiskModal(qqRiskItems, async () => {
      await continueWithShortIntervalRisk()
    })
    return null
  }

  return await continueWithShortIntervalRisk()
}

async function persistAccountSettings(
  successMessage: string | null = '账号设置已保存',
  options: {
    acknowledgeShortIntervalRisk?: boolean
  } = {},
) {
  saving.value = true
  try {
    const payload = buildSettingsPayload()
    if (options.acknowledgeShortIntervalRisk)
      payload.acknowledgeShortIntervalRisk = true
    const res = await settingStore.saveSettings(currentAccountId.value, payload)
    if (res.ok) {
      if (successMessage)
        showAlert(successMessage)
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
    return res
  }
  finally {
    saving.value = false
  }
}

async function persistAccountSettingsWithRiskConfirm(successMessage: string | null = '账号设置已保存') {
  const payload = buildSettingsPayload()
  return await runAccountSettingsRiskConfirmations(payload, async (options) => {
    return await persistAccountSettings(successMessage, options || {})
  })
}

async function saveAccountSettings() {
  if (!currentAccountId.value)
    return

  const changes = getAccountSettingsDiffItems()
  if (changes.length > 0) {
    openDiffModal(changes, {
      onConfirm: async () => {
        await persistAccountSettingsWithRiskConfirm('账号设置已保存')
      },
    })
    return
  }

  await persistAccountSettingsWithRiskConfirm('账号设置已保存')
}

async function runAfterEnsuringAccountSettingsSaved(
  action: () => Promise<void>,
  options: {
    title: string
    confirmText: string
    hint: string
  },
) {
  const execute = async () => {
    const payload = buildSettingsPayload()
    await runAccountSettingsRiskConfirmations(payload, async (saveOptions) => {
      const result = await persistAccountSettings(null, saveOptions || {})
      if (!result?.ok)
        return result
      await action()
      return result
    })
  }

  const changes = getAccountSettingsDiffItems()
  if (changes.length > 0) {
    openDiffModal(changes, {
      ...options,
      onConfirm: execute,
    })
    return
  }

  await execute()
}

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    showAlert('请填写完整', 'danger')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showAlert('两次密码输入不一致', 'danger')
    return
  }
  // 管理员：≥4 位；普通用户：≥6 位 + 字母数字（后端会二次校验）
  const minLen = isAdmin.value ? 4 : 6
  if (passwordForm.value.new.length < minLen) {
    showAlert(`密码长度至少 ${minLen} 位`, 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await settingStore.changePassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert(`用户 ${currentUsername.value} 密码修改成功`)
      passwordForm.value = { old: '', new: '', confirm: '' }
    }
    else {
      showAlert(`修改失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig(localOffline.value)

    if (res.ok) {
      showAlert('下线提醒设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    offlineSaving.value = false
  }
}

async function handleSaveBugReport() {
  bugReportSaving.value = true
  try {
    const res = await settingStore.saveBugReportConfig(localBugReport.value)

    if (res.ok && res.data) {
      localBugReport.value = {
        ...defaultBugReportConfig,
        ...res.data,
      }
      showAlert('问题反馈设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    bugReportSaving.value = false
  }
}

async function handleSendBugReportTest() {
  bugReportTesting.value = true
  try {
    const saveRes = await settingStore.saveBugReportConfig({
      ...localBugReport.value,
      enabled: true,
    })
    if (!saveRes.ok || !saveRes.data) {
      showAlert(`保存失败，未发送测试邮件: ${saveRes.error || '未知错误'}`, 'danger')
      return
    }

    localBugReport.value = {
      ...defaultBugReportConfig,
      ...saveRes.data,
    }

    const testRes = await settingStore.sendBugReportTest()
    if (testRes.ok) {
      showAlert(testRes.data?.mailSent
        ? '测试反馈邮件已发送，请检查目标邮箱'
        : `测试反馈邮件发送失败: ${testRes.data?.mailMessage || '未知错误'}`, testRes.data?.mailSent ? 'primary' : 'danger')
    }
    else {
      showAlert(`测试反馈邮件发送失败: ${testRes.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    bugReportTesting.value = false
  }
}

async function handleSendReportTest() {
  if (!currentAccountId.value)
    return
  const sendTestReport = async () => {
    reportTesting.value = true
    try {
      const res = await settingStore.sendReportTest(currentAccountId.value)
      if (res.ok) {
        await refreshReportLogs()
        showAlert('测试汇报已发送，请检查目标渠道')
      }
      else {
        showAlert(`测试发送失败: ${res.error || '未知错误'}`, 'danger')
      }
    }
    finally {
      reportTesting.value = false
    }
  }

  await runAfterEnsuringAccountSettingsSaved(sendTestReport, {
    title: '确认保存并发送测试汇报',
    confirmText: '确认后发送测试汇报',
    hint: '提示：点击确认后会先保存当前账号配置，再立即发送一条测试汇报。',
  })
}

async function handleSendReport(mode: 'hourly' | 'daily') {
  if (!currentAccountId.value)
    return
  const sendReportNow = async () => {
    reportSendingMode.value = mode
    try {
      const res = await settingStore.sendReport(currentAccountId.value, mode)
      if (res.ok) {
        await refreshReportLogs()
        showAlert(mode === 'hourly' ? '小时汇报已发送' : '日报已发送')
      }
      else {
        showAlert(`发送失败: ${res.error || '未知错误'}`, 'danger')
      }
    }
    finally {
      reportSendingMode.value = ''
    }
  }

  await runAfterEnsuringAccountSettingsSaved(sendReportNow, {
    title: mode === 'hourly' ? '确认保存并发送小时汇报' : '确认保存并发送日报',
    confirmText: mode === 'hourly' ? '确认后发送小时汇报' : '确认后发送日报',
    hint: mode === 'hourly'
      ? '提示：点击确认后会先保存当前账号配置，再立即发送一条小时汇报。'
      : '提示：点击确认后会先保存当前账号配置，再立即发送一条日报。',
  })
}

async function refreshReportLogs(options: { page?: number, pageSize?: number, resetPage?: boolean } = {}) {
  if (!currentAccountId.value)
    return
  reportHistoryLoading.value = true
  try {
    const targetPage = options.resetPage ? 1 : (options.page || reportLogPagination.value.page || 1)
    const targetPageSize: typeof DEFAULT_REPORT_HISTORY_VIEW_STATE.pageSize = normalizeReportHistoryPageSize(
      options.pageSize || reportPageSize.value || 3,
    )
    const requestOptions = {
      mode: reportFilters.value.mode,
      status: reportFilters.value.status,
      sortOrder: reportSortOrder.value,
      keyword: reportKeyword.value.trim(),
    }
    await Promise.all([
      settingStore.fetchReportLogs(currentAccountId.value, {
        page: targetPage,
        pageSize: targetPageSize,
        ...requestOptions,
      }),
      settingStore.fetchReportLogStats(currentAccountId.value, requestOptions),
    ])
    reportPageSize.value = normalizeReportHistoryPageSize(reportLogPagination.value.pageSize || reportPageSize.value || 3)
  }
  finally {
    reportHistoryLoading.value = false
  }
}

async function goToReportLogPage(page: number) {
  if (!currentAccountId.value)
    return
  if (page < 1 || page > (reportLogPagination.value.totalPages || 1))
    return
  await refreshReportLogs({ page })
}

async function handleClearReportLogs() {
  if (!currentAccountId.value)
    return
  if (!window.window.confirm('是否清空当前账号的全部经营汇报历史记录？此操作不可恢复。'))
    return
  reportHistoryClearing.value = true
  try {
    const res = await settingStore.clearReportLogs(currentAccountId.value)
    if (res.ok) {
      await refreshReportLogs({ resetPage: true })
      showAlert('经营汇报历史已清空')
    }
    else {
      showAlert(`清空失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    reportHistoryClearing.value = false
  }
}

async function handleExportReportLogs() {
  if (!currentAccountId.value)
    return
  reportHistoryExporting.value = true
  try {
    const res = await settingStore.exportReportLogs(currentAccountId.value, {
      mode: reportFilters.value.mode,
      status: reportFilters.value.status,
      sortOrder: reportSortOrder.value,
      keyword: reportKeyword.value.trim(),
    })
    if (!res.ok || !res.blob) {
      showAlert(`导出失败: ${res.error || '未知错误'}`, 'danger')
      return
    }
    const url = window.URL.createObjectURL(res.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = res.filename || 'report-history.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.URL.revokeObjectURL(url)
    if (res.truncated) {
      showAlert(`导出完成：已导出 ${res.count} 条记录（当前筛选共 ${res.total} 条，导出上限 2000 条）`)
    }
    else {
      showAlert(`导出完成：已导出 ${res.count} 条记录`)
    }
  }
  finally {
    reportHistoryExporting.value = false
  }
}

async function handleApplyReportSearch() {
  expandedReportLogIds.value = []
  selectedReportLogIds.value = []
  closeReportLogDetail()
  await refreshReportLogs({ resetPage: true })
}

async function handleShowLatestFailed() {
  reportFilters.value.status = 'failed'
  reportSortOrder.value = 'desc'
  reportKeyword.value = ''
  await handleApplyReportSearch()
}

async function handleResetReportHistoryView() {
  reportFilters.value = { mode: 'all', status: 'all' }
  reportKeyword.value = ''
  reportSortOrder.value = 'desc'
  reportPageSize.value = 3
  await handleApplyReportSearch()
}

async function handleReportStatsCardClick(key: string) {
  const previous = {
    mode: reportFilters.value.mode,
    status: reportFilters.value.status,
    sortOrder: reportSortOrder.value,
  }

  if (key === 'total') {
    reportFilters.value = { mode: 'all', status: 'all' }
    reportSortOrder.value = 'desc'
  }
  else if (key === 'success') {
    reportFilters.value = { ...reportFilters.value, status: 'success' }
    reportSortOrder.value = 'desc'
  }
  else if (key === 'failed') {
    reportFilters.value = { ...reportFilters.value, status: 'failed' }
    reportSortOrder.value = 'desc'
  }
  else if (key === 'test' || key === 'hourly' || key === 'daily') {
    reportFilters.value = { ...reportFilters.value, mode: key }
    reportSortOrder.value = 'desc'
  }
  else {
    return
  }

  const changed = previous.mode !== reportFilters.value.mode
    || previous.status !== reportFilters.value.status
    || previous.sortOrder !== reportSortOrder.value

  if (!changed)
    await refreshReportLogs({ resetPage: true })
}

function isReportLogSelected(id: number) {
  return selectedReportLogIds.value.includes(id)
}

function toggleReportLogSelected(id: number) {
  if (isReportLogSelected(id)) {
    selectedReportLogIds.value = selectedReportLogIds.value.filter(itemId => itemId !== id)
  }
  else {
    selectedReportLogIds.value = [...selectedReportLogIds.value, id]
  }
}

function toggleSelectAllVisibleReportLogs() {
  if (allVisibleReportLogsSelected.value) {
    const visibleIds = new Set(reportLogs.value.map(item => item.id))
    selectedReportLogIds.value = selectedReportLogIds.value.filter(id => !visibleIds.has(id))
  }
  else {
    const next = new Set(selectedReportLogIds.value)
    for (const item of reportLogs.value) {
      next.add(item.id)
    }
    selectedReportLogIds.value = Array.from(next)
  }
}

async function refreshReportLogsAfterDelete(deletedIds: number[]) {
  const visibleDeletedCount = reportLogs.value.filter(item => deletedIds.includes(item.id)).length
  const currentPage = reportLogPagination.value.page || 1
  const shouldFallbackPage = visibleDeletedCount >= reportLogs.value.length && currentPage > 1
  await refreshReportLogs({ page: shouldFallbackPage ? currentPage - 1 : currentPage })
  if (reportLogs.value.length === 0 && (reportLogPagination.value.page || 1) > 1) {
    await refreshReportLogs({ page: (reportLogPagination.value.page || 1) - 1 })
  }
}

async function handleDeleteReportLogs(ids: number[], options: { single?: boolean, title?: string } = {}) {
  if (!currentAccountId.value)
    return
  const normalizedIds = Array.from(new Set(ids.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0)))
  if (normalizedIds.length === 0)
    return
  const titleText = options.title || (options.single ? '这条汇报记录' : `这 ${normalizedIds.length} 条汇报记录`)
  if (!window.window.confirm(`是否删除${titleText}？此操作不可恢复。`))
    return

  if (options.single) {
    reportHistoryDeletingIds.value = normalizedIds
  }
  else {
    reportHistoryBatchDeleting.value = true
  }

  try {
    const res = await settingStore.deleteReportLogsByIds(currentAccountId.value, normalizedIds)
    if (!res.ok) {
      showAlert(`删除失败: ${res.error || '未知错误'}`, 'danger')
      return
    }
    selectedReportLogIds.value = selectedReportLogIds.value.filter(id => !normalizedIds.includes(id))
    if (reportDetailItem.value && normalizedIds.includes(reportDetailItem.value.id)) {
      closeReportLogDetail()
    }
    await refreshReportLogsAfterDelete(normalizedIds)
    showAlert(options.single ? '汇报记录已删除' : `已删除 ${normalizedIds.length} 条汇报记录`)
  }
  finally {
    reportHistoryDeletingIds.value = reportHistoryDeletingIds.value.filter(id => !normalizedIds.includes(id))
    reportHistoryBatchDeleting.value = false
  }
}

function formatReportMode(mode: string) {
  if (mode === 'hourly')
    return '小时汇报'
  if (mode === 'daily')
    return '日报'
  return '测试汇报'
}

function formatReportLogTime(value: string) {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return String(value)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function getReportLogPreview(content: string) {
  const text = String(content || '').trim()
  if (!text)
    return '无正文'
  const lines = text.split('\n')
  if (lines.length > 4)
    return `${lines.slice(0, 4).join('\n')}\n...`
  if (text.length > 220)
    return `${text.slice(0, 220)}...`
  return text
}

function isReportLogExpanded(id: number) {
  return expandedReportLogIds.value.includes(id)
}

function toggleReportLogExpanded(id: number) {
  if (isReportLogExpanded(id)) {
    expandedReportLogIds.value = expandedReportLogIds.value.filter(itemId => itemId !== id)
  }
  else {
    expandedReportLogIds.value = [...expandedReportLogIds.value, id]
  }
}

function openReportLogDetail(item: ReportLogEntry) {
  reportDetailItem.value = { ...item }
  reportDetailVisible.value = true
}

function closeReportLogDetail() {
  reportDetailVisible.value = false
  reportDetailItem.value = null
}

watch(() => [reportFilters.value.mode, reportFilters.value.status, reportSortOrder.value], () => {
  expandedReportLogIds.value = []
  selectedReportLogIds.value = []
  closeReportLogDetail()
  if (reportHistoryViewHydrating.value)
    return
  if (!currentAccountId.value)
    return
  void refreshReportLogs({ resetPage: true })
})

watch(() => reportPageSize.value, (pageSize, prevPageSize) => {
  expandedReportLogIds.value = []
  selectedReportLogIds.value = []
  closeReportLogDetail()
  if (reportHistoryViewHydrating.value)
    return
  if (!currentAccountId.value)
    return
  if (pageSize === prevPageSize)
    return
  void refreshReportLogs({ resetPage: true, pageSize: pageSize || 3 })
})

watch(() => reportLogs.value.map(item => item.id).join(','), () => {
  const visibleIds = new Set(reportLogs.value.map(item => item.id))
  expandedReportLogIds.value = expandedReportLogIds.value.filter(id => visibleIds.has(id))
  selectedReportLogIds.value = selectedReportLogIds.value.filter(id => visibleIds.has(id))
  reportHistoryDeletingIds.value = reportHistoryDeletingIds.value.filter(id => visibleIds.has(id))
  if (reportDetailItem.value && !visibleIds.has(reportDetailItem.value.id)) {
    closeReportLogDetail()
  }
})

watch(
  () => [reportFilters.value.mode, reportFilters.value.status, reportKeyword.value, reportSortOrder.value, reportPageSize.value],
  ([mode, status, keyword, sortOrder, pageSize]) => {
    try {
      localStorage.setItem(REPORT_HISTORY_VIEW_STORAGE_KEY, JSON.stringify({
        mode,
        status,
        keyword: String(keyword || '').slice(0, 100),
        sortOrder,
        pageSize,
      }))
    }
    catch {
      // ignore localStorage write failures
    }
  },
  { immediate: true },
)

async function loadTimingConfig() {
  if (!isAdmin.value)
    return
  const data = await settingStore.fetchTimingConfig()
  if (data && data.config) {
    localTiming.value = {
      ...localTiming.value,
      ...(data.defaults || {}),
      ...(data.config || {}),
    }
  }
}

async function handleSaveTiming() {
  // 数据合法性校验，防止输入空字符串或非法字符导致的保存失败
  const t = localTiming.value
  const isValid = !Number.isNaN(t.heartbeatIntervalMs) && !Number.isNaN(t.rateLimitIntervalMs)
    && !Number.isNaN(t.ghostingProbability) && !Number.isNaN(t.ghostingCooldownMin)
    && !Number.isNaN(t.ghostingMinMin) && !Number.isNaN(t.ghostingMaxMin)
    && !Number.isNaN(t.inviteRequestDelay)
    && !Number.isNaN(t.optimizedSchedulerTickMs)
    && !Number.isNaN(t.optimizedSchedulerWheelSize)
    && !Number.isNaN(t.schedulerJitterRatio)
    && !Number.isNaN(t.interTaskDelayMinMs)
    && !Number.isNaN(t.interTaskDelayMaxMs)
    && !Number.isNaN(t.restIntervalMinMs)
    && !Number.isNaN(t.restIntervalMaxMs)
    && !Number.isNaN(t.restDurationMinMs)
    && !Number.isNaN(t.restDurationMaxMs)
    && !Number.isNaN(t.eventTriggerDebounceMs)
    && !!String(t.schedulerEngine || '').trim()

  if (!isValid) {
    showAlert('保存失败：请确保所有项均为有效数字', 'danger')
    return
  }

  timingSaving.value = true
  try {
    const res = await settingStore.saveTimingConfig(localTiming.value)
    if (res.ok) {
      showAlert('时间参数配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    timingSaving.value = false
  }
}

async function restoreTimingDefaults() {
  localTiming.value = { ...settingStore.settings.defaultTimingConfig }
  showAlert('已加载默认推荐值，点击保存后生效')
}
</script>

<template>
  <div class="settings-page ui-page-shell ui-page-density-relaxed">
    <div v-if="loading" class="glass-text-muted py-4 text-center">
      <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
      <p>加载中...</p>
    </div>

    <div v-else class="settings-layout mt-4 space-y-4">
      <div class="settings-primary-category card glass-panel rounded-xl px-3 py-3 shadow-sm">
        <div class="settings-primary-category-list">
          <button
            v-for="tab in settingsPrimaryCategoryTabs"
            :key="tab.key"
            type="button"
            class="settings-primary-category-item"
            :class="tab.key === activeSettingsPrimaryCategory ? 'settings-primary-category-item-active' : ''"
            @click="switchSettingsPrimaryCategory(tab.key)"
          >
            <div class="text-base" :class="[tab.icon]" />
            <span>{{ tab.label }}</span>
          </button>
        </div>
        <div class="settings-primary-category-desc">
          {{ activeSettingsPrimaryCategoryMeta.description }}
        </div>
        <div :id="`settings-category-${activeSettingsPrimaryCategory}`" class="settings-route-anchor" />
        <div class="mt-2 flex flex-wrap justify-end gap-2">
          <ContextHelpButton
            v-if="showSystemUpdateChecklistHelpEntry"
            article="deployment-release-and-remote-update"
            audience="admin"
            :section="systemUpdateChecklistHelpSectionId"
            label="远程更新清单"
            icon-class="i-carbon-launch"
            variant="secondary"
            source-context="settings_system_update_release_checklist_entry"
          />
          <ContextHelpButton
            :article="settingsHelpArticleId"
            :audience="settingsHelpAudience"
            :section="settingsHelpSectionId"
            label="当前分类帮助"
            variant="outline"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 text-sm lg:grid-cols-2">
        <!-- Card 1: Strategy & Automation -->
        <div
          v-if="currentAccountId"
          v-show="isSettingsCategoryVisible(['common', 'plant', 'auto', 'security'])"
          class="card glass-panel h-full flex flex-col rounded-lg shadow"
          :class="strategyPanelFullWidth ? 'lg:col-span-2' : ''"
        >
          <!-- Strategy Header -->
          <div class="settings-card-divider settings-primary-toolbar ui-mobile-sticky-panel flex flex-col justify-between gap-3 px-4 py-3 md:flex-row md:items-center">
            <div class="settings-primary-toolbar-heading">
              <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
                <div class="i-fas-cogs" />
                策略设置
                <span v-if="currentAccountName" class="glass-text-muted text-sm font-normal">
                  ({{ currentAccountName }})
                </span>
              </h3>
              <div class="settings-primary-toolbar-summary md:hidden">
                <span class="settings-primary-toolbar-chip ui-meta-chip--brand">
                  区服 {{ currentAccountZoneLabel }}
                </span>
                <span class="settings-primary-toolbar-chip ui-meta-chip--brand">
                  生效 {{ currentModeExecutionMeta.effectiveMeta.label }}
                </span>
                <span class="settings-primary-toolbar-chip ui-meta-chip--brand">
                  {{ localSettings.riskPromptEnabled ? '风控提示已开' : '风控提示已关' }}
                </span>
                <span
                  v-if="hasUnsavedAccountSettings"
                  class="settings-primary-toolbar-chip ui-meta-chip--warning"
                >
                  {{ accountSettingsDirtyCount }} 项待保存
                </span>
              </div>
            </div>
            <!-- 预设配置快捷组 -->
            <div class="settings-primary-actions ui-bulk-actions flex flex-wrap items-center gap-2">
              <span class="glass-text-muted mr-1 hidden text-xs lg:inline-block">预设:</span>
              <button
                type="button"
                class="settings-preset-chip ui-meta-chip--brand"
                title="安全优先，最像真人"
                @click="applyPreset('conservative')"
              >
                <div class="i-carbon-security" /> 保守
              </button>
              <button
                type="button"
                class="settings-preset-chip ui-meta-chip--info"
                title="推荐配置，收益与安全并重"
                @click="applyPreset('balanced')"
              >
                <div class="i-carbon-scales" /> 平衡
              </button>
              <button
                type="button"
                class="settings-preset-chip ui-meta-chip--warning"
                title="收益优先，适合小号跑图"
                @click="applyPreset('aggressive')"
              >
                <div class="i-carbon-rocket" /> 激进
              </button>

              <div class="settings-toolbar-divider mx-1 h-4 w-px" />

              <BaseButton
                variant="primary"
                size="sm"
                :loading="saving"
                class="settings-footer-button flex items-center gap-1 text-xs !h-auto !px-3 !py-1"
                @click="saveAccountSettings"
              >
                <div class="i-carbon-save" /> 保存当前账号
              </BaseButton>
            </div>
          </div>

          <!-- Strategy Content -->
          <div class="p-4 space-y-3">
            <div class="settings-strategy-focus rounded-xl px-3 py-2.5">
              <div class="settings-strategy-focus-title text-xs font-semibold">
                {{ strategyCategoryGuide.title }}
              </div>
              <p class="settings-strategy-focus-hint mt-1 text-xs leading-5">
                {{ strategyCategoryGuide.hint }}
              </p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <span v-for="tag in strategyCategoryGuide.tags" :key="`strategy-guide-${tag}`" class="settings-strategy-focus-chip px-2 py-0.5 text-[11px]">
                  {{ tag }}
                </span>
              </div>
            </div>

            <div v-show="isCommonSettingsCategory" class="settings-common-quick rounded-xl p-3">
              <div class="settings-common-quick-title flex items-center gap-2 text-sm font-semibold">
                <div class="i-carbon-flash-filled text-base" />
                常用 8 项快捷配置
              </div>
              <p class="settings-common-quick-hint mt-1 text-xs leading-5">
                仅保留高频项，改完即可直接保存。完整参数仍在“种植策略 / 自动任务 / 账号与安全”分类中。
              </p>
              <div class="settings-common-quick-grid">
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSelect
                    v-model="localSettings.accountMode"
                    label="账号模式"
                    :options="accountModeOptions"
                  />
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSwitch
                    v-model="localSettings.riskPromptEnabled"
                    label="风控提示"
                    hint="建议开启，关键风险动作会有明确提示。"
                    recommend="on"
                  />
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSelect
                    v-model="localSettings.plantingStrategy"
                    label="种植策略"
                    :options="plantingStrategyOptions"
                  />
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSwitch
                    v-model="localSettings.automation.farm"
                    label="自动种植收获"
                    hint="农场自动化总开关。"
                    recommend="on"
                  />
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSwitch
                    v-model="localSettings.automation.friend"
                    label="自动好友互动"
                    hint="好友巡查总开关。"
                    recommend="on"
                  />
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSwitch
                    v-model="localSettings.automation.sell"
                    label="自动卖果实"
                    hint="收获后自动出售果实。"
                    recommend="on"
                  />
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <div class="settings-common-quick-label mb-2 text-xs font-semibold">
                    好友巡查区间 (秒)
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <BaseInput
                      v-model.number="localSettings.intervals.friendMin"
                      label="最小"
                      type="number"
                      min="1"
                    />
                    <BaseInput
                      v-model.number="localSettings.intervals.friendMax"
                      label="最大"
                      type="number"
                      min="1"
                    />
                  </div>
                </div>
                <div class="settings-common-quick-card rounded-xl p-3">
                  <BaseSwitch
                    v-model="localSettings.friendQuietHours.enabled"
                    label="静默时段"
                    hint="避免在高风险时段执行好友动作。"
                  />
                  <div class="settings-quiet-hours-row mt-2">
                    <BaseInput
                      v-model="localSettings.friendQuietHours.start"
                      type="time"
                      class="settings-quiet-hours-input"
                      :disabled="!localSettings.friendQuietHours.enabled"
                    />
                    <BaseInput
                      v-model="localSettings.friendQuietHours.end"
                      type="time"
                      class="settings-quiet-hours-input"
                      :disabled="!localSettings.friendQuietHours.enabled"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-show="isSettingsCategoryVisible(['security'])" class="space-y-3">
              <div class="settings-security-quick rounded-xl p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div class="settings-security-quick-title flex items-center gap-2 text-sm font-semibold">
                      <div class="i-carbon-security text-base" />
                      账号与安全快捷配置
                    </div>
                    <p class="settings-security-quick-copy mt-1 text-xs leading-5">
                      首屏保留关键风控项；详细说明和高级保护策略可按需展开。
                    </p>
                  </div>
                  <span class="settings-security-quick-chip px-2.5 py-1 text-[11px]">
                    {{ securityDetailExpanded ? '详细模式' : '快捷模式' }}
                  </span>
                </div>

                <div class="grid grid-cols-1 mt-3 gap-3 md:grid-cols-2">
                  <div class="settings-security-quick-card rounded-xl p-3">
                    <BaseSelect
                      v-model="localSettings.accountMode"
                      label="账号模式"
                      :options="accountModeOptions"
                    />
                  </div>
                  <div class="settings-security-quick-card rounded-xl p-3">
                    <BaseSwitch
                      v-model="localSettings.riskPromptEnabled"
                      label="显示风控功能提示"
                      hint="建议开启，可明确看到当前模式和高风险提示。"
                      recommend="on"
                    />
                  </div>
                  <div class="settings-security-quick-card rounded-xl p-3">
                    <div class="text-xs font-semibold">
                      好友巡查区间 (秒)
                    </div>
                    <div class="grid grid-cols-2 mt-2 gap-2">
                      <BaseInput
                        v-model.number="localSettings.intervals.friendMin"
                        label="最小"
                        type="number"
                        min="1"
                      />
                      <BaseInput
                        v-model.number="localSettings.intervals.friendMax"
                        label="最大"
                        type="number"
                        min="1"
                      />
                    </div>
                  </div>
                  <div class="settings-security-quick-card rounded-xl p-3">
                    <BaseSwitch
                      v-model="localSettings.friendQuietHours.enabled"
                      label="静默时段"
                      hint="在高风险时段暂缓好友动作。"
                    />
                    <div class="settings-quiet-hours-row mt-2">
                      <BaseInput
                        v-model="localSettings.friendQuietHours.start"
                        type="time"
                        class="settings-quiet-hours-input"
                        :disabled="!localSettings.friendQuietHours.enabled"
                      />
                      <BaseInput
                        v-model="localSettings.friendQuietHours.end"
                        type="time"
                        class="settings-quiet-hours-input"
                        :disabled="!localSettings.friendQuietHours.enabled"
                      />
                    </div>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <BaseButton
                    variant="primary"
                    size="sm"
                    :loading="saving"
                    @click="saveAccountSettings"
                  >
                    保存当前账号设置
                  </BaseButton>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    @click="securityDetailExpanded = !securityDetailExpanded"
                  >
                    {{ securityDetailExpanded ? '收起详细配置' : '展开详细配置' }}
                  </BaseButton>
                </div>
              </div>

              <div v-show="securityDetailExpanded" class="space-y-3">
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,260px)_1fr]">
                  <div class="settings-mode-panel rounded-xl p-3 shadow-sm">
                    <BaseSwitch
                      v-model="localSettings.riskPromptEnabled"
                      label="显示风控功能提示"
                      hint="关闭后仅隐藏界面提示，不会关闭系统真实的安全保护和频率拦截。"
                      recommend="on"
                    />
                  </div>
                  <div
                    v-if="localSettings.riskPromptEnabled"
                    class="settings-mode-banner settings-mode-banner-info bg-linear-to-br rounded-xl p-4 text-sm shadow-sm"
                  >
                    <div class="settings-mode-banner-title mb-2 flex items-center gap-2 font-semibold">
                      <div class="i-carbon-model-alt" />
                      主号 / 小号作用范围已按区服重构
                    </div>
                    <div class="settings-mode-banner-copy leading-6 space-y-1.5">
                      <div>当前账号区服：<strong>{{ currentAccountZoneLabel }}</strong>。QQ 区和微信区的数据互不打通，主号/小号关系只在同区内讨论。</div>
                      <div>协同前提：主号和小号必须互为<strong>游戏好友</strong>，否则“主小号协同”没有业务意义。</div>
                      <div>降级规则：若跨区或不是游戏好友，系统仍保留当前账号的运行策略，但会按<strong>独立账号</strong>理解，不再误套主小号联动。</div>
                    </div>
                  </div>
                  <div
                    v-if="localSettings.riskPromptEnabled"
                    class="settings-mode-state-card rounded-xl p-4 text-sm shadow-sm"
                  >
                    <div class="settings-mode-state-title mb-2 flex items-center gap-2 font-semibold">
                      <div class="i-carbon-chart-relationship" />
                      当前运行态判定
                    </div>
                    <div class="space-y-3">
                      <div class="settings-mode-state-copy leading-6">
                        当前账号：<strong>{{ currentAccountName || currentAccountId || '未选中' }}</strong>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" :class="currentModeExecutionMeta.configuredMeta.badge">
                          配置:{{ currentModeExecutionMeta.configuredMeta.label }}
                        </span>
                        <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" :class="currentModeExecutionMeta.effectiveMeta.badge">
                          生效:{{ currentModeExecutionMeta.effectiveMeta.label }}
                        </span>
                        <span
                          v-if="currentModeExecutionMeta.statusBadge"
                          class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                          :class="currentModeExecutionMeta.statusBadge.badge"
                        >
                          {{ currentModeExecutionMeta.statusBadge.label }}
                        </span>
                      </div>
                      <div class="text-xs leading-5" :class="currentModeExecutionMeta.noteClass">
                        {{ currentModeExecutionMeta.note }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Account Mode Selection Panel -->
                <div class="grid grid-cols-1 mb-4 gap-3 md:grid-cols-3">
                  <!-- 主号模式 -->
                  <div
                    class="settings-mode-card settings-mode-card-brand cursor-pointer rounded-lg p-3 transition-all duration-200"
                    :class="{ 'settings-mode-card-active': localSettings.accountMode === 'main' }"
                    @click="localSettings.accountMode = 'main'"
                  >
                    <div class="mb-1 flex items-center justify-between">
                      <div class="settings-mode-card-title flex items-center gap-1 font-bold">
                        <div class="i-carbon-user-avatar items-center" /> 主号模式
                      </div>
                      <div v-show="localSettings.accountMode === 'main'" class="settings-mode-card-check i-carbon-checkmark-filled" />
                    </div>
                    <div class="settings-mode-card-copy text-xs leading-tight">
                      当前区服内的核心运营号；仅在同区且互为游戏好友时，才具备主号协同意义
                    </div>
                  </div>
                  <!-- 小号模式 -->
                  <div
                    class="settings-mode-card settings-mode-card-warning cursor-pointer rounded-lg p-3 transition-all duration-200"
                    :class="{ 'settings-mode-card-active': localSettings.accountMode === 'alt' }"
                    @click="localSettings.accountMode = 'alt'"
                  >
                    <div class="mb-1 flex items-center justify-between">
                      <div class="settings-mode-card-title flex items-center gap-1 font-bold">
                        <div class="i-carbon-user-multiple items-center" /> 小号模式
                      </div>
                      <div v-show="localSettings.accountMode === 'alt'" class="settings-mode-card-check i-carbon-checkmark-filled" />
                    </div>
                    <div class="settings-mode-card-copy text-xs leading-tight">
                      当前区服内的辅助号；默认延迟收获并抑制高仇恨动作，跨区或非好友时仅保留本号策略
                    </div>
                  </div>
                  <!-- 风险规避模式 -->
                  <div
                    class="settings-mode-card settings-mode-card-success cursor-pointer rounded-lg p-3 transition-all duration-200"
                    :class="{ 'settings-mode-card-active': localSettings.accountMode === 'safe' }"
                    @click="localSettings.accountMode = 'safe'"
                  >
                    <div class="mb-1 flex items-center justify-between">
                      <div class="settings-mode-card-title flex items-center gap-1 font-bold">
                        <div class="i-carbon-security items-center" /> 风险规避
                      </div>
                      <div v-show="localSettings.accountMode === 'safe'" class="settings-mode-card-check i-carbon-checkmark-filled" />
                    </div>
                    <div class="settings-mode-card-copy text-xs leading-tight">
                      敏感期防守号；压低高风险互动，不参与主小号协同，优先保证账号生存
                    </div>
                  </div>
                </div>

                <!-- 风险规避特供区：一键分析拦截 -->
                <div v-if="localSettings.accountMode === 'safe'" class="settings-mode-banner settings-mode-banner-success mb-4 flex flex-col items-start gap-2 rounded-md p-3">
                  <h4 class="settings-mode-banner-title flex items-center gap-1 text-sm font-semibold">
                    <div class="i-carbon-ibm-cloud-security-compliance-center" /> 风险规避专属护盾
                  </h4>
                  <span v-if="localSettings.riskPromptEnabled" class="settings-mode-banner-copy text-xs">此模式除自动关闭捣乱接口外，可进一步针对历史出现被封警告的号外置强阻断。</span>
                  <BaseButton
                    variant="outline"
                    size="sm"
                    class="settings-mode-inline-action mt-1"
                    :loading="safeChecking"
                    @click="handleSafeCheck"
                  >
                    <div class="i-carbon-search mr-1" /> 分析并加入防御名单
                  </BaseButton>
                </div>
              </div>
            </div>

            <!-- 小号模式特供区：假延迟 -->
            <div v-if="localSettings.accountMode === 'alt' && isSettingsCategoryVisible(['common', 'plant', 'security']) && securityCrossPanelsVisible" class="settings-mode-banner settings-mode-banner-warning mb-4 flex flex-col gap-2 rounded-md p-3">
              <h4 class="settings-mode-banner-title flex items-center gap-1 text-sm font-semibold">
                <div class="i-carbon-time" /> 小号专属：收获延迟保护
              </h4>
              <span v-if="localSettings.riskPromptEnabled" class="settings-mode-banner-copy text-xs">当农作物成熟时，主动随机延后再收，降低被风控或与主号形成同秒轨迹的概率。</span>
              <div class="grid grid-cols-2 mt-2 gap-3 md:grid-cols-4">
                <BaseInput
                  v-model.number="localSettings.harvestDelay.min"
                  label="随机延迟下限 (秒)"
                  type="number"
                  min="0"
                />
                <BaseInput
                  v-model.number="localSettings.harvestDelay.max"
                  label="随机延迟上限 (秒)"
                  type="number"
                  min="10"
                />
              </div>
            </div>

            <!-- 极值警告 -->
            <div v-if="farmIntervalHardBlockVisible && !isAdmin && isSettingsCategoryVisible(['common', 'plant', 'security']) && securityCrossPanelsVisible" class="settings-risk-alert mb-3 flex items-start gap-2 rounded-md p-3 text-sm">
              <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-lg" />
              <div>
                <strong>农场轮询过低，无法保存。</strong><br>
                普通用户农田循环下限仍为 15 秒；低于该值会被后端直接拦截。
              </div>
            </div>

            <div v-if="timeWarningVisible && !isAdmin && isSettingsCategoryVisible(['common', 'plant', 'security']) && securityCrossPanelsVisible" class="settings-risk-alert mb-3 flex items-start gap-2 rounded-md p-3 text-sm">
              <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-lg" />
              <div>
                <strong>好友相关巡查低于 60 秒，风险极高。</strong><br>
                保存时会要求你再次确认；确认后仍可保存，但更容易触发腾讯风控或出现 1002003。
              </div>
            </div>

            <div v-show="isSettingsCategoryVisible(['plant'])" class="space-y-3">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <BaseSelect
                  v-model="localSettings.plantingStrategy"
                  label="种植策略"
                  :options="plantingStrategyOptions"
                />
                <BaseSelect
                  v-if="localSettings.plantingStrategy === 'bag_priority'"
                  v-model="localSettings.bagSeedFallbackStrategy"
                  label="第二优先策略"
                  :options="bagSeedFallbackStrategyOptions"
                />
                <BaseSelect
                  v-else
                  v-model="localSettings.plantingFallbackStrategy"
                  label="失配回退"
                  :options="plantingFallbackStrategyOptions"
                />
                <BaseSelect
                  v-if="localSettings.plantingStrategy === 'preferred'"
                  v-model="localSettings.preferredSeedId"
                  label="优先种植种子"
                  :options="preferredSeedOptions"
                />
                <div v-else class="flex flex-col gap-1">
                  <span class="glass-text-muted text-xs">策略选种预览</span>
                  <div class="settings-strategy-preview h-9 flex items-center rounded-md px-3 text-sm font-bold">
                    <div class="i-carbon-checkmark-filled mr-1.5 text-primary-500" />
                    {{ localSettings.plantingStrategy === 'bag_priority' ? bagPriorityPreviewLabel : (strategyPreviewLabel ?? '加载中...') }}
                  </div>
                </div>
              </div>

              <div v-if="localSettings.plantingStrategy === 'bag_priority'" class="settings-bag-panel rounded-xl p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div class="settings-bag-title text-sm font-semibold">
                      背包种子优先顺序
                    </div>
                    <div class="settings-bag-copy mt-1 text-xs leading-5">
                      会先按下面的顺序尝试消耗背包中的种子。1x1 和 2x2 都参与排序；未解锁或可用数量为 0 的种子只展示，不会参与实际种植。
                    </div>
                  </div>
                  <div class="settings-bag-summary rounded-full px-3 py-1 text-[11px] font-semibold">
                    共 {{ bagPrioritySeeds.length }} 种
                  </div>
                </div>

                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <BaseButton
                    size="sm"
                    variant="outline"
                    @click="resetBagSeedPriorityRecommended"
                  >
                    推荐重排
                  </BaseButton>
                  <BaseButton
                    size="sm"
                    variant="outline"
                    @click="sortBagSeedPriorityByLevel"
                  >
                    按等级重排
                  </BaseButton>
                  <BaseButton
                    size="sm"
                    variant="outline"
                    :loading="bagPrioritySorting"
                    @click="sortBagSeedPriorityByFallbackStrategy"
                  >
                    按第二优先策略重排
                  </BaseButton>
                  <BaseButton
                    v-if="unconfiguredBagPrioritySeeds.length"
                    size="sm"
                    variant="ghost"
                    @click="appendNewBagSeedsToPriority"
                  >
                    新种子追加到末尾 ({{ unconfiguredBagPrioritySeeds.length }})
                  </BaseButton>
                </div>

                <div v-if="unconfiguredBagPrioritySeeds.length" class="settings-bag-notice mb-3 rounded-lg px-3 py-2 text-xs leading-5">
                  检测到 {{ unconfiguredBagPrioritySeeds.length }} 个新种子尚未固化到你的优先列表中。当前会先临时显示在列表末尾；你可以直接点“新种子追加到末尾”或“推荐重排”固定顺序。
                </div>

                <div v-if="bagPrioritySeeds.length > 0" class="space-y-3">
                  <div
                    v-for="(seed, index) in bagPrioritySeeds"
                    :key="`bag-priority-${seed.seedId}`"
                    class="settings-bag-seed-card flex flex-col gap-3 rounded-xl p-3 md:flex-row md:items-center"
                    :class="{ 'settings-bag-seed-card-muted': !seed.unlocked || seed.usableCount <= 0 }"
                    draggable="true"
                    @dragstart="handleBagSeedDragStart(seed.seedId)"
                    @dragover="handleBagSeedDragOver"
                    @drop="handleBagSeedDrop(seed.seedId)"
                    @dragend="handleBagSeedDragEnd"
                  >
                    <div class="flex items-center gap-3">
                      <div class="settings-bag-drag h-9 w-9 flex items-center justify-center rounded-full text-sm">
                        <div class="i-carbon-draggable" />
                      </div>
                      <div class="settings-bag-index h-9 w-9 flex items-center justify-center rounded-full text-sm font-bold">
                        {{ index + 1 }}
                      </div>
                      <img
                        :src="seed.image"
                        :alt="seed.name"
                        class="h-12 w-12 rounded-xl object-cover"
                      >
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-semibold">
                        {{ seed.name }}
                      </div>
                      <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Seed ID: {{ seed.seedId }} · Lv.{{ seed.requiredLevel }} · 占地 {{ seed.plantSize }}x{{ seed.plantSize }}
                      </div>
                      <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        背包 {{ seed.count }} · 可用 {{ seed.usableCount }} · 保留 {{ seed.reservedCount }}
                        <span v-if="!seed.unlocked"> · 当前等级未解锁</span>
                        <span v-else-if="seed.usableCount <= 0"> · 已被保留规则拦截</span>
                        <span v-else-if="!configuredBagPriorityIdSet.has(seed.seedId)"> · 新发现，待确认顺序</span>
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 md:justify-end">
                      <BaseBadge surface="glass-soft" tone="warning">
                        {{ seed.plantSize }}x{{ seed.plantSize }}
                      </BaseBadge>
                      <BaseButton
                        size="sm"
                        variant="ghost"
                        :disabled="index === 0"
                        @click="moveBagSeedPriority(seed.seedId, -1)"
                      >
                        上移
                      </BaseButton>
                      <BaseButton
                        size="sm"
                        variant="ghost"
                        :disabled="index === bagPrioritySeeds.length - 1"
                        @click="moveBagSeedPriority(seed.seedId, 1)"
                      >
                        下移
                      </BaseButton>
                    </div>
                  </div>
                </div>
                <div v-else class="settings-bag-empty rounded-lg border-dashed px-3 py-4 text-xs">
                  当前背包中没有种子，或该账号尚未完成背包数据刷新。
                </div>
              </div>

              <div class="settings-inventory-panel rounded-xl p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div class="settings-inventory-title text-sm font-semibold">
                      库存优先种植
                    </div>
                    <div class="settings-inventory-copy mt-1 text-xs leading-5">
                      优先消耗背包现有种子。可按“全局保留数量 + 指定种子保留规则”决定哪些库存不参与自动种植。
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseSelect
                    v-model="localSettings.inventoryPlanting.mode"
                    label="库存种植模式"
                    :options="inventoryPlantingModeOptions"
                  />
                  <BaseInput
                    v-model.number="localSettings.inventoryPlanting.globalKeepCount"
                    label="全局保留数量"
                    type="number"
                    min="0"
                  />
                </div>

                <div v-if="localSettings.inventoryPlanting.mode !== 'disabled'" class="mt-4">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="text-xs text-teal-700/80 dark:text-teal-200/70">
                      指定种子保留规则会覆盖全局保留数量。留空时仅使用上面的全局值。
                    </div>
                    <BaseButton
                      size="sm"
                      variant="outline"
                      class="settings-inventory-action"
                      @click="addInventoryReserveRule"
                    >
                      <div class="i-carbon-add mr-1" /> 添加保留规则
                    </BaseButton>
                  </div>

                  <div v-if="localSettings.inventoryPlanting.reserveRules.length > 0" class="space-y-2">
                    <div
                      v-for="(rule, index) in localSettings.inventoryPlanting.reserveRules"
                      :key="`inventory-rule-${index}`"
                      class="settings-inventory-rule grid grid-cols-1 gap-2 rounded-lg p-3 md:grid-cols-[minmax(0,1fr)_140px_auto]"
                    >
                      <BaseSelect
                        v-model="rule.seedId"
                        label="种子"
                        :options="inventoryReserveSeedOptions"
                      />
                      <BaseInput
                        v-model.number="rule.keepCount"
                        label="至少保留"
                        type="number"
                        min="0"
                      />
                      <div class="flex items-end">
                        <BaseButton
                          size="sm"
                          variant="ghost"
                          class="settings-inventory-remove"
                          @click="removeInventoryReserveRule(index)"
                        >
                          <div class="i-carbon-trash-can mr-1" /> 删除
                        </BaseButton>
                      </div>
                    </div>
                  </div>
                  <div v-else class="settings-inventory-empty rounded-lg border-dashed px-3 py-4 text-xs">
                    当前没有指定种子保留规则，系统只使用“全局保留数量”。
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-6">
                <BaseInput
                  v-model.number="localSettings.intervals.farmMin"
                  label="农场巡查最小 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.farmMax"
                  label="农场巡查最大 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.friendMin"
                  label="好友巡查最小 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.friendMax"
                  label="好友巡查最大 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.helpMin"
                  label="帮忙最小 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.helpMax"
                  label="帮忙最大 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.stealMin"
                  label="偷菜最小 (秒)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localSettings.intervals.stealMax"
                  label="偷菜最大 (秒)"
                  type="number"
                  min="1"
                />
              </div>
              <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
                好友巡查用于综合好友扫描节拍；若帮忙/偷菜仍保持默认值 60~180 秒，会自动跟随好友巡查区间。单次扫描耗时超过设定值时，下一轮会在完成后尽快补跑。
              </p>

              <div class="settings-section-divider mt-4 flex flex-wrap items-center gap-4 pt-3">
                <BaseSwitch
                  v-model="localSettings.friendQuietHours.enabled"
                  label="启用静默时段"
                />
                <div class="flex items-center gap-2">
                  <BaseInput
                    v-model="localSettings.friendQuietHours.start"
                    type="time"
                    class="w-24"
                    :disabled="!localSettings.friendQuietHours.enabled"
                  />
                  <span class="glass-text-muted">-</span>
                  <BaseInput
                    v-model="localSettings.friendQuietHours.end"
                    type="time"
                    class="w-24"
                    :disabled="!localSettings.friendQuietHours.enabled"
                  />
                </div>
              </div>

              <div class="settings-section-divider mt-4 pt-4">
                <div class="mb-3">
                  <h4 class="text-sm font-semibold">
                    出售策略
                  </h4>
                  <p class="settings-mode-card-copy mt-1 text-xs">
                    当前自动出售仅作用于果实类物品。可配置基础保留数量、强制保留清单以及稀有果实保留规则。
                  </p>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <BaseInput
                    v-model.number="localSettings.tradeConfig.sell.keepMinEachFruit"
                    label="每种果实至少保留"
                    type="number"
                    min="0"
                    max="999999"
                  />
                  <BaseInput
                    v-model.number="localSettings.tradeConfig.sell.batchSize"
                    label="出售批大小"
                    type="number"
                    min="1"
                    max="50"
                  />
                  <BaseSelect
                    v-model="localSettings.tradeConfig.sell.rareKeep.judgeBy"
                    label="稀有判定方式"
                    :options="[
                      { label: '任一条件命中', value: 'either' },
                      { label: '按作物等级', value: 'plant_level' },
                      { label: '按果实单价', value: 'unit_price' },
                    ]"
                  />
                </div>

                <div class="mt-3">
                  <label class="settings-mode-card-copy mb-1 block text-xs font-semibold">
                    强制保留果实 ID（逗号或空格分隔）
                  </label>
                  <textarea
                    v-model="tradeKeepFruitIdsText"
                    rows="2"
                    class="settings-trade-textarea w-full rounded-lg px-3 py-2 text-sm"
                    placeholder="例如：2001, 2002, 2003"
                  />
                </div>

                <div class="grid grid-cols-1 mt-4 gap-3 md:grid-cols-2">
                  <div class="settings-mode-panel rounded-xl p-4">
                    <BaseSwitch
                      v-model="localSettings.tradeConfig.sell.rareKeep.enabled"
                      label="启用稀有果实保留"
                    />
                    <div class="grid grid-cols-2 mt-3 gap-3">
                      <BaseInput
                        v-model.number="localSettings.tradeConfig.sell.rareKeep.minPlantLevel"
                        label="最低作物等级"
                        type="number"
                        min="0"
                        max="999"
                        :disabled="!localSettings.tradeConfig.sell.rareKeep.enabled"
                      />
                      <BaseInput
                        v-model.number="localSettings.tradeConfig.sell.rareKeep.minUnitPrice"
                        label="最低单价"
                        type="number"
                        min="0"
                        max="999999999"
                        :disabled="!localSettings.tradeConfig.sell.rareKeep.enabled"
                      />
                    </div>
                  </div>

                  <div class="settings-mode-panel rounded-xl p-4">
                    <BaseSwitch
                      v-model="localSettings.tradeConfig.sell.previewBeforeManualSell"
                      label="手动出售前先刷新预览"
                    />
                    <p class="settings-mode-card-copy mt-2 text-xs">
                      背包页手动出售时会先刷新出售计划，避免在你改动保留策略后直接误卖。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-show="isSettingsCategoryVisible(['auto'])">
            <!-- Auto Control Header -->
            <div class="settings-section-divider border-t bg-transparent px-4 py-3">
              <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
                <div class="i-fas-toggle-on" />
                自动控制
              </h3>
            </div>

            <!-- Auto Control Content -->
            <div class="flex-1 p-6 space-y-8">
              <div v-if="isCurrentAccountQq" class="settings-risk-alert rounded-2xl p-4 text-sm">
                <div class="flex items-start gap-3">
                  <div class="i-carbon-warning-alt mt-0.5 text-lg" />
                  <div class="space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-semibold">QQ 高风险功能提醒</span>
                      <BaseBadge surface="meta" :tone="qqHighRiskEnabledLabels.length ? 'danger' : 'warning'">
                        已开启 {{ qqHighRiskEnabledLabels.length }}/4
                      </BaseBadge>
                      <BaseBadge v-if="qqHighRiskRemainingMs > 0" surface="meta" tone="warning">
                        剩余 {{ qqHighRiskRemainingText }}
                      </BaseBadge>
                    </div>
                    <p class="leading-relaxed">
                      以下 4 个开关会显著增加腾讯侧的临界时点请求、好友接口探测或精确蹲守行为。默认建议保持关闭，只在确认可接受风险时短时开启。
                    </p>
                    <div class="flex flex-wrap gap-2 text-[11px]">
                      <span class="settings-risk-item">60秒施肥(防偷)</span>
                      <span class="settings-risk-item">成熟秒收取</span>
                      <span class="settings-risk-item">精准蹲守偷菜</span>
                      <span class="settings-risk-item">QQ 多链路好友拉取</span>
                    </div>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,180px)_1fr]">
                      <BaseInput
                        v-model.number="localSettings.qqHighRiskWindow.durationMinutes"
                        label="自动回退时长 (分钟)"
                        type="number"
                        min="5"
                        max="180"
                      />
                      <div class="settings-system-warning-alert rounded-xl p-3 text-xs leading-relaxed">
                        <p>
                          保存时如果你新开启了任一高风险项，后端只会签发一个临时窗口。窗口到期后，即使设置页没有打开，也会自动把这 4 项回退为关闭。
                        </p>
                        <p class="mt-2 font-medium">
                          当前窗口状态：{{ qqHighRiskWindowStatusText }}
                        </p>
                      </div>
                    </div>
                    <p class="text-xs">
                      当前开启：{{ qqHighRiskEnabledLabels.length ? qqHighRiskEnabledLabels.join('、') : '无' }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- 分组网格 -->
              <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 md:grid-cols-2">
                <!-- 分组 1: 农场基础操作 -->
                <div class="settings-automation-card rounded-2xl p-5 transition-all">
                  <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                    <div class="i-carbon-agriculture-analytics mr-2" /> 农场基础操作
                    <BaseTooltip text="农场自动化的核心控制区，包含种植收获、好友互动、升级土地等基础功能" />
                  </h4>
                  <div class="space-y-4">
                    <BaseSwitch v-model="localSettings.automation.farm" label="自动种植收获" hint="核心总开关。自动巡查农场：成熟即收、空地即种、异常即处理（浇水/除草/除虫/铲除枯死）。关闭后所有农场自动化停止。" recommend="on" />
                    <BaseSwitch v-model="localSettings.automation.friend" label="自动好友互动" hint="好友巡查总开关。开启后按下方子策略遍历好友农场执行操作（偷菜/帮忙/捣乱）。关闭则所有好友互动停止。" recommend="on" />
                    <div class="flex flex-col gap-2">
                      <BaseSwitch v-model="localSettings.automation.land_upgrade" label="自动升级土地" hint="金币充足且满足条件时自动升级土地等级，可提高产量。升级花费较大，金币紧张时建议关闭。" recommend="conditional" />
                      <div v-show="localSettings.automation.land_upgrade" class="ml-7 space-y-1">
                        <div class="flex items-center gap-2">
                          <span class="glass-text-muted shrink-0 text-[11px] font-bold tracking-widest uppercase">
                            最高升级到：
                          </span>
                          <BaseInput
                            v-model.number="localSettings.automation.landUpgradeTarget"
                            type="number"
                            min="0"
                            max="6"
                            class="w-16 shrink-0 text-sm shadow-inner !py-1"
                          />
                        </div>
                        <p class="settings-automation-note text-[10px]">
                          0=普通，6=蓝宝石
                        </p>
                      </div>
                    </div>
                    <BaseSwitch v-model="localSettings.automation.sell" label="自动卖果实" hint="收获后自动将仓库中的果实出售换取金币。关闭则果实堆积在仓库不处理。" recommend="on" />
                    <BaseSwitch v-model="localSettings.automation.farm_push" label="推送触发巡田" hint="收到外部事件（如消息推送）时立即触发一次农场巡查，而非等待定时轮询，提高响应灵敏度。" recommend="on" />
                  </div>
                </div>

                <!-- 分组 2: 每日收益领取 -->
                <div class="settings-automation-card rounded-2xl p-5 transition-all">
                  <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                    <div class="i-carbon-gift mr-2" /> 每日收益领取
                    <BaseTooltip text="每日可领取的免费奖励，建议全部开启以最大化日常收益" />
                  </h4>
                  <div class="space-y-4">
                    <BaseSwitch v-model="localSettings.automation.free_gifts" label="自动商城礼包" hint="每日自动领取商城中的免费礼包（种子/化肥/装饰等），错过后次日才能再领。" recommend="on" />
                    <BaseSwitch v-model="localSettings.automation.task" label="自动任务领奖" hint="自动领取每日任务、成长任务、活跃奖励；任务进度会随着种植、收菜、好友互动、分享等自动化行为自然推进。" recommend="on" />
                    <BaseSwitch v-model="localSettings.automation.share_reward" label="自动分享奖励" hint="自动触发分享操作并领取分享奖励，某些活动需分享才能获取额外收益。" recommend="on" />
                    <BaseSwitch v-model="localSettings.automation.email" label="自动领取邮件" hint="自动领取系统邮件中的附件奖励（活动奖励/补偿/系统礼品等）。" recommend="on" />
                    <div class="grid grid-cols-1 gap-4 pt-1">
                      <BaseSwitch v-model="localSettings.automation.vip_gift" label="自动VIP礼包" hint="VIP 用户专属，自动领取每日 VIP 礼包。非 VIP 用户开启无效但不会报错。" recommend="conditional" />
                      <BaseSwitch v-model="localSettings.automation.month_card" label="自动月卡奖励" hint="月卡用户专属，自动领取月卡每日奖励。无月卡开启无效但不会报错。" recommend="conditional" />
                      <BaseSwitch v-model="localSettings.automation.open_server_gift" label="自动开服红包" hint="自动领取开服活动红包奖励。活动期间有效，非活动期开启无影响。" recommend="on" />
                    </div>
                    <div v-show="localSettings.automation.open_server_gift" class="ml-7 space-y-3">
                      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <BaseSwitch v-model="localSettings.redpacketConfig.enabled" label="启用独立红包模块" hint="将开服红包领取迁移到独立运行时模块，避免和旧 task 模块重复执行。" recommend="on" />
                        <BaseSwitch v-model="localSettings.redpacketConfig.notifyTriggeredEnabled" label="事件触发补查" hint="作物收获等关键事件后追加一次轻量红包探测，适合活动期间提高命中率。" recommend="conditional" />
                      </div>
                      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <BaseSelect
                          v-model="localSettings.redpacketConfig.mode"
                          label="红包检查策略"
                          :options="redpacketModeOptions"
                        />
                        <BaseInput
                          v-model.number="localSettings.redpacketConfig.checkIntervalSec"
                          label="检查间隔 (秒)"
                          type="number"
                          min="60"
                        />
                        <BaseInput
                          v-model.number="localSettings.redpacketConfig.claimCooldownSec"
                          label="领取冷却 (秒)"
                          type="number"
                          min="60"
                        />
                      </div>
                      <BaseSwitch v-model="localSettings.experimentalFeatures.advancedRedpacketTriggerEnabled" label="实验性活动触发增强" hint="补充更激进的红包触发时机，仅建议在活动期临时开启观察效果。" recommend="off" />
                      <p class="settings-automation-note text-[10px]">
                        独立红包模块开启后，运行时会自动避开旧的 task 例行领取逻辑，避免重复请求。
                      </p>
                    </div>
                  </div>
                </div>

                <!-- 分组 3: 化肥与杂项控制 -->
                <div class="settings-automation-card rounded-2xl p-5 transition-all">
                  <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                    <div class="i-carbon-tool-box mr-2" /> 化肥与精细控制
                    <BaseTooltip text="化肥管理和高级防盗功能的精细控制区" />
                  </h4>
                  <div class="space-y-4">
                    <BaseSwitch v-model="localSettings.automation.fertilizer_gift" label="自动填充化肥" hint="有免费化肥领取机会时自动领取，保证化肥库存不断档。" recommend="on" />
                    <div class="flex flex-col gap-2">
                      <BaseSwitch v-model="localSettings.automation.fertilizer_buy" label="自动购买化肥" hint="通过商城点券礼包自动补普通肥/有机肥容器，可按余量阈值触发，也可持续补满。" recommend="conditional" />
                      <div v-show="localSettings.automation.fertilizer_buy" class="ml-7 space-y-3">
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <BaseSelect
                            v-model="localSettings.automation.fertilizer_buy_type"
                            label="购肥类型"
                            :options="fertilizerBuyTypeOptions"
                          />
                          <BaseSelect
                            v-model="localSettings.automation.fertilizer_buy_mode"
                            label="触发模式"
                            :options="fertilizerBuyModeOptions"
                          />
                        </div>
                        <div v-if="localSettings.automation.fertilizer_buy_mode === 'threshold'" class="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <BaseInput
                            v-model.number="localSettings.automation.fertilizer_buy_threshold_normal"
                            label="普通肥阈值 (小时)"
                            type="number"
                            min="0"
                          />
                          <BaseInput
                            v-model.number="localSettings.automation.fertilizer_buy_threshold_organic"
                            label="有机肥阈值 (小时)"
                            type="number"
                            min="0"
                          />
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="glass-text-muted text-[11px] font-bold tracking-widest uppercase">
                            - 单日最大购买上限 (包)：
                          </span>
                          <BaseInput
                            v-model.number="localSettings.automation.fertilizer_buy_limit"
                            type="number"
                            min="1"
                            class="w-24 text-sm shadow-inner !py-1"
                          />
                        </div>
                        <p class="settings-automation-note text-[10px]">
                          优先使用点券礼包。若选择“双容器”，系统会先补剩余时长更低的一侧。
                        </p>
                      </div>
                    </div>
                    <div class="space-y-4" :class="isCurrentAccountQq ? 'settings-system-warning-alert rounded-xl p-3' : ''">
                      <div v-if="isCurrentAccountQq" class="flex items-start gap-2 text-xs">
                        <div class="i-carbon-warning-alt mt-0.5" />
                        <div class="leading-relaxed space-y-1">
                          <p class="font-semibold tracking-wide uppercase">
                            QQ 高风险精确控制
                          </p>
                          <p>
                            这一组会制造“成熟前”和“成熟瞬间”的强特征操作节奏。即使前端打开，QQ 平台默认也会被后端安全守卫拦截，除非你显式放开环境变量。
                          </p>
                        </div>
                      </div>
                      <BaseSwitch v-model="localSettings.automation.fertilizer_60s_anti_steal" label="60秒施肥(防偷)" hint="临近成熟前集中施肥并抢收，风控风险较高；QQ 平台默认由后端安全守卫拦截，只有显式放开环境变量才会执行。" recommend="off" />
                      <BaseSwitch v-model="localSettings.automation.fastHarvest" label="成熟秒收取" hint="成熟前预设精确收获任务，风控风险较高；QQ 平台默认由后端安全守卫拦截，只有显式放开环境变量才会执行。" recommend="off" />
                    </div>
                    <BaseSwitch v-model="localSettings.automation.fertilizer_smart_phase" label="智能二季施肥" hint="开启后，二季作物刚种植时不会马上浪费化肥，而是等到耗时最长的黄金阶段再自动进行延期施肥，实现单果经验/金钱收益最大化。" recommend="conditional" />
                    <div class="settings-section-divider pt-2">
                      <div class="settings-automation-scope mb-2 rounded-md px-2.5 py-1.5 text-xs">
                        {{ fertilizerScopeText }}
                      </div>
                      <BaseSelect
                        v-model="localSettings.automation.fertilizer"
                        label="内容选择：施肥策略"
                        class="!w-full"
                        :options="fertilizerOptions"
                        title="种植后自动施肥的方式。普通肥加速生长、有机肥改善土壤（可循环施直到耗尽）、两者兼用效果最佳。推荐：普通+有机"
                      />
                    </div>
                  </div>
                </div>

                <div class="settings-automation-card rounded-2xl p-5 transition-all">
                  <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                    <div class="i-carbon-network-4 mr-2" /> 实验能力与网络出口
                    <BaseTooltip text="这里放置默认关闭的增强能力：行为流上报、重点偷取策略和账号级代理绑定。" />
                  </h4>
                  <div class="space-y-4">
                    <div class="space-y-3">
                      <BaseSwitch v-model="localSettings.behaviorReportConfig.enabled" label="启用行为流上报" hint="把登录启动序列和在线时长按批次上报到运行时模块，默认关闭，不影响主流程。" recommend="off" />
                      <div v-show="localSettings.behaviorReportConfig.enabled" class="ml-7 space-y-3">
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <BaseSwitch v-model="localSettings.behaviorReportConfig.startupSequenceEnabled" label="启动序列上报" hint="账号上线后补齐 loading / preload / login 这类启动节点，适合拟态化场景。" recommend="on" />
                          <BaseSwitch v-model="localSettings.behaviorReportConfig.playTimeReportEnabled" label="在线时长上报" hint="在 worker 停止前补一条在线时长记录，便于保持行为节奏闭环。" recommend="on" />
                        </div>
                        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <BaseInput
                            v-model.number="localSettings.behaviorReportConfig.flushIntervalSec"
                            label="批量刷新间隔 (秒)"
                            type="number"
                            min="5"
                          />
                          <BaseInput
                            v-model.number="localSettings.behaviorReportConfig.maxBufferSize"
                            label="单批缓存上限"
                            type="number"
                            min="1"
                          />
                        </div>
                        <BaseSwitch v-model="localSettings.experimentalFeatures.tlogFlowReportEnabled" label="实验性流量拟态补偿" hint="在基础上报之外允许更激进的行为流补偿逻辑，建议只在观察期启用。" recommend="off" />
                      </div>
                    </div>

                    <div class="settings-section-divider pt-2">
                      <BaseSwitch v-model="localSettings.experimentalFeatures.focusStealEnabled" label="实验性重点偷取策略" hint="仅聚焦特别关照名单和高价值目标进行优先偷取，默认关闭，适合尝鲜观察。" recommend="off" />
                    </div>

                    <div class="settings-section-divider pt-2 space-y-3">
                      <BaseSwitch v-model="localSettings.proxyBindingConfig.enabled" label="为当前账号绑定代理出口" hint="给当前账号指定独立代理节点。若代理失效，可按设置自动回退直连。" recommend="conditional" />
                      <div v-show="localSettings.proxyBindingConfig.enabled" class="ml-7 space-y-3">
                        <BaseSelect
                          v-model="localSettings.proxyBindingConfig.proxyId"
                          label="代理节点"
                          :options="[{ label: '请选择代理节点', value: '' }, ...proxyPoolOptions]"
                        />
                        <BaseSwitch v-model="localSettings.proxyBindingConfig.fallbackToDirect" label="代理失效时自动回退直连" hint="如果节点冷却或探测失败，允许该账号继续直连运行，避免整号停摆。" recommend="on" />
                        <p class="settings-automation-note text-[10px]">
                          当前代理池共 {{ proxyPoolRecords.length }} 个可选节点。管理员可在下方“代理池管理”继续增删和体检。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 好友互动详细控制 (始终显示，关闭时灰化) -->
              <div class="settings-friend-panel relative rounded-2xl p-5 transition-all" :class="localSettings.automation.friend ? 'settings-friend-panel-active' : 'settings-friend-panel-inactive'">
                <!-- 灰化遮罩：总开关关闭时覆盖内容区 -->
                <div v-if="!localSettings.automation.friend" class="settings-friend-overlay absolute inset-0 z-10 flex items-center justify-center rounded-2xl">
                  <span class="settings-friend-overlay-badge ui-glass-chip rounded-lg px-4 py-2 text-sm font-bold shadow-lg">
                    🔒 请先开启上方「自动好友互动」总开关
                  </span>
                </div>
                <h4 class="mb-4 flex items-center text-xs font-bold tracking-widest uppercase" :class="localSettings.automation.friend ? 'settings-friend-title-active' : 'settings-friend-title-inactive'">
                  <div class="i-carbon-user-multiple mr-2" /> 社交互动详细策略
                  <BaseTooltip text="只有在主开关【自动好友互动】开启时此策略组才会生效，控制在好友农场的具体行为。" />
                </h4>
                <div class="grid grid-cols-1 gap-4 lg:grid-cols-4 md:grid-cols-2" :class="{ 'opacity-40 pointer-events-none select-none': !localSettings.automation.friend }">
                  <div
                    v-if="isCurrentAccountQq"
                    class="settings-system-warning-alert rounded-xl p-4 lg:col-span-4 md:col-span-2"
                  >
                    <div class="flex items-start gap-2 text-xs">
                      <div class="i-carbon-warning-alt mt-0.5" />
                      <div class="leading-relaxed space-y-1">
                        <p class="font-semibold tracking-wide uppercase">
                          QQ 高风险好友探测
                        </p>
                        <p>
                          这一组会触发精确蹲守或扩大好友列表接口探测面，是当前 QQ 账号最容易误开的社交高风险项。默认建议保持关闭。
                        </p>
                      </div>
                    </div>
                    <div class="grid grid-cols-1 mt-4 gap-4 lg:grid-cols-3">
                      <BaseSwitch v-model="localSettings.stakeoutSteal.enabled" label="精准蹲守偷菜" hint="自动记录好友作物成熟时间并精确蹲点偷取，风控风险较高；QQ 平台默认由后端安全守卫拦截。" recommend="off" />
                      <div class="inline-flex flex-col gap-1">
                        <template v-if="localSettings.stakeoutSteal.enabled">
                          <label class="inline-flex items-center gap-2">
                            <span class="glass-text-main select-none text-sm font-medium">蹲守延迟</span>
                            <div class="settings-stakeout-delay flex items-center gap-1.5 rounded-md px-2 py-1">
                              <input
                                v-model.number="localSettings.stakeoutSteal.delaySec"
                                type="number"
                                min="0"
                                max="60"
                                class="glass-text-main w-12 bg-transparent text-center text-sm font-bold outline-none"
                              >
                              <span class="glass-text-muted text-xs font-bold">秒</span>
                            </div>
                          </label>
                          <p class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
                            成熟后等待几秒再偷，模拟真人操作节奏，推荐 3~10 秒。
                            <BaseBadge surface="meta" tone="warning" class="recommend-badge">
                              推荐 3 秒
                            </BaseBadge>
                          </p>
                        </template>
                        <template v-else>
                          <span class="glass-text-muted select-none text-sm">蹲守延迟设置</span>
                          <p class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
                            请先开启左侧「精准蹲守偷菜」开关。
                          </p>
                        </template>
                      </div>
                      <BaseSwitch v-model="localSettings.automation.qqFriendFetchMultiChain" label="QQ 多链路好友拉取" hint="默认关闭。开启后恢复旧版 QQ 好友列表探测逻辑，会重新启用 SyncAll 失败后的 GetGameFriends / GetAll / 缓存补链，成功率可能更高，但会明显增加腾讯侧接口探测面。" recommend="off" />
                    </div>
                  </div>

                  <template v-else>
                    <!-- 蹲守开关：独立占一格 -->
                    <BaseSwitch v-model="localSettings.stakeoutSteal.enabled" label="精准蹲守偷菜" hint="自动记录好友作物成熟时间并精确蹲点偷取，风控风险较高；QQ 平台默认由后端安全守卫拦截。" recommend="off" />
                    <!-- 蹲守延迟设置：独立占一格，仅在开启后显示内容 -->
                    <div class="inline-flex flex-col gap-1">
                      <template v-if="localSettings.stakeoutSteal.enabled">
                        <label class="inline-flex items-center gap-2">
                          <span class="glass-text-main select-none text-sm font-medium">蹲守延迟</span>
                          <div class="settings-stakeout-delay flex items-center gap-1.5 rounded-md px-2 py-1">
                            <input
                              v-model.number="localSettings.stakeoutSteal.delaySec"
                              type="number"
                              min="0"
                              max="60"
                              class="glass-text-main w-12 bg-transparent text-center text-sm font-bold outline-none"
                            >
                            <span class="glass-text-muted text-xs font-bold">秒</span>
                          </div>
                        </label>
                        <p class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
                          成熟后等待几秒再偷，模拟真人操作节奏，推荐 3~10 秒。
                          <BaseBadge surface="meta" tone="warning" class="recommend-badge">
                            推荐 3 秒
                          </BaseBadge>
                        </p>
                      </template>
                      <template v-else>
                        <span class="glass-text-muted select-none text-sm">蹲守延迟设置</span>
                        <p class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
                          请先开启左侧「精准蹲守偷菜」开关。
                        </p>
                      </template>
                    </div>
                  </template>

                  <BaseSwitch v-model="localSettings.automation.friend_steal" label="自动偷菜" hint="访问好友农场时自动偷取成熟果实，是金币收入的重要补充来源。" recommend="on" />
                  <BaseSwitch v-model="localSettings.automation.friend_help" label="自动帮忙" hint="访问好友农场时自动帮忙浇水/除草/除虫，可获得经验奖励。" recommend="on" />
                  <BaseSwitch v-model="localSettings.automation.friend_bad" label="自动捣乱" hint="访问好友农场时自动放虫/放草。有社交风险，好友可能拉黑你，小号专用。" recommend="off" />
                  <BaseSwitch v-model="localSettings.automation.friend_auto_accept" label="自动同意好友" hint="自动同意所有好友申请。好友越多偷菜机会越多，但也增加被偷风险。" recommend="conditional" />
                  <BaseSwitch v-model="localSettings.automation.friend_help_exp_limit" label="经验上限停止帮忙" hint="当日帮忙经验达到系统上限后自动停止，避免做无用功浪费请求配额。" recommend="on" />
                  <BaseSwitch v-model="localSettings.automation.forceGetAllEnabled" label="强效兼容尝试" hint="主要用于微信环境的好友列表兼容。QQ 当前默认走保守单链路 SyncAll，这个开关在 QQ 下会被后端忽略。" recommend="conditional" />
                </div>
              </div>

              <!-- 偷菜与好友过滤 (已迁移) -->
              <div class="border-2 border-primary-200 rounded-2xl border-dashed bg-primary-50/50 p-6 text-center dark:border-primary-800/30 dark:bg-primary-900/10">
                <div class="mx-auto mb-3 h-12 w-12 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-800/50">
                  <div class="i-carbon-sprout text-2xl text-primary-600 dark:text-primary-400" />
                </div>
                <h4 class="glass-text-main text-sm font-bold">
                  偷菜白名单与作物过滤已迁移
                </h4>
                <p class="glass-text-muted dark:glass-text-muted mx-auto mt-2 max-w-md text-xs">
                  为了提供更加流畅与精细的控制体验，我们设计了全新的独立管理面板。包含可视化图标、等级检视以及便捷的模糊搜索。
                </p>
                <BaseButton
                  to="/steal-settings"
                  variant="success"
                  class="mt-4"
                >
                  前往偷菜控制台 <div class="i-carbon-arrow-right ml-2" />
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- Save Button -->
          <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel mt-auto flex justify-end px-4 py-3">
            <p class="settings-sticky-save-note md:hidden">
              保存后会立即应用到当前账号。
            </p>
            <BaseButton
              variant="primary"
              size="sm"
              :loading="saving"
              class="settings-footer-button"
              @click="saveAccountSettings"
            >
              保存当前账号设置
            </BaseButton>
          </div>
        </div>

        <div
          v-else
          v-show="isSettingsCategoryVisible(['common', 'plant', 'auto', 'security'])"
          class="card glass-panel flex flex-col items-center justify-center gap-4 rounded-lg p-12 text-center shadow"
          :class="strategyPanelFullWidth ? 'lg:col-span-2' : ''"
        >
          <div class="settings-empty-icon rounded-full p-4">
            <div class="i-carbon-settings-adjust glass-text-muted text-4xl" />
          </div>
          <div class="max-w-xs">
            <h3 class="glass-text-main text-lg font-medium">
              需要登录账号
            </h3>
            <p class="glass-text-muted mt-1 text-sm">
              请先登录账号以配置策略和自动化选项。
            </p>
          </div>
        </div>

        <!-- Card 2: System Settings (Password & Offline) -->
        <div
          v-show="isSettingsCategoryVisible(['common', 'notice', 'security'])"
          class="card glass-panel h-full flex flex-col rounded-lg shadow"
          :class="accountPanelFullWidth ? 'lg:col-span-2' : ''"
        >
          <!-- Password Header -->
          <div v-show="!isNoticeSettingsCategory" class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-password" />
              账号密码
              <span v-if="currentUsername" class="settings-mode-badge ui-meta-chip--brand text-xs font-normal">
                {{ currentUsername }}
              </span>
            </h3>
          </div>
          <div v-show="isNoticeSettingsCategory" class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-notification" />
              通知提醒
            </h3>
          </div>

          <!-- Password Content -->
          <form v-show="!isNoticeSettingsCategory" class="p-4 space-y-3" @submit.prevent="handleChangePassword">
            <input
              :value="currentUsername || ''"
              type="text"
              name="username"
              autocomplete="username"
              class="hidden"
              readonly
              tabindex="-1"
              aria-hidden="true"
            >
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div
                v-for="card in sessionStatusCards"
                :key="card.key"
                class="settings-report-stat-card rounded-xl px-3 py-3"
                :class="[card.tone, card.bg]"
              >
                <div class="text-[11px] font-medium tracking-[0.18em] uppercase opacity-80">
                  {{ card.label }}
                </div>
                <div class="mt-2 text-lg font-semibold leading-none">
                  {{ card.value }}
                </div>
                <div class="mt-2 text-xs opacity-80">
                  {{ card.hint }}
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <BaseInput
                v-model="passwordForm.old"
                label="当前密码"
                type="password"
                autocomplete="current-password"
                placeholder="当前登录密码"
              />
              <BaseInput
                v-model="passwordForm.new"
                label="新密码"
                type="password"
                autocomplete="new-password"
                :placeholder="isAdmin ? '至少 4 位' : '至少 6 位，需含字母和数字'"
              />
              <BaseInput
                v-model="passwordForm.confirm"
                label="确认新密码"
                type="password"
                autocomplete="new-password"
                placeholder="再次输入新密码"
              />
            </div>

            <div class="flex items-center justify-between pt-1">
              <p class="glass-text-muted text-xs">
                修改当前登录账号 <strong>{{ currentUsername }}</strong> 的密码
              </p>
              <BaseButton
                variant="primary"
                size="sm"
                type="submit"
                :loading="passwordSaving"
              >
                修改密码
              </BaseButton>
            </div>
          </form>

          <div v-show="showNoticeQuickPanel" class="settings-notice-quick px-4 py-4">
            <div class="settings-notice-quick-head flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="settings-notice-quick-title text-sm font-semibold">
                  通知快捷配置
                </div>
                <p class="settings-notice-quick-copy mt-1 text-xs">
                  首屏只显示高频项，详细字段可按需展开。
                </p>
              </div>
              <span class="settings-notice-quick-chip px-2.5 py-1 text-[11px]">
                {{ noticeDetailExpanded ? '详细模式' : '快捷模式' }}
              </span>
            </div>

            <div class="settings-notice-quick-metrics grid grid-cols-1 mt-3 gap-3 md:grid-cols-2">
              <div
                v-for="item in noticeQuickOverviewItems"
                :key="item.key"
                class="settings-notice-quick-metric rounded-xl p-3"
              >
                <div class="settings-notice-quick-metric-label text-[11px] font-semibold tracking-wide uppercase">
                  {{ item.label }}
                </div>
                <div class="settings-notice-quick-metric-value mt-1 text-sm font-semibold">
                  {{ item.value }}
                </div>
                <div class="settings-notice-quick-metric-note mt-1 text-[11px] leading-5">
                  {{ item.note }}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 mt-3 gap-3 md:grid-cols-2">
              <template v-if="isAdmin">
                <BaseSelect
                  v-model="localOffline.channel"
                  label="下线提醒渠道"
                  :options="channelOptions"
                />
                <BaseInput
                  v-model="localOffline.title"
                  label="下线提醒标题"
                  type="text"
                  placeholder="提醒标题"
                />
                <BaseSwitch
                  v-model="localOffline.offlineDeleteEnabled"
                  label="离线自动删号"
                  hint="仅在管理员模式下生效。"
                  recommend="off"
                />
              </template>

              <template v-if="currentAccountId">
                <BaseSwitch
                  v-model="localSettings.reportConfig.enabled"
                  label="启用经营汇报"
                  hint="当前账号的日报/小时汇报总开关。"
                  recommend="conditional"
                />
                <BaseSelect
                  v-model="localSettings.reportConfig.channel"
                  label="汇报渠道"
                  :options="reportChannelOptions"
                />
                <div class="settings-notice-quick-card rounded-xl p-3 md:col-span-2">
                  <div class="flex flex-wrap items-center gap-3">
                    <BaseSwitch
                      v-model="localSettings.reportConfig.dailyEnabled"
                      label="每日汇报"
                      hint="建议在固定复盘时间发送。"
                      recommend="on"
                    />
                    <span class="glass-text-muted text-xs">发送时间</span>
                    <BaseInput
                      v-model.number="localSettings.reportConfig.dailyHour"
                      type="number"
                      min="0"
                      max="23"
                      class="w-24 text-sm shadow-inner !py-1"
                      :disabled="!localSettings.reportConfig.dailyEnabled"
                    />
                    <span class="glass-text-muted text-xs">时</span>
                    <BaseInput
                      v-model.number="localSettings.reportConfig.dailyMinute"
                      type="number"
                      min="0"
                      max="59"
                      class="w-24 text-sm shadow-inner !py-1"
                      :disabled="!localSettings.reportConfig.dailyEnabled"
                    />
                    <span class="glass-text-muted text-xs">分</span>
                  </div>
                </div>
              </template>

              <div v-if="!isAdmin && !currentAccountId" class="settings-notice-quick-empty rounded-xl px-3 py-4 text-xs md:col-span-2">
                当前账号暂无可配置通知项。管理员可配置下线提醒，登录账号后可配置经营汇报。
              </div>
            </div>

            <div class="settings-notice-quick-actions mt-4 flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap gap-2">
                <BaseButton
                  v-if="isAdmin"
                  variant="primary"
                  size="sm"
                  :loading="offlineSaving"
                  @click="handleSaveOffline"
                >
                  保存下线提醒
                </BaseButton>
                <BaseButton
                  v-if="currentAccountId"
                  variant="primary"
                  size="sm"
                  :loading="saving"
                  @click="saveAccountSettings"
                >
                  保存当前账号设置
                </BaseButton>
                <BaseButton
                  v-if="currentAccountId"
                  variant="secondary"
                  size="sm"
                  :loading="reportTesting"
                  @click="handleSendReportTest"
                >
                  发送测试汇报
                </BaseButton>
              </div>
              <BaseButton
                variant="secondary"
                size="sm"
                :disabled="!noticeHasDetailPanels"
                @click="noticeDetailExpanded = !noticeDetailExpanded"
              >
                {{ noticeDetailExpanded ? '收起详细配置' : '展开详细配置' }}
              </BaseButton>
            </div>
          </div>

          <template v-if="isAdmin && showNoticeQuickPanel && noticeDetailExpanded">
            <!-- Offline Header -->
            <div class="settings-card-divider settings-card-divider-top px-4 py-3">
              <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
                <div class="i-carbon-notification" />
                下线提醒
                <span class="settings-mode-badge ui-meta-chip--info text-[11px]">
                  全局 / 仅管理员
                </span>
              </h3>
              <p class="settings-system-note mt-2 text-xs">
                这是系统级的统一提醒配置，所有账号共用一套渠道和文案，仅管理员可以修改。
              </p>
            </div>

            <!-- Offline Content -->
            <div class="flex-1 p-4 space-y-3">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="flex items-center gap-2">
                  <BaseSelect
                    v-model="localOffline.channel"
                    label="推送渠道"
                    :options="channelOptions"
                    class="flex-1"
                  />
                  <a
                    v-if="channelDocUrl"
                    :href="channelDocUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="settings-system-doc-link settings-system-doc-link-info mt-5 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium"
                    title="查看官方文档"
                  >
                    <span class="i-carbon-launch text-xs" />
                    官网
                  </a>
                </div>
                <BaseSelect
                  v-model="localOffline.reloginUrlMode"
                  label="重登录链接"
                  :options="reloginUrlModeOptions"
                />
              </div>

              <BaseInput
                v-model="localOffline.endpoint"
                label="接口地址"
                type="text"
                :disabled="localOffline.channel !== 'webhook'"
              />

              <BaseInput
                v-model="localOffline.token"
                label="Token"
                type="text"
                placeholder="接收端 token"
              />

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseInput
                  v-model="localOffline.title"
                  label="标题"
                  type="text"
                  placeholder="提醒标题"
                />
                <BaseSwitch
                  v-model="localOffline.offlineDeleteEnabled"
                  label="离线自动删号"
                  hint="默认关闭。开启后按下面秒数，账号持续离线超时会自动删除。"
                  recommend="off"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseInput
                  v-model.number="localOffline.offlineDeleteSec"
                  label="离线删除账号 (秒)"
                  type="number"
                  min="1"
                  :disabled="!localOffline.offlineDeleteEnabled"
                  placeholder="默认 1"
                />
              </div>

              <BaseInput
                v-model="localOffline.msg"
                label="内容"
                type="text"
                placeholder="提醒内容"
              />

              <div v-if="localOffline.channel === 'webhook'" class="settings-system-panel rounded-lg p-3 space-y-2">
                <BaseSwitch
                  v-model="localOffline.webhookCustomJsonEnabled"
                  label="Webhook 自定义 JSON"
                  hint="开启后将按下方 JSON 模板作为请求体发送。可用变量：{{title}} {{content}} {{accountId}} {{accountName}} {{reason}} {{timestamp}} {{isoTime}}"
                  recommend="conditional"
                />
                <textarea
                  v-model="localOffline.webhookCustomJsonTemplate"
                  :disabled="!localOffline.webhookCustomJsonEnabled"
                  class="settings-system-editor min-h-[120px] w-full p-2 text-xs font-mono"
                  placeholder="{&quot;title&quot;:&quot;{{title}}&quot;,&quot;content&quot;:&quot;{{content}}&quot;,&quot;accountId&quot;:&quot;{{accountId}}&quot;,&quot;accountName&quot;:&quot;{{accountName}}&quot;,&quot;timestamp&quot;:&quot;{{timestamp}}&quot;}"
                />
              </div>
            </div>

            <!-- Save Offline Button -->
            <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel flex items-center justify-end gap-3 px-4 py-3">
              <p class="settings-sticky-save-note hidden max-w-xs text-right md:block">
                这里只保存右侧的全局下线提醒，不会保存左侧巡查时间、静默时段和自动控制。
              </p>
              <BaseButton
                variant="primary"
                size="sm"
                :loading="offlineSaving"
                class="settings-footer-button"
                @click="handleSaveOffline"
              >
                只保存下线提醒（不保存账号设置）
              </BaseButton>
            </div>
          </template>

          <template v-if="isAdmin && showNoticeQuickPanel && noticeDetailExpanded">
            <div class="settings-card-divider settings-card-divider-top px-4 py-3">
              <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
                <span class="settings-bug-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" class="settings-bug-icon-svg">
                    <circle cx="12" cy="7" r="2.1" fill="currentColor" />
                    <ellipse cx="12" cy="13" rx="4.1" ry="5.1" fill="currentColor" opacity="0.92" />
                    <path d="M7.1 10.1 4.9 8.4M6.1 13H3.7m2.4 3.1-2 1.6m11.7-7.6 2.2-1.7m-1.2 4.6h2.4m-3.4 3.1 2 1.6M9.4 7.6 7.8 5.7m6.8 1.9 1.6-1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
                问题反馈
                <span class="settings-mode-badge ui-meta-chip--info text-[11px]">
                  全局 / 仅管理员
                </span>
              </h3>
              <p class="settings-system-note mt-2 text-xs">
                这里配置用户提交 BUG 时的固定收件邮箱、SMTP 通道和自动附带的日志范围。授权码会在后端加密保存，保存后不会再从设置页回显明文。
              </p>
            </div>

            <div class="flex-1 p-4 space-y-3">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseSwitch
                  v-model="localBugReport.enabled"
                  label="启用问题反馈"
                  hint="关闭后前端入口仍可显示，但提交时会明确提示功能未开启。"
                />
                <BaseSwitch
                  v-model="localBugReport.allowNonAdminSubmit"
                  label="允许普通用户提交"
                  hint="关闭后仅管理员可提交反馈，适合先内部试运行。"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseInput
                  v-model="localBugReport.subjectPrefix"
                  label="邮件标题前缀"
                  type="text"
                  placeholder="[BUG反馈]"
                />
                <BaseInput
                  v-model.number="localBugReport.cooldownSeconds"
                  label="提交冷却时间 (秒)"
                  type="number"
                  min="0"
                  placeholder="180"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseInput
                  v-model="localBugReport.smtpHost"
                  label="SMTP 主机"
                  type="text"
                  placeholder="smtp.qq.com"
                />
                <BaseInput
                  v-model.number="localBugReport.smtpPort"
                  label="SMTP 端口"
                  type="number"
                  min="1"
                  placeholder="465"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseInput
                  v-model="localBugReport.smtpUser"
                  label="SMTP 用户名"
                  type="text"
                  placeholder="bot@example.com"
                />
                <BaseInput
                  v-model="localBugReport.smtpPass"
                  label="SMTP 密码 / 授权码"
                  type="password"
                  :hint="localBugReport.smtpPassConfigured ? '已保存授权码。留空保存时会继续沿用后端已加密保存的旧值，不会在页面回显。' : '首次配置时请输入邮箱授权码；保存后不会再回显到页面。'"
                  placeholder="留空表示保留当前已保存授权码"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseInput
                  v-model="localBugReport.emailFrom"
                  label="发件邮箱"
                  type="text"
                  placeholder="bot@example.com"
                />
                <BaseInput
                  v-model="localBugReport.emailTo"
                  label="固定收件邮箱"
                  type="text"
                  placeholder="ops@example.com, dev@example.com"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <BaseSwitch
                  v-model="localBugReport.smtpSecure"
                  label="启用安全连接"
                  hint="常见 465 端口为开启，587 端口通常关闭后走 STARTTLS。"
                />
                <BaseSwitch
                  v-model="localBugReport.saveToDatabase"
                  label="本地入库留档"
                  hint="建议保持开启。即使发信失败，反馈记录也不会丢。"
                />
              </div>

              <div class="settings-system-panel rounded-lg p-3 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="glass-text-main text-sm font-semibold">
                      自动附带信息
                    </div>
                    <p class="settings-system-note mt-1 text-xs">
                      建议保留前端错误和系统日志，第一版就足够定位大多数线上问题。
                    </p>
                  </div>
                  <BaseBadge tone="info">
                    收件人固定
                  </BaseBadge>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseSwitch
                    v-model="localBugReport.includeFrontendErrors"
                    label="附带前端错误"
                    hint="发送最近浏览器错误摘要和未处理异常。"
                  />
                  <BaseInput
                    v-model.number="localBugReport.frontendErrorLimit"
                    label="前端错误条数"
                    type="number"
                    min="1"
                    max="100"
                  />
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseSwitch
                    v-model="localBugReport.includeSystemLogs"
                    label="附带系统日志"
                    hint="从 system_logs 里摘取最近错误和警告。"
                  />
                  <BaseInput
                    v-model.number="localBugReport.systemLogLimit"
                    label="系统日志条数"
                    type="number"
                    min="1"
                    max="100"
                  />
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseSwitch
                    v-model="localBugReport.includeRuntimeLogs"
                    label="附带运行态日志"
                    hint="读取当前内存中的运行态日志，便于看实时问题。"
                  />
                  <BaseInput
                    v-model.number="localBugReport.runtimeLogLimit"
                    label="运行态日志条数"
                    type="number"
                    min="1"
                    max="100"
                  />
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseSwitch
                    v-model="localBugReport.includeAccountLogs"
                    label="附带账号日志"
                    hint="普通用户只会附带自己账号的最近日志，避免越权。"
                  />
                  <BaseInput
                    v-model.number="localBugReport.accountLogLimit"
                    label="账号日志条数"
                    type="number"
                    min="1"
                    max="100"
                  />
                </div>

                <BaseInput
                  v-model.number="localBugReport.maxBodyLength"
                  label="邮件正文最大长度"
                  type="number"
                  min="5000"
                  max="100000"
                  placeholder="50000"
                />
              </div>
            </div>

            <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel flex items-center justify-end gap-3 px-4 py-3">
              <p class="settings-sticky-save-note hidden max-w-xs text-right md:block">
                这里只保存系统级问题反馈能力，不会影响下方当前账号的经营汇报配置。
              </p>
              <BaseButton
                variant="secondary"
                size="sm"
                :loading="bugReportTesting"
                class="settings-footer-button"
                @click="handleSendBugReportTest"
              >
                发送测试反馈邮件
              </BaseButton>
              <BaseButton
                variant="primary"
                size="sm"
                :loading="bugReportSaving"
                class="settings-footer-button"
                @click="handleSaveBugReport"
              >
                保存问题反馈设置
              </BaseButton>
            </div>
          </template>

          <template v-if="currentAccountId && showNoticeQuickPanel && noticeDetailExpanded">
            <div class="settings-card-divider settings-card-divider-top px-4 py-3">
              <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
                <div class="i-carbon-report-data" />
                经营汇报
                <span class="settings-mode-badge ui-meta-chip--success text-[11px]">
                  账号级 / 当前账号
                </span>
              </h3>
              <p class="settings-system-note mt-2 text-xs">
                这是当前选中账号的独立汇报配置。不同账号可以分别设置不同的推送渠道、发送时段和邮件收件人。
              </p>
            </div>

            <div class="p-4">
              <div class="settings-report-hero rounded-2xl p-5">
                <div class="mb-4 flex items-center justify-between gap-3">
                  <h4 class="settings-report-hero-title flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
                    <div class="i-carbon-report-data mr-1" /> {{ currentAccountName || '当前账号' }} · 经营汇报
                  </h4>
                  <div class="flex flex-wrap gap-2">
                    <BaseButton
                      variant="secondary"
                      size="sm"
                      :loading="reportSendingMode === 'hourly'"
                      @click="handleSendReport('hourly')"
                    >
                      立即发小时汇报
                    </BaseButton>
                    <BaseButton
                      variant="secondary"
                      size="sm"
                      :loading="reportSendingMode === 'daily'"
                      @click="handleSendReport('daily')"
                    >
                      立即发日报
                    </BaseButton>
                    <BaseButton
                      variant="secondary"
                      size="sm"
                      :loading="reportTesting"
                      @click="handleSendReportTest"
                    >
                      发送测试汇报
                    </BaseButton>
                  </div>
                </div>

                <div class="space-y-4">
                  <BaseSwitch
                    v-model="localSettings.reportConfig.enabled"
                    label="启用经营汇报"
                    hint="按设定周期向当前账号的专属渠道发送经营摘要。这里的设置只影响当前账号，不会改动上方的全局下线提醒；改完后要点“保存当前账号设置”才会真正持久化。"
                    recommend="conditional"
                  />

                  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="flex items-center gap-2">
                      <BaseSelect
                        v-model="localSettings.reportConfig.channel"
                        label="推送渠道"
                        :options="reportChannelOptions"
                        class="flex-1"
                      />
                      <a
                        v-if="reportChannelDocUrl"
                        :href="reportChannelDocUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="settings-system-doc-link settings-system-doc-link-success mt-5 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium"
                        title="查看官方文档"
                      >
                        <span class="i-carbon-launch text-xs" />
                        官网
                      </a>
                    </div>
                    <BaseInput
                      v-model="localSettings.reportConfig.title"
                      label="汇报标题"
                      type="text"
                      placeholder="经营汇报"
                    />
                  </div>

                  <div v-if="!isReportEmailChannel" class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <BaseInput
                      v-model="localSettings.reportConfig.endpoint"
                      label="接口地址"
                      type="text"
                      :disabled="localSettings.reportConfig.channel !== 'webhook'"
                      placeholder="Webhook 渠道必填"
                    />
                    <BaseInput
                      v-model="localSettings.reportConfig.token"
                      label="Token"
                      type="text"
                      placeholder="非 Webhook 渠道通常必填"
                    />
                  </div>

                  <form v-else class="settings-report-mail-panel rounded-2xl p-4 space-y-4" @submit.prevent>
                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <BaseInput
                        v-model="localSettings.reportConfig.smtpHost"
                        label="SMTP 服务器"
                        type="text"
                        placeholder="例如 smtp.qq.com"
                      />
                      <BaseInput
                        v-model.number="localSettings.reportConfig.smtpPort"
                        label="SMTP 端口"
                        type="number"
                        placeholder="465 / 587"
                      />
                    </div>

                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <BaseInput
                        v-model="localSettings.reportConfig.smtpUser"
                        label="SMTP 用户名"
                        type="text"
                        placeholder="通常填完整邮箱，如 123456@qq.com"
                      />
                      <BaseInput
                        v-model="localSettings.reportConfig.smtpPass"
                        label="SMTP 密码 / 授权码"
                        type="password"
                        placeholder="邮箱 SMTP 授权码"
                      />
                    </div>

                    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <BaseInput
                        v-model="localSettings.reportConfig.emailFrom"
                        label="发件邮箱"
                        type="text"
                        placeholder="只填纯邮箱地址；留空则默认取 SMTP 用户名"
                      />
                      <BaseInput
                        v-model="localSettings.reportConfig.emailTo"
                        label="收件邮箱"
                        type="text"
                        placeholder="支持多个，逗号分隔"
                      />
                    </div>

                    <div class="settings-report-meta text-xs leading-5">
                      QQ 邮箱建议使用 <code>smtp.qq.com</code> + <code>465</code> 并开启“直连 TLS”；SMTP 用户名和发件邮箱都尽量填写完整邮箱地址，不要写成“昵称 &lt;邮箱&gt;”。
                    </div>

                    <BaseSwitch
                      v-model="localSettings.reportConfig.smtpSecure"
                      label="直连 TLS"
                      hint="465 端口通常开启；587 端口会自动尝试 STARTTLS。"
                      recommend="on"
                    />
                  </form>

                  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="settings-report-panel settings-report-panel-success rounded-xl p-4">
                      <BaseSwitch
                        v-model="localSettings.reportConfig.hourlyEnabled"
                        label="小时汇报"
                        hint="到达指定分钟后，发送最近 1 小时的收益与动作摘要。"
                        recommend="conditional"
                      />
                      <div class="mt-3 flex items-center gap-3">
                        <span class="glass-text-muted text-[11px] font-bold tracking-widest uppercase">每小时第</span>
                        <BaseInput
                          v-model.number="localSettings.reportConfig.hourlyMinute"
                          type="number"
                          min="0"
                          max="59"
                          class="w-24 text-sm shadow-inner !py-1"
                          :disabled="!localSettings.reportConfig.hourlyEnabled"
                        />
                        <span class="settings-inline-unit text-xs">分钟发送</span>
                      </div>
                    </div>

                    <div class="settings-report-panel settings-report-panel-success rounded-xl p-4">
                      <BaseSwitch
                        v-model="localSettings.reportConfig.dailyEnabled"
                        label="每日汇报"
                        hint="按设定时刻发送今日累计经营摘要，适合晚间复盘。"
                        recommend="on"
                      />
                      <div class="mt-3 flex items-center gap-3">
                        <span class="glass-text-muted text-[11px] font-bold tracking-widest uppercase">每天</span>
                        <BaseInput
                          v-model.number="localSettings.reportConfig.dailyHour"
                          type="number"
                          min="0"
                          max="23"
                          class="w-24 text-sm shadow-inner !py-1"
                          :disabled="!localSettings.reportConfig.dailyEnabled"
                        />
                        <span class="settings-inline-unit text-xs">时</span>
                        <BaseInput
                          v-model.number="localSettings.reportConfig.dailyMinute"
                          type="number"
                          min="0"
                          max="59"
                          class="w-24 text-sm shadow-inner !py-1"
                          :disabled="!localSettings.reportConfig.dailyEnabled"
                        />
                        <span class="settings-inline-unit text-xs">分发送</span>
                      </div>
                    </div>
                  </div>

                  <div class="settings-report-panel settings-report-panel-success rounded-xl p-4">
                    <div class="settings-report-panel-title mb-2 flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
                      <div class="i-carbon-data-base mr-1" /> 历史保留策略
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="glass-text-muted text-[11px] font-bold tracking-widest uppercase">自动保留</span>
                      <BaseInput
                        v-model.number="localSettings.reportConfig.retentionDays"
                        type="number"
                        min="0"
                        max="365"
                        class="w-24 text-sm shadow-inner !py-1"
                      />
                      <span class="settings-inline-unit text-xs">天</span>
                    </div>
                    <p class="settings-report-meta mt-2 text-xs leading-relaxed">
                      填 <span class="font-bold">0</span> 表示不自动清理；填 1~365 表示系统每天自动清理一次过期汇报，并在每次发送后顺手回收当前账号的旧记录。
                    </p>
                  </div>

                  <div class="settings-report-divider pt-4">
                    <div class="mb-3 flex items-center justify-between gap-3">
                      <h5 class="settings-report-panel-title text-xs font-bold tracking-widest uppercase">
                        最近汇报记录
                      </h5>
                      <div class="flex flex-wrap gap-2">
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :disabled="selectedReportLogCount === 0"
                          :loading="reportHistoryBatchDeleting"
                          @click="handleDeleteReportLogs(selectedReportLogIds)"
                        >
                          删除选中
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :loading="reportHistoryExporting"
                          @click="handleExportReportLogs"
                        >
                          导出当前筛选
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :loading="reportHistoryLoading"
                          @click="() => refreshReportLogs()"
                        >
                          刷新记录
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :loading="reportHistoryClearing"
                          @click="handleClearReportLogs"
                        >
                          清空记录
                        </BaseButton>
                      </div>
                    </div>

                    <div class="settings-info-banner mb-3 rounded-xl px-3 py-2 text-xs leading-5">
                      {{ REPORT_HISTORY_BROWSER_PREF_NOTE }}
                    </div>

                    <div class="grid grid-cols-1 mb-3 gap-3 md:grid-cols-3">
                      <BaseSelect
                        v-model="reportFilters.mode"
                        label="筛选类型"
                        :options="reportModeOptions"
                      />
                      <BaseSelect
                        v-model="reportFilters.status"
                        label="筛选结果"
                        :options="reportStatusOptions"
                      />
                      <BaseInput
                        v-model="reportKeyword"
                        label="关键字搜索"
                        type="text"
                        placeholder="标题 / 正文 / 失败原因"
                        @keydown.enter="handleApplyReportSearch"
                      />
                    </div>

                    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
                      <div class="settings-report-meta text-xs">
                        <span v-if="reportKeyword.trim()">当前关键字：{{ reportKeyword.trim() }}</span>
                        <span v-else>未启用关键字搜索</span>
                        <span class="mx-2">·</span>
                        <span>固定 3 条/页</span>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          @click="handleApplyReportSearch"
                        >
                          搜索
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          @click="handleShowLatestFailed"
                        >
                          最新失败
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          @click="handleResetReportHistoryView"
                        >
                          恢复默认视图
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :disabled="!reportKeyword"
                          @click="reportKeyword = ''; handleApplyReportSearch()"
                        >
                          清空搜索
                        </BaseButton>
                      </div>
                    </div>

                    <div class="grid grid-cols-1 mb-3 gap-3 md:grid-cols-2">
                      <BaseSelect
                        v-model="reportSortOrder"
                        label="时间排序"
                        :options="reportSortOrderOptions"
                      />
                    </div>

                    <div class="grid grid-cols-2 mb-3 gap-3 md:grid-cols-3 xl:grid-cols-6">
                      <button
                        v-for="item in reportHistoryStatsCards"
                        :key="item.key"
                        type="button"
                        class="settings-report-stat-card rounded-xl px-3 py-3 text-left transition-all duration-150"
                        :class="[
                          item.bg,
                          item.active
                            ? 'settings-report-stat-card-active shadow-md'
                            : 'hover:-translate-y-0.5 hover:shadow-sm',
                        ]"
                        :title="`点击筛选${item.label}`"
                        @click="handleReportStatsCardClick(item.key)"
                      >
                        <div class="settings-report-stat-label flex items-center justify-between gap-2 text-[11px] font-bold tracking-widest uppercase">
                          <span>{{ item.label }}</span>
                          <span v-if="item.active" class="settings-report-active">已筛选</span>
                        </div>
                        <div class="mt-2 text-2xl font-black" :class="item.tone">
                          {{ item.value }}
                        </div>
                        <div class="settings-report-stat-hint mt-1 text-[11px]">
                          点击快速筛选
                        </div>
                      </button>
                    </div>

                    <div class="settings-report-selection mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div class="flex flex-wrap items-center gap-3">
                        <span>
                          共 {{ reportLogPagination.total }} 条记录，当前第 {{ reportLogPagination.page }} / {{ reportLogPagination.totalPages }} 页
                        </span>
                        <label class="inline-flex select-none items-center gap-2">
                          <input
                            type="checkbox"
                            class="settings-report-checkbox h-4 w-4 rounded"
                            :checked="allVisibleReportLogsSelected"
                            @change="toggleSelectAllVisibleReportLogs"
                          >
                          <span>全选当前页</span>
                        </label>
                        <span v-if="selectedReportLogCount > 0" class="settings-report-active font-semibold">
                          已选 {{ selectedReportLogCount }} 条
                        </span>
                      </div>
                      <div class="flex gap-2">
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :disabled="reportHistoryLoading || reportLogPagination.page <= 1"
                          @click="goToReportLogPage(reportLogPagination.page - 1)"
                        >
                          上一页
                        </BaseButton>
                        <BaseButton
                          variant="secondary"
                          size="sm"
                          :disabled="reportHistoryLoading || reportLogPagination.page >= reportLogPagination.totalPages"
                          @click="goToReportLogPage(reportLogPagination.page + 1)"
                        >
                          下一页
                        </BaseButton>
                      </div>
                    </div>

                    <div v-if="reportHistoryLoading" class="settings-report-empty rounded-xl px-4 py-5 text-center text-xs">
                      正在加载汇报历史...
                    </div>

                    <div v-else-if="reportLogs.length === 0" class="settings-report-empty rounded-xl px-4 py-5 text-center text-xs">
                      还没有经营汇报历史记录
                    </div>

                    <div v-else class="space-y-3">
                      <div
                        v-for="item in reportLogs"
                        :key="item.id"
                        class="settings-report-log-card rounded-xl p-4"
                      >
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <div class="min-w-0 flex flex-1 items-start gap-3">
                            <label class="mt-0.5 inline-flex items-center">
                              <input
                                type="checkbox"
                                class="settings-report-checkbox h-4 w-4 rounded"
                                :checked="isReportLogSelected(item.id)"
                                @change="toggleReportLogSelected(item.id)"
                              >
                            </label>
                            <div class="min-w-0 flex-1">
                              <div class="settings-report-log-title truncate text-sm font-semibold">
                                {{ item.title || '经营汇报' }}
                              </div>
                              <div class="settings-report-log-meta mt-1 text-[11px]">
                                {{ formatReportMode(item.mode) }} · {{ formatReportLogTime(item.createdAt) }} · {{ item.channel || 'unknown' }}
                              </div>
                            </div>
                          </div>
                          <div class="flex flex-wrap items-center gap-2">
                            <span
                              class="settings-result-badge rounded-full px-2 py-0.5 text-[11px] font-bold"
                              :class="item.ok ? 'ui-meta-chip--success' : 'ui-meta-chip--danger'"
                            >
                              {{ item.ok ? '成功' : '失败' }}
                            </span>
                            <BaseButton
                              variant="secondary"
                              size="sm"
                              :loading="reportHistoryDeletingIds.includes(item.id)"
                              @click="handleDeleteReportLogs([item.id], { single: true, title: `「${item.title || '经营汇报'}」` })"
                            >
                              删除
                            </BaseButton>
                          </div>
                        </div>

                        <div
                          class="settings-report-log-body mt-3 overflow-auto whitespace-pre-line rounded-lg px-3 py-2 text-xs leading-5"
                          :class="isReportLogExpanded(item.id) ? 'max-h-64' : 'max-h-24'"
                        >
                          {{ isReportLogExpanded(item.id) ? (item.content || '无正文') : getReportLogPreview(item.content) }}
                        </div>

                        <div
                          v-if="item.errorMessage"
                          class="settings-report-error mt-2 text-xs"
                        >
                          失败原因：{{ item.errorMessage }}
                        </div>

                        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span class="settings-report-state-note text-[11px]">
                            {{ isReportLogExpanded(item.id) ? '已展开完整正文' : '当前显示正文预览' }}
                          </span>
                          <div class="flex flex-wrap gap-2">
                            <BaseButton
                              variant="secondary"
                              size="sm"
                              @click="toggleReportLogExpanded(item.id)"
                            >
                              {{ isReportLogExpanded(item.id) ? '收起正文' : '展开正文' }}
                            </BaseButton>
                            <BaseButton
                              variant="secondary"
                              size="sm"
                              @click="openReportLogDetail(item)"
                            >
                              查看详情
                            </BaseButton>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced'])"
          class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-settings-check" />
              高级设置快捷总览
            </h3>
            <p class="settings-advanced-quick-copy mt-2 text-xs">
              默认仅展示关键状态与常用操作，避免高级页首屏过载。需要深度调整时可展开详细配置。
            </p>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="settings-advanced-quick-card rounded-xl p-3">
                <div class="settings-advanced-quick-label text-xs font-semibold tracking-wide uppercase">
                  系统自检
                </div>
                <div class="settings-advanced-quick-value mt-2 text-sm font-semibold">
                  {{ systemHealthStatusLabel }}
                </div>
                <div class="settings-advanced-quick-note mt-1 text-xs">
                  最近检查：{{ systemHealthCheckedAtLabel }}
                </div>
              </div>

              <div class="settings-advanced-quick-card rounded-xl p-3">
                <div class="settings-advanced-quick-label text-xs font-semibold tracking-wide uppercase">
                  时间引擎
                </div>
                <div class="settings-advanced-quick-value mt-2 text-sm font-semibold">
                  {{ localTiming.schedulerEngine || 'default' }}
                </div>
                <div class="settings-advanced-quick-note mt-1 text-xs">
                  心跳 {{ localTiming.heartbeatIntervalMs }}ms
                </div>
              </div>

              <div class="settings-advanced-quick-card rounded-xl p-3">
                <div class="settings-advanced-quick-label text-xs font-semibold tracking-wide uppercase">
                  系统更新
                </div>
                <div class="settings-advanced-quick-value mt-2 text-sm font-semibold">
                  {{ systemUpdateStatusLabel }}
                </div>
                <div class="settings-advanced-quick-note mt-1 text-xs">
                  当前 {{ systemUpdateCurrentVersionLabel }} / 最新 {{ systemUpdateLatestVersionLabel }}
                </div>
              </div>

              <div class="settings-advanced-quick-card rounded-xl p-3">
                <div class="settings-advanced-quick-label text-xs font-semibold tracking-wide uppercase">
                  集群派发
                </div>
                <div class="settings-advanced-quick-value mt-2 text-sm font-semibold">
                  {{ clusterConfig.dispatcherStrategy || 'load_balance_sticky' }}
                </div>
                <div class="settings-advanced-quick-note mt-1 text-xs">
                  当前节点：{{ systemUpdateClusterNodes.length }} 个
                </div>
              </div>
            </div>

            <div class="settings-advanced-quick-actions flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap gap-2">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :loading="systemHealthLoading || qqFriendDiagnosticsLoading"
                  @click="refreshAdminHealthPanels(true)"
                >
                  刷新自检
                </BaseButton>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :loading="systemUpdateChecking"
                  @click="checkSystemUpdateNow"
                >
                  检查更新
                </BaseButton>
              </div>
              <BaseButton
                variant="primary"
                size="sm"
                @click="advancedDetailExpanded = !advancedDetailExpanded"
              >
                {{ advancedDetailExpanded ? '收起详细配置' : '展开详细配置' }}
              </BaseButton>
            </div>

            <div v-if="advancedDetailExpanded" class="settings-advanced-detail-nav-wrap space-y-2">
              <div class="settings-advanced-detail-nav">
                <button
                  v-for="tab in advancedDetailSectionTabs"
                  :key="tab.key"
                  type="button"
                  class="settings-advanced-detail-tab"
                  :class="tab.key === activeAdvancedDetailSection ? 'settings-advanced-detail-tab-active' : ''"
                  @click="switchAdvancedDetailSection(tab.key)"
                >
                  <div class="text-sm" :class="tab.icon" />
                  <span>{{ tab.label }}</span>
                </button>
              </div>
              <p class="settings-advanced-detail-nav-copy text-xs leading-5">
                {{ activeAdvancedDetailSectionMeta.hint }}
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['health'])"
          id="settings-advanced-health"
          class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-section-divider flex items-center justify-between bg-transparent px-4 py-3">
            <div>
              <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
                <div class="i-carbon-data-check" />
                系统自检与前端产物状态
              </h3>
              <p class="settings-health-note mt-1 text-xs">
                展示 `system_settings` 自检结果，以及当前面板实际使用的前端静态目录。
              </p>
            </div>
            <BaseButton
              variant="secondary"
              size="sm"
              :loading="systemHealthLoading || extendedHealthLoading || qqFriendDiagnosticsLoading"
              @click="refreshAdminHealthPanels(true)"
            >
              <div class="i-carbon-renew mr-1" /> 刷新状态
            </BaseButton>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  system_settings
                </div>
                <div class="mt-2">
                  <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" :class="systemHealthStatusClass">
                    {{ systemHealthStatusLabel }}
                  </span>
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  最近检查时间
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ systemHealthCheckedAtLabel }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  当前选路原因
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ webAssetsSnapshot?.selectionReasonLabel || '未获取' }}
                </div>
              </div>
            </div>

            <div v-if="systemHealthError" class="settings-health-alert flex items-start gap-2 rounded-xl p-4 text-sm">
              <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-base" />
              <div>{{ systemHealthError }}</div>
            </div>

            <div v-if="qqFriendDiagnosticsError" class="settings-health-alert flex items-start gap-2 rounded-xl p-4 text-sm">
              <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-base" />
              <div>{{ qqFriendDiagnosticsError }}</div>
            </div>

            <template v-if="webAssetsSnapshot">
              <div class="settings-health-primary-card rounded-xl p-4">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div class="settings-health-primary-label text-xs font-semibold tracking-wide uppercase">
                      当前服务目录
                    </div>
                    <code class="settings-health-primary-code mt-2 block text-sm font-semibold">{{ webAssetsSnapshot.activeDir }}</code>
                    <div class="settings-health-primary-note mt-1 text-xs">
                      来源：{{ webAssetsSnapshot.activeSource }}
                    </div>
                  </div>
                  <div>
                    <div class="settings-health-primary-label text-xs font-semibold tracking-wide uppercase">
                      当前构建目标
                    </div>
                    <code class="settings-health-primary-code mt-2 block text-sm font-semibold">{{ webAssetsSnapshot.buildTargetDir }}</code>
                    <div class="settings-health-primary-note mt-1 text-xs">
                      输出来源：{{ webAssetsSnapshot.buildTargetSource }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="settings-health-card rounded-xl p-4">
                  <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                    默认目录
                  </div>
                  <code class="settings-health-card-value mt-2 block text-sm font-semibold">{{ webAssetsSnapshot.defaultDir }}</code>
                  <div class="settings-health-card-note mt-2 text-xs">
                    {{ describeWebAssetDir(webAssetsSnapshot.defaultDir, webAssetsSnapshot.defaultHasAssets, webAssetsSnapshot.defaultWritable) }}
                  </div>
                </div>

                <div class="settings-health-card rounded-xl p-4">
                  <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                    回退目录
                  </div>
                  <code class="settings-health-card-value mt-2 block text-sm font-semibold">{{ webAssetsSnapshot.fallbackDir }}</code>
                  <div class="settings-health-card-note mt-2 text-xs">
                    {{ describeWebAssetDir(webAssetsSnapshot.fallbackDir, webAssetsSnapshot.fallbackHasAssets, webAssetsSnapshot.fallbackWritable) }}
                  </div>
                </div>
              </div>
            </template>

            <div class="settings-health-primary-card rounded-xl p-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div class="settings-health-primary-label text-xs font-semibold tracking-wide uppercase">
                    QQ 好友协议诊断
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" :class="qqFriendDiagnosticsStatusClass">
                      {{ qqFriendDiagnosticsStatusLabel }}
                    </span>
                    <span class="settings-health-primary-note text-xs">
                      AppID：{{ QQ_FRIEND_DIAGNOSTICS_APPID }}
                    </span>
                  </div>
                </div>
                <div class="settings-health-primary-note text-xs md:text-right">
                  最近快照：{{ qqFriendDiagnosticsCheckedAtLabel }}
                </div>
              </div>

              <template v-if="qqFriendDiagnosticsSnapshot">
                <div class="grid grid-cols-1 mt-4 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      QQ 版本
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ qqFriendDiagnosticsSnapshot.qqVersion || '未获取' }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      小游戏运行时
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ qqFriendDiagnosticsSnapshot.miniProject?.projectname || '未获取' }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      openDataContext
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ formatQqFriendBoolean(qqFriendDiagnosticsSnapshot.miniProject?.openDataContext, '已启用', '未启用') }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      最新 onlineInfoCount
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ qqFriendDiagnosticsSnapshot.summary?.latestOnlineInfoCount || 0 }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      授权已同步
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ formatQqFriendBoolean(qqFriendDiagnosticsSnapshot.authBridge?.authoritySynchronized) }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      好友授权 Scope
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ qqFriendDiagnosticsSnapshot.authBridge?.shareFriendshipScope ?? '未获取' }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      Redis 缓存摘要
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ qqFriendDiagnosticsRedisSummaryLabel }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      历史快照数
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ qqFriendDiagnosticsSnapshot.availableFiles?.length || 0 }}
                    </div>
                  </div>
                </div>

                <div class="grid grid-cols-1 mt-3 gap-3 xl:grid-cols-2">
                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      最新诊断文件
                    </div>
                    <div class="settings-health-card-value mt-2 break-all text-sm font-medium">
                      {{ qqFriendDiagnosticsSnapshot.source?.name || qqFriendDiagnosticsSnapshot.fileName || '未获取' }}
                    </div>
                    <div class="settings-health-card-note mt-2 text-xs">
                      {{ qqFriendDiagnosticsSnapshot.source?.path || qqFriendDiagnosticsSnapshot.file || '未获取路径' }}
                    </div>
                  </div>

                  <div class="settings-health-card rounded-xl p-4">
                    <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                      最新 NTKernel 请求样本
                    </div>
                    <div class="settings-health-card-value mt-2 text-sm font-medium">
                      {{ formatQqFriendLatestRequest(qqFriendDiagnosticsSnapshot) }}
                    </div>
                    <div class="settings-health-card-note mt-2 text-xs">
                      已观测请求 {{ qqFriendDiagnosticsSnapshot.hostFriendProtocol?.reqCount || 0 }} 次 / 响应 {{ qqFriendDiagnosticsSnapshot.hostFriendProtocol?.rspCount || 0 }} 次
                    </div>
                  </div>
                </div>

                <div v-if="qqFriendDiagnosticsSnapshot.redisCaches?.length" class="mt-3">
                  <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                    Redis 好友缓存预览
                  </div>
                  <div class="grid grid-cols-1 mt-3 gap-3 xl:grid-cols-3">
                    <div
                      v-for="cache in qqFriendDiagnosticsSnapshot.redisCaches"
                      :key="cache.key"
                      class="settings-health-card rounded-xl p-4"
                    >
                      <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                        {{ cache.key.replace(/^account:(.+):friends_cache$/, '账号 $1') }}
                      </div>
                      <div class="settings-health-card-value mt-2 text-sm font-medium">
                        {{ cache.count }} 个好友
                      </div>
                      <div class="settings-health-card-note mt-2 break-all text-xs">
                        {{ cache.key }}
                      </div>
                      <div class="settings-health-card-value mt-3 text-sm leading-6">
                        {{ formatQqFriendCachePreview(cache) }}
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <div v-else-if="!qqFriendDiagnosticsLoading" class="settings-health-card mt-4 rounded-xl p-4">
                <div class="settings-health-card-value text-sm font-medium">
                  暂无 QQ 好友诊断快照
                </div>
                <div class="settings-health-card-note mt-2 text-xs">
                  可先运行 `scripts/utils/collect-qq-friend-signals.sh`，然后刷新本页查看最新宿主桥接状态。
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="settings-health-status-card rounded-xl p-4" :class="(systemHealthSnapshot?.missingRequiredKeys?.length || 0) > 0 ? 'settings-health-status-card-warning' : 'settings-health-status-card-success'">
                <div class="settings-health-status-label text-xs font-semibold tracking-wide uppercase">
                  必需键缺失
                </div>
                <div class="settings-health-status-value mt-2 text-sm font-medium">
                  {{ systemHealthSnapshot?.missingRequiredKeys?.length ? systemHealthSnapshot.missingRequiredKeys.join('、') : '无' }}
                </div>
              </div>

              <div class="settings-health-status-card rounded-xl p-4" :class="(systemHealthSnapshot?.fallbackWouldActivateKeys?.length || 0) > 0 ? 'settings-health-status-card-info' : 'settings-health-status-card-neutral'">
                <div class="settings-health-status-label text-xs font-semibold tracking-wide uppercase">
                  仍依赖旧回退文件的键
                </div>
                <div class="settings-health-status-value mt-2 text-sm font-medium">
                  {{ systemHealthSnapshot?.fallbackWouldActivateKeys?.length ? systemHealthSnapshot.fallbackWouldActivateKeys.join('、') : '无' }}
                </div>
              </div>
            </div>

            <div v-if="extendedHealthError" class="settings-health-alert flex items-start gap-2 rounded-xl p-4 text-sm">
              <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-base" />
              <div>{{ extendedHealthError }}</div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  服务模式
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ serviceProfileLabel }}
                </div>
                <div class="settings-health-card-note mt-2 text-xs">
                  最近同步：{{ serviceProfileCheckedAtLabel }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  依赖健康
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ dependencyHealthStatusLabel }}
                </div>
                <div class="settings-health-card-note mt-2 text-xs">
                  最近同步：{{ dependencyHealthCheckedAtLabel }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  运行时健康
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ runtimeHealthStatusLabel }}
                </div>
                <div class="settings-health-card-note mt-2 text-xs">
                  最近同步：{{ runtimeHealthCheckedAtLabel }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  今日金豆汇总
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ statsSummaryTodayGoldLabel }}
                </div>
                <div class="settings-health-card-note mt-2 text-xs">
                  外部 API 与分析概览共用同一统计口径
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  Web 面板
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ serviceProfileSnapshot?.webPanelEnabled ? '已启用' : '未启用' }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  自动拉号
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ serviceProfileSnapshot?.autoStartAccounts ? '已启用' : '未启用' }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  调度器数量
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ runtimeHealthSnapshot?.schedulers?.schedulerCount ?? 0 }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  运行中账号
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ runtimeHealthSnapshot?.accounts?.running ?? 0 }} / {{ runtimeHealthSnapshot?.accounts?.total ?? 0 }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  待重登账号
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ runtimeHealthSnapshot?.accounts?.reloginRequired ?? 0 }}
                </div>
              </div>

              <div class="settings-health-card rounded-xl p-4">
                <div class="settings-health-card-label text-xs font-semibold tracking-wide uppercase">
                  已封禁账号
                </div>
                <div class="settings-health-card-value mt-2 text-sm font-medium">
                  {{ runtimeHealthSnapshot?.accounts?.banned ?? 0 }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card Time Parameters: 系统级时间参数调优（仅管理员可见） -->
        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['timing'])"
          id="settings-advanced-timing"
          class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-card-divider flex items-center justify-between px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-time" />
              ⏱ 时间参数调优 (System Timing)
            </h3>
            <BaseButton
              variant="secondary"
              size="sm"
              @click="restoreTimingDefaults"
            >
              <div class="i-carbon-reset mr-1" /> 恢复默认推荐值
            </BaseButton>
          </div>

          <div class="p-4 space-y-6">
            <div class="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <!-- Group 1: Network & Heartbeat -->
              <div class="space-y-4">
                <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                  <div class="i-carbon-network-4 mr-2" /> 网络与心跳
                </h4>
                <BaseInput
                  v-model.number="localTiming.heartbeatIntervalMs"
                  label="WebSocket 心跳间隔 (ms)"
                  type="number"
                  min="5000"
                  step="1000"
                  hint="维持长连接的频率，推荐 25000ms"
                />
                <BaseInput
                  v-model.number="localTiming.rateLimitIntervalMs"
                  label="API 发送限流间隔 (ms)"
                  type="number"
                  min="100"
                  step="1"
                  hint="QQ 建议不低于 600ms；过低更容易触发频率风控。"
                />
              </div>

              <!-- Group 2: Ghosting (Anti-Detection) -->
              <div class="space-y-4">
                <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                  <div class="i-carbon-asleep mr-2" /> Ghosting 打盹行为
                </h4>
                <div class="grid grid-cols-2 gap-3">
                  <BaseInput
                    v-model.number="localTiming.ghostingProbability"
                    label="打盹触发概率"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                  />
                  <BaseInput
                    v-model.number="localTiming.ghostingCooldownMin"
                    label="冷却期 (分钟)"
                    type="number"
                    min="1"
                  />
                  <BaseInput
                    v-model.number="localTiming.ghostingMinMin"
                    label="最短休眠 (分)"
                    type="number"
                    min="1"
                  />
                  <BaseInput
                    v-model.number="localTiming.ghostingMaxMin"
                    label="最长休眠 (分)"
                    type="number"
                    min="1"
                  />
                </div>
                <p class="settings-system-warning-note text-[10px] italic">
                  模拟真人疲劳休眠，随机下线避开长时间挂机检测。
                </p>
              </div>

              <!-- Group 3: Operation Intervals -->
              <div class="space-y-4">
                <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                  <div class="i-carbon-keyboard mr-2" /> 邀请与微延迟 (只读预览)
                </h4>
                <BaseInput
                  v-model.number="localTiming.inviteRequestDelay"
                  label="邀请请求延迟 (ms)"
                  type="number"
                  min="500"
                  step="100"
                />
                <div class="settings-system-readonly-box rounded-lg p-2">
                  <div v-for="p in settingStore.settings.readonlyTimingParams" :key="p.key" class="flex justify-between py-1 text-[11px]">
                    <span class="glass-text-muted">{{ p.label }}</span>
                    <span class="settings-system-inline-value font-mono">{{ p.value }}</span>
                  </div>
                </div>
              </div>

              <div class="space-y-4">
                <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                  <div class="i-carbon-flow-stream mr-2" /> 调度器引擎
                </h4>
                <BaseSelect
                  v-model="localTiming.schedulerEngine"
                  label="默认调度引擎"
                  :options="[
                    { label: '默认 setTimeout', value: 'default' },
                    { label: '全量时间轮', value: 'optimized' },
                    { label: '混合模式', value: 'hybrid' },
                  ]"
                />
                <BaseInput
                  v-model="localTiming.optimizedSchedulerNamespaces"
                  label="时间轮命名空间"
                  type="text"
                  hint="逗号分隔，例如：system-jobs,account-report-service,worker_manager"
                />
                <div class="grid grid-cols-2 gap-3">
                  <BaseInput
                    v-model.number="localTiming.optimizedSchedulerTickMs"
                    label="时间轮 Tick (ms)"
                    type="number"
                    min="10"
                  />
                  <BaseInput
                    v-model.number="localTiming.optimizedSchedulerWheelSize"
                    label="槽位数量"
                    type="number"
                    min="10"
                  />
                </div>
              </div>

              <div class="space-y-4">
                <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                  <div class="i-carbon-user-follow mr-2" /> 人类化调度
                </h4>
                <BaseSwitch
                  v-model="localTiming.humanModeEnabled"
                  label="启用人类化调度"
                />
                <BaseSelect
                  v-model="localTiming.humanModeIntensity"
                  label="拟人强度"
                  :options="[
                    { label: '低强度', value: 'low' },
                    { label: '中强度', value: 'medium' },
                    { label: '高强度', value: 'high' },
                  ]"
                />
                <BaseInput
                  v-model.number="localTiming.schedulerJitterRatio"
                  label="抖动比例"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  hint="建议 0.05 - 0.2，避免所有任务固定命中同一秒。"
                />
                <div class="grid grid-cols-2 gap-3">
                  <BaseInput
                    v-model.number="localTiming.interTaskDelayMinMs"
                    label="任务间最小延迟"
                    type="number"
                    min="0"
                  />
                  <BaseInput
                    v-model.number="localTiming.interTaskDelayMaxMs"
                    label="任务间最大延迟"
                    type="number"
                    min="0"
                  />
                </div>
              </div>

              <div class="space-y-4">
                <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                  <div class="i-carbon-pause-future mr-2" /> 休息窗口
                </h4>
                <div class="grid grid-cols-2 gap-3">
                  <BaseInput
                    v-model.number="localTiming.restIntervalMinMs"
                    label="最短休息间隔"
                    type="number"
                    min="0"
                    hint="单位：毫秒"
                  />
                  <BaseInput
                    v-model.number="localTiming.restIntervalMaxMs"
                    label="最长休息间隔"
                    type="number"
                    min="0"
                    hint="单位：毫秒"
                  />
                  <BaseInput
                    v-model.number="localTiming.restDurationMinMs"
                    label="最短休息时长"
                    type="number"
                    min="0"
                    hint="单位：毫秒"
                  />
                  <BaseInput
                    v-model.number="localTiming.restDurationMaxMs"
                    label="最长休息时长"
                    type="number"
                    min="0"
                    hint="单位：毫秒"
                  />
                </div>
                <BaseInput
                  v-model.number="localTiming.eventTriggerDebounceMs"
                  label="事件触发防抖"
                  type="number"
                  min="0"
                  hint="防止短时间内重复触发相同事件链路。"
                />
              </div>
            </div>
          </div>

          <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel mt-auto flex justify-end px-4 py-3">
            <BaseButton
              variant="primary"
              size="sm"
              :loading="timingSaving"
              class="settings-footer-button"
              @click="handleSaveTiming"
            >
              保存时间参数设置
            </BaseButton>
          </div>
        </div>

        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['update'])"
          id="settings-advanced-update"
          class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-upgrade" />
              系统更新中心
            </h3>
          </div>

          <div class="p-4 space-y-4">
            <div class="settings-update-detail-nav-wrap space-y-2">
              <div class="settings-update-detail-nav">
                <button
                  v-for="tab in systemUpdateDetailTabs"
                  :key="tab.key"
                  type="button"
                  class="settings-update-detail-tab"
                  :class="tab.key === activeSystemUpdateDetailTab ? 'settings-update-detail-tab-active' : ''"
                  @click="switchSystemUpdateDetailTab(tab.key)"
                >
                  <div class="text-sm" :class="tab.icon" />
                  <span>{{ tab.label }}</span>
                </button>
              </div>
              <p class="settings-update-detail-nav-copy text-xs leading-5">
                {{ activeSystemUpdateDetailTabMeta.hint }}
              </p>
            </div>

            <div v-show="isSystemUpdateDetailTabVisible(['overview'])" id="settings-update-overview" class="grid grid-cols-1 gap-3 xl:grid-cols-[0.95fr_1.05fr]">
              <div class="space-y-3">
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      当前版本
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-bold font-mono">
                      {{ systemUpdateCurrentVersionLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      最新版本
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-bold font-mono">
                      {{ systemUpdateLatestVersionLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      最近检查
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-bold">
                      {{ systemUpdateLastCheckLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      当前状态
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-bold">
                      {{ systemUpdateStatusLabel }}
                    </div>
                  </div>
                </div>

                <div class="settings-system-info-alert mt-2 flex items-start gap-2 rounded-md p-3 text-sm">
                  <div class="i-carbon-information mt-0.5 shrink-0 text-base" />
                  <div class="space-y-1">
                    <p><strong>版本来源：</strong>{{ systemUpdateSourceLabel }}</p>
                    <p v-if="systemUpdateOverview?.runtime?.lastError">
                      <strong>最近错误：</strong>{{ systemUpdateOverview.runtime.lastError }}
                    </p>
                    <p>当前已经接上宿主机更新代理链路，现阶段可实际执行 <strong>scope=app / worker / cluster</strong>，以及 <strong>strategy=in_place / rolling / drain_and_cutover</strong>。</p>
                    <p>集群节点已经支持 <strong>排空 / 恢复接流</strong>，调度器会避开排空节点并把账号迁移到可用节点。</p>
                    <p>Worker / Cluster 任务建议明确选择目标代理；若启用排空且未手填节点，会优先使用该代理上报的托管节点列表。</p>
                    <p>当存在活跃任务或代理心跳时，此页会每 15 秒自动刷新一次状态。</p>
                  </div>
                </div>

                <div class="border border-sky-500/20 rounded-lg bg-sky-500/5 p-3 space-y-3">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="glass-text-main text-sm font-bold">
                        远程更新最短路径
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5">
                        先让版本源可见新版本，再确认宿主机代理在线，最后通过预检和任务流完成远程更新。
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <ContextHelpButton
                        article="deployment-release-and-remote-update"
                        audience="admin"
                        :section="systemUpdateChecklistHelpSectionId"
                        label="最短发布清单"
                        icon-class="i-carbon-launch"
                        variant="secondary"
                        source-context="settings_system_update_overview_release_checklist"
                      />
                      <ContextHelpButton
                        article="deployment-update-and-recovery"
                        audience="admin"
                        :section="systemUpdateUpdateRecoveryHelpSectionId"
                        label="更新与回滚命令"
                        icon-class="i-carbon-terminal"
                        variant="outline"
                        source-context="settings_system_update_overview_update_recovery"
                      />
                    </div>
                  </div>
                  <div class="glass-text-muted grid grid-cols-1 gap-2 text-[12px] leading-6 xl:grid-cols-3">
                    <div class="border border-white/8 rounded-lg bg-black/10 p-2 space-y-2">
                      <div>
                        1. 本地改动先完成 <code class="font-mono">git push</code>、tag 或镜像发布，否则“检查更新”不会看到新版本。
                      </div>
                      <div class="rounded-md border border-white/8 bg-black/15 px-2 py-1 text-[11px] leading-5 font-mono whitespace-pre-wrap break-all">
                        {{ SYSTEM_UPDATE_REPAIR_DEPLOY_COMMAND }}
                      </div>
                      <BaseButton
                        size="sm"
                        :variant="copiedControlKey === 'system-update-repair-deploy' ? 'primary' : 'outline'"
                        @click="copySystemUpdateRepairDeployCommand"
                      >
                        <span :class="copiedControlKey === 'system-update-repair-deploy' ? 'i-carbon-checkmark-filled mr-1 text-sm' : 'i-carbon-copy mr-1 text-sm'" />
                        {{ copiedControlKey === 'system-update-repair-deploy' ? '已复制修复命令' : '复制修复命令' }}
                      </BaseButton>
                    </div>
                    <div class="border border-white/8 rounded-lg bg-black/10 p-2 space-y-2">
                      2. 服务器第一次启用前，先执行 <code class="font-mono">repair-deploy.sh --backup</code> 和 <code class="font-mono">install-update-agent-service.sh</code>。
                      <div class="rounded-md border border-white/8 bg-black/15 px-2 py-1 text-[11px] leading-5 font-mono whitespace-pre-wrap break-all">
                        {{ SYSTEM_UPDATE_INSTALL_AGENT_COMMAND }}
                      </div>
                      <BaseButton
                        size="sm"
                        :variant="copiedControlKey === 'system-update-install-agent' ? 'primary' : 'outline'"
                        @click="copySystemUpdateInstallAgentCommand"
                      >
                        <span :class="copiedControlKey === 'system-update-install-agent' ? 'i-carbon-checkmark-filled mr-1 text-sm' : 'i-carbon-copy mr-1 text-sm'" />
                        {{ copiedControlKey === 'system-update-install-agent' ? '已复制代理安装命令' : '复制代理安装命令' }}
                      </BaseButton>
                    </div>
                    <div class="border border-white/8 rounded-lg bg-black/10 p-2 space-y-2">
                      3. 正式创建任务前，建议先跑 <code class="font-mono">smoke-system-update-center.sh</code>，再执行预检和远程更新。
                      <div class="rounded-md border border-white/8 bg-black/15 px-2 py-1 text-[11px] leading-5 font-mono whitespace-pre-wrap break-all">
                        {{ SYSTEM_UPDATE_SMOKE_COMMAND }}
                      </div>
                      <BaseButton
                        size="sm"
                        :variant="copiedControlKey === 'system-update-smoke' ? 'primary' : 'outline'"
                        @click="copySystemUpdateSmokeCommand"
                      >
                        <span :class="copiedControlKey === 'system-update-smoke' ? 'i-carbon-checkmark-filled mr-1 text-sm' : 'i-carbon-copy mr-1 text-sm'" />
                        {{ copiedControlKey === 'system-update-smoke' ? '已复制 smoke 命令' : '复制 smoke 命令' }}
                      </BaseButton>
                    </div>
                  </div>
                </div>

                <div
                  class="border rounded-lg p-3 space-y-3"
                  :class="systemUpdateRemoteReadinessTone === 'danger' ? 'border-rose-500/20 bg-rose-500/5' : (systemUpdateRemoteReadinessTone === 'warning' ? 'border-amber-500/20 bg-amber-500/10' : 'border-emerald-500/20 bg-emerald-500/5')"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="glass-text-main flex items-center gap-2 text-sm font-bold">
                        <div class="i-carbon-task-complete" />
                        远程更新准备度
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5">
                        {{ systemUpdateRemoteReadinessSummary }}
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <BaseBadge :tone="systemUpdateRemoteReadinessTone">
                        {{ systemUpdateRemoteReadinessBlockerCount > 0 ? `阻断 ${systemUpdateRemoteReadinessBlockerCount}` : (systemUpdateRemoteReadinessWarningCount > 0 ? `提醒 ${systemUpdateRemoteReadinessWarningCount}` : '全部就绪') }}
                      </BaseBadge>
                      <BaseButton
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateChecking"
                        @click="checkSystemUpdateNow"
                      >
                        检查更新
                      </BaseButton>
                      <BaseButton
                        size="sm"
                        variant="outline"
                        :loading="systemUpdatePreflighting"
                        @click="runSystemUpdatePreflightNow()"
                      >
                        执行预检
                      </BaseButton>
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    <div
                      v-for="item in systemUpdateRemoteReadinessItems"
                      :key="item.key"
                      class="border border-white/8 rounded-lg bg-black/10 p-2"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="glass-text-main text-xs font-semibold">
                          {{ item.label }}
                        </div>
                        <BaseBadge :tone="item.tone">
                          {{ item.stateLabel }}
                        </BaseBadge>
                      </div>
                      <div class="glass-text-main mt-1 text-[12px] leading-5 break-all">
                        {{ item.summary }}
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px] leading-5 break-all">
                        {{ item.detail }}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  class="border rounded-lg p-3 space-y-3"
                  :class="systemUpdateSmokeSummaryTone === 'danger' ? 'border-rose-500/20 bg-rose-500/5' : (systemUpdateSmokeSummaryTone === 'warning' ? 'border-amber-500/20 bg-amber-500/10' : 'border-emerald-500/20 bg-emerald-500/5')"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="glass-text-main flex items-center gap-2 text-sm font-bold">
                        <div class="i-carbon-checklist" />
                        最近 smoke 联动检查
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5">
                        <template v-if="systemUpdateLatestSmokeSummary">
                          {{ systemUpdateSmokeSummaryStale ? '最近一次 smoke 报告已经偏旧，正式更新前建议重新跑一遍。' : '这里展示最近一次非破坏性 smoke 的结果，方便判断“远程更新链路”是否真的跑通过。' }}
                        </template>
                        <template v-else>
                          还没有可读取的 smoke 报告；建议在宿主机先执行一次 <code class="font-mono">smoke-system-update-center.sh</code>。
                        </template>
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <BaseBadge :tone="systemUpdateSmokeSummaryTone">
                        {{ systemUpdateSmokeSummaryStateLabel }}
                      </BaseBadge>
                      <BaseButton
                        size="sm"
                        :variant="copiedControlKey === 'system-update-smoke-rerun' ? 'primary' : 'outline'"
                        @click="copySystemUpdateSmokeRerunCommand"
                      >
                        <span :class="copiedControlKey === 'system-update-smoke-rerun' ? 'i-carbon-checkmark-filled mr-1 text-sm' : 'i-carbon-copy mr-1 text-sm'" />
                        {{ copiedControlKey === 'system-update-smoke-rerun' ? '已复制重跑命令' : '复制重跑 smoke 命令' }}
                      </BaseButton>
                    </div>
                  </div>

                  <div v-if="systemUpdateLatestSmokeSummary" class="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    <div class="border border-white/8 rounded-lg bg-black/10 p-2 space-y-1">
                      <div class="glass-text-main text-xs font-semibold">
                        检查摘要
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5">
                        最近检查：{{ systemUpdateLatestSmokeSummary.checkedAtLabel || formatTimestamp(systemUpdateLatestSmokeSummary.checkedAt) }}
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5">
                        通过 {{ systemUpdateLatestSmokeSummary.passCount }} · 提醒 {{ systemUpdateLatestSmokeSummary.warnCount }} · 失败 {{ systemUpdateLatestSmokeSummary.failCount }}
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5">
                        目标 {{ systemUpdateLatestSmokeSummary.targetVersion || '未解析版本' }} · {{ systemUpdateLatestSmokeSummary.targetScope || '-' }} / {{ systemUpdateLatestSmokeSummary.targetStrategy || '-' }}
                      </div>
                      <div v-if="systemUpdateLatestSmokeSummary.targetAgents && systemUpdateLatestSmokeSummary.targetAgents !== '未指定'" class="glass-text-muted text-[11px] leading-5 break-all">
                        目标代理：{{ systemUpdateLatestSmokeSummary.targetAgents }}
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5 break-all">
                        基础地址：{{ systemUpdateLatestSmokeSummary.baseUrl || '-' }}
                      </div>
                    </div>

                    <div class="border border-white/8 rounded-lg bg-black/10 p-2 space-y-1">
                      <div class="glass-text-main text-xs font-semibold">
                        结果提示
                      </div>
                      <div v-if="systemUpdateSmokeSummaryHighlightLines.length" class="space-y-1">
                        <div
                          v-for="line in systemUpdateSmokeSummaryHighlightLines"
                          :key="line"
                          class="glass-text-muted text-[11px] leading-5"
                        >
                          - {{ line }}
                        </div>
                      </div>
                      <div v-else class="glass-text-muted text-[11px] leading-5">
                        这次 smoke 没有返回额外的结果明细。
                      </div>
                      <div v-if="systemUpdateSmokeSummaryStale" class="glass-text-muted text-[11px] leading-5">
                        当前报告已经超过 3 天，建议在正式创建更新任务前重新跑一次。
                      </div>
                      <div class="glass-text-muted text-[11px] leading-5 break-all">
                        宿主机核验：{{ systemUpdateLatestSmokeSummary.verifyTarget || '未记录' }}
                      </div>
                    </div>
                  </div>

                  <div v-if="systemUpdateLatestSmokeSummary?.summaryPath" class="glass-text-muted text-[11px] leading-5 break-all">
                    报告文件：{{ systemUpdateLatestSmokeSummary.summaryPath }}
                  </div>
                </div>

                <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="glass-text-main text-sm font-bold">
                      版本说明预览
                    </div>
                    <a
                      v-if="systemUpdateOverview?.latestRelease?.url"
                      :href="systemUpdateOverview.latestRelease.url"
                      target="_blank"
                      rel="noreferrer"
                      class="glass-text-muted text-[11px] hover:underline"
                    >
                      打开 Release
                    </a>
                  </div>
                  <div class="glass-text-muted text-sm">
                    <template v-if="systemUpdateOverview?.latestRelease">
                      <p>
                        <strong>标题：</strong>{{ systemUpdateOverview.latestRelease.title || systemUpdateLatestVersionLabel }}
                      </p>
                      <p>
                        <strong>发布日期：</strong>{{ formatTimestamp(systemUpdateOverview.latestRelease.publishedAt) }}
                      </p>
                    </template>
                    <p v-else>
                      执行“检查更新”后，这里会显示最新版本的说明摘要和资产信息。
                    </p>
                  </div>
                  <div v-if="systemUpdateLatestReleaseNotes" class="glass-text-muted rounded-lg border border-white/8 bg-black/10 p-3 text-[12px] leading-6 whitespace-pre-wrap">
                    {{ systemUpdateLatestReleaseNotes }}
                  </div>
                  <div v-if="systemUpdateLatestReleaseAssets.length" class="space-y-2">
                    <div class="glass-text-main text-xs font-semibold">
                      关键资产
                    </div>
                    <div
                      v-for="asset in systemUpdateLatestReleaseAssets"
                      :key="`${asset.name}:${asset.url}`"
                      class="border border-white/8 rounded-lg bg-black/10 p-2"
                    >
                      <div class="glass-text-main text-xs font-semibold break-all">
                        {{ asset.name || '未命名资产' }}
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px]">
                        {{ formatSystemUpdateAssetSize(asset.size) }}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  class="border rounded-lg p-3 space-y-3"
                  :class="systemUpdateSyncRecommendation?.suggested ? 'border-cyan-500/20 bg-cyan-500/5' : 'border-white/10 bg-black/10'"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="glass-text-main text-sm font-bold">
                        公告同步预览
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px]">
                        {{ systemUpdateSyncRecommendation?.reason || '执行“检查更新”后，会在这里显示版本说明可物化成多少条公告。' }}
                      </div>
                    </div>
                    <div class="shrink-0 flex items-center gap-2">
                      <BaseBadge :tone="systemUpdateSyncRecommendation?.suggested ? 'info' : 'success'">
                        {{ systemUpdateSyncRecommendation ? (systemUpdateSyncRecommendation.suggested ? '建议同步' : '已同步') : '待检查' }}
                      </BaseBadge>
                      <BaseButton
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateAnnouncementSyncing"
                        @click="syncSystemUpdateAnnouncementsNow"
                      >
                        同步公告
                      </BaseButton>
                    </div>
                  </div>
                  <div v-if="systemUpdateAnnouncementPreview" class="glass-text-muted text-xs">
                    待新增 {{ systemUpdateAnnouncementPreview.added }} · 待更新 {{ systemUpdateAnnouncementPreview.updated }} · 已跳过 {{ systemUpdateAnnouncementPreview.skipped }} · 来源 {{ summarizeSystemUpdateAnnouncementSources(systemUpdateAnnouncementPreview.sources) }}
                  </div>
                  <div v-if="systemUpdateAnnouncementPreview?.entries?.length" class="space-y-2">
                    <div
                      v-for="entry in systemUpdateAnnouncementPreview.entries"
                      :key="`${entry.version}:${entry.publishDate}:${entry.title}`"
                      class="border border-white/8 rounded-lg bg-black/10 p-2"
                    >
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="glass-text-main text-xs font-semibold">{{ entry.title }}</span>
                        <BaseBadge v-if="entry.version" tone="info">
                          {{ entry.version }}
                        </BaseBadge>
                        <span class="glass-text-muted text-[11px]">{{ entry.publishDate || '未标日期' }}</span>
                        <span class="glass-text-muted text-[11px]">{{ getSystemUpdateAnnouncementSourceLabel(entry.sourceType) }}</span>
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px] leading-5">
                        {{ entry.summary || '暂无摘要' }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="glass-text-muted text-xs">
                    暂无可预览的公告候选；通常在执行一次“检查更新”后这里会刷新。
                  </div>
                  <div v-if="systemUpdateLastAnnouncementSyncResult" class="glass-text-muted text-[11px]">
                    最近同步：新增 {{ systemUpdateLastAnnouncementSyncResult.added }} · 更新 {{ systemUpdateLastAnnouncementSyncResult.updated }} · 跳过 {{ systemUpdateLastAnnouncementSyncResult.skipped }} · 最新版本 {{ systemUpdateLastAnnouncementSyncResult.latestVersion || '-' }}
                  </div>
                </div>

                <div
                  class="border rounded-lg p-3 space-y-2"
                  :class="systemUpdateDrainCutoverReadiness?.canDrainCutover ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/10'"
                >
                  <div class="glass-text-main flex items-center gap-2 text-sm font-bold">
                    <div class="i-carbon-arrows-vertical" />
                    排空切换预检
                  </div>
                  <div class="glass-text-muted text-sm">
                    {{ describeSystemUpdateDrainCutoverReadiness(systemUpdateDrainCutoverReadiness) }}
                  </div>
                  <div v-if="systemUpdateDrainCutoverReadiness && !systemUpdateDrainCutoverReadiness.canDrainCutover" class="glass-text-muted text-[11px]">
                    当前版本已经验证过：集群调度可用，但尚未实现账号运行态热迁移；若账号只剩一次性登录凭据，切换后通常需要重新登录。
                  </div>
                  <div v-if="systemUpdateDrainCutoverReadiness?.estimatedDrainSeconds" class="glass-text-muted text-[11px]">
                    预计排空耗时：约 {{ Math.ceil((systemUpdateDrainCutoverReadiness.estimatedDrainSeconds || 0) / 60) }} 分钟
                  </div>
                  <div v-if="systemUpdateDrainCutoverBlockers.length" class="space-y-2">
                    <div
                      v-for="blocker in systemUpdateDrainCutoverBlockers"
                      :key="`${blocker.nodeId}:${blocker.accountId}`"
                      class="border border-white/8 rounded-lg bg-black/10 p-2"
                    >
                      <div class="glass-text-main text-xs font-semibold">
                        {{ blocker.accountName || blocker.accountId }} · {{ blocker.nodeId || '未分配节点' }}
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px]">
                        {{ blocker.platform || '-' }} · {{ blocker.credentialKind || '-' }} · {{ blocker.message }}
                      </div>
                    </div>
                  </div>
                  <div v-if="systemUpdateDrainCutoverReadiness?.blockingNodes?.length" class="glass-text-muted text-[11px] space-y-1">
                    <div
                      v-for="node in systemUpdateDrainCutoverReadiness.blockingNodes"
                      :key="node.nodeId"
                    >
                      阻断节点 {{ node.nodeId }}：{{ node.blockerCount }} 个账号
                    </div>
                  </div>
                </div>

                <div
                  class="border rounded-lg p-3 space-y-3"
                  :class="systemUpdateLatestPreflight?.ok ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/10 bg-black/10'"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="glass-text-main text-sm font-bold">
                        更新预检
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px]">
                        单独预检不会创建任务，只会返回当前环境是否允许继续执行。
                      </div>
                    </div>
                    <BaseButton
                      size="sm"
                      variant="outline"
                      :loading="systemUpdatePreflighting"
                      @click="runSystemUpdatePreflightNow()"
                    >
                      执行预检
                    </BaseButton>
                  </div>
                  <div v-if="systemUpdateLatestPreflight" class="glass-text-muted text-xs">
                    最近预检：{{ systemUpdateLatestPreflight.ok ? '通过' : '存在阻断' }} · 阻断 {{ systemUpdateLatestPreflight.blockerCount }} · 提醒 {{ systemUpdateLatestPreflight.warningCount }}
                  </div>
                  <div v-if="systemUpdatePreflightChecks.length" class="grid grid-cols-1 gap-2 xl:grid-cols-2">
                    <div
                      v-for="check in systemUpdatePreflightChecks"
                      :key="check.key"
                      class="border border-white/8 rounded-lg bg-black/10 p-2"
                    >
                      <div class="flex items-center gap-2">
                        <span class="glass-text-main text-xs font-semibold">{{ check.label }}</span>
                        <BaseBadge :tone="getSystemUpdatePreflightCheckTone(check)">
                          {{ check.blocker ? '阻断' : (check.warning ? '提醒' : '通过') }}
                        </BaseBadge>
                      </div>
                      <div class="glass-text-muted mt-1 text-[11px] leading-5">
                        {{ check.message || '暂无说明' }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                  <div class="glass-text-main text-sm font-bold">
                    更新中心默认配置
                  </div>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <BaseSelect
                      v-model="systemUpdateConfig.provider"
                      label="版本源类型"
                      :options="systemUpdateProviderOptions"
                    />
                    <BaseInput
                      v-model="systemUpdateConfig.manifestUrl"
                      label="Manifest URL"
                      type="text"
                      placeholder="https://example.com/update-manifest.json"
                    />
                    <BaseInput
                      v-model="systemUpdateConfig.releaseApiUrl"
                      label="自定义 Release API"
                      type="text"
                      placeholder="https://api.github.com/repos/owner/repo/releases/latest"
                    />
                    <BaseInput
                      v-model="systemUpdateConfig.githubOwner"
                      label="GitHub Owner"
                      type="text"
                      placeholder="owner"
                    />
                    <BaseInput
                      v-model="systemUpdateConfig.githubRepo"
                      label="GitHub Repo"
                      type="text"
                      placeholder="repo"
                    />
                    <BaseSelect
                      v-model="systemUpdateConfig.preferredScope"
                      label="默认更新范围"
                      :options="systemUpdateScopeOptions"
                    />
                    <BaseSelect
                      v-model="systemUpdateConfig.preferredStrategy"
                      label="默认更新策略"
                      :options="systemUpdateStrategyOptions"
                    />
                    <BaseInput
                      v-model="systemUpdateConfig.maintenanceWindow"
                      label="维护窗口"
                      type="text"
                      placeholder="例如：02:00-05:00"
                    />
                    <BaseInput
                      v-model.number="systemUpdateConfig.defaultLogTailLines"
                      label="默认日志尾部行数"
                      type="number"
                      placeholder="80"
                    />
                    <div class="grid grid-cols-2 gap-3">
                      <BaseSwitch v-model="systemUpdateConfig.allowPreRelease" label="允许预发布版本" />
                      <BaseSwitch v-model="systemUpdateConfig.requireDrain" label="默认要求排空" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <BaseSwitch v-model="systemUpdateConfig.autoSyncAnnouncements" label="默认同步公告" />
                      <BaseSwitch v-model="systemUpdateConfig.autoRunVerification" label="默认执行核验" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <BaseSwitch v-model="systemUpdateConfig.promptRollbackOnFailure" label="失败后提示回滚" />
                      <div class="glass-text-muted text-[11px] leading-5 flex items-center">
                        这些策略会直接影响新任务默认值与失败后的推荐动作。
                      </div>
                    </div>
                  </div>
                </div>

                <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                  <div class="glass-text-main text-sm font-bold">
                    创建更新任务
                  </div>
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <BaseInput
                      v-model="systemUpdateDraft.targetVersion"
                      label="目标版本"
                      type="text"
                      placeholder="v4.5.19"
                    />
                    <BaseSelect
                      v-model="systemUpdateDraft.scope"
                      label="任务范围"
                      :options="systemUpdateScopeOptions"
                    />
                    <BaseSelect
                      v-model="systemUpdateDraft.strategy"
                      label="执行策略"
                      :options="systemUpdateStrategyOptions"
                    />
                    <BaseInput
                      v-model="systemUpdateDraft.targetAgentIdsText"
                      label="目标代理"
                      type="text"
                      placeholder="agent-a,agent-b"
                    />
                    <BaseInput
                      v-model="systemUpdateDraft.drainNodeIdsText"
                      label="排空节点"
                      type="text"
                      placeholder="worker-a,worker-b"
                    />
                    <BaseInput
                      v-model="systemUpdateDraft.note"
                      label="任务备注"
                      type="text"
                      placeholder="例如：夜间滚动更新"
                    />
                    <div class="grid grid-cols-2 gap-3">
                      <BaseSwitch v-model="systemUpdateDraft.preserveCurrent" label="保留旧版本目录" />
                      <BaseSwitch v-model="systemUpdateDraft.requireDrain" label="执行前先排空" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <BaseSwitch v-model="systemUpdateDraft.syncAnnouncements" label="更新后同步公告" />
                      <BaseSwitch v-model="systemUpdateDraft.runVerification" label="更新后执行核验" />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <BaseSwitch v-model="systemUpdateDraft.allowAutoRollback" label="允许自动回退" />
                      <BaseSwitch v-model="systemUpdateDraft.includeDeployTemplates" label="同步部署脚本模板" />
                    </div>
                  </div>
                  <div class="glass-text-muted text-[11px] leading-5">
                    “允许自动回退”会把回退意图写入任务模型，后续可以配合回滚任务或失败提示使用；当前默认仍建议人工确认后再执行回滚。
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <BaseButton
                      size="sm"
                      variant="outline"
                      :loading="systemUpdatePreflighting"
                      @click="runSystemUpdatePreflightNow()"
                    >
                      先执行预检
                    </BaseButton>
                  </div>
                </div>
              </div>
            </div>

            <div v-show="isSystemUpdateDetailTabVisible(['jobs'])" id="settings-update-jobs" class="space-y-4">
              <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-2" :class="activeSystemUpdateBatch ? '' : 'xl:col-span-2'">
                  <div class="flex items-center justify-between gap-3">
                    <div class="glass-text-main text-sm font-bold">
                      当前活跃任务
                    </div>
                    <BaseButton
                      v-if="canCancelSystemUpdateJob(activeSystemUpdateJob)"
                      size="sm"
                      variant="outline"
                      :loading="systemUpdateCancellingKey === `job:${activeSystemUpdateJob?.id}`"
                      @click="activeSystemUpdateJob && cancelSystemUpdateJobNow(activeSystemUpdateJob)"
                    >
                      取消任务
                    </BaseButton>
                    <BaseButton
                      v-if="canRollbackSystemUpdateJob(activeSystemUpdateJob)"
                      size="sm"
                      variant="outline"
                      :loading="systemUpdateRollingBackKey === `job:${activeSystemUpdateJob?.id}`"
                      @click="activeSystemUpdateJob && rollbackSystemUpdateJobNow(activeSystemUpdateJob)"
                    >
                      创建回滚任务
                    </BaseButton>
                  </div>
                  <div class="glass-text-muted text-sm">
                    {{ describeSystemUpdateJob(activeSystemUpdateJob) }}
                  </div>
                  <div v-if="activeSystemUpdateJob" class="glass-text-muted text-xs">
                    任务号 {{ activeSystemUpdateJob.jobKey }} · 创建于 {{ formatTimestamp(activeSystemUpdateJob.createdAt) }} · 目标 {{ activeSystemUpdateJob.targetVersion || '-' }} · 目标代理 {{ activeSystemUpdateJob.targetAgentId || '-' }} · 执行代理 {{ activeSystemUpdateJob.claimAgentId || '-' }}
                  </div>
                  <div v-if="activeSystemUpdateJob?.errorMessage" class="glass-text-muted text-[11px]">
                    失败原因：{{ activeSystemUpdateJob.errorMessage }}
                  </div>
                  <div v-if="activeSystemUpdateJob?.errorMessage && systemUpdateConfig.promptRollbackOnFailure && canRollbackSystemUpdateJob(activeSystemUpdateJob)" class="glass-text-muted text-[11px]">
                    建议：当前任务已具备回滚条件，可以直接创建回滚任务作为下一步处理。
                  </div>
                  <div v-if="activeSystemUpdateJob?.result?.logFile" class="glass-text-muted break-all text-[11px] font-mono">
                    代理日志：{{ activeSystemUpdateJob.result.logFile }}
                  </div>
                </div>

                <div v-if="activeSystemUpdateBatch" class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <div class="glass-text-main text-sm font-bold">
                      当前批次进度
                    </div>
                    <div class="flex flex-wrap justify-end gap-2">
                      <BaseButton
                        v-if="getBatchCancelableCount(activeSystemUpdateBatch) > 0"
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateCancellingKey === `batch:${activeSystemUpdateBatch.batchKey}`"
                        @click="cancelSystemUpdateBatchNow(activeSystemUpdateBatch)"
                      >
                        取消剩余子任务
                      </BaseButton>
                      <BaseButton
                        v-if="activeSystemUpdateBatch.failedCount > 0"
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateRetryingKey === `batch:${activeSystemUpdateBatch.batchKey}`"
                        @click="retrySystemUpdateBatchNow(activeSystemUpdateBatch)"
                      >
                        重试失败子任务
                      </BaseButton>
                    </div>
                  </div>
                  <div class="glass-text-muted text-sm">
                    {{ describeSystemUpdateBatch(activeSystemUpdateBatch) }}
                  </div>
                  <div class="glass-text-muted text-[11px]">
                    批次号 {{ activeSystemUpdateBatch.batchKey || '-' }} · 目标版本 {{ activeSystemUpdateBatch.targetVersion || '-' }} · 目标代理 {{ activeSystemUpdateBatch.targetAgentIds.join(', ') || '-' }}
                  </div>
                  <div class="glass-text-muted text-[11px]">
                    待执行 {{ activeSystemUpdateBatch.pendingCount }} · 已认领 {{ activeSystemUpdateBatch.claimedCount }} · 运行中 {{ activeSystemUpdateBatch.runningCount }} · 成功 {{ activeSystemUpdateBatch.succeededCount }} · 失败 {{ activeSystemUpdateBatch.failedCount }}
                  </div>
                  <div v-if="activeSystemUpdateBatch.drainNodeIds?.length" class="glass-text-muted text-[11px]">
                    默认排空节点：{{ activeSystemUpdateBatch.drainNodeIds.join(', ') }}
                  </div>
                  <div v-if="activeSystemUpdateBatch.latestSummaryMessage" class="glass-text-muted text-[11px]">
                    最近进度：{{ activeSystemUpdateBatch.latestSummaryMessage }}
                  </div>
                  <div v-if="activeSystemUpdateBatch.latestErrorMessage" class="glass-text-muted text-[11px]">
                    最近错误：{{ activeSystemUpdateBatch.latestErrorMessage }}
                  </div>
                </div>
              </div>

              <SystemUpdateJobDetailPanel
                :detail="activeSystemUpdateJobDetail"
                :loading="systemUpdateJobDetailLoading"
              />

              <SystemUpdateBatchDetail
                :batch="activeSystemUpdateBatch"
              />

              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="glass-text-main text-sm font-bold">
                  最近更新任务
                </div>
                <div v-if="systemUpdateJobs.length === 0" class="glass-text-muted text-sm">
                  暂无更新任务
                </div>
                <div v-else class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div
                    v-for="job in systemUpdateJobs"
                    :key="job.id"
                    class="border border-white/8 rounded-lg bg-black/10 p-3"
                  >
                    <div class="glass-text-main flex items-center justify-between gap-2 text-sm font-semibold">
                      <span>{{ job.targetVersion || '-' }}</span>
                      <span class="text-xs font-mono uppercase">{{ job.status }}</span>
                    </div>
                    <div class="glass-text-muted mt-1 text-xs">
                      {{ describeSystemUpdateJob(job) }}
                    </div>
                    <div class="glass-text-muted mt-1 text-[11px]">
                      {{ formatTimestamp(job.createdAt) }} · {{ job.createdBy || 'system' }} · 目标 {{ job.targetAgentId || '-' }} · 执行 {{ job.claimAgentId || '-' }}
                    </div>
                    <div v-if="job.batchKey" class="glass-text-muted mt-1 text-[11px]">
                      批次：{{ job.batchKey }}
                    </div>
                    <div v-if="job.drainNodeIds?.length" class="glass-text-muted mt-1 text-[11px]">
                      排空节点：{{ job.drainNodeIds.join(', ') }}
                    </div>
                    <div v-if="job.errorMessage" class="glass-text-muted mt-1 text-[11px]">
                      失败原因：{{ job.errorMessage }}
                    </div>
                    <div v-if="job.result?.logFile" class="glass-text-muted mt-1 break-all text-[11px] font-mono">
                      代理日志：{{ job.result.logFile }}
                    </div>
                    <div v-if="canCancelSystemUpdateJob(job) || job.status === 'failed' || job.status === 'cancelled' || canRollbackSystemUpdateJob(job)" class="mt-2 flex flex-wrap gap-2">
                      <BaseButton
                        v-if="canCancelSystemUpdateJob(job)"
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateCancellingKey === `job:${job.id}`"
                        @click="cancelSystemUpdateJobNow(job)"
                      >
                        取消任务
                      </BaseButton>
                      <BaseButton
                        v-if="job.status === 'failed' || job.status === 'cancelled'"
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateRetryingKey === `job:${job.id}`"
                        @click="retrySystemUpdateJobNow(job)"
                      >
                        重试此任务
                      </BaseButton>
                      <BaseButton
                        v-if="canRollbackSystemUpdateJob(job)"
                        size="sm"
                        variant="outline"
                        :loading="systemUpdateRollingBackKey === `job:${job.id}`"
                        @click="rollbackSystemUpdateJobNow(job)"
                      >
                        创建回滚任务
                      </BaseButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-show="isSystemUpdateDetailTabVisible(['nodes'])" id="settings-update-nodes" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-2">
                <div class="glass-text-main text-sm font-bold">
                  更新代理状态
                </div>
                <div v-if="!systemUpdateOverview?.runtime?.agentSummary?.length" class="glass-text-muted text-sm">
                  暂无代理心跳
                </div>
                <div v-else class="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                  <div
                    v-for="agent in systemUpdateAgents"
                    :key="agent.nodeId"
                    class="border border-white/8 rounded-lg bg-black/10 p-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="glass-text-main flex items-center gap-2 text-sm font-semibold">
                          <span class="truncate">{{ agent.nodeId }}</span>
                          <BaseBadge :tone="agent.status === 'error' ? 'danger' : 'success'">
                            {{ agent.status || 'idle' }}
                          </BaseBadge>
                        </div>
                        <div class="glass-text-muted mt-1 text-xs">
                          {{ describeSystemUpdateAgent(agent) }}
                        </div>
                        <div v-if="agent.targetVersion" class="glass-text-muted mt-1 text-[11px]">
                          当前目标版本 {{ agent.targetVersion }} {{ agent.jobStatus ? `· ${agent.jobStatus}` : '' }}
                        </div>
                      </div>
                      <div class="shrink-0">
                        <BaseButton
                          size="sm"
                          :variant="isSystemUpdateTargetAgentSelected(agent.nodeId) ? 'secondary' : 'outline'"
                          @click="toggleSystemUpdateTargetAgent(agent.nodeId)"
                        >
                          {{ isSystemUpdateTargetAgentSelected(agent.nodeId) ? '取消目标' : '设为目标' }}
                        </BaseButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-2">
                <div class="glass-text-main text-sm font-bold">
                  集群节点排空
                </div>
                <div v-if="!systemUpdateClusterNodes.length" class="glass-text-muted text-sm">
                  暂无 Worker 节点心跳
                </div>
                <div v-else class="grid grid-cols-1 gap-3 2xl:grid-cols-2">
                  <div
                    v-for="node in systemUpdateClusterNodes"
                    :key="node.nodeId"
                    class="border border-white/8 rounded-lg bg-black/10 p-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="glass-text-main flex items-center gap-2 text-sm font-semibold">
                          <span class="truncate">{{ node.nodeId }}</span>
                          <BaseBadge
                            :tone="node.draining ? 'warning' : (node.connected ? 'success' : 'neutral')"
                          >
                            {{ node.draining ? '排空中' : (node.connected ? '在线' : '离线') }}
                          </BaseBadge>
                        </div>
                        <div class="glass-text-muted mt-1 text-xs">
                          {{ node.role || 'worker' }} · {{ node.version || '-' }} · {{ formatTimestamp(node.updatedAt) }}
                        </div>
                        <div class="glass-text-muted mt-1 text-[11px]">
                          {{ describeSystemUpdateNode(node) }}
                        </div>
                        <div v-if="node.assignedAccountIds?.length" class="glass-text-muted mt-1 break-all text-[11px] font-mono">
                          账号: {{ node.assignedAccountIds.join(', ') }}
                        </div>
                      </div>
                      <div class="shrink-0">
                        <BaseButton
                          size="sm"
                          :variant="node.draining ? 'secondary' : 'outline'"
                          :loading="systemUpdateNodeMutatingId === node.nodeId"
                          :loading-label="node.draining ? '恢复中' : '排空中'"
                          @click="toggleSystemUpdateNodeDrain(node, !node.draining)"
                        >
                          {{ node.draining ? '恢复接流' : '执行排空' }}
                        </BaseButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel mt-auto flex flex-wrap justify-end gap-2 px-4 py-3">
            <BaseButton
              variant="ghost"
              size="sm"
              :loading="systemUpdateRefreshing"
              class="settings-footer-button"
              @click="refreshSystemUpdateStatus()"
            >
              刷新状态
            </BaseButton>
            <BaseButton
              v-if="isSystemUpdateDetailTabVisible(['overview', 'nodes'])"
              variant="ghost"
              size="sm"
              :loading="systemUpdateChecking"
              class="settings-footer-button"
              @click="checkSystemUpdateNow"
            >
              检查更新
            </BaseButton>
            <BaseButton
              v-if="isSystemUpdateDetailTabVisible(['overview'])"
              variant="secondary"
              size="sm"
              :loading="systemUpdateSaving"
              class="settings-footer-button"
              @click="saveSystemUpdateConfigForm"
            >
              保存更新配置
            </BaseButton>
            <BaseButton
              v-if="isSystemUpdateDetailTabVisible(['overview', 'jobs'])"
              variant="primary"
              size="sm"
              :loading="systemUpdateLaunching"
              class="settings-footer-button"
              @click="createSystemUpdateTask"
            >
              创建更新任务
            </BaseButton>
          </div>
        </div>

        <!-- Card New: 分布式与集群流控（仅管理员可见） -->
        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['cluster'])"
          id="settings-advanced-cluster"
          class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-flow-stream" />
              分布式与集群流控 (Cluster Routing)
            </h3>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div class="space-y-3">
                <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                  <BaseSelect
                    v-model="clusterConfig.dispatcherStrategy"
                    label="集群派发器路由策略"
                    :options="clusterStrategyOptions"
                  />
                </div>

                <div class="settings-system-info-alert mt-2 flex items-start gap-2 rounded-md p-3 text-sm">
                  <div class="i-carbon-information mt-0.5 shrink-0 text-base" />
                  <div class="space-y-2">
                    <p class="font-bold">
                      策略说明
                    </p>
                    <p><strong>轮询洗牌：</strong>早期默认逻辑。新增账号或节点变动时，把所有存活账号抽出来均分给所有存活 Worker，容易造成大面积会话闪断。</p>
                    <p><strong>最小负荷与粘性推流：</strong>企业级路由逻辑。账号会优先分发到活跃数更低的节点，并保持粘性心跳，只有节点异常或新账号接入时才做迁移。</p>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      当前策略
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ clusterActiveStrategyLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      在线节点
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ clusterConnectedNodeCount }} / {{ systemUpdateClusterNodes.length }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      排空节点
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ clusterDrainingNodeCount }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      异常代理
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ clusterAgentErrorCount }}
                    </div>
                  </div>
                </div>

                <div class="border border-white/10 rounded-lg bg-black/10 p-3 text-sm space-y-2">
                  <div class="glass-text-main text-sm font-semibold">
                    当前建议
                  </div>
                  <p class="glass-text-muted">
                    {{ clusterConfig.dispatcherStrategy === 'least_load'
                      ? '当前已使用最小负荷策略，适合多节点长期稳定运行。'
                      : '如节点规模较大，建议切换到“最小负荷与粘性推流”，降低集中闪断风险。' }}
                  </p>
                  <p v-if="clusterDrainingNodeCount > 0" class="glass-text-muted">
                    当前有 {{ clusterDrainingNodeCount }} 个节点处于排空状态，建议更新完成后及时恢复接流。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel mt-auto flex justify-end px-4 py-3">
            <BaseButton
              variant="primary"
              size="sm"
              :loading="clusterSaving"
              class="settings-footer-button"
              @click="saveClusterConfig"
            >
              保存集群路由策略
            </BaseButton>
          </div>
        </div>

        <!-- Card 3: 体验卡配置（仅管理员可见） -->
        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced', 'security']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['trial'])"
          id="settings-advanced-trial"
          class="card glass-panel relative z-10 h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-chemistry" />
              体验卡配置
            </h3>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
              <div class="space-y-3">
                <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <BaseSwitch v-model="trialConfig.enabled" label="功能开关" />
                    <BaseSwitch v-model="trialConfig.adminRenewEnabled" label="管理员一键续费" />
                    <BaseSwitch v-model="trialConfig.userRenewEnabled" label="用户自助续费" />
                  </div>
                </div>

                <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                  <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <BaseSelect
                      v-model="trialConfig.days"
                      label="体验卡时长"
                      :options="trialDaysOptions"
                    />
                    <BaseSelect
                      v-model="trialConfig.cooldownMs"
                      label="IP 冷却时间"
                      :options="trialCooldownOptions"
                    />
                    <BaseInput
                      v-model.number="trialConfig.maxAccounts"
                      label="绑定账号数"
                      type="number"
                      min="1"
                      max="10"
                    />
                    <BaseInput
                      v-model.number="trialConfig.dailyLimit"
                      label="每日上限"
                      type="number"
                      min="1"
                    />
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      功能状态
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ trialConfig.enabled ? '已开启' : '已关闭' }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      续费模式
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ trialRenewModeLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      卡片时长
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ trialDurationLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      IP 冷却
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ trialCooldownLabel }}
                    </div>
                  </div>
                </div>

                <div class="border border-white/10 rounded-lg bg-black/10 p-3 text-sm space-y-2">
                  <div class="glass-text-main text-sm font-semibold">
                    使用建议
                  </div>
                  <p class="glass-text-muted">
                    当前单卡最多可绑定 {{ trialConfig.maxAccounts }} 个账号，每日续费上限 {{ trialConfig.dailyLimit }} 次。
                  </p>
                  <p class="glass-text-muted">
                    {{ trialConfig.userRenewEnabled
                      ? '已开放用户自助续费，建议同时保留管理员续费兜底。'
                      : '当前仅支持后台续费，适合先做灰度验证。' }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel mt-auto flex justify-end px-4 py-3">
            <BaseButton
              variant="primary"
              size="sm"
              :loading="trialSaving"
              class="settings-footer-button"
              @click="saveTrialConfig"
            >
              保存体验卡设置
            </BaseButton>
          </div>
        </div>

        <!-- Card 4: 第三方 API 配置（仅管理员可见） -->
        <div
          v-if="isAdmin"
          v-show="isSettingsCategoryVisible(['advanced', 'security']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['api'])"
          id="settings-advanced-api"
          class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
        >
          <div class="settings-card-divider px-4 py-3">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
              <div class="i-carbon-api-1" />
              第三方 API 配置
            </h3>
          </div>

          <div class="p-4 space-y-4">
            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <form class="border border-white/10 rounded-lg bg-black/10 p-3" @submit.prevent>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model="thirdPartyApiConfig.wxApiKey"
                    label="微信登录 API Key (wxApiKey)"
                    type="password"
                    autocomplete="off"
                    placeholder="请输入与第三方授权约定的 ApiKey"
                  />
                  <BaseInput
                    v-model="thirdPartyApiConfig.wxAppId"
                    label="QQ农场 AppId (wxAppId)"
                    type="text"
                    placeholder="默认从接口获取，可覆盖定制"
                  />
                  <BaseInput
                    v-model="thirdPartyApiConfig.wxApiUrl"
                    label="微信登录请求网关 (wxApiUrl)"
                    type="text"
                    placeholder="一般为内部或三方中转代理服务地址"
                  />
                  <BaseInput
                    v-model="thirdPartyApiConfig.ipad860Url"
                    label="Ipad860 服务地址"
                    type="text"
                    placeholder="如 http://127.0.0.1:8058 或 http://ipad860:8058"
                  />
                  <BaseInput
                    v-model="thirdPartyApiConfig.aineisheKey"
                    label="码雨云 API Token (QQ扫码)"
                    type="password"
                    autocomplete="off"
                    placeholder="请输入 aineishe.com 获取的 Token"
                  />
                </div>
              </form>

              <div class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      已配置项
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ thirdPartyApiConfiguredCount }} / 5
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      网关主机
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ thirdPartyApiGatewayHost }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      WxApiKey
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ thirdPartyApiConfig.wxApiKey ? '已配置' : '未配置' }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      码雨云 Token
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ thirdPartyApiConfig.aineisheKey ? '已配置' : '未配置' }}
                    </div>
                  </div>
                </div>

                <div class="settings-system-warning-alert mt-2 flex items-start gap-2 rounded-md p-3 text-sm">
                  <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-base" />
                  <p>更改此项配置会立即刷新扫码中转服务器参数。如果改错导致扫码无反应，请重新设置正确的值，原环境变量已不再具有覆写能力。</p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="glass-text-main text-sm font-semibold">
                  OpenAPI / Headless 能力入口
                </div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      Swagger 文档
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      <a href="/swagger" target="_blank" class="underline underline-offset-4 decoration-dotted">/swagger</a>
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      OpenAPI JSON
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      <a href="/openapi.json" target="_blank" class="underline underline-offset-4 decoration-dotted">/openapi.json</a>
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      当前服务模式
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ serviceProfileLabel }}
                    </div>
                  </div>
                  <div class="border border-white/10 rounded-lg bg-black/10 p-3">
                    <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                      外部客户端数
                    </div>
                    <div class="glass-text-main mt-1 text-sm font-semibold">
                      {{ externalApiClientCount }}
                    </div>
                  </div>
                </div>
                <div class="settings-system-warning-alert flex items-start gap-2 rounded-md p-3 text-sm">
                  <div class="i-carbon-information mt-0.5 shrink-0 text-base" />
                  <p>外部 API Key 仅补充“程序对程序”只读接入，不替代当前后台 JWT / Cookie 认证。创建后请妥善保存，系统只会在创建或轮换成功时返回一次明文 Key。</p>
                </div>
              </div>

              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="glass-text-main text-sm font-semibold">
                    外部 API Key 客户端
                  </div>
                  <BaseButton
                    size="sm"
                    variant="secondary"
                    :loading="externalApiClientsLoading"
                    @click="loadExternalApiClients(true)"
                  >
                    <div class="i-carbon-renew mr-1" /> 刷新
                  </BaseButton>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model="externalApiCreateDraft.name"
                    label="客户端名称"
                    type="text"
                    placeholder="例如：Grafana 只读探针"
                  />
                  <BaseInput
                    v-model="externalApiCreateDraft.allowedAccountIdsText"
                    label="限制账号 ID"
                    type="text"
                    placeholder="留空表示可读全部账号，多个逗号分隔"
                  />
                  <BaseInput
                    v-model="externalApiCreateDraft.expiresAt"
                    label="过期时间"
                    type="datetime-local"
                  />
                  <BaseInput
                    v-model="externalApiCreateDraft.note"
                    label="备注"
                    type="text"
                    placeholder="例如：只给监控系统读取"
                  />
                </div>

                <div class="flex justify-end">
                  <BaseButton
                    variant="primary"
                    size="sm"
                    :loading="externalApiMutatingKey === 'create'"
                    @click="createExternalApiClientNow"
                  >
                    创建只读客户端
                  </BaseButton>
                </div>

                <div v-if="externalApiLastPlainToken" class="settings-health-alert rounded-xl p-4 text-sm">
                  <div class="font-semibold">
                    新生成的外部 API Key
                  </div>
                  <code class="mt-2 block break-all font-mono">{{ externalApiLastPlainToken }}</code>
                  <div class="mt-2 text-xs opacity-80">
                    请立即复制保存。离开页面或再次轮换后将无法重新查看明文。
                  </div>
                </div>

                <div v-if="externalApiClients.length" class="space-y-3">
                  <div
                    v-for="client in externalApiClients"
                    :key="client.id"
                    class="border border-white/10 rounded-lg bg-black/10 p-3"
                  >
                    <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div class="space-y-1">
                        <div class="glass-text-main text-sm font-semibold">
                          {{ client.name }}
                        </div>
                        <div class="glass-text-muted break-all text-xs">
                          {{ client.id }} · Scope: {{ client.scopes.join(', ') || '无' }}
                        </div>
                        <div class="glass-text-muted text-xs">
                          状态：{{ client.status }} · 最近使用：{{ client.lastUsedAt ? formatTimestamp(client.lastUsedAt) : '未使用' }} · 过期：{{ client.expiresAt ? formatTimestamp(client.expiresAt) : '永不过期' }}
                        </div>
                        <div v-if="client.allowedAccountIds.length" class="glass-text-muted text-xs">
                          限制账号：{{ client.allowedAccountIds.join('、') }}
                        </div>
                        <div v-if="client.note" class="glass-text-muted text-xs">
                          备注：{{ client.note }}
                        </div>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <BaseButton
                          size="sm"
                          variant="outline"
                          :loading="externalApiMutatingKey === `rotate:${client.id}`"
                          @click="rotateExternalApiClientNow(client)"
                        >
                          轮换 Key
                        </BaseButton>
                        <BaseButton
                          size="sm"
                          variant="outline"
                          :loading="externalApiMutatingKey === `revoke:${client.id}`"
                          @click="revokeExternalApiClientNow(client)"
                        >
                          吊销
                        </BaseButton>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="settings-health-card rounded-xl p-4">
                  <div class="settings-health-card-value text-sm font-medium">
                    暂无外部 API 客户端
                  </div>
                  <div class="settings-health-card-note mt-2 text-xs">
                    创建后即可用 `x-api-key` 调用 `/api/external/*` 的只读接口，并配合 `/swagger` 查看文档。
                  </div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="glass-text-main text-sm font-semibold">
                    系统级能力开关
                  </div>
                  <BaseButton
                    size="sm"
                    variant="secondary"
                    :loading="platformCapabilitiesLoading"
                    @click="loadPlatformCapabilities(true)"
                  >
                    <div class="i-carbon-renew mr-1" /> 刷新
                  </BaseButton>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseSwitch v-model="platformCapabilities.openapiConfig.enabled" label="启用 OpenAPI 文档" hint="关闭后 `/swagger` 与 `/openapi.json` 将不再对外提供。" recommend="on" />
                  <BaseSwitch v-model="platformCapabilities.openapiConfig.exposeExternalApiOnly" label="仅暴露外部接口" hint="推荐保持开启，只展示稳定的外部 API 与健康检查接口。" recommend="on" />
                  <BaseSwitch v-model="platformCapabilities.openapiConfig.includeAdminReadOnlyRoutes" label="附带管理员只读接口" hint="文档中附加健康详情与外部 API 客户端管理等管理员只读入口。" recommend="conditional" />
                  <BaseSwitch v-model="platformCapabilities.serviceProfileConfig.allowAutoStartAccountsInHeadlessApi" label="Headless API 默认自动拉号" hint="开启后 headless-api 模式也会尝试自动启动账号。默认建议关闭，保持纯接口节点。" recommend="off" />
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model="platformCapabilities.openapiConfig.title"
                    label="OpenAPI 标题"
                    type="text"
                  />
                  <BaseInput
                    v-model="platformCapabilities.openapiConfig.version"
                    label="OpenAPI 版本"
                    type="text"
                  />
                  <BaseInput
                    v-model="platformCapabilities.openapiConfig.serverBaseUrl"
                    label="文档 Server Base URL"
                    type="text"
                    placeholder="留空自动使用当前 Host"
                  />
                  <BaseSelect
                    v-model="platformCapabilities.serviceProfileConfig.defaultProfile"
                    label="默认服务模式"
                    :options="serviceProfileDefaultOptions"
                  />
                </div>
              </div>

              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="glass-text-main text-sm font-semibold">
                  探针与代理池阈值
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model.number="platformCapabilities.healthProbeConfig.dependencyTimeoutMs"
                    label="依赖探针超时 (ms)"
                    type="number"
                    min="300"
                  />
                  <BaseInput
                    v-model.number="platformCapabilities.healthProbeConfig.runtimeWorkerOfflineThresholdSec"
                    label="运行时告警阈值 (秒)"
                    type="number"
                    min="10"
                  />
                  <BaseInput
                    v-model.number="platformCapabilities.healthProbeConfig.warnReloginQueueCount"
                    label="重登告警阈值"
                    type="number"
                    min="0"
                  />
                  <BaseInput
                    v-model.number="platformCapabilities.healthProbeConfig.warnFailedAccountCount"
                    label="封禁告警阈值"
                    type="number"
                    min="0"
                  />
                  <BaseSwitch v-model="platformCapabilities.healthProbeConfig.includeAiService" label="纳入 AI 服务探针" hint="会把 AI 守护进程状态纳入依赖健康快照。" recommend="on" />
                  <BaseSwitch v-model="platformCapabilities.proxyPoolConfig.enabled" label="启用代理池子系统" hint="关闭后仍保留已录入节点，但不建议继续做新绑定。" recommend="on" />
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model.number="platformCapabilities.proxyPoolConfig.healthCheckTimeoutMs"
                    label="代理体检超时 (ms)"
                    type="number"
                    min="1000"
                  />
                  <BaseInput
                    v-model.number="platformCapabilities.proxyPoolConfig.healthCheckBatchSize"
                    label="单次体检批量数"
                    type="number"
                    min="1"
                  />
                  <BaseInput
                    v-model.number="platformCapabilities.proxyPoolConfig.defaultMaxUsersPerProxy"
                    label="默认单节点账号数"
                    type="number"
                    min="1"
                  />
                  <BaseInput
                    v-model.number="platformCapabilities.proxyPoolConfig.cooldownMs"
                    label="失败冷却 (ms)"
                    type="number"
                    min="1000"
                  />
                  <BaseSelect
                    v-model="platformCapabilities.proxyPoolConfig.selectionStrategy"
                    label="节点选择策略"
                    :options="proxySelectionStrategyOptions"
                  />
                  <BaseSwitch v-model="platformCapabilities.proxyPoolConfig.autoAssignEnabled" label="允许自动分配" hint="当前先只存策略，不会立刻改写现有绑定。后续扩展自动调度时会复用这个开关。" recommend="off" />
                </div>

                <div class="flex justify-end">
                  <BaseButton
                    variant="primary"
                    size="sm"
                    :loading="platformCapabilitiesSaving"
                    @click="savePlatformCapabilities"
                  >
                    保存系统级能力配置
                  </BaseButton>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="glass-text-main text-sm font-semibold">
                    代理池管理
                  </div>
                  <BaseButton
                    size="sm"
                    variant="secondary"
                    :loading="proxyPoolLoading || proxyPoolMutatingKey === 'health'"
                    @click="runProxyHealthCheck()"
                  >
                    <div class="i-carbon-network-4 mr-1" /> 全量体检
                  </BaseButton>
                </div>

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model="proxyPoolCreateDraft.proxyUrl"
                    label="新增单个代理"
                    type="text"
                    placeholder="socks5://user:pass@127.0.0.1:1080"
                  />
                  <BaseInput
                    v-model.number="proxyPoolCreateDraft.maxUsers"
                    label="单节点最大账号数"
                    type="number"
                    min="1"
                  />
                  <BaseInput
                    v-model="proxyPoolCreateDraft.note"
                    label="节点备注"
                    type="text"
                    placeholder="例如：香港出口 / 备用"
                  />
                  <BaseSelect
                    v-model="proxyPoolImportDraft.mode"
                    label="批量导入模式"
                    :options="proxyImportModeOptions"
                  />
                </div>

                <div class="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
                  <label class="block">
                    <span class="glass-text-main mb-2 block text-sm font-medium">批量导入代理</span>
                    <textarea
                      v-model="proxyPoolImportDraft.text"
                      rows="5"
                      class="glass-text-main min-h-[120px] w-full border border-white/10 rounded-lg bg-black/20 px-3 py-2 text-sm outline-none transition focus:border-white/30"
                      placeholder="每行一个 socks5 地址，例如：&#10;socks5://user:pass@1.2.3.4:1080&#10;socks5://5.6.7.8:1080"
                    />
                  </label>
                  <div class="flex flex-wrap gap-2 xl:flex-col xl:items-stretch">
                    <BaseButton
                      variant="primary"
                      size="sm"
                      :loading="proxyPoolMutatingKey === 'create'"
                      @click="createProxyPoolRecord"
                    >
                      新增代理
                    </BaseButton>
                    <BaseButton
                      variant="secondary"
                      size="sm"
                      :loading="proxyPoolMutatingKey === 'import'"
                      @click="importProxyPoolRecords"
                    >
                      批量导入
                    </BaseButton>
                  </div>
                </div>

                <div class="settings-system-warning-alert flex items-start gap-2 rounded-md p-3 text-sm">
                  <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-base" />
                  <p>代理池当前只负责录入、体检和账号手动绑定，默认不会自动改写现有直连链路。建议先小规模绑定测试，再逐步放量。</p>
                </div>
              </div>

              <div class="border border-white/10 rounded-lg bg-black/10 p-3 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="glass-text-main text-sm font-semibold">
                    代理节点列表
                  </div>
                  <BaseButton
                    size="sm"
                    variant="secondary"
                    :loading="proxyPoolLoading"
                    @click="loadProxyPoolRecords(true)"
                  >
                    <div class="i-carbon-renew mr-1" /> 刷新
                  </BaseButton>
                </div>

                <div v-if="proxyPoolRecords.length" class="space-y-3">
                  <div
                    v-for="record in proxyPoolRecords"
                    :key="record.id"
                    class="border border-white/10 rounded-lg bg-black/10 p-3"
                  >
                    <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div class="space-y-1">
                        <div class="glass-text-main break-all text-sm font-semibold">
                          {{ record.maskedProxyUrl }}
                        </div>
                        <div class="glass-text-muted text-xs">
                          {{ record.protocol.toUpperCase() }} · 账号上限 {{ record.maxUsers }} · 平均延迟 {{ record.avgLatencyMs || 0 }}ms
                        </div>
                        <div class="glass-text-muted text-xs">
                          状态：{{ record.status || 'unknown' }} · 成功 {{ record.successCount || 0 }} / 失败 {{ record.failCount || 0 }}
                        </div>
                        <div class="glass-text-muted text-xs">
                          最近体检：{{ record.lastCheckedAt ? formatTimestamp(record.lastCheckedAt) : '未执行' }}
                          <span v-if="record.cooldownUntil">
                            · 冷却至 {{ formatTimestamp(record.cooldownUntil) }}
                          </span>
                        </div>
                        <div v-if="record.note" class="glass-text-muted text-xs">
                          备注：{{ record.note }}
                        </div>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <BaseButton
                          size="sm"
                          variant="outline"
                          :loading="proxyPoolMutatingKey === `health:${record.id}`"
                          @click="runProxyHealthCheck(record.id)"
                        >
                          体检
                        </BaseButton>
                        <BaseButton
                          size="sm"
                          variant="outline"
                          :loading="proxyPoolMutatingKey === `remove:${record.id}`"
                          @click="removeProxyPoolRecord(record)"
                        >
                          删除
                        </BaseButton>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="settings-health-card rounded-xl p-4">
                  <div class="settings-health-card-value text-sm font-medium">
                    暂无代理节点
                  </div>
                  <div class="settings-health-card-note mt-2 text-xs">
                    可先录入单个 SOCKS5 节点，或把多条地址粘贴到批量导入框。账号侧的“代理绑定”会直接复用这里的节点列表。
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-card-footer settings-sticky-save ui-mobile-action-panel mt-auto flex justify-end px-4 py-3">
            <BaseButton
              variant="primary"
              size="sm"
              :loading="thirdPartyApiSaving"
              class="settings-footer-button"
              @click="saveThirdPartyApiConfig"
            >
              保存第三方 API 设置
            </BaseButton>
          </div>
        </div>

        <div v-if="showSettingsCategoryEmptyState" class="settings-category-empty card glass-panel rounded-lg px-6 py-10 text-center">
          <div class="settings-category-empty-icon mx-auto mb-3 h-12 w-12 flex items-center justify-center rounded-full">
            <div class="i-carbon-lock text-xl" />
          </div>
          <p class="settings-category-empty-title text-base font-semibold">
            该分类暂无可操作内容
          </p>
          <p class="settings-category-empty-copy mt-2 text-sm">
            {{ settingsCategoryEmptyHint }}
          </p>
        </div>
      </div>

      <!-- Card 4: 系统主题与背景（仅管理员可见） -->
      <div
        v-if="!loading && isAdmin"
        v-show="isSettingsCategoryVisible(['common', 'advanced']) && advancedPanelsVisible && isAdvancedDetailSectionVisible(['theme'])"
        id="settings-advanced-theme"
        class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2"
      >
        <div class="settings-card-divider px-4 py-3">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-paint-brush" />
            系统外观与自定义背景
          </h3>
        </div>

        <div class="p-4 space-y-5">
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div class="border border-white/10 rounded-lg bg-black/10 p-3">
              <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                当前主题
              </div>
              <div class="glass-text-main mt-1 text-sm font-semibold">
                {{ currentThemeOption.name }}
              </div>
            </div>
            <div class="border border-white/10 rounded-lg bg-black/10 p-3">
              <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                背景范围
              </div>
              <div class="glass-text-main mt-1 text-sm font-semibold">
                {{ currentBackgroundScopeOption?.label || '未配置' }}
              </div>
            </div>
            <div class="border border-white/10 rounded-lg bg-black/10 p-3">
              <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                主题联动
              </div>
              <div class="glass-text-main mt-1 text-sm font-semibold">
                {{ appStore.themeBackgroundLinked ? '已开启' : '手动模式' }}
              </div>
            </div>
            <div class="border border-white/10 rounded-lg bg-black/10 p-3">
              <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                视觉预设
              </div>
              <div class="glass-text-main mt-1 text-sm font-semibold">
                {{ currentWorkspaceVisualSummary.name }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div class="space-y-4">
              <BaseInput
                v-model="appStore.loginBackground"
                label="登录页背景图片 URL"
                placeholder="请输入图片链接 (如: https://example.com/bg.jpg)"
              />

              <div class="settings-theme-highlight rounded-2xl p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="glass-text-main text-sm font-bold">
                      当前主题联动
                    </div>
                    <p class="glass-text-muted mt-1 text-xs leading-5">
                      当前主题为「{{ currentThemeOption.name }}」，可一键套用对应的专属背景预设。
                    </p>
                  </div>
                  <BaseButton
                    variant="primary"
                    size="sm"
                    @click="applyCurrentThemeBackgroundPreset"
                  >
                    套用 {{ currentThemeBackgroundPreset.title }}
                  </BaseButton>
                </div>
              </div>

              <div class="settings-theme-surface rounded-2xl p-4">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="glass-text-main text-sm font-bold">
                      主题锁定背景
                    </div>
                    <p class="glass-text-muted mt-1 text-xs leading-5">
                      开启后，只要切换这 5 套主题，就会自动同步对应的内置背景、遮罩和模糊参数。
                    </p>
                  </div>
                  <BaseSwitch
                    :model-value="appStore.themeBackgroundLinked"
                    @update:model-value="toggleThemeBackgroundLinked(!!$event)"
                  />
                </div>
                <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span
                    class="settings-theme-chip px-3 py-1 text-[11px] font-bold"
                    :class="appStore.themeBackgroundLinked
                      ? 'ui-meta-chip--brand'
                      : 'ui-meta-chip--neutral'"
                  >
                    {{ appStore.themeBackgroundLinked ? '已开启自动联动' : '当前为手动搭配模式' }}
                  </span>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    @click="applyThemeBundle(appStore.colorTheme)"
                  >
                    立即按当前主题对齐
                  </BaseButton>
                </div>
              </div>

              <div class="settings-theme-surface rounded-2xl p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="glass-text-main text-sm font-bold">
                      5 套主题联动方案
                    </div>
                    <p class="glass-text-muted mt-1 text-xs leading-5">
                      每套方案都会同步主题色、背景图、登录页参数、主界面参数和业务页卡片风格，并默认启用“登录页 + 主界面”。
                    </p>
                  </div>
                  <div class="settings-theme-chip ui-meta-chip--brand px-3 py-1 text-[11px]">
                    一键套用整套皮肤
                  </div>
                </div>

                <div class="grid grid-cols-[repeat(auto-fit,minmax(11.5rem,1fr))] mt-4 gap-4">
                  <button
                    v-for="bundle in themePresetBundles"
                    :key="bundle.theme.key"
                    type="button"
                    class="settings-theme-bundle-card settings-theme-surface group overflow-hidden rounded-2xl text-left transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                    :class="isThemeBundleApplied(bundle.theme.key) ? 'settings-theme-surface-active' : ''"
                    @click="applyThemeBundle(bundle.theme.key)"
                  >
                    <div
                      class="settings-theme-bundle-cover relative h-28 overflow-hidden"
                      :style="{
                        backgroundImage: `url(${bundle.preset.url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }"
                    >
                      <div
                        class="absolute inset-0"
                        :style="{
                          backgroundColor: `color-mix(in srgb, var(--ui-overlay-backdrop) ${bundle.preset.overlayOpacity}%, transparent)`,
                          backdropFilter: `blur(${bundle.preset.blur}px)`,
                          WebkitBackdropFilter: `blur(${bundle.preset.blur}px)`,
                        }"
                      />
                      <div class="absolute left-3 top-3 flex items-center gap-2">
                        <span
                          class="h-2.5 w-2.5 rounded-full"
                          :style="{
                            backgroundColor: bundle.theme.color,
                            boxShadow: `0 0 0 4px ${bundle.theme.color}22`,
                          }"
                        />
                        <BaseBadge as="div" surface="glass-dark" class="settings-theme-bundle-badge rounded-full px-2.5 py-1 text-[10px]">
                          {{ bundle.theme.name }}
                        </BaseBadge>
                      </div>
                      <BaseBadge as="div" surface="glass-dark" class="settings-theme-bundle-badge absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px]">
                        {{ bundle.preset.title }}
                      </BaseBadge>
                    </div>

                    <div class="settings-theme-bundle-body p-3 space-y-2">
                      <div class="settings-theme-bundle-head flex items-start justify-between gap-3">
                        <span class="settings-theme-bundle-title glass-text-main text-sm font-semibold">{{ bundle.preset.title }}</span>
                        <span
                          class="settings-theme-bundle-action settings-theme-chip px-2 py-0.5 text-[10px] font-bold"
                          :class="isThemeBundleApplied(bundle.theme.key)
                            ? 'ui-meta-chip--brand'
                            : 'ui-meta-chip--neutral'"
                        >
                          {{ isThemeBundleApplied(bundle.theme.key) ? '当前整套' : '点击套用' }}
                        </span>
                      </div>
                      <p class="settings-theme-bundle-desc glass-text-muted text-xs leading-5">
                        {{ bundle.preset.description }}
                      </p>
                      <div class="settings-theme-bundle-metrics glass-text-muted flex items-center justify-between text-[11px]">
                        <span>登录 {{ bundle.preset.overlayOpacity }}% / {{ bundle.preset.blur }}px</span>
                        <span>主界面 {{ bundle.preset.appOverlayOpacity }}% / {{ bundle.preset.appBlur }}px</span>
                      </div>
                      <div class="settings-theme-bundle-foot glass-text-muted text-[11px]">
                        业务页风格 {{ bundle.workspacePreset.name }}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div class="settings-theme-surface rounded-2xl p-4">
                <div class="glass-text-main text-sm font-medium">
                  背景作用范围
                </div>
                <div class="grid grid-cols-1 mt-3 gap-3 md:grid-cols-3">
                  <button
                    v-for="option in UI_BACKGROUND_SCOPE_OPTIONS"
                    :key="option.value"
                    type="button"
                    class="settings-theme-scope-card rounded-2xl px-3 py-3 text-left transition-all"
                    :class="appStore.backgroundScope === option.value
                      ? 'settings-theme-scope-card-active'
                      : 'settings-theme-scope-card-inactive'"
                    @click="appStore.backgroundScope = option.value"
                  >
                    <div class="glass-text-main text-sm font-semibold">
                      {{ option.label }}
                    </div>
                    <p class="glass-text-muted mt-1 text-[11px] leading-5">
                      {{ option.description }}
                    </p>
                  </button>
                </div>
              </div>

              <div class="settings-theme-surface rounded-2xl p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="glass-text-main text-sm font-bold">
                      主界面视觉预设
                    </div>
                    <p class="glass-text-muted mt-1 text-xs leading-5">
                      {{ currentWorkspaceVisualSummary.description }}
                    </p>
                  </div>
                  <div class="settings-theme-chip ui-meta-chip--brand px-3 py-1 text-[11px]">
                    {{ currentWorkspaceVisualSummary.badge }}
                  </div>
                </div>

                <div class="grid grid-cols-1 mt-4 gap-4 md:grid-cols-3">
                  <button
                    v-for="preset in workspaceVisualPresets"
                    :key="preset.key"
                    type="button"
                    class="settings-theme-visual-card group overflow-hidden rounded-2xl p-3 text-left transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
                    :class="isWorkspaceVisualPresetApplied(preset.key) ? 'settings-theme-surface-active' : ''"
                    @click="applyWorkspaceVisualPreset(preset.key)"
                  >
                    <div
                      class="settings-theme-visual-preview relative h-24 overflow-hidden rounded-2xl p-3"
                      :style="{ background: 'radial-gradient(circle at top, color-mix(in srgb, var(--ui-text-on-brand) 14%, transparent), transparent 58%), linear-gradient(180deg, color-mix(in srgb, var(--ui-text-on-brand) 8%, transparent), color-mix(in srgb, var(--ui-bg-canvas) 22%, transparent))' }"
                    >
                      <div class="settings-theme-visual-overlay absolute inset-0" />
                      <div class="relative z-10 h-full flex gap-3">
                        <div class="w-12 border rounded-xl p-2" :style="getWorkspacePreviewCardStyle(preset.key)">
                          <div class="settings-theme-visual-bar-strong h-2.5 w-5 rounded" />
                          <div class="settings-theme-visual-bar-mid mt-2 h-1.5 rounded" />
                          <div class="settings-theme-visual-bar-faint mt-1.5 h-1.5 rounded" />
                        </div>
                        <div class="flex flex-1 flex-col gap-2">
                          <div class="border rounded-xl px-3 py-2" :style="getWorkspacePreviewCardStyle(preset.key)">
                            <div class="settings-theme-visual-bar-strong h-2.5 w-16 rounded" />
                          </div>
                          <div class="grid grid-cols-2 flex-1 gap-2">
                            <div class="border rounded-xl" :style="getWorkspacePreviewCardStyle(preset.key)" />
                            <div class="border rounded-xl" :style="getWorkspacePreviewCardStyle(preset.key)" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="mt-3 flex items-center justify-between gap-3">
                      <div class="glass-text-main text-sm font-semibold">
                        {{ preset.name }}
                      </div>
                      <span
                        class="settings-theme-chip px-2.5 py-0.5 text-[10px] font-bold"
                        :class="isWorkspaceVisualPresetApplied(preset.key)
                          ? 'ui-meta-chip--brand'
                          : 'ui-meta-chip--neutral'"
                      >
                        {{ isWorkspaceVisualPresetApplied(preset.key) ? '当前方案' : preset.badge }}
                      </span>
                    </div>
                    <p class="glass-text-muted mt-2 text-xs leading-5">
                      {{ preset.description }}
                    </p>
                    <div class="glass-text-muted mt-3 flex items-center justify-between text-[11px]">
                      <span>遮罩 {{ preset.appOverlayOpacity }}%</span>
                      <span>模糊 {{ preset.appBlur }}px</span>
                    </div>
                  </button>
                </div>
              </div>

              <input
                ref="backgroundFileInput"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="hidden"
                @change="handleBackgroundFileChange"
              >

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="settings-theme-range-card rounded-2xl p-4">
                  <div class="flex items-center justify-between gap-3">
                    <span class="glass-text-main text-sm font-medium">登录页遮罩强度</span>
                    <span class="settings-theme-chip ui-meta-chip--brand px-2.5 py-1 text-[11px]">
                      {{ appStore.loginBackgroundOverlayOpacity }}%
                    </span>
                  </div>
                  <input
                    v-model.number="appStore.loginBackgroundOverlayOpacity"
                    type="range"
                    min="0"
                    max="80"
                    step="1"
                    class="mt-4 w-full cursor-pointer accent-primary-500"
                  >
                  <p class="glass-text-muted mt-2 text-[11px] leading-5">
                    数值越高，图片越暗，登录卡片和标题文字更容易稳住。
                  </p>
                </div>

                <div class="settings-theme-range-card rounded-2xl p-4">
                  <div class="flex items-center justify-between gap-3">
                    <span class="glass-text-main text-sm font-medium">登录页模糊度</span>
                    <span class="settings-theme-chip ui-meta-chip--brand px-2.5 py-1 text-[11px]">
                      {{ appStore.loginBackgroundBlur }}px
                    </span>
                  </div>
                  <input
                    v-model.number="appStore.loginBackgroundBlur"
                    type="range"
                    min="0"
                    max="12"
                    step="1"
                    class="mt-4 w-full cursor-pointer accent-primary-500"
                  >
                  <p class="glass-text-muted mt-2 text-[11px] leading-5">
                    轻微模糊可以削弱杂乱背景，避免图片主体抢走登录焦点。
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div class="settings-theme-range-card rounded-2xl p-4">
                  <div class="flex items-center justify-between gap-3">
                    <span class="glass-text-main text-sm font-medium">主界面遮罩强度</span>
                    <span class="settings-theme-chip ui-meta-chip--brand px-2.5 py-1 text-[11px]">
                      {{ appStore.appBackgroundOverlayOpacity }}%
                    </span>
                  </div>
                  <input
                    v-model.number="appStore.appBackgroundOverlayOpacity"
                    type="range"
                    min="20"
                    max="90"
                    step="1"
                    class="mt-4 w-full cursor-pointer accent-primary-500"
                  >
                  <p class="glass-text-muted mt-2 text-[11px] leading-5">
                    业务页推荐更重一点，让日志、表格、卡片始终保持高可读性。
                  </p>
                </div>

                <div class="settings-theme-range-card rounded-2xl p-4">
                  <div class="flex items-center justify-between gap-3">
                    <span class="glass-text-main text-sm font-medium">主界面模糊度</span>
                    <span class="settings-theme-chip ui-meta-chip--brand px-2.5 py-1 text-[11px]">
                      {{ appStore.appBackgroundBlur }}px
                    </span>
                  </div>
                  <input
                    v-model.number="appStore.appBackgroundBlur"
                    type="range"
                    min="0"
                    max="18"
                    step="1"
                    class="mt-4 w-full cursor-pointer accent-primary-500"
                  >
                  <p class="glass-text-muted mt-2 text-[11px] leading-5">
                    主界面模糊通常比登录页更高，这样背景存在感还在，但不会干扰操作。
                  </p>
                </div>
              </div>
            </div>

            <div class="settings-theme-side-panel flex flex-col gap-3">
              <div class="grid grid-cols-2 gap-3">
                <div class="border border-white/10 rounded-2xl bg-black/10 p-3">
                  <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                    登录页参数
                  </div>
                  <div class="glass-text-main mt-1 text-sm font-semibold">
                    {{ appStore.loginBackgroundOverlayOpacity }}% / {{ appStore.loginBackgroundBlur }}px
                  </div>
                </div>
                <div class="border border-white/10 rounded-2xl bg-black/10 p-3">
                  <div class="glass-text-muted text-[11px] tracking-widest uppercase">
                    主界面参数
                  </div>
                  <div class="glass-text-main mt-1 text-sm font-semibold">
                    {{ appStore.backgroundScope === 'login_only' ? '未启用' : `${appStore.appBackgroundOverlayOpacity}% / ${appStore.appBackgroundBlur}px` }}
                  </div>
                </div>
              </div>

              <div class="settings-theme-action-panel rounded-2xl p-4">
                <div class="flex flex-wrap items-center gap-3">
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :loading="backgroundUploading"
                    @click="triggerBackgroundUpload"
                  >
                    本地上传背景图
                  </BaseButton>
                  <BaseButton
                    variant="primary"
                    size="sm"
                    :loading="backgroundSaving"
                    @click="saveLoginAppearance"
                  >
                    保存主题与背景
                  </BaseButton>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    :disabled="backgroundSaving || backgroundUploading"
                    @click="restoreDefaultLoginAppearance"
                  >
                    恢复默认
                  </BaseButton>
                </div>
                <p class="glass-text-muted mt-3 text-xs leading-5">
                  支持 JPG / PNG / WebP。本地上传会先在浏览器压缩，再保存到服务端静态目录，避免把图片直接塞进配置里。
                </p>
              </div>

              <div class="flex items-center justify-between gap-3">
                <span class="glass-text-muted text-xs font-medium">预览 (效果参考)</span>
                <button
                  type="button"
                  class="settings-preview-trigger glass-text-main rounded-full px-3 py-1 text-[11px] transition-all"
                  @click="openLoginPreview"
                >
                  打开全屏预览
                </button>
              </div>

              <button
                type="button"
                class="settings-preview-card group relative h-40 w-full overflow-hidden rounded-2xl text-left shadow-sm transition-all duration-300 hover:shadow-lg"
                :style="loginPreviewBackgroundStyle"
                @click="openLoginPreview"
              >
                <div v-if="loginPreviewUsesCustomBackground" class="absolute inset-0" :style="loginPreviewMaskStyle" />
                <div class="settings-preview-login-sheen absolute inset-0 opacity-80" />
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="settings-preview-glass glass-text-main rounded-xl px-4 py-2 text-xs font-medium shadow-lg transition-transform duration-300 group-hover:scale-105">
                    玻璃拟态预览
                  </div>
                </div>
                <div class="settings-preview-chip ui-glass-chip absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[10px]">
                  遮罩 {{ appStore.loginBackgroundOverlayOpacity }}%
                </div>
                <div class="settings-preview-chip ui-glass-chip absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px]">
                  模糊 {{ appStore.loginBackgroundBlur }}px
                </div>
              </button>

              <div
                class="settings-preview-card relative h-36 overflow-hidden rounded-2xl"
                :style="loginPreviewBackgroundStyle"
              >
                <div v-if="loginPreviewUsesCustomBackground" class="absolute inset-0" :style="appScenePreviewMaskStyle" />
                <div class="settings-preview-overlay-soft absolute inset-0" />
                <div class="settings-preview-chip ui-glass-chip absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px]">
                  主界面氛围预览
                </div>
                <div class="absolute inset-0 flex gap-3 p-4">
                  <div class="settings-preview-sidebar w-20 rounded-2xl p-3">
                    <div class="settings-preview-block-strong mb-3 h-6 w-6 rounded-lg" />
                    <div class="space-y-2">
                      <div class="settings-preview-block-mid h-2 rounded" />
                      <div class="settings-preview-block-faint h-2 rounded" />
                      <div class="settings-preview-block-faint h-2 rounded" />
                    </div>
                  </div>
                  <div class="flex flex-1 flex-col gap-3">
                    <div class="settings-preview-panel rounded-2xl p-3">
                      <div class="settings-preview-block-strong h-3 w-36 rounded" />
                    </div>
                    <div class="grid grid-cols-2 flex-1 gap-3">
                      <div class="settings-preview-panel rounded-2xl p-3" />
                      <div class="settings-preview-panel rounded-2xl p-3" />
                    </div>
                  </div>
                </div>
                <div class="settings-preview-chip ui-glass-chip absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px]">
                  {{ appStore.backgroundScope === 'login_only' ? '当前未对主界面启用' : `遮罩 ${appStore.appBackgroundOverlayOpacity}% / 模糊 ${appStore.appBackgroundBlur}px` }}
                </div>
              </div>

              <p v-if="loginPreviewLoading" class="settings-theme-preview-note settings-theme-preview-note-warning text-xs">
                正在验证图片链接，加载完成后会自动应用到预览。
              </p>
              <p v-else-if="loginPreviewLoadFailed" class="settings-theme-preview-note settings-theme-preview-note-danger text-xs">
                当前图片链接加载失败，预览已回退到默认渐变。建议使用可直接访问的 JPG / PNG / WebP 地址。
              </p>
              <p v-else class="glass-text-muted text-xs">
                缩略图和全屏弹窗都会按登录页的玻璃拟态结构渲染，便于判断背景是否压字。
              </p>
            </div>
          </div>

          <div class="settings-card-footer pt-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="glass-text-main text-sm font-bold">
                  背景预设图库
                </div>
                <p class="glass-text-muted mt-1 text-xs">
                  点击预设会先套用到当前表单，确认效果后再点“应用背景设置”。
                </p>
              </div>
              <div class="glass-text-muted text-[11px]">
                当前参数：遮罩 {{ appStore.loginBackgroundOverlayOpacity }}% / 模糊 {{ appStore.loginBackgroundBlur }}px
              </div>
            </div>

            <div class="grid grid-cols-1 mt-4 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <button
                v-for="preset in orderedLoginBackgroundPresets"
                :key="preset.key"
                type="button"
                class="settings-theme-gallery-card group overflow-hidden rounded-2xl text-left transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
                :class="isSelectedLoginBackgroundPreset(preset) ? 'settings-theme-surface-active' : ''"
                @click="applyBackgroundPreset(preset)"
              >
                <div
                  class="relative h-32 overflow-hidden"
                  :style="preset.url
                    ? { backgroundImage: `url(${preset.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: 'linear-gradient(135deg, color-mix(in srgb, var(--ui-brand-100) 72%, var(--ui-bg-surface) 28%) 0%, color-mix(in srgb, var(--ui-brand-200) 58%, var(--ui-bg-surface) 42%) 100%)' }"
                >
                  <div
                    v-if="preset.url"
                    class="absolute inset-0"
                    :style="{
                      backgroundColor: `color-mix(in srgb, var(--ui-overlay-backdrop) ${preset.overlayOpacity}%, transparent)`,
                      backdropFilter: `blur(${preset.blur}px)`,
                      WebkitBackdropFilter: `blur(${preset.blur}px)`,
                    }"
                  />
                  <BaseBadge as="div" surface="glass-dark" class="settings-theme-bundle-badge absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px]">
                    {{ preset.themeKey === appStore.colorTheme ? '当前主题推荐' : (preset.badge || '预设') }}
                  </BaseBadge>
                  <BaseBadge as="div" surface="glass-dark" class="settings-theme-bundle-badge absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[10px]">
                    {{ preset.overlayOpacity }}% / {{ preset.blur }}px
                  </BaseBadge>
                </div>

                <div class="p-3 space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="glass-text-main text-sm font-semibold">{{ preset.title }}</span>
                    <span
                      v-if="isSelectedLoginBackgroundPreset(preset)"
                      class="settings-theme-chip ui-meta-chip--brand px-2 py-0.5 text-[10px]"
                    >
                      当前
                    </span>
                  </div>
                  <div v-if="preset.themeKey" class="glass-text-muted text-[11px]">
                    对应主题：{{ getThemeOption(preset.themeKey).name }}
                  </div>
                  <p class="glass-text-muted text-xs leading-5">
                    {{ preset.description }}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      <Teleport to="body">
        <div v-if="loginPreviewVisible" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            class="settings-preview-overlay absolute inset-0 backdrop-blur-md"
            @click="loginPreviewVisible = false"
          />

          <div class="settings-preview-modal relative z-10 max-h-[90vh] max-w-6xl w-full overflow-hidden rounded-[28px] shadow-2xl">
            <div
              class="relative min-h-[78vh] overflow-hidden"
              :style="loginPreviewBackgroundStyle"
            >
              <div v-if="loginPreviewUsesCustomBackground" class="absolute inset-0" :style="loginPreviewMaskStyle" />
              <div v-else class="settings-preview-modal-sheen absolute inset-0" />

              <div class="settings-preview-chip ui-glass-chip absolute left-5 top-5 z-20 rounded-full px-4 py-1.5 text-xs">
                登录页玻璃拟态预览
              </div>
              <div class="settings-preview-chip ui-glass-chip absolute left-5 top-16 z-20 rounded-full px-4 py-1.5 text-xs">
                遮罩 {{ appStore.loginBackgroundOverlayOpacity }}% · 模糊 {{ appStore.loginBackgroundBlur }}px
              </div>

              <button
                type="button"
                class="settings-preview-close absolute right-5 top-5 z-20 h-10 w-10 flex items-center justify-center rounded-full transition-colors"
                @click="loginPreviewVisible = false"
              >
                <div class="i-carbon-close text-lg" />
              </button>

              <div class="relative z-10 min-h-[78vh] flex items-center justify-center px-5 py-12 lg:px-10">
                <div class="grid max-w-5xl w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div class="settings-preview-brand-panel hidden rounded-[28px] p-8 shadow-2xl lg:flex lg:flex-col lg:justify-between">
                    <div>
                      <div class="settings-preview-brand-icon mb-6 h-16 w-16 flex items-center justify-center rounded-3xl shadow-xl">
                        <div class="i-carbon-sprout text-3xl" />
                      </div>
                      <h3 class="text-3xl font-black tracking-tight">
                        御农·QQ 农场智能助手
                      </h3>
                      <p class="settings-preview-brand-copy mt-3 max-w-md text-sm leading-6">
                        这里模拟的是登录页左侧品牌区和右侧表单卡片的叠层效果，主要用来判断背景图是否会干扰按钮、标题和输入区可读性。
                      </p>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                      <div class="settings-preview-brand-card rounded-2xl p-4">
                        <div class="i-carbon-flash mb-2 text-xl" />
                        <div class="text-sm font-semibold">
                          极速自动化
                        </div>
                      </div>
                      <div class="settings-preview-brand-card rounded-2xl p-4">
                        <div class="i-carbon-security mb-2 text-xl" />
                        <div class="text-sm font-semibold">
                          安全隔离
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="settings-preview-form-panel rounded-[28px] p-5 shadow-2xl lg:p-8">
                    <div class="mx-auto max-w-md">
                      <div class="settings-preview-form-header mb-6 flex items-center gap-3">
                        <div class="settings-preview-form-icon h-11 w-11 flex items-center justify-center rounded-2xl shadow-lg">
                          <div class="i-carbon-sprout text-xl" />
                        </div>
                        <div>
                          <div class="text-lg font-bold">
                            欢迎回来
                          </div>
                          <div class="settings-preview-form-copy text-xs">
                            预览背景图在真实登录页中的玻璃卡片表现
                          </div>
                        </div>
                      </div>

                      <div class="space-y-4">
                        <div class="settings-preview-input rounded-2xl px-4 py-3 text-sm">
                          用户名 / 账号
                        </div>
                        <div class="settings-preview-input rounded-2xl px-4 py-3 text-sm">
                          密码
                        </div>
                        <div class="settings-preview-submit rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-lg">
                          登录按钮预览
                        </div>
                        <div class="settings-preview-form-grid grid grid-cols-2 gap-3 text-center text-xs">
                          <BaseBadge as="div" surface="glass-soft" class="settings-preview-form-chip rounded-2xl px-4 py-3">
                            自动化
                          </BaseBadge>
                          <BaseBadge as="div" surface="glass-soft" class="settings-preview-form-chip rounded-2xl px-4 py-3">
                            多账号
                          </BaseBadge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                v-if="loginPreviewLoadFailed"
                class="settings-preview-fail absolute bottom-5 left-5 right-5 z-20 rounded-2xl px-4 py-3 text-sm"
              >
                当前图片链接无法直接加载，预览已自动回退为默认渐变背景。正式保存前建议先换成可直链图片。
              </div>
            </div>
          </div>
        </div>

        <div v-if="reportDetailVisible && reportDetailItem" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            class="settings-report-detail-overlay absolute inset-0 backdrop-blur-sm"
            @click="closeReportLogDetail"
          />
          <div class="settings-report-detail-modal glass-panel relative z-10 max-h-[85vh] max-w-3xl w-full overflow-hidden border rounded-2xl shadow-2xl">
            <div class="settings-report-detail-header flex items-center justify-between px-6 py-4">
              <div class="min-w-0">
                <h3 class="settings-report-detail-title truncate text-base font-bold">
                  {{ reportDetailItem.title || '经营汇报详情' }}
                </h3>
                <div class="settings-report-detail-meta mt-1 text-xs">
                  {{ formatReportMode(reportDetailItem.mode) }} · {{ formatReportLogTime(reportDetailItem.createdAt) }} · {{ reportDetailItem.channel || 'unknown' }}
                </div>
              </div>
              <button
                class="settings-report-detail-close rounded-full p-2 transition-colors"
                @click="closeReportLogDetail"
              >
                <div class="i-carbon-close text-xl" />
              </button>
            </div>

            <div class="max-h-[calc(85vh-8rem)] overflow-auto px-6 py-5 space-y-4">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="settings-result-badge rounded-full px-2.5 py-1 text-[11px] font-bold"
                  :class="reportDetailItem.ok ? 'ui-meta-chip--success' : 'ui-meta-chip--danger'"
                >
                  {{ reportDetailItem.ok ? '发送成功' : '发送失败' }}
                </span>
                <span class="settings-report-detail-chip ui-meta-chip--neutral rounded-full px-2.5 py-1 text-[11px]">
                  账号：{{ reportDetailItem.accountName || reportDetailItem.accountId || '-' }}
                </span>
                <span class="settings-report-detail-chip ui-meta-chip--neutral rounded-full px-2.5 py-1 text-[11px]">
                  ID：{{ reportDetailItem.accountId || '-' }}
                </span>
              </div>

              <div v-if="reportDetailItem.errorMessage" class="settings-health-alert rounded-xl px-4 py-3 text-sm">
                失败原因：{{ reportDetailItem.errorMessage }}
              </div>

              <div class="settings-report-detail-body rounded-xl px-4 py-4">
                <div class="settings-report-detail-body-label mb-2 text-xs font-bold tracking-widest uppercase">
                  完整正文
                </div>
                <div class="settings-report-detail-body-content whitespace-pre-line break-words text-sm leading-6">
                  {{ reportDetailItem.content || '无正文' }}
                </div>
              </div>
            </div>

            <div class="settings-report-detail-footer flex justify-end px-6 py-4">
              <BaseButton
                variant="secondary"
                size="sm"
                @click="closeReportLogDetail"
              >
                关闭
              </BaseButton>
            </div>
          </div>
        </div>
      </Teleport>

      <div
        v-if="currentAccountId && hasUnsavedAccountSettings && isSettingsCategoryVisible(['common', 'plant', 'auto', 'security'])"
        class="settings-account-save-dock hidden lg:flex"
      >
        <div class="min-w-0 flex-1">
          <p class="settings-account-save-dock-title">
            当前账号有 {{ accountSettingsDirtyCount }} 项设置未保存
          </p>
          <p class="settings-account-save-dock-copy">
            巡查时间、静默时段、策略和自动控制都属于账号级设置；右侧“仅保存全局下线提醒”不会保存这些改动。
          </p>
        </div>
        <BaseButton
          variant="primary"
          size="sm"
          :loading="saving"
          class="shrink-0"
          @click="saveAccountSettings"
        >
          保存当前账号设置
        </BaseButton>
      </div>

      <ConfirmModal
        :show="modalVisible"
        :title="modalConfig.title"
        :message="modalConfig.message"
        :type="modalConfig.type"
        :is-alert="modalConfig.isAlert"
        confirm-text="知道了"
        @confirm="modalVisible = false"
        @cancel="modalVisible = false"
      />

      <!-- 改动预览 Modal -->
      <ConfirmModal
        :show="diffModalVisible"
        :title="diffModalTitle"
        :confirm-text="diffModalConfirmText"
        cancel-text="再检查下"
        type="primary"
        @confirm="handleDiffModalConfirm"
        @cancel="closeDiffModal"
      >
        <div class="space-y-4">
          <p class="glass-text-muted text-sm">
            检测到以下配置项已变动：
          </p>
          <div class="settings-system-diff-panel max-h-60 overflow-y-auto rounded-xl p-2">
            <div v-for="item in diffItems" :key="item.label" class="settings-system-diff-row flex items-center justify-between p-2 last:border-0">
              <span class="glass-text-muted text-xs font-medium">{{ item.label }}</span>
              <div class="flex items-center gap-2 text-xs">
                <span class="glass-text-muted line-through">{{ item.from }}</span>
                <div class="i-carbon-arrow-right text-primary-500" />
                <span class="text-primary-600 font-bold dark:text-primary-400">{{ item.to }}</span>
              </div>
            </div>
          </div>
          <p class="settings-system-warning-note text-[10px] italic">
            {{ diffModalHint }}
          </p>
        </div>
      </ConfirmModal>

      <ConfirmModal
        :show="shortIntervalRiskModalVisible"
        title="确认高风险时间配置"
        confirm-text="确认仍然保存"
        cancel-text="返回调整"
        type="danger"
        @confirm="handleShortIntervalRiskModalConfirm"
        @cancel="closeShortIntervalRiskModal"
      >
        <div class="text-left space-y-4">
          <p class="glass-text-muted text-sm leading-relaxed">
            检测到以下好友相关巡查时间低于 60 秒，继续保存会显著提高风控概率：
          </p>
          <div class="settings-system-diff-panel max-h-60 overflow-y-auto rounded-xl p-2">
            <div v-for="item in shortIntervalRiskItems" :key="item" class="settings-system-diff-row p-2 text-xs">
              <span class="settings-risk-item">{{ item }}</span>
            </div>
          </div>
          <p class="settings-system-warning-note text-[10px] italic">
            提示：确认后系统会立即应用这些高风险时间配置，请仅在你明确理解风险时继续。
          </p>
        </div>
      </ConfirmModal>

      <ConfirmModal
        :show="qqHighRiskModalVisible"
        title="确认开启 QQ 高风险功能"
        confirm-text="确认仍然保存"
        :confirm-disabled="!qqHighRiskConfirmMatched"
        cancel-text="返回调整"
        type="danger"
        @confirm="handleQqHighRiskModalConfirm"
        @cancel="closeQqHighRiskModal"
      >
        <div class="text-left space-y-4">
          <p class="glass-text-muted text-sm leading-relaxed">
            检测到你正在为 QQ 账号新开启以下高风险自动化功能，继续保存会明显提高腾讯侧风控命中概率。此次保存只会签发 {{ buildNormalizedQqHighRiskWindow(localSettings.qqHighRiskWindow).durationMinutes }} 分钟的临时窗口，到期后后端会自动关闭这些开关：
          </p>
          <div class="settings-system-diff-panel max-h-60 overflow-y-auto rounded-xl p-2">
            <div v-for="item in qqHighRiskModalItems" :key="item.label" class="settings-system-diff-row p-2 text-xs">
              <div class="settings-risk-item">
                {{ item.label }}
              </div>
              <p class="glass-text-muted mt-1 leading-relaxed">
                {{ item.detail }}
              </p>
            </div>
          </div>
          <BaseInput
            v-model="qqHighRiskConfirmText"
            label="确认词"
            type="text"
            :placeholder="QQ_HIGH_RISK_CONFIRM_PHRASE"
            :hint="`请输入“${QQ_HIGH_RISK_CONFIRM_PHRASE}”后才能继续保存。`"
          />
          <p class="settings-system-warning-note text-[10px] italic">
            建议只在临时排查或短时试验时开启；如果你不确定，保持关闭会更稳妥。
            当前状态：{{ qqHighRiskConfirmMatched ? '确认词已匹配，可继续保存。' : '确认词未匹配。' }}
          </p>
        </div>
      </ConfirmModal>
    </div>
  </div>
</template>

<style scoped lang="postcss">
.settings-page {
  color: var(--ui-text-1);
}

.settings-layout {
  position: relative;
}

.settings-primary-category {
  position: sticky;
  top: 0.75rem;
  z-index: 14;
  border: 1px solid color-mix(in srgb, var(--ui-brand-400) 16%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 96%, var(--ui-bg-surface) 4%);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.settings-primary-category-list {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.5rem;
}

.settings-primary-category-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 2.25rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-bg-surface) 88%, transparent);
  color: var(--ui-text-2);
  font-size: 0.78rem;
  font-weight: 600;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.settings-primary-category-item:hover {
  color: var(--ui-text-1);
  border-color: color-mix(in srgb, var(--ui-brand-400) 40%, var(--ui-border-subtle));
  transform: translateY(-1px);
}

.settings-primary-category-item-active {
  color: color-mix(in srgb, var(--ui-brand-500) 78%, var(--ui-text-1));
  border-color: color-mix(in srgb, var(--ui-brand-500) 55%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-brand-100) 66%, var(--ui-bg-surface) 34%);
  box-shadow: 0 10px 22px -16px color-mix(in srgb, var(--ui-brand-500) 58%, transparent);
}

.settings-primary-category-desc {
  margin-top: 0.625rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ui-brand-300) 20%, var(--ui-border-subtle));
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-brand-100) 28%, var(--ui-bg-surface) 72%);
  color: var(--ui-text-2);
  font-size: 0.75rem;
  line-height: 1.55;
}

.settings-category-empty {
  border: 1px dashed color-mix(in srgb, var(--ui-status-warning) 30%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-warning-bg) 78%, var(--ui-bg-surface) 22%);
}

.settings-category-empty-icon {
  border: 1px solid color-mix(in srgb, var(--ui-status-warning) 30%, var(--ui-border-subtle));
  color: color-mix(in srgb, var(--ui-status-warning) 72%, var(--ui-text-1));
  background: color-mix(in srgb, var(--ui-status-warning-bg) 88%, var(--ui-bg-surface) 12%);
}

.settings-category-empty-title {
  color: var(--ui-text-1);
}

.settings-category-empty-copy {
  color: var(--ui-text-2);
}

.settings-strategy-focus {
  border: 1px solid color-mix(in srgb, var(--ui-brand-300) 28%, var(--ui-border-subtle));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-brand-100) 26%, var(--ui-bg-surface)),
    color-mix(in srgb, var(--ui-brand-200) 18%, var(--ui-bg-surface-raised))
  );
}

.settings-strategy-focus-title {
  color: color-mix(in srgb, var(--ui-brand-600) 68%, var(--ui-text-1));
}

.settings-strategy-focus-hint {
  color: var(--ui-text-2);
}

.settings-strategy-focus-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--ui-brand-400) 34%, var(--ui-border-subtle));
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: color-mix(in srgb, var(--ui-brand-600) 58%, var(--ui-text-1));
  font-weight: 600;
  line-height: 1.3;
}

.settings-common-quick {
  border: 1px solid color-mix(in srgb, var(--ui-status-success) 24%, var(--ui-border-subtle));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-status-success-bg) 62%, var(--ui-bg-surface)),
    color-mix(in srgb, var(--ui-brand-100) 16%, var(--ui-bg-surface-raised))
  );
}

.settings-common-quick-title {
  color: color-mix(in srgb, var(--ui-status-success) 74%, var(--ui-text-1));
}

.settings-common-quick-hint {
  color: var(--ui-text-2);
}

.settings-common-quick-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  margin-top: 0.75rem;
}

@media (min-width: 768px) {
  .settings-common-quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.settings-common-quick-card {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 80%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent);
}

.settings-common-quick-label {
  color: var(--ui-text-1);
}

.settings-quiet-hours-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  align-items: center;
}

.settings-quiet-hours-input {
  min-width: 0;
}

.settings-security-quick {
  border: 1px solid color-mix(in srgb, var(--ui-status-warning) 26%, var(--ui-border-subtle));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-status-warning-bg) 58%, var(--ui-bg-surface)),
    color-mix(in srgb, var(--ui-brand-100) 10%, var(--ui-bg-surface-raised))
  );
}

.settings-security-quick-title {
  color: color-mix(in srgb, var(--ui-status-warning) 72%, var(--ui-text-1));
}

.settings-security-quick-copy {
  color: var(--ui-text-2);
}

.settings-security-quick-chip {
  border: 1px solid color-mix(in srgb, var(--ui-status-warning) 26%, var(--ui-border-subtle));
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: color-mix(in srgb, var(--ui-status-warning) 78%, var(--ui-text-1));
  font-weight: 600;
}

.settings-security-quick-card {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 80%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent);
}

.settings-advanced-quick-copy {
  color: var(--ui-text-2);
}

.settings-advanced-quick-card {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 80%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
}

.settings-advanced-quick-label {
  color: var(--ui-text-2);
}

.settings-advanced-quick-value {
  color: var(--ui-text-1);
}

.settings-advanced-quick-note {
  color: var(--ui-text-2);
}

.settings-advanced-quick-actions {
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  padding-top: 0.75rem;
}

.settings-advanced-detail-nav-wrap {
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  padding-top: 0.75rem;
}

.settings-advanced-detail-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.settings-advanced-detail-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 0.625rem;
  background: color-mix(in srgb, var(--ui-bg-surface) 88%, transparent);
  color: var(--ui-text-2);
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.settings-advanced-detail-tab:hover {
  color: var(--ui-text-1);
  border-color: color-mix(in srgb, var(--ui-brand-400) 40%, var(--ui-border-subtle));
}

.settings-advanced-detail-tab-active {
  color: color-mix(in srgb, var(--ui-brand-500) 78%, var(--ui-text-1));
  border-color: color-mix(in srgb, var(--ui-brand-500) 54%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-brand-100) 60%, var(--ui-bg-surface) 40%);
}

.settings-advanced-detail-nav-copy {
  color: var(--ui-text-2);
}

.settings-update-detail-nav-wrap {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 0.875rem;
  background: color-mix(in srgb, var(--ui-bg-surface) 90%, transparent);
  padding: 0.75rem;
}

.settings-update-detail-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.settings-update-detail-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 2rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 0.625rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: var(--ui-text-2);
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.settings-update-detail-tab:hover {
  color: var(--ui-text-1);
  border-color: color-mix(in srgb, var(--ui-status-info) 32%, var(--ui-border-subtle));
}

.settings-update-detail-tab-active {
  color: color-mix(in srgb, var(--ui-status-info) 80%, var(--ui-text-1));
  border-color: color-mix(in srgb, var(--ui-status-info) 54%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info-bg) 78%, var(--ui-bg-surface) 22%);
}

.settings-update-detail-nav-copy {
  color: var(--ui-text-2);
}

.settings-notice-quick {
  border-top: 1px solid var(--ui-border-subtle);
  border-bottom: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-status-info-bg) 58%, var(--ui-bg-surface));
}

.settings-notice-quick-head {
  align-items: flex-start;
}

.settings-notice-quick-title {
  color: color-mix(in srgb, var(--ui-status-info) 74%, var(--ui-text-1));
}

.settings-notice-quick-copy {
  color: var(--ui-text-2);
}

.settings-notice-quick-metric {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 92%, transparent);
}

.settings-notice-quick-metric-label {
  color: var(--ui-text-2);
}

.settings-notice-quick-metric-value {
  color: var(--ui-text-1);
}

.settings-notice-quick-metric-note {
  color: var(--ui-text-2);
}

.settings-notice-quick-chip {
  border: 1px solid color-mix(in srgb, var(--ui-status-info) 24%, var(--ui-border-subtle));
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: color-mix(in srgb, var(--ui-status-info) 78%, var(--ui-text-1));
  font-weight: 600;
}

.settings-notice-quick-card {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 80%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent);
}

.settings-notice-quick-empty {
  border: 1px dashed color-mix(in srgb, var(--ui-status-info) 30%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: var(--ui-text-2);
}

.settings-notice-quick-actions {
  border-top: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  padding-top: 0.75rem;
}

.settings-page :is([class*='text-'][class*='gray-500'], [class*='text-'][class*='gray-400'], .glass-text-muted) {
  color: var(--ui-text-2) !important;
}

.settings-page [class*='text-'][class*='white/90'],
.settings-page [class*='text-'][class*='white/80'],
.settings-page [class*='text-'][class*='white/70'] {
  color: color-mix(in srgb, var(--ui-text-on-brand) 90%, var(--ui-text-1) 10%) !important;
}

.settings-page [class*='border-'][class*='gray-100'],
.settings-page [class*='border-'][class*='gray-200/'],
.settings-page [class*='dark:border-'][class*='gray-700'],
.settings-page [class*='border-'][class*='white/10'],
.settings-page [class*='border-'][class*='white/20'] {
  border-color: var(--ui-border-subtle) !important;
}

.settings-page [class*='bg-'][class*='black/5'],
.settings-page [class*='bg-'][class*='black/25'],
.settings-page [class*='bg-'][class*='white/5'],
.settings-page [class*='bg-'][class*='white/10'],
.settings-page [class*='bg-'][class*='white/80'],
.settings-page [class*='dark:bg-'][class*='gray-900/40'] {
  background-color: color-mix(in srgb, var(--ui-bg-surface) 64%, transparent) !important;
}

.settings-card-divider {
  border-bottom: 1px solid var(--ui-border-subtle);
  background: transparent;
}

.settings-card-divider-top {
  border-top: 1px solid var(--ui-border-subtle);
}

.settings-card-footer {
  border-top: 1px solid var(--ui-border-subtle);
  background: transparent;
}

.settings-primary-toolbar-heading {
  min-width: 0;
}

.settings-primary-toolbar-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.settings-primary-toolbar-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  padding: 0.25rem 0.625rem;
  border-width: 1px;
  border-style: solid;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
}

.settings-primary-actions {
  min-width: 0;
}

.settings-sticky-save-note {
  color: var(--ui-text-2);
  font-size: 0.75rem;
  line-height: 1.5;
}

.settings-footer-button {
  min-width: 0;
}

.settings-account-save-dock {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  z-index: 30;
  width: min(960px, calc(100vw - 2rem));
  align-items: center;
  gap: 1rem;
  padding: 0.875rem 1rem;
  border: 1px solid color-mix(in srgb, var(--ui-status-warning) 28%, var(--ui-border-subtle));
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 92%, transparent);
  box-shadow: 0 20px 48px -28px var(--ui-shadow-panel);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transform: translateX(-50%);
}

.settings-account-save-dock-title {
  color: var(--ui-text-1);
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.4;
}

.settings-account-save-dock-copy {
  color: var(--ui-text-2);
  font-size: 0.75rem;
  line-height: 1.5;
}

.settings-empty-icon {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 74%, transparent);
}

.settings-system-note {
  color: var(--ui-text-2);
}

.settings-bug-icon {
  display: inline-flex;
  height: 1.1rem;
  width: 1.1rem;
  color: var(--ui-status-danger);
}

.settings-bug-icon-svg {
  height: 100%;
  width: 100%;
}

.settings-system-doc-link {
  border: 1px solid var(--ui-border-subtle);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.settings-system-doc-link-info {
  border-color: color-mix(in srgb, var(--ui-status-info) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.settings-system-doc-link-info:hover {
  background: color-mix(in srgb, var(--ui-status-info) 16%, var(--ui-bg-surface-raised));
}

.settings-system-doc-link-success {
  border-color: color-mix(in srgb, var(--ui-status-success) 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-success) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-success);
}

.settings-system-doc-link-success:hover {
  background: color-mix(in srgb, var(--ui-status-success) 16%, var(--ui-bg-surface-raised));
}

.settings-system-panel,
.settings-report-mail-panel,
.settings-system-readonly-box,
.settings-system-diff-panel {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 78%, transparent);
}

.settings-system-editor {
  border: 1px solid var(--ui-border-strong);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: var(--ui-text-1);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.settings-system-editor::placeholder {
  color: var(--ui-text-2);
}

.settings-system-editor:focus-visible {
  outline: none;
  border-color: var(--ui-border-strong);
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.settings-system-editor:disabled {
  cursor: not-allowed;
  opacity: 0.66;
}

.settings-system-inline-value {
  color: var(--ui-brand-600);
}

.settings-system-info-alert {
  border: 1px solid color-mix(in srgb, var(--ui-status-info) 24%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info-soft) 72%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.settings-system-warning-alert {
  border: 1px solid color-mix(in srgb, var(--ui-status-warning) 24%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-warning-soft) 72%, var(--ui-bg-surface-raised));
  color: var(--ui-status-warning);
}

.settings-system-warning-note {
  color: var(--ui-status-warning);
}

.settings-system-diff-row {
  border-bottom: 1px solid var(--ui-border-subtle);
}

.settings-report-hero {
  border: 1px solid color-mix(in srgb, var(--ui-status-success) 18%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-success-soft) 70%, var(--ui-bg-surface-raised));
}

.settings-report-hero-title {
  color: var(--ui-status-success);
}

.settings-theme-surface,
.settings-theme-range-card,
.settings-theme-action-panel,
.settings-theme-visual-card,
.settings-theme-gallery-card {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.settings-theme-highlight {
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 20%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface-raised));
}

.settings-theme-surface-active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 30%, var(--ui-border-subtle));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-brand-500) 20%, transparent);
  background: color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface-raised));
}

.settings-theme-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  border-width: 1px;
  border-style: solid;
  border-radius: 999px;
  line-height: 1;
  white-space: nowrap;
}

.settings-theme-scope-card {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 74%, transparent);
}

.settings-theme-scope-card:hover,
.settings-theme-scope-card-inactive:hover,
.settings-theme-visual-card:hover,
.settings-theme-gallery-card:hover {
  border-color: color-mix(in srgb, var(--ui-brand-500) 26%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent);
}

.settings-theme-scope-card-active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 30%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface-raised));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-brand-500) 18%, transparent);
}

.settings-theme-visual-preview {
  border: 1px solid color-mix(in srgb, white 18%, var(--ui-border-subtle));
}

.settings-theme-visual-overlay {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.14));
}

.settings-theme-visual-bar-strong,
.settings-preview-block-strong {
  background: rgba(255, 255, 255, 0.62);
}

.settings-theme-visual-bar-mid,
.settings-preview-block-mid {
  background: rgba(255, 255, 255, 0.34);
}

.settings-theme-visual-bar-faint,
.settings-preview-block-faint {
  background: rgba(255, 255, 255, 0.22);
}

.settings-preview-overlay-soft {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(15, 23, 42, 0.18));
}

.settings-preview-login-sheen {
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--ui-shadow-panel) 30%, transparent),
    transparent 58%,
    color-mix(in srgb, var(--ui-bg-surface) 12%, transparent)
  );
}

.settings-preview-modal-sheen {
  background: linear-gradient(
    to bottom right,
    color-mix(in srgb, var(--ui-bg-surface) 12%, transparent),
    transparent 52%,
    color-mix(in srgb, var(--ui-shadow-panel) 8%, transparent)
  );
}

.settings-theme-preview-note-warning {
  color: var(--ui-status-warning);
}

.settings-theme-preview-note-danger {
  color: var(--ui-status-danger);
}

/* 5 套主题联动卡片：统一封面/正文高度与按钮尺寸，避免“有大有小” */
.settings-theme-bundle-card {
  display: flex;
  flex-direction: column;
  min-height: 28rem;
}

.settings-theme-bundle-cover {
  flex: 0 0 7.25rem;
}

.settings-theme-bundle-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.settings-theme-bundle-head {
  align-items: flex-start;
  min-height: 2.35rem;
}

.settings-theme-bundle-title {
  display: -webkit-box;
  min-height: 2.4rem;
  overflow: hidden;
  line-height: 1.2rem;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.settings-theme-bundle-action {
  align-self: flex-start;
  flex: 0 0 auto;
  line-height: 1rem;
  min-width: 4.4rem;
  text-align: center;
  white-space: nowrap;
}

.settings-theme-bundle-badge {
  white-space: nowrap;
}

.settings-theme-bundle-desc {
  min-height: 3.8rem;
}

.settings-theme-bundle-metrics {
  margin-top: auto;
}

.settings-theme-side-panel {
  align-self: flex-start;
}

.settings-preset-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.5rem;
  border-width: 1px;
  border-style: solid;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
  white-space: nowrap;
}

.settings-toolbar-divider {
  background: color-mix(in srgb, var(--ui-border-strong) 72%, transparent);
}

@media (min-width: 1280px) {
  .settings-theme-side-panel {
    position: sticky;
    top: 5.5rem;
  }
}

@media (max-width: 1180px) {
  .settings-primary-category-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .settings-primary-category {
    position: sticky;
    top: 0.5rem;
    z-index: 14;
  }

  .settings-primary-category-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .settings-primary-category-item {
    min-width: 0;
    width: 100%;
  }

  .settings-primary-toolbar {
    top: 0;
    z-index: 15;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent) 0%,
      color-mix(in srgb, var(--ui-bg-surface) 84%, transparent) 80%,
      color-mix(in srgb, var(--ui-bg-surface) 66%, transparent) 100%
    );
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .settings-primary-actions {
    flex-wrap: wrap;
    overflow: visible;
    margin-inline: 0;
    padding-inline: 0;
    padding-bottom: 0.125rem;
  }

  .settings-primary-actions > * {
    min-width: 0;
    flex: 1 1 calc(50% - 0.5rem);
  }

  .settings-primary-actions .settings-footer-button {
    flex-basis: 100%;
  }

  .settings-advanced-detail-nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 0.125rem;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .settings-advanced-detail-nav::-webkit-scrollbar {
    display: none;
  }

  .settings-advanced-detail-tab {
    flex: 0 0 auto;
    min-width: 6.8rem;
  }

  .settings-update-detail-nav {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 0.125rem;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .settings-update-detail-nav::-webkit-scrollbar {
    display: none;
  }

  .settings-update-detail-tab {
    flex: 0 0 auto;
    min-width: 7.2rem;
  }

  .settings-toolbar-divider {
    display: none;
  }

  .settings-sticky-save {
    position: sticky;
    bottom: 0;
    z-index: 13;
    align-items: stretch;
    gap: 0.75rem;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-bg-surface) 10%, transparent) 0%,
      color-mix(in srgb, var(--ui-bg-surface-raised) 92%, transparent) 38%,
      color-mix(in srgb, var(--ui-bg-surface) 96%, transparent) 100%
    );
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 -18px 28px -24px var(--ui-shadow-panel);
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  }

  .settings-footer-button {
    width: 100%;
    justify-content: center;
  }
}

.settings-mode-panel,
.settings-mode-state-card,
.settings-mode-card,
.settings-trade-textarea,
.settings-automation-card,
.settings-friend-panel,
.settings-preview-trigger,
.settings-preview-card,
.settings-preview-modal {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.settings-mode-banner {
  border: 1px solid var(--ui-border-subtle);
}

.settings-mode-banner-info {
  border-color: color-mix(in srgb, var(--ui-status-info) 24%, var(--ui-border-subtle));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-status-info) 10%, var(--ui-bg-surface-raised)),
    color-mix(in srgb, var(--ui-brand-100) 18%, var(--ui-bg-surface))
  );
}

.settings-mode-banner-warning {
  border-color: color-mix(in srgb, var(--ui-status-warning) 24%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-warning) 10%, var(--ui-bg-surface-raised));
}

.settings-mode-banner-success {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-success) 10%, var(--ui-bg-surface-raised));
}

.settings-mode-banner-title,
.settings-mode-state-title {
  color: var(--ui-text-1);
}

.settings-mode-banner-info .settings-mode-banner-title,
.settings-mode-note-info {
  color: var(--ui-status-info);
}

.settings-mode-banner-warning .settings-mode-banner-title,
.settings-mode-note-warning {
  color: var(--ui-status-warning);
}

.settings-mode-banner-success .settings-mode-banner-title {
  color: var(--ui-status-success);
}

.settings-mode-banner-copy,
.settings-mode-state-copy,
.settings-mode-card-copy,
.settings-mode-note-muted,
.settings-inventory-copy {
  color: var(--ui-text-2);
}

.settings-mode-card {
  border-color: var(--ui-border-subtle);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 18%, transparent);
}

.settings-mode-card-title,
.settings-mode-card-check {
  color: inherit;
}

.settings-mode-card-brand {
  color: var(--ui-brand-700);
}

.settings-mode-card-warning {
  color: var(--ui-status-warning);
}

.settings-mode-card-success {
  color: var(--ui-status-success);
}

.settings-mode-card-active {
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 35%, transparent);
  background: color-mix(in srgb, currentColor 10%, var(--ui-bg-surface-raised));
  border-color: color-mix(in srgb, currentColor 30%, var(--ui-border-subtle));
}

.settings-mode-inline-action {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, var(--ui-border-subtle));
  color: var(--ui-status-success);
}

.settings-risk-alert {
  border: 1px solid color-mix(in srgb, var(--ui-status-danger) 24%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-danger) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-danger);
}

.settings-risk-item {
  color: var(--ui-status-danger);
  font-weight: 600;
}

.settings-mode-badge,
.settings-health-pill,
.settings-result-badge,
.settings-report-detail-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-width: 1px;
  border-style: solid;
}

.settings-strategy-preview {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-status-info) 8%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.settings-inventory-panel {
  border: 1px solid color-mix(in srgb, #0f766e 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, #0f766e 8%, var(--ui-bg-surface-raised));
}

.settings-bag-panel {
  border: 1px solid color-mix(in srgb, #b45309 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, #b45309 8%, var(--ui-bg-surface-raised));
}

.settings-bag-title {
  color: color-mix(in srgb, #b45309 84%, var(--ui-text-1));
}

.settings-bag-copy {
  color: var(--ui-text-2);
}

.settings-bag-summary {
  border: 1px solid color-mix(in srgb, #b45309 22%, var(--ui-border-subtle));
  background: color-mix(in srgb, #b45309 10%, var(--ui-bg-surface-raised));
  color: color-mix(in srgb, #b45309 84%, var(--ui-text-1));
}

.settings-bag-notice {
  border: 1px solid color-mix(in srgb, #b45309 20%, var(--ui-border-subtle));
  background: color-mix(in srgb, #b45309 12%, var(--ui-bg-surface-raised));
  color: color-mix(in srgb, #b45309 84%, var(--ui-text-1));
}

.settings-bag-seed-card {
  border: 1px solid color-mix(in srgb, #b45309 18%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  cursor: grab;
}

.settings-bag-seed-card-muted {
  opacity: 0.72;
}

.settings-bag-drag {
  border: 1px dashed color-mix(in srgb, #b45309 20%, var(--ui-border-subtle));
  color: color-mix(in srgb, #b45309 72%, var(--ui-text-2));
  background: color-mix(in srgb, #b45309 8%, var(--ui-bg-surface-raised));
}

.settings-bag-index {
  border: 1px solid color-mix(in srgb, #b45309 20%, var(--ui-border-subtle));
  background: color-mix(in srgb, #b45309 12%, var(--ui-bg-surface-raised));
  color: color-mix(in srgb, #b45309 84%, var(--ui-text-1));
}

.settings-bag-empty {
  border: 1px dashed color-mix(in srgb, #b45309 24%, var(--ui-border-subtle));
  color: color-mix(in srgb, #b45309 72%, var(--ui-text-2));
}

.settings-inventory-title {
  color: color-mix(in srgb, #0f766e 84%, var(--ui-text-1));
}

.settings-inventory-action {
  border-color: color-mix(in srgb, #0f766e 24%, var(--ui-border-subtle));
  color: color-mix(in srgb, #0f766e 84%, var(--ui-text-1));
}

.settings-inventory-rule {
  border: 1px solid color-mix(in srgb, #0f766e 20%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
}

.settings-inventory-remove {
  color: var(--ui-status-danger);
}

.settings-inventory-remove:hover {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, transparent);
}

.settings-inventory-empty {
  border: 1px dashed color-mix(in srgb, #0f766e 24%, var(--ui-border-subtle));
  color: color-mix(in srgb, #0f766e 72%, var(--ui-text-2));
}

.settings-trade-textarea {
  color: var(--ui-text-1);
}

.settings-trade-textarea::placeholder {
  color: var(--ui-text-2);
}

.settings-automation-card {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 74%, transparent);
}

.settings-automation-card:hover {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 86%, transparent);
}

.settings-automation-note {
  color: var(--ui-text-2);
}

.settings-automation-scope {
  background: color-mix(in srgb, var(--ui-status-success) 10%, var(--ui-bg-surface-raised));
  color: var(--ui-status-success);
}

.settings-friend-panel {
  overflow: hidden;
}

.settings-friend-panel-active {
  border-color: color-mix(in srgb, var(--ui-status-info) 20%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info) 7%, var(--ui-bg-surface-raised));
}

.settings-friend-panel-inactive {
  border-color: var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
}

.settings-friend-overlay {
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 72%, transparent);
}

.settings-friend-overlay-badge {
  white-space: nowrap;
}

.settings-friend-title-active {
  color: var(--ui-status-info);
}

.settings-friend-title-inactive {
  color: var(--ui-text-3);
}

.settings-stakeout-delay {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
}

.settings-preview-trigger {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.settings-preview-trigger:hover,
.settings-preview-close:hover {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
}

.settings-preview-card,
.settings-preview-modal {
  border-color: color-mix(in srgb, white 18%, var(--ui-border-subtle));
}

.settings-preview-glass,
.settings-preview-sidebar,
.settings-preview-panel,
.settings-preview-brand-panel,
.settings-preview-brand-card,
.settings-preview-form-panel,
.settings-preview-input,
.settings-preview-close {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.settings-preview-brand-panel,
.settings-preview-form-header,
.settings-preview-form-copy,
.settings-preview-form-grid {
  color: color-mix(in srgb, var(--ui-text-on-brand) 94%, var(--ui-text-1) 6%);
}

.settings-preview-sidebar,
.settings-preview-panel,
.settings-preview-input {
  background: rgba(255, 255, 255, 0.13);
}

.settings-preview-overlay {
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 90%, transparent);
}

.settings-preview-close {
  color: var(--ui-text-on-brand);
}

.settings-preview-brand-panel {
  color: var(--ui-text-on-brand);
}

.settings-preview-brand-icon,
.settings-preview-form-icon {
  background: rgba(255, 255, 255, 0.84);
  color: var(--ui-brand-600);
}

.settings-preview-brand-copy {
  color: color-mix(in srgb, var(--ui-text-on-brand) 88%, var(--ui-text-1) 12%);
}

.settings-preview-form-panel {
  background: rgba(255, 255, 255, 0.2);
}

.dark .settings-preview-form-panel,
.dark .settings-preview-glass,
.dark .settings-preview-sidebar,
.dark .settings-preview-panel,
.dark .settings-preview-input,
.dark .settings-preview-close {
  background: rgba(2, 6, 23, 0.26);
}

.settings-preview-input {
  color: color-mix(in srgb, var(--ui-text-on-brand) 96%, var(--ui-text-1) 4%);
}

.settings-preview-submit {
  background: rgba(255, 255, 255, 0.88);
  color: #1f2937;
}

.settings-preview-fail {
  border: 1px solid color-mix(in srgb, #fb7185 28%, rgba(255, 255, 255, 0.22));
  background: color-mix(in srgb, #be123c 24%, rgba(15, 23, 42, 0.5));
  color: var(--ui-text-on-brand);
  backdrop-filter: blur(18px);
}

.settings-inline-unit,
.settings-report-meta,
.settings-report-stat-label,
.settings-report-stat-hint,
.settings-report-selection,
.settings-report-log-meta,
.settings-report-state-note,
.settings-health-note,
.settings-health-card-label,
.settings-health-card-note,
.settings-report-detail-meta,
.settings-report-detail-body-label {
  color: var(--ui-text-2);
}

.settings-section-divider,
.settings-report-detail-header,
.settings-report-detail-footer {
  border-color: var(--ui-border-subtle);
}

.settings-report-panel,
.settings-report-stat-card,
.settings-report-log-card,
.settings-health-card,
.settings-report-detail-body {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.settings-report-panel-success {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-status-success-soft) 72%, var(--ui-bg-surface-raised));
}

.settings-report-panel-title,
.settings-report-active {
  color: var(--ui-status-success);
}

.settings-report-divider {
  border-top: 1px solid color-mix(in srgb, var(--ui-status-success) 18%, var(--ui-border-subtle));
}

.settings-info-banner {
  border: 1px solid color-mix(in srgb, var(--ui-status-info) 28%, var(--ui-border-subtle) 72%);
  background: color-mix(in srgb, var(--ui-status-info-soft) 72%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.settings-report-stat-card {
  border-color: color-mix(in srgb, var(--ui-status-success) 20%, var(--ui-border-subtle) 80%);
}

.settings-report-stat-card-active {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-status-success) 42%, transparent);
}

.settings-report-card-tone-surface {
  background: color-mix(in srgb, var(--ui-bg-surface) 88%, transparent);
}

.settings-report-card-bg-success {
  background: color-mix(in srgb, var(--ui-status-success) 10%, var(--ui-bg-surface-raised));
}

.settings-report-card-bg-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, var(--ui-bg-surface-raised));
}

.settings-report-card-bg-info {
  background: color-mix(in srgb, var(--ui-status-info) 10%, var(--ui-bg-surface-raised));
}

.settings-report-card-bg-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 11%, var(--ui-bg-surface-raised));
}

.settings-report-card-bg-accent {
  background: color-mix(in srgb, #7c3aed 10%, var(--ui-bg-surface-raised));
}

.settings-report-card-tone-main,
.settings-health-card-value,
.settings-report-log-title,
.settings-report-log-body,
.settings-report-detail-title,
.settings-report-detail-body-content {
  color: var(--ui-text-1);
}

.settings-report-card-tone-success {
  color: var(--ui-status-success);
}

.settings-report-card-tone-danger,
.settings-report-error {
  color: var(--ui-status-danger);
}

.settings-report-card-tone-info {
  color: var(--ui-status-info);
}

.settings-report-card-tone-warning {
  color: var(--ui-status-warning);
}

.settings-report-card-tone-muted {
  color: var(--ui-text-2);
}

.settings-report-card-tone-accent {
  color: color-mix(in srgb, #7c3aed 82%, var(--ui-text-1));
}

.settings-report-checkbox {
  accent-color: var(--ui-brand-500);
  border-color: var(--ui-border-strong);
}

.settings-report-empty {
  border: 1px dashed color-mix(in srgb, var(--ui-status-success) 26%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent);
  color: var(--ui-text-2);
}

.settings-report-log-card {
  border-color: color-mix(in srgb, var(--ui-status-success) 20%, var(--ui-border-subtle) 80%);
}

.settings-result-badge {
  justify-content: center;
}

.settings-report-log-body,
.settings-report-detail-body {
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent);
}

.settings-health-card {
  background: color-mix(in srgb, var(--ui-bg-surface) 78%, transparent);
}

.settings-health-alert {
  border: 1px solid color-mix(in srgb, var(--ui-status-danger) 26%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-danger) 9%, var(--ui-bg-surface-raised));
  color: var(--ui-status-danger);
}

.settings-health-primary-card {
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface-raised));
}

.settings-health-primary-label,
.settings-health-primary-note {
  color: color-mix(in srgb, var(--ui-brand-700) 88%, var(--ui-text-2));
}

.settings-health-primary-code {
  color: color-mix(in srgb, var(--ui-brand-700) 92%, var(--ui-text-1));
}

.settings-health-status-card {
  border: 1px solid var(--ui-border-subtle);
}

.settings-health-status-card-success {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-status-success) 9%, var(--ui-bg-surface-raised));
  color: var(--ui-status-success);
}

.settings-health-status-card-warning {
  border-color: color-mix(in srgb, var(--ui-status-warning) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-status-warning) 9%, var(--ui-bg-surface-raised));
  color: var(--ui-status-warning);
}

.settings-health-status-card-info {
  border-color: color-mix(in srgb, var(--ui-status-info) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-status-info) 9%, var(--ui-bg-surface-raised));
  color: var(--ui-status-info);
}

.settings-health-status-card-neutral {
  border-color: var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
  color: var(--ui-text-2);
}

.settings-health-status-value {
  color: inherit;
}

.settings-report-detail-overlay {
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 88%, transparent);
}

.settings-report-detail-modal {
  border-color: var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent);
}

.settings-report-detail-close {
  color: var(--ui-text-2);
}

.settings-report-detail-close:hover {
  background: color-mix(in srgb, var(--ui-bg-surface) 78%, transparent);
  color: var(--ui-text-1);
}

.settings-report-detail-chip {
  white-space: nowrap;
}

.settings-route-anchor {
  position: relative;
  top: -5.5rem;
  height: 0;
  pointer-events: none;
}
</style>
