/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

interface User {
  username: string
  role: string
  card: {
    type: string
    expiresAt: number | null
    enabled: boolean
  } | null
}

const users = ref<User[]>([])
const loading = ref(false)
const selectedUsers = ref<string[]>([])
const showEditModal = ref(false)
const editingUser = ref<User | null>(null)
const newExpiryDate = ref('')
const newExpiryTime = ref('23:59')
const newEnabled = ref(true)
const isPermanent = ref(false)
const actionLoading = ref(false)
const actionError = ref('')

onMounted(async () => {
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  try {
    const res = await api.get('/api/users')
    users.value = res.data.users || []
  }
  catch (e: any) {
    console.error('加载用户列表失败:', e)
  }
  finally {
    loading.value = false
  }
}

function toggleSelectAll() {
  if (selectedUsers.value.length === users.value.length) {
    selectedUsers.value = []
  }
  else {
    selectedUsers.value = users.value.map(u => u.username)
  }
}

function openEditModal(user: User) {
  editingUser.value = user
  newEnabled.value = user.card?.enabled !== false

  if (user.card?.expiresAt) {
    const date = new Date(user.card.expiresAt)
    newExpiryDate.value = date.toISOString().split('T')[0] || ''
    newExpiryTime.value = date.toTimeString().slice(0, 5)
    isPermanent.value = false
  }
  else {
    isPermanent.value = true
    newExpiryDate.value = ''
    newExpiryTime.value = '23:59'
  }

  showEditModal.value = true
  actionError.value = ''
}

async function saveEdit() {
  if (!editingUser.value)
    return

  actionLoading.value = true
  actionError.value = ''

  try {
    const expiresAt = isPermanent.value
      ? null
      : new Date(`${newExpiryDate.value}T${newExpiryTime.value}:00`).getTime()

    await api.put(`/api/users/${editingUser.value.username}`, {
      expiresAt,
      enabled: newEnabled.value,
    })

    showEditModal.value = false
    await loadUsers()
  }
  catch (e: any) {
    actionError.value = e.response?.data?.error || e.message || '保存失败'
  }
  finally {
    actionLoading.value = false
  }
}

async function deleteUser(username: string) {
  if (!window.window.confirm(`确定要删除用户 "${username}" 吗？`))
    return

  try {
    await api.delete(`/api/users/${username}`)
    await loadUsers()
  }
  catch (e: any) {
    console.error('删除用户失败:', e)
  }
}

async function batchDelete() {
  if (selectedUsers.value.length === 0)
    return

  if (!window.window.confirm(`确定要删除选中的 ${selectedUsers.value.length} 个用户吗？`))
    return

  try {
    for (const username of selectedUsers.value) {
      await api.delete(`/api/users/${username}`)
    }
    selectedUsers.value = []
    await loadUsers()
  }
  catch (e: any) {
    console.error('批量删除失败:', e)
  }
}

function formatCardType(type: string) {
  const typeMap: Record<string, string> = {
    D: '天卡',
    W: '周卡',
    M: '月卡',
    F: '永久卡',
    T: '体验卡',
  }
  return typeMap[type] || type
}

async function handleTrialRenew(username: string) {
  if (!window.window.confirm(`确定要为用户 "${username}" 续费体验卡吗？`))
    return
  try {
    const res = await api.post(`/api/users/${username}/trial-renew`)
    if (res.data.ok) {
      await loadUsers()
    }
  }
  catch (e: any) {
    console.error('续费失败:', e)
    console.warn(e.response?.data?.error || '续费失败')
  }
}

function formatExpiry(expiresAt: number | null) {
  if (!expiresAt)
    return '永久'
  const date = new Date(expiresAt)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function getStatusClass(user: User) {
  if (user.card?.enabled === false) {
    return 'border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
  }
  if (user.card?.expiresAt && user.card.expiresAt < Date.now()) {
    return 'border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
  return 'border border-primary-500/20 bg-primary-500/10 text-primary-600 dark:text-primary-400'
}

function getStatusText(user: User) {
  if (user.card?.enabled === false)
    return '封禁'
  if (user.card?.expiresAt && user.card.expiresAt < Date.now())
    return '过期'
  return '正常'
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="glass-text-main text-2xl font-bold">
        用户管理
      </h1>
      <p class="glass-text-muted mt-1 text-sm">
        管理系统用户，包括用户状态、到期时间等
      </p>
    </div>

    <!-- 用户列表卡片 -->
    <div class="glass-panel overflow-hidden rounded-xl shadow-md">
      <!-- 卡片头部 -->
      <div class="flex items-center justify-between border-b border-white/20 px-6 py-4 dark:border-white/10">
        <div class="flex items-center gap-3">
          <h2 class="glass-text-main text-lg font-semibold">
            用户列表
          </h2>
          <span class="border border-primary-500/20 rounded-full bg-primary-500/10 px-2 py-1 text-xs text-primary-600 dark:text-primary-400">
            共 {{ users.length }} 个用户
          </span>
        </div>
        <div class="flex items-center gap-2">
          <BaseButton
            v-if="selectedUsers.length > 0"
            variant="danger"
            size="sm"
            @click="batchDelete"
          >
            <span class="flex items-center gap-1">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              批量删除 ({{ selectedUsers.length }})
            </span>
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            :loading="loading"
            @click="loadUsers"
          >
            <span class="flex items-center gap-1">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新
            </span>
          </BaseButton>
        </div>
      </div>

      <!-- 表格内容 -->
      <div class="custom-scrollbar overflow-x-auto">
        <table class="min-w-full divide-y divide-white/20 dark:divide-white/10">
          <thead class="border-b border-white/20 bg-black/5 dark:border-white/10 dark:bg-black/20">
            <tr>
              <th class="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  :checked="selectedUsers.length === users.length && users.length > 0"
                  class="h-4 w-4 border-black/10 rounded bg-black/5 text-primary-600 dark:border-white/20 dark:bg-black/40 focus:ring-primary-500"
                  @change="toggleSelectAll"
                >
              </th>
              <th class="glass-text-main px-6 py-3 text-left text-xs font-bold tracking-wider uppercase">
                用户名
              </th>
              <th class="glass-text-main px-6 py-3 text-left text-xs font-bold tracking-wider uppercase">
                角色
              </th>
              <th class="glass-text-main px-6 py-3 text-left text-xs font-bold tracking-wider uppercase">
                卡密类型
              </th>
              <th class="glass-text-main px-6 py-3 text-left text-xs font-bold tracking-wider uppercase">
                到期时间
              </th>
              <th class="glass-text-main px-6 py-3 text-left text-xs font-bold tracking-wider uppercase">
                状态
              </th>
              <th class="glass-text-main px-6 py-3 text-left text-xs font-bold tracking-wider uppercase">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-transparent divide-y divide-white/20 dark:divide-white/10">
            <tr
              v-for="user in users"
              :key="user.username"
              class="transition-colors hover:bg-primary-500/5 dark:hover:bg-white/5" :class="[selectedUsers.includes(user.username) ? 'bg-primary-500/10' : '']"
            >
              <td class="whitespace-nowrap px-6 py-4">
                <input
                  v-model="selectedUsers"
                  type="checkbox"
                  :value="user.username"
                  class="h-4 w-4 border-black/10 rounded bg-black/5 text-primary-600 dark:border-white/20 dark:bg-black/40 focus:ring-primary-500"
                >
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <div class="flex items-center">
                  <div class="h-10 w-10 flex flex-shrink-0 items-center justify-center border border-white/20 rounded-full from-primary-500/80 to-primary-600/80 bg-gradient-to-br shadow-inner">
                    <span class="text-white font-medium drop-shadow-md">{{ user.username[0]?.toUpperCase() }}</span>
                  </div>
                  <div class="ml-4">
                    <div class="glass-text-main text-sm font-bold">
                      {{ user.username }}
                    </div>
                  </div>
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  class="border rounded-full px-2 py-1 text-xs font-medium" :class="[
                    user.role === 'admin'
                      ? 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      : 'border-primary-500/20 bg-primary-500/10 text-primary-600 dark:text-primary-400',
                  ]"
                >
                  {{ user.role === 'admin' ? '管理员' : '普通用户' }}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  class="border rounded-full px-2 py-1 text-xs font-medium" :class="[
                    user.card?.type === 'T'
                      ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-primary-500/20 bg-primary-500/10 text-primary-600 dark:text-primary-400',
                  ]"
                >
                  {{ user.card ? formatCardType(user.card.type) : '-' }}
                </span>
              </td>
              <td class="glass-text-main whitespace-nowrap px-6 py-4 text-sm font-medium">
                {{ user.card ? formatExpiry(user.card.expiresAt) : '永久' }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span class="rounded-full px-2 py-1 text-xs font-medium" :class="[getStatusClass(user)]">
                  {{ getStatusText(user) }}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm font-medium">
                <div class="flex items-center gap-2">
                  <button
                    class="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                    title="编辑"
                    @click="openEditModal(user)"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    v-if="user.card?.type === 'T'"
                    class="text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300"
                    title="一键续费体验卡"
                    @click="handleTrialRenew(user.username)"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    v-if="user.role !== 'admin'"
                    class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                    title="删除"
                    @click="deleteUser(user.username)"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 空状态 -->
      <div v-if="!loading && users.length === 0" class="py-12 text-center">
        <svg class="mx-auto h-12 w-12 text-primary-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <p class="glass-text-muted mt-4 text-sm">
          暂无用户数据
        </p>
      </div>
    </div>

    <!-- 编辑用户弹窗 -->
    <ConfirmModal
      v-model:show="showEditModal"
      title="编辑用户"
      confirm-text="保存"
      cancel-text="取消"
      :show-cancel="true"
      @confirm="saveEdit"
      @cancel="showEditModal = false"
    >
      <div class="space-y-4">
        <div v-if="editingUser" class="space-y-5">
          <div class="glass-text-muted text-sm">
            编辑用户：<span class="glass-text-main text-base font-bold">{{ editingUser.username }}</span>
          </div>

          <div class="flex items-center gap-2">
            <input
              id="permanent"
              v-model="isPermanent"
              type="checkbox"
              class="h-4 w-4 border-white/30 rounded bg-white/50 text-primary-600 dark:bg-black/30 focus:ring-primary-500"
            >
            <label for="permanent" class="glass-text-main text-sm font-medium">
              设置为永久
            </label>
          </div>

          <div v-if="!isPermanent" class="grid grid-cols-2 gap-4">
            <BaseInput
              v-model="newExpiryDate"
              type="date"
              label="到期日期"
              required
            />
            <BaseInput
              v-model="newExpiryTime"
              type="time"
              label="到期时间"
              required
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              id="enabled"
              v-model="newEnabled"
              type="checkbox"
              class="h-4 w-4 border-white/30 rounded bg-white/50 text-primary-600 dark:bg-black/30 focus:ring-primary-500"
            >
            <label for="enabled" class="glass-text-main text-sm font-medium">
              启用账号（未勾选则为封禁）
            </label>
          </div>

          <div v-if="actionError" class="text-sm text-red-500 font-medium dark:text-red-400">
            {{ actionError }}
          </div>
        </div>
      </div>
    </ConfirmModal>
  </div>
</template>
