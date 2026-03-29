<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BugReportModal from '@/components/BugReportModal.vue'
import LeaderboardModal from '@/components/LeaderboardModal.vue'
import NotificationBell from '@/components/NotificationBell.vue'
import Sidebar from '@/components/Sidebar.vue'
import ThemeSettingDrawer from '@/components/ThemeSettingDrawer.vue'
import { useAppStore } from '@/stores/app'
import { clearAuth } from '@/utils/auth'
import { attemptRouteRecovery, extractRouteErrorMessage, isRecoverableRouteError } from '@/utils/route-recovery'
import { localizeRuntimeText } from '@/utils/runtime-text'

const appStore = useAppStore()
const route = useRoute()
const { sidebarOpen } = storeToRefs(appStore)

const showThemeDrawer = ref(false)
const showLeaderboard = ref(false)
const showBugReportModal = ref(false)
const routeRenderError = ref<unknown | null>(null)
const routeRecoveryBusy = ref(false)
const workspaceShellClass = computed(() => `workspace-shell--${appStore.workspaceVisualPreset}`)
const workspaceContentClass = computed(() => {
  const mode = String(route.meta?.layoutMode || 'fluid')
  return ['standard', 'wide', 'fluid'].includes(mode)
    ? `workspace-content-shell--${mode}`
    : 'workspace-content-shell--fluid'
})
const routeErrorMessage = computed(() => {
  if (!routeRenderError.value)
    return '页面内容加载失败，请刷新后重试。'

  const localized = localizeRuntimeText(extractRouteErrorMessage(routeRenderError.value))
  const firstLine = localized.split('\n').map(item => item.trim()).find(Boolean)
  return firstLine || '页面内容加载失败，请刷新后重试。'
})

function recoverCurrentRoute() {
  routeRecoveryBusy.value = true
  const recovered = attemptRouteRecovery(route.fullPath)
  if (!recovered)
    routeRecoveryBusy.value = false
}

async function handleLogout() {
  await clearAuth()
  window.location.href = '/login'
}

watch(() => route.fullPath, () => {
  routeRenderError.value = null
  routeRecoveryBusy.value = false
})

onErrorCaptured((error, _instance, info) => {
  console.error('布局页捕获到路由内容异常:', error, info)
  routeRenderError.value = error
  if (isRecoverableRouteError(error)) {
    recoverCurrentRoute()
    return false
  }
  return false
})
</script>

<template>
  <div class="workspace-shell max-w-full w-full flex overflow-hidden bg-transparent" :class="workspaceShellClass" style="height: 100dvh;">
    <div class="workspace-shell__wash" />
    <div class="workspace-shell__glow workspace-shell__glow--left" />
    <div class="workspace-shell__glow workspace-shell__glow--right" />
    <!-- Mobile Sidebar Overlay -->
    <div
      v-if="sidebarOpen"
      class="layout-overlay fixed inset-0 z-40 backdrop-blur-sm transition-opacity xl:hidden"
      @click="appStore.closeSidebar"
    />

    <Sidebar />

    <main class="relative z-10 h-full min-w-0 flex flex-1 flex-col overflow-hidden">
      <!-- Top Bar (Mobile/Tablet only or for additional actions) -->
      <header class="layout-mobile-header glass-panel h-14 flex shrink-0 items-center justify-between border-b xl:hidden">
        <button
          class="layout-mobile-menu-btn flex items-center justify-center rounded-lg p-2"
          @click="appStore.toggleSidebar"
        >
          <div class="i-carbon-menu text-xl" />
        </button>
        <div class="truncate text-sm font-semibold">
          QQ 农场智能助手
        </div>
        <!-- 右侧占位，保持标题居中 -->
        <div class="w-9" />
      </header>

      <!-- Main Content Area -->
      <div class="relative flex flex-1 flex-col overflow-hidden">
        <!-- 浮动操作区域 (配置与通知) -->
        <div class="workspace-floating-actions absolute z-40 flex items-center gap-3">
          <button
            class="layout-bug-report-btn glass-panel h-10 w-10 flex items-center justify-center border rounded-full shadow-md transition-all duration-300 hover:scale-110 focus:outline-none hover:-rotate-6"
            title="问题反馈"
            aria-label="问题反馈"
            @click="showBugReportModal = true"
          >
            <span class="layout-bug-report-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="layout-bug-report-icon-svg">
                <circle cx="12" cy="7" r="2.1" fill="currentColor" />
                <ellipse cx="12" cy="13" rx="4.1" ry="5.1" fill="currentColor" opacity="0.92" />
                <path d="M7.1 10.1 4.9 8.4M6.1 13H3.7m2.4 3.1-2 1.6m11.7-7.6 2.2-1.7m-1.2 4.6h2.4m-3.4 3.1 2 1.6M9.4 7.6 7.8 5.7m6.8 1.9 1.6-1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </button>
          <button
            class="layout-trophy-btn glass-panel h-10 w-10 flex items-center justify-center border rounded-full shadow-md transition-all duration-300 hover:rotate-12 hover:scale-110 focus:outline-none"
            title="平台排行榜"
            @click="showLeaderboard = true"
          >
            <div class="i-carbon-trophy layout-trophy-icon text-xl" />
          </button>
          <NotificationBell />
          <button
            class="glass-panel glass-text-main h-10 w-10 flex items-center justify-center border rounded-full shadow-md transition-all duration-300 hover:rotate-90 hover:text-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-offset-gray-900"
            title="系统配置"
            @click="showThemeDrawer = true"
          >
            <div class="i-carbon-settings text-xl" />
          </button>
          <button
            class="layout-logout-btn glass-panel h-10 w-10 flex items-center justify-center border rounded-full shadow-md transition-all duration-300 hover:translateY(-1px) hover:scale-110 focus:outline-none"
            title="退出登录"
            aria-label="退出登录"
            @click="handleLogout"
          >
            <div class="i-carbon-logout layout-logout-icon text-xl" />
          </button>
        </div>

        <div class="workspace-scroll custom-scrollbar flex flex-1 flex-col overflow-y-auto">
          <div class="workspace-content-shell w-full" :class="workspaceContentClass">
            <RouterView v-slot="{ Component, route: currentRoute }">
              <div
                v-if="routeRenderError"
                :key="`route-error-${currentRoute.fullPath}`"
                class="workspace-route-stage route-error-state glass-panel mx-auto my-8 max-w-3xl w-full border rounded-[28px] px-6 py-10 text-center"
              >
                <div class="route-error-icon i-carbon-warning-alt-filled mx-auto h-12 w-12" />
                <h2 class="mt-4 text-xl font-semibold">
                  页面加载中断
                </h2>
                <p class="glass-text-muted mx-auto mt-3 max-w-2xl text-sm leading-6">
                  {{ routeErrorMessage }}
                </p>
                <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    class="route-error-primary rounded-full px-5 py-2.5 text-sm font-semibold transition-all"
                    :disabled="routeRecoveryBusy"
                    @click="recoverCurrentRoute"
                  >
                    {{ routeRecoveryBusy ? '正在恢复...' : '刷新当前页面' }}
                  </button>
                  <button
                    class="route-error-secondary rounded-full px-5 py-2.5 text-sm font-semibold transition-all"
                    @click="routeRenderError = null"
                  >
                    关闭提示
                  </button>
                </div>
              </div>
              <div
                v-else-if="Component"
                :key="currentRoute.fullPath"
                class="workspace-route-stage"
              >
                <component :is="Component" />
              </div>
              <div
                v-else
                :key="`loading-${currentRoute.fullPath}`"
                class="workspace-route-stage workspace-route-stage--loading ui-text-3 flex flex-1 items-center justify-center py-20"
              >
                <div class="i-svg-spinners-ring-resize text-3xl" />
              </div>
            </RouterView>
          </div>
        </div>
      </div>
    </main>

    <!-- 主题设置抽屉 -->
    <ThemeSettingDrawer :show="showThemeDrawer" @close="showThemeDrawer = false" />

    <!-- 全平台账号排行榜弹窗 -->
    <LeaderboardModal :show="showLeaderboard" @close="showLeaderboard = false" />
    <BugReportModal :show="showBugReportModal" @close="showBugReportModal = false" />
  </div>
</template>

<style scoped>
.workspace-shell {
  position: relative;
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
  --workspace-panel-border: var(--ui-border-subtle);
  --workspace-panel-blur: 18px;
  --workspace-panel-shadow: 0 18px 48px var(--ui-shadow-panel);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 62%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
}

.workspace-shell::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.42;
  background:
    radial-gradient(circle at 82% 18%, color-mix(in srgb, var(--ui-brand-500) 10%, transparent), transparent 20%),
    radial-gradient(circle at 88% 78%, color-mix(in srgb, var(--ui-brand-500) 8%, transparent), transparent 24%);
}

:global(.dark) .workspace-shell {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 74%, transparent);
  --workspace-panel-border: var(--ui-border-subtle);
  --workspace-panel-shadow: 0 18px 48px var(--ui-shadow-panel-strong);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 56%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.workspace-shell--console {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 78%, transparent);
  --workspace-panel-border: var(--ui-border-subtle);
  --workspace-panel-blur: 18px;
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 62%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
}

:global(.dark) .workspace-shell--console {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 70%, transparent);
  --workspace-panel-border: color-mix(in srgb, var(--ui-border-subtle) 76%, var(--ui-brand-500) 24%);
  --workspace-panel-shadow: 0 20px 52px var(--ui-shadow-panel-strong);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 56%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
}

.workspace-shell--poster {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 64%, transparent);
  --workspace-panel-border: color-mix(in srgb, var(--ui-border-subtle) 64%, var(--ui-border-strong) 36%);
  --workspace-panel-blur: 22px;
  --workspace-panel-shadow: 0 22px 60px var(--ui-shadow-panel);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 56%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 76%, transparent);
}

:global(.dark) .workspace-shell--poster {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 60%, transparent);
  --workspace-panel-border: color-mix(in srgb, var(--ui-border-subtle) 72%, var(--ui-brand-500) 28%);
  --workspace-panel-shadow: 0 22px 68px var(--ui-shadow-panel-strong);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 52%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 68%, transparent);
}

.workspace-shell--pure_glass {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 52%, transparent);
  --workspace-panel-border: color-mix(in srgb, var(--ui-border-subtle) 58%, var(--ui-border-strong) 42%);
  --workspace-panel-blur: 28px;
  --workspace-panel-shadow: 0 24px 72px var(--ui-shadow-panel);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 50%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 66%, transparent);
}

:global(.dark) .workspace-shell--pure_glass {
  --workspace-panel-bg: color-mix(in srgb, var(--ui-bg-surface) 50%, transparent);
  --workspace-panel-border: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-brand-500) 30%);
  --workspace-panel-shadow: 0 24px 72px var(--ui-shadow-panel-strong);
  --workspace-field-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 48%, transparent);
  --workspace-field-focus-bg: color-mix(in srgb, var(--ui-bg-surface-raised) 62%, transparent);
}

.workspace-shell__wash {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-text-1) 6%, transparent),
      transparent 18%,
      transparent 72%,
      color-mix(in srgb, var(--ui-overlay-backdrop) 30%, transparent)
    ),
    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--ui-text-1) 8%, transparent), transparent 26%);
}

:global(.dark) .workspace-shell__wash {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--ui-text-1) 5%, transparent),
      transparent 18%,
      transparent 70%,
      color-mix(in srgb, var(--ui-overlay-backdrop) 42%, transparent)
    ),
    radial-gradient(circle at 12% 12%, color-mix(in srgb, var(--ui-brand-500) 10%, transparent), transparent 26%);
}

.workspace-shell__glow {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  border-radius: 9999px;
  filter: blur(64px);
  opacity: 0.34;
  background: color-mix(in srgb, var(--ui-brand-500) 20%, transparent);
}

.workspace-shell__glow--left {
  top: 7%;
  left: 4%;
  width: 22rem;
  height: 22rem;
}

.workspace-shell__glow--right {
  right: 5%;
  bottom: 8%;
  width: 18rem;
  height: 18rem;
}

.workspace-shell :deep(.glass-panel) {
  background-color: var(--workspace-panel-bg) !important;
  border-color: var(--workspace-panel-border) !important;
  backdrop-filter: blur(var(--workspace-panel-blur)) !important;
  -webkit-backdrop-filter: blur(var(--workspace-panel-blur)) !important;
  box-shadow: var(--workspace-panel-shadow);
}

.workspace-shell
  :deep(input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='color'])),
.workspace-shell :deep(textarea),
.workspace-shell :deep(select),
.workspace-shell :deep(.base-select-trigger) {
  background-color: var(--workspace-field-bg) !important;
  backdrop-filter: blur(calc(var(--workspace-panel-blur) * 0.65)) !important;
  -webkit-backdrop-filter: blur(calc(var(--workspace-panel-blur) * 0.65)) !important;
}

.workspace-shell
  :deep(
    input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='color']):focus
  ),
.workspace-shell :deep(textarea:focus),
.workspace-shell :deep(select:focus),
.workspace-shell :deep(.base-select-trigger.ring-2),
.workspace-shell :deep(.base-select-trigger:hover) {
  background-color: var(--workspace-field-focus-bg) !important;
}

.workspace-scroll {
  position: relative;
  z-index: 1;
  padding: calc(var(--workspace-gutter-block) + env(safe-area-inset-top, 0px))
    calc(var(--workspace-gutter-inline) + env(safe-area-inset-right, 0px))
    calc(var(--workspace-gutter-block) + env(safe-area-inset-bottom, 0px))
    calc(var(--workspace-gutter-inline) + env(safe-area-inset-left, 0px));
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  scrollbar-gutter: stable;
}

.workspace-content-shell {
  width: 100%;
  min-height: 100%;
  margin: 0 auto 0 0;
  display: flex;
  flex-direction: column;
}

.workspace-content-shell--standard {
  max-width: var(--workspace-content-max-width-standard, 82rem);
}

.workspace-content-shell--wide {
  max-width: var(--workspace-content-max-width-wide, 104rem);
}

.workspace-content-shell--fluid {
  max-width: none;
  margin: 0;
}

.workspace-content-shell > * {
  width: 100%;
  min-width: 0;
}

/* Route outlet animation */
.workspace-route-stage {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  min-width: 0;
  animation: workspace-route-enter 0.2s ease-out;
}

.workspace-route-stage--loading {
  min-height: 20rem;
}

@keyframes workspace-route-enter {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: var(--ui-scrollbar-thumb);
  border-radius: 3px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: var(--ui-scrollbar-thumb-hover);
}

.layout-overlay {
  background: color-mix(in srgb, var(--ui-bg-canvas) 45%, var(--ui-overlay-backdrop) 55%);
}

.layout-mobile-header {
  border-color: var(--ui-border-subtle);
  padding-inline: calc(var(--workspace-gutter-inline) + env(safe-area-inset-left, 0px))
    calc(var(--workspace-gutter-inline) + env(safe-area-inset-right, 0px));
}

.layout-mobile-menu-btn {
  color: var(--ui-text-2);
}

.layout-mobile-menu-btn:hover {
  background: var(--ui-bg-surface);
  color: var(--ui-text-1);
}

.layout-trophy-btn {
  border-color: color-mix(in srgb, var(--ui-status-warning) 30%, var(--ui-border-subtle));
  background:
    radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--ui-text-on-brand) 32%, transparent), transparent 60%),
    color-mix(in srgb, var(--ui-status-warning-soft) 70%, transparent);
  box-shadow: 0 10px 20px -10px color-mix(in srgb, var(--ui-status-warning) 45%, transparent);
}

.layout-logout-btn {
  border-color: color-mix(in srgb, var(--ui-status-danger) 30%, var(--ui-border-subtle));
  background:
    radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--ui-text-on-brand) 24%, transparent), transparent 62%),
    color-mix(in srgb, var(--ui-status-danger) 12%, var(--ui-bg-surface-raised) 88%);
  box-shadow: 0 12px 24px -12px color-mix(in srgb, var(--ui-status-danger) 40%, transparent);
}

.layout-bug-report-btn {
  border-color: color-mix(in srgb, var(--ui-status-danger) 28%, var(--ui-border-subtle));
  background:
    radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--ui-text-on-brand) 28%, transparent), transparent 62%),
    color-mix(in srgb, var(--ui-status-danger) 10%, var(--ui-bg-surface-raised) 90%);
  box-shadow: 0 12px 24px -12px color-mix(in srgb, var(--ui-status-danger) 42%, transparent);
}

.layout-trophy-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.layout-logout-btn:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-status-danger) 22%, var(--ui-focus-ring) 78%);
}

.layout-bug-report-btn:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-status-danger) 18%, var(--ui-focus-ring) 82%);
}

.layout-trophy-icon {
  color: var(--ui-status-warning);
}

.layout-logout-icon {
  color: var(--ui-status-danger);
}

.layout-bug-report-icon {
  display: inline-flex;
  height: 1.2rem;
  width: 1.2rem;
  color: var(--ui-status-danger);
}

.layout-bug-report-icon-svg {
  height: 100%;
  width: 100%;
}

.workspace-floating-actions {
  top: calc(var(--workspace-floating-offset) + env(safe-area-inset-top, 0px));
  right: calc(var(--workspace-floating-offset) + env(safe-area-inset-right, 0px));
  pointer-events: none;
}

.workspace-floating-actions > * {
  pointer-events: auto;
}

.route-error-state {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 88%, transparent) !important;
}

.route-error-icon {
  color: color-mix(in srgb, var(--ui-status-warning) 82%, var(--ui-text-1));
}

.route-error-primary {
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 28%, transparent);
  background: color-mix(in srgb, var(--ui-brand-500) 18%, var(--ui-bg-surface-raised) 82%);
  color: var(--ui-text-on-brand);
}

.route-error-primary:disabled {
  cursor: wait;
  opacity: 0.72;
}

.route-error-secondary {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 62%, transparent);
  color: var(--ui-text-1);
}

.route-error-primary:hover:not(:disabled),
.route-error-secondary:hover {
  transform: translateY(-1px);
}

@media (max-width: 1279px) {
  .workspace-scroll {
    padding-top: calc(
      var(--workspace-gutter-block) + var(--workspace-floating-clearance) + env(safe-area-inset-top, 0px)
    );
  }
}

@media (max-width: 767px) {
  .workspace-shell {
    min-height: 100svh;
    height: auto !important;
    overflow: visible;
  }

  .layout-mobile-header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: color-mix(in srgb, var(--workspace-panel-bg) 96%, transparent);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .workspace-shell main,
  .workspace-shell .workspace-scroll {
    overflow: visible;
  }

  .workspace-scroll {
    flex: 0 0 auto;
    min-height: 0;
    padding-top: calc(
      var(--workspace-gutter-block) + var(--workspace-floating-clearance) + 0.25rem + env(safe-area-inset-top, 0px)
    );
    overscroll-behavior-y: auto;
    scrollbar-gutter: auto;
  }

  .workspace-content-shell,
  .workspace-route-stage {
    min-height: auto;
  }
}

@media (min-width: 1440px) {
  .workspace-shell::after {
    opacity: 0.56;
    background:
      radial-gradient(circle at 80% 16%, color-mix(in srgb, var(--ui-brand-500) 11%, transparent), transparent 21%),
      radial-gradient(circle at 90% 76%, color-mix(in srgb, var(--ui-brand-500) 9%, transparent), transparent 26%),
      radial-gradient(circle at 62% 92%, color-mix(in srgb, var(--ui-brand-500) 6%, transparent), transparent 24%);
  }

  .workspace-shell__glow--left {
    width: 24rem;
    height: 24rem;
  }

  .workspace-shell__glow--right {
    right: 3%;
    width: 22rem;
    height: 22rem;
  }
}

@media (min-width: 1920px) {
  .workspace-shell::after {
    opacity: 0.64;
    background:
      radial-gradient(circle at 80% 15%, color-mix(in srgb, var(--ui-brand-500) 12%, transparent), transparent 22%),
      radial-gradient(circle at 92% 74%, color-mix(in srgb, var(--ui-brand-500) 10%, transparent), transparent 28%),
      radial-gradient(circle at 66% 88%, color-mix(in srgb, var(--ui-brand-500) 7%, transparent), transparent 26%);
  }

  .workspace-shell__glow--left {
    left: 3%;
    width: 26rem;
    height: 26rem;
  }

  .workspace-shell__glow--right {
    right: 2%;
    width: 24rem;
    height: 24rem;
  }
}
</style>
