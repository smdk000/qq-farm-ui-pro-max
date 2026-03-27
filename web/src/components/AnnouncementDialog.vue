<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import api from '@/api'
import { useStatusStore } from '@/stores/status'
import { adminToken } from '@/utils/auth'
import {
  hydrateServerBackedStringPreference,
  normalizeAnnouncementDismissedId,
  persistServerBackedStringPreference,
} from '@/utils/view-preferences'

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
const expandedAnnouncementId = ref<number | null>(null)
const hasInitializedExpandedAnnouncement = ref(false)
const dismissedId = ref('')
const listRef = ref<HTMLElement | null>(null)
const ANNOUNCEMENT_DISMISSED_STORAGE_KEY = 'announcement_dismissed_id'
const ANNOUNCEMENT_SYNC_NOTE = '公告关闭状态会跟随当前登录账号同步到服务器；离线时仍会先用本机缓存兜底。'

function syncExpandedAnnouncement(list: Announcement[]) {
  if (list.length === 0) {
    expandedAnnouncementId.value = null
    hasInitializedExpandedAnnouncement.value = false
    return
  }

  if (!hasInitializedExpandedAnnouncement.value) {
    expandedAnnouncementId.value = list[0]?.id ?? null
    hasInitializedExpandedAnnouncement.value = true
    return
  }

  if (
    expandedAnnouncementId.value != null
    && !list.some(entry => entry.id === expandedAnnouncementId.value)
  ) {
    expandedAnnouncementId.value = list[0]?.id ?? null
  }
}

async function hydrateDismissedId() {
  dismissedId.value = await hydrateServerBackedStringPreference({
    payloadKey: 'announcementDismissedId',
    localKey: ANNOUNCEMENT_DISMISSED_STORAGE_KEY,
    normalize: normalizeAnnouncementDismissedId,
  })
}

async function setDismissedId(id: number) {
  dismissedId.value = await persistServerBackedStringPreference({
    payloadKey: 'announcementDismissedId',
    localKey: ANNOUNCEMENT_DISMISSED_STORAGE_KEY,
    value: String(id),
    normalize: normalizeAnnouncementDismissedId,
  })
}

async function fetchAnnouncement() {
  loading.value = true
  try {
    const { data } = await api.get<{ ok: boolean, data: Announcement[] }>('/api/announcement')
    if (data?.ok && Array.isArray(data.data)) {
      announcements.value = data.data.filter(a => a.enabled && a.title?.trim())
      syncExpandedAnnouncement(announcements.value)
    }
    else {
      announcements.value = []
      syncExpandedAnnouncement([])
    }
  }
  catch {
    announcements.value = []
    syncExpandedAnnouncement([])
  }
  finally {
    loading.value = false
  }
}

function shouldShow(list: Announcement[]): boolean {
  if (list.length === 0)
    return false
  const latest = list[0]
  if (!latest)
    return false
  return dismissedId.value !== String(latest.id)
}

function updateVisibility() {
  show.value = shouldShow(announcements.value)
}

async function onClose() {
  if (announcements.value.length > 0) {
    const latest = announcements.value[0]
    if (latest && latest.id != null) {
      await setDismissedId(latest.id)
    }
  }
  show.value = false
}

function isExpanded(entryId: number) {
  return expandedAnnouncementId.value === entryId
}

async function toggle(entryId: number) {
  const listEl = listRef.value
  const triggerEl = listEl?.querySelector<HTMLElement>(`[data-announcement-trigger="${entryId}"]`) ?? null
  const previousTop = triggerEl?.getBoundingClientRect().top ?? 0

  expandedAnnouncementId.value = expandedAnnouncementId.value === entryId ? null : entryId
  await nextTick()

  if (listEl && triggerEl) {
    const nextTop = triggerEl.getBoundingClientRect().top
    listEl.scrollTop += nextTop - previousTop
    listEl.scrollTop = Math.max(0, listEl.scrollTop)
  }
}

function getAnnouncementCardClass(entryId: number) {
  return isExpanded(entryId)
    ? 'announcement-dialog-card announcement-dialog-card--active'
    : 'announcement-dialog-card'
}

onMounted(async () => {
  if (!adminToken.value)
    return

  await Promise.all([fetchAnnouncement(), hydrateDismissedId()])
  updateVisibility()
  // 移除 connectRealtime('all')：announcement:update 事件已在全局 socket 上注册，
  // 无需单独订阅。此调用会劫持 Sidebar 的当前账号订阅，造成订阅乒乓。
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
    dismissedId.value = ''
    show.value = false
    return
  }
  await Promise.all([fetchAnnouncement(), hydrateDismissedId()])
  updateVisibility()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        class="announcement-dialog-backdrop absolute inset-0 backdrop-blur-md transition-opacity"
        @click="onClose"
      />

      <div
        class="announcement-dialog-panel glass-panel relative max-h-[85vh] max-w-lg w-full flex flex-col transform overflow-hidden rounded-2xl shadow-2xl transition-all"
        @click.stop
      >
        <div class="announcement-dialog-header flex shrink-0 items-center justify-between px-6 py-5">
          <div class="flex items-center gap-2.5">
            <div class="announcement-dialog-icon h-8 w-8 flex items-center justify-center rounded-full">
              <div class="announcement-dialog-info-icon i-carbon-information text-lg" />
            </div>
            <h3 class="glass-text-main text-xl font-bold tracking-wide">
              系统公告
            </h3>
          </div>
          <button
            class="announcement-dialog-close rounded-full p-2 transition-colors"
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
          ref="listRef"
          class="announcement-dialog-list custom-scrollbar flex-1 overflow-y-auto p-4 space-y-2"
        >
          <div
            v-for="(entry, idx) in announcements"
            :key="entry.id"
            class="overflow-hidden rounded-lg transition-all"
            :class="getAnnouncementCardClass(entry.id)"
          >
            <!-- 条目头部（可点击展开） -->
            <button
              type="button"
              :data-announcement-trigger="entry.id"
              class="announcement-dialog-toggle w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              @click="toggle(entry.id)"
            >
              <!-- 展开指示器 -->
              <div
                class="i-carbon-chevron-right glass-text-muted text-sm transition-transform duration-200"
                :class="isExpanded(entry.id) ? 'rotate-90' : ''"
              />
              <div class="flex flex-1 flex-col overflow-hidden">
                <div class="flex items-center gap-2">
                  <!-- 最新标记 -->
                  <span
                    v-if="idx === 0"
                    class="announcement-dialog-hot shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                  >
                    HOT
                  </span>
                  <!-- 标题 -->
                  <span class="announcement-dialog-title truncate text-sm font-bold">
                    {{ entry.title }}
                  </span>
                </div>
                <div class="glass-text-muted mt-1 flex items-center gap-2 text-[11px]">
                  <!-- 版本徽章 -->
                  <span
                    v-if="entry.version"
                    class="announcement-dialog-version rounded-full px-1.5 py-0.5 font-medium"
                  >
                    {{ entry.version }}
                  </span>
                  <!-- 日期 -->
                  <span v-if="entry.publish_date" class="tabular-nums">{{ entry.publish_date }}</span>
                </div>
              </div>
            </button>

            <!-- 展开内容 -->
            <div v-show="isExpanded(entry.id)" class="announcement-dialog-content px-5 py-4">
              <pre class="glass-text-main whitespace-pre-wrap text-sm leading-relaxed font-sans" style="font-family: inherit;">{{ entry.content }}</pre>
            </div>
          </div>
        </div>

        <div class="announcement-dialog-footer glass-panel shrink-0 px-6 py-4">
          <p class="announcement-dialog-note mb-3 text-xs leading-5">
            {{ ANNOUNCEMENT_SYNC_NOTE }}
          </p>
          <button
            class="announcement-dialog-confirm relative w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold transition-all active:scale-[0.98] focus:outline-none"
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
.announcement-dialog-backdrop {
  background: var(--ui-overlay-backdrop) !important;
}

.announcement-dialog-panel,
.announcement-dialog-header,
.announcement-dialog-icon,
.announcement-dialog-close,
.announcement-dialog-list,
.announcement-dialog-card,
.announcement-dialog-content,
.announcement-dialog-footer,
.announcement-dialog-version,
.announcement-dialog-hot {
  border: 1px solid var(--ui-border-subtle) !important;
}

.announcement-dialog-panel,
.announcement-dialog-header,
.announcement-dialog-list,
.announcement-dialog-card,
.announcement-dialog-footer {
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent) !important;
}

.announcement-dialog-header,
.announcement-dialog-footer {
  border-left: none !important;
  border-right: none !important;
}

.announcement-dialog-info-icon {
  color: var(--ui-status-warning) !important;
}

.announcement-dialog-header {
  border-top: none !important;
}

.announcement-dialog-footer {
  border-bottom: none !important;
}

.announcement-dialog-icon {
  background: color-mix(in srgb, var(--ui-status-warning) 10%, transparent) !important;
  color: color-mix(in srgb, var(--ui-status-warning) 80%, var(--ui-text-1)) !important;
}

.announcement-dialog-close {
  color: var(--ui-text-2) !important;
}

.announcement-dialog-close:hover,
.announcement-dialog-toggle:hover {
  color: var(--ui-text-1) !important;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent) !important;
}

.announcement-dialog-list {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 78%, transparent) !important;
  overflow-anchor: none;
}

.announcement-dialog-card--active {
  border-color: color-mix(in srgb, var(--ui-brand-500) 26%, var(--ui-border-subtle)) !important;
  box-shadow: 0 14px 28px var(--ui-shadow-panel) !important;
}

.announcement-dialog-title {
  color: var(--ui-text-1) !important;
}

.announcement-dialog-hot {
  background: color-mix(in srgb, var(--ui-status-danger) 10%, transparent) !important;
  color: color-mix(in srgb, var(--ui-status-danger) 78%, var(--ui-text-1)) !important;
}

.announcement-dialog-version {
  background: color-mix(in srgb, var(--ui-status-info) 10%, transparent) !important;
  color: color-mix(in srgb, var(--ui-status-info) 78%, var(--ui-text-1)) !important;
}

.announcement-dialog-note {
  color: color-mix(in srgb, var(--ui-status-info) 70%, var(--ui-text-2)) !important;
}

.announcement-dialog-content {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent) !important;
  border-left: none !important;
  border-right: none !important;
  border-bottom: none !important;
}

.announcement-dialog-confirm {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--ui-brand-500) 84%, var(--ui-status-warning) 16%),
    color-mix(in srgb, var(--ui-brand-600) 76%, var(--ui-status-warning) 24%)
  ) !important;
  color: var(--ui-text-on-brand) !important;
  box-shadow: 0 16px 28px color-mix(in srgb, var(--ui-brand-500) 24%, transparent) !important;
}

.announcement-dialog-confirm:hover {
  filter: brightness(0.98);
}

.announcement-dialog-confirm:focus-visible {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--ui-brand-500) 18%, transparent),
    0 16px 28px color-mix(in srgb, var(--ui-brand-500) 24%, transparent) !important;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: color-mix(in srgb, var(--ui-bg-surface) 64%, transparent);
  border-radius: 999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-scrollbar-thumb) 78%, transparent);
  border-radius: 999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-scrollbar-thumb-hover) 82%, transparent);
}
</style>
