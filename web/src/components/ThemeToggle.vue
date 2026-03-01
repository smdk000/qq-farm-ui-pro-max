<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const iconClass = computed(() => {
  switch (appStore.themeMode) {
    case 'light': return 'i-carbon-sun'
    case 'dark': return 'i-carbon-moon'
    case 'auto': return 'i-carbon-brightness-contrast'
    default: return 'i-carbon-moon'
  }
})

const modeLabel = computed(() => {
  switch (appStore.themeMode) {
    case 'light': return '浅色模式（点击切换到深色）'
    case 'dark': return '深色模式（点击切换到自动）'
    case 'auto': return '自动模式（点击切换到浅色）'
    default: return '切换主题'
  }
})
</script>

<template>
  <button
    class="icon-btn mx-2 !outline-none"
    :title="modeLabel"
    @click="appStore.toggleDark()"
  >
    <div :class="iconClass" />
  </button>
</template>
