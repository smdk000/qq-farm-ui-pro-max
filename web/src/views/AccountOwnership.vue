<script setup lang="ts">
import type { CopyInteractionOptions } from '@/composables/use-copy-interaction'
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseActionButtons from '@/components/ui/BaseActionButtons.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseBulkActions from '@/components/ui/BaseBulkActions.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
import BaseChipList from '@/components/ui/BaseChipList.vue'
import BaseDataTable from '@/components/ui/BaseDataTable.vue'
import BaseDataTableHead from '@/components/ui/BaseDataTableHead.vue'
import BaseDataTableSelectionCell from '@/components/ui/BaseDataTableSelectionCell.vue'
import BaseDataTableSelectionHeader from '@/components/ui/BaseDataTableSelectionHeader.vue'
import BaseDataTableStateRow from '@/components/ui/BaseDataTableStateRow.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseFilterFields from '@/components/ui/BaseFilterFields.vue'
import BaseHistorySectionLayout from '@/components/ui/BaseHistorySectionLayout.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseManagementPageScaffold from '@/components/ui/BaseManagementPageScaffold.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSelectionSummary from '@/components/ui/BaseSelectionSummary.vue'
import BaseStatCard from '@/components/ui/BaseStatCard.vue'
import BaseStatCardGrid from '@/components/ui/BaseStatCardGrid.vue'
import BaseTableSectionCard from '@/components/ui/BaseTableSectionCard.vue'
import BaseTableToolbar from '@/components/ui/BaseTableToolbar.vue'
import { useCopyInteraction } from '@/composables/use-copy-interaction'
import { useAccountStore } from '@/stores/account'
import { useToastStore } from '@/stores/toast'
import { formatFriendFetchReasonLabel } from '@/utils/friend-fetch-status'
import { createActionButton, createActionButtons, createButtonField, createChip, createChips, createFilterFields, createHistoryHighlight, createHistoryMetaItem, createHistoryMetaItems, createHistoryMetric, createHistoryMetrics, createHistoryPanel, createHistoryRecentItem, createHistoryRecentItems, createInputField, createPageHeaderText, createSelectField, createStatCard, createStatCards } from '@/utils/management-schema'

interface AccountItem {
  id: string
  name?: string
  nick?: string
  uin?: string | number
  platform?: string
  username?: string
  accountMode?: 'main' | 'alt' | 'safe'
  effectiveMode?: 'main' | 'alt' | 'safe'
  collaborationEnabled?: boolean
  degradeReason?: string
  degradeReasonLabel?: string
  accountZone?: string
  running?: boolean
  connected?: boolean
  protection?: {
    suspended?: boolean
    suspendUntil?: number
    suspendRemainSec?: number
    wechat?: {
      enabled?: boolean
      friendGuardActive?: boolean
      friendGuardReason?: string
      friendCooldownUntil?: number
      friendCooldownRemainSec?: number
      syncAllUnsupportedUntil?: number
      failureCount?: number
      failureReason?: string
      failureAt?: number
      farmAutomationPaused?: boolean
    }
  }
}

interface UserItem {
  username: string
  role: string
}

type ActionHistoryStatus = 'success' | 'warning' | 'error'

interface ActionHistoryItem {
  id: string
  actionLabel: string
  status: ActionHistoryStatus
  timestamp: number
  totalCount: number
  successCount: number
  failedCount: number
  affectedNames: string[]
  failedNames: string[]
  detailLines?: string[]
  pendingSync?: boolean
}

const ACTION_HISTORY_STORAGE_KEY = 'account_ownership_action_history_v1'
const ACTION_HISTORY_LIMIT = 24
const ACTION_HISTORY_SCOPE = 'account_ownership'

type OwnershipFilter = 'all' | 'mine' | 'other_user' | 'other_admin' | 'unowned'
type PlatformFilter = 'all' | 'qq' | 'wechat'
type StatusFilter = 'all' | 'online' | 'starting' | 'offline'
type ModeFilter = 'all' | 'main' | 'alt' | 'safe'
type BatchOwnershipAction = 'assign' | 'unassign' | 'start' | 'stop' | 'mode' | 'delete' | ''

const loading = ref(false)
const toast = useToastStore()
const router = useRouter()
const accountStore = useAccountStore()
const accounts = ref<AccountItem[]>([])
const users = ref<UserItem[]>([])
const selectedAccountIds = ref<string[]>([])
const searchKeyword = ref('')
const ownershipFilter = ref<OwnershipFilter>('all')
const platformFilter = ref<PlatformFilter>('all')
const statusFilter = ref<StatusFilter>('all')
const modeFilter = ref<ModeFilter>('all')

const ownershipTarget = ref('__unowned__')
const ownershipModalTarget = ref('')
const editingAccountName = ref('')
const editingAccountMode = ref<'main' | 'alt' | 'safe'>('main')
const showOwnershipModal = ref(false)
const ownershipSaving = ref(false)
const ownershipError = ref('')

const showDeleteConfirm = ref(false)
const deleteTarget = ref<AccountItem | null>(null)
const deleteLoading = ref(false)
const runtimeActionId = ref('')
const activeActionMenuId = ref('')
const runtimeNowTs = ref(Date.now())
let runtimeNowTimer: ReturnType<typeof setInterval> | null = null

const showBatchConfirm = ref(false)
const batchAction = ref<BatchOwnershipAction>('')
const batchActionLabel = ref('')
const batchLoading = ref(false)
const showBatchFailureModal = ref(false)
const batchFailureTitle = ref('')
const batchFailureItems = ref<string[]>([])
const batchModeTarget = ref<'main' | 'alt' | 'safe'>('main')
const actionHistory = ref<ActionHistoryItem[]>([])
const { copiedHistoryId, copiedControlKey, copyText: copyWithFeedback } = useCopyInteraction()

const currentUser = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('current_user') || 'null')
  }
  catch {
    return null
  }
})

const currentUsername = computed(() => String(currentUser.value?.username || '').trim())
const roleMap = computed(() => {
  const map = new Map<string, string>()
  for (const user of users.value) {
    map.set(String(user.username || '').trim(), String(user.role || 'user').trim())
  }
  return map
})

const ownershipOptions = [
  { label: '全部归属', value: 'all' },
  { label: '我自己登录', value: 'mine' },
  { label: '普通用户', value: 'other_user' },
  { label: '其他管理员', value: 'other_admin' },
  { label: '未归属', value: 'unowned' },
]

const platformOptions = [
  { label: '全部平台', value: 'all' },
  { label: 'QQ 区', value: 'qq' },
  { label: '微信区', value: 'wechat' },
]

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '在线', value: 'online' },
  { label: '启动中', value: 'starting' },
  { label: '已停止', value: 'offline' },
]

const modeOptions = [
  { label: '全部模式', value: 'all' },
  { label: '主号', value: 'main' },
  { label: '小号', value: 'alt' },
  { label: '避险', value: 'safe' },
]

const editModeOptions = [
  { label: '主号', value: 'main' },
  { label: '小号', value: 'alt' },
  { label: '避险', value: 'safe' },
]

const ownerTargetOptions = computed(() => {
  const options = users.value.map(user => ({
    label: `${user.username}${user.role === 'admin' ? ' · 管理员' : ' · 普通用户'}`,
    value: user.username,
  }))
  return [{ label: '取消归属 / 设为系统账号', value: '__unowned__' }, ...options]
})

function resolveModeMeta(mode?: string) {
  if (mode === 'alt') {
    return {
      label: '小号',
      badgeTone: 'warning' as const,
    }
  }
  if (mode === 'safe') {
    return {
      label: '避险',
      badgeTone: 'success' as const,
    }
  }
  return {
    label: '主号',
    badgeTone: 'brand' as const,
  }
}

function resolveAccountMode(mode?: string) {
  if (mode === 'alt' || mode === 'safe')
    return mode
  return 'main'
}

function resolveEffectiveMode(mode?: string) {
  if (mode === 'alt' || mode === 'safe')
    return mode
  return 'main'
}

function resolveAccountState(account: AccountItem) {
  if (account.connected) {
    return { key: 'online', label: '在线', badgeTone: 'success' as const }
  }
  if (account.running) {
    return { key: 'starting', label: '启动中', badgeTone: 'warning' as const }
  }
  return { key: 'offline', label: '已停止', badgeTone: 'neutral' as const }
}

function formatRuntimeDurationFromSeconds(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0))
  if (seconds < 60)
    return `${seconds} 秒`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0)
    return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
  return `${minutes} 分钟`
}

function getWechatProtection(account: AccountItem) {
  const protection = (account.protection && typeof account.protection === 'object') ? account.protection : null
  const wechat = (protection?.wechat && typeof protection.wechat === 'object') ? protection.wechat : null
  return {
    protection,
    wechat,
  }
}

function resolveWechatGuardBadges(account: AccountItem) {
  const { wechat } = getWechatProtection(account)
  if (!wechat?.enabled)
    return []

  const badges: Array<{ label: string, tone: 'warning' | 'danger' | 'info' }> = []
  if (wechat.friendGuardActive) {
    badges.push({
      label: '好友休息一会',
      tone: 'warning',
    })
  }
  if (wechat.farmAutomationPaused) {
    badges.push({
      label: '农场休息',
      tone: 'danger',
    })
  }
  if (!wechat.friendGuardActive && Number(wechat.syncAllUnsupportedUntil || 0) > runtimeNowTs.value) {
    badges.push({
      label: '跳过 SyncAll',
      tone: 'info',
    })
  }
  return badges
}

function resolveWechatGuardNote(account: AccountItem) {
  const { protection, wechat } = getWechatProtection(account)
  if (!wechat?.enabled)
    return ''

  const notes: string[] = []
  if (wechat.friendGuardActive) {
    const reasonLabel = formatFriendFetchReasonLabel(String(wechat.friendGuardReason || ''))
    const remainSec = Math.max(
      0,
      Number(wechat.friendCooldownRemainSec || 0),
      Math.ceil((Number(wechat.friendCooldownUntil || 0) - runtimeNowTs.value) / 1000),
    )
    notes.push(remainSec > 0
      ? `微信好友：${reasonLabel}，约 ${formatRuntimeDurationFromSeconds(remainSec)} 后再试`
      : `微信好友：${reasonLabel}`)
  }
  if (wechat.farmAutomationPaused) {
    const suspendRemainSec = Math.max(0, Number(protection?.suspendRemainSec || 0))
    notes.push(suspendRemainSec > 0
      ? `微信农场自动操作正在休息，约 ${formatRuntimeDurationFromSeconds(suspendRemainSec)} 后恢复`
      : '微信农场自动操作正在休息')
  }
  if (!notes.length && Number(wechat.syncAllUnsupportedUntil || 0) > runtimeNowTs.value) {
    notes.push('当前微信账号已记忆为不支持 SyncAll，好友链路将优先走 GetAll')
  }
  return notes.join('；')
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

function resolveModeExecutionMeta(account: AccountItem) {
  const configuredMode = resolveAccountMode(account.accountMode)
  const effectiveMode = resolveEffectiveMode(account.effectiveMode || configuredMode)
  const backendLabel = String(account.degradeReasonLabel || '').trim()
  const degradeLabel = backendLabel || resolveDegradeReasonLabel(account.degradeReason)

  if (effectiveMode !== configuredMode) {
    return {
      label: `生效:${resolveModeMeta(effectiveMode).label}`,
      badgeTone: 'info' as const,
      note: degradeLabel || '当前已按更保守模式执行',
      noteClass: 'ownership-note-info',
    }
  }

  if (account.collaborationEnabled) {
    return {
      label: '协同命中',
      badgeTone: 'info' as const,
      note: '同区 / 游戏好友约束已命中',
      noteClass: 'ownership-note-info',
    }
  }

  if (degradeLabel) {
    return {
      label: '独立执行',
      badgeTone: 'neutral' as const,
      note: degradeLabel,
      noteClass: 'ownership-note-muted',
    }
  }

  return null
}

function resolvePlatformLabel(platform?: string) {
  const raw = String(platform || '').trim().toLowerCase()
  if (raw === 'qq')
    return 'QQ'
  if (raw === 'wx_ipad')
    return 'iPad微信'
  if (raw === 'wx_car')
    return '车机微信'
  if (raw.startsWith('wx'))
    return '微信'
  return '未知平台'
}

function resolveZoneLabel(zone?: string, platform?: string) {
  const raw = String(zone || '').trim().toLowerCase()
  if (raw === 'qq_zone')
    return 'QQ区'
  if (raw === 'wechat_zone')
    return '微信区'
  const platformLabel = resolvePlatformLabel(platform)
  if (platformLabel.includes('QQ'))
    return 'QQ区'
  if (platformLabel.includes('微信'))
    return '微信区'
  return '未识别区服'
}

function resolveOwnerMeta(account: AccountItem) {
  const owner = String(account.username || '').trim()
  if (!owner) {
    return {
      label: '未归属 / 系统账号',
      badgeTone: 'neutral' as const,
      section: 'unowned',
    }
  }
  if (owner === currentUsername.value) {
    return {
      label: '我自己登录的账号',
      badgeTone: 'brand' as const,
      section: 'mine',
    }
  }
  const role = roleMap.value.get(owner)
  if (role === 'admin') {
    return {
      label: `其他管理员: ${owner}`,
      badgeTone: 'owner' as const,
      section: 'other_admin',
    }
  }
  return {
    label: `普通用户: ${owner}`,
    badgeTone: 'warning' as const,
    section: 'other_user',
  }
}

const filteredAccounts = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return accounts.value.filter((account) => {
    const ownerMeta = resolveOwnerMeta(account)
    const state = resolveAccountState(account)
    const configuredMode = resolveAccountMode(account.accountMode)
    const platform = resolveZoneLabel(account.accountZone, account.platform).includes('微信') ? 'wechat' : 'qq'
    const matchesKeyword = !keyword
      || String(account.name || '').toLowerCase().includes(keyword)
      || String(account.nick || '').toLowerCase().includes(keyword)
      || String(account.uin || '').toLowerCase().includes(keyword)
      || String(account.username || '').toLowerCase().includes(keyword)
      || resolvePlatformLabel(account.platform).toLowerCase().includes(keyword)
    const matchesOwner = ownershipFilter.value === 'all' || ownerMeta.section === ownershipFilter.value
    const matchesPlatform = platformFilter.value === 'all' || platform === platformFilter.value
    const matchesStatus = statusFilter.value === 'all' || state.key === statusFilter.value
    const matchesMode = modeFilter.value === 'all' || configuredMode === modeFilter.value
    return matchesKeyword && matchesOwner && matchesPlatform && matchesStatus && matchesMode
  })
})

const sortedAccounts = computed(() => {
  return [...filteredAccounts.value].sort((a, b) => {
    const aPriority = a.username === currentUsername.value ? 2 : (a.username ? 1 : 0)
    const bPriority = b.username === currentUsername.value ? 2 : (b.username ? 1 : 0)
    if (aPriority !== bPriority)
      return bPriority - aPriority
    return Number(b.id || 0) - Number(a.id || 0)
  })
})

const summary = computed(() => {
  return sortedAccounts.value.reduce((acc, item) => {
    const ownerMeta = resolveOwnerMeta(item)
    const state = resolveAccountState(item)
    if (ownerMeta.section === 'mine')
      acc.mine += 1
    else if (ownerMeta.section === 'other_user')
      acc.otherUsers += 1
    else if (ownerMeta.section === 'other_admin')
      acc.otherAdmins += 1
    else
      acc.unowned += 1

    if (state.key === 'online')
      acc.online += 1
    else if (state.key === 'starting')
      acc.starting += 1
    else
      acc.offline += 1
    return acc
  }, {
    mine: 0,
    otherUsers: 0,
    otherAdmins: 0,
    unowned: 0,
    online: 0,
    starting: 0,
    offline: 0,
  })
})

const ownershipFilterInputComponent = markRaw(BaseInput)
const ownershipFilterSelectComponent = markRaw(BaseSelect)
const ownershipFilterButtonComponent = markRaw(BaseButton)
const ownershipSelectionSummaryChipComponent = markRaw(BaseSelectionSummary)

const summaryCards = computed(() => createStatCards([
  createStatCard({
    key: 'mine',
    label: '我自己登录的账号',
    value: String(summary.value.mine),
    description: '当前管理员直接掌控',
    valueClass: 'ui-stat-card__value--brand',
  }),
  createStatCard({
    key: 'other-user',
    label: '普通用户账号',
    value: String(summary.value.otherUsers),
    description: '支持转移和回收',
    valueClass: 'ui-stat-card__value--warning',
  }),
  createStatCard({
    key: 'other-admin',
    label: '其他管理员账号',
    value: String(summary.value.otherAdmins),
    description: '高权限归属需谨慎',
    valueClass: 'ui-stat-card__value--info',
  }),
  createStatCard({
    key: 'runtime',
    label: '在线 / 启动中 / 停止',
    value: `${summary.value.online} / ${summary.value.starting} / ${summary.value.offline}`,
    description: '运行状态概览',
    valueClass: '',
  }),
]))

const latestActionHistory = computed(() => actionHistory.value[0] ?? null)
const recentActionHistory = computed(() => actionHistory.value.slice(1, 5))

const filterFields = computed(() => createFilterFields([
  createInputField({
    key: 'search',
    component: ownershipFilterInputComponent,
    modelValue: searchKeyword.value,
    label: '搜索账号',
    placeholder: '搜索备注、UIN、归属人、平台',
    clearable: true,
    onUpdate: (value: unknown) => {
      searchKeyword.value = String(value ?? '')
    },
  }),
  createSelectField({
    key: 'ownership',
    component: ownershipFilterSelectComponent,
    modelValue: ownershipFilter.value,
    label: '归属筛选',
    options: ownershipOptions,
    onUpdate: (value: unknown) => {
      ownershipFilter.value = value as OwnershipFilter
    },
  }),
  createSelectField({
    key: 'platform',
    component: ownershipFilterSelectComponent,
    modelValue: platformFilter.value,
    label: '平台筛选',
    options: platformOptions,
    onUpdate: (value: unknown) => {
      platformFilter.value = value as PlatformFilter
    },
  }),
  createSelectField({
    key: 'status',
    component: ownershipFilterSelectComponent,
    modelValue: statusFilter.value,
    label: '状态筛选',
    options: statusOptions,
    onUpdate: (value: unknown) => {
      statusFilter.value = value as StatusFilter
    },
  }),
  createSelectField({
    key: 'mode',
    component: ownershipFilterSelectComponent,
    modelValue: modeFilter.value,
    label: '模式筛选',
    options: modeOptions,
    onUpdate: (value: unknown) => {
      modeFilter.value = value as ModeFilter
    },
  }),
  createButtonField({
    key: 'reset',
    component: ownershipFilterButtonComponent,
    text: '重置筛选',
    props: {
      variant: 'ghost',
      class: 'w-full xl:w-auto',
    },
    onClick: () => {
      resetFilters()
    },
  }),
]))

const toolbarChips = computed(() => createChips([
  createChip({
    key: 'current-admin',
    text: `当前管理员：${currentUsername.value || '未识别'}`,
  }),
  createChip({
    key: 'filtered-accounts',
    text: `筛选结果 ${sortedAccounts.value.length} 项`,
  }),
  createChip({
    key: 'unowned-accounts',
    text: `未归属 ${summary.value.unowned} 项`,
  }),
  createChip({
    key: 'selected-accounts',
    active: true,
    show: selectedAccountIds.value.length > 0,
    component: ownershipSelectionSummaryChipComponent,
    props: {
      selectedCount: selectedAccountIds.value.length,
      variant: 'pill',
      class: 'border-0 bg-transparent px-0 py-0 text-inherit',
    },
  }),
]))

const historyChips = computed(() => createChips([
  createChip({
    key: 'history-loaded',
    text: `已载入 ${actionHistory.value.length} 条`,
  }),
  createChip({
    key: 'history-recent',
    text: `最近展示 ${Math.min(actionHistory.value.length, 5)} 条`,
  }),
  createChip({
    key: 'history-pending-sync',
    text: '有待同步记录',
    active: true,
    show: Boolean(latestActionHistory.value?.pendingSync),
  }),
]))

const historyPanel = createHistoryPanel({
  key: 'ownership-history-panel',
  title: '最近操作结果',
  description: '最近操作会同步到服务器，可直接回看摘要、结果统计和最近几次执行记录。',
  emptyText: '编辑归属、启停账号或执行批量处理后，结果摘要会显示在这里。',
})

const latestHistoryHighlight = computed(() => {
  const latest = latestActionHistory.value
  if (!latest)
    return null

  return createHistoryHighlight({
    key: `ownership-history-highlight-${latest.id}`,
    title: latest.actionLabel,
    description: buildActionResultMessage(latest),
    detailLines: latest.detailLines || [],
    headerMeta: createHistoryMetaItems([
      createHistoryMetaItem({
        key: 'latest-status',
        text: resolveActionHistoryMeta(latest.status).label,
        surface: 'meta',
        tone: resolveActionHistoryMeta(latest.status).badgeTone,
      }),
      createHistoryMetaItem({
        key: 'latest-time',
        text: formatActionTime(latest.timestamp),
        class: 'ownership-history-meta text-xs',
      }),
    ]),
  })
})

const latestHistoryMetrics = computed(() => {
  const latest = latestActionHistory.value
  if (!latest)
    return []

  return createHistoryMetrics([
    createHistoryMetric({
      key: 'success',
      label: '成功',
      value: latest.successCount,
      class: 'ownership-history-stat ownership-history-stat-success rounded-2xl px-4 py-3 text-center text-sm',
      labelClass: 'text-xs opacity-80',
      valueClass: 'mt-2 text-xl font-semibold',
    }),
    createHistoryMetric({
      key: 'failed',
      label: '失败',
      value: latest.failedCount,
      class: 'ownership-history-stat ownership-history-stat-danger rounded-2xl px-4 py-3 text-center text-sm',
      labelClass: 'text-xs opacity-80',
      valueClass: 'mt-2 text-xl font-semibold',
    }),
    createHistoryMetric({
      key: 'total',
      label: '涉及',
      value: latest.totalCount,
      class: 'ownership-history-stat ownership-history-stat-brand rounded-2xl px-4 py-3 text-center text-sm',
      labelClass: 'text-xs opacity-80',
      valueClass: 'mt-2 text-xl font-semibold',
    }),
  ])
})

const recentHistoryCards = computed(() => createHistoryRecentItems(
  recentActionHistory.value.map(item => createHistoryRecentItem({
    key: item.id,
    title: item.actionLabel,
    subtitle: formatActionTime(item.timestamp),
    description: buildActionResultMessage(item),
    badges: [
      {
        text: resolveActionHistoryMeta(item.status).label,
        surface: 'meta',
        tone: resolveActionHistoryMeta(item.status).badgeTone,
      },
    ],
    detailLines: item.detailLines || [],
    detailLimit: 2,
    copied: copiedHistoryId.value === item.id,
    iconClass: 'i-carbon-copy text-[var(--ui-text-3)]',
    copiedIconClass: 'i-carbon-checkmark-filled ownership-history-copy-icon scale-110',
    class: 'ownership-history-item ownership-history-item-button rounded-2xl px-4 py-3 text-left transition hover:-translate-y-0.5',
    headerClass: 'flex flex-wrap items-center justify-between gap-2',
    titleClass: 'ownership-history-title text-sm font-semibold',
    subtitleClass: 'ownership-history-meta mt-1 text-xs',
    descriptionClass: 'ownership-history-copy mt-3 text-xs leading-5',
    detailsClass: 'ownership-history-details ownership-history-details-compact mt-3',
    detailLineClass: 'ownership-history-detail',
    footerText: getHistoryCopyLabel(item),
    footerClass: 'ownership-history-copy-hint mt-3 text-[11px]',
    footerActiveClass: 'ownership-history-copy-hint-active',
    onClick: () => {
      copyHistorySummaryItem(item)
    },
  })),
))

const primaryToolbarActions = computed(() => createActionButtons([
  createActionButton({
    key: 'toggle-select-all',
    label: selectedAccountIds.value.length === sortedAccounts.value.length && sortedAccounts.value.length ? '取消全选' : '全选当前结果',
    variant: 'secondary',
    size: 'sm',
    onClick: () => {
      toggleSelectAll()
    },
  }),
  createActionButton({
    key: 'batch-start',
    label: '批量启动',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      openBatchConfirm('start')
    },
  }),
  createActionButton({
    key: 'batch-stop',
    label: '批量停止',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      openBatchConfirm('stop')
    },
  }),
  createActionButton({
    key: 'batch-mode',
    label: '批量改模式',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      openBatchConfirm('mode')
    },
  }),
  createActionButton({
    key: 'batch-assign',
    label: '批量转移归属',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      openBatchConfirm('assign')
    },
  }),
  createActionButton({
    key: 'batch-unassign',
    label: '批量取消归属',
    variant: 'outline',
    size: 'sm',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      openBatchConfirm('unassign')
    },
  }),
  createActionButton({
    key: 'copy-selected-markers',
    label: '复制已选标识',
    active: copiedControlKey.value === 'selected-markers',
    activeLabel: '标识已复制',
    iconClass: 'i-carbon-copy mr-1 text-sm',
    activeIconClass: 'i-carbon-checkmark-filled mr-1 text-sm',
    variant: 'outline',
    size: 'sm',
    class: copiedControlKey.value === 'selected-markers' ? 'ownership-copy-button-active' : '',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      copySelectedAccountMarkers()
    },
  }),
  createActionButton({
    key: 'export-current',
    label: '导出当前结果',
    variant: 'outline',
    size: 'sm',
    disabled: !sortedAccounts.value.length,
    onClick: () => {
      exportCurrentAccounts()
    },
  }),
  createActionButton({
    key: 'batch-delete',
    label: '批量删除',
    variant: 'danger',
    size: 'sm',
    disabled: !selectedAccountIds.value.length,
    onClick: () => {
      openBatchConfirm('delete')
    },
  }),
]))

const historyHeaderActions = computed(() => createActionButtons([
  createActionButton({
    key: 'copy-latest-summary',
    label: '复制最近摘要',
    active: copiedControlKey.value === 'latest-summary',
    activeLabel: '最近摘要已复制',
    iconClass: 'i-carbon-copy-file mr-1 text-sm',
    activeIconClass: 'i-carbon-checkmark-filled mr-1 text-sm',
    variant: 'outline',
    size: 'sm',
    class: copiedControlKey.value === 'latest-summary' ? 'ownership-copy-button-active' : '',
    disabled: !latestActionHistory.value,
    onClick: () => {
      copyLatestActionSummary()
    },
  }),
  createActionButton({
    key: 'clear-history',
    label: '清空记录',
    variant: 'ghost',
    size: 'sm',
    disabled: !actionHistory.value.length,
    onClick: () => {
      clearActionHistory()
    },
  }),
]))

const failureActions = computed(() => createActionButtons([
  createActionButton({
    key: 'copy-failure-items',
    label: '复制失败清单',
    active: copiedControlKey.value === 'failure-items',
    activeLabel: '失败清单已复制',
    iconClass: 'i-carbon-copy mr-1 text-sm',
    activeIconClass: 'i-carbon-checkmark-filled mr-1 text-sm',
    variant: 'outline',
    size: 'sm',
    class: copiedControlKey.value === 'failure-items' ? 'ownership-copy-button-active' : '',
    onClick: () => {
      copyFailureItems()
    },
  }),
]))

const pageHeaderActions = computed(() => createActionButtons([
  createActionButton({
    key: 'refresh-ownership',
    label: '刷新归属数据',
    iconClass: 'i-carbon-renew mr-1',
    variant: 'primary',
    loading: loading.value,
    onClick: () => {
      loadData()
    },
  }),
]))

const pageHeaderText = createPageHeaderText({
  key: 'account-ownership-page-header',
  title: '账号归属',
  description: '参考账号管理页的组织方式，补齐搜索筛选、批量治理、归属转移、取消归属和删除等运维动作。',
})

watch([searchKeyword, ownershipFilter, platformFilter, statusFilter, modeFilter], () => {
  const visible = new Set(sortedAccounts.value.map(item => item.id))
  selectedAccountIds.value = selectedAccountIds.value.filter(id => visible.has(id))
  activeActionMenuId.value = ''
})

async function loadData() {
  loading.value = true
  try {
    const [accountRes, userRes] = await Promise.all([
      api.get('/api/accounts'),
      api.get('/api/users'),
    ])
    accounts.value = accountRes.data?.data?.accounts || []
    users.value = userRes.data?.users || []
  }
  finally {
    loading.value = false
  }
}

function normalizeActionHistoryItem(raw: unknown): ActionHistoryItem | null {
  if (!raw || typeof raw !== 'object')
    return null

  const item = raw as Record<string, any>
  const id = String(item.id || '').trim()
  if (!id)
    return null

  const totalCount = Math.max(Number(item.totalCount) || 0, 0)
  const failedCount = Math.max(Number(item.failedCount) || 0, 0)
  const successCount = Math.max(Number(item.successCount) || Math.max(totalCount - failedCount, 0), 0)
  const status = item.status === 'warning' || item.status === 'error' || item.status === 'success'
    ? item.status
    : resolveActionHistoryStatus(successCount, failedCount)

  return {
    id,
    actionLabel: String(item.actionLabel || '').trim() || '未命名操作',
    status,
    timestamp: Number(item.timestamp) || Date.now(),
    totalCount: totalCount || Math.max(successCount + failedCount, 1),
    successCount,
    failedCount,
    affectedNames: Array.isArray(item.affectedNames) ? item.affectedNames.map((name: unknown) => String(name || '').trim()).filter(Boolean).slice(0, 6) : [],
    failedNames: Array.isArray(item.failedNames) ? item.failedNames.map((name: unknown) => String(name || '').trim()).filter(Boolean).slice(0, 6) : [],
    detailLines: Array.isArray(item.detailLines) ? item.detailLines.map((line: unknown) => String(line || '').trim()).filter(Boolean).slice(0, 6) : [],
    pendingSync: Boolean(item.pendingSync),
  }
}

function readLocalActionHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(ACTION_HISTORY_STORAGE_KEY) || '[]')
    return Array.isArray(raw)
      ? raw.map(normalizeActionHistoryItem).filter((item): item is ActionHistoryItem => !!item)
      : []
  }
  catch {
    return []
  }
}

function persistActionHistory() {
  localStorage.setItem(ACTION_HISTORY_STORAGE_KEY, JSON.stringify(actionHistory.value))
}

function mergeActionHistoryItems(...groups: ActionHistoryItem[][]) {
  const map = new Map<string, ActionHistoryItem>()
  for (const group of groups) {
    for (const item of group) {
      if (!item?.id)
        continue
      const existing = map.get(item.id)
      if (!existing || item.timestamp >= existing.timestamp)
        map.set(item.id, item)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, ACTION_HISTORY_LIMIT)
}

function markActionHistorySynced(entryId: string) {
  let changed = false
  actionHistory.value = actionHistory.value.map((item) => {
    if (item.id !== entryId || !item.pendingSync)
      return item
    changed = true
    return { ...item, pendingSync: false }
  })
  if (changed)
    persistActionHistory()
}

async function syncActionHistoryEntry(entry: ActionHistoryItem) {
  try {
    await api.post('/api/admin-operation-logs', {
      id: entry.id,
      scope: ACTION_HISTORY_SCOPE,
      actionLabel: entry.actionLabel,
      status: entry.status,
      totalCount: entry.totalCount,
      successCount: entry.successCount,
      failedCount: entry.failedCount,
      affectedNames: entry.affectedNames,
      failedNames: entry.failedNames,
      detailLines: entry.detailLines || [],
    })
    markActionHistorySynced(entry.id)
    return true
  }
  catch {
    return false
  }
}

async function syncPendingActionHistory(items: ActionHistoryItem[]) {
  for (const item of items) {
    if (!item.pendingSync)
      continue
    await syncActionHistoryEntry(item)
  }
}

async function loadActionHistory() {
  const localItems = readLocalActionHistory()
  actionHistory.value = localItems
  try {
    const response = await api.get('/api/admin-operation-logs', {
      params: {
        scope: ACTION_HISTORY_SCOPE,
        limit: ACTION_HISTORY_LIMIT,
      },
    })
    const remoteItems = Array.isArray(response.data?.data?.items)
      ? response.data.data.items.map(normalizeActionHistoryItem).filter((item: ActionHistoryItem | null): item is ActionHistoryItem => !!item)
      : []
    actionHistory.value = mergeActionHistoryItems(remoteItems, localItems.filter(item => item.pendingSync))
    persistActionHistory()
    void syncPendingActionHistory(localItems)
  }
  catch {
    actionHistory.value = localItems
  }
}

function resolveActionHistoryStatus(successCount: number, failedCount: number): ActionHistoryStatus {
  if (successCount > 0 && failedCount === 0)
    return 'success'
  if (successCount > 0)
    return 'warning'
  return 'error'
}

function pushActionHistory(actionLabel: string, affectedNames: string[], failedNames: string[] = [], detailLines: string[] = []) {
  const entry: ActionHistoryItem = {
    id: `${actionLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionLabel,
    status: resolveActionHistoryStatus(affectedNames.length - failedNames.length, failedNames.length),
    timestamp: Date.now(),
    totalCount: affectedNames.length,
    successCount: Math.max(affectedNames.length - failedNames.length, 0),
    failedCount: failedNames.length,
    affectedNames: affectedNames.slice(0, 6),
    failedNames: failedNames.slice(0, 6),
    detailLines: detailLines.filter(Boolean).slice(0, 6),
    pendingSync: true,
  }
  actionHistory.value = mergeActionHistoryItems([entry], actionHistory.value)
  persistActionHistory()
  void syncActionHistoryEntry(entry)
}

function resolveActionHistoryMeta(status: ActionHistoryStatus) {
  if (status === 'success') {
    return {
      label: '执行成功',
      badgeTone: 'success' as const,
    }
  }
  if (status === 'warning') {
    return {
      label: '部分失败',
      badgeTone: 'warning' as const,
    }
  }
  return {
    label: '执行失败',
    badgeTone: 'danger' as const,
  }
}

function formatOwnerLabel(username?: string) {
  const owner = String(username || '').trim()
  return owner || '未归属 / 系统账号'
}

function formatAccountDisplayName(account?: AccountItem | null) {
  return String(account?.name || account?.nick || account?.id || '未命名账号').trim()
}

function pushChangeDetail(lines: string[], label: string, before: string | number | null | undefined, after: string | number | null | undefined) {
  const previousLabel = String(before ?? '').trim() || '未设置'
  const nextLabel = String(after ?? '').trim() || '未设置'
  if (previousLabel !== nextLabel)
    lines.push(`${label}：${previousLabel} -> ${nextLabel}`)
}

function buildOwnershipChangeDetailLines(before?: AccountItem | null, after?: AccountItem | null) {
  if (!before || !after)
    return []

  const lines: string[] = []
  pushChangeDetail(lines, '账号备注', formatAccountDisplayName(before), formatAccountDisplayName(after))
  pushChangeDetail(lines, '归属', formatOwnerLabel(before.username), formatOwnerLabel(after.username))
  pushChangeDetail(
    lines,
    '模式',
    resolveModeMeta(resolveAccountMode(before.accountMode)).label,
    resolveModeMeta(resolveAccountMode(after.accountMode)).label,
  )
  return lines.slice(0, 6)
}

function buildBatchActionDetailLines(action: BatchOwnershipAction) {
  if (action === 'assign')
    return [`目标归属：${formatOwnerLabel(ownershipTarget.value === '__unowned__' ? '' : ownershipTarget.value)}`]
  if (action === 'unassign')
    return ['目标归属：未归属 / 系统账号']
  if (action === 'mode')
    return [`目标模式：${resolveModeMeta(batchModeTarget.value).label}`]
  if (action === 'start')
    return ['目标运行状态：启动中']
  if (action === 'stop')
    return ['目标运行状态：已停止']
  if (action === 'delete')
    return ['执行方式：逐条删除并汇总失败原因']
  return []
}

function formatActionTime(timestamp: number) {
  if (!timestamp)
    return '刚刚'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

function buildActionResultMessage(item: ActionHistoryItem) {
  const summary = `共 ${item.totalCount} 项，成功 ${item.successCount} 项，失败 ${item.failedCount} 项`
  const successNames = item.affectedNames.filter(name => !item.failedNames.includes(name)).slice(0, 3)
  const failureNames = item.failedNames.slice(0, 3)
  const details = [
    successNames.length ? `成功：${successNames.join('、')}` : '',
    failureNames.length ? `失败：${failureNames.join('、')}` : '',
  ].filter(Boolean)
  return [summary, ...details].join('；')
}

function buildActionCopyText(item: ActionHistoryItem) {
  return [
    `${item.actionLabel} · ${formatActionTime(item.timestamp)}`,
    buildActionResultMessage(item),
    ...(item.detailLines?.length ? ['', ...item.detailLines.map(line => `- ${line}`)] : []),
  ].join('\n')
}

async function clearActionHistory() {
  const previous = [...actionHistory.value]
  actionHistory.value = []
  persistActionHistory()
  try {
    await api.delete('/api/admin-operation-logs', {
      params: {
        scope: ACTION_HISTORY_SCOPE,
      },
    })
    toast.success('最近操作记录已清空')
  }
  catch {
    actionHistory.value = previous
    persistActionHistory()
    toast.error('清空失败，请稍后重试')
  }
}

type CopyTextOptions = CopyInteractionOptions

async function copyLatestActionSummary() {
  const latest = latestActionHistory.value
  if (!latest) {
    toast.warning('暂无最近操作记录可复制')
    return
  }
  await copyText(buildActionCopyText(latest), '最近操作摘要已复制', {
    controlKey: 'latest-summary',
    detail: `${latest.actionLabel} · ${formatActionTime(latest.timestamp)}`,
    historyId: latest.id,
  })
}

function copyHistorySummaryItem(item: ActionHistoryItem) {
  void copyText(buildActionCopyText(item), '操作摘要已复制', {
    detail: `${item.actionLabel} · ${formatActionTime(item.timestamp)}`,
    historyId: item.id,
  })
}

function getHistoryCopyLabel(item: ActionHistoryItem) {
  return copiedHistoryId.value === item.id ? '已复制到剪贴板' : '点击复制本次摘要'
}

function toggleSelectAll() {
  if (selectedAccountIds.value.length === sortedAccounts.value.length) {
    selectedAccountIds.value = []
  }
  else {
    selectedAccountIds.value = sortedAccounts.value.map(item => item.id)
  }
}

function resetFilters() {
  searchKeyword.value = ''
  ownershipFilter.value = 'all'
  platformFilter.value = 'all'
  statusFilter.value = 'all'
  modeFilter.value = 'all'
}

function openOwnershipModal(account: AccountItem) {
  activeActionMenuId.value = ''
  ownershipModalTarget.value = account.id
  ownershipTarget.value = account.username || '__unowned__'
  editingAccountName.value = String(account.name || account.nick || '').trim()
  editingAccountMode.value = resolveAccountMode(account.accountMode)
  ownershipError.value = ''
  showOwnershipModal.value = true
}

async function submitOwnershipChange(targetIds?: string[]) {
  const ids = targetIds?.length ? targetIds : ownershipModalTarget.value ? [ownershipModalTarget.value] : []
  if (!ids.length)
    return { successCount: 0, failures: [] as string[] }

  ownershipSaving.value = true
  ownershipError.value = ''
  try {
    const username = ownershipTarget.value === '__unowned__' ? '' : ownershipTarget.value
    const singleTarget = !targetIds?.length ? accounts.value.find(item => item.id === ids[0]) || null : null
    const affectedNames = ids.map((id) => {
      const target = accounts.value.find(item => item.id === id)
      return target?.name || target?.nick || `账号${id}`
    })
    const failures: string[] = []
    let successCount = 0
    for (const id of ids) {
      const target = accounts.value.find(item => item.id === id)
      const nextName = targetIds?.length
        ? (target?.name || target?.nick || `账号${id}`)
        : (editingAccountName.value.trim() || target?.name || target?.nick || `账号${id}`)
      try {
        await api.post('/api/accounts', {
          id,
          username,
          name: nextName,
        })
        if (!targetIds?.length || ids.length === 1) {
          const currentMode = resolveAccountMode(target?.accountMode)
          if (editingAccountMode.value !== currentMode) {
            await api.post(`/api/accounts/${id}/mode`, {
              mode: editingAccountMode.value,
            })
          }
        }
        successCount += 1
      }
      catch (e: any) {
        const label = target?.name || target?.nick || `账号${id}`
        failures.push(`${label}: ${String(e?.response?.data?.error || e?.message || '保存失败')}`)
      }
    }
    if (!failures.length || targetIds?.length) {
      showOwnershipModal.value = false
      selectedAccountIds.value = []
    }
    await loadData()
    if (targetIds?.length) {
      pushActionHistory(
        batchActionLabel.value,
        affectedNames,
        failures.map(item => item.split(':')[0] || item),
        buildBatchActionDetailLines(batchAction.value),
      )
      if (failures.length) {
        batchFailureTitle.value = `${batchActionLabel.value}失败明细`
        batchFailureItems.value = failures
        showBatchFailureModal.value = true
        toast.success(`批量归属操作已执行，成功 ${successCount} 个，失败 ${failures.length} 个`)
      }
      else {
        toast.success('批量归属操作已完成')
      }
    }
    else if (failures.length) {
      const attemptedTarget = singleTarget
        ? {
            ...singleTarget,
            username,
            name: editingAccountName.value.trim() || singleTarget.name || singleTarget.nick || `账号${singleTarget.id}`,
            accountMode: editingAccountMode.value,
          }
        : null
      const detailLines = buildOwnershipChangeDetailLines(singleTarget, attemptedTarget)
      pushActionHistory(
        '编辑账号归属',
        affectedNames,
        affectedNames,
        detailLines.length ? detailLines : ['保存失败，请检查账号状态或归属权限'],
      )
      ownershipError.value = failures[0] || '保存失败'
    }
    else {
      const updatedTarget = singleTarget ? accounts.value.find(item => item.id === singleTarget.id) || null : null
      const detailLines = buildOwnershipChangeDetailLines(singleTarget, updatedTarget)
      pushActionHistory(
        '编辑账号归属',
        affectedNames,
        [],
        detailLines.length ? detailLines : ['基础信息已重新保存'],
      )
      toast.success('账号信息已保存')
    }
    return { successCount, failures }
  }
  catch (e: any) {
    ownershipError.value = String(e?.response?.data?.error || e?.message || '保存失败')
    return { successCount: 0, failures: [ownershipError.value] }
  }
  finally {
    ownershipSaving.value = false
  }
}

function askDeleteAccount(account: AccountItem) {
  activeActionMenuId.value = ''
  deleteTarget.value = account
  showDeleteConfirm.value = true
}

async function confirmDeleteAccount() {
  if (!deleteTarget.value)
    return

  deleteLoading.value = true
  try {
    const targetLabel = deleteTarget.value.name || deleteTarget.value.nick || deleteTarget.value.id
    const detailLines = [
      `归属：${formatOwnerLabel(deleteTarget.value.username)}`,
      `删除前状态：${resolveAccountState(deleteTarget.value).label}`,
      `删除前模式：${resolveModeMeta(resolveAccountMode(deleteTarget.value.accountMode)).label}`,
    ]
    await api.delete(`/api/accounts/${deleteTarget.value.id}`)
    deleteTarget.value = null
    showDeleteConfirm.value = false
    await loadData()
    pushActionHistory('删除账号', [targetLabel], [], detailLines)
    toast.success('账号已删除')
  }
  finally {
    deleteLoading.value = false
  }
}

async function toggleRuntime(account: AccountItem) {
  activeActionMenuId.value = ''
  runtimeActionId.value = account.id
  try {
    const label = account.name || account.nick || account.id
    if (account.running || account.connected) {
      await api.post(`/api/accounts/${account.id}/stop`)
      pushActionHistory('停止账号', [label], [], [`运行状态：${resolveAccountState(account).label} -> 已停止`])
      toast.success(`已停止 ${account.name || account.nick || account.id}`)
    }
    else {
      await api.post(`/api/accounts/${account.id}/start`)
      pushActionHistory('启动账号', [label], [], [`运行状态：${resolveAccountState(account).label} -> 启动中`])
      toast.success(`已启动 ${account.name || account.nick || account.id}`)
    }
    await loadData()
  }
  finally {
    runtimeActionId.value = ''
  }
}

async function openAccountsPage(account: AccountItem) {
  const nextAccountId = String(account.id || '').trim()
  activeActionMenuId.value = ''
  await accountStore.selectAccount(nextAccountId)
  router.push('/accounts')
}

function toggleActionMenu(accountId: string) {
  activeActionMenuId.value = activeActionMenuId.value === accountId ? '' : accountId
}

function closeActionMenu() {
  activeActionMenuId.value = ''
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text))
    return `"${text.replace(/"/g, '""')}"`
  return text
}

async function copyText(text: string, successMessage: string, options: CopyTextOptions = {}) {
  await copyWithFeedback(text, successMessage, options)
}

function exportTextFile(content: string, filename: string, successMessage: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
  toast.success(successMessage)
}

async function copySelectedAccountMarkers() {
  if (!selectedAccountIds.value.length) {
    toast.warning('请先选择账号')
    return
  }
  const selected = sortedAccounts.value.filter(account => selectedAccountIds.value.includes(account.id))
  const content = selected
    .map(account => `${account.name || account.nick || account.id}\tID:${account.id}\tUIN:${account.uin || '未绑定'}`)
    .join('\n')
  await copyText(content, `已复制 ${selected.length} 个账号标识`, {
    controlKey: 'selected-markers',
  })
}

function exportCurrentAccounts() {
  if (!sortedAccounts.value.length) {
    toast.warning('当前没有可导出的账号')
    return
  }
  const headers = ['账号名称', '账号ID', 'UIN', '所属人', '区服', '平台', '模式', '状态']
  const rows = sortedAccounts.value.map((account) => {
    const modeLabel = resolveModeMeta(resolveAccountMode(account.accountMode)).label
    const stateLabel = resolveAccountState(account).label
    return [
      account.name || account.nick || account.id,
      account.id,
      account.uin || '',
      account.username || '未归属',
      resolveZoneLabel(account.accountZone, account.platform),
      resolvePlatformLabel(account.platform),
      modeLabel,
      stateLabel,
    ].map(escapeCsvCell).join(',')
  })
  const csv = [`\uFEFF${headers.map(escapeCsvCell).join(',')}`, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `account-ownership-${Date.now()}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
  toast.success(`已导出 ${sortedAccounts.value.length} 个账号`)
}

function copyFailureItems() {
  if (!batchFailureItems.value.length) {
    toast.warning('暂无失败清单')
    return
  }
  void copyText(batchFailureItems.value.join('\n'), '失败清单已复制', {
    controlKey: 'failure-items',
  })
}

function exportFailureItems() {
  if (!batchFailureItems.value.length) {
    toast.warning('暂无失败清单')
    return
  }
  exportTextFile(batchFailureItems.value.join('\n'), `account-ownership-failures-${Date.now()}.txt`, '失败清单已导出')
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.ownership-action-menu'))
    closeActionMenu()
}

function openBatchConfirm(action: BatchOwnershipAction) {
  if (!selectedAccountIds.value.length)
    return

  batchAction.value = action
  batchActionLabel.value = action === 'assign'
    ? '批量转移归属'
    : action === 'unassign'
      ? '批量取消归属'
      : action === 'start'
        ? '批量启动账号'
        : action === 'stop'
          ? '批量停止账号'
          : action === 'mode'
            ? '批量切换模式'
            : '批量删除账号'
  if (action === 'assign') {
    ownershipTarget.value = ownerTargetOptions.value[1]?.value || '__unowned__'
  }
  else if (action === 'mode') {
    batchModeTarget.value = 'main'
  }
  else {
    ownershipTarget.value = '__unowned__'
  }
  showBatchConfirm.value = true
}

async function submitBatchAction() {
  if (!batchAction.value || !selectedAccountIds.value.length)
    return

  batchLoading.value = true
  batchFailureItems.value = []
  try {
    if (batchAction.value === 'start' || batchAction.value === 'stop') {
      const affectedNames = selectedAccountIds.value.map((id) => {
        const target = accounts.value.find(item => item.id === id)
        return target?.name || target?.nick || id
      })
      let successCount = 0
      const failures: string[] = []
      const actionName = batchAction.value === 'start' ? 'start' : 'stop'
      for (const id of selectedAccountIds.value) {
        try {
          await api.post(`/api/accounts/${id}/${actionName}`)
          successCount += 1
        }
        catch (e: any) {
          const target = accounts.value.find(item => item.id === id)
          const label = target?.name || target?.nick || id
          failures.push(`${label}: ${String(e?.response?.data?.error || e?.message || '执行失败')}`)
        }
      }
      selectedAccountIds.value = []
      showBatchConfirm.value = false
      await loadData()
      pushActionHistory(
        batchActionLabel.value,
        affectedNames,
        failures.map(item => item.split(':')[0] || item),
        buildBatchActionDetailLines(batchAction.value),
      )
      if (failures.length) {
        batchFailureTitle.value = `${batchActionLabel.value}失败明细`
        batchFailureItems.value = failures
        showBatchFailureModal.value = true
        toast.success(`批量执行完成，成功 ${successCount} 个，失败 ${failures.length} 个`)
      }
      else {
        toast.success(`批量${batchAction.value === 'start' ? '启动' : '停止'}已完成，共 ${successCount} 个`)
      }
      return
    }

    if (batchAction.value === 'delete') {
      const affectedNames = selectedAccountIds.value.map((id) => {
        const target = accounts.value.find(item => item.id === id)
        return target?.name || target?.nick || id
      })
      const failures: string[] = []
      for (const id of selectedAccountIds.value) {
        try {
          await api.delete(`/api/accounts/${id}`)
        }
        catch (e: any) {
          const target = accounts.value.find(item => item.id === id)
          const label = target?.name || target?.nick || id
          failures.push(`${label}: ${String(e?.response?.data?.error || e?.message || '删除失败')}`)
        }
      }
      selectedAccountIds.value = []
      showBatchConfirm.value = false
      await loadData()
      pushActionHistory(
        '批量删除账号',
        affectedNames,
        failures.map(item => item.split(':')[0] || item),
        buildBatchActionDetailLines('delete'),
      )
      if (failures.length) {
        batchFailureTitle.value = '批量删除失败明细'
        batchFailureItems.value = failures
        showBatchFailureModal.value = true
        toast.success(`批量删除已执行，失败 ${failures.length} 项`)
      }
      else {
        toast.success('批量删除已完成')
      }
      return
    }

    if (batchAction.value === 'mode') {
      const affectedNames = selectedAccountIds.value.map((id) => {
        const target = accounts.value.find(item => item.id === id)
        return target?.name || target?.nick || id
      })
      let successCount = 0
      const failures: string[] = []
      for (const id of selectedAccountIds.value) {
        try {
          await api.post(`/api/accounts/${id}/mode`, {
            mode: batchModeTarget.value,
          })
          successCount += 1
        }
        catch (e: any) {
          const target = accounts.value.find(item => item.id === id)
          const label = target?.name || target?.nick || id
          failures.push(`${label}: ${String(e?.response?.data?.error || e?.message || '模式切换失败')}`)
        }
      }
      selectedAccountIds.value = []
      showBatchConfirm.value = false
      await loadData()
      pushActionHistory(
        '批量模式切换',
        affectedNames,
        failures.map(item => item.split(':')[0] || item),
        buildBatchActionDetailLines('mode'),
      )
      if (failures.length) {
        batchFailureTitle.value = '批量模式切换失败明细'
        batchFailureItems.value = failures
        showBatchFailureModal.value = true
        toast.success(`批量模式切换已执行，成功 ${successCount} 个，失败 ${failures.length} 个`)
      }
      else {
        toast.success(`批量模式切换已完成，共 ${successCount} 个`)
      }
      return
    }

    if (batchAction.value === 'unassign')
      ownershipTarget.value = '__unowned__'

    const result = await submitOwnershipChange([...selectedAccountIds.value])
    showBatchConfirm.value = false
    if (result?.failures?.length && !result.successCount) {
      toast.success(`批量归属操作执行失败 ${result.failures.length} 项`)
    }
  }
  finally {
    batchLoading.value = false
  }
}

onMounted(() => {
  loadData()
  loadActionHistory()
  document.addEventListener('click', handleDocumentClick)
  runtimeNowTimer = setInterval(() => {
    runtimeNowTs.value = Date.now()
  }, 30_000)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  if (runtimeNowTimer) {
    clearInterval(runtimeNowTimer)
    runtimeNowTimer = null
  }
})
</script>

<template>
  <BaseManagementPageScaffold
    class="account-ownership-page w-full"
    :header-text="pageHeaderText"
    :header-actions="pageHeaderActions"
  >
    <template #summary>
      <BaseStatCardGrid class="grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <BaseStatCard
          v-for="card in summaryCards"
          :key="card.key"
          class="ownership-summary-card"
          :label="card.label"
          :value="card.value"
          :description="card.description"
          :value-class="card.valueClass"
        />
      </BaseStatCardGrid>
    </template>

    <template #filters>
      <div class="glass-panel ui-filter-panel ownership-filter-panel">
        <BaseFilterFields class="xl:grid-cols-[2.2fr_1fr_1fr_1fr_1fr_auto]" :fields="filterFields" />

        <BaseTableToolbar>
          <template #left>
            <BaseChipList :items="toolbarChips" />
          </template>
          <template #right>
            <BaseBulkActions>
              <BaseActionButtons :actions="primaryToolbarActions" />
            </BaseBulkActions>
          </template>
        </BaseTableToolbar>
      </div>
    </template>

    <template #supporting>
      <BaseHistorySectionLayout
        class="ownership-history-panel"
        :title="historyPanel.title"
        :description="historyPanel.description"
        :actions="historyHeaderActions"
        :title-chips="historyPanel.titleChips"
        :title-meta="historyPanel.titleMeta"
        :highlight="latestHistoryHighlight"
        :metrics="latestHistoryMetrics"
        :recent-items="recentHistoryCards"
        :empty-text="historyPanel.emptyText"
        highlight-section-class="grid gap-3 xl:grid-cols-[1.35fr_0.85fr]"
        :highlight-card-attrs="{
          class: 'ownership-history-highlight rounded-3xl p-4',
          titleClass: 'ownership-history-title mt-3 text-base font-semibold',
          descriptionClass: 'ownership-history-copy mt-3 text-sm leading-6',
          detailsClass: 'ownership-history-details mt-4',
          detailLineClass: 'ownership-history-detail',
        }"
        metrics-class="grid grid-cols-3 gap-3"
        empty-class="ownership-history-empty rounded-3xl border-dashed px-4 py-5 text-sm"
        recent-grid-class="grid gap-3 2xl:grid-cols-4 lg:grid-cols-2"
        recent-copied-class="ownership-history-item-copied"
      >
        <BaseTableToolbar class="mt-3">
          <template #left>
            <BaseChipList :items="historyChips" />
          </template>
        </BaseTableToolbar>
      </BaseHistorySectionLayout>
    </template>

    <template #table>
      <BaseTableSectionCard
        class="ownership-table-panel"
        header-class="ownership-section-head px-4 py-3"
      >
        <template #header-meta>
          <div class="ownership-table-meta ui-section-meta text-sm">
            当前管理员：<span class="ownership-table-meta-strong font-semibold">{{ currentUsername || '未识别' }}</span>
          </div>
        </template>

        <template #mobile>
          <div v-if="loading" class="px-4 py-10 text-center text-sm text-[var(--ui-text-2)] md:hidden">
            正在加载账号归属...
          </div>

          <div v-else-if="sortedAccounts.length" class="ui-mobile-record-list md:hidden">
            <article
              v-for="account in sortedAccounts"
              :key="account.id"
              class="ui-mobile-record-card"
              :class="{ 'ui-mobile-record-card--selected': selectedAccountIds.includes(account.id) }"
            >
              <div class="ui-mobile-record-head">
                <div class="ui-mobile-record-main">
                  <BaseCheckbox
                    :model-value="selectedAccountIds"
                    :value="account.id"
                    class="ui-mobile-record-check"
                    @update:model-value="selectedAccountIds = $event as string[]"
                  />
                  <div class="min-w-0">
                    <div class="ui-mobile-record-title">
                      {{ account.name || account.nick || account.id }}
                    </div>
                    <div class="ui-mobile-record-subtitle">
                      UIN: {{ account.uin || '未绑定' }}
                    </div>
                  </div>
                </div>
                <div class="ui-mobile-record-badges">
                  <BaseBadge surface="meta" :tone="resolveOwnerMeta(account).badgeTone">
                    {{ resolveOwnerMeta(account).label }}
                  </BaseBadge>
                  <BaseBadge surface="meta" :tone="resolveAccountState(account).badgeTone">
                    {{ resolveAccountState(account).label }}
                  </BaseBadge>
                </div>
              </div>

              <div class="ui-mobile-record-body">
                <div class="ui-mobile-record-badges">
                  <BaseBadge surface="meta" :tone="resolveModeMeta(resolveAccountMode(account.accountMode)).badgeTone">
                    配置:{{ resolveModeMeta(resolveAccountMode(account.accountMode)).label }}
                  </BaseBadge>
                  <BaseBadge v-if="resolveModeExecutionMeta(account)" surface="meta" :tone="resolveModeExecutionMeta(account)?.badgeTone">
                    {{ resolveModeExecutionMeta(account)?.label }}
                  </BaseBadge>
                  <BaseBadge
                    v-for="badge in resolveWechatGuardBadges(account)"
                    :key="`${account.id}-${badge.label}`"
                    surface="meta"
                    :tone="badge.tone"
                  >
                    {{ badge.label }}
                  </BaseBadge>
                </div>

                <div class="ui-mobile-record-grid">
                  <div class="ui-mobile-record-field">
                    <div class="ui-mobile-record-label">
                      区服
                    </div>
                    <div class="ui-mobile-record-value">
                      {{ resolveZoneLabel(account.accountZone, account.platform) }}
                    </div>
                  </div>
                  <div class="ui-mobile-record-field">
                    <div class="ui-mobile-record-label">
                      平台
                    </div>
                    <div class="ui-mobile-record-value">
                      {{ resolvePlatformLabel(account.platform) }}
                    </div>
                  </div>
                  <div v-if="resolveModeExecutionMeta(account)?.note" class="ui-mobile-record-field ui-mobile-record-field--full">
                    <div class="ui-mobile-record-label">
                      协同说明
                    </div>
                    <div class="ui-mobile-record-value" :class="resolveModeExecutionMeta(account)?.noteClass">
                      {{ resolveModeExecutionMeta(account)?.note }}
                    </div>
                  </div>
                  <div v-if="resolveWechatGuardNote(account)" class="ui-mobile-record-field ui-mobile-record-field--full">
                    <div class="ui-mobile-record-label">
                      状态说明
                    </div>
                    <div class="ui-mobile-record-value ownership-note-warning">
                      {{ resolveWechatGuardNote(account) }}
                    </div>
                  </div>
                </div>

                <div class="ui-mobile-record-actions">
                  <BaseButton variant="outline" size="sm" @click="openOwnershipModal(account)">
                    编辑归属
                  </BaseButton>
                  <BaseButton variant="outline" size="sm" :disabled="runtimeActionId === account.id" @click="toggleRuntime(account)">
                    {{ account.running || account.connected ? '停止账号' : '启动账号' }}
                  </BaseButton>
                  <BaseButton variant="ghost" size="sm" @click="openAccountsPage(account)">
                    前往账号页
                  </BaseButton>
                  <BaseButton variant="danger" size="sm" @click="askDeleteAccount(account)">
                    删除
                  </BaseButton>
                </div>
              </div>
            </article>
          </div>

          <BaseEmptyState
            v-else
            class="mx-4 my-6 md:hidden"
            icon="i-carbon-user-multiple"
            title="暂无账号数据"
            description="当前筛选条件下没有可管理的账号。"
          />
        </template>

        <BaseDataTable class="hidden overflow-x-auto md:block" table-class="min-w-full text-sm">
          <BaseDataTableHead class="ownership-table-head text-left text-xs tracking-[0.18em] uppercase">
            <tr>
              <BaseDataTableSelectionHeader
                :checked="selectedAccountIds.length === sortedAccounts.length && sortedAccounts.length > 0"
                cell-class="px-4 py-3 font-medium text-left"
                @change="toggleSelectAll"
              />
              <th class="px-4 py-3 font-medium">
                账号
              </th>
              <th class="px-4 py-3 font-medium">
                所属人
              </th>
              <th class="px-4 py-3 font-medium">
                区服 / 平台
              </th>
              <th class="px-4 py-3 font-medium">
                模式
              </th>
              <th class="px-4 py-3 font-medium">
                状态
              </th>
              <th class="px-4 py-3 font-medium">
                操作
              </th>
            </tr>
          </BaseDataTableHead>
          <tbody>
            <BaseDataTableStateRow
              v-if="loading"
              :colspan="7"
              loading
              loading-label="正在加载账号归属..."
              cell-class="px-0"
            />
            <BaseDataTableStateRow
              v-else-if="sortedAccounts.length === 0"
              :colspan="7"
              icon="i-carbon-user-multiple"
              cell-class="px-0"
              empty-class="ownership-empty-state px-4 py-16 text-sm"
            >
              <template #title>
                <div class="ui-empty-state__title">
                  暂无账号数据
                </div>
              </template>
            </BaseDataTableStateRow>
            <tr
              v-for="account in (loading ? [] : sortedAccounts)"
              :key="account.id"
              class="ui-row-hover ownership-table-row transition"
              :class="{ 'ownership-row-selected ui-row-selected': selectedAccountIds.includes(account.id) }"
            >
              <BaseDataTableSelectionCell
                :model-value="selectedAccountIds"
                :value="account.id"
                cell-class="px-4 py-4 align-top"
                @update:model-value="selectedAccountIds = $event as string[]"
              />
              <td class="px-4 py-4 align-top">
                <div class="font-semibold">
                  {{ account.name || account.nick || account.id }}
                </div>
                <div class="ownership-cell-meta mt-1 text-xs">
                  UIN: {{ account.uin || '未绑定' }}
                </div>
              </td>
              <td class="px-4 py-4 align-top">
                <BaseBadge surface="meta" :tone="resolveOwnerMeta(account).badgeTone">
                  {{ resolveOwnerMeta(account).label }}
                </BaseBadge>
              </td>
              <td class="px-4 py-4 align-top">
                <div class="font-medium">
                  {{ resolveZoneLabel(account.accountZone, account.platform) }}
                </div>
                <div class="ownership-cell-meta mt-1 text-xs">
                  {{ resolvePlatformLabel(account.platform) }}
                </div>
              </td>
              <td class="px-4 py-4 align-top">
                <div class="space-y-2">
                  <BaseBadge surface="meta" :tone="resolveModeMeta(resolveAccountMode(account.accountMode)).badgeTone">
                    配置:{{ resolveModeMeta(resolveAccountMode(account.accountMode)).label }}
                  </BaseBadge>
                  <div v-if="resolveModeExecutionMeta(account)" class="flex flex-wrap items-center gap-2">
                    <BaseBadge surface="meta" :tone="resolveModeExecutionMeta(account)?.badgeTone">
                      {{ resolveModeExecutionMeta(account)?.label }}
                    </BaseBadge>
                  </div>
                  <div
                    v-if="resolveModeExecutionMeta(account)?.note"
                    class="text-xs leading-5"
                    :class="resolveModeExecutionMeta(account)?.noteClass"
                  >
                    {{ resolveModeExecutionMeta(account)?.note }}
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 align-top">
                <div class="space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <BaseBadge surface="meta" :tone="resolveAccountState(account).badgeTone">
                      {{ resolveAccountState(account).label }}
                    </BaseBadge>
                    <BaseBadge
                      v-for="badge in resolveWechatGuardBadges(account)"
                      :key="`${account.id}-table-${badge.label}`"
                      surface="meta"
                      :tone="badge.tone"
                    >
                      {{ badge.label }}
                    </BaseBadge>
                  </div>
                  <div v-if="resolveWechatGuardNote(account)" class="ownership-note-warning text-xs leading-5">
                    {{ resolveWechatGuardNote(account) }}
                  </div>
                </div>
              </td>
              <td class="px-4 py-4 align-top">
                <div class="ownership-action-menu">
                  <button
                    class="ownership-action-menu__trigger"
                    :class="{ 'ownership-action-menu__trigger-active': activeActionMenuId === account.id }"
                    title="更多操作"
                    @click.stop="toggleActionMenu(account.id)"
                  >
                    <span class="i-carbon-overflow-menu-horizontal text-base" />
                    <span>更多</span>
                  </button>
                  <div
                    v-if="activeActionMenuId === account.id"
                    class="ownership-action-menu__panel"
                    @click.stop
                  >
                    <button class="ownership-action-menu__item" @click="openOwnershipModal(account)">
                      <span class="i-carbon-user-follow text-base text-sky-500" />
                      <span>编辑归属与模式</span>
                    </button>
                    <button class="ownership-action-menu__item" :disabled="runtimeActionId === account.id" @click="toggleRuntime(account)">
                      <span :class="runtimeActionId === account.id ? 'i-svg-spinners-ring-resize text-amber-500' : ((account.running || account.connected) ? 'i-carbon-stop-filled text-amber-500' : 'i-carbon-play-filled text-emerald-500')" class="text-base" />
                      <span>{{ account.running || account.connected ? '停止账号' : '启动账号' }}</span>
                    </button>
                    <button class="ownership-action-menu__item" @click="openAccountsPage(account)">
                      <span class="i-carbon-launch text-base text-primary-500" />
                      <span>前往账号页</span>
                    </button>
                    <button class="ownership-action-menu__item ownership-action-menu__item-danger" @click="askDeleteAccount(account)">
                      <span class="i-carbon-trash-can text-base" />
                      <span>删除账号</span>
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </BaseDataTable>
      </BaseTableSectionCard>
    </template>
  </BaseManagementPageScaffold>

  <ConfirmModal
    :show="showOwnershipModal"
    title="编辑账号"
    confirm-text="保存设置"
    cancel-text="取消"
    :loading="ownershipSaving"
    @confirm="submitOwnershipChange()"
    @cancel="showOwnershipModal = false"
  >
    <div class="text-left space-y-4">
      <BaseInput
        v-model="editingAccountName"
        label="账号备注"
        placeholder="输入账号显示名称"
      />
      <BaseSelect v-model="ownershipTarget" label="归属目标" :options="ownerTargetOptions" />
      <BaseSelect v-model="editingAccountMode" label="账号模式" :options="editModeOptions" />
      <p class="ownership-dialog-copy text-xs leading-5">
        设为“取消归属”后，该账号会回到系统账号池，方便后续重新分配。
      </p>
      <p v-if="ownershipError" class="text-sm text-[var(--ui-status-danger)] font-medium">
        {{ ownershipError }}
      </p>
    </div>
  </ConfirmModal>

  <ConfirmModal
    :show="showDeleteConfirm"
    title="删除账号"
    type="danger"
    confirm-text="确认删除"
    cancel-text="取消"
    :loading="deleteLoading"
    @confirm="confirmDeleteAccount"
    @cancel="showDeleteConfirm = false"
  >
    <p class="ownership-dialog-copy text-sm leading-6">
      将删除账号 <span class="ownership-dialog-strong font-semibold">{{ deleteTarget?.name || deleteTarget?.nick || deleteTarget?.id }}</span>，该操作不可恢复。
    </p>
  </ConfirmModal>

  <ConfirmModal
    :show="showBatchConfirm"
    :title="batchActionLabel"
    :type="batchAction === 'delete' ? 'danger' : 'primary'"
    :confirm-text="batchAction === 'delete' ? '确认执行' : '立即执行'"
    cancel-text="取消"
    :loading="batchLoading"
    @confirm="submitBatchAction"
    @cancel="showBatchConfirm = false"
  >
    <div class="text-left space-y-4">
      <p class="ownership-dialog-copy text-sm leading-6">
        将对 <span class="ownership-dialog-strong font-semibold">{{ selectedAccountIds.length }}</span> 个账号执行「{{ batchActionLabel }}」。
      </p>
      <BaseSelect
        v-if="batchAction === 'assign'"
        v-model="ownershipTarget"
        label="批量归属目标"
        :options="ownerTargetOptions"
      />
      <BaseSelect
        v-if="batchAction === 'mode'"
        v-model="batchModeTarget"
        label="目标模式"
        :options="editModeOptions"
      />
      <p v-if="batchAction === 'start' || batchAction === 'stop'" class="ownership-dialog-copy text-xs leading-5">
        系统会逐个执行并汇总结果，部分账号失败不会中断整批操作。
      </p>
      <p v-if="batchAction === 'mode'" class="ownership-dialog-copy text-xs leading-5">
        将对已选账号统一设置执行模式，并保留失败明细，方便后续二次处理。
      </p>
    </div>
  </ConfirmModal>

  <ConfirmModal
    :show="showBatchFailureModal"
    :title="batchFailureTitle"
    confirm-text="我知道了"
    is-alert
    @confirm="showBatchFailureModal = false"
    @cancel="showBatchFailureModal = false"
  >
    <div class="text-left">
      <p class="ownership-dialog-copy text-sm leading-6">
        以下账号执行失败，请按原因逐项处理：
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <BaseActionButtons :actions="failureActions" />
        <BaseButton variant="ghost" size="sm" @click="exportFailureItems">
          导出失败清单
        </BaseButton>
      </div>
      <div class="mt-4 max-h-72 overflow-y-auto space-y-2">
        <div
          v-for="item in batchFailureItems"
          :key="item"
          class="ownership-failure-item rounded-2xl px-4 py-3 text-sm leading-6"
        >
          {{ item }}
        </div>
      </div>
    </div>
  </ConfirmModal>
</template>

<style scoped>
.account-ownership-page {
  color: var(--ui-text-1);
}

.ownership-summary-card,
.ownership-filter-panel,
.ownership-history-panel,
.ownership-table-panel {
  border: 1px solid var(--ui-border-subtle);
  background: linear-gradient(
    140deg,
    color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent),
    color-mix(in srgb, var(--ui-bg-surface) 82%, transparent)
  );
  box-shadow:
    0 18px 50px color-mix(in srgb, var(--ui-shadow-panel) 16%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 28%, transparent);
}

.ownership-summary-card {
  padding: 1.15rem 1.2rem;
  border-radius: 1.35rem;
}

.ownership-cell-meta,
.ownership-table-meta,
.ownership-empty-state,
.ownership-dialog-copy,
.ownership-note-muted {
  color: var(--ui-text-2);
}

.ownership-table-meta-strong,
.ownership-dialog-strong {
  color: var(--ui-text-1);
}

.ownership-note-info {
  color: var(--ui-status-info);
}

.ownership-note-warning {
  color: var(--ui-status-warning);
}

.ownership-history-title {
  color: var(--ui-text-1);
}

.ownership-history-copy,
.ownership-history-meta,
.ownership-history-empty {
  color: var(--ui-text-2);
}

.ownership-history-highlight,
.ownership-history-item {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
}

.ownership-history-details {
  display: grid;
  gap: 0.55rem;
}

.ownership-history-details-compact {
  gap: 0.45rem;
}

.ownership-history-detail {
  position: relative;
  padding-left: 1rem;
  color: var(--ui-text-2);
  font-size: 0.82rem;
  line-height: 1.55;
}

.ownership-history-detail::before {
  content: '';
  position: absolute;
  top: 0.45rem;
  left: 0;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-brand-500) 72%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-brand-500) 14%, transparent);
}

.ownership-history-empty {
  border: 1px dashed var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 56%, transparent);
}

.ownership-history-stat {
  border: 1px solid transparent;
}

.ownership-history-stat-success {
  background: color-mix(in srgb, var(--ui-status-success) 10%, transparent);
  color: var(--ui-status-success);
}

.ownership-history-stat-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, transparent);
  color: var(--ui-status-danger);
}

.ownership-history-stat-brand {
  background: color-mix(in srgb, var(--ui-brand-500) 10%, transparent);
  color: var(--ui-brand-700);
}

.ownership-row-selected {
  background: color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface) 92%);
}

.ownership-table-head {
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent);
  color: var(--ui-text-2);
}

.ownership-table-row {
  border-top: 1px solid var(--ui-border-subtle);
}

.ownership-failure-item {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent);
}

.ownership-action-menu {
  position: relative;
  display: inline-flex;
}

.ownership-action-menu__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.2rem;
  padding: 0 0.85rem;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent);
  color: var(--ui-text-2);
  font-size: 0.8rem;
  font-weight: 700;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.ownership-action-menu__trigger:hover,
.ownership-action-menu__trigger-active {
  transform: translateY(-1px);
  color: var(--ui-brand-700);
  border-color: color-mix(in srgb, var(--ui-brand-500) 24%, var(--ui-border-subtle) 76%);
  background: color-mix(in srgb, var(--ui-brand-500) 10%, transparent);
}

.ownership-action-menu__panel {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  z-index: 20;
  min-width: 12rem;
  padding: 0.5rem;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 96%, transparent);
  box-shadow:
    0 20px 45px color-mix(in srgb, var(--ui-shadow-panel) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent);
  backdrop-filter: blur(18px);
}

.ownership-action-menu__item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.5rem;
  padding: 0 0.8rem;
  border-radius: 0.85rem;
  color: var(--ui-text-1);
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.ownership-action-menu__item:hover:not(:disabled) {
  transform: translateX(1px);
  background: color-mix(in srgb, var(--ui-brand-500) 8%, transparent);
}

.ownership-action-menu__item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ownership-action-menu__item-danger {
  color: var(--ui-status-danger);
}

.ownership-action-menu__panel {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  z-index: 20;
  min-width: 12rem;
  padding: 0.5rem;
  border: 1px solid var(--ui-border-subtle);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 96%, transparent);
  box-shadow:
    0 20px 45px color-mix(in srgb, var(--ui-shadow-panel) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent);
  backdrop-filter: blur(18px);
}

.ownership-action-menu__item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  min-height: 2.5rem;
  padding: 0 0.8rem;
  border-radius: 0.85rem;
  color: var(--ui-text-1);
  font-size: 0.85rem;
  font-weight: 600;
  text-align: left;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.ownership-action-menu__item:hover:not(:disabled) {
  transform: translateX(1px);
  background: color-mix(in srgb, var(--ui-brand-500) 8%, transparent);
}

.ownership-action-menu__item:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ownership-action-menu__item-danger {
  color: var(--ui-status-danger);
}

.ownership-action-menu__item-danger:hover {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, transparent) !important;
}

.ownership-copy-button-active {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, transparent) !important;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-status-success) 9%, var(--ui-bg-surface-raised) 91%),
    color-mix(in srgb, var(--ui-brand-soft-12) 44%, var(--ui-bg-surface) 56%)
  ) !important;
  color: color-mix(in srgb, var(--ui-status-success) 80%, var(--ui-text-1)) !important;
  box-shadow:
    0 14px 30px color-mix(in srgb, var(--ui-status-success) 16%, transparent),
    0 0 0 1px color-mix(in srgb, var(--ui-status-success) 12%, transparent) !important;
}

.ownership-history-item-button {
  border: 1px solid transparent;
}

.ownership-history-item-copied {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, transparent);
  background: color-mix(in srgb, var(--ui-status-success) 8%, var(--ui-bg-surface) 92%);
  box-shadow:
    0 18px 36px -24px color-mix(in srgb, var(--ui-status-success) 28%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--ui-status-success) 10%, transparent);
}

.ownership-history-copy-icon {
  color: var(--ui-status-success);
}

.ownership-history-copy-hint {
  color: var(--ui-text-3);
  transition:
    color 160ms ease,
    transform 160ms ease;
}

.ownership-history-copy-hint-active {
  color: var(--ui-status-success);
  transform: translateX(1px);
}

.account-ownership-page :is([class*='text-'][class*='gray-500'], [class*='text-'][class*='gray-400']) {
  color: var(--ui-text-2) !important;
}

.account-ownership-page
  :is(
    [class*='text-'][class*='gray-900'],
    [class*='text-'][class*='gray-800'],
    [class*='text-'][class*='gray-100'],
    [class*='text-'][class*='slate-200'],
    [class*='text-'][class*='slate-700']
  ) {
  color: var(--ui-text-1) !important;
}

.account-ownership-page [class*='border-'][class*='gray-200/'],
.account-ownership-page [class*='border-'][class*='gray-200'],
.account-ownership-page [class*='dark:border-'][class*='white/'],
.account-ownership-page [class*='dark:border-'][class*='gray-'] {
  border-color: var(--ui-border-subtle) !important;
}

.account-ownership-page [class*='bg-'][class*='black/3'],
.account-ownership-page [class*='bg-'][class*='white/5'],
.account-ownership-page [class*='bg-'][class*='white/6'],
.account-ownership-page [class*='bg-'][class*='white/8'],
.account-ownership-page [class*='bg-'][class*='gray-50/'],
.account-ownership-page [class*='bg-'][class*='gray-100/'] {
  background: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent) !important;
}

.account-ownership-page [class*='hover:bg-'][class*='black/5']:hover,
.account-ownership-page [class*='hover:bg-'][class*='white/10']:hover,
.account-ownership-page [class*='hover:bg-'][class*='gray-100/80']:hover {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent) !important;
}

.account-ownership-page .sticky.top-0 {
  background: color-mix(in srgb, var(--ui-bg-canvas) 88%, transparent) !important;
  color: var(--ui-text-1) !important;
}
</style>
