<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'
import { adminToken } from '@/utils/auth'

// Async lazy load heavy components
const NotificationModal = defineAsyncComponent(() => import('@/components/NotificationModal.vue'))
const AnnouncementDialog = defineAsyncComponent(() => import('@/components/AnnouncementDialog.vue'))
const ToastContainer = defineAsyncComponent(() => import('@/components/ToastContainer.vue'))

const appStore = useAppStore()
const statusStore = useStatusStore()

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

// === 后续优化：全局 Socket 生命周期管理 ===
// 当 Token 被移除（用户点击退出或 Token 过期被拦截器清除）时，彻底断开 Socket 连接
watch(adminToken, (newToken) => {
  if (!newToken) {
    statusStore.disconnectRealtime()
  }
})
</script>

<template>
  <div class="relative z-0 h-screen w-screen overflow-hidden bg-theme-bg text-gray-700 transition-colors duration-300 dark:bg-theme-darkbg dark:text-gray-200">
    <!-- 动态流动光球背景层 -->
    <div class="mesh-bg">
      <div class="mesh-orb orb-1" />
      <div class="mesh-orb orb-2" />
      <div class="mesh-orb orb-3" />
    </div>

    <RouterView v-slot="{ Component }" class="relative z-10">
      <template v-if="Component">
        <Suspense>
          <component :is="Component" />
          <template #fallback>
            <div class="h-screen w-screen flex flex-col items-center justify-center bg-theme-bg/80 backdrop-blur-sm dark:bg-theme-darkbg/80">
              <div class="i-carbon-circle-dash mb-4 h-12 w-12 animate-spin text-primary-500" />
              <p class="text-gray-500 dark:text-gray-400">
                正在按需分配计算层...
              </p>
            </div>
          </template>
        </Suspense>
      </template>
    </RouterView>
    <ToastContainer class="relative z-50" />
    <!-- 全局首次更新大弹窗 -->
    <NotificationModal
      :show="showUpdateModal"
      class="relative z-50"
      @close="showUpdateModal = false"
    />
    <!-- 管理员公告弹窗（登录后展示，可关闭并记录已读） -->
    <AnnouncementDialog />
  </div>
</template>

<style>
/* Global styles */
body {
  margin: 0;
  font-family: 'DM Sans', sans-serif;
}
</style>
