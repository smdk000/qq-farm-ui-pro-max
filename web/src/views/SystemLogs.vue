<script setup lang="ts">
import axios from 'axios'
import { onMounted, reactive, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { adminToken } from '@/utils/auth'

const loading = ref(false)
const dataSource = ref<any[]>([])
const total = ref(0)
const detailModalData = ref<any>(null)
const isDetailModalOpen = ref(false)

const pagination = reactive({
  current: 1,
  pageSize: 20,
})

const queryParams = reactive({
  level: '',
  accountId: '',
  keyword: '',
})

function formatDate(dateStr: string) {
  if (!dateStr)
    return '-'
  const d = new Date(dateStr)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function fetchData(page = pagination.current, limit = pagination.pageSize) {
  loading.value = true
  try {
    const res = await axios.get('/api/system-logs', {
      headers: { 'x-admin-token': adminToken.value },
      params: {
        page,
        limit,
        level: queryParams.level || undefined,
        accountId: queryParams.accountId || undefined,
        keyword: queryParams.keyword || undefined,
      },
    })

    if (res.data && res.data.ok) {
      dataSource.value = res.data.data.items
      total.value = res.data.data.total
      pagination.current = page
      pagination.pageSize = limit
    }
  }
  catch (err: any) {
    console.error('获取日志失败:', err.message)
  }
  finally {
    loading.value = false
  }
}

function prevPage() {
  if (pagination.current > 1) {
    fetchData(pagination.current - 1)
  }
}

function nextPage() {
  if (pagination.current * pagination.pageSize < total.value) {
    fetchData(pagination.current + 1)
  }
}

function onSearch() {
  pagination.current = 1
  fetchData()
}

function onReset() {
  queryParams.level = ''
  queryParams.accountId = ''
  queryParams.keyword = ''
  onSearch()
}

function showDetail(record: any) {
  let metaJson = '{}'
  try {
    if (record.meta_data) {
      metaJson = typeof record.meta_data === 'string' ? record.meta_data : JSON.stringify(record.meta_data, null, 2)
    }
  }
  catch {
    // quiet catch
  }

  detailModalData.value = {
    text: record.text,
    meta: metaJson,
  }
  isDetailModalOpen.value = true
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="fade-in mx-auto max-w-6xl w-full p-4">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-bold">
          <div class="i-carbon-catalog text-primary-400" />
          系统安全日志审计 (冷热归档)
        </h1>
        <p class="glass-text-muted mt-1 text-sm">
          此面板用于检索由后端抛出的 MySQL 固化日志，方便排查农场底层状态及账号降级历史。
        </p>
      </div>
      <BaseButton variant="primary" ghost @click="fetchData(pagination.current, pagination.pageSize)">
        <div class="i-carbon-renew mr-2" />
        刷新数据
      </BaseButton>
    </div>

    <div class="glass-panel mb-6 flex flex-wrap items-end gap-4 rounded-lg p-4 shadow-sm">
      <div class="w-32 flex flex-col gap-1">
        <label class="glass-text-muted text-xs">日志级别</label>
        <select v-model="queryParams.level" class="form-input">
          <option value="">
            全部
          </option>
          <option value="info">
            Info
          </option>
          <option value="warn">
            Warn
          </option>
          <option value="error">
            Error
          </option>
        </select>
      </div>
      <div class="w-48 flex flex-col gap-1">
        <label class="glass-text-muted text-xs">账号 ID</label>
        <input v-model="queryParams.accountId" placeholder="精准匹配" class="form-input" @keyup.enter="onSearch">
      </div>
      <div class="min-w-48 flex flex-1 flex-col gap-1">
        <label class="glass-text-muted text-xs">关键词检索</label>
        <input v-model="queryParams.keyword" placeholder="日志内容模糊搜索" class="form-input" @keyup.enter="onSearch">
      </div>
      <div class="flex gap-2">
        <BaseButton variant="primary" @click="onSearch">
          <div class="i-carbon-search mr-1" />查询
        </BaseButton>
        <BaseButton variant="secondary" @click="onReset">
          重置
        </BaseButton>
      </div>
    </div>

    <div class="glass-panel overflow-hidden rounded-lg shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-gray-200/50 bg-black/5 dark:border-gray-700/50 dark:bg-white/5">
              <th class="p-3 font-medium">
                时间
              </th>
              <th class="p-3 font-medium">
                级别
              </th>
              <th class="p-3 font-medium">
                分类
              </th>
              <th class="p-3 font-medium">
                账号 ID
              </th>
              <th class="min-w-64 p-3 font-medium">
                日志内容
              </th>
              <th class="p-3 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && dataSource.length === 0">
              <td colspan="6" class="glass-text-muted p-8 text-center">
                <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl text-primary-500" />
                正在加载日志...
              </td>
            </tr>
            <tr v-else-if="dataSource.length === 0">
              <td colspan="6" class="glass-text-muted p-8 text-center">
                暂无匹配的系统日志历史
              </td>
            </tr>
            <tr
              v-for="record in dataSource"
              :key="record.id"
              class="border-b border-gray-100/50 transition-colors last:border-0 dark:border-white/10 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            >
              <td class="whitespace-nowrap p-3">
                {{ formatDate(record.created_at) }}
              </td>
              <td class="p-3">
                <span :class="{ 'text-red-500': record.level === 'error', 'text-yellow-500': record.level === 'warn', 'text-blue-500': record.level === 'info' }" class="rounded bg-black/10 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">
                  {{ record.level ? record.level.toUpperCase() : 'UNKNOWN' }}
                </span>
              </td>
              <td class="whitespace-nowrap p-3">
                {{ record.category || '-' }}
              </td>
              <td class="whitespace-nowrap p-3 text-xs font-mono">
                {{ record.account_id || '-' }}
              </td>
              <td class="max-w-xs truncate p-3" :title="record.text">
                {{ record.text }}
              </td>
              <td class="whitespace-nowrap p-3 text-right">
                <button class="text-xs text-primary-500 font-medium underline hover:text-primary-400" @click="showDetail(record)">
                  详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页栏 -->
      <div v-if="total > 0" class="flex items-center justify-between border-t border-gray-200/50 p-3 dark:border-gray-700/50">
        <div class="glass-text-muted text-xs">
          共 {{ total }} 条记录
        </div>
        <div class="flex items-center gap-2">
          <BaseButton variant="secondary" size="sm" :disabled="pagination.current === 1" @click="prevPage">
            上一页
          </BaseButton>
          <span class="px-2 text-sm font-medium">{{ pagination.current }}</span>
          <BaseButton variant="secondary" size="sm" :disabled="pagination.current * pagination.pageSize >= total" @click="nextPage">
            下一页
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- 弹窗 -->
    <div v-if="isDetailModalOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="isDetailModalOpen = false">
      <div class="glass-panel max-w-2xl w-full rounded-xl p-6 shadow-2xl">
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-lg font-bold">
            系统日志分析明细
          </h3>
          <button class="i-carbon-close glass-text-muted text-xl hover:text-white" @click="isDetailModalOpen = false" />
        </div>
        <div class="space-y-4">
          <div>
            <h4 class="glass-text-muted mb-1 text-sm font-semibold">
              执行记录
            </h4>
            <div class="rounded-lg bg-black/20 p-3 text-sm font-mono dark:bg-black/50">
              {{ detailModalData?.text }}
            </div>
          </div>
          <div>
            <h4 class="glass-text-muted mb-1 text-sm font-semibold">
              元数据包 (JSON)
            </h4>
            <pre class="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs font-mono dark:bg-black/50">{{ detailModalData?.meta }}</pre>
          </div>
        </div>
        <div class="mt-6 flex justify-end">
          <BaseButton variant="secondary" @click="isDetailModalOpen = false">
            关闭
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-input {
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid rgba(156, 163, 175, 0.3);
  background-color: rgba(0, 0, 0, 0.05);
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  color: inherit;
  outline: none;
  transition: all 0.2s;
}
.dark .form-input {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}
.form-input:focus {
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}
</style>
