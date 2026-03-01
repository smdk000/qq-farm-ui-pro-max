import { useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import api from '@/api'

const THEME_KEY = 'ui_theme'
type ThemeMode = 'light' | 'dark' | 'auto'

/**
 * 日出日落简易算法（基于太阳赤纬近似公式）
 * 精度约 ±10 分钟，足以满足主题切换需求
 * @param lat 纬度（度）
 * @param _lng 经度（度）
 * @param date 日期
 * @returns { sunrise, sunset } 时间戳（毫秒）
 */
function calcSunTimes(lat: number, _lng: number, date: Date) {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  )
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI

  // 太阳赤纬 (简化公式)
  const declination = -23.45 * Math.cos(toRad((360 / 365) * (dayOfYear + 10)))
  const decRad = toRad(declination)
  const latRad = toRad(lat)

  // 时角 (cos(ω) = -tan(lat) * tan(dec))
  const cosOmega = -Math.tan(latRad) * Math.tan(decRad)

  // 极昼/极夜处理
  if (cosOmega < -1) {
    // 极昼：全天白天
    return { sunrise: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0).getTime(), sunset: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59).getTime() }
  }
  if (cosOmega > 1) {
    // 极夜：全天黑夜
    return { sunrise: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0).getTime(), sunset: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0).getTime() }
  }

  const omegaDeg = toDeg(Math.acos(cosOmega))
  const noonHour = 12 // 使用当地时间简化，不做经度校正（误差可接受）
  const daylightHalf = omegaDeg / 15 // 每小时15度

  const sunriseHour = noonHour - daylightHalf
  const sunsetHour = noonHour + daylightHalf

  const toMs = (hour: number) => {
    const h = Math.floor(hour)
    const m = Math.round((hour - h) * 60)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime()
  }

  return { sunrise: toMs(sunriseHour), sunset: toMs(sunsetHour) }
}

/**
 * 根据当前时间和地理位置判断是否应该用深色模式
 */
function shouldBeDark(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) {
    // 无法获取位置，回退到系统偏好
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  const now = new Date()
  const { sunrise, sunset } = calcSunTimes(lat, lng, now)
  const nowMs = now.getTime()
  // 日落后或日出前 → 深色
  return nowMs < sunrise || nowMs >= sunset
}

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(false)

  // 主题模式：light / dark / auto
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark'
  const themeMode = ref<ThemeMode>(
    (['light', 'dark', 'auto'].includes(savedTheme) ? savedTheme : 'dark') as ThemeMode,
  )

  // 颜色主题 (默认 green)
  const colorTheme = useStorage('app_color_theme', 'default')

  // 极简性能模式 (默认开启，解决低端机核显与Chrome引擎的严重闪烁拖影)
  const performanceMode = useStorage('app_performance_mode', true)

  // 地理位置缓存
  const geoLat = ref<number | null>(null)
  const geoLng = ref<number | null>(null)

  // auto 模式下的实时计算结果
  const autoIsDark = ref(shouldBeDark(null, null))

  // 登录页背景图
  const loginBackground = ref(localStorage.getItem('login_background') || '')

  // 最终的深色状态（对外暴露）
  const isDark = computed(() => {
    if (themeMode.value === 'auto')
      return autoIsDark.value
    return themeMode.value === 'dark'
  })

  // 定时器
  let autoTimer: ReturnType<typeof setInterval> | null = null

  function updateAutoTheme() {
    autoIsDark.value = shouldBeDark(geoLat.value, geoLng.value)
  }

  function startAutoTimer() {
    stopAutoTimer()
    updateAutoTheme()
    // 每 60 秒检查一次
    autoTimer = setInterval(updateAutoTheme, 60_000)
  }

  function stopAutoTimer() {
    if (autoTimer) {
      clearInterval(autoTimer)
      autoTimer = null
    }
  }

  /**
   * 尝试获取用户地理位置（用于日出日落计算）
   */
  function requestGeoLocation() {
    if (!navigator.geolocation)
      return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoLat.value = pos.coords.latitude
        geoLng.value = pos.coords.longitude
        // 获取到位置后立即刷新
        if (themeMode.value === 'auto')
          updateAutoTheme()
      },
      () => {
        // 用户拒绝或不可用，保持使用系统偏好
      },
      { timeout: 5000, maximumAge: 3600_000 },
    )
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  async function fetchUIConfig() {
    try {
      const res = await api.get('/api/ui-config')
      if (res.data.ok && res.data.data) {
        const { theme, loginBackground: bg, colorTheme: ct, performanceMode: pm } = res.data.data
        if (['light', 'dark', 'auto'].includes(theme)) {
          themeMode.value = theme
          localStorage.setItem(THEME_KEY, theme)
        }
        if (bg !== undefined) {
          loginBackground.value = bg
          localStorage.setItem('login_background', bg)
        }
        if (ct !== undefined) {
          colorTheme.value = ct
        }
        if (pm !== undefined) {
          performanceMode.value = !!pm
        }
      }
    }
    catch {
      // 失败则保留当前值
    }
  }

  async function setUIConfig(config: { theme?: ThemeMode, loginBackground?: string, colorTheme?: string, performanceMode?: boolean }) {
    try {
      await api.post('/api/settings/theme', config)
      if (config.theme) {
        themeMode.value = config.theme
        localStorage.setItem(THEME_KEY, config.theme)
      }
      if (config.loginBackground !== undefined) {
        loginBackground.value = config.loginBackground
        localStorage.setItem('login_background', config.loginBackground)
      }
      if (config.colorTheme !== undefined) {
        colorTheme.value = config.colorTheme
      }
      if (config.performanceMode !== undefined) {
        performanceMode.value = config.performanceMode
      }
    }
    catch (e) {
      console.error('设置 UI 配置失败:', e)
      throw e
    }
  }

  /**
   * 三态循环切换：light → dark → auto → light
   */
  function toggleDark() {
    const cycle: ThemeMode[] = ['light', 'dark', 'auto']
    const idx = cycle.indexOf(themeMode.value)
    const next = cycle[(idx + 1) % cycle.length]!
    setUIConfig({ theme: next })
  }

  // 监听主题模式变化 → 管理定时器和 DOM class
  watch(themeMode, (mode) => {
    if (mode === 'auto') {
      requestGeoLocation()
      startAutoTimer()
    }
    else {
      stopAutoTimer()
    }
  }, { immediate: true })

  // 监听最终深色状态 → 切换 DOM class
  watch(isDark, (val) => {
    if (val)
      document.documentElement.classList.add('dark')
    else
      document.documentElement.classList.remove('dark')
  }, { immediate: true })

  // 监听颜色主题状态 → 切换 DOM class
  watch(colorTheme, (val, oldVal) => {
    if (oldVal && oldVal !== 'default') {
      document.documentElement.classList.remove(`theme-${oldVal}`)
    }
    if (val && val !== 'default') {
      document.documentElement.classList.add(`theme-${val}`)
    }
  }, { immediate: true })

  // 监听性能模式状态 → 切换 HTML class 屏蔽毛玻璃
  watch(performanceMode, (val) => {
    if (val) {
      document.documentElement.classList.add('low-performance-mode')
    }
    else {
      document.documentElement.classList.remove('low-performance-mode')
    }
  }, { immediate: true })

  // 为未来 ECharts 等 Canvas 图表提供响应式色彩画板 (Theme Palette)
  const themeChartPalette = computed(() => {
    const palettes: Record<string, string[]> = {
      default: ['#22c55e', '#16a34a', '#15803d', '#10b981', '#059669'],
      cyber: ['#8b5cf6', '#7c3aed', '#6d28d9', '#a855f7', '#9333ea'],
      elegant: ['#eab308', '#ca8a04', '#a16207', '#f59e0b', '#d97706'],
      ocean: ['#0ea5e9', '#0284c7', '#0369a1', '#3b82f6', '#2563eb'],
      sakura: ['#ffc0cb', '#f472b6', '#db2777', '#f43f5e', '#be123c'],
    }
    return palettes[colorTheme.value] || palettes.default
  })

  // 监听系统偏好变化（auto 模式下无地理位置时使用）
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode.value === 'auto' && geoLat.value === null)
        updateAutoTheme()
    })
  }

  return {
    sidebarOpen,
    isDark,
    themeMode,
    colorTheme,
    performanceMode,
    themeChartPalette,
    loginBackground,
    toggleDark,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    fetchUIConfig,
    setUIConfig,
  }
})
