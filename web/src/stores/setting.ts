import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface AutomationConfig {
  farm?: boolean
  farm_push?: boolean
  land_upgrade?: boolean
  friend?: boolean
  task?: boolean
  sell?: boolean
  fertilizer?: string
  fertilizer_buy?: boolean
  fertilizer_buy_limit?: number
  friend_steal?: boolean
  friend_help?: boolean
  friend_bad?: boolean
  open_server_gift?: boolean
}

export interface IntervalsConfig {
  farm?: number
  friend?: number
  farmMin?: number
  farmMax?: number
  friendMin?: number
  friendMax?: number
}

export interface FriendQuietHoursConfig {
  enabled?: boolean
  start?: string
  end?: string
}

export interface OfflineConfig {
  channel: string
  reloginUrlMode: string
  endpoint: string
  token: string
  title: string
  msg: string
  offlineDeleteSec: number
}

export interface TrialCardConfig {
  enabled?: boolean
  days?: number
  adminRenewEnabled?: boolean
  userRenewEnabled?: boolean
  maxAccounts?: number
  dailyLimit?: number
  cooldownMs?: number
}

export interface ThirdPartyApiConfig {
  wxApiKey?: string
  wxApiUrl?: string
  wxAppId?: string
}

export interface UIConfig {
  theme?: string
}

export interface WorkflowNodeConfig {
  id: string
  type: string
  params?: Record<string, any>
}

export interface WorkflowLaneConfig {
  enabled: boolean
  minInterval: number
  maxInterval: number
  nodes: WorkflowNodeConfig[]
}

export interface WorkflowConfig {
  farm: WorkflowLaneConfig
  friend: WorkflowLaneConfig
}

export interface TimingConfig {
  heartbeatIntervalMs: number
  rateLimitIntervalMs: number
  ghostingProbability: number
  ghostingCooldownMin: number
  ghostingMinMin: number
  ghostingMaxMin: number
  inviteRequestDelay: number
}

export interface TimingParameter {
  key: string
  label: string
  value: any
  group: string
}

export interface ClusterConfig {
  dispatcherStrategy: string
}

export interface SettingsState {
  plantingStrategy: string
  preferredSeedId: number
  intervals: IntervalsConfig
  friendQuietHours: FriendQuietHoursConfig
  automation: AutomationConfig
  ui: UIConfig
  offlineReminder: OfflineConfig
  trialConfig: TrialCardConfig
  thirdPartyApi: ThirdPartyApiConfig
  workflowConfig: WorkflowConfig
  timingConfig: TimingConfig
  defaultTimingConfig: TimingConfig
  readonlyTimingParams: TimingParameter[]
  clusterConfig: ClusterConfig
}

export const useSettingStore = defineStore('setting', () => {
  const settings = ref<SettingsState>({
    plantingStrategy: 'preferred',
    preferredSeedId: 0,
    intervals: {},
    friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
    automation: {},
    ui: {},
    offlineReminder: {
      channel: 'webhook',
      reloginUrlMode: 'none',
      endpoint: '',
      token: '',
      title: '账号下线提醒',
      msg: '账号下线',
      offlineDeleteSec: 120,
    },
    trialConfig: {
      enabled: true,
      days: 1,
      adminRenewEnabled: true,
      userRenewEnabled: false,
      maxAccounts: 1,
      dailyLimit: 50,
      cooldownMs: 4 * 60 * 60 * 1000,
    },
    thirdPartyApi: {
      wxApiKey: '',
      wxApiUrl: '',
      wxAppId: '',
    },
    workflowConfig: {
      farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] },
      friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] },
    },
    timingConfig: {
      heartbeatIntervalMs: 25000,
      rateLimitIntervalMs: 334,
      ghostingProbability: 0.02,
      ghostingCooldownMin: 240,
      ghostingMinMin: 5,
      ghostingMaxMin: 10,
      inviteRequestDelay: 2000,
    },
    defaultTimingConfig: {
      heartbeatIntervalMs: 25000,
      rateLimitIntervalMs: 334,
      ghostingProbability: 0.02,
      ghostingCooldownMin: 240,
      ghostingMinMin: 5,
      ghostingMaxMin: 10,
      inviteRequestDelay: 2000,
    },
    readonlyTimingParams: [],
    clusterConfig: {
      dispatcherStrategy: 'round_robin',
    },
  })
  const loading = ref(false)
  const timingLoading = ref(false)

  async function fetchSettings(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/settings', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok && data.data) {
        const d = data.data
        settings.value.plantingStrategy = d.strategy || 'preferred'
        settings.value.preferredSeedId = d.preferredSeed || 0
        settings.value.intervals = d.intervals || {}
        settings.value.friendQuietHours = d.friendQuietHours || { enabled: false, start: '23:00', end: '07:00' }
        settings.value.automation = d.automation || {}
        settings.value.ui = d.ui || {}
        // 蹲守配置挂到 settings 上层以便 StealSettings.vue 读取
        ; (settings.value as any).stakeoutSteal = d.stakeoutSteal || { enabled: false, delaySec: 3 }
        settings.value.workflowConfig = d.workflowConfig || { farm: { enabled: false, minInterval: 30, maxInterval: 120, nodes: [] }, friend: { enabled: false, minInterval: 60, maxInterval: 300, nodes: [] } }
        settings.value.offlineReminder = d.offlineReminder || {
          channel: 'webhook',
          reloginUrlMode: 'none',
          endpoint: '',
          token: '',
          title: '账号下线提醒',
          msg: '账号下线',
          offlineDeleteSec: 120,
        }
      }
    }
    finally {
      loading.value = false
    }
  }

  async function saveSettings(accountId: string, newSettings: any) {
    if (!accountId)
      return { ok: false, error: '未选择账号' }
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 saving 控制按钮加载态
    try {
      // 1. Save general settings
      const settingsPayload: Record<string, any> = {
        plantingStrategy: newSettings.plantingStrategy,
        preferredSeedId: newSettings.preferredSeedId,
        intervals: newSettings.intervals,
        friendQuietHours: newSettings.friendQuietHours,
      }
      // 蹲守配置透传
      // 工作流配置透传
      if (newSettings.workflowConfig) {
        settingsPayload.workflowConfig = newSettings.workflowConfig
      }
      if (newSettings.stakeoutSteal) {
        settingsPayload.stakeoutSteal = newSettings.stakeoutSteal
      }

      await api.post('/api/settings/save', settingsPayload, {
        headers: { 'x-account-id': accountId },
      })

      // 2. Save automation settings
      if (newSettings.automation) {
        await api.post('/api/automation', newSettings.automation, {
          headers: { 'x-account-id': accountId },
        })
      }

      // Refresh settings
      await fetchSettings(accountId)
      return { ok: true }
    }
    finally {
      // loading 未在此处修改，无需 finally 中重置
    }
  }

  async function saveOfflineConfig(config: OfflineConfig) {
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 offlineSaving 控制按钮加载态
    try {
      const { data } = await api.post('/api/settings/offline-reminder', config)
      if (data && data.ok) {
        settings.value.offlineReminder = config
        return { ok: true }
      }
      return { ok: false, error: '保存失败' }
    }
    finally {
      // loading 未在此处修改，无需 finally 中重置
    }
  }

  async function changeAdminPassword(oldPassword: string, newPassword: string) {
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 passwordSaving 控制按钮加载态
    const res = await api.post('/api/admin/change-password', { oldPassword, newPassword })
    return res.data
  }

  async function fetchTrialCardConfig() {
    try {
      const { data } = await api.get('/api/trial-card-config')
      if (data && data.ok && data.data) {
        settings.value.trialConfig = data.data
      }
      return data?.data
    }
    catch (e) {
      console.error('获取体验卡配置失败:', e)
    }
  }

  async function fetchThirdPartyApiConfig() {
    try {
      const { data } = await api.get('/api/admin/third-party-api')
      if (data && data.ok && data.data) {
        settings.value.thirdPartyApi = data.data
      }
      return data?.data
    }
    catch (e) {
      console.error('获取第三方 API 配置失败:', e)
    }
  }

  async function saveThirdPartyApiConfig(config: ThirdPartyApiConfig) {
    // 不设置 loading，避免整页切换导致闪烁；Settings.vue 已用 thirdPartyApiSaving 控制按钮加载态
    try {
      const { data } = await api.post('/api/admin/third-party-api', config)
      if (data && data.ok) {
        settings.value.thirdPartyApi = config
        return { ok: true }
      }
      return { ok: false, error: '保存失败' }
    }
    finally {
      // loading 未在此处修改，无需 finally 中重置
    }
  }

  async function fetchTimingConfig() {
    timingLoading.value = true
    try {
      const { data } = await api.get('/api/settings/timing-config')
      if (data && data.ok && data.data) {
        settings.value.timingConfig = data.data.config
        settings.value.defaultTimingConfig = data.data.defaults
        settings.value.readonlyTimingParams = data.data.readonlyParams || []
        return data.data
      }
    }
    catch (e) {
      console.error('获取时间参数配置失败:', e)
    }
    finally {
      timingLoading.value = false
    }
  }

  async function saveTimingConfig(config: TimingConfig) {
    try {
      const { data } = await api.post('/api/settings/timing-config', config)
      if (data && data.ok) {
        settings.value.timingConfig = data.data
        return { ok: true }
      }
      return { ok: false, error: data?.error || '保存失败' }
    }
    catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async function fetchClusterConfig() {
    try {
      const u = JSON.parse(localStorage.getItem('current_user') || 'null')
      if (u?.role !== 'admin')
        return

      const { data } = await api.get('/api/admin/cluster-config')
      if (data && data.ok && data.data) {
        settings.value.clusterConfig = data.data
      }
      return data?.data
    }
    catch (e) {
      console.error('获取集群调度配置失败:', e)
    }
  }

  async function saveClusterConfig(config: ClusterConfig) {
    try {
      const { data } = await api.post('/api/admin/cluster-config', config)
      if (data && data.ok) {
        settings.value.clusterConfig = config
        return { ok: true }
      }
      return { ok: false, error: '保存失败' }
    }
    catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  return { settings, loading, timingLoading, fetchSettings, saveSettings, saveOfflineConfig, changeAdminPassword, fetchTrialCardConfig, fetchThirdPartyApiConfig, saveThirdPartyApiConfig, fetchTimingConfig, saveTimingConfig, fetchClusterConfig, saveClusterConfig }
})
