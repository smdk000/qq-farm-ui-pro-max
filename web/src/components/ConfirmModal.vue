<script setup lang="ts">
defineProps<{
  show: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'primary'
  isAlert?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- 背景遮罩 -->
    <div
      class="absolute inset-0 bg-gray-900/40 backdrop-blur-md transition-opacity dark:bg-black/60"
      @click="emit('cancel')"
    />

    <!-- 弹窗主体 -->
    <div class="glass-panel relative max-w-sm w-full transform overflow-hidden border border-white/20 rounded-2xl shadow-2xl transition-all dark:border-white/10" @click.stop>
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-gray-200/50 px-6 py-4 dark:border-white/10">
        <h3 class="glass-text-main text-lg font-bold">
          {{ title || '确认操作' }}
        </h3>
        <button
          class="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          @click="emit('cancel')"
        >
          <div class="i-carbon-close text-xl" />
        </button>
      </div>

      <!-- 内容区 -->
      <div class="px-6 py-6 text-center">
        <slot>
          <p class="glass-text-muted text-sm leading-relaxed">
            {{ message || '确定要执行此操作吗？' }}
          </p>
        </slot>
      </div>

      <!-- 底部操作区 -->
      <div class="flex items-center gap-3 border-t border-gray-200/50 bg-white/20 px-6 py-4 dark:border-white/10 dark:bg-black/20">
        <button
          v-if="!isAlert"
          class="glass-text-main flex-1 border border-gray-200/50 rounded-xl bg-white/50 px-4 py-2.5 text-sm font-medium shadow-sm transition-all active:scale-[0.98] dark:border-white/10 dark:bg-black/20 hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:hover:bg-white/10"
          :disabled="loading"
          @click="emit('cancel')"
        >
          {{ cancelText || '取消' }}
        </button>
        <button
          class="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-offset-2"
          :class="type === 'danger'
            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
            : 'bg-primary-500 hover:bg-primary-600 focus:ring-primary-500'"
          :disabled="loading"
          @click="emit('confirm')"
        >
          <div v-if="loading" class="i-svg-spinners-ring-resize text-lg" />
          {{ confirmText || '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>
