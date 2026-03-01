/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

interface Card {
  code: string
  description: string
  type: string
  typeChar: string
  days: number
  enabled: boolean
  usedBy: string | null
  usedAt: number | null
  createdAt: number
}

const cards = ref<Card[]>([])
const loading = ref(false)
const showGenerateModal = ref(false)
const showEditModal = ref(false)
const editingCard = ref<Card | null>(null)
const selectedCards = ref<string[]>([])

// 卡密类型常量
const CARD_TYPE_OPTIONS = [
  { value: 'D', label: '天卡', defaultDays: 1 },
  { value: 'W', label: '周卡', defaultDays: 7 },
  { value: 'M', label: '月卡', defaultDays: 30 },
  { value: 'F', label: '永久卡', defaultDays: null },
]

// 适配 BaseSelect 的 options 格式（带天数描述）
const cardTypeSelectOptions = CARD_TYPE_OPTIONS.map(opt => ({
  value: opt.value,
  label: opt.defaultDays ? `${opt.label} (${opt.defaultDays}天)` : opt.label,
}))

// 生成卡密表单
const newCard = ref({
  description: '',
  type: 'M',
  days: 30,
  count: 1,
})

// 监听类型变化，自动设置默认天数（必须在 newCard 声明之后）
watch(() => newCard.value.type, (newType) => {
  const option = CARD_TYPE_OPTIONS.find(opt => opt.value === newType)
  if (option && option.defaultDays !== null) {
    newCard.value.days = option.defaultDays
  }
})

// 编辑卡密表单
const editCardForm = ref({
  description: '',
  enabled: true,
})

const actionLoading = ref(false)
const actionError = ref('')
const generatedCards = ref<Card[]>([])

onMounted(async () => {
  await loadCards()
})

async function loadCards() {
  loading.value = true
  try {
    const res = await api.get('/api/cards')
    cards.value = res.data.cards || []
  }
  catch (e: any) {
    console.error('加载卡密列表失败:', e)
  }
  finally {
    loading.value = false
  }
}

function toggleSelectAll() {
  if (selectedCards.value.length === cards.value.length) {
    selectedCards.value = []
  }
  else {
    selectedCards.value = cards.value.map(c => c.code)
  }
}

function openGenerateModal() {
  newCard.value = {
    description: '',
    type: 'M',
    days: 30,
    count: 1,
  }
  generatedCards.value = []
  showGenerateModal.value = true
  actionError.value = ''
}

function openEditModal(card: Card) {
  editingCard.value = card
  editCardForm.value = {
    description: card.description,
    enabled: card.enabled,
  }
  showEditModal.value = true
  actionError.value = ''
}

async function generateCards() {
  actionLoading.value = true
  actionError.value = ''

  try {
    const res = await api.post('/api/cards', {
      description: newCard.value.description,
      type: newCard.value.type,
      days: newCard.value.days,
      count: newCard.value.count,
    })

    if (res.data.ok) {
      generatedCards.value = res.data.cards
      await loadCards()
    }
  }
  catch (e: any) {
    actionError.value = e.response?.data?.error || e.message || '生成失败'
  }
  finally {
    actionLoading.value = false
  }
}

async function saveEdit() {
  if (!editingCard.value)
    return

  actionLoading.value = true
  actionError.value = ''

  try {
    await api.put(`/api/cards/${editingCard.value.code}`, {
      description: editCardForm.value.description,
      enabled: editCardForm.value.enabled,
    })

    showEditModal.value = false
    await loadCards()
  }
  catch (e: any) {
    actionError.value = e.response?.data?.error || e.message || '保存失败'
  }
  finally {
    actionLoading.value = false
  }
}

async function deleteCard(code: string) {
  if (!window.window.confirm('确定要删除这个卡密吗？'))
    return

  try {
    await api.delete(`/api/cards/${code}`)
    await loadCards()
  }
  catch (e: any) {
    console.error('删除卡密失败:', e)
  }
}

async function batchDelete() {
  if (selectedCards.value.length === 0)
    return

  if (!window.window.confirm(`确定要删除选中的 ${selectedCards.value.length} 个卡密吗？`))
    return

  try {
    await api.post('/api/cards/batch-delete', {
      codes: selectedCards.value,
    })
    selectedCards.value = []
    await loadCards()
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

function formatDateTime(timestamp: number | null) {
  if (!timestamp)
    return '-'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function copyToText(code: string) {
  navigator.clipboard.writeText(code)
}

function copyAllGenerated() {
  const text = generatedCards.value.map(c => c.code).join('\n')
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="glass-text-main text-2xl font-bold">
        卡密管理
      </h1>
      <p class="glass-text-muted mt-1 text-sm">
        生成、管理和分发卡密
      </p>
    </div>

    <!-- 卡密列表卡片 -->
    <div class="glass-panel overflow-hidden rounded-xl shadow-md">
      <!-- 卡片头部 -->
      <div class="flex items-center justify-between border-b border-white/20 px-6 py-4 dark:border-white/10">
        <div class="flex items-center gap-3">
          <h2 class="glass-text-main text-lg font-semibold">
            卡密列表
          </h2>
          <span class="rounded-full bg-blue-100/50 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            共 {{ cards.length }} 个卡密
          </span>
        </div>
        <div class="flex items-center gap-2">
          <BaseButton
            v-if="selectedCards.length > 0"
            variant="danger"
            size="sm"
            @click="batchDelete"
          >
            <span class="flex items-center gap-1">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              批量删除 ({{ selectedCards.length }})
            </span>
          </BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            @click="openGenerateModal"
          >
            <span class="flex items-center gap-1">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              生成卡密
            </span>
          </BaseButton>
        </div>
      </div>

      <!-- 表格内容 -->
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-white/20 dark:divide-white/10">
          <thead class="border-b border-white/20 bg-transparent dark:border-white/10">
            <tr>
              <th class="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  :checked="selectedCards.length === cards.length && cards.length > 0"
                  class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                  @change="toggleSelectAll"
                >
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                卡密
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                描述
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                类型
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                天数
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                状态
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                使用情况
              </th>
              <th class="glass-text-muted px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-transparent divide-y divide-white/20 dark:divide-white/10">
            <tr
              v-for="card in cards"
              :key="card.code"
              class="hover:bg-black/5 dark:hover:bg-white/5" :class="[selectedCards.includes(card.code) ? 'bg-blue-50 dark:bg-blue-900/20' : '']"
            >
              <td class="whitespace-nowrap px-6 py-4">
                <input
                  v-model="selectedCards"
                  type="checkbox"
                  :value="card.code"
                  class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
                >
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <div class="flex items-center gap-2">
                  <code class="glass-text-main rounded bg-gray-100 px-2 py-1 text-xs font-mono dark:bg-gray-700">
                    {{ card.code }}
                  </code>
                  <button
                    class="hover:glass-text-muted text-gray-400 dark:hover:text-gray-300"
                    title="复制"
                    @click="copyToText(card.code)"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </td>
              <td class="glass-text-main whitespace-nowrap px-6 py-4 text-sm">
                {{ card.description }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  class="rounded-full px-2 py-1 text-xs" :class="[
                    card.type === 'F'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                      : card.type === 'T'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
                  ]"
                >
                  {{ formatCardType(card.type) }}
                </span>
              </td>
              <td class="glass-text-main whitespace-nowrap px-6 py-4 text-sm">
                {{ card.type === 'F' ? '永久' : `${card.days}天` }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  class="rounded-full px-2 py-1 text-xs" :class="[
                    card.enabled
                      ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
                  ]"
                >
                  {{ card.enabled ? '启用' : '禁用' }}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm">
                <div v-if="card.usedBy" class="glass-text-main">
                  <div>已使用</div>
                  <div class="glass-text-muted text-xs">
                    {{ card.usedBy }}
                  </div>
                  <div class="glass-text-muted text-xs">
                    {{ formatDateTime(card.usedAt) }}
                  </div>
                </div>
                <div v-else class="text-xs text-gray-400">
                  未使用
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm font-medium">
                <div class="flex items-center gap-2">
                  <button
                    class="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                    title="编辑"
                    @click="openEditModal(card)"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                    title="删除"
                    @click="deleteCard(card.code)"
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
      <div v-if="!loading && cards.length === 0" class="py-12 text-center">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        <p class="glass-text-muted mt-2 text-sm">
          暂无卡密数据
        </p>
      </div>
    </div>

    <!-- 生成卡密弹窗 -->
    <ConfirmModal
      v-model:show="showGenerateModal"
      title="生成卡密"
      confirm-text="生成"
      cancel-text="取消"
      :show-cancel="true"
      @confirm="generateCards"
      @cancel="showGenerateModal = false"
    >
      <div class="space-y-4">
        <BaseInput
          v-model="newCard.description"
          label="描述"
          placeholder="例如：月卡、周卡等"
          required
        />

        <BaseSelect
          v-model="newCard.type"
          label="类型"
          :options="cardTypeSelectOptions"
        />

        <BaseInput
          v-if="newCard.type !== 'F'"
          v-model="newCard.days"
          type="number"
          label="天数"
          :min="1"
          required
        />
        <p v-if="newCard.type !== 'F'" class="glass-text-muted text-xs -mt-3">
          默认：{{ newCard.type === 'D' ? '1 天' : newCard.type === 'W' ? '7 天' : '30 天' }}，可自定义
        </p>

        <BaseInput
          v-model="newCard.count"
          type="number"
          label="生成数量"
          :min="1"
          :max="100"
          required
        />

        <!-- 生成的卡密列表 -->
        <div v-if="generatedCards.length > 0" class="mt-4 rounded-lg bg-primary-50 p-4 dark:bg-primary-900/20">
          <div class="mb-2 flex items-center justify-between">
            <h4 class="text-sm text-primary-800 font-semibold dark:text-primary-400">
              生成成功！共 {{ generatedCards.length }} 个卡密
            </h4>
            <button
              class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              @click="copyAllGenerated"
            >
              复制全部
            </button>
          </div>
          <div class="max-h-40 overflow-y-auto space-y-1">
            <div
              v-for="card in generatedCards"
              :key="card.code"
              class="flex items-center justify-between text-xs"
            >
              <code class="glass-text-main font-mono">{{ card.code }}</code>
              <button
                class="hover:glass-text-muted text-gray-400"
                @click="copyToText(card.code)"
              >
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div v-if="actionError" class="text-sm text-red-600 dark:text-red-400">
          {{ actionError }}
        </div>
      </div>
    </ConfirmModal>

    <!-- 编辑卡密弹窗 -->
    <ConfirmModal
      v-model:show="showEditModal"
      title="编辑卡密"
      confirm-text="保存"
      cancel-text="取消"
      :show-cancel="true"
      @confirm="saveEdit"
      @cancel="showEditModal = false"
    >
      <div class="space-y-4">
        <div v-if="editingCard" class="space-y-4">
          <div class="text-sm">
            <span class="glass-text-muted">卡密：</span>
            <code class="glass-text-main ml-2 rounded bg-gray-100 px-2 py-1 font-mono dark:bg-gray-700">
              {{ editingCard.code }}
            </code>
          </div>

          <BaseInput
            v-model="editCardForm.description"
            label="描述"
            placeholder="卡密描述"
            required
          />

          <div class="flex items-center gap-2">
            <input
              id="card-enabled"
              v-model="editCardForm.enabled"
              type="checkbox"
              class="h-4 w-4 border-gray-300 rounded text-blue-600 focus:ring-blue-500"
            >
            <label for="card-enabled" class="glass-text-main text-sm dark:text-gray-300">
              启用卡密
            </label>
          </div>

          <div v-if="actionError" class="text-sm text-red-600 dark:text-red-400">
            {{ actionError }}
          </div>
        </div>
      </div>
    </ConfirmModal>
  </div>
</template>
