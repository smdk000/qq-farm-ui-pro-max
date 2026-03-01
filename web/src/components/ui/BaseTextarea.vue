<script setup lang="ts">
defineProps<{
  placeholder?: string
  label?: string
  disabled?: boolean
  rows?: number
}>()
const model = defineModel<string>()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="glass-text-muted text-sm font-medium">
      {{ label }}
    </label>
    <textarea
      v-model="model"
      :rows="rows || 3"
      :placeholder="placeholder"
      :disabled="disabled"
      class="glass-text-main w-full border border-gray-200/50 rounded-lg bg-white/50 px-3 py-2 shadow-sm outline-none backdrop-blur-sm transition-all duration-200 dark:border-white/10 focus:border-primary-500 dark:bg-black/20 disabled:bg-gray-50/50 focus:bg-white/80 disabled:text-gray-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:border-primary-500 dark:disabled:bg-black/40 dark:focus:bg-black/40"
    />
  </div>
</template>
