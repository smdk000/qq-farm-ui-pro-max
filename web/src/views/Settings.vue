/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import api from '@/api' // Apply config from server if possible
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useFarmStore } from '@/stores/farm'
import { useFriendStore } from '@/stores/friend'
import { useSettingStore } from '@/stores/setting'

const settingStore = useSettingStore()
const appStore = useAppStore()
appStore.fetchUIConfig()
const accountStore = useAccountStore()
const farmStore = useFarmStore()
const friendStore = useFriendStore()

const { settings, loading } = storeToRefs(settingStore)
const { currentAccountId, accounts } = storeToRefs(accountStore)
const { seeds } = storeToRefs(farmStore)
const { friends } = storeToRefs(friendStore)

const saving = ref(false)
const passwordSaving = ref(false)
const offlineSaving = ref(false)
const trialSaving = ref(false)

// ============ 体验卡配置（仅管理员） ============
const isAdmin = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('current_user') || 'null')
    return u?.role === 'admin'
  }
  catch { return false }
})

const trialConfig = ref({
  enabled: true,
  days: 1,
  dailyLimit: 50,
  cooldownMs: 14400000,
  adminRenewEnabled: true,
  userRenewEnabled: false,
  maxAccounts: 1,
})

const trialDaysOptions = [
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '永久', value: 0 },
]

const trialCooldownOptions = [
  { label: '1 小时', value: 3600000 },
  { label: '2 小时', value: 7200000 },
  { label: '4 小时', value: 14400000 },
  { label: '8 小时', value: 28800000 },
]

async function loadTrialConfig() {
  if (!isAdmin.value)
    return
  try {
    const res = await api.get('/api/trial-card-config')
    if (res.data.ok && res.data.data) {
      trialConfig.value = { ...trialConfig.value, ...res.data.data }
    }
  }
  catch { /* 静默 */ }
}

async function saveTrialConfig() {
  trialSaving.value = true
  try {
    const res = await api.post('/api/trial-card-config', trialConfig.value)
    if (res.data.ok) {
      showAlert('体验卡配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.data.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    trialSaving.value = false
  }
}

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

const currentAccountName = computed(() => {
  const acc = accounts.value.find((a: any) => a.id === currentAccountId.value)
  return acc ? (acc.name || acc.nick || acc.id) : null
})

const localSettings = ref({
  plantingStrategy: 'preferred',
  preferredSeedId: 0,
  intervals: { farmMin: 2, farmMax: 2, friendMin: 10, friendMax: 10 },
  friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
  automation: {
    farm: false,
    task: false,
    sell: false,
    friend: false,
    farm_push: false,
    land_upgrade: false,
    friend_steal: false,
    friend_help: false,
    friend_bad: false,
    friend_help_exp_limit: false,
    email: false,
    fertilizer_gift: false,
    fertilizer_buy: false,
    free_gifts: false,
    share_reward: false,
    vip_gift: false,
    month_card: false,
    open_server_gift: false,
    fertilizer: 'none',
    // 偷菜过滤
    stealFilterEnabled: false,
    stealFilterMode: 'blacklist',
    stealFilterPlantIds: [] as number[],
    // 偷好友过滤
    stealFriendFilterEnabled: false,
    stealFriendFilterMode: 'blacklist',
    stealFriendFilterIds: [] as number[],
    friend_auto_accept: false,
    fertilizer_60s_anti_steal: false,
  },
})

const localOffline = ref({
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '',
  msg: '',
  offlineDeleteSec: 120,
})

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})

function syncLocalSettings() {
  if (settings.value) {
    localSettings.value = JSON.parse(JSON.stringify({
      plantingStrategy: settings.value.plantingStrategy,
      preferredSeedId: settings.value.preferredSeedId,
      intervals: settings.value.intervals,
      friendQuietHours: settings.value.friendQuietHours,
      automation: settings.value.automation,
    }))

    // Default automation values if missing
    if (!localSettings.value.automation) {
      localSettings.value.automation = {
        farm: false,
        task: false,
        sell: false,
        friend: false,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        email: false,
        fertilizer_gift: false,
        fertilizer_buy: false,
        free_gifts: false,
        share_reward: false,
        vip_gift: false,
        month_card: false,
        open_server_gift: false,
        fertilizer: 'none',
        // 偷菜过滤
        stealFilterEnabled: false,
        stealFilterMode: 'blacklist',
        stealFilterPlantIds: [] as number[],
        // 偷好友过滤
        stealFriendFilterEnabled: false,
        stealFriendFilterMode: 'blacklist',
        stealFriendFilterIds: [] as number[],
        friend_auto_accept: false,
        fertilizer_60s_anti_steal: false,
      }
    }
    else {
      // Merge with defaults to ensure all keys exist
      const defaults = {
        farm: false,
        task: false,
        sell: false,
        friend: false,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        email: false,
        fertilizer_gift: false,
        fertilizer_buy: false,
        free_gifts: false,
        share_reward: false,
        vip_gift: false,
        month_card: false,
        open_server_gift: false,
        fertilizer: 'none',
        // 偷菜过滤
        stealFilterEnabled: false,
        stealFilterMode: 'blacklist',
        stealFilterPlantIds: [] as number[],
        // 偷好友过滤
        stealFriendFilterEnabled: false,
        stealFriendFilterMode: 'blacklist',
        stealFriendFilterIds: [] as number[],
        friend_auto_accept: false,
        fertilizer_60s_anti_steal: false,
      }
      localSettings.value.automation = {
        ...defaults,
        ...localSettings.value.automation,
      }
    }

    // Sync offline settings (global)
    if (settings.value.offlineReminder) {
      localOffline.value = JSON.parse(JSON.stringify(settings.value.offlineReminder))
    }
  }
}

// 策略预设应用函数
function applyPreset(type: 'conservative' | 'balanced' | 'aggressive') {
  if (!window.window.confirm('应用预设将覆盖当前页面的配置（不会改变过滤名单），应用后请点击“保存”以生效。是否继续？')) {
    return
  }

  // 基础共用配置 (3 种模板共同开启项)
  const baseAutomation = {
    farm: true,
    task: true,
    sell: true,
    friend: true,
    farm_push: true,
    email: true,
    free_gifts: true,
    share_reward: true,
    vip_gift: true,
    month_card: true,
    open_server_gift: true,
    fertilizer_gift: true,
    fertilizer_buy: true,
    friend_steal: true,
    friend_help: true,
    friend_help_exp_limit: true,
  }

  if (type === 'conservative') {
    localSettings.value.intervals = { farmMin: 300, farmMax: 600, friendMin: 900, friendMax: 1200 }
    localSettings.value.friendQuietHours = { enabled: true, start: '23:00', end: '07:00' }
    localSettings.value.automation = {
      ...localSettings.value.automation,
      ...baseAutomation,
      fertilizer: 'normal',
      friend_bad: false,
      stealFilterEnabled: false,
      stealFriendFilterEnabled: false,
    }
    showAlert('已应用【保守配置】：最高安全性，建议主号使用。', 'primary')
  }
  else if (type === 'balanced') {
    localSettings.value.intervals = { farmMin: 180, farmMax: 300, friendMin: 600, friendMax: 900 }
    localSettings.value.friendQuietHours = { enabled: true, start: '23:00', end: '07:00' }
    localSettings.value.automation = {
      ...localSettings.value.automation,
      ...baseAutomation,
      fertilizer: 'both',
      friend_bad: false,
      stealFilterEnabled: true,
      stealFilterMode: 'blacklist',
      stealFriendFilterEnabled: true,
      stealFriendFilterMode: 'blacklist',
    }
    showAlert('已应用【平衡配置】：兼顾收益与安全，强烈推荐！', 'primary')
  }
  else if (type === 'aggressive') {
    localSettings.value.intervals = { farmMin: 120, farmMax: 180, friendMin: 300, friendMax: 600 }
    localSettings.value.friendQuietHours = { enabled: true, start: '00:00', end: '06:00' }
    localSettings.value.automation = {
      ...localSettings.value.automation,
      ...baseAutomation,
      fertilizer: 'both',
      friend_bad: true,
      stealFilterEnabled: true,
      stealFilterMode: 'whitelist',
      stealFriendFilterEnabled: true,
      stealFriendFilterMode: 'whitelist',
    }
    showAlert('已应用【激进配置】：极大提升收益，但也有极高风险，请谨慎点击保存。', 'primary')
  }
}

async function loadData() {
  if (currentAccountId.value) {
    await settingStore.fetchSettings(currentAccountId.value)
    syncLocalSettings()
    // Always fetch seeds to ensure correct locked status for current account
    await farmStore.fetchSeeds(currentAccountId.value)
    // 好友过滤已开启时自动拉取好友列表
    if (localSettings.value.automation.stealFriendFilterEnabled && friends.value.length === 0) {
      friendStore.fetchFriends(currentAccountId.value)
    }
  }
  // 管理员加载体验卡配置
  loadTrialConfig()
}

onMounted(() => {
  loadData()
})

watch(currentAccountId, () => {
  loadData()
})

// 好友过滤开关切换时自动加载好友列表
watch(() => localSettings.value.automation.stealFriendFilterEnabled, (enabled) => {
  if (enabled && currentAccountId.value && friends.value.length === 0) {
    friendStore.fetchFriends(currentAccountId.value)
  }
})

const fertilizerOptions = [
  { label: '普通 + 有机', value: 'both' },
  { label: '仅普通化肥', value: 'normal' },
  { label: '仅有机化肥', value: 'organic' },
  { label: '不施肥', value: 'none' },
]

const plantingStrategyOptions = [
  { label: '优先种植种子', value: 'preferred' },
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
]

const channelOptions = [
  { label: 'Webhook(自定义接口)', value: 'webhook' },
  { label: 'Qmsg 酱', value: 'qmsg' },
  { label: 'Server 酱', value: 'serverchan' },
  { label: 'Push Plus', value: 'pushplus' },
  { label: 'Push Plus Hxtrip', value: 'pushplushxtrip' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '企业微信', value: 'wecom' },
  { label: 'Bark', value: 'bark' },
  { label: 'Go-cqhttp', value: 'gocqhttp' },
  { label: 'OneBot', value: 'onebot' },
  { label: 'Atri', value: 'atri' },
  { label: 'PushDeer', value: 'pushdeer' },
  { label: 'iGot', value: 'igot' },
  { label: 'Telegram', value: 'telegram' },
  { label: '飞书', value: 'feishu' },
  { label: 'IFTTT', value: 'ifttt' },
  { label: '企业微信群机器人', value: 'wecombot' },
  { label: 'Discord', value: 'discord' },
  { label: 'WxPusher', value: 'wxpusher' },
]

const reloginUrlModeOptions = [
  { label: '不需要', value: 'none' },
  { label: 'QQ直链', value: 'qq_link' },
  { label: '二维码链接', value: 'qr_link' },
]

// 推送渠道官方文档链接
const CHANNEL_DOCS: Record<string, string> = {
  webhook: '',
  qmsg: 'https://qmsg.zendee.cn',
  serverchan: 'https://sct.ftqq.com',
  pushplus: 'https://www.pushplus.plus',
  pushplushxtrip: 'https://pushplus.hxtrip.com',
  dingtalk: 'https://open.dingtalk.com/document/robots/custom-robot-access',
  wecom: 'https://developer.work.weixin.qq.com/document/path/90236',
  bark: 'https://bark.day.app',
  gocqhttp: 'https://docs.go-cqhttp.org',
  onebot: 'https://onebot.dev',
  atri: '',
  pushdeer: 'https://pushdeer.com',
  igot: 'https://igot.getui.com',
  telegram: 'https://core.telegram.org/bots/api',
  feishu: 'https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot',
  ifttt: 'https://ifttt.com',
  wecombot: 'https://developer.work.weixin.qq.com/document/path/91770',
  discord: 'https://discord.com/developers/docs/resources/webhook',
  wxpusher: 'https://wxpusher.zjiecode.com',
}

const channelDocUrl = computed(() => {
  return CHANNEL_DOCS[localOffline.value.channel] || ''
})

const preferredSeedOptions = computed(() => {
  const options = [{ label: '自动选择', value: 0 }]
  if (seeds.value) {
    options.push(...seeds.value.map(seed => ({
      label: `${seed.requiredLevel}级 ${seed.name} (${seed.price}金)`,
      value: seed.seedId,
      disabled: seed.locked || seed.soldOut,
    })))
  }
  return options
})

const analyticsSortByMap: Record<string, string> = {
  max_exp: 'exp',
  max_fert_exp: 'fert',
  max_profit: 'profit',
  max_fert_profit: 'fert_profit',
}

const strategyPreviewLabel = ref<string | null>(null)

watchEffect(async () => {
  const strategy = localSettings.value.plantingStrategy
  if (strategy === 'preferred') {
    strategyPreviewLabel.value = null
    return
  }
  if (!seeds.value || seeds.value.length === 0) {
    strategyPreviewLabel.value = null
    return
  }
  const available = seeds.value.filter(s => !s.locked && !s.soldOut)
  if (available.length === 0) {
    strategyPreviewLabel.value = '暂无可用种子'
    return
  }
  if (strategy === 'level') {
    const best = [...available].sort((a, b) => b.requiredLevel - a.requiredLevel)[0]
    strategyPreviewLabel.value = best ? `${best.requiredLevel}级 ${best.name}` : null
    return
  }
  const sortBy = analyticsSortByMap[strategy]
  if (sortBy) {
    try {
      const res = await api.get(`/api/analytics?sort=${sortBy}`)
      const rankings: any[] = res.data.ok ? (res.data.data || []) : []
      const availableIds = new Set(available.map(s => s.seedId))
      const match = rankings.find(r => availableIds.has(Number(r.seedId)))
      if (match) {
        const seed = available.find(s => s.seedId === Number(match.seedId))
        strategyPreviewLabel.value = seed ? `${seed.requiredLevel}级 ${seed.name}` : null
      }
      else {
        strategyPreviewLabel.value = '暂无匹配种子'
      }
    }
    catch {
      strategyPreviewLabel.value = null
    }
  }
})

const diffModalVisible = ref(false)
const diffItems = ref<{ label: string, from: string, to: string }[]>([])

// 翻译映射
const fieldLabels: Record<string, string> = {
  farm: '自动种植收获',
  task: '自动完成任务',
  sell: '自动卖果实',
  friend: '自动好友互动',
  farm_push: '推送触发巡田',
  land_upgrade: '自动升级土地',
  friend_steal: '自动偷菜',
  friend_help: '自动帮忙',
  friend_bad: '自动捣乱',
  friend_auto_accept: '自动同意好友',
  friend_help_exp_limit: '经验上限停止帮忙',
  email: '自动领取邮件',
  fertilizer_gift: '自动填充化肥',
  fertilizer_buy: '自动购买化肥',
  fertilizer_60s_anti_steal: '60秒施肥(防偷)',
  free_gifts: '自动商城礼包',
  share_reward: '自动分享奖励',
  vip_gift: '自动VIP礼包',
  month_card: '自动月卡奖励',
  open_server_gift: '自动开服红包',
  fertilizer: '施肥策略',
  plantingStrategy: '种植策略',
  preferredSeedId: '优先种植种子',
}

function getValLabel(field: string, val: any) {
  if (typeof val === 'boolean')
    return val ? '开启' : '关闭'
  if (field === 'fertilizer') {
    return fertilizerOptions.find(o => o.value === val)?.label || val
  }
  if (field === 'plantingStrategy') {
    return plantingStrategyOptions.find(o => o.value === val)?.label || val
  }
  if (field === 'preferredSeedId') {
    return preferredSeedOptions.value.find(o => o.value === val)?.label || val
  }
  return String(val)
}

async function saveAccountSettings(force: any = false) {
  if (!currentAccountId.value)
    return
  const isForce = force === true

  // 计算差异 (排除列表类字段，仅对比基础开关和策略)
  if (!isForce && settings.value) {
    const changes: any[] = []
    const oldAuto = settings.value.automation || {}
    const newAuto = localSettings.value.automation || {}

    // 对比基础策略
    ;['plantingStrategy', 'preferredSeedId'].forEach((key) => {
      const oldVal = (settings.value as any)[key]
      const newVal = (localSettings.value as any)[key]
      if (oldVal !== newVal) {
        changes.push({ label: fieldLabels[key], from: getValLabel(key, oldVal), to: getValLabel(key, newVal) })
      }
    })

    // 对比状态
    Object.keys(fieldLabels).forEach((key) => {
      const oldAutoVal = (oldAuto as any)[key]
      const newAutoVal = (newAuto as any)[key]
      if (newAutoVal !== undefined) {
        if (oldAutoVal !== newAutoVal) {
          changes.push({ label: fieldLabels[key], from: getValLabel(key, oldAutoVal), to: getValLabel(key, newAutoVal) })
        }
      }
    })

    if (changes.length > 0) {
      diffItems.value = changes
      diffModalVisible.value = true
      return
    }
  }

  diffModalVisible.value = false
  saving.value = true
  try {
    const res = await settingStore.saveSettings(currentAccountId.value, localSettings.value)
    if (res.ok) {
      showAlert('账号设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    saving.value = false
  }
}

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    showAlert('请填写完整', 'danger')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showAlert('两次密码输入不一致', 'danger')
    return
  }
  if (passwordForm.value.new.length < 4) {
    showAlert('密码长度至少4位', 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await settingStore.changeAdminPassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert('密码修改成功')
      passwordForm.value = { old: '', new: '', confirm: '' }
    }
    else {
      showAlert(`修改失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig(localOffline.value)

    if (res.ok) {
      showAlert('下线提醒设置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    offlineSaving.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div v-if="loading" class="glass-text-muted py-4 text-center">
      <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
      <p>加载中...</p>
    </div>

    <div v-else class="grid grid-cols-1 mt-12 gap-4 text-sm lg:grid-cols-2">
      <!-- Card 1: Strategy & Automation -->
      <div v-if="currentAccountId" class="card glass-panel h-full flex flex-col rounded-lg shadow">
        <!-- Strategy Header -->
        <div class="flex flex-col justify-between gap-3 border-b border-white/20 bg-transparent px-4 py-3 md:flex-row md:items-center dark:border-white/10">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-fas-cogs" />
            策略设置
            <span v-if="currentAccountName" class="glass-text-muted text-sm font-normal">
              ({{ currentAccountName }})
            </span>
          </h3>
          <!-- 预设配置快捷组 -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="glass-text-muted mr-1 hidden text-xs lg:inline-block">预设:</span>
            <button
              class="flex items-center gap-1 border border-primary-200 rounded-md bg-primary-50 px-2 py-1 text-xs text-primary-700 font-semibold transition dark:border-primary-800/50 dark:bg-primary-900/20 hover:bg-primary-100 dark:text-primary-400 dark:hover:bg-primary-900/40"
              title="安全优先，最像真人"
              @click="applyPreset('conservative')"
            >
              <div class="i-carbon-security" /> 保守
            </button>
            <button
              class="flex items-center gap-1 border border-blue-200 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 font-semibold transition dark:border-blue-800/50 dark:bg-blue-900/20 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40"
              title="推荐配置，收益与安全并重"
              @click="applyPreset('balanced')"
            >
              <div class="i-carbon-balance" /> 平衡
            </button>
            <button
              class="flex items-center gap-1 border border-orange-200 rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700 font-semibold transition dark:border-orange-800/50 dark:bg-orange-900/20 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/40"
              title="收益优先，适合小号跑图"
              @click="applyPreset('aggressive')"
            >
              <div class="i-carbon-rocket" /> 激进
            </button>

            <div class="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" />

            <BaseButton
              variant="primary"
              size="sm"
              :loading="saving"
              class="flex items-center gap-1 text-xs !h-auto !px-3 !py-1"
              @click="saveAccountSettings"
            >
              <div class="i-carbon-save" /> 快速保存
            </BaseButton>
          </div>
        </div>

        <!-- Strategy Content -->
        <div class="p-4 space-y-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BaseSelect
              v-model="localSettings.plantingStrategy"
              label="种植策略"
              :options="plantingStrategyOptions"
            />
            <BaseSelect
              v-if="localSettings.plantingStrategy === 'preferred'"
              v-model="localSettings.preferredSeedId"
              label="优先种植种子"
              :options="preferredSeedOptions"
            />
            <div v-else class="flex flex-col gap-1">
              <span class="glass-text-muted text-xs">策略选种预览</span>
              <div class="h-9 flex items-center border border-gray-200 rounded-md bg-gray-50/80 px-3 text-sm text-blue-600 font-bold dark:border-gray-600 dark:bg-gray-700/50 dark:text-blue-400">
                <div class="i-carbon-checkmark-filled mr-1.5 text-primary-500" />
                {{ strategyPreviewLabel ?? '加载中...' }}
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BaseInput
              v-model.number="localSettings.intervals.farmMin"
              label="农场巡查最小 (秒)"
              type="number"
              min="1"
            />
            <BaseInput
              v-model.number="localSettings.intervals.farmMax"
              label="农场巡查最大 (秒)"
              type="number"
              min="1"
            />
            <BaseInput
              v-model.number="localSettings.intervals.friendMin"
              label="好友巡查最小 (秒)"
              type="number"
              min="1"
            />
            <BaseInput
              v-model.number="localSettings.intervals.friendMax"
              label="好友巡查最大 (秒)"
              type="number"
              min="1"
            />
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-4 border-t pt-3 dark:border-gray-700">
            <BaseSwitch
              v-model="localSettings.friendQuietHours.enabled"
              label="启用静默时段"
            />
            <div class="flex items-center gap-2">
              <BaseInput
                v-model="localSettings.friendQuietHours.start"
                type="time"
                class="w-24"
                :disabled="!localSettings.friendQuietHours.enabled"
              />
              <span class="glass-text-muted">-</span>
              <BaseInput
                v-model="localSettings.friendQuietHours.end"
                type="time"
                class="w-24"
                :disabled="!localSettings.friendQuietHours.enabled"
              />
            </div>
          </div>
        </div>

        <!-- Auto Control Header -->
        <div class="border-b border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-fas-toggle-on" />
            自动控制
          </h3>
        </div>

        <!-- Auto Control Content -->
        <div class="flex-1 p-6 space-y-8">
          <!-- 分组网格 -->
          <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 md:grid-cols-2">
            <!-- 分组 1: 农场基础操作 -->
            <div class="border border-gray-100/50 rounded-2xl bg-transparent p-5 transition-all dark:border-gray-700/50 hover:bg-gray-50/10">
              <h4 class="glass-text-muted mb-4 flex items-center gap-2 text-xs font-bold tracking-widest uppercase" title="农场自动化的核心控制区，包含种植收获、好友互动、升级土地等基础功能">
                <div class="i-carbon-Agriculture" /> 农场基础操作
              </h4>
              <div class="space-y-4">
                <BaseSwitch v-model="localSettings.automation.farm" label="自动种植收获" hint="核心总开关。自动巡查农场：成熟即收、空地即种、异常即处理（浇水/除草/除虫/铲除枯死）。关闭后所有农场自动化停止。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.friend" label="自动好友互动" hint="好友巡查总开关。开启后按下方子策略遍历好友农场执行操作（偷菜/帮忙/捣乱）。关闭则所有好友互动停止。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.land_upgrade" label="自动升级土地" hint="金币充足且满足条件时自动升级土地等级，可提高产量。升级花费较大，金币紧张时建议关闭。" recommend="conditional" />
                <BaseSwitch v-model="localSettings.automation.sell" label="自动卖果实" hint="收获后自动将仓库中的果实出售换取金币。关闭则果实堆积在仓库不处理。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.farm_push" label="推送触发巡田" hint="收到外部事件（如消息推送）时立即触发一次农场巡查，而非等待定时轮询，提高响应灵敏度。" recommend="on" />
              </div>
            </div>

            <!-- 分组 2: 每日收益领取 -->
            <div class="border border-gray-100/50 rounded-2xl bg-transparent p-5 transition-all dark:border-gray-700/50 hover:bg-gray-50/10">
              <h4 class="glass-text-muted mb-4 flex items-center gap-2 text-xs font-bold tracking-widest uppercase" title="每日可领取的免费奖励，建议全部开启以最大化日常收益">
                <div class="i-carbon-gift" /> 每日收益领取
              </h4>
              <div class="space-y-4">
                <BaseSwitch v-model="localSettings.automation.free_gifts" label="自动商城礼包" hint="每日自动领取商城中的免费礼包（种子/化肥/装饰等），错过后次日才能再领。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.task" label="自动完成任务" hint="自动完成每日任务并领取奖励（金币/经验/道具），是经验和金币的重要来源。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.share_reward" label="自动分享奖励" hint="自动触发分享操作并领取分享奖励，某些活动需分享才能获取额外收益。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.email" label="自动领取邮件" hint="自动领取系统邮件中的附件奖励（活动奖励/补偿/系统礼品等）。" recommend="on" />
                <div class="grid grid-cols-1 gap-4 pt-1">
                  <BaseSwitch v-model="localSettings.automation.vip_gift" label="自动VIP礼包" hint="VIP 用户专属，自动领取每日 VIP 礼包。非 VIP 用户开启无效但不会报错。" recommend="conditional" />
                  <BaseSwitch v-model="localSettings.automation.month_card" label="自动月卡奖励" hint="月卡用户专属，自动领取月卡每日奖励。无月卡开启无效但不会报错。" recommend="conditional" />
                  <BaseSwitch v-model="localSettings.automation.open_server_gift" label="自动开服红包" hint="自动领取开服活动红包奖励。活动期间有效，非活动期开启无影响。" recommend="on" />
                </div>
              </div>
            </div>

            <!-- 分组 3: 化肥与杂项控制 -->
            <div class="border border-gray-100/50 rounded-2xl bg-transparent p-5 transition-all dark:border-gray-700/50 hover:bg-gray-50/10">
              <h4 class="glass-text-muted mb-4 flex items-center gap-2 text-xs font-bold tracking-widest uppercase" title="化肥管理和高级防盗功能的精细控制区">
                <div class="i-carbon-tool-box" /> 化肥与精细控制
              </h4>
              <div class="space-y-4">
                <BaseSwitch v-model="localSettings.automation.fertilizer_gift" label="自动填充化肥" hint="有免费化肥领取机会时自动领取，保证化肥库存不断档。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.fertilizer_buy" label="自动购买化肥" hint="化肥库存不足时自动花费金币购买。注意：会持续消耗金币，金币紧张时建议关闭。" recommend="conditional" />
                <BaseSwitch v-model="localSettings.automation.fertilizer_60s_anti_steal" label="60秒施肥(防偷)" hint="核心防盗功能。在果实成熟前60秒内自动施肥催熟并瞬间收获，将被偷窗口压缩到接近0。需消耗化肥，主号必开。" recommend="on" />
                <div class="border-t pt-2 dark:border-gray-700/50">
                  <BaseSelect
                    v-model="localSettings.automation.fertilizer"
                    label="内容选择：施肥策略"
                    class="!w-full"
                    :options="fertilizerOptions"
                    title="种植后自动施肥的方式。普通肥加速生长、有机肥改善土壤（可循环施直到耗尽）、两者兼用效果最佳。推荐：普通+有机"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 好友互动详细控制 (当启用好友互动时显现) -->
          <div v-if="localSettings.automation.friend" class="border border-blue-100/50 rounded-2xl bg-blue-50/50 p-5 dark:border-blue-800/30 dark:bg-blue-900/10">
            <h4 class="mb-4 flex items-center gap-2 text-xs text-blue-500 font-bold tracking-widest uppercase">
              <div class="i-carbon-user-multiple" /> 社交互动详细策略
            </h4>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-4 md:grid-cols-2">
              <BaseSwitch v-model="localSettings.automation.friend_steal" label="自动偷菜" hint="访问好友农场时自动偷取成熟果实，是金币收入的重要补充来源。" recommend="on" />
              <BaseSwitch v-model="localSettings.automation.friend_help" label="自动帮忙" hint="访问好友农场时自动帮忙浇水/除草/除虫，可获得经验奖励。" recommend="on" />
              <BaseSwitch v-model="localSettings.automation.friend_bad" label="自动捣乱" hint="访问好友农场时自动放虫/放草。有社交风险，好友可能拉黑你，小号专用。" recommend="off" />
              <BaseSwitch v-model="localSettings.automation.friend_auto_accept" label="自动同意好友" hint="自动同意所有好友申请。好友越多偷菜机会越多，但也增加被偷风险。" recommend="conditional" />
              <BaseSwitch v-model="localSettings.automation.friend_help_exp_limit" label="经验上限停止帮忙" hint="当日帮忙经验达到系统上限后自动停止，避免做无用功浪费请求配额。" recommend="on" />
            </div>
          </div>

          <!-- 偷菜与好友过滤 (已迁移) -->
          <div class="border-2 border-primary-200 rounded-2xl border-dashed bg-primary-50/50 p-6 text-center dark:border-primary-800/30 dark:bg-primary-900/10">
            <div class="mx-auto mb-3 h-12 w-12 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-800/50">
              <div class="i-carbon-sprout text-2xl text-primary-600 dark:text-primary-400" />
            </div>
            <h4 class="glass-text-main text-sm font-bold">
              偷菜白名单与作物过滤已迁移
            </h4>
            <p class="glass-text-muted dark:glass-text-muted mx-auto mt-2 max-w-md text-xs">
              为了提供更加流畅与精细的控制体验，我们设计了全新的独立管理面板。包含可视化图标、等级检视以及便捷的模糊搜索。
            </p>
            <BaseButton
              to="/steal-settings"
              variant="success"
              class="mt-4"
            >
              前往偷菜控制台 <div class="i-carbon-arrow-right ml-2" />
            </BaseButton>
          </div>
        </div>

        <!-- Save Button -->
        <div class="mt-auto flex justify-end border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="saving"
            @click="saveAccountSettings"
          >
            保存策略与自动控制
          </BaseButton>
        </div>
      </div>

      <div v-else class="card glass-panel flex flex-col items-center justify-center gap-4 rounded-lg p-12 text-center shadow">
        <div class="rounded-full bg-gray-50/20 p-4 dark:bg-gray-700/20">
          <div class="i-carbon-settings-adjust glass-text-muted text-4xl" />
        </div>
        <div class="max-w-xs">
          <h3 class="glass-text-main text-lg font-medium">
            需要登录账号
          </h3>
          <p class="glass-text-muted mt-1 text-sm">
            请先登录账号以配置策略和自动化选项。
          </p>
        </div>
      </div>

      <!-- Card 2: System Settings (Password & Offline) -->
      <div class="card glass-panel h-full flex flex-col rounded-lg shadow">
        <!-- Password Header -->
        <div class="border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-password" />
            管理密码
          </h3>
        </div>

        <!-- Password Content -->
        <div class="p-4 space-y-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <BaseInput
              v-model="passwordForm.old"
              label="当前密码"
              type="password"
              placeholder="当前管理密码"
            />
            <BaseInput
              v-model="passwordForm.new"
              label="新密码"
              type="password"
              placeholder="至少 4 位"
            />
            <BaseInput
              v-model="passwordForm.confirm"
              label="确认新密码"
              type="password"
              placeholder="再次输入新密码"
            />
          </div>

          <div class="flex items-center justify-between pt-1">
            <p class="glass-text-muted text-xs">
              建议修改默认密码 (admin)
            </p>
            <BaseButton
              variant="primary"
              size="sm"
              :loading="passwordSaving"
              @click="handleChangePassword"
            >
              修改管理密码
            </BaseButton>
          </div>
        </div>

        <!-- Offline Header -->
        <div class="border-b border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-notification" />
            下线提醒
          </h3>
        </div>

        <!-- Offline Content -->
        <div class="flex-1 p-4 space-y-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div class="flex items-center gap-2">
              <BaseSelect
                v-model="localOffline.channel"
                label="推送渠道"
                :options="channelOptions"
                class="flex-1"
              />
              <a
                v-if="channelDocUrl"
                :href="channelDocUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-5 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-blue-100 px-2 py-1.5 text-xs text-blue-700 font-medium transition dark:bg-blue-900/30 hover:bg-blue-200 dark:text-blue-300 dark:hover:bg-blue-800/40"
                title="查看官方文档"
              >
                <span class="i-carbon-launch text-xs" />
                官网
              </a>
            </div>
            <BaseSelect
              v-model="localOffline.reloginUrlMode"
              label="重登录链接"
              :options="reloginUrlModeOptions"
            />
          </div>

          <BaseInput
            v-model="localOffline.endpoint"
            label="接口地址"
            type="text"
            :disabled="localOffline.channel !== 'webhook'"
          />

          <BaseInput
            v-model="localOffline.token"
            label="Token"
            type="text"
            placeholder="接收端 token"
          />

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BaseInput
              v-model="localOffline.title"
              label="标题"
              type="text"
              placeholder="提醒标题"
            />
            <BaseInput
              v-model.number="localOffline.offlineDeleteSec"
              label="离线删除账号 (秒)"
              type="number"
              min="1"
              placeholder="默认 120"
            />
          </div>

          <BaseInput
            v-model="localOffline.msg"
            label="内容"
            type="text"
            placeholder="提醒内容"
          />
        </div>

        <!-- Save Offline Button -->
        <div class="mt-auto flex justify-end border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="offlineSaving"
            @click="handleSaveOffline"
          >
            保存下线提醒设置
          </BaseButton>
        </div>
      </div>

      <!-- Card 3: 体验卡配置（仅管理员可见） -->
      <div v-if="isAdmin" class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2">
        <div class="border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-chemistry" />
            体验卡配置
          </h3>
        </div>

        <div class="p-4 space-y-4">
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BaseSwitch v-model="trialConfig.enabled" label="功能开关" />
            <BaseSwitch v-model="trialConfig.adminRenewEnabled" label="管理员一键续费" />
            <BaseSwitch v-model="trialConfig.userRenewEnabled" label="用户自助续费" />
          </div>

          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BaseSelect
              v-model="trialConfig.days"
              label="体验卡时长"
              :options="trialDaysOptions"
            />
            <BaseInput
              v-model.number="trialConfig.maxAccounts"
              label="绑定账号数"
              type="number"
              min="1"
              max="10"
            />
            <BaseInput
              v-model.number="trialConfig.dailyLimit"
              label="每日上限"
              type="number"
              min="1"
            />
            <BaseSelect
              v-model="trialConfig.cooldownMs"
              label="IP 冷却时间"
              :options="trialCooldownOptions"
            />
          </div>
        </div>

        <div class="mt-auto flex justify-end border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="trialSaving"
            @click="saveTrialConfig"
          >
            保存体验卡配置
          </BaseButton>
        </div>
      </div>

      <!-- Card 4: 系统主题与背景（仅管理员可见） -->
      <div v-if="isAdmin" class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2">
        <div class="border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-paint-brush" />
            系统外观与自定义背景
          </h3>
        </div>

        <div class="p-4 space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="space-y-3">
              <BaseInput
                v-model="appStore.loginBackground"
                label="登录页背景图片 URL"
                placeholder="请输入图片链接 (如: https://example.com/bg.jpg)"
              />
              <p class="glass-text-muted text-xs">
                提示：留空则使用系统默认渐变背景。建议使用高分辨率壁纸链接。
              </p>

              <div class="mt-4 flex items-center gap-3 border-t pt-4 dark:border-gray-700">
                <BaseButton
                  variant="primary"
                  size="sm"
                  @click="appStore.setUIConfig({ loginBackground: appStore.loginBackground })"
                >
                  应用背景设置
                </BaseButton>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  @click="appStore.setUIConfig({ loginBackground: '' })"
                >
                  恢复默认
                </BaseButton>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <span class="glass-text-muted text-xs font-medium">预览 (效果参考)</span>
              <div
                class="relative h-32 w-full overflow-hidden border border-white/20 rounded-xl bg-cover bg-center dark:border-white/10"
                :style="appStore.loginBackground ? { backgroundImage: `url(${appStore.loginBackground})` } : { background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)' }"
              >
                <div v-if="appStore.loginBackground" class="absolute inset-0 bg-black/20" />
                <div class="absolute inset-0 flex items-center justify-center">
                  <div class="glass-text-main border border-white/20 rounded bg-white/60 px-3 py-1 text-[10px] backdrop-blur-md dark:bg-black/40 dark:text-white">
                    玻璃拟态预览
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

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

    <!-- 改动预览 Modal -->
    <ConfirmModal
      :show="diffModalVisible"
      title="确认保存改动"
      confirm-text="确认并保存"
      cancel-text="再检查下"
      type="primary"
      @confirm="saveAccountSettings(true)"
      @cancel="diffModalVisible = false"
    >
      <div class="space-y-4">
        <p class="glass-text-muted text-sm">
          检测到以下配置项已变动：
        </p>
        <div class="max-h-60 overflow-y-auto border border-gray-100 rounded-xl bg-gray-50/50 p-2 dark:border-gray-700 dark:bg-gray-900/40">
          <div v-for="item in diffItems" :key="item.label" class="flex items-center justify-between border-b border-gray-100 p-2 last:border-0 dark:border-gray-700/50">
            <span class="glass-text-muted text-xs font-medium">{{ item.label }}</span>
            <div class="flex items-center gap-2 text-xs">
              <span class="glass-text-muted line-through">{{ item.from }}</span>
              <div class="i-carbon-arrow-right text-primary-500" />
              <span class="text-primary-600 font-bold dark:text-primary-400">{{ item.to }}</span>
            </div>
          </div>
        </div>
        <p class="text-[10px] text-orange-500 italic">
          提示：点击「确认并保存」后，后端调度器将立即应用新策略。
        </p>
      </div>
    </ConfirmModal>
  </div>
</template>

<style scoped lang="postcss">
/* Custom styles if needed */
</style>
