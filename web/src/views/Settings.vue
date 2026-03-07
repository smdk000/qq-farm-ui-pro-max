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
import BaseTooltip from '@/components/ui/BaseTooltip.vue'
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
const timingSaving = ref(false)

// === 危险频率拦截警告 ===
const timeWarningVisible = computed(() => {
  // eslint-disable-next-line ts/no-use-before-define
  if (!localSettings.value.intervals)
    return false
  // eslint-disable-next-line ts/no-use-before-define
  const { farmMin, farmMax, friendMin, friendMax } = localSettings.value.intervals
  return (
    (typeof farmMin === 'number' && farmMin < 15)
    || (typeof farmMax === 'number' && farmMax < 15)
    || (typeof friendMin === 'number' && friendMin < 60)
    || (typeof friendMax === 'number' && friendMax < 60)
  )
})

// ============ 用户身份识别 ============
const isAdmin = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('current_user') || 'null')
    return u?.role === 'admin'
  }
  catch { return false }
})

// 当前登录用户名（用于密码修改等用户隔离场景）
const currentUsername = computed(() => {
  try {
    const u = JSON.parse(localStorage.getItem('current_user') || 'null')
    return u?.username || ''
  }
  catch { return '' }
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

const clusterConfig = ref({
  dispatcherStrategy: 'round_robin',
})
const clusterSaving = ref(false)

const clusterStrategyOptions = [
  { label: '轮询洗牌 (Round Robin)', value: 'round_robin' },
  { label: '最小负荷与粘性推流 (Least Load)', value: 'least_load' },
]

const trialDaysOptions = [
  { label: '1 天', value: 1 },
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '永久', value: 0 },
]

const thirdPartyApiConfig = ref({
  wxApiKey: '',
  wxApiUrl: '',
  wxAppId: '',
  ipad860Url: '',
  aineisheKey: '',
})
const thirdPartyApiSaving = ref(false)

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

async function loadClusterConfig() {
  if (!isAdmin.value)
    return
  const data = await settingStore.fetchClusterConfig()
  if (data) {
    clusterConfig.value = { ...clusterConfig.value, ...data }
  }
}

async function saveClusterConfig() {
  clusterSaving.value = true
  try {
    const res = await settingStore.saveClusterConfig(clusterConfig.value)
    if (res.ok) {
      showAlert('分布式与集群策略已保存并即时生效')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    clusterSaving.value = false
  }
}

async function loadThirdPartyApiConfig() {
  if (!isAdmin.value)
    return
  try {
    const res = await api.get('/api/admin/third-party-api')
    if (res.data.ok && res.data.data) {
      thirdPartyApiConfig.value = { ...thirdPartyApiConfig.value, ...res.data.data }
    }
  }
  catch { /* 静默 */ }
}

async function saveThirdPartyApiConfig() {
  thirdPartyApiSaving.value = true
  try {
    const res = await api.post('/api/admin/third-party-api', thirdPartyApiConfig.value)
    if (res.data.ok) {
      showAlert('第三方 API 配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.data.error}`, 'danger')
    }
  }
  catch (e: any) {
    showAlert(`保存失败: ${e.message}`, 'danger')
  }
  finally {
    thirdPartyApiSaving.value = false
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
  accountMode: 'main' as 'main' | 'alt' | 'safe',
  harvestDelay: { min: 180, max: 300 },
  plantingStrategy: 'preferred',
  preferredSeedId: 0,
  intervals: { farmMin: 30, farmMax: 200, friendMin: 100, friendMax: 600 },
  friendQuietHours: { enabled: true, start: '23:00', end: '07:00' },
  stakeoutSteal: { enabled: false, delaySec: 3 },
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
    fertilizer_buy_limit: 100,
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
    fertilizer_smart_phase: false,
    forceGetAllEnabled: false,
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

const localTiming = ref({
  heartbeatIntervalMs: 25000,
  rateLimitIntervalMs: 334,
  ghostingProbability: 0.02,
  ghostingCooldownMin: 240,
  ghostingMinMin: 5,
  ghostingMaxMin: 10,
  inviteRequestDelay: 2000,
})

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})

function syncLocalSettings() {
  if (settings.value) {
    localSettings.value = JSON.parse(JSON.stringify({
      accountMode: (settings.value as any).accountMode || 'main',
      harvestDelay: (settings.value as any).harvestDelay || { min: 180, max: 300 },
      plantingStrategy: settings.value.plantingStrategy,
      preferredSeedId: settings.value.preferredSeedId,
      intervals: settings.value.intervals,
      friendQuietHours: settings.value.friendQuietHours,
      stakeoutSteal: (settings.value as any).stakeoutSteal || { enabled: false, delaySec: 3 },
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
        fertilizer_buy_limit: 100,
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
        fertilizer_smart_phase: false,
        forceGetAllEnabled: false,
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
        fertilizer_buy_limit: 100,
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
        fertilizer_smart_phase: false,
        forceGetAllEnabled: false,
      }
      localSettings.value.automation = {
        ...defaults,
        ...localSettings.value.automation,
      }
    }

    if (!localSettings.value.stakeoutSteal) {
      localSettings.value.stakeoutSteal = { enabled: false, delaySec: 3 }
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

const safeChecking = ref(false)
async function handleSafeCheck() {
  if (!currentAccountId.value)
    return
  // TODO: remove confirm
  if (window.window.confirm(`是否分析当前账号的历史封禁日志并自动补充黑名单？`)) {
    try {
      safeChecking.value = true
      const res = await accountStore.applySafeModeBlacklist(currentAccountId.value)
      if (res && res.ok && res.data && res.data.length >= 0) {
        showAlert(`一键分析完成！\n新增了 ${res.data.length} 个风险账号到黑名单。\n${res.data.join(', ')}`)
      }
      else {
        showAlert('暂无新增记录。')
      }
    }
    catch (e: any) {
      showAlert(`分析失败: ${e.message}`, 'danger')
    }
    finally {
      safeChecking.value = false
    }
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
  loadThirdPartyApiConfig()
  if (isAdmin.value) {
    loadTimingConfig()
    loadClusterConfig()
  }
}

onMounted(() => {
  loadData()
})

// 【关键修复】仅监听 accountId 字符串值，而非 currentAccount 对象引用
// 原因：Sidebar 每 10 秒轮询 fetchAccounts() 会替换 accounts 数组，
// 导致 currentAccount computed 返回新对象引用（即使数据内容相同），
// 从而误触发 loadData()，引发页面闪烁和滚动位置重置
watch(() => currentAccountId.value, () => {
  loadData()
})

// 好友过滤开关切换时自动加载好友列表
watch(() => localSettings.value.automation.stealFriendFilterEnabled, (enabled) => {
  if (enabled && currentAccountId.value && friends.value.length === 0) {
    friendStore.fetchFriends(currentAccountId.value)
  }
})

const fertilizerOptions = [
  { label: '普通 + 有机', value: 'both', description: '极速成长与改良双管齐下，全包化肥方案。' },
  { label: '仅普通化肥', value: 'normal', description: '仅在防偷等关键时刻加速生长，节约高阶成本。' },
  { label: '仅有机化肥', value: 'organic', description: '优先消耗可循环产出的有机肥改善土壤。' },
  { label: '不施肥', value: 'none', description: '佛系种植，绝不消耗任何额外物资。' },
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
  forceGetAllEnabled: '强制好友兼容模式',
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
    ;['accountMode', 'plantingStrategy', 'preferredSeedId'].forEach((key) => {
      const oldVal = (settings.value as any)[key]
      const newVal = (localSettings.value as any)[key]
      if (oldVal !== newVal) {
        const _label = fieldLabels[key] || key
        changes.push({ label: _label, from: getValLabel(key, oldVal), to: getValLabel(key, newVal) })
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

    // 对比蹲守配置
    const oldStake = (settings.value as any).stakeoutSteal || {}
    const newStake = localSettings.value.stakeoutSteal || {}
    if (oldStake.enabled !== newStake.enabled) {
      changes.push({ label: '精准蹲守偷菜', from: getValLabel('stakeoutSteal', !!oldStake.enabled), to: getValLabel('stakeoutSteal', !!newStake.enabled) })
    }

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
  // 管理员：≥4 位；普通用户：≥6 位 + 字母数字（后端会二次校验）
  const minLen = isAdmin.value ? 4 : 6
  if (passwordForm.value.new.length < minLen) {
    showAlert(`密码长度至少 ${minLen} 位`, 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await settingStore.changePassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert(`用户 ${currentUsername.value} 密码修改成功`)
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

async function loadTimingConfig() {
  if (!isAdmin.value)
    return
  const data = await settingStore.fetchTimingConfig()
  if (data && data.config) {
    localTiming.value = { ...data.config }
  }
}

async function handleSaveTiming() {
  // 数据合法性校验，防止输入空字符串或非法字符导致的保存失败
  const t = localTiming.value
  const isValid = !Number.isNaN(t.heartbeatIntervalMs) && !Number.isNaN(t.rateLimitIntervalMs)
    && !Number.isNaN(t.ghostingProbability) && !Number.isNaN(t.ghostingCooldownMin)
    && !Number.isNaN(t.ghostingMinMin) && !Number.isNaN(t.ghostingMaxMin)
    && !Number.isNaN(t.inviteRequestDelay)

  if (!isValid) {
    showAlert('保存失败：请确保所有项均为有效数字', 'danger')
    return
  }

  timingSaving.value = true
  try {
    const res = await settingStore.saveTimingConfig(localTiming.value)
    if (res.ok) {
      showAlert('时间参数配置已保存')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    timingSaving.value = false
  }
}

async function restoreTimingDefaults() {
  localTiming.value = { ...settingStore.settings.defaultTimingConfig }
  showAlert('已加载默认推荐值，点击保存后生效')
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
          <!-- Account Mode Selection Panel -->
          <div class="grid grid-cols-1 mb-4 gap-3 md:grid-cols-3">
            <!-- 主号模式 -->
            <div
              class="cursor-pointer border border-gray-200 rounded-lg bg-white p-3 transition-all duration-200 dark:border-gray-700 hover:border-primary-400 dark:bg-gray-800 dark:hover:border-primary-500"
              :class="{ 'ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-500': localSettings.accountMode === 'main' }"
              @click="localSettings.accountMode = 'main'"
            >
              <div class="mb-1 flex items-center justify-between">
                <div class="flex items-center gap-1 text-primary-600 font-bold dark:text-primary-400">
                  <div class="i-carbon-user-avatar items-center" /> 主号模式
                </div>
                <div v-show="localSettings.accountMode === 'main'" class="i-carbon-checkmark-filled text-primary-500" />
              </div>
              <div class="text-xs text-gray-500 leading-tight dark:text-gray-400">
                享有全部操作权限（如成熟秒收），系统确保主号的优先度和唯一性
              </div>
            </div>
            <!-- 小号模式 -->
            <div
              class="cursor-pointer border border-gray-200 rounded-lg bg-white p-3 transition-all duration-200 dark:border-gray-700 hover:border-amber-400 dark:bg-gray-800 dark:hover:border-amber-500"
              :class="{ 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-900/20 border-amber-500 dark:border-amber-500': localSettings.accountMode === 'alt' }"
              @click="localSettings.accountMode = 'alt'"
            >
              <div class="mb-1 flex items-center justify-between">
                <div class="flex items-center gap-1 text-amber-600 font-bold dark:text-amber-400">
                  <div class="i-carbon-user-multiple items-center" /> 小号模式
                </div>
                <div v-show="localSettings.accountMode === 'alt'" class="i-carbon-checkmark-filled text-amber-500" />
              </div>
              <div class="text-xs text-gray-500 leading-tight dark:text-gray-400">
                限制可能招致仇恨的操作，强制引入延迟收获机制错开高峰
              </div>
            </div>
            <!-- 风险规避模式 -->
            <div
              class="cursor-pointer border border-gray-200 rounded-lg bg-white p-3 transition-all duration-200 dark:border-gray-700 hover:border-emerald-400 dark:bg-gray-800 dark:hover:border-emerald-500"
              :class="{ 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 dark:border-emerald-500': localSettings.accountMode === 'safe' }"
              @click="localSettings.accountMode = 'safe'"
            >
              <div class="mb-1 flex items-center justify-between">
                <div class="flex items-center gap-1 text-emerald-600 font-bold dark:text-emerald-400">
                  <div class="i-carbon-security items-center" /> 风险规避
                </div>
                <div v-show="localSettings.accountMode === 'safe'" class="i-carbon-checkmark-filled text-emerald-500" />
              </div>
              <div class="text-xs text-gray-500 leading-tight dark:text-gray-400">
                严格禁用高风险互动，自动脱离黑灰产关联，专用于敏感期
              </div>
            </div>
          </div>

          <!-- 小号模式特供区：假延迟 -->
          <div v-if="localSettings.accountMode === 'alt'" class="mb-4 flex flex-col gap-2 border border-amber-200 rounded-md bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-900/20">
            <h4 class="flex items-center gap-1 text-sm text-amber-700 font-semibold dark:text-amber-400">
              <div class="i-carbon-time" /> 小号专属：收获延迟保护
            </h4>
            <span class="text-xs text-amber-600 dark:text-amber-500">当农作物成熟时，主动挂机并在随机延时后才收获，降低被风控或连带标记的概率。</span>
            <div class="grid grid-cols-2 mt-2 gap-3 md:grid-cols-4">
              <BaseInput
                v-model.number="localSettings.harvestDelay.min"
                label="随机延迟下限 (秒)"
                type="number"
                min="0"
              />
              <BaseInput
                v-model.number="localSettings.harvestDelay.max"
                label="随机延迟上限 (秒)"
                type="number"
                min="10"
              />
            </div>
          </div>

          <!-- 风险规避特供区：一键分析拦截 -->
          <div v-if="localSettings.accountMode === 'safe'" class="mb-4 flex flex-col items-start gap-2 border border-emerald-200 rounded-md bg-emerald-50 p-3 dark:border-emerald-800/50 dark:bg-emerald-900/20">
            <h4 class="flex items-center gap-1 text-sm text-emerald-700 font-semibold dark:text-emerald-400">
              <div class="i-carbon-ibm-cloud-security-compliance-center" /> 风险规避专属护盾
            </h4>
            <span class="text-xs text-emerald-600 dark:text-emerald-500">此模式除自动关闭捣乱接口外，可进一步针对历史出现被封警告的号外置强阻断。</span>
            <BaseButton
              variant="outline"
              size="sm"
              class="mt-1 border-emerald-300 text-emerald-600 dark:border-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-800/50"
              :loading="safeChecking"
              @click="handleSafeCheck"
            >
              <div class="i-carbon-search mr-1" /> 分析并加入防御名单
            </BaseButton>
          </div>

          <!-- 极值警告 -->
          <div v-if="timeWarningVisible && !isAdmin" class="mb-3 flex items-start gap-2 border border-red-200 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <div class="i-carbon-warning-alt mt-0.5 shrink-0 text-lg" />
            <div>
              <strong>危险的轮询设定！</strong><br>
              农田循环下限不能低于 15秒，好友巡查不能低于 60秒，否则极易触发腾讯风控致使账号被封。请上调参数后再保存！
            </div>
          </div>

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
              <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                <div class="i-carbon-Agriculture mr-2" /> 农场基础操作
                <BaseTooltip text="农场自动化的核心控制区，包含种植收获、好友互动、升级土地等基础功能" />
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
              <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                <div class="i-carbon-gift mr-2" /> 每日收益领取
                <BaseTooltip text="每日可领取的免费奖励，建议全部开启以最大化日常收益" />
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
              <h4 class="glass-text-muted mb-4 flex items-center text-xs font-bold tracking-widest uppercase">
                <div class="i-carbon-tool-box mr-2" /> 化肥与精细控制
                <BaseTooltip text="化肥管理和高级防盗功能的精细控制区" />
              </h4>
              <div class="space-y-4">
                <BaseSwitch v-model="localSettings.automation.fertilizer_gift" label="自动填充化肥" hint="有免费化肥领取机会时自动领取，保证化肥库存不断档。" recommend="on" />
                <div class="flex flex-col gap-2">
                  <BaseSwitch v-model="localSettings.automation.fertilizer_buy" label="自动购买化肥" hint="化肥库存不足时自动花费金币购买。注意：会持续消耗金币，金币紧张时建议关闭。" recommend="conditional" />
                  <div v-show="localSettings.automation.fertilizer_buy" class="ml-7 flex items-center gap-3">
                    <span class="glass-text-muted text-[11px] font-bold tracking-widest uppercase">
                      - 单日最大购买上限 (包)：
                    </span>
                    <BaseInput
                      v-model.number="localSettings.automation.fertilizer_buy_limit"
                      type="number"
                      min="1"
                      class="w-24 text-sm shadow-inner !py-1"
                    />
                  </div>
                </div>
                <BaseSwitch v-model="localSettings.automation.fertilizer_60s_anti_steal" label="60秒施肥(防偷)" hint="核心防盗功能。在果实成熟前60秒内自动施肥催熟并瞬间收获，将被偷窗口压缩到接近0。需消耗化肥，主号必开。" recommend="on" />
                <BaseSwitch v-model="localSettings.automation.fertilizer_smart_phase" label="智能二季施肥" hint="开启后，二季作物刚种植时不会马上浪费化肥，而是等到耗时最长的黄金阶段再自动进行延期施肥，实现单果经验/金钱收益最大化。" recommend="conditional" />
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

          <!-- 好友互动详细控制 (始终显示，关闭时灰化) -->
          <div class="relative border rounded-2xl p-5 transition-all" :class="localSettings.automation.friend ? 'border-blue-100/50 bg-blue-50/50 dark:border-blue-800/30 dark:bg-blue-900/10' : 'border-gray-200/30 bg-gray-100/20 dark:border-gray-700/30 dark:bg-gray-800/20'">
            <!-- 灰化遮罩：总开关关闭时覆盖内容区 -->
            <div v-if="!localSettings.automation.friend" class="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[1px]">
              <span class="border border-white/10 rounded-lg bg-black/50 px-4 py-2 text-sm text-gray-300 font-bold shadow-lg">
                🔒 请先开启上方「自动好友互动」总开关
              </span>
            </div>
            <h4 class="mb-4 flex items-center text-xs font-bold tracking-widest uppercase" :class="localSettings.automation.friend ? 'text-blue-500' : 'text-gray-400'">
              <div class="i-carbon-user-multiple mr-2" /> 社交互动详细策略
              <BaseTooltip text="只有在主开关【自动好友互动】开启时此策略组才会生效，控制在好友农场的具体行为。" />
            </h4>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-4 md:grid-cols-2" :class="{ 'opacity-40 pointer-events-none select-none': !localSettings.automation.friend }">
              <!-- 蹲守开关：独立占一格 -->
              <BaseSwitch v-model="localSettings.stakeoutSteal.enabled" label="精准蹲守偷菜" hint="自动记录好友作物成熟时间，到点精准出击偷取高价值果实。" recommend="conditional" />
              <!-- 蹲守延迟设置：独立占一格，仅在开启后显示内容 -->
              <div class="inline-flex flex-col gap-1">
                <template v-if="localSettings.stakeoutSteal.enabled">
                  <label class="inline-flex items-center gap-2">
                    <span class="glass-text-main select-none text-sm font-medium">蹲守延迟</span>
                    <div class="flex items-center gap-1.5 border border-gray-300/50 rounded-md bg-black/5 px-2 py-1 dark:border-white/10 dark:bg-black/20">
                      <input
                        v-model.number="localSettings.stakeoutSteal.delaySec"
                        type="number"
                        min="0"
                        max="60"
                        class="glass-text-main w-12 bg-transparent text-center text-sm font-bold outline-none"
                      >
                      <span class="glass-text-muted text-xs font-bold">秒</span>
                    </div>
                  </label>
                  <p class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
                    成熟后等待几秒再偷，模拟真人操作节奏，推荐 3~10 秒。
                    <span class="recommend-badge recommend-conditional">推荐 3 秒</span>
                  </p>
                </template>
                <template v-else>
                  <span class="glass-text-muted select-none text-sm">蹲守延迟设置</span>
                  <p class="hint-text glass-text-muted ml-1 text-[10px] leading-tight opacity-70">
                    请先开启左侧「精准蹲守偷菜」开关。
                  </p>
                </template>
              </div>

              <BaseSwitch v-model="localSettings.automation.friend_steal" label="自动偷菜" hint="访问好友农场时自动偷取成熟果实，是金币收入的重要补充来源。" recommend="on" />
              <BaseSwitch v-model="localSettings.automation.friend_help" label="自动帮忙" hint="访问好友农场时自动帮忙浇水/除草/除虫，可获得经验奖励。" recommend="on" />
              <BaseSwitch v-model="localSettings.automation.friend_bad" label="自动捣乱" hint="访问好友农场时自动放虫/放草。有社交风险，好友可能拉黑你，小号专用。" recommend="off" />
              <BaseSwitch v-model="localSettings.automation.friend_auto_accept" label="自动同意好友" hint="自动同意所有好友申请。好友越多偷菜机会越多，但也增加被偷风险。" recommend="conditional" />
              <BaseSwitch v-model="localSettings.automation.friend_help_exp_limit" label="经验上限停止帮忙" hint="当日帮忙经验达到系统上限后自动停止，避免做无用功浪费请求配额。" recommend="on" />
              <BaseSwitch v-model="localSettings.automation.forceGetAllEnabled" label="强效兼容尝试" hint="如果发现好友列表一直为空（多见于微信最新环境），请开启此项强制尝试 GetAll 拉取。" recommend="conditional" />
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
            账号密码
            <span v-if="currentUsername" class="rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-600 font-normal dark:bg-primary-900/30 dark:text-primary-400">
              {{ currentUsername }}
            </span>
          </h3>
        </div>

        <!-- Password Content -->
        <div class="p-4 space-y-3">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
            <BaseInput
              v-model="passwordForm.old"
              label="当前密码"
              type="password"
              placeholder="当前登录密码"
            />
            <BaseInput
              v-model="passwordForm.new"
              label="新密码"
              type="password"
              :placeholder="isAdmin ? '至少 4 位' : '至少 6 位，需含字母和数字'"
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
              修改当前登录账号 <strong>{{ currentUsername }}</strong> 的密码
            </p>
            <BaseButton
              variant="primary"
              size="sm"
              :loading="passwordSaving"
              @click="handleChangePassword"
            >
              修改密码
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

      <!-- Card Time Parameters: 系统级时间参数调优（仅管理员可见） -->
      <div v-if="isAdmin" class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2">
        <div class="flex items-center justify-between border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-time" />
            ⏱ 时间参数调优 (System Timing)
          </h3>
          <BaseButton
            variant="secondary"
            size="sm"
            @click="restoreTimingDefaults"
          >
            <div class="i-carbon-reset mr-1" /> 恢复默认推荐值
          </BaseButton>
        </div>

        <div class="p-4 space-y-6">
          <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
            <!-- Group 1: Network & Heartbeat -->
            <div class="space-y-4">
              <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                <div class="i-carbon-network-4 mr-2" /> 网络与心跳
              </h4>
              <BaseInput
                v-model.number="localTiming.heartbeatIntervalMs"
                label="WebSocket 心跳间隔 (ms)"
                type="number"
                min="5000"
                step="1000"
                hint="维持长连接的频率，推荐 25000ms"
              />
              <BaseInput
                v-model.number="localTiming.rateLimitIntervalMs"
                label="API 发送限流间隔 (ms)"
                type="number"
                min="100"
                step="1"
                hint="请求指纹匀速器。3QPS = 334ms"
              />
            </div>

            <!-- Group 2: Ghosting (Anti-Detection) -->
            <div class="space-y-4">
              <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                <div class="i-carbon-ghost mr-2" /> Ghosting 打盹行为
              </h4>
              <div class="grid grid-cols-2 gap-3">
                <BaseInput
                  v-model.number="localTiming.ghostingProbability"
                  label="打盹触发概率"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                />
                <BaseInput
                  v-model.number="localTiming.ghostingCooldownMin"
                  label="冷却期 (分钟)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localTiming.ghostingMinMin"
                  label="最短休眠 (分)"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localTiming.ghostingMaxMin"
                  label="最长休眠 (分)"
                  type="number"
                  min="1"
                />
              </div>
              <p class="text-[10px] text-orange-500 italic">
                模拟真人疲劳休眠，随机下线避开长时间挂机检测。
              </p>
            </div>

            <!-- Group 3: Operation Intervals -->
            <div class="space-y-4">
              <h4 class="glass-text-muted flex items-center text-xs font-bold tracking-widest uppercase">
                <div class="i-carbon-keyboard mr-2" /> 邀请与微延迟 (只读预览)
              </h4>
              <BaseInput
                v-model.number="localTiming.inviteRequestDelay"
                label="邀请请求延迟 (ms)"
                type="number"
                min="500"
                step="100"
              />
              <div class="border border-white/10 rounded-lg bg-black/5 p-2 dark:bg-black/20">
                <div v-for="p in settingStore.settings.readonlyTimingParams" :key="p.key" class="flex justify-between py-1 text-[11px]">
                  <span class="glass-text-muted">{{ p.label }}</span>
                  <span class="text-primary-500 font-mono">{{ p.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-auto flex justify-end border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="timingSaving"
            @click="handleSaveTiming"
          >
            保存时间参数设置
          </BaseButton>
        </div>
      </div>

      <!-- Card New: 分布式与集群流控（仅管理员可见） -->
      <div v-if="isAdmin" class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2">
        <div class="border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-flow-stream" />
            分布式与集群流控 (Cluster Routing)
          </h3>
        </div>

        <div class="p-4 space-y-4">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <BaseSelect
              v-model="clusterConfig.dispatcherStrategy"
              label="集群派发器路由策略"
              :options="clusterStrategyOptions"
            />
          </div>
          <div class="alert alert-info mt-2 flex items-start gap-2 rounded-md bg-blue-50/50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            <div class="i-carbon-information mt-0.5 shrink-0 text-base" />
            <div>
              <p class="font-bold">
                策略说明：
              </p>
              <ul class="ml-4 mt-1 list-disc opacity-90 space-y-1">
                <li><strong>轮询洗牌：</strong> 早期默认逻辑。新增账号或节点变动时，把所有存活账号抽出来均分给所有存活 Worker。(易引发大面积账号离线闪断)</li>
                <li><strong>最小负荷与粘性推流：</strong> 企业级商用逻辑。账号被精准分发到当前活跃数最少的离散节点上。并保持<strong>粘性心跳</strong>。只有老节点死亡或是新用户扫码登入时，才会触发推流动作，完全不影响已经在工作的进程丛集！</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="mt-auto flex justify-end border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="clusterSaving"
            @click="saveClusterConfig"
          >
            保存集群路由策略
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
            保存体验卡设置
          </BaseButton>
        </div>
      </div>

      <!-- Card 4: 第三方 API 配置（仅管理员可见） -->
      <div v-if="isAdmin" class="card glass-panel h-full flex flex-col rounded-lg shadow lg:col-span-2">
        <div class="border-b border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <h3 class="glass-text-main flex items-center gap-2 text-base font-bold">
            <div class="i-carbon-api-1" />
            第三方 API 配置
          </h3>
        </div>

        <div class="p-4 space-y-4">
          <div class="grid grid-cols-1 gap-3 lg:grid-cols-3 md:grid-cols-2">
            <BaseInput
              v-model="thirdPartyApiConfig.wxApiKey"
              label="微信登录 API Key (wxApiKey)"
              type="password"
              placeholder="请输入与第三方授权约定的 ApiKey"
            />
            <BaseInput
              v-model="thirdPartyApiConfig.wxAppId"
              label="QQ农场 AppId (wxAppId)"
              type="text"
              placeholder="默认从接口获取，可覆盖定制"
            />
            <BaseInput
              v-model="thirdPartyApiConfig.wxApiUrl"
              label="微信登录请求网关 (wxApiUrl)"
              type="text"
              placeholder="一般为内部或三方中转代理服务地址"
            />
            <BaseInput
              v-model="thirdPartyApiConfig.ipad860Url"
              label="Ipad860 服务地址"
              type="text"
              placeholder="如 http://127.0.0.1:8058 或 http://ipad860:8058"
            />
            <BaseInput
              v-model="thirdPartyApiConfig.aineisheKey"
              label="码雨云 API Token (QQ扫码)"
              type="password"
              placeholder="请输入 aineishe.com 获取的 Token"
            />
          </div>
          <div class="alert alert-warning mt-2 flex items-start gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <div class="i-carbon-warning-alt mt-0.5 mt-0.5 shrink-0 text-base" />
            <p>更改此项配置会立即刷新扫码中转服务器参数。如果改错导致扫码无反应，请重新设置正确的值，原环境变量已不再具有覆写能力。</p>
          </div>
        </div>

        <div class="mt-auto flex justify-end border-t border-gray-200/50 bg-transparent px-4 py-3 dark:border-gray-700/50">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="thirdPartyApiSaving"
            @click="saveThirdPartyApiConfig"
          >
            保存第三方 API 设置
          </BaseButton>
        </div>
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
