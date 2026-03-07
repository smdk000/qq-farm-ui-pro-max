<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import api from '@/api'

import BaseButton from '@/components/ui/BaseButton.vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const leaderboardData = ref<any[]>([])
const loading = ref(false)
const sortBy = ref('level') // 默认按等级

const sortOptions = [
  { label: '按等级', value: 'level' },
  { label: '按金币', value: 'gold' },
  { label: '按点券', value: 'coupon' },
  { label: '按挂机时长', value: 'uptime' },
]

async function fetchLeaderboard() {
  loading.value = true
  try {
    const res = await api.get('/api/leaderboard', {
      params: {
        sort_by: sortBy.value,
        limit: 50,
      },
    })
    if (res.data.ok && res.data.data && Array.isArray(res.data.data.accounts)) {
      leaderboardData.value = res.data.data.accounts
    }
  }
  catch (error) {
    console.error('获取排行榜失败', error)
  }
  finally {
    loading.value = false
  }
}
watch(() => props.show, (newVal) => {
  if (newVal) {
    fetchLeaderboard()
  }
})

/** 根据平台和 uin 返回头像 URL，仅 QQ 有公开头像 API，微信返回 undefined 使用占位图 */
function formatAvatar(item?: { uin?: string | number, platform?: string }): string | undefined {
  if (!item?.uin)
    return undefined
  const platform = item.platform || 'qq'
  if (platform === 'qq') {
    return `https://q1.qlogo.cn/g?b=qq&nk=${item.uin}&s=100`
  }
  return undefined
}

/** 平台显示标签 */
function getPlatformLabel(platform?: string): string {
  const p = platform || 'qq'
  if (p === 'qq')
    return 'QQ'
  if (p === 'wx')
    return '微信'
  if (p === 'wx_ipad')
    return 'iPad微信'
  if (p === 'wx_car')
    return '车机微信'
  return 'QQ'
}

/** 根据平台显示 UIN 文案 */
function getUinLabel(item?: { uin?: string | number, platform?: string }): string {
  if (!item)
    return '未绑定'
  const uin = item.uin ? String(item.uin) : '未绑定'
  const platform = item.platform || 'qq'
  if (platform === 'qq')
    return `QQ: ${uin}`
  return `微信: ${uin}`
}

function handleClose() {
  emit('close')
}

// 排名样式计算
function getRankingClass(rank: number) {
  if (rank === 1)
    return 'ranking-gold text-white shadow-lg' // 金
  if (rank === 2)
    return 'ranking-silver text-white shadow-md' // 银
  if (rank === 3)
    return 'ranking-bronze text-white shadow-md' // 铜
  return 'ranking-normal text-gray-500 dark:text-gray-400 bg-gray-100/50 dark:bg-white/5'
}

function formatNumber(num: number) {
  if (!num && num !== 0)
    return '0'
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}w`
  }
  return num ? num.toLocaleString() : '0'
}

function formatUptime(seconds: number) {
  if (!seconds)
    return '0m'
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours > 0)
    return `${hours}h ${mins}m`
  return `${mins}m`
}

onMounted(() => {
  if (props.show) {
    fetchLeaderboard()
  }
})
</script>

<template>
  <Transition name="modal">
    <div
      v-if="show"
      class="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-6"
    >
      <!-- 背景遮罩层 -->
      <div
        class="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
        @click="handleClose"
      />

      <!-- 主体内容 -->
      <div
        class="glass-panel relative max-h-full max-w-4xl w-full flex flex-col transform overflow-hidden border border-white/20 rounded-2xl shadow-2xl transition-all dark:border-white/10"
        @click.stop
      >
        <!-- 头部 -->
        <div class="flex items-center justify-between border-b border-gray-100/50 bg-white/50 px-6 py-4 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-800/50">
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 flex items-center justify-center rounded-xl bg-primary-500/10 text-xl text-primary-500 dark:bg-primary-500/20">
              <div class="i-carbon-trophy" />
            </div>
            <div>
              <h3 class="glass-text-main text-xl font-bold">
                平台排行榜
              </h3>
              <p class="mt-0.5 text-[10px] text-gray-400 tracking-tight dark:text-gray-500">
                按等级、金币、点券或挂机时长查看全平台账号排名
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="relative w-36">
              <select
                v-model="sortBy"
                class="block w-full cursor-pointer appearance-none border border-gray-200/50 rounded-lg bg-white/80 px-4 py-2 pr-8 text-sm shadow-sm transition-colors dark:border-gray-700/50 focus:border-primary-500 dark:bg-gray-800/80 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:border-primary-400 dark:focus:ring-primary-400"
                @change="fetchLeaderboard"
              >
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 dark:text-gray-400">
                <div class="i-carbon-chevron-down opacity-80" />
              </div>
            </div>

            <BaseButton
              variant="secondary"
              class="rounded-lg shadow-sm !p-2"
              title="刷新"
              @click="fetchLeaderboard"
            >
              <div class="i-carbon-renew text-lg" :class="{ 'animate-spin': loading }" />
            </BaseButton>

            <button
              class="ml-2 h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              @click="handleClose"
            >
              <div class="i-carbon-close text-xl" />
            </button>
          </div>
        </div>

        <!-- 列表容器 -->
        <div class="custom-scrollbar flex-1 overflow-y-auto px-6 py-4">
          <div v-if="loading && leaderboardData.length === 0" class="h-64 flex flex-col items-center justify-center text-gray-400">
            <div class="i-svg-spinners-90-ring-with-bg mb-4 text-4xl text-primary-500/50" />
            <p>正在加载风云榜...</p>
          </div>

          <div v-else-if="leaderboardData.length === 0" class="h-64 flex flex-col items-center justify-center text-gray-400">
            <div class="i-carbon-list mb-4 text-6xl opacity-30" />
            <p>暂无账号排行数据</p>
          </div>

          <div v-else class="w-full">
            <!-- 表头 -->
            <div class="sticky top-0 z-10 grid grid-cols-12 mb-2 gap-4 border-b border-white/10 bg-white/40 px-3 pb-3 pt-2 text-[11px] text-gray-400 font-bold tracking-wider uppercase backdrop-blur-xl dark:bg-gray-800/40 dark:text-gray-500">
              <div class="col-span-1 text-center font-black">
                #
              </div>
              <div class="col-span-5">
                账号信息
              </div>
              <div class="col-span-2 text-right">
                财富/资产
              </div>
              <div class="col-span-1 text-right">
                点券
              </div>
              <div class="col-span-2 text-center">
                累计时长
              </div>
              <div class="col-span-1 text-center">
                状态
              </div>
            </div>

            <!-- 数据行 -->
            <div class="space-y-2">
              <div
                v-for="item in leaderboardData"
                :key="item.id"
                class="group grid grid-cols-12 items-center gap-4 border border-transparent rounded-2xl p-3 transition-all duration-300 hover:border-primary-500/20 hover:bg-primary-500/5 dark:hover:bg-primary-500/10"
                :class="item.ranking <= 3 ? 'bg-primary-500/5 dark:bg-primary-500/10' : ''"
              >
                <!-- 排名 -->
                <div class="col-span-1 flex justify-center">
                  <div
                    class="h-7 w-7 flex items-center justify-center rounded-full text-sm font-bold"
                    :class="getRankingClass(item.ranking)"
                  >
                    {{ item.ranking }}
                  </div>
                </div>

                <!-- 账号信息 -->
                <div class="col-span-5 flex items-center gap-3 truncate">
                  <div class="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/10 ring-2 ring-transparent transition-all group-hover:ring-primary-500/30">
                    <img v-if="formatAvatar(item)" :src="formatAvatar(item) as string" class="h-full w-full object-cover">
                    <div v-else class="i-carbon-user h-full w-full flex items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-800" />
                  </div>
                  <div class="truncate">
                    <div class="flex items-center gap-2 truncate pr-2 text-gray-800 font-bold dark:text-gray-200">
                      {{ item.name || item.nick || item.id }}
                      <span
                        class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        :class="(item.platform || 'qq') === 'qq' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-green-500/15 text-green-600 dark:text-green-400'"
                      >
                        {{ getPlatformLabel(item.platform) }}
                      </span>
                    </div>
                    <div class="truncate text-xs text-gray-500">
                      {{ getUinLabel(item) }}
                      <span v-if="item.level" class="ml-1 text-primary-500 opacity-80">
                        Lv.{{ item.level }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 金币 -->
                <div class="col-span-2 truncate text-right text-amber-600 font-medium dark:text-amber-500">
                  {{ item.running ? formatNumber(item.gold) : '-' }}
                </div>

                <!-- 点券 -->
                <div class="col-span-1 truncate text-right text-gray-600 dark:text-gray-300">
                  {{ item.running ? formatNumber(item.coupon) : '-' }}
                </div>

                <!-- 时长 -->
                <div class="col-span-2 text-center text-sm text-gray-600 dark:text-gray-300">
                  {{ formatUptime(item.uptime) }}
                </div>

                <!-- 状态 -->
                <div class="col-span-1 flex justify-center">
                  <span
                    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold leading-none"
                    :class="item.running ? 'bg-primary-500/10 text-primary-500 border border-primary-500/20' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 border border-transparent'"
                  >
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full" :class="item.running ? 'bg-primary-500' : 'bg-gray-400'" />
                    {{ item.running ? '在线' : '离线' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .glass-panel,
.modal-leave-to .glass-panel {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(var(--color-primary-500), 0.2);
  border-radius: 10px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(var(--color-primary-500), 0.4);
}

/* 奖牌样式定义 */
.ranking-gold {
  background: linear-gradient(135deg, #fcd34d 0%, #d97706 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}
.ranking-silver {
  background: linear-gradient(135deg, #e5e7eb 0%, #6b7280 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}
.ranking-bronze {
  background: linear-gradient(135deg, #fdba74 0%, #b45309 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
}
.ranking-normal {
  border: 1px solid rgba(156, 163, 175, 0.1);
}
</style>
