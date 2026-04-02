<script setup lang="ts">
import { useIntervalFn, useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import PastoralQuickPanel from '@/components/PastoralQuickPanel.vue'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useFarmStore } from '@/stores/farm'
import { useFriendStore } from '@/stores/friend'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { buildCropAtlasMap, loadCropAtlasEntries } from '@/utils/crop-atlas'
import {
  clearPastoralReminderSnooze,
  clearPastoralWorkflowMemory,
  readPastoralPlantBatchTemplate,
  readPastoralPlantCycleTemplate,
  readPastoralPlantRecommendStrategy,
  readPastoralReminderSnooze,
  readPastoralRememberedRoute,
  readPastoralSidebarCollapsed,
  readPastoralSidebarWidth,
  readPastoralWorkflowMemory,
  writePastoralPlantBatchTemplate,
  writePastoralPlantCycleTemplate,
  writePastoralPlantRecommendStrategy,
  writePastoralReminderSnooze,
  writePastoralSidebarCollapsed,
  writePastoralSidebarWidth,
  writePastoralWorkflowMemory,
  type PastoralPlantBatchTemplate,
  type PastoralPlantCycleTemplate,
  type PastoralPlantRecommendStrategy,
  type PastoralReminderSnooze,
  type PastoralWorkflowMemory,
  type PastoralWorkflowRetryCareOperation,
  type PastoralWorkflowRetryFertilizerOperation,
  type PastoralWorkflowRetryPlantOperation,
} from '@/utils/pastoral-view'
import { useAvatar } from '@/utils/avatar'

type QuickActionTarget = { name: string, query?: Record<string, string> }
type QuickActionKey = 'bag' | 'friends' | 'task' | 'visitor'
type QuickActionConfig = {
  key: QuickActionKey
  label: string
  hint: string
  icon: string
  target: QuickActionTarget
}
type BagCategory = 'fruit' | 'seed' | 'fertilizer' | 'pack' | 'pet' | 'item'
type LandCareTag = 'water' | 'weed' | 'bug'
type LandActionType = 'harvest' | 'water' | 'weed' | 'bug'
type FriendActionType = 'steal' | 'water' | 'weed' | 'bug'
type LandTargetStartOptions = { presetLandIds?: number[] }
type PastoralAutoCareActionType = 'water' | 'weed' | 'bug'
type PastoralAutoPlantPlanOperation = {
  seed: any
  landIds: number[]
  count: number
}
type PastoralRetryMemoryState = {
  memory: PastoralWorkflowMemory
  sameAccount: boolean
  hasRetryableFailures: boolean
  retrySummary: string
  strategySummary: string
  title: string
  detail: string
}
type PastoralSuggestionActionKey =
  | 'retry-memory'
  | 'auto-care'
  | 'auto-harvest'
  | 'auto-plant'
  | 'open-seeds'
  | 'open-friends'
  | 'refresh-stage'
  | 'open-settings'
  | 'return-console'
type PastoralSuggestionCard = {
  key: string
  eyebrow: string
  title: string
  detail: string
  tone: 'danger' | 'warning' | 'brand' | 'success' | 'neutral'
  actionKey: PastoralSuggestionActionKey
  actionLabel: string
  disabled: boolean
  loading: boolean
}
type PastoralReminderState = {
  tone: 'danger' | 'warning' | 'brand' | 'success' | 'muted'
  title: string
  detail: string
  meta: string
  primaryActionKey: PastoralSuggestionActionKey
  primaryActionLabel: string
  primaryDisabled: boolean
  primaryLoading: boolean
  snoozed: boolean
  snoozeLabel: string
}
type PastoralAutoPlantPlan = {
  canApply: boolean
  disabledReason: string
  operations: PastoralAutoPlantPlanOperation[]
  targetCount: number
  leftoverCount: number
  heldEmptyCount: number
  targetPreview: string
  seedSummary: string
  detailText: string
  templateNote: string
  spotlightIncluded: boolean
  primarySeed: any
  secondarySeed: any
}
type PastoralAutoCareOperation = {
  type: PastoralAutoCareActionType
  landIds: number[]
  label: string
}
type PastoralAutoFertilizerOperation = {
  itemId: number
  landIds: number[]
  count: number
  label: string
  tone: 'normal' | 'organic'
}
type PastoralProjectedFertilizerCandidate = {
  landId: number
  source: 'existing' | 'planned'
  label: string
  profitScore: number
  speedScore: number
  longScore: number
  plannedBoost: number
}
type PastoralAutoCareWorkflowPlan = {
  canApply: boolean
  disabledReason: string
  harvestCount: number
  harvestLandIds: number[]
  replantPlan: PastoralAutoPlantPlan
  careOperations: PastoralAutoCareOperation[]
  fertilizerOperations: PastoralAutoFertilizerOperation[]
  careSummary: string
  fertilizerSummary: string
  detailText: string
  templateNote: string
}
type PastoralAnnouncement = {
  id?: number
  title: string
  content: string
  version?: string
  publish_date?: string
  enabled?: boolean
  createdAt?: string
  updatedAt?: string
}

const PLANT_RECOMMENDATION_OPTIONS: Array<{
  key: PastoralPlantRecommendStrategy
  label: string
  hint: string
  summary: string
}> = [
  {
    key: 'profit',
    label: '金币优先',
    hint: '先看单位时间收益，再兼顾成熟速度与库存。',
    summary: '当前按“金币效率 / 成熟速度 / 库存余量”综合排序',
  },
  {
    key: 'exp',
    label: '经验优先',
    hint: '更适合冲经验等级，收益与速度作为辅助参考。',
    summary: '当前按“经验效率 / 金币效率 / 成熟速度”综合排序',
  },
  {
    key: 'speed',
    label: '极速成熟',
    hint: '优先挑成熟更快的种子，适合频繁回收与补种。',
    summary: '当前按“成熟速度 / 金币效率 / 经验效率”综合排序',
  },
]

const PLANT_BATCH_TEMPLATE_OPTIONS: Array<{
  key: PastoralPlantBatchTemplate
  label: string
  hint: string
  summary: string
}> = [
  {
    key: 'top1',
    label: '全种第一名',
    hint: '把当前推荐第一的种子尽量铺满所有可补种空地。',
    summary: '当前按推荐第一名做整片补种，适合快速统一经营。',
  },
  {
    key: 'rotate2',
    label: '轮种前两名',
    hint: '让前两名种子交替落地，适合兼顾收益与节奏。',
    summary: '当前会让前两名种子轮流补地，避免全田过于单一。',
  },
  {
    key: 'reserve2',
    label: '留两块空地',
    hint: '先补大部分空地，但保留 2 块给后续临时策略或手动种植。',
    summary: '当前会主动保留 2 块空地，方便后面切换种植策略。',
  },
]

const PLANT_CYCLE_TEMPLATE_OPTIONS: Array<{
  key: PastoralPlantCycleTemplate
  label: string
  hint: string
  summary: string
}> = [
  {
    key: 'short',
    label: '短周期轮转',
    hint: '更偏向成熟更快的种子，适合高频收获和频繁回田。',
    summary: '当前额外偏向短线轮转，会给成熟更快的种子更高加分。',
  },
  {
    key: 'idle',
    label: '长周期挂机',
    hint: '更偏向成熟更慢但省心的种子，适合长时间挂着跑。',
    summary: '当前额外偏向挂机节奏，会给成熟更久的种子更高加分。',
  },
  {
    key: 'gold',
    label: '金币冲刺',
    hint: '更偏向金币效率，适合当前想快速把产出往金币上推。',
    summary: '当前额外偏向冲金节奏，会给金币效率更高的种子更高加分。',
  },
]

const PASTORAL_SIDE_WIDTH_MIN = 320
const PASTORAL_SIDE_WIDTH_MAX = 520
const PASTORAL_SIDE_WIDTH_DEFAULT = 380

const router = useRouter()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const farmStore = useFarmStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const toastStore = useToastStore()
const { getAvatarUrl, markFailed } = useAvatar()

const { accounts, currentAccountId, currentAccount } = storeToRefs(accountStore)
const { items, dashboardItems, actionLoading: bagActionLoading } = storeToRefs(bagStore)
const { lands, summary, seeds: shopSeeds, bagSeeds, loading: farmLoading, operatingLandIds } = storeToRefs(farmStore)
const { friends, blacklist, interactRecords, interactLoading, interactError, seedCacheLoading } = storeToRefs(friendStore)
const { status, logs, dailyGifts, realtimeConnected, loading: statusLoading, announcementUpdateTrigger } = storeToRefs(statusStore)

const nextFarmCheck = ref('--')
const nextFriendCheck = ref('--')
const localUptime = ref(0)
const hydrated = ref(false)
const quickPanelKey = ref<QuickActionKey | ''>('')
const quickPanelBusy = ref(false)
const rememberedConsoleRoute = ref(readPastoralRememberedRoute())
const sidePanelCollapsed = ref(readPastoralSidebarCollapsed())
const sidePanelWidth = ref(readPastoralSidebarWidth() || PASTORAL_SIDE_WIDTH_DEFAULT)
const workflowMemory = ref<PastoralWorkflowMemory | null>(readPastoralWorkflowMemory())
const reminderSnooze = ref<PastoralReminderSnooze | null>(readPastoralReminderSnooze())
const pastoralMainGridRef = ref<HTMLElement | null>(null)
const sidePanelResizeDragging = ref(false)
const stageRefreshLoading = ref(false)
const hoveredLandRow = ref(-1)
const recentLandSweepIds = ref<Record<number, number>>({})
const landActionLoadingMap = ref<Record<string, LandActionType>>({})
const friendActionLoadingMap = ref<Record<string, FriendActionType>>({})
const panelActionLoadingMap = ref<Record<string, boolean>>({})
const bagEntryLoadingMap = ref<Record<string, boolean>>({})
const landTargetItem = ref<any | null>(null)
const selectedTargetLandIds = ref<number[]>([])
const landTargetApplying = ref(false)
const plantSeedLoading = ref(false)
const plantSeedPaletteExpanded = ref(false)
const plantSpotlightLandId = ref<number | null>(null)
const plantRecommendStrategy = ref<PastoralPlantRecommendStrategy>(readPastoralPlantRecommendStrategy())
const plantBatchTemplate = ref<PastoralPlantBatchTemplate>(readPastoralPlantBatchTemplate())
const plantCycleTemplate = ref<PastoralPlantCycleTemplate>(readPastoralPlantCycleTemplate())
const announcements = ref<PastoralAnnouncement[]>([])
const announcementLoading = ref(false)
const autoPlantApplying = ref(false)
const autoHarvestReplantApplying = ref(false)
const autoCareWorkflowApplying = ref(false)
const retryRememberedWorkflowApplying = ref(false)
const cropAtlasLoading = ref(false)
const cropAtlasLoaded = ref(false)
const cropAtlasBySeedId = ref<Record<number, any>>({})
const reminderNow = ref(Date.now())
const { width: windowWidth } = useWindowSize()

const localNextFarmRemainSec = ref(0)
const localNextFriendRemainSec = ref(0)

function normalizePastoralSidebarWidth(width: number) {
  const numericWidth = Math.round(Number(width) || PASTORAL_SIDE_WIDTH_DEFAULT)
  return Math.min(PASTORAL_SIDE_WIDTH_MAX, Math.max(PASTORAL_SIDE_WIDTH_MIN, numericWidth))
}

const pastoralLandGridColumns = computed(() => {
  if (windowWidth.value <= 639)
    return 1
  if (windowWidth.value <= 959)
    return 2
  if (windowWidth.value <= 1535)
    return 4
  return 6
})

const canResizePastoralSidebar = computed(() => {
  return !!pastoralMainGridRef.value && !sidePanelCollapsed.value && windowWidth.value > 1535
})
const sidePanelWidthLabel = computed(() => `${normalizePastoralSidebarWidth(sidePanelWidth.value)}px`)
const pastoralMainGridStyle = computed(() => {
  if (!canResizePastoralSidebar.value)
    return undefined

  return {
    gridTemplateColumns: `minmax(0, 1fr) ${normalizePastoralSidebarWidth(sidePanelWidth.value)}px`,
  }
})

function updatePastoralSidebarWidthFromPointer(clientX: number) {
  const mainGridElement = pastoralMainGridRef.value
  if (!mainGridElement)
    return

  const rect = mainGridElement.getBoundingClientRect()
  sidePanelWidth.value = normalizePastoralSidebarWidth(rect.right - clientX)
}

function handlePastoralSidebarPointerMove(event: PointerEvent) {
  if (!sidePanelResizeDragging.value)
    return

  event.preventDefault()
  updatePastoralSidebarWidthFromPointer(event.clientX)
}

function stopPastoralSidebarResize() {
  if (!sidePanelResizeDragging.value)
    return

  sidePanelResizeDragging.value = false
  window.removeEventListener('pointermove', handlePastoralSidebarPointerMove)
  window.removeEventListener('pointerup', stopPastoralSidebarResize)
  window.removeEventListener('pointercancel', stopPastoralSidebarResize)
  document.body.style.removeProperty('cursor')
  document.body.style.removeProperty('user-select')
}

function resetPastoralSidebarWidth() {
  sidePanelWidth.value = PASTORAL_SIDE_WIDTH_DEFAULT
}

function startPastoralSidebarResize(event: PointerEvent) {
  if (!canResizePastoralSidebar.value)
    return

  event.preventDefault()
  sidePanelResizeDragging.value = true
  updatePastoralSidebarWidthFromPointer(event.clientX)
  window.addEventListener('pointermove', handlePastoralSidebarPointerMove)
  window.addEventListener('pointerup', stopPastoralSidebarResize)
  window.addEventListener('pointercancel', stopPastoralSidebarResize)
  document.body.style.setProperty('cursor', 'col-resize')
  document.body.style.setProperty('user-select', 'none')
}

const quickActions: QuickActionConfig[] = [
  {
    key: 'bag',
    label: '仓库',
    hint: '打开仓库弹层，先看库存摘要，再决定是否进入完整页。',
    icon: '/dashboard-assets/warehouse-entry.png',
    target: { name: 'personal', query: { tab: 'bag' } },
  },
  {
    key: 'friends',
    label: '好友',
    hint: '打开好友弹层，先看可偷与待帮扶摘要，再进入完整页。',
    icon: '/dashboard-assets/friend-entry-dog.png',
    target: { name: 'friends' },
  },
  {
    key: 'task',
    label: '任务',
    hint: '打开任务弹层，先看成长任务进度和今日领取状态。',
    icon: '/dashboard-assets/task-entry-mail-open.png',
    target: { name: 'personal', query: { tab: 'task' } },
  },
  {
    key: 'visitor',
    label: '访客',
    hint: '打开访客弹层，先看最近互动，再切到完整访客页。',
    icon: '/dashboard-assets/shop-entry.png',
    target: { name: 'personal', query: { tab: 'visitor' } },
  },
]

const LAND_TARGET_INTERACTIONS = new Set([
  'water',
  'erasegrass',
  'killbug',
  'harvest',
  'erase',
  'plant',
  'fertilizer',
  'fertilizerpro',
])

const OPERATION_LABELS: Record<string, string> = {
  harvest: '收获',
  water: '浇水',
  weed: '除草',
  bug: '除虫',
  fertilize: '施肥',
  plant: '种植',
  upgrade: '土地升级',
  levelUp: '账号升级',
  steal: '偷菜',
  helpWater: '帮浇水',
  helpWeed: '帮除草',
  helpBug: '帮除虫',
  taskClaim: '任务',
  sell: '出售',
}

const LAND_LEVEL_LABELS: Record<number, string> = {
  0: '普通地',
  1: '黄土地',
  2: '红土地',
  3: '黑土地',
  4: '金土地',
}

const rememberedConsoleRouteLabel = computed(() => rememberedConsoleRoute.value?.label || '概览')
const canRunDirectActions = computed(() =>
  !!String(currentAccountId.value || '').trim()
  && !!currentAccount.value?.running
  && !!status.value?.connection?.connected,
)

const growth = computed(() => dailyGifts.value?.growth || null)
const growthTasks = computed(() => Array.isArray(growth.value?.tasks) ? growth.value.tasks : [])
const taskAutoEnabled = computed(() => {
  const gifts = Array.isArray(dailyGifts.value?.gifts) ? dailyGifts.value.gifts : []
  return gifts.some((gift: any) => gift?.key === 'task_claim' && gift?.enabled)
})
const pendingTaskCount = computed(() => growthTasks.value.filter(task => !isTaskCompleted(task)).length)

const visitorLogs = computed(() => {
  const source = Array.isArray(logs.value) ? logs.value : []
  return source
    .filter((entry: any) => String(entry?.meta?.event || '') === 'visitor')
    .slice(-6)
    .reverse()
})

const visitorSummary = computed(() => {
  let weed = 0
  let insect = 0
  let steal = 0
  for (const entry of visitorLogs.value) {
    const result = String(entry?.meta?.result || '')
    if (result === 'weed')
      weed++
    else if (result === 'insect')
      insect++
    else if (result === 'steal')
      steal++
  }
  return {
    total: visitorLogs.value.length,
    weed,
    insect,
    steal,
  }
})

const bagCategoryCounts = computed(() => {
  const counts: Record<BagCategory, number> = {
    fruit: 0,
    seed: 0,
    fertilizer: 0,
    pack: 0,
    pet: 0,
    item: 0,
  }
  for (const item of Array.isArray(items.value) ? items.value : []) {
    counts[resolveBagCategory(item)]++
  }
  return counts
})

const topBagItems = computed(() => {
  return [...(Array.isArray(items.value) ? items.value : [])]
    .sort((a: any, b: any) => {
      const countDiff = Number(b?.count || 0) - Number(a?.count || 0)
      if (countDiff !== 0)
        return countDiff
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
    })
    .slice(0, 6)
})

const friendSummary = computed(() => {
  let steal = 0
  let care = 0
  for (const friend of Array.isArray(friends.value) ? friends.value : []) {
    const plant = friend?.plant || {}
    steal += Number(plant?.stealNum || 0)
    care += Number(plant?.dryNum || 0) + Number(plant?.weedNum || 0) + Number(plant?.insectNum || 0)
  }
  return {
    total: Array.isArray(friends.value) ? friends.value.length : 0,
    blacklisted: Array.isArray(blacklist.value) ? blacklist.value.length : 0,
    steal,
    care,
  }
})

const emptyStageOverviewCards = computed(() => [
  {
    key: 'connection',
    label: '连接状态',
    value: status.value?.connection?.connected ? '在线' : '离线',
    tone: status.value?.connection?.connected ? 'is-success' : 'is-warning',
  },
  {
    key: 'runtime',
    label: '账号运行',
    value: currentAccount.value?.running ? '已启动' : '未启动',
    tone: currentAccount.value?.running ? 'is-brand' : 'is-neutral',
  },
  {
    key: 'lands',
    label: '地块数据',
    value: sortedLands.value.length > 0 ? `${sortedLands.value.length} 块` : '待同步',
    tone: sortedLands.value.length > 0 ? 'is-brand' : 'is-neutral',
  },
  {
    key: 'next-farm',
    label: '农场巡查',
    value: nextFarmCheck.value,
    tone: status.value?.connection?.connected ? 'is-success' : 'is-neutral',
  },
])

const emptyStagePreviewPlots = computed(() => ([
  { key: 'plot-1', name: '1号地', phase: '待补水', tone: 'is-water' },
  { key: 'plot-2', name: '2号地', phase: '生长中', tone: 'is-grow' },
  { key: 'plot-3', name: '3号地', phase: '待收成', tone: 'is-ready' },
  { key: 'plot-4', name: '4号地', phase: '待同步', tone: 'is-empty' },
  { key: 'plot-5', name: '5号地', phase: '成熟提醒', tone: 'is-ready' },
  { key: 'plot-6', name: '6号地', phase: '病虫巡查', tone: 'is-alert' },
  { key: 'plot-7', name: '7号地', phase: '阶段整理', tone: 'is-grow' },
  { key: 'plot-8', name: '8号地', phase: '等待回流', tone: 'is-empty' },
]))

const topFriends = computed(() => {
  return [...(Array.isArray(friends.value) ? friends.value : [])]
    .sort((a: any, b: any) => getFriendUrgencyScore(b) - getFriendUrgencyScore(a))
    .slice(0, 6)
})

const friendBatchActions = computed(() => {
  const configs: Array<{ type: FriendActionType, label: string, tone: 'warning' | 'info' | 'success' | 'danger' }> = [
    { type: 'steal', label: '一键偷菜', tone: 'warning' },
    { type: 'water', label: '批量浇水', tone: 'info' },
    { type: 'weed', label: '批量除草', tone: 'success' },
    { type: 'bug', label: '批量除虫', tone: 'danger' },
  ]
  return configs
    .map((item) => {
      const ids = getFriendBatchTargetIds(item.type)
      return {
        ...item,
        ids,
        count: ids.length,
      }
    })
    .filter(item => item.count > 0)
})

const visitorInteractList = computed(() => {
  return Array.isArray(interactRecords.value) ? interactRecords.value.slice(0, 8) : []
})

const visitorInteractSummary = computed(() => {
  let steal = 0
  let help = 0
  let bad = 0
  for (const record of visitorInteractList.value) {
    const actionType = Number(record?.actionType || 0)
    if (actionType === 1)
      steal++
    else if (actionType === 2)
      help++
    else if (actionType === 3)
      bad++
  }
  return {
    total: visitorInteractList.value.length,
    steal,
    help,
    bad,
  }
})

const activeQuickAction = computed(() => quickActions.find(item => item.key === quickPanelKey.value) || null)

const quickPanelContent = computed(() => {
  const action = activeQuickAction.value
  if (!action)
    return null

  if (action.key === 'bag') {
    return {
      tone: 'bag' as const,
      title: '仓库田园抽屉',
      subtitle: '先在田园风弹层里查看当前背包结构、常用库存和化肥储备；带选地语义的道具可以直接切到主舞台点选土地。',
      hint: '这一层先做库存预览、主舞台选地和路径导向，复杂批量治理仍保留在完整仓库页。',
      emptyTitle: '当前背包里还没有可展示的库存',
      emptyDescription: '账号在线后会把种子、果实、化肥和其它道具同步到这里。',
      metrics: [
        { key: 'all', label: '库存种类', value: Array.isArray(items.value) ? items.value.length : 0, tone: 'info' as const },
        { key: 'fruit', label: '果实', value: bagCategoryCounts.value.fruit, tone: 'warning' as const },
        { key: 'seed', label: '种子', value: bagCategoryCounts.value.seed, tone: 'success' as const },
        { key: 'fertilizer', label: '化肥', value: bagCategoryCounts.value.fertilizer, tone: 'neutral' as const },
      ],
      actions: [
        {
          key: 'bag:refresh',
          label: '刷新仓库',
          tone: 'info' as const,
          disabled: !String(currentAccountId.value || '').trim() || isPanelActionLoading('bag:refresh'),
          loading: isPanelActionLoading('bag:refresh'),
        },
        {
          key: 'bag:sell-policy',
          label: '按策略出售',
          tone: 'warning' as const,
          disabled: !canRunDirectActions.value || bagActionLoading.value || isPanelActionLoading('bag:sell-policy'),
          loading: bagActionLoading.value || isPanelActionLoading('bag:sell-policy'),
        },
      ],
      entries: topBagItems.value.map((item: any) => {
        const directUse = canUseBagItemDirectly(item)
        const landTargetUse = itemNeedsLandTargetSelection(item)
        return {
          key: `bag-${item?.id || item?.name}`,
          title: item?.name || `物品 ${item?.id || '-'}`,
          subtitle: `${getBagCategoryLabel(resolveBagCategory(item))} · 持有 x${Number(item?.count || 0)}`,
          meta: String(item?.hoursText || item?.desc || item?.summary || item?.interactionType || '背包常用物品').trim(),
          image: String(item?.image || '').trim(),
          badge: getBagItemFallbackLabel(item),
          tone: 'bag' as const,
          actionLabel: landTargetUse ? '去选地' : directUse ? '直接使用' : '',
          actionKey: landTargetUse ? buildBagTargetActionKey(item?.id) : directUse ? buildBagUseActionKey(item?.id) : '',
          actionDisabled: landTargetUse
            ? !canRunDirectActions.value || landTargetApplying.value
            : directUse
                ? !canRunDirectActions.value || isBagEntryActionLoading(item?.id)
                : true,
          actionLoading: landTargetUse ? false : directUse ? isBagEntryActionLoading(item?.id) : false,
        }
      }),
    }
  }

  if (action.key === 'friends') {
    return {
      tone: 'friends' as const,
      title: '好友巡查抽屉',
      subtitle: '这里先看好友总量、可偷菜密度和待帮扶压力，再决定要不要切去完整好友页面做批量操作。',
      hint: '完整好友批量操作、屏蔽与缓存治理仍保留在原页面，这里先把最重要的巡查摘要提上来。',
      emptyTitle: '当前还没有同步到好友列表',
      emptyDescription: '打开弹层时我会尝试抓取好友数据；如果账号离线，也会尽量回退到已有缓存。',
      metrics: [
        { key: 'total', label: '好友总数', value: friendSummary.value.total, tone: 'info' as const },
        { key: 'steal', label: '可偷菜', value: friendSummary.value.steal, tone: 'warning' as const },
        { key: 'care', label: '待帮扶', value: friendSummary.value.care, tone: 'success' as const },
        { key: 'blacklisted', label: '已屏蔽', value: friendSummary.value.blacklisted, tone: 'neutral' as const },
      ],
      actions: friendBatchActions.value.map(item => ({
        key: `friends-batch:${item.type}`,
        label: `${item.label} ${item.count}`,
        tone: item.tone,
        disabled: !canRunDirectActions.value || item.count <= 0 || isPanelActionLoading(`friends-batch:${item.type}`),
        loading: isPanelActionLoading(`friends-batch:${item.type}`),
      })),
      entries: topFriends.value.map((friend: any) => {
        const actionMeta = getFriendQuickAction(friend)
        return {
          key: `friend-${friend?.gid || friend?.name}`,
          title: String(friend?.name || friend?.nick || `好友 ${friend?.gid || '-'}`).trim(),
          subtitle: `Lv.${getFriendLevel(friend)} · ${getFriendStatusText(friend)}`,
          meta: blacklist.value.includes(Number(friend?.gid || 0))
            ? '当前已加入屏蔽名单'
            : `GID ${Number(friend?.gid || 0) || '-'}`,
          image: getFriendAvatar(friend),
          badge: String(friend?.name || '好友').trim().slice(0, 2) || '好友',
          tone: 'friends' as const,
          actionLabel: actionMeta?.label,
          actionKey: actionMeta ? buildFriendActionKey(friend?.gid, actionMeta.type) : '',
          actionDisabled: actionMeta
            ? !canRunDirectActions.value || isFriendActionLoading(friend?.gid, actionMeta.type)
            : true,
          actionLoading: actionMeta ? isFriendActionLoading(friend?.gid, actionMeta.type) : false,
        }
      }),
    }
  }

  if (action.key === 'task') {
    return {
      tone: 'task' as const,
      title: '成长任务抽屉',
      subtitle: '先看成长任务推进度、今日完成数和自动领奖开关状态，避免每次都切到完整任务页。',
      hint: '田园弹层里先展示成长任务主线，完整奖励面板和每日收益明细继续在原任务页承载。',
      emptyTitle: '当前还没有同步到成长任务',
      emptyDescription: '账号在线后会自动回填任务进度和每日奖励领取状态。',
      metrics: [
        { key: 'total', label: '总任务', value: growth.value?.totalCount || growthTasks.value.length || 0, tone: 'info' as const },
        { key: 'done', label: '今日完成', value: growth.value?.completedCount || 0, tone: 'success' as const },
        { key: 'pending', label: '待推进', value: pendingTaskCount.value, tone: 'warning' as const },
        { key: 'auto', label: '自动领奖', value: taskAutoEnabled.value ? '已开' : '未开', tone: taskAutoEnabled.value ? 'success' as const : 'neutral' as const },
      ],
      actions: [
        {
          key: 'task:refresh',
          label: '刷新任务',
          tone: 'info' as const,
          disabled: !String(currentAccountId.value || '').trim() || isPanelActionLoading('task:refresh'),
          loading: isPanelActionLoading('task:refresh'),
        },
        {
          key: 'task:settings',
          label: taskAutoEnabled.value ? '领奖设置' : '开启自动领奖',
          tone: taskAutoEnabled.value ? 'neutral' as const : 'success' as const,
          disabled: isPanelActionLoading('task:settings'),
          loading: isPanelActionLoading('task:settings'),
        },
      ],
      entries: growthTasks.value.slice(0, 6).map((task: any, idx: number) => ({
        key: `task-${idx}`,
        title: String(task?.desc || task?.name || `任务 ${idx + 1}`).trim(),
        subtitle: formatTaskProgress(task),
        meta: isTaskCompleted(task) ? '这条任务今天已经完成' : '继续经营农场和好友互动会推进这条任务',
        badge: isTaskCompleted(task) ? '完成' : '推进',
        tone: 'task' as const,
      })),
    }
  }

  const usingInteractRecords = visitorInteractList.value.length > 0

  return {
    tone: 'visitor' as const,
    title: '访客纪事抽屉',
    subtitle: usingInteractRecords
      ? '这层会优先展示专用访客互动记录，补足谁来过、做了什么和大致发生时间。'
      : '最近的偷菜、放草、放虫和普通访客事件会在这里先做一层田园式纪要，不必每次都切去完整日志页。',
    hint: usingInteractRecords
      ? '优先使用专用访客互动记录；如果接口暂不可用，就自动回退到日志纪事流。'
      : '这里用最近访客事件构成轻量纪事流，完整日志筛选仍保留在原访客页和日志页。',
    emptyTitle: '最近还没有访客事件',
    emptyDescription: String(interactError.value || '').trim() || '等好友互动、偷菜、放草或放虫后，这里会自动按时间倒序汇总。',
    metrics: usingInteractRecords
      ? [
          { key: 'total', label: '最近互动', value: visitorInteractSummary.value.total, tone: 'info' as const },
          { key: 'steal', label: '偷菜', value: visitorInteractSummary.value.steal, tone: 'danger' as const },
          { key: 'help', label: '帮忙', value: visitorInteractSummary.value.help, tone: 'success' as const },
          { key: 'bad', label: '捣乱', value: visitorInteractSummary.value.bad, tone: 'warning' as const },
        ]
      : [
          { key: 'total', label: '最近事件', value: visitorSummary.value.total, tone: 'info' as const },
          { key: 'steal', label: '偷菜', value: visitorSummary.value.steal, tone: 'danger' as const },
          { key: 'weed', label: '放草', value: visitorSummary.value.weed, tone: 'success' as const },
          { key: 'insect', label: '放虫', value: visitorSummary.value.insect, tone: 'warning' as const },
        ],
    actions: [
      {
        key: 'visitor:refresh',
        label: '刷新访客',
        tone: 'info' as const,
        disabled: !String(currentAccountId.value || '').trim() || interactLoading.value || isPanelActionLoading('visitor:refresh'),
        loading: interactLoading.value || isPanelActionLoading('visitor:refresh'),
      },
      {
        key: 'visitor:seed-friends',
        label: '访客补缓存',
        tone: 'success' as const,
        disabled: !canRunDirectActions.value || seedCacheLoading.value || isPanelActionLoading('visitor:seed-friends'),
        loading: seedCacheLoading.value || isPanelActionLoading('visitor:seed-friends'),
      },
    ],
    entries: usingInteractRecords
      ? visitorInteractList.value.map((record: any, idx: number) => ({
          key: String(record?.key || `visitor-interact-${idx}`),
          title: String(record?.nick || `GID:${record?.visitorGid || '-'}`).trim(),
          subtitle: `${getInteractActionLabel(Number(record?.actionType || 0))} · ${formatInteractTime(record?.serverTimeMs)}`,
          meta: String(record?.actionDetail || record?.actionLabel || '最近的互动事件').trim(),
          image: getInteractAvatar(record),
          badge: getInteractActionLabel(Number(record?.actionType || 0)),
          tone: 'visitor' as const,
        }))
      : visitorLogs.value.map((log: any, idx: number) => ({
          key: `visitor-${log?.ts || idx}`,
          title: String(log?.msg || '访客事件').trim() || '访客事件',
          subtitle: `${formatTimeLabel(log?.time)} · ${getVisitorTypeText(String(log?.meta?.result || ''))}`,
          meta: [
            Number(log?.meta?.landId || 0) > 0 ? `${Number(log?.meta?.landId || 0)} 号土地` : '',
            Number(log?.meta?.gid || 0) > 0 ? `GID ${Number(log?.meta?.gid || 0)}` : '',
          ].filter(Boolean).join(' · ') || '最近的互动事件',
          badge: getVisitorTypeText(String(log?.meta?.result || '')),
          tone: 'visitor' as const,
        })),
  }
})

const farmStageEmptyState = computed(() => {
  if (!currentAccountId.value) {
    return {
      key: 'no-account',
      eyebrow: '等待入场',
      title: '还没有选择账号',
      description: '先回到概览页切换一个账号，或者直接去配置页确认默认运行账号，田园舞台就会自动接入对应数据。',
      tone: 'warning',
      icon: 'i-carbon-user-follow',
      previewTitle: '先把经营入口和田地编排预热起来',
      previewDescription: '即使还没选账号，也可以先从右侧快捷入口熟悉路径，等账号接入后这里会直接切进真实地块。',
    }
  }

  if (statusLoading.value && !hydrated.value) {
    return {
      key: 'loading',
      eyebrow: '同步中',
      title: '正在整理田园舞台',
      description: '正在从主程序抓取账号状态、背包摘要和地块信息，这一层会在数据回流后自动铺开。',
      tone: 'info',
      icon: 'i-svg-spinners-ring-resize',
      previewTitle: '经营编排已经就位',
      previewDescription: '快捷入口和地块框架先保持在位，等同步完成后会切换成真实作物和操作按钮。',
    }
  }

  if (!currentAccount.value?.running) {
    return {
      key: 'not-running',
      eyebrow: '等待启动',
      title: '账号还没有开始经营',
      description: '当前账号已选中，但还没有进入运行态。先启动账号，再回到这里查看土地、巡查与好友互动。',
      tone: 'warning',
      icon: 'i-carbon-play-outline',
      previewTitle: '先安排好进入经营后的工作流',
      previewDescription: '右侧保留了田园快捷入口，你可以先预览仓库、好友和任务路径，启动账号后这里就不再空场。',
    }
  }

  if (!status.value?.connection?.connected) {
    return {
      key: 'offline',
      eyebrow: '离线快照',
      title: '账号当前离线',
      description: '田园视图已经接入真实账号，但当前链路还没在线，所以先展示经营概况与预排版，不把舞台留成一大块空白。',
      tone: 'warning',
      icon: 'i-carbon-cloud-offline',
      previewTitle: '离线时先看经营编排',
      previewDescription: '等账号重新连上后，迷你地块预览会替换成真实土地卡片，右侧收起轨道也能继续当成快速操作栏。',
    }
  }

  if (farmLoading.value && sortedLands.value.length === 0) {
    return {
      key: 'loading-lands',
      eyebrow: '载入地块',
      title: '正在拉取土地数据',
      description: '土地数据马上就到，这里先用预览编排占住舞台位置，避免页面在加载阶段显得空。',
      tone: 'info',
      icon: 'i-svg-spinners-ring-resize',
      previewTitle: '地块正在回流',
      previewDescription: '巡查摘要和快捷入口会先顶上来，真实地块同步回来后再切入完整经营面板。',
    }
  }

  if (sortedLands.value.length === 0) {
    return {
      key: 'no-lands',
      eyebrow: '等待土地',
      title: '当前还没有同步到土地',
      description: '页面骨架已经准备好，只差主程序把地块数据回传过来。先保留预览舞台，等真实土地回来就直接替换。',
      tone: 'warning',
      icon: 'i-carbon-warning-alt',
      previewTitle: '先预热这轮经营布局',
      previewDescription: '你仍然可以从右侧入口先进入仓库、任务或好友页，不需要等地块完全回来再开始操作。',
    }
  }

  return null
})

const displayName = computed(() => {
  const gameName = String(status.value?.status?.name || '').trim()
  if (gameName)
    return gameName
  return currentAccount.value?.name || currentAccount.value?.nick || '未命名账号'
})

const accountAvatarUrl = computed(() =>
  getAvatarUrl({
    avatar: currentAccount.value?.avatar,
    uin: currentAccount.value?.uin,
    platform: currentAccount.value?.platform,
  }, 100),
)

const accountProgressText = computed(() => {
  const current = Number(status.value?.levelProgress?.current || 0)
  const needed = Number(status.value?.levelProgress?.needed || 0)
  if (!needed)
    return '0 / 0'
  return `${current} / ${needed}`
})

const accountProgressPercent = computed(() => {
  const current = Number(status.value?.levelProgress?.current || 0)
  const needed = Number(status.value?.levelProgress?.needed || 0)
  if (!needed)
    return 0
  return Math.max(0, Math.min(100, (current / needed) * 100))
})

const expRate = computed(() => {
  const gain = Number(status.value?.sessionExpGained || 0)
  const uptime = Number(status.value?.uptime || 0)
  if (!uptime)
    return '0/时'
  const rate = gain / Math.max(uptime / 3600, 1e-6)
  return `${Math.floor(rate)}/时`
})

const fertilizerNormal = computed(() =>
  (Array.isArray(dashboardItems.value) ? dashboardItems.value : []).find((item: any) => Number(item?.id || 0) === 1011),
)

const fertilizerOrganic = computed(() =>
  (Array.isArray(dashboardItems.value) ? dashboardItems.value : []).find((item: any) => Number(item?.id || 0) === 1012),
)

const normalFertilizerHours = computed(() => parseFertilizerHours(fertilizerNormal.value))
const organicFertilizerHours = computed(() => parseFertilizerHours(fertilizerOrganic.value))

const resourceCards = computed(() => [
  {
    key: 'gold',
    label: '金币',
    icon: '/dashboard-assets/icon-gold.png',
    value: formatCompactNumber(Number(status.value?.status?.gold || 0)),
  },
  {
    key: 'coupon',
    label: '点券',
    icon: '/dashboard-assets/icon-coupon.png',
    value: formatCompactNumber(Number(status.value?.status?.coupon || 0)),
  },
  {
    key: 'exp',
    label: '总经验',
    icon: '/dashboard-assets/icon-exp.png',
    value: formatCompactNumber(Number(status.value?.status?.exp || 0)),
  },
  {
    key: 'fertilizer-normal',
    label: '普通化肥',
    icon: '',
    tone: 'is-normal',
    value: formatBucketTime(fertilizerNormal.value),
  },
  {
    key: 'bean',
    label: '金豆豆',
    icon: '/dashboard-assets/icon-bean.png',
    value: formatCompactNumber(Number(status.value?.status?.goldBean || 0)),
  },
  {
    key: 'fertilizer-organic',
    label: '有机化肥',
    icon: '',
    tone: 'is-organic',
    value: formatBucketTime(fertilizerOrganic.value),
  },
])

const runtimeLogEntries = computed(() => {
  const source = Array.isArray(logs.value) ? logs.value : []
  return source
    .slice(-3)
    .reverse()
    .map((entry: any, index: number) => ({
      key: `${Number(entry?.ts || 0)}-${String(entry?.msg || '').trim()}-${index}`,
      time: formatRuntimeLogTime(entry?.time),
      tag: getRuntimeLogTag(entry),
      tagTone: getRuntimeLogTagTone(entry),
      event: formatRuntimeLogEvent(entry?.meta?.event),
      msg: String(entry?.msg || '').trim() || '暂无日志内容',
    }))
})

function getPastoralAnnouncementTimestamp(entry: PastoralAnnouncement) {
  return Number(
    Date.parse(String(entry.publish_date || '').trim())
    || Date.parse(String(entry.updatedAt || '').trim())
    || Date.parse(String(entry.createdAt || '').trim())
    || Number(entry.id || 0)
    || 0,
  )
}

function formatPastoralAnnouncementDate(value?: string) {
  const raw = String(value || '').trim()
  return raw || '未标注日期'
}

function formatPastoralAnnouncementPreview(value?: string, maxLength = 120) {
  const compact = String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')

  if (!compact)
    return '暂无公告正文，等待新公告同步。'
  if (compact.length <= maxLength)
    return compact
  return `${compact.slice(0, maxLength).trimEnd()}...`
}

const pastoralAnnouncementEntries = computed(() =>
  [...announcements.value]
    .filter(entry => entry.enabled !== false && String(entry.title || '').trim())
    .sort((a, b) => getPastoralAnnouncementTimestamp(b) - getPastoralAnnouncementTimestamp(a)),
)

const featuredAnnouncement = computed(() => pastoralAnnouncementEntries.value[0] || null)

const secondaryAnnouncements = computed(() =>
  pastoralAnnouncementEntries.value
    .slice(1, 3)
    .map((entry) => ({
      key: String(entry.id || `${getPastoralAnnouncementTimestamp(entry)}-${String(entry.title || '').trim()}`),
      title: String(entry.title || '').trim() || '未命名公告',
      meta: String(entry.version || '').trim() || formatPastoralAnnouncementDate(entry.publish_date),
      preview: formatPastoralAnnouncementPreview(entry.content, 54),
    })),
)

const farmSummaryCards = computed(() => [
  { key: 'harvestable', label: '可收', value: Number(summary.value?.harvestable || 0), tone: 'is-warning' },
  { key: 'growing', label: '生长', value: Number(summary.value?.growing || 0), tone: 'is-brand' },
  { key: 'empty', label: '空闲', value: Number(summary.value?.empty || 0), tone: 'is-neutral' },
  { key: 'dead', label: '枯萎', value: Number(summary.value?.dead || 0), tone: 'is-danger' },
])

const operationCards = computed(() => {
  const operations = (status.value?.operations && typeof status.value.operations === 'object')
    ? status.value.operations
    : {}

  const preferred = ['harvest', 'water', 'weed', 'bug', 'fertilize', 'taskClaim']
  const rows = preferred.map((key) => {
    const value = Number(operations[key] || 0)
    return {
      key,
      label: OPERATION_LABELS[key] || key,
      value,
    }
  })

  const positives = rows.filter(item => item.value > 0)
  return (positives.length ? positives : rows).slice(0, 4)
})

const todayOverviewCards = computed(() => [
  {
    key: 'uptime',
    label: '在线时长',
    value: formatDuration(localUptime.value),
    tone: 'is-brand',
  },
  {
    key: 'exp-rate',
    label: '经验效率',
    value: expRate.value,
    tone: 'is-info',
  },
  {
    key: 'tasks-done',
    label: '今日任务',
    value: `${Number(growth.value?.completedCount || 0)}/${Number(growth.value?.totalCount || growthTasks.value.length || 0)}`,
    tone: 'is-success',
  },
  {
    key: 'realtime',
    label: '链路模式',
    value: realtimeConnected.value ? '实时在线' : '快照模式',
    tone: realtimeConnected.value ? 'is-success' : 'is-neutral',
  },
])

const todayOperationCards = computed(() => {
  const operations = (status.value?.operations && typeof status.value.operations === 'object')
    ? status.value.operations
    : {}

  return ['harvest', 'water', 'weed', 'bug', 'fertilize', 'taskClaim'].map((key) => ({
    key,
    label: OPERATION_LABELS[key] || key,
    value: formatCompactNumber(Number(operations[key] || 0)),
    tone: Number(operations[key] || 0) > 0 ? 'is-brand' : 'is-neutral',
  }))
})

const todayLandCards = computed(() => [
  { key: 'harvestable', label: '可收', value: formatCompactNumber(Number(summary.value?.harvestable || 0)), tone: 'is-warning' },
  { key: 'growing', label: '生长', value: formatCompactNumber(Number(summary.value?.growing || 0)), tone: 'is-brand' },
  { key: 'empty', label: '空闲', value: formatCompactNumber(Number(summary.value?.empty || 0)), tone: 'is-neutral' },
  { key: 'dead', label: '枯萎', value: formatCompactNumber(Number(summary.value?.dead || 0)), tone: 'is-danger' },
])

const sortedLands = computed(() => {
  if (!status.value?.connection?.connected)
    return []

  const rows = Array.isArray(lands.value) ? [...lands.value] : []
  return rows.sort((a: any, b: any) => {
    const scoreDiff = getLandUrgencyScore(b) - getLandUrgencyScore(a)
    if (scoreDiff !== 0)
      return scoreDiff
    return Number(a?.id || 0) - Number(b?.id || 0)
  })
})

const emptyLandCount = computed(() =>
  sortedLands.value.filter((land: any) => String(land?.status || '') === 'empty').length,
)

const hasEmptyLands = computed(() => emptyLandCount.value > 0)

const harvestableLands = computed(() =>
  sortedLands.value.filter((land: any) => String(land?.status || '') === 'harvestable'),
)

const harvestableLandCount = computed(() => harvestableLands.value.length)
const hasHarvestableLands = computed(() => harvestableLandCount.value > 0)
const hasPlantWorkflowLands = computed(() => hasEmptyLands.value || hasHarvestableLands.value)
const careAlertLands = computed(() =>
  sortedLands.value.filter((land: any) => hasLandCareAlert(land)),
)
const careAlertLandCount = computed(() => careAlertLands.value.length)
const almostReadyLandCount = computed(() =>
  sortedLands.value.filter((land: any) => isLandAlmostReady(land)).length,
)
const deadLandCount = computed(() =>
  sortedLands.value.filter((land: any) => String(land?.status || '') === 'dead').length,
)
const urgentFriendActionCount = computed(() =>
  friendBatchActions.value.reduce((total, item) => total + Number(item?.count || 0), 0),
)

const plantWorkflowEyebrow = computed(() => {
  if (hasEmptyLands.value && hasHarvestableLands.value)
    return '收获接力补种'
  if (hasEmptyLands.value)
    return '空地速种'
  return '成熟回补'
})

const plantWorkflowTitle = computed(() => {
  if (hasEmptyLands.value && hasHarvestableLands.value)
    return `当前有 ${emptyLandCount.value} 块空地可直接补种，另有 ${harvestableLandCount.value} 块成熟地可收完接着回补`
  if (hasEmptyLands.value)
    return `当前还有 ${emptyLandCount.value} 块空地可直接补种`
  return `当前有 ${harvestableLandCount.value} 块成熟地可自动收获后回补`
})

const plantWorkflowDescription = computed(() => {
  if (plantSpotlightLand.value)
    return plantSpotlightLabel.value
  if (hasEmptyLands.value && hasHarvestableLands.value)
    return '可以直接对现有空地执行补种，也可以把成熟地收完后按同一套策略连续回补。'
  if (hasEmptyLands.value)
    return '空地已经就位，打开种子带后可以直接按当前策略批量补种。'
  return '当前没有空地，但成熟地收获后会立刻并入补种计划，不需要再手动来回切页面。'
})

const plantSpotlightLand = computed(() => {
  const targetId = Number(plantSpotlightLandId.value || 0)
  if (!targetId)
    return null
  return sortedLands.value.find((land: any) => Number(land?.id || 0) === targetId) || null
})

const plantSpotlightLabel = computed(() => {
  if (!plantSpotlightLand.value)
    return '当前未锁定具体空地，选种后可继续在主舞台补选空地。'
  return `当前聚焦 ${Number(plantSpotlightLand.value?.id || 0)} 号空地，选种后会先带着这块地进入主舞台选地模式。`
})

const prioritizedEmptyLands = computed(() => {
  const rows = sortedLands.value.filter((land: any) => String(land?.status || '') === 'empty')
  const spotlightId = Number(plantSpotlightLandId.value || 0)
  if (!spotlightId)
    return rows
  const spotlightLand = rows.find((land: any) => Number(land?.id || 0) === spotlightId)
  if (!spotlightLand)
    return rows
  return [spotlightLand, ...rows.filter((land: any) => Number(land?.id || 0) !== spotlightId)]
})

const fertilizerSupportPlan = computed(() => {
  const normalHours = normalFertilizerHours.value
  const organicHours = organicFertilizerHours.value
  const normalReady = normalHours > 0.1
  const organicReady = organicHours > 0.1
  const growingLands = sortedLands.value.filter((land: any) => {
    return !isEmptyLand(land) && !isLandReady(land) && String(land?.status || '') !== 'dead'
  })
  const growingCount = growingLands.length
  const rushCount = growingLands.filter((land: any) => {
    const matureInSec = Number(land?.matureInSec || 0)
    return matureInSec > 0 && matureInSec <= 2 * 3600
  }).length
  const longCycleCount = growingLands.filter((land: any) => Number(land?.matureInSec || 0) >= 4 * 3600).length
  const careCount = growingLands.filter((land: any) => hasLandCareAlert(land)).length
  const inventoryLine = `普通 ${formatFertilizerReserveLabel(normalHours)} · 有机 ${formatFertilizerReserveLabel(organicHours)}`

  if (!growingCount) {
    return {
      title: '当前更适合先补种再看用肥',
      summary: '现在没有正在生长的地块，化肥协同会在补种完成后更有参考价值。',
      note: `库存：${inventoryLine}`,
      emphasis: '先补种后补肥',
      toneClass: 'is-neutral',
      normalLabel: formatFertilizerReserveLabel(normalHours),
      organicLabel: formatFertilizerReserveLabel(organicHours),
      planNote: '化肥联动：当前暂无正在生长地块，建议补种后再决定是否追肥。',
    }
  }

  const stabilizerLine = careCount > 0
    ? `当前有 ${careCount} 块地待照料，建议先处理浇水/除草/除虫，再上肥更稳。`
    : rushCount > 0
      ? `当前有 ${rushCount} 块快成熟地，短线作物不必重肥追时长。`
      : '当前地块状态稳定，可以按模板推进施肥节奏。'

  if (plantCycleTemplate.value === 'idle') {
    return {
      title: organicReady ? '长周期挂机优先把有机化肥留给慢熟地' : '长周期挂机先省肥，普通化肥只做兜底',
      summary: organicReady
        ? `当前有 ${longCycleCount || growingCount} 块偏长周期地块，更适合把有机化肥压给挂机主力。`
        : '有机化肥暂缺时，长周期模板更适合少量用普通化肥，避免把短线库存提前打空。',
      note: `${stabilizerLine} 库存：${inventoryLine}`,
      emphasis: organicReady ? '挂机地优先有机' : '挂机先省肥',
      toneClass: 'is-idle',
      normalLabel: formatFertilizerReserveLabel(normalHours),
      organicLabel: formatFertilizerReserveLabel(organicHours),
      planNote: organicReady
        ? '化肥联动：长周期挂机优先把有机化肥留给慢熟地，普通化肥只做兜底提速。'
        : '化肥联动：当前缺有机化肥，长周期模板建议先省肥，必要时再少量补普通化肥。',
    }
  }

  if (plantCycleTemplate.value === 'gold') {
    return {
      title: organicReady ? '金币冲刺优先把有机化肥压给高收益地' : '金币冲刺先用普通化肥兜住节奏',
      summary: organicReady
        ? '当前模板更看重收益效率，有机化肥更适合留给利润更高、成熟更久的主力作物。'
        : '有机化肥不足时，先用普通化肥给高收益地补一层节奏，避免完全裸跑。',
      note: `${stabilizerLine} 库存：${inventoryLine}`,
      emphasis: organicReady ? '冲金优先有机' : '冲金普通兜底',
      toneClass: 'is-gold',
      normalLabel: formatFertilizerReserveLabel(normalHours),
      organicLabel: formatFertilizerReserveLabel(organicHours),
      planNote: organicReady
        ? '化肥联动：金币冲刺优先把有机化肥留给高收益主力地块，普通化肥给次优地兜底。'
        : '化肥联动：当前缺有机化肥，金币冲刺先用普通化肥兜住高收益地的成熟节奏。',
    }
  }

  return {
    title: normalReady ? '短周期轮转优先用普通化肥补节奏' : '短周期轮转先裸跑，高收益地再考虑有机化肥',
    summary: normalReady
      ? `当前有 ${rushCount || growingCount} 块偏短线地块，普通化肥更适合拿来补轮转节奏。`
      : '短周期模板本身已经偏向快熟种子，没有普通化肥时不必强行追肥。',
    note: `${stabilizerLine} 库存：${inventoryLine}`,
    emphasis: normalReady ? '短线先普肥' : organicReady ? '强种再上有机' : '先裸跑轮转',
    toneClass: 'is-short',
    normalLabel: formatFertilizerReserveLabel(normalHours),
    organicLabel: formatFertilizerReserveLabel(organicHours),
    planNote: normalReady
      ? '化肥联动：短周期轮转优先用普通化肥补节奏，有机化肥留给高收益或更慢熟的强势地块。'
      : organicReady
        ? '化肥联动：当前缺普通化肥，短周期模板建议先裸跑，只有强势地块再补有机化肥。'
        : '化肥联动：当前没有可用化肥，短周期模板建议直接按节奏裸跑补种。',
  }
})

const plantableBagSeedChoices = computed(() => {
  const itemMap = new Map(
    (Array.isArray(items.value) ? items.value : [])
      .map((item: any) => [Number(item?.id || 0), item] as const),
  )
  const shopSeedMap = new Map(
    (Array.isArray(shopSeeds.value) ? shopSeeds.value : [])
      .map((seed: any) => [Number(seed?.seedId || seed?.id || 0), seed] as const),
  )

  return (Array.isArray(bagSeeds.value) ? bagSeeds.value : [])
    .map((seed: any) => {
      const itemId = Number(seed?.seedId || seed?.itemId || 0)
      const sourceItem = itemMap.get(itemId)
      const shopSeed = shopSeedMap.get(itemId)
      const usableCount = Math.max(0, Number(seed?.usableCount ?? sourceItem?.count ?? 0))
      return {
        key: `seed-${itemId}`,
        itemId,
        usableCount,
        count: Math.max(0, Number(seed?.count ?? sourceItem?.count ?? usableCount)),
        requiredLevel: Math.max(0, Number(seed?.requiredLevel ?? shopSeed?.requiredLevel ?? 0)),
        plantSize: Math.max(1, Number(seed?.plantSize ?? shopSeed?.plantSize ?? 1)),
        image: String(seed?.image || sourceItem?.image || shopSeed?.image || '').trim(),
        name: String(seed?.name || sourceItem?.name || shopSeed?.name || `种子#${itemId}`).trim(),
        unlocked: seed?.unlocked !== false,
        item: sourceItem
          ? {
              ...sourceItem,
              canUse: sourceItem?.canUse !== false,
              interactionType: String(sourceItem?.interactionType || 'plant'),
              category: sourceItem?.category || 'seed',
            }
          : {
              id: itemId,
              name: String(seed?.name || shopSeed?.name || `种子#${itemId}`).trim(),
              image: String(seed?.image || shopSeed?.image || '').trim(),
              count: usableCount,
              canUse: true,
              interactionType: 'plant',
              category: 'seed',
            },
      }
    })
    .filter(seed => seed.itemId > 0 && seed.usableCount > 0 && seed.unlocked !== false)
    .sort((a, b) => (
      Number(b.usableCount || 0) - Number(a.usableCount || 0)
      || Number(a.requiredLevel || 0) - Number(b.requiredLevel || 0)
      || Number(a.itemId || 0) - Number(b.itemId || 0)
    ))
})

const showPlantSeedPalette = computed(() =>
  plantSeedPaletteExpanded.value && !landTargetItem.value && hasPlantWorkflowLands.value,
)

const activePlantRecommendOption = computed<(typeof PLANT_RECOMMENDATION_OPTIONS)[number]>(() => (
  PLANT_RECOMMENDATION_OPTIONS.find(option => option.key === plantRecommendStrategy.value)
  || PLANT_RECOMMENDATION_OPTIONS[0]!
))

const activePlantBatchOption = computed<(typeof PLANT_BATCH_TEMPLATE_OPTIONS)[number]>(() => (
  PLANT_BATCH_TEMPLATE_OPTIONS.find(option => option.key === plantBatchTemplate.value)
  || PLANT_BATCH_TEMPLATE_OPTIONS[0]!
))

const activePlantCycleOption = computed<(typeof PLANT_CYCLE_TEMPLATE_OPTIONS)[number]>(() => (
  PLANT_CYCLE_TEMPLATE_OPTIONS.find(option => option.key === plantCycleTemplate.value)
  || PLANT_CYCLE_TEMPLATE_OPTIONS[0]!
))

function buildPrioritizedPlantLands(sourceLands: any[]) {
  const rows = Array.isArray(sourceLands) ? [...sourceLands] : []
  const spotlightId = Number(plantSpotlightLandId.value || 0)
  if (!spotlightId)
    return rows
  const spotlightLand = rows.find((land: any) => Number(land?.id || 0) === spotlightId)
  if (!spotlightLand)
    return rows
  return [spotlightLand, ...rows.filter((land: any) => Number(land?.id || 0) !== spotlightId)]
}

const plantSeedCards = computed(() => {
  const rows = plantableBagSeedChoices.value.map((seed) => {
    const atlas = cropAtlasBySeedId.value[Number(seed.itemId || 0)] || null
    return {
      ...seed,
      atlas,
      growTimeSec: Math.max(0, Number(atlas?.growTime || 0)),
      profitPerHour: Number(atlas?.profitPerHour || 0),
      expPerHour: Number(atlas?.expPerHour || 0),
    }
  })

  const maxProfit = Math.max(1, ...rows.map(row => Math.max(0, row.profitPerHour)))
  const maxExp = Math.max(1, ...rows.map(row => Math.max(0, row.expPerHour)))
  const validGrowTimes = rows.map(row => row.growTimeSec).filter(value => value > 0)
  const fastestGrowTime = validGrowTimes.length ? Math.min(...validGrowTimes) : 0
  const slowestGrowTime = validGrowTimes.length ? Math.max(...validGrowTimes) : 0
  const normalReady = normalFertilizerHours.value > 0.1
  const organicReady = organicFertilizerHours.value > 0.1
  const strategyWeights: Record<PastoralPlantRecommendStrategy, { profit: number, exp: number, speed: number, stock: number }> = {
    profit: { profit: 0.56, exp: 0.16, speed: 0.18, stock: 0.1 },
    exp: { profit: 0.2, exp: 0.54, speed: 0.16, stock: 0.1 },
    speed: { profit: 0.18, exp: 0.12, speed: 0.6, stock: 0.1 },
  }
  const cycleTones: Record<PastoralPlantCycleTemplate, { strong: string, mid: string, soft: string }> = {
    short: { strong: '短线强推', mid: '短线可用', soft: '节奏偏慢' },
    idle: { strong: '挂机强推', mid: '挂机稳妥', soft: '节奏偏快' },
    gold: { strong: '冲金强推', mid: '冲金可用', soft: '利润一般' },
  }
  const weights = strategyWeights[plantRecommendStrategy.value] || strategyWeights.profit

  return rows
    .map((seed) => {
      const profitScore = seed.profitPerHour > 0 ? seed.profitPerHour / maxProfit : 0
      const expScore = seed.expPerHour > 0 ? seed.expPerHour / maxExp : 0
      const speedScore = fastestGrowTime > 0 && seed.growTimeSec > 0 ? fastestGrowTime / seed.growTimeSec : 0.4
      const slowScore = slowestGrowTime > 0 && seed.growTimeSec > 0 ? seed.growTimeSec / slowestGrowTime : 0.35
      const stockScore = Math.min(1, Number(seed.usableCount || 0) / 6)
      const baseScore = (
        (profitScore * weights.profit)
        + (expScore * weights.exp)
        + (speedScore * weights.speed)
        + (stockScore * weights.stock)
      )
      const cycleTemplateScore = plantCycleTemplate.value === 'idle'
        ? ((slowScore * 0.76) + (profitScore * 0.12) + (stockScore * 0.12))
        : plantCycleTemplate.value === 'gold'
          ? ((profitScore * 0.78) + (speedScore * 0.12) + (stockScore * 0.1))
          : ((speedScore * 0.76) + (profitScore * 0.14) + (stockScore * 0.1))
      const score = (baseScore * 0.78) + (cycleTemplateScore * 0.22)
      const normalized = Number(score.toFixed(3))
      const recommendationLabel = normalized >= 0.8 ? '强推'
        : normalized >= 0.62 ? '稳妥'
          : '备选'
      const recommendationTone = normalized >= 0.8 ? 'is-top'
        : normalized >= 0.62 ? 'is-good'
          : 'is-alt'
      const cycleFitSet = cycleTones[plantCycleTemplate.value] || cycleTones.short
      const cycleFitLabel = cycleTemplateScore >= 0.82 ? cycleFitSet.strong
        : cycleTemplateScore >= 0.64 ? cycleFitSet.mid
          : cycleFitSet.soft
      const cycleFitTone = cycleTemplateScore >= 0.82 ? 'is-top'
        : cycleTemplateScore >= 0.64 ? 'is-good'
          : 'is-alt'
      const growTimeLabel = seed.growTimeSec > 0 ? formatDuration(seed.growTimeSec) : '待同步'
      const profitLabel = seed.profitPerHour > 0 ? `${formatCompactNumber(Math.round(seed.profitPerHour))}/时` : '待同步'
      const expLabel = seed.expPerHour > 0 ? `${formatCompactNumber(Math.round(seed.expPerHour))}/时` : '待同步'
      const focusMetricLabel = plantRecommendStrategy.value === 'exp'
        ? '经验效率'
        : plantRecommendStrategy.value === 'speed'
          ? '成熟速度'
          : '金币效率'
      const focusMetricValue = plantRecommendStrategy.value === 'exp'
        ? expLabel
        : plantRecommendStrategy.value === 'speed'
          ? growTimeLabel
          : profitLabel
      const fertilizerAdvice = getSeedFertilizerAdvice({
        cycleTemplate: plantCycleTemplate.value,
        normalReady,
        organicReady,
        profitScore,
        speedScore,
        slowScore,
      })
      const cycleMetricLabel = plantCycleTemplate.value === 'idle'
        ? '挂机周期'
        : plantCycleTemplate.value === 'gold'
          ? '冲金效率'
          : '轮转周期'
      const cycleMetricValue = plantCycleTemplate.value === 'gold' ? profitLabel : growTimeLabel
      return {
        ...seed,
        recommendationScore: normalized,
        recommendationLabel,
        recommendationTone,
        cycleFitLabel,
        cycleFitTone,
        growTimeLabel,
        profitLabel,
        expLabel,
        focusMetricLabel,
        focusMetricValue,
        fertilizerLabel: fertilizerAdvice.label,
        fertilizerTone: fertilizerAdvice.tone,
        fertilizerNote: fertilizerAdvice.note,
        cycleMetricLabel,
        cycleMetricValue,
      }
    })
    .sort((a, b) => (
      Number(b.recommendationScore || 0) - Number(a.recommendationScore || 0)
      || Number(b.usableCount || 0) - Number(a.usableCount || 0)
      || Number(a.itemId || 0) - Number(b.itemId || 0)
    ))
    .map((seed, index) => ({
      ...seed,
      rank: index + 1,
    }))
})

function buildAutoPlantPlan(sourceLandsInput: any[]): PastoralAutoPlantPlan {
  const sourceLands = buildPrioritizedPlantLands(sourceLandsInput)
  const sourceSeeds = plantSeedCards.value
  const spotlightId = Number(plantSpotlightLandId.value || 0)
  const templateKey = plantBatchTemplate.value
  const cycleSummary = activePlantCycleOption.value.summary
  const fertilizerSummary = fertilizerSupportPlan.value.planNote

  if (!sourceSeeds.length) {
    return {
      canApply: false,
      disabledReason: '当前没有可直接种植的种子',
      operations: [],
      targetCount: 0,
      leftoverCount: sourceLands.length,
      heldEmptyCount: 0,
      targetPreview: '',
      seedSummary: '',
      detailText: '先确保账号在线，并且背包里还有可种植种子。',
      templateNote: [cycleSummary, fertilizerSummary].filter(Boolean).join('；'),
      spotlightIncluded: false,
      primarySeed: null,
      secondarySeed: null,
    }
  }

  if (!sourceLands.length) {
    return {
      canApply: false,
      disabledReason: '当前没有可补种的空地',
      operations: [],
      targetCount: 0,
      leftoverCount: 0,
      heldEmptyCount: 0,
      targetPreview: '',
      seedSummary: '',
      detailText: '当前没有可补种的空地，可以先去收获或开垦。',
      templateNote: [cycleSummary, fertilizerSummary].filter(Boolean).join('；'),
      spotlightIncluded: false,
      primarySeed: sourceSeeds[0] || null,
      secondarySeed: sourceSeeds[1] || null,
    }
  }

  let plantableLands = sourceLands
  let heldEmptyCount = 0
  const extraNotes: string[] = []

  if (templateKey === 'reserve2') {
    heldEmptyCount = Math.min(2, sourceLands.length)
    if (sourceLands.length <= 2) {
      return {
        canApply: false,
        disabledReason: '当前空地不足 3 块，留两块空地模板暂不执行',
        operations: [],
        targetCount: 0,
        leftoverCount: sourceLands.length,
        heldEmptyCount,
        targetPreview: '',
        seedSummary: '',
        detailText: '当前空地太少，这个模板会先保留空地，所以暂不执行。',
        templateNote: [cycleSummary, fertilizerSummary].filter(Boolean).join('；'),
        spotlightIncluded: false,
        primarySeed: sourceSeeds[0] || null,
        secondarySeed: sourceSeeds[1] || null,
      }
    }
    heldEmptyCount = 2
    plantableLands = sourceLands.slice(0, Math.max(0, sourceLands.length - heldEmptyCount))
  }

  const candidateSeeds = templateKey === 'rotate2'
    ? sourceSeeds.slice(0, 2)
    : sourceSeeds.slice(0, 1)

  const seedStates = candidateSeeds
    .map((seed) => {
      const capacity = Math.max(0, Math.min(
        Number(seed?.usableCount || 0),
        getLandTargetSelectionLimit(seed?.item || seed),
        plantableLands.length,
      ))
      return {
        seed,
        capacity,
        remaining: capacity,
        landIds: [] as number[],
      }
    })
    .filter(state => state.capacity > 0)

  if (!seedStates.length) {
    return {
      canApply: false,
      disabledReason: '当前推荐种子的可用数量不足，暂时无法执行补种',
      operations: [],
      targetCount: 0,
      leftoverCount: sourceLands.length,
      heldEmptyCount,
      targetPreview: '',
      seedSummary: '',
      detailText: '当前推荐种子的数量不足，先补货后再试这套模板。',
      templateNote: [cycleSummary, fertilizerSummary].filter(Boolean).join('；'),
      spotlightIncluded: false,
      primarySeed: sourceSeeds[0] || null,
      secondarySeed: sourceSeeds[1] || null,
    }
  }

  if (templateKey === 'rotate2' && seedStates.length < 2)
    extraNotes.push('当前只有 1 个可用品种，已自动退回单品补种')

  let rotationCursor = 0
  for (const land of plantableLands) {
    let pickedIndex = -1
    for (let offset = 0; offset < seedStates.length; offset += 1) {
      const nextIndex = (rotationCursor + offset) % seedStates.length
      const nextState = seedStates[nextIndex]
      if (nextState && nextState.remaining > 0) {
        pickedIndex = nextIndex
        break
      }
    }
    if (pickedIndex < 0)
      break
    const pickedState = seedStates[pickedIndex]
    if (!pickedState)
      break

    const landId = Number(land?.id || 0)
    if (landId <= 0)
      continue
    pickedState.landIds.push(landId)
    pickedState.remaining -= 1
    rotationCursor = seedStates.length > 1 ? (pickedIndex + 1) % seedStates.length : pickedIndex
  }

  const operations = seedStates
    .map((state) => {
      const landIds = state.landIds.filter(id => id > 0)
      return {
        seed: state.seed,
        landIds,
        count: landIds.length,
      }
    })
    .filter(operation => operation.count > 0)

  if (!operations.length) {
    return {
      canApply: false,
      disabledReason: '当前没有可落地的补种计划',
      operations: [],
      targetCount: 0,
      leftoverCount: sourceLands.length,
      heldEmptyCount,
      targetPreview: '',
      seedSummary: '',
      detailText: '暂时没有生成可执行的落地分配方案。',
      templateNote: [cycleSummary, fertilizerSummary].filter(Boolean).join('；'),
      spotlightIncluded: false,
      primarySeed: sourceSeeds[0] || null,
      secondarySeed: sourceSeeds[1] || null,
    }
  }

  const flattenedTargetLandIds = operations.flatMap(operation => operation.landIds)
  const targetCount = flattenedTargetLandIds.length
  const leftoverCount = Math.max(0, sourceLands.length - targetCount)
  const seedSummary = operations.map(operation => `${operation.seed.name} x${operation.count}`).join(' + ')

  if (heldEmptyCount > 0)
    extraNotes.push(`保留 ${heldEmptyCount} 块空地待后续策略`)

  return {
    canApply: true,
    disabledReason: '',
    operations,
    targetCount,
    leftoverCount,
    heldEmptyCount,
    targetPreview: flattenedTargetLandIds.slice(0, 4).map(id => `#${id}`).join(' / '),
    seedSummary,
    detailText: `预计补种 ${targetCount} 块空地${flattenedTargetLandIds.length ? `，优先落到 ${flattenedTargetLandIds.slice(0, 4).map(id => `#${id}`).join(' / ')}` : ''}${heldEmptyCount > 0 ? `，预留 ${heldEmptyCount} 块空地` : ''}`,
    templateNote: [extraNotes.length ? extraNotes.join('，') : activePlantBatchOption.value.summary, cycleSummary, fertilizerSummary].filter(Boolean).join('；'),
      spotlightIncluded: spotlightId > 0 && flattenedTargetLandIds.includes(spotlightId),
      primarySeed: operations[0]?.seed || sourceSeeds[0] || null,
      secondarySeed: operations[1]?.seed || sourceSeeds[1] || null,
    }
}

const autoPlantPlan = computed(() => buildAutoPlantPlan(prioritizedEmptyLands.value))

const autoHarvestReplantPlan = computed(() => {
  const harvestLandIds = harvestableLands.value
    .map((land: any) => Number(land?.id || 0))
    .filter(id => id > 0)
  const projectedPlan = buildAutoPlantPlan(
    sortedLands.value.filter((land: any) => {
      const statusValue = String(land?.status || '')
      return statusValue === 'empty' || statusValue === 'harvestable'
    }),
  )
  const harvestCount = harvestLandIds.length

  if (!harvestCount) {
    return {
      canApply: false,
      harvestLandIds: [],
      harvestCount: 0,
      disabledReason: '当前没有成熟地可自动收获',
      detailText: hasEmptyLands.value
        ? '当前已经有空地在场，直接用上面的补种计划会更快。'
        : '等有成熟地出现后，这里会自动串联收获与回补。',
      templateNote: projectedPlan.templateNote,
      replantPlan: projectedPlan,
    }
  }

  if (!projectedPlan.canApply) {
    return {
      canApply: false,
      harvestLandIds,
      harvestCount,
      disabledReason: '收获后暂时还无法生成可执行补种计划',
      detailText: `预计能先收 ${harvestCount} 块成熟地，但当前补种链路仍缺条件。${projectedPlan.detailText}`,
      templateNote: projectedPlan.templateNote,
      replantPlan: projectedPlan,
    }
  }

  const targetCount = projectedPlan.targetCount
  const previewLabel = projectedPlan.targetPreview ? `，优先回补 ${projectedPlan.targetPreview}` : ''
  const heldLabel = projectedPlan.heldEmptyCount > 0 ? `，并继续预留 ${projectedPlan.heldEmptyCount} 块空地` : ''

  return {
    canApply: true,
    harvestLandIds,
    harvestCount,
    disabledReason: '',
    detailText: `预计先收 ${harvestCount} 块成熟地，再总计回补 ${targetCount} 块空地${previewLabel}${heldLabel}`,
    templateNote: `收获会先刷新土地与背包，再接上当前策略连续补种。；${projectedPlan.templateNote}`,
    replantPlan: projectedPlan,
  }
})

function getAutoCareActionLabel(type: PastoralAutoCareActionType) {
  return OPERATION_LABELS[type] || type
}

function buildAutoCareOperations(sourceLands: any[]): PastoralAutoCareOperation[] {
  const waterIds: number[] = []
  const weedIds: number[] = []
  const bugIds: number[] = []

  for (const land of Array.isArray(sourceLands) ? sourceLands : []) {
    const landId = Number(land?.id || 0)
    if (landId <= 0 || isEmptyLand(land) || isLandReady(land) || String(land?.status || '') === 'locked')
      continue
    if (land?.needWater)
      waterIds.push(landId)
    if (land?.needWeed)
      weedIds.push(landId)
    if (land?.needBug)
      bugIds.push(landId)
  }

  return ([
    waterIds.length ? { type: 'water', landIds: waterIds, label: getAutoCareActionLabel('water') } : null,
    weedIds.length ? { type: 'weed', landIds: weedIds, label: getAutoCareActionLabel('weed') } : null,
    bugIds.length ? { type: 'bug', landIds: bugIds, label: getAutoCareActionLabel('bug') } : null,
  ].filter(Boolean) as PastoralAutoCareOperation[])
}

function isLandAutoFertilizable(land: any) {
  const statusValue = String(land?.status || '').trim().toLowerCase()
  const hasPlant = !!String(land?.plantName || '').trim() || !!land?.plant || !!land?.plantId
  return hasPlant && !['empty', 'dead', 'locked', 'harvestable', 'stealable'].includes(statusValue)
}

function getAutoFertilizerBudget(hours: number, tone: 'normal' | 'organic') {
  if (!Number.isFinite(hours) || hours <= 0)
    return 0
  if (hours < 1)
    return 1
  return Math.min(tone === 'organic' ? 4 : 6, Math.max(1, Math.floor(hours)))
}

function buildProjectedFertilizerCandidates(sourceLands: any[], replantPlan: PastoralAutoPlantPlan): PastoralProjectedFertilizerCandidate[] {
  const byLandId = new Map<number, PastoralProjectedFertilizerCandidate>()
  const plannedProfitMax = Math.max(
    1,
    ...replantPlan.operations.map(operation => Math.max(0, Number(operation?.seed?.profitPerHour || 0))),
  )

  const rememberCandidate = (candidate: PastoralProjectedFertilizerCandidate) => {
    if (candidate.landId <= 0)
      return
    const current = byLandId.get(candidate.landId)
    if (!current || candidate.source === 'planned')
      byLandId.set(candidate.landId, candidate)
  }

  for (const land of Array.isArray(sourceLands) ? sourceLands : []) {
    const landId = Number(land?.id || 0)
    if (!landId || !isLandAutoFertilizable(land))
      continue
    const totalGrowTime = Math.max(0, Number(land?.totalGrowTime || 0))
    const matureInSec = Math.max(0, Number(land?.matureInSec || 0))
    const cycleSec = totalGrowTime > 0 ? totalGrowTime : matureInSec > 0 ? matureInSec : 4 * 3600
    const progressScore = totalGrowTime > 0
      ? Math.max(0, Math.min(1, 1 - (matureInSec / Math.max(totalGrowTime, 1))))
      : 0.42
    const mutantBoost = getLandMutantLabels(land).length > 0 ? 0.18 : 0

    rememberCandidate({
      landId,
      source: 'existing',
      label: String(land?.plantName || `#${landId}`).trim() || `#${landId}`,
      profitScore: Math.max(0.24, Math.min(1, (Number(land?.level || 0) / 4) + mutantBoost + (progressScore * 0.12))),
      speedScore: Math.max(0.18, Math.min(1, (2.5 * 3600) / Math.max(cycleSec, 1800))),
      longScore: Math.max(0.16, Math.min(1, cycleSec / (8 * 3600))),
      plannedBoost: 0.06,
    })
  }

  for (const operation of replantPlan.operations) {
    const seed = operation?.seed || {}
    const cycleSec = Math.max(0, Number(seed?.growTimeSec || 0)) || 4 * 3600
    const rawProfit = Math.max(0, Number(seed?.profitPerHour || 0))
    const recommendationScore = Math.max(0.25, Math.min(1, Number(seed?.recommendationScore || 0)))

    for (const landId of Array.isArray(operation?.landIds) ? operation.landIds : []) {
      const numericLandId = Number(landId || 0)
      if (!numericLandId)
        continue
      rememberCandidate({
        landId: numericLandId,
        source: 'planned',
        label: String(seed?.name || `#${numericLandId}`).trim() || `#${numericLandId}`,
        profitScore: Math.max(recommendationScore, rawProfit > 0 ? Math.min(1, rawProfit / plannedProfitMax) : 0.35),
        speedScore: Math.max(0.18, Math.min(1, (2.5 * 3600) / Math.max(cycleSec, 1800))),
        longScore: Math.max(0.16, Math.min(1, cycleSec / (8 * 3600))),
        plannedBoost: 0.22,
      })
    }
  }

  return [...byLandId.values()]
}

function getFertilizerCandidateScore(candidate: PastoralProjectedFertilizerCandidate, tone: 'normal' | 'organic') {
  if (plantCycleTemplate.value === 'idle') {
    return tone === 'organic'
      ? (candidate.longScore * 0.72) + (candidate.profitScore * 0.16) + candidate.plannedBoost
      : (candidate.longScore * 0.52) + (candidate.speedScore * 0.18) + (candidate.profitScore * 0.2) + (candidate.plannedBoost * 0.4)
  }

  if (plantCycleTemplate.value === 'gold') {
    return tone === 'organic'
      ? (candidate.profitScore * 0.74) + (candidate.longScore * 0.14) + candidate.plannedBoost
      : (candidate.profitScore * 0.56) + (candidate.speedScore * 0.2) + (candidate.longScore * 0.08) + (candidate.plannedBoost * 0.4)
  }

  return tone === 'organic'
    ? (candidate.profitScore * 0.56) + (candidate.longScore * 0.16) + (candidate.speedScore * 0.1) + candidate.plannedBoost
    : (candidate.speedScore * 0.72) + (candidate.profitScore * 0.16) + (candidate.plannedBoost * 0.6)
}

function takeFertilizerCandidates(
  candidates: PastoralProjectedFertilizerCandidate[],
  tone: 'normal' | 'organic',
  budget: number,
): PastoralProjectedFertilizerCandidate[] {
  if (budget <= 0 || !candidates.length)
    return []

  return [...candidates]
    .map(candidate => ({
      candidate,
      score: getFertilizerCandidateScore(candidate, tone),
    }))
    .filter(entry => entry.score > 0.2)
    .sort((a, b) => (
      b.score - a.score
      || b.candidate.profitScore - a.candidate.profitScore
      || a.candidate.landId - b.candidate.landId
    ))
    .slice(0, budget)
    .map(entry => entry.candidate)
}

function buildAutoFertilizerOperations(sourceLands: any[], replantPlan: PastoralAutoPlantPlan): PastoralAutoFertilizerOperation[] {
  const candidates = buildProjectedFertilizerCandidates(sourceLands, replantPlan)
  if (!candidates.length)
    return []

  let availableCandidates: PastoralProjectedFertilizerCandidate[] = [...candidates]
  const operations: PastoralAutoFertilizerOperation[] = []
  const normalBudget = getAutoFertilizerBudget(normalFertilizerHours.value, 'normal')
  const organicBudget = getAutoFertilizerBudget(organicFertilizerHours.value, 'organic')

  const appendOperation = (
    tone: 'normal' | 'organic',
    label: string,
    itemId: number,
    picked: PastoralProjectedFertilizerCandidate[],
  ) => {
    if (!picked.length)
      return
    const pickedIds = picked.map(candidate => candidate.landId)
    operations.push({
      itemId,
      landIds: pickedIds,
      count: pickedIds.length,
      label,
      tone,
    })
    const pickedSet = new Set(pickedIds)
    availableCandidates = availableCandidates.filter(candidate => !pickedSet.has(candidate.landId))
  }

  if (plantCycleTemplate.value === 'idle') {
    appendOperation('organic', '有机化肥', 1012, takeFertilizerCandidates(availableCandidates, 'organic', organicBudget))
    appendOperation('normal', '普通化肥', 1011, takeFertilizerCandidates(availableCandidates, 'normal', organicBudget > 0 ? Math.min(2, normalBudget) : normalBudget))
  }
  else if (plantCycleTemplate.value === 'gold') {
    appendOperation('organic', '有机化肥', 1012, takeFertilizerCandidates(availableCandidates, 'organic', organicBudget))
    appendOperation('normal', '普通化肥', 1011, takeFertilizerCandidates(availableCandidates, 'normal', Math.min(3, normalBudget)))
  }
  else {
    appendOperation('normal', '普通化肥', 1011, takeFertilizerCandidates(availableCandidates, 'normal', normalBudget))
    appendOperation('organic', '有机化肥', 1012, takeFertilizerCandidates(availableCandidates, 'organic', Math.min(2, organicBudget)))
  }

  return operations.filter(operation => operation.count > 0)
}

function buildAutoCareWorkflowPlanFromState(
  sourceLands: any[],
  harvestCount: number,
  harvestLandIds: number[],
  replantPlan: PastoralAutoPlantPlan,
): PastoralAutoCareWorkflowPlan {
  if (!harvestCount) {
    return {
      canApply: false,
      disabledReason: '当前没有成熟地可接入自动照料流水线',
      harvestCount: 0,
      harvestLandIds: [],
      replantPlan,
      careOperations: [],
      fertilizerOperations: [],
      careSummary: '等待成熟地出现',
      fertilizerSummary: '等待成熟地出现',
      detailText: '等有成熟地后，这里会把收获、回补、照料和化肥接成一条连续流程。',
      templateNote: replantPlan.templateNote,
    }
  }

  if (!replantPlan.canApply) {
    return {
      canApply: false,
      disabledReason: '当前收获后还无法生成稳定补种方案',
      harvestCount,
      harvestLandIds,
      replantPlan,
      careOperations: [],
      fertilizerOperations: [],
      careSummary: '补种未就绪',
      fertilizerSummary: '补种未就绪',
      detailText: `预计先收 ${harvestCount} 块成熟地，但补种计划还没准备好，所以先不自动串照料。`,
      templateNote: replantPlan.templateNote,
    }
  }

  const careOperations = buildAutoCareOperations(sourceLands)
  const fertilizerOperations = buildAutoFertilizerOperations(sourceLands, replantPlan)
  const careSummary = careOperations.length
    ? careOperations.map(operation => `${operation.label} ${operation.landIds.length} 块`).join(' / ')
    : '回补后暂无补水除草除虫'
  const fertilizerSummary = fertilizerOperations.length
    ? fertilizerOperations.map(operation => `${operation.label} ${operation.count} 块`).join(' / ')
    : '本轮回补后先不上肥'

  return {
    canApply: true,
    disabledReason: '',
    harvestCount,
    harvestLandIds,
    replantPlan,
    careOperations,
    fertilizerOperations,
    careSummary,
    fertilizerSummary,
    detailText: `预计先收 ${harvestCount} 块成熟地，再回补 ${replantPlan.targetCount} 块空地，随后联动 ${careSummary}，并按策略执行 ${fertilizerSummary}`,
    templateNote: [`照料联动会先补水/除草/除虫，再结合当前周期模板决定是否追肥。`, replantPlan.templateNote].filter(Boolean).join('；'),
  }
}

const autoCareWorkflowPlan = computed(() =>
  buildAutoCareWorkflowPlanFromState(
    sortedLands.value.filter((land: any) => String(land?.status || '') !== 'harvestable'),
    autoHarvestReplantPlan.value.harvestCount,
    autoHarvestReplantPlan.value.harvestLandIds,
    autoHarvestReplantPlan.value.replantPlan,
  ),
)

function countRetryOperationLands(operations: Array<{ landIds: number[] }>) {
  return operations.reduce((total, operation) => total + (Array.isArray(operation?.landIds) ? operation.landIds.length : 0), 0)
}

function hasWorkflowRetryableFailures(memory: PastoralWorkflowMemory | null) {
  if (!memory)
    return false
  return memory.retryHarvestLandIds.length > 0
    || memory.retryPlantOperations.length > 0
    || memory.retryCareOperations.length > 0
    || memory.retryFertilizerOperations.length > 0
}

function buildWorkflowRetrySummary(memory: PastoralWorkflowMemory) {
  const parts: string[] = []
  if (memory.retryHarvestLandIds.length > 0)
    parts.push(`收获 ${memory.retryHarvestLandIds.length} 块`)
  if (memory.retryPlantOperations.length > 0)
    parts.push(`补种 ${countRetryOperationLands(memory.retryPlantOperations)} 块`)
  if (memory.retryCareOperations.length > 0)
    parts.push(memory.retryCareOperations.map(operation => `${operation.label} ${operation.landIds.length} 块`).join(' / '))
  if (memory.retryFertilizerOperations.length > 0)
    parts.push(memory.retryFertilizerOperations.map(operation => `${operation.label} ${operation.landIds.length} 块`).join(' / '))
  return parts.length ? parts.join('；') : '当前没有待补跑的失败项'
}

function buildWorkflowStrategySummary(memory: PastoralWorkflowMemory) {
  const recommend = PLANT_RECOMMENDATION_OPTIONS.find(option => option.key === memory.recommendStrategy)?.label || '金币优先'
  const batch = PLANT_BATCH_TEMPLATE_OPTIONS.find(option => option.key === memory.batchTemplate)?.label || '全种第一名'
  const cycle = PLANT_CYCLE_TEMPLATE_OPTIONS.find(option => option.key === memory.cycleTemplate)?.label || '短周期轮转'
  return `${recommend} / ${batch} / ${cycle}`
}

function formatWorkflowRecordedAt(timestamp: number) {
  const value = Math.max(0, Number(timestamp || 0))
  if (!value)
    return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '--'
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function syncWorkflowMemory(memory: PastoralWorkflowMemory | null) {
  workflowMemory.value = memory
  if (memory)
    writePastoralWorkflowMemory(memory)
  else
    clearPastoralWorkflowMemory()
}

function buildWorkflowMemoryPayload(input: {
  stage: PastoralWorkflowMemory['stage']
  summaryText: string
  detailText: string
  retryHarvestLandIds?: number[]
  retryPlantOperations?: PastoralWorkflowRetryPlantOperation[]
  retryCareOperations?: PastoralWorkflowRetryCareOperation[]
  retryFertilizerOperations?: PastoralWorkflowRetryFertilizerOperation[]
}): PastoralWorkflowMemory | null {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId)
    return null

  return {
    accountId,
    accountLabel: String(displayName.value || currentAccount.value?.name || accountId).trim() || accountId,
    recordedAt: Date.now(),
    stage: input.stage,
    summaryText: String(input.summaryText || '').trim(),
    detailText: String(input.detailText || '').trim(),
    recommendStrategy: plantRecommendStrategy.value,
    batchTemplate: plantBatchTemplate.value,
    cycleTemplate: plantCycleTemplate.value,
    retryHarvestLandIds: Array.isArray(input.retryHarvestLandIds) ? input.retryHarvestLandIds : [],
    retryPlantOperations: Array.isArray(input.retryPlantOperations) ? input.retryPlantOperations : [],
    retryCareOperations: Array.isArray(input.retryCareOperations) ? input.retryCareOperations : [],
    retryFertilizerOperations: Array.isArray(input.retryFertilizerOperations) ? input.retryFertilizerOperations : [],
  }
}

const retryRememberedWorkflowState = computed<PastoralRetryMemoryState | null>(() => {
  const memory = workflowMemory.value
  if (!memory)
    return null

  const currentId = String(currentAccountId.value || '').trim()
  const sameAccount = !!currentId && currentId === String(memory.accountId || '').trim()
  const hasRetryableFailures = hasWorkflowRetryableFailures(memory)
  const retrySummary = buildWorkflowRetrySummary(memory)
  const strategySummary = buildWorkflowStrategySummary(memory)
  const recordedAtLabel = formatWorkflowRecordedAt(memory.recordedAt)

  return {
    memory,
    sameAccount,
    hasRetryableFailures,
    retrySummary,
    strategySummary,
    title: hasRetryableFailures
      ? `上次流水线留有失败项，记录于 ${recordedAtLabel}`
      : `上次流水线已跑完，记录于 ${recordedAtLabel}`,
    detail: sameAccount
      ? `账号 ${memory.accountLabel} · 策略 ${strategySummary}`
      : `这份记忆来自账号 ${memory.accountLabel}，切回对应账号后可补跑`,
  }
})

function syncReminderSnooze(next: PastoralReminderSnooze | null) {
  reminderSnooze.value = next
  if (next)
    writePastoralReminderSnooze(next)
  else
    clearPastoralReminderSnooze()
}

const activeReminderSnooze = computed(() => {
  const currentId = String(currentAccountId.value || '').trim()
  const snooze = reminderSnooze.value
  if (!snooze || !currentId)
    return null
  if (String(snooze.accountId || '').trim() !== currentId)
    return null
  if (Number(snooze.untilAt || 0) <= reminderNow.value)
    return null
  return snooze
})

const reminderSnoozeRemainingLabel = computed(() => {
  const snooze = activeReminderSnooze.value
  if (!snooze)
    return ''
  return formatDuration(Math.ceil(Math.max(0, snooze.untilAt - reminderNow.value) / 1000))
})

const pastoralSuggestionCards = computed<PastoralSuggestionCard[]>(() => {
  const cards: PastoralSuggestionCard[] = []
  const currentId = String(currentAccountId.value || '').trim()
  const stageState = farmStageEmptyState.value
  const retryState = retryRememberedWorkflowState.value

  if (retryState?.sameAccount && retryState.hasRetryableFailures) {
    cards.push({
      key: 'retry-memory',
      eyebrow: '失败记忆',
      title: '上轮流水线还有失败项待补跑',
      detail: `${retryState.retrySummary} · ${retryState.strategySummary}`,
      tone: 'danger',
      actionKey: 'retry-memory',
      actionLabel: '补跑失败项',
      disabled: !canRunDirectActions.value || !!landTargetItem.value || retryRememberedWorkflowApplying.value || autoCareWorkflowApplying.value || autoHarvestReplantApplying.value || autoPlantApplying.value || bagActionLoading.value,
      loading: retryRememberedWorkflowApplying.value,
    })
  }

  if (!currentId) {
    cards.push({
      key: 'setup-account',
      eyebrow: '先接账号',
      title: '还没选账号，先回主控制台或设置页',
      detail: '选中账号后，这里的巡田提醒、建议卡和地块编排才会切到真实数据。',
      tone: 'neutral',
      actionKey: 'return-console',
      actionLabel: '返回控制台',
      disabled: false,
      loading: false,
    })
    cards.push({
      key: 'setup-settings',
      eyebrow: '配置入口',
      title: '也可以先去领奖与配置页确认默认账号',
      detail: '如果你想直接从田园页继续推进，先把默认运行账号和领奖策略定下来会更顺。',
      tone: 'brand',
      actionKey: 'open-settings',
      actionLabel: '打开设置',
      disabled: false,
      loading: false,
    })
  }
  else if (stageState) {
    const shouldRefresh = ['loading', 'offline', 'loading-lands', 'no-lands'].includes(stageState.key)
    cards.push({
      key: shouldRefresh ? 'stage-refresh' : 'stage-console',
      eyebrow: '舞台同步',
      title: shouldRefresh ? '田园舞台建议先重新同步一次' : '先让账号回到可运行状态',
      detail: stageState.description,
      tone: shouldRefresh ? 'warning' : 'neutral',
      actionKey: shouldRefresh ? 'refresh-stage' : 'return-console',
      actionLabel: shouldRefresh ? '重新同步' : `返回${rememberedConsoleRouteLabel.value}`,
      disabled: shouldRefresh ? stageRefreshLoading.value : false,
      loading: shouldRefresh ? stageRefreshLoading.value : false,
    })
    if (stageState.key === 'not-running') {
      cards.push({
        key: 'stage-settings',
        eyebrow: '配置入口',
        title: '启动前先看下领奖与配置也可以',
        detail: '如果要顺手调整自动领奖或默认行为，这里可以直接跳过去，不必退出全屏田园页。',
        tone: 'brand',
        actionKey: 'open-settings',
        actionLabel: '打开设置',
        disabled: false,
        loading: false,
      })
    }
  }

  if (autoCareWorkflowPlan.value.canApply && (autoCareWorkflowPlan.value.harvestCount > 0 || autoCareWorkflowPlan.value.careOperations.length > 0 || autoCareWorkflowPlan.value.fertilizerOperations.length > 0)) {
    cards.push({
      key: 'auto-care',
      eyebrow: '全链路建议',
      title: `优先跑自动照料联动，覆盖 ${autoCareWorkflowPlan.value.careSummary}`,
      detail: autoCareWorkflowPlan.value.detailText,
      tone: 'brand',
      actionKey: 'auto-care',
      actionLabel: '自动照料联动',
      disabled: !autoCareWorkflowPlan.value.canApply || !canRunDirectActions.value || !!landTargetItem.value || plantSeedLoading.value || autoCareWorkflowApplying.value || autoHarvestReplantApplying.value || autoPlantApplying.value || bagActionLoading.value,
      loading: autoCareWorkflowApplying.value,
    })
  }
  else if (autoHarvestReplantPlan.value.canApply && autoHarvestReplantPlan.value.harvestCount > 0) {
    cards.push({
      key: 'auto-harvest',
      eyebrow: '成熟接力',
      title: `先收 ${autoHarvestReplantPlan.value.harvestCount} 块成熟地，再回补空地`,
      detail: autoHarvestReplantPlan.value.detailText,
      tone: 'warning',
      actionKey: 'auto-harvest',
      actionLabel: '自动收获后回补',
      disabled: !autoHarvestReplantPlan.value.canApply || !canRunDirectActions.value || !!landTargetItem.value || plantSeedLoading.value || autoHarvestReplantApplying.value || autoPlantApplying.value || bagActionLoading.value,
      loading: autoHarvestReplantApplying.value,
    })
  }

  if (autoPlantPlan.value.canApply && autoPlantPlan.value.targetCount > 0) {
    cards.push({
      key: 'auto-plant',
      eyebrow: '空地补种',
      title: `当前有 ${autoPlantPlan.value.targetCount} 块地适合按模板直接补种`,
      detail: `${autoPlantPlan.value.detailText} · ${activePlantRecommendOption.value.label} / ${activePlantBatchOption.value.label}`,
      tone: 'success',
      actionKey: 'auto-plant',
      actionLabel: `按${activePlantBatchOption.value.label}补种`,
      disabled: !autoPlantPlan.value.canApply || !canRunDirectActions.value || !!landTargetItem.value || plantSeedLoading.value || autoPlantApplying.value || bagActionLoading.value,
      loading: autoPlantApplying.value,
    })
  }
  else if (hasPlantWorkflowLands.value) {
    cards.push({
      key: 'open-seeds',
      eyebrow: '先看种子',
      title: '先打开种子带，看看当前策略下的推荐顺序',
      detail: `${activePlantRecommendOption.value.summary}；${activePlantCycleOption.value.summary}`,
      tone: 'brand',
      actionKey: 'open-seeds',
      actionLabel: showPlantSeedPalette.value ? '刷新种子带' : '打开种子带',
      disabled: plantSeedLoading.value || !!landTargetItem.value,
      loading: plantSeedLoading.value,
    })
  }

  if (urgentFriendActionCount.value > 0) {
    cards.push({
      key: 'friend-watch',
      eyebrow: '好友巡田',
      title: `好友侧还有 ${urgentFriendActionCount.value} 个待处理动作`,
      detail: `可偷 ${friendSummary.value.steal} · 待帮扶 ${friendSummary.value.care}，先开好友田园弹层就能批量扫一遍。`,
      tone: 'warning',
      actionKey: 'open-friends',
      actionLabel: '打开好友弹层',
      disabled: quickPanelBusy.value && quickPanelKey.value === 'friends',
      loading: quickPanelBusy.value && quickPanelKey.value === 'friends',
    })
  }

  if (!cards.length) {
    cards.push({
      key: 'refresh-stage-fallback',
      eyebrow: '轻量巡田',
      title: '当前节奏比较平稳，先做一次舞台同步就够了',
      detail: `农场巡查 ${nextFarmCheck.value} · 好友巡查 ${nextFriendCheck.value}，暂时没有更急的补跑或照料动作。`,
      tone: 'neutral',
      actionKey: 'refresh-stage',
      actionLabel: '同步舞台',
      disabled: stageRefreshLoading.value,
      loading: stageRefreshLoading.value,
    })
  }

  return cards
    .filter((card, index, source) => source.findIndex(item => item.key === card.key) === index)
    .slice(0, 3)
})

const pastoralReminderState = computed<PastoralReminderState | null>(() => {
  const primary = pastoralSuggestionCards.value[0]
  if (!primary)
    return null

  const retryState = retryRememberedWorkflowState.value
  const snoozed = !!activeReminderSnooze.value
  const nextFarmSoon = localNextFarmRemainSec.value > 0 && localNextFarmRemainSec.value <= 5 * 60
  const nextFriendSoon = localNextFriendRemainSec.value > 0 && localNextFriendRemainSec.value <= 5 * 60
  const currentId = String(currentAccountId.value || '').trim()

  if (snoozed) {
    return {
      tone: 'muted',
      title: `巡田提醒已静音，${reminderSnoozeRemainingLabel.value} 后恢复`,
      detail: `当前账号 ${displayName.value} 的催办提醒先暂停，但下方自动建议和一键链路仍可直接执行。`,
      meta: `恢复后会继续按“成熟地 / 待照料 / 倒计时 / 失败记忆”这套优先级提醒你。`,
      primaryActionKey: primary.actionKey,
      primaryActionLabel: primary.actionLabel,
      primaryDisabled: primary.disabled,
      primaryLoading: primary.loading,
      snoozed: true,
      snoozeLabel: '恢复提醒',
    }
  }

  if (!currentId) {
    return {
      tone: 'warning',
      title: '先选一个账号，巡田提醒才能切到真实节奏',
      detail: '当前还是空场模式，建议先回主控制台选账号，再回来接入地块与好友数据。',
      meta: '选中账号后，我会开始结合成熟地、照料需求和巡查倒计时给出实时提醒。',
      primaryActionKey: primary.actionKey,
      primaryActionLabel: primary.actionLabel,
      primaryDisabled: primary.disabled,
      primaryLoading: primary.loading,
      snoozed: false,
      snoozeLabel: '稍后 10 分钟提醒',
    }
  }

  if (retryState?.sameAccount && retryState.hasRetryableFailures) {
    return {
      tone: 'danger',
      title: '现在最该先处理的是上轮失败项',
      detail: retryState.retrySummary,
      meta: `来源于 ${retryState.memory.accountLabel} · ${retryState.strategySummary}`,
      primaryActionKey: primary.actionKey,
      primaryActionLabel: primary.actionLabel,
      primaryDisabled: primary.disabled,
      primaryLoading: primary.loading,
      snoozed: false,
      snoozeLabel: '稍后 10 分钟提醒',
    }
  }

  if (harvestableLandCount.value > 0 || careAlertLandCount.value > 0) {
    return {
      tone: harvestableLandCount.value > 0 ? 'warning' : 'brand',
      title: harvestableLandCount.value > 0
        ? `田里已经有 ${harvestableLandCount.value} 块成熟地，适合立刻回田`
        : `当前有 ${careAlertLandCount.value} 块地待照料，建议顺手清一轮`,
      detail: harvestableLandCount.value > 0
        ? `成熟地 ${harvestableLandCount.value} 块，待照料 ${careAlertLandCount.value} 块，空地 ${emptyLandCount.value} 块。`
        : `待照料 ${careAlertLandCount.value} 块，快成熟 ${almostReadyLandCount.value} 块，空地 ${emptyLandCount.value} 块。`,
      meta: `农场巡查 ${nextFarmCheck.value} · 好友巡查 ${nextFriendCheck.value}`,
      primaryActionKey: primary.actionKey,
      primaryActionLabel: primary.actionLabel,
      primaryDisabled: primary.disabled,
      primaryLoading: primary.loading,
      snoozed: false,
      snoozeLabel: '稍后 10 分钟提醒',
    }
  }

  if (nextFarmSoon || nextFriendSoon || almostReadyLandCount.value > 0 || urgentFriendActionCount.value > 0) {
    return {
      tone: 'success',
      title: '下一轮巡田快到了，建议提前把动作准备好',
      detail: `快成熟 ${almostReadyLandCount.value} 块，好友待处理 ${urgentFriendActionCount.value} 个动作，右侧建议卡已经按优先级排好了。`,
      meta: `农场巡查 ${nextFarmCheck.value}${nextFarmSoon ? '（即将到点）' : ''} · 好友巡查 ${nextFriendCheck.value}${nextFriendSoon ? '（即将到点）' : ''}`,
      primaryActionKey: primary.actionKey,
      primaryActionLabel: primary.actionLabel,
      primaryDisabled: primary.disabled,
      primaryLoading: primary.loading,
      snoozed: false,
      snoozeLabel: '稍后 10 分钟提醒',
    }
  }

  return {
    tone: 'brand',
    title: '当前节奏比较平稳，这轮先按建议卡轻量巡田就好',
    detail: `成熟地 ${harvestableLandCount.value} 块，待照料 ${careAlertLandCount.value} 块，枯萎 ${deadLandCount.value} 块。`,
    meta: `农场巡查 ${nextFarmCheck.value} · 好友巡查 ${nextFriendCheck.value}`,
    primaryActionKey: primary.actionKey,
    primaryActionLabel: primary.actionLabel,
    primaryDisabled: primary.disabled,
    primaryLoading: primary.loading,
    snoozed: false,
    snoozeLabel: '稍后 10 分钟提醒',
  }
})

const availableTargetLands = computed(() => {
  return sortedLands.value.filter((land: any) => {
    const landId = Number(land?.id || 0)
    if (landId <= 0)
      return false
    if (land?.unlocked === false)
      return false
    return String(land?.status || '') !== 'locked'
  })
})

const availableTargetLandIdSet = computed(() =>
  new Set(availableTargetLands.value.map((land: any) => Number(land?.id || 0))),
)

const suggestedTargetLandIds = computed(() => {
  if (!landTargetItem.value || !itemNeedsLandTargetSelection(landTargetItem.value))
    return []
  return availableTargetLands.value
    .filter((land: any) => getLandTargetSuggestionReason(landTargetItem.value, land))
    .map((land: any) => Number(land?.id || 0))
})

const landTargetSelectionLimit = computed(() =>
  landTargetItem.value ? getLandTargetSelectionLimit(landTargetItem.value) : 0,
)

const landTargetSelectionHint = computed(() =>
  landTargetItem.value ? getLandTargetSelectionHint(landTargetItem.value) : '',
)

async function ensureData(force = false) {
  rememberedConsoleRoute.value = readPastoralRememberedRoute()
  workflowMemory.value = readPastoralWorkflowMemory()

  if (!accounts.value.length)
    await accountStore.fetchAccounts()

  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId) {
    hydrated.value = true
    return
  }

  if (force || !realtimeConnected.value || !status.value)
    await statusStore.fetchStatus(accountId)

  if (force || logs.value.length === 0)
    await statusStore.fetchLogs(accountId, { limit: 24 })

  if (currentAccount.value?.running && status.value?.connection?.connected) {
    await Promise.all([
      bagStore.fetchBag(accountId),
      farmStore.fetchLands(accountId),
      farmStore.fetchPlantableBagSeeds(accountId, { includeZeroUsable: false, includeLocked: false }),
      statusStore.fetchDailyGifts(accountId),
    ])
  }

  hydrated.value = true
}

async function fetchAnnouncements() {
  announcementLoading.value = true
  try {
    const { data } = await api.get<{ ok?: boolean, data?: PastoralAnnouncement[] }>('/api/announcement')
    if (data?.ok && Array.isArray(data.data))
      announcements.value = data.data
  }
  catch {
    if (!announcements.value.length)
      announcements.value = []
  }
  finally {
    announcementLoading.value = false
  }
}

async function ensureQuickActionData(key: QuickActionKey) {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId)
    return

  if (key === 'bag') {
    await bagStore.fetchBag(accountId)
    return
  }

  if (key === 'task') {
    if (currentAccount.value?.running && status.value?.connection?.connected)
      await statusStore.fetchDailyGifts(accountId)
    return
  }

  if (key === 'friends') {
    await Promise.all([
      friendStore.fetchFriends(accountId),
      friendStore.fetchBlacklist(accountId),
    ])
    return
  }

  await Promise.all([
    statusStore.fetchLogs(accountId, { limit: 80 }),
    friendStore.fetchInteractRecords(accountId, 40),
  ])
}

async function openQuickAction(action: QuickActionConfig) {
  quickPanelKey.value = action.key
  quickPanelBusy.value = true
  try {
    await ensureQuickActionData(action.key)
  }
  finally {
    quickPanelBusy.value = false
  }
}

function closeQuickActionPanel() {
  quickPanelKey.value = ''
  quickPanelBusy.value = false
}

function closePlantSeedPalette() {
  plantSeedPaletteExpanded.value = false
  plantSpotlightLandId.value = null
}

function setPlantRecommendStrategy(strategy: PastoralPlantRecommendStrategy) {
  if (plantRecommendStrategy.value === strategy)
    return
  plantRecommendStrategy.value = strategy
}

function setPlantBatchTemplate(template: PastoralPlantBatchTemplate) {
  if (plantBatchTemplate.value === template)
    return
  plantBatchTemplate.value = template
}

function setPlantCycleTemplate(template: PastoralPlantCycleTemplate) {
  if (plantCycleTemplate.value === template)
    return
  plantCycleTemplate.value = template
}

async function refreshPastoralDirectActionData(accountId: string) {
  await Promise.allSettled([
    statusStore.fetchStatus(accountId),
    statusStore.fetchDailyGifts(accountId),
    bagStore.fetchBag(accountId),
    farmStore.fetchLands(accountId),
    farmStore.fetchPlantableBagSeeds(accountId, { includeZeroUsable: false, includeLocked: false }),
  ])
}

async function applyAutoPlantPlanOperations(accountId: string, plan: PastoralAutoPlantPlan) {
  const appliedLandIds: number[] = []
  const failedOperations: PastoralWorkflowRetryPlantOperation[] = []
  let firstError: unknown = null

  for (const operation of plan.operations) {
    const itemId = Number(operation.seed?.itemId || 0)
    const landIds = (Array.isArray(operation.landIds) ? operation.landIds : []).map(id => Number(id || 0)).filter(id => id > 0)
    if (!itemId || !landIds.length)
      continue
    try {
      await bagStore.useBagItem(accountId, itemId, operation.count, landIds)
      appliedLandIds.push(...landIds)
    }
    catch (error) {
      failedOperations.push({
        itemId,
        landIds,
        count: landIds.length,
        label: String(operation.seed?.name || `种子#${itemId}`).trim() || `种子#${itemId}`,
      })
      if (!firstError)
        firstError = error
    }
  }

  await refreshPastoralDirectActionData(accountId)

  return {
    appliedLandIds,
    failedOperations,
    firstError,
    leftoverSuffix: plan.leftoverCount > 0 ? `，还有 ${plan.leftoverCount} 块空地保留到下一轮` : '',
  }
}

async function harvestReadyLands(accountId: string, landIds: number[]) {
  const normalizedIds = Array.from(new Set((landIds || []).map(id => Number(id || 0)).filter(id => id > 0)))
  const successIds: number[] = []
  const failedIds: number[] = []
  let firstError: unknown = null

  for (const landId of normalizedIds) {
    try {
      await farmStore.operateLand(accountId, landId, 'harvest', { refresh: false })
      successIds.push(landId)
    }
    catch (error) {
      failedIds.push(landId)
      if (!firstError)
        firstError = error
    }
  }

  await refreshPastoralDirectActionData(accountId)

  return {
    successIds,
    failedIds,
    firstError,
  }
}

async function applyAutoCareOperations(accountId: string, operations: PastoralAutoCareOperation[]) {
  const successIds: number[] = []
  const failedOperations: PastoralWorkflowRetryCareOperation[] = []
  let firstError: unknown = null

  for (const operation of operations) {
    const failedLandIds: number[] = []
    for (const landId of operation.landIds) {
      const numericLandId = Number(landId || 0)
      if (!numericLandId)
        continue
      try {
        await farmStore.operateLand(accountId, numericLandId, operation.type, { refresh: false })
        successIds.push(numericLandId)
      }
      catch (error) {
        failedLandIds.push(numericLandId)
        if (!firstError)
          firstError = error
      }
    }
    if (failedLandIds.length > 0) {
      failedOperations.push({
        type: operation.type,
        landIds: failedLandIds,
        label: operation.label,
      })
    }
  }

  await refreshPastoralDirectActionData(accountId)

  return {
    successIds,
    failedOperations,
    firstError,
  }
}

async function applyAutoFertilizerOperations(accountId: string, operations: PastoralAutoFertilizerOperation[]) {
  const successIds: number[] = []
  const failedOperations: PastoralWorkflowRetryFertilizerOperation[] = []
  let firstError: unknown = null

  for (const operation of operations) {
    if (!operation.count || !operation.landIds.length)
      continue
    try {
      await bagStore.useBagItem(accountId, operation.itemId, operation.count, operation.landIds)
      successIds.push(...operation.landIds)
    }
    catch (error) {
      failedOperations.push({
        itemId: operation.itemId,
        landIds: [...operation.landIds],
        count: operation.landIds.length,
        label: operation.label,
        tone: operation.tone,
      })
      if (!firstError)
        firstError = error
    }
  }

  await refreshPastoralDirectActionData(accountId)

  return {
    successIds,
    failedOperations,
    firstError,
  }
}

function persistWorkflowMemory(input: {
  stage: PastoralWorkflowMemory['stage']
  summaryText: string
  detailText: string
  retryHarvestLandIds?: number[]
  retryPlantOperations?: PastoralWorkflowRetryPlantOperation[]
  retryCareOperations?: PastoralWorkflowRetryCareOperation[]
  retryFertilizerOperations?: PastoralWorkflowRetryFertilizerOperation[]
}) {
  const payload = buildWorkflowMemoryPayload(input)
  if (payload)
    syncWorkflowMemory(payload)
}

async function retryWorkflowMemoryFailures(accountId: string, memory: PastoralWorkflowMemory) {
  const harvestResult = await harvestReadyLands(accountId, memory.retryHarvestLandIds)
  const plantResult = memory.retryPlantOperations.length > 0
    ? await applyAutoPlantPlanOperations(accountId, {
        canApply: true,
        disabledReason: '',
        operations: memory.retryPlantOperations.map(operation => ({
          seed: {
            itemId: operation.itemId,
            name: operation.label,
          },
          landIds: operation.landIds,
          count: operation.count,
        })),
        targetCount: countRetryOperationLands(memory.retryPlantOperations),
        leftoverCount: 0,
        heldEmptyCount: 0,
        targetPreview: '',
        seedSummary: memory.retryPlantOperations.map(operation => `${operation.label} x${operation.landIds.length}`).join(' + '),
        detailText: '',
        templateNote: '',
        spotlightIncluded: false,
        primarySeed: null,
        secondarySeed: null,
      })
    : {
        appliedLandIds: [] as number[],
        failedOperations: [] as PastoralWorkflowRetryPlantOperation[],
        firstError: null as unknown,
        leftoverSuffix: '',
      }
  const careResult = await applyAutoCareOperations(accountId, memory.retryCareOperations.map(operation => ({
    type: operation.type,
    landIds: operation.landIds,
    label: operation.label,
  })))
  const fertilizerResult = await applyAutoFertilizerOperations(accountId, memory.retryFertilizerOperations.map(operation => ({
    itemId: operation.itemId,
    landIds: operation.landIds,
    count: operation.count,
    label: operation.label,
    tone: operation.tone,
  })))

  return {
    harvestResult,
    plantResult,
    careResult,
    fertilizerResult,
  }
}

async function handleAutoPlantByTemplate() {
  const accountId = String(currentAccountId.value || '').trim()
  const plan = autoPlantPlan.value
  if (!accountId || !plan?.canApply)
    return
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用一键补种')
    return
  }
  if (autoPlantApplying.value || bagActionLoading.value)
    return

  const confirmLabel = `按“${activePlantRecommendOption.value.label} + ${activePlantBatchOption.value.label}”`
  if (plan.targetCount > 1 && !confirmQuickAction(`确定${confirmLabel}，补种 ${plan.targetCount} 块空地吗？`))
    return

  autoPlantApplying.value = true
  try {
    const result = await applyAutoPlantPlanOperations(accountId, plan)
    triggerLandSweep(result.appliedLandIds)
    if (plan.spotlightIncluded)
      plantSpotlightLandId.value = null
    const failureSuffix = result.failedOperations.length > 0 ? `，另有 ${countRetryOperationLands(result.failedOperations)} 块空地补种未成功` : ''
    persistWorkflowMemory({
      stage: 'plant',
      summaryText: `${activePlantBatchOption.value.label}补种`,
      detailText: `已用 ${plan.seedSummary} 尝试补种 ${plan.targetCount} 块空地${result.leftoverSuffix}${failureSuffix}`,
      retryPlantOperations: result.failedOperations,
    })
    if (!result.appliedLandIds.length && result.failedOperations.length > 0) {
      toastStore.warning(`补种未成功，失败项已记入流水线记忆，可稍后直接补跑${failureSuffix}`)
      return
    }
    toastStore.success(`${activePlantBatchOption.value.label}完成，已用 ${plan.seedSummary} 补种 ${result.appliedLandIds.length} 块空地${result.leftoverSuffix}${failureSuffix}`)
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '一键补种失败，请稍后再试'))
  }
  finally {
    autoPlantApplying.value = false
  }
}

async function handleAutoHarvestAndReplant() {
  const accountId = String(currentAccountId.value || '').trim()
  const plan = autoHarvestReplantPlan.value
  if (!accountId || !plan.canApply)
    return
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用自动收获回补')
    return
  }
  if (landTargetItem.value) {
    toastStore.info('当前正在进行选地道具操作，请先完成或取消选地模式')
    return
  }
  if (autoHarvestReplantApplying.value || autoPlantApplying.value || bagActionLoading.value)
    return
  if (operatingLandIds.value.length > 0) {
    toastStore.warning('当前还有土地操作在进行中，请稍后再试自动收获回补')
    return
  }

  const confirmMessage = `确定先收获 ${plan.harvestCount} 块成熟地，再按“${activePlantRecommendOption.value.label} + ${activePlantBatchOption.value.label}”回补 ${plan.replantPlan.targetCount} 块空地吗？`
  if (!confirmQuickAction(confirmMessage))
    return

  autoHarvestReplantApplying.value = true
  try {
    const harvestResult = await harvestReadyLands(accountId, plan.harvestLandIds)
    if (!harvestResult.successIds.length) {
      throw harvestResult.firstError || new Error('当前没有成功收获的成熟地')
    }

    const nextPlan = autoPlantPlan.value
    const failedSuffix = harvestResult.failedIds.length > 0 ? `，另有 ${harvestResult.failedIds.length} 块成熟地未收成功` : ''

    if (!nextPlan.canApply) {
      triggerLandSweep(harvestResult.successIds)
      persistWorkflowMemory({
        stage: 'harvest-replant',
        summaryText: '自动收获回补未完成',
        detailText: `已先收获 ${harvestResult.successIds.length} 块成熟地${failedSuffix}，但当前还无法生成稳定补种方案`,
        retryHarvestLandIds: harvestResult.failedIds,
      })
      toastStore.warning(`已先收获 ${harvestResult.successIds.length} 块成熟地${failedSuffix}，但当前还无法生成可执行补种计划`)
      return
    }

    const applyResult = await applyAutoPlantPlanOperations(accountId, nextPlan)
    triggerLandSweep([...harvestResult.successIds, ...applyResult.appliedLandIds])
    if (nextPlan.spotlightIncluded)
      plantSpotlightLandId.value = null
    const plantFailureSuffix = applyResult.failedOperations.length > 0 ? `，${countRetryOperationLands(applyResult.failedOperations)} 块空地回补未成功` : ''
    persistWorkflowMemory({
      stage: 'harvest-replant',
      summaryText: '自动收获后回补',
      detailText: `已自动收获 ${harvestResult.successIds.length} 块成熟地，并尝试用 ${nextPlan.seedSummary} 回补 ${nextPlan.targetCount} 块空地${applyResult.leftoverSuffix}${failedSuffix}${plantFailureSuffix}`,
      retryHarvestLandIds: harvestResult.failedIds,
      retryPlantOperations: applyResult.failedOperations,
    })
    toastStore.success(`已自动收获 ${harvestResult.successIds.length} 块成熟地，并用 ${nextPlan.seedSummary} 回补 ${applyResult.appliedLandIds.length} 块空地${applyResult.leftoverSuffix}${failedSuffix}${plantFailureSuffix}`)
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '自动收获回补失败，请稍后再试'))
  }
  finally {
    autoHarvestReplantApplying.value = false
  }
}

async function handleAutoCareWorkflow() {
  const accountId = String(currentAccountId.value || '').trim()
  const plan = autoCareWorkflowPlan.value
  if (!accountId || !plan.canApply)
    return
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用自动照料联动')
    return
  }
  if (landTargetItem.value) {
    toastStore.info('当前正在进行选地道具操作，请先完成或取消选地模式')
    return
  }
  if (autoCareWorkflowApplying.value || autoHarvestReplantApplying.value || autoPlantApplying.value || bagActionLoading.value) {
    return
  }
  if (operatingLandIds.value.length > 0) {
    toastStore.warning('当前还有土地操作在进行中，请稍后再试自动照料联动')
    return
  }

  const confirmMessage = `确定先收获 ${plan.harvestCount} 块成熟地、回补 ${plan.replantPlan.targetCount} 块空地，并继续联动 ${plan.careSummary} / ${plan.fertilizerSummary} 吗？`
  if (!confirmQuickAction(confirmMessage))
    return

  autoCareWorkflowApplying.value = true
  try {
    const harvestResult = await harvestReadyLands(accountId, plan.harvestLandIds)
    if (!harvestResult.successIds.length)
      throw harvestResult.firstError || new Error('当前没有成功收获的成熟地')

    const nextPlantPlan = autoPlantPlan.value
    const harvestFailedSuffix = harvestResult.failedIds.length > 0 ? `，另有 ${harvestResult.failedIds.length} 块成熟地未收成功` : ''

    if (!nextPlantPlan.canApply) {
      triggerLandSweep(harvestResult.successIds)
      persistWorkflowMemory({
        stage: 'care',
        summaryText: '自动照料联动未完成',
        detailText: `已先收获 ${harvestResult.successIds.length} 块成熟地${harvestFailedSuffix}，但当前还无法生成稳定补种方案`,
        retryHarvestLandIds: harvestResult.failedIds,
      })
      toastStore.warning(`已先收获 ${harvestResult.successIds.length} 块成熟地${harvestFailedSuffix}，但当前还无法生成稳定补种计划`)
      return
    }

    const plantResult = await applyAutoPlantPlanOperations(accountId, nextPlantPlan)
    const liveWorkflowPlan = buildAutoCareWorkflowPlanFromState(
      sortedLands.value.filter((land: any) => String(land?.status || '') !== 'harvestable'),
      harvestResult.successIds.length,
      harvestResult.successIds,
      nextPlantPlan,
    )
    const careResult = await applyAutoCareOperations(accountId, liveWorkflowPlan.careOperations)
    const fertilizerResult = await applyAutoFertilizerOperations(accountId, liveWorkflowPlan.fertilizerOperations)

    const touchedLandIds = [
      ...harvestResult.successIds,
      ...plantResult.appliedLandIds,
      ...careResult.successIds,
      ...fertilizerResult.successIds,
    ]
    triggerLandSweep(touchedLandIds)

    if (nextPlantPlan.spotlightIncluded)
      plantSpotlightLandId.value = null

    const careSuffix = liveWorkflowPlan.careOperations.length
      ? `，并完成 ${liveWorkflowPlan.careSummary}`
      : '，回补后暂无额外补水除草除虫'
    const fertilizerSuffix = liveWorkflowPlan.fertilizerOperations.length
      ? `，随后执行 ${liveWorkflowPlan.fertilizerSummary}`
      : '，本轮未追加化肥'
    const failureSuffix = [
      harvestFailedSuffix,
      plantResult.failedOperations.length > 0 ? `，${countRetryOperationLands(plantResult.failedOperations)} 块空地回补未成功` : '',
      careResult.failedOperations.length > 0 ? `，${countRetryOperationLands(careResult.failedOperations)} 块地照料未成功` : '',
      fertilizerResult.failedOperations.length > 0 ? `，${countRetryOperationLands(fertilizerResult.failedOperations)} 块地施肥未成功` : '',
    ].join('')

    persistWorkflowMemory({
      stage: 'care',
      summaryText: '自动照料联动',
      detailText: `已自动收获 ${harvestResult.successIds.length} 块成熟地，并尝试用 ${nextPlantPlan.seedSummary} 回补 ${nextPlantPlan.targetCount} 块空地${plantResult.leftoverSuffix}${careSuffix}${fertilizerSuffix}${failureSuffix}`,
      retryHarvestLandIds: harvestResult.failedIds,
      retryPlantOperations: plantResult.failedOperations,
      retryCareOperations: careResult.failedOperations,
      retryFertilizerOperations: fertilizerResult.failedOperations,
    })
    toastStore.success(`已自动收获 ${harvestResult.successIds.length} 块成熟地，并用 ${nextPlantPlan.seedSummary} 回补 ${plantResult.appliedLandIds.length} 块空地${plantResult.leftoverSuffix}${careSuffix}${fertilizerSuffix}${failureSuffix}`)
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '自动照料联动失败，请稍后再试'))
  }
  finally {
    autoCareWorkflowApplying.value = false
  }
}

async function handleRetryRememberedWorkflow() {
  const state = retryRememberedWorkflowState.value
  const accountId = String(currentAccountId.value || '').trim()
  if (!state || !accountId)
    return
  if (!state.sameAccount) {
    toastStore.warning('这份流水线记忆来自其他账号，请先切回对应账号')
    return
  }
  if (!state.hasRetryableFailures) {
    toastStore.info('这份流水线记忆里当前没有待补跑的失败项')
    return
  }
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再补跑失败项')
    return
  }
  if (landTargetItem.value) {
    toastStore.info('当前正在进行选地道具操作，请先完成或取消选地模式')
    return
  }
  if (retryRememberedWorkflowApplying.value || autoCareWorkflowApplying.value || autoHarvestReplantApplying.value || autoPlantApplying.value || bagActionLoading.value)
    return
  if (operatingLandIds.value.length > 0) {
    toastStore.warning('当前还有土地操作在进行中，请稍后再补跑失败项')
    return
  }
  if (!confirmQuickAction(`确定补跑上次失败项吗？\n${state.retrySummary}`))
    return

  retryRememberedWorkflowApplying.value = true
  try {
    const result = await retryWorkflowMemoryFailures(accountId, state.memory)
    const touchedLandIds = [
      ...result.harvestResult.successIds,
      ...result.plantResult.appliedLandIds,
      ...result.careResult.successIds,
      ...result.fertilizerResult.successIds,
    ]
    triggerLandSweep(touchedLandIds)

    const nextMemory = buildWorkflowMemoryPayload({
      stage: state.memory.stage,
      summaryText: '失败项补跑',
      detailText: `已按记忆补跑：${state.retrySummary}`,
      retryHarvestLandIds: result.harvestResult.failedIds,
      retryPlantOperations: result.plantResult.failedOperations,
      retryCareOperations: result.careResult.failedOperations,
      retryFertilizerOperations: result.fertilizerResult.failedOperations,
    })
    if (nextMemory)
      syncWorkflowMemory(nextMemory)

    const remainingFailures = nextMemory ? buildWorkflowRetrySummary(nextMemory) : '当前没有待补跑的失败项'
    const hasRemaining = nextMemory ? hasWorkflowRetryableFailures(nextMemory) : false
    const failureSuffix = hasRemaining ? `，仍有失败项待补跑：${remainingFailures}` : '，失败项已清空'
    toastStore.success(`已补跑上次失败项，成功触达 ${touchedLandIds.length} 块土地${failureSuffix}`)
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '补跑失败项失败，请稍后再试'))
  }
  finally {
    retryRememberedWorkflowApplying.value = false
  }
}

function handleReminderSnooze(minutes = 10) {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId) {
    toastStore.info('先选定账号后，巡田提醒才能按账号单独静音')
    return
  }

  const nextSnooze: PastoralReminderSnooze = {
    accountId,
    untilAt: Date.now() + minutes * 60 * 1000,
    recordedAt: Date.now(),
  }
  syncReminderSnooze(nextSnooze)
  toastStore.success(`巡田提醒已静音 ${minutes} 分钟，稍后会自动恢复`)
}

function handleReminderRestore() {
  if (!activeReminderSnooze.value) {
    toastStore.info('当前没有处于静音中的巡田提醒')
    return
  }
  syncReminderSnooze(null)
  toastStore.success('巡田提醒已恢复')
}

async function openQuickActionByKey(key: QuickActionKey) {
  const action = quickActions.find(item => item.key === key)
  if (!action)
    return
  await openQuickAction(action)
}

async function handleSuggestionAction(actionKey: PastoralSuggestionActionKey) {
  if (actionKey === 'retry-memory') {
    await handleRetryRememberedWorkflow()
    return
  }
  if (actionKey === 'auto-care') {
    await handleAutoCareWorkflow()
    return
  }
  if (actionKey === 'auto-harvest') {
    await handleAutoHarvestAndReplant()
    return
  }
  if (actionKey === 'auto-plant') {
    await handleAutoPlantByTemplate()
    return
  }
  if (actionKey === 'open-seeds') {
    await openPlantSeedPalette()
    return
  }
  if (actionKey === 'open-friends') {
    await openQuickActionByKey('friends')
    return
  }
  if (actionKey === 'refresh-stage') {
    await refreshPastoralStage()
    return
  }
  if (actionKey === 'open-settings') {
    openPastoralSettings()
    return
  }
  returnToConsole()
}

function toggleSidePanelCollapsed(force?: boolean) {
  sidePanelCollapsed.value = typeof force === 'boolean' ? force : !sidePanelCollapsed.value
}

function openQuickActionTarget() {
  const target = activeQuickAction.value?.target
  closeQuickActionPanel()
  if (target)
    void router.push(target)
}

function setPanelActionLoading(key: string, loading: boolean) {
  if (!key)
    return
  if (loading) {
    panelActionLoadingMap.value = {
      ...panelActionLoadingMap.value,
      [key]: true,
    }
    return
  }
  const next = { ...panelActionLoadingMap.value }
  delete next[key]
  panelActionLoadingMap.value = next
}

function isPanelActionLoading(key: string) {
  return !!panelActionLoadingMap.value[key]
}

function getOperationErrorMessage(error: unknown, fallback: string) {
  const raw = String((error as any)?.message || '').trim()
  return raw || fallback
}

function confirmQuickAction(message: string) {
  if (typeof window === 'undefined')
    return true
  return window.confirm(message)
}

function getFriendBatchTargetIds(opType: FriendActionType) {
  return (Array.isArray(friends.value) ? friends.value : [])
    .filter((friend: any) => {
      const gid = Number(friend?.gid || 0)
      if (!gid || blacklist.value.includes(gid))
        return false
      const plant = friend?.plant || {}
      if (opType === 'steal')
        return Number(plant?.stealNum || 0) > 0
      if (opType === 'water')
        return Number(plant?.dryNum || 0) > 0
      if (opType === 'weed')
        return Number(plant?.weedNum || 0) > 0
      return Number(plant?.insectNum || 0) > 0
    })
    .map((friend: any) => Number(friend?.gid || 0))
    .filter((gid: number) => gid > 0)
}

function getFriendBatchActionLabel(opType: FriendActionType) {
  if (opType === 'steal')
    return '一键偷菜'
  if (opType === 'water')
    return '批量浇水'
  if (opType === 'weed')
    return '批量除草'
  return '批量除虫'
}

function getInteractAvatar(record: any) {
  return String(record?.avatarUrl || '').trim()
}

function getInteractActionLabel(actionType: number) {
  if (Number(actionType) === 1)
    return '偷菜'
  if (Number(actionType) === 2)
    return '帮忙'
  if (Number(actionType) === 3)
    return '捣乱'
  return '互动'
}

function formatInteractTime(timestamp: any) {
  const ts = Number(timestamp) || 0
  if (!ts)
    return '--'
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  if (diff >= 0 && diff < minute)
    return '刚刚'
  if (diff >= minute && diff < hour)
    return `${Math.floor(diff / minute)} 分钟前`
  const sameDay = now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate()
  if (sameDay) {
    return `今天 ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getLandActions(land: any): Array<{ type: LandActionType, label: string }> {
  const actions: Array<{ type: LandActionType, label: string }> = []
  if (String(land?.status || '') === 'harvestable')
    actions.push({ type: 'harvest', label: '收获' })
  if (land?.needWater)
    actions.push({ type: 'water', label: '浇水' })
  if (land?.needWeed)
    actions.push({ type: 'weed', label: '除草' })
  if (land?.needBug)
    actions.push({ type: 'bug', label: '除虫' })
  return actions
}

function isLandActionBusy(landId: any) {
  return operatingLandIds.value.includes(Number(landId || 0))
}

function isLandSelectableForTarget(land: any) {
  return !!landTargetItem.value && availableTargetLandIdSet.value.has(Number(land?.id || 0))
}

function isLandTargetSelected(landId: any) {
  return selectedTargetLandIds.value.includes(Number(landId || 0))
}

function isLandTargetSuggested(landId: any) {
  return suggestedTargetLandIds.value.includes(Number(landId || 0))
}

function isLandActionLoading(landId: any, opType: LandActionType) {
  return landActionLoadingMap.value[String(Number(landId || 0))] === opType
}

async function handleLandAction(land: any, opType: LandActionType) {
  const accountId = String(currentAccountId.value || '').trim()
  const landId = Number(land?.id || 0)
  if (!accountId || !landId) {
    toastStore.warning('当前没有可操作的账号或土地')
    return
  }
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用田园快捷操作')
    return
  }
  if (landTargetItem.value) {
    toastStore.info('当前正在进行选地道具操作，请先完成或取消选地模式')
    return
  }
  if (isLandActionBusy(landId))
    return

  const landKey = String(landId)
  const actionLabel = OPERATION_LABELS[opType] || opType
  const landName = String(land?.plantName || `${landId} 号土地`).trim()

  landActionLoadingMap.value = {
    ...landActionLoadingMap.value,
    [landKey]: opType,
  }

  try {
    await farmStore.operateLand(accountId, landId, opType)
    await Promise.allSettled([
      statusStore.fetchStatus(accountId),
      bagStore.fetchBag(accountId),
      statusStore.fetchDailyGifts(accountId),
    ])
    triggerLandSweep([landId])
    toastStore.success(`${landName} 已完成${actionLabel}`)
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, `${actionLabel}失败，请稍后再试`))
  }
  finally {
    const next = { ...landActionLoadingMap.value }
    delete next[landKey]
    landActionLoadingMap.value = next
  }
}

function getLandTargetSelectionLimit(item: any) {
  return Math.max(1, Number(item?.count || 1))
}

function getLandTargetSelectionHint(item: any) {
  const type = String(item?.interactionType || '').trim().toLowerCase()
  if (type === 'water')
    return '优先选择缺水土地'
  if (type === 'erasegrass')
    return '优先选择有杂草的土地'
  if (type === 'killbug')
    return '优先选择有虫害的土地'
  if (type === 'harvest')
    return '优先选择可收获土地'
  if (type === 'erase')
    return '优先选择正在生长或已枯萎的土地'
  if (type === 'plant')
    return '优先选择空地'
  if (type === 'fertilizer' || type === 'fertilizerpro')
    return '优先选择正在生长的土地，空地和已成熟地一般不适合施肥'
  return '点击下方土地卡即可选中或取消'
}

function getLandTargetSuggestionReason(item: any, land: any) {
  const type = String(item?.interactionType || '').trim().toLowerCase()
  const statusValue = String(land?.status || '').trim().toLowerCase()
  if (type === 'water')
    return !!land?.needWater
  if (type === 'erasegrass')
    return !!land?.needWeed
  if (type === 'killbug')
    return !!land?.needBug
  if (type === 'harvest')
    return statusValue === 'harvestable'
  if (type === 'erase')
    return ['growing', 'dead', 'harvestable'].includes(statusValue)
  if (type === 'plant')
    return statusValue === 'empty'
  if (type === 'fertilizer' || type === 'fertilizerpro') {
    const hasPlant = !!String(land?.plantName || '').trim() || !!land?.plant || !!land?.plantId
    return hasPlant && !['empty', 'dead', 'locked', 'harvestable', 'stealable'].includes(statusValue)
  }
  return false
}

function pruneSelectedTargetLands() {
  if (!landTargetItem.value) {
    selectedTargetLandIds.value = []
    return
  }
  const limit = getLandTargetSelectionLimit(landTargetItem.value)
  selectedTargetLandIds.value = selectedTargetLandIds.value
    .filter(id => availableTargetLandIdSet.value.has(Number(id || 0)))
    .slice(0, limit)
}

function toggleTargetLandSelection(landId: number) {
  if (!landTargetItem.value)
    return
  if (!availableTargetLandIdSet.value.has(landId))
    return
  if (!selectedTargetLandIds.value.includes(landId)) {
    const limit = getLandTargetSelectionLimit(landTargetItem.value)
    if (selectedTargetLandIds.value.length >= limit) {
      toastStore.warning(`当前物品最多只能选择 ${limit} 块土地`)
      return
    }
    selectedTargetLandIds.value = [...selectedTargetLandIds.value, landId]
    return
  }
  selectedTargetLandIds.value = selectedTargetLandIds.value.filter(id => id !== landId)
}

function selectSuggestedTargetLands() {
  if (!landTargetItem.value)
    return
  const limit = getLandTargetSelectionLimit(landTargetItem.value)
  selectedTargetLandIds.value = [...suggestedTargetLandIds.value].slice(0, limit)
}

function clearTargetLandSelection() {
  selectedTargetLandIds.value = []
}

function resetLandTargeting() {
  landTargetItem.value = null
  selectedTargetLandIds.value = []
  landTargetApplying.value = false
}

function cancelLandTargeting() {
  resetLandTargeting()
  toastStore.info('已退出主舞台选地模式')
}

async function refreshTargetLands() {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId)
    return
  try {
    await farmStore.fetchLands(accountId)
    pruneSelectedTargetLands()
    toastStore.success('土地舞台已刷新')
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '刷新土地失败，请稍后再试'))
  }
}

async function ensurePlantableSeedsLoaded(force = false) {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId)
    return
  if (!force && plantableBagSeedChoices.value.length > 0)
    return
  if (plantSeedLoading.value)
    return

  plantSeedLoading.value = true
  try {
    await Promise.allSettled([
      Array.isArray(items.value) && items.value.length > 0 ? Promise.resolve() : bagStore.fetchBag(accountId),
      Array.isArray(shopSeeds.value) && shopSeeds.value.length > 0 ? Promise.resolve() : farmStore.fetchSeeds(accountId),
      farmStore.fetchPlantableBagSeeds(accountId, { includeZeroUsable: false, includeLocked: false }),
    ])
  }
  finally {
    plantSeedLoading.value = false
  }
}

async function ensureCropAtlasLoaded(force = false) {
  if (!force && cropAtlasLoaded.value && Object.keys(cropAtlasBySeedId.value).length > 0)
    return
  if (cropAtlasLoading.value)
    return

  cropAtlasLoading.value = true
  try {
    const entries = await loadCropAtlasEntries({
      accountId: String(currentAccountId.value || '').trim(),
    })
    cropAtlasBySeedId.value = buildCropAtlasMap(entries)
    cropAtlasLoaded.value = true
  }
  catch {
    cropAtlasBySeedId.value = {}
  }
  finally {
    cropAtlasLoading.value = false
  }
}

async function startLandTargeting(item: any, options: LandTargetStartOptions = {}) {
  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId) {
    toastStore.warning('当前没有可操作的账号')
    return
  }
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用主舞台选地道具')
    return
  }
  if (!itemNeedsLandTargetSelection(item)) {
    toastStore.warning('这个物品暂不支持主舞台选地')
    return
  }

  if (availableTargetLands.value.length === 0)
    await farmStore.fetchLands(accountId)

  if (availableTargetLands.value.length === 0) {
    toastStore.warning('当前没有可用于选地的土地')
    return
  }

  landTargetItem.value = item
  const presetLandIds = Array.isArray(options.presetLandIds)
    ? options.presetLandIds
        .map(id => Number(id || 0))
        .filter(id => availableTargetLandIdSet.value.has(id))
        .slice(0, getLandTargetSelectionLimit(item))
    : []
  selectedTargetLandIds.value = presetLandIds
  if (!selectedTargetLandIds.value.length)
    selectSuggestedTargetLands()
  closeQuickActionPanel()
  closePlantSeedPalette()
  toggleSidePanelCollapsed(true)
  toastStore.info(`已进入 ${String(item?.name || '道具').trim()} 的主舞台选地模式`)
}

async function applyLandTargetItem() {
  const accountId = String(currentAccountId.value || '').trim()
  const item = landTargetItem.value
  const itemId = Number(item?.id || 0)
  if (!accountId || !itemId || !itemNeedsLandTargetSelection(item))
    return
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用选地道具')
    return
  }
  if (landTargetApplying.value)
    return

  const limit = getLandTargetSelectionLimit(item)
  const landIds = [...selectedTargetLandIds.value].slice(0, limit)
  if (!landIds.length) {
    toastStore.warning('请先选择目标土地')
    return
  }

  landTargetApplying.value = true
  try {
    const result = await bagStore.useBagItem(accountId, itemId, landIds.length, landIds)
    await Promise.allSettled([
      statusStore.fetchStatus(accountId),
      statusStore.fetchDailyGifts(accountId),
      farmStore.fetchLands(accountId),
      farmStore.fetchPlantableBagSeeds(accountId, { includeZeroUsable: false, includeLocked: false }),
      ensureQuickActionData('bag'),
    ])
    triggerLandSweep(landIds)
    toastStore.success(result?.message || `已对 ${landIds.length} 块土地使用 ${String(item?.name || `物品#${itemId}`)}`)
    resetLandTargeting()
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '选地道具使用失败，请稍后再试'))
  }
  finally {
    landTargetApplying.value = false
  }
}

function handleLandCardTargetClick(land: any) {
  if (!landTargetItem.value || landTargetApplying.value)
    return
  const landId = Number(land?.id || 0)
  if (!landId || !isLandSelectableForTarget(land))
    return
  toggleTargetLandSelection(landId)
}

function isEmptyLand(land: any) {
  return String(land?.status || '') === 'empty'
}

function isPlantSpotlightLand(landId: any) {
  return Number(plantSpotlightLandId.value || 0) > 0 && Number(plantSpotlightLandId.value || 0) === Number(landId || 0)
}

async function openPlantSeedPalette(land?: any) {
  if (landTargetItem.value) {
    toastStore.info('当前已经进入道具选地模式，请先完成或取消当前操作')
    return
  }
  if (!hasPlantWorkflowLands.value) {
    toastStore.warning('当前既没有空地也没有成熟地，暂时没有可衔接的补种流程')
    return
  }
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用主舞台速种')
    return
  }
  const landId = Number(land?.id || 0)
  const wasOpen = plantSeedPaletteExpanded.value
  plantSpotlightLandId.value = landId > 0 ? landId : null
  plantSeedPaletteExpanded.value = true
  toggleSidePanelCollapsed(true)
  await Promise.allSettled([
    ensurePlantableSeedsLoaded(wasOpen),
    ensureCropAtlasLoaded(wasOpen),
  ])
  if (!plantableBagSeedChoices.value.length)
    toastStore.warning('当前背包里没有可直接种植的种子')
}

async function handlePlantSeedPick(seed: any) {
  const presetLandIds = Number(plantSpotlightLandId.value || 0) > 0 ? [Number(plantSpotlightLandId.value || 0)] : []
  await startLandTargeting(seed?.item || seed, { presetLandIds })
}

function getFriendActionLabel(type: FriendActionType) {
  if (type === 'steal')
    return '偷菜'
  if (type === 'water')
    return '浇水'
  if (type === 'weed')
    return '除草'
  return '除虫'
}

function getFriendQuickAction(friend: any): { type: FriendActionType, label: string } | null {
  const gid = Number(friend?.gid || 0)
  if (!gid || blacklist.value.includes(gid))
    return null

  const plant = friend?.plant || {}
  if (Number(plant?.stealNum || 0) > 0)
    return { type: 'steal', label: '偷菜' }
  if (Number(plant?.dryNum || 0) > 0)
    return { type: 'water', label: '浇水' }
  if (Number(plant?.weedNum || 0) > 0)
    return { type: 'weed', label: '除草' }
  if (Number(plant?.insectNum || 0) > 0)
    return { type: 'bug', label: '除虫' }
  return null
}

function buildFriendActionKey(friendId: any, opType: FriendActionType) {
  return `friend:${String(friendId || '').trim()}:${opType}`
}

function isBagEntryActionLoading(itemId: any) {
  return !!bagEntryLoadingMap.value[String(Number(itemId || 0))]
}

function buildBagTargetActionKey(itemId: any) {
  return `bag:target:${Number(itemId || 0)}`
}

function parseBagTargetActionKey(actionKey: any) {
  const [scope, action, rawItemId] = String(actionKey || '').trim().split(':')
  const itemId = Number(rawItemId || 0)
  if (scope !== 'bag' || action !== 'target' || itemId <= 0)
    return 0
  return itemId
}

function parseFriendActionKey(actionKey: any): { friendId: string, opType: FriendActionType } | null {
  const [scope, friendId, rawOpType] = String(actionKey || '').trim().split(':')
  if (scope !== 'friend' || !friendId)
    return null
  const opType = String(rawOpType || '').trim()
  if (!['steal', 'water', 'weed', 'bug'].includes(opType))
    return null
  return {
    friendId,
    opType: opType as FriendActionType,
  }
}

function isFriendActionLoading(friendId: any, opType?: FriendActionType) {
  if (!opType)
    return false
  return friendActionLoadingMap.value[String(friendId || '')] === opType
}

async function handleQuickPanelAction(action: any) {
  const actionKey = String(action?.key || '').trim()
  const accountId = String(currentAccountId.value || '').trim()

  if (!actionKey || !accountId)
    return
  if (isPanelActionLoading(actionKey))
    return

  setPanelActionLoading(actionKey, true)
  try {
    if (actionKey === 'bag:refresh') {
      await ensureQuickActionData('bag')
      toastStore.success('仓库摘要已刷新')
      return
    }

    if (actionKey === 'bag:sell-policy') {
      if (!canRunDirectActions.value) {
        toastStore.warning('请先让账号在线运行后，再使用仓库快捷出售')
        return
      }
      if (!confirmQuickAction('确定按当前出售策略执行一次仓库快速出售吗？'))
        return

      const result = await bagStore.sellByPolicy(accountId)
      await Promise.allSettled([
        statusStore.fetchStatus(accountId),
        ensureQuickActionData('bag'),
      ])
      if (result) {
        toastStore.success(result.message || `已按策略出售 ${Number(result?.soldCount || 0)} 个果实`)
      }
      else {
        toastStore.info('仓库快速出售已执行')
      }
      return
    }

    if (actionKey === 'task:refresh') {
      await ensureQuickActionData('task')
      toastStore.success('任务摘要已刷新')
      return
    }

    if (actionKey === 'task:settings') {
      closeQuickActionPanel()
      await router.push({ name: 'Settings' })
      return
    }

    if (actionKey.startsWith('friends-batch:')) {
      const opType = actionKey.replace('friends-batch:', '') as FriendActionType
      if (!canRunDirectActions.value) {
        toastStore.warning('请先让账号在线运行后，再使用好友批量快操作')
        return
      }

      const targetIds = getFriendBatchTargetIds(opType)
      if (targetIds.length === 0) {
        toastStore.warning('当前没有符合条件的好友可处理')
        return
      }

      const label = getFriendBatchActionLabel(opType)
      if (!confirmQuickAction(`确定对当前 ${targetIds.length} 位好友执行“${label}”吗？`))
        return

      const result = await friendStore.batchOperate(accountId, targetIds, opType, {
        continueOnError: true,
        skipBlacklisted: true,
        cooldownMs: 1200,
      })

      await Promise.allSettled([
        statusStore.fetchStatus(accountId),
        statusStore.fetchLogs(accountId, { limit: 80 }),
        statusStore.fetchDailyGifts(accountId),
        bagStore.fetchBag(accountId),
      ])

      if (Number(result?.successCount || 0) > 0)
        toastStore.success(`${label}完成，成功 ${Number(result?.successCount || 0)} 项`)
      else
        toastStore.warning(`${label}已执行，但没有成功项`)
      return
    }

    if (actionKey === 'visitor:refresh') {
      await ensureQuickActionData('visitor')
      toastStore.success('访客记录已刷新')
      return
    }

    if (actionKey === 'visitor:seed-friends') {
      if (!canRunDirectActions.value) {
        toastStore.warning('请先让账号在线运行后，再尝试从访客记录补好友缓存')
        return
      }
      const result = await friendStore.seedFriendsCache(accountId, 100)
      await Promise.allSettled([
        friendStore.fetchFriends(accountId),
        friendStore.fetchBlacklist(accountId),
      ])
      if (result?.ok && Number(result?.seededCount || 0) > 0)
        toastStore.success(`已从访客记录补出 ${Number(result?.seededCount || 0)} 位好友缓存`)
      else if (result?.ok)
        toastStore.info('访客补缓存已执行，但暂未补出可用好友')
      else
        toastStore.warning(result?.error || '访客补缓存失败，请稍后再试')
    }
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '快捷操作失败，请稍后再试'))
  }
  finally {
    setPanelActionLoading(actionKey, false)
  }
}

async function handleQuickPanelEntryAction(entry: any) {
  if (quickPanelKey.value === 'bag') {
    const targetItemId = parseBagTargetActionKey(entry?.actionKey)
    const itemId = parseBagUseActionKey(entry?.actionKey)
    const accountId = String(currentAccountId.value || '').trim()
    if (!accountId || (!targetItemId && !itemId))
      return
    if (targetItemId) {
      const item = (Array.isArray(items.value) ? items.value : []).find((row: any) => Number(row?.id || 0) === targetItemId)
      if (!item || !itemNeedsLandTargetSelection(item)) {
        toastStore.warning('这个物品暂不支持主舞台选地')
        return
      }
      await startLandTargeting(item)
      return
    }
    if (!canRunDirectActions.value) {
      toastStore.warning('请先让账号在线运行后，再使用仓库快捷道具')
      return
    }
    if (isBagEntryActionLoading(itemId))
      return

    const item = (Array.isArray(items.value) ? items.value : []).find((row: any) => Number(row?.id || 0) === itemId)
    if (!item || !canUseBagItemDirectly(item)) {
      toastStore.warning('这个物品更适合去完整仓库页处理')
      return
    }

    const itemKey = String(itemId)
    bagEntryLoadingMap.value = {
      ...bagEntryLoadingMap.value,
      [itemKey]: true,
    }

    try {
      const result = await bagStore.useBagItem(accountId, itemId, 1, [])
      await Promise.allSettled([
        statusStore.fetchStatus(accountId),
        statusStore.fetchDailyGifts(accountId),
        ensureQuickActionData('bag'),
      ])
      toastStore.success(result?.message || `已使用 ${String(item?.name || `物品#${itemId}`)}`)
    }
    catch (error) {
      toastStore.error(getOperationErrorMessage(error, '道具使用失败，请稍后再试'))
    }
    finally {
      const next = { ...bagEntryLoadingMap.value }
      delete next[itemKey]
      bagEntryLoadingMap.value = next
    }
    return
  }

  if (quickPanelKey.value !== 'friends')
    return

  const payload = parseFriendActionKey(entry?.actionKey)
  if (!payload)
    return

  const accountId = String(currentAccountId.value || '').trim()
  if (!accountId) {
    toastStore.warning('当前没有可操作的账号')
    return
  }
  if (!canRunDirectActions.value) {
    toastStore.warning('请先让账号在线运行后，再使用好友快捷操作')
    return
  }
  if (isFriendActionLoading(payload.friendId, payload.opType))
    return

  friendActionLoadingMap.value = {
    ...friendActionLoadingMap.value,
    [payload.friendId]: payload.opType,
  }

  const friendName = String(entry?.title || `好友 ${payload.friendId}`).trim()
  const actionLabel = getFriendActionLabel(payload.opType)

  try {
    await friendStore.operate(accountId, payload.friendId, payload.opType)
    await Promise.allSettled([
      statusStore.fetchStatus(accountId),
      statusStore.fetchLogs(accountId, { limit: 80 }),
      statusStore.fetchDailyGifts(accountId),
      bagStore.fetchBag(accountId),
    ])
    toastStore.success(`${friendName} 已完成${actionLabel}`)
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, `${actionLabel}失败，请稍后再试`))
  }
  finally {
    const next = { ...friendActionLoadingMap.value }
    delete next[payload.friendId]
    friendActionLoadingMap.value = next
  }
}

function returnToConsole() {
  rememberedConsoleRoute.value = readPastoralRememberedRoute()
  const rememberedPath = String(rememberedConsoleRoute.value?.fullPath || '').trim()
  if (rememberedPath) {
    void router.push(rememberedPath)
    return
  }
  void router.push({ name: 'dashboard' })
}

function openPastoralSettings() {
  void router.push({ name: 'Settings' })
}

async function refreshPastoralStage() {
  if (stageRefreshLoading.value)
    return

  stageRefreshLoading.value = true
  try {
    await ensureData(true)
    if (currentAccountId.value)
      toastStore.success('田园舞台已重新同步')
    else
      toastStore.info('请先选择一个账号')
  }
  catch (error) {
    toastStore.error(getOperationErrorMessage(error, '刷新田园舞台失败，请稍后再试'))
  }
  finally {
    stageRefreshLoading.value = false
  }
}

function updateCountdowns() {
  reminderNow.value = Date.now()
  if (status.value?.connection?.connected)
    localUptime.value++

  if (localNextFarmRemainSec.value > 0) {
    localNextFarmRemainSec.value--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec.value)
  }
  else {
    nextFarmCheck.value = status.value?.connection?.connected ? '巡查中...' : '--'
  }

  if (localNextFriendRemainSec.value > 0) {
    localNextFriendRemainSec.value--
    nextFriendCheck.value = formatDuration(localNextFriendRemainSec.value)
  }
  else {
    nextFriendCheck.value = status.value?.connection?.connected ? '巡查中...' : '--'
  }

  if (reminderSnooze.value && Number(reminderSnooze.value.untilAt || 0) <= reminderNow.value)
    syncReminderSnooze(null)
}

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'

  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (value: number) => value.toString().padStart(2, '0')

  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value))
    return '--'
  if (Math.abs(value) >= 100000000)
    return `${(value / 100000000).toFixed(2)} 亿`
  if (Math.abs(value) >= 10000)
    return `${(value / 10000).toFixed(1)} 万`
  return `${Math.trunc(value)}`
}

function formatBucketTime(item: any) {
  if (!item)
    return '0'
  if (item.hoursText)
    return String(item.hoursText).replace('小时', ' 小时')
  const count = Number(item?.count || 0)
  if (count <= 0)
    return '0'
  return `${(count / 3600).toFixed(1)} 小时`
}

function parseFertilizerHours(item: any) {
  if (!item)
    return 0

  const hoursText = String(item?.hoursText || '').trim()
  const matchedHours = hoursText.match(/([\d.]+)\s*小时/)
  if (matchedHours)
    return Math.max(0, Number(matchedHours[1] || 0))

  const count = Number(item?.count || 0)
  if (!Number.isFinite(count) || count <= 0)
    return 0

  return count > 1000 ? count / 3600 : count
}

function formatFertilizerReserveLabel(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0)
    return '暂无'
  if (hours >= 10)
    return `${hours.toFixed(1)}h`
  return `${hours.toFixed(2)}h`
}

function getSeedFertilizerAdvice(input: {
  cycleTemplate: PastoralPlantCycleTemplate
  normalReady: boolean
  organicReady: boolean
  profitScore: number
  speedScore: number
  slowScore: number
}) {
  const { cycleTemplate, normalReady, organicReady, profitScore, speedScore, slowScore } = input

  if (cycleTemplate === 'idle') {
    if (organicReady && slowScore >= 0.62) {
      return { label: '有机优先', tone: 'is-top', note: '长周期地更适合留有机肥' }
    }
    if (normalReady && slowScore >= 0.62) {
      return { label: '普通兜底', tone: 'is-good', note: '有机不足时用普通化肥兜节奏' }
    }
    return { label: '省肥挂机', tone: 'is-alt', note: '挂机模板可以先少肥甚至裸跑' }
  }

  if (cycleTemplate === 'gold') {
    if (organicReady && profitScore >= 0.72) {
      return { label: '冲金配有机', tone: 'is-top', note: '高收益种子更值得上有机肥' }
    }
    if (normalReady && profitScore >= 0.58) {
      return { label: '普通提速', tone: 'is-good', note: '普通化肥先给次强收益地补节奏' }
    }
    return { label: '先裸跑', tone: 'is-alt', note: '库存紧时把化肥留给更高收益种子' }
  }

  if (normalReady && speedScore >= 0.72) {
    return { label: '普通快推', tone: 'is-top', note: '快熟种子配普通化肥最顺手' }
  }
  if (organicReady && profitScore >= 0.72) {
    return { label: '有机留强种', tone: 'is-good', note: '高收益强种再补有机肥更划算' }
  }
  return { label: '先裸跑', tone: 'is-alt', note: '短线轮转本身就不一定要追肥' }
}

function resolveBagCategory(item: any): BagCategory {
  if (item?.category === 'fruit')
    return 'fruit'
  if (item?.category === 'seed')
    return 'seed'
  if (item?.interactionType === 'fertilizer' || item?.interactionType === 'fertilizerpro' || Number(item?.itemType || 0) === 7)
    return 'fertilizer'
  if (Number(item?.itemType || 0) === 11)
    return 'pack'
  if (Number(item?.itemType || 0) === 9)
    return 'pet'
  return 'item'
}

function getBagCategoryLabel(category: BagCategory) {
  if (category === 'fruit')
    return '果实'
  if (category === 'seed')
    return '种子'
  if (category === 'fertilizer')
    return '化肥'
  if (category === 'pack')
    return '礼包'
  if (category === 'pet')
    return '狗粮'
  return '道具'
}

function getBagItemFallbackLabel(item: any) {
  const category = resolveBagCategory(item)
  if (category === 'fruit')
    return 'FR'
  if (category === 'seed')
    return 'SD'
  if (category === 'fertilizer')
    return 'FT'
  if (category === 'pack')
    return 'BX'
  if (category === 'pet')
    return 'DG'
  return 'IT'
}

function isBagItemLandTarget(item: any) {
  const type = String(item?.interactionType || '').trim().toLowerCase()
  return LAND_TARGET_INTERACTIONS.has(type)
}

function itemNeedsLandTargetSelection(item: any) {
  return !!item?.canUse && isBagItemLandTarget(item)
}

function canUseBagItemDirectly(item: any) {
  if (!item?.canUse)
    return false
  if (isBagItemLandTarget(item))
    return false
  return Number(item?.id || 0) > 0
}

function buildBagUseActionKey(itemId: any) {
  return `bag:use:${Number(itemId || 0)}`
}

function parseBagUseActionKey(actionKey: any) {
  const [scope, action, rawItemId] = String(actionKey || '').trim().split(':')
  const itemId = Number(rawItemId || 0)
  if (scope !== 'bag' || action !== 'use' || itemId <= 0)
    return 0
  return itemId
}

function getTaskProgressNumbers(task: any) {
  const rawCurrent = task?.progress ?? task?.current
  const rawTarget = task?.totalProgress ?? task?.target
  const current = Number.isFinite(rawCurrent) ? Number(rawCurrent) : (rawCurrent ? Number(rawCurrent) || 0 : 0)
  const target = Number.isFinite(rawTarget) ? Number(rawTarget) : (rawTarget ? Number(rawTarget) || 0 : 0)
  return { current, target }
}

function isTaskCompleted(task: any) {
  const { current, target } = getTaskProgressNumbers(task)
  return target > 0 && current >= target
}

function formatTaskProgress(task: any) {
  const { current, target } = getTaskProgressNumbers(task)
  if (!current && !target)
    return '未开始'
  if (target && current >= target)
    return '已完成'
  return `进度：${current}/${target}`
}

function formatTimeLabel(input: any) {
  const raw = String(input || '').trim()
  return raw || '--'
}

function formatRuntimeLogTime(input: any) {
  const raw = String(input || '').trim()
  if (!raw)
    return '--:--:--'
  const parts = raw.split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : raw
}

function formatRuntimeLogEvent(input: any) {
  const raw = String(input || '').trim()
  return raw || ''
}

function getRuntimeLogTag(entry: any) {
  const tag = String(entry?.tag || '').trim()
  if (tag)
    return tag
  return entry?.isWarn ? '警告' : '系统'
}

function getRuntimeLogTagTone(entry: any) {
  const tag = getRuntimeLogTag(entry)
  if (tag === '错误')
    return 'is-danger'
  if (tag === '警告')
    return 'is-warning'
  if (tag === '系统')
    return 'is-info'
  return 'is-brand'
}

function getVisitorTypeText(result: string) {
  if (result === 'weed')
    return '放草'
  if (result === 'insect')
    return '放虫'
  if (result === 'steal')
    return '偷菜'
  return '访客'
}

function getFriendLevel(friend: any) {
  return Math.max(0, Number(friend?.farmLevel || friend?.level || 0))
}

function getFriendStatusText(friend: any) {
  const plant = friend?.plant || {}
  const info: string[] = []
  if (plant?.stealNum)
    info.push(`偷${plant.stealNum}`)
  if (plant?.dryNum)
    info.push(`水${plant.dryNum}`)
  if (plant?.weedNum)
    info.push(`草${plant.weedNum}`)
  if (plant?.insectNum)
    info.push(`虫${plant.insectNum}`)
  return info.length ? info.join(' ') : '无操作'
}

function getFriendAvatar(friend: any) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const gid = String(friend?.gid || '').trim()
  const uin = String(friend?.uin || '').trim()
  if (!uin || !/^\d+$/.test(uin) || uin === gid || friend?.isWechat)
    return ''
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
}

function getFriendUrgencyScore(friend: any) {
  const plant = friend?.plant || {}
  return Number(plant?.stealNum || 0) * 10
    + Number(plant?.dryNum || 0) * 6
    + Number(plant?.weedNum || 0) * 6
    + Number(plant?.insectNum || 0) * 6
    + getFriendLevel(friend) * 0.2
}

function getLandUrgencyScore(land: any) {
  const statusValue = String(land?.status || '')
  const matureInSec = Number(land?.matureInSec || 0)
  let score = 0

  if (statusValue === 'harvestable')
    score += 120
  else if (statusValue === 'stealable')
    score += 100

  if (land?.needBug)
    score += 40
  if (land?.needWeed)
    score += 35
  if (land?.needWater)
    score += 30
  if (matureInSec > 0 && matureInSec <= 20 * 60)
    score += 18
  if (statusValue === 'dead')
    score += 12

  return score
}

function getLandCardClass(land: any) {
  if (land?.status === 'dead')
    return 'is-dead'

  switch (Number(land?.level || 0)) {
    case 4:
      return 'is-gold'
    case 3:
      return 'is-black'
    case 2:
      return 'is-red'
    case 1:
      return 'is-yellow'
    default:
      return 'is-normal'
  }
}

function getLandLevelLabel(land: any) {
  return LAND_LEVEL_LABELS[Number(land?.level || 0)] || '普通地'
}

function getLandVisualImage(land: any) {
  const candidates = [
    land?.displayImage,
    land?.phaseImage,
    land?.plantImage,
    land?.cropImage,
    land?.image,
    land?.seedImage,
  ]
  return candidates.map((item: any) => String(item || '').trim()).find(Boolean) || ''
}

function getLandMutantLabels(land: any) {
  const list = Array.isArray(land?.mutantTypes) ? land.mutantTypes : []
  const labels = list
    .map((item: any) => String(item?.name || item?.label || item?.typeName || item || '').trim())
    .filter(Boolean)
  return labels.length ? labels : list.length ? [`稀有 x${list.length}`] : []
}

function getLandMutantLabel(land: any) {
  const labels = getLandMutantLabels(land)
  if (!labels.length)
    return ''
  if (labels.length <= 2)
    return labels.join(' · ')
  return `${labels[0]} +${labels.length - 1}`
}

function getLandMutantTooltip(land: any) {
  return getLandMutantLabels(land).join(' / ')
}

function getLandPhaseLabel(land: any) {
  const phase = String(land?.displayPhaseName || land?.phaseName || '').trim()
  if (phase)
    return phase

  const statusValue = String(land?.status || '')
  if (statusValue === 'harvestable')
    return '成熟'
  if (statusValue === 'stealable')
    return '可偷'
  if (statusValue === 'dead')
    return '枯死'
  if (statusValue === 'empty')
    return '空地'
  if (statusValue === 'locked')
    return '未解锁'
  return '生长中'
}

function getLandPhaseClass(land: any) {
  const label = getLandPhaseLabel(land)
  if (label.includes('成熟') || label.includes('可偷'))
    return 'phase-pill--harvest'
  if (label.includes('开花'))
    return 'phase-pill--bloom'
  if (label.includes('大叶'))
    return 'phase-pill--leaf'
  if (label.includes('小叶') || label.includes('发芽') || label.includes('种子'))
    return 'phase-pill--sprout'
  if (label.includes('枯'))
    return 'phase-pill--dead'
  return 'phase-pill--default'
}

function getLandProgress(land: any) {
  const displayPercent = Number(land?.displayProgressPercent)
  if (Number.isFinite(displayPercent))
    return Math.max(0, Math.min(100, displayPercent))

  const directPercent = Number(land?.currentPhaseProgress)
  if (Number.isFinite(directPercent))
    return Math.max(0, Math.min(100, directPercent))

  const totalGrowTime = Number(land?.totalGrowTime || 0)
  const matureInSec = Number(land?.matureInSec || 0)
  if (totalGrowTime > 0) {
    const elapsed = Math.max(0, totalGrowTime - matureInSec)
    return Math.max(0, Math.min(100, (elapsed / totalGrowTime) * 100))
  }

  const currentPhaseDurationSec = Number(land?.currentPhaseDurationSec || 0)
  const currentPhaseElapsedSec = Number(land?.currentPhaseElapsedSec || 0)
  if (currentPhaseDurationSec > 0)
    return Math.max(0, Math.min(100, (currentPhaseElapsedSec / currentPhaseDurationSec) * 100))

  return ['harvestable', 'stealable', 'harvested'].includes(String(land?.status || '')) ? 100 : 8
}

function getLandCountdown(land: any) {
  const matureInSec = Number(land?.matureInSec || 0)
  if (matureInSec > 0)
    return formatDuration(matureInSec)
  if (String(land?.status || '') === 'harvestable')
    return '可收'
  if (String(land?.status || '') === 'stealable')
    return '可偷'
  if (String(land?.status || '') === 'dead')
    return '需处理'
  if (String(land?.status || '') === 'empty')
    return '空闲中'
  return '--'
}

function getLandCareSummary(land: any) {
  const tags: string[] = []
  if (land?.needWater)
    tags.push('待浇水')
  if (land?.needWeed)
    tags.push('待除草')
  if (land?.needBug)
    tags.push('待除虫')
  return tags.length > 0 ? tags.join(' / ') : '状态稳定'
}

function getLandHeroStateLabel(land: any) {
  if (isEmptyLand(land))
    return '待补种'
  if (hasLandCareAlert(land))
    return '待照料'
  if (isLandReady(land))
    return '成熟'
  if (isLandAlmostReady(land))
    return '快成熟'
  if (String(land?.status || '') === 'dead')
    return '需抢救'
  return '生长中'
}

function getLandHeroStateTone(land: any) {
  if (isEmptyLand(land))
    return 'is-empty'
  if (hasLandCareAlert(land))
    return 'is-alert'
  if (isLandReady(land))
    return 'is-ready'
  if (isLandAlmostReady(land))
    return 'is-soon'
  if (String(land?.status || '') === 'dead')
    return 'is-dead'
  return 'is-grow'
}

function isLandReady(land: any) {
  const statusValue = String(land?.status || '')
  return statusValue === 'harvestable' || statusValue === 'stealable'
}

function isLandAlmostReady(land: any) {
  const matureInSec = Number(land?.matureInSec || 0)
  return !isLandReady(land) && matureInSec > 0 && matureInSec <= 15 * 60
}

function hasLandCareAlert(land: any) {
  return !!(land?.needWater || land?.needWeed || land?.needBug)
}

function getLandCareTags(land: any): LandCareTag[] {
  const tags: LandCareTag[] = []
  if (land?.needWater)
    tags.push('water')
  if (land?.needWeed)
    tags.push('weed')
  if (land?.needBug)
    tags.push('bug')
  return tags
}

function getLandCareTagLabel(tag: LandCareTag) {
  if (tag === 'water')
    return '补水'
  if (tag === 'weed')
    return '除草'
  return '除虫'
}

function getLandRowIndex(index: number) {
  return Math.floor(Math.max(0, index) / Math.max(1, pastoralLandGridColumns.value))
}

function isLandInHoveredRow(index: number) {
  return hoveredLandRow.value >= 0 && getLandRowIndex(index) === hoveredLandRow.value
}

function setHoveredLandRow(index: number) {
  hoveredLandRow.value = getLandRowIndex(index)
}

function clearHoveredLandRow() {
  hoveredLandRow.value = -1
}

function isLandSweepActive(landId: any) {
  const id = Number(landId || 0)
  return !!recentLandSweepIds.value[id]
}

function triggerLandSweep(ids: Array<number | string>) {
  const normalizedIds = ids
    .map(id => Number(id || 0))
    .filter(id => id > 0)

  if (!normalizedIds.length)
    return

  const stamp = Date.now()
  const next = { ...recentLandSweepIds.value }
  for (const id of normalizedIds)
    next[id] = stamp
  recentLandSweepIds.value = next

  window.setTimeout(() => {
    const cleanup = { ...recentLandSweepIds.value }
    let changed = false
    for (const id of normalizedIds) {
      if (cleanup[id] === stamp) {
        delete cleanup[id]
        changed = true
      }
    }
    if (changed)
      recentLandSweepIds.value = cleanup
  }, 1200)
}

const { pause: pauseTick, resume: resumeTick } = useIntervalFn(updateCountdowns, 1000, { immediate: false })
const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(() => {
  void ensureData()
}, 60000, { immediate: false })

watch(status, (next) => {
  localNextFarmRemainSec.value = Number(next?.nextChecks?.farmRemainSec || 0)
  localNextFriendRemainSec.value = Number(next?.nextChecks?.friendRemainSec || 0)
  localUptime.value = Number(next?.uptime || 0)
  updateCountdowns()
}, { deep: true, immediate: true })

watch(currentAccountId, (next) => {
  closeQuickActionPanel()
  closePlantSeedPalette()
  hydrated.value = false
  statusStore.clearLogs()
  landActionLoadingMap.value = {}
  friendActionLoadingMap.value = {}
  panelActionLoadingMap.value = {}
  bagEntryLoadingMap.value = {}
  resetLandTargeting()
  plantSeedLoading.value = false
  friendStore.clearInteractState()
  if (!next)
    return
  statusStore.connectRealtime(String(next))
  void ensureData(true)
}, { immediate: true })

watch(() => status.value?.connection?.connected, (connected) => {
  if (connected && currentAccountId.value)
    void Promise.all([
      bagStore.fetchBag(currentAccountId.value),
      farmStore.fetchLands(currentAccountId.value),
      farmStore.fetchPlantableBagSeeds(currentAccountId.value, { includeZeroUsable: false, includeLocked: false }),
      statusStore.fetchLogs(currentAccountId.value, { limit: 24 }),
      statusStore.fetchDailyGifts(currentAccountId.value),
    ])
})

watch(announcementUpdateTrigger, () => {
  void fetchAnnouncements()
})

watch(sidePanelCollapsed, (collapsed) => {
  writePastoralSidebarCollapsed(collapsed)
}, { immediate: true })

watch(sidePanelWidth, (width) => {
  writePastoralSidebarWidth(normalizePastoralSidebarWidth(width))
}, { immediate: true })

watch(canResizePastoralSidebar, (enabled) => {
  if (!enabled)
    stopPastoralSidebarResize()
})

watch(plantRecommendStrategy, (strategy) => {
  writePastoralPlantRecommendStrategy(strategy)
}, { immediate: true })

watch(plantBatchTemplate, (template) => {
  writePastoralPlantBatchTemplate(template)
}, { immediate: true })

watch(plantCycleTemplate, (template) => {
  writePastoralPlantCycleTemplate(template)
}, { immediate: true })

watch(lands, () => {
  if (!landTargetItem.value)
    return
  pruneSelectedTargetLands()
}, { deep: true })

watch(items, () => {
  if (!landTargetItem.value)
    return
  const itemId = Number(landTargetItem.value?.id || 0)
  if (!itemId) {
    resetLandTargeting()
    return
  }
  const nextItem = (Array.isArray(items.value) ? items.value : []).find((row: any) => Number(row?.id || 0) === itemId)
  if (!nextItem || !itemNeedsLandTargetSelection(nextItem)) {
    resetLandTargeting()
    return
  }
  landTargetItem.value = nextItem
  pruneSelectedTargetLands()
}, { deep: true })

onMounted(async () => {
  rememberedConsoleRoute.value = readPastoralRememberedRoute()
  if (currentAccountId.value)
    statusStore.connectRealtime(String(currentAccountId.value))
  await Promise.all([ensureData(true), fetchAnnouncements()])
  resumeTick()
  resumeRefresh()
})

onUnmounted(() => {
  pauseTick()
  pauseRefresh()
})
</script>

<template>
  <div class="pastoral-view min-h-0 flex flex-col gap-4 pb-6">
    <section class="pastoral-scene glass-panel rounded-[32px] p-4 md:p-5">
      <div class="pastoral-stage">
        <img src="/dashboard-assets/scene-bg.png" alt="" class="pastoral-stage__bg">
        <img src="/dashboard-assets/scene-fg.png" alt="" class="pastoral-stage__fg">
        <div class="pastoral-stage__wash" />

        <div class="pastoral-stage__content">
          <div class="pastoral-top-grid">
            <div class="pastoral-account-column">
              <article class="pastoral-account-card">
                <div class="pastoral-account-card__badges">
                  <span class="pastoral-account-badge is-level">Lv.{{ status?.status?.level || currentAccount?.level || 0 }}</span>
                  <span class="pastoral-account-badge" :class="status?.connection?.connected ? 'is-online' : 'is-offline'">
                    {{ status?.connection?.connected ? '在线巡查中' : '当前离线' }}
                  </span>
                </div>

                <div class="pastoral-account-card__main">
                  <div class="pastoral-account-card__avatar">
                    <img
                      v-if="accountAvatarUrl"
                      :src="accountAvatarUrl"
                      alt="当前账号头像"
                      @error="markFailed(accountAvatarUrl)"
                    >
                    <div v-else class="i-carbon-user text-3xl text-[#9a5e36]" />
                  </div>

                  <div class="pastoral-account-card__nameplate">
                    <div class="pastoral-account-card__name" :title="displayName">
                      {{ displayName }}
                    </div>
                    <div class="pastoral-account-card__progress">
                      <div class="pastoral-account-card__progress-track">
                        <div class="pastoral-account-card__progress-fill" :style="{ width: `${accountProgressPercent}%` }" />
                      </div>
                      <span class="pastoral-account-card__progress-text">{{ accountProgressText }}</span>
                    </div>
                  </div>
                </div>

                <div class="pastoral-account-card__meta">
                  <span>效率 {{ expRate }}</span>
                  <span>在线 {{ formatDuration(localUptime) }}</span>
                  <span>{{ currentAccount?.running ? '账号已运行' : '账号未运行' }}</span>
                </div>
              </article>

              <div class="pastoral-resources pastoral-resources--account">
                <div
                  v-for="item in resourceCards"
                  :key="item.key"
                  class="pastoral-resource-chip"
                >
                  <img v-if="item.icon" :src="item.icon" :alt="item.label" class="pastoral-resource-chip__icon">
                  <div v-else class="pastoral-resource-chip__icon pastoral-resource-chip__icon--fallback" :class="item.tone" />
                  <div class="min-w-0">
                    <div class="pastoral-resource-chip__label">
                      {{ item.label }}
                    </div>
                    <div class="pastoral-resource-chip__value">
                      {{ item.value }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <article class="pastoral-resource-board">
              <section class="pastoral-today-board">
                <div class="pastoral-today-board__sections">
                  <div class="pastoral-today-board__summary-row">
                    <section class="pastoral-today-section is-inline is-compact">
                      <div class="pastoral-today-section__title">经营概览</div>
                      <div class="pastoral-today-grid is-4">
                        <div
                          v-for="item in todayOverviewCards"
                          :key="item.key"
                          class="pastoral-today-card"
                          :class="item.tone"
                        >
                          <span class="pastoral-today-card__label">{{ item.label }}</span>
                          <strong class="pastoral-today-card__value">{{ item.value }}</strong>
                        </div>
                      </div>
                    </section>

                    <section class="pastoral-today-section is-inline is-compact">
                      <div class="pastoral-today-section__title">地块态势</div>
                      <div class="pastoral-today-grid is-4">
                        <div
                          v-for="item in todayLandCards"
                          :key="item.key"
                          class="pastoral-today-card"
                          :class="item.tone"
                        >
                          <span class="pastoral-today-card__label">{{ item.label }}</span>
                          <strong class="pastoral-today-card__value">{{ item.value }}</strong>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section class="pastoral-today-section is-inline">
                    <div class="pastoral-today-section__title">今日操作</div>
                    <div class="pastoral-today-grid is-6">
                      <div
                        v-for="item in todayOperationCards"
                        :key="item.key"
                        class="pastoral-today-card"
                        :class="item.tone"
                      >
                        <span class="pastoral-today-card__label">{{ item.label }}</span>
                        <strong class="pastoral-today-card__value">{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>
                </div>
              </section>

              <div class="pastoral-resource-status-row">
                <section class="pastoral-runtime-log is-stage-log">
                  <div class="pastoral-runtime-log__head">
                    <div>
                      <div class="pastoral-runtime-log__eyebrow">
                        运行观测
                      </div>
                      <div class="pastoral-runtime-log__title">
                        运行日志
                      </div>
                    </div>

                    <div class="pastoral-runtime-log__head-badges">
                      <div class="pastoral-runtime-log__live" :class="realtimeConnected ? 'is-online' : 'is-offline'">
                        {{ realtimeConnected ? '实时回流' : '快照日志' }}
                      </div>
                      <div class="pastoral-runtime-log__count">
                        最近 {{ runtimeLogEntries.length }} 条
                      </div>
                    </div>
                  </div>

                  <div class="pastoral-runtime-log__list">
                    <div v-if="!runtimeLogEntries.length" class="pastoral-runtime-log__empty">
                      暂无运行日志，等账号开始同步后这里会自动回流。
                    </div>

                    <article
                      v-for="entry in runtimeLogEntries"
                      :key="entry.key"
                      class="pastoral-runtime-log__entry"
                    >
                      <div class="pastoral-runtime-log__meta">
                        <span class="pastoral-runtime-log__time">[{{ entry.time }}]</span>
                        <span class="pastoral-runtime-log__tag" :class="entry.tagTone">{{ entry.tag }}</span>
                        <span v-if="entry.event" class="pastoral-runtime-log__event">{{ entry.event }}</span>
                      </div>
                      <div class="pastoral-runtime-log__message">
                        {{ entry.msg }}
                      </div>
                    </article>
                  </div>
                </section>

                <div class="pastoral-status-side-stack">
                  <div class="pastoral-status-card is-countdown">
                    <div class="pastoral-status-card__head">
                      <div class="pastoral-status-card__title">
                        巡查倒计时
                      </div>
                    </div>
                    <div class="pastoral-status-card__metrics">
                      <div class="pastoral-status-card__metric is-soft">
                        <span class="pastoral-status-card__metric-label">农场</span>
                        <strong class="pastoral-status-card__metric-value">{{ nextFarmCheck }}</strong>
                      </div>
                      <div class="pastoral-status-card__metric is-brand">
                        <span class="pastoral-status-card__metric-label">好友</span>
                        <strong class="pastoral-status-card__metric-value">{{ nextFriendCheck }}</strong>
                      </div>
                    </div>
                  </div>

                  <div class="pastoral-status-card is-current">
                    <div class="pastoral-status-card__head">
                      <div class="pastoral-status-card__title">
                        当前状态
                      </div>
                    </div>
                    <div class="pastoral-status-card__metrics">
                      <div class="pastoral-status-card__metric" :class="status?.connection?.connected ? 'is-success' : 'is-danger'">
                        <span class="pastoral-status-card__metric-label">连接</span>
                        <strong class="pastoral-status-card__metric-value" :class="status?.connection?.connected ? 'is-positive' : 'is-negative'">
                          {{ status?.connection?.connected ? '在线' : '离线' }}
                        </strong>
                      </div>
                      <div class="pastoral-status-card__metric" :class="realtimeConnected ? 'is-brand' : 'is-neutral'">
                        <span class="pastoral-status-card__metric-label">实时链路</span>
                        <strong class="pastoral-status-card__metric-value">{{ realtimeConnected ? '实时在线' : '快照模式' }}</strong>
                      </div>
                      <div class="pastoral-status-card__metric is-full is-muted">
                        <span class="pastoral-status-card__metric-label">地块数量</span>
                        <strong class="pastoral-status-card__metric-value">{{ sortedLands.length }}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <section class="pastoral-notice-board">
              <div class="pastoral-notice-board__head">
                <div>
                  <div class="pastoral-notice-board__eyebrow">
                    系统公告
                  </div>
                  <div class="pastoral-notice-board__title">
                    公告内容
                  </div>
                </div>
                <div class="pastoral-notice-board__count">
                  已启用 {{ pastoralAnnouncementEntries.length }} 条
                </div>
              </div>

              <div class="pastoral-notice-board__body">
                <div v-if="announcementLoading && !pastoralAnnouncementEntries.length" class="pastoral-notice-board__empty">
                  公告同步中，稍后这里会显示最新内容。
                </div>

                <template v-else-if="featuredAnnouncement">
                  <article class="pastoral-notice-board__featured">
                    <div class="pastoral-notice-board__featured-meta">
                      <span class="pastoral-notice-board__chip is-highlight">最新公告</span>
                      <span v-if="featuredAnnouncement.version" class="pastoral-notice-board__chip">
                        {{ featuredAnnouncement.version }}
                      </span>
                      <span class="pastoral-notice-board__chip">
                        {{ formatPastoralAnnouncementDate(featuredAnnouncement.publish_date) }}
                      </span>
                    </div>
                    <h3 class="pastoral-notice-board__featured-title">
                      {{ featuredAnnouncement.title }}
                    </h3>
                    <p class="pastoral-notice-board__featured-copy">
                      {{ formatPastoralAnnouncementPreview(featuredAnnouncement.content, 150) }}
                    </p>
                  </article>

                  <div v-if="secondaryAnnouncements.length" class="pastoral-notice-board__list">
                    <div class="pastoral-notice-board__list-title">
                      更多公告
                    </div>
                    <article
                      v-for="entry in secondaryAnnouncements"
                      :key="entry.key"
                      class="pastoral-notice-board__item"
                    >
                      <div class="pastoral-notice-board__item-title">
                        {{ entry.title }}
                      </div>
                      <div class="pastoral-notice-board__item-meta">
                        {{ entry.meta }}
                      </div>
                      <div class="pastoral-notice-board__item-copy">
                        {{ entry.preview }}
                      </div>
                    </article>
                  </div>
                </template>

                <div v-else class="pastoral-notice-board__empty">
                  暂无可展示公告，后续同步后会显示在这里。
                </div>
              </div>
            </section>
          </div>

          <div
            ref="pastoralMainGridRef"
            class="pastoral-main-grid"
            :class="{ 'is-side-collapsed': sidePanelCollapsed }"
            :style="pastoralMainGridStyle"
          >
            <section class="pastoral-farm-panel">
              <section
                v-if="false"
                class="pastoral-reminder-strip"
                :data-tone="pastoralReminderState?.tone || ''"
                :data-primary-action="pastoralReminderState?.primaryActionKey || ''"
                :data-snoozed="pastoralReminderState?.snoozed ? '1' : '0'"
                :data-handler-count="[handleSuggestionAction, handleReminderRestore, handleReminderSnooze].length"
              />

              <section
                v-if="false"
                class="pastoral-suggestion-panel"
                :data-card-count="pastoralSuggestionCards.length"
                :data-handler-count="String(handleSuggestionAction).length"
              />

              <section v-if="!landTargetItem && hasPlantWorkflowLands" class="pastoral-plant-panel" :class="{ 'is-open': showPlantSeedPalette }">
                <div class="pastoral-plant-panel__head">
                  <div class="pastoral-plant-panel__copy">
                    <div class="pastoral-plant-panel__eyebrow">
                      {{ plantWorkflowEyebrow }}
                    </div>
                    <h2>{{ plantWorkflowTitle }}</h2>
                    <p>{{ plantWorkflowDescription }}</p>
                  </div>

                  <div class="pastoral-plant-panel__actions">
                    <button
                      type="button"
                      class="pastoral-plant-panel__btn is-light"
                      :disabled="plantSeedLoading"
                      @click="openPlantSeedPalette()"
                    >
                      {{ showPlantSeedPalette ? '刷新种子带' : '打开种子带' }}
                    </button>
                    <button
                      v-if="showPlantSeedPalette"
                      type="button"
                      class="pastoral-plant-panel__btn is-ghost"
                      @click="closePlantSeedPalette()"
                    >
                      先收起
                    </button>
                  </div>
                </div>

                <div v-if="showPlantSeedPalette" class="pastoral-plant-panel__body">
                  <div class="pastoral-plant-panel__tip">
                    <span>{{ activePlantRecommendOption.summary }}</span>
                    <span>{{ cropAtlasLoading ? '推荐计算中...' : `${activePlantRecommendOption.label} + ${activePlantCycleOption.label} + 化肥协同已生效` }}</span>
                  </div>

                  <div class="pastoral-plant-panel__strategy">
                    <span class="pastoral-plant-panel__strategy-label">推荐策略</span>
                    <div class="pastoral-plant-panel__strategy-list">
                      <button
                        v-for="option in PLANT_RECOMMENDATION_OPTIONS"
                        :key="option.key"
                        type="button"
                        class="pastoral-plant-panel__strategy-chip"
                        :class="{ 'is-active': plantRecommendStrategy === option.key }"
                        :title="option.hint"
                        @click="setPlantRecommendStrategy(option.key)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                    <span class="pastoral-plant-panel__strategy-hint">{{ activePlantRecommendOption.hint }}</span>
                    <div class="pastoral-plant-panel__template">
                      <span class="pastoral-plant-panel__strategy-label">成熟周期</span>
                      <div class="pastoral-plant-panel__strategy-list">
                        <button
                          v-for="option in PLANT_CYCLE_TEMPLATE_OPTIONS"
                          :key="option.key"
                          type="button"
                          class="pastoral-plant-panel__strategy-chip is-cycle"
                          :class="{ 'is-active': plantCycleTemplate === option.key }"
                          :title="option.hint"
                          @click="setPlantCycleTemplate(option.key)"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                      <span class="pastoral-plant-panel__strategy-hint">{{ activePlantCycleOption.hint }}</span>
                    </div>
                    <div class="pastoral-plant-panel__template">
                      <span class="pastoral-plant-panel__strategy-label">补种模板</span>
                      <div class="pastoral-plant-panel__strategy-list">
                        <button
                          v-for="option in PLANT_BATCH_TEMPLATE_OPTIONS"
                          :key="option.key"
                          type="button"
                          class="pastoral-plant-panel__strategy-chip is-template"
                          :class="{ 'is-active': plantBatchTemplate === option.key }"
                          :title="option.hint"
                          @click="setPlantBatchTemplate(option.key)"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                      <span class="pastoral-plant-panel__strategy-hint">{{ activePlantBatchOption.hint }}</span>
                    </div>

                    <div class="pastoral-plant-panel__fertilizer" :class="fertilizerSupportPlan.toneClass">
                      <div class="pastoral-plant-panel__fertilizer-copy">
                        <strong>{{ fertilizerSupportPlan.title }}</strong>
                        <span>{{ fertilizerSupportPlan.summary }}</span>
                        <span>{{ fertilizerSupportPlan.note }}</span>
                      </div>
                      <div class="pastoral-plant-panel__fertilizer-pills">
                        <span class="pastoral-plant-panel__fertilizer-pill is-normal">普通化肥 {{ fertilizerSupportPlan.normalLabel }}</span>
                        <span class="pastoral-plant-panel__fertilizer-pill is-organic">有机化肥 {{ fertilizerSupportPlan.organicLabel }}</span>
                        <span class="pastoral-plant-panel__fertilizer-pill is-muted">{{ fertilizerSupportPlan.emphasis }}</span>
                      </div>
                    </div>

                    <div class="pastoral-plant-panel__batch" :class="{ 'is-disabled': !autoPlantPlan.canApply }">
                      <div class="pastoral-plant-panel__batch-copy">
                        <strong>{{ autoPlantPlan.canApply ? `计划使用 ${autoPlantPlan.seedSummary}` : autoPlantPlan.disabledReason }}</strong>
                        <span>{{ autoPlantPlan.detailText }}</span>
                        <span>{{ autoPlantPlan.templateNote }}</span>
                      </div>

                      <button
                        type="button"
                        class="pastoral-plant-panel__batch-btn"
                        :disabled="!autoPlantPlan.canApply || plantSeedLoading || autoPlantApplying || bagActionLoading || !canRunDirectActions"
                        @click="handleAutoPlantByTemplate()"
                      >
                        <div v-if="autoPlantApplying" class="i-svg-spinners-ring-resize text-sm" />
                        <span>{{ autoPlantApplying ? '补种中...' : `按${activePlantBatchOption.label}补种` }}</span>
                      </button>
                    </div>

                    <div class="pastoral-plant-panel__batch is-harvest-chain" :class="{ 'is-disabled': !autoHarvestReplantPlan.canApply }">
                      <div class="pastoral-plant-panel__batch-copy">
                        <strong>{{ autoHarvestReplantPlan.canApply ? `先收 ${autoHarvestReplantPlan.harvestCount} 块成熟地，再回补 ${autoHarvestReplantPlan.replantPlan.seedSummary}` : autoHarvestReplantPlan.disabledReason }}</strong>
                        <span>{{ autoHarvestReplantPlan.detailText }}</span>
                        <span>{{ autoHarvestReplantPlan.templateNote }}</span>
                      </div>

                      <button
                        type="button"
                        class="pastoral-plant-panel__batch-btn is-harvest-chain"
                        :disabled="!autoHarvestReplantPlan.canApply || plantSeedLoading || autoHarvestReplantApplying || autoPlantApplying || bagActionLoading || !canRunDirectActions"
                        @click="handleAutoHarvestAndReplant()"
                      >
                        <div v-if="autoHarvestReplantApplying" class="i-svg-spinners-ring-resize text-sm" />
                        <span>{{ autoHarvestReplantApplying ? '收获回补中...' : '自动收获后回补' }}</span>
                      </button>
                    </div>

                    <div class="pastoral-plant-panel__batch is-care-chain" :class="{ 'is-disabled': !autoCareWorkflowPlan.canApply }">
                      <div class="pastoral-plant-panel__batch-copy">
                        <strong>{{ autoCareWorkflowPlan.canApply ? `收获回补后继续联动 ${autoCareWorkflowPlan.careSummary}` : autoCareWorkflowPlan.disabledReason }}</strong>
                        <span>{{ autoCareWorkflowPlan.detailText }}</span>
                        <span>{{ autoCareWorkflowPlan.templateNote }}</span>
                      </div>

                      <button
                        type="button"
                        class="pastoral-plant-panel__batch-btn is-care-chain"
                        :disabled="!autoCareWorkflowPlan.canApply || plantSeedLoading || autoCareWorkflowApplying || autoHarvestReplantApplying || autoPlantApplying || bagActionLoading || !canRunDirectActions"
                        @click="handleAutoCareWorkflow()"
                      >
                        <div v-if="autoCareWorkflowApplying" class="i-svg-spinners-ring-resize text-sm" />
                        <span>{{ autoCareWorkflowApplying ? '全链路处理中...' : '自动照料联动' }}</span>
                      </button>
                    </div>

                    <div v-if="retryRememberedWorkflowState" class="pastoral-plant-panel__batch is-memory-chain" :class="{ 'is-disabled': !retryRememberedWorkflowState.hasRetryableFailures || !retryRememberedWorkflowState.sameAccount }">
                      <div class="pastoral-plant-panel__batch-copy">
                        <strong>{{ retryRememberedWorkflowState.title }}</strong>
                        <span>{{ retryRememberedWorkflowState.detail }}</span>
                        <span>{{ retryRememberedWorkflowState.retrySummary }}</span>
                      </div>

                      <button
                        type="button"
                        class="pastoral-plant-panel__batch-btn is-memory-chain"
                        :disabled="!retryRememberedWorkflowState.hasRetryableFailures || !retryRememberedWorkflowState.sameAccount || retryRememberedWorkflowApplying || autoCareWorkflowApplying || autoHarvestReplantApplying || autoPlantApplying || bagActionLoading || !canRunDirectActions"
                        @click="handleRetryRememberedWorkflow()"
                      >
                        <div v-if="retryRememberedWorkflowApplying" class="i-svg-spinners-ring-resize text-sm" />
                        <span>{{ retryRememberedWorkflowApplying ? '补跑中...' : retryRememberedWorkflowState.hasRetryableFailures ? '补跑失败项' : '本轮已完成' }}</span>
                      </button>
                    </div>
                  </div>

                  <div v-if="plantSeedLoading" class="pastoral-plant-panel__empty">
                    <div class="i-svg-spinners-ring-resize text-xl" />
                    <span>正在整理背包里的可种植种子...</span>
                  </div>

                  <div v-else-if="plantSeedCards.length === 0" class="pastoral-plant-panel__empty">
                    <div class="i-carbon-sprout text-xl" />
                    <span>当前没有可直接种植的种子，稍后可以去仓库或商城补货。</span>
                  </div>

                  <div v-else class="pastoral-plant-seed-grid">
                    <button
                      v-for="seed in plantSeedCards.slice(0, 8)"
                      :key="seed.key"
                      type="button"
                      class="pastoral-plant-seed-card"
                      :class="seed.recommendationTone"
                      @click="handlePlantSeedPick(seed)"
                    >
                      <div class="pastoral-plant-seed-card__top">
                        <span class="pastoral-plant-seed-card__recommend" :class="seed.recommendationTone">{{ seed.recommendationLabel }}</span>
                        <span class="pastoral-plant-seed-card__rank">TOP {{ seed.rank }}</span>
                      </div>
                      <div class="pastoral-plant-seed-card__image">
                        <img v-if="seed.image" :src="seed.image" :alt="seed.name">
                        <div v-else class="i-carbon-sprout text-3xl" />
                      </div>
                      <div class="pastoral-plant-seed-card__name">{{ seed.name }}</div>
                      <div class="pastoral-plant-seed-card__meta">可种 x{{ seed.usableCount }} · {{ seed.plantSize }} 格作物 · Lv{{ seed.requiredLevel || 0 }}</div>
                      <div class="pastoral-plant-seed-card__focus">
                        <span>{{ seed.focusMetricLabel }}</span>
                        <strong>{{ seed.focusMetricValue }}</strong>
                      </div>
                      <div class="pastoral-plant-seed-card__cycle">
                        <span class="pastoral-plant-seed-card__recommend" :class="seed.cycleFitTone">{{ seed.cycleFitLabel }}</span>
                        <span>{{ seed.cycleMetricLabel }} {{ seed.cycleMetricValue }}</span>
                      </div>
                      <div class="pastoral-plant-seed-card__fertilizer">
                        <span class="pastoral-plant-seed-card__recommend" :class="seed.fertilizerTone">{{ seed.fertilizerLabel }}</span>
                        <span>{{ seed.fertilizerNote }}</span>
                      </div>
                      <div class="pastoral-plant-seed-card__stats">
                        <span>收益 {{ seed.profitLabel }}</span>
                        <span>经验 {{ seed.expLabel }}</span>
                        <span>成熟 {{ seed.growTimeLabel }}</span>
                      </div>
                      <div class="pastoral-plant-seed-card__cta">
                        {{ plantSpotlightLand ? `种到 #${plantSpotlightLand.id}` : '进入选地' }}
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              <section v-if="landTargetItem" class="pastoral-land-target-banner">
                <div class="pastoral-land-target-banner__main">
                  <div class="pastoral-land-target-banner__eyebrow">
                    主舞台选地模式
                  </div>
                  <div class="pastoral-land-target-banner__title-row">
                    <div class="pastoral-land-target-banner__icon">
                      <img
                        v-if="String(landTargetItem?.image || '').trim()"
                        :src="String(landTargetItem?.image || '').trim()"
                        :alt="String(landTargetItem?.name || '道具')"
                      >
                      <div v-else class="i-carbon-sprout text-2xl" />
                    </div>
                    <div class="pastoral-land-target-banner__copy">
                      <h2>{{ landTargetItem?.name || `物品 ${landTargetItem?.id || '-'}` }}</h2>
                      <p>{{ landTargetSelectionHint }}。点击下方土地卡即可选中或取消，确认后会直接调用主程序现有的道具接口。</p>
                    </div>
                  </div>
                </div>

                <div class="pastoral-land-target-banner__stats">
                  <span class="pastoral-land-target-banner__pill is-strong">已选 {{ selectedTargetLandIds.length }} / {{ landTargetSelectionLimit }}</span>
                  <span class="pastoral-land-target-banner__pill">推荐 {{ suggestedTargetLandIds.length }}</span>
                  <span class="pastoral-land-target-banner__pill">可用土地 {{ availableTargetLands.length }}</span>
                </div>

                <div class="pastoral-land-target-banner__actions">
                  <button
                    type="button"
                    class="pastoral-land-target-btn is-light"
                    :disabled="farmLoading"
                    @click="refreshTargetLands()"
                  >
                    刷新土地
                  </button>
                  <button
                    type="button"
                    class="pastoral-land-target-btn is-light"
                    :disabled="suggestedTargetLandIds.length === 0 || landTargetApplying"
                    @click="selectSuggestedTargetLands()"
                  >
                    智能选择
                  </button>
                  <button
                    type="button"
                    class="pastoral-land-target-btn is-light"
                    :disabled="selectedTargetLandIds.length === 0 || landTargetApplying"
                    @click="clearTargetLandSelection()"
                  >
                    清空选择
                  </button>
                  <button
                    type="button"
                    class="pastoral-land-target-btn is-ghost"
                    :disabled="landTargetApplying"
                    @click="cancelLandTargeting()"
                  >
                    取消选地
                  </button>
                  <button
                    type="button"
                    class="pastoral-land-target-btn is-primary"
                    :disabled="selectedTargetLandIds.length === 0 || landTargetApplying || !canRunDirectActions"
                    @click="applyLandTargetItem()"
                  >
                    <div v-if="landTargetApplying" class="i-svg-spinners-ring-resize text-sm" />
                    <span v-else>对已选土地使用</span>
                  </button>
                </div>
              </section>

              <div v-if="farmStageEmptyState" class="pastoral-empty-state is-stage-board" :class="`is-${farmStageEmptyState.tone}`">
                <div class="pastoral-empty-board">
                  <div class="pastoral-empty-board__main">
                    <div class="pastoral-empty-board__eyebrow">
                      {{ farmStageEmptyState.eyebrow }}
                    </div>
                    <div class="pastoral-empty-board__hero">
                      <div class="pastoral-empty-board__icon" :class="farmStageEmptyState.icon" />
                      <div class="pastoral-empty-board__copy">
                        <h2>{{ farmStageEmptyState.title }}</h2>
                        <p v-if="farmStageEmptyState.key !== 'not-running'">{{ farmStageEmptyState.description }}</p>
                      </div>
                    </div>

                    <div class="pastoral-empty-board__actions">
                      <button
                        type="button"
                        class="pastoral-empty-board__btn is-primary"
                        :disabled="stageRefreshLoading"
                        @click="refreshPastoralStage"
                      >
                        <div v-if="stageRefreshLoading" class="i-svg-spinners-ring-resize mr-2 text-sm" />
                        <div v-else class="i-carbon-renew mr-2 text-sm" />
                        重新同步
                      </button>
                      <button type="button" class="pastoral-empty-board__btn is-secondary" @click="openPastoralSettings">
                        <div class="i-carbon-settings-adjust mr-2 text-sm" />
                        领奖与配置
                      </button>
                      <button type="button" class="pastoral-empty-board__btn is-ghost" @click="returnToConsole">
                        <div class="i-carbon-arrow-left mr-2 text-sm" />
                        返回{{ rememberedConsoleRouteLabel }}
                      </button>
                    </div>

                    <div class="pastoral-empty-board__stats">
                      <div
                        v-for="item in emptyStageOverviewCards"
                        :key="item.key"
                        class="pastoral-empty-board__stat"
                        :class="item.tone"
                      >
                        <span>{{ item.label }}</span>
                        <strong>{{ item.value }}</strong>
                      </div>
                    </div>
                  </div>

                  <div class="pastoral-empty-board__aside">
                    <div class="pastoral-empty-board__preview-head">
                      <h3>{{ farmStageEmptyState.previewTitle }}</h3>
                      <p>{{ farmStageEmptyState.previewDescription }}</p>
                    </div>

                    <div class="pastoral-empty-board__quick-grid">
                      <button
                        v-for="action in quickActions"
                        :key="`empty-${action.key}`"
                        type="button"
                        class="pastoral-empty-board__quick"
                        @click="openQuickAction(action)"
                      >
                        <img :src="action.icon" :alt="action.label">
                        <span>{{ action.label }}</span>
                      </button>
                    </div>

                    <div class="pastoral-empty-board__plots">
                      <div
                        v-for="plot in emptyStagePreviewPlots"
                        :key="plot.key"
                        class="pastoral-empty-plot"
                        :class="plot.tone"
                      >
                        <strong>{{ plot.name }}</strong>
                        <span>{{ plot.phase }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="pastoral-farm-grid">
                <article
                  v-for="(land, landIndex) in sortedLands"
                  :key="land.id"
                  class="pastoral-land-card"
                  :class="[
                    getLandCardClass(land),
                    {
                      'pastoral-land-card--row-hovered': isLandInHoveredRow(landIndex),
                      'pastoral-land-card--sweep-active': isLandSweepActive(land.id),
                      'pastoral-land-card--interactive': (!landTargetItem && (isEmptyLand(land) || getLandActions(land).length > 0)) || (!!landTargetItem && isLandSelectableForTarget(land)),
                      'pastoral-land-card--busy': isLandActionBusy(land.id),
                      'pastoral-land-card--ready': isLandReady(land),
                      'pastoral-land-card--soon': isLandAlmostReady(land),
                      'pastoral-land-card--alert': hasLandCareAlert(land),
                      'pastoral-land-card--plant-spotlight': !landTargetItem && isPlantSpotlightLand(land.id),
                      'pastoral-land-card--targeting': !!landTargetItem,
                      'pastoral-land-card--target-selected': isLandTargetSelected(land.id),
                      'pastoral-land-card--target-suggested': !isLandTargetSelected(land.id) && isLandTargetSuggested(land.id),
                      'pastoral-land-card--target-disabled': !!landTargetItem && !isLandSelectableForTarget(land),
                    },
                  ]"
                  @click="handleLandCardTargetClick(land)"
                  @mouseenter="setHoveredLandRow(landIndex)"
                  @mouseleave="clearHoveredLandRow"
                >
                  <div class="pastoral-land-card__top">
                    <span class="pastoral-land-card__id">#{{ land.id }}</span>
                    <div class="pastoral-land-card__top-badges">
                      <span
                        v-if="getLandMutantLabel(land)"
                        class="pastoral-land-card__mutant"
                        :title="getLandMutantTooltip(land)"
                      >
                        变异 · {{ getLandMutantLabel(land) }}
                      </span>
                      <span
                        v-if="landTargetItem && isLandTargetSelected(land.id)"
                        class="pastoral-land-card__target-flag is-selected"
                      >
                        已选
                      </span>
                      <span
                        v-else-if="landTargetItem && isLandTargetSuggested(land.id)"
                        class="pastoral-land-card__target-flag is-suggested"
                      >
                        推荐
                      </span>
                    </div>
                  </div>

                  <div class="pastoral-land-card__hero-state" :class="getLandHeroStateTone(land)">
                    {{ getLandHeroStateLabel(land) }}
                  </div>

                  <div class="pastoral-land-card__soil-glow" />

                  <div
                    class="pastoral-land-card__crop"
                    :class="{
                      'is-ready': isLandReady(land),
                      'is-soon': isLandAlmostReady(land),
                    }"
                  >
                    <div v-if="isLandReady(land)" class="pastoral-land-card__sparkles" />
                    <img
                      v-if="getLandVisualImage(land)"
                      :src="getLandVisualImage(land)"
                      :alt="land.plantName || '作物'"
                      loading="lazy"
                    >
                    <div v-else class="i-carbon-sprout text-5xl opacity-40" />
                  </div>
                  <div v-if="isLandActionBusy(land.id)" class="pastoral-land-card__busy-mask">
                    <div class="i-svg-spinners-ring-resize text-sm" />
                    <span>田块处理中</span>
                  </div>

                  <div class="pastoral-land-card__name">
                    {{ land.plantName || '空地' }}
                  </div>
                  <div class="pastoral-land-card__line">
                    <span>{{ getLandLevelLabel(land) }}</span>
                    <span>{{ land.totalSeason ? `季数 ${land.currentSeason || 1}/${land.totalSeason}` : '普通植物' }}</span>
                  </div>
                  <div class="pastoral-land-card__line pastoral-land-card__line--phase">
                    <span class="pastoral-phase-pill" :class="getLandPhaseClass(land)">{{ getLandPhaseLabel(land) }}</span>
                    <strong class="pastoral-land-card__countdown">{{ getLandCountdown(land) }}</strong>
                  </div>
                  <div class="pastoral-land-card__line pastoral-land-card__line--hint">
                    <span>{{ getLandCareSummary(land) }}</span>
                  </div>
                  <div v-if="getLandCareTags(land).length" class="pastoral-land-card__care-tags">
                    <span
                      v-for="tag in getLandCareTags(land)"
                      :key="`${land.id}-${tag}`"
                      class="pastoral-land-card__care-tag"
                      :class="`is-${tag}`"
                    >
                      {{ getLandCareTagLabel(tag) }}
                    </span>
                  </div>
                  <div v-if="isEmptyLand(land) && !landTargetItem" class="pastoral-land-card__actions">
                    <button
                      type="button"
                      class="pastoral-land-card__action is-plant"
                      :disabled="!canRunDirectActions"
                      @click.stop="openPlantSeedPalette(land)"
                    >
                      {{ isPlantSpotlightLand(land.id) && showPlantSeedPalette ? '选种中' : '去种植' }}
                    </button>
                  </div>
                  <div v-else-if="getLandActions(land).length" class="pastoral-land-card__actions">
                    <button
                      v-for="action in getLandActions(land)"
                      :key="`${land.id}-${action.type}`"
                      type="button"
                      class="pastoral-land-card__action"
                      :class="`is-${action.type}`"
                      :disabled="!canRunDirectActions || isLandActionBusy(land.id) || !!landTargetItem"
                      @click.stop="handleLandAction(land, action.type)"
                    >
                      <div
                        v-if="isLandActionLoading(land.id, action.type)"
                        class="i-svg-spinners-ring-resize text-xs"
                      />
                      <span v-else>{{ action.label }}</span>
                    </button>
                  </div>
                  <div class="pastoral-land-card__progress">
                    <span :style="{ width: `${getLandProgress(land)}%` }" />
                  </div>
                </article>
              </div>
            </section>

            <aside class="pastoral-side-stack" :class="{ 'is-collapsed': sidePanelCollapsed, 'is-resizing': sidePanelResizeDragging }">
              <button
                v-if="canResizePastoralSidebar"
                type="button"
                class="pastoral-side-resize-handle"
                :class="{ 'is-active': sidePanelResizeDragging }"
                :title="`拖拽调整侧栏宽度，当前 ${sidePanelWidthLabel}；双击恢复默认宽度`"
                aria-label="拖拽调整右侧经营侧栏宽度"
                @pointerdown="startPastoralSidebarResize"
                @dblclick="resetPastoralSidebarWidth"
              >
                <span class="pastoral-side-resize-handle__grip" />
              </button>

              <div class="pastoral-side-toolbar">
                <div v-if="!sidePanelCollapsed" class="pastoral-side-toolbar__meta">
                  <span class="pastoral-side-toolbar__eyebrow">经营侧栏</span>
                  <span class="pastoral-side-toolbar__desc">
                    {{ canResizePastoralSidebar
                      ? `想让左侧地块更舒展时，可以先拖窄这列，或者直接收起。当前宽度 ${sidePanelWidthLabel}。`
                      : '想让左侧地块更舒展时，可以直接收起这列；宽屏下也支持拖拽调宽。' }}
                  </span>
                </div>

                <button
                  type="button"
                  class="pastoral-side-toggle"
                  :class="{ 'is-collapsed': sidePanelCollapsed }"
                  :aria-expanded="!sidePanelCollapsed"
                  :title="sidePanelCollapsed ? '展开右侧经营侧栏' : '收起右侧经营侧栏'"
                  @click="toggleSidePanelCollapsed()"
                >
                  <div :class="sidePanelCollapsed ? 'i-carbon-chevron-left' : 'i-carbon-chevron-right'" class="text-base" />
                  <span>{{ sidePanelCollapsed ? '展开' : '收起' }}</span>
                </button>
              </div>

              <section v-if="sidePanelCollapsed" class="pastoral-side-rail">
                <div class="pastoral-side-rail__group">
                  <button
                    v-for="action in quickActions"
                    :key="`rail-${action.key}`"
                    type="button"
                    class="pastoral-side-rail__action"
                    :title="`${action.label}：${action.hint}`"
                    @click="openQuickAction(action)"
                  >
                    <img :src="action.icon" :alt="action.label">
                    <span>{{ action.label }}</span>
                  </button>
                </div>

                <div class="pastoral-side-rail__stats">
                  <div
                    v-for="item in farmSummaryCards"
                    :key="`rail-stat-${item.key}`"
                    class="pastoral-side-rail__stat"
                    :class="item.tone"
                  >
                    <strong>{{ item.value }}</strong>
                    <span>{{ item.label }}</span>
                  </div>
                </div>
              </section>

              <div v-else class="pastoral-side-expanded">
                <section class="pastoral-side-card">
                  <div class="pastoral-side-card__head">
                    <h2>快捷入口</h2>
                    <p>先在田园弹层里预览真实数据，需要深操作时再进入完整页面。</p>
                  </div>

                  <div class="pastoral-quick-grid">
                    <button
                      v-for="action in quickActions"
                      :key="action.key"
                      type="button"
                      class="pastoral-quick-card"
                      @click="openQuickAction(action)"
                    >
                      <img :src="action.icon" :alt="action.label">
                      <div class="pastoral-quick-card__label">
                        {{ action.label }}
                      </div>
                      <div class="pastoral-quick-card__hint">
                        {{ action.hint }}
                      </div>
                    </button>
                  </div>
                </section>

                <section class="pastoral-side-card">
                  <div class="pastoral-side-card__head">
                    <h2>地块摘要</h2>
                    <p>这里优先展示与经营相关的核心信息。</p>
                  </div>

                  <div class="pastoral-summary-grid">
                    <div
                      v-for="item in farmSummaryCards"
                      :key="item.key"
                      class="pastoral-summary-card"
                      :class="item.tone"
                    >
                      <div class="pastoral-summary-card__label">
                        {{ item.label }}
                      </div>
                      <div class="pastoral-summary-card__value">
                        {{ item.value }}
                      </div>
                    </div>
                  </div>
                </section>

                <section class="pastoral-side-card">
                  <div class="pastoral-side-card__head">
                    <h2>运行概览</h2>
                    <p>第一版不搬整块日志区，先保留简洁统计卡。</p>
                  </div>

                  <div class="pastoral-summary-grid">
                    <div
                      v-for="item in operationCards"
                      :key="item.key"
                      class="pastoral-summary-card is-slate"
                    >
                      <div class="pastoral-summary-card__label">
                        {{ item.label }}
                      </div>
                      <div class="pastoral-summary-card__value">
                        {{ item.value }}
                      </div>
                    </div>
                  </div>
                </section>

                <section class="pastoral-side-card">
                  <div class="pastoral-side-card__head">
                    <h2>这一版边界</h2>
                    <p>重点先把田园入口、主舞台和轻弹层打顺，复杂操作仍留在原功能页。</p>
                  </div>

                  <div class="pastoral-scope-note is-include">
                    <strong>这一版已经做到</strong>
                    <span>入口按钮、独立页面、真实账号与资源数据、状态摘要、田园弹层、土地舞台、部分土地直操作、选地道具联动主舞台、空地速种、好友快操作与批处理、访客互动记录和返回记忆。</span>
                  </div>

                  <div class="pastoral-scope-note is-defer">
                    <strong>下一阶段再补</strong>
                    <span>种植完成后的收益预估、更细的作物筛选与推荐、更多粒度动效，以及把更多原控制台能力田园化承接进来。</span>
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>

    <PastoralQuickPanel
      :show="!!quickPanelContent"
      :title="quickPanelContent?.title || ''"
      :subtitle="quickPanelContent?.subtitle || ''"
      :tone="quickPanelContent?.tone || 'bag'"
      :illustration="activeQuickAction?.icon || ''"
      :metrics="quickPanelContent?.metrics || []"
      :actions="quickPanelContent?.actions || []"
      :entries="quickPanelContent?.entries || []"
      :loading="quickPanelBusy"
      :empty-title="quickPanelContent?.emptyTitle || ''"
      :empty-description="quickPanelContent?.emptyDescription || ''"
      :hint="quickPanelContent?.hint || ''"
      primary-label="进入完整页面"
      secondary-label="继续逛田园"
      @action="handleQuickPanelAction"
      @close="closeQuickActionPanel"
      @entry-action="handleQuickPanelEntryAction"
      @primary="openQuickActionTarget"
    />
  </div>
</template>

<style scoped>
.pastoral-view {
  --pastoral-panel-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
  --pastoral-panel-border: color-mix(in srgb, var(--ui-border-subtle) 84%, transparent);
  --pastoral-warm: #c98557;
  --pastoral-warm-deep: #9b5f39;
  --pastoral-gold: #efb34a;
  --pastoral-green: #4b9c48;
  --pastoral-shadow: 0 22px 60px color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  --pastoral-soft-board-border: rgba(255, 255, 255, 0.68);
  --pastoral-soft-board-bg:
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(233, 246, 255, 0.56)),
    linear-gradient(180deg, rgba(124, 197, 248, 0.1), rgba(255, 255, 255, 0));
  --pastoral-soft-board-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84), 0 10px 22px rgba(85, 141, 188, 0.1);
}

.pastoral-scene {
  border: 1px solid var(--pastoral-panel-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent), color-mix(in srgb, var(--ui-bg-surface) 74%, transparent)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.02));
  box-shadow: var(--pastoral-shadow);
}

.pastoral-scene {
  position: relative;
  overflow: hidden;
  padding: 1rem;
}

.pastoral-stage {
  position: relative;
  overflow: hidden;
  min-height: 48rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 2rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.06));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.pastoral-stage__bg,
.pastoral-stage__fg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.pastoral-stage__bg {
  object-position: center top;
  opacity: 0.95;
}

.pastoral-stage__fg {
  object-position: center bottom;
  opacity: 0.98;
}

.pastoral-stage__wash {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.08) 34%, rgba(255, 255, 255, 0) 60%, rgba(255, 255, 255, 0.14) 100%),
    radial-gradient(circle at 84% 12%, rgba(255, 255, 255, 0.28), transparent 18%);
  pointer-events: none;
}

.pastoral-stage__content {
  --pastoral-top-band-height: clamp(16.6rem, 32vh, 17.9rem);
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.56rem;
  padding: 0.7rem;
}

.pastoral-top-grid {
  display: grid;
  grid-template-columns: 19.7rem minmax(0, 1fr) 14.35rem;
  height: var(--pastoral-top-band-height);
  gap: 0.58rem;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}

.pastoral-top-grid > * {
  min-height: 0;
}

.pastoral-account-column {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 4.88rem);
  gap: 0.34rem;
  align-content: start;
  height: 100%;
  min-height: 0;
}

.pastoral-account-card {
  position: relative;
  overflow: hidden;
  height: 100%;
  min-height: 0;
  padding: 0.52rem;
  border-radius: 1.45rem;
  color: #6f4b24;
  border: 1px solid var(--pastoral-soft-board-border);
  background: var(--pastoral-soft-board-bg);
  box-shadow: var(--pastoral-soft-board-shadow);
  backdrop-filter: blur(12px);
}

.pastoral-account-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  margin-bottom: 0.34rem;
}

.pastoral-account-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  padding: 0 0.55rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  font-size: 0.65rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.pastoral-account-badge.is-level {
  background: color-mix(in srgb, var(--ui-status-warning) 12%, rgba(255, 255, 255, 0.92));
  color: #8d5a10;
}

.pastoral-account-badge.is-online {
  background: color-mix(in srgb, var(--ui-status-success) 12%, rgba(255, 255, 255, 0.92));
  color: #2a7d38;
}

.pastoral-account-badge.is-offline {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, rgba(255, 255, 255, 0.92));
  color: #b34b4b;
}

.pastoral-account-card__main {
  display: grid;
  grid-template-columns: 3.15rem 1fr;
  gap: 0.5rem;
  align-items: center;
}

.pastoral-account-card__avatar {
  display: grid;
  place-items: center;
  width: 3.15rem;
  height: 3.15rem;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.76);
  border-radius: 9999px;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 248, 225, 0.95), rgba(242, 222, 188, 0.88)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.65), rgba(236, 244, 255, 0.48));
  box-shadow: inset 0 2px 6px rgba(255, 255, 255, 0.45), 0 8px 16px rgba(85, 141, 188, 0.14);
}

.pastoral-account-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pastoral-account-card__nameplate {
  padding: 0.52rem 0.74rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(240, 247, 255, 0.62)),
    linear-gradient(90deg, rgba(255, 226, 187, 0.16), rgba(187, 223, 255, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 6px 16px rgba(85, 141, 188, 0.12);
}

.pastoral-account-card__name {
  overflow: hidden;
  color: #6f4b24;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1rem;
  font-weight: 900;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.52);
}

.pastoral-account-card__progress {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  margin-top: 0.28rem;
}

.pastoral-account-card__progress-track {
  flex: 1;
  height: 0.46rem;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(132, 164, 185, 0.22);
  box-shadow: inset 0 1px 2px rgba(85, 141, 188, 0.14);
}

.pastoral-account-card__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #f8f3ca 0%, #d5dc5f 35%, #99bf40 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
}

.pastoral-account-card__progress-text {
  flex-shrink: 0;
  color: rgba(111, 75, 36, 0.82);
  font-size: 0.64rem;
  font-weight: 800;
}

.pastoral-account-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.22rem 0.42rem;
  margin-top: 0.22rem;
  padding-left: 3.76rem;
  color: rgba(111, 75, 36, 0.78);
  font-size: 0.58rem;
  font-weight: 700;
}

.pastoral-resource-board {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: stretch;
  gap: 0.28rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.pastoral-resources {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.34rem;
  align-content: stretch;
}

.pastoral-resources--account {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: stretch;
  height: 100%;
}

.pastoral-resource-chip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 2.28rem;
  padding: 0.28rem 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 9999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(217, 240, 255, 0.5)),
    linear-gradient(180deg, rgba(124, 197, 248, 0.18), rgba(255, 255, 255, 0));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 10px 24px rgba(85, 141, 188, 0.12);
  backdrop-filter: blur(12px);
}

.pastoral-resources--account .pastoral-resource-chip {
  min-height: 0;
  height: 100%;
  padding: 0.24rem 0.36rem;
  border-radius: 1rem;
}

.pastoral-resource-chip__icon {
  width: 1.04rem;
  height: 1.04rem;
  flex-shrink: 0;
  object-fit: contain;
}

.pastoral-resource-chip__icon--fallback {
  border-radius: 9999px;
}

.pastoral-resource-chip__icon--fallback.is-normal {
  background: radial-gradient(circle at 30% 30%, #ebffdb, #7dd15a);
}

.pastoral-resource-chip__icon--fallback.is-organic {
  background: radial-gradient(circle at 30% 30%, #fff3cd, #f0c95a);
}

.pastoral-resource-chip__label {
  color: rgba(121, 82, 48, 0.78);
  font-size: 0.5rem;
  font-weight: 800;
}

.pastoral-resource-chip__value {
  margin-top: 0.04rem;
  color: #7b4c30;
  font-size: 0.7rem;
  line-height: 1.15;
  font-weight: 900;
  white-space: nowrap;
}

.pastoral-today-board {
  display: grid;
  grid-template-rows: auto;
  align-content: start;
  gap: 0.18rem;
  min-height: 0;
  height: 100%;
  padding: 0.28rem 0.4rem;
  border: 1px solid var(--pastoral-soft-board-border);
  border-radius: 1.45rem;
  background: var(--pastoral-soft-board-bg);
  box-shadow: var(--pastoral-soft-board-shadow);
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.pastoral-today-board__sections {
  display: grid;
  gap: 0.12rem;
  align-content: start;
  min-height: 0;
}

.pastoral-today-board__summary-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.14rem;
  min-height: 0;
}

.pastoral-today-section {
  display: grid;
  gap: 0.1rem;
  min-height: 0;
}

.pastoral-today-section.is-inline {
  grid-template-columns: 2.48rem minmax(0, 1fr);
  align-items: center;
}

.pastoral-today-section.is-compact {
  min-width: 0;
  grid-template-columns: 2.32rem minmax(0, 1fr);
}

.pastoral-today-section__title {
  display: inline-flex;
  align-items: center;
  min-height: 0.88rem;
  width: fit-content;
  padding: 0 0.28rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.58);
  color: #74847b;
  font-size: 0.44rem;
  font-weight: 800;
}

.pastoral-today-grid {
  display: grid;
  gap: 0.14rem;
  min-height: 0;
}

.pastoral-today-grid.is-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.pastoral-today-grid.is-6 {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.pastoral-today-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  justify-content: center;
  gap: 0.04rem;
  padding: 0.14rem 0.2rem;
  border-radius: 0.64rem;
  border: 1px solid rgba(214, 232, 255, 0.5);
  background: rgba(255, 255, 255, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.pastoral-today-card.is-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, rgba(255, 255, 255, 0.82));
}

.pastoral-today-card.is-brand {
  background: color-mix(in srgb, var(--ui-brand-500) 9%, rgba(255, 255, 255, 0.84));
}

.pastoral-today-card.is-success {
  background: color-mix(in srgb, var(--ui-status-success) 9%, rgba(255, 255, 255, 0.84));
}

.pastoral-today-card.is-info {
  background: color-mix(in srgb, var(--ui-status-info) 9%, rgba(255, 255, 255, 0.84));
}

.pastoral-today-card.is-neutral {
  background: rgba(255, 255, 255, 0.4);
}

.pastoral-today-card.is-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 8%, rgba(255, 255, 255, 0.84));
}

.pastoral-today-card__label {
  overflow: hidden;
  color: #7d8c83;
  font-size: 0.42rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pastoral-today-card__value {
  overflow: hidden;
  color: #53645c;
  font-size: 0.6rem;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pastoral-runtime-log {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  align-self: stretch;
  gap: 0.38rem;
  min-height: 0;
  padding: 0.54rem 0.62rem 0.62rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.12rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.58)),
    linear-gradient(180deg, rgba(207, 232, 250, 0.22), rgba(255, 255, 255, 0));
  box-shadow: 0 10px 24px rgba(74, 110, 141, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(10px);
}

.pastoral-runtime-log.is-stage-log {
  gap: 0.22rem;
  min-height: 0;
  height: 100%;
  padding: 0.36rem 0.42rem 0.42rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(245, 249, 245, 0.62)),
    radial-gradient(circle at 100% 0%, rgba(166, 214, 255, 0.18), transparent 42%);
  box-shadow: 0 10px 24px rgba(74, 110, 141, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.pastoral-runtime-log__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.32rem;
}

.pastoral-runtime-log__head-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.22rem;
}

.pastoral-runtime-log__eyebrow {
  color: #6f7d75;
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pastoral-runtime-log__title {
  margin-top: 0.06rem;
  color: #506159;
  font-size: 0.74rem;
  font-weight: 900;
}

.pastoral-runtime-log__live {
  display: inline-flex;
  align-items: center;
  min-height: 1.16rem;
  padding: 0 0.38rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.46);
  color: #6e7d75;
  font-size: 0.52rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.pastoral-runtime-log__live.is-online {
  background: color-mix(in srgb, var(--ui-status-success) 12%, rgba(255, 255, 255, 0.92));
  color: #2d8550;
}

.pastoral-runtime-log__live.is-offline {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, rgba(255, 255, 255, 0.92));
  color: #9f6a22;
}

.pastoral-runtime-log__count {
  flex-shrink: 0;
  padding: 0.12rem 0.34rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.46);
  color: #7c8b83;
  font-size: 0.52rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.pastoral-runtime-log__list {
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  min-height: 0;
  gap: 0.28rem;
  overflow: auto;
  padding-right: 0.08rem;
}

.pastoral-runtime-log.is-stage-log .pastoral-runtime-log__list {
  flex: 1;
  min-height: 0;
}

.pastoral-runtime-log.is-stage-log .pastoral-runtime-log__message {
  -webkit-line-clamp: 2;
}

.pastoral-runtime-log__entry {
  min-height: 0;
  overflow: hidden;
  padding: 0.34rem 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 0.9rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.52), rgba(237, 245, 255, 0.34)),
    linear-gradient(135deg, rgba(188, 223, 250, 0.12), rgba(255, 255, 255, 0));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 6px 16px rgba(91, 135, 171, 0.08);
}

.pastoral-runtime-log__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.18rem;
  margin-bottom: 0.12rem;
  font-size: 0.54rem;
}

.pastoral-runtime-log__time {
  color: rgba(111, 125, 117, 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;
}

.pastoral-runtime-log__tag,
.pastoral-runtime-log__event {
  display: inline-flex;
  align-items: center;
  min-height: 0.96rem;
  padding: 0 0.28rem;
  border-radius: 9999px;
  font-size: 0.54rem;
  font-weight: 800;
}

.pastoral-runtime-log__tag.is-danger {
  background: rgba(255, 112, 112, 0.12);
  color: #bf5a5a;
}

.pastoral-runtime-log__tag.is-warning {
  background: rgba(255, 214, 117, 0.18);
  color: #a96f1f;
}

.pastoral-runtime-log__tag.is-info {
  background: rgba(60, 186, 255, 0.14);
  color: #3379a5;
}

.pastoral-runtime-log__tag.is-brand {
  background: rgba(125, 149, 255, 0.14);
  color: #5a6eb8;
}

.pastoral-runtime-log__event {
  background: rgba(102, 171, 231, 0.16);
  color: #4d82ac;
}

.pastoral-runtime-log__message {
  display: -webkit-box;
  overflow: hidden;
  color: #53645c;
  font-size: 0.62rem;
  line-height: 1.26;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.pastoral-runtime-log__empty {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 0.42rem 0.46rem;
  border: 1px dashed rgba(131, 168, 212, 0.3);
  border-radius: 1rem;
  color: rgba(111, 125, 117, 0.78);
  font-size: 0.58rem;
  line-height: 1.45;
  text-align: center;
}

.pastoral-observe-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.38rem;
  padding: 0 0.08rem;
}

.pastoral-observe-head__copy {
  display: grid;
  gap: 0.14rem;
  min-width: 0;
}

.pastoral-observe-head__eyebrow {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 1.1rem;
  padding: 0 0.42rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.54);
  color: #708078;
  font-size: 0.53rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.pastoral-observe-head__title {
  color: #51635a;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1.12;
}

.pastoral-observe-head__badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0 0.56rem;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.56);
  color: #67786f;
  font-size: 0.6rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.pastoral-observe-head__badge.is-online {
  background: color-mix(in srgb, var(--ui-status-success) 12%, rgba(255, 255, 255, 0.92));
  color: #2d8550;
}

.pastoral-observe-head__badge.is-offline {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, rgba(255, 255, 255, 0.92));
  color: #b55262;
}

.pastoral-resource-status-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(11.2rem, 0.34fr);
  align-items: stretch;
  gap: 0.28rem;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.pastoral-status-side-stack {
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0.28rem;
  height: 100%;
  min-height: 0;
}

.pastoral-notice-board {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 0.24rem;
  padding: 0.34rem 0.42rem 0.42rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.12rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(245, 250, 244, 0.62)),
    radial-gradient(circle at 100% 0%, rgba(255, 218, 163, 0.2), transparent 42%),
    radial-gradient(circle at 0% 22%, rgba(179, 220, 255, 0.12), transparent 46%);
  box-shadow: 0 10px 24px rgba(74, 110, 141, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
}

.pastoral-notice-board__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.34rem;
}

.pastoral-notice-board__eyebrow {
  color: #6f7d75;
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pastoral-notice-board__title {
  margin-top: 0.06rem;
  color: #51635a;
  font-size: 0.74rem;
  font-weight: 900;
}

.pastoral-notice-board__count {
  flex-shrink: 0;
  padding: 0.12rem 0.36rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.46);
  color: #7c8b83;
  font-size: 0.52rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.pastoral-notice-board__body {
  display: grid;
  flex: 1;
  align-content: start;
  gap: 0.24rem;
  min-height: 0;
  overflow: auto;
  padding-right: 0.06rem;
}

.pastoral-notice-board__featured {
  display: grid;
  gap: 0.2rem;
  padding: 0.36rem 0.4rem 0.42rem;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 1rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(252, 245, 231, 0.56)),
    linear-gradient(135deg, rgba(255, 224, 166, 0.14), rgba(255, 255, 255, 0));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 8px 18px rgba(141, 120, 74, 0.08);
}

.pastoral-notice-board__featured-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem;
}

.pastoral-notice-board__chip {
  display: inline-flex;
  align-items: center;
  min-height: 1rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.52);
  color: #7b836e;
  font-size: 0.5rem;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.pastoral-notice-board__chip.is-highlight {
  background: color-mix(in srgb, var(--ui-status-warning) 16%, rgba(255, 255, 255, 0.92));
  color: #9a6819;
}

.pastoral-notice-board__featured-title {
  display: -webkit-box;
  overflow: hidden;
  color: #536049;
  font-size: 0.72rem;
  line-height: 1.28;
  font-weight: 900;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.pastoral-notice-board__featured-copy {
  display: -webkit-box;
  overflow: hidden;
  color: #657066;
  font-size: 0.56rem;
  line-height: 1.5;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.pastoral-notice-board__list {
  display: grid;
  align-content: start;
  gap: 0.22rem;
  min-height: 0;
}

.pastoral-notice-board__list-title {
  color: rgba(107, 122, 114, 0.76);
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.pastoral-notice-board__item {
  display: grid;
  gap: 0.08rem;
  padding: 0.28rem 0.34rem;
  border: 1px solid rgba(255, 255, 255, 0.66);
  border-radius: 0.88rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(240, 247, 255, 0.38)),
    linear-gradient(135deg, rgba(188, 223, 250, 0.12), rgba(255, 255, 255, 0));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.pastoral-notice-board__item-title {
  display: -webkit-box;
  overflow: hidden;
  color: #56665d;
  font-size: 0.56rem;
  line-height: 1.3;
  font-weight: 800;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.pastoral-notice-board__item-meta {
  color: rgba(116, 130, 120, 0.78);
  font-size: 0.5rem;
  font-weight: 800;
}

.pastoral-notice-board__item-copy {
  display: -webkit-box;
  overflow: hidden;
  color: #6a786f;
  font-size: 0.52rem;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.pastoral-notice-board__empty {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 0.54rem 0.46rem;
  border: 1px dashed rgba(141, 177, 214, 0.34);
  border-radius: 1rem;
  color: rgba(111, 125, 117, 0.8);
  font-size: 0.58rem;
  line-height: 1.45;
  text-align: center;
}

.pastoral-status-card {
  display: grid;
  gap: 0.32rem;
  min-height: 0;
  padding: 0.46rem 0.54rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.12rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(244, 249, 246, 0.62)),
    radial-gradient(circle at 100% 0%, rgba(196, 224, 247, 0.16), transparent 44%);
  box-shadow: 0 10px 24px rgba(74, 110, 141, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(10px);
}

.pastoral-status-card.is-countdown {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 248, 238, 0.64)),
    radial-gradient(circle at 0% 0%, rgba(255, 224, 166, 0.2), transparent 42%);
}

.pastoral-status-card.is-current {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(242, 249, 246, 0.62)),
    radial-gradient(circle at 100% 0%, rgba(179, 220, 255, 0.18), transparent 44%);
}

.pastoral-status-card__head {
  display: flex;
  align-items: center;
  min-height: 0.94rem;
  padding-bottom: 0.14rem;
  border-bottom: 1px solid rgba(154, 179, 167, 0.16);
}

.pastoral-status-card__title {
  position: relative;
  padding-left: 0.58rem;
  color: #5a6a61;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.pastoral-status-card__title::before {
  position: absolute;
  top: 50%;
  left: 0;
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, rgba(113, 187, 240, 0.98), rgba(128, 216, 162, 0.98));
  box-shadow: 0 0 0 0.16rem rgba(255, 255, 255, 0.42);
  content: '';
  transform: translateY(-50%);
}

.pastoral-status-card.is-countdown .pastoral-status-card__title::before {
  background: linear-gradient(135deg, rgba(255, 196, 116, 0.98), rgba(120, 196, 255, 0.98));
}

.pastoral-status-card.is-current .pastoral-status-card__title::before {
  background: linear-gradient(135deg, rgba(114, 186, 255, 0.98), rgba(124, 215, 155, 0.98));
}

.pastoral-status-card__metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.2rem;
}

.pastoral-status-card__metric {
  display: flex;
  min-width: 0;
  min-height: 1.88rem;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.04rem;
  padding: 0.24rem 0.28rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 0.92rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(240, 247, 243, 0.62));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.pastoral-status-card__metric.is-full {
  grid-column: 1 / -1;
  min-height: 1.62rem;
}

.pastoral-status-card__metric.is-soft {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(232, 244, 255, 0.58));
}

.pastoral-status-card__metric.is-brand {
  background: color-mix(in srgb, var(--ui-brand-500) 10%, rgba(255, 255, 255, 0.88));
}

.pastoral-status-card__metric.is-success {
  background: color-mix(in srgb, var(--ui-status-success) 12%, rgba(255, 255, 255, 0.88));
}

.pastoral-status-card__metric.is-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, rgba(255, 255, 255, 0.9));
}

.pastoral-status-card__metric.is-neutral {
  background: rgba(255, 255, 255, 0.54);
}

.pastoral-status-card__metric.is-muted {
  background: linear-gradient(180deg, rgba(250, 251, 247, 0.9), rgba(244, 246, 239, 0.76));
}

.pastoral-status-card__metric-label {
  color: #74847b;
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.pastoral-status-card__metric-value {
  overflow: hidden;
  color: #4a5c54;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.68rem;
  font-weight: 900;
  line-height: 1.15;
}

.pastoral-status-card__metric-value.is-positive {
  color: color-mix(in srgb, var(--ui-status-success) 86%, var(--ui-text-1) 14%);
}

.pastoral-status-card__metric-value.is-negative {
  color: color-mix(in srgb, var(--ui-status-danger) 84%, var(--ui-text-1) 16%);
}

.pastoral-main-grid {
  --pastoral-land-card-min-height: 12.45rem;
  --pastoral-land-card-padding: 0.78rem;
  --pastoral-land-gap: 0.82rem;
  --pastoral-land-crop-height: 4.4rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 24rem);
  gap: 0.82rem;
  align-items: start;
}

.pastoral-main-grid.is-side-collapsed {
  --pastoral-land-card-min-height: 11.7rem;
  --pastoral-land-card-padding: 0.72rem;
  --pastoral-land-gap: 0.84rem;
  --pastoral-land-crop-height: 4.1rem;
  grid-template-columns: minmax(0, 1fr) 5.4rem;
  gap: 0.85rem;
}

.pastoral-farm-panel {
  padding: 0.75rem;
  border-radius: 1.9rem;
  background:
    linear-gradient(180deg, rgba(232, 248, 189, 0.82), rgba(198, 230, 123, 0.68)),
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.3), transparent 45%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 16px 30px rgba(94, 136, 48, 0.14);
}

.pastoral-empty-state {
  display: flex;
  min-height: 24rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  border: 1px dashed color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 1.7rem;
  background: rgba(255, 255, 255, 0.64);
  text-align: center;
  padding: 1.5rem;
}

.pastoral-empty-state h2 {
  margin: 0;
  color: var(--ui-text-1);
  font-size: 1.15rem;
}

.pastoral-empty-state p {
  max-width: 34rem;
  margin: 0;
  color: var(--ui-text-2);
  line-height: 1.7;
}

.pastoral-empty-state__icon {
  font-size: 2.3rem;
}

.pastoral-empty-state.is-success {
  border-color: color-mix(in srgb, var(--ui-status-success) 30%, transparent);
}

.pastoral-empty-state.is-warning {
  border-color: color-mix(in srgb, var(--ui-status-warning) 30%, transparent);
}

.pastoral-empty-state.is-info {
  border-color: color-mix(in srgb, var(--ui-status-info) 30%, transparent);
}

.pastoral-empty-state.is-stage-board {
  align-items: stretch;
  justify-content: flex-start;
  min-height: 29rem;
  padding: 1rem;
  text-align: left;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(244, 251, 226, 0.54)),
    radial-gradient(circle at 80% 20%, rgba(255, 247, 196, 0.36), transparent 26%);
}

.pastoral-empty-board {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(19rem, 0.95fr);
  gap: 1rem;
  width: 100%;
  min-height: 100%;
}

.pastoral-empty-board__main,
.pastoral-empty-board__aside {
  display: grid;
  align-content: start;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.5rem;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76), 0 14px 28px rgba(89, 126, 76, 0.08);
  backdrop-filter: blur(16px);
}

.pastoral-empty-board__eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.95rem;
  padding: 0 0.8rem;
  border-radius: 9999px;
  background: rgba(255, 245, 206, 0.94);
  color: #9a6425;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.pastoral-empty-board__hero {
  display: grid;
  grid-template-columns: 4.3rem minmax(0, 1fr);
  gap: 0.9rem;
  align-items: start;
}

.pastoral-empty-board__icon {
  display: grid;
  place-items: center;
  width: 4.3rem;
  height: 4.3rem;
  border-radius: 1.25rem;
  background: linear-gradient(180deg, rgba(255, 249, 214, 0.96), rgba(244, 222, 155, 0.88));
  color: #a2681d;
  font-size: 1.9rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 10px 22px rgba(173, 140, 73, 0.16);
}

.pastoral-empty-board__copy h2 {
  margin: 0;
  color: #3c513f;
  font-size: 1.22rem;
  font-weight: 900;
}

.pastoral-empty-board__copy p {
  max-width: none;
  margin-top: 0.45rem;
  color: #617462;
  font-size: 0.9rem;
  line-height: 1.7;
}

.pastoral-empty-board__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.pastoral-empty-board__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 0.95rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  font-size: 0.82rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast);
}

.pastoral-empty-board__btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.pastoral-empty-board__btn:disabled {
  cursor: not-allowed;
  opacity: 0.64;
}

.pastoral-empty-board__btn.is-primary {
  background: linear-gradient(180deg, #f9d98f, #ecb85a);
  color: #7b4f15;
  box-shadow: 0 14px 28px -20px rgba(236, 184, 90, 0.72);
}

.pastoral-empty-board__btn.is-secondary {
  background: rgba(255, 255, 255, 0.82);
  color: #4b6157;
}

.pastoral-empty-board__btn.is-ghost {
  background: rgba(236, 247, 255, 0.78);
  color: #557085;
}

.pastoral-empty-board__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.pastoral-empty-board__stat {
  display: grid;
  gap: 0.22rem;
  padding: 0.8rem 0.9rem;
  border-radius: 1.15rem;
  border: 1px solid rgba(214, 232, 255, 0.54);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(236, 245, 255, 0.3));
}

.pastoral-empty-board__stat span {
  color: #708178;
  font-size: 0.72rem;
  font-weight: 800;
}

.pastoral-empty-board__stat strong {
  color: #30473a;
  font-size: 1.02rem;
  font-weight: 900;
}

.pastoral-empty-board__stat.is-success {
  background: color-mix(in srgb, var(--ui-status-success) 10%, rgba(255, 255, 255, 0.88));
}

.pastoral-empty-board__stat.is-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, rgba(255, 255, 255, 0.88));
}

.pastoral-empty-board__stat.is-brand {
  background: color-mix(in srgb, var(--ui-brand-500) 9%, rgba(255, 255, 255, 0.88));
}

.pastoral-empty-board__stat.is-neutral {
  background: rgba(247, 248, 242, 0.86);
}

.pastoral-empty-board__preview-head h3 {
  margin: 0;
  color: #405243;
  font-size: 1rem;
  font-weight: 900;
}

.pastoral-empty-board__preview-head p {
  max-width: none;
  margin-top: 0.35rem;
  color: #667866;
  font-size: 0.82rem;
  line-height: 1.65;
}

.pastoral-empty-board__quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
}

.pastoral-empty-board__quick {
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  min-height: 5.9rem;
  padding: 0.65rem 0.45rem;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 1.15rem;
  background:
    radial-gradient(circle at 50% 22%, rgba(180, 225, 182, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 239, 0.88));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 10px 22px rgba(89, 126, 76, 0.12);
  text-align: center;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast);
}

.pastoral-empty-board__quick:hover {
  transform: translateY(-1px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 14px 26px rgba(89, 126, 76, 0.16);
}

.pastoral-empty-board__quick img {
  width: 2.4rem;
  height: 2.4rem;
  object-fit: contain;
}

.pastoral-empty-board__quick span {
  color: #6f3d20;
  font-size: 0.7rem;
  font-weight: 900;
  line-height: 1.25;
}

.pastoral-empty-board__plots {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
}

.pastoral-empty-plot {
  display: grid;
  gap: 0.22rem;
  min-height: 4.85rem;
  padding: 0.7rem;
  border-radius: 1.15rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.pastoral-empty-plot strong {
  color: rgba(71, 56, 28, 0.92);
  font-size: 0.78rem;
  font-weight: 900;
}

.pastoral-empty-plot span {
  color: rgba(96, 82, 56, 0.78);
  font-size: 0.68rem;
  line-height: 1.45;
}

.pastoral-empty-plot.is-water {
  background: linear-gradient(180deg, rgba(223, 244, 255, 0.96), rgba(191, 230, 255, 0.82));
}

.pastoral-empty-plot.is-grow {
  background: linear-gradient(180deg, rgba(236, 251, 218, 0.96), rgba(205, 237, 170, 0.84));
}

.pastoral-empty-plot.is-ready {
  background: linear-gradient(180deg, rgba(255, 247, 198, 0.96), rgba(245, 216, 129, 0.84));
}

.pastoral-empty-plot.is-alert {
  background: linear-gradient(180deg, rgba(255, 233, 216, 0.96), rgba(248, 200, 163, 0.84));
}

.pastoral-empty-plot.is-empty {
  background: linear-gradient(180deg, rgba(246, 240, 223, 0.96), rgba(233, 220, 187, 0.84));
}

.pastoral-reminder-strip {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(220px, 0.9fr);
  gap: 0.9rem;
  margin-bottom: 1rem;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 1.35rem;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(247, 255, 245, 0.62)),
    linear-gradient(135deg, rgba(104, 185, 129, 0.1), rgba(255, 255, 255, 0));
  box-shadow: 0 16px 34px rgba(68, 115, 84, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(12px);
}

.pastoral-reminder-strip.is-danger {
  background:
    linear-gradient(135deg, rgba(255, 248, 245, 0.88), rgba(255, 242, 242, 0.72)),
    linear-gradient(135deg, rgba(241, 104, 104, 0.16), rgba(255, 255, 255, 0));
}

.pastoral-reminder-strip.is-warning {
  background:
    linear-gradient(135deg, rgba(255, 252, 242, 0.88), rgba(255, 247, 227, 0.72)),
    linear-gradient(135deg, rgba(255, 194, 89, 0.16), rgba(255, 255, 255, 0));
}

.pastoral-reminder-strip.is-success {
  background:
    linear-gradient(135deg, rgba(247, 255, 245, 0.88), rgba(237, 255, 245, 0.72)),
    linear-gradient(135deg, rgba(106, 198, 148, 0.14), rgba(255, 255, 255, 0));
}

.pastoral-reminder-strip.is-brand {
  background:
    linear-gradient(135deg, rgba(246, 250, 255, 0.88), rgba(240, 248, 255, 0.72)),
    linear-gradient(135deg, rgba(100, 162, 255, 0.15), rgba(255, 255, 255, 0));
}

.pastoral-reminder-strip.is-muted {
  background:
    linear-gradient(135deg, rgba(248, 248, 248, 0.9), rgba(239, 241, 244, 0.74)),
    linear-gradient(135deg, rgba(131, 139, 152, 0.15), rgba(255, 255, 255, 0));
}

.pastoral-reminder-strip__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.34rem;
}

.pastoral-reminder-strip__eyebrow {
  color: #6f7a71;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pastoral-reminder-strip__title {
  color: #486050;
  font-size: 1.02rem;
  font-weight: 900;
  line-height: 1.25;
}

.pastoral-reminder-strip__copy p {
  margin: 0;
  color: #5d7168;
  font-size: 0.76rem;
  line-height: 1.6;
}

.pastoral-reminder-strip__meta {
  color: #7f8e86;
  font-size: 0.66rem;
  font-weight: 700;
}

.pastoral-reminder-strip__actions {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.pastoral-reminder-strip__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  min-height: 2.5rem;
  min-width: 9.5rem;
  padding: 0 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 9999px;
  font-size: 0.74rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-reminder-strip__btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(87, 124, 95, 0.14);
}

.pastoral-reminder-strip__btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  box-shadow: none;
}

.pastoral-reminder-strip__btn.is-primary {
  background: linear-gradient(135deg, #ffefbf, #ffd179);
  color: #7e5112;
}

.pastoral-reminder-strip__btn.is-secondary {
  background: rgba(255, 255, 255, 0.54);
  color: #607069;
}

.pastoral-suggestion-panel {
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  margin-bottom: 1rem;
  padding: 0.95rem 1rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 1.35rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(245, 255, 244, 0.5)),
    linear-gradient(135deg, rgba(180, 224, 206, 0.12), rgba(255, 255, 255, 0));
  box-shadow: 0 14px 30px rgba(82, 124, 102, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(12px);
}

.pastoral-suggestion-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.pastoral-suggestion-panel__eyebrow {
  color: #6f7a71;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pastoral-suggestion-panel__title {
  margin-top: 0.08rem;
  color: #4b6051;
  font-size: 0.98rem;
  font-weight: 900;
}

.pastoral-suggestion-panel__hint {
  max-width: 28rem;
  color: #809188;
  font-size: 0.64rem;
  line-height: 1.6;
  text-align: right;
}

.pastoral-suggestion-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.7rem;
}

.pastoral-suggestion-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.86rem 0.9rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 1.15rem;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 10px 22px rgba(89, 126, 103, 0.08);
}

.pastoral-suggestion-card.is-danger {
  background: linear-gradient(180deg, rgba(255, 248, 246, 0.92), rgba(255, 236, 236, 0.84));
}

.pastoral-suggestion-card.is-warning {
  background: linear-gradient(180deg, rgba(255, 251, 240, 0.94), rgba(255, 244, 220, 0.84));
}

.pastoral-suggestion-card.is-brand {
  background: linear-gradient(180deg, rgba(243, 250, 255, 0.94), rgba(232, 246, 255, 0.84));
}

.pastoral-suggestion-card.is-success {
  background: linear-gradient(180deg, rgba(245, 255, 244, 0.94), rgba(232, 251, 234, 0.84));
}

.pastoral-suggestion-card.is-neutral {
  background: linear-gradient(180deg, rgba(248, 249, 251, 0.94), rgba(239, 242, 245, 0.84));
}

.pastoral-suggestion-card__eyebrow {
  color: #728279;
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pastoral-suggestion-card__title {
  color: #4d6154;
  font-size: 0.84rem;
  font-weight: 900;
  line-height: 1.45;
}

.pastoral-suggestion-card p {
  min-height: 3.2rem;
  margin: 0;
  color: #65766e;
  font-size: 0.68rem;
  line-height: 1.65;
}

.pastoral-suggestion-card__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.1rem;
  margin-top: auto;
  padding: 0 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.76);
  color: #58705f;
  font-size: 0.7rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-suggestion-card__btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 12px 22px rgba(86, 120, 97, 0.12);
}

.pastoral-suggestion-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.56;
  box-shadow: none;
}

.pastoral-plant-panel {
  display: grid;
  gap: 0.9rem;
  margin-bottom: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(239, 249, 231, 0.9), rgba(255, 248, 231, 0.86)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.08));
  box-shadow: 0 18px 30px rgba(96, 129, 72, 0.1);
}

.pastoral-plant-panel.is-open {
  box-shadow: 0 22px 34px rgba(96, 129, 72, 0.14);
}

.pastoral-plant-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
}

.pastoral-plant-panel__copy h2 {
  margin: 0.35rem 0 0;
  color: #4f6b2f;
  font-size: 1.05rem;
  font-weight: 900;
}

.pastoral-plant-panel__copy p {
  margin: 0.4rem 0 0;
  color: #6f7750;
  font-size: 0.86rem;
  line-height: 1.65;
}

.pastoral-plant-panel__eyebrow {
  display: inline-flex;
  align-items: center;
  min-height: 1.9rem;
  padding: 0 0.8rem;
  border-radius: 9999px;
  background: rgba(232, 247, 214, 0.96);
  color: #4e8231;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.pastoral-plant-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.pastoral-plant-panel__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.25rem;
  padding: 0 0.95rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  font-size: 0.78rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast);
}

.pastoral-plant-panel__btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 20px rgba(96, 129, 72, 0.12);
}

.pastoral-plant-panel__btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.pastoral-plant-panel__btn.is-light {
  background: rgba(255, 255, 255, 0.74);
  color: #5f7046;
}

.pastoral-plant-panel__btn.is-ghost {
  background: rgba(243, 255, 236, 0.7);
  color: #52793e;
}

.pastoral-plant-panel__body {
  display: grid;
  gap: 0.75rem;
}

.pastoral-plant-panel__tip {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.55rem;
  color: #6f7750;
  font-size: 0.76rem;
  font-weight: 800;
}

.pastoral-plant-panel__strategy {
  display: grid;
  gap: 0.5rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.66);
  border-radius: 1.15rem;
  background: rgba(255, 255, 255, 0.54);
}

.pastoral-plant-panel__strategy-label {
  color: #5a6b3c;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.pastoral-plant-panel__strategy-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.pastoral-plant-panel__strategy-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  padding: 0 0.88rem;
  border: 1px solid rgba(192, 210, 165, 0.72);
  border-radius: 9999px;
  background: rgba(248, 252, 240, 0.88);
  color: #67734a;
  font-size: 0.78rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), border-color var(--ui-motion-fast), background var(--ui-motion-fast), color var(--ui-motion-fast);
}

.pastoral-plant-panel__strategy-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(170, 198, 132, 0.82);
  box-shadow: 0 12px 18px rgba(110, 137, 82, 0.1);
}

.pastoral-plant-panel__strategy-chip.is-active {
  border-color: rgba(143, 186, 84, 0.92);
  background: linear-gradient(135deg, rgba(231, 245, 208, 0.98), rgba(251, 244, 208, 0.98));
  color: #496c27;
  box-shadow: 0 14px 22px rgba(122, 153, 88, 0.14);
}

.pastoral-plant-panel__strategy-hint {
  color: #75805b;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1.6;
}

.pastoral-plant-panel__template {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.7rem;
  border-top: 1px dashed rgba(178, 198, 147, 0.58);
}

.pastoral-plant-panel__strategy-chip.is-template.is-active {
  border-color: rgba(209, 168, 84, 0.92);
  background: linear-gradient(135deg, rgba(255, 244, 208, 0.98), rgba(241, 252, 217, 0.98));
  color: #745621;
}

.pastoral-plant-panel__strategy-chip.is-cycle.is-active {
  border-color: rgba(108, 171, 188, 0.92);
  background: linear-gradient(135deg, rgba(220, 245, 250, 0.98), rgba(243, 250, 220, 0.98));
  color: #2d6f72;
}

.pastoral-plant-panel__fertilizer {
  display: grid;
  gap: 0.72rem;
  padding: 0.92rem 0.95rem;
  border-radius: 1.1rem;
  border: 1px solid rgba(214, 224, 184, 0.82);
  background: linear-gradient(135deg, rgba(248, 251, 235, 0.96), rgba(255, 248, 227, 0.94));
}

.pastoral-plant-panel__fertilizer.is-short {
  border-color: rgba(173, 203, 118, 0.86);
  background: linear-gradient(135deg, rgba(241, 250, 223, 0.96), rgba(255, 247, 223, 0.94));
}

.pastoral-plant-panel__fertilizer.is-idle {
  border-color: rgba(236, 201, 121, 0.82);
  background: linear-gradient(135deg, rgba(255, 246, 224, 0.96), rgba(247, 242, 225, 0.94));
}

.pastoral-plant-panel__fertilizer.is-gold {
  border-color: rgba(233, 178, 88, 0.84);
  background: linear-gradient(135deg, rgba(255, 240, 212, 0.98), rgba(252, 246, 219, 0.94));
}

.pastoral-plant-panel__fertilizer.is-neutral {
  border-color: rgba(203, 213, 184, 0.82);
  background: linear-gradient(135deg, rgba(245, 248, 236, 0.94), rgba(250, 250, 238, 0.92));
}

.pastoral-plant-panel__fertilizer-copy {
  display: grid;
  gap: 0.24rem;
  color: #6f7457;
  line-height: 1.6;
}

.pastoral-plant-panel__fertilizer-copy strong {
  color: #576535;
  font-size: 0.82rem;
  font-weight: 900;
}

.pastoral-plant-panel__fertilizer-copy span {
  font-size: 0.74rem;
  font-weight: 700;
}

.pastoral-plant-panel__fertilizer-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pastoral-plant-panel__fertilizer-pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  padding: 0 0.68rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 900;
}

.pastoral-plant-panel__fertilizer-pill.is-normal {
  background: rgba(225, 247, 205, 0.92);
  color: #4a7f2d;
}

.pastoral-plant-panel__fertilizer-pill.is-organic {
  background: rgba(255, 237, 191, 0.94);
  color: #90601c;
}

.pastoral-plant-panel__fertilizer-pill.is-muted {
  background: rgba(255, 255, 255, 0.74);
  color: #736852;
}

.pastoral-plant-panel__batch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.9rem 0.95rem;
  border-radius: 1.1rem;
  background: linear-gradient(135deg, rgba(242, 249, 226, 0.96), rgba(255, 245, 221, 0.94));
  border: 1px solid rgba(223, 230, 181, 0.88);
}

.pastoral-plant-panel__batch.is-disabled {
  opacity: 0.72;
}

.pastoral-plant-panel__batch.is-harvest-chain {
  border-color: rgba(126, 171, 214, 0.84);
  background: linear-gradient(135deg, rgba(232, 244, 255, 0.96), rgba(242, 252, 227, 0.94));
}

.pastoral-plant-panel__batch.is-care-chain {
  border-color: rgba(108, 182, 170, 0.86);
  background: linear-gradient(135deg, rgba(226, 247, 240, 0.96), rgba(234, 245, 255, 0.94));
}

.pastoral-plant-panel__batch.is-memory-chain {
  border-color: rgba(184, 167, 120, 0.84);
  background: linear-gradient(135deg, rgba(249, 243, 222, 0.96), rgba(242, 240, 255, 0.94));
}

.pastoral-plant-panel__batch-copy {
  display: grid;
  gap: 0.24rem;
  color: #6e7351;
  line-height: 1.6;
}

.pastoral-plant-panel__batch-copy strong {
  color: #556937;
  font-size: 0.82rem;
  font-weight: 900;
}

.pastoral-plant-panel__batch-copy span {
  font-size: 0.74rem;
  font-weight: 700;
}

.pastoral-plant-panel__batch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.35rem;
  padding: 0 1rem;
  border-radius: 9999px;
  border: 1px solid rgba(143, 186, 84, 0.92);
  background: linear-gradient(135deg, rgba(232, 245, 206, 0.98), rgba(255, 232, 180, 0.98));
  color: #4d6727;
  font-size: 0.8rem;
  font-weight: 900;
  white-space: nowrap;
  box-shadow: 0 14px 22px rgba(122, 153, 88, 0.14);
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast);
}

.pastoral-plant-panel__batch-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 24px rgba(122, 153, 88, 0.18);
}

.pastoral-plant-panel__batch-btn.is-harvest-chain {
  border-color: rgba(115, 161, 213, 0.9);
  background: linear-gradient(135deg, rgba(224, 240, 255, 0.98), rgba(241, 249, 206, 0.98));
  color: #356288;
  box-shadow: 0 14px 22px rgba(111, 149, 193, 0.16);
}

.pastoral-plant-panel__batch-btn.is-harvest-chain:hover:not(:disabled) {
  box-shadow: 0 16px 24px rgba(111, 149, 193, 0.2);
}

.pastoral-plant-panel__batch-btn.is-care-chain {
  border-color: rgba(94, 175, 161, 0.92);
  background: linear-gradient(135deg, rgba(218, 244, 236, 0.98), rgba(214, 239, 255, 0.98));
  color: #256f66;
  box-shadow: 0 14px 22px rgba(86, 156, 146, 0.16);
}

.pastoral-plant-panel__batch-btn.is-care-chain:hover:not(:disabled) {
  box-shadow: 0 16px 24px rgba(86, 156, 146, 0.2);
}

.pastoral-plant-panel__batch-btn.is-memory-chain {
  border-color: rgba(179, 156, 103, 0.9);
  background: linear-gradient(135deg, rgba(247, 236, 205, 0.98), rgba(229, 238, 255, 0.98));
  color: #74592a;
  box-shadow: 0 14px 22px rgba(150, 131, 87, 0.15);
}

.pastoral-plant-panel__batch-btn.is-memory-chain:hover:not(:disabled) {
  box-shadow: 0 16px 24px rgba(150, 131, 87, 0.2);
}

.pastoral-plant-panel__batch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  box-shadow: none;
}

.pastoral-plant-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  min-height: 5.6rem;
  border: 1px dashed rgba(130, 163, 98, 0.34);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.42);
  color: #718055;
  font-size: 0.88rem;
  font-weight: 700;
  text-align: center;
}

.pastoral-plant-seed-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
}

.pastoral-plant-seed-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 1.35rem;
  background: rgba(255, 255, 255, 0.72);
  color: #5d533e;
  text-align: left;
  box-shadow: 0 12px 22px rgba(108, 132, 83, 0.1);
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), border-color var(--ui-motion-fast);
}

.pastoral-plant-seed-card.is-top {
  border-color: rgba(242, 212, 110, 0.9);
}

.pastoral-plant-seed-card.is-good {
  border-color: rgba(174, 219, 140, 0.9);
}

.pastoral-plant-seed-card.is-alt {
  border-color: rgba(223, 230, 206, 0.88);
}

.pastoral-plant-seed-card:hover {
  transform: translateY(-2px);
  border-color: rgba(183, 216, 146, 0.92);
  box-shadow: 0 18px 26px rgba(108, 132, 83, 0.14);
}

.pastoral-plant-seed-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.pastoral-plant-seed-card__recommend,
.pastoral-plant-seed-card__rank {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  padding: 0 0.5rem;
  border-radius: 9999px;
  font-size: 0.64rem;
  font-weight: 900;
}

.pastoral-plant-seed-card__recommend.is-top {
  background: rgba(255, 241, 194, 0.96);
  color: #8f5c13;
}

.pastoral-plant-seed-card__recommend.is-good {
  background: rgba(232, 247, 214, 0.96);
  color: #4b7c31;
}

.pastoral-plant-seed-card__recommend.is-alt {
  background: rgba(239, 241, 233, 0.96);
  color: #6c715b;
}

.pastoral-plant-seed-card__rank {
  background: rgba(255, 255, 255, 0.82);
  color: #7a7157;
}

.pastoral-plant-seed-card__image {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  overflow: hidden;
  border-radius: 1rem;
  background: rgba(244, 251, 231, 0.95);
  color: #699246;
}

.pastoral-plant-seed-card__image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pastoral-plant-seed-card__name {
  color: #5a4b2f;
  font-size: 0.9rem;
  font-weight: 900;
}

.pastoral-plant-seed-card__meta {
  color: #7d755e;
  font-size: 0.72rem;
  line-height: 1.55;
}

.pastoral-plant-seed-card__focus {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.05rem;
  padding: 0 0.7rem;
  border-radius: 0.95rem;
  background: linear-gradient(135deg, rgba(247, 250, 225, 0.92), rgba(255, 243, 218, 0.9));
  color: #6e654f;
  font-size: 0.72rem;
  font-weight: 800;
}

.pastoral-plant-seed-card__focus strong {
  color: #4e6531;
  font-size: 0.78rem;
  font-weight: 900;
}

.pastoral-plant-seed-card__cycle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  color: #726952;
  font-size: 0.68rem;
  line-height: 1.45;
}

.pastoral-plant-seed-card__fertilizer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  color: #70654e;
  font-size: 0.68rem;
  line-height: 1.45;
}

.pastoral-plant-seed-card__stats {
  display: grid;
  gap: 0.18rem;
  color: #6e654e;
  font-size: 0.68rem;
  line-height: 1.5;
}

.pastoral-plant-seed-card__cta {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.7rem;
  padding: 0 0.6rem;
  border-radius: 9999px;
  background: rgba(234, 246, 215, 0.98);
  color: #52793b;
  font-size: 0.7rem;
  font-weight: 900;
}

.pastoral-land-target-banner {
  display: grid;
  gap: 0.9rem;
  margin-bottom: 1rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.62);
  border-radius: 1.5rem;
  background:
    linear-gradient(135deg, rgba(255, 251, 231, 0.92), rgba(234, 248, 224, 0.86)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.08));
  box-shadow: 0 18px 30px rgba(126, 119, 61, 0.12);
}

.pastoral-land-target-banner__main {
  display: grid;
  gap: 0.7rem;
}

.pastoral-land-target-banner__eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.9rem;
  padding: 0 0.8rem;
  border-radius: 9999px;
  background: rgba(255, 243, 204, 0.92);
  color: #986325;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.pastoral-land-target-banner__title-row {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.pastoral-land-target-banner__icon {
  display: flex;
  width: 3.6rem;
  height: 3.6rem;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.72);
  color: #9a6a2f;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.pastoral-land-target-banner__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.pastoral-land-target-banner__copy h2 {
  margin: 0;
  color: #6f4b24;
  font-size: 1.08rem;
  font-weight: 900;
}

.pastoral-land-target-banner__copy p {
  margin: 0.38rem 0 0;
  color: #7b6547;
  font-size: 0.88rem;
  line-height: 1.7;
}

.pastoral-land-target-banner__stats,
.pastoral-land-target-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.pastoral-land-target-banner__pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.8rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.64);
  color: #7c6848;
  font-size: 0.74rem;
  font-weight: 800;
}

.pastoral-land-target-banner__pill.is-strong {
  background: rgba(255, 236, 186, 0.96);
  color: #915e1d;
}

.pastoral-land-target-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.3rem;
  padding: 0 0.95rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.68);
  font-size: 0.8rem;
  font-weight: 900;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast);
}

.pastoral-land-target-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 20px rgba(126, 119, 61, 0.14);
}

.pastoral-land-target-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  box-shadow: none;
}

.pastoral-land-target-btn.is-light {
  background: rgba(255, 255, 255, 0.72);
  color: #7a623d;
}

.pastoral-land-target-btn.is-ghost {
  background: rgba(255, 243, 230, 0.72);
  color: #976339;
}

.pastoral-land-target-btn.is-primary {
  background: linear-gradient(135deg, #f6c96c, #eea949);
  color: #6f4617;
}

.pastoral-farm-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--pastoral-land-gap);
}

.pastoral-land-card {
  position: relative;
  display: flex;
  min-height: var(--pastoral-land-card-min-height);
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.45rem;
  padding: var(--pastoral-land-card-padding);
  border: 1px solid rgba(255, 255, 255, 0.26);
  color: #fffaf1;
  box-shadow: 0 16px 28px rgba(111, 96, 52, 0.14);
  transform-origin: center bottom;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), opacity var(--ui-motion-fast), border-color var(--ui-motion-fast), filter var(--ui-motion-fast);
}

.pastoral-land-card::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-fast), transform var(--ui-motion-fast);
}

.pastoral-land-card::after {
  content: '';
  position: absolute;
  inset: auto 0.8rem 0.55rem;
  height: 1rem;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(76, 58, 23, 0.26) 0%, rgba(76, 58, 23, 0.08) 50%, transparent 76%);
  opacity: 0.38;
  pointer-events: none;
  transition: transform var(--ui-motion-fast), opacity var(--ui-motion-fast), filter var(--ui-motion-fast);
}

.pastoral-land-card.is-normal,
.pastoral-land-card.is-yellow {
  background:
    radial-gradient(circle at 50% 22%, rgba(255, 237, 173, 0.42), transparent 28%),
    linear-gradient(180deg, rgba(231, 191, 112, 0.94), rgba(213, 159, 58, 0.96));
  color: #744b10;
}

.pastoral-land-card.is-red {
  background: linear-gradient(180deg, rgba(227, 150, 112, 0.94), rgba(183, 92, 52, 0.94));
}

.pastoral-land-card.is-black {
  background: linear-gradient(180deg, rgba(78, 65, 52, 0.92), rgba(56, 46, 39, 0.94));
}

.pastoral-land-card.is-gold {
  background:
    radial-gradient(circle at 50% 20%, rgba(255, 250, 204, 0.46), transparent 30%),
    linear-gradient(180deg, rgba(252, 229, 143, 0.94), rgba(232, 170, 20, 0.94));
  color: #754c10;
}

.pastoral-land-card.is-dead {
  background: linear-gradient(180deg, rgba(143, 105, 96, 0.94), rgba(105, 75, 70, 0.96));
}

.pastoral-land-card--ready {
  border-color: rgba(255, 246, 194, 0.92);
  box-shadow: 0 0 0 1px rgba(255, 240, 166, 0.56), 0 20px 32px rgba(177, 147, 65, 0.2);
}

.pastoral-land-card--alert {
  border-color: rgba(255, 223, 200, 0.84);
  box-shadow: 0 0 0 1px rgba(255, 220, 198, 0.42), 0 18px 30px rgba(173, 108, 71, 0.16);
}

.pastoral-land-card.is-normal:has(.pastoral-land-card__hero-state.is-empty),
.pastoral-land-card.is-yellow:has(.pastoral-land-card__hero-state.is-empty) {
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 250, 228, 0.46), transparent 32%),
    linear-gradient(180deg, rgba(236, 205, 146, 0.94), rgba(214, 170, 83, 0.96));
  border-color: rgba(255, 242, 207, 0.8);
  box-shadow: 0 0 0 1px rgba(241, 221, 178, 0.46), 0 18px 28px rgba(145, 118, 56, 0.16);
}

.pastoral-land-card--ready::before {
  opacity: 1;
  background:
    radial-gradient(circle at 50% 28%, rgba(255, 248, 192, 0.52), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), transparent 45%);
}

.pastoral-land-card--soon::before {
  opacity: 1;
  background:
    radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.28), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 40%);
}

.pastoral-land-card--alert::before {
  opacity: 1;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0) 35%, rgba(255, 255, 255, 0.05) 100%);
}

.pastoral-land-card--targeting:not(.pastoral-land-card--target-disabled) {
  cursor: pointer;
}

.pastoral-land-card--targeting:not(.pastoral-land-card--target-disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 28px rgba(111, 96, 52, 0.16);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--targeting):not(.pastoral-land-card--busy) {
  cursor: pointer;
}

.pastoral-land-card--row-hovered:not(.pastoral-land-card--busy) {
  transform: translateY(-1px);
  box-shadow: 0 18px 30px rgba(111, 96, 52, 0.16);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--targeting):not(.pastoral-land-card--busy):hover {
  transform: translateY(-4px) scale(1.012);
  box-shadow: 0 22px 36px rgba(111, 96, 52, 0.2);
  filter: saturate(1.04);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--targeting):not(.pastoral-land-card--busy):hover::after {
  opacity: 0.55;
  transform: scaleX(1.08);
  filter: blur(1px);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--targeting):not(.pastoral-land-card--busy):active {
  transform: translateY(-1px) scale(0.992);
}

.pastoral-land-card--busy {
  transform: translateY(-1px) scale(0.995);
  filter: saturate(0.92);
}

.pastoral-land-card--busy::after {
  opacity: 0.48;
  transform: scaleX(1.04);
}

.pastoral-land-card--sweep-active::before {
  opacity: 1;
  background:
    linear-gradient(115deg, rgba(255, 255, 255, 0) 18%, rgba(255, 250, 205, 0.74) 46%, rgba(255, 255, 255, 0) 74%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0));
  transform: translateX(-118%);
  animation: pastoral-sweep-flash 1.05s ease-out forwards;
}

.pastoral-land-card--target-suggested {
  border-color: rgba(255, 252, 214, 0.82);
  box-shadow: 0 16px 28px rgba(182, 153, 76, 0.16);
}

.pastoral-land-card--target-selected {
  transform: translateY(-2px);
  border-color: rgba(255, 245, 196, 0.96);
  box-shadow: 0 0 0 2px rgba(255, 241, 170, 0.68), 0 20px 30px rgba(178, 142, 59, 0.18);
}

.pastoral-land-card--plant-spotlight {
  border-color: rgba(187, 219, 154, 0.96);
  box-shadow: 0 0 0 2px rgba(192, 228, 153, 0.52), 0 18px 30px rgba(104, 136, 77, 0.14);
}

.pastoral-land-card--target-disabled {
  cursor: default;
  opacity: 0.7;
  filter: saturate(0.82);
}

.pastoral-land-card__top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.pastoral-land-card__hero-state {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.4rem;
  margin-top: 0.4rem;
  padding: 0 0.5rem;
  border-radius: 9999px;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.pastoral-land-card__soil-glow {
  position: absolute;
  inset: auto 1.15rem 1.65rem;
  height: 1.55rem;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(255, 247, 199, 0.52) 0%, rgba(255, 247, 199, 0.16) 48%, transparent 78%);
  opacity: 0.24;
  pointer-events: none;
  transition: opacity var(--ui-motion-fast), transform var(--ui-motion-fast);
}

.pastoral-land-card__hero-state.is-grow {
  background: rgba(232, 247, 214, 0.9);
  color: #477631;
}

.pastoral-land-card__hero-state.is-empty {
  background: rgba(255, 245, 214, 0.94);
  color: #95641c;
}

.pastoral-land-card__hero-state.is-ready {
  background: rgba(255, 244, 191, 0.96);
  color: #8b570d;
}

.pastoral-land-card__hero-state.is-alert {
  background: rgba(255, 230, 214, 0.96);
  color: #b35b2d;
}

.pastoral-land-card__hero-state.is-soon {
  background: rgba(229, 244, 255, 0.94);
  color: #2d6ca0;
}

.pastoral-land-card__hero-state.is-dead {
  background: rgba(255, 225, 225, 0.94);
  color: #b14444;
}

.pastoral-land-card__top-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.pastoral-land-card__id,
.pastoral-land-card__mutant {
  display: inline-flex;
  align-items: center;
  min-height: 1.3rem;
  padding: 0 0.45rem;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.12);
  font-size: 0.63rem;
  font-weight: 900;
}

.pastoral-land-card__target-flag {
  display: inline-flex;
  align-items: center;
  min-height: 1.3rem;
  padding: 0 0.45rem;
  border-radius: 9999px;
  font-size: 0.63rem;
  font-weight: 900;
}

.pastoral-land-card__target-flag.is-selected {
  background: rgba(255, 246, 194, 0.96);
  color: #89570f;
}

.pastoral-land-card__target-flag.is-suggested {
  background: rgba(225, 243, 255, 0.96);
  color: #2e6ca2;
}

.pastoral-land-card__crop {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--pastoral-land-crop-height);
  overflow: visible;
  margin: 0.7rem 0 0.55rem;
  transition: transform var(--ui-motion-fast), filter var(--ui-motion-fast);
}

.pastoral-land-card__crop::before {
  content: '';
  position: absolute;
  inset: 0.35rem 0.6rem;
  border-radius: 9999px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-fast), transform var(--ui-motion-fast);
}

.pastoral-land-card__crop.is-ready::before {
  opacity: 1;
  background: radial-gradient(circle, rgba(255, 245, 188, 0.88) 0%, rgba(255, 245, 188, 0.28) 46%, transparent 72%);
  transform: scale(1.1);
  animation: pastoral-ready-pulse 1.9s ease-in-out infinite;
}

.pastoral-land-card__crop.is-soon::before {
  opacity: 1;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.52) 0%, rgba(255, 255, 255, 0.14) 50%, transparent 72%);
  transform: scale(1.04);
}

.pastoral-land-card__sparkles {
  position: absolute;
  inset: 0.15rem;
  pointer-events: none;
}

.pastoral-land-card__sparkles::before,
.pastoral-land-card__sparkles::after {
  content: '';
  position: absolute;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.98) 0%, rgba(255, 242, 164, 0.9) 38%, transparent 72%);
  animation: pastoral-sparkle-float 2.2s ease-in-out infinite;
}

.pastoral-land-card__sparkles::before {
  top: 0.1rem;
  right: 0.6rem;
}

.pastoral-land-card__sparkles::after {
  left: 0.45rem;
  bottom: 0.4rem;
  animation-delay: 0.7s;
}

.pastoral-land-card--interactive:not(.pastoral-land-card--busy):hover .pastoral-land-card__crop {
  transform: translateY(-0.18rem) scale(1.02);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--busy):hover .pastoral-land-card__soil-glow {
  opacity: 0.42;
  transform: scale(1.08);
}

.pastoral-land-card--row-hovered:not(.pastoral-land-card--busy) .pastoral-land-card__soil-glow {
  opacity: 0.34;
  transform: scale(1.04);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--busy):hover .pastoral-land-card__hero-state {
  transform: translateY(-1px);
}

.pastoral-land-card__crop img {
  position: relative;
  z-index: 1;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  object-fit: contain;
  transform: scale(1.08);
  filter: drop-shadow(0 12px 12px rgba(0, 0, 0, 0.12));
  transition: transform var(--ui-motion-fast), filter var(--ui-motion-fast);
}

.pastoral-land-card--interactive:not(.pastoral-land-card--busy):hover .pastoral-land-card__crop img {
  transform: scale(1.14);
  filter: drop-shadow(0 16px 16px rgba(0, 0, 0, 0.16));
}

.pastoral-land-card__name {
  position: relative;
  z-index: 1;
  font-size: 0.88rem;
  font-weight: 900;
}

.pastoral-land-card__line {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.3rem;
  font-size: 0.64rem;
  opacity: 0.84;
}

.pastoral-land-card__line--phase {
  align-items: center;
}

.pastoral-land-card__line--hint {
  justify-content: flex-start;
  opacity: 0.72;
}

.pastoral-land-card__countdown {
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.01em;
}

.pastoral-land-card__care-tags {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.42rem;
}

.pastoral-land-card__care-tag {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0 0.5rem;
  border-radius: 9999px;
  font-size: 0.62rem;
  font-weight: 900;
  background: rgba(255, 255, 255, 0.18);
}

.pastoral-land-card__care-tag.is-water {
  background: rgba(217, 240, 255, 0.92);
  color: #2f6e9e;
}

.pastoral-land-card__care-tag.is-weed {
  background: rgba(229, 249, 220, 0.92);
  color: #2f7d3b;
}

.pastoral-land-card__care-tag.is-bug {
  background: rgba(255, 233, 216, 0.94);
  color: #b35b2d;
}

.pastoral-land-card__actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.38rem;
  margin-top: 0.55rem;
}

.pastoral-land-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.65rem;
  padding: 0 0.58rem;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.16);
  color: inherit;
  font-size: 0.62rem;
  font-weight: 900;
  backdrop-filter: blur(8px);
  transition: transform var(--ui-motion-fast), opacity var(--ui-motion-fast), box-shadow var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-land-card__action:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 12px 22px rgba(0, 0, 0, 0.12);
}

.pastoral-land-card__action:disabled {
  cursor: not-allowed;
  opacity: 0.56;
  box-shadow: none;
}

.pastoral-land-card__action.is-harvest {
  background: rgba(255, 245, 196, 0.94);
  color: #8c590f;
}

.pastoral-land-card__action.is-water {
  background: rgba(217, 240, 255, 0.92);
  color: #2f6e9e;
}

.pastoral-land-card__action.is-weed {
  background: rgba(229, 249, 220, 0.92);
  color: #2f7d3b;
}

.pastoral-land-card__action.is-bug {
  background: rgba(255, 233, 216, 0.94);
  color: #b35b2d;
}

.pastoral-land-card__action.is-plant {
  background: rgba(255, 245, 214, 0.96);
  color: #8a5f18;
}

.pastoral-land-card__busy-mask {
  position: absolute;
  inset: auto 0.7rem 0.9rem 0.7rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  min-height: 1.9rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  background: rgba(71, 56, 28, 0.16);
  color: rgba(255, 248, 229, 0.96);
  font-size: 0.64rem;
  font-weight: 900;
  backdrop-filter: blur(10px);
}

.pastoral-phase-pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0 0.55rem;
  border: 1px solid rgba(255, 248, 220, 0.62);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 0.63rem;
  font-weight: 900;
}

.phase-pill--harvest {
  background: rgba(255, 245, 196, 0.92);
  color: #8c590f;
}

.phase-pill--bloom {
  background: rgba(255, 237, 204, 0.92);
  color: #c56b12;
}

.phase-pill--leaf {
  background: rgba(225, 250, 214, 0.92);
  color: #2d823b;
}

.phase-pill--sprout {
  background: rgba(225, 243, 255, 0.94);
  color: #2d6ca0;
}

.phase-pill--dead {
  background: rgba(255, 225, 225, 0.94);
  color: #b14444;
}

.phase-pill--default {
  background: rgba(255, 255, 255, 0.18);
  color: inherit;
}

.pastoral-land-card__progress {
  position: relative;
  z-index: 1;
  height: 0.46rem;
  margin-top: auto;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.2);
}

.pastoral-land-card__progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.92);
}

.pastoral-land-card--ready .pastoral-land-card__progress span {
  background: linear-gradient(90deg, #fff6c2 0%, #ffe36b 40%, #ffba3a 100%);
  animation: pastoral-ready-shimmer 1.8s linear infinite;
}

.pastoral-land-card--soon .pastoral-land-card__progress span {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.92), rgba(255, 245, 188, 0.96));
}

.pastoral-side-stack {
  position: relative;
  display: grid;
  gap: 0.9rem;
  align-content: start;
}

.pastoral-side-stack.is-collapsed {
  gap: 0.75rem;
}

.pastoral-side-stack.is-resizing {
  z-index: 3;
}

.pastoral-side-resize-handle {
  position: absolute;
  top: 0.3rem;
  bottom: 0.3rem;
  left: -0.95rem;
  z-index: 4;
  width: 1.1rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}

.pastoral-side-resize-handle::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 1.25rem;
  bottom: 1.25rem;
  width: 2px;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(111, 148, 128, 0.18), rgba(111, 148, 128, 0.52), rgba(111, 148, 128, 0.18));
  transform: translateX(-50%);
  opacity: 0.55;
  transition: opacity var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-side-resize-handle__grip {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.58rem;
  height: 4rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 24px rgba(74, 110, 141, 0.18);
  transform: translate(-50%, -50%);
}

.pastoral-side-resize-handle__grip::before {
  content: '';
  position: absolute;
  inset: 0.72rem 0.16rem;
  border-radius: inherit;
  background:
    radial-gradient(circle, rgba(90, 119, 106, 0.58) 0 1px, transparent 1.4px) center top / 100% 0.55rem repeat-y;
}

.pastoral-side-resize-handle:hover::before,
.pastoral-side-resize-handle.is-active::before {
  opacity: 1;
  background: linear-gradient(180deg, rgba(111, 148, 128, 0.24), rgba(111, 148, 128, 0.82), rgba(111, 148, 128, 0.24));
}

.pastoral-side-resize-handle:hover .pastoral-side-resize-handle__grip,
.pastoral-side-resize-handle.is-active .pastoral-side-resize-handle__grip {
  background: rgba(255, 255, 255, 0.94);
}

.pastoral-side-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.1rem 0.1rem 0;
}

.pastoral-side-stack.is-collapsed .pastoral-side-toolbar {
  padding: 0;
}

.pastoral-side-toolbar__meta {
  min-width: 0;
  display: grid;
  gap: 0.22rem;
}

.pastoral-side-toolbar__eyebrow {
  color: color-mix(in srgb, var(--ui-brand-700) 72%, var(--ui-text-1) 28%);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pastoral-side-toolbar__desc {
  color: var(--ui-text-3);
  font-size: 0.74rem;
  line-height: 1.55;
}

.pastoral-side-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  flex-shrink: 0;
  min-height: 2.55rem;
  padding: 0 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.72);
  color: #4e655d;
  font-size: 0.75rem;
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(74, 110, 141, 0.12);
  backdrop-filter: blur(14px);
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast), background var(--ui-motion-fast);
}

.pastoral-side-toggle:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 14px 28px rgba(74, 110, 141, 0.14);
}

.pastoral-side-toggle.is-collapsed {
  width: 100%;
  min-height: 4.25rem;
  padding: 0.75rem 0.35rem;
  border-radius: 1.45rem;
  flex-direction: column;
  gap: 0.2rem;
}

.pastoral-side-rail {
  display: grid;
  gap: 0.7rem;
  padding: 0.7rem 0.55rem;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 1.7rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(239, 248, 255, 0.34)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76), 0 16px 36px rgba(61, 102, 134, 0.16);
  backdrop-filter: blur(18px);
}

.pastoral-side-rail__group,
.pastoral-side-rail__stats {
  display: grid;
  gap: 0.5rem;
}

.pastoral-side-rail__action {
  display: flex;
  min-height: 4.7rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.55rem 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 1.2rem;
  background:
    radial-gradient(circle at 50% 24%, rgba(180, 225, 182, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 239, 0.88));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 12px 24px rgba(89, 126, 76, 0.12);
  text-align: center;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast);
}

.pastoral-side-rail__action:hover {
  transform: translateY(-1px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 16px 28px rgba(89, 126, 76, 0.16);
}

.pastoral-side-rail__action img {
  width: 2.15rem;
  height: 2.15rem;
  object-fit: contain;
}

.pastoral-side-rail__action span {
  color: #6f3d20;
  font-size: 0.66rem;
  font-weight: 900;
  line-height: 1.2;
}

.pastoral-side-rail__stat {
  display: grid;
  min-height: 3.2rem;
  place-items: center;
  padding: 0.45rem 0.25rem;
  border-radius: 1rem;
  border: 1px solid rgba(214, 232, 255, 0.58);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(236, 245, 255, 0.28));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58), 0 6px 14px rgba(104, 149, 191, 0.08);
  text-align: center;
}

.pastoral-side-rail__stat.is-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, var(--ui-bg-surface-raised) 90%);
}

.pastoral-side-rail__stat.is-brand {
  background: color-mix(in srgb, var(--ui-brand-500) 9%, var(--ui-bg-surface-raised) 91%);
}

.pastoral-side-rail__stat.is-neutral {
  background: color-mix(in srgb, var(--ui-bg-surface) 90%, transparent);
}

.pastoral-side-rail__stat.is-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface-raised) 92%);
}

.pastoral-side-rail__stat strong {
  color: #2f4a3a;
  font-size: 0.98rem;
  font-weight: 900;
  line-height: 1;
}

.pastoral-side-rail__stat span {
  margin-top: 0.18rem;
  color: #6f7d75;
  font-size: 0.62rem;
  font-weight: 800;
}

.pastoral-side-card {
  padding: 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 1.5rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(239, 248, 255, 0.32)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.76), 0 16px 36px rgba(61, 102, 134, 0.16);
  backdrop-filter: blur(18px);
}

.pastoral-side-card__head h2 {
  margin: 0;
  color: var(--ui-text-1);
  font-size: 1.05rem;
}

.pastoral-side-card__head p {
  margin: 0.35rem 0 0;
  color: var(--ui-text-2);
  font-size: 0.82rem;
  line-height: 1.6;
}

.pastoral-quick-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.pastoral-quick-card {
  position: relative;
  overflow: hidden;
  min-height: 7.2rem;
  padding: 0.9rem 0.68rem 0.78rem;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at 50% 22%, rgba(180, 225, 182, 0.22), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 250, 239, 0.86));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 16px 30px rgba(89, 126, 76, 0.16);
  text-align: center;
  cursor: pointer;
  transition: transform var(--ui-motion-fast), box-shadow var(--ui-motion-fast);
}

.pastoral-quick-card:hover {
  transform: translateY(-2px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 20px 34px rgba(89, 126, 76, 0.2);
}

.pastoral-quick-card img {
  width: 3.75rem;
  height: 3.75rem;
  object-fit: contain;
  transition: transform var(--ui-motion-fast);
}

.pastoral-quick-card:hover img {
  transform: translateY(-2px) scale(1.03);
}

.pastoral-quick-card__label {
  margin-top: 0.45rem;
  color: #6f3d20;
  font-size: 0.95rem;
  font-weight: 900;
}

.pastoral-quick-card__hint {
  margin-top: 0.25rem;
  color: rgba(111, 61, 32, 0.72);
  font-size: 0.68rem;
  line-height: 1.45;
}

.pastoral-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.625rem;
  margin-top: 0.85rem;
}

.pastoral-summary-card {
  padding: 0.85rem 0.9rem;
  border-radius: 1.1rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(236, 245, 255, 0.24));
  border: 1px solid rgba(214, 232, 255, 0.58);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58), 0 6px 14px rgba(104, 149, 191, 0.08);
}

.pastoral-summary-card.is-warning {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, var(--ui-bg-surface-raised) 90%);
}

.pastoral-summary-card.is-brand {
  background: color-mix(in srgb, var(--ui-brand-500) 9%, var(--ui-bg-surface-raised) 91%);
}

.pastoral-summary-card.is-neutral {
  background: color-mix(in srgb, var(--ui-bg-surface) 90%, transparent);
}

.pastoral-summary-card.is-danger {
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface-raised) 92%);
}

.pastoral-summary-card.is-slate {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(236, 245, 255, 0.24));
}

.pastoral-summary-card__label {
  color: #6f7d75;
  font-size: 0.75rem;
  font-weight: 800;
}

.pastoral-summary-card__value {
  margin-top: 0.3rem;
  color: #2f4a3a;
  font-size: 1.35rem;
  font-weight: 900;
}

.pastoral-scope-note {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.85rem;
  padding: 0.85rem 0.95rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 70%, transparent);
  background: rgba(255, 255, 255, 0.64);
}

.pastoral-scope-note strong {
  font-size: 0.8rem;
}

.pastoral-scope-note span {
  color: var(--ui-text-2);
  font-size: 0.76rem;
  line-height: 1.6;
}

.pastoral-scope-note.is-include strong {
  color: color-mix(in srgb, var(--ui-status-success) 82%, var(--ui-text-1) 18%);
}

.pastoral-scope-note.is-defer strong {
  color: color-mix(in srgb, var(--ui-status-warning) 84%, var(--ui-text-1) 16%);
}

@keyframes pastoral-ready-pulse {
  0%,
  100% {
    opacity: 0.72;
    transform: scale(1.06);
  }
  50% {
    opacity: 1;
    transform: scale(1.14);
  }
}

@keyframes pastoral-ready-shimmer {
  0% {
    transform: translateX(-18%);
  }
  100% {
    transform: translateX(18%);
  }
}

@keyframes pastoral-sparkle-float {
  0%,
  100% {
    opacity: 0.6;
    transform: translateY(0) scale(0.92);
  }
  50% {
    opacity: 1;
    transform: translateY(-0.2rem) scale(1.08);
  }
}

@keyframes pastoral-sweep-flash {
  0% {
    opacity: 0.1;
    transform: translateX(-118%);
  }
  35% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(118%);
  }
}

@media (max-width: 1535px) {
  .pastoral-top-grid,
  .pastoral-main-grid {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
  }

  .pastoral-top-grid {
    overflow: visible;
  }

  .pastoral-account-column,
  .pastoral-resource-board {
    grid-template-rows: none;
    height: auto;
  }

  .pastoral-resources--account,
  .pastoral-resource-status-row,
  .pastoral-status-side-stack {
    height: auto;
    overflow: visible;
  }

  .pastoral-empty-board {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.96fr);
  }

  .pastoral-plant-seed-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .pastoral-land-target-banner__title-row {
    align-items: flex-start;
  }

  .pastoral-farm-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .pastoral-side-toggle.is-collapsed {
    width: auto;
    min-height: 2.7rem;
    padding: 0 0.95rem;
    border-radius: 9999px;
    flex-direction: row;
    gap: 0.35rem;
  }

  .pastoral-side-rail__group,
  .pastoral-side-rail__stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 959px) {
  .pastoral-intro__row {
    flex-direction: column;
  }

  .pastoral-reminder-strip,
  .pastoral-suggestion-panel__head {
    grid-template-columns: 1fr;
    flex-direction: column;
  }

  .pastoral-reminder-strip__actions {
    justify-content: flex-start;
  }

  .pastoral-suggestion-panel__hint {
    max-width: none;
    text-align: left;
  }

  .pastoral-empty-board {
    grid-template-columns: 1fr;
  }

  .pastoral-empty-board__quick-grid,
  .pastoral-empty-board__plots {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-plant-panel__head {
    flex-direction: column;
  }

  .pastoral-plant-seed-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-land-target-banner {
    padding: 0.95rem;
  }

  .pastoral-land-target-banner__title-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .pastoral-intro__actions {
    align-items: flex-start;
  }

  .pastoral-memory-note {
    text-align: left;
  }

  .pastoral-resources {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-resource-board {
    grid-template-columns: 1fr;
  }

  .pastoral-today-board__summary-row {
    grid-template-columns: 1fr;
  }

  .pastoral-resource-status-row {
    grid-template-columns: 1fr;
    height: auto;
  }

  .pastoral-status-side-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: none;
    height: auto;
  }

  .pastoral-notice-board {
    min-height: 14.8rem;
  }

  .pastoral-today-section.is-inline,
  .pastoral-today-section.is-compact {
    grid-template-columns: 1fr;
  }

  .pastoral-today-grid.is-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-today-grid.is-6 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pastoral-summary-grid,
  .pastoral-quick-grid {
    grid-template-columns: 1fr;
  }

  .pastoral-farm-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-account-card__meta {
    padding-left: 0;
  }

  .pastoral-side-rail__group,
  .pastoral-side-rail__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 639px) {
  .pastoral-stage__content {
    padding: 0.75rem;
  }

  .pastoral-reminder-strip,
  .pastoral-suggestion-panel {
    padding: 0.9rem;
  }

  .pastoral-reminder-strip__btn,
  .pastoral-suggestion-card__btn {
    width: 100%;
  }

  .pastoral-empty-state.is-stage-board {
    padding: 0.75rem;
  }

  .pastoral-empty-board__main,
  .pastoral-empty-board__aside {
    padding: 0.8rem;
  }

  .pastoral-empty-board__hero {
    grid-template-columns: 1fr;
  }

  .pastoral-empty-board__icon {
    width: 3.6rem;
    height: 3.6rem;
  }

  .pastoral-empty-board__stats,
  .pastoral-empty-board__quick-grid,
  .pastoral-empty-board__plots {
    grid-template-columns: 1fr;
  }

  .pastoral-plant-panel {
    padding: 0.95rem;
  }

  .pastoral-plant-panel__batch {
    flex-direction: column;
    align-items: stretch;
  }

  .pastoral-plant-panel__btn {
    width: 100%;
  }

  .pastoral-plant-panel__batch-btn {
    width: 100%;
  }

  .pastoral-plant-seed-grid {
    grid-template-columns: 1fr;
  }

  .pastoral-land-target-btn {
    width: 100%;
  }

  .pastoral-resources,
  .pastoral-summary-grid,
  .pastoral-quick-grid {
    grid-template-columns: 1fr;
  }

  .pastoral-resource-status-row {
    grid-template-columns: 1fr;
  }

  .pastoral-status-side-stack {
    grid-template-columns: 1fr;
    height: auto;
  }

  .pastoral-today-section__title {
    width: 100%;
    justify-content: center;
  }

  .pastoral-today-grid.is-4,
  .pastoral-today-grid.is-6 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pastoral-account-card__main {
    grid-template-columns: 1fr;
  }

  .pastoral-account-card__avatar {
    margin-inline: auto;
  }

  .pastoral-account-card__nameplate {
    border-radius: 1.35rem;
  }

  .pastoral-farm-grid {
    grid-template-columns: 1fr;
  }

  .pastoral-land-card__actions {
    grid-template-columns: 1fr;
  }

  .pastoral-side-rail__group,
  .pastoral-side-rail__stats {
    grid-template-columns: 1fr;
  }
}
</style>

