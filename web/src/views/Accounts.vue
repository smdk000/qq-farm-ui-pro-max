<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'

const router = useRouter()
const accountStore = useAccountStore()
const { accounts, loading } = storeToRefs(accountStore)

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const editingAccount = ref<any>(null)
const accountToDelete = ref<any>(null)

onMounted(() => {
  accountStore.fetchAccounts()
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

    <div v-if="loading && accounts.length === 0" class="glass-text-muted py-8 text-center">
      <div i-svg-spinners-90-ring-with-bg class="mb-2 inline-block text-2xl" />
      <div>加载中...</div>
    </div>

    <div v-else-if="accounts.length === 0" class="glass-panel rounded-lg py-12 text-center shadow">
      <div i-carbon-user-avatar class="mb-4 inline-block text-4xl glass-text-muted" />
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
        v-for="acc in accounts"
        :key="acc.id"
        class="glass-panel cursor-pointer rounded-lg p-4 shadow transition-all duration-300 border border-transparent hover:border-primary-500/50 hover:shadow-[0_0_15px_rgba(var(--color-primary-500),0.1)]"
        :class="acc.id === accountStore.currentAccountId ? 'border-primary-500/50 bg-primary-500/[0.03] shadow-[0_0_20px_rgba(var(--color-primary-500),0.15)] dark:border-primary-400/50' : ''"
        @click="accountStore.selectAccount(acc.id)"
      >
        <div class="mb-4 flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="h-12 w-12 flex items-center justify-center overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <img v-if="acc.uin" :src="`https://q1.qlogo.cn/g?b=qq&nk=${acc.uin}&s=100`" class="h-full w-full object-cover">
              <div v-else class="i-carbon-user text-2xl glass-text-muted" />
            </div>
            <div>
              <h3 class="text-lg font-bold">
                {{ acc.name || acc.nick || acc.id }}
              </h3>
              <div class="glass-text-muted text-sm">
                QQ: {{ acc.uin || '未绑定' }}
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
              <div class="h-2 w-2 rounded-full" :class="acc.running ? 'bg-green-500' : 'bg-gray-300'" />
              {{ acc.running ? '运行中' : '已停止' }}
            </span>
          </div>

          <div class="flex gap-2">
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
