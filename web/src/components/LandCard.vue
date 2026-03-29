<script setup lang="ts">
import type { MetaBadgeTone } from '@/utils/ui-badge'
import { computed } from 'vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const props = defineProps<{
  land: any
}>()

const land = computed(() => props.land)
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
const matureProgress = computed(() => {
  const matureInSec = Number(land.value?.matureInSec || 0)
  const totalGrowTime = Number(land.value?.totalGrowTime || land.value?.growTime || 0)
  if (matureInSec <= 0)
    return land.value?.status === 'harvestable' ? 100 : 0
  if (totalGrowTime <= 0)
    return 0
  const elapsed = Math.max(0, totalGrowTime - matureInSec)
  return Math.max(0, Math.min(100, Math.round((elapsed / totalGrowTime) * 100)))
})
const matureProgressLabel = computed(() => {
  const progress = matureProgress.value
  if (land.value?.status === 'harvestable')
    return '已成熟'
  if (progress >= 95)
    return '即将成熟'
  if (progress >= 60)
    return '生长后段'
  if (progress > 0)
    return '生长中'
  return ''
})

const landMetaBadges = computed(() => {
  const badges: Array<{ key: string, label: string, title?: string, tone: MetaBadgeTone }> = []
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

const landStatusBadges = computed(() => {
  const badges: Array<{ key: string, label: string, tone: MetaBadgeTone }> = []
  if (land.value?.needWater)
    badges.push({ key: 'water', label: '水', tone: 'info' })
  if (land.value?.needWeed)
    badges.push({ key: 'weed', label: '草', tone: 'brand' })
  if (land.value?.needBug)
    badges.push({ key: 'bug', label: '虫', tone: 'danger' })
  if (land.value?.status === 'harvestable')
    badges.push({ key: 'harvestable', label: '可偷', tone: 'warning' })
  return badges
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
    class="land-card-theme relative min-h-[140px] flex flex-col items-center border rounded-lg p-2 transition hover:shadow-md"
    :class="getLandStatusClass(land)"
  >
    <div class="absolute right-1 top-1 flex gap-1 text-[9px]">
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

    <div class="land-card-index absolute left-1 top-1 text-[10px] font-mono">
      #{{ land.id }}
    </div>

    <div class="land-card-figure mb-1 mt-4 h-10 w-10 flex items-center justify-center">
      <img
        v-if="land.seedImage"
        :src="getSafeImageUrl(land.seedImage)"
        class="max-h-full max-w-full object-contain"
        loading="lazy"
        referrerpolicy="no-referrer"
      >
      <div v-else class="land-card-empty-icon i-carbon-sprout text-xl" />
    </div>

    <div class="glass-text-main w-full truncate px-1 text-center text-xs font-bold" :title="land.plantName">
      {{ land.plantName || '-' }}
    </div>

    <div class="glass-text-muted mb-0.5 mt-0.5 w-full text-center text-[10px]">
      <span v-if="land.matureInSec > 0" class="land-card-timer">
        预计 {{ formatTime(land.matureInSec) }} 后成熟
      </span>
      <span v-else>
        {{ land.phaseName || (land.status === 'locked' ? '未解锁' : '未开垦') }}
      </span>
    </div>

    <div class="glass-text-muted mb-1 text-[10px]">
      {{ getLandTypeName(land.level) }}
    </div>

    <div v-if="seasonText" class="land-card-season mb-1 rounded px-1.5 py-0.5 text-[10px]">
      {{ seasonText }}
    </div>

    <div
      v-if="land.status === 'growing' || land.status === 'harvestable'"
      class="land-card-progress mb-1 mt-1 w-full px-1"
      :title="matureProgressLabel || undefined"
    >
      <div class="land-card-progress__meta glass-text-muted mb-1 flex items-center justify-between text-[10px]">
        <span>{{ matureProgressLabel || '成长进度' }}</span>
        <span>{{ matureProgress }}%</span>
      </div>
      <div class="land-card-progress__track">
        <div
          class="land-card-progress__fill"
          :class="{ 'is-harvestable': land.status === 'harvestable' }"
          :style="{ width: `${matureProgress}%` }"
        />
      </div>
    </div>

    <!-- Status Badges -->
    <div class="mt-auto flex origin-bottom scale-90 gap-0.5 text-[10px]">
      <BaseBadge
        v-for="badge in landStatusBadges"
        :key="badge.key"
        surface="meta"
        :tone="badge.tone"
        class="land-chip"
      >
        {{ badge.label }}
      </BaseBadge>
    </div>
  </div>
</template>

<style scoped>
.land-card-theme {
  color: var(--ui-text-1);
  border-color: var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 62%, transparent);
}

.land-card-index,
.land-card-empty-icon {
  color: var(--ui-text-3);
}

.land-card-season {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 76%, transparent);
  color: var(--ui-text-2);
}

.land-card-timer {
  color: var(--ui-status-warning);
}

.land-card-progress__meta {
  letter-spacing: 0.01em;
  opacity: 0.9;
}

.land-card-progress__track {
  overflow: hidden;
  height: 0.4rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 82%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
  box-shadow: inset 0 1px 2px color-mix(in srgb, black 10%, transparent);
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
    min-height: 156px;
    padding: 0.7rem;
    border-radius: 0.9rem;
  }

  .land-card-figure {
    width: 3rem;
    height: 3rem;
    margin-top: 1.5rem;
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
}
</style>
