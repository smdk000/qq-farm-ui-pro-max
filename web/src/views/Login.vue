<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import DisclaimerModal from '@/components/DisclaimerModal.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { adminToken, clearAuth } from '@/utils/auth'
import { localizeRuntimeText } from '@/utils/runtime-text'

const router = useRouter()
const appStore = useAppStore()
const activeTab = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const cardCode = ref('')
const error = ref('')
const loading = ref(false)

// 免责声明拦截状态
const showDisclaimer = ref(false)
const pendingAuthData = ref<any>(null)

// 记住用户名
const rememberUsername = useStorage('remember_username', false)
const savedUsername = useStorage('saved_username', '')
const LOGIN_BROWSER_PREF_NOTE = '“记住用户名”只保存在当前浏览器，换设备或清缓存后需要重新输入。'

// 体验卡生成状态
const trialLoading = ref(false)
const trialSuccess = ref(false)
const trialCooldown = ref(0) // 剩余冷却秒数
const cardFeatureConfigLoaded = ref(false)
const cardFeatureConfig = ref({
  enabled: false,
  registerEnabled: false,
  trialEnabled: false,
})
const serverVersion = ref('')
const latestNotification = ref<any | null>(null)
let cooldownTimer: ReturnType<typeof setInterval> | null = null
const webVersion = __APP_VERSION__

// 格式化冷却时间
const cooldownText = computed(() => {
  if (trialCooldown.value <= 0)
    return ''
  const h = Math.floor(trialCooldown.value / 3600)
  const m = Math.floor((trialCooldown.value % 3600) / 60)
  const s = trialCooldown.value % 60
  if (h > 0)
    return `${h}小时${m}分${s}秒`
  if (m > 0)
    return `${m}分${s}秒`
  return `${s}秒`
})

// 初始化
onMounted(async () => {
  await appStore.fetchUIConfig()
  await loadCardFeatureConfig()
  await loadPublicLoginStatus()
  if (rememberUsername.value && savedUsername.value) {
    username.value = savedUsername.value
  }

  // 登录页需要整页滚动，覆盖全局 style.css 中 html/body overflow:hidden
  document.documentElement.style.overflow = 'auto'
  document.documentElement.style.height = 'auto'
  document.body.style.overflow = 'auto'
  document.body.style.height = 'auto'
})

const versionSummary = computed(() => {
  if (serverVersion.value)
    return `Web v${webVersion} · Core v${serverVersion.value}`
  return `Web v${webVersion}`
})

const registrationStatusCards = computed(() => ([
  {
    key: 'register',
    label: '注册模式',
    value: !cardFeatureConfigLoaded.value
      ? '读取中'
      : isRegisterCardRequired.value ? '卡密注册' : '免卡注册',
    tone: !cardFeatureConfigLoaded.value ? 'neutral' : (isRegisterCardRequired.value ? 'warning' : 'success'),
  },
  {
    key: 'trial',
    label: '体验卡',
    value: !cardFeatureConfigLoaded.value
      ? '读取中'
      : (cardFeatureConfig.value.enabled === false || cardFeatureConfig.value.trialEnabled === false ? '已暂停' : '可领取'),
    tone: !cardFeatureConfigLoaded.value
      ? 'neutral'
      : (cardFeatureConfig.value.enabled === false || cardFeatureConfig.value.trialEnabled === false ? 'danger' : 'info'),
  },
  {
    key: 'version',
    label: '当前版本',
    value: serverVersion.value ? `Core ${serverVersion.value}` : `Web ${webVersion}`,
    tone: 'brand',
  },
]))

const isFormValid = computed(() => {
  if (activeTab.value === 'login') {
    return username.value.trim() && password.value.trim()
  }
  else {
    if (!cardFeatureConfigLoaded.value)
      return false
    const cardRequired = cardFeatureConfig.value.enabled !== false
      && cardFeatureConfig.value.registerEnabled !== false
    return username.value.trim()
      && password.value.trim()
      && (!cardRequired || cardCode.value.trim())
  }
})

const isRegisterCardRequired = computed(() => (
  cardFeatureConfig.value.enabled !== false
  && cardFeatureConfig.value.registerEnabled !== false
))

async function loadCardFeatureConfig() {
  cardFeatureConfigLoaded.value = false
  try {
    const res = await api.get('/api/public-card-feature-config')
    if (res.data?.ok && res.data?.data) {
      cardFeatureConfig.value = { ...cardFeatureConfig.value, ...res.data.data }
    }
  }
  catch {
    cardFeatureConfig.value = { enabled: false, registerEnabled: false, trialEnabled: false }
  }
  finally {
    cardFeatureConfigLoaded.value = true
  }
}

async function loadPublicLoginStatus() {
  try {
    const [pingRes, notificationsRes] = await Promise.all([
      api.get('/api/ping'),
      api.get('/api/notifications', { params: { limit: 1 } }),
    ])
    if (pingRes.data?.ok) {
      serverVersion.value = String(pingRes.data?.data?.version || '').trim()
    }
    const notifications = Array.isArray(notificationsRes.data?.data) ? notificationsRes.data.data : []
    latestNotification.value = notifications[0] || null
  }
  catch {
    latestNotification.value = null
  }
}

/**
 * 安全地保存用户信息到 localStorage
 */
function saveCurrentUser(user: any) {
  if (user) {
    localStorage.setItem('current_user', JSON.stringify(user))
  }
  else {
    localStorage.removeItem('current_user')
  }
}

/**
 * 生成体验卡密
 */
async function handleGenerateTrial() {
  if (trialLoading.value || trialCooldown.value > 0)
    return
  if (cardFeatureConfig.value.enabled === false || cardFeatureConfig.value.trialEnabled === false) {
    error.value = '当前系统已暂停体验卡发放'
    return
  }
  trialLoading.value = true
  trialSuccess.value = false
  error.value = ''
  try {
    const res = await api.post('/api/trial-card')
    if (res.data.ok) {
      cardCode.value = res.data.data.code
      trialSuccess.value = true
    }
    else {
      if (res.data.retryAfterMs) {
        startCooldown(Math.ceil(res.data.retryAfterMs / 1000))
      }
      error.value = localizeRuntimeText(res.data.error || '生成失败')
    }
  }
  catch (e: any) {
    const errData = e.response?.data
    if (errData?.retryAfterMs) {
      startCooldown(Math.ceil(errData.retryAfterMs / 1000))
    }
    error.value = localizeRuntimeText(errData?.error || e.message || '生成异常')
  }
  finally {
    trialLoading.value = false
  }
}

function startCooldown(seconds: number) {
  trialCooldown.value = seconds
  if (cooldownTimer)
    clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    trialCooldown.value--
    if (trialCooldown.value <= 0) {
      if (cooldownTimer)
        clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

onUnmounted(() => {
  if (cooldownTimer)
    clearInterval(cooldownTimer)

  // 离开登录页时恢复全局滚动锁定（DefaultLayout 自行管理滚动）
  document.documentElement.style.overflow = ''
  document.documentElement.style.height = ''
  document.body.style.overflow = ''
  document.body.style.height = ''
})

async function handleLogin() {
  if (!isFormValid.value)
    return

  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/api/login', {
      username: username.value,
      password: password.value,
    })
    if (res.data.ok) {
      // 拦截写入，唤起免责弹窗
      pendingAuthData.value = res.data.data
      showDisclaimer.value = true
    }
    else {
      if (res.data?.needsBootstrap) {
        router.replace({ name: 'init-password' })
        return
      }
      error.value = localizeRuntimeText(res.data.error || '登录失败')
    }
  }
  catch (e: any) {
    if (e.response?.data?.needsBootstrap) {
      router.replace({ name: 'init-password' })
      return
    }
    error.value = localizeRuntimeText(e.response?.data?.error || e.message || '登录异常')
  }
  finally {
    loading.value = false
  }
}

// 免责声明统一处理方法
function onDisclaimerAgree() {
  if (pendingAuthData.value) {
    const authData = pendingAuthData.value
    const user = authData.user
    adminToken.value = user?.username || username.value.trim()
    saveCurrentUser(user)
    if (rememberUsername.value) {
      savedUsername.value = username.value
    }
    else {
      savedUsername.value = ''
    }
    pendingAuthData.value = null
    showDisclaimer.value = false
    if (authData.passwordWarning) {
      useToastStore().warning(localizeRuntimeText(authData.passwordWarning), 8000)
    }
    router.replace({ name: 'dashboard' })
  }
}

function onDisclaimerDecline() {
  pendingAuthData.value = null
  showDisclaimer.value = false
  clearAuth()
  error.value = '您已拒绝免责声明协议，无法继续使用本软件。'
}

function validateRegisterForm() {
  if (!username.value.trim()) {
    error.value = '用户名不能为空'
    return false
  }
  if (username.value.length < 4 || username.value.length > 20) {
    error.value = '用户名长度应为 4-20 个字符'
    return false
  }
  if (!/^\w+$/.test(username.value)) {
    error.value = '用户名只能包含字母、数字和下划线'
    return false
  }
  if (password.value.length < 6) {
    error.value = '密码长度至少为 6 位'
    return false
  }
  if (!/[a-z]/i.test(password.value) || !/\d/.test(password.value)) {
    error.value = '密码须同时包含字母和数字'
    return false
  }
  if (isRegisterCardRequired.value && !cardCode.value.trim()) {
    error.value = '卡密不能为空'
    return false
  }
  return true
}

async function handleRegister() {
  if (!isFormValid.value)
    return
  if (!validateRegisterForm())
    return

  loading.value = true
  error.value = ''
  try {
    const res = await api.post('/api/auth/register', {
      username: username.value,
      password: password.value,
      cardCode: cardCode.value.trim(),
    })
    if (res.data.ok) {
      // 拦截写入，唤起免责弹窗
      pendingAuthData.value = res.data.data
      showDisclaimer.value = true
    }
    else {
      error.value = localizeRuntimeText(res.data.error || '注册失败')
    }
  }
  catch (e: any) {
    error.value = localizeRuntimeText(e.response?.data?.error || e.message || '注册异常')
  }
  finally {
    loading.value = false
  }
}

const hasCustomBackground = computed(() => !!appStore.loginBackground.trim())

const backgroundStyle = computed(() => {
  if (hasCustomBackground.value) {
    return {
      backgroundImage: `url(${appStore.loginBackground.trim()})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {}
})

const backgroundOverlayStyle = computed(() => ({
  backgroundColor: `color-mix(in srgb, var(--ui-overlay-backdrop) ${appStore.loginBackgroundOverlayOpacity}%, transparent)`,
  backdropFilter: `blur(${appStore.loginBackgroundBlur}px)`,
  WebkitBackdropFilter: `blur(${appStore.loginBackgroundBlur}px)`,
}))

const siteTitle = computed(() => appStore.siteTitle)
const supportQqGroup = computed(() => appStore.supportQqGroup)
const supportQqGroupLink = computed(() => `tencent://message/?uin=${supportQqGroup.value}&Site=&Menu=yes`)
const copyrightText = computed(() => appStore.copyrightText)
</script>

<template>
  <div
    class="login-page-root relative min-h-screen w-screen flex items-start justify-center overflow-y-auto py-4 transition-all duration-700 lg:items-center lg:py-0"
    :class="{ 'login-page-fallback-bg': !hasCustomBackground }"
    :style="backgroundStyle"
  >
    <!-- 背景遮罩 (仅在有自定义背景时增强可读性) -->
    <div v-if="hasCustomBackground" class="absolute inset-0" :style="backgroundOverlayStyle" />

    <div class="relative z-10 mx-4 my-4 max-w-5xl w-full lg:mx-auto lg:my-0">
      <div class="glass-panel flex flex-col rounded-2xl shadow-2xl shadow-black/20 ring-1 ring-white/20 lg:flex-row lg:rounded-3xl">
        <!-- 左侧：品牌展示区 -->
        <div class="login-brand-panel login-brand-text relative flex flex-col items-center justify-center px-6 py-4 text-center lg:w-5/12 lg:p-10">
          <!-- 装饰背景 -->
          <div class="pointer-events-none absolute inset-0 opacity-10">
            <svg class="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>

          <div class="group relative mb-2 lg:mb-8">
            <div class="login-logo-glow absolute hidden animate-pulse rounded-full blur-2xl transition-all duration-500 -inset-4 lg:block" />
            <div class="login-logo-surface relative h-12 w-12 flex rotate-3 items-center justify-center rounded-xl shadow-xl transition-transform duration-300 lg:h-24 lg:w-24 hover:rotate-0 lg:rounded-3xl">
              <!-- 星星小树苗 Logo -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="h-8 w-8 lg:h-16 lg:w-16">
                <defs>
                  <linearGradient id="logoGrad" x1="0" y1="1" x2="0.3" y2="0">
                    <stop offset="0%" stop-color="var(--ui-brand-700)" />
                    <stop offset="60%" stop-color="var(--ui-brand-500)" />
                    <stop offset="100%" stop-color="var(--ui-brand-300)" />
                  </linearGradient>
                </defs>
                <path fill="url(#logoGrad)" d="M576 96c0 108.1-76.6 198.3-178.4 219.4c-7.9-58.1-34-110.4-72.5-150.9C365.2 104 433.9 64 512 64h32c17.7 0 32 14.3 32 32M64 160c0-17.7 14.3-32 32-32h32c123.7 0 224 100.3 224 224v192c0 17.7-14.3 32-32 32s-32-14.3-32-32V384C164.3 384 64 283.7 64 160" />
                <circle cx="190" cy="220" r="12" fill="var(--ui-status-warning)" class="animate-pulse" />
                <circle cx="470" cy="150" r="10" fill="var(--ui-text-on-brand)" opacity="0.8" />
              </svg>
            </div>
          </div>

          <h1 class="mb-1 text-lg font-extrabold tracking-tight drop-shadow-lg lg:mb-3 lg:text-3xl">
            <span class="login-brand-gradient decoration-clone bg-clip-text text-transparent">
              {{ siteTitle }}
            </span>
          </h1>
          <p class="login-brand-subtitle mb-2 text-xs font-medium tracking-wide drop-shadow-md lg:mb-8 lg:text-base">
            精简化、自动化的多账号管理助手
          </p>

          <div class="login-status-strip mb-4 flex flex-wrap items-center justify-center gap-2 lg:mb-6">
            <span class="login-status-pill">{{ versionSummary }}</span>
            <span class="login-status-pill">QQ群 {{ supportQqGroup }}</span>
            <span class="login-status-pill">
              {{ latestNotification?.version ? `最新公告 ${latestNotification.version}` : '公告入口已接通' }}
            </span>
          </div>

          <div class="login-status-grid mb-4 grid w-full gap-2 px-2 lg:mb-6 lg:grid-cols-3 lg:px-4">
            <div
              v-for="item in registrationStatusCards"
              :key="item.key"
              class="login-status-card rounded-2xl px-3 py-3 text-left"
              :class="`tone-${item.tone}`"
            >
              <div class="login-status-card__label text-[11px] font-semibold uppercase tracking-[0.18em]">
                {{ item.label }}
              </div>
              <div class="login-status-card__value mt-1 text-sm font-bold lg:text-base">
                {{ item.value }}
              </div>
            </div>
          </div>

          <div class="hidden w-full px-4 lg:grid lg:grid-cols-2 lg:gap-3">
            <div class="login-feature-card group flex flex-col cursor-default items-center justify-center gap-2 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:-translate-y-1.5">
              <div class="login-brand-icon-hover login-feature-icon login-glow-icon i-carbon-flash text-2xl drop-shadow-md transition-all" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">极速自动化</span>
            </div>
            <div class="login-feature-card group flex flex-col cursor-default items-center justify-center gap-2 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:-translate-y-1.5">
              <div class="login-brand-icon-hover login-feature-icon login-glow-icon i-carbon-security text-2xl drop-shadow-md transition-all" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">租户级防封隔离</span>
            </div>
            <div class="login-feature-card group flex flex-col cursor-default items-center justify-center gap-2 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:-translate-y-1.5">
              <div class="login-brand-icon-hover login-feature-icon login-glow-icon i-carbon-bot text-2xl drop-shadow-md transition-all" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">无感智能验证</span>
            </div>
            <div class="login-feature-card group flex flex-col cursor-default items-center justify-center gap-2 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:-translate-y-1.5">
              <div class="login-brand-icon-hover login-feature-icon login-glow-icon i-carbon-rocket text-2xl drop-shadow-md transition-all" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">多核并发引擎</span>
            </div>
          </div>

          <!-- 社区互动卡片 -->
          <div class="mt-5 hidden w-full px-4 lg:grid lg:grid-cols-2 lg:gap-3">
            <a
              :href="supportQqGroupLink"
              target="_blank"
              rel="noopener noreferrer"
              class="login-community-card group flex items-center justify-center gap-2 px-3 py-3 no-underline shadow-inner transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:-translate-y-1"
            >
              <div class="login-brand-icon-hover login-community-icon login-glow-icon i-carbon-chat text-lg drop-shadow-sm transition-all" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">加入支持QQ群</span>
            </a>
            <a
              href="https://github.com/smdk000/qq-farm-bot-ui"
              target="_blank"
              rel="noopener noreferrer"
              class="login-community-card group flex items-center justify-center gap-2 px-3 py-3 no-underline shadow-inner transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:-translate-y-1"
            >
              <div class="login-star-icon i-carbon-star text-lg drop-shadow-md transition-all" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">给作者点赞 ⭐</span>
            </a>
          </div>
        </div>

        <!-- 右侧：表单区 -->
        <div class="relative flex flex-col lg:w-7/12">
          <!-- Tab 切换 -->
          <div class="login-tab-shell m-4 flex rounded-xl p-1.5 lg:m-6 lg:p-2">
            <button
              class="flex-1 rounded-lg py-2.5 text-sm font-bold transition-all duration-300" :class="[
                activeTab === 'login'
                  ? 'login-tab-active glass-panel shadow-sm'
                  : 'login-tab-idle',
              ]"
              @click="activeTab = 'login'"
            >
              登录
            </button>
            <button
              class="flex-1 rounded-lg py-2.5 text-sm font-bold transition-all duration-300" :class="[
                activeTab === 'register'
                  ? 'login-tab-active glass-panel shadow-sm'
                  : 'login-tab-idle',
              ]"
              @click="activeTab = 'register'"
            >
              注册
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-6 pb-6 lg:px-10 lg:pb-10">
            <!-- 登录表单 -->
            <form v-if="activeTab === 'login'" class="space-y-6" @submit.prevent="handleLogin">
              <BaseInput v-model="username" label="用户名" placeholder="请输入用户名" autocomplete="username" required>
                <template #prefix>
                  <div class="login-form-icon i-carbon-user" />
                </template>
              </BaseInput>

              <BaseInput v-model="password" type="password" label="密码" placeholder="请输入密码" autocomplete="current-password" required>
                <template #prefix>
                  <div class="login-form-icon i-carbon-password" />
                </template>
              </BaseInput>

              <div class="flex items-center justify-between">
                <div class="space-y-2">
                  <label class="group flex cursor-pointer items-center gap-2">
                    <input v-model="rememberUsername" type="checkbox" class="login-remember-check h-4 w-4 cursor-pointer rounded text-primary-600 transition-all focus:ring-primary-500">
                    <span class="glass-text-muted group-hover:glass-text-main text-sm">记住用户名</span>
                  </label>
                  <p class="login-info-note text-xs leading-5">
                    {{ LOGIN_BROWSER_PREF_NOTE }}
                  </p>
                </div>
              </div>

              <div v-if="error" class="login-error-banner animate-shake flex items-center gap-2 rounded-xl p-4 text-sm">
                <div class="i-carbon-error flex-shrink-0" />
                {{ error }}
              </div>

              <BaseButton type="submit" variant="primary" block size="lg" :loading="loading" :disabled="!isFormValid" class="h-12 rounded-xl shadow-lg shadow-primary-500/25">
                {{ loading ? '登录中...' : '开始探索' }}
              </BaseButton>
            </form>

            <!-- 注册表单 -->
            <form v-else class="space-y-3 lg:space-y-5" @submit.prevent="handleRegister">
              <div class="login-trial-card p-5 space-y-2 text-center">
                <div class="text-base font-semibold">
                  {{ !cardFeatureConfigLoaded
                    ? '正在读取注册配置'
                    : isRegisterCardRequired ? '卡密注册已开启' : '当前为免卡注册模式' }}
                </div>
                <p class="glass-text-muted text-sm leading-6">
                  {{ !cardFeatureConfigLoaded
                    ? '正在同步服务器上的注册与卡密总控状态，请稍候。'
                    : isRegisterCardRequired
                    ? '请输入有效卡密完成注册；若没有卡密，也可以先领取下方体验卡。'
                    : '管理员已关闭卡密注册要求，当前创建账号无需再填写卡密。' }}
                </p>
                <div class="login-register-summary rounded-xl px-3 py-2 text-left text-xs leading-5">
                  <div>当前版本：{{ versionSummary }}</div>
                  <div>注册入口：{{ !cardFeatureConfigLoaded ? '读取中' : (isRegisterCardRequired ? '需要卡密' : '无需卡密') }}</div>
                  <div>体验卡：{{ !cardFeatureConfigLoaded ? '读取中' : (cardFeatureConfig.enabled === false || cardFeatureConfig.trialEnabled === false ? '暂停领取' : '可自助领取') }}</div>
                </div>
              </div>

              <BaseInput v-model="username" label="用户名" placeholder="4-20个字符" autocomplete="username" required>
                <template #prefix>
                  <div class="login-form-icon i-carbon-user" />
                </template>
              </BaseInput>
              <BaseInput v-model="password" type="password" label="新密码" placeholder="字母+数字组合" autocomplete="new-password" required>
                <template #prefix>
                  <div class="login-form-icon i-carbon-password" />
                </template>
              </BaseInput>
              <BaseInput
                v-if="isRegisterCardRequired"
                v-model="cardCode"
                label="注册卡密"
                placeholder="请输入卡密"
                autocomplete="one-time-code"
                required
              >
                <template #prefix>
                  <div class="login-form-icon i-carbon-vlan" />
                </template>
              </BaseInput>

              <div class="login-trial-card p-4 space-y-3">
                <button
                  type="button"
                  :disabled="!cardFeatureConfigLoaded || trialLoading || trialCooldown > 0 || cardFeatureConfig.enabled === false || cardFeatureConfig.trialEnabled === false"
                  class="login-trial-button w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all duration-200"
                  :class="trialCooldown > 0
                    ? 'login-trial-button-cooldown cursor-not-allowed'
                    : trialSuccess
                      ? 'login-trial-button-success'
                      : 'login-trial-button-default'"
                  @click="handleGenerateTrial"
                >
                  <div v-if="trialLoading" class="i-svg-spinners-ring-resize" />
                  <span v-if="trialCooldown > 0">⏳ 待冷却 ({{ cooldownText }})</span>
                  <span v-else-if="!cardFeatureConfigLoaded">读取中...</span>
                  <span v-else-if="cardFeatureConfig.enabled === false || cardFeatureConfig.trialEnabled === false">体验卡领取已暂停</span>
                  <span v-else-if="trialSuccess">✅ 已自动填充卡密</span>
                  <span v-else>🎁 立即领取 24H 免费卡</span>
                </button>
                <p v-if="!trialSuccess" class="glass-text-muted text-center text-[10px] leading-relaxed">
                  {{ !cardFeatureConfigLoaded
                    ? '正在读取服务器体验卡发放状态。'
                    : cardFeatureConfig.enabled === false || cardFeatureConfig.trialEnabled === false
                    ? '当前系统已暂停卡密发放，体验卡入口同步关闭'
                    : '新用户每 4 小时可限领一张，用于快速上手体验功能' }}
                </p>
              </div>

              <div v-if="error" class="login-error-banner flex items-center gap-2 rounded-xl p-4 text-sm">
                <div class="i-carbon-error" /> {{ error }}
              </div>

              <BaseButton type="submit" variant="primary" block size="lg" :loading="loading" :disabled="!isFormValid" class="h-12 rounded-xl">
                {{ !cardFeatureConfigLoaded ? '读取配置中...' : '立即创建账号' }}
              </BaseButton>
            </form>
          </div>

          <!-- 公告悬浮卡片（手机端注册时隐藏以节省空间） -->
          <div class="login-announcement-strip mt-auto px-6 pb-6 pt-4 lg:px-10 lg:pb-8 lg:pt-6" :class="{ 'hidden lg:block': activeTab === 'register' }">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="login-announcement-icon i-carbon-notification" />
                <span class="glass-text-muted text-xs font-bold tracking-widest uppercase">系统更新公告</span>
              </div>
            </div>
            <div class="scrollbar-thin max-h-24 overflow-y-auto">
              <NotificationPanel mode="card" :limit="1" />
            </div>
          </div>
        </div>
      </div>

      <div class="relative z-20 mb-4 mt-4 px-4 text-center lg:mt-6" :class="{ 'hidden lg:block': activeTab === 'register' }">
        <BaseBadge as="div" surface="glass-soft" class="login-footer-pill inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 backdrop-blur-md transition-all">
          <p class="glass-text-main flex items-center gap-1 text-xs font-bold tracking-wide drop-shadow-sm">
            {{ copyrightText }}
            <span class="mx-1.5 opacity-30">|</span>
            合作QQ群:
            <a :href="supportQqGroupLink" class="ml-1 text-primary-600 font-black transition-colors dark:text-primary-400 hover:text-primary-700 hover:underline dark:hover:text-primary-300">
              {{ supportQqGroup }}
            </a>
          </p>
        </BaseBadge>
      </div>
    </div>

    <!-- 免责声明拦截弹窗 -->
    <DisclaimerModal
      :show="showDisclaimer"
      @agree="onDisclaimerAgree"
      @decline="onDisclaimerDecline"
    />
  </div>
</template>

<style scoped>
/* 确保登录页面可以整体滚动（手机端关键） */
.login-page-root {
  -webkit-overflow-scrolling: touch;
  color: var(--ui-text-1);
}

.login-page-fallback-bg {
  background-image: linear-gradient(
    to bottom right,
    color-mix(in srgb, var(--ui-brand-500) 8%, var(--ui-bg-canvas) 92%),
    color-mix(in srgb, var(--ui-brand-700) 14%, var(--ui-bg-canvas) 86%)
  );
}

.login-page-root :is([class*='text-'][class*='gray-400'], [class*='text-'][class*='gray-500'], .glass-text-muted) {
  color: var(--ui-text-2) !important;
}

.login-page-root
  :is(
    [class*='text-'][class*='gray-300'],
    [class*='text-'][class*='gray-200'],
    [class*='dark:text-'][class*='gray-300'],
    [class*='dark:text-'][class*='gray-200']
  ) {
  color: var(--ui-text-1) !important;
}

.login-page-root [class*='border-'][class*='gray-100'],
.login-page-root [class*='border-'][class*='gray-700'],
.login-page-root [class*='border-'][class*='white/'],
.login-page-root [class*='border-'][class*='black/'] {
  border-color: var(--ui-border-subtle) !important;
}

.login-page-root [class*='bg-'][class*='gray-100/'],
.login-page-root [class*='bg-'][class*='gray-900/'],
.login-page-root [class*='bg-'][class*='black/'],
.login-page-root [class*='bg-'][class*='white/'] {
  background-color: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent) !important;
}

.login-brand-subtitle,
.login-feature-card,
.login-community-card,
.login-community-icon {
  color: color-mix(in srgb, var(--ui-text-on-brand) 92%, var(--ui-text-1) 8%) !important;
}

.login-status-strip {
  color: color-mix(in srgb, var(--ui-text-on-brand) 92%, var(--ui-text-1) 8%);
}

.login-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.35rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--ui-text-on-brand) 14%, var(--ui-border-subtle));
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-text-on-brand) 9%, transparent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  backdrop-filter: blur(12px);
}

.login-status-grid {
  width: 100%;
}

.login-status-card {
  border: 1px solid color-mix(in srgb, var(--ui-text-on-brand) 14%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-text-on-brand) 9%, transparent);
  backdrop-filter: blur(12px);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 8%, transparent),
    0 10px 24px color-mix(in srgb, black 10%, transparent);
}

.login-status-card__label {
  opacity: 0.74;
}

.login-status-card__value {
  color: color-mix(in srgb, var(--ui-text-on-brand) 92%, var(--ui-text-1) 8%);
  line-height: 1.2;
}

.login-status-card.tone-success {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-status-success) 18%, transparent);
}

.login-status-card.tone-warning {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-status-warning) 18%, transparent);
}

.login-status-card.tone-danger {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-status-danger) 18%, transparent);
}

.login-status-card.tone-brand {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-brand-400) 20%, transparent);
}

.login-status-card.tone-info {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-status-info) 18%, transparent);
}

.login-status-card.tone-neutral {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-text-on-brand) 14%, transparent);
}

.login-logo-glow {
  background: color-mix(in srgb, var(--ui-text-on-brand) 18%, transparent) !important;
}

.login-brand-text {
  color: var(--ui-text-on-brand) !important;
}

.login-logo-surface {
  background: color-mix(in srgb, white 88%, var(--ui-bg-surface) 12%) !important;
}

.login-brand-gradient {
  background-image: linear-gradient(
    to right,
    var(--ui-text-on-brand),
    color-mix(in srgb, var(--ui-text-on-brand) 90%, transparent),
    color-mix(in srgb, var(--ui-text-on-brand) 72%, transparent)
  ) !important;
}

.group:hover .login-logo-glow {
  background: color-mix(in srgb, var(--ui-text-on-brand) 26%, transparent) !important;
}

.login-feature-card,
.login-community-card,
.login-tab-shell,
.login-trial-card {
  border: 1px solid color-mix(in srgb, var(--ui-text-on-brand) 14%, var(--ui-border-subtle)) !important;
}

.login-feature-card,
.login-community-card {
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-text-on-brand) 10%, transparent) !important;
}

.login-feature-card:hover,
.login-community-card:hover {
  background: color-mix(in srgb, var(--ui-text-on-brand) 18%, transparent) !important;
  box-shadow: 0 18px 34px color-mix(in srgb, var(--ui-text-on-brand) 10%, transparent) !important;
}

.login-feature-icon {
  color: color-mix(in srgb, var(--ui-text-on-brand) 86%, var(--ui-text-1) 14%) !important;
}

.group:hover .login-brand-icon-hover {
  color: var(--ui-text-on-brand) !important;
}

.login-tab-shell {
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent) !important;
  border-radius: 0.875rem;
}

.login-tab-active {
  color: color-mix(in srgb, var(--ui-brand-700) 76%, var(--ui-text-1)) !important;
}

.login-tab-idle {
  color: var(--ui-text-2) !important;
}

.login-tab-idle:hover {
  color: var(--ui-text-1) !important;
}

.login-form-icon {
  color: var(--ui-text-3) !important;
}

.login-remember-check {
  border: 1px solid var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent) !important;
}

.login-info-note {
  color: color-mix(in srgb, var(--ui-status-info) 72%, var(--ui-text-1)) !important;
}

.login-error-banner {
  border: 1px solid color-mix(in srgb, var(--ui-status-danger) 22%, transparent) !important;
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface-raised) 92%) !important;
  color: color-mix(in srgb, var(--ui-status-danger) 82%, var(--ui-text-1)) !important;
}

.login-trial-card {
  border-radius: 1rem;
  background: color-mix(in srgb, var(--ui-status-warning) 8%, var(--ui-bg-surface-raised) 92%) !important;
}

.login-register-summary {
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 84%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface) 58%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
}

.login-trial-button {
  color: var(--ui-text-on-brand);
}

.login-trial-button-default {
  background: color-mix(in srgb, var(--ui-status-warning) 88%, white 12%) !important;
}

.login-trial-button-success {
  background: var(--ui-brand-soft-12) !important;
  color: color-mix(in srgb, var(--ui-brand-700) 76%, var(--ui-text-1)) !important;
}

.login-trial-button-cooldown {
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent) !important;
  color: var(--ui-text-2) !important;
}

.login-announcement-strip {
  border-top: 1px solid var(--ui-border-subtle);
}

.login-announcement-icon {
  color: var(--ui-status-info) !important;
}

.login-star-icon {
  color: color-mix(in srgb, var(--ui-status-warning) 74%, var(--ui-text-on-brand)) !important;
}

/* 左侧品牌面板：使用 primary CSS 变量实现主题联动 + 透明度 */
.login-brand-panel {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-brand-700) 92%, transparent) 0%,
    color-mix(in srgb, var(--ui-brand-600) 88%, transparent) 40%,
    color-mix(in srgb, var(--ui-brand-500) 82%, transparent) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: background 0.8s ease;
  box-shadow: inset 1px 1px 0 0 color-mix(in srgb, var(--ui-text-on-brand) 20%, transparent);
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}
.animate-shake {
  animation: shake 0.4s ease-in-out;
}

.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: var(--ui-scrollbar-thumb);
  border-radius: 10px;
}

.group:hover .login-glow-icon {
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--ui-text-on-brand) 80%, transparent));
}

.group:hover .login-star-icon {
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--ui-status-warning) 80%, transparent));
}

.login-footer-pill {
  box-shadow: 0 8px 32px 0 var(--ui-shadow-panel);
}
</style>

<!-- 非 scoped：覆盖全局 style.css 中 html,body { overflow: hidden } 以允许登录页滚动 -->
<style>
.login-page-root {
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}
</style>
