<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import DisclaimerModal from '@/components/DisclaimerModal.vue'
import NotificationPanel from '@/components/NotificationPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { adminToken, clearAuth } from '@/utils/auth'

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

// 体验卡生成状态
const trialLoading = ref(false)
const trialSuccess = ref(false)
const trialCooldown = ref(0) // 剩余冷却秒数
let cooldownTimer: ReturnType<typeof setInterval> | null = null

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
  if (rememberUsername.value && savedUsername.value) {
    username.value = savedUsername.value
  }

  // 登录页需要整页滚动，覆盖全局 style.css 中 html/body overflow:hidden
  document.documentElement.style.overflow = 'auto'
  document.documentElement.style.height = 'auto'
  document.body.style.overflow = 'auto'
  document.body.style.height = 'auto'
})

const isFormValid = computed(() => {
  if (activeTab.value === 'login') {
    return username.value.trim() && password.value.trim()
  }
  else {
    return username.value.trim() && password.value.trim() && cardCode.value.trim()
  }
})

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
      error.value = res.data.error || '生成失败'
    }
  }
  catch (e: any) {
    const errData = e.response?.data
    if (errData?.retryAfterMs) {
      startCooldown(Math.ceil(errData.retryAfterMs / 1000))
    }
    error.value = errData?.error || e.message || '生成异常'
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
      error.value = res.data.error || '登录失败'
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '登录异常'
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
      useToastStore().warning(authData.passwordWarning, 8000)
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
  if (!cardCode.value.trim()) {
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
      cardCode: cardCode.value,
    })
    if (res.data.ok) {
      // 拦截写入，唤起免责弹窗
      pendingAuthData.value = res.data.data
      showDisclaimer.value = true
    }
    else {
      error.value = res.data.error || '注册失败'
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '注册异常'
  }
  finally {
    loading.value = false
  }
}

const backgroundStyle = computed(() => {
  if (appStore.loginBackground) {
    return {
      backgroundImage: `url(${appStore.loginBackground})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {}
})
</script>

<template>
  <div
    class="login-page-root relative min-h-screen w-screen flex items-start justify-center overflow-y-auto py-4 transition-all duration-700 lg:items-center lg:py-0"
    :class="[!appStore.loginBackground ? 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800' : '']"
    :style="backgroundStyle"
  >
    <!-- 背景遮罩 (仅在有自定义背景时增强可读性) -->
    <div v-if="appStore.loginBackground" class="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

    <div class="relative z-10 mx-4 my-4 max-w-5xl w-full lg:mx-auto lg:my-0">
      <div class="glass-panel flex flex-col rounded-2xl shadow-2xl shadow-black/20 ring-1 ring-white/20 lg:flex-row lg:rounded-3xl">
        <!-- 左侧：品牌展示区 -->
        <div class="login-brand-panel relative flex flex-col items-center justify-center px-6 py-4 text-center text-white lg:w-5/12 lg:p-10">
          <!-- 装饰背景 -->
          <div class="pointer-events-none absolute inset-0 opacity-10">
            <svg class="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>

          <div class="group relative mb-2 lg:mb-8">
            <div class="absolute hidden animate-pulse rounded-full bg-white/20 blur-2xl transition-all duration-500 -inset-4 lg:block group-hover:bg-white/30" />
            <div class="relative h-12 w-12 flex rotate-3 items-center justify-center rounded-xl bg-white shadow-xl transition-transform duration-300 lg:h-24 lg:w-24 hover:rotate-0 lg:rounded-3xl">
              <!-- 星星小树苗 Logo -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="h-8 w-8 lg:h-16 lg:w-16">
                <defs>
                  <linearGradient id="logoGrad" x1="0" y1="1" x2="0.3" y2="0">
                    <stop offset="0%" stop-color="#15803d" />
                    <stop offset="60%" stop-color="#22c55e" />
                    <stop offset="100%" stop-color="#4ade80" />
                  </linearGradient>
                </defs>
                <path fill="url(#logoGrad)" d="M576 96c0 108.1-76.6 198.3-178.4 219.4c-7.9-58.1-34-110.4-72.5-150.9C365.2 104 433.9 64 512 64h32c17.7 0 32 14.3 32 32M64 160c0-17.7 14.3-32 32-32h32c123.7 0 224 100.3 224 224v192c0 17.7-14.3 32-32 32s-32-14.3-32-32V384C164.3 384 64 283.7 64 160" />
                <circle cx="190" cy="220" r="12" fill="#ffeb3b" class="animate-pulse" />
                <circle cx="470" cy="150" r="10" fill="#fff" opacity="0.8" />
              </svg>
            </div>
          </div>

          <h1 class="mb-1 text-lg font-extrabold tracking-tight drop-shadow-lg lg:mb-3 lg:text-3xl">
            <span class="decoration-clone from-white via-white/90 to-white/70 bg-gradient-to-r bg-clip-text text-transparent">
              御农·QQ 农场智能助手
            </span>
          </h1>
          <p class="mb-2 text-xs text-white/90 font-medium tracking-wide drop-shadow-md lg:mb-8 lg:text-base">
            精简化、自动化的多账号管理助手
          </p>

          <div class="hidden w-full px-4 lg:grid lg:grid-cols-2 lg:gap-3">
            <div class="group flex flex-col cursor-default items-center justify-center gap-2 border border-white/10 rounded-2xl bg-white/10 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:bg-white/20 hover:shadow-white/10 hover:shadow-xl hover:-translate-y-1.5">
              <div class="i-carbon-flash text-2xl text-white/85 drop-shadow-md transition-all group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">极速自动化</span>
            </div>
            <div class="group flex flex-col cursor-default items-center justify-center gap-2 border border-white/10 rounded-2xl bg-white/10 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:bg-white/20 hover:shadow-white/10 hover:shadow-xl hover:-translate-y-1.5">
              <div class="i-carbon-security text-2xl text-white/85 drop-shadow-md transition-all group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">租户级防封隔离</span>
            </div>
            <div class="group flex flex-col cursor-default items-center justify-center gap-2 border border-white/10 rounded-2xl bg-white/10 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:bg-white/20 hover:shadow-white/10 hover:shadow-xl hover:-translate-y-1.5">
              <div class="i-carbon-bot text-2xl text-white/85 drop-shadow-md transition-all group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">无感智能验证</span>
            </div>
            <div class="group flex flex-col cursor-default items-center justify-center gap-2 border border-white/10 rounded-2xl bg-white/10 p-4 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:bg-white/20 hover:shadow-white/10 hover:shadow-xl hover:-translate-y-1.5">
              <div class="i-carbon-rocket text-2xl text-white/85 drop-shadow-md transition-all group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">多核并发引擎</span>
            </div>
          </div>

          <!-- 社区互动卡片 -->
          <div class="mt-5 hidden w-full px-4 lg:grid lg:grid-cols-2 lg:gap-3">
            <a
              href="https://qm.qq.com/cgi-bin/qm/qr?k=&group_code=227916149"
              target="_blank"
              rel="noopener noreferrer"
              class="group flex items-center justify-center gap-2 border border-white/15 rounded-2xl bg-white/10 px-3 py-3 text-white no-underline shadow-inner transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:bg-white/25 hover:shadow-white/10 hover:shadow-xl hover:-translate-y-1"
            >
              <div class="i-carbon-chat text-lg text-white/90 drop-shadow-sm transition-all group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">加入技术QQ群</span>
            </a>
            <a
              href="https://github.com/smdk000/qq-farm-bot-ui"
              target="_blank"
              rel="noopener noreferrer"
              class="group flex items-center justify-center gap-2 border border-white/15 rounded-2xl bg-white/10 px-3 py-3 text-white no-underline shadow-inner transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 hover:bg-white/25 hover:shadow-white/10 hover:shadow-xl hover:-translate-y-1"
            >
              <div class="i-carbon-star text-lg text-yellow-300 drop-shadow-md transition-all group-hover:text-yellow-200 group-hover:drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]" />
              <span class="text-xs font-semibold tracking-wide drop-shadow-sm">给作者点赞 ⭐</span>
            </a>
          </div>
        </div>

        <!-- 右侧：表单区 -->
        <div class="relative flex flex-col lg:w-7/12">
          <!-- Tab 切换 -->
          <div class="m-4 flex border border-white/20 rounded-xl bg-gray-100/20 p-1.5 lg:m-6 dark:bg-gray-900/20 lg:p-2">
            <button
              class="flex-1 rounded-lg py-2.5 text-sm font-bold transition-all duration-300" :class="[
                activeTab === 'login'
                  ? 'glass-panel text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'glass-text-muted hover:glass-text-main dark:hover:text-gray-200',
              ]"
              @click="activeTab = 'login'"
            >
              登录
            </button>
            <button
              class="flex-1 rounded-lg py-2.5 text-sm font-bold transition-all duration-300" :class="[
                activeTab === 'register'
                  ? 'glass-panel text-primary-600 dark:text-primary-400 shadow-sm'
                  : 'glass-text-muted hover:glass-text-main dark:hover:text-gray-200',
              ]"
              @click="activeTab = 'register'"
            >
              注册
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-6 pb-6 lg:px-10 lg:pb-10">
            <!-- 登录表单 -->
            <form v-if="activeTab === 'login'" class="space-y-6" @submit.prevent="handleLogin">
              <BaseInput v-model="username" label="用户名" placeholder="请输入用户名" required>
                <template #prefix>
                  <div class="i-carbon-user text-gray-400" />
                </template>
              </BaseInput>

              <BaseInput v-model="password" type="password" label="密码" placeholder="请输入密码" required>
                <template #prefix>
                  <div class="i-carbon-password text-gray-400" />
                </template>
              </BaseInput>

              <div class="flex items-center justify-between">
                <label class="group flex cursor-pointer items-center gap-2">
                  <input v-model="rememberUsername" type="checkbox" class="h-4 w-4 cursor-pointer border-black/10 rounded bg-black/5 text-primary-600 transition-all dark:border-white/20 dark:bg-black/40 focus:ring-primary-500">
                  <span class="glass-text-muted group-hover:glass-text-main text-sm">记住用户名</span>
                </label>
              </div>

              <div v-if="error" class="animate-shake flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <div class="i-carbon-error flex-shrink-0" />
                {{ error }}
              </div>

              <BaseButton type="submit" variant="primary" block size="lg" :loading="loading" :disabled="!isFormValid" class="h-12 rounded-xl shadow-lg shadow-primary-500/25">
                {{ loading ? '登录中...' : '开始探索' }}
              </BaseButton>
            </form>

            <!-- 注册表单 -->
            <form v-else class="space-y-3 lg:space-y-5" @submit.prevent="handleRegister">
              <BaseInput v-model="username" label="用户名" placeholder="4-20个字符" required>
                <template #prefix>
                  <div class="i-carbon-user text-gray-400" />
                </template>
              </BaseInput>
              <BaseInput v-model="password" type="password" label="新密码" placeholder="字母+数字组合" required>
                <template #prefix>
                  <div class="i-carbon-password text-gray-400" />
                </template>
              </BaseInput>
              <BaseInput v-model="cardCode" label="注册卡密" placeholder="请输入卡密" required>
                <template #prefix>
                  <div class="i-carbon-vlan text-gray-400" />
                </template>
              </BaseInput>

              <div class="border border-orange-100/30 rounded-xl bg-orange-50/30 p-4 space-y-3 dark:border-orange-800/30 dark:bg-orange-900/20">
                <button
                  type="button"
                  :disabled="trialLoading || trialCooldown > 0"
                  class="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all duration-200"
                  :class="trialCooldown > 0
                    ? 'bg-gray-200 glass-text-muted dark:bg-gray-700 cursor-not-allowed'
                    : trialSuccess
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30'
                      : 'bg-orange-500 text-white hover:bg-orange-600 shadow-md'"
                  @click="handleGenerateTrial"
                >
                  <div v-if="trialLoading" class="i-svg-spinners-ring-resize" />
                  <span v-if="trialCooldown > 0">⏳ 待冷却 ({{ cooldownText }})</span>
                  <span v-else-if="trialSuccess">✅ 已自动填充卡密</span>
                  <span v-else>🎁 立即领取 24H 免费卡</span>
                </button>
                <p v-if="!trialSuccess" class="glass-text-muted text-center text-[10px] leading-relaxed">
                  新用户每 4 小时可限领一张，用于快速上手体验功能
                </p>
              </div>

              <div v-if="error" class="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600">
                <div class="i-carbon-error" /> {{ error }}
              </div>

              <BaseButton type="submit" variant="primary" block size="lg" :loading="loading" :disabled="!isFormValid" class="h-12 rounded-xl">
                立即创建账号
              </BaseButton>
            </form>
          </div>

          <!-- 公告悬浮卡片（手机端注册时隐藏以节省空间） -->
          <div class="mt-auto border-t border-gray-100/50 px-6 pb-6 pt-4 dark:border-gray-700/50 lg:px-10 lg:pb-8 lg:pt-6" :class="{ 'hidden lg:block': activeTab === 'register' }">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="i-carbon-notification text-blue-500" />
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
        <div class="inline-flex items-center justify-center gap-1.5 border border-white/30 rounded-full bg-white/40 px-5 py-2.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] backdrop-blur-md transition-all dark:border-white/10 dark:bg-black/40 hover:bg-white/60 dark:hover:bg-black/60">
          <p class="glass-text-main flex items-center gap-1 text-xs font-bold tracking-wide drop-shadow-sm">
            © 2026 🌌 御农 System <span class="mx-1.5 opacity-30">|</span> 架构与开发:
            <span class="group relative ml-1 cursor-pointer text-primary-600 font-black dark:text-primary-400">
              smdk000
              <span class="absolute left-0 h-0.5 w-0 bg-primary-500 transition-all -bottom-1 group-hover:w-full" />
            </span>
            <span class="mx-1.5 opacity-30">|</span>
            合作QQ群:
            <a href="tencent://message/?uin=227916149&Site=&Menu=yes" class="ml-1 text-primary-600 font-black transition-colors dark:text-primary-400 hover:text-primary-700 hover:underline dark:hover:text-primary-300">
              227916149
            </a>
          </p>
        </div>
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
}

/* 左侧品牌面板：使用 primary CSS 变量实现主题联动 + 透明度 */
.login-brand-panel {
  background: linear-gradient(
    135deg,
    rgb(var(--color-primary-700) / 0.92) 0%,
    rgb(var(--color-primary-600) / 0.88) 40%,
    rgb(var(--color-primary-500) / 0.82) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: background 0.8s ease;
  box-shadow: inset 1px 1px 0 0 rgba(255, 255, 255, 0.2);
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
  background: rgba(156, 163, 175, 0.3);
  border-radius: 10px;
}
</style>

<!-- 非 scoped：覆盖全局 style.css 中 html,body { overflow: hidden } 以允许登录页滚动 -->
<style>
.login-page-root {
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}
</style>
