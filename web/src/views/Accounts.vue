<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { adminToken } from '@/utils/auth'
import { useAvatar } from '@/utils/avatar'

const { getAvatarUrl, markFailed } = useAvatar()

const router = useRouter()
const accountStore = useAccountStore()
const { accounts, loading } = storeToRefs(accountStore)

// 排序：运行中的账号排在前面，已停止的排在后面
const sortedAccounts = computed(() => {
  return [...accounts.value].sort((a, b) => {
    if (a.running && !b.running)
      return -1
    if (!a.running && b.running)
      return 1
    return 0
  })
})

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const editingAccount = ref<any>(null)
const accountToDelete = ref<any>(null)

// 批量操作状态
const selectedAccountIds = ref<string[]>([])

function isSelected(id: string) {
  return selectedAccountIds.value.includes(id)
}

function toggleSelection(id: string) {
  const index = selectedAccountIds.value.indexOf(id)
  if (index > -1) {
    selectedAccountIds.value.splice(index, 1)
  }
  else {
    selectedAccountIds.value.push(id)
  }
}

function selectAll() {
  selectedAccountIds.value = accounts.value.map(acc => acc.id)
}

function invertSelection() {
  const allIds = accounts.value.map(acc => acc.id)
  selectedAccountIds.value = allIds.filter(id => !selectedAccountIds.value.includes(id))
}

function clearSelection() {
  selectedAccountIds.value = []
}

const batchLoading = ref(false)
async function bulkSetMode(mode: string) {
  if (selectedAccountIds.value.length === 0)
    return
  try {
    batchLoading.value = true
    for (const id of selectedAccountIds.value) {
      await accountStore.updateAccountMode(id, mode)
    }
  }
  catch (e: any) {
    console.error(`批量设置失败: ${e.message}`)
  }
  finally {
    batchLoading.value = false
    clearSelection()
  }
}

onMounted(() => {
  accountStore.fetchAccounts()
})

// 监听 Token 变化，当用户重新登录或 Token 被赋值时强制同步一次
watch(adminToken, (val) => {
  if (val) {
    accountStore.fetchAccounts()
  }
})

useIntervalFn(() => {
  accountStore.fetchAccounts()
}, 3000)

function openSettings(account: any) {
  accountStore.selectAccount(account.id)
  router.push('/settings')
}

function openAddModal() {
  editingAccount.value = null
  showModal.value = true
}

function openEditModal(account: any) {
  editingAccount.value = { ...account }
  showModal.value = true
}

async function handleDelete(account: any) {
  accountToDelete.value = account
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (accountToDelete.value) {
    try {
      deleteLoading.value = true
      await accountStore.deleteAccount(accountToDelete.value.id)
      accountToDelete.value = null
      showDeleteConfirm.value = false
    }
    finally {
      deleteLoading.value = false
    }
  }
}

async function toggleAccount(account: any) {
  if (account.running) {
    await accountStore.stopAccount(account.id)
  }
  else {
    await accountStore.startAccount(account.id)
  }
}

function handleSaved() {
  accountStore.fetchAccounts()
}

async function handleModeChange(acc: any, mode: string) {
  try {
    await accountStore.updateAccountMode(acc.id, mode)
  }
  catch (e: any) {
    console.error(`切换模式失败: ${e.message}`)
  }
}

const safeCheckingId = ref('')
async function handleSafeCheck(acc: any) {
  // eslint-disable-next-line no-alert
  if (confirm(`是否分析 ${acc.name || acc.id} 的历史封禁日志并自动补充黑名单？`)) {
    try {
      safeCheckingId.value = acc.id
      const res = await accountStore.applySafeModeBlacklist(acc.id)
      if (res && res.ok && res.data && res.data.length >= 0) {
        // success
      }
      else {
        // null
      }
    }
    catch (e: any) {
      console.error(`生成失败: ${e.message}`)
    }
    finally {
      safeCheckingId.value = ''
    }
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl w-full p-4">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        账号管理
      </h1>
      <BaseButton
        variant="primary"
        @click="openAddModal"
      >
        <div class="i-carbon-add mr-2" />
        添加账号
      </BaseButton>
    </div>

    <!-- 批量操作面板 -->
    <div v-if="accounts.length > 0" class="glass-panel mb-4 flex items-center justify-between rounded-lg p-3 shadow-sm">
      <div class="flex items-center gap-2">
        <BaseButton
          size="sm"
          class="border-0 from-blue-500 to-blue-600 bg-gradient-to-r text-xs text-white font-bold shadow-blue-500/25 shadow-md transition-all hover:from-blue-600 hover:to-blue-700 !px-4 !py-1.5 dark:shadow-blue-500/40 hover:shadow-blue-500/40 hover:shadow-lg"
          @click="selectAll"
        >
          <div class="i-carbon-checkmark-outline mr-1.5 text-sm" /> 全选
        </BaseButton>
        <BaseButton
          size="sm"
          class="border border-gray-300/50 bg-black/5 text-xs font-bold transition-all dark:bg-white/5 hover:bg-black/10 !px-4 !py-1.5 dark:hover:bg-white/10"
          @click="invertSelection"
        >
          反选
        </BaseButton>
        <BaseButton
          size="sm"
          class="border-0 from-red-500 to-red-600 bg-gradient-to-r text-xs text-white font-bold shadow-md shadow-red-500/25 transition-all hover:from-red-600 hover:to-red-700 !px-4 !py-1.5 dark:shadow-red-500/40 hover:shadow-lg hover:shadow-red-500/40"
          @click="clearSelection"
        >
          <div class="i-carbon-close-outline mr-1.5 text-sm" /> 清空
        </BaseButton>

        <span class="glass-text-muted ml-2 text-xs font-medium">
          已选 {{ selectedAccountIds.length }} 项
        </span>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="selectedAccountIds.length === 0 || batchLoading"
          class="text-xs transition-opacity"
          :class="selectedAccountIds.length === 0 ? 'opacity-50' : 'opacity-100'"
          @click="bulkSetMode('alt')"
        >
          <div v-if="batchLoading" class="i-svg-spinners-ring-resize mr-1 text-sm" />
          <div v-else class="i-carbon-copy mr-1 text-sm" />
          批量设为小号
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="selectedAccountIds.length === 0 || batchLoading"
          class="text-xs transition-opacity !border-emerald-500/20 !bg-emerald-500/10 !text-emerald-600 hover:!bg-emerald-500/20 dark:!text-emerald-400"
          :class="selectedAccountIds.length === 0 ? 'opacity-50' : 'opacity-100'"
          @click="bulkSetMode('safe')"
        >
          <div v-if="batchLoading" class="i-svg-spinners-ring-resize mr-1 text-sm" />
          <div v-else class="i-carbon-security mr-1 text-sm" />
          批量设为风险规避
        </BaseButton>
      </div>
    </div>

    <div v-if="loading && accounts.length === 0" class="glass-panel min-h-[300px] flex flex-col items-center justify-center rounded-lg py-12 text-center shadow">
      <div class="relative mb-6">
        <div class="i-svg-spinners-ring-resize text-5xl text-primary-500" />
        <div class="absolute inset-0 animate-ping rounded-full bg-primary-400/20 blur-xl" />
      </div>
      <h3 class="text-lg font-semibold tracking-tight">
        正在同步云端账号...
      </h3>
      <p class="glass-text-muted mt-2 text-sm">
        正在为您的容器分配安全资源，请稍候
      </p>
    </div>

    <div v-else-if="accounts.length === 0" class="glass-panel rounded-lg py-12 text-center shadow">
      <div i-carbon-user-avatar class="glass-text-muted mb-4 inline-block text-4xl" />
      <p class="glass-text-muted mb-4">
        暂无账号
      </p>
      <BaseButton
        variant="text"
        @click="openAddModal"
      >
        立即添加
      </BaseButton>
    </div>

    <div v-else class="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 sm:grid-cols-2">
      <div
        v-for="acc in sortedAccounts"
        :key="acc.id"
        class="glass-panel cursor-pointer border border-transparent rounded-lg p-4 shadow transition-all duration-300 hover:border-primary-500/50 hover:shadow-[0_0_15px_rgba(var(--color-primary-500),0.1)]"
        :class="acc.id === accountStore.currentAccountId ? 'border-primary-500/50 bg-primary-500/[0.03] shadow-[0_0_20px_rgba(var(--color-primary-500),0.15)] dark:border-primary-400/50' : ''"
        @click="accountStore.selectAccount(acc.id)"
      >
        <div class="relative mb-4 flex items-start justify-between pl-8">
          <!-- Selection Checkbox -->
          <div
            class="absolute left-2 top-2 h-5 w-5 flex cursor-pointer items-center justify-center border rounded transition-colors"
            :class="isSelected(acc.id) ? 'bg-primary-500 border-primary-500' : 'border-gray-300/50 bg-black/5 dark:border-gray-600 dark:bg-white/5'"
            @click.stop="toggleSelection(acc.id)"
          >
            <div v-if="isSelected(acc.id)" class="i-carbon-checkmark text-white" />
          </div>

          <div class="flex items-center gap-3">
            <div class="h-12 w-12 flex items-center justify-center overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <img v-if="getAvatarUrl(acc)" :src="getAvatarUrl(acc)" class="h-full w-full object-cover" @error="(e) => markFailed((e.target as HTMLImageElement).src)">
              <div v-else class="i-carbon-user glass-text-muted text-2xl" />
            </div>
            <div>
              <h3 class="text-lg font-bold">
                {{ acc.name || acc.nick || acc.id }}
              </h3>
              <div class="glass-text-muted mt-1 flex items-center gap-2 text-xs">
                <span>QQ: {{ acc.uin || '未绑定' }}</span>
              </div>
            </div>
          </div>
          <div class="flex flex-col items-end gap-2">
            <BaseButton
              variant="secondary"
              size="sm"
              class="w-20 border rounded-full shadow-sm transition-all duration-500 ease-in-out active:scale-95"
              :class="acc.running ? 'border-red-500/20 bg-red-500/10 text-red-600 hover:bg-red-500/20 focus:ring-red-500/50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20' : 'border-green-500/20 bg-green-500/10 text-green-600 hover:bg-green-500/20 focus:ring-green-500/50 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400 dark:hover:bg-green-500/20'"
              @click.stop="toggleAccount(acc)"
            >
              <div :class="acc.running ? 'i-carbon-stop-filled' : 'i-carbon-play-filled'" class="mr-1" />
              {{ acc.running ? '停止' : '启动' }}
            </BaseButton>
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between border-t border-gray-100/50 pt-4 dark:border-white/10">
          <div class="glass-text-muted flex items-center gap-2 text-sm">
            <span class="flex items-center gap-1">
              <template v-if="acc.running">
                <template v-if="acc.connected">
                  <div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  运行中
                </template>
                <template v-else-if="acc.wsError || acc.level !== undefined">
                  <div class="h-2 w-2 rounded-full bg-red-500" />
                  <span class="text-red-500 font-medium dark:text-red-400" :title="acc.wsError?.message || 'WebSocket连接断开'">已掉线</span>
                </template>
                <template v-else>
                  <div class="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  <span class="text-yellow-600 font-medium dark:text-yellow-500">连接中...</span>
                </template>
              </template>
              <template v-else>
                <div class="h-2 w-2 rounded-full bg-gray-300" />
                已停止
              </template>
            </span>
            <transition name="fade">
              <BaseButton
                v-if="(acc.accountMode || (acc as any).account_mode) === 'safe'"
                variant="ghost"
                size="sm"
                class="rounded bg-emerald-500/10 text-emerald-600 !ml-2 hover:bg-emerald-500/20 !p-1 !text-xs dark:text-emerald-400"
                title="一键分析封禁日志并加入黑名单"
                :loading="safeCheckingId === acc.id"
                @click.stop="handleSafeCheck(acc)"
              >
                <div class="i-carbon-security mr-1" />
                防封扫描
              </BaseButton>
            </transition>
          </div>

          <div class="flex items-center gap-1">
            <!-- 一键快速模式切换 -->
            <div class="mr-1 flex items-center gap-0.5 border border-gray-200/50 rounded bg-black/[0.02] p-0.5 dark:border-gray-700/50 dark:bg-white/[0.02]" @click.stop>
              <button
                class="cursor-pointer rounded px-2 py-1 text-xs font-medium transition-all"
                :class="(acc.accountMode || (acc as any).account_mode || 'main') === 'main' ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700 hover:bg-black/5 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5'"
                title="设为主号"
                @click="handleModeChange(acc, 'main')"
              >
                主号
              </button>
              <button
                class="cursor-pointer rounded px-2 py-1 text-xs font-medium transition-all"
                :class="(acc.accountMode || (acc as any).account_mode) === 'alt' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'text-gray-500 hover:text-gray-700 hover:bg-black/5 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5'"
                title="设为小号"
                @click="handleModeChange(acc, 'alt')"
              >
                小号
              </button>
              <button
                class="cursor-pointer rounded px-2 py-1 text-xs font-medium transition-all"
                :class="(acc.accountMode || (acc as any).account_mode) === 'safe' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:text-gray-700 hover:bg-black/5 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5'"
                title="设为风险规避"
                @click="handleModeChange(acc, 'safe')"
              >
                避险
              </button>
            </div>

            <BaseButton
              variant="ghost"
              class="!p-2"
              title="设置"
              @click.stop="openSettings(acc)"
            >
              <div class="i-carbon-settings text-lg" />
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="!p-2"
              title="编辑"
              @click.stop="openEditModal(acc)"
            >
              <div class="i-carbon-edit text-lg" />
            </BaseButton>
            <BaseButton
              variant="ghost"
              class="text-red-500 !p-2 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
              title="删除"
              @click.stop="handleDelete(acc)"
            >
              <div class="i-carbon-trash-can text-lg" />
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <AccountModal
      :show="showModal"
      :edit-data="editingAccount"
      @close="showModal = false"
      @saved="handleSaved"
    />

    <ConfirmModal
      :show="showDeleteConfirm"
      :loading="deleteLoading"
      title="删除账号"
      :message="accountToDelete ? `确定要删除账号 ${accountToDelete.name || accountToDelete.id} 吗?` : ''"
      confirm-text="删除"
      type="danger"
      @close="!deleteLoading && (showDeleteConfirm = false)"
      @cancel="!deleteLoading && (showDeleteConfirm = false)"
      @confirm="confirmDelete"
    />
  </div>
</template>
