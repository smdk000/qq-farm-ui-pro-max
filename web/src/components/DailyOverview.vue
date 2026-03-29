<script setup lang="ts">
import { computed } from 'vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const props = defineProps<{
  dailyGifts: any
}>()

const GIFT_ICONS: Record<string, string> = {
  task_claim: 'i-carbon-task-complete',
  email_rewards: 'i-carbon-email',
  fertilizer_buy: 'i-carbon-shopping-cart',
  mall_free_gifts: 'i-carbon-shopping-bag',
  daily_share: 'i-carbon-share',
  vip_daily_gift: 'i-carbon-star',
  month_card_gift: 'i-carbon-calendar',
  open_server_gift: 'i-carbon-gift',
}

function getGiftIcon(key: string) {
  return GIFT_ICONS[key] || 'i-carbon-gift'
}

const hasDailyData = computed(() => !!props.dailyGifts)
const gifts = computed(() => props.dailyGifts?.gifts || [])
const dailySummaryChips = computed(() => {
  const list = gifts.value
  const done = list.filter((gift: any) => !!gift?.doneToday).length
  const enabled = list.filter((gift: any) => !gift?.doneToday && !!gift?.enabled).length
  const idle = Math.max(0, list.length - done - enabled)
  return [
    { key: 'total', label: `共 ${list.length} 项`, tone: 'ui-meta-chip--info' },
    { key: 'done', label: `已完成 ${done}`, tone: 'ui-meta-chip--success' },
    { key: 'enabled', label: `待执行 ${enabled}`, tone: 'ui-meta-chip--warning' },
    { key: 'idle', label: `未开启 ${idle}`, tone: 'ui-meta-chip--neutral' },
  ]
})

function formatTime(timestamp: number) {
  if (!timestamp)
    return '未领取'
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getGiftStatusText(gift: any) {
  if (!gift)
    return '未知'
  if (gift.key === 'fertilizer_buy') {
    if (!gift.enabled)
      return '未开启'
    if (gift.result === 'purchased')
      return '已自动购买'
    if (gift.reason === 'threshold_not_reached')
      return '阈值未触发'
    if (gift.reason === 'daily_limit')
      return '今日已达上限'
    if (gift.reason === 'no_coupon')
      return '点券不足'
    if (gift.reason === 'missing_goods')
      return '商城礼包失配'
    if (gift.reason === 'limit_reached')
      return '已补到目标库存'
    if (gift.reason === 'buy_disabled')
      return '自动购肥已关闭'
    if (gift.result === 'error')
      return '执行异常'
    return '等待执行'
  }
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return '未开通'
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return '未开通'
  if (gift.doneToday)
    return '今日已完成'
  if (gift.enabled)
    return '等待执行'
  return '未开启'
}

function formatGiftSubText(gift: any) {
  if (!gift)
    return ''
  if (gift.key === 'fertilizer_buy') {
    if (!gift.enabled)
      return ''
    const normalHours = Number(gift.containerHours?.normal || 0)
    const organicHours = Number(gift.containerHours?.organic || 0)
    const normalTarget = Number(gift.targetHours?.normal || 0)
    const organicTarget = Number(gift.targetHours?.organic || 0)
    const normalBought = Number(gift.typeCounts?.normal || 0)
    const organicBought = Number(gift.typeCounts?.organic || 0)
    const missingTypes = Array.isArray(gift.missingTypes) ? gift.missingTypes.filter(Boolean) : []
    const scopeText = `普通 ${normalHours.toFixed(1)}h/${normalTarget.toFixed(0)}h · 有机 ${organicHours.toFixed(1)}h/${organicTarget.toFixed(0)}h`
    if (gift.message)
      return `${gift.message} · ${scopeText}`
    if (gift.reason === 'threshold_not_reached')
      return `当前库存已高于触发阈值 · ${scopeText}`
    if (gift.reason === 'daily_limit' || gift.reason === 'limit_reached')
      return `今日购买已满足规则 · ${scopeText}`
    if (gift.reason === 'no_coupon' || gift.pausedNoGoldToday)
      return `点券不足，今日暂停继续购买 · ${scopeText}`
    if (gift.reason === 'missing_goods' && missingTypes.length)
      return `商城暂缺 ${missingTypes.join('、')} 对应礼包 · ${scopeText}`
    if (normalBought > 0 || organicBought > 0)
      return `今日购买 普通 ${normalBought} / 有机 ${organicBought}`
    return `容器状态 · ${scopeText}`
  }
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return '未开通QQ会员或无每日礼包'
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return '未购买月卡或已过期'
  const ts = Number(gift.lastAt || 0)
  if (!ts)
    return ''
  if (gift.doneToday)
    return `完成时间 ${formatTime(ts)}`
  if (gift.enabled)
    return `上次执行 ${formatTime(ts)}`
  return `上次检测 ${formatTime(ts)}`
}

function formatGiftProgress(gift: any) {
  if (!gift)
    return ''
  const total = Number(gift.totalCount || 0)
  const current = Number(gift.completedCount || 0)
  if (!total)
    return ''
  return `进度：${current}/${total}`
}
</script>

<template>
  <div class="daily-overview flex flex-col gap-4">
    <!-- Daily Gifts Grid -->
    <div class="daily-overview-panel glass-panel rounded-lg p-4 shadow-sm">
      <div class="daily-overview-toolbar ui-mobile-sticky-panel">
        <h3 class="glass-text-main flex items-center gap-2 font-medium">
          <div class="daily-overview-title-icon i-carbon-gift" />
          <span>每日礼包 & 任务</span>
        </h3>
        <p class="daily-overview-toolbar__desc">
          每日任务领奖、免费礼包和月卡奖励都会在这里汇总展示当前状态。
        </p>
        <div v-if="gifts.length" class="daily-overview-toolbar__chips ui-bulk-actions">
          <span
            v-for="item in dailySummaryChips"
            :key="item.key"
            class="daily-summary-chip"
            :class="item.tone"
          >
            {{ item.label }}
          </span>
        </div>
      </div>

      <BaseEmptyState
        v-if="!hasDailyData"
        compact
        class="daily-overview-empty glass-text-muted rounded-lg p-6 text-center text-sm"
        icon="i-carbon-user-avatar"
        title="等待账号连接"
        description="登录账号后即可查看每日礼包、任务和领取进度。"
      />
      <BaseEmptyState
        v-else-if="!gifts.length"
        compact
        class="daily-overview-empty glass-text-muted rounded-lg p-6 text-center text-sm"
        icon="i-carbon-gift"
        title="暂无每日数据"
        description="当前账号暂未同步到礼包或任务信息，可以稍后再刷新查看。"
      />
      <div v-else class="daily-overview-grid">
        <div
          v-for="gift in gifts"
          :key="gift.key"
          class="daily-overview-gift flex flex-col justify-between rounded-lg p-3 2xl:p-4"
        >
          <div class="mb-2 flex items-center gap-2">
            <div
              class="daily-overview-gift-icon h-7 w-7 flex flex-shrink-0 items-center justify-center rounded-md 2xl:h-8 2xl:w-8"
              :class="gift.doneToday ? 'is-done' : (gift.enabled ? 'is-enabled' : 'is-idle')"
            >
              <div
                class="daily-overview-gift-glyph text-base 2xl:text-lg"
                :class="[getGiftIcon(gift.key), gift.doneToday ? 'is-done' : (gift.enabled ? 'is-enabled' : 'is-idle')]"
              />
            </div>
            <span class="glass-text-main text-sm font-medium leading-tight 2xl:text-base">
              {{ gift.label }}
            </span>
          </div>

          <div class="flex items-end justify-between">
            <span
              class="daily-overview-gift-status text-xs 2xl:text-sm"
              :class="gift.doneToday ? 'is-done' : (gift.enabled ? 'is-enabled' : 'is-idle')"
            >
              {{ getGiftStatusText(gift) }}
            </span>

            <div class="flex flex-col items-end">
              <span v-if="formatGiftProgress(gift)" class="daily-overview-progress text-xs font-bold 2xl:text-sm">
                {{ formatGiftProgress(gift) }}
              </span>
              <span
                v-if="formatGiftSubText(gift)"
                class="daily-overview-subtext mt-0.5 text-[10px] 2xl:text-xs"
              >
                {{ formatGiftSubText(gift) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.daily-overview {
  color: var(--ui-text-1);
}

.daily-overview-panel,
.daily-overview-empty,
.daily-overview-gift {
  border: 1px solid var(--ui-border-subtle);
}

.daily-overview-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.daily-overview-toolbar__desc {
  color: var(--ui-text-2);
  font-size: 0.84rem;
  line-height: 1.55;
}

.daily-overview-toolbar__chips {
  display: flex;
  gap: 0.5rem;
}

.daily-summary-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  padding: 0.25rem 0.7rem;
  border-width: 1px;
  border-style: solid;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.daily-overview-title-icon {
  color: color-mix(in srgb, var(--ui-brand-500) 58%, var(--ui-status-danger) 42%);
}

.daily-overview-empty,
.daily-overview-gift {
  background: color-mix(in srgb, var(--ui-bg-surface) 62%, transparent);
}

.daily-overview-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 640px) {
  .daily-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1536px) {
  .daily-overview-grid {
    gap: 1rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.daily-overview-gift-icon {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
}

.daily-overview-gift-icon.is-done {
  background: var(--ui-brand-soft-15);
}

.daily-overview-gift-icon.is-enabled {
  background: color-mix(in srgb, var(--ui-status-info) 14%, var(--ui-bg-surface-raised));
}

.daily-overview-gift-glyph.is-done,
.daily-overview-gift-status.is-done {
  color: var(--ui-brand-600);
}

.daily-overview-gift-glyph.is-enabled,
.daily-overview-gift-status.is-enabled {
  color: var(--ui-status-info);
}

.daily-overview-gift-glyph.is-idle {
  color: var(--ui-text-3);
}

.daily-overview-gift-status.is-idle,
.daily-overview-progress {
  color: var(--ui-text-2);
}

.daily-overview-subtext {
  color: var(--ui-text-3);
}

@media (max-width: 767px) {
  .daily-overview-toolbar {
    z-index: 11;
    padding-bottom: 0.15rem;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent) 0%,
      color-mix(in srgb, var(--ui-bg-surface) 70%, transparent) 100%
    );
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
}
</style>
