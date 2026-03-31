<script setup lang="ts">
import type { MetaBadgeTone } from '@/utils/ui-badge'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{
  land: any
  interactive?: boolean
  density?: 'comfortable' | 'compact'
  selectionMode?: boolean
  selected?: boolean
  recentlyTouched?: boolean
}>()
const emit = defineEmits<{
  toggleSelect: [landId: number]
}>()

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)
const { operatingLandIds } = storeToRefs(farmStore)
const detailOpen = ref(false)
const detailOperating = ref(false)
const actionFeedback = ref<{ type: 'success' | 'error' | 'info', message: string } | null>(null)
const quickMenuOpen = ref(false)
const quickMenuPosition = ref({ x: 0, y: 0 })
const longPressTimer = ref<number | null>(null)
const localTouched = ref(false)
const localTouchedTimer = ref<number | null>(null)
const cardRef = ref<HTMLElement | null>(null)

const land = computed(() => props.land)
const interactive = computed(() => props.interactive !== false)
const density = computed(() => props.density === 'compact' ? 'compact' : 'comfortable')
const isCompact = computed(() => density.value === 'compact')
const selectionMode = computed(() => props.selectionMode === true)
const isSelected = computed(() => props.selected === true)
const isRecentlyTouched = computed(() => props.recentlyTouched === true || localTouched.value)
const landStatus = computed(() => String(land.value?.status || '').trim())
const plantSize = computed(() => Number(land.value?.plantSize || 1))
const isMultiPlant = computed(() => plantSize.value > 1)
const occupiedByMaster = computed(() => !!land.value?.occupiedByMaster)
const seasonText = computed(() => {
  const current = Number(land.value?.currentSeason || 0)
  const total = Number(land.value?.totalSeason || 0)
  if (current <= 0 || total <= 0)
    return ''
  return `${current}/${total}季`
})
const landTypeText = computed(() => getLandTypeName(Number(land.value?.level || 0)))
const totalGrowTime = computed(() => Number(land.value?.totalGrowTime || land.value?.growTime || 0))
const elapsedGrowTime = computed(() => {
  if (totalGrowTime.value <= 0)
    return 0
  const remaining = Number(land.value?.matureInSec || 0)
  if (remaining <= 0)
    return totalGrowTime.value
  return Math.max(0, totalGrowTime.value - remaining)
})
const matureProgress = computed(() => {
  const matureInSec = Number(land.value?.matureInSec || 0)
  const total = totalGrowTime.value
  if (matureInSec <= 0)
    return ['harvestable', 'stealable', 'harvested'].includes(String(land.value?.status || '')) ? 100 : 0
  if (total <= 0)
    return 0
  const elapsed = Math.max(0, total - matureInSec)
  return Math.max(1, Math.min(99, Math.round((elapsed / total) * 100)))
})
const stageProgress = computed(() => {
  const raw = Number(land.value?.currentPhaseProgress || 0)
  if (['harvestable', 'stealable', 'harvested'].includes(String(land.value?.status || '')))
    return 100
  if (raw > 0)
    return Math.max(1, Math.min(99, raw))
  return 0
})
const matureProgressLabel = computed(() => {
  const progress = matureProgress.value
  if (['harvestable', 'stealable', 'harvested'].includes(String(land.value?.status || '')))
    return '已成熟'
  if (progress >= 95)
    return '即将成熟'
  if (progress >= 60)
    return '生长后段'
  if (progress > 0)
    return '生长中'
  return ''
})
const stageName = computed(() => {
  if (['harvestable', 'stealable', 'harvested'].includes(String(land.value?.status || '')))
    return '成熟阶段'
  return String(land.value?.phaseName || '').trim() || '生长阶段'
})
const stageToneClass = computed(() => {
  const status = String(land.value?.status || '')
  const name = stageName.value
  if (['harvestable', 'stealable', 'harvested'].includes(status) || /成熟/.test(name))
    return 'is-tone-ripe'
  if (/发芽|幼苗|苗/.test(name))
    return 'is-tone-sprout'
  if (/开花|结果|抽穗|膨大|后段/.test(name))
    return 'is-tone-bloom'
  return 'is-tone-grow'
})
const growTimeSummary = computed(() => {
  if (totalGrowTime.value <= 0)
    return ''
  return `${formatTimeCompact(elapsedGrowTime.value)} / ${formatTimeCompact(totalGrowTime.value)}`
})
const growTimeHint = computed(() => {
  if (totalGrowTime.value <= 0)
    return ''
  if (Number(land.value?.matureInSec || 0) > 0)
    return `总生长 ${formatTimeCompact(totalGrowTime.value)}`
  return `生长完成 ${formatTimeCompact(totalGrowTime.value)}`
})
const stageTimeSummary = computed(() => {
  const duration = Number(land.value?.currentPhaseDurationSec || 0)
  if (duration <= 0)
    return ''
  const elapsed = Number(land.value?.currentPhaseElapsedSec || 0)
  return `${formatTimeCompact(elapsed)} / ${formatTimeCompact(duration)}`
})
const stageTimeHint = computed(() => {
  const remaining = Number(land.value?.currentPhaseRemainingSec || 0)
  if (remaining > 0)
    return `本阶段剩余 ${formatTimeCompact(remaining)}`
  if (['harvestable', 'stealable', 'harvested'].includes(String(land.value?.status || '')))
    return '已进入成熟可收阶段'
  return ''
})
const alertStateClass = computed(() => {
  const status = String(land.value?.status || '')
  const matureInSec = Number(land.value?.matureInSec || 0)
  const stageRemainingSec = Number(land.value?.currentPhaseRemainingSec || 0)
  if (['harvestable', 'stealable', 'harvested'].includes(status))
    return 'land-card-alert-ripe'
  if (matureInSec > 0 && matureInSec <= 15 * 60)
    return 'land-card-alert-soon'
  if (stageRemainingSec > 0 && stageRemainingSec <= 5 * 60)
    return 'land-card-alert-stage'
  return ''
})
const operationHints = computed(() => {
  const hints: Array<{ key: string, label: string, kind: string }> = []
  const status = String(land.value?.status || '')
  const matureInSec = Number(land.value?.matureInSec || 0)
  const stageRemainingSec = Number(land.value?.currentPhaseRemainingSec || 0)
  if (status === 'harvestable') {
    hints.push({ key: 'harvest', label: '立即收获', kind: 'harvest' })
  }
  else if (status === 'stealable') {
    hints.push({ key: 'steal', label: '可偷取', kind: 'harvest' })
  }
  else if (matureInSec > 0 && matureInSec <= 15 * 60) {
    hints.push({ key: 'soon', label: '即将成熟', kind: 'soon' })
  }
  else if (stageRemainingSec > 0 && stageRemainingSec <= 5 * 60) {
    hints.push({ key: 'stage', label: '快切阶段', kind: 'stage' })
  }
  if (land.value?.needWater)
    hints.push({ key: 'water', label: '需浇水', kind: 'water' })
  if (land.value?.needWeed)
    hints.push({ key: 'weed', label: '需除草', kind: 'weed' })
  if (land.value?.needBug)
    hints.push({ key: 'bug', label: '需除虫', kind: 'bug' })
  return hints.slice(0, 4)
})
const primaryStatusBadge = computed(() => {
  const status = String(land.value?.status || '')
  const matureInSec = Number(land.value?.matureInSec || 0)
  const phaseRemainingSec = Number(land.value?.currentPhaseRemainingSec || 0)

  if (status === 'harvestable')
    return { label: '可收获', kind: 'harvest', icon: 'i-carbon-wheat' }
  if (status === 'stealable')
    return { label: '可偷取', kind: 'harvest', icon: 'i-carbon-piggy-bank-slot' }
  if (land.value?.needBug)
    return { label: '待除虫', kind: 'bug', icon: 'i-carbon-bug' }
  if (land.value?.needWeed)
    return { label: '待除草', kind: 'weed', icon: 'i-carbon-tools' }
  if (land.value?.needWater)
    return { label: '待浇水', kind: 'water', icon: 'i-carbon-watson-health-stack-moving' }
  if (matureInSec > 0 && matureInSec <= 15 * 60)
    return { label: '快成熟', kind: 'soon', icon: 'i-carbon-timer' }
  if (phaseRemainingSec > 0 && phaseRemainingSec <= 5 * 60)
    return { label: '快切阶段', kind: 'stage', icon: 'i-carbon-progress-bar-round' }
  if (status === 'dead')
    return { label: '已枯萎', kind: 'bug', icon: 'i-carbon-warning-filled' }
  if (status === 'empty')
    return { label: '空闲中', kind: 'idle', icon: 'i-carbon-sprout' }
  if (status === 'locked')
    return { label: '未解锁', kind: 'locked', icon: 'i-carbon-lock' }
  return null
})
const batchFocusTags = computed(() => {
  if (!selectionMode.value)
    return []
  const tags: Array<{ key: string, label: string, kind: string }> = []
  if (land.value?.status === 'harvestable')
    tags.push({ key: 'harvest', label: '可收获', kind: 'harvest' })
  if (land.value?.needWater)
    tags.push({ key: 'water', label: '待浇水', kind: 'water' })
  if (land.value?.needWeed)
    tags.push({ key: 'weed', label: '待除草', kind: 'weed' })
  if (land.value?.needBug)
    tags.push({ key: 'bug', label: '待除虫', kind: 'bug' })
  if (tags.length === 0 && isGrowingCard.value)
    tags.push({ key: 'watch', label: '观察中', kind: 'watch' })
  return tags.slice(0, 3)
})
const batchFocusTone = computed(() => {
  if (!selectionMode.value)
    return ''
  if (land.value?.status === 'harvestable')
    return 'is-batch-harvest'
  if (land.value?.needBug)
    return 'is-batch-bug'
  if (land.value?.needWeed)
    return 'is-batch-weed'
  if (land.value?.needWater)
    return 'is-batch-water'
  return 'is-batch-watch'
})
const isGrowingCard = computed(() => ['growing', 'harvestable', 'stealable', 'harvested'].includes(landStatus.value))
const fallbackVisual = computed(() => {
  if (landStatus.value === 'locked') {
    return {
      icon: 'i-carbon-lock',
      title: '未解锁',
      subtitle: '达到条件后可解锁这块土地',
      tone: 'is-visual-locked',
    }
  }
  if (landStatus.value === 'dead') {
    return {
      icon: 'i-carbon-warning-filled',
      title: land.value?.plantName || '已枯萎',
      subtitle: '当前作物已枯萎，请尽快处理',
      tone: 'is-visual-dead',
    }
  }
  return {
    icon: 'i-carbon-sprout',
    title: '空地',
    subtitle: '可以直接安排下一轮种植',
    tone: 'is-visual-empty',
  }
})

const landMetaBadges = computed(() => {
  const badges: Array<{ key: string, label: string, title?: string, tone: MetaBadgeTone }> = []
  if (landTypeText.value) {
    badges.push({
      key: 'land-type',
      label: landTypeText.value,
      tone: 'warning',
    })
  }
  if (seasonText.value) {
    badges.push({
      key: 'season',
      label: seasonText.value,
      tone: 'info',
    })
  }
  if (isMultiPlant.value) {
    badges.push({
      key: 'multi',
      label: `合种${plantSize.value}x${plantSize.value}`,
      tone: 'success',
    })
  }
  if (occupiedByMaster.value) {
    badges.push({
      key: 'occupied',
      label: '副地块',
      title: `由主地块 #${land.value?.masterLandId || '-'} 占用`,
      tone: 'info',
    })
  }
  return badges
})
const detailRows = computed(() => {
  const rows: Array<{ key: string, label: string, value: string }> = []
  rows.push({ key: 'land', label: '土地类型', value: landTypeText.value || '普通土地' })
  if (seasonText.value)
    rows.push({ key: 'season', label: '当前季数', value: seasonText.value })
  if (isGrowingCard.value) {
    rows.push({ key: 'phase', label: '当前阶段', value: stageName.value })
    rows.push({ key: 'phase_progress', label: '阶段进度', value: `${stageProgress.value}%` })
    if (stageTimeSummary.value)
      rows.push({ key: 'phase_time', label: '阶段耗时', value: stageTimeSummary.value })
    rows.push({ key: 'total_progress', label: '整株进度', value: `${matureProgress.value}%` })
    if (growTimeSummary.value)
      rows.push({ key: 'total_time', label: '整株耗时', value: growTimeSummary.value })
    if (Number(land.value?.matureInSec || 0) > 0)
      rows.push({ key: 'mature', label: '预计成熟', value: formatTime(Number(land.value?.matureInSec || 0)) })
  }
  else {
    rows.push({ key: 'status', label: '当前状态', value: fallbackVisual.value.title })
    rows.push({ key: 'note', label: '状态说明', value: fallbackVisual.value.subtitle })
  }
  return rows
})
const quickActions = computed(() => {
  if (!interactive.value)
    return []
  const actions: Array<{ key: string, label: string, opType: string, kind: string }> = []
  if (land.value?.status === 'harvestable')
    actions.push({ key: 'harvest', label: '单块收获', opType: 'harvest', kind: 'harvest' })
  if (land.value?.needWater)
    actions.push({ key: 'water', label: '立即浇水', opType: 'water', kind: 'water' })
  if (land.value?.needWeed)
    actions.push({ key: 'weed', label: '立即除草', opType: 'weed', kind: 'weed' })
  if (land.value?.needBug)
    actions.push({ key: 'bug', label: '立即除虫', opType: 'bug', kind: 'bug' })
  return actions
})
const hoverTimeRows = computed(() => {
  if (!isGrowingCard.value)
    return []
  const rows: Array<{ key: string, label: string, value: string }> = []
  if (Number(land.value?.matureInSec || 0) > 0)
    rows.push({ key: 'eta', label: '成熟倒计时', value: formatTime(Number(land.value?.matureInSec || 0)) })
  if (stageTimeHint.value)
    rows.push({ key: 'phase_remaining', label: '阶段剩余', value: stageTimeHint.value.replace(/^本阶段剩余\s*/, '') })
  if (stageTimeSummary.value)
    rows.push({ key: 'phase_summary', label: '阶段耗时', value: stageTimeSummary.value })
  if (growTimeSummary.value)
    rows.push({ key: 'total_summary', label: '整株耗时', value: growTimeSummary.value })
  return rows.slice(0, 4)
})
const isLandOperating = computed(() => operatingLandIds.value.includes(Number(land.value?.id || 0)) || detailOperating.value)
const operatingLabel = computed(() => {
  if (!isLandOperating.value)
    return ''
  if (actionFeedback.value?.type === 'info' && actionFeedback.value.message)
    return actionFeedback.value.message
  return '正在处理这块土地...'
})

function openDetail() {
  if (selectionMode.value) {
    emitToggleSelect()
    return
  }
  if (quickMenuOpen.value) {
    closeQuickMenu()
    return
  }
  actionFeedback.value = null
  detailOpen.value = true
}

function emitToggleSelect() {
  const landId = Number(land.value?.id || 0)
  if (landId > 0)
    emit('toggleSelect', landId)
}

function closeDetail() {
  detailOpen.value = false
}

function clearLongPressTimer() {
  if (longPressTimer.value !== null) {
    window.clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

function flashLocalTouched() {
  localTouched.value = true
  if (localTouchedTimer.value !== null)
    window.clearTimeout(localTouchedTimer.value)
  localTouchedTimer.value = window.setTimeout(() => {
    localTouched.value = false
    localTouchedTimer.value = null
  }, 2400)
}

function closeQuickMenu() {
  quickMenuOpen.value = false
}

function openQuickMenuAt(position: { x: number, y: number }) {
  if (!interactive.value || quickActions.value.length === 0 || isLandOperating.value)
    return
  actionFeedback.value = null
  quickMenuPosition.value = position
  quickMenuOpen.value = true
}

function getMenuPositionFromEvent(event: MouseEvent | TouchEvent) {
  const card = cardRef.value
  if (!card)
    return { x: 0, y: 0 }

  const rect = card.getBoundingClientRect()
  const padding = 14
  const estimatedMenuWidth = 172
  const estimatedMenuHeight = Math.max(120, quickActions.value.length * 42 + 18)

  let clientX = rect.right - estimatedMenuWidth - padding
  let clientY = rect.top + padding

  if (event instanceof MouseEvent) {
    clientX = event.clientX
    clientY = event.clientY
  }
  else if (event.touches?.[0]) {
    clientX = event.touches[0].clientX
    clientY = event.touches[0].clientY
  }

  return {
    x: Math.min(Math.max(clientX, rect.left + padding), rect.right - estimatedMenuWidth - padding),
    y: Math.min(Math.max(clientY, rect.top + padding), rect.bottom - estimatedMenuHeight - padding),
  }
}

function handleContextMenu(event: MouseEvent) {
  if (!interactive.value || quickActions.value.length === 0 || isLandOperating.value)
    return
  event.preventDefault()
  event.stopPropagation()
  openQuickMenuAt(getMenuPositionFromEvent(event))
}

function handleTouchStart(event: TouchEvent) {
  if (!interactive.value || quickActions.value.length === 0 || isLandOperating.value)
    return
  clearLongPressTimer()
  longPressTimer.value = window.setTimeout(() => {
    openQuickMenuAt(getMenuPositionFromEvent(event))
  }, 420)
}

function handleTouchEnd() {
  clearLongPressTimer()
}

async function handleQuickAction(opType: string) {
  if (!currentAccountId.value || !Number(land.value?.id || 0) || detailOperating.value)
    return
  closeQuickMenu()
  detailOperating.value = true
  actionFeedback.value = {
    type: 'info',
    message: '正在执行操作，请稍候...',
  }
  try {
    await farmStore.operateLand(currentAccountId.value, Number(land.value.id), opType)
    const successMap: Record<string, string> = {
      harvest: '单块收获已完成',
      water: '浇水已完成',
      weed: '除草已完成',
      bug: '除虫已完成',
    }
    const message = successMap[opType] || '地块操作已完成'
    actionFeedback.value = { type: 'success', message }
    flashLocalTouched()
    toast.success(message)
  }
  catch (error: any) {
    const message = error?.response?.data?.error || error?.message || '地块操作失败，请稍后重试'
    actionFeedback.value = { type: 'error', message }
    toast.error(message)
  }
  finally {
    detailOperating.value = false
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && quickMenuOpen.value) {
    closeQuickMenu()
    return
  }
  if (event.key === 'Escape' && detailOpen.value)
    closeDetail()
}

function handleWindowPointerdown(event: MouseEvent | TouchEvent) {
  const target = event.target as Node | null
  if (quickMenuOpen.value && cardRef.value && target && !cardRef.value.contains(target))
    closeQuickMenu()
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('mousedown', handleWindowPointerdown)
  window.addEventListener('touchstart', handleWindowPointerdown)
})

onUnmounted(() => {
  clearLongPressTimer()
  if (localTouchedTimer.value !== null)
    window.clearTimeout(localTouchedTimer.value)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('mousedown', handleWindowPointerdown)
  window.removeEventListener('touchstart', handleWindowPointerdown)
})

function getLandStatusClass(land: any) {
  const status = land.status
  const level = Number(land.level) || 0

  if (status === 'locked')
    return 'land-card-state-locked'

  let baseClass = 'glass-panel land-card-level-default'

  // 土地等级样式
  switch (level) {
    case 1: // 黄土地
      baseClass = 'land-card-level-1'
      break
    case 2: // 红土地
      baseClass = 'land-card-level-2'
      break
    case 3: // 黑土地
      baseClass = 'land-card-level-3'
      break
    case 4: // 金土地
      baseClass = 'land-card-level-4'
      break
  }

  // 状态叠加
  if (status === 'dead')
    return 'land-card-state-dead'

  if (status === 'harvestable')
    return `${baseClass} land-card-state-harvestable`

  if (status === 'stealable')
    return `${baseClass} land-card-state-stealable`

  if (status === 'growing')
    return baseClass

  return baseClass
}

function formatTime(sec: number) {
  if (sec <= 0)
    return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function formatTimeCompact(sec: number) {
  if (sec <= 0)
    return '0分'
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  if (hours > 0)
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`
  if (minutes > 0)
    return `${minutes}分`
  return `${Math.max(1, Math.floor(sec))}秒`
}

function getSafeImageUrl(url: string) {
  if (!url)
    return ''
  if (url.startsWith('http://'))
    return url.replace('http://', 'https://')
  return url
}

function getLandTypeName(level: number) {
  const typeMap: Record<number, string> = {
    0: '普通',
    1: '黄土地',
    2: '红土地',
    3: '黑土地',
    4: '金土地',
  }
  return typeMap[Number(level) || 0] || ''
}
</script>

<template>
  <div
    ref="cardRef"
    class="land-card-theme relative flex flex-col items-center border rounded-xl px-3 pb-3 pt-2 transition hover:shadow-md"
    :class="[getLandStatusClass(land), alertStateClass, batchFocusTone, { 'is-operating': isLandOperating, 'is-compact': isCompact, 'is-selection-mode': selectionMode, 'is-selected': isSelected, 'is-recently-touched': isRecentlyTouched }]"
    role="button"
    tabindex="0"
    @click="openDetail"
    @contextmenu="handleContextMenu"
    @keydown.enter.prevent="openDetail"
    @keydown.space.prevent="openDetail"
    @touchstart.passive="handleTouchStart"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
  >
    <div class="land-card-meta absolute right-2 top-2 flex flex-wrap justify-end gap-1 text-[9px]">
      <BaseBadge
        v-for="badge in landMetaBadges"
        :key="badge.key"
        surface="meta"
        :tone="badge.tone"
        class="land-chip"
        :title="badge.title"
      >
        {{ badge.label }}
      </BaseBadge>
    </div>

    <div class="land-card-index absolute left-2 top-2 text-[10px] font-mono">
      {{ Number(land.id || 0) > 0 ? `#${Number(land.id || 0)}` : '-' }}
    </div>

    <button
      v-if="selectionMode"
      type="button"
      class="land-card-select-indicator"
      :class="{ 'is-selected': isSelected }"
      :title="isSelected ? '取消选中这块土地' : '选中这块土地'"
      @click.stop="emitToggleSelect"
    >
      <span v-if="isSelected" class="i-carbon-checkmark text-xs" />
    </button>

    <div
      v-if="primaryStatusBadge"
      class="land-card-primary-status"
      :class="`is-${primaryStatusBadge.kind}`"
    >
      <span :class="primaryStatusBadge.icon" />
      <span>{{ primaryStatusBadge.label }}</span>
    </div>

    <div v-if="selectionMode && batchFocusTags.length > 0" class="land-card-batch-tags">
      <div
        v-for="tag in batchFocusTags"
        :key="tag.key"
        class="land-card-batch-tags__item"
        :class="`is-${tag.kind}`"
      >
        {{ tag.label }}
      </div>
    </div>

    <div v-if="isLandOperating" class="land-card-operating">
      <div class="land-card-operating__spinner i-svg-spinners-90-ring-with-bg" />
      <div class="land-card-operating__text">
        {{ operatingLabel }}
      </div>
    </div>

    <div class="land-card-figure mb-2 mt-8 flex items-center justify-center" :class="fallbackVisual.tone">
      <img
        v-if="land.seedImage && isGrowingCard"
        :src="getSafeImageUrl(land.seedImage)"
        class="max-h-full max-w-full object-contain drop-shadow-[0_6px_14px_rgba(15,23,42,0.16)]"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div v-else class="land-card-empty-icon text-3xl" :class="[fallbackVisual.icon, fallbackVisual.tone]" />
    </div>

    <div class="land-card-title glass-text-main w-full truncate px-2 text-center font-semibold" :title="isGrowingCard ? land.plantName : fallbackVisual.title">
      {{ isGrowingCard ? (land.plantName || '-') : fallbackVisual.title }}
    </div>

    <div class="land-card-subtitle glass-text-muted mb-2 mt-1 w-full text-center">
      <span v-if="isGrowingCard && land.matureInSec > 0" class="land-card-timer">
        预计 {{ formatTime(land.matureInSec) }} 后成熟
      </span>
      <span v-else-if="isGrowingCard">
        {{ land.phaseName || (land.status === 'locked' ? '未解锁' : '未开垦') }}
      </span>
      <span v-else>
        {{ fallbackVisual.subtitle }}
      </span>
    </div>

    <div
      v-if="isGrowingCard"
      class="land-card-progress land-card-progress--primary mb-1 mt-auto w-full"
    >
      <div class="land-card-progress__meta glass-text-muted mb-1 flex items-center justify-between text-[10px]">
        <span>{{ stageName }}</span>
        <span>{{ stageProgress }}%</span>
      </div>
      <div class="land-card-progress__track is-stage" :class="stageToneClass">
        <div
          class="land-card-progress__fill is-stage"
          :class="[stageToneClass, { 'is-harvestable': ['harvestable', 'stealable', 'harvested'].includes(String(land.status || '')) }]"
          :style="{ width: `${stageProgress}%` }"
        />
      </div>
      <div
        v-if="stageTimeSummary"
        class="land-card-progress__detail glass-text-muted mt-1 flex items-center justify-between gap-2 text-[10px]"
      >
        <span>阶段进度</span>
        <span>{{ stageTimeSummary }}</span>
      </div>
      <div v-if="stageTimeHint" class="land-card-progress__hint glass-text-muted mt-0.5 text-center text-[10px]">
        {{ stageTimeHint }}
      </div>
    </div>

    <div
      v-if="isGrowingCard"
      class="land-card-summary mt-1 w-full"
      :title="matureProgressLabel || undefined"
    >
      <div class="land-card-summary__row glass-text-muted">
        <span class="land-card-summary__label">{{ matureProgressLabel || '总成长进度' }}</span>
        <span class="land-card-summary__value">{{ matureProgress }}%</span>
      </div>
      <div v-if="growTimeSummary" class="land-card-summary__row glass-text-muted">
        <span class="land-card-summary__label">整株进度</span>
        <span class="land-card-summary__value">{{ growTimeSummary }}</span>
      </div>
      <div v-if="growTimeHint" class="land-card-summary__hint glass-text-muted">
        {{ growTimeHint }}
      </div>
    </div>

    <div v-else class="land-card-idle-panel mt-auto w-full">
      <div class="land-card-idle-panel__title glass-text-muted">
        {{ landTypeText || '普通土地' }}
      </div>
      <div class="land-card-idle-panel__note glass-text-muted">
        {{ seasonText || (landStatus === 'locked' ? '等待解锁后启用' : landStatus === 'dead' ? '建议尽快清理并补种' : '空闲中，可直接种植') }}
      </div>
    </div>

    <div v-if="operationHints.length > 0" class="land-card-actions mt-2 w-full">
      <div class="land-card-actions__rail">
        <div
          v-for="hint in operationHints"
          :key="hint.key"
          class="land-card-actions__item"
          :class="`is-${hint.kind}`"
        >
          {{ hint.label }}
        </div>
      </div>
    </div>

    <div v-if="interactive && quickActions.length > 0" class="land-card-quick-tip glass-text-muted">
      右键或长按可快捷处理
    </div>

    <div v-if="hoverTimeRows.length > 0" class="land-card-hover-time">
      <div class="land-card-hover-time__title">
        时间速览
      </div>
      <div
        v-for="row in hoverTimeRows"
        :key="row.key"
        class="land-card-hover-time__row"
      >
        <span class="land-card-hover-time__label">{{ row.label }}</span>
        <span class="land-card-hover-time__value">{{ row.value }}</span>
      </div>
    </div>

    <div
      v-if="quickMenuOpen && interactive && quickActions.length > 0"
      class="land-card-quick-menu"
      :style="{ left: `${quickMenuPosition.x}px`, top: `${quickMenuPosition.y}px` }"
      @click.stop
    >
      <button
        v-for="action in quickActions"
        :key="action.key"
        type="button"
        class="land-card-quick-menu__item"
        :class="`is-${action.kind}`"
        :disabled="isLandOperating"
        @click.stop="handleQuickAction(action.opType)"
      >
        <span class="land-card-quick-menu__dot" :class="`is-${action.kind}`" />
        <span>{{ isLandOperating ? '处理中...' : action.label }}</span>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="detailOpen"
      class="land-card-detail fixed inset-0 z-70 flex items-center justify-center p-4"
      @click="closeDetail"
    >
      <div class="land-card-detail__overlay absolute inset-0" />
      <div class="land-card-detail__panel glass-panel relative z-10 w-full max-w-md rounded-[24px] p-5 shadow-2xl" @click.stop>
        <div class="land-card-detail__head flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="land-card-detail__eyebrow">
              {{ Number(land.id || 0) > 0 ? `#${Number(land.id || 0)} 土地详情` : '土地详情' }}
            </div>
            <h3 class="land-card-detail__title mt-2 truncate">
              {{ isGrowingCard ? (land.plantName || '作物详情') : fallbackVisual.title }}
            </h3>
            <p class="land-card-detail__desc mt-2">
              {{ isGrowingCard ? (stageTimeHint || growTimeHint || '查看该地块的完整生长信息') : fallbackVisual.subtitle }}
            </p>
          </div>
          <button class="land-card-detail__close" type="button" @click="closeDetail">
            <span class="i-carbon-close text-lg" />
          </button>
        </div>

        <div class="land-card-detail__grid mt-5">
          <div v-for="row in detailRows" :key="row.key" class="land-card-detail__row">
            <div class="land-card-detail__label">{{ row.label }}</div>
            <div class="land-card-detail__value">{{ row.value }}</div>
          </div>
        </div>

        <div
          v-if="actionFeedback"
          class="land-card-detail__feedback mt-4"
          :class="`is-${actionFeedback.type}`"
        >
          {{ actionFeedback.message }}
        </div>

        <div v-if="operationHints.length > 0" class="land-card-detail__actions mt-5">
          <div
            v-for="hint in operationHints"
            :key="hint.key"
            class="land-card-actions__item"
            :class="`is-${hint.kind}`"
          >
            {{ hint.label }}
          </div>
        </div>

        <div v-if="quickActions.length > 0" class="land-card-detail__quick mt-5">
          <button
            v-for="action in quickActions"
            :key="action.key"
            type="button"
            class="land-card-detail__quick-btn"
            :class="`is-${action.kind}`"
            :disabled="isLandOperating"
            @click="handleQuickAction(action.opType)"
          >
            {{ isLandOperating ? '处理中...' : action.label }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.land-card-theme {
  min-height: 196px;
  color: var(--ui-text-1);
  border-color: var(--ui-border-subtle);
  background:
    linear-gradient(180deg, color-mix(in srgb, white 8%, transparent), transparent 22%),
    color-mix(in srgb, var(--ui-bg-surface) 68%, transparent);
  overflow: hidden;
  cursor: pointer;
}

.land-card-theme.is-compact {
  min-height: 172px;
  padding-inline: 0.68rem;
  padding-top: 0.45rem;
  padding-bottom: 0.65rem;
}

.land-card-theme.is-selection-mode {
  cursor: cell;
}

.land-card-theme.is-selection-mode:not(.is-selected) {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
}

.land-card-theme.is-selected {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--ui-brand-500) 48%, transparent),
    0 16px 34px -24px color-mix(in srgb, var(--ui-brand-500) 46%, transparent);
}

.land-card-theme.is-recently-touched {
  animation: land-card-success-flash 2.4s ease-out;
}

.land-card-theme.is-recently-touched::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--ui-status-success) 32%, transparent);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--ui-status-success) 22%, transparent),
    inset 0 0 0 1px color-mix(in srgb, white 22%, transparent);
  animation: land-card-success-ring 2.4s ease-out;
}

.land-card-select-indicator {
  position: absolute;
  left: 0.62rem;
  bottom: 0.62rem;
  z-index: 7;
  width: 1.4rem;
  height: 1.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 74%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 86%, white 14%);
  color: transparent;
}

.land-card-select-indicator.is-selected {
  border-color: color-mix(in srgb, var(--ui-brand-500) 48%, transparent);
  background: color-mix(in srgb, var(--ui-brand-500) 18%, var(--ui-bg-surface-raised));
  color: var(--ui-brand-600);
}

.land-card-batch-tags {
  position: absolute;
  left: 0.68rem;
  right: 2.25rem;
  top: 3.65rem;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}

.land-card-batch-tags__item {
  display: inline-flex;
  align-items: center;
  min-height: 1.15rem;
  padding: 0.1rem 0.42rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 78%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, white 10%);
  font-size: 0.56rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(8px);
}

.land-card-batch-tags__item.is-harvest {
  color: color-mix(in srgb, #f97316 90%, white 10%);
  border-color: color-mix(in srgb, #fb923c 42%, transparent);
  background: color-mix(in srgb, #fb923c 16%, var(--ui-bg-surface-raised));
}

.land-card-batch-tags__item.is-water {
  color: color-mix(in srgb, #0284c7 88%, white 12%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 14%, var(--ui-bg-surface-raised));
}

.land-card-batch-tags__item.is-weed {
  color: color-mix(in srgb, #15803d 88%, white 12%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 13%, var(--ui-bg-surface-raised));
}

.land-card-batch-tags__item.is-bug {
  color: color-mix(in srgb, #dc2626 90%, white 10%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 13%, var(--ui-bg-surface-raised));
}

.land-card-batch-tags__item.is-watch {
  color: var(--ui-text-2);
}

.land-card-theme.is-operating {
  pointer-events: none;
}

.land-card-theme::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: transparent;
  opacity: 0;
  transition: opacity 200ms ease, background 200ms ease;
}

.land-card-hover-time {
  position: absolute;
  left: 0.7rem;
  right: 0.7rem;
  bottom: 0.7rem;
  z-index: 5;
  display: grid;
  gap: 0.24rem;
  padding: 0.6rem 0.68rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  border-radius: 0.95rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 16%, transparent), transparent 32%),
    color-mix(in srgb, var(--ui-bg-surface-raised) 92%, transparent);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(16px);
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
}

.land-card-theme:hover .land-card-hover-time,
.land-card-theme:focus-visible .land-card-hover-time,
.land-card-theme:focus-within .land-card-hover-time {
  opacity: 1;
  transform: translateY(0);
}

.land-card-hover-time__title {
  margin-bottom: 0.08rem;
  color: var(--ui-text-1);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.land-card-hover-time__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.62rem;
  line-height: 1.3;
}

.land-card-hover-time__label {
  color: var(--ui-text-3);
}

.land-card-hover-time__value {
  color: var(--ui-text-1);
  font-weight: 700;
  text-align: right;
}

.land-card-operating {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1rem;
  text-align: center;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(3px);
}

.land-card-operating__spinner {
  font-size: 1.45rem;
  color: white;
}

.land-card-operating__text {
  max-width: 10rem;
  font-size: 0.76rem;
  line-height: 1.4;
  font-weight: 700;
  color: white;
}

.land-card-primary-status {
  position: absolute;
  left: 0.65rem;
  top: 1.8rem;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  min-height: 1.35rem;
  padding: 0.18rem 0.52rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1;
  color: var(--ui-text-1);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 90%, white 10%);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(8px);
}

.land-card-theme.is-compact .land-card-primary-status {
  left: 0.52rem;
  top: 1.55rem;
  min-height: 1.2rem;
  padding: 0.14rem 0.42rem;
  font-size: 0.56rem;
}

.land-card-theme.is-selection-mode.is-batch-harvest {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fb923c 34%, transparent);
}

.land-card-theme.is-selection-mode.is-batch-water {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #38bdf8 34%, transparent);
}

.land-card-theme.is-selection-mode.is-batch-weed {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #22c55e 34%, transparent);
}

.land-card-theme.is-selection-mode.is-batch-bug {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #ef4444 34%, transparent);
}

.land-card-theme.is-selection-mode.is-batch-watch {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-text-3) 18%, transparent);
}

.land-card-theme.is-recently-touched .land-card-primary-status,
.land-card-theme.is-recently-touched .land-card-batch-tags__item,
.land-card-theme.is-recently-touched .land-card-select-indicator {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-status-success) 18%, transparent);
}

.land-card-primary-status.is-harvest {
  color: color-mix(in srgb, #f97316 90%, white 10%);
  border-color: color-mix(in srgb, #fb923c 42%, transparent);
  background: color-mix(in srgb, #fb923c 16%, var(--ui-bg-surface-raised));
}

.land-card-primary-status.is-water {
  color: color-mix(in srgb, #0284c7 88%, white 12%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 14%, var(--ui-bg-surface-raised));
}

.land-card-primary-status.is-weed {
  color: color-mix(in srgb, #15803d 88%, white 12%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 13%, var(--ui-bg-surface-raised));
}

.land-card-primary-status.is-bug {
  color: color-mix(in srgb, #dc2626 90%, white 10%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 13%, var(--ui-bg-surface-raised));
}

.land-card-primary-status.is-soon,
.land-card-primary-status.is-stage {
  color: color-mix(in srgb, #d97706 88%, white 12%);
  border-color: color-mix(in srgb, #facc15 40%, transparent);
  background: color-mix(in srgb, #facc15 15%, var(--ui-bg-surface-raised));
}

.land-card-primary-status.is-idle,
.land-card-primary-status.is-locked {
  color: var(--ui-text-2);
}

.land-card-quick-tip {
  margin-top: 0.45rem;
  font-size: 0.62rem;
  line-height: 1.3;
  text-align: center;
  opacity: 0.72;
}

.land-card-theme.is-compact .land-card-quick-tip {
  margin-top: 0.3rem;
  font-size: 0.58rem;
}

.land-card-theme.is-compact .land-card-hover-time {
  left: 0.52rem;
  right: 0.52rem;
  bottom: 0.52rem;
  padding: 0.48rem 0.55rem;
}

.land-card-theme.is-compact .land-card-hover-time__title {
  font-size: 0.58rem;
}

.land-card-theme.is-compact .land-card-hover-time__row {
  font-size: 0.56rem;
}

.land-card-figure {
  width: 4.5rem;
  height: 4.5rem;
}

.land-card-theme.is-compact .land-card-figure {
  width: 3.65rem;
  height: 3.65rem;
  margin-top: 2rem;
  margin-bottom: 0.35rem;
}

.land-card-theme.is-selection-mode .land-card-figure {
  margin-top: 3.25rem;
}

.land-card-theme.is-selection-mode.is-compact .land-card-figure {
  margin-top: 3rem;
}

.land-card-title {
  font-size: 15px;
}

.land-card-theme.is-compact .land-card-title {
  font-size: 13px;
}

.land-card-subtitle {
  font-size: 11px;
}

.land-card-theme.is-compact .land-card-subtitle {
  margin-top: 0.2rem;
  margin-bottom: 0.45rem;
  font-size: 10px;
  line-height: 1.35;
}

.land-card-theme.is-compact .land-card-progress--primary {
  padding: 0.34rem 0.42rem 0.42rem;
}

.land-card-theme.is-compact .land-card-summary__row {
  font-size: 0.58rem;
}

.land-card-theme.is-compact .land-card-summary__hint,
.land-card-theme.is-compact .land-card-idle-panel__note,
.land-card-theme.is-compact .land-card-progress__detail,
.land-card-theme.is-compact .land-card-progress__hint {
  font-size: 0.56rem;
}

.land-card-theme.is-compact .land-card-idle-panel {
  padding: 0.42rem 0.42rem;
}

.land-card-theme.is-compact .land-card-actions__item {
  padding: 0.12rem 0.42rem;
  font-size: 0.58rem;
}

.land-card-theme.is-compact .land-card-batch-tags {
  left: 0.52rem;
  right: 2rem;
  top: 3.2rem;
  gap: 0.22rem;
}

.land-card-theme.is-compact .land-card-batch-tags__item {
  min-height: 1.02rem;
  padding-inline: 0.34rem;
  font-size: 0.52rem;
}

.land-card-quick-menu {
  position: fixed;
  z-index: 90;
  min-width: 10.5rem;
  padding: 0.45rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, white 18%);
  border-radius: 1rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 18%, transparent), transparent 28%),
    color-mix(in srgb, var(--ui-bg-elevated) 92%, white 8%);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.2);
  backdrop-filter: blur(18px);
}

.land-card-quick-menu__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.8rem;
  border: none;
  border-radius: 0.85rem;
  background: transparent;
  color: var(--ui-text-1);
  font-size: 0.8rem;
  font-weight: 700;
  text-align: left;
  transition: background-color 160ms ease, transform 160ms ease;
}

.land-card-quick-menu__item:hover:not(:disabled) {
  transform: translateY(-1px);
}

.land-card-quick-menu__item.is-harvest:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.14);
}

.land-card-quick-menu__item.is-water:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.14);
}

.land-card-quick-menu__item.is-weed:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.14);
}

.land-card-quick-menu__item.is-bug:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.14);
}

.land-card-quick-menu__item:disabled {
  opacity: 0.55;
  cursor: wait;
}

.land-card-quick-menu__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  flex: none;
}

.land-card-quick-menu__dot.is-harvest {
  background: #f59e0b;
}

.land-card-quick-menu__dot.is-water {
  background: #3b82f6;
}

.land-card-quick-menu__dot.is-weed {
  background: #22c55e;
}

.land-card-quick-menu__dot.is-bug {
  background: #ef4444;
}

@keyframes land-card-success-flash {
  0% {
    transform: translateY(0) scale(1);
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--ui-status-success) 0%, transparent),
      0 8px 18px -16px color-mix(in srgb, var(--ui-status-success) 0%, transparent);
  }
  18% {
    transform: translateY(-2px) scale(1.01);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--ui-status-success) 28%, transparent),
      0 20px 34px -24px color-mix(in srgb, var(--ui-status-success) 36%, transparent);
  }
  100% {
    transform: translateY(0) scale(1);
    box-shadow:
      0 0 0 0 color-mix(in srgb, var(--ui-status-success) 0%, transparent),
      0 10px 22px -18px color-mix(in srgb, var(--ui-status-success) 0%, transparent);
  }
}

@keyframes land-card-success-ring {
  0% {
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.land-card-index,
.land-card-empty-icon {
  color: var(--ui-text-3);
}

.land-card-theme:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-brand-500) 72%, white 28%);
  outline-offset: 2px;
}

.land-card-figure.is-visual-empty,
.land-card-empty-icon.is-visual-empty {
  color: color-mix(in srgb, #22c55e 72%, white 28%);
}

.land-card-figure.is-visual-locked,
.land-card-empty-icon.is-visual-locked {
  color: color-mix(in srgb, #94a3b8 82%, white 18%);
}

.land-card-figure.is-visual-dead,
.land-card-empty-icon.is-visual-dead {
  color: color-mix(in srgb, #ef4444 82%, white 18%);
}

.land-card-meta :deep(.land-chip) {
  border-radius: 999px;
  padding-inline: 0.42rem;
}

.land-card-meta :deep(.land-chip:first-child) {
  font-weight: 700;
}

.land-card-timer {
  color: var(--ui-status-warning);
  font-weight: 600;
}

.land-card-progress__meta {
  letter-spacing: 0.01em;
  opacity: 0.9;
}

.land-card-progress__detail,
.land-card-progress__hint {
  opacity: 0.82;
}

.land-card-progress--primary {
  padding: 0.45rem 0.5rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 74%, transparent);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 48%, transparent);
}

.land-card-summary {
  padding-inline: 0.2rem;
}

.land-card-summary__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.64rem;
  line-height: 1.3;
}

.land-card-summary__row + .land-card-summary__row {
  margin-top: 0.15rem;
}

.land-card-summary__label {
  opacity: 0.78;
}

.land-card-summary__value {
  font-weight: 700;
}

.land-card-summary__hint {
  margin-top: 0.25rem;
  font-size: 0.62rem;
  line-height: 1.25;
  text-align: center;
  opacity: 0.72;
}

.land-card-idle-panel {
  width: 100%;
  margin-top: auto;
  padding: 0.55rem 0.5rem;
  border: 1px dashed color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 38%, transparent);
  text-align: center;
}

.land-card-idle-panel__title {
  font-size: 0.68rem;
  font-weight: 700;
}

.land-card-idle-panel__note {
  margin-top: 0.22rem;
  font-size: 0.62rem;
  line-height: 1.35;
  opacity: 0.76;
}

.land-card-actions__rail {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: center;
  padding-top: 0.1rem;
}

.land-card-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.land-card-detail__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.land-card-detail__quick-btn {
  flex: 1 1 8rem;
  min-height: 2.6rem;
  border-radius: 0.95rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 74%, transparent);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ui-text-1);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.land-card-detail__quick-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.land-card-detail__quick-btn.is-harvest {
  color: color-mix(in srgb, #f97316 88%, white 12%);
  border-color: color-mix(in srgb, #fb923c 40%, transparent);
  background: color-mix(in srgb, #fb923c 12%, var(--ui-bg-surface-raised));
}

.land-card-detail__quick-btn.is-water {
  color: color-mix(in srgb, #38bdf8 84%, white 16%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 11%, var(--ui-bg-surface-raised));
}

.land-card-detail__quick-btn.is-weed {
  color: color-mix(in srgb, #22c55e 84%, white 16%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 11%, var(--ui-bg-surface-raised));
}

.land-card-detail__quick-btn.is-bug {
  color: color-mix(in srgb, #ef4444 86%, white 14%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 10%, var(--ui-bg-surface-raised));
}

.land-card-actions__item {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  border-radius: 999px;
  padding: 0.14rem 0.5rem;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--ui-text-2);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.land-card-actions__item.is-harvest {
  color: color-mix(in srgb, #f97316 88%, white 12%);
  border-color: color-mix(in srgb, #fb923c 42%, transparent);
  background: color-mix(in srgb, #fb923c 16%, var(--ui-bg-surface-raised));
}

.land-card-actions__item.is-soon,
.land-card-actions__item.is-stage {
  color: color-mix(in srgb, #f59e0b 88%, white 12%);
  border-color: color-mix(in srgb, #facc15 40%, transparent);
  background: color-mix(in srgb, #facc15 14%, var(--ui-bg-surface-raised));
}

.land-card-actions__item.is-water {
  color: color-mix(in srgb, #38bdf8 84%, white 16%);
  border-color: color-mix(in srgb, #38bdf8 38%, transparent);
  background: color-mix(in srgb, #38bdf8 13%, var(--ui-bg-surface-raised));
}

.land-card-actions__item.is-weed {
  color: color-mix(in srgb, #22c55e 84%, white 16%);
  border-color: color-mix(in srgb, #22c55e 38%, transparent);
  background: color-mix(in srgb, #22c55e 13%, var(--ui-bg-surface-raised));
}

.land-card-actions__item.is-bug {
  color: color-mix(in srgb, #ef4444 86%, white 14%);
  border-color: color-mix(in srgb, #ef4444 36%, transparent);
  background: color-mix(in srgb, #ef4444 12%, var(--ui-bg-surface-raised));
}

.land-card-detail__overlay {
  background: rgba(2, 6, 23, 0.58);
  backdrop-filter: blur(6px);
}

.land-card-detail__eyebrow {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ui-text-3);
}

.land-card-detail__title {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--ui-text-1);
}

.land-card-detail__desc {
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--ui-text-2);
}

.land-card-detail__close {
  width: 2.4rem;
  height: 2.4rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 76%, transparent);
  color: var(--ui-text-2);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.land-card-detail__grid {
  display: grid;
  gap: 0.65rem;
}

.land-card-detail__feedback {
  border-radius: 0.9rem;
  padding: 0.7rem 0.85rem;
  font-size: 0.82rem;
  line-height: 1.45;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 72%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 52%, transparent);
  color: var(--ui-text-1);
}

.land-card-detail__feedback.is-info {
  border-color: color-mix(in srgb, #38bdf8 34%, transparent);
  background: color-mix(in srgb, #38bdf8 10%, var(--ui-bg-surface-raised));
}

.land-card-detail__feedback.is-success {
  border-color: color-mix(in srgb, #22c55e 34%, transparent);
  background: color-mix(in srgb, #22c55e 10%, var(--ui-bg-surface-raised));
}

.land-card-detail__feedback.is-error {
  border-color: color-mix(in srgb, #ef4444 34%, transparent);
  background: color-mix(in srgb, #ef4444 10%, var(--ui-bg-surface-raised));
}

.land-card-detail__row {
  display: grid;
  grid-template-columns: 5.25rem 1fr;
  gap: 0.9rem;
  align-items: start;
  padding: 0.55rem 0.65rem;
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 40%, transparent);
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 68%, transparent);
}

.land-card-detail__label {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--ui-text-3);
}

.land-card-detail__value {
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--ui-text-1);
  word-break: break-word;
}

.land-card-progress__track {
  overflow: hidden;
  height: 0.48rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
  box-shadow: inset 0 1px 2px color-mix(in srgb, black 10%, transparent);
}

.land-card-progress__track.is-stage {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 62%, transparent);
}

.land-card-progress__track.is-tone-sprout {
  background: color-mix(in srgb, #22c55e 10%, var(--ui-bg-surface-raised));
}

.land-card-progress__track.is-tone-grow {
  background: color-mix(in srgb, #3b82f6 10%, var(--ui-bg-surface-raised));
}

.land-card-progress__track.is-tone-bloom {
  background: color-mix(in srgb, #f59e0b 12%, var(--ui-bg-surface-raised));
}

.land-card-progress__track.is-tone-ripe {
  background: color-mix(in srgb, #f97316 12%, var(--ui-bg-surface-raised));
}

.land-card-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-brand-500) 72%, var(--ui-status-info) 28%),
    color-mix(in srgb, var(--ui-status-warning) 58%, var(--ui-brand-500) 42%)
  );
  box-shadow: 0 0 12px color-mix(in srgb, var(--ui-brand-500) 24%, transparent);
  transition: width 240ms ease;
}

.land-card-theme:hover .land-card-progress__fill {
  box-shadow: 0 0 14px color-mix(in srgb, var(--ui-brand-500) 28%, transparent);
}

.land-card-progress__fill.is-stage {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, #34d399 74%, var(--ui-status-info) 26%),
    color-mix(in srgb, #facc15 62%, #34d399 38%)
  );
}

.land-card-progress__fill.is-tone-sprout {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, #22c55e 82%, white 18%),
    color-mix(in srgb, #4ade80 74%, #22c55e 26%)
  );
}

.land-card-progress__fill.is-tone-grow {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, #38bdf8 78%, white 22%),
    color-mix(in srgb, #3b82f6 78%, #38bdf8 22%)
  );
}

.land-card-progress__fill.is-tone-bloom {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, #f59e0b 80%, white 20%),
    color-mix(in srgb, #facc15 72%, #f59e0b 28%)
  );
}

.land-card-progress__fill.is-tone-ripe {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, #fb923c 82%, white 18%),
    color-mix(in srgb, #f97316 78%, #facc15 22%)
  );
}

.land-card-progress__fill.is-harvestable {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-status-warning) 84%, white 16%),
    color-mix(in srgb, var(--ui-status-success) 58%, var(--ui-status-warning) 42%)
  );
  box-shadow: 0 0 12px color-mix(in srgb, var(--ui-status-warning) 28%, transparent);
}

.land-card-level-default {
  background: color-mix(in srgb, var(--ui-bg-surface) 62%, transparent);
  border-color: var(--ui-border-subtle);
}

.land-card-level-1 {
  background: color-mix(in srgb, #facc15 10%, var(--ui-bg-surface));
  border-color: color-mix(in srgb, #facc15 24%, var(--ui-border-subtle));
}

.land-card-level-2 {
  background: color-mix(in srgb, #ef4444 10%, var(--ui-bg-surface));
  border-color: color-mix(in srgb, #ef4444 24%, var(--ui-border-subtle));
}

.land-card-level-3 {
  background: color-mix(in srgb, #475569 14%, var(--ui-bg-surface));
  border-color: color-mix(in srgb, #475569 24%, var(--ui-border-subtle));
}

.land-card-level-4 {
  background: color-mix(in srgb, #f59e0b 12%, var(--ui-bg-surface));
  border-color: color-mix(in srgb, #f59e0b 26%, var(--ui-border-subtle));
}

.land-card-state-locked {
  background: color-mix(in srgb, var(--ui-bg-surface) 54%, transparent);
  border-color: var(--ui-border-subtle);
  border-style: dashed;
  opacity: 0.6;
}

.land-card-state-dead {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 42%, transparent);
  border-color: var(--ui-border-subtle);
  filter: grayscale(1);
}

.land-card-state-harvestable {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-status-warning) 40%, transparent);
}

.land-card-state-stealable {
  box-shadow: 0 0 0 2px color-mix(in srgb, #7c3aed 38%, transparent);
}

.land-card-alert-stage {
  box-shadow:
    0 0 0 1px color-mix(in srgb, #facc15 26%, transparent),
    0 10px 28px color-mix(in srgb, #facc15 10%, transparent);
}

.land-card-alert-stage::before {
  opacity: 1;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, #facc15 74%, white 26%), transparent);
}

.land-card-alert-soon {
  box-shadow:
    0 0 0 1px color-mix(in srgb, #fb923c 34%, transparent),
    0 12px 32px color-mix(in srgb, #fb923c 14%, transparent);
}

.land-card-alert-soon::before {
  opacity: 1;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, #fb923c 84%, white 16%), transparent);
}

.land-card-alert-ripe {
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--ui-status-warning) 44%, transparent),
    0 14px 34px color-mix(in srgb, var(--ui-status-warning) 18%, transparent);
}

.land-card-alert-ripe::before {
  opacity: 1;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ui-status-warning) 18%, transparent),
    color-mix(in srgb, var(--ui-status-warning) 88%, white 12%),
    color-mix(in srgb, var(--ui-status-success) 48%, transparent)
  );
}

.land-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1rem;
  border-width: 1px;
  border-style: solid;
  border-radius: 0.25rem;
  padding: 0 0.125rem;
  font-weight: 600;
  line-height: 1;
}

@media (max-width: 767px) {
  .land-card-theme {
    min-height: 182px;
    padding: 0.7rem;
    border-radius: 0.9rem;
  }

  .land-card-figure {
    width: 3.2rem;
    height: 3.2rem;
    margin-top: 1.75rem;
  }

  .land-card-theme.is-compact {
    min-height: 160px;
    padding: 0.55rem;
  }

  .land-card-theme.is-compact .land-card-figure {
    width: 2.85rem;
    height: 2.85rem;
    margin-top: 1.85rem;
  }

  .land-card-hover-time {
    display: none;
  }

  .land-card-primary-status {
    left: 0.55rem;
    top: 1.7rem;
    padding-inline: 0.45rem;
    font-size: 0.58rem;
  }

  .land-card-meta {
    max-width: calc(100% - 1rem);
  }

  .land-card-index {
    font-size: 0.66rem;
  }

  .land-card-index {
    font-size: 0.68rem;
  }

  .land-card-theme .glass-text-main {
    font-size: 0.8rem;
  }

  .land-card-theme .glass-text-muted {
    font-size: 0.68rem;
    line-height: 1.35;
  }

  .land-chip {
    padding: 0.05rem 0.2rem;
    font-size: 0.62rem;
  }

  .land-card-quick-menu {
    min-width: 9.6rem;
  }
}
</style>
