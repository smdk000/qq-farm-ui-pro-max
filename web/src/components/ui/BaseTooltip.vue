<script setup lang="ts">
defineProps<{
  text?: string
}>()
</script>

<template>
  <span class="hint-trigger relative ml-1 inline-flex items-center align-middle">
    <!-- 触发图标 -->
    <span class="h-3.5 w-3.5 inline-flex items-center justify-center rounded-full bg-gray-200/80 text-[10px] text-gray-500 font-bold leading-none transition-colors dark:bg-white/10 hover:bg-blue-100 dark:text-gray-300 hover:text-blue-600 dark:hover:bg-primary-500/20 dark:hover:text-primary-400">?</span>
    <!-- 提示气泡，向下弹出居中边界防护 -->
    <span class="hint-bubble glass-panel glass-text-main pointer-events-none absolute top-full left-1/2 z-50 mt-2 w-max max-w-[calc(100vw-2rem)] sm:w-64 border border-gray-200/50 rounded-lg px-3 py-2.5 text-xs normal-case leading-relaxed font-normal whitespace-normal text-wrap opacity-0 shadow-black/8 shadow-lg transition-all duration-200 -translate-x-1/2 dark:border-white/10 dark:shadow-black/30">
      <slot>{{ text }}</slot>
      <!-- 上方居中小箭头 -->
      <span class="absolute bottom-full left-1/2 -mb-0.5 border-4 border-transparent border-b-white -translate-x-1/2 dark:border-b-gray-800" />
    </span>
  </span>
</template>

<style scoped>
/* 悬浮提示框样式 - 默认隐藏，hover 时显示 */
.hint-bubble {
  pointer-events: none;
}

.hint-trigger:hover .hint-bubble {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
