<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import NotificationBell from '@/components/NotificationBell.vue'
import Sidebar from '@/components/Sidebar.vue'
import ThemeSettingDrawer from '@/components/ThemeSettingDrawer.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const { sidebarOpen } = storeToRefs(appStore)

const showThemeDrawer = ref(false)
</script>

<template>
  <div class="w-screen flex overflow-hidden bg-transparent" style="height: 100dvh;">
    <!-- Mobile Sidebar Overlay -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm transition-opacity lg:hidden"
      @click="appStore.closeSidebar"
    />

    <Sidebar />

    <main class="relative h-full min-w-0 flex flex-1 flex-col overflow-hidden">
      <!-- Top Bar (Mobile/Tablet only or for additional actions) -->
      <header class="glass-panel h-16 flex shrink-0 items-center justify-between border-b border-gray-100/50 px-6 lg:hidden dark:border-gray-700/50">
        <div class="text-lg font-bold">
          QQ 农场智能助手
        </div>
        <button
          class="flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100/50 dark:text-gray-400 dark:hover:bg-gray-700/50"
          @click="appStore.toggleSidebar"
        >
          <div class="i-carbon-menu text-xl" />
        </button>
      </header>

      <!-- Main Content Area -->
      <div class="relative flex flex-1 flex-col overflow-hidden">
        <!-- 浮动操作区域 (配置与通知) -->
        <div class="absolute right-4 top-4 z-40 flex items-center gap-3">
          <NotificationBell />
          <button
            class="glass-panel h-10 w-10 flex items-center justify-center border rounded-full text-gray-600 shadow-md transition-all duration-300 hover:rotate-90 dark:text-gray-300 hover:text-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-gray-900"
            title="系统配置"
            @click="showThemeDrawer = true"
          >
            <div class="i-carbon-settings text-xl" />
          </button>
        </div>

        <div class="custom-scrollbar mt-12 flex flex-1 flex-col overflow-y-auto p-2 md:mt-0 md:p-6 sm:p-4">
          <RouterView v-slot="{ Component, route }">
            <Transition name="slide-fade" mode="out-in">
              <component :is="Component" :key="route.path" />
            </Transition>
          </RouterView>
        </div>
      </div>
    </main>

    <!-- 主题设置抽屉 -->
    <ThemeSettingDrawer :show="showThemeDrawer" @close="showThemeDrawer = false" />
  </div>
</template>

<style scoped>
/* Slide Fade Transition */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease-out;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
