<script setup lang="ts">
import { useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import AccountModal from '@/components/AccountModal.vue'
import NotificationModal from '@/components/NotificationModal.vue'
import RemarkModal from '@/components/RemarkModal.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'

import { menuRoutes } from '@/router/menu'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const appStore = useAppStore()
const route = useRoute()
const { accounts, currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)
const { sidebarOpen } = storeToRefs(appStore)

const showAccountDropdown = ref(false)
const showAccountModal = ref(false)
const showRemarkModal = ref(false)
const showNotificationModal = ref(false)
const accountToEdit = ref<any>(null)
const wsErrorNotifiedAt = ref<Record<string, number>>({})
const hasUnread = ref(false)

const systemConnected = ref(true)
const serverUptimeBase = ref(0)
const serverVersion = ref('')
const lastPingTime = ref(Date.now())
const now = useNow()
const formattedTime = useDateFormat(now, 'YYYY-MM-DD HH:mm:ss')

async function checkConnection() {
  try {
    const res = await api.get('/api/ping')
    systemConnected.value = true
    if (res.data.ok && res.data.data) {
      if (res.data.data.uptime) {
        serverUptimeBase.value = res.data.data.uptime
        lastPingTime.value = Date.now()
      }
      if (res.data.data.version) {
        serverVersion.value = res.data.data.version
      }
    }
    const accountRef = currentAccount.value?.id || currentAccount.value?.uin
    if (accountRef) {
      statusStore.connectRealtime(String(accountRef))
    }
  }
  catch {
    systemConnected.value = false
  }
}

async function refreshStatusFallback() {
  if (realtimeConnected.value)
    return

  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  if (accountRef) {
    await statusStore.fetchStatus(String(accountRef))
  }
}

async function handleAccountSaved() {
  await accountStore.fetchAccounts()
  await refreshStatusFallback()
  showAccountModal.value = false
  showRemarkModal.value = false
}

function openRemarkModal(acc: any) {
  accountToEdit.value = acc
  showRemarkModal.value = true
  showAccountDropdown.value = false
}

onMounted(() => {
  accountStore.fetchAccounts()
  checkConnection()
  loadCurrentUser()
  checkUnread()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

// 监听路由变化，重新加载用户信息
watch(() => route.fullPath, () => {
  loadCurrentUser()
}, { immediate: false })

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

watch(() => status.value?.wsError, (wsError: any) => {
  if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
    return

  const errAt = Number(wsError.at) || 0
  const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
  const lastNotified = wsErrorNotifiedAt.value[accId] || 0
  if (errAt <= lastNotified)
    return

  wsErrorNotifiedAt.value[accId] = errAt
  accountToEdit.value = currentAccount.value
  showAccountModal.value = true
}, { deep: true })

const uptime = computed(() => {
  const diff = Math.floor(serverUptimeBase.value + (now.value.getTime() - lastPingTime.value) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return `${h}h ${m}m ${s}s`
})

const displayName = computed(() => {
  const acc = currentAccount.value
  if (!acc)
    return '选择账号'

  // 1. 优先显示实时状态中的昵称 (如果有且不是未登录)
  const liveName = status.value?.status?.name
  if (liveName && liveName !== '未登录') {
    return liveName
  }

  // 2. 其次显示账号存储的备注名称 (name)
  if (acc.name)
    return acc.name

  // 3. 显示同步的昵称 (nick)
  if (acc.nick)
    return acc.nick

  // 4. 最后显示UIN
  return acc.uin
})

const connectionStatus = computed(() => {
  if (!systemConnected.value) {
    return {
      text: '系统离线',
      color: 'bg-red-500',
      pulse: false,
    }
  }

  if (!currentAccount.value?.id) {
    return {
      text: '请添加账号',
      color: 'bg-gray-400',
      pulse: false,
    }
  }

  const isConnected = status.value?.connection?.connected
  if (isConnected) {
    return {
      text: '运行中',
      color: 'bg-primary-500',
      pulse: true,
    }
  }

  return {
    text: '未连接',
    color: 'bg-gray-400', // Or red? Old version uses gray/offline class which is gray usually
    pulse: false,
  }
})

// 用户信息
const currentUser = ref<any>(null)

function loadCurrentUser() {
  try {
    const userStr = localStorage.getItem('current_user')
    if (userStr) {
      currentUser.value = JSON.parse(userStr)
    }
  }
  catch (e) {
    console.error('加载用户信息失败:', e)
  }
}

const isAdmin = computed(() => {
  return currentUser.value?.role === 'admin'
})

// 监听 localStorage 变化（跨标签页同步）
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'current_user' && e.newValue) {
      try {
        currentUser.value = JSON.parse(e.newValue)
      }
      catch (err) {
        console.error('解析用户信息失败:', err)
      }
    }
  })
}

/**
 * 检查是否有未读通知
 */
async function checkUnread() {
  try {
    const res = await api.get('/api/notifications', { params: { limit: 1 } })
    if (res.data.ok && res.data.data?.length > 0) {
      const latestDate = res.data.data[0].date
      const lastRead = localStorage.getItem('last_read_notification_date') || ''
      hasUnread.value = latestDate !== lastRead
    }
  }
  catch {
    // 静默失败
  }
}

function openNotifications() {
  showNotificationModal.value = true
  hasUnread.value = false
}

// 过滤菜单项：管理员可以看到所有菜单，普通用户看不到 adminOnly 的菜单
const navItems = computed(() => menuRoutes
  .filter((item: any) => {
    // 管理员可以看到所有菜单，普通用户看不到 adminOnly 的菜单
    if (item.adminOnly) {
      return isAdmin.value
    }
    return true
  })
  .map(item => ({
    path: item.path ? `/${item.path}` : '/',
    label: item.label,
    icon: item.icon,
  })))

function selectAccount(acc: any) {
  accountStore.setCurrentAccount(acc)
  showAccountDropdown.value = false
}

const version = __APP_VERSION__

watch(
  () => route.path,
  () => {
    // Close sidebar on route change (mobile only)
    if (window.innerWidth < 1024)
      appStore.closeSidebar()
  },
)
</script>

<template>
  <aside
    class="glass-panel fixed inset-y-0 left-0 z-50 h-full w-64 flex flex-col border-r border-gray-200/50 transition-transform duration-300 lg:static lg:translate-x-0 dark:border-gray-700/50"
    :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <!-- Brand -->
    <div class="h-16 flex items-center justify-between border-b border-gray-100 px-6 dark:border-gray-700/50">
      <div class="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="h-7 w-7">
          <defs>
            <linearGradient id="sidebarGrad" x1="0" y1="1" x2="0.3" y2="0">
              <stop offset="0%" stop-color="#15803d" />
              <stop offset="60%" stop-color="#22c55e" />
              <stop offset="100%" stop-color="#4ade80" />
            </linearGradient>
          </defs>
          <path fill="url(#sidebarGrad)" d="M576 96c0 108.1-76.6 198.3-178.4 219.4c-7.9-58.1-34-110.4-72.5-150.9C365.2 104 433.9 64 512 64h32c17.7 0 32 14.3 32 32M64 160c0-17.7 14.3-32 32-32h32c123.7 0 224 100.3 224 224v192c0 17.7-14.3 32-32 32s-32-14.3-32-32V384C164.3 384 64 283.7 64 160" />
          <circle cx="190" cy="220" r="6" fill="white" opacity="0.6" />
          <circle cx="205" cy="195" r="3.5" fill="white" opacity="0.45" />
          <circle cx="470" cy="150" r="5" fill="white" opacity="0.5" />
          <circle cx="490" cy="125" r="3" fill="white" opacity="0.35" />
        </svg>
        <span class="from-primary-600 to-emerald-500 bg-gradient-to-r bg-clip-text px-1 text-lg text-transparent font-bold tracking-widest">
          🌌 御农
        </span>
      </div>
      <!-- Mobile Close Button -->
      <button
        class="rounded-lg p-1 text-gray-500 lg:hidden hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        @click="appStore.closeSidebar"
      >
        <div class="i-carbon-close text-xl" />
      </button>
    </div>
    <!-- Account Selector -->
    <div class="border-b border-gray-100 p-4 dark:border-gray-700/50">
      <div class="group relative">
        <button
          class="w-full flex items-center justify-between border border-transparent rounded-xl bg-white/50 px-4 py-2.5 outline-none backdrop-blur-sm transition-all duration-200 hover:border-white/40 dark:bg-black/20 hover:bg-white/80 focus:ring-2 focus:ring-primary-500/20 dark:hover:border-white/20 dark:hover:bg-black/40"
          @click="showAccountDropdown = !showAccountDropdown"
        >
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="h-8 w-8 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-2 ring-white dark:bg-gray-600 dark:ring-gray-700">
              <img
                v-if="currentAccount?.uin"
                :src="`https://q1.qlogo.cn/g?b=qq&nk=${currentAccount.uin}&s=100`"
                class="h-full w-full object-cover"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              >
              <div v-else class="i-carbon-user text-gray-400" />
            </div>
            <div class="min-w-0 flex flex-col items-start">
              <span class="w-full truncate text-left text-sm font-medium">
                {{ displayName }}
              </span>
              <span class="w-full truncate text-left text-xs text-gray-400">
                {{ currentAccount?.uin || currentAccount?.id || '未选择' }}
              </span>
            </div>
          </div>
          <div
            class="i-carbon-chevron-down text-gray-400 transition-transform duration-200"
            :class="{ 'rotate-180': showAccountDropdown }"
          />
        </button>

        <!-- Dropdown Menu -->
        <div
          v-if="showAccountDropdown"
          class="glass-panel absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden border border-gray-200/50 rounded-xl py-1 shadow-xl dark:border-white/10"
        >
          <div class="custom-scrollbar max-h-60 overflow-y-auto">
            <template v-if="accounts.length > 0">
              <button
                v-for="acc in accounts"
                :key="acc.id || acc.uin"
                class="w-full flex items-center gap-3 px-4 py-2 transition-colors hover:bg-white/50 dark:hover:bg-white/10"
                :class="{ 'bg-primary-50/50 dark:bg-primary-500/20': currentAccount?.id === acc.id }"
                @click="selectAccount(acc)"
              >
                <div class="h-6 w-6 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
                  <img
                    v-if="acc.uin"
                    :src="`https://q1.qlogo.cn/g?b=qq&nk=${acc.uin}&s=100`"
                    class="h-full w-full object-cover"
                    @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                  >
                  <div v-else class="i-carbon-user text-gray-400" />
                </div>
                <div class="min-w-0 flex flex-1 flex-col items-start">
                  <span class="w-full truncate text-left text-sm font-medium">
                    {{ acc.name || acc.nick || acc.uin }}
                  </span>
                  <span class="text-xs text-gray-400">{{ acc.uin || acc.id }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="rounded-full p-1 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                    title="修改备注"
                    @click.stop="openRemarkModal(acc)"
                  >
                    <div class="i-carbon-edit" />
                  </button>
                  <div v-if="currentAccount?.id === acc.id" class="i-carbon-checkmark text-primary-500" />
                </div>
              </button>
            </template>
            <div v-else class="px-4 py-3 text-center text-sm text-gray-400">
              暂无账号
            </div>
          </div>
          <div class="mt-1 border-t border-gray-100 pt-1 dark:border-gray-700">
            <button
              class="w-full flex items-center gap-2 px-4 py-2 text-sm text-primary-600 transition-colors hover:bg-gray-50 dark:text-primary-400 dark:hover:bg-gray-700/50"
              @click="showAccountModal = true; showAccountDropdown = false"
            >
              <div class="i-carbon-add" />
              <span>添加账号</span>
            </button>
            <router-link
              to="/accounts"
              class="w-full flex items-center gap-2 px-4 py-2 text-sm text-primary-600 transition-colors hover:bg-gray-50 dark:text-primary-400 dark:hover:bg-gray-700/50"
              @click="showAccountDropdown = false"
            >
              <div class="i-carbon-add-alt" />
              <span>管理账号</span>
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-600 transition-all duration-200 hover:bg-gray-50 dark:text-gray-400 hover:text-primary-600 dark:hover:bg-gray-700/50 dark:hover:text-primary-400"
        :active-class="item.path === '/' ? '' : 'bg-primary-50 dark:bg-primary-900/10 text-primary-600 dark:text-primary-400 font-medium shadow-sm ring-1 ring-primary-500/10'"
        :exact-active-class="item.path === '/' ? 'bg-primary-50 dark:bg-primary-900/10 text-primary-600 dark:text-primary-400 font-medium shadow-sm ring-1 ring-primary-500/10' : ''"
      >
        <div class="text-xl transition-transform duration-200 group-hover:scale-110" :class="[item.icon]" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- 通知入口按钮 -->
    <div class="px-3 pb-2">
      <button
        class="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-600 transition-all duration-200 hover:bg-amber-50 dark:text-gray-400 hover:text-amber-600 dark:hover:bg-amber-900/10 dark:hover:text-amber-400"
        @click="openNotifications"
      >
        <div class="relative">
          <div class="i-carbon-notification text-xl" />
          <div
            v-if="hasUnread"
            class="absolute h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 ring-2 ring-white -right-1 -top-1 dark:ring-gray-800"
          />
        </div>
        <span>更新公告</span>
      </button>
    </div>

    <!-- 帮助中心入口 -->
    <div class="px-3 pb-2">
      <router-link
        to="/help"
        class="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-600 transition-all duration-200 hover:bg-blue-50 dark:text-gray-400 hover:text-blue-600 dark:hover:bg-blue-900/10 dark:hover:text-blue-400"
      >
        <div class="i-carbon-book text-xl" />
        <span>帮助中心</span>
      </router-link>
    </div>

    <!-- Footer Status -->
    <div class="mt-auto border-t border-gray-200/50 bg-black/5 p-4 dark:border-white/10 dark:bg-black/20">
      <div class="glass-text-muted mb-2 flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5">
          <div
            class="h-2 w-2 rounded-full"
            :class="[connectionStatus.color, { 'animate-pulse': connectionStatus.pulse }]"
          />
          <span>{{ connectionStatus.text }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span>{{ uptime }}</span>
          <ThemeToggle />
        </div>
      </div>
      <div class="mt-1 flex flex-col gap-0.5 text-xs text-gray-400 font-mono">
        <div class="flex items-center justify-between">
          <span>{{ formattedTime }}</span>
        </div>
        <div class="flex items-center justify-between opacity-50">
          <span>Web v{{ version }}</span>
          <span v-if="serverVersion">Core v{{ serverVersion }}</span>
        </div>
        <!-- 侧栏微缩防伪水印 -->
        <div class="pointer-events-none mt-1.5 flex select-none items-center justify-between border-t border-gray-200/50 pt-1.5 text-[10px] text-gray-400/80 dark:border-gray-700/50">
          <span>Made by smdk000</span>
          <span>QQ群: 227916149</span>
        </div>
      </div>
    </div>
  </aside>

  <!-- Overlay for mobile when sidebar is open -->
  <div
    v-if="showAccountDropdown"
    class="fixed inset-0 z-40 bg-transparent"
    @click="showAccountDropdown = false"
  />

  <AccountModal
    :show="showAccountModal"
    :edit-data="accountToEdit"
    @close="showAccountModal = false; accountToEdit = null"
    @saved="handleAccountSaved"
  />

  <RemarkModal
    :show="showRemarkModal"
    :account="accountToEdit"
    @close="showRemarkModal = false"
    @saved="handleAccountSaved"
  />

  <NotificationModal
    :show="showNotificationModal"
    @close="showNotificationModal = false"
  />
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 2px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
