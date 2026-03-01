<script setup lang="ts">
defineProps<{
  label?: string
  size?: 'sm' | 'md' | 'lg'
  hint?: string
  recommend?: 'on' | 'off' | 'conditional'
}>()
const model = defineModel<boolean>()
</script>

<template>
  <label class="inline-flex cursor-pointer items-center gap-2">
    <div class="relative inline-flex items-center">
      <input v-model="model" type="checkbox" class="peer sr-only">
      <div
        class="rounded-full bg-gray-200/50 transition-colors after:absolute after:border after:border-gray-300/50 after:rounded-full after:bg-white dark:bg-white/20 peer-checked:bg-primary-500 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/20 after:transition-all after:content-[''] peer-checked:after:translate-x-full dark:after:border-white/10 peer-checked:after:border-white"
        :class="{
          'h-4 w-7 after:left-[1px] after:top-[1px] after:h-3 after:w-3': size === 'sm',
          'h-6 w-11 after:left-[2px] after:top-[2px] after:h-5 after:w-5': !size || size === 'md',
          'h-7 w-12 after:left-[3px] after:top-[3px] after:h-6 after:w-6': size === 'lg',
        }"
      />
    </div>
    <span v-if="label" class="glass-text-main select-none text-sm font-medium">
      {{ label }}
    </span>
    <!-- Tooltip 提示图标 -->
    <span v-if="hint" class="hint-trigger relative ml-0.5 inline-flex items-center">
      <span class="h-3.5 w-3.5 inline-flex items-center justify-center rounded-full bg-gray-200/80 text-[9px] text-gray-500 font-bold leading-none transition-colors dark:bg-white/10 hover:bg-blue-100 dark:text-gray-300 hover:text-blue-600 dark:hover:bg-primary-500/20 dark:hover:text-primary-400">?</span>
      <span class="hint-bubble glass-panel glass-text-main pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 border border-gray-200/50 rounded-lg px-3 py-2.5 text-xs leading-relaxed opacity-0 shadow-black/8 shadow-lg transition-all duration-200 -translate-x-1/2 dark:border-white/10 dark:shadow-black/30">
        <span class="block">{{ hint }}</span>
        <span v-if="recommend === 'on'" class="recommend-tag recommend-on">
          <span class="dot" />推荐开启
        </span>
        <span v-else-if="recommend === 'off'" class="recommend-tag recommend-off">
          <span class="dot" />推荐关闭
        </span>
        <span v-else-if="recommend === 'conditional'" class="recommend-tag recommend-conditional">
          <span class="dot" />视情况而定
        </span>
        <!-- 气泡箭头 -->
        <span class="absolute left-1/2 top-full border-4 border-transparent border-t-white -translate-x-1/2 dark:border-t-gray-800" />
      </span>
    </span>
  </label>
</template>

<style scoped>
.hint-trigger:hover .hint-bubble {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}
.hint-bubble {
  transform: translateX(-50%) translateY(4px);
}

/* 推荐标签基础样式 */
.recommend-tag {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
}

.recommend-tag .dot {
  display: inline-block;
  height: 6px;
  width: 6px;
  border-radius: 9999px;
}

/* 颜色变体 */
.recommend-on {
  background-color: #f0fdf4; /* primary-50 */
  color: #16a34a; /* primary-600 */
}
.dark .recommend-on {
  background-color: rgba(22, 163, 74, 0.2);
  color: #4ade80; /* primary-400 */
}
.recommend-on .dot {
  background-color: #22c55e;
}

.recommend-off {
  background-color: #fef2f2; /* red-50 */
  color: #dc2626; /* red-600 */
}
.dark .recommend-off {
  background-color: rgba(220, 38, 38, 0.2);
  color: #f87171; /* red-400 */
}
.recommend-off .dot {
  background-color: #ef4444;
}

.recommend-conditional {
  background-color: #fffbeb; /* amber-50 */
  color: #d97706; /* amber-600 */
}
.dark .recommend-conditional {
  background-color: rgba(217, 119, 6, 0.2);
  color: #fbbf24; /* amber-400 */
}
.recommend-conditional .dot {
  background-color: #f59e0b;
}
</style>
