<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useAccountStore } from '@/stores/account'

const accountStore = useAccountStore()
const { currentAccountId } = storeToRefs(accountStore)

const loading = ref(false)
const list = ref<any[]>([])
const sortKey = useStorage('analytics_sort_key', 'exp')
const imageErrors = ref<Record<string | number, boolean>>({})

const sortOptions = [
  { value: 'exp', label: '经验/小时' },
  { value: 'fert', label: '普通肥经验/小时' },
  { value: 'profit', label: '利润/小时' },
  { value: 'fert_profit', label: '普通肥利润/小时' },
  { value: 'level', label: '等级' },
]

async function loadAnalytics() {
  if (!currentAccountId.value)
    return
  loading.value = true
  try {
    const res = await api.get(`/api/analytics`, {
      params: { sort: sortKey.value },
      headers: { 'x-account-id': currentAccountId.value },
    })
    const data = res.data.data
    if (Array.isArray(data)) {
      list.value = data
      // web sort as fallback
      const metricMap: Record<string, string> = {
        exp: 'expPerHour',
        fert: 'normalFertilizerExpPerHour',
        profit: 'profitPerHour',
        fert_profit: 'normalFertilizerProfitPerHour',
        level: 'level',
      }
      const metric = metricMap[sortKey.value]
      if (metric) {
        list.value.sort((a, b) => {
          const av = Number(a[metric])
          const bv = Number(b[metric])
          if (!Number.isFinite(av) && !Number.isFinite(bv))
            return 0
          if (!Number.isFinite(av))
            return 1
          if (!Number.isFinite(bv))
            return -1
          return bv - av
        })
      }
    }
    else {
      list.value = []
    }
  }
  catch (e) {
    console.error(e)
    list.value = []
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAnalytics()
})

watch([currentAccountId, sortKey], () => {
  loadAnalytics()
})

function formatLv(level: any) {
  if (level === null || level === undefined || level === '' || Number(level) < 0)
    return '未知'
  return String(level)
}

function formatGrowTime(seconds: any) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0)
    return '0秒'
  if (s < 60)
    return `${s}秒`
  if (s < 3600) {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分`
  }
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}
</script>

<template>
  <div class="p-4">
    <div class="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <h2 class="flex items-center gap-2 text-2xl font-bold">
        <div class="i-carbon-chart-line" />
        数据分析
      </h2>

      <div class="flex items-center gap-2">
        <label class="whitespace-nowrap text-sm font-medium">排序方式:</label>
        <BaseSelect
          v-model="sortKey"
          :options="sortOptions"
          class="w-40"
        />
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
    </div>

    <div v-else-if="!currentAccountId" class="glass-panel glass-text-muted rounded-xl p-8 text-center shadow-md">
      请选择账号后查看数据分析
    </div>

    <div v-else-if="list.length === 0" class="glass-panel glass-text-muted rounded-xl p-8 text-center shadow-md">
      暂无数据
    </div>

    <div v-else class="space-y-4">
      <!-- Mobile Card View -->
      <div class="block sm:hidden space-y-4">
        <div v-for="(item, idx) in list" :key="idx" class="glass-panel border border-white/20 rounded-xl p-4 shadow-sm dark:border-white/10">
          <div class="mb-3 flex items-start gap-3">
            <div class="relative h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden border border-white/20 rounded-lg bg-primary-500/10 dark:border-white/10 dark:bg-black/20">
              <img
                v-if="item.image && !imageErrors[item.seedId]"
                :src="item.image"
                class="h-10 w-10 object-contain drop-shadow-md"
                loading="lazy"
                @error="imageErrors[item.seedId] = true"
              >
              <div v-else class="i-carbon-sprout text-2xl text-primary-500/50" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between">
                <div class="glass-text-main truncate font-bold">
                  {{ item.name }}
                </div>
                <div class="glass-text-muted text-xs">
                  ID:{{ item.seedId }}
                </div>
              </div>
              <div class="mt-1 flex items-center gap-2">
                <span class="border border-primary-500/20 rounded bg-primary-500/10 px-1.5 py-0.5 text-xs text-primary-600 font-medium dark:text-primary-400">Lv{{ formatLv(item.level) }}</span>
                <span class="glass-text-muted text-xs">{{ item.seasons }}季</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div class="flex flex-col">
              <span class="glass-text-muted mb-0.5 text-xs">时间</span>
              <span class="glass-text-main font-medium">{{ formatGrowTime(item.growTime) }}</span>
            </div>
            <div class="flex flex-col">
              <span class="glass-text-muted mb-0.5 text-xs">经验/小时</span>
              <span class="text-purple-600 font-bold dark:text-purple-400">{{ item.expPerHour }}</span>
            </div>
            <div class="flex flex-col">
              <span class="glass-text-muted mb-0.5 text-xs">净利润/小时</span>
              <span class="text-amber-500 font-bold dark:text-amber-400">{{ item.profitPerHour ?? '-' }}</span>
            </div>
            <div class="flex flex-col">
              <span class="glass-text-muted mb-0.5 text-xs">普肥经验/小时</span>
              <span class="text-blue-600 font-bold dark:text-blue-400">{{ item.normalFertilizerExpPerHour ?? '-' }}</span>
            </div>
            <div class="flex flex-col">
              <span class="glass-text-muted mb-0.5 text-xs">普肥净利润/小时</span>
              <span class="text-primary-600 font-bold dark:text-primary-400">{{ item.normalFertilizerProfitPerHour ?? '-' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop Table View -->
      <div class="glass-panel hidden overflow-hidden rounded-xl shadow-md sm:block">
        <div class="custom-scrollbar overflow-x-auto">
          <table class="w-full whitespace-nowrap text-left text-sm">
            <thead class="glass-text-main border-b border-white/20 bg-black/5 text-xs font-bold tracking-wider uppercase dark:border-white/10 dark:bg-black/20">
              <tr>
                <th class="sticky left-0 z-10 border-r border-white/10 bg-transparent px-4 py-3 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-white/5 dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                  作物 (Lv)
                </th>
                <th class="px-4 py-3">
                  时间
                </th>
                <th class="px-4 py-3 text-right">
                  经验/时
                </th>
                <th class="px-4 py-3 text-right">
                  普通肥经验/时
                </th>
                <th class="px-4 py-3 text-right">
                  净利润/时
                </th>
                <th class="px-4 py-3 text-right">
                  普通肥净利润/时
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/20 dark:divide-white/10">
              <tr v-for="(item, idx) in list" :key="idx" class="group transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                <td class="sticky left-0 border-r border-white/10 bg-transparent px-4 py-2 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] backdrop-blur-xl transition-colors dark:border-white/5 group-hover:bg-black/5 dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] dark:group-hover:bg-white/5">
                  <div class="flex items-center gap-3">
                    <div class="relative h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden border border-white/20 rounded-lg bg-primary-500/10 dark:border-white/10 dark:bg-black/20">
                      <img
                        v-if="item.image && !imageErrors[item.seedId]"
                        :src="item.image"
                        class="h-8 w-8 object-contain drop-shadow-md"
                        loading="lazy"
                        @error="imageErrors[item.seedId] = true"
                      >
                      <div v-else class="i-carbon-sprout text-xl text-primary-500/50" />
                    </div>
                    <div>
                      <div class="glass-text-main font-bold">
                        {{ item.name }}
                      </div>
                      <div class="mt-0.5 flex items-center gap-1.5">
                        <span class="border border-primary-500/20 rounded bg-primary-500/10 px-1.5 py-0.5 text-[10px] text-primary-600 font-medium dark:text-primary-400">Lv{{ formatLv(item.level) }}</span>
                        <span class="glass-text-muted text-[10px]">ID:{{ item.seedId }}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="glass-text-main px-4 py-2">
                  <div class="font-medium">
                    {{ formatGrowTime(item.growTime) }}
                  </div>
                  <div class="glass-text-muted mt-0.5 text-xs">
                    {{ item.seasons }}季
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-purple-600 font-bold dark:text-purple-400">
                    {{ item.expPerHour }}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-blue-600 font-bold dark:text-blue-400">
                    {{ item.normalFertilizerExpPerHour ?? '-' }}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-amber-500 font-bold dark:text-amber-400">
                    {{ item.profitPerHour ?? '-' }}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-primary-500 font-bold dark:text-primary-400">
                    {{ item.normalFertilizerProfitPerHour ?? '-' }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
