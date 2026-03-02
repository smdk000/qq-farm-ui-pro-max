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
