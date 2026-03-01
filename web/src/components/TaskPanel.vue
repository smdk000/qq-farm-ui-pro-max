<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import DailyOverview from '@/components/DailyOverview.vue'
import { useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const { status, dailyGifts, realtimeConnected } = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)

const growth = computed(() => dailyGifts.value?.growth || null)

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }
    if (acc.running && status.value?.connection?.connected) {
      statusStore.fetchDailyGifts(currentAccountId.value)
    }
  }
}

onMounted(() => {
  refresh()
})

watch(currentAccountId, () => {
  refresh()
})

function formatTaskProgress(task: any) {
  if (!task)
    return '未开始'
  const rawCurrent = task.progress ?? task.current
  const rawTarget = task.totalProgress ?? task.target

  const current = Number.isFinite(rawCurrent)
    ? rawCurrent
    : (rawCurrent ? Number(rawCurrent) || 0 : 0)

  const target = Number.isFinite(rawTarget)
    ? rawTarget
    : (rawTarget ? Number(rawTarget) || 0 : 0)

  if (!current && !target)
    return '未开始'

  if (target && current >= target)
    return '已完成'

  return `进度：${current}/${target}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Daily Overview (Daily Gifts & Tasks) -->
    <DailyOverview :daily-gifts="dailyGifts" />

    <!-- Growth Task -->
    <div class="glass-panel flex flex-col border border-white/20 rounded-lg p-4 shadow-sm dark:border-white/10">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="glass-text-main flex items-center gap-2 font-medium">
          <div class="i-carbon-growth text-primary-500" />
          <span>成长任务</span>
        </h3>
        <span
          v-if="growth"
          class="rounded px-2 py-0.5 text-xs font-bold"
          :class="growth.doneToday
            ? 'text-primary-600 bg-primary-50 dark:text-primary-400 dark:bg-primary-900/20'
            : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'"
        >
          {{ growth.doneToday ? '今日已完成' : `${growth.completedCount}/${growth.totalCount}` }}
        </span>
      </div>

      <div
        v-if="!currentAccountId"
        class="glass-text-muted flex flex-col items-center justify-center gap-3 border border-white/20 rounded-lg bg-black/5 py-8 text-center backdrop-blur-sm dark:border-white/10 dark:bg-black/20"
      >
        <div class="i-carbon-user-avatar text-3xl opacity-50" />
        <span class="text-sm">请选择账号查看任务详情</span>
      </div>
      <div
        v-else-if="!status?.connection?.connected"
        class="flex flex-col items-center justify-center gap-3 border border-white/20 rounded-lg bg-black/5 py-8 text-center backdrop-blur-sm dark:border-white/10 dark:bg-black/20"
      >
        <div class="i-carbon-connection-signal-off text-3xl text-gray-400 dark:text-gray-500" />
        <div>
          <div class="glass-text-main text-sm font-medium">
            账号未登录
          </div>
          <div class="glass-text-muted mt-1 text-xs">
            请先运行账号或检查网络连接
          </div>
        </div>
      </div>
      <div
        v-else-if="growth && growth.tasks && growth.tasks.length"
        class="space-y-2"
      >
        <div
          v-for="(task, idx) in growth.tasks"
          :key="idx"
          class="flex items-center justify-between text-sm"
        >
          <span class="glass-text-main">{{ task.desc || task.name }}</span>
          <span class="glass-text-muted text-xs">{{ formatTaskProgress(task) }}</span>
        </div>
      </div>
      <div v-else class="glass-text-muted text-center text-sm">
        暂无任务详情
      </div>
    </div>
  </div>
</template>
