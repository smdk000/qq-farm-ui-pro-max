<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import NotificationPanel from '@/components/NotificationPanel.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const activeTab = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const cardCode = ref('')
const error = ref('')
const loading = ref(false)
const token = useStorage('admin_token', '')

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
      token.value = res.data.data.token
      saveCurrentUser(res.data.data.user)
      if (rememberUsername.value) {
        savedUsername.value = username.value
      }
      else {
        savedUsername.value = ''
      }
      router.push('/')
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
      token.value = res.data.data.token
      saveCurrentUser(res.data.data.user)
      router.push('/')
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
    class="relative min-h-screen w-screen flex items-center justify-center overflow-hidden transition-all duration-700"
    :class="[!appStore.loginBackground ? 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800' : '']"
    :style="backgroundStyle"
  >
    <!-- 背景遮罩 (仅在有自定义背景时增强可读性) -->
    <div v-if="appStore.loginBackground" class="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

    <div class="relative z-10 mx-4 max-w-5xl w-full lg:mx-auto">
      <div class="glass-panel flex flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/20 ring-1 ring-white/20 lg:flex-row">
        <!-- 左侧：品牌展示区 -->
        <div class="relative flex flex-col items-center justify-center from-blue-600/90 to-indigo-700/90 bg-gradient-to-br p-10 text-center text-white lg:w-5/12">
          <!-- 装饰背景 -->
          <div class="pointer-events-none absolute inset-0 opacity-10">
            <svg class="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
          </div>

          <div class="group relative mb-8">
            <div class="absolute animate-pulse rounded-full bg-white/20 blur-2xl transition-all duration-500 -inset-4 group-hover:bg-white/30" />
            <div class="relative h-24 w-24 flex rotate-3 items-center justify-center rounded-3xl bg-white shadow-xl transition-transform duration-300 hover:rotate-0">
              <!-- 星星小树苗 Logo -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" class="h-16 w-16">
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

          <h1 class="mb-3 text-3xl font-extrabold tracking-tight">
            QQ 农场智能助手
          </h1>
          <p class="mb-8 text-blue-100 font-medium">
            精简化、自动化的多账号管理助手
          </p>

          <div class="hidden w-full px-4 lg:block space-y-4">
            <div class="flex items-center gap-3 border border-white/10 rounded-2xl bg-white/10 p-3">
              <div class="i-carbon-flash text-xl" />
              <span class="text-sm">极速自动化响应</span>
            </div>
            <div class="flex items-center gap-3 border border-white/10 rounded-2xl bg-white/10 p-3">
              <div class="i-carbon-security text-xl" />
              <span class="text-sm">安全的多用户隔离存储</span>
            </div>
          </div>
        </div>

        <!-- 右侧：表单区 -->
        <div class="relative flex flex-col lg:w-7/12">
          <!-- Tab 切换 -->
          <div class="m-6 flex border border-white/20 rounded-xl bg-gray-100/20 p-2 dark:bg-gray-900/20">
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

          <div class="flex-1 px-10 pb-10">
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
                  <input v-model="rememberUsername" type="checkbox" class="h-4 w-4 cursor-pointer border-gray-300/50 rounded text-blue-600 transition-all focus:ring-blue-500">
                  <span class="glass-text-muted text-sm group-hover:glass-text-main">记住用户名</span>
                </label>
              </div>

              <div v-if="error" class="animate-shake flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <div class="i-carbon-error flex-shrink-0" />
                {{ error }}
              </div>

              <BaseButton type="submit" variant="primary" block size="lg" :loading="loading" :disabled="!isFormValid" class="h-12 rounded-xl shadow-blue-500/25 shadow-lg">
                {{ loading ? '登录中...' : '开始探索' }}
              </BaseButton>
            </form>

            <!-- 注册表单 -->
            <form v-else class="space-y-5" @submit.prevent="handleRegister">
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

          <!-- 公告悬浮卡片 -->
          <div class="mt-auto border-t border-gray-100/50 px-10 pb-8 pt-6 dark:border-gray-700/50">
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

      <div class="mb-4 mt-10 px-4 text-center">
        <p class="glass-text-main text-base font-bold tracking-wide drop-shadow-sm transition-colors duration-300">
          © 2026 🌌 御农 System | 架构与开发：
          <span class="group relative cursor-pointer text-blue-600 dark:text-blue-400">
            smdk000
            <span class="absolute left-0 h-0.5 w-0 bg-blue-500 transition-all -bottom-1 group-hover:w-full" />
          </span>
          <span class="mx-1">|</span>
          合作QQ群：
          <a href="tencent://message/?uin=227916149&Site=&Menu=yes" class="text-blue-500 transition-colors dark:text-blue-400 hover:text-blue-700 hover:underline dark:hover:text-blue-300">
            227916149
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
