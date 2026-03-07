<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'

// 权限控制
const isAdmin = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('current_user') || 'null')
    return u?.role === 'admin'
  }
  catch { return false }
})

interface Announcement {
  id?: number
  title: string
  content: string
  version: string
  publish_date: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

const announcements = ref<Announcement[]>([])
const loading = ref(false)
const syncing = ref(false)

// 当前编辑对象
const currentEdit = ref<Announcement | null>(null)

const modalVisible = ref(false)
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

async function loadAnnouncements() {
  if (!isAdmin.value) return
  loading.value = true
  try {
    const res = await api.get('/api/announcement')
    if (res.data.ok && Array.isArray(res.data.data)) {
      announcements.value = res.data.data
    }
  }
  catch { /* 静默 */ }
  finally {
    loading.value = false
  }
}

function openCreateForm() {
  currentEdit.value = {
    title: '',
    content: '',
    version: '',
    publish_date: new Date().toISOString().slice(0, 10),
    enabled: true,
  }
}

function openEditForm(item: Announcement) {
  currentEdit.value = { ...item }
}

function cancelEdit() {
  currentEdit.value = null
}

async function saveAnnouncement() {
  if (!currentEdit.value) return
  loading.value = true
  try {
    const res = await api.put('/api/announcement', currentEdit.value)
    if (res.data.ok) {
      showAlert('保存成功！用户端下次刷新时将看到最新状态。')
      currentEdit.value = null
      await loadAnnouncements()
    }
    else {
      showAlert(`保存失败: ${res.data.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    loading.value = false
  }
}

async function deleteAnnouncement(id: number) {
  if (!window.confirm('确定要彻底删除此公告吗？操作不可恢复。')) return
  loading.value = true
  try {
    const res = await api.delete(`/api/announcement?id=${id}`)
    if (res.data.ok) {
      showAlert('公告已删除')
      await loadAnnouncements()
    }
    else {
      showAlert(`删除失败: ${res.data.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`删除失败: ${e.message}`, 'danger')
  }
  finally {
    loading.value = false
  }
}

async function syncFromLog() {
  if (!window.confirm('是否从系统后端的 Update.log 解析并导入缺失的内容作为公告？')) return
  syncing.value = true
  try {
    const res = await api.post('/api/announcement/sync')
    if (res.data.ok) {
      showAlert(`同步成功！在 Update.log 共发现 ${res.data.totalParsed} 条系统日志，实际新增插入了 ${res.data.added} 条（已去重）。`)
      await loadAnnouncements()
    } else {
      showAlert(`同步失败: ${res.data.error}`, 'danger')
    }
  } catch (e: any) {
    showAlert(`同步操作失败: ${e.message}`, 'danger')
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  loadAnnouncements()
})
</script>

<template>
  <div class="relative min-h-screen p-6 pb-28">
    <div class="mb-6 flex flex-col justify-between gap-4 border-b border-gray-100/50 pb-4 md:flex-row md:items-center dark:border-gray-700/50">
      <div>
        <h1 class="glass-text-main flex items-center gap-2 text-2xl font-bold">
          <span class="text-blue-500 font-normal"><div class="i-carbon-notification" /></span> 
          系统公告管理
        </h1>
        <p class="glass-text-muted mt-1 text-sm">
          管理系统展示的多个历史版本公告，并允许与物理 Update.log 日志联动。
        </p>
      </div>
      <div v-if="isAdmin && !currentEdit" class="flex gap-3">
        <BaseButton variant="outline" :loading="syncing" @click="syncFromLog">
          <div class="i-carbon-repo-source-code mr-1.5" />
          同步 Update.log
        </BaseButton>
        <BaseButton variant="primary" @click="openCreateForm">
          <div class="i-carbon-add mr-1.5" />
          编写新公告
        </BaseButton>
      </div>
    </div>

    <div v-if="!isAdmin" class="flex flex-1 flex-col items-center justify-center py-20 text-gray-400">
      <div class="i-carbon-locked mb-4 text-4xl" />
      <p>仅超级管理员可访问该页面</p>
    </div>

    <!-- 编辑表单区块 -->
    <div v-else-if="currentEdit" class="mx-auto max-w-4xl space-y-6">
      <div class="card glass-panel flex flex-col rounded-lg shadow">
        <div class="border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-edit" />
            {{ currentEdit.id ? '编辑历史公告' : '编写全新发布' }}
          </h3>
        </div>

        <div class="p-6 space-y-5">
          <div class="flex items-center gap-3">
            <span class="glass-text-main text-sm font-medium">通告展示开关</span>
            <BaseSwitch v-model="currentEdit.enabled" hint="开启时将在客户端可见，关闭可作草稿" />
          </div>

          <BaseInput
            v-model="currentEdit.title"
            label="主标题"
            placeholder="例如：农场机器人架构底座升级"
          />

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BaseInput
              v-model="currentEdit.version"
              label="版本徽章标识（可选）"
              placeholder="如：v4.3.0"
            />
            <BaseInput
              v-model="currentEdit.publish_date"
              label="发版日志日期（可选）"
              placeholder="如：2026-03-07"
            />
          </div>

          <div>
            <label class="glass-text-main mb-1.5 block text-sm font-medium">公告内容详情 <span class="glass-text-muted text-xs font-normal">（支持直接排版与换行）</span></label>
            <textarea
              v-model="currentEdit.content"
              class="glass-input w-full rounded-md border border-gray-300/60 bg-white/80 px-4 py-3 text-sm focus:border-blue-500 dark:border-gray-600/60 dark:bg-gray-800/80 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              rows="8"
              placeholder="记录您为程序修复和带来的改进细节..."
            />
          </div>

          <!-- Preview Area -->
          <div v-if="currentEdit.title || currentEdit.content" class="mt-4 rounded-xl border border-blue-200/50 bg-blue-50/30 p-5 shadow-sm dark:border-blue-900/30 dark:bg-blue-900/10">
            <div class="mb-3 flex items-center gap-2">
              <div class="i-carbon-view text-blue-500" />
              <p class="text-xs font-bold tracking-wider text-blue-600 uppercase dark:text-blue-400">前端视距回显</p>
            </div>
            <div class="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
              <p class="text-center text-lg font-bold text-gray-800 dark:text-gray-100">{{ currentEdit.title || '（未输入主标题）' }}</p>
              <div class="flex items-center justify-center mt-3 gap-2 text-xs">
                <span v-if="currentEdit.version" class="bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full">{{ currentEdit.version }}</span>
                <span v-if="currentEdit.publish_date" class="text-gray-400">{{ currentEdit.publish_date }}</span>
              </div>
              <div class="mt-4 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap dark:text-gray-300">{{ currentEdit.content || '（暂无详情文本输入，仅骨架）' }}</div>
            </div>
          </div>
        </div>

        <div class="mt-auto flex flex-wrap justify-end gap-3 border-t border-gray-200/50 bg-black/5 px-6 py-4 dark:border-gray-700/50 dark:bg-white/5">
          <BaseButton
            variant="secondary"
            :loading="loading"
            @click="cancelEdit"
            class="!px-6"
          >
            取消修改返回
          </BaseButton>
          <BaseButton
            variant="primary"
            :loading="loading"
            @click="saveAnnouncement"
            class="!px-8 shadow-md shadow-blue-500/20"
          >
            <div class="i-carbon-send-alt mr-1.5" /> 确认保存发布
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- 列表展示区块 -->
    <div v-else class="mx-auto max-w-4xl">
      <div v-if="loading" class="flex items-center justify-center p-12">
        <div class="i-carbon-circle-dash h-8 w-8 animate-spin text-gray-400" />
      </div>
      <div v-else-if="announcements.length === 0" class="card glass-panel flex flex-col items-center justify-center py-20 text-gray-500">
        <div class="i-carbon-catalog mb-3 text-4xl text-gray-300/50 dark:text-gray-600" />
        <p>目前没有已发布的记录或可查看的历史版本，试着从日志同步一下？</p>
      </div>
      <div v-else class="space-y-3">
        <div 
          v-for="item in announcements" 
          :key="item.id" 
          class="card glass-panel flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 transition-shadow hover:shadow-md"
          :class="item.enabled ? '' : 'opacity-60 grayscale-[30%]'"
        >
          <div class="flex-1 flex flex-col items-start gap-1">
             <div class="flex items-center gap-3">
                <span class="font-bold text-gray-800 dark:text-gray-200 text-lg">{{ item.title || '（无题）' }}</span>
                <span v-if="item.version" class="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{{ item.version }}</span>
                <span v-if="!item.enabled" class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">已禁用 / 草稿</span>
             </div>
             <p class="text-xs text-gray-400 font-mono tracking-wide mt-1">{{ item.publish_date || item.createdAt || '未知追踪时间' }}</p>
             <p class="text-sm text-gray-500 mt-2 line-clamp-2 pr-4 break-words leading-relaxed">{{ item.content }}</p>
          </div>
          <div class="flex gap-2">
            <BaseButton variant="outline" class="!px-3 !py-1 text-sm" @click="openEditForm(item)">
              <div class="i-carbon-edit mr-1" /> 编辑
            </BaseButton>
            <BaseButton variant="outline" class="!px-3 !py-1 text-sm text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20" @click="deleteAnnouncement(item.id!)">
              <div class="i-carbon-trash-can" />
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗回馈 -->
    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @confirm="modalVisible = false"
      @cancel="modalVisible = false"
    />
  </div>
</template>
