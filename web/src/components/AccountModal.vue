<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'

const props = defineProps<{
  show: boolean
  editData?: any
}>()

const emit = defineEmits(['close', 'saved'])

const activeTab = ref('qr') // qr, manual
const loading = ref(false)
const qrData = ref<{ image?: string, code: string, qrcode?: string, url?: string } | null>(null)
const qrStatus = ref('')
const errorMessage = ref('')

const form = reactive({
  name: '',
  code: '',
  platform: 'qq',
})

const qrPlatform = ref('qq') // qr tab platform

// ========== 串行轮询（彻底杜绝竞态条件） ==========
// 用 setTimeout 而非 setInterval，确保前一个请求完成后才发下一个
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollStopped = true

function stopQRCheck() {
  pollStopped = true
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function startQRCheck() {
  pollStopped = false
  scheduleNextPoll()
}

function scheduleNextPoll() {
  if (pollStopped) return
  pollTimer = setTimeout(() => doQRCheck(), 1500)
}

async function doQRCheck() {
  // 如果已停止或没有数据，不发请求
  if (pollStopped || !qrData.value) return

  try {
    const res = await api.post('/api/qr/check', { code: qrData.value.code, platform: qrPlatform.value })
    // 再次检查：如果在等待期间已被停止，直接退出
    if (pollStopped) return

    if (res.data.ok) {
      const status = res.data.data.status
      if (status === 'OK') {
        // 登录成功 —— 立即停止轮询，不再发任何请求
        stopQRCheck()
        qrStatus.value = '登录成功'
        const { uin, code: authCode, nickname } = res.data.data

        let accName = form.name.trim()
        if (!accName) {
          accName = nickname || (uin ? String(uin) : '扫码账号')
        }

        await addAccount({
          id: props.editData?.id,
          uin,
          code: authCode,
          loginType: 'qr',
          name: props.editData ? (props.editData.name || accName) : accName,
          platform: qrPlatform.value,
        })
        return // 不再调度下一次
      }
      else if (status === 'Used') {
        qrStatus.value = '二维码已失效'
        stopQRCheck()
        return
      }
      else if (status === 'Wait') {
        qrStatus.value = '等待扫码'
      }
      else {
        qrStatus.value = `错误: ${res.data.data.error}`
      }
    }
  }
  catch (e) {
    console.error(e)
  }

  // 只有在未停止的情况下，才调度下一次轮询
  if (!pollStopped) {
    scheduleNextPoll()
  }
}

// QR Code Logic
async function loadQRCode() {
  if (activeTab.value !== 'qr')
    return
  stopQRCheck() // 先停掉旧的轮询
  loading.value = true
  qrData.value = null
  qrStatus.value = '正在获取二维码'
  errorMessage.value = ''
  try {
    const res = await api.post('/api/qr/create', { platform: qrPlatform.value })
    if (res.data.ok) {
      qrData.value = res.data.data
      qrStatus.value = qrPlatform.value === 'wx' ? '请使用微信扫码' : '请使用手机QQ扫码'
      startQRCheck()
    }
    else {
      qrStatus.value = `获取失败: ${res.data.error}`
    }
  }
  catch (e) {
    qrStatus.value = '获取失败'
    console.error(e)
  }
  finally {
    loading.value = false
  }
}

const isMobile = computed(() => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))

function openQRCodeLoginUrl() {
  if (!qrData.value?.url)
    return

  const url = qrData.value.url
  if (!isMobile.value) {
    window.open(url, '_blank')
    return
  }

  // Mobile Deep Link logic with robust visibilitychange fallback
  try {
    const b64 = btoa(decodeURIComponent(encodeURIComponent(url)))
    const qqDeepLink = `mqqapi://forward/url?url_prefix=${encodeURIComponent(b64)}&version=1&src_type=web`

    let appSwitched = false
    const onVisibilityChange = () => {
      if (document.hidden) {
        appSwitched = true
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    // 增加冗余判定，1.5 秒后如果页面依然处于激活状态，则判定拉起失败
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (!appSwitched) {
        console.warn('QQ App 未能成功唤起，正重定向至普通网页登录...')
        window.location.href = url
      }
    }, 1500)

    window.location.href = qqDeepLink
  }
  catch (e) {
    console.error('构造二维码登录链接失败，直接降级:', e)
    window.location.href = url
  }
}

async function addAccount(data: any) {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await api.post('/api/accounts', data)
    if (res.data.ok) {
      emit('saved')
      close()
    }
    else {
      errorMessage.value = `保存失败: ${res.data.error}`
    }
  }
  catch (e: any) {
    errorMessage.value = `保存失败: ${e.response?.data?.error || e.message}`
  }
  finally {
    loading.value = false
  }
}

async function submitManual() {
  errorMessage.value = ''
  if (!form.code) {
    errorMessage.value = '请输入Code 或 进行扫码'
    return
  }

  if (!form.name && props.editData) {
    errorMessage.value = '请输入名称'
    return
  }

  let code = form.code.trim()
  // Try to extract code from URL if present
  const match = code.match(/[?&]code=([^&]+)/i)
  if (match && match[1]) {
    code = decodeURIComponent(match[1])
    form.code = code // Update UI
  }

  const payload = {
    id: props.editData?.id, // If editing
    name: form.name,
    code,
    platform: form.platform,
    loginType: 'manual',
  }

  await addAccount(payload)
}

function close() {
  stopQRCheck()
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    errorMessage.value = ''
    if (props.editData) {
      // Edit mode: Default to QR refresh, load code
      activeTab.value = 'qr'
      form.name = props.editData.name
      form.code = props.editData.code || ''
      form.platform = props.editData.platform || 'qq'
      qrPlatform.value = props.editData.platform || 'qq'
      loadQRCode()
    }
    else {
      // Add mode: Default to QR
      activeTab.value = 'qr'
      form.name = ''
      form.code = ''
      form.platform = 'qq'
      qrPlatform.value = 'qq'
      loadQRCode()
    }
  }
  else {
    // Reset when closed
    stopQRCheck()
    qrData.value = null
    qrStatus.value = ''
  }
})
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click="close">
    <div class="glass-panel max-w-md w-full overflow-hidden border border-white/20 rounded-lg shadow-xl dark:border-white/10" @click.stop>
      <div class="flex items-center justify-between border-b border-gray-200/50 p-4 dark:border-white/10">
        <h3 class="glass-text-main text-lg font-semibold">
          {{ editData ? '编辑账号' : '添加账号' }}
        </h3>
        <BaseButton variant="ghost" class="!p-1" @click="close">
          <div class="i-carbon-close text-xl" />
        </BaseButton>
      </div>

      <div class="p-4">
        <div v-if="errorMessage" class="mb-4 rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {{ errorMessage }}
        </div>
        <!-- Tabs -->
        <div class="mb-4 flex border-b border-gray-200/50 dark:border-white/10">
          <button
            class="flex-1 py-2 text-center font-medium transition-colors"
            :class="activeTab === 'qr' ? 'text-blue-600 border-b-2 border-blue-600' : 'glass-text-muted hover:text-gray-700 dark:hover:text-gray-300'"
            @click="activeTab = 'qr'; loadQRCode()"
          >
            {{ editData ? '扫码更新' : '扫码登录' }}
          </button>
          <button
            class="flex-1 py-2 text-center font-medium transition-colors"
            :class="activeTab === 'manual' ? 'text-blue-600 border-b-2 border-blue-600' : 'glass-text-muted hover:text-gray-700 dark:hover:text-gray-300'"
            @click="activeTab = 'manual'; stopQRCheck()"
          >
            手动填码
          </button>
        </div>

        <!-- QR Tab -->
        <div v-if="activeTab === 'qr'" class="flex flex-col items-center justify-center py-4 space-y-4">
          <div class="w-full flex justify-center pb-2">
            <div class="flex p-1 bg-gray-100/50 dark:bg-white/5 rounded-lg backdrop-blur-sm self-center">
              <button
                class="px-5 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                :class="qrPlatform === 'qq' ? 'bg-white dark:bg-white/10 shadow-sm text-[#0099FF]' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                @click="qrPlatform = 'qq'; loadQRCode()"
              >
                QQ小程序
              </button>
              <button
                class="px-5 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                :class="qrPlatform === 'wx' ? 'bg-white dark:bg-white/10 shadow-sm text-[#07C160]' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
                @click="qrPlatform = 'wx'; loadQRCode()"
              >
                微信小程序
              </button>
            </div>
          </div>
          <div class="w-full text-center">
            <p class="glass-text-muted text-sm">
              扫码默认使用登录平台昵称
            </p>
          </div>

          <div v-if="qrData && (qrData.image || qrData.qrcode)" class="border border-gray-200 dark:border-white/20 rounded-lg bg-white p-2 flex items-center justify-center">
            <img :src="qrData.image || qrData.qrcode" class="h-48 w-48 object-contain">
          </div>
          <div v-else class="h-48 w-48 flex items-center justify-center rounded bg-gray-100/50 text-gray-500 backdrop-blur-sm dark:bg-black/20 dark:text-gray-400">
            <div v-if="loading" i-svg-spinners-90-ring-with-bg class="text-3xl" />
            <span v-else>二维码已过期</span>
          </div>
          <p class="glass-text-main text-sm">
            {{ qrStatus }}
          </p>
          <div class="mt-2 max-w-[200px] w-full flex flex-col gap-3">
            <button
              class="w-full rounded-lg bg-primary-500 py-2.5 text-sm text-white font-medium shadow-primary-500/30 shadow-sm transition-all active:scale-95 hover:bg-primary-600"
              @click="loadQRCode"
            >
              更新二维码
            </button>
            <button
              v-if="qrData?.url && qrPlatform === 'qq'"
              class="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0099FF] py-2.5 text-sm text-white font-medium shadow-[#0099FF]/30 shadow-sm transition-all md:hidden active:scale-95 hover:bg-[#0088EE]"
              @click="openQRCodeLoginUrl"
            >
              跳转QQ登录
            </button>
          </div>
        </div>

        <!-- Manual Tab -->
        <div v-if="activeTab === 'manual'" class="space-y-4">
          <BaseInput
            v-model="form.name"
            label="备注名称"
            placeholder="留空默认账号X"
          />

          <BaseTextarea
            v-model="form.code"
            label="Code"
            placeholder="请输入登录 Code"
            :rows="3"
          />

          <BaseSelect
            v-model="form.platform"
            label="平台"
            :options="[
              { label: 'QQ小程序', value: 'qq' },
              { label: '微信小程序', value: 'wx' },
            ]"
          />

          <div class="flex justify-end gap-2 pt-4">
            <BaseButton
              variant="outline"
              @click="close"
            >
              取消
            </BaseButton>
            <BaseButton
              variant="primary"
              :loading="loading"
              @click="submitManual"
            >
              {{ editData ? '保存' : '添加' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
