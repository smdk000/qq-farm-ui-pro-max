/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import { useIntervalFn, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import UserInfoCard from '@/components/UserInfoCard.vue'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useSettingStore } from '@/stores/setting'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const {
  status,
  logs: statusLogs,
  accountLogs: statusAccountLogs,
  realtimeConnected,
} = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { dashboardItems } = storeToRefs(bagStore)
const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const lastBagFetchAt = ref(0)

const allLogs = computed(() => {
  const sLogs = statusLogs.value || []
  const aLogs = (statusAccountLogs.value || []).map((l: any) => ({
    ts: new Date(l.time).getTime(),
    time: l.time,
    tag: l.action === 'Error' ? '错误' : '系统',
    msg: l.reason ? `${l.msg} (${l.reason})` : l.msg,
    isAccountLog: true,
  }))

  return [...sLogs, ...aLogs].sort((a: any, b: any) => a.ts - b.ts).filter((l: any) => !l.isAccountLog)
})

const filter = useStorage('dashboard_log_filter', {
  module: '',
  event: '',
  keyword: '',
  isWarn: '',
})

const hasActiveLogFilter = computed(() =>
  !!(filter.value.module || filter.value.event || filter.value.keyword || filter.value.isWarn),
)

const modules = [
  { label: '所有模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '任务', value: 'task' },
  { label: '系统', value: 'system' },
]

const events = [
  { label: '所有事件', value: '' },
  { label: '农场巡查', value: 'farm_cycle' },
  { label: '收获作物', value: 'harvest_crop' },
  { label: '清理枯株', value: 'remove_plant' },
  { label: '种植种子', value: 'plant_seed' },
  { label: '施加化肥', value: 'fertilize' },
  { label: '土地推送', value: 'lands_notify' },
  { label: '选择种子', value: 'seed_pick' },
  { label: '购买种子', value: 'seed_buy' },
  { label: '购买化肥', value: 'fertilizer_buy' },
  { label: '开启礼包', value: 'fertilizer_gift_open' },
  { label: '获取任务', value: 'task_scan' },
  { label: '完成任务', value: 'task_claim' },
  { label: '免费礼包', value: 'mall_free_gifts' },
  { label: '分享奖励', value: 'daily_share' },
  { label: '会员礼包', value: 'vip_daily_gift' },
  { label: '月卡礼包', value: 'month_card_gift' },
  { label: '开服红包', value: 'open_server_gift' },
  { label: '图鉴奖励', value: 'illustrated_rewards' },
  { label: '邮箱领取', value: 'email_rewards' },
  { label: '出售成功', value: 'sell_success' },
  { label: '土地升级', value: 'upgrade_land' },
  { label: '土地解锁', value: 'unlock_land' },
  { label: '好友巡查', value: 'friend_cycle' },
  { label: '访问好友', value: 'visit_friend' },
]

const eventLabelMap: Record<string, string> = Object.fromEntries(
  events.filter(e => e.value).map(e => [e.value, e.label]),
)

function getEventLabel(event: string) {
  return eventLabelMap[event] || event
}

const logs = [
  { label: '所有等级', value: '' },
  { label: '普通', value: 'info' },
  { label: '警告', value: 'warn' },
]

const displayName = computed(() => {
  // Try to use nickname from status (game server)
  const gameName = status.value?.status?.name
  if (gameName)
    return gameName

  // Check login status
  if (!status.value?.connection?.connected) {
    const account = accountStore.currentAccount
    return account?.name || account?.nick || '未登录'
  }

  // Fallback to account name (usually ID) or '未命名'
  const account = accountStore.currentAccount
  return account?.name || account?.nick || '未命名'
})

// Exp Rate & Time to Level
const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/时'
  const hours = uptime / 3600
  const rate = hours > 0 ? (gain / hours) : 0
  return `${Math.floor(rate)}/时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0

  if (!needed || !uptime || gain <= 0)
    return ''

  const hours = uptime / 3600
  const ratePerHour = hours > 0 ? (gain / hours) : 0
  if (ratePerHour <= 0)
    return ''

  const expNeeded = needed - current
  const minsToLevel = expNeeded / (ratePerHour / 60)

  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

// Fertilizer & Collection
const fertilizerNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1012))
const collectionNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3001))
const collectionRare = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3002))

function formatBucketTime(item: any) {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  const count = Number(item.count || 0)
  return `${(count / 3600).toFixed(1)}h`
}

// Next Check Countdown
const nextFarmCheck = ref('--')
const nextFriendCheck = ref('--')
const localUptime = ref(0)
let localNextFarmRemainSec = 0
let localNextFriendRemainSec = 0

function updateCountdowns() {
  // Update uptime
  if (status.value?.connection?.connected) {
    localUptime.value++
  }

  // 只有在账号已连接时才显示巡查状态
  const isConnected = status.value?.connection?.connected

  if (localNextFarmRemainSec > 0) {
    localNextFarmRemainSec--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
  }
  else {
    nextFarmCheck.value = isConnected ? '巡查中...' : '--'
  }

  if (localNextFriendRemainSec > 0) {
    localNextFriendRemainSec--
    nextFriendCheck.value = formatDuration(localNextFriendRemainSec)
  }
  else {
    nextFriendCheck.value = isConnected ? '巡查中...' : '--'
  }

  // 集成体验卡倒计时
  updateTrialCountdown()
}

watch(status, (newVal) => {
  if (newVal?.nextChecks) {
    // Only update local counters if they are significantly different or 0
    // Actually, we should sync from server periodically.
    // Here we just take server value when it comes.
    localNextFarmRemainSec = newVal.nextChecks.farmRemainSec || 0
    localNextFriendRemainSec = newVal.nextChecks.friendRemainSec || 0
    updateCountdowns() // Update immediately
  }
  if (newVal?.uptime !== undefined) {
    localUptime.value = newVal.uptime
  }
}, { deep: true })

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function getLogTagClass(tag: string) {
  if (tag === '错误')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (tag === '系统')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (tag === '警告')
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
}

function getLogMsgClass(tag: string) {
  if (tag === '错误')
    return 'text-red-600 dark:text-red-400'
  return 'glass-text-main dark:text-gray-300'
}

function formatLogTime(timeStr: string) {
  // 2024/5/20 12:34:56 -> 12:34:56
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return parts.length > 1 ? parts[1] : timeStr
}

const OP_META: Record<string, { label: string, icon: string, color: string }> = {
  harvest: { label: '收获', icon: 'i-carbon-crop-growth', color: 'text-primary-500' },
  water: { label: '浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-400' },
  weed: { label: '除草', icon: 'i-carbon-cut-out', color: 'text-yellow-500' },
  bug: { label: '除虫', icon: 'i-carbon-warning-alt', color: 'text-red-400' },
  fertilize: { label: '施肥', icon: 'i-carbon-chemistry', color: 'text-emerald-500' },
  plant: { label: '种植', icon: 'i-carbon-tree', color: 'text-lime-500' },
  upgrade: { label: '土地升级', icon: 'i-carbon-upgrade', color: 'text-purple-500' },
  levelUp: { label: '账号升级', icon: 'i-carbon-user-certification', color: 'text-indigo-500' },
  steal: { label: '偷菜', icon: 'i-carbon-run', color: 'text-orange-500' },
  helpWater: { label: '帮浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-300' },
  helpWeed: { label: '帮除草', icon: 'i-carbon-cut-out', color: 'text-yellow-400' },
  helpBug: { label: '帮除虫', icon: 'i-carbon-warning-alt', color: 'text-red-300' },
  taskClaim: { label: '任务', icon: 'i-carbon-task-complete', color: 'text-indigo-500' },
  sell: { label: '出售', icon: 'i-carbon-shopping-cart', color: 'text-pink-500' },
}

function getOpName(key: string | number) {
  return OP_META[String(key)]?.label || String(key)
}

function getOpIcon(key: string | number) {
  return OP_META[String(key)]?.icon || 'i-carbon-circle-dash'
}

function getOpColor(key: string | number) {
  return OP_META[String(key)]?.color || 'text-gray-400'
}

function getExpPercent(p: any) {
  if (!p || !p.needed)
    return 0
  return Math.min(100, Math.max(0, (p.current / p.needed) * 100))
}

async function refreshBag(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastBagFetchAt.value < 2500)
    return
  lastBagFetchAt.value = now
  await bagStore.fetchBag(currentAccountId.value)
}

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    // 首次加载、断线兜底时走 HTTP；连接正常时优先走 WS 实时推送
    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
      await statusStore.fetchAccountLogs()
    }

    if (hasActiveLogFilter.value || !realtimeConnected.value) {
      await statusStore.fetchLogs(currentAccountId.value, {
        module: filter.value.module || undefined,
        event: filter.value.event || undefined,
        keyword: filter.value.keyword || undefined,
        isWarn: filter.value.isWarn === 'warn' ? true : filter.value.isWarn === 'info' ? false : undefined,
      })
    }

    // 仅在账号已运行且连接就绪后拉背包，避免启动阶段触发500
    await refreshBag()
  }
}

function clearFilter() {
  filter.value.module = ''
  filter.value.event = ''
  filter.value.keyword = ''
  filter.value.isWarn = 'all'
  refresh()
}

watch(currentAccountId, () => {
  refresh()
})

watch(() => status.value?.connection?.connected, (connected) => {
  if (connected)
    refreshBag(true)
})

watch(() => JSON.stringify(status.value?.operations || {}), (next, prev) => {
  if (!realtimeConnected.value || next === prev)
    return
  refreshBag()
})

watch(hasActiveLogFilter, (enabled) => {
  statusStore.setRealtimeLogsEnabled(!enabled)
  refresh()
})

function onLogScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el)
    return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  autoScroll.value = isNearBottom
}

// Auto scroll logs
watch(allLogs, () => {
  nextTick(() => {
    if (logContainer.value && autoScroll.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}, { deep: true })

const settingStore = useSettingStore()

onMounted(() => {
  statusStore.setRealtimeLogsEnabled(!hasActiveLogFilter.value)
  refresh()
  settingStore.fetchTrialCardConfig()
})

// Auto refresh fallback every 10s (WS 断开或筛选条件启用时会回退 HTTP)
useIntervalFn(refresh, 10000)
// Countdown timer (every 1s)
useIntervalFn(updateCountdowns, 1000)

// ============ 体验卡续费横幅 ============
const dashboardTrialRenewing = ref(false)
const trialCountdownText = ref('')

const dashboardCurrentUser = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('current_user') || 'null')
  }
  catch { return null }
})

const showDashboardTrialBanner = computed(() => {
  const user = dashboardCurrentUser.value
  if (!user?.card || user.card.type !== 'T')
    return false
  if (!settingStore.settings.trialConfig.userRenewEnabled)
    return false
  const expires = user.card.expiresAt
  if (!expires)
    return false
  return expires - Date.now() <= 24 * 60 * 60 * 1000
})

const dashboardTrialIsExpired = computed(() => {
  const user = dashboardCurrentUser.value
  if (!user?.card?.expiresAt)
    return false
  return user.card.expiresAt < Date.now()
})

function updateTrialCountdown() {
  const user = dashboardCurrentUser.value
  if (!user?.card?.expiresAt || dashboardTrialIsExpired.value) {
    trialCountdownText.value = ''
    return
  }
  const diff = user.card.expiresAt - Date.now()
  const hours = Math.floor(diff / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
  const seconds = Math.floor((diff % (60 * 1000)) / 1000)
  trialCountdownText.value = `还需要在 ${hours}小时 ${minutes}分 ${seconds}秒 内续费`
}

// 移除本地重复的 updateCountdowns 定义

async function handleDashboardTrialRenew() {
  dashboardTrialRenewing.value = true
  try {
    const res = await api.post('/api/auth/trial-renew')
    if (res.data.ok) {
      const user = { ...dashboardCurrentUser.value, card: res.data.data.card }
      localStorage.setItem('current_user', JSON.stringify(user))
    }
    else {
      console.warn(res.data.error || '续费失败')
    }
  }
  catch (e: any) {
    console.warn(e.response?.data?.error || e.message || '续费异常')
  }
  finally {
    dashboardTrialRenewing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 pt-6 md:h-full">
    <!-- 用户信息卡片 -->
    <UserInfoCard />

    <!-- 体验卡续费横幅 -->
    <div
      v-if="showDashboardTrialBanner"
      class="trial-pulse-banner flex items-center justify-between gap-4 rounded-lg bg-orange-50 px-4 py-3 text-sm shadow dark:bg-orange-900/20"
    >
      <div class="flex items-center gap-2 text-orange-700 dark:text-orange-300">
        <span class="text-lg">⏰</span>
        <span class="font-medium">
          你的体验卡{{ dashboardTrialIsExpired ? '已过期' : '即将过期' }}。{{ trialCountdownText }} 点击一键续费继续使用
        </span>
      </div>
      <button
        :disabled="dashboardTrialRenewing"
        class="shrink-0 rounded-lg bg-orange-500 px-4 py-1.5 text-sm text-white font-medium transition-colors hover:bg-orange-600 disabled:opacity-50"
        @click="handleDashboardTrialRenew"
      >
        {{ dashboardTrialRenewing ? '续费中...' : '🔄 一键续费' }}
      </button>
    </div>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
      <!-- Account & Exp -->
      <div class="glass-panel flex flex-col rounded-lg p-3 shadow">
        <div class="mb-1 flex items-start justify-between">
          <div class="glass-text-muted flex items-center gap-1.5 text-sm">
            <div class="i-fas-user-circle" />
            账号
          </div>
          <div class="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Lv.{{ status?.status?.level || 0 }}
          </div>
        </div>
        <div class="glass-text-main mb-1 truncate text-xl font-bold" :title="displayName">
          {{ displayName }}
        </div>

        <!-- Level Progress -->
        <div class="mt-auto">
          <div class="glass-text-muted mb-1 flex justify-between text-xs">
            <div class="flex items-center gap-1">
              <div class="i-fas-bolt text-blue-400" />
              <span>EXP</span>
            </div>
            <span>{{ status?.levelProgress?.current || 0 }} / {{ status?.levelProgress?.needed || '?' }}</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100/50 dark:bg-gray-700/50">
            <div
              class="h-full rounded-full bg-blue-500 transition-all duration-500"
              :style="{ width: `${getExpPercent(status?.levelProgress)}%` }"
            />
          </div>
          <div class="glass-text-muted mt-2 flex justify-between text-xs">
            <span>效率: {{ expRate }}</span>
            <span>{{ timeToLevel }}</span>
          </div>
        </div>
      </div>

      <!-- Assets & Status -->
      <div class="glass-panel flex flex-col justify-between rounded-lg p-3 shadow">
        <div class="flex justify-between">
          <div>
            <div class="glass-text-muted flex items-center gap-1.5 text-xs">
              <div class="i-fas-coins text-yellow-500" />
              金币
            </div>
            <div class="text-2xl text-yellow-600 font-bold dark:text-yellow-500">
              {{ status?.status?.gold || 0 }}
            </div>
            <div
              v-if="(status?.sessionGoldGained || 0) !== 0"
              class="text-[10px]"
              :class="(status?.sessionGoldGained || 0) > 0 ? 'text-green-500' : 'text-red-500'"
            >
              {{ (status?.sessionGoldGained || 0) > 0 ? '+' : '' }}{{ status?.sessionGoldGained || 0 }}
            </div>
          </div>
          <div class="text-right">
            <div class="glass-text-muted flex items-center justify-end gap-1.5 text-xs">
              <div class="i-fas-ticket-alt text-emerald-400" />
              点券
            </div>
            <div class="text-2xl text-emerald-500 font-bold dark:text-emerald-400">
              {{ status?.status?.coupon || 0 }}
            </div>
            <div
              v-if="(status?.sessionCouponGained || 0) !== 0"
              class="text-[10px]"
              :class="(status?.sessionCouponGained || 0) > 0 ? 'text-green-500' : 'text-red-500'"
            >
              {{ (status?.sessionCouponGained || 0) > 0 ? '+' : '' }}{{ status?.sessionCouponGained || 0 }}
            </div>
          </div>
        </div>
        <div class="mt-3 border-t border-gray-100/50 pt-2 dark:border-gray-700/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="h-2.5 w-2.5 rounded-full" :class="status?.connection?.connected ? 'bg-green-500' : 'bg-red-500'" />
              <span class="glass-text-main text-xs font-bold">{{ status?.connection?.connected ? '在线' : '离线' }}</span>
            </div>
            <div class="glass-text-muted flex items-center gap-1.5 text-xs">
              <div class="i-fas-clock text-purple-400" />
              {{ formatDuration(localUptime) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Items (Fertilizer & Collection) -->
      <div class="glass-panel flex flex-col justify-between rounded-lg p-3 shadow">
        <div class="glass-text-muted mb-1 flex items-center gap-1.5 text-sm">
          <div class="i-fas-flask text-emerald-400" />
          化肥容器
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-flask text-emerald-400" />
              普通
            </div>
            <div class="glass-text-main font-bold">
              {{ formatBucketTime(fertilizerNormal) }}
            </div>
          </div>
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-vial text-emerald-400" />
              有机
            </div>
            <div class="glass-text-main font-bold">
              {{ formatBucketTime(fertilizerOrganic) }}
            </div>
          </div>
        </div>
        <div class="my-2 border-t border-gray-100/50 dark:border-gray-700/50" />
        <div class="glass-text-muted mb-1 flex items-center gap-1.5 text-sm">
          <div class="i-fas-star text-emerald-400" />
          收藏点
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-bookmark text-emerald-400" />
              普通
            </div>
            <div class="glass-text-main font-bold">
              {{ collectionNormal?.count || 0 }}
            </div>
          </div>
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-gem text-emerald-400" />
              典藏
            </div>
            <div class="glass-text-main font-bold">
              {{ collectionRare?.count || 0 }}
            </div>
          </div>
        </div>
      </div>

      <!-- Next Checks -->
      <div class="glass-panel flex flex-col justify-between rounded-lg p-3 shadow">
        <h3 class="glass-text-muted mb-1 flex items-center gap-1.5 text-sm">
          <div class="i-carbon-hourglass" />
          <span>下次巡查倒计时</span>
        </h3>
        <div class="mt-1 flex flex-1 flex-col justify-center gap-2">
          <div class="flex items-center justify-between">
            <div class="glass-text-muted flex items-center gap-1.5 text-xs tracking-wider">
              <div class="i-carbon-sprout text-primary-500" />
              <span>农场</span>
            </div>
            <div class="glass-text-main text-base font-bold font-mono">
              {{ nextFarmCheck }}
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div class="glass-text-muted flex items-center gap-1.5 text-xs tracking-wider">
              <div class="i-carbon-user-multiple text-blue-500" />
              <span>好友</span>
            </div>
            <div class="glass-text-main text-base font-bold font-mono">
              {{ nextFriendCheck }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Flex -->
    <div class="flex flex-1 flex-col items-stretch gap-6 md:flex-row md:overflow-hidden">
      <!-- Logs (Left Column) -->
      <div class="flex flex-1 flex-col gap-6 md:w-3/4 md:overflow-hidden">
        <!-- Logs -->
        <div class="glass-panel flex flex-1 flex-col rounded-lg p-6 shadow md:overflow-hidden">
          <div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="glass-text-main flex items-center gap-2 text-lg font-medium">
              <div class="i-carbon-document" />
              <span>运行日志</span>
            </h3>

            <div class="flex flex-wrap items-center gap-2 text-sm">
              <BaseSelect
                v-model="filter.module"
                :options="modules"
                class="w-32"
                @change="refresh"
              />

              <BaseSelect
                v-model="filter.event"
                :options="events"
                class="w-32"
                @change="refresh"
              />

              <BaseSelect
                v-model="filter.isWarn"
                :options="logs"
                class="w-32"
                @change="refresh"
              />

              <BaseInput
                v-model="filter.keyword"
                placeholder="关键词..."
                class="w-32"
                clearable
                @keyup.enter="refresh"
                @clear="refresh"
              />

              <BaseButton
                variant="primary"
                size="sm"
                title="搜索"
                @click="refresh"
              >
                <div class="i-carbon-search text-lg" />
              </BaseButton>
              <BaseButton
                v-if="hasActiveLogFilter"
                variant="danger"
                size="sm"
                class="!px-2"
                title="恢复默认 / 清空过滤"
                @click="clearFilter"
              >
                <div class="i-carbon-close text-lg" />
              </BaseButton>
            </div>
          </div>

          <div ref="logContainer" class="max-h-[50vh] min-h-0 flex-1 overflow-y-auto border border-gray-200/20 rounded bg-transparent p-4 text-sm leading-relaxed font-mono md:max-h-none dark:border-gray-700/20" @scroll="onLogScroll">
            <div v-if="!allLogs.length" class="glass-text-muted py-8 text-center">
              暂无日志
            </div>
            <div v-for="log in allLogs" :key="log.ts + log.msg" class="mb-1 break-all">
              <span class="mr-2 select-none opacity-60">[{{ formatLogTime(log.time) }}]</span>
              <span class="mr-2 rounded px-1.5 py-0.5 text-xs font-bold" :class="getLogTagClass(log.tag)">{{ log.tag }}</span>
              <span v-if="log.meta?.event" class="mr-2 rounded bg-blue-50/50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">{{ getEventLabel(log.meta.event) }}</span>
              <span :class="getLogMsgClass(log.tag)" class="glass-text-main opacity-90">{{ log.msg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column Stack -->
      <div class="flex flex-col md:w-1/4 md:overflow-hidden">
        <!-- Operations Grid -->
        <div class="glass-panel min-h-0 flex flex-1 flex-col justify-start rounded-lg p-4 shadow md:h-full">
          <h3 class="glass-text-main mb-4 flex shrink-0 items-center gap-2 text-lg font-medium">
            <div class="i-carbon-chart-column" />
            <span>今日统计</span>
          </h3>
          <div class="custom-scrollbar grid grid-cols-2 content-start gap-2 overflow-y-auto pr-1 2xl:gap-3">
            <div
              v-for="(val, key) in (status?.operations || {})"
              :key="key"
              class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/30 2xl:px-4 2xl:py-3"
            >
              <div class="flex items-center gap-2">
                <div class="text-base 2xl:text-lg" :class="[getOpIcon(key), getOpColor(key)]" />
                <div class="glass-text-muted text-xs 2xl:text-sm">
                  {{ getOpName(key) }}
                </div>
              </div>
              <div class="text-sm font-bold 2xl:text-base">
                {{ val }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trial-pulse-banner {
  border: 1px solid rgba(249, 115, 22, 0.3);
  animation: trial-pulse 2.5s infinite ease-in-out;
}

@keyframes trial-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.3);
  }
  50% {
    box-shadow: 0 0 15px 2px rgba(249, 115, 22, 0.15);
    border-color: rgba(249, 115, 22, 0.6);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.3);
  }
}

.dark .trial-pulse-banner {
  border-color: rgba(249, 115, 22, 0.2);
}
</style>
