<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const showPanel = ref(false)
const lastReadTime = ref(Date.now())

const alertLogs = computed(() => {
  return statusStore.logs
    .filter(l => l.tag === '系统' || l.tag === '错误' || l.isWarn)
    .slice(-15)
    .reverse()
})

const unreadCount = computed(() => {
  return alertLogs.value.filter(l => new Date(l.time).getTime() > lastReadTime.value).length
})

function togglePanel() {
  showPanel.value = !showPanel.value
  if (showPanel.value) {
    lastReadTime.value = Date.now()
  }
}
</script>

<template>
  <div class="relative">
    <button
      class="glass-panel h-10 w-10 flex items-center justify-center border rounded-full text-gray-600 shadow-md transition-all duration-300 hover:rotate-12 dark:text-gray-300 hover:text-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-gray-900"
      title="系统通知"
      @click="togglePanel"
    >
      <div class="i-carbon-notification text-xl" />
      <span v-if="unreadCount > 0" class="absolute right-0 top-0 h-3 w-3 flex">
        <span class="absolute h-full w-full inline-flex animate-ping rounded-full bg-red-400 opacity-75" />
        <span class="relative h-3 w-3 inline-flex rounded-full bg-red-500" />
      </span>
    </button>

    <!-- Dropdown Panel -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-1 scale-95"
    >
      <!-- Ensure z-50 for overlapping everything -->
      <div v-if="showPanel" class="glass-panel absolute right-0 top-12 z-50 mt-2 w-80 overflow-hidden border border-white/20 rounded-xl shadow-2xl dark:border-white/10">
        <div class="flex items-center justify-between border-b border-gray-200/50 bg-black/5 px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <h3 class="glass-text-main flex items-center gap-2 text-sm font-bold">
            <div class="i-carbon-notification text-base text-primary" /> 系统消息公告
          </h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showPanel = false">
            <div class="i-carbon-close" />
          </button>
        </div>
        <div class="custom-scrollbar max-h-96 overflow-y-auto px-2 py-3 space-y-2">
          <div v-if="alertLogs.length === 0" class="glass-text-muted p-6 text-center text-sm">
            📭 暂无活动记录或系统通知
          </div>
          <template v-else>
            <div v-for="(log, idx) in alertLogs" :key="idx" class="flex flex-col gap-1 border border-white/10 rounded-lg bg-black/5 p-3 text-xs shadow-sm transition-colors dark:border-white/5 dark:bg-black/20 hover:bg-black/10 lg:text-[13px] dark:hover:bg-black/30">
              <div class="flex items-center justify-between">
                <span class="flex items-center gap-1 font-bold" :class="log.tag === '错误' || log.isWarn ? 'text-red-500' : 'text-blue-500'">
                  <div :class="log.tag === '错误' || log.isWarn ? 'i-carbon-warning-alt' : 'i-carbon-information'" />
                  [{{ log.tag }}]
                </span>
                <span class="glass-text-muted text-[11px]">{{ log.time }}</span>
              </div>
              <div class="glass-text-main mt-1 break-words">
                {{ log.msg }}
              </div>
              <div v-if="log.accountName" class="glass-text-muted mt-1 text-[11px] font-mono">
                👤 {{ log.accountName }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 4px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
