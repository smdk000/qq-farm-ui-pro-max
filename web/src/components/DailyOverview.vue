<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  dailyGifts: any
}>()

const GIFT_ICONS: Record<string, string> = {
  task_claim: 'i-carbon-task-complete',
  email_rewards: 'i-carbon-email',
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

function formatTime(timestamp: number) {
  if (!timestamp)
    return '未领取'
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getGiftStatusText(gift: any) {
  if (!gift)
    return '未知'
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
  <div class="flex flex-col gap-4">
    <!-- Daily Gifts Grid -->
    <div class="glass-panel border border-white/20 rounded-lg p-4 shadow-sm dark:border-white/10">
      <h3 class="glass-text-main mb-3 flex items-center gap-2 font-medium">
        <div class="i-carbon-gift text-pink-500" />
        <span>每日礼包 & 任务</span>
      </h3>

      <div
        v-if="!hasDailyData"
        class="glass-text-muted border border-white/20 rounded-lg bg-black/5 p-6 text-center text-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/20"
      >
        请登录账号后查看
      </div>
      <div
        v-else-if="!gifts.length"
        class="glass-text-muted border border-white/20 rounded-lg bg-black/5 p-6 text-center text-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/20"
      >
        暂无每日礼包与任务数据
      </div>
      <div v-else class="grid grid-cols-2 gap-3 2xl:grid-cols-3 sm:grid-cols-3 2xl:gap-4">
        <div
          v-for="gift in gifts"
          :key="gift.key"
          class="flex flex-col justify-between border border-gray-200/50 rounded-lg p-3 dark:border-white/10 2xl:p-4"
        >
          <div class="mb-2 flex items-center gap-2">
            <div
              class="h-7 w-7 flex flex-shrink-0 items-center justify-center rounded-md 2xl:h-8 2xl:w-8"
              :class="gift.doneToday ? 'bg-primary-100 dark:bg-primary-900/30' : (gift.enabled ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-700')"
            >
              <div
                class="text-base 2xl:text-lg"
                :class="[getGiftIcon(gift.key), gift.doneToday ? 'text-primary-500' : (gift.enabled ? 'text-blue-500' : 'text-gray-400')]"
              />
            </div>
            <span class="glass-text-main text-sm font-medium leading-tight 2xl:text-base">
              {{ gift.label }}
            </span>
          </div>

          <div class="flex items-end justify-between">
            <span
              class="text-xs 2xl:text-sm"
              :class="gift.doneToday ? 'text-primary-500' : (gift.enabled ? 'text-blue-500' : 'text-gray-400')"
            >
              {{ getGiftStatusText(gift) }}
            </span>

            <div class="flex flex-col items-end">
              <span v-if="formatGiftProgress(gift)" class="text-xs text-gray-500 font-bold 2xl:text-sm">
                {{ formatGiftProgress(gift) }}
              </span>
              <span
                v-if="formatGiftSubText(gift)"
                class="mt-0.5 text-[10px] text-gray-400 2xl:text-xs"
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
