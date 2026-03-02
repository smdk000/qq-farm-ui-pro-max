<script setup lang="ts">
import NotificationPanel from '@/components/NotificationPanel.vue'

defineProps<{
  show: boolean
}>()

const emit = defineEmits(['close'])
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
  >
    <!-- 玻璃态遮罩 -->
    <div
      class="absolute inset-0 bg-gray-900/40 backdrop-blur-md transition-opacity dark:bg-black/60"
      @click="emit('close')"
    />

    <div
      class="glass-panel relative max-h-[85vh] max-w-md w-full flex flex-col transform overflow-hidden border border-white/20 rounded-2xl shadow-2xl transition-all dark:border-white/10"
      @click.stop
    >
      <!-- 头部 -->
      <div class="flex shrink-0 items-center justify-between border-b border-gray-200/50 px-6 py-5 dark:border-white/10">
        <div class="flex items-center gap-2.5">
          <div class="h-8 w-8 flex items-center justify-center rounded-full bg-blue-50/50 dark:bg-blue-900/30">
            <div class="i-carbon-notification-new text-lg text-blue-500" />
          </div>
          <h3 class="glass-text-main text-xl font-bold tracking-wide">
            更新公告
          </h3>
        </div>
        <button
          class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          @click="emit('close')"
        >
          <div class="i-carbon-close text-xl" />
        </button>
      </div>

      <!-- 内容区（可滚动） -->
      <div class="custom-scrollbar flex-1 overflow-y-auto bg-transparent p-5">
        <NotificationPanel mode="sidebar" :limit="5" />
      </div>

      <!-- 底部动作条 -->
      <div class="glass-panel shrink-0 border-t border-gray-100 px-6 py-4 dark:border-gray-700">
        <!-- 作者信息流水 -->
        <div class="glass-text-muted pointer-events-none mb-4 flex select-none items-center justify-between px-1 text-[10px] font-mono">
          <div class="flex items-center gap-1.5">
            <div class="i-carbon-user-avatar" />
            <span>Author: smdk000</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="i-carbon-user-group" />
            <span>QQ群: 227916149</span>
          </div>
        </div>
        <button
          class="relative w-full flex items-center justify-center gap-2 rounded-xl from-blue-500 to-indigo-500 bg-gradient-to-r px-4 py-3 text-base text-white font-bold shadow-blue-500/30 shadow-lg transition-all active:scale-[0.98] hover:from-blue-600 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          @click="emit('close')"
        >
          <div class="i-carbon-checkmark text-xl" />
          <span>我知道了，立即体验</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
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
