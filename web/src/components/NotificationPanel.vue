<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'

const props = defineProps<{
  /** card = 登录页卡片模式, sidebar = 侧边栏弹窗模式 */
  mode?: 'card' | 'sidebar'
  /** 最多显示条数 */
  limit?: number
}>()

interface NotificationEntry {
  date: string
  title: string
  version: string
  content: string
}

const entries = ref<NotificationEntry[]>([])
const loading = ref(false)
const expandedIdx = ref<number>(0) // 默认展开第一条

const displayLimit = computed(() => props.limit || (props.mode === 'card' ? 3 : 10))

/** 获取通知数据 */
async function fetchNotifications() {
  loading.value = true
  try {
    const res = await api.get('/api/notifications', { params: { limit: displayLimit.value } })
    if (res.data.ok) {
      entries.value = res.data.data || []
    }
  }
  catch {
    // 静默失败，通知非关键路径
  }
  finally {
    loading.value = false
  }
}

/** 切换展开/折叠 */
function toggle(idx: number) {
  expandedIdx.value = expandedIdx.value === idx ? -1 : idx
}

/** 标记已读（存到 localStorage） */
function markAsRead() {
  if (entries.value.length > 0) {
    localStorage.setItem('last_read_notification_date', entries.value[0]!.date)
  }
}

onMounted(() => {
  fetchNotifications()
  markAsRead()
})

defineExpose({ fetchNotifications })
</script>

<template>
  <div class="notification-panel">
    <!-- 加载中 -->
    <div v-if="loading && !entries.length" class="py-4 text-center text-sm text-gray-400">
      <div class="i-svg-spinners-90-ring-with-bg inline-block text-lg" />
    </div>

    <!-- 空状态 -->
    <div v-else-if="!entries.length" class="py-4 text-center text-sm text-gray-400">
      暂无更新公告
    </div>

    <!-- 通知列表 -->
    <div v-else class="space-y-2">
      <div
        v-for="(entry, idx) in entries"
        :key="entry.date + idx"
        class="overflow-hidden border border-gray-200 rounded-lg transition-all dark:border-gray-700"
        :class="expandedIdx === idx ? 'bg-primary-500/10 dark:bg-primary-500/20' : 'glass-panel'"
      >
        <!-- 条目头部（可点击展开） -->
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
          @click="toggle(idx)"
        >
          <!-- 展开指示器 -->
          <div
            class="i-carbon-chevron-right text-xs text-gray-400 transition-transform"
            :class="expandedIdx === idx ? 'rotate-90' : ''"
          />
          <!-- 日期 -->
          <span class="text-xs text-gray-400 tabular-nums">{{ entry.date }}</span>
          <!-- 版本徽章 -->
          <span
            v-if="entry.version"
            class="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-300"
          >
            {{ entry.version }}
          </span>
          <!-- 标题 -->
          <span class="flex-1 truncate text-sm text-gray-700 font-medium dark:text-gray-200">
            {{ entry.title }}
          </span>
          <!-- 最新标记 -->
          <span
            v-if="idx === 0"
            class="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300"
          >
            最新
          </span>
        </button>

        <!-- 展开内容 -->
        <div v-if="expandedIdx === idx && entry.content" class="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
          <pre class="whitespace-pre-wrap text-xs text-gray-600 leading-relaxed dark:text-gray-400">{{ entry.content }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
