import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { pushClientError } from '@/utils/bug-report-client-errors'
import { attemptRouteRecovery, getCurrentRouteLocation, isRecoverableRouteError } from '@/utils/route-recovery'
import { localizeRuntimeText } from '@/utils/runtime-text'
import App from './App.vue'
import router from './router'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Global Error Handling
const toast = useToastStore()

app.config.errorHandler = (err: any, _instance, info) => {
  console.error('全局 Vue 错误:', err, info)
  pushClientError({ error: err, source: `vue:${String(info || 'unknown')}` })
  if (isRecoverableRouteError(err)) {
    toast.error('检测到页面资源已更新，正在尝试恢复当前页面...')
    if (attemptRouteRecovery(getCurrentRouteLocation()))
      return
  }
  const message = localizeRuntimeText(err.message || String(err))
  if (message.includes('ResizeObserver loop'))
    return
  toast.error(`应用错误: ${message}`)
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  if (reason && typeof reason === 'object' && 'isAxiosError' in reason)
    return

  console.error('未处理的异步异常:', reason)
  pushClientError({ error: reason, source: 'unhandledrejection' })
  if (isRecoverableRouteError(reason)) {
    toast.error('检测到应用版本更新或网络异常，正在尝试刷新页面...')
    if (attemptRouteRecovery(getCurrentRouteLocation()))
      return
  }
  const message = localizeRuntimeText(reason?.message || String(reason))
  if (message.includes('动态模块加载失败') || message.includes('模块脚本加载失败')) {
    toast.error('页面资源已失效，请手动刷新后重试。')
    return
  }
  toast.error(`异步错误: ${message}`)
})

window.onerror = (message, _source, _lineno, _colno, error) => {
  console.error('全局脚本错误:', message, error)
  if (String(message).includes('Script error'))
    return
  pushClientError({ error: error || message, source: 'window.onerror' })
  if (isRecoverableRouteError(error || message)) {
    toast.error('检测到页面资源已更新，正在尝试恢复当前页面...')
    if (attemptRouteRecovery(getCurrentRouteLocation()))
      return
  }
  toast.error(`系统错误: ${localizeRuntimeText(message)}`)
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  console.error('捕获到 Vite 预加载异常:', event)
  pushClientError({ message: '页面资源预加载失败', source: 'vite:preloadError' })
  toast.error('页面资源预加载失败，正在尝试恢复当前页面...')
  attemptRouteRecovery(getCurrentRouteLocation())
})

// Apply config from server if possible
const appStore = useAppStore()
appStore.fetchUIConfig()

app.mount('#app')
