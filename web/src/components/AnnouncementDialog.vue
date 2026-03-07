<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import api from '@/api'
import { adminToken } from '@/utils/auth'
import { useStatusStore } from '@/stores/status'

interface Announcement {
  id: number
  title: string
  content: string
  version?: string
  publish_date?: string
  enabled: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

const statusStore = useStatusStore()
const announcements = ref<Announcement[]>([])
const show = ref(false)
const loading = ref(false)
const expandedIdx = ref<number>(0) // 默认展开第一项

const DISMISSED_KEY = 'announcement_dismissed_id'

function getDismissedId(): string {
  try {
    return String(localStorage.getItem(DISMISSED_KEY) || '')
  } catch {
    return ''
  }
}

function setDismissedId(id: number) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(id))
  } catch {
    /* ignore */
  }
}

async function fetchAnnouncement() {
  loading.value = true
  try {
    const { data } = await api.get<{ ok: boolean; data: Announcement[] }>('/api/announcement')
    if (data?.ok && Array.isArray(data.data)) {
      announcements.value = data.data.filter(a => a.enabled && a.title?.trim())
    } else {
      announcements.value = []
    }
  } catch {
    announcements.value = []
  } finally {
    loading.value = false
  }
}

function shouldShow(list: Announcement[]): boolean {
  if (list.length === 0) return false
  const latest = list[0]
  if (!latest) return false
  const dismissed = getDismissedId()
  return dismissed !== String(latest.id)
}

function updateVisibility() {
  show.value = shouldShow(announcements.value)
}

function onClose() {
  if (announcements.value.length > 0) {
    const latest = announcements.value[0]
    if (latest && latest.id != null) {
      setDismissedId(latest.id)
    }
  }
  show.value = false
}

function toggle(idx: number) {
  expandedIdx.value = expandedIdx.value === idx ? -1 : idx
}

onMounted(async () => {
  if (!adminToken.value)
    return

  await fetchAnnouncement()
  updateVisibility()

  if (show.value) {
    statusStore.connectRealtime('all')
  }
})

watch(announcements, () => updateVisibility(), { deep: true })

watch(
  () => statusStore.announcementUpdateTrigger,
  async () => {
    await fetchAnnouncement()
    updateVisibility()
  },
)

watch(adminToken, async (token) => {
  if (!token) {
    announcements.value = []
    show.value = false
    return
  }
  await fetchAnnouncement()
  updateVisibility()
  if (show.value) {
    statusStore.connectRealtime('all')
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        class="absolute inset-0 bg-gray-900/40 backdrop-blur-md transition-opacity dark:bg-black/60"
        @click="onClose"
      />

      <div
        class="glass-panel relative max-h-[85vh] max-w-lg w-full flex flex-col transform overflow-hidden border border-white/20 rounded-2xl shadow-2xl transition-all dark:border-white/10"
        @click.stop
      >
        <div class="flex shrink-0 items-center justify-between border-b border-gray-200/50 px-6 py-5 dark:border-white/10">
          <div class="flex items-center gap-2.5">
            <div class="h-8 w-8 flex items-center justify-center rounded-full bg-amber-50/50 dark:bg-amber-900/30">
              <div class="i-carbon-information text-lg text-amber-500" />
            </div>
            <h3 class="glass-text-main text-xl font-bold tracking-wide">
              系统公告
            </h3>
          </div>
          <button
            class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            @click="onClose"
          >
            <div class="i-carbon-close text-xl" />
          </button>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center p-8">
          <div class="i-carbon-circle-dash h-10 w-10 animate-spin text-primary-500" />
        </div>
        <div
          v-else
          class="custom-scrollbar flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/30 dark:bg-gray-900/30"
        >
          <div
            v-for="(entry, idx) in announcements"
            :key="entry.id"
            class="overflow-hidden border border-gray-200 rounded-lg transition-all dark:border-gray-700 bg-white dark:bg-gray-800"
            :class="{ 'ring-1 ring-primary-500/30 shadow-md': expandedIdx === idx }"
          >
            <!-- 条目头部（可点击展开） -->
            <button
              class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-750"
              @click="toggle(idx)"
            >
              <!-- 展开指示器 -->
              <div
                class="i-carbon-chevron-right text-sm text-gray-400 transition-transform duration-200"
                :class="expandedIdx === idx ? 'rotate-90' : ''"
              />
              <div class="flex flex-1 flex-col overflow-hidden">
                <div class="flex items-center gap-2">
                  <!-- 最新标记 -->
                  <span
                    v-if="idx === 0"
                    class="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600 font-bold dark:bg-red-900/40 dark:text-red-400"
                  >
                    HOT
                  </span>
                  <!-- 标题 -->
                  <span class="truncate text-sm text-gray-800 font-bold dark:text-gray-200">
                    {{ entry.title }}
                  </span>
                </div>
                <div class="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                  <!-- 版本徽章 -->
                  <span
                    v-if="entry.version"
                    class="rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-600 font-medium dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    {{ entry.version }}
                  </span>
                  <!-- 日期 -->
                  <span v-if="entry.publish_date" class="tabular-nums">{{ entry.publish_date }}</span>
                </div>
              </div>
            </button>

            <!-- 展开内容 -->
            <div v-show="expandedIdx === idx" class="border-t border-gray-100 bg-gray-50/50 px-5 py-4 dark:border-gray-700 dark:bg-gray-800/80">
              <pre class="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed dark:text-gray-300 font-sans" style="font-family: inherit;">{{ entry.content }}</pre>
            </div>
          </div>
        </div>

        <div class="glass-panel shrink-0 border-t border-gray-100 px-6 py-4 dark:border-gray-700">
          <button
            class="relative w-full flex items-center justify-center gap-2 rounded-xl from-amber-500 to-orange-500 bg-gradient-to-r px-4 py-3 text-base text-white font-bold shadow-amber-500/30 shadow-lg transition-all active:scale-[0.98] hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
            @click="onClose"
          >
            <div class="i-carbon-checkmark text-xl" />
            <span>我知道了</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  @apply rounded-full bg-gray-100 dark:bg-gray-800;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  @apply rounded-full bg-gray-300 dark:bg-gray-600;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400 dark:bg-gray-500;
}
</style>
