<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { localizeRuntimeText } from '@/utils/runtime-text'

const props = defineProps<{
  show: boolean
  editData?: any
}>()

const emit = defineEmits(['close', 'saved'])

const activeTab = ref('qr') // qr, manual
const loading = ref(false)
const qrData = ref<{
  image?: string
  code: string
  qrcode?: string
  url?: string
  expiresAt?: number
  retryable?: boolean
  message?: string
  nickname?: string
  avatar?: string
  uin?: string
  openId?: string
} | null>(null)
const qrStatus = ref('')
const errorMessage = ref('')
const qrCheckFailureCount = ref(0)
const qrNow = ref(Date.now())
let qrCountdownTimer: ReturnType<typeof setInterval> | null = null

const form = reactive({
  name: '',
  code: '',
  uin: '',
  platform: 'wx_car',
})

const qrPlatform = ref('wx_car') // qr tab platform（默认车机微信）
const qrUin = ref('') // 新增: 为第三方 QQ 扫码提供前置 QQ 号输入

function normalizeQrPlatform(platform?: string) {
  return platform === 'qq' || platform === 'wx_ipad' || platform === 'wx_car'
    ? platform
    : 'wx_car'
}

function getTabClass(tab: 'qr' | 'manual') {
  return activeTab.value === tab
    ? 'account-modal-tab account-modal-tab--active'
    : 'account-modal-tab account-modal-tab--idle'
}

function getQrPlatformButtonClass(platform: 'qq' | 'wx_ipad' | 'wx_car') {
  const active = qrPlatform.value === platform
  if (!active)
    return 'account-modal-platform account-modal-platform--idle'
  return platform === 'qq'
    ? 'account-modal-platform account-modal-platform--active account-modal-platform--qq'
    : 'account-modal-platform account-modal-platform--active account-modal-platform--wechat'
}

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

function stopQrCountdown() {
  if (qrCountdownTimer) {
    clearInterval(qrCountdownTimer)
    qrCountdownTimer = null
  }
}

function startQrCountdown() {
  stopQrCountdown()
  qrNow.value = Date.now()
  qrCountdownTimer = setInterval(() => {
    qrNow.value = Date.now()
  }, 1000)
}

function startQRCheck() {
  pollStopped = false
  qrCheckFailureCount.value = 0
  scheduleNextPoll()
}

function scheduleNextPoll() {
  if (pollStopped || !props.show || activeTab.value !== 'qr')
    return
  pollTimer = setTimeout(() => doQRCheck(), 1500)
}

function activateManualTab() {
  activeTab.value = 'manual'
  stopQRCheck()
  if (!props.editData && !form.code.trim() && !form.uin.trim())
    form.platform = 'qq'
}

function mergeQrData(current: typeof qrData.value, nextPayload: Record<string, any>) {
  const next = nextPayload && typeof nextPayload === 'object' ? nextPayload : {}
  if (!current)
    return next as typeof qrData.value

  const preservedCode = String(next.code || current.code || '').trim()
  const nextExpiresAt = Number(next.expiresAt || 0)
  const currentExpiresAt = Number(current.expiresAt || 0)

  return {
    ...current,
    ...next,
    code: preservedCode,
    expiresAt: nextExpiresAt > 0 ? nextExpiresAt : currentExpiresAt,
  }
}

async function doQRCheck() {
  // 如果已停止或没有数据，不发请求
  if (pollStopped || !props.show || activeTab.value !== 'qr' || !qrData.value)
    return

  try {
    const res = await api.post('/api/qr/check', { code: qrData.value.code, platform: qrPlatform.value, uin: qrUin.value })
    // 再次检查：如果在等待期间已被停止，直接退出
    if (pollStopped)
      return

    if (res.data.ok) {
      qrCheckFailureCount.value = 0
      const qrPayload = res.data.data || {}
      qrData.value = mergeQrData(qrData.value, qrPayload)
      const status = qrPayload.status
      if (status === 'OK') {
        // 登录成功 —— 立即停止轮询，不再发任何请求
        stopQRCheck()
        qrStatus.value = qrPayload.message || '登录成功'
        const { uin, openId, code: authCode, ticket, nickname, avatar } = qrPayload
        const resolvedUin = String(uin || qrUin.value.trim() || props.editData?.uin || props.editData?.qq || '').trim()

        if (qrPlatform.value === 'qq' && !resolvedUin) {
          errorMessage.value = '本次 QQ 扫码未返回 QQ 号，系统已阻止创建无账号标识的记录。请重新打开扫码登录，并先填写 QQ 号后再扫码，避免策略、缓存和统计无法跟随账号。'
          qrStatus.value = '未识别到 QQ 号'
          return
        }

        let accName = form.name.trim()
        if (!accName) {
          accName = nickname || (resolvedUin || '扫码账号')
        }

        await addAccount({
          id: props.editData?.id,
          uin: resolvedUin,
          qq: qrPlatform.value === 'qq' ? resolvedUin : '',
          openId: String(openId || '').trim(),
          code: authCode,
          loginType: 'qr',
          name: props.editData ? (props.editData.name || accName) : accName,
          platform: qrPlatform.value,
          authTicket: ticket || '',
          nick: nickname || '',
          avatar: avatar || '',
          lastCodeSource: 'qr_login',
        })
        return // 不再调度下一次
      }
      else if (status === 'Used') {
        qrStatus.value = qrPayload.message || '二维码已失效'
        stopQRCheck()
        return
      }
      else if (status === 'Wait') {
        qrStatus.value = qrPayload.message || '等待扫码'
      }
      else if (status === 'Check') {
        qrStatus.value = qrPayload.message || `已扫码: ${qrPayload.nickname || ''}，请在手机确认`
      }
      else {
        qrStatus.value = qrPayload.message || `错误: ${qrPayload.error || '未知错误'}`
        stopQRCheck()
        return
      }
    }
    else {
      qrStatus.value = `检查失败: ${localizeRuntimeText(res.data.error || '未知错误')}`
      stopQRCheck()
      return
    }
  }
  catch (e: any) {
    qrCheckFailureCount.value += 1
    qrStatus.value = `检查失败: ${localizeRuntimeText(e.response?.data?.error || e.message || '未知错误')}`
    if (qrCheckFailureCount.value >= 2 || Number(e.response?.status) >= 400) {
      stopQRCheck()
      return
    }
  }

  // 只有在未停止的情况下，才调度下一次轮询
  if (!pollStopped) {
    scheduleNextPoll()
  }
}

// QR Code Logic
async function loadQRCode() {
  if (!props.show || activeTab.value !== 'qr')
    return

  stopQRCheck() // 先停掉旧的轮询
  loading.value = true
  qrData.value = null
  qrStatus.value = '正在获取二维码'
  errorMessage.value = ''
  qrCheckFailureCount.value = 0
  try {
    const res = await api.post('/api/qr/create', { platform: qrPlatform.value, uin: qrUin.value.trim() })
    if (res.data.ok) {
      qrData.value = res.data.data
      startQrCountdown()
      const statusHintMap: Record<string, string> = { qq: '请使用手机QQ扫码', wx: '请使用微信扫码', wx_ipad: '请使用微信扫码（iPad协议）', wx_car: '请使用微信扫码（车机协议）' }
      qrStatus.value = res.data.data?.message || statusHintMap[qrPlatform.value] || '请扫码'
      startQRCheck()
    }
    else {
      qrStatus.value = `获取失败: ${localizeRuntimeText(res.data.error || '未知错误')}`
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
      errorMessage.value = `保存失败: ${localizeRuntimeText(res.data.error || '未知错误')}`
    }
  }
  catch (e: any) {
    errorMessage.value = `保存失败: ${localizeRuntimeText(e.response?.data?.error || e.message || '未知错误')}`
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

  const qqTempCodeMatch = code.match(/qqq\/code\/([a-f0-9]{32})/i)
  if (form.platform === 'qq' && qqTempCodeMatch) {
    errorMessage.value = '这是 QQ 扫码临时登录链接，请直接使用“扫码登录”完成授权，不要手动粘贴该链接'
    return
  }

  const normalizedUin = String(form.uin || '').trim()

  if (form.platform !== 'qq' && !normalizedUin) {
    errorMessage.value = '请输入微信ID / OpenID，避免继续沿用旧账号标识'
    return
  }

  const payload = {
    id: props.editData?.id, // If editing
    name: form.name,
    code,
    uin: normalizedUin,
    qq: form.platform === 'qq' ? normalizedUin : '',
    openId: form.platform === 'qq' ? '' : normalizedUin,
    platform: form.platform,
    loginType: 'manual',
    authTicket: '',
    lastCodeSource: 'manual_capture',
  }

  await addAccount(payload)
}

function close() {
  stopQRCheck()
  stopQrCountdown()
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    errorMessage.value = ''
    if (props.editData) {
      // Edit mode defaults to manual so passive reopen will not spam QR polling.
      activeTab.value = 'manual'
      form.name = props.editData.name
      form.code = props.editData.code || ''
      form.uin = String(props.editData.uin || props.editData.qq || '')
      form.platform = props.editData.platform || 'wx_car'
      qrPlatform.value = normalizeQrPlatform(props.editData.platform)
      qrData.value = null
      qrStatus.value = '如需扫码更新，请切换到“扫码更新”并手动获取新二维码'
    }
    else {
      // Add mode: Default to QR
      activeTab.value = 'qr'
      form.name = ''
      form.code = ''
      form.uin = ''
      form.platform = 'qq'
      qrPlatform.value = 'wx_car'
      loadQRCode()
    }
  }
  else {
    // Reset when closed
    stopQRCheck()
    stopQrCountdown()
    qrData.value = null
    qrStatus.value = ''
    qrUin.value = ''
    form.uin = ''
  }
})

onBeforeUnmount(() => {
  stopQRCheck()
  stopQrCountdown()
})

const qrExpiresAt = computed(() => Math.max(0, Number(qrData.value?.expiresAt || 0)))

const qrRemainingSeconds = computed(() => {
  if (!qrExpiresAt.value)
    return 0
  return Math.max(0, Math.ceil((qrExpiresAt.value - qrNow.value) / 1000))
})

const qrRemainingLabel = computed(() => {
  const seconds = qrRemainingSeconds.value
  if (!seconds)
    return '已过期'
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`
})

const qrIdentitySummary = computed(() => {
  const payload = qrData.value
    ? {
        nickname: qrData.value.nickname || '',
        uin: qrData.value.uin || '',
        openId: qrData.value.openId || '',
      }
    : {
        nickname: '',
        uin: '',
        openId: '',
      }
  const segments = [
    payload.nickname ? `昵称：${payload.nickname}` : '',
    payload.uin ? `UIN：${payload.uin}` : '',
    payload.openId ? `OpenID：${payload.openId}` : '',
  ].filter(Boolean)
  return segments.join(' · ')
})
</script>

<template>
  <div v-if="show" class="account-modal-root fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" @click="close">
    <div class="account-modal-panel glass-panel max-w-md w-full overflow-hidden rounded-lg shadow-xl" @click.stop>
      <div class="account-modal-header flex items-center justify-between p-4">
        <h3 class="glass-text-main text-lg font-semibold">
          {{ editData ? '编辑账号' : '添加账号' }}
        </h3>
        <BaseButton variant="ghost" class="!p-1" @click="close">
          <div class="i-carbon-close text-xl" />
        </BaseButton>
      </div>

      <div class="p-4">
        <div v-if="errorMessage" class="account-modal-error mb-4 rounded p-3 text-sm">
          {{ errorMessage }}
        </div>
        <!-- Tabs -->
        <div class="account-modal-tab-bar mb-4 flex">
          <button
            class="flex-1 py-2 text-center font-medium transition-colors"
            :class="getTabClass('qr')"
            @click="activeTab = 'qr'; loadQRCode()"
          >
            {{ editData ? '扫码更新' : '扫码登录' }}
          </button>
          <button
            class="flex-1 py-2 text-center font-medium transition-colors"
            :class="getTabClass('manual')"
            @click="activateManualTab"
          >
            手动填码
          </button>
        </div>

        <!-- QR Tab -->
        <div v-if="activeTab === 'qr'" class="flex flex-col items-center justify-center py-4 space-y-4">
          <div class="w-full flex justify-center pb-2">
            <div class="account-modal-platform-bar flex flex-wrap self-center gap-2 rounded-xl p-2 backdrop-blur-sm">
              <!-- QQ 企鹅图标 -->
              <button
                class="min-w-[100px] flex flex-1 flex-col items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200"
                :class="getQrPlatformButtonClass('qq')"
                @click="qrPlatform = 'qq'; loadQRCode()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="h-7 w-7" fill="currentColor">
                  <path d="M24 4C16.5 4 11 10 11 17.5c0 1.5.2 3 .5 4.3C9 24 6 29 6 32c0 2.5 1.5 3.5 3 3.8-.3 1.2-.5 2.5-.2 3.5.5 1.5 2 2.2 4 1.5 1-.3 2-1 3-2 2.5 1.5 5.2 2.2 8.2 2.2s5.7-.7 8.2-2.2c1 1 2 1.7 3 2 2 .7 3.5 0 4-1.5.3-1-.1-2.3-.2-3.5 1.5-.3 3-1.3 3-3.8 0-3-3-8-5.5-10.2.3-1.3.5-2.8.5-4.3C37 10 31.5 4 24 4zm-7 19.5c-1 0-2-1.5-2-3.5s1-3.5 2-3.5 2 1.5 2 3.5-1 3.5-2 3.5zm14 0c-1 0-2-1.5-2-3.5s1-3.5 2-3.5 2 1.5 2 3.5-1 3.5-2 3.5z" />
                </svg>
                <span>QQ</span>
              </button>
              <!-- iPad 平板图标 -->
              <button
                class="min-w-[100px] flex flex-1 flex-col items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200"
                :class="getQrPlatformButtonClass('wx_ipad')"
                @click="qrPlatform = 'wx_ipad'; loadQRCode()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-7 w-7" fill="currentColor">
                  <path d="M19 1H5a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zM5 3h14v16H5V3zm7 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                </svg>
                <span>iPad微信</span>
              </button>
              <!-- 劳斯莱斯小汽车图标 -->
              <button
                class="min-w-[100px] flex flex-1 flex-col items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200"
                :class="getQrPlatformButtonClass('wx_car')"
                @click="qrPlatform = 'wx_car'; loadQRCode()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" class="h-7 w-7" fill="currentColor">
                  <path d="M6 28h36v2H6z" opacity="0.3" />
                  <path d="M41 24l-3-8c-1-2.5-3-4-5.5-4h-17C13 12 11 13.5 10 16l-3 8c-2 .5-3 2-3 4v5a2 2 0 0 0 2 2h1a4 4 0 0 0 8 0h18a4 4 0 0 0 8 0h1a2 2 0 0 0 2-2v-5c0-2-1-3.5-3-4zM13 15.5c.5-1.5 2-2.5 3.5-2.5h15c1.5 0 3 1 3.5 2.5L37.5 23h-27L13 15.5zM11 33a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm26 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm5-5H6v-2c0-1 1-2 2-2h32c1 0 2 1 2 2v2z" />
                  <path d="M20 18h8v1.5h-8z" />
                  <path d="M23 15h2v7h-2z" />
                </svg>
                <span>车机微信</span>
              </button>
            </div>
          </div>
          <div class="w-full text-center">
            <p class="glass-text-muted text-sm">
              扫码默认使用登录平台昵称。QQ 若要确保策略、缓存和统计稳定跟随账号，建议先填写 QQ 号再扫码。
            </p>
          </div>

          <div v-if="qrPlatform === 'qq'" class="w-full">
            <BaseInput
              v-model="qrUin"
              placeholder="建议填写当前 QQ 号，避免重登后产生无标识账号"
            />
            <BaseButton
              v-if="!qrData"
              variant="primary"
              class="mt-2 w-full"
              :loading="loading"
              @click="loadQRCode"
            >
              获取QQ二维码
            </BaseButton>
          </div>

          <div v-if="qrData && (qrData.image || qrData.qrcode)" class="account-modal-qr-shell flex items-center justify-center rounded-xl">
            <div class="account-modal-qr-frame">
              <img
                :src="qrData.image || qrData.qrcode"
                alt="登录二维码"
                class="account-modal-qr-image"
              >
            </div>
          </div>
          <div v-else class="account-modal-qr-placeholder glass-text-muted flex items-center justify-center rounded-xl backdrop-blur-sm">
            <div v-if="loading" i-svg-spinners-90-ring-with-bg class="text-3xl" />
            <span v-else>二维码已过期</span>
          </div>
          <p class="glass-text-main text-sm">
            {{ qrStatus }}
          </p>
          <div v-if="qrData" class="account-modal-status-grid max-w-[320px] w-full space-y-2">
            <div class="account-modal-status-meta flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs">
              <span>二维码剩余有效期</span>
              <strong>{{ qrRemainingLabel }}</strong>
            </div>
            <div
              v-if="qrIdentitySummary"
              class="account-modal-status-meta rounded-xl px-3 py-2 text-xs leading-5"
            >
              {{ qrIdentitySummary }}
            </div>
          </div>
          <div class="mt-2 max-w-[200px] w-full flex flex-col gap-3">
            <button
              class="account-modal-primary-btn w-full rounded-lg py-2.5 text-sm font-medium transition-all active:scale-95"
              @click="loadQRCode"
            >
              {{ qrData?.retryable === false ? '重新生成二维码' : '更新二维码' }}
            </button>
            <button
              v-if="qrData?.url && qrPlatform === 'qq'"
              class="account-modal-primary-btn w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all md:hidden active:scale-95"
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

          <BaseInput
            v-model="form.uin"
            :label="form.platform === 'qq' ? '账号标识（可选 QQ 号）' : '账号标识（微信ID / OpenID）'"
            :placeholder="form.platform === 'qq' ? (props.editData?.id ? '留空则沿用当前 QQ 号；新增时也可留空' : '可选：填写当前登录码对应的 QQ 号') : '请输入当前登录码对应的微信ID / OpenID'"
            :hint="form.platform === 'qq' ? 'QQ 手动填码可仅保存 code；如果你知道对应 QQ 号，填上后更容易复用旧账号与缓存' : '手动填微信 code 时请同步更新微信ID / OpenID，否则会继续使用旧账号标识'"
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
              { label: 'iPad微信', value: 'wx_ipad' },
              { label: '车机微信', value: 'wx_car' },
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

<style scoped>
.account-modal-root {
  background: var(--ui-overlay-backdrop) !important;
}

.account-modal-panel,
.account-modal-header,
.account-modal-tab-bar,
.account-modal-platform-bar,
.account-modal-platform,
.account-modal-qr-shell,
.account-modal-qr-placeholder,
.account-modal-error {
  border: 1px solid var(--ui-border-subtle) !important;
}

.account-modal-panel,
.account-modal-header,
.account-modal-platform-bar,
.account-modal-qr-shell,
.account-modal-qr-placeholder {
  background: color-mix(in srgb, var(--ui-bg-surface) 74%, transparent) !important;
}

.account-modal-header,
.account-modal-tab-bar {
  border-left: none !important;
  border-right: none !important;
  border-top: none !important;
}

.account-modal-error {
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface)) !important;
  color: color-mix(in srgb, var(--ui-status-danger) 78%, var(--ui-text-1)) !important;
}

.account-modal-tab {
  border-bottom: 2px solid transparent;
}

.account-modal-tab--active {
  color: var(--ui-brand-600) !important;
  border-bottom-color: var(--ui-brand-500) !important;
}

.account-modal-tab--idle {
  color: var(--ui-text-2) !important;
}

.account-modal-tab--idle:hover {
  color: var(--ui-text-1) !important;
}

.account-modal-platform-bar {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent) !important;
}

.account-modal-platform {
  border: 1px solid transparent !important;
  color: var(--ui-text-2) !important;
}

.account-modal-platform--idle:hover {
  background: color-mix(in srgb, var(--ui-bg-surface) 90%, transparent) !important;
  color: var(--ui-text-1) !important;
}

.account-modal-platform--active {
  background: color-mix(in srgb, var(--ui-bg-surface) 94%, transparent) !important;
  box-shadow: 0 10px 18px var(--ui-shadow-panel) !important;
}

.account-modal-platform--qq {
  border-color: color-mix(in srgb, var(--ui-brand-500) 28%, var(--ui-border-subtle)) !important;
  color: var(--ui-brand-600) !important;
}

.account-modal-platform--wechat {
  border-color: color-mix(in srgb, var(--ui-status-success) 24%, var(--ui-border-subtle)) !important;
  color: color-mix(in srgb, var(--ui-status-success) 78%, var(--ui-text-1)) !important;
}

.account-modal-qr-shell,
.account-modal-qr-placeholder {
  width: 13rem;
  min-width: 13rem;
  min-height: 13rem;
}

.account-modal-qr-shell {
  padding: 0.75rem;
  background: #fff !important;
  border-color: color-mix(in srgb, #ffffff 72%, var(--ui-border-strong)) !important;
  box-shadow:
    0 16px 30px color-mix(in srgb, #000000 16%, transparent),
    inset 0 0 0 1px color-mix(in srgb, #ffffff 84%, transparent) !important;
}

.account-modal-qr-frame {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 0.875rem;
  background: #fff;
}

.account-modal-qr-image {
  display: block;
  width: 100%;
  height: 100%;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  object-fit: contain;
  background: #fff;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.account-modal-qr-placeholder {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent) !important;
}

.account-modal-primary-btn {
  background: linear-gradient(to right, var(--ui-brand-500), var(--ui-brand-600)) !important;
  color: var(--ui-text-on-brand) !important;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--ui-brand-500) 24%, transparent) !important;
}

.account-modal-primary-btn:hover {
  filter: brightness(0.98);
}

.account-modal-status-meta {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 82%, transparent);
  color: var(--ui-text-2);
}
</style>
