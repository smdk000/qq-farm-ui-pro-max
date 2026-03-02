<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { onMounted, ref, defineAsyncComponent } from 'vue'
import { RouterView } from 'vue-router'
import { useAppStore } from '@/stores/app'

// Async lazy load heavy components
const NotificationModal = defineAsyncComponent(() => import('@/components/NotificationModal.vue'))
const ToastContainer = defineAsyncComponent(() => import('@/components/ToastContainer.vue'))

const appStore = useAppStore()

// 全局更新弹窗逻辑
const currentVersion = __APP_VERSION__
const seenVersion = useStorage('app_seen_version', '')
const showUpdateModal = ref(false)

onMounted(() => {
  appStore.fetchUIConfig()

  // 检查是否需要弹出版更公告
  if (seenVersion.value !== currentVersion) {
    showUpdateModal.value = true
    seenVersion.value = currentVersion // 设定当前版本为已读
  }
})
</script>

<template>
  <div class="relative z-0 h-screen w-screen overflow-hidden text-gray-700 bg-theme-bg transition-colors duration-300 dark:text-gray-200 dark:bg-theme-darkbg">
    <!-- 动态流动光球背景层 -->
    <div class="mesh-bg">
      <div class="mesh-orb orb-1" />
      <div class="mesh-orb orb-2" />
      <div class="mesh-orb orb-3" />
    </div>

    <RouterView class="relative z-10" />
    <ToastContainer class="relative z-50" />
    <!-- 全局首次更新大弹窗 -->
    <NotificationModal
      :show="showUpdateModal"
      class="relative z-50"
      @close="showUpdateModal = false"
    />
  </div>
</template>

<style>
/* Global styles */
body {
  margin: 0;
  font-family: 'DM Sans', sans-serif;
}
</style>
