<script setup lang="ts">
import type { MetaBadgeTone } from '@/utils/ui-badge'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandCard from '@/components/LandCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const toast = useToastStore()
const { lands, summary, loading } = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

const operating = ref(false)
const currentOperatingType = ref('')
const confirmVisible = ref(false)
const activeLandFilter = ref<'all' | 'ready' | 'care' | 'water' | 'weed' | 'bug' | 'soon' | 'growing' | 'idle'>('all')
const activeSortMode = ref<'smart' | 'index'>('smart')
const activeDensity = ref<'comfortable' | 'compact'>('comfortable')
const advancedControlsOpen = ref(false)
const batchSelectionMode = ref(false)
const selectedLandIds = ref<number[]>([])
const batchOperating = ref(false)
const batchResult = ref<null | { opType: string, successCount: number, skippedCount: number, timestamp: number }>(null)
const activeBatchGroup = ref<'' | 'harvest' | 'water' | 'weed' | 'bug'>('')
const recentBatchTouchedIds = ref<number[]>([])
const batchHighlightTimer = ref<number | null>(null)
const batchSelectionPulse = ref(false)
const batchSelectionPulseTimer = ref<number | null>(null)
const batchResultVisible = ref(false)
const batchResultTimer = ref<number | null>(null)
const LAND_FILTER_STORAGE_KEY = 'farm-panel-active-land-filter'
const LAND_SORT_STORAGE_KEY = 'farm-panel-active-sort-mode'
const LAND_DENSITY_STORAGE_KEY = 'farm-panel-active-density'
const confirmConfig = ref({
  title: '',
  message: '',
  opType: '',
})

async function executeOperate() {
  if (!currentAccountId.value || !confirmConfig.value.opType)
    return
  confirmVisible.value = false
  operating.value = true
  currentOperatingType.value = confirmConfig.value.opType
  try {
    await farmStore.operate(currentAccountId.value, confirmConfig.value.opType)
  }
  finally {
    operating.value = false
    currentOperatingType.value = ''
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return

  const confirmMap: Record<string, string> = {
    harvest: '确定要收获所有成熟作物吗？',
    clear: '确定要一键除草/除虫吗？',
    plant: '确定要一键种植吗？(根据策略配置)',
    upgrade: '确定要升级所有可升级的土地吗？(消耗金币)',
    all: '确定要一键全收吗？(包含收获、除草、种植等)',
  }

  confirmConfig.value = {
    title: '确认操作',
    message: confirmMap[opType] || '确定执行此操作吗？',
    opType,
  }
  confirmVisible.value = true
}

const operations = [
  { type: 'harvest', label: '收获', icon: 'i-carbon-wheat', color: 'farm-op-harvest' },
  { type: 'clear', label: '除草/虫', icon: 'i-carbon-clean', color: 'farm-op-clear' },
  { type: 'plant', label: '种植', icon: 'i-carbon-sprout', color: 'farm-op-plant' },
  { type: 'upgrade', label: '升级土地', icon: 'i-carbon-upgrade', color: 'farm-op-upgrade' },
  { type: 'all', label: '一键全收', icon: 'i-carbon-flash', color: 'farm-op-all' },
]

const farmConnectionState = computed(() => {
  if (!currentAccountId.value) {
    return {
      label: '未选择账号',
      badgeTone: 'neutral' as MetaBadgeTone,
      note: '先选择账号，再查看土地和一键操作。',
    }
  }

  if (loading.value || statusLoading.value) {
    return {
      label: '同步中',
      badgeTone: 'info' as MetaBadgeTone,
      note: '正在刷新连接状态和土地数据。',
    }
  }

  if (!status.value?.connection?.connected) {
    return {
      label: '账号离线',
      badgeTone: 'warning' as MetaBadgeTone,
      note: '请先运行账号或检查网络连接。',
    }
  }

  return {
    label: realtimeConnected.value ? '实时在线' : '在线快照',
    badgeTone: 'success' as MetaBadgeTone,
    note: `当前已载入 ${lands.value?.length || 0} 块土地，可直接查看成熟与空闲分布。`,
  }
})

const farmSummaryCards = computed(() => [
  { key: 'harvestable', icon: 'i-carbon-clean', label: '可收', value: summary.value?.harvestable || 0, tone: 'warning' as MetaBadgeTone, filter: 'ready' as const },
  { key: 'growing', icon: 'i-carbon-sprout', label: '生长', value: summary.value?.growing || 0, tone: 'brand' as MetaBadgeTone, filter: 'growing' as const },
  { key: 'empty', icon: 'i-carbon-checkbox', label: '空闲', value: summary.value?.empty || 0, tone: 'neutral' as MetaBadgeTone, filter: 'idle' as const },
  { key: 'dead', icon: 'i-carbon-warning', label: '枯萎', value: summary.value?.dead || 0, tone: 'danger' as MetaBadgeTone, filter: 'idle' as const },
])

const farmIssueQuickChips = computed(() => {
  const landList = Array.isArray(lands.value) ? lands.value : []
  let waterCount = 0
  let weedCount = 0
  let bugCount = 0
  let soonCount = 0

  for (const land of landList) {
    if (land?.needWater)
      waterCount++
    if (land?.needWeed)
      weedCount++
    if (land?.needBug)
      bugCount++
    if (matchesLandFilter(land, 'soon'))
      soonCount++
  }

  return [
    { key: 'water', label: '待浇水', icon: 'i-carbon-watson-health-stack-moving', count: waterCount, toneClass: 'is-water', filter: 'water' as const },
    { key: 'weed', label: '待除草', icon: 'i-carbon-tools', count: weedCount, toneClass: 'is-weed', filter: 'weed' as const },
    { key: 'bug', label: '待除虫', icon: 'i-carbon-bug', count: bugCount, toneClass: 'is-bug', filter: 'bug' as const },
    { key: 'soon', label: '快成熟', icon: 'i-carbon-timer', count: soonCount, toneClass: 'is-soon', filter: 'soon' as const },
  ]
})

const urgentLandSummary = computed(() => {
  const landList = Array.isArray(lands.value) ? lands.value : []
  let readyCount = 0
  let careCount = 0
  let soonCount = 0

  for (const land of landList) {
    const status = String(land?.status || '')
    const matureInSec = Number(land?.matureInSec || 0)
    const phaseRemaining = Number(land?.currentPhaseRemainingSec || 0)
    if (status === 'harvestable' || status === 'stealable')
      readyCount++
    if (land?.needWater || land?.needWeed || land?.needBug)
      careCount++
    if ((matureInSec > 0 && matureInSec <= 15 * 60) || (phaseRemaining > 0 && phaseRemaining <= 5 * 60))
      soonCount++
  }

  return {
    readyCount,
    careCount,
    soonCount,
    totalUrgent: readyCount + careCount + soonCount,
  }
})

const landPriorityNote = computed(() => {
  if (activeSortMode.value === 'index')
    return '当前按地块编号顺序展示，方便与实际地块位置对照。'
  const { readyCount, careCount, soonCount, totalUrgent } = urgentLandSummary.value
  if (totalUrgent <= 0)
    return '当前地块已按地块编号稳定展示。'

  const parts: string[] = []
  if (readyCount > 0)
    parts.push(`${readyCount} 块可立即处理`)
  if (careCount > 0)
    parts.push(`${careCount} 块待照料`)
  if (soonCount > 0)
    parts.push(`${soonCount} 块即将切阶段或成熟`)
  return `已优先置顶 ${parts.join('，')} 的土地。`
})

const sortedLands = computed(() => {
  const landList = Array.isArray(lands.value) ? [...lands.value] : []

  if (activeSortMode.value === 'index')
    return landList.sort((a: any, b: any) => Number(a?.id || 0) - Number(b?.id || 0))

  return landList.sort((a: any, b: any) => {
    const scoreA = getLandUrgencyScore(a)
    const scoreB = getLandUrgencyScore(b)
    if (scoreA !== scoreB)
      return scoreB - scoreA

    const matureA = Number(a?.matureInSec || 0)
    const matureB = Number(b?.matureInSec || 0)
    const matureRankA = matureA > 0 ? matureA : Number.MAX_SAFE_INTEGER
    const matureRankB = matureB > 0 ? matureB : Number.MAX_SAFE_INTEGER
    if (matureRankA !== matureRankB)
      return matureRankA - matureRankB

    return Number(a?.id || 0) - Number(b?.id || 0)
  })
})

const landFilterOptions = computed(() => {
  const landList = Array.isArray(lands.value) ? lands.value : []
  const counts = {
    all: landList.length,
    ready: 0,
    care: 0,
    water: 0,
    weed: 0,
    bug: 0,
    soon: 0,
    growing: 0,
    idle: 0,
  }

  for (const land of landList) {
    if (matchesLandFilter(land, 'ready'))
      counts.ready++
    if (matchesLandFilter(land, 'care'))
      counts.care++
    if (matchesLandFilter(land, 'water'))
      counts.water++
    if (matchesLandFilter(land, 'weed'))
      counts.weed++
    if (matchesLandFilter(land, 'bug'))
      counts.bug++
    if (matchesLandFilter(land, 'soon'))
      counts.soon++
    if (matchesLandFilter(land, 'growing'))
      counts.growing++
    if (matchesLandFilter(land, 'idle'))
      counts.idle++
  }

  return [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'ready', label: '可处理', count: counts.ready },
    { key: 'care', label: '待照料', count: counts.care },
    { key: 'water', label: '待浇水', count: counts.water },
    { key: 'weed', label: '待除草', count: counts.weed },
    { key: 'bug', label: '待除虫', count: counts.bug },
    { key: 'soon', label: '快成熟', count: counts.soon },
    { key: 'growing', label: '生长中', count: counts.growing },
    { key: 'idle', label: '空闲/枯萎', count: counts.idle },
  ] as const
})

const visibleLands = computed(() =>
  sortedLands.value.filter(land => matchesLandFilter(land, activeLandFilter.value)),
)
const isUsingAdvancedControls = computed(() =>
  activeSortMode.value !== 'smart'
  || activeDensity.value !== 'comfortable'
  || ['care', 'water', 'weed', 'bug', 'soon', 'growing', 'idle'].includes(activeLandFilter.value),
)
const advancedToggleLabel = computed(() =>
  advancedControlsOpen.value ? '收起高级选项' : '展开高级选项',
)
const hasCustomViewState = computed(() =>
  activeLandFilter.value !== 'all'
  || activeSortMode.value !== 'smart'
  || activeDensity.value !== 'comfortable',
)

const activeOperationMeta = computed(() => operations.find(op => op.type === currentOperatingType.value) ?? null)
const selectedLands = computed(() => visibleLands.value.filter(land => selectedLandIds.value.includes(Number(land?.id || 0))))
const batchEligibleCounts = computed(() => {
  const visible = visibleLands.value
  return {
    harvest: visible.filter((land: any) => land?.status === 'harvestable').length,
    water: visible.filter((land: any) => !!land?.needWater).length,
    weed: visible.filter((land: any) => !!land?.needWeed).length,
    bug: visible.filter((land: any) => !!land?.needBug).length,
  }
})
const batchQuickGroups = computed(() => [
  { key: 'harvest', label: '可收获', description: '选中当前筛选内已成熟、可直接收获的土地', count: batchEligibleCounts.value.harvest, toneClass: 'is-harvest' },
  { key: 'water', label: '待浇水', description: '选中当前筛选内需要补水的土地', count: batchEligibleCounts.value.water, toneClass: 'is-water' },
  { key: 'weed', label: '待除草', description: '选中当前筛选内需要除草的土地', count: batchEligibleCounts.value.weed, toneClass: 'is-weed' },
  { key: 'bug', label: '待除虫', description: '选中当前筛选内需要除虫的土地', count: batchEligibleCounts.value.bug, toneClass: 'is-bug' },
].filter(item => item.count > 0))
const batchSelectionSummary = computed(() => {
  if (!batchSelectionMode.value)
    return ''
  if (selectedLandIds.value.length === 0)
    return '点击土地卡片即可加入批量处理，默认只会处理当前筛选范围。'
  const parts: string[] = []
  if (batchEligibleCounts.value.harvest > 0)
    parts.push(`可收 ${batchEligibleCounts.value.harvest}`)
  if (batchEligibleCounts.value.water > 0)
    parts.push(`待浇水 ${batchEligibleCounts.value.water}`)
  if (batchEligibleCounts.value.weed > 0)
    parts.push(`待除草 ${batchEligibleCounts.value.weed}`)
  if (batchEligibleCounts.value.bug > 0)
    parts.push(`待除虫 ${batchEligibleCounts.value.bug}`)
  return parts.length > 0
    ? `当前筛选中 ${parts.join('，')}，已选 ${selectedLandIds.value.length} 块。`
    : `当前筛选范围内暂无可批量处理土地，已选 ${selectedLandIds.value.length} 块。`
})
const batchCoverageSummary = computed(() => {
  if (!batchSelectionMode.value)
    return ''
  const totalVisible = visibleLands.value.length
  const actionableVisible = batchEligibleCounts.value.harvest
    + batchEligibleCounts.value.water
    + batchEligibleCounts.value.weed
    + batchEligibleCounts.value.bug
  if (totalVisible <= 0)
    return ''
  const coverage = actionableVisible > 0
    ? Math.min(100, Math.round((selectedLandIds.value.length / actionableVisible) * 100))
    : 0
  if (actionableVisible <= 0)
    return `当前筛选共有 ${totalVisible} 块土地，暂时没有需要批量处理的地块。`
  return `当前筛选 ${totalVisible} 块中约有 ${actionableVisible} 个待处理事项，已选 ${selectedLandIds.value.length} 块，覆盖约 ${coverage}% 的可处理范围。`
})
const batchActions = computed(() => {
  const selected = selectedLands.value
  if (selected.length === 0)
    return []
  return [
    { key: 'harvest', label: '批量收获', opType: 'harvest', count: selected.filter(land => land?.status === 'harvestable').length, available: selected.some(land => land?.status === 'harvestable') },
    { key: 'water', label: '批量浇水', opType: 'water', count: selected.filter(land => land?.needWater).length, available: selected.some(land => land?.needWater) },
    { key: 'weed', label: '批量除草', opType: 'weed', count: selected.filter(land => land?.needWeed).length, available: selected.some(land => land?.needWeed) },
    { key: 'bug', label: '批量除虫', opType: 'bug', count: selected.filter(land => land?.needBug).length, available: selected.some(land => land?.needBug) },
  ].filter(item => item.available)
})
const batchResultLabelMap: Record<string, string> = {
  harvest: '收获',
  water: '浇水',
  weed: '除草',
  bug: '除虫',
}
const batchResultSummary = computed(() => {
  if (!batchResult.value || !batchResultVisible.value)
    return ''
  const label = batchResultLabelMap[batchResult.value.opType] || '处理'
  if (batchResult.value.skippedCount > 0)
    return `刚刚已完成 ${batchResult.value.successCount} 块土地的批量${label}，另有 ${batchResult.value.skippedCount} 块无需处理。`
  return `刚刚已完成 ${batchResult.value.successCount} 块土地的批量${label}。`
})

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (acc.running && status.value?.connection?.connected) {
      farmStore.fetchLands(currentAccountId.value)
    }
  }
}

watch(currentAccountId, () => {
  batchSelectionMode.value = false
  selectedLandIds.value = []
  batchResult.value = null
  batchResultVisible.value = false
  activeBatchGroup.value = ''
  recentBatchTouchedIds.value = []
  refresh()
})

watch(activeLandFilter, (value) => {
  persistActiveLandFilter(value)
})

watch(activeSortMode, (value) => {
  persistActiveSortMode(value)
})

watch(activeDensity, (value) => {
  persistActiveDensity(value)
})

watch(isUsingAdvancedControls, (value) => {
  if (value)
    advancedControlsOpen.value = true
}, { immediate: true })

watch(visibleLands, (lands) => {
  const visibleIds = new Set((lands || []).map((land: any) => Number(land?.id || 0)).filter(Boolean))
  selectedLandIds.value = selectedLandIds.value.filter(id => visibleIds.has(id))
}, { deep: true })

watch(selectedLandIds, (current, previous) => {
  if (!batchSelectionMode.value)
    return
  if ((current?.length || 0) === (previous?.length || 0))
    return
  batchSelectionPulse.value = false
  if (batchSelectionPulseTimer.value !== null)
    window.clearTimeout(batchSelectionPulseTimer.value)
  window.setTimeout(() => {
    batchSelectionPulse.value = true
  }, 0)
  batchSelectionPulseTimer.value = window.setTimeout(() => {
    batchSelectionPulse.value = false
    batchSelectionPulseTimer.value = null
  }, 520)
}, { deep: true })

const { pause, resume } = useIntervalFn(() => {
  if (lands.value) {
    lands.value = lands.value.map((l: any) =>
      l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
    )
  }
}, 1000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(refresh, 60000)

onMounted(() => {
  loadActiveLandFilter()
  loadActiveSortMode()
  loadActiveDensity()
  refresh()
  resume()
  resumeRefresh()
})

onUnmounted(() => {
  pause()
  pauseRefresh()
  if (batchHighlightTimer.value !== null)
    window.clearTimeout(batchHighlightTimer.value)
  if (batchSelectionPulseTimer.value !== null)
    window.clearTimeout(batchSelectionPulseTimer.value)
  if (batchResultTimer.value !== null)
    window.clearTimeout(batchResultTimer.value)
})

function getLandUrgencyScore(land: any) {
  const status = String(land?.status || '')
  const matureInSec = Number(land?.matureInSec || 0)
  const phaseRemaining = Number(land?.currentPhaseRemainingSec || 0)
  let score = 0

  if (status === 'harvestable')
    score += 200
  else if (status === 'stealable')
    score += 180

  if (land?.needBug)
    score += 80
  if (land?.needWeed)
    score += 70
  if (land?.needWater)
    score += 60

  if (matureInSec > 0 && matureInSec <= 15 * 60)
    score += 45
  else if (matureInSec > 0 && matureInSec <= 60 * 60)
    score += 20

  if (phaseRemaining > 0 && phaseRemaining <= 5 * 60)
    score += 28

  if (status === 'dead')
    score += 24
  if (status === 'empty')
    score += 8

  return score
}

function matchesLandFilter(land: any, filter: 'all' | 'ready' | 'care' | 'water' | 'weed' | 'bug' | 'soon' | 'growing' | 'idle') {
  if (filter === 'all')
    return true

  const status = String(land?.status || '')
  const matureInSec = Number(land?.matureInSec || 0)
  const phaseRemaining = Number(land?.currentPhaseRemainingSec || 0)
  const isReady = status === 'harvestable' || status === 'stealable'
  const needsCare = !!(land?.needWater || land?.needWeed || land?.needBug)
  const isSoon = (matureInSec > 0 && matureInSec <= 15 * 60) || (phaseRemaining > 0 && phaseRemaining <= 5 * 60)
  const isGrowing = status === 'growing' || status === 'harvestable' || status === 'stealable' || status === 'harvested'
  const isIdle = status === 'empty' || status === 'dead' || status === 'locked'

  if (filter === 'ready')
    return isReady
  if (filter === 'care')
    return needsCare
  if (filter === 'water')
    return !!land?.needWater
  if (filter === 'weed')
    return !!land?.needWeed
  if (filter === 'bug')
    return !!land?.needBug
  if (filter === 'soon')
    return isSoon
  if (filter === 'growing')
    return isGrowing
  if (filter === 'idle')
    return isIdle
  return true
}

function loadActiveLandFilter() {
  if (typeof window === 'undefined')
    return
  try {
    const saved = String(window.localStorage.getItem(LAND_FILTER_STORAGE_KEY) || '').trim() as typeof activeLandFilter.value
    if (saved && ['all', 'ready', 'care', 'water', 'weed', 'bug', 'soon', 'growing', 'idle'].includes(saved))
      activeLandFilter.value = saved
  }
  catch {
    activeLandFilter.value = 'all'
  }
}

function persistActiveLandFilter(value: typeof activeLandFilter.value) {
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(LAND_FILTER_STORAGE_KEY, value)
  }
  catch {
    // Ignore local persistence failures and keep the in-memory selection.
  }
}

function loadActiveSortMode() {
  if (typeof window === 'undefined')
    return
  try {
    const saved = String(window.localStorage.getItem(LAND_SORT_STORAGE_KEY) || '').trim() as typeof activeSortMode.value
    if (saved && ['smart', 'index'].includes(saved))
      activeSortMode.value = saved
  }
  catch {
    activeSortMode.value = 'smart'
  }
}

function persistActiveSortMode(value: typeof activeSortMode.value) {
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(LAND_SORT_STORAGE_KEY, value)
  }
  catch {
    // Ignore local persistence failures and keep the in-memory selection.
  }
}

function loadActiveDensity() {
  if (typeof window === 'undefined')
    return
  try {
    const saved = String(window.localStorage.getItem(LAND_DENSITY_STORAGE_KEY) || '').trim() as typeof activeDensity.value
    if (saved && ['comfortable', 'compact'].includes(saved))
      activeDensity.value = saved
  }
  catch {
    activeDensity.value = 'comfortable'
  }
}

function persistActiveDensity(value: typeof activeDensity.value) {
  if (typeof window === 'undefined')
    return
  try {
    window.localStorage.setItem(LAND_DENSITY_STORAGE_KEY, value)
  }
  catch {
    // Ignore local persistence failures and keep the in-memory selection.
  }
}

function handleSummaryCardClick(filter: typeof activeLandFilter.value) {
  activeLandFilter.value = activeLandFilter.value === filter ? 'all' : filter
}

function resetAdvancedControls() {
  activeLandFilter.value = 'all'
  activeSortMode.value = 'smart'
  activeDensity.value = 'comfortable'
  advancedControlsOpen.value = false
}

function toggleBatchSelectionMode() {
  batchSelectionMode.value = !batchSelectionMode.value
  if (!batchSelectionMode.value) {
    selectedLandIds.value = []
    batchResult.value = null
    activeBatchGroup.value = ''
  }
}

function toggleLandSelection(landId: number) {
  if (!batchSelectionMode.value)
    return
  activeBatchGroup.value = ''
  selectedLandIds.value = selectedLandIds.value.includes(landId)
    ? selectedLandIds.value.filter(id => id !== landId)
    : [...selectedLandIds.value, landId]
}

function selectAllVisibleLands() {
  activeBatchGroup.value = ''
  selectedLandIds.value = visibleLands.value.map((land: any) => Number(land?.id || 0)).filter(Boolean)
}

function selectActionableVisibleLands() {
  activeBatchGroup.value = ''
  selectedLandIds.value = visibleLands.value
    .filter((land: any) => land?.status === 'harvestable' || land?.needWater || land?.needWeed || land?.needBug)
    .map((land: any) => Number(land?.id || 0))
    .filter(Boolean)
}

function selectBatchGroup(groupKey: 'harvest' | 'water' | 'weed' | 'bug') {
  if (activeBatchGroup.value === groupKey) {
    activeBatchGroup.value = ''
    selectedLandIds.value = []
    return
  }
  activeBatchGroup.value = groupKey
  selectedLandIds.value = visibleLands.value
    .filter((land: any) => {
      if (groupKey === 'harvest')
        return land?.status === 'harvestable'
      if (groupKey === 'water')
        return !!land?.needWater
      if (groupKey === 'weed')
        return !!land?.needWeed
      if (groupKey === 'bug')
        return !!land?.needBug
      return false
    })
    .map((land: any) => Number(land?.id || 0))
    .filter(Boolean)
}

function clearSelectedLands() {
  activeBatchGroup.value = ''
  selectedLandIds.value = []
}

function flashBatchTouchedLands(landIds: number[]) {
  recentBatchTouchedIds.value = Array.from(new Set((landIds || []).map(id => Number(id || 0)).filter(Boolean)))
  if (batchHighlightTimer.value !== null)
    window.clearTimeout(batchHighlightTimer.value)
  if (recentBatchTouchedIds.value.length === 0)
    return
  batchHighlightTimer.value = window.setTimeout(() => {
    recentBatchTouchedIds.value = []
    batchHighlightTimer.value = null
  }, 2600)
}

function showBatchResult(result: { opType: string, successCount: number, skippedCount: number, timestamp: number }) {
  batchResult.value = result
  batchResultVisible.value = true
  if (batchResultTimer.value !== null)
    window.clearTimeout(batchResultTimer.value)
  batchResultTimer.value = window.setTimeout(() => {
    batchResultVisible.value = false
    batchResultTimer.value = null
  }, 4200)
}

async function runBatchAction(opType: string) {
  if (!currentAccountId.value || selectedLandIds.value.length === 0 || batchOperating.value)
    return
  batchOperating.value = true
  try {
    const selected = selectedLands.value
    const eligibleIds = selected
      .filter((land: any) => {
        if (opType === 'harvest')
          return land?.status === 'harvestable'
        if (opType === 'water')
          return !!land?.needWater
        if (opType === 'weed')
          return !!land?.needWeed
        if (opType === 'bug')
          return !!land?.needBug
        return false
      })
      .map((land: any) => Number(land?.id || 0))
      .filter(Boolean)

    if (eligibleIds.length === 0) {
      showBatchResult({
        opType,
        successCount: 0,
        skippedCount: selected.length,
        timestamp: Date.now(),
      })
      toast.warning('当前选中的土地没有可执行的批量操作')
      return
    }

    await farmStore.operateLands(currentAccountId.value, eligibleIds, opType)
    flashBatchTouchedLands(eligibleIds)
    showBatchResult({
      opType,
      successCount: eligibleIds.length,
      skippedCount: Math.max(0, selected.length - eligibleIds.length),
      timestamp: Date.now(),
    })
    toast.success(`已完成 ${eligibleIds.length} 块土地的批量处理`)
    selectedLandIds.value = selectedLandIds.value.filter(id => !eligibleIds.includes(id))
    if (selectedLandIds.value.length === 0) {
      activeBatchGroup.value = ''
      batchSelectionMode.value = false
    }
  }
  catch (error: any) {
    toast.error(error?.response?.data?.error || error?.message || '批量处理失败，请稍后重试')
  }
  finally {
    batchOperating.value = false
  }
}
</script>

<template>
  <div class="farm-panel space-y-4">
    <div class="farm-panel-shell glass-panel rounded-lg shadow-sm">
      <div class="farm-panel-toolbar ui-mobile-sticky-panel">
        <div class="farm-panel-toolbar__head">
          <div class="farm-panel-toolbar__copy">
            <h3 class="glass-text-main flex items-center gap-2 text-lg font-bold">
              <div class="i-carbon-grid text-xl" />
              土地详情
            </h3>
            <p class="farm-panel-toolbar__desc">
              {{ farmConnectionState.note }}
            </p>
          </div>
          <BaseBadge surface="meta" :tone="farmConnectionState.badgeTone" class="farm-panel-state-badge">
            {{ farmConnectionState.label }}
          </BaseBadge>
        </div>

        <div class="farm-panel-control-groups">
          <div class="farm-panel-control-card">
            <div class="farm-panel-control-card__label">
              土地概览
            </div>
            <div class="farm-panel-summary ui-bulk-actions">
              <BaseBadge
                v-for="item in farmSummaryCards"
                :key="item.key"
                as="button"
                surface="meta"
                :tone="item.tone"
                class="farm-summary-pill"
                :class="{ 'is-active': activeLandFilter === item.filter }"
                :title="activeLandFilter === item.filter ? `点击切回全部土地` : `点击筛选${item.label}土地`"
                @click="handleSummaryCardClick(item.filter)"
              >
                <div :class="item.icon" />
                <span class="font-medium">{{ item.label }}: {{ item.value }}</span>
              </BaseBadge>
            </div>
          </div>

          <div class="farm-panel-control-card">
            <div class="farm-panel-control-card__label">
              快捷问题筛选
            </div>
            <div class="farm-panel-issue-quick">
              <button
                v-for="item in farmIssueQuickChips"
                :key="item.key"
                type="button"
                class="farm-panel-issue-chip"
                :class="[item.toneClass, { 'is-active': activeLandFilter === item.filter }]"
                @click="handleSummaryCardClick(item.filter)"
              >
                <span :class="item.icon" />
                <span>{{ item.label }}</span>
                <span class="farm-panel-issue-chip__count">{{ item.count }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="farm-panel-actions ui-bulk-actions">
          <BaseButton
            v-for="op in operations"
            :key="op.type"
            variant="primary"
            class="farm-panel-op-button"
            :class="op.color"
            :disabled="operating"
            :loading="operating && currentOperatingType === op.type"
            :loading-label="`${op.label}中`"
            :icon-class="op.icon"
            @click="handleOperate(op.type)"
          >
            {{ op.label }}
          </BaseButton>
        </div>

        <div v-if="operating && activeOperationMeta" class="farm-panel-operating-note">
          正在执行 {{ activeOperationMeta.label }}，请稍候...
        </div>
        <div v-else class="farm-panel-priority-note">
          {{ landPriorityNote }}
        </div>

        <div class="farm-panel-advanced-toggle-row">
          <button
            type="button"
            class="farm-panel-advanced-toggle"
            :class="{ 'is-active': advancedControlsOpen }"
            @click="advancedControlsOpen = !advancedControlsOpen"
          >
            <span class="farm-panel-advanced-toggle__copy">
              <span class="farm-panel-advanced-toggle__title">高级选项</span>
              <span class="farm-panel-advanced-toggle__desc">
                {{ isUsingAdvancedControls ? '当前已启用高级筛选或个性化视图' : '展开后可调整排序、密度和精细筛选' }}
              </span>
            </span>
            <span
              class="farm-panel-advanced-toggle__icon i-carbon-chevron-down"
              :class="{ 'is-open': advancedControlsOpen }"
              :title="advancedToggleLabel"
            />
          </button>
        </div>

        <div v-if="advancedControlsOpen" class="farm-panel-advanced-section">
          <div class="farm-panel-advanced-actions">
            <button
              type="button"
              class="farm-panel-reset-btn"
              :disabled="!hasCustomViewState"
              @click="resetAdvancedControls"
            >
              恢复默认
            </button>
          </div>

          <div class="farm-panel-preference-grid">
            <div class="farm-panel-control-card farm-panel-control-card--inline">
              <div class="farm-panel-sort-row">
                <div class="farm-panel-sort-label">
                  排序方式
                </div>
                <div class="farm-panel-sort-switch">
                  <button
                    type="button"
                    class="farm-panel-sort-chip"
                    :class="{ 'is-active': activeSortMode === 'smart' }"
                    @click="activeSortMode = 'smart'"
                  >
                    智能优先
                  </button>
                  <button
                    type="button"
                    class="farm-panel-sort-chip"
                    :class="{ 'is-active': activeSortMode === 'index' }"
                    @click="activeSortMode = 'index'"
                  >
                    地块编号
                  </button>
                </div>
              </div>
            </div>

            <div class="farm-panel-control-card farm-panel-control-card--inline">
              <div class="farm-panel-sort-row">
                <div class="farm-panel-sort-label">
                  卡片密度
                </div>
                <div class="farm-panel-sort-switch">
                  <button
                    type="button"
                    class="farm-panel-sort-chip"
                    :class="{ 'is-active': activeDensity === 'comfortable' }"
                    @click="activeDensity = 'comfortable'"
                  >
                    舒适
                  </button>
                  <button
                    type="button"
                    class="farm-panel-sort-chip"
                    :class="{ 'is-active': activeDensity === 'compact' }"
                    @click="activeDensity = 'compact'"
                  >
                    紧凑
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="farm-panel-control-card">
            <div class="farm-panel-control-card__label">
              精细筛选
            </div>
            <div class="farm-panel-filters">
              <button
                v-for="filter in landFilterOptions"
                :key="filter.key"
                type="button"
                class="farm-panel-filter-chip"
                :class="{ 'is-active': activeLandFilter === filter.key }"
                @click="activeLandFilter = filter.key"
              >
                <span>{{ filter.label }}</span>
                <span class="farm-panel-filter-chip__count">{{ filter.count }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="farm-panel-batch-toolbar">
          <div class="farm-panel-batch-toolbar__main" :class="{ 'is-pulsing': batchSelectionPulse }">
            <BaseButton
              variant="secondary"
              class="farm-panel-batch-toggle"
              :disabled="batchOperating"
              :icon-class="batchSelectionMode ? 'i-carbon-close' : 'i-carbon-checkbox'"
              @click="toggleBatchSelectionMode"
            >
              {{ batchSelectionMode ? '退出批量模式' : '进入批量模式' }}
            </BaseButton>
            <div v-if="batchSelectionMode" class="farm-panel-batch-meta" :class="{ 'is-pulsing': batchSelectionPulse }">
              已选 {{ selectedLandIds.length }} 块
            </div>
          </div>

          <div v-if="batchSelectionMode" class="farm-panel-batch-note">
            {{ batchSelectionSummary }}
          </div>

          <div v-if="batchCoverageSummary" class="farm-panel-batch-coverage">
            <div class="farm-panel-batch-coverage__icon i-carbon-chart-relationship" />
            <div class="farm-panel-batch-coverage__copy">
              {{ batchCoverageSummary }}
            </div>
          </div>

          <div v-if="batchSelectionMode && selectedLandIds.length === 0" class="farm-panel-batch-empty-guide">
            <div class="farm-panel-batch-empty-guide__icon i-carbon-touch-1" />
            <div class="farm-panel-batch-empty-guide__copy">
              <div class="farm-panel-batch-empty-guide__title">
                还没有选中土地
              </div>
              <div class="farm-panel-batch-empty-guide__desc">
                可以先点上方分组快速选区，或直接点击下方土地卡片；如果想省事，也可以点“智能全选可处理”。
              </div>
            </div>
          </div>

          <div v-if="batchSelectionMode && batchQuickGroups.length > 0" class="farm-panel-batch-groups">
            <button
              v-for="group in batchQuickGroups"
              :key="group.key"
              type="button"
              class="farm-panel-batch-group"
              :class="[group.toneClass, { 'is-active': activeBatchGroup === group.key }]"
              :title="group.description"
              :disabled="batchOperating"
              @click="selectBatchGroup(group.key as 'harvest' | 'water' | 'weed' | 'bug')"
            >
              <span class="farm-panel-batch-group__content">
                <span class="farm-panel-batch-group__label">{{ group.label }}</span>
                <span class="farm-panel-batch-group__desc">{{ group.description }}</span>
              </span>
              <span class="farm-panel-batch-group__count">{{ group.count }}</span>
            </button>
          </div>

          <div v-if="batchSelectionMode" class="farm-panel-batch-toolbar__actions">
            <BaseButton variant="ghost" class="farm-panel-batch-mini" :disabled="batchOperating || visibleLands.length === 0" @click="selectAllVisibleLands">
              全选当前筛选
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="farm-panel-batch-mini"
              :disabled="batchOperating || (batchEligibleCounts.harvest + batchEligibleCounts.water + batchEligibleCounts.weed + batchEligibleCounts.bug) === 0"
              @click="selectActionableVisibleLands"
            >
              智能全选可处理
            </BaseButton>
            <BaseButton variant="ghost" class="farm-panel-batch-mini" :disabled="batchOperating || selectedLandIds.length === 0" @click="clearSelectedLands">
              清空
            </BaseButton>
            <BaseButton
              v-for="action in batchActions"
              :key="action.key"
              variant="primary"
              class="farm-panel-batch-mini"
              :disabled="batchOperating"
              @click="runBatchAction(action.opType)"
            >
              {{ batchOperating ? '处理中...' : `${action.label} (${action.count})` }}
            </BaseButton>
          </div>
        </div>

        <div v-if="batchResultSummary" class="farm-panel-batch-result" :class="{ 'is-visible': batchResultVisible }">
          <div class="farm-panel-batch-result__icon i-carbon-task-complete" />
          <div class="farm-panel-batch-result__copy">
            {{ batchResultSummary }}
          </div>
        </div>
      </div>

      <!-- Grid -->
      <div class="p-4">
        <div v-if="loading || statusLoading" class="flex justify-center py-12">
          <div class="farm-panel-loading ui-state-spinner i-svg-spinners-90-ring-with-bg text-4xl" />
        </div>

        <BaseEmptyState
          v-else-if="!status?.connection?.connected"
          class="farm-panel-empty-state glass-text-muted rounded-lg p-12 text-center shadow-sm"
          icon="i-carbon-connection-signal-off"
          title="账号未登录"
          description="请先运行账号或检查网络连接"
        />

        <BaseEmptyState
          v-else-if="!lands || lands.length === 0"
          compact
          class="farm-panel-empty-state glass-text-muted rounded-lg px-6 py-10 text-center"
          icon="i-carbon-grid"
          title="暂无土地数据"
          description="请稍后刷新，或先确认当前账号已经进入农场首页。"
        />

        <BaseEmptyState
          v-else-if="visibleLands.length === 0"
          compact
          class="farm-panel-empty-state glass-text-muted rounded-lg px-6 py-10 text-center"
          icon="i-carbon-filter"
          title="当前筛选下没有土地"
          :description="`切换筛选条件后再看看，当前为 ${landFilterOptions.find(item => item.key === activeLandFilter)?.label || '全部'}。`"
        />

        <div v-else class="farm-panel-grid-wrap">
          <div v-if="batchSelectionMode" class="farm-panel-batch-legend">
            <div class="farm-panel-batch-legend__title">
              批量颜色图例
            </div>
            <div class="farm-panel-batch-legend__items">
              <div class="farm-panel-batch-legend__item is-harvest">
                <span class="farm-panel-batch-legend__dot" />
                <span>橙色表示可收获</span>
              </div>
              <div class="farm-panel-batch-legend__item is-water">
                <span class="farm-panel-batch-legend__dot" />
                <span>蓝色表示待浇水</span>
              </div>
              <div class="farm-panel-batch-legend__item is-weed">
                <span class="farm-panel-batch-legend__dot" />
                <span>绿色表示待除草</span>
              </div>
              <div class="farm-panel-batch-legend__item is-bug">
                <span class="farm-panel-batch-legend__dot" />
                <span>红色表示待除虫</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <LandCard
              v-for="land in visibleLands"
              :key="land.id"
              :land="land"
              :density="activeDensity"
              :selection-mode="batchSelectionMode"
              :selected="selectedLandIds.includes(Number(land.id || 0))"
              :recently-touched="recentBatchTouchedIds.includes(Number(land.id || 0))"
              @toggle-select="toggleLandSelection"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="batchSelectionMode && selectedLandIds.length > 0" class="farm-panel-batch-dock" :class="{ 'is-pulsing': batchSelectionPulse }">
      <div class="farm-panel-batch-dock__summary">
        <div class="farm-panel-batch-dock__title" :class="{ 'is-pulsing': batchSelectionPulse }">
          已选 {{ selectedLandIds.length }} 块土地
        </div>
        <div class="farm-panel-batch-dock__desc">
          {{ activeBatchGroup ? '当前按分组选中，可直接在下方执行批量操作。' : '可以继续补选土地，或直接执行下方批量操作。' }}
        </div>
      </div>
      <div class="farm-panel-batch-dock__actions">
        <BaseButton
          v-for="action in batchActions"
          :key="`dock-${action.key}`"
          variant="primary"
          class="farm-panel-batch-dock__button"
          :disabled="batchOperating"
          @click="runBatchAction(action.opType)"
        >
          {{ batchOperating ? '处理中...' : `${action.label} (${action.count})` }}
        </BaseButton>
        <BaseButton
          variant="ghost"
          class="farm-panel-batch-dock__button is-ghost"
          :disabled="batchOperating"
          @click="clearSelectedLands"
        >
          清空已选
        </BaseButton>
      </div>
    </div>

    <ConfirmModal
      :show="confirmVisible"
      :title="confirmConfig.title"
      :message="confirmConfig.message"
      @confirm="executeOperate"
      @cancel="confirmVisible = false"
    />
  </div>
</template>

<style scoped>
.farm-panel {
  color: var(--ui-text-1);
}

.farm-panel-shell,
.farm-panel-toolbar,
.farm-panel-summary,
.farm-panel-empty-state {
  border: 1px solid var(--ui-border-subtle) !important;
}

.farm-panel-shell,
.farm-panel-summary,
.farm-panel-empty-state {
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent) !important;
}

.farm-panel-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
}

.farm-panel-toolbar__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.875rem;
}

.farm-panel-toolbar__copy {
  min-width: 0;
}

.farm-panel-toolbar__desc {
  margin-top: 0.45rem;
  color: var(--ui-text-2);
  font-size: 0.84rem;
  line-height: 1.55;
}

.farm-panel-state-badge {
  display: inline-flex;
  align-items: center;
  min-height: 1.85rem;
  padding: 0.25rem 0.7rem;
  border-width: 1px;
  border-style: solid;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.farm-panel-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0;
  border: none !important;
}

.farm-panel-control-groups {
  display: grid;
  gap: 0.75rem;
}

.farm-panel-preference-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.farm-panel-control-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.72rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 1rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 10%, transparent), transparent 70%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 52%, transparent);
}

.farm-panel-control-card--inline {
  justify-content: center;
}

.farm-panel-control-card__label {
  color: var(--ui-text-2);
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.2;
}

.farm-panel-advanced-toggle-row {
  display: flex;
}

.farm-panel-advanced-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.78rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 1rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 10%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 56%, transparent);
  text-align: left;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.farm-panel-advanced-toggle:hover {
  transform: translateY(-1px);
}

.farm-panel-advanced-toggle.is-active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 36%, transparent);
  box-shadow: 0 12px 28px -22px color-mix(in srgb, var(--ui-brand-500) 72%, transparent);
}

.farm-panel-advanced-toggle__copy {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.farm-panel-advanced-toggle__title {
  color: var(--ui-text-1);
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.2;
}

.farm-panel-advanced-toggle__desc {
  color: var(--ui-text-2);
  font-size: 0.72rem;
  line-height: 1.45;
}

.farm-panel-advanced-toggle__icon {
  flex: none;
  color: var(--ui-text-2);
  font-size: 1rem;
  transition: transform 180ms ease;
}

.farm-panel-advanced-toggle__icon.is-open {
  transform: rotate(180deg);
}

.farm-panel-advanced-section {
  display: grid;
  gap: 0.75rem;
}

.farm-panel-batch-toolbar {
  display: grid;
  gap: 0.7rem;
  padding: 0.78rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 1rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 10%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 56%, transparent);
}

.farm-panel-batch-toolbar:has(.farm-panel-batch-meta) {
  position: sticky;
  top: 0.65rem;
  z-index: 6;
  border-color: color-mix(in srgb, var(--ui-brand-500) 24%, var(--ui-border-subtle));
  box-shadow: 0 16px 30px -26px color-mix(in srgb, var(--ui-brand-500) 44%, transparent);
}

.farm-panel-batch-toolbar__main,
.farm-panel-batch-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}

.farm-panel-batch-meta {
  color: var(--ui-text-2);
  font-size: 0.78rem;
  font-weight: 700;
}

.farm-panel-batch-toolbar__main.is-pulsing .farm-panel-batch-toggle,
.farm-panel-batch-meta.is-pulsing {
  animation: farm-batch-count-pulse 420ms ease-out;
}

.farm-panel-batch-note {
  color: var(--ui-text-2);
  font-size: 0.76rem;
  line-height: 1.55;
}

.farm-panel-batch-coverage {
  display: flex;
  align-items: flex-start;
  gap: 0.68rem;
  padding: 0.72rem 0.82rem;
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 18%, var(--ui-border-subtle));
  border-radius: 0.95rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 10%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-coverage__icon {
  flex: none;
  margin-top: 0.05rem;
  font-size: 1rem;
  color: color-mix(in srgb, var(--ui-brand-600) 82%, white 18%);
}

.farm-panel-batch-coverage__copy {
  min-width: 0;
  color: var(--ui-text-2);
  font-size: 0.74rem;
  line-height: 1.55;
}

.farm-panel-batch-empty-guide {
  display: flex;
  align-items: flex-start;
  gap: 0.72rem;
  padding: 0.78rem 0.82rem;
  border: 1px dashed color-mix(in srgb, var(--ui-brand-500) 28%, var(--ui-border-subtle));
  border-radius: 1rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 14%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-brand-500) 7%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-empty-guide__icon {
  flex: none;
  margin-top: 0.05rem;
  font-size: 1rem;
  color: color-mix(in srgb, var(--ui-brand-600) 84%, white 16%);
}

.farm-panel-batch-empty-guide__copy {
  min-width: 0;
}

.farm-panel-batch-empty-guide__title {
  color: var(--ui-text-1);
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.3;
}

.farm-panel-batch-empty-guide__desc {
  margin-top: 0.2rem;
  color: var(--ui-text-2);
  font-size: 0.74rem;
  line-height: 1.55;
}

.farm-panel-batch-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.farm-panel-batch-group {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.35rem;
  padding: 0.34rem 0.72rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 58%, transparent);
  font-size: 0.74rem;
  font-weight: 800;
  line-height: 1;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.farm-panel-batch-group:hover:not(:disabled) {
  transform: translateY(-1px);
}

.farm-panel-batch-group.is-active {
  box-shadow: 0 12px 24px -18px color-mix(in srgb, var(--ui-brand-500) 72%, transparent);
  transform: translateY(-1px);
}

.farm-panel-batch-group:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.farm-panel-batch-group__label {
  white-space: nowrap;
}

.farm-panel-batch-group__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.16rem;
  min-width: 0;
}

.farm-panel-batch-group__desc {
  color: currentColor;
  opacity: 0.72;
  font-size: 0.62rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
}

.farm-panel-batch-group__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.3rem;
  min-height: 1.3rem;
  padding-inline: 0.24rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
  color: var(--ui-text-1);
  font-size: 0.66rem;
  font-weight: 900;
}

.farm-panel-batch-group.is-harvest {
  color: color-mix(in srgb, #f97316 90%, white 10%);
  border-color: color-mix(in srgb, #fb923c 42%, transparent);
  background: color-mix(in srgb, #fb923c 13%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-harvest.is-active {
  border-color: color-mix(in srgb, #fb923c 70%, transparent);
  background: color-mix(in srgb, #fb923c 20%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-water {
  color: color-mix(in srgb, #0284c7 88%, white 12%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 12%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-water.is-active {
  border-color: color-mix(in srgb, #38bdf8 68%, transparent);
  background: color-mix(in srgb, #38bdf8 18%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-weed {
  color: color-mix(in srgb, #15803d 88%, white 12%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 12%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-weed.is-active {
  border-color: color-mix(in srgb, #22c55e 68%, transparent);
  background: color-mix(in srgb, #22c55e 18%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-bug {
  color: color-mix(in srgb, #dc2626 90%, white 10%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 12%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-group.is-bug.is-active {
  border-color: color-mix(in srgb, #ef4444 68%, transparent);
  background: color-mix(in srgb, #ef4444 18%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-result {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.72rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ui-status-success) 26%, transparent);
  border-radius: 0.95rem;
  color: color-mix(in srgb, var(--ui-status-success) 74%, var(--ui-text-1));
  background:
    linear-gradient(135deg, color-mix(in srgb, white 12%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-status-success) 10%, var(--ui-bg-surface-raised));
  animation: farm-batch-result-fade 4.2s ease forwards;
}

.farm-panel-batch-result__icon {
  flex: none;
  font-size: 1rem;
}

.farm-panel-batch-result__copy {
  min-width: 0;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.55;
}

.farm-panel-batch-result.is-visible {
  opacity: 1;
}

.farm-panel-batch-mini {
  min-height: 2rem;
}

.farm-panel-advanced-actions {
  display: flex;
  justify-content: flex-end;
}

.farm-panel-reset-btn {
  min-height: 2rem;
  padding: 0.38rem 0.78rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 56%, transparent);
  color: var(--ui-text-2);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;
  transition: transform 160ms ease, border-color 160ms ease, color 160ms ease;
}

.farm-panel-reset-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  color: var(--ui-text-1);
}

.farm-panel-reset-btn:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.farm-summary-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-height: 1.85rem;
  padding: 0.25rem 0.75rem;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.farm-summary-pill:hover {
  transform: translateY(-1px);
}

.farm-summary-pill.is-active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 42%, transparent);
  box-shadow: 0 10px 24px -18px color-mix(in srgb, var(--ui-brand-500) 72%, transparent);
}

.farm-panel-issue-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.farm-panel-issue-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 1.9rem;
  padding: 0.28rem 0.68rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 54%, transparent);
  color: var(--ui-text-2);
  font-size: 0.74rem;
  font-weight: 800;
  line-height: 1;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.farm-panel-issue-chip:hover {
  transform: translateY(-1px);
}

.farm-panel-issue-chip__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  min-height: 1.25rem;
  padding-inline: 0.22rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
  color: var(--ui-text-1);
  font-size: 0.66rem;
  font-weight: 900;
}

.farm-panel-issue-chip.is-active {
  box-shadow: 0 10px 22px -18px color-mix(in srgb, var(--ui-brand-500) 72%, transparent);
}

.farm-panel-issue-chip.is-water {
  color: color-mix(in srgb, #0284c7 88%, white 12%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 13%, var(--ui-bg-surface-raised));
}

.farm-panel-issue-chip.is-weed {
  color: color-mix(in srgb, #15803d 88%, white 12%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 12%, var(--ui-bg-surface-raised));
}

.farm-panel-issue-chip.is-bug {
  color: color-mix(in srgb, #dc2626 90%, white 10%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 12%, var(--ui-bg-surface-raised));
}

.farm-panel-issue-chip.is-soon {
  color: color-mix(in srgb, #d97706 88%, white 12%);
  border-color: color-mix(in srgb, #f59e0b 38%, transparent);
  background: color-mix(in srgb, #f59e0b 12%, var(--ui-bg-surface-raised));
}

.farm-panel-actions {
  display: flex;
  gap: 0.5rem;
}

.ui-btn.farm-panel-op-button {
  color: var(--ui-text-on-brand) !important;
  box-shadow:
    0 10px 22px -18px color-mix(in srgb, var(--ui-shadow-panel) 86%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-on-brand) 22%, transparent);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    filter 180ms ease,
    background-color 180ms ease;
}

.ui-btn.farm-panel-op-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 16px 26px -18px color-mix(in srgb, var(--ui-shadow-panel) 92%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--ui-text-on-brand) 26%, transparent);
}

.ui-btn.farm-panel-op-button:active:not(:disabled) {
  transform: translateY(0) scale(0.985);
}

.ui-btn.farm-panel-op-button:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--ui-focus-ring),
    0 12px 22px -18px color-mix(in srgb, var(--ui-shadow-panel) 86%, transparent);
}

.farm-op-harvest {
  background: var(--ui-status-info);
}

.farm-op-harvest:hover {
  background: color-mix(in srgb, var(--ui-status-info) 88%, black 12%);
}

.farm-op-clear {
  background: color-mix(in srgb, var(--ui-status-success) 76%, var(--ui-status-info) 24%);
}

.farm-op-clear:hover {
  background: color-mix(in srgb, var(--ui-status-success) 82%, black 18%);
}

.farm-op-plant {
  background: var(--ui-brand-600);
}

.farm-op-plant:hover {
  background: var(--ui-brand-700);
}

.farm-op-upgrade {
  background: color-mix(in srgb, var(--ui-status-info) 42%, var(--ui-brand-600) 58%);
}

.farm-op-upgrade:hover {
  background: color-mix(in srgb, var(--ui-status-info) 40%, var(--ui-brand-700) 60%);
}

.farm-op-all {
  background: var(--ui-status-warning);
}

.farm-op-all:hover {
  background: color-mix(in srgb, var(--ui-status-warning) 88%, black 12%);
}

.farm-panel-empty-state {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent) !important;
}

.farm-panel-grid-wrap {
  display: grid;
  gap: 0.9rem;
}

.farm-panel-batch-legend {
  display: grid;
  gap: 0.55rem;
  padding: 0.78rem 0.82rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 1rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 10%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 54%, transparent);
}

.farm-panel-batch-legend__title {
  color: var(--ui-text-1);
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.25;
}

.farm-panel-batch-legend__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.farm-panel-batch-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 1.95rem;
  padding: 0.28rem 0.66rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.farm-panel-batch-legend__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  flex: none;
}

.farm-panel-batch-legend__item.is-harvest {
  color: color-mix(in srgb, #f97316 90%, white 10%);
  border-color: color-mix(in srgb, #fb923c 42%, transparent);
  background: color-mix(in srgb, #fb923c 13%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-legend__item.is-harvest .farm-panel-batch-legend__dot {
  background: #fb923c;
}

.farm-panel-batch-legend__item.is-water {
  color: color-mix(in srgb, #0284c7 88%, white 12%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 12%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-legend__item.is-water .farm-panel-batch-legend__dot {
  background: #38bdf8;
}

.farm-panel-batch-legend__item.is-weed {
  color: color-mix(in srgb, #15803d 88%, white 12%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 12%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-legend__item.is-weed .farm-panel-batch-legend__dot {
  background: #22c55e;
}

.farm-panel-batch-legend__item.is-bug {
  color: color-mix(in srgb, #dc2626 90%, white 10%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 12%, var(--ui-bg-surface-raised));
}

.farm-panel-batch-legend__item.is-bug .farm-panel-batch-legend__dot {
  background: #ef4444;
}

.farm-panel-batch-dock {
  position: sticky;
  bottom: 0.85rem;
  z-index: 8;
  display: grid;
  gap: 0.75rem;
  margin-top: -0.25rem;
  padding: 0.82rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 22%, var(--ui-border-subtle));
  border-radius: 1.1rem;
  background:
    linear-gradient(135deg, color-mix(in srgb, white 16%, transparent), transparent 72%),
    color-mix(in srgb, var(--ui-bg-elevated) 92%, white 8%);
  box-shadow: 0 18px 40px -26px color-mix(in srgb, var(--ui-shadow-panel) 82%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.farm-panel-batch-dock.is-pulsing {
  animation: farm-batch-dock-pulse 460ms ease-out;
}

.farm-panel-batch-dock__summary {
  min-width: 0;
}

.farm-panel-batch-dock__title {
  color: var(--ui-text-1);
  font-size: 0.86rem;
  font-weight: 800;
  line-height: 1.25;
}

.farm-panel-batch-dock__title.is-pulsing {
  animation: farm-batch-count-pulse 420ms ease-out;
}

.farm-panel-batch-dock__desc {
  margin-top: 0.22rem;
  color: var(--ui-text-2);
  font-size: 0.74rem;
  line-height: 1.45;
}

.farm-panel-batch-dock__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.farm-panel-batch-dock__button {
  min-height: 2.2rem;
}

.farm-panel-batch-dock__button.is-ghost {
  color: var(--ui-text-2) !important;
}

@keyframes farm-batch-count-pulse {
  0% {
    transform: scale(1);
  }
  38% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes farm-batch-dock-pulse {
  0% {
    transform: translateY(0);
    box-shadow: 0 18px 40px -26px color-mix(in srgb, var(--ui-shadow-panel) 82%, transparent);
  }
  36% {
    transform: translateY(-2px);
    box-shadow:
      0 24px 46px -24px color-mix(in srgb, var(--ui-brand-500) 30%, transparent),
      0 18px 40px -26px color-mix(in srgb, var(--ui-shadow-panel) 82%, transparent);
  }
  100% {
    transform: translateY(0);
    box-shadow: 0 18px 40px -26px color-mix(in srgb, var(--ui-shadow-panel) 82%, transparent);
  }
}

@keyframes farm-batch-result-fade {
  0% {
    opacity: 0;
    transform: translateY(-4px);
  }
  10% {
    opacity: 1;
    transform: translateY(0);
  }
  82% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-3px);
  }
}

.farm-panel-empty-icon,
.farm-panel-empty-copy {
  color: var(--ui-text-2) !important;
}

.farm-panel-loading {
  color: var(--ui-status-info) !important;
}

.farm-panel-operating-note {
  color: var(--ui-text-2);
  font-size: 0.8rem;
  line-height: 1.5;
}

.farm-panel-priority-note {
  padding: 0.72rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 0.95rem;
  color: var(--ui-text-2);
  font-size: 0.8rem;
  line-height: 1.5;
  background:
    linear-gradient(135deg, color-mix(in srgb, #f8fafc 16%, transparent), transparent 60%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 54%, transparent);
}

.farm-panel-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.farm-panel-sort-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.farm-panel-sort-label {
  color: var(--ui-text-2);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.farm-panel-sort-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 58%, transparent);
}

.farm-panel-sort-chip {
  min-height: 1.9rem;
  padding: 0.3rem 0.72rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-2);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.farm-panel-sort-chip:hover {
  transform: translateY(-1px);
  color: var(--ui-text-1);
}

.farm-panel-sort-chip.is-active {
  background:
    linear-gradient(135deg, color-mix(in srgb, white 12%, transparent), transparent 70%),
    color-mix(in srgb, var(--ui-brand-500) 16%, var(--ui-bg-surface));
  color: var(--ui-text-1);
  box-shadow: 0 8px 20px -18px color-mix(in srgb, var(--ui-brand-500) 70%, transparent);
}

.farm-panel-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2rem;
  padding: 0.34rem 0.72rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 58%, transparent);
  color: var(--ui-text-2);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.farm-panel-filter-chip:hover {
  transform: translateY(-1px);
  color: var(--ui-text-1);
}

.farm-panel-filter-chip.is-active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 46%, transparent);
  background:
    linear-gradient(135deg, color-mix(in srgb, white 12%, transparent), transparent 70%),
    color-mix(in srgb, var(--ui-brand-500) 15%, var(--ui-bg-surface-raised));
  color: var(--ui-text-1);
  box-shadow: 0 10px 22px -18px color-mix(in srgb, var(--ui-brand-500) 66%, transparent);
}

.farm-panel-filter-chip__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.3rem;
  min-height: 1.3rem;
  padding-inline: 0.24rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
  color: var(--ui-text-1);
  font-size: 0.68rem;
  font-weight: 800;
}

@media (max-width: 767px) {
  .farm-panel-toolbar {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-bg-surface-raised) 90%, transparent) 0%,
      color-mix(in srgb, var(--ui-bg-surface) 82%, transparent) 100%
    ) !important;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: 11;
  }

  .farm-panel-toolbar__head {
    flex-direction: column;
  }

  .farm-panel-batch-toolbar:has(.farm-panel-batch-meta) {
    top: 0.4rem;
  }

  .farm-panel-batch-dock {
    bottom: 0.5rem;
    margin-inline: 0.25rem;
    padding: 0.78rem;
    border-radius: 1rem;
  }

  .farm-panel-batch-dock__actions > * {
    flex: 1 1 calc(50% - 0.55rem);
    min-width: 0;
  }

  .farm-panel-control-groups,
  .farm-panel-preference-grid {
    grid-template-columns: 1fr;
  }

  .farm-panel-actions {
    flex-wrap: wrap;
    margin-inline: 0;
    padding-inline: 0;
  }

  .farm-panel-batch-toolbar__actions > * {
    flex: 1 1 calc(50% - 0.55rem);
    min-width: 0;
  }

  .farm-panel-batch-group {
    width: 100%;
    justify-content: space-between;
    border-radius: 1rem;
  }

  .farm-panel-batch-group__desc {
    white-space: normal;
  }

  .farm-panel-filters {
    gap: 0.45rem;
  }

  .farm-panel-issue-quick {
    gap: 0.45rem;
  }

  .farm-panel-issue-chip {
    font-size: 0.7rem;
  }

  .farm-panel-sort-row {
    flex-direction: column;
    align-items: stretch;
  }

  .farm-panel-sort-switch {
    width: 100%;
    justify-content: stretch;
  }

  .farm-panel-sort-chip {
    flex: 1 1 0;
    min-width: 0;
  }

  .farm-panel-filter-chip {
    min-height: 1.9rem;
    padding-inline: 0.62rem;
    font-size: 0.74rem;
  }

  .farm-panel-actions > * {
    min-width: 0;
    flex: 1 1 calc(50% - 0.5rem);
  }
}
</style>
