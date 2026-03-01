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
  <div class="inline-flex flex-col gap-1">
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
      <!-- Tooltip 提示图标 - 小尺寸 -->
      <span v-if="hint" class="hint-trigger relative ml-0.5 inline-flex items-center">
        <span class="h-3.5 w-3.5 inline-flex items-center justify-center rounded-full bg-gray-200/80 text-[9px] text-gray-500 font-bold leading-none transition-colors dark:bg-white/10 hover:bg-blue-100 dark:text-gray-300 hover:text-blue-600 dark:hover:bg-primary-500/20 dark:hover:text-primary-400">?</span>
        <span class="hint-bubble glass-panel glass-text-main pointer-events-none absolute left-full top-1/2 z-50 ml-3 w-64 border border-gray-200/50 rounded-lg px-3 py-2.5 text-xs leading-relaxed opacity-0 shadow-black/8 shadow-lg transition-all duration-200 -translate-y-1/2 dark:border-white/10 dark:shadow-black/30">
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
          <!-- 气泡箭头（指向左侧问号图标） -->
          <span class="absolute left-0 top-1/2 -ml-1.5 border-2 border-transparent border-r-white -translate-y-1/2 dark:border-r-gray-800" />
        </span>
      </span>
    </label>
    <!-- Hint 文字说明 - 直接显示在开关下方 -->
    <p v-if="hint" class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
      {{ hint }}
      <span v-if="recommend === 'on'" class="recommend-badge recommend-on">推荐开启</span>
      <span v-else-if="recommend === 'off'" class="recommend-badge recommend-off">推荐关闭</span>
      <span v-else-if="recommend === 'conditional'" class="recommend-badge recommend-conditional">视情况而定</span>
    </p>
  </div>
</template>

<style scoped>
/* 悬浮提示框样式 - 默认隐藏，hover 时显示 */
.hint-bubble {
  pointer-events: none;
}

.hint-trigger:hover .hint-bubble {
  opacity: 1;
  transform: translateX(0) translateY(-50%);
}

/* 下方文字说明中的推荐标签 */
.recommend-badge {
  display: inline-block;
  margin-left: 6px;
  border-radius: 9999px;
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 600;
}

.recommend-badge.recommend-on {
  background-color: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}
.dark .recommend-badge.recommend-on {
  background-color: rgba(34, 197, 94, 0.25);
  color: #4ade80;
}

.recommend-badge.recommend-off {
  background-color: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
.dark .recommend-badge.recommend-off {
  background-color: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.recommend-badge.recommend-conditional {
  background-color: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.dark .recommend-badge.recommend-conditional {
  background-color: rgba(245, 158, 11, 0.25);
  color: #fbbf24;
}
</style>
