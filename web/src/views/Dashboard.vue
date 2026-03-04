/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import { useIntervalFn, useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import UserInfoCard from '@/components/UserInfoCard.vue'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useSettingStore } from '@/stores/setting'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const {
  status,
  logs: statusLogs,
  realtimeConnected,
} = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { dashboardItems } = storeToRefs(bagStore)
const logContainer = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const lastBagFetchAt = ref(0)

// ========== 任务队列预览 ==========
const schedulerPreview = ref<any>(null)
const lastSchedulerFetchAt = ref(0)
const showAllTasks = ref(false) // 是否显示全部任务（含基础设施任务）

// ========== 农场操作预览（仅供今日统计使用） ==========
const landsPreview = ref<any>(null)
const lastLandsFetchAt = ref(0)
const localMatureCountdowns = ref<Record<number, number>>({})

const allLogs = computed(() => {
  const sLogs = statusLogs.value || []
  // 操作日志直接按时间排序展示，不再混入 accountLogs（系统日志），避免合并后又 filter 掉的无效操作
  return [...sLogs].sort((a: any, b: any) => a.ts - b.ts)
})

const filter = useStorage('dashboard_log_filter', {
  module: '',
  event: '',
  keyword: '',
  isWarn: '',
})

const hasActiveLogFilter = computed(() =>
  !!(filter.value.module || filter.value.event || filter.value.keyword || filter.value.isWarn),
)

const modules = [
  { label: '所有模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '任务', value: 'task' },
  { label: '系统', value: 'system' },
]

const events = [
  { label: '所有事件', value: '' },
  { label: '农场巡查', value: 'farm_cycle' },
  { label: '收获作物', value: 'harvest_crop' },
  { label: '清理枯株', value: 'remove_plant' },
  { label: '种植种子', value: 'plant_seed' },
  { label: '施加化肥', value: 'fertilize' },
  { label: '土地推送', value: 'lands_notify' },
  { label: '选择种子', value: 'seed_pick' },
  { label: '购买种子', value: 'seed_buy' },
  { label: '购买化肥', value: 'fertilizer_buy' },
  { label: '开启礼包', value: 'fertilizer_gift_open' },
  { label: '获取任务', value: 'task_scan' },
  { label: '完成任务', value: 'task_claim' },
  { label: '免费礼包', value: 'mall_free_gifts' },
  { label: '分享奖励', value: 'daily_share' },
  { label: '会员礼包', value: 'vip_daily_gift' },
  { label: '月卡礼包', value: 'month_card_gift' },
  { label: '开服红包', value: 'open_server_gift' },
  { label: '图鉴奖励', value: 'illustrated_rewards' },
  { label: '邮箱领取', value: 'email_rewards' },
  { label: '出售成功', value: 'sell_success' },
  { label: '土地升级', value: 'upgrade_land' },
  { label: '土地解锁', value: 'unlock_land' },
  { label: '好友巡查', value: 'friend_cycle' },
  { label: '访问好友', value: 'visit_friend' },
]

const eventLabelMap: Record<string, string> = Object.fromEntries(
  events.filter(e => e.value).map(e => [e.value, e.label]),
)

function getEventLabel(event: string) {
  return eventLabelMap[event] || event
}

const logs = [
  { label: '所有等级', value: '' },
  { label: '普通', value: 'info' },
  { label: '警告', value: 'warn' },
]

const displayName = computed(() => {
  // Try to use nickname from status (game server)
  const gameName = status.value?.status?.name
  if (gameName)
    return gameName

  // Check login status
  if (!status.value?.connection?.connected) {
    const account = accountStore.currentAccount
    return account?.name || account?.nick || '未登录'
  }

  // Fallback to account name (usually ID) or '未命名'
  const account = accountStore.currentAccount
  return account?.name || account?.nick || '未命名'
})

// Exp Rate & Time to Level
const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/时'
  const hours = uptime / 3600
  const rate = hours > 0 ? (gain / hours) : 0
  return `${Math.floor(rate)}/时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0

  if (!needed || !uptime || gain <= 0)
    return ''

  const hours = uptime / 3600
  const ratePerHour = hours > 0 ? (gain / hours) : 0
  if (ratePerHour <= 0)
    return ''

  const expNeeded = needed - current
  const minsToLevel = expNeeded / (ratePerHour / 60)

  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

// Fertilizer & Collection
const fertilizerNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1012))
const collectionNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3001))
const collectionRare = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3002))

function formatBucketTime(item: any) {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  const count = Number(item.count || 0)
  return `${(count / 3600).toFixed(1)}h`
}

// Next Check Countdown
const nextFarmCheck = ref('--')
const nextFriendCheck = ref('--')
const localUptime = ref(0)
let localNextFarmRemainSec = 0
let localNextFriendRemainSec = 0

function updateCountdowns() {
  // Update uptime
  if (status.value?.connection?.connected) {
    localUptime.value++
  }

  // 只有在账号已连接时才显示巡查状态
  const isConnected = status.value?.connection?.connected

  if (localNextFarmRemainSec > 0) {
    localNextFarmRemainSec--
    nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
  }
  else {
    nextFarmCheck.value = isConnected ? '巡查中...' : '--'
  }

  if (localNextFriendRemainSec > 0) {
    localNextFriendRemainSec--
    nextFriendCheck.value = formatDuration(localNextFriendRemainSec)
  }
  else {
    nextFriendCheck.value = isConnected ? '巡查中...' : '--'
  }

  // 土地成熟倒计时递减
  const cd = localMatureCountdowns.value
  for (const key of Object.keys(cd)) {
    const k = Number(key)
    const v = cd[k] ?? 0
    if (v > 0) cd[k] = v - 1
  }

  // 集成体验卡倒计时
  updateTrialCountdown()
}

watch(status, (newVal) => {
  if (newVal?.nextChecks) {
    // Only update local counters if they are significantly different or 0
    // Actually, we should sync from server periodically.
    // Here we just take server value when it comes.
    localNextFarmRemainSec = newVal.nextChecks.farmRemainSec || 0
    localNextFriendRemainSec = newVal.nextChecks.friendRemainSec || 0
    updateCountdowns() // Update immediately
  }
  if (newVal?.uptime !== undefined) {
    localUptime.value = newVal.uptime
  }
}, { deep: true })

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function getLogTagClass(tag: string) {
  if (tag === '错误')
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (tag === '系统')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (tag === '警告')
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  return 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
}

function getLogMsgClass(tag: string) {
  if (tag === '错误')
    return 'text-red-600 dark:text-red-400'
  return 'glass-text-main dark:text-gray-300'
}

function formatLogTime(timeStr: string) {
  // 2024/5/20 12:34:56 -> 12:34:56
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return parts.length > 1 ? parts[1] : timeStr
}

const OP_META: Record<string, { label: string, icon: string, color: string }> = {
  harvest: { label: '收获', icon: 'i-carbon-crop-growth', color: 'text-primary-500' },
  water: { label: '浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-400' },
  weed: { label: '除草', icon: 'i-carbon-cut-out', color: 'text-yellow-500' },
  bug: { label: '除虫', icon: 'i-carbon-warning-alt', color: 'text-red-400' },
  fertilize: { label: '施肥', icon: 'i-carbon-chemistry', color: 'text-emerald-500' },
  plant: { label: '种植', icon: 'i-carbon-tree', color: 'text-lime-500' },
  upgrade: { label: '土地升级', icon: 'i-carbon-upgrade', color: 'text-purple-500' },
  levelUp: { label: '账号升级', icon: 'i-carbon-user-certification', color: 'text-indigo-500' },
  steal: { label: '偷菜', icon: 'i-carbon-run', color: 'text-orange-500' },
  helpWater: { label: '帮浇水', icon: 'i-carbon-rain-drop', color: 'text-blue-300' },
  helpWeed: { label: '帮除草', icon: 'i-carbon-cut-out', color: 'text-yellow-400' },
  helpBug: { label: '帮除虫', icon: 'i-carbon-warning-alt', color: 'text-red-300' },
  taskClaim: { label: '任务', icon: 'i-carbon-task-complete', color: 'text-indigo-500' },
  sell: { label: '出售', icon: 'i-carbon-shopping-cart', color: 'text-pink-500' },
}

function getOpName(key: string | number) {
  return OP_META[String(key)]?.label || String(key)
}

function getOpIcon(key: string | number) {
  return OP_META[String(key)]?.icon || 'i-carbon-circle-dash'
}

function getOpColor(key: string | number) {
  return OP_META[String(key)]?.color || 'text-gray-400'
}

function getExpPercent(p: any) {
  if (!p || !p.needed)
    return 0
  return Math.min(100, Math.max(0, (p.current / p.needed) * 100))
}

async function refreshBag(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastBagFetchAt.value < 2500)
    return
  lastBagFetchAt.value = now
  await bagStore.fetchBag(currentAccountId.value)
}

// 获取任务队列预览数据
async function fetchSchedulerPreview(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastSchedulerFetchAt.value < 5000)
    return
  lastSchedulerFetchAt.value = now

  try {
    const res = await api.get('/api/scheduler', {
      headers: { 'x-account-id': currentAccountId.value },
    })
    if (res.data?.ok) {
      schedulerPreview.value = res.data.data
    }
  }
  catch {
    // 静默失败
  }
}

// 获取土地预览数据
async function fetchLandsPreview(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastLandsFetchAt.value < 5000)
    return
  lastLandsFetchAt.value = now

  try {
    const res = await api.get('/api/lands', {
      headers: { 'x-account-id': currentAccountId.value },
    })
    if (res.data?.ok) {
      landsPreview.value = res.data.data
      // 同步倒计时到本地
      const cd: Record<number, number> = {}
      for (const land of (res.data.data?.lands || [])) {
        if (land.matureInSec > 0) {
          cd[land.id] = land.matureInSec
        }
      }
      localMatureCountdowns.value = cd
    }
  }
  catch {
    // 静默失败，不影响主流程
  }
}

// 格式化任务下次执行倒计时
function formatNextRunCountdown(nextRunAt: number) {
  if (!nextRunAt)
    return '--'
  const diffSec = Math.max(0, Math.floor((nextRunAt - Date.now()) / 1000))
  if (diffSec <= 0)
    return '即将执行'
  const h = Math.floor(diffSec / 3600)
  const m = Math.floor((diffSec % 3600) / 60)
  const s = diffSec % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// 默认隐藏的纯基础设施任务（频率极高、信息量低）
const INFRA_TASKS = new Set(['status_sync', 'heartbeat_interval'])

// 任务分组映射
const TASK_GROUP: Record<string, string> = {
  farm_check_loop: '🌾 农场',
  farm_push_check: '🌾 农场',
  farm_cycle: '🌾 农场',
  friend_check_loop: '👥 好友',
  friend_cycle: '👥 好友',
  friend_check_bootstrap_applications: '👥 好友',
  daily_routine_interval: '📅 每日',
  daily_share: '📅 每日',
  vip_daily_gift: '📅 每日',
  month_card_gift: '📅 每日',
  open_server_gift: '📅 每日',
  illustrated_rewards: '📅 每日',
  email_rewards: '📅 每日',
  mall_free_gifts: '📅 每日',
  task_scan: '📅 每日',
  task_claim_debounce: '📅 每日',
  task_init_bootstrap: '📅 每日',
  unified_next_tick: '⏱ 系统',
  status_sync: '⏱ 系统',
  heartbeat_interval: '⏱ 系统',
  'daily-stats-job': '⏱ 系统',
  'log-cleanup-job': '⏱ 系统',
}

function getTaskGroup(name: string): string {
  if (TASK_GROUP[name]) return TASK_GROUP[name]
  // 动态匹配
  if (name.startsWith('anti_steal_land_')) return '🛡 防偷'
  if (name.startsWith('stakeout_steal_')) return '🔍 蹲守'
  if (name.startsWith('api_timeout_') || name.startsWith('request_timeout_')) return '🌐 网络监控'
  
  // 模糊匹配 key
  for (const [key, group] of Object.entries(TASK_GROUP)) {
    if (name.includes(key)) return group
  }
  return '⚙ 其他'
}

// 获取任务队列显示用的所有任务（合并 runtime + worker 双层数据）
const schedulerTasks = computed(() => {
  const data = schedulerPreview.value
  if (!data) return []

  // 合并 runtime 层（主进程全局任务）和 worker 层（子进程业务任务）
  const runtimeSchedulers = data.runtime?.schedulers || data.schedulers || []
  const workerSchedulers = data.worker?.schedulers || []
  const allSchedulers = [...runtimeSchedulers, ...workerSchedulers]

  if (!allSchedulers.length) return []

  const tasks: any[] = []
  for (const s of allSchedulers) {
    for (const t of (s.tasks || [])) {
      const taskName = t.name || ''
      // 默认隐藏基础设施任务，除非用户打开"显示全部"
      if (!showAllTasks.value && INFRA_TASKS.has(taskName)) continue
      tasks.push({
        ...t,
        namespace: s.namespace,
        group: getTaskGroup(taskName),
      })
    }
  }

  // 智能排序：运行中排最前 → 即将执行 → 按 nextRunAt 升序
  return tasks.sort((a, b) => {
    if (a.running && !b.running) return -1
    if (!a.running && b.running) return 1
    return (a.nextRunAt || Infinity) - (b.nextRunAt || Infinity)
  })
})

// 任务元数据：中文名 + 操作步骤
interface TaskMeta {
  label: string
  steps: string[]
}

const TASK_META: Record<string, TaskMeta> = {
  farm_cycle: {
    label: '🌾 农场巡查',
    steps: [
      '检查所有土地状态',
      '收获成熟作物',
      '清理枯死植株',
      '补种空闲地块',
      '施加化肥加速生长',
      '检测并触发土地升级',
    ],
  },
  farm_check_loop: {
    label: '🌾 农场巡查',
    steps: [
      '检查所有土地状态',
      '收获成熟作物',
      '清理枯死植株',
      '补种空闲地块',
      '施加化肥加速生长',
      '检测并触发土地升级',
    ],
  },
  farm_push_check: {
    label: '📢 收获推送',
    steps: [
      '检测成熟作物推送通知',
      '自动触发收获流程',
    ],
  },
  friend_cycle: {
    label: '👥 好友巡查',
    steps: [
      '获取好友列表',
      '逐个访问好友农场',
      '采摘好友成熟果实',
      '帮好友浇水/除草/除虫',
      '执行捣乱操作（如已开启）',
    ],
  },
  friend_check_loop: {
    label: '👥 好友巡查',
    steps: [
      '获取好友列表',
      '逐个访问好友农场',
      '采摘好友成熟果实',
      '帮好友浇水/除草/除虫',
      '执行捣乱操作（如已开启）',
    ],
  },
  friend_check_bootstrap_applications: {
    label: '📨 好友申请处理',
    steps: [
      '检查待处理好友申请',
      '自动接受符合条件的申请',
    ],
  },
  daily_share: {
    label: '📤 每日分享',
    steps: [
      '检查当日分享状态',
      '执行分享操作',
      '领取分享奖励',
    ],
  },
  vip_daily_gift: {
    label: '👑 会员礼包',
    steps: [
      '检查会员状态',
      '判断是否有可领礼包',
      '领取会员每日礼包',
    ],
  },
  month_card_gift: {
    label: '💳 月卡礼包',
    steps: [
      '检查月卡激活状态',
      '判断今日是否已领取',
      '领取月卡每日奖励',
    ],
  },
  open_server_gift: {
    label: '🧧 开服红包',
    steps: [
      '检查红包活动状态',
      '判断是否有可领红包',
      '领取开服红包奖励',
    ],
  },
  illustrated_rewards: {
    label: '📖 图鉴奖励',
    steps: [
      '检查图鉴完成进度',
      '领取已达成的图鉴奖励',
    ],
  },
  email_rewards: {
    label: '📧 邮件领取',
    steps: [
      '检查游戏邮箱',
      '逐条领取未读邮件奖励',
    ],
  },
  mall_free_gifts: {
    label: '🎁 免费礼包',
    steps: [
      '检查商城免费区',
      '领取所有可用免费礼包',
    ],
  },
  task_scan: {
    label: '✅ 每日任务',
    steps: [
      '扫描可完成的每日任务',
      '自动完成任务条件',
      '领取任务奖励',
    ],
  },
  task_claim_debounce: {
    label: '✅ 任务领取',
    steps: [
      '防抖等待合并请求',
      '批量领取已完成任务奖励',
    ],
  },
  task_init_bootstrap: {
    label: '🔄 任务初始化',
    steps: [
      '初始化任务系统',
      '加载每日任务列表',
    ],
  },
  unified_next_tick: {
    label: '⏱ 统一调度',
    steps: [
      '检查农场巡查是否到期',
      '检查好友巡查是否到期',
      '按优先级执行到期任务',
      '计算下次调度时间',
    ],
  },
  daily_routine_interval: {
    label: '📅 跨日礼包检测',
    steps: [
      '检测是否跨日',
      '触发邮箱奖励领取',
      '触发分享奖励领取',
      '触发月卡/会员/开服礼包领取',
      '触发免费礼包领取',
    ],
  },
  status_sync: {
    label: '📡 状态同步',
    steps: [
      '采集当前账号状态',
      '同步金币/经验/点券数据',
      '推送至管理面板',
    ],
  },
  'daily-stats-job': {
    label: '📊 数据统计归档',
    steps: [
      '归档当日收益数据',
      '清理过期统计记录',
    ],
  },
  'log-cleanup-job': {
    label: '🧹 日志自动清理',
    steps: [
      '扫描过期日志文件',
      '清理超期日志记录',
    ],
  },
  heartbeat_interval: {
    label: '💓 心跳保活',
    steps: [
      '发送心跳包到服务器',
      '检测连接存活状态',
    ],
  },
}

function getTaskDisplayName(name: string) {
  // 精确匹配 TASK_META
  if (TASK_META[name])
    return TASK_META[name].label
  // 动态任务名匹配：防偷抢收 (anti_steal_land_3 → 🛡 防偷抢收 #3)
  const antiStealMatch = name.match(/^anti_steal_land_(\d+)$/)
  if (antiStealMatch)
    return `🛡 防偷抢收 #${antiStealMatch[1]}`
  // 动态任务名匹配：蹲守偷菜 (stakeout_steal_friend_123 → 🔍 蹲守偷菜)
  if (name.startsWith('stakeout_steal_'))
    return '🔍 蹲守偷菜'
  // 日常防抖立即执行
  if (name === 'daily_routine_immediate')
    return '📅 日常任务(快速)'
  // ws 错误清理
  if (name === 'ws_error_cleanup')
    return '🔧 连接错误清理'
  // 踢下线停止
  if (name === 'kickout_stop')
    return '🔌 被踢下线处理'
    
  // 频繁接口访问超时保护控制
  const apiTimeoutMatch = name.match(/^api_timeout_(.*)$/)
  if (apiTimeoutMatch)
    return `🔌 API频率保护`
  const reqTimeoutMatch = name.match(/^request_timeout_(.*)$/)
  if (reqTimeoutMatch)
    return `📡 接口速率限制`
    
  // 模糊匹配
  for (const [key, meta] of Object.entries(TASK_META)) {
    if (name.includes(key))
      return meta.label
  }
  return name
}

function getTaskSteps(name: string): string[] {
  if (TASK_META[name])
    return TASK_META[name].steps
  for (const [key, meta] of Object.entries(TASK_META)) {
    if (name.includes(key))
      return meta.steps
  }
  return []
}

function getTaskKindLabel(kind: string) {
  if (kind === 'interval')
    return '循环'
  if (kind === 'timeout')
    return '单次'
  return kind
}

function getTaskKindClass(kind: string) {
  if (kind === 'interval')
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400'
}

// ========== 任务详情弹窗 ==========
const showTaskDetailModal = ref(false)
const selectedTask = ref<any>(null)

function openTaskDetail(task: any) {
  selectedTask.value = task
  showTaskDetailModal.value = true
}

// ========== 任务倒计时实时刷新 ==========
const taskCountdowns = ref<Record<string, string>>({})

function updateTaskCountdowns() {
  const tasks = schedulerTasks.value
  if (!tasks.length) return
  const now = Date.now()
  const result: Record<string, string> = {}
  for (const t of tasks) {
    const key = `${t.namespace}-${t.name}`
    if (!t.nextRunAt) {
      result[key] = '--'
    } else {
      const diffSec = Math.max(0, Math.floor((t.nextRunAt - now) / 1000))
      if (diffSec <= 0) {
        result[key] = '即将执行'
      } else {
        const h = Math.floor(diffSec / 3600)
        const m = Math.floor((diffSec % 3600) / 60)
        const s = diffSec % 60
        if (h > 0)
          result[key] = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        else
          result[key] = `${m}:${String(s).padStart(2, '0')}`
      }
    }
  }
  taskCountdowns.value = result
}

function getTaskCountdown(task: any) {
  const key = `${task.namespace}-${task.name}`
  return taskCountdowns.value[key] || formatNextRunCountdown(task.nextRunAt)
}

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    // 首次加载、断线兜底时走 HTTP；连接正常时优先走 WS 实时推送
    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
      await statusStore.fetchAccountLogs()
    }

    if (hasActiveLogFilter.value || !realtimeConnected.value) {
      await statusStore.fetchLogs(currentAccountId.value, {
        module: filter.value.module || undefined,
        event: filter.value.event || undefined,
        keyword: filter.value.keyword || undefined,
        isWarn: filter.value.isWarn === 'warn' ? true : filter.value.isWarn === 'info' ? false : undefined,
      })
    }

    // 仅在账号已运行且连接就绪后拉背包，避免启动阶段触发500
    await refreshBag()
    // 拉取土地预览
    await fetchLandsPreview()
    // 拉取任务队列预览
    await fetchSchedulerPreview()
  }
}

function clearFilter() {
  filter.value.module = ''
  filter.value.event = ''
  filter.value.keyword = ''
  filter.value.isWarn = 'all'
  refresh()
}

// 【修复闪烁】监听 accountId 字符串值而非 currentAccount 对象引用
watch(() => currentAccountId.value, () => {
  refresh()
})

watch(() => status.value?.connection?.connected, (connected) => {
  if (connected) {
    refreshBag(true)
    fetchLandsPreview(true)
    fetchSchedulerPreview(true)
  }
})

watch(() => JSON.stringify(status.value?.operations || {}), (next, prev) => {
  if (!realtimeConnected.value || next === prev)
    return
  refreshBag()
  fetchLandsPreview()
  fetchSchedulerPreview()
})

watch(hasActiveLogFilter, (enabled) => {
  statusStore.setRealtimeLogsEnabled(!enabled)
  refresh()
})

function onLogScroll(e: Event) {
  const el = e.target as HTMLElement
  if (!el)
    return
  const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  autoScroll.value = isNearBottom
}

// Auto scroll logs
watch(allLogs, () => {
  nextTick(() => {
    if (logContainer.value && autoScroll.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  })
}, { deep: true })

const settingStore = useSettingStore()

onMounted(() => {
  statusStore.setRealtimeLogsEnabled(!hasActiveLogFilter.value)
  refresh()
  settingStore.fetchTrialCardConfig()
})

// Auto refresh fallback every 10s (WS 断开或筛选条件启用时会回退 HTTP)
useIntervalFn(refresh, 10000)
// Countdown timer (every 1s)
useIntervalFn(updateCountdowns, 1000)
// 任务队列倒计时 (every 1s)
useIntervalFn(updateTaskCountdowns, 1000)

// ============ 体验卡续费横幅 ============
const dashboardTrialRenewing = ref(false)
const trialCountdownText = ref('')

const dashboardCurrentUser = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('current_user') || 'null')
  }
  catch { return null }
})

const showDashboardTrialBanner = computed(() => {
  const user = dashboardCurrentUser.value
  if (!user?.card || user.card.type !== 'T')
    return false
  if (!settingStore.settings.trialConfig.userRenewEnabled)
    return false
  const expires = user.card.expiresAt
  if (!expires)
    return false
  return expires - Date.now() <= 24 * 60 * 60 * 1000
})

const dashboardTrialIsExpired = computed(() => {
  const user = dashboardCurrentUser.value
  if (!user?.card?.expiresAt)
    return false
  return user.card.expiresAt < Date.now()
})

function updateTrialCountdown() {
  const user = dashboardCurrentUser.value
  if (!user?.card?.expiresAt || dashboardTrialIsExpired.value) {
    trialCountdownText.value = ''
    return
  }
  const diff = user.card.expiresAt - Date.now()
  const hours = Math.floor(diff / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
  const seconds = Math.floor((diff % (60 * 1000)) / 1000)
  trialCountdownText.value = `还需要在 ${hours}小时 ${minutes}分 ${seconds}秒 内续费`
}

// 移除本地重复的 updateCountdowns 定义

async function handleDashboardTrialRenew() {
  dashboardTrialRenewing.value = true
  try {
    const res = await api.post('/api/auth/trial-renew')
    if (res.data.ok) {
      const user = { ...dashboardCurrentUser.value, card: res.data.data.card }
      localStorage.setItem('current_user', JSON.stringify(user))
    }
    else {
      console.warn(res.data.error || '续费失败')
    }
  }
  catch (e: any) {
    console.warn(e.response?.data?.error || e.message || '续费异常')
  }
  finally {
    dashboardTrialRenewing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 pt-6 md:h-full">
    <!-- 用户信息卡片 -->
    <UserInfoCard />

    <!-- 体验卡续费横幅 -->
    <div
      v-if="showDashboardTrialBanner"
      class="trial-pulse-banner flex items-center justify-between gap-4 rounded-lg bg-orange-50 px-4 py-3 text-sm shadow dark:bg-orange-900/20"
    >
      <div class="flex items-center gap-2 text-orange-700 dark:text-orange-300">
        <span class="text-lg">⏰</span>
        <span class="font-medium">
          你的体验卡{{ dashboardTrialIsExpired ? '已过期' : '即将过期' }}。{{ trialCountdownText }} 点击一键续费继续使用
        </span>
      </div>
      <button
        :disabled="dashboardTrialRenewing"
        class="shrink-0 rounded-lg bg-orange-500 px-4 py-1.5 text-sm text-white font-medium transition-colors hover:bg-orange-600 disabled:opacity-50"
        @click="handleDashboardTrialRenew"
      >
        {{ dashboardTrialRenewing ? '续费中...' : '🔄 一键续费' }}
      </button>
    </div>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
      <!-- Account & Exp -->
      <div class="glass-panel flex flex-col rounded-lg p-3 shadow">
        <div class="mb-1 flex items-start justify-between">
          <div class="glass-text-muted flex items-center gap-1.5 text-sm">
            <div class="i-fas-user-circle" />
            账号
          </div>
          <div class="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            Lv.{{ status?.status?.level || 0 }}
          </div>
        </div>
        <div class="glass-text-main mb-1 truncate text-xl font-bold" :title="displayName">
          {{ displayName }}
        </div>

        <!-- Level Progress -->
        <div class="mt-auto">
          <div class="glass-text-muted mb-1 flex justify-between text-xs">
            <div class="flex items-center gap-1">
              <div class="i-fas-bolt text-blue-400" />
              <span>EXP</span>
            </div>
            <span>{{ status?.levelProgress?.current || 0 }} / {{ status?.levelProgress?.needed || '?' }}</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-100/50 dark:bg-gray-700/50">
            <div
              class="h-full rounded-full bg-blue-500 transition-all duration-500"
              :style="{ width: `${getExpPercent(status?.levelProgress)}%` }"
            />
          </div>
          <div class="glass-text-muted mt-2 flex justify-between text-xs">
            <span>效率: {{ expRate }}</span>
            <span>{{ timeToLevel }}</span>
          </div>
        </div>
      </div>

      <!-- Assets & Status -->
      <div class="glass-panel flex flex-col justify-between rounded-lg p-3 shadow">
        <div class="flex justify-between">
          <div>
            <div class="glass-text-muted flex items-center gap-1.5 text-xs">
              <div class="i-fas-coins text-yellow-500" />
              金币
            </div>
            <div class="text-2xl text-yellow-600 font-bold dark:text-yellow-500">
              {{ status?.status?.gold || 0 }}
            </div>
            <div
              v-if="(status?.sessionGoldGained || 0) !== 0"
              class="text-[10px]"
              :class="(status?.sessionGoldGained || 0) > 0 ? 'text-green-500' : 'text-red-500'"
            >
              {{ (status?.sessionGoldGained || 0) > 0 ? '+' : '' }}{{ status?.sessionGoldGained || 0 }}
            </div>
          </div>
          <div class="text-right">
            <div class="glass-text-muted flex items-center justify-end gap-1.5 text-xs">
              <div class="i-fas-ticket-alt text-emerald-400" />
              点券
            </div>
            <div class="text-2xl text-emerald-500 font-bold dark:text-emerald-400">
              {{ status?.status?.coupon || 0 }}
            </div>
            <div
              v-if="(status?.sessionCouponGained || 0) !== 0"
              class="text-[10px]"
              :class="(status?.sessionCouponGained || 0) > 0 ? 'text-green-500' : 'text-red-500'"
            >
              {{ (status?.sessionCouponGained || 0) > 0 ? '+' : '' }}{{ status?.sessionCouponGained || 0 }}
            </div>
          </div>
        </div>
        <div class="mt-3 border-t border-gray-100/50 pt-2 dark:border-gray-700/50">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="h-2.5 w-2.5 rounded-full" :class="status?.connection?.connected ? 'bg-green-500' : 'bg-red-500'" />
              <span class="glass-text-main text-xs font-bold">{{ status?.connection?.connected ? '在线' : '离线' }}</span>
            </div>
            <div class="glass-text-muted flex items-center gap-1.5 text-xs">
              <div class="i-fas-clock text-purple-400" />
              {{ formatDuration(localUptime) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Items (Fertilizer & Collection) -->
      <div class="glass-panel flex flex-col justify-between rounded-lg p-3 shadow">
        <div class="glass-text-muted mb-1 flex items-center gap-1.5 text-sm">
          <div class="i-fas-flask text-emerald-400" />
          化肥容器
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-flask text-emerald-400" />
              普通
            </div>
            <div class="glass-text-main font-bold">
              {{ formatBucketTime(fertilizerNormal) }}
            </div>
          </div>
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-vial text-emerald-400" />
              有机
            </div>
            <div class="glass-text-main font-bold">
              {{ formatBucketTime(fertilizerOrganic) }}
            </div>
          </div>
        </div>
        <div class="my-2 border-t border-gray-100/50 dark:border-gray-700/50" />
        <div class="glass-text-muted mb-1 flex items-center gap-1.5 text-sm">
          <div class="i-fas-star text-emerald-400" />
          收藏点
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-bookmark text-emerald-400" />
              普通
            </div>
            <div class="glass-text-main font-bold">
              {{ collectionNormal?.count || 0 }}
            </div>
          </div>
          <div>
            <div class="glass-text-muted flex items-center gap-1 text-xs">
              <div class="i-fas-gem text-emerald-400" />
              典藏
            </div>
            <div class="glass-text-main font-bold">
              {{ collectionRare?.count || 0 }}
            </div>
          </div>
        </div>
      </div>

      <!-- Next Checks -->
      <div class="glass-panel flex flex-col justify-between rounded-lg p-3 shadow">
        <h3 class="glass-text-muted mb-1 flex items-center gap-1.5 text-sm">
          <div class="i-carbon-hourglass" />
          <span>下次巡查倒计时</span>
        </h3>
        <div class="mt-1 flex flex-1 flex-col justify-center gap-2">
          <div class="flex items-center justify-between">
            <div class="glass-text-muted flex items-center gap-1.5 text-xs tracking-wider">
              <div class="i-carbon-sprout text-primary-500" />
              <span>农场</span>
            </div>
            <div class="glass-text-main text-base font-bold font-mono">
              {{ nextFarmCheck }}
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div class="glass-text-muted flex items-center gap-1.5 text-xs tracking-wider">
              <div class="i-carbon-user-multiple text-blue-500" />
              <span>好友</span>
            </div>
            <div class="glass-text-main text-base font-bold font-mono">
              {{ nextFriendCheck }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Flex: 日志 40% + 右侧 60%（纵向分割：农场预览 + 今日统计） -->
    <div class="flex flex-1 flex-col items-stretch gap-4 md:flex-row md:overflow-hidden">
      <!-- 运行日志（左侧 40%） -->
      <div class="flex flex-1 flex-col gap-4 md:w-[40%] md:min-w-0 md:overflow-hidden">
        <div class="glass-panel flex flex-1 flex-col rounded-lg p-4 shadow md:overflow-hidden">
          <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="glass-text-main flex items-center gap-2 text-base font-medium">
              <div class="i-carbon-document" />
              <span>运行日志</span>
            </h3>

            <div class="flex flex-wrap items-center gap-1.5 text-sm">
              <BaseSelect
                v-model="filter.module"
                :options="modules"
                class="w-28"
                @change="refresh"
              />

              <BaseSelect
                v-model="filter.event"
                :options="events"
                class="w-28"
                @change="refresh"
              />

              <BaseSelect
                v-model="filter.isWarn"
                :options="logs"
                class="w-24"
                @change="refresh"
              />

              <BaseInput
                v-model="filter.keyword"
                placeholder="关键词..."
                class="w-28"
                clearable
                @keyup.enter="refresh"
                @clear="refresh"
              />

              <BaseButton
                variant="primary"
                size="sm"
                title="搜索"
                @click="refresh"
              >
                <div class="i-carbon-search text-lg" />
              </BaseButton>
              <BaseButton
                v-if="hasActiveLogFilter"
                variant="danger"
                size="sm"
                class="!px-2"
                title="恢复默认 / 清空过滤"
                @click="clearFilter"
              >
                <div class="i-carbon-close text-lg" />
              </BaseButton>
            </div>
          </div>

          <div ref="logContainer" class="max-h-[50vh] min-h-0 flex-1 overflow-y-auto border border-gray-200/20 rounded bg-transparent p-3 text-xs leading-relaxed font-mono md:max-h-none dark:border-gray-700/20" @scroll="onLogScroll">
            <div v-if="!allLogs.length" class="glass-text-muted py-8 text-center">
              暂无日志
            </div>
            <div v-for="log in allLogs" :key="log.ts + log.msg" class="mb-1 break-all">
              <span class="mr-1.5 select-none opacity-60">[{{ formatLogTime(log.time) }}]</span>
              <span class="mr-1.5 rounded px-1 py-0.5 text-xs font-bold" :class="getLogTagClass(log.tag)">{{ log.tag }}</span>
              <span v-if="log.meta?.event" class="mr-1.5 rounded bg-blue-50/50 px-1 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">{{ getEventLabel(log.meta.event) }}</span>
              <span :class="getLogMsgClass(log.tag)" class="glass-text-main opacity-90">{{ log.msg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧面板（60%）：纵向分割 —— 任务队列预览 + 今日统计 -->
      <div class="flex flex-col gap-4 md:w-[60%] md:min-w-0 md:overflow-hidden">
        <!-- 任务队列预览 -->
        <div class="glass-panel flex flex-1 flex-col rounded-lg p-4 shadow md:overflow-hidden">
          <h3 class="glass-text-main mb-3 flex shrink-0 items-center gap-2 text-base font-medium">
            <div class="i-carbon-task text-indigo-500" />
            <span>任务队列预览</span>
            <span v-if="schedulerTasks.length" class="ml-auto flex items-center gap-2 text-xs font-normal">
              <span class="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">共 {{ schedulerTasks.length }} 个任务</span>
              <span class="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-300">运行中 {{ schedulerTasks.filter((t: any) => t.running).length }}</span>
              <button
                class="rounded px-1.5 py-0.5 text-[10px] transition-colors"
                :class="showAllTasks ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400'"
                @click="showAllTasks = !showAllTasks"
              >
                {{ showAllTasks ? '隐藏内部' : '显示全部' }}
              </button>
            </span>
          </h3>

          <div v-if="!schedulerPreview || !schedulerTasks.length" class="glass-text-muted flex flex-1 items-center justify-center py-6 text-center text-sm">
            <div v-if="!status?.connection?.connected">
              账号未连接，无法获取任务队列
            </div>
            <div v-else>
              正在加载任务队列...
            </div>
          </div>

          <div v-else class="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
            <table class="w-full text-xs">
              <thead class="sticky top-0 z-10 bg-transparent backdrop-blur-xl">
                <tr class="border-b border-gray-200/50 dark:border-white/10 glass-text-muted">
                  <th class="px-2 py-2 text-left font-semibold tracking-wider">分组</th>
                  <th class="px-2 py-2 text-left font-semibold tracking-wider">任务名</th>
                  <th class="px-2 py-2 text-center font-semibold tracking-wider">状态</th>
                  <th class="px-2 py-2 text-right font-semibold tracking-wider">倒计时</th>
                  <th class="px-2 py-2 text-right font-semibold tracking-wider">已执行</th>
                  <th class="px-2 py-2 text-center font-semibold tracking-wider">详情</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="task in schedulerTasks"
                  :key="`${task.namespace}-${task.name}`"
                  class="group border-b border-gray-100/30 transition-colors hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <td class="whitespace-nowrap px-2 py-2 text-[10px]">
                    <span class="rounded bg-black/5 px-1.5 py-0.5 text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      {{ task.group }}
                    </span>
                  </td>
                  <td class="max-w-[180px] truncate px-2 py-1.5 font-medium" :title="task.name">
                    {{ getTaskDisplayName(task.name) }}
                  </td>
                  <td class="px-2 py-1.5 text-center">
                    <span v-if="task.running" class="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                      <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                      执行中
                    </span>
                    <span v-else class="text-gray-400">等待中</span>
                  </td>
                  <td class="px-2 py-1.5 text-right font-mono">
                    {{ getTaskCountdown(task) }}
                  </td>
                  <td class="px-2 py-1.5 text-right">
                    {{ task.runCount || 0 }} 次
                  </td>
                  <td class="px-2 py-1.5 text-center">
                    <button
                      v-if="getTaskSteps(task.name).length"
                      class="rounded px-1.5 py-0.5 text-[10px] text-indigo-600 font-medium transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                      @click="openTaskDetail(task)"
                    >
                      查看
                    </button>
                    <span v-else class="text-gray-300">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 今日统计（保持 2 列，压缩间距） -->
        <div class="glass-panel flex shrink-0 flex-col rounded-lg p-4 shadow">
          <h3 class="glass-text-main mb-3 flex shrink-0 items-center gap-2 text-base font-medium">
            <div class="i-carbon-chart-column" />
            <span>今日统计</span>
          </h3>
          <div class="grid grid-cols-2 content-start gap-1.5 lg:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="(val, key) in (status?.operations || {})"
              :key="key"
              class="flex items-center justify-between rounded-xl bg-black/5 px-3 py-2 transition-colors hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <div class="flex items-center gap-2">
                <div class="text-sm" :class="[getOpIcon(key), getOpColor(key)]" />
                <div class="glass-text-muted text-xs">
                  {{ getOpName(key) }}
                </div>
              </div>
              <div class="text-sm font-bold">
                {{ val }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 任务详情弹窗 -->
    <ConfirmModal
    :show="showTaskDetailModal"
    :title="selectedTask ? getTaskDisplayName(selectedTask.name) : '任务详情'"
    confirm-text="关闭"
    :show-cancel="false"
    @update:show="showTaskDetailModal = $event"
    @confirm="showTaskDetailModal = false"
  >
    <div v-if="selectedTask" class="space-y-4">
      <!-- 任务基本信息 -->
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="rounded px-2 py-0.5 text-xs font-medium" :class="getTaskKindClass(selectedTask.kind)">
          {{ getTaskKindLabel(selectedTask.kind) }}
        </span>
        <span v-if="selectedTask.running" class="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs text-green-700 font-medium dark:bg-green-900/30 dark:text-green-300">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          执行中
        </span>
        <span v-else class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700/30 dark:text-gray-400">
          等待中
        </span>
        <span class="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 font-medium dark:bg-purple-900/30 dark:text-purple-300">
          已执行 {{ selectedTask.runCount || 0 }} 次
        </span>
      </div>

      <!-- 倒计时 -->
      <div class="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700/30">
        <div class="i-carbon-timer text-indigo-500" />
        <span class="glass-text-muted text-sm">距下次执行：</span>
        <span class="text-sm font-bold font-mono">
          {{ getTaskCountdown(selectedTask) }}
        </span>
      </div>

      <!-- 操作步骤流程 -->
      <div v-if="getTaskSteps(selectedTask.name).length">
        <h4 class="glass-text-main mb-2 text-sm font-medium">📋 操作步骤</h4>
        <ol class="ml-1 space-y-1.5">
          <li
            v-for="(step, idx) in getTaskSteps(selectedTask.name)"
            :key="idx"
            class="flex items-start gap-2 text-sm"
          >
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] text-indigo-700 font-bold dark:bg-indigo-900/30 dark:text-indigo-300">
              {{ idx + 1 }}
            </span>
            <span class="glass-text-main">{{ step }}</span>
          </li>
        </ol>
      </div>
    </div>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.trial-pulse-banner {
  border: 1px solid rgba(249, 115, 22, 0.3);
  animation: trial-pulse 2.5s infinite ease-in-out;
}

@keyframes trial-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.3);
  }
  50% {
    box-shadow: 0 0 15px 2px rgba(249, 115, 22, 0.15);
    border-color: rgba(249, 115, 22, 0.6);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.3);
  }
}

.dark .trial-pulse-banner {
  border-color: rgba(249, 115, 22, 0.2);
}
</style>
