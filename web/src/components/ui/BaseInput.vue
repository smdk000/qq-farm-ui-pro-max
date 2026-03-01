<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  type?: string
  placeholder?: string
  label?: string
  disabled?: boolean
  clearable?: boolean
}>()
const emit = defineEmits<{
  (e: 'clear'): void
}>()
const model = defineModel<string | number>()
const showPassword = ref(false)
const inputType = computed(() => {
  if (props.type === 'password' && showPassword.value) {
    return 'text'
  }
  return props.type || 'text'
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="glass-text-muted text-sm font-medium">
      {{ label }}
    </label>
    <div class="relative">
      <input
        v-model="model"
        :type="inputType"
        :placeholder="placeholder"
        :disabled="disabled"
        class="base-input glass-text-main w-full border border-gray-200/50 rounded-lg bg-white/50 px-3 py-2 shadow-sm outline-none backdrop-blur-sm transition-all duration-200 dark:border-white/10 focus:border-primary-500 dark:bg-black/20 disabled:bg-gray-50/50 focus:bg-white/80 disabled:text-gray-400 focus:ring-2 focus:ring-primary-500/20 dark:focus:border-primary-500 dark:disabled:bg-black/40 dark:focus:bg-black/40"
        :class="{ 'pr-10': type === 'password' || (clearable && model) }"
      >
      <button
        v-if="type === 'password'"
        type="button"
        class="absolute right-3 top-1/2 text-gray-400 -translate-y-1/2 hover:text-gray-600 dark:hover:text-gray-300"
        @click="showPassword = !showPassword"
      >
        <div v-if="showPassword" class="i-carbon-view-off" />
        <div v-else class="i-carbon-view" />
      </button>

      <button
        v-else-if="clearable && model"
        type="button"
        class="absolute right-3 top-1/2 text-gray-400 -translate-y-1/2 hover:text-gray-600 dark:hover:text-gray-300"
        @click="model = ''; emit('clear')"
      >
        <div class="i-carbon-close" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.base-input::-ms-reveal,
.base-input::-ms-clear {
  display: none;
}
</style>
