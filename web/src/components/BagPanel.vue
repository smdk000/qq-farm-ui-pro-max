<script setup lang="ts">
import type { BagPreferencesPayload } from '@/utils/bag-preference-sync'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseFilterChip from '@/components/ui/BaseFilterChip.vue'
import BaseFilterChips from '@/components/ui/BaseFilterChips.vue'
import BaseToggleOptionGroup from '@/components/ui/BaseToggleOptionGroup.vue'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useFarmStore } from '@/stores/farm'
import { useSettingStore } from '@/stores/setting'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { getBagPreferencesSyncState, resolveBagPreferencesHydrationMode, setBagPreferencesSyncState } from '@/utils/bag-preference-sync'
import { buildTradeSellConfigFromDraft, buildTradeSellStrategyDraft, normalizeTradeKeepFruitIds } from '@/utils/trade-config'

const router = useRouter()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const farmStore = useFarmStore()
const settingStore = useSettingStore()
const statusStore = useStatusStore()
const toast = useToastStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const {
  items,
  dashboardItems,
  monthCardInfos,
  shopSections: rawShopSections,
  mallSections: rawMallSections,
  sellPreview,
  loading: bagLoading,
  mallLoading,
  shopLoading,
  sellPreviewLoading,
  actionLoading,
} = storeToRefs(bagStore)
const { lands, loading: landsLoading } = storeToRefs(farmStore)
const { settings } = storeToRefs(settingStore)
const { status, loading: statusLoading, error: statusError, realtimeConnected } = storeToRefs(statusStore)

const imageErrors = ref<Record<string | number, boolean>>({})
const selectedItemIds = ref<number[]>([])
const purchaseCounts = ref<Record<string, number>>({})
const useCounts = ref<Record<number, number>>({})
const selectedLandIds = ref<number[]>([])
const targetLandsAccountId = ref('')
const lastUseResult = ref<any | null>(null)
const activityHistory = ref<any[]>([])
const expandedActivityKey = ref('')
const refreshingAll = ref(false)
const previewRefreshing = ref(false)
const sellingByPolicy = ref(false)
const activeTab = ref<'bag' | 'shop' | 'sell' | 'mall'>('bag')
const respectPolicyForSelected = ref(true)
const bagQuery = ref('')
const bagCategory = ref<'all' | 'fruit' | 'seed' | 'fertilizer' | 'pack' | 'pet' | 'item'>('all')
const shopQuery = ref('')
const mallQuery = ref('')
const shopQuickFilter = ref<'all' | 'buyable' | 'limited' | 'locked'>('all')
const mallQuickFilter = ref<'all' | 'free' | 'limited' | 'bundle'>('all')
const bagSortBy = ref<'count_desc' | 'name_asc' | 'price_desc' | 'level_desc'>('count_desc')
const shopSortBy = ref<'price_asc' | 'price_desc' | 'name_asc' | 'level_desc'>('price_asc')
const mallSortBy = ref<'recommended' | 'price_asc' | 'price_desc' | 'contents_desc' | 'name_asc'>('recommended')
const activityFilter = ref<'all' | 'use' | 'purchase' | 'sell'>('all')
const bagDetailItem = ref<any | null>(null)
const mallDetailGoods = ref<any | null>(null)
const shopTabKey = ref<'seed' | 'pet' | 'dress'>('seed')
const mallTabKey = ref<'gift' | 'month_card' | 'recharge'>('gift')
const mallPurchaseMemory = ref<Record<string, { count: number, lastPurchasedAt: number, name: string }>>({})
const sellStrategyEditorOpen = ref(false)
const strategySaving = ref(false)
const keepFruitIdsText = ref('')
const initialSellStrategyDraft = buildTradeSellStrategyDraft()
const strategyDraft = ref({
  keepMinEachFruit: initialSellStrategyDraft.keepMinEachFruit,
  rareKeepEnabled: initialSellStrategyDraft.rareKeepEnabled,
  judgeBy: initialSellStrategyDraft.judgeBy,
  minPlantLevel: initialSellStrategyDraft.minPlantLevel,
  minUnitPrice: initialSellStrategyDraft.minUnitPrice,
  batchSize: initialSellStrategyDraft.batchSize,
  previewBeforeManualSell: initialSellStrategyDraft.previewBeforeManualSell,
})

const MALL_PURCHASE_HISTORY_KEY = 'qq-farm.mall.purchase-history.v1'
const LEGACY_BAG_USE_HISTORY_KEY = 'qq-farm.bag.use-history.v1'
const BAG_ACTIVITY_HISTORY_KEY = 'qq-farm.bag.activity-history.v1'
const BAG_PREFERENCES_SYNC_STATE_KEY = 'qq-farm.bag.preferences-sync-state.v1'
const LAND_TARGET_INTERACTIONS = new Set(['water', 'harvest', 'erase', 'erasegrass', 'killbug', 'plant'])
const BAG_ACTIVITY_BROWSER_PREF_NOTE = '交易动态会跟随当前账号同步到服务器；断网或首屏加载时仍会先使用本机缓存兜底。'
const MALL_PURCHASE_BROWSER_PREF_NOTE = '常买推荐会跟随当前账号同步到服务器；本机缓存只负责首屏回显和弱网兜底。'

let bagPreferencesRevision = 0
let bagPreferencesSyncTimer: ReturnType<typeof setTimeout> | null = null
let bagPreferencesPendingSync: {
  accountIdSnapshot: string
  payloadSnapshot: BagPreferencesPayload
  revisionSnapshot: number
} | null = null

const bagSortOptions = [
  { key: 'count_desc', label: '数量优先' },
  { key: 'name_asc', label: '名称排序' },
  { key: 'price_desc', label: '单价优先' },
  { key: 'level_desc', label: '等级优先' },
]

const shopSortOptions = [
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'name_asc', label: '名称排序' },
  { key: 'level_desc', label: '等级优先' },
]

const mallSortOptions = [
  { key: 'recommended', label: '推荐排序' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
  { key: 'contents_desc', label: '内容物优先' },
  { key: 'name_asc', label: '名称排序' },
]

const rareKeepJudgeOptions = [
  { value: 'either', label: '任一条件命中就保留' },
  { value: 'plant_level', label: '仅按作物等级保留' },
  { value: 'unit_price', label: '仅按果实单价保留' },
]

const shopSections = computed(() => {
  const defaults = [
    {
      shopId: 2,
      shopType: 2,
      shopName: '种子商店',
      tabKey: 'seed',
      label: '种子',
      description: '金币购买种子',
      currencyLabel: '金币',
      goods: [],
    },
    {
      shopId: 3,
      shopType: 3,
      shopName: '宠物商店',
      tabKey: 'pet',
      label: '宠物',
      description: '金币购买宠物相关物品',
      currencyLabel: '金币',
      goods: [],
    },
    {
      shopId: 4,
      shopType: 4,
      shopName: '装扮商店',
      tabKey: 'dress',
      label: '装扮',
      description: '金币购买装扮与陈设',
      currencyLabel: '金币',
      goods: [],
    },
  ]
  return defaults.map((section) => {
    const remote = rawShopSections.value.find((row: any) => String(row?.tabKey || '') === section.tabKey)
    return remote
      ? {
          ...section,
          ...remote,
          label: String(remote?.label || remote?.shopName || section.label),
          goods: Array.isArray(remote?.goods) ? remote.goods : [],
          isPlaceholder: false,
        }
      : {
          ...section,
          goods: [],
          isPlaceholder: true,
          error: '当前账号尚未抓到该商店数据',
        }
  })
})

const mallSections = computed(() => {
  const defaults = [
    {
      slotType: 1,
      slotKey: 'gift',
      label: '礼包商城',
      description: '限时礼包、活动礼包与免费福利',
      supportsPurchase: true,
      purchaseHint: '',
      goods: [],
    },
    {
      slotType: 2,
      slotKey: 'month_card',
      label: '月卡商城',
      description: '月卡购买页与月卡奖励状态',
      supportsPurchase: false,
      purchaseHint: '月卡购买需在游戏内完成支付',
      goods: [],
    },
    {
      slotType: 3,
      slotKey: 'recharge',
      label: '充值商城',
      description: '钻石充值页，仅展示价格与档位',
      supportsPurchase: false,
      purchaseHint: '充值类商品需在游戏内完成支付',
      goods: [],
    },
  ]
  return defaults.map((section) => {
    const remote = rawMallSections.value.find((row: any) => String(row?.slotKey || '') === section.slotKey || Number(row?.slotType || 0) === section.slotType)
    return remote
      ? {
          ...section,
          ...remote,
          goods: Array.isArray(remote?.goods) ? remote.goods : [],
        }
      : section
  })
})

const currentShopSection = computed(() => {
  return shopSections.value.find((section: any) => String(section?.tabKey || '') === shopTabKey.value) || shopSections.value[0] || null
})

const currentMallSection = computed(() => {
  return mallSections.value.find((section: any) => String(section?.slotKey || '') === mallTabKey.value) || mallSections.value[0] || null
})

const claimableMonthCardCount = computed(() => {
  return monthCardInfos.value.filter((info: any) => !!info?.canClaim).length
})

const allTradeGoods = computed(() => {
  return [...shopSections.value, ...mallSections.value]
    .flatMap((section: any) => Array.isArray(section?.goods) ? section.goods : [])
})

function resolveBagCategory(item: any) {
  if (item?.category === 'fruit')
    return 'fruit'
  if (item?.category === 'seed')
    return 'seed'
  if (item?.interactionType === 'fertilizer' || item?.interactionType === 'fertilizerpro' || Number(item?.itemType || 0) === 7)
    return 'fertilizer'
  if (Number(item?.itemType || 0) === 11)
    return 'pack'
  if (Number(item?.itemType || 0) === 9)
    return 'pet'
  return 'item'
}

function getBagCategoryLabel(category: string) {
  if (category === 'fruit')
    return '果实'
  if (category === 'seed')
    return '种子'
  if (category === 'fertilizer')
    return '化肥'
  if (category === 'pack')
    return '礼包'
  if (category === 'pet')
    return '狗粮'
  return '道具'
}

function getItemFallbackLabel(item: any) {
  const category = resolveBagCategory(item)
  if (category === 'fruit')
    return 'FR'
  if (category === 'seed')
    return 'SD'
  if (category === 'fertilizer')
    return 'FT'
  if (category === 'pack')
    return 'BX'
  if (category === 'pet')
    return 'DG'
  return 'IT'
}

function getTradeEntryKey(goods: any) {
  const entryKey = String(goods?.entryKey || '').trim()
  if (entryKey)
    return entryKey
  const sourceType = String(goods?.sourceType || 'mall')
  const scope = sourceType === 'shop'
    ? String(goods?.tabKey || goods?.shopId || 'shop')
    : String(goods?.slotKey || goods?.slotType || 'gift')
  const goodsId = Number(goods?.goodsId || 0)
  return `${sourceType}:${scope}:${goodsId}`
}

function getPurchaseCounterKey(target: any) {
  if (target && typeof target === 'object')
    return getTradeEntryKey(target)
  const numericId = Number(target || 0)
  if (numericId > 0)
    return String(numericId)
  return String(target || '').trim() || 'unknown'
}

function getPurchaseHistoryKeys(target: any) {
  if (!target)
    return []
  if (typeof target === 'object') {
    const keys = [getTradeEntryKey(target)]
    const goodsId = Number(target?.goodsId || 0)
    if (goodsId > 0 && String(target?.sourceType || '') !== 'shop')
      keys.push(String(goodsId))
    return Array.from(new Set(keys.filter(Boolean)))
  }
  const numericId = Number(target || 0)
  if (numericId > 0)
    return [String(numericId)]
  const text = String(target || '').trim()
  return text ? [text] : []
}

function getGoodsSourceLabel(goods: any) {
  if (String(goods?.sourceType || '') === 'shop')
    return String(goods?.shopName || goods?.label || '商店')
  return String(goods?.slotLabel || goods?.label || '商城')
}

function getItemMetaLine(item: any) {
  const segments: string[] = [getBagCategoryLabel(resolveBagCategory(item))]
  if (Number(item?.level || 0) > 0)
    segments.push(`Lv${Number(item.level || 0)}`)
  if (Number(item?.price || 0) > 0)
    segments.push(`${Number(item.price || 0)}金`)
  return segments.join(' · ')
}

function getItemAccentClass(item: any) {
  const category = resolveBagCategory(item)
  if (category === 'fruit')
    return 'inventory-card-fruit'
  if (category === 'seed')
    return 'inventory-card-seed'
  if (category === 'fertilizer')
    return 'inventory-card-fertilizer'
  if (category === 'pack')
    return 'inventory-card-pack'
  if (category === 'pet')
    return 'inventory-card-pet'
  return 'inventory-card-item'
}

function getRarityLabel(rarity: number) {
  const value = Math.max(0, Number(rarity || 0))
  if (value >= 5)
    return '传说'
  if (value >= 4)
    return '珍稀'
  if (value >= 3)
    return '稀有'
  if (value >= 2)
    return '优良'
  return '普通'
}

function getItemDescription(item: any) {
  return String(item?.effectDesc || item?.desc || '').trim()
}

function getItemStatusTags(item: any) {
  const tags: string[] = []
  if (item?.canPlant)
    tags.push('可种植')
  if (item?.canUse)
    tags.push('可使用')
  if (item?.category === 'fruit')
    tags.push('可出售')
  if (item?.locked)
    tags.push('未解锁')
  if (Number(item?.rarity || 0) >= 4)
    tags.push('高稀有')
  return tags
}

function getBagCategoryHint(item: any) {
  const category = resolveBagCategory(item)
  if (category === 'seed')
    return item?.canPlant ? '优先留意可种植与等级要求，适合和背包优先策略一起判断。' : '当前更适合作为收藏或等待等级、土地条件满足后再消耗。'
  if (category === 'fruit')
    return '可加入出售策略，也可以按保留规则继续囤货。'
  if (category === 'fertilizer')
    return '用于补充普通/有机化肥容器，建议结合自动购肥与今日状态一起查看。'
  if (category === 'pack')
    return '开启后通常会获得种子、化肥或礼包奖励。'
  if (category === 'pet')
    return '宠物与狗粮类物品，建议结合宠物状态一起判断是否消耗。'
  return '可在详情里查看用途、交互类型和可执行动作。'
}

function getItemLongDescription(item: any) {
  const segments = [String(item?.desc || '').trim(), String(item?.effectDesc || '').trim()].filter(Boolean)
  return Array.from(new Set(segments))
}

function itemNeedsLandSelection(item: any) {
  return LAND_TARGET_INTERACTIONS.has(String(item?.interactionType || '').toLowerCase())
}

function normalizeLandStatusLabel(land: any) {
  const statusValue = String(land?.status || '')
  if (statusValue === 'harvestable')
    return '可收获'
  if (statusValue === 'growing')
    return '生长中'
  if (statusValue === 'dead')
    return '已枯萎'
  if (statusValue === 'empty')
    return '空地'
  if (statusValue === 'locked')
    return '未解锁'
  return statusValue || '未知'
}

function getLandSuggestionReason(item: any, land: any) {
  const type = String(item?.interactionType || '').toLowerCase()
  if (type === 'water')
    return !!land?.needWater
  if (type === 'erasegrass')
    return !!land?.needWeed
  if (type === 'killbug')
    return !!land?.needBug
  if (type === 'harvest')
    return String(land?.status || '') === 'harvestable'
  if (type === 'erase')
    return ['growing', 'dead', 'harvestable'].includes(String(land?.status || ''))
  if (type === 'plant')
    return String(land?.status || '') === 'empty'
  return false
}

const availableTargetLands = computed(() => {
  return (Array.isArray(lands.value) ? lands.value : []).filter((land: any) => !!land?.unlocked && Number(land?.id || 0) > 0)
})

const suggestedTargetLandIds = computed(() => {
  if (!bagDetailItem.value || !itemNeedsLandSelection(bagDetailItem.value))
    return []
  return availableTargetLands.value
    .filter((land: any) => getLandSuggestionReason(bagDetailItem.value, land))
    .map((land: any) => Number(land.id || 0))
})

function getSafeStorage() {
  if (typeof window === 'undefined')
    return null
  return window.localStorage
}

function cloneJsonValue<T>(value: T, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback)) as T
  }
  catch {
    return fallback
  }
}

function buildBagPreferencesPayload(): BagPreferencesPayload {
  return {
    purchaseMemory: cloneJsonValue(mallPurchaseMemory.value, {}),
    activityHistory: cloneJsonValue(activityHistory.value, []),
  }
}

function buildBagPreferencesSyncSnapshot(
  accountIdSnapshot = String(currentAccountId.value || '').trim(),
  payloadSnapshot: BagPreferencesPayload = buildBagPreferencesPayload(),
  revisionSnapshot = bagPreferencesRevision,
) {
  if (!accountIdSnapshot)
    return null
  return {
    accountIdSnapshot,
    payloadSnapshot,
    revisionSnapshot,
  }
}

function getBagPreferencesSyncStateForAccount(accountIdSnapshot: string) {
  return getBagPreferencesSyncState(getSafeStorage(), BAG_PREFERENCES_SYNC_STATE_KEY, accountIdSnapshot)
}

function markBagPreferencesDirty(accountIdSnapshot: string) {
  setBagPreferencesSyncState(getSafeStorage(), BAG_PREFERENCES_SYNC_STATE_KEY, accountIdSnapshot, {
    dirty: true,
    updatedAt: Date.now(),
  })
}

function markBagPreferencesSynced(accountIdSnapshot: string) {
  setBagPreferencesSyncState(getSafeStorage(), BAG_PREFERENCES_SYNC_STATE_KEY, accountIdSnapshot, {
    dirty: false,
    lastSyncedAt: Date.now(),
  })
}

function applyBagPreferencesPayload(payload: BagPreferencesPayload | null | undefined) {
  mallPurchaseMemory.value = payload?.purchaseMemory && typeof payload.purchaseMemory === 'object'
    ? cloneJsonValue(payload.purchaseMemory, {})
    : {}
  activityHistory.value = Array.isArray(payload?.activityHistory)
    ? cloneJsonValue(payload.activityHistory, [])
    : []
}

function loadMallPurchaseMemory() {
  const storage = getSafeStorage()
  if (!storage || !currentAccountId.value) {
    mallPurchaseMemory.value = {}
    return
  }
  try {
    const raw = storage.getItem(MALL_PURCHASE_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const accountMemory = parsed?.[currentAccountId.value]
    mallPurchaseMemory.value = accountMemory && typeof accountMemory === 'object' ? accountMemory : {}
  }
  catch {
    mallPurchaseMemory.value = {}
  }
}

function loadActivityHistory() {
  const storage = getSafeStorage()
  if (!storage || !currentAccountId.value) {
    activityHistory.value = []
    return
  }
  try {
    const raw = storage.getItem(BAG_ACTIVITY_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const accountHistory = parsed?.[currentAccountId.value]
    if (Array.isArray(accountHistory)) {
      activityHistory.value = accountHistory
      return
    }
    const legacyRaw = storage.getItem(LEGACY_BAG_USE_HISTORY_KEY)
    const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : {}
    const legacyHistory = Array.isArray(legacyParsed?.[currentAccountId.value]) ? legacyParsed[currentAccountId.value] : []
    activityHistory.value = legacyHistory
      .slice(0, 30)
      .map((entry: any) => ({
        ...entry,
        type: 'use',
        title: `${String(entry?.itemName || `物品#${Number(entry?.itemId || 0)}`)} x${Number(entry?.count || 1)}`,
        summary: String(entry?.rewardSummary || '使用成功'),
        details: Array.isArray(entry?.rewardItems)
          ? entry.rewardItems.slice(0, 8).map((reward: any) => ({
              id: Number(reward?.id || 0),
              name: String(reward?.name || `物品#${Number(reward?.id || 0)}`),
              count: Number(reward?.count || 0),
              image: String(reward?.image || ''),
              meta: reward?.effectDesc || reward?.desc || '',
            }))
          : [],
      }))
    if (activityHistory.value.length)
      persistActivityHistory()
  }
  catch {
    activityHistory.value = []
  }
}

function persistMallPurchaseMemory(
  accountIdSnapshot = String(currentAccountId.value || '').trim(),
  purchaseMemorySnapshot = mallPurchaseMemory.value,
) {
  const storage = getSafeStorage()
  if (!storage || !accountIdSnapshot)
    return
  try {
    const raw = storage.getItem(MALL_PURCHASE_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    parsed[accountIdSnapshot] = cloneJsonValue(purchaseMemorySnapshot, {})
    storage.setItem(MALL_PURCHASE_HISTORY_KEY, JSON.stringify(parsed))
  }
  catch {
  }
}

function persistActivityHistory(
  accountIdSnapshot = String(currentAccountId.value || '').trim(),
  activityHistorySnapshot = activityHistory.value,
) {
  const storage = getSafeStorage()
  if (!storage || !accountIdSnapshot)
    return
  try {
    const raw = storage.getItem(BAG_ACTIVITY_HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    parsed[accountIdSnapshot] = cloneJsonValue(activityHistorySnapshot, [])
    storage.setItem(BAG_ACTIVITY_HISTORY_KEY, JSON.stringify(parsed))
  }
  catch {
  }
}

function persistBagPreferencesLocally(
  accountIdSnapshot = String(currentAccountId.value || '').trim(),
  payloadSnapshot: BagPreferencesPayload = buildBagPreferencesPayload(),
) {
  persistMallPurchaseMemory(accountIdSnapshot, payloadSnapshot.purchaseMemory || {})
  persistActivityHistory(accountIdSnapshot, payloadSnapshot.activityHistory || [])
}

function clearBagPreferencesSyncTimer() {
  if (bagPreferencesSyncTimer) {
    clearTimeout(bagPreferencesSyncTimer)
    bagPreferencesSyncTimer = null
  }
}

async function syncBagPreferencesSnapshot(
  snapshot: NonNullable<ReturnType<typeof buildBagPreferencesSyncSnapshot>>,
  options: { applyIfCurrent?: boolean } = {},
) {
  const saved = await bagStore.saveBagPreferences(snapshot.accountIdSnapshot, snapshot.payloadSnapshot)
  if (!saved)
    return false

  markBagPreferencesSynced(snapshot.accountIdSnapshot)
  persistBagPreferencesLocally(snapshot.accountIdSnapshot, saved)

  if (
    options.applyIfCurrent !== false
    && String(currentAccountId.value || '').trim() === snapshot.accountIdSnapshot
    && bagPreferencesRevision === snapshot.revisionSnapshot
  ) {
    applyBagPreferencesPayload(saved)
  }

  if (
    bagPreferencesPendingSync
    && bagPreferencesPendingSync.accountIdSnapshot === snapshot.accountIdSnapshot
    && bagPreferencesPendingSync.revisionSnapshot === snapshot.revisionSnapshot
  ) {
    bagPreferencesPendingSync = null
  }

  return true
}

async function flushBagPreferencesSync(options: {
  snapshot?: ReturnType<typeof buildBagPreferencesSyncSnapshot>
  includeCurrentDirty?: boolean
  applyIfCurrent?: boolean
} = {}) {
  let snapshot = options.snapshot || bagPreferencesPendingSync

  if (!snapshot && options.includeCurrentDirty) {
    const currentAccountIdSnapshot = String(currentAccountId.value || '').trim()
    if (currentAccountIdSnapshot && getBagPreferencesSyncStateForAccount(currentAccountIdSnapshot).dirty) {
      snapshot = buildBagPreferencesSyncSnapshot(currentAccountIdSnapshot)
    }
  }

  if (!snapshot)
    return false

  clearBagPreferencesSyncTimer()
  return await syncBagPreferencesSnapshot(snapshot, { applyIfCurrent: options.applyIfCurrent })
}

function scheduleBagPreferencesSync(snapshot: ReturnType<typeof buildBagPreferencesSyncSnapshot> = buildBagPreferencesSyncSnapshot()) {
  if (!snapshot)
    return
  bagPreferencesPendingSync = snapshot
  clearBagPreferencesSyncTimer()
  bagPreferencesSyncTimer = setTimeout(() => {
    void flushBagPreferencesSync({
      snapshot,
      applyIfCurrent: true,
    })
  }, 240)
}

function persistBagPreferences() {
  bagPreferencesRevision += 1
  const snapshot = buildBagPreferencesSyncSnapshot()
  if (!snapshot)
    return
  persistBagPreferencesLocally(snapshot.accountIdSnapshot, snapshot.payloadSnapshot)
  markBagPreferencesDirty(snapshot.accountIdSnapshot)
  scheduleBagPreferencesSync(snapshot)
}

async function hydrateBagPreferences() {
  const accountIdSnapshot = String(currentAccountId.value || '').trim()
  if (!accountIdSnapshot)
    return
  const revisionSnapshot = bagPreferencesRevision
  const localSnapshot = buildBagPreferencesPayload()
  const syncState = getBagPreferencesSyncStateForAccount(accountIdSnapshot)
  const serverSnapshot = await bagStore.fetchBagPreferences(accountIdSnapshot)
  if (String(currentAccountId.value || '').trim() !== accountIdSnapshot)
    return
  if (bagPreferencesRevision !== revisionSnapshot)
    return

  const hydrationMode = resolveBagPreferencesHydrationMode({
    localPayload: localSnapshot,
    remotePayload: serverSnapshot,
    syncState,
  })

  if (hydrationMode === 'prefer_local_dirty' || hydrationMode === 'migrate_local') {
    const migrated = await bagStore.saveBagPreferences(accountIdSnapshot, localSnapshot)
    if (String(currentAccountId.value || '').trim() !== accountIdSnapshot)
      return
    if (bagPreferencesRevision !== revisionSnapshot)
      return
    if (!migrated) {
      markBagPreferencesDirty(accountIdSnapshot)
      applyBagPreferencesPayload(localSnapshot)
      persistBagPreferencesLocally(accountIdSnapshot, localSnapshot)
      return
    }
    markBagPreferencesSynced(accountIdSnapshot)
    applyBagPreferencesPayload(migrated)
    persistBagPreferencesLocally(accountIdSnapshot, migrated)
    return
  }

  if (hydrationMode === 'prefer_remote' && serverSnapshot) {
    markBagPreferencesSynced(accountIdSnapshot)
    applyBagPreferencesPayload(serverSnapshot)
    persistBagPreferencesLocally(accountIdSnapshot, serverSnapshot)
  }
}

function getMallPurchaseStats(target: any) {
  let count = 0
  let lastPurchasedAt = 0
  let name = ''
  for (const key of getPurchaseHistoryKeys(target)) {
    const row = mallPurchaseMemory.value[key] || null
    if (!row)
      continue
    count += Number(row?.count || 0)
    lastPurchasedAt = Math.max(lastPurchasedAt, Number(row?.lastPurchasedAt || 0))
    if (!name && row?.name)
      name = String(row.name)
  }
  return { count, lastPurchasedAt, name }
}

function syncSellStrategyDraft() {
  const normalized = buildTradeSellStrategyDraft(settings.value?.tradeConfig)
  strategyDraft.value = {
    keepMinEachFruit: normalized.keepMinEachFruit,
    rareKeepEnabled: normalized.rareKeepEnabled,
    judgeBy: normalized.judgeBy,
    minPlantLevel: normalized.minPlantLevel,
    minUnitPrice: normalized.minUnitPrice,
    batchSize: normalized.batchSize,
    previewBeforeManualSell: normalized.previewBeforeManualSell,
  }
  keepFruitIdsText.value = normalized.keepFruitIds.join(', ')
}

const strategyDraftKeepFruitIds = computed(() => normalizeTradeKeepFruitIds(keepFruitIdsText.value))
const strategyDraftKeepFruitIdSet = computed(() => new Set(strategyDraftKeepFruitIds.value))

const sellStrategyDirty = computed(() => {
  const current = buildTradeSellStrategyDraft(settings.value?.tradeConfig)
  const draft = buildTradeSellStrategyDraft({
    sell: buildTradeSellConfigFromDraft(strategyDraft.value, keepFruitIdsText.value),
  })
  return JSON.stringify(current) !== JSON.stringify(draft)
})

const sellStrategyFruitCandidates = computed(() => {
  return items.value
    .filter((item: any) => resolveBagCategory(item) === 'fruit')
    .map((item: any) => ({
      id: Number(item?.id || 0),
      name: String(item?.name || `果实#${Number(item?.id || 0)}`),
      count: Number(item?.count || 0),
      price: Number(item?.price || 0),
      level: Number(item?.level || 0),
    }))
    .filter((item: any) => item.id > 0)
    .sort((a: any, b: any) => {
      if (b.price !== a.price)
        return b.price - a.price
      if (b.level !== a.level)
        return b.level - a.level
      if (b.count !== a.count)
        return b.count - a.count
      return a.id - b.id
    })
})

function toggleStrategyKeepFruit(itemId: number) {
  const next = new Set(strategyDraftKeepFruitIds.value)
  if (next.has(itemId))
    next.delete(itemId)
  else
    next.add(itemId)
  keepFruitIdsText.value = Array.from(next).sort((a, b) => a - b).join(', ')
}

function applySellStrategyPreset(type: 'conservative' | 'balanced' | 'clear') {
  if (type === 'conservative') {
    strategyDraft.value.keepMinEachFruit = 8
    strategyDraft.value.rareKeepEnabled = true
    strategyDraft.value.judgeBy = 'either'
    strategyDraft.value.minPlantLevel = 25
    strategyDraft.value.minUnitPrice = 800
    strategyDraft.value.batchSize = 10
    strategyDraft.value.previewBeforeManualSell = true
    return
  }
  if (type === 'balanced') {
    strategyDraft.value.keepMinEachFruit = 3
    strategyDraft.value.rareKeepEnabled = true
    strategyDraft.value.judgeBy = 'either'
    strategyDraft.value.minPlantLevel = 40
    strategyDraft.value.minUnitPrice = 2000
    strategyDraft.value.batchSize = 15
    strategyDraft.value.previewBeforeManualSell = true
    return
  }
  strategyDraft.value.keepMinEachFruit = 0
  strategyDraft.value.rareKeepEnabled = false
  strategyDraft.value.judgeBy = 'either'
  strategyDraft.value.minPlantLevel = 40
  strategyDraft.value.minUnitPrice = 2000
  strategyDraft.value.batchSize = 15
  strategyDraft.value.previewBeforeManualSell = true
}

async function saveSellStrategy() {
  if (!currentAccountId.value)
    return
  strategySaving.value = true
  try {
    const payload = JSON.parse(JSON.stringify(settings.value || {}))
    payload.tradeConfig = {
      ...(payload.tradeConfig || {}),
      sell: buildTradeSellConfigFromDraft(strategyDraft.value, keepFruitIdsText.value),
    }
    const result = await settingStore.saveSettings(currentAccountId.value, payload)
    if (!result?.ok) {
      toast.error(result?.error || '出售策略保存失败')
      return
    }
    sellStrategyEditorOpen.value = false
    await bagStore.fetchSellPreview(currentAccountId.value)
    toast.success('出售策略已保存并刷新预览')
  }
  finally {
    strategySaving.value = false
  }
}

function openFullSettings() {
  router.push({ name: 'Settings' })
}

function recordMallPurchase(goods: any, count: number) {
  const key = getTradeEntryKey(goods)
  const current = getMallPurchaseStats(goods)
  mallPurchaseMemory.value = {
    ...mallPurchaseMemory.value,
    [key]: {
      count: current.count + Math.max(1, Number(count || 1)),
      lastPurchasedAt: Date.now(),
      name: String(goods?.name || current.name || `商品#${Number(goods?.goodsId || 0)}`),
    },
  }
  persistBagPreferences()
}

function formatPurchaseTime(ts: number) {
  if (!ts)
    return '未购买'
  const delta = Date.now() - ts
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < hour)
    return `${Math.max(1, Math.floor(delta / minute) || 1)} 分钟前`
  if (delta < day)
    return `${Math.max(1, Math.floor(delta / hour) || 1)} 小时前`
  return `${Math.max(1, Math.floor(delta / day) || 1)} 天前`
}

function clearActivityHistory() {
  activityHistory.value = []
  persistBagPreferences()
  expandedActivityKey.value = ''
}

function recordActivityEntry(entry: any) {
  activityHistory.value = [entry, ...activityHistory.value].slice(0, 30)
  persistBagPreferences()
}

function recordUseActivity(item: any, result: any) {
  const entry = {
    ts: Date.now(),
    itemId: Number(item?.id || result?.itemId || 0),
    itemName: String(item?.name || `物品#${Number(item?.id || result?.itemId || 0)}`),
    count: Number(result?.count || 1),
    landIds: Array.isArray(result?.landIds) ? result.landIds.map((id: any) => Number(id || 0)).filter((id: number) => id > 0) : [],
    rewardSummary: String(result?.rewardSummary || result?.message || ''),
    rewardItems: Array.isArray(result?.rewardItems) ? result.rewardItems.slice(0, 8) : [],
    interactionType: String(item?.interactionType || ''),
  }
  recordActivityEntry({
    ...entry,
    type: 'use',
    title: `${entry.itemName} x${entry.count}`,
    summary: entry.rewardSummary || '使用成功',
    details: entry.rewardItems.map((reward: any) => ({
      id: Number(reward?.id || 0),
      name: String(reward?.name || `物品#${Number(reward?.id || 0)}`),
      count: Number(reward?.count || 0),
      image: String(reward?.image || ''),
      meta: reward?.effectDesc || reward?.desc || '',
    })),
  })
}

const filteredActivityHistory = computed(() => {
  return activityHistory.value.filter((entry: any) => {
    if (activityFilter.value === 'all')
      return true
    return String(entry?.type || '') === activityFilter.value
  })
})
const recentActivityHistory = computed(() => filteredActivityHistory.value.slice(0, 8))
const activityFilterOptions = computed(() => {
  const counts = {
    all: activityHistory.value.length,
    use: 0,
    purchase: 0,
    sell: 0,
  }
  activityHistory.value.forEach((entry: any) => {
    const type = String(entry?.type || '')
    if (type === 'use' || type === 'purchase' || type === 'sell')
      counts[type] += 1
  })
  return [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'use', label: '使用', count: counts.use },
    { key: 'purchase', label: '购买', count: counts.purchase },
    { key: 'sell', label: '出售', count: counts.sell },
  ] as const
})

function buildSellActivitySummary(result: any) {
  const rows = Array.isArray(result?.plan?.items) ? result.plan.items.filter((item: any) => Number(item?.sellCount || 0) > 0) : []
  const headline = rows
    .slice(0, 3)
    .map((item: any) => `${item.name}x${item.sellCount}`)
    .join(' / ')
  const extra = rows.length > 3 ? ` 等${rows.length}种` : ''
  const gold = Number(result?.goldEarned || 0)
  if (headline)
    return `${headline}${extra}${gold > 0 ? ` · +${gold}金币` : ''}`
  if (gold > 0)
    return `获得 ${gold} 金币`
  return String(result?.message || '出售完成')
}

function buildSellActivityDetails(result: any) {
  const rows = Array.isArray(result?.plan?.items) ? result.plan.items.filter((item: any) => Number(item?.sellCount || 0) > 0) : []
  return rows.slice(0, 8).map((item: any) => ({
    id: Number(item?.id || 0),
    name: String(item?.name || `物品#${Number(item?.id || 0)}`),
    count: Number(item?.sellCount || 0),
    image: String(item?.image || ''),
    meta: `${Number(item?.unitPrice || 0)}金/个 · 小计 ${Number(item?.sellValue || 0)}金`,
  }))
}

function getActivityKey(entry: any) {
  return `${String(entry?.type || 'unknown')}-${Number(entry?.ts || 0)}-${String(entry?.entryKey || entry?.goodsId || entry?.itemId || 0)}`
}

function toggleActivityExpanded(entry: any) {
  const key = getActivityKey(entry)
  expandedActivityKey.value = expandedActivityKey.value === key ? '' : key
}

function isActivityExpanded(entry: any) {
  return expandedActivityKey.value === getActivityKey(entry)
}

function getLandSelectionHint(item: any) {
  const type = String(item?.interactionType || '').toLowerCase()
  if (type === 'water')
    return '优先选择缺水土地'
  if (type === 'erasegrass')
    return '优先选择有杂草的土地'
  if (type === 'killbug')
    return '优先选择有虫害的土地'
  if (type === 'harvest')
    return '优先选择可收获土地'
  if (type === 'erase')
    return '优先选择正在生长或已枯萎的土地'
  if (type === 'plant')
    return '优先选择空地'
  return '请选择目标土地'
}

function getImageErrorKey(scope: string, primaryId: number | string, secondaryId?: number | string) {
  return `${scope}-${primaryId}${secondaryId === undefined ? '' : `-${secondaryId}`}`
}

const bagCategoryOptions = computed(() => {
  const counts = {
    all: items.value.length,
    fruit: 0,
    seed: 0,
    fertilizer: 0,
    pack: 0,
    pet: 0,
    item: 0,
  }
  for (const item of items.value) {
    counts[resolveBagCategory(item) as keyof typeof counts] += 1
  }
  return [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'fruit', label: '果实', count: counts.fruit },
    { key: 'seed', label: '种子', count: counts.seed },
    { key: 'fertilizer', label: '化肥', count: counts.fertilizer },
    { key: 'pack', label: '礼包', count: counts.pack },
    { key: 'pet', label: '狗粮', count: counts.pet },
    { key: 'item', label: '道具', count: counts.item },
  ]
})

const filteredItems = computed(() => {
  const keyword = bagQuery.value.trim().toLowerCase()
  const list = items.value.filter((item: any) => {
    const category = resolveBagCategory(item)
    if (bagCategory.value !== 'all' && category !== bagCategory.value)
      return false
    if (!keyword)
      return true
    const haystack = [
      String(item?.name || ''),
      String(item?.id || ''),
      getBagCategoryLabel(category),
      String(item?.interactionType || ''),
    ].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
  list.sort((a: any, b: any) => {
    if (bagSortBy.value === 'name_asc')
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
    if (bagSortBy.value === 'price_desc')
      return Number(b?.price || 0) - Number(a?.price || 0) || Number(b?.count || 0) - Number(a?.count || 0)
    if (bagSortBy.value === 'level_desc')
      return Number(b?.level || 0) - Number(a?.level || 0) || Number(b?.count || 0) - Number(a?.count || 0)
    return Number(b?.count || 0) - Number(a?.count || 0) || Number(a?.id || 0) - Number(b?.id || 0)
  })
  return list
})

const shopFilterOptions = computed(() => {
  const goods = Array.isArray(currentShopSection.value?.goods) ? currentShopSection.value.goods : []
  const buyable = goods.filter((row: any) => !!row?.supportsPurchase).length
  const limited = goods.filter((row: any) => !!row?.isLimited).length
  const locked = goods.filter((row: any) => row?.unlocked === false).length
  return [
    { key: 'all', label: '全部', count: goods.length },
    { key: 'buyable', label: '可购买', count: buyable },
    { key: 'limited', label: '限购', count: limited },
    { key: 'locked', label: '待解锁', count: locked },
  ]
})

const mallFilterOptions = computed(() => {
  const goods = Array.isArray(currentMallSection.value?.goods) ? currentMallSection.value.goods : []
  const all = goods.length
  const free = goods.filter((row: any) => row?.isFree).length
  const limited = goods.filter((row: any) => row?.isLimited).length
  const bundle = goods.filter((row: any) => (row?.itemIds?.length || 0) > 1).length
  return [
    { key: 'all', label: '全部', count: all },
    { key: 'free', label: '免费', count: free },
    { key: 'limited', label: '限购', count: limited },
    { key: 'bundle', label: '礼包', count: bundle },
  ]
})

function setBagCategory(value: string) {
  if (['all', 'fruit', 'seed', 'fertilizer', 'pack', 'pet', 'item'].includes(value))
    bagCategory.value = value as typeof bagCategory.value
}

function setShopQuickFilter(value: string) {
  if (['all', 'buyable', 'limited', 'locked'].includes(value))
    shopQuickFilter.value = value as typeof shopQuickFilter.value
}

function setMallQuickFilter(value: string) {
  if (['all', 'free', 'limited', 'bundle'].includes(value))
    mallQuickFilter.value = value as typeof mallQuickFilter.value
}

function getMallRecommendationScore(goods: any) {
  const stats = getMallPurchaseStats(goods)
  const recencyWindow = 7 * 24 * 60 * 60 * 1000
  const recencyBoost = stats.lastPurchasedAt > 0
    ? Math.max(0, recencyWindow - (Date.now() - stats.lastPurchasedAt)) / (24 * 60 * 60 * 1000)
    : 0
  return (
    stats.count * 1000
    + recencyBoost * 100
    + (goods?.isFree ? 40 : 0)
    + (goods?.isLimited ? 20 : 0)
    + (String(goods?.sourceType || '') === 'shop' ? 10 : 0)
    + Math.max(0, 20 - Number(goods?.priceValue || 0))
  )
}

const filteredShopGoods = computed(() => {
  const keyword = shopQuery.value.trim().toLowerCase()
  const list = (Array.isArray(currentShopSection.value?.goods) ? currentShopSection.value.goods : []).filter((goods: any) => {
    if (shopQuickFilter.value === 'buyable' && !goods?.supportsPurchase)
      return false
    if (shopQuickFilter.value === 'limited' && !goods?.isLimited)
      return false
    if (shopQuickFilter.value === 'locked' && goods?.unlocked !== false)
      return false
    if (!keyword)
      return true
    const previewNames = Array.isArray(goods?.itemPreviews) ? goods.itemPreviews.map((item: any) => item?.name || '').join(' ') : ''
    const haystack = [
      String(goods?.name || ''),
      String(goods?.goodsId || ''),
      String(goods?.itemId || ''),
      String(goods?.condSummary || ''),
      previewNames,
    ].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
  list.sort((a: any, b: any) => {
    if (shopSortBy.value === 'price_desc')
      return Number(b?.priceValue || 0) - Number(a?.priceValue || 0) || Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
    if (shopSortBy.value === 'name_asc')
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
    if (shopSortBy.value === 'level_desc')
      return Number(b?.itemPreviews?.[0]?.level || 0) - Number(a?.itemPreviews?.[0]?.level || 0) || Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
    return Number(a?.priceValue || 0) - Number(b?.priceValue || 0) || Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
  })
  return list
})

const filteredMallGoods = computed(() => {
  const keyword = mallQuery.value.trim().toLowerCase()
  const list = (Array.isArray(currentMallSection.value?.goods) ? currentMallSection.value.goods : []).filter((goods: any) => {
    if (mallQuickFilter.value === 'free' && !goods?.isFree)
      return false
    if (mallQuickFilter.value === 'limited' && !goods?.isLimited)
      return false
    if (mallQuickFilter.value === 'bundle' && (goods?.itemIds?.length || 0) <= 1)
      return false
    if (!keyword)
      return true
    const previewNames = Array.isArray(goods?.itemPreviews) ? goods.itemPreviews.map((item: any) => item?.name || '').join(' ') : ''
    const haystack = [
      String(goods?.name || ''),
      String(goods?.goodsId || ''),
      String(goods?.type || ''),
      previewNames,
    ].join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
  list.sort((a: any, b: any) => {
    if (mallSortBy.value === 'price_asc')
      return Number(a?.priceValue || 0) - Number(b?.priceValue || 0) || Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
    if (mallSortBy.value === 'price_desc')
      return Number(b?.priceValue || 0) - Number(a?.priceValue || 0) || Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
    if (mallSortBy.value === 'contents_desc')
      return (Number(b?.itemIds?.length || 0) - Number(a?.itemIds?.length || 0)) || Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
    if (mallSortBy.value === 'name_asc')
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
    const recommendationDelta = getMallRecommendationScore(b) - getMallRecommendationScore(a)
    if (recommendationDelta)
      return recommendationDelta

    const freeDelta = Number(Boolean(b?.isFree)) - Number(Boolean(a?.isFree))
    if (freeDelta)
      return freeDelta
    const limitedDelta = Number(Boolean(b?.isLimited)) - Number(Boolean(a?.isLimited))
    if (limitedDelta)
      return limitedDelta
    const priceDelta = Number(a?.priceValue || 0) - Number(b?.priceValue || 0)
    if (priceDelta)
      return priceDelta
    const contentDelta = Number(b?.itemIds?.length || 0) - Number(a?.itemIds?.length || 0)
    if (contentDelta)
      return contentDelta
    return Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
  })
  return list
})

const recommendedMallGoods = computed(() => {
  return (Array.isArray(currentMallSection.value?.goods) ? currentMallSection.value.goods : [])
    .map((goods: any) => ({
      ...goods,
      purchaseStats: getMallPurchaseStats(goods),
    }))
    .filter((goods: any) => goods.purchaseStats.count > 0 || goods.purchaseStats.lastPurchasedAt > 0)
    .sort((a: any, b: any) => {
      const scoreDelta = getMallRecommendationScore(b) - getMallRecommendationScore(a)
      if (scoreDelta)
        return scoreDelta
      return Number(a?.goodsId || 0) - Number(b?.goodsId || 0)
    })
    .slice(0, 4)
})

function getMallFallbackLabel(goods: any) {
  if (String(goods?.sourceType || '') === 'shop') {
    if (String(goods?.tabKey || '') === 'seed')
      return 'SD'
    if (String(goods?.tabKey || '') === 'pet')
      return 'PT'
    return 'DR'
  }
  if (goods?.isFree)
    return 'FR'
  if ((goods?.itemIds?.length || 0) > 1)
    return 'BX'
  if (String(goods?.slotKey || '') === 'month_card')
    return 'MC'
  if (String(goods?.slotKey || '') === 'recharge')
    return 'CZ'
  return 'GD'
}

function isGoodsLocked(goods: any) {
  return goods?.unlocked === false
}

function getShopStatusLabel(goods: any) {
  if (isGoodsLocked(goods))
    return '待解锁'
  if (!goods?.supportsPurchase)
    return '暂不可买'
  return ''
}

function getShopActionLabel(goods: any) {
  if (goods?.supportsPurchase)
    return '购买'
  if (isGoodsLocked(goods))
    return '未解锁'
  return '暂不可买'
}

function getMallPriceLabel(goods: any) {
  const label = String(goods?.priceLabel || '').trim()
  if (label)
    return label
  if (String(goods?.sourceType || '') === 'shop')
    return `${Number(goods?.priceValue || 0)} 金币`
  return goods?.isFree ? '免费领取' : `${Number(goods?.priceValue || 0)} 点券`
}

function getGoodsPreviewGroups(goods: any, limit = Infinity) {
  const groups = new Map<number, any>()
  for (const preview of Array.isArray(goods?.itemPreviews) ? goods.itemPreviews : []) {
    const id = Number(preview?.id || 0)
    if (id <= 0)
      continue
    if (!groups.has(id)) {
      groups.set(id, { ...preview, count: 0 })
    }
    groups.get(id).count += Math.max(1, Number(preview?.count || 1))
  }
  return Array.from(groups.values()).slice(0, limit)
}

function getGoodsSummary(goods: any) {
  const summary = String(goods?.summary || '').trim()
  if (summary)
    return summary
  if (String(goods?.sourceType || '') === 'shop' && String(goods?.condSummary || '').trim())
    return String(goods.condSummary).trim()
  const previews = getGoodsPreviewGroups(goods, 3)
  if (!previews.length)
    return '暂无内容说明'
  return previews.map((preview: any) => `${preview.name}${preview.count > 1 ? ` x${preview.count}` : ''}`).join(' / ')
}

function getMonthCardInfo(goodsOrId: any) {
  const goodsId = Number(typeof goodsOrId === 'object' ? goodsOrId?.goodsId : goodsOrId || 0)
  return monthCardInfos.value.find((info: any) => Number(info?.goodsId || 0) === goodsId) || null
}

function isLandSelected(landId: number) {
  return selectedLandIds.value.includes(landId)
}

function getLandSelectionLimit(item: any) {
  return Math.max(1, Number(item?.count || 1))
}

function pruneSelectedLands() {
  const allowed = new Set(availableTargetLands.value.map((land: any) => Number(land.id || 0)))
  const limit = bagDetailItem.value && itemNeedsLandSelection(bagDetailItem.value)
    ? getLandSelectionLimit(bagDetailItem.value)
    : Number.POSITIVE_INFINITY
  selectedLandIds.value = selectedLandIds.value
    .filter(id => allowed.has(Number(id)))
    .slice(0, limit)
}

function toggleSelectedLand(landId: number) {
  if (!selectedLandIds.value.includes(landId)) {
    const limit = bagDetailItem.value ? getLandSelectionLimit(bagDetailItem.value) : 1
    if (selectedLandIds.value.length >= limit) {
      toast.warning(`当前物品最多只能选择 ${limit} 块土地`)
      return
    }
    selectedLandIds.value = [...selectedLandIds.value, landId]
    return
  }
  selectedLandIds.value = selectedLandIds.value.filter(id => id !== landId)
}

function selectSuggestedLands() {
  const limit = bagDetailItem.value ? getLandSelectionLimit(bagDetailItem.value) : 1
  selectedLandIds.value = [...suggestedTargetLandIds.value].slice(0, limit)
}

function clearSelectedLands() {
  selectedLandIds.value = []
}

const sellableIds = computed(() => new Set(
  items.value
    .filter((it: any) => it?.category === 'fruit')
    .map((it: any) => Number(it.id || 0))
    .filter((id: number) => id > 0),
))

const selectedSellItems = computed(() => {
  const selected = new Set(selectedItemIds.value)
  return items.value.filter((item: any) => selected.has(Number(item.id || 0)) && sellableIds.value.has(Number(item.id || 0)))
})

const activeTabMeta = computed(() => {
  if (activeTab.value === 'shop') {
    return {
      label: '商店',
      description: `${currentShopSection.value?.label || '商店'}当前展示 ${filteredShopGoods.value.length} 项商品。`,
    }
  }
  if (activeTab.value === 'mall') {
    return {
      label: '商城',
      description: `${currentMallSection.value?.label || '商城'}当前展示 ${filteredMallGoods.value.length} 项商品。`,
    }
  }
  if (activeTab.value === 'sell') {
    return {
      label: '出售预览',
      description: `当前预览 ${sellPreview.value?.totalSellKinds || 0} 种果实，预计 ${sellPreview.value?.expectedGold || 0} 金币。`,
    }
  }
  return {
    label: '背包',
    description: `当前筛出 ${filteredItems.value.length} 项物品，可手动出售 ${selectedSellItems.value.length} 种果实。`,
  }
})

const tradeTabOptions = computed(() => [
  {
    key: 'bag',
    label: '背包',
    active: activeTab.value === 'bag',
    class: 'bag-trade-tab',
    onClick: () => {
      activeTab.value = 'bag'
    },
  },
  {
    key: 'shop',
    label: '商店',
    active: activeTab.value === 'shop',
    class: 'bag-trade-tab',
    onClick: () => {
      activeTab.value = 'shop'
    },
  },
  {
    key: 'mall',
    label: '商城',
    active: activeTab.value === 'mall',
    class: 'bag-trade-tab',
    onClick: () => {
      activeTab.value = 'mall'
    },
  },
  {
    key: 'sell',
    label: '出售预览',
    active: activeTab.value === 'sell',
    class: 'bag-trade-tab',
    onClick: () => {
      activeTab.value = 'sell'
    },
  },
])

const bagHeaderChips = computed(() => {
  const chips = [
    { key: 'inventory', label: `库存 ${items.value.length} 种` },
    { key: 'tab', label: `当前 ${activeTabMeta.value.label}` },
  ]

  if (activeTab.value === 'bag')
    chips.push({ key: 'visible', label: `显示 ${filteredItems.value.length} 项` })
  if (activeTab.value === 'shop')
    chips.push({ key: 'shop', label: `${currentShopSection.value?.label || '商店'} ${filteredShopGoods.value.length} 项` })
  if (activeTab.value === 'mall')
    chips.push({ key: 'mall', label: `${currentMallSection.value?.label || '商城'} ${filteredMallGoods.value.length} 项` })
  if (activeTab.value === 'sell')
    chips.push({ key: 'sell', label: `预览 ${sellPreview.value?.totalSellCount || 0} 个` })
  if (selectedSellItems.value.length)
    chips.push({ key: 'selected', label: `已选 ${selectedSellItems.value.length} 种` })

  return chips
})

const sellConfigSummary = computed(() => {
  const sell = buildTradeSellStrategyDraft(settings.value?.tradeConfig)
  return {
    keepMinEachFruit: sell.keepMinEachFruit,
    keepFruitIds: sell.keepFruitIds,
    rareKeepEnabled: sell.rareKeepEnabled,
    judgeBy: sell.judgeBy,
    judgeByLabel: rareKeepJudgeOptions.find(option => option.value === sell.judgeBy)?.label || '任一条件命中就保留',
    minPlantLevel: sell.minPlantLevel,
    minUnitPrice: sell.minUnitPrice,
    batchSize: sell.batchSize,
    previewBeforeManualSell: sell.previewBeforeManualSell,
  }
})

const sellStrategyRules = computed(() => {
  const summary = sellConfigSummary.value
  return [
    summary.keepMinEachFruit > 0
      ? `每种果实至少保留 ${summary.keepMinEachFruit} 个`
      : '不做基础保留，默认可全部出售',
    summary.keepFruitIds.length > 0
      ? `强制保留清单 ${summary.keepFruitIds.length} 项`
      : '未设置强制保留清单',
    summary.rareKeepEnabled
      ? `稀有保留已开启，按${summary.judgeByLabel}判定`
      : '稀有保留已关闭',
    summary.previewBeforeManualSell
      ? '手动出售前会先刷新预览'
      : '手动出售可直接执行',
  ]
})

const sellStrategyPriorityLine = computed(() => {
  const priorityParts = [
    strategyDraftKeepFruitIds.value.length > 0 ? '强制保留清单' : '',
    strategyDraft.value.rareKeepEnabled ? '稀有果实保留' : '',
    Number(strategyDraft.value.keepMinEachFruit || 0) > 0 ? `每种至少保留 ${Number(strategyDraft.value.keepMinEachFruit || 0)} 个` : '',
    '其余果实出售',
  ].filter(Boolean)
  return priorityParts.join(' > ')
})

function pruneSelectedItems() {
  const allowed = sellableIds.value
  selectedItemIds.value = selectedItemIds.value.filter(id => allowed.has(Number(id)))
}

function toggleSelectItem(itemId: number) {
  if (!sellableIds.value.has(itemId))
    return
  if (selectedItemIds.value.includes(itemId)) {
    selectedItemIds.value = selectedItemIds.value.filter(id => id !== itemId)
  }
  else {
    selectedItemIds.value = [...selectedItemIds.value, itemId]
  }
}

function selectAllSellable() {
  selectedItemIds.value = items.value
    .filter((item: any) => sellableIds.value.has(Number(item.id || 0)))
    .map((item: any) => Number(item.id || 0))
}

function clearSelection() {
  selectedItemIds.value = []
}

async function ensureConnected() {
  if (!currentAccountId.value)
    return false
  if (!realtimeConnected.value) {
    await statusStore.fetchStatus(currentAccountId.value)
  }
  return !!(currentAccount.value?.running && status.value?.connection?.connected)
}

async function loadBag() {
  if (!currentAccountId.value)
    return false
  const connected = await ensureConnected()
  await Promise.all([
    settingStore.fetchSettings(currentAccountId.value),
    bagStore.fetchShopCatalog(currentAccountId.value),
    bagStore.fetchMallCatalog(currentAccountId.value),
    connected ? bagStore.fetchBag(currentAccountId.value) : Promise.resolve(null),
    connected ? bagStore.fetchSellPreview(currentAccountId.value) : Promise.resolve(null),
  ])
  imageErrors.value = {}
  clearSelection()
  pruneSelectedItems()
  pruneSelectedLands()
  if (!connected && activeTab.value === 'bag')
    activeTab.value = 'mall'
  return connected
}

async function handleRefresh() {
  refreshingAll.value = true
  try {
    const connected = await loadBag()
    toast.success(connected ? '背包、商店和商城数据已刷新' : '商店和商城数据已刷新，背包需账号在线')
  }
  finally {
    refreshingAll.value = false
  }
}

async function handlePreviewSell() {
  if (!currentAccountId.value)
    return
  previewRefreshing.value = true
  try {
    await bagStore.fetchSellPreview(currentAccountId.value)
    activeTab.value = 'sell'
    toast.success('已刷新出售预览')
  }
  finally {
    previewRefreshing.value = false
  }
}

async function handleSellByPolicy() {
  if (!currentAccountId.value)
    return
  sellingByPolicy.value = true
  try {
    if (sellConfigSummary.value.previewBeforeManualSell) {
      await bagStore.fetchSellPreview(currentAccountId.value)
    }
    const result = await bagStore.sellByPolicy(currentAccountId.value)
    if (result) {
      recordActivityEntry({
        ts: Date.now(),
        type: 'sell',
        title: `按策略出售 ${Number(result?.soldCount || 0)} 个果实`,
        soldCount: Number(result?.soldCount || 0),
        soldKinds: Number(result?.soldKinds || 0),
        goldEarned: Number(result?.goldEarned || 0),
        summary: buildSellActivitySummary(result),
        details: buildSellActivityDetails(result),
      })
      activeTab.value = 'sell'
      toast.success(result.message || '已按策略出售')
      clearSelection()
    }
  }
  finally {
    sellingByPolicy.value = false
  }
}

async function handleSellSelected() {
  if (!currentAccountId.value || selectedItemIds.value.length === 0)
    return
  if (sellConfigSummary.value.previewBeforeManualSell) {
    await bagStore.fetchSellPreview(currentAccountId.value)
  }
  const result = await bagStore.sellSelected(currentAccountId.value, selectedItemIds.value, respectPolicyForSelected.value)
  if (result) {
    recordActivityEntry({
      ts: Date.now(),
      type: 'sell',
      title: `手动出售 ${Number(result?.soldCount || 0)} 个果实`,
      soldCount: Number(result?.soldCount || 0),
      soldKinds: Number(result?.soldKinds || 0),
      goldEarned: Number(result?.goldEarned || 0),
      summary: buildSellActivitySummary(result),
      details: buildSellActivityDetails(result),
    })
    activeTab.value = 'sell'
    toast.success(result.message || '已出售选中果实')
    clearSelection()
  }
}

function getPurchaseCount(target: any) {
  const key = getPurchaseCounterKey(target)
  return Math.max(1, Number(purchaseCounts.value[key] || 1))
}

function updatePurchaseCount(target: any, value: number) {
  const key = getPurchaseCounterKey(target)
  purchaseCounts.value = {
    ...purchaseCounts.value,
    [key]: Math.max(1, Number(value || 1)),
  }
}

function bumpPurchaseCount(target: any, delta: number) {
  updatePurchaseCount(target, getPurchaseCount(target) + delta)
}

function getUseCount(itemId: number, maxCount = Infinity) {
  const limit = Math.max(1, Number(maxCount || 1))
  return Math.min(limit, Math.max(1, Number(useCounts.value[itemId] || 1)))
}

function updateUseCount(itemId: number, value: number, maxCount = Infinity) {
  const limit = Math.max(1, Number(maxCount || 1))
  useCounts.value = {
    ...useCounts.value,
    [itemId]: Math.min(limit, Math.max(1, Number(value || 1))),
  }
}

function bumpUseCount(itemId: number, delta: number, maxCount = Infinity) {
  updateUseCount(itemId, getUseCount(itemId, maxCount) + delta, maxCount)
}

async function ensureFarmLandsLoaded() {
  if (!currentAccountId.value)
    return
  if (targetLandsAccountId.value === currentAccountId.value && availableTargetLands.value.length > 0)
    return
  await farmStore.fetchLands(currentAccountId.value)
  targetLandsAccountId.value = currentAccountId.value
}

async function handleBuyGoods(goods: any) {
  if (!currentAccountId.value)
    return
  const goodsId = Number(goods?.goodsId || 0)
  if (!goodsId)
    return
  if (!goods?.supportsPurchase) {
    toast.warning(String(goods?.purchaseDisabledReason || '当前商品需在游戏内完成购买'))
    return
  }
  const count = getPurchaseCount(goods)
  const result = String(goods?.sourceType || '') === 'shop'
    ? await bagStore.buyShopGoods(currentAccountId.value, goodsId, count)
    : await bagStore.buyMallGoods(currentAccountId.value, goodsId, count)
  if (result) {
    recordMallPurchase(goods, count)
    recordActivityEntry({
      ts: Date.now(),
      type: 'purchase',
      sourceType: String(goods?.sourceType || 'mall'),
      entryKey: getTradeEntryKey(goods),
      goodsId,
      goodsName: String(goods?.name || `商品#${goodsId}`),
      title: `${goods?.name || `商品#${goodsId}`} x${count}`,
      count,
      sectionLabel: getGoodsSourceLabel(goods),
      summary: getGoodsSummary(goods),
      priceLabel: getMallPriceLabel(goods),
      itemIds: Array.isArray(goods?.itemIds) ? goods.itemIds.slice(0, 12) : [],
      details: getGoodsPreviewGroups(goods).slice(0, 8).map((preview: any) => ({
        id: Number(preview?.id || 0),
        name: String(preview?.name || `物品#${Number(preview?.id || 0)}`),
        count: Number(preview?.count || 0),
        image: String(preview?.image || ''),
        meta: preview?.effectDesc || preview?.desc || '',
      })),
    })
    toast.success(`已购买 ${goods?.name || `商品#${goodsId}`}`)
  }
}

async function handleClaimMonthCard(goodsOrId: any) {
  if (!currentAccountId.value)
    return
  const goodsId = Number(typeof goodsOrId === 'object' ? goodsOrId?.goodsId : goodsOrId || 0)
  if (!goodsId)
    return
  const result = await bagStore.claimMonthCardReward(currentAccountId.value, goodsId)
  if (result)
    toast.success(result.message || '已领取月卡奖励')
}

async function handleUseBagItem(item: any) {
  if (!currentAccountId.value)
    return
  const itemId = Number(item?.id || 0)
  const maxCount = Math.max(1, Number(item?.count || 1))
  if (!itemId || !item?.canUse)
    return
  const needLandSelection = itemNeedsLandSelection(item)
  let landIds = needLandSelection ? [...selectedLandIds.value] : []
  if (needLandSelection && landIds.length > maxCount) {
    landIds = landIds.slice(0, maxCount)
    selectedLandIds.value = landIds
  }
  if (needLandSelection && landIds.length === 0) {
    toast.warning('请至少选择一块土地')
    return
  }
  const count = needLandSelection
    ? landIds.length
    : getUseCount(itemId, maxCount)
  const result = await bagStore.useBagItem(currentAccountId.value, itemId, count, landIds)
  if (result) {
    lastUseResult.value = result
    recordUseActivity(item, result)
    toast.success(result.message || `已使用 ${item?.name || `物品#${itemId}`} x${count}`)
    if (needLandSelection) {
      await farmStore.fetchLands(currentAccountId.value)
      targetLandsAccountId.value = currentAccountId.value
      clearSelectedLands()
    }
  }
}

function isSelected(itemId: number) {
  return selectedItemIds.value.includes(itemId)
}

function formatPreviewReason(item: any) {
  const rawReasons = Array.isArray(item?.keepReasons) ? item.keepReasons : []
  const reasons = rawReasons.map((reason: string) => reason === '白名单保留' ? '命中强制保留清单' : reason)
  const keepCount = Math.max(0, Number(item?.keepCount || 0))
  const sellCount = Math.max(0, Number(item?.sellCount || 0))
  const totalCount = Math.max(0, Number(item?.count || 0))
  if (reasons.length > 0)
    return `全部保留：${reasons.join(' / ')}`
  if (keepCount > 0 && sellCount > 0)
    return `基础保留：当前按“每种至少保留 ${keepCount} 个”执行`
  if (keepCount > 0 && sellCount === 0)
    return totalCount <= keepCount ? '当前数量未超过保留线，暂不出售' : '当前全部被保留策略覆盖'
  return ''
}

function openActivityEntry(entry: any) {
  if (String(entry?.type || '') === 'purchase') {
    const goods = allTradeGoods.value.find((item: any) => {
      if (String(entry?.entryKey || '').trim())
        return String(item?.entryKey || '') === String(entry.entryKey)
      if (String(entry?.sourceType || '').trim() && String(item?.sourceType || '') !== String(entry.sourceType))
        return false
      return Number(item?.goodsId || 0) === Number(entry?.goodsId || 0)
    }) || {
      sourceType: entry?.sourceType || 'mall',
      goodsId: entry?.goodsId,
      name: entry?.goodsName,
      itemIds: entry?.itemIds || [],
      entryKey: entry?.entryKey || '',
    }
    openMallDetail(goods)
    return
  }
  if (String(entry?.type || '') === 'sell') {
    activeTab.value = 'sell'
    return
  }
  const item = items.value.find((row: any) => Number(row?.id || 0) === Number(entry?.itemId || 0))
    || { id: entry?.itemId, name: entry?.itemName, interactionType: entry?.interactionType, canUse: true, count: entry?.count || 1 }
  openBagDetail(item)
}

function openBagDetail(item: any) {
  bagDetailItem.value = item
  mallDetailGoods.value = null
  lastUseResult.value = null
  if (itemNeedsLandSelection(item))
    ensureFarmLandsLoaded()
  else
    clearSelectedLands()
}

function openMallDetail(goods: any) {
  mallDetailGoods.value = goods
  bagDetailItem.value = null
}

function closeDetailPanel() {
  bagDetailItem.value = null
  mallDetailGoods.value = null
  lastUseResult.value = null
  clearSelectedLands()
}

// vue-tsc occasionally misses a few late template refs in this large SFC.
const templateUsageBridge = {
  strategySaving,
  shopLoading,
  shopSortOptions,
  claimableMonthCardCount,
  shopFilterOptions,
  setShopQuickFilter,
  getMonthCardInfo,
  formatPurchaseTime,
  recommendedMallGoods,
  bumpUseCount,
  handleUseBagItem,
  handleClaimMonthCard,
  sellStrategyEditorOpen,
  sellStrategyDirty,
  strategyDraft,
  strategyDraftKeepFruitIds,
  strategyDraftKeepFruitIdSet,
  sellStrategyFruitCandidates,
  sellStrategyRules,
  sellStrategyPriorityLine,
  rareKeepJudgeOptions,
  toggleStrategyKeepFruit,
  applySellStrategyPreset,
  saveSellStrategy,
  syncSellStrategyDraft,
  openFullSettings,
}
void templateUsageBridge

onMounted(() => {
  loadMallPurchaseMemory()
  loadActivityHistory()
  loadBag()
  void hydrateBagPreferences()
})

onBeforeUnmount(() => {
  void flushBagPreferencesSync({
    includeCurrentDirty: true,
    applyIfCurrent: false,
  })
})

watch(currentAccountId, (_nextAccountId, previousAccountId) => {
  const previousAccountIdSnapshot = String(previousAccountId || '').trim()
  const previousSnapshot = previousAccountIdSnapshot && getBagPreferencesSyncStateForAccount(previousAccountIdSnapshot).dirty
    ? buildBagPreferencesSyncSnapshot(previousAccountIdSnapshot)
    : null

  void flushBagPreferencesSync({
    snapshot: previousSnapshot,
    applyIfCurrent: false,
  })

  clearSelection()
  closeDetailPanel()
  targetLandsAccountId.value = ''
  shopTabKey.value = 'seed'
  mallTabKey.value = 'gift'
  loadMallPurchaseMemory()
  loadActivityHistory()
  loadBag()
  void hydrateBagPreferences()
})

watch(items, () => {
  pruneSelectedItems()
  if (bagDetailItem.value) {
    const nextItem = items.value.find((item: any) => Number(item?.id || 0) === Number(bagDetailItem.value?.id || 0))
    bagDetailItem.value = nextItem || null
  }
})

watch(lands, () => {
  pruneSelectedLands()
})

watch(shopSections, () => {
  if (!shopSections.value.some((section: any) => String(section?.tabKey || '') === shopTabKey.value))
    shopTabKey.value = 'seed'
})

watch(mallSections, () => {
  if (!mallSections.value.some((section: any) => String(section?.slotKey || '') === mallTabKey.value))
    mallTabKey.value = 'gift'
})

watch(allTradeGoods, () => {
  if (mallDetailGoods.value) {
    const nextGoods = allTradeGoods.value.find((goods: any) => String(goods?.entryKey || '') === String(mallDetailGoods.value?.entryKey || ''))
      || allTradeGoods.value.find((goods: any) => {
        if (String(goods?.sourceType || '') !== String(mallDetailGoods.value?.sourceType || ''))
          return false
        return Number(goods?.goodsId || 0) === Number(mallDetailGoods.value?.goodsId || 0)
      })
    mallDetailGoods.value = nextGoods || null
  }
})

watch(() => settings.value.tradeConfig, () => {
  syncSellStrategyDraft()
}, { immediate: true, deep: true })

useIntervalFn(loadBag, 60000)
</script>

<template>
  <div class="bag-panel space-y-4">
    <div class="bag-topbar ui-mobile-sticky-panel">
      <div class="bag-topbar__header">
        <div class="bag-topbar__copy">
          <h2 class="flex items-center gap-2 text-2xl font-bold">
            <div class="i-carbon-inventory-management" />
            背包与交易
          </h2>
          <div class="bag-panel__summary mt-1 text-sm">
            背包 {{ items.length }} 种物品
            <span v-if="activeTab === 'bag'"> · 当前显示 {{ filteredItems.length }} 项</span>
            <span v-if="activeTab === 'shop'"> · {{ currentShopSection?.label || '商店' }} {{ filteredShopGoods.length }} 项</span>
            <span v-if="activeTab === 'mall'"> · {{ currentMallSection?.label || '商城' }} {{ filteredMallGoods.length }} 项商品</span>
            <span v-if="selectedSellItems.length"> · 已选 {{ selectedSellItems.length }} 种果实</span>
          </div>
          <p class="bag-topbar__desc md:hidden">
            {{ activeTabMeta.description }}
          </p>
        </div>

        <div class="bag-topbar__actions ui-bulk-actions">
          <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="actionLoading || refreshingAll" :loading="refreshingAll" loading-label="刷新中" icon-class="i-carbon-renew" @click="handleRefresh">
            刷新
          </BaseButton>
          <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="sellPreviewLoading || actionLoading || previewRefreshing" :loading="previewRefreshing || sellPreviewLoading" loading-label="预览刷新中" icon-class="i-carbon-view" @click="handlePreviewSell">
            刷新出售预览
          </BaseButton>
          <BaseButton variant="primary" class="trade-btn trade-btn-primary" :disabled="actionLoading || sellingByPolicy" :loading="sellingByPolicy" loading-label="执行中" icon-class="i-carbon-flash" @click="handleSellByPolicy">
            按策略出售
          </BaseButton>
        </div>
      </div>

      <div class="bag-topbar__chips ui-bulk-actions md:hidden">
        <span
          v-for="chip in bagHeaderChips"
          :key="chip.key"
          class="bag-topbar__chip"
        >
          {{ chip.label }}
        </span>
      </div>

      <BaseToggleOptionGroup class="bag-tab-bar ui-bulk-actions" :items="tradeTabOptions" />
    </div>

    <div class="grid gap-3 lg:grid-cols-4">
      <div class="glass-panel rounded-xl p-4 shadow lg:col-span-2">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="bag-section-eyebrow text-xs uppercase">
              交易策略
            </div>
            <div class="mt-2 text-base font-semibold">
              按策略出售 = 强制保留 + 稀有保留 + 基础保留
            </div>
            <div class="bag-inline-note mt-1 text-xs">
              背包页现在可以直接查看和调整出售策略，不用再猜“按策略出售”到底按什么卖。
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <BaseButton type="button" variant="secondary" class="trade-btn trade-btn-secondary" @click="sellStrategyEditorOpen = !sellStrategyEditorOpen">
              {{ sellStrategyEditorOpen ? '收起策略' : '编辑策略' }}
            </BaseButton>
            <BaseButton type="button" variant="secondary" class="trade-btn trade-btn-secondary" @click="openFullSettings">
              去完整设置
            </BaseButton>
          </div>
        </div>

        <div class="strategy-chip-list mt-4">
          <span v-for="rule in sellStrategyRules" :key="rule" class="strategy-chip">
            {{ rule }}
          </span>
        </div>

        <div class="strategy-priority mt-3">
          <span class="strategy-priority__label">执行顺序</span>
          <span class="strategy-priority__value">{{ sellStrategyPriorityLine }}</span>
        </div>

        <div class="bag-note-warning mt-3 text-xs">
          当前仅支持出售果实，种子、化肥、狗粮、礼包等物品不会出现在出售勾选中。
        </div>

        <div v-if="sellStrategyEditorOpen" class="strategy-editor mt-4">
          <div class="strategy-editor__toolbar">
            <div class="strategy-editor__title">
              快速调参
            </div>
            <div class="strategy-editor__presets">
              <button type="button" class="strategy-chip strategy-chip-action" @click="applySellStrategyPreset('conservative')">
                保守保留
              </button>
              <button type="button" class="strategy-chip strategy-chip-action" @click="applySellStrategyPreset('balanced')">
                均衡出售
              </button>
              <button type="button" class="strategy-chip strategy-chip-action" @click="applySellStrategyPreset('clear')">
                快速清仓
              </button>
            </div>
          </div>

          <div class="strategy-editor__grid">
            <label class="strategy-field">
              <span class="strategy-field__label">每种至少保留</span>
              <input v-model.number="strategyDraft.keepMinEachFruit" min="0" max="999999" type="number" class="strategy-input">
            </label>

            <label class="strategy-field">
              <span class="strategy-field__label">出售批大小</span>
              <input v-model.number="strategyDraft.batchSize" min="1" max="50" type="number" class="strategy-input">
            </label>

            <label class="strategy-field">
              <span class="strategy-field__label">稀有判定方式</span>
              <select v-model="strategyDraft.judgeBy" class="strategy-select" :disabled="!strategyDraft.rareKeepEnabled">
                <option v-for="option in rareKeepJudgeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="strategy-field strategy-field-checkbox">
              <span class="strategy-field__label">执行保护</span>
              <span class="strategy-checkbox">
                <input v-model="strategyDraft.previewBeforeManualSell" type="checkbox">
                <span>手动出售前先刷新预览</span>
              </span>
            </label>
          </div>

          <div class="strategy-editor__grid mt-3">
            <label class="strategy-field strategy-field-checkbox">
              <span class="strategy-field__label">稀有果实保留</span>
              <span class="strategy-checkbox">
                <input v-model="strategyDraft.rareKeepEnabled" type="checkbox">
                <span>命中阈值就整项保留，不参与出售</span>
              </span>
            </label>

            <label class="strategy-field">
              <span class="strategy-field__label">最低作物等级</span>
              <input v-model.number="strategyDraft.minPlantLevel" min="0" max="999" type="number" class="strategy-input" :disabled="!strategyDraft.rareKeepEnabled">
            </label>

            <label class="strategy-field">
              <span class="strategy-field__label">最低果实单价</span>
              <input v-model.number="strategyDraft.minUnitPrice" min="0" max="999999999" type="number" class="strategy-input" :disabled="!strategyDraft.rareKeepEnabled">
            </label>
          </div>

          <label class="strategy-field mt-3">
            <span class="strategy-field__label">强制保留清单</span>
            <textarea
              v-model="keepFruitIdsText"
              rows="2"
              class="strategy-textarea"
              placeholder="输入果实 ID，支持逗号或空格分隔；下面也可以直接点选当前背包果实。"
            />
          </label>

          <div class="strategy-keep-picker mt-3">
            <div class="strategy-field__label">
              当前背包果实快捷选择
            </div>
            <div v-if="sellStrategyFruitCandidates.length" class="strategy-keep-picker__list">
              <button
                v-for="fruit in sellStrategyFruitCandidates"
                :key="fruit.id"
                type="button"
                class="strategy-keep-pill"
                :class="{ active: strategyDraftKeepFruitIdSet.has(fruit.id) }"
                @click="toggleStrategyKeepFruit(fruit.id)"
              >
                <span>{{ fruit.name }}</span>
                <span class="strategy-keep-pill__meta">#{{ fruit.id }} · x{{ fruit.count }} · {{ fruit.price }}金</span>
              </button>
            </div>
            <div v-else class="bag-inline-note text-xs">
              当前背包里没有可选果实，先刷新背包或切到在线账号。
            </div>
          </div>

          <div class="strategy-editor__footer mt-4">
            <BaseButton type="button" variant="secondary" class="trade-btn trade-btn-secondary" :disabled="strategySaving" @click="syncSellStrategyDraft">
              还原当前配置
            </BaseButton>
            <BaseButton type="button" variant="primary" class="trade-btn trade-btn-primary" :disabled="strategySaving || !sellStrategyDirty" :loading="strategySaving" loading-label="保存中..." @click="saveSellStrategy">
              保存策略并刷新预览
            </BaseButton>
          </div>
        </div>
      </div>

      <div class="glass-panel rounded-xl p-4 shadow">
        <div class="bag-section-eyebrow text-xs uppercase">
          预计出售
        </div>
        <div class="mt-2 text-sm font-medium">
          {{ sellPreview?.totalSellCount || 0 }} 个果实
        </div>
        <div class="bag-inline-note mt-1 text-xs">
          {{ sellPreview?.totalSellKinds || 0 }} 种 · 预计 {{ sellPreview?.expectedGold || 0 }} 金币
        </div>
      </div>

      <div class="glass-panel rounded-xl p-4 shadow">
        <div class="bag-section-eyebrow text-xs uppercase">
          快速选择
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" @click="selectAllSellable">
            全选可售果实
          </BaseButton>
          <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" @click="clearSelection">
            清空选择
          </BaseButton>
          <label class="bag-inline-checkbox inline-flex items-center gap-2 text-sm">
            <input v-model="respectPolicyForSelected" type="checkbox">
            选中出售也遵守保留策略
          </label>
        </div>
      </div>
    </div>

    <div v-if="activityHistory.length" class="activity-panel glass-panel rounded-2xl p-4 shadow">
      <div class="activity-panel__header">
        <div>
          <div class="activity-panel__title">
            交易动态
          </div>
          <div class="activity-panel__subtitle">
            最近 30 条购买、使用、出售动作，按账号本地保存
          </div>
          <div class="bag-info-banner mt-2">
            {{ BAG_ACTIVITY_BROWSER_PREF_NOTE }}
          </div>
        </div>
        <div class="activity-panel__actions">
          <div class="activity-panel__summary">
            当前筛选 {{ filteredActivityHistory.length }} 条，展示最近 {{ recentActivityHistory.length }} 条
          </div>
          <BaseFilterChips class="inventory-toolbar__chips bag-chip-row">
            <BaseFilterChip
              v-for="option in activityFilterOptions"
              :key="option.key"
              as="button"
              type="button"
              class="bag-filter-chip"
              :active="activityFilter === option.key"
              @click="activityFilter = option.key"
            >
              <span>{{ option.label }}</span>
              <span class="bag-filter-chip__count">{{ option.count }}</span>
            </BaseFilterChip>
          </BaseFilterChips>
          <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" @click="clearActivityHistory()">
            清空动态
          </BaseButton>
        </div>
      </div>

      <div v-if="recentActivityHistory.length" class="activity-list">
        <div
          v-for="entry in recentActivityHistory"
          :key="`activity-${entry.type}-${entry.ts}-${entry.itemId || entry.goodsId}`"
          class="activity-card"
        >
          <div class="activity-card__body" role="button" tabindex="0" @click="openActivityEntry(entry)">
            <div class="activity-card__type" :class="{ purchase: entry.type === 'purchase', sell: entry.type === 'sell', use: entry.type !== 'purchase' && entry.type !== 'sell' }">
              {{ entry.type === 'purchase' ? '购买' : entry.type === 'sell' ? '出售' : '使用' }}
            </div>
            <div class="activity-card__main">
              <div class="activity-card__title">
                {{ entry.title }}
              </div>
              <div class="activity-card__meta">
                <span>{{ formatPurchaseTime(entry.ts) }}</span>
                <span v-if="entry.priceLabel">{{ entry.priceLabel }}</span>
                <span v-if="entry.goldEarned">+{{ entry.goldEarned }} 金币</span>
                <span v-if="entry.landIds?.length">地块 {{ entry.landIds.join(', ') }}</span>
              </div>
              <div class="activity-card__summary">
                {{ entry.summary || '操作成功' }}
              </div>
            </div>
          </div>
          <div class="activity-card__actions">
            <BaseButton
              v-if="entry.details?.length"
              variant="secondary"
              class="trade-btn trade-btn-secondary"
              @click="toggleActivityExpanded(entry)"
            >
              {{ isActivityExpanded(entry) ? '收起明细' : '展开明细' }}
            </BaseButton>
          </div>
          <div v-if="isActivityExpanded(entry) && entry.details?.length" class="activity-card__details">
            <div
              v-for="detail in entry.details"
              :key="`activity-detail-${getActivityKey(entry)}-${detail.id}`"
              class="activity-detail-card"
            >
              <div class="activity-detail-card__thumb" :data-fallback="getItemFallbackLabel(detail)">
                <img
                  v-if="detail.image && !imageErrors[getImageErrorKey('activity-detail', getActivityKey(entry), detail.id)]"
                  :src="detail.image"
                  :alt="detail.name"
                  loading="lazy"
                  @error="imageErrors[getImageErrorKey('activity-detail', getActivityKey(entry), detail.id)] = true"
                >
                <div v-else class="inventory-card__fallback activity-detail-card__fallback">
                  {{ getItemFallbackLabel(detail) }}
                </div>
              </div>
              <div class="activity-detail-card__copy">
                <div class="activity-detail-card__title">
                  {{ detail.name }}
                </div>
                <div class="activity-detail-card__meta">
                  <span>x{{ detail.count || 0 }}</span>
                  <span v-if="detail.meta">{{ detail.meta }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BaseEmptyState
        v-else
        compact
        class="activity-panel__empty bag-empty-state glass-text-muted p-8 text-center backdrop-blur-sm"
        icon="i-carbon-search"
        title="暂无交易动态"
        description="当前筛选下还没有购买、出售或使用记录，切换筛选或执行操作后会出现在这里。"
      />
    </div>

    <div v-if="bagLoading || statusLoading" class="flex justify-center py-12">
      <div class="bag-spinner ui-state-spinner i-svg-spinners-90-ring-with-bg text-4xl" />
    </div>

    <BaseEmptyState
      v-else-if="!currentAccountId"
      class="bag-empty-state glass-text-muted p-8 text-center"
      icon="i-carbon-user-avatar"
      title="未选择账号"
      description="请选择账号后查看背包、商店、商城和出售预览。"
    />

    <BaseEmptyState
      v-else-if="statusError"
      danger
      class="bag-error-state p-8 text-center shadow"
      icon="i-carbon-warning-alt"
      title="获取数据失败"
      :description="statusError"
    />

    <BaseEmptyState
      v-else-if="!status?.connection?.connected"
      class="bag-empty-state glass-text-muted p-12 text-center shadow-sm"
      icon="i-carbon-connection-signal-off"
      title="账号未登录"
      description="请先运行账号或检查网络连接"
    />

    <template v-else>
      <div v-if="dashboardItems.length" class="grid gap-3 lg:grid-cols-4 md:grid-cols-2">
        <div
          v-for="item in dashboardItems"
          :key="`dashboard-${item.id}`"
          class="glass-panel rounded-xl p-4 shadow"
        >
          <div class="bag-section-eyebrow text-xs uppercase">
            {{ item.name }}
          </div>
          <div class="mt-2 text-lg font-semibold">
            {{ item.hoursText || `x${item.count || 0}` }}
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'bag'">
        <div class="inventory-toolbar ui-mobile-sticky-panel glass-panel mb-4 rounded-2xl p-4 shadow">
          <div class="inventory-toolbar__row">
            <div class="inventory-toolbar__search">
              <div class="i-carbon-search text-sm opacity-70" />
              <input v-model="bagQuery" type="text" class="inventory-search-input" placeholder="搜索物品名称 / ID / 分类">
            </div>
            <label class="trade-select-wrap">
              <span class="trade-select-wrap__label">排序</span>
              <select v-model="bagSortBy" class="trade-select">
                <option v-for="option in bagSortOptions" :key="option.key" :value="option.key">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </div>
          <BaseFilterChips class="inventory-toolbar__chips bag-chip-row">
            <BaseFilterChip
              v-for="option in bagCategoryOptions"
              :key="option.key"
              as="button"
              type="button"
              class="bag-filter-chip"
              :active="bagCategory === option.key"
              @click="setBagCategory(option.key)"
            >
              <span>{{ option.label }}</span>
              <span class="bag-filter-chip__count">{{ option.count }}</span>
            </BaseFilterChip>
          </BaseFilterChips>
        </div>

        <BaseEmptyState
          v-if="filteredItems.length === 0"
          compact
          class="bag-empty-state glass-text-muted p-8 text-center"
          icon="i-carbon-search"
          title="没有匹配物品"
          description="调整关键词、分类或排序后，再试一次。"
        />

        <div v-else class="bag-inventory-grid">
          <div
            v-for="item in filteredItems"
            :key="item.id"
            class="inventory-card group"
            :class="getItemAccentClass(item)"
            role="button"
            tabindex="0"
            @click="openBagDetail(item)"
          >
            <label
              v-if="item.category === 'fruit'"
              class="bag-select-marker absolute right-3 top-3 z-10 h-6 w-6 flex items-center justify-center rounded-full text-xs shadow-sm"
              @click.stop
            >
              <input
                :checked="isSelected(Number(item.id || 0))"
                type="checkbox"
                @click.stop
                @change="toggleSelectItem(Number(item.id || 0))"
              >
            </label>

            <div class="bag-item-id-pill absolute left-3 top-3 z-10 rounded-full px-2 py-1 text-[11px] font-mono backdrop-blur-sm">
              #{{ item.id }}
            </div>

            <div class="inventory-card__art" :data-fallback="getItemFallbackLabel(item)">
              <img
                v-if="item.image && !imageErrors[getImageErrorKey('bag', item.id)]"
                :src="item.image"
                :alt="item.name"
                class="inventory-card__image"
                loading="lazy"
                @error="imageErrors[getImageErrorKey('bag', item.id)] = true"
              >
              <div v-else class="inventory-card__fallback">
                {{ getItemFallbackLabel(item) }}
              </div>
            </div>

            <div class="inventory-card__count">
              {{ item.hoursText || `x${item.count || 0}` }}
            </div>

            <div class="inventory-card__name" :title="item.name">
              {{ item.name || `物品${item.id}` }}
            </div>

            <div class="inventory-card__meta">
              <span class="inventory-pill">
                {{ getBagCategoryLabel(resolveBagCategory(item)) }}
              </span>
              <span>{{ getItemMetaLine(item) }}</span>
              <span v-if="getItemDescription(item)">
                {{ getItemDescription(item) }}
              </span>
              <span v-if="item.category === 'fruit'" class="bag-meta-success">
                可加入手动出售
              </span>
            </div>

            <div v-if="getItemStatusTags(item).length" class="inventory-card__tag-list">
              <span
                v-for="tag in getItemStatusTags(item)"
                :key="`${item.id}-${tag}`"
                class="inventory-card__tag"
              >
                {{ tag }}
              </span>
            </div>

            <div class="inventory-card__footer">
              <span>点击查看详情</span>
              <span v-if="item.canUse" class="inventory-card__footer-tag">可使用</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'shop'" class="space-y-4">
        <div class="bag-subtoolbar ui-mobile-sticky-panel glass-panel rounded-2xl p-4 shadow">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div class="text-lg font-semibold">
                商店货架
              </div>
              <div class="bag-inline-note mt-1 text-sm">
                游戏内商店分为种子、宠物、装扮三个分页，当前优先展示已抓到的真实商品。
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="inventory-toolbar__search min-w-[220px]">
                <div class="i-carbon-search text-sm opacity-70" />
                <input v-model="shopQuery" type="text" class="inventory-search-input" placeholder="搜索商店商品 / 物品 / 条件">
              </div>
              <label class="trade-select-wrap">
                <span class="trade-select-wrap__label">排序</span>
                <select v-model="shopSortBy" class="trade-select">
                  <option v-for="option in shopSortOptions" :key="option.key" :value="option.key">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="shopLoading || actionLoading" :loading="shopLoading" loading-label="刷新中" icon-class="i-carbon-renew" @click="currentAccountId && bagStore.fetchShopCatalog(currentAccountId)">
                刷新商店
              </BaseButton>
            </div>
          </div>

          <BaseFilterChips class="inventory-toolbar__chips bag-chip-row mt-4">
            <BaseFilterChip
              v-for="section in shopSections"
              :key="section.tabKey"
              as="button"
              type="button"
              class="bag-filter-chip"
              :active="shopTabKey === section.tabKey"
              @click="shopTabKey = section.tabKey"
            >
              <span>{{ section.label }}</span>
              <span class="bag-filter-chip__count">{{ section.goods?.length || 0 }}</span>
            </BaseFilterChip>
          </BaseFilterChips>

          <div class="bag-inline-note mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span>{{ currentShopSection?.description || '商店数据加载中' }}</span>
            <span v-if="currentShopSection?.isPlaceholder">· 当前账号尚未抓到该分页，先保留完整结构</span>
            <span v-else-if="currentShopSection?.error">· {{ currentShopSection.error }}</span>
          </div>

          <BaseFilterChips class="inventory-toolbar__chips bag-chip-row mt-4">
            <BaseFilterChip
              v-for="option in shopFilterOptions"
              :key="option.key"
              as="button"
              type="button"
              class="bag-filter-chip"
              :active="shopQuickFilter === option.key"
              @click="setShopQuickFilter(option.key)"
            >
              <span>{{ option.label }}</span>
              <span class="bag-filter-chip__count">{{ option.count }}</span>
            </BaseFilterChip>
          </BaseFilterChips>
        </div>

        <div v-if="shopLoading" class="flex justify-center py-10">
          <div class="bag-spinner ui-state-spinner i-svg-spinners-90-ring-with-bg text-3xl" />
        </div>

        <BaseEmptyState
          v-else-if="!filteredShopGoods.length"
          compact
          class="bag-empty-state glass-text-muted p-8 text-center"
          icon="i-carbon-shopping-bag"
          title="当前暂无商店商品"
          :description="currentShopSection?.isPlaceholder ? `当前账号尚未抓到${currentShopSection?.label || '该'}商店数据` : '当前筛选下没有可显示的商店商品。'"
        />

        <div v-else class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="goods in filteredShopGoods"
            :key="goods.entryKey || goods.goodsId"
            class="bag-market-card mall-card glass-panel rounded-2xl p-4 shadow"
            role="button"
            tabindex="0"
            @click="openMallDetail(goods)"
          >
            <div class="bag-market-card__head flex items-start gap-4">
              <div class="mall-card__art" :data-fallback="getMallFallbackLabel(goods)">
                <img
                  v-if="goods.image && !imageErrors[getImageErrorKey('shop', goods.goodsId)]"
                  :src="goods.image"
                  :alt="goods.name"
                  class="mall-card__image"
                  :class="{ 'mall-card__image--locked': isGoodsLocked(goods) }"
                  loading="lazy"
                  @error="imageErrors[getImageErrorKey('shop', goods.goodsId)] = true"
                >
                <div v-else class="inventory-card__fallback">
                  {{ getMallFallbackLabel(goods) }}
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="glass-text-main truncate text-base font-semibold">
                  {{ goods.name }}
                </div>
                <div class="bag-inline-note mt-1 text-sm">
                  商品ID #{{ goods.goodsId }} · {{ getGoodsSourceLabel(goods) }}
                </div>
                <div class="mt-3 flex flex-wrap gap-2 text-xs">
                  <span class="inventory-pill inventory-pill-emerald">
                    {{ getMallPriceLabel(goods) }}
                  </span>
                  <span v-if="goods.isLimited" class="inventory-pill inventory-pill-amber">
                    限购 {{ goods.remainingCount ?? goods.limitCount ?? 0 }}
                  </span>
                  <span v-if="getShopStatusLabel(goods)" class="inventory-pill inventory-pill-sky">
                    {{ getShopStatusLabel(goods) }}
                  </span>
                </div>
                <div class="mall-card__summary">
                  {{ getGoodsSummary(goods) }}
                </div>
              </div>
              <div class="bag-market-card__side-meta bag-inline-note shrink-0 text-right text-xs">
                {{ goods.itemCount || 0 }} 个/次
              </div>
            </div>

            <div v-if="goods.itemPreviews?.length" class="mall-card__previews">
              <div
                v-for="preview in getGoodsPreviewGroups(goods, 4)"
                :key="`${goods.goodsId}-${preview.id}`"
                class="mall-preview-pill"
                :title="preview.name"
              >
                <div class="mall-preview-pill__thumb" :data-fallback="getItemFallbackLabel(preview)">
                  <img
                    v-if="preview.image && !imageErrors[getImageErrorKey('shop-preview', goods.goodsId, preview.id)]"
                    :src="preview.image"
                    :alt="preview.name"
                    loading="lazy"
                    @error="imageErrors[getImageErrorKey('shop-preview', goods.goodsId, preview.id)] = true"
                  >
                  <div v-else class="inventory-card__fallback mall-preview-pill__fallback">
                    {{ getItemFallbackLabel(preview) }}
                  </div>
                </div>
                <span class="mall-preview-pill__name">{{ preview.name }}<template v-if="preview.count > 1"> x{{ preview.count }}</template></span>
              </div>
            </div>

            <div class="bag-market-card__actions mall-card__actions">
              <div class="trade-stepper" @click.stop>
                <button class="trade-stepper__btn" @click="bumpPurchaseCount(goods, -1)">
                  -
                </button>
                <input
                  :value="getPurchaseCount(goods)"
                  type="number"
                  min="1"
                  class="trade-input trade-input-stepper"
                  @input="updatePurchaseCount(goods, Number(($event.target as HTMLInputElement).value || 1))"
                >
                <button class="trade-stepper__btn" @click="bumpPurchaseCount(goods, 1)">
                  +
                </button>
              </div>
              <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="actionLoading" stop-propagation @click="openMallDetail(goods)">
                详情
              </BaseButton>
              <BaseButton variant="primary" class="trade-btn trade-btn-primary flex-1" :disabled="actionLoading || !goods.supportsPurchase" stop-propagation @click="handleBuyGoods(goods)">
                {{ getShopActionLabel(goods) }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'sell'" class="space-y-4">
        <div class="bag-subtoolbar ui-mobile-sticky-panel glass-panel rounded-xl p-4 shadow">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-lg font-semibold">
                出售预览
              </div>
              <div class="bag-inline-note mt-1 text-sm">
                可出售 {{ sellPreview?.totalSellKinds || 0 }} 种，共 {{ sellPreview?.totalSellCount || 0 }} 个，预计 {{ sellPreview?.expectedGold || 0 }} 金币
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="sellPreviewLoading || actionLoading || previewRefreshing" :loading="previewRefreshing || sellPreviewLoading" loading-label="刷新中" icon-class="i-carbon-view" @click="handlePreviewSell">
                刷新预览
              </BaseButton>
              <BaseButton variant="primary" class="trade-btn trade-btn-primary" :disabled="actionLoading || sellingByPolicy" :loading="sellingByPolicy" loading-label="执行中" icon-class="i-carbon-flash" @click="handleSellByPolicy">
                全部按策略出售
              </BaseButton>
              <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="actionLoading || selectedSellItems.length === 0" @click="handleSellSelected">
                出售选中 {{ selectedSellItems.length }} 种
              </BaseButton>
            </div>
          </div>
        </div>

        <div v-if="sellPreviewLoading" class="flex justify-center py-10">
          <div class="bag-spinner ui-state-spinner i-svg-spinners-90-ring-with-bg text-3xl" />
        </div>

        <BaseEmptyState
          v-else-if="!sellPreview?.items?.length"
          compact
          class="bag-empty-state glass-text-muted p-8 text-center"
          icon="i-carbon-flash"
          title="暂无出售计划"
          description="先刷新预览，或调整出售策略后再查看。"
        />

        <div v-else class="space-y-3">
          <div
            v-for="item in sellPreview.items"
            :key="`sell-${item.id}`"
            class="bag-sell-preview-card glass-panel flex flex-col gap-3 rounded-xl p-4 shadow sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="bag-sell-preview-card__body min-w-0 flex-1">
              <div class="bag-sell-preview-card__head flex items-center gap-3">
                <label v-if="sellableIds.has(Number(item.id || 0))" class="shrink-0">
                  <input
                    :checked="isSelected(Number(item.id || 0))"
                    type="checkbox"
                    @change="toggleSelectItem(Number(item.id || 0))"
                  >
                </label>
                <div class="min-w-0">
                  <div class="truncate text-base font-semibold">
                    {{ item.name }}
                  </div>
                  <div class="bag-inline-note mt-1 text-sm">
                    持有 {{ item.count }} · 出售 {{ item.sellCount }} · 保留 {{ item.keepCount }} · 单价 {{ item.unitPrice }}
                  </div>
                  <div v-if="formatPreviewReason(item)" class="bag-note-warning mt-1 text-xs">
                    {{ formatPreviewReason(item) }}
                  </div>
                </div>
              </div>
            </div>
            <div class="bag-sell-preview-card__meta text-right text-sm">
              <div class="bag-value-success font-semibold">
                预计 {{ item.sellValue }} 金币
              </div>
              <div class="bag-inline-note mt-1 text-xs">
                ID #{{ item.id }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'mall'" class="space-y-4">
        <div class="bag-subtoolbar ui-mobile-sticky-panel glass-panel rounded-2xl p-4 shadow">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div class="text-lg font-semibold">
                商城货架
              </div>
              <div class="bag-inline-note mt-1 text-sm">
                商城包含礼包商城、月卡商城、充值商城；月卡与充值页默认只展示，不直接代付。
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="inventory-toolbar__search min-w-[220px]">
                <div class="i-carbon-search text-sm opacity-70" />
                <input v-model="mallQuery" type="text" class="inventory-search-input" placeholder="搜索商品 / ID / 内容物">
              </div>
              <label class="trade-select-wrap">
                <span class="trade-select-wrap__label">排序</span>
                <select v-model="mallSortBy" class="trade-select">
                  <option v-for="option in mallSortOptions" :key="option.key" :value="option.key">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="mallLoading || actionLoading" :loading="mallLoading" loading-label="刷新中" icon-class="i-carbon-renew" @click="currentAccountId && bagStore.fetchMallCatalog(currentAccountId)">
                刷新商城
              </BaseButton>
            </div>
          </div>

          <BaseFilterChips class="inventory-toolbar__chips bag-chip-row mt-4">
            <BaseFilterChip
              v-for="section in mallSections"
              :key="section.slotKey"
              as="button"
              type="button"
              class="bag-filter-chip"
              :active="mallTabKey === section.slotKey"
              @click="mallTabKey = section.slotKey"
            >
              <span>{{ section.label }}</span>
              <span class="bag-filter-chip__count">{{ section.goods?.length || 0 }}</span>
            </BaseFilterChip>
          </BaseFilterChips>

          <div class="bag-inline-note mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span>{{ currentMallSection?.description || '商城数据加载中' }}</span>
            <span v-if="currentMallSection?.purchaseHint">· {{ currentMallSection.purchaseHint }}</span>
            <span v-if="claimableMonthCardCount && mallTabKey === 'month_card'">· 当前有 {{ claimableMonthCardCount }} 个月卡奖励可领</span>
          </div>

          <BaseFilterChips class="inventory-toolbar__chips bag-chip-row mt-4">
            <BaseFilterChip
              v-for="option in mallFilterOptions"
              :key="option.key"
              as="button"
              type="button"
              class="bag-filter-chip"
              :active="mallQuickFilter === option.key"
              @click="setMallQuickFilter(option.key)"
            >
              <span>{{ option.label }}</span>
              <span class="bag-filter-chip__count">{{ option.count }}</span>
            </BaseFilterChip>
          </BaseFilterChips>

          <div v-if="mallTabKey === 'month_card' && monthCardInfos.length" class="grid mt-4 gap-3 md:grid-cols-2">
            <div
              v-for="info in monthCardInfos"
              :key="`month-card-${info.goodsId}`"
              class="glass-panel rounded-xl p-4 shadow"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold">
                    月卡商品 #{{ info.goodsId }}
                  </div>
                  <div class="bag-inline-note mt-1 text-xs">
                    {{ info.reward ? `${info.reward.name} x${info.reward.count}` : '暂无奖励配置' }}
                  </div>
                </div>
                <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="actionLoading || !info.canClaim" @click="handleClaimMonthCard(info.goodsId)">
                  {{ info.canClaim ? '领取奖励' : '今日已领' }}
                </BaseButton>
              </div>
            </div>
          </div>

          <div v-if="recommendedMallGoods.length" class="recommend-strip">
            <div class="flex flex-col gap-2">
              <div class="recommend-strip__label">
                常买推荐
              </div>
              <div class="bag-info-banner">
                {{ MALL_PURCHASE_BROWSER_PREF_NOTE }}
              </div>
            </div>
            <div class="recommend-strip__list">
              <button
                v-for="goods in recommendedMallGoods"
                :key="`recommend-${goods.goodsId}`"
                class="recommend-card"
                @click="openMallDetail(goods)"
              >
                <div class="recommend-card__main">
                  <span class="recommend-card__title">{{ goods.name }}</span>
                  <span class="recommend-card__meta">{{ getMallPriceLabel(goods) }} · 已买 {{ goods.purchaseStats.count }} 次</span>
                </div>
                <div class="recommend-card__time">
                  {{ formatPurchaseTime(goods.purchaseStats.lastPurchasedAt) }}
                </div>
              </button>
            </div>
          </div>
        </div>

        <div v-if="mallLoading" class="flex justify-center py-10">
          <div class="bag-spinner ui-state-spinner i-svg-spinners-90-ring-with-bg text-3xl" />
        </div>

        <BaseEmptyState
          v-else-if="!filteredMallGoods.length"
          compact
          class="bag-empty-state glass-text-muted p-8 text-center"
          icon="i-carbon-shopping-cart"
          title="当前暂无商城商品"
          :description="mallTabKey === 'month_card' && monthCardInfos.length ? '当前已展示月卡奖励状态，暂无可直接购买商品。' : `${currentMallSection?.label || '商城'}当前筛选下暂无可显示商品。`"
        />

        <div v-else class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="goods in filteredMallGoods"
            :key="goods.goodsId"
            class="bag-market-card mall-card glass-panel rounded-2xl p-4 shadow"
            role="button"
            tabindex="0"
            @click="openMallDetail(goods)"
          >
            <div class="bag-market-card__head flex items-start gap-4">
              <div class="mall-card__art" :data-fallback="getMallFallbackLabel(goods)">
                <img
                  v-if="goods.image && !imageErrors[getImageErrorKey('mall', goods.goodsId)]"
                  :src="goods.image"
                  :alt="goods.name"
                  class="mall-card__image"
                  loading="lazy"
                  @error="imageErrors[getImageErrorKey('mall', goods.goodsId)] = true"
                >
                <div v-else class="inventory-card__fallback">
                  {{ getMallFallbackLabel(goods) }}
                </div>
              </div>

              <div class="min-w-0 flex-1">
                <div class="glass-text-main truncate text-base font-semibold">
                  {{ goods.name }}
                </div>
                <div class="glass-text-muted mt-1 text-sm">
                  商品ID #{{ goods.goodsId }} · {{ goods.slotLabel || currentMallSection?.label || '商城' }}
                </div>
                <div class="mt-3 flex flex-wrap gap-2 text-xs">
                  <span class="inventory-pill inventory-pill-emerald">
                    {{ getMallPriceLabel(goods) }}
                  </span>
                  <span v-if="goods.isLimited" class="inventory-pill inventory-pill-amber">
                    限购
                  </span>
                  <span v-if="goods.discount" class="inventory-pill inventory-pill-sky">
                    {{ goods.discount }}
                  </span>
                  <span v-if="!goods.supportsPurchase" class="inventory-pill inventory-pill-sky">
                    游戏内支付
                  </span>
                </div>
                <div class="mall-card__summary">
                  {{ getGoodsSummary(goods) }}
                </div>
                <div v-if="goods.slotKey === 'month_card' && getMonthCardInfo(goods)?.reward" class="glass-text-muted mt-2 text-xs">
                  今日奖励：{{ getMonthCardInfo(goods)?.reward?.name }} x{{ getMonthCardInfo(goods)?.reward?.count }}
                </div>
              </div>
              <div class="glass-text-muted shrink-0 text-right text-xs">
                包含 {{ goods.itemIds?.length || 0 }} 项
              </div>
            </div>

            <div v-if="goods.itemPreviews?.length" class="mall-card__previews">
              <div
                v-for="preview in getGoodsPreviewGroups(goods, 4)"
                :key="`${goods.goodsId}-${preview.id}`"
                class="mall-preview-pill"
                :title="preview.name"
              >
                <div class="mall-preview-pill__thumb" :data-fallback="getItemFallbackLabel(preview)">
                  <img
                    v-if="preview.image && !imageErrors[getImageErrorKey('mall-preview', goods.goodsId, preview.id)]"
                    :src="preview.image"
                    :alt="preview.name"
                    loading="lazy"
                    @error="imageErrors[getImageErrorKey('mall-preview', goods.goodsId, preview.id)] = true"
                  >
                  <div v-else class="inventory-card__fallback mall-preview-pill__fallback">
                    {{ getItemFallbackLabel(preview) }}
                  </div>
                </div>
                <span class="mall-preview-pill__name">{{ preview.name }}<template v-if="preview.count > 1"> x{{ preview.count }}</template></span>
              </div>
              <div v-if="getGoodsPreviewGroups(goods).length > 4" class="mall-preview-pill mall-preview-pill--more">
                另有 {{ getGoodsPreviewGroups(goods).length - 4 }} 项
              </div>
            </div>

            <div class="bag-market-card__actions mall-card__actions">
              <div class="trade-stepper" @click.stop>
                <button class="trade-stepper__btn" @click="bumpPurchaseCount(goods, -1)">
                  -
                </button>
                <input
                  :value="getPurchaseCount(goods)"
                  type="number"
                  min="1"
                  class="trade-input trade-input-stepper"
                  @input="updatePurchaseCount(goods, Number(($event.target as HTMLInputElement).value || 1))"
                >
                <button class="trade-stepper__btn" @click="bumpPurchaseCount(goods, 1)">
                  +
                </button>
              </div>
              <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="actionLoading" stop-propagation @click="openMallDetail(goods)">
                详情
              </BaseButton>
              <BaseButton
                v-if="goods.slotKey === 'month_card' && getMonthCardInfo(goods)?.canClaim"
                variant="secondary"
                class="trade-btn trade-btn-secondary"
                :disabled="actionLoading"
                stop-propagation
                @click="handleClaimMonthCard(goods)"
              >
                领今日奖励
              </BaseButton>
              <BaseButton variant="primary" class="trade-btn trade-btn-primary flex-1" :disabled="actionLoading || !goods.supportsPurchase" stop-propagation @click="handleBuyGoods(goods)">
                {{ goods.supportsPurchase ? '购买' : '去游戏内购买' }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="bagDetailItem || mallDetailGoods" class="detail-modal-backdrop" @click="closeDetailPanel">
        <div class="detail-modal-panel" @click.stop>
          <div class="detail-modal-header">
            <div class="detail-modal-header__copy">
              <div class="detail-modal-header__eyebrow">
                {{ bagDetailItem ? '物品详情' : (mallDetailGoods?.sourceType === 'shop' ? '商店商品详情' : '商城商品详情') }}
              </div>
              <div class="detail-modal-header__title">
                {{ bagDetailItem?.name || mallDetailGoods?.name }}
              </div>
              <div class="detail-modal-header__sub">
                <template v-if="bagDetailItem">
                  物品ID #{{ bagDetailItem.id }}
                </template>
                <template v-else>
                  商品ID #{{ mallDetailGoods?.goodsId }} · {{ getGoodsSourceLabel(mallDetailGoods) }}
                </template>
              </div>
            </div>
            <button type="button" class="detail-modal-close" aria-label="关闭详情弹窗" @click="closeDetailPanel">
              <span class="detail-modal-close__icon i-carbon-close" aria-hidden="true" />
              <span class="detail-modal-close__text">关闭</span>
            </button>
          </div>
          <div class="detail-modal-body">
            <template v-if="bagDetailItem">
              <div class="detail-hero">
                <div class="detail-hero__art" :data-fallback="getItemFallbackLabel(bagDetailItem)">
                  <img
                    v-if="bagDetailItem.image && !imageErrors[getImageErrorKey('bag-detail', bagDetailItem.id)]"
                    :src="bagDetailItem.image"
                    :alt="bagDetailItem.name"
                    class="detail-hero__image"
                    loading="lazy"
                    @error="imageErrors[getImageErrorKey('bag-detail', bagDetailItem.id)] = true"
                  >
                  <div v-else class="inventory-card__fallback">
                    {{ getItemFallbackLabel(bagDetailItem) }}
                  </div>
                </div>
                <div class="detail-hero__copy">
                  <div class="detail-badges">
                    <span class="inventory-pill">{{ getBagCategoryLabel(resolveBagCategory(bagDetailItem)) }}</span>
                    <span class="inventory-pill inventory-pill-sky">稀有度 {{ getRarityLabel(bagDetailItem.rarity) }}</span>
                    <span class="inventory-pill" :class="bagDetailItem.canUse ? 'inventory-pill-emerald' : 'inventory-pill-amber'">
                      {{ bagDetailItem.canUse ? '可使用' : '不可直接使用' }}
                    </span>
                  </div>
                  <div class="detail-summary">
                    {{ getItemDescription(bagDetailItem) || '暂无物品说明' }}
                  </div>
                  <div class="detail-copy detail-copy--muted text-xs leading-6">
                    {{ getBagCategoryHint(bagDetailItem) }}
                  </div>
                  <div v-if="getItemStatusTags(bagDetailItem).length" class="detail-tag-list">
                    <span
                      v-for="tag in getItemStatusTags(bagDetailItem)"
                      :key="`detail-${bagDetailItem.id}-${tag}`"
                      class="inventory-pill inventory-pill-sky"
                    >
                      {{ tag }}
                    </span>
                  </div>
                  <div class="detail-actions">
                    <div v-if="bagDetailItem.canUse && !itemNeedsLandSelection(bagDetailItem)" class="trade-stepper">
                      <button class="trade-stepper__btn" @click="bumpUseCount(bagDetailItem.id, -1, bagDetailItem.count)">
                        -
                      </button>
                      <input
                        :value="getUseCount(bagDetailItem.id, bagDetailItem.count)"
                        type="number"
                        min="1"
                        :max="Math.max(1, Number(bagDetailItem.count || 1))"
                        class="trade-input trade-input-stepper"
                        @input="updateUseCount(bagDetailItem.id, Number(($event.target as HTMLInputElement).value || 1), bagDetailItem.count)"
                      >
                      <button class="trade-stepper__btn" @click="bumpUseCount(bagDetailItem.id, 1, bagDetailItem.count)">
                        +
                      </button>
                    </div>
                    <div v-if="bagDetailItem.canUse && itemNeedsLandSelection(bagDetailItem)" class="detail-land-counter">
                      已选 {{ selectedLandIds.length }} / {{ getLandSelectionLimit(bagDetailItem) }} 块，将按选中地块数消耗
                    </div>
                    <BaseButton
                      v-if="bagDetailItem.canUse"
                      variant="primary"
                      class="trade-btn trade-btn-primary"
                      :disabled="actionLoading"
                      @click="handleUseBagItem(bagDetailItem)"
                    >
                      立即使用
                    </BaseButton>
                    <BaseButton
                      v-if="bagDetailItem.category === 'fruit'"
                      variant="primary"
                      class="trade-btn trade-btn-primary"
                      @click="toggleSelectItem(Number(bagDetailItem.id || 0))"
                    >
                      {{ isSelected(Number(bagDetailItem.id || 0)) ? '移出出售选择' : '加入出售选择' }}
                    </BaseButton>
                    <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" @click="closeDetailPanel">
                      返回列表
                    </BaseButton>
                  </div>
                </div>
              </div>

              <section class="detail-block">
                <div class="detail-block__header">
                  <div class="detail-block__title">
                    基础信息
                  </div>
                  <div class="detail-block__meta">
                    库存、等级、类型与堆叠限制
                  </div>
                </div>
                <div class="detail-stats">
                  <div class="detail-stat-card detail-stat-card-emerald">
                    <span class="detail-stat-card__label">当前持有</span>
                    <span class="detail-stat-card__value">{{ bagDetailItem.hoursText || `x${bagDetailItem.count || 0}` }}</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-amber">
                    <span class="detail-stat-card__label">等级 / 单价</span>
                    <span class="detail-stat-card__value">Lv{{ bagDetailItem.level || 0 }} · {{ bagDetailItem.price || 0 }}金</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-sky">
                    <span class="detail-stat-card__label">类型 / 交互</span>
                    <span class="detail-stat-card__value">{{ bagDetailItem.itemType || 0 }} · {{ bagDetailItem.interactionType || '无' }}</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-violet">
                    <span class="detail-stat-card__label">堆叠上限</span>
                    <span class="detail-stat-card__value">{{ bagDetailItem.maxCount || 0 }} / {{ bagDetailItem.maxOwn || 0 }}</span>
                  </div>
                </div>
              </section>

              <section class="detail-block">
                <div class="detail-block__header">
                  <div class="detail-block__title">
                    详细说明
                  </div>
                  <div class="detail-block__meta">
                    物品用途与补充描述
                  </div>
                </div>
                <div class="detail-sections">
                  <div v-for="(text, index) in getItemLongDescription(bagDetailItem)" :key="`bag-desc-${index}`" class="detail-section-card">
                    {{ text }}
                  </div>
                </div>
              </section>

              <template v-if="bagDetailItem.canUse && itemNeedsLandSelection(bagDetailItem)">
                <section class="detail-block">
                  <div class="detail-block__header">
                    <div class="detail-block__title">
                      目标土地
                    </div>
                    <div class="detail-block__meta">
                      已选 {{ selectedLandIds.length }} / {{ getLandSelectionLimit(bagDetailItem) }}
                    </div>
                  </div>
                  <div class="detail-land-toolbar">
                    <div class="detail-land-toolbar__hint">
                      {{ getLandSelectionHint(bagDetailItem) }}
                    </div>
                    <div class="detail-land-toolbar__actions">
                      <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="landsLoading" @click="ensureFarmLandsLoaded()">
                        刷新土地
                      </BaseButton>
                      <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="suggestedTargetLandIds.length === 0" @click="selectSuggestedLands()">
                        智能选择
                      </BaseButton>
                      <BaseButton variant="secondary" class="trade-btn trade-btn-secondary" :disabled="selectedLandIds.length === 0" @click="clearSelectedLands()">
                        清空选择
                      </BaseButton>
                    </div>
                  </div>
                  <div v-if="landsLoading" class="detail-land-empty">
                    正在加载土地...
                  </div>
                  <div v-else-if="availableTargetLands.length === 0" class="detail-land-empty">
                    当前没有可用土地数据
                  </div>
                  <div v-else class="detail-land-grid">
                    <button
                      v-for="land in availableTargetLands"
                      :key="`use-land-${land.id}`"
                      class="detail-land-card"
                      :class="{ active: isLandSelected(Number(land.id || 0)), suggested: suggestedTargetLandIds.includes(Number(land.id || 0)) }"
                      @click="toggleSelectedLand(Number(land.id || 0))"
                    >
                      <div class="detail-land-card__head">
                        <span class="detail-land-card__id">#{{ land.id }}</span>
                        <span class="detail-land-card__status">{{ normalizeLandStatusLabel(land) }}</span>
                      </div>
                      <div class="detail-land-card__name">
                        {{ land.plantName || land.phaseName || '空地' }}
                      </div>
                      <div class="detail-land-card__meta">
                        <span v-if="land.needWater">缺水</span>
                        <span v-if="land.needWeed">有草</span>
                        <span v-if="land.needBug">有虫</span>
                        <span v-if="Number(land.matureInSec || 0) > 0">{{ Number(land.matureInSec || 0) }}s</span>
                        <span v-if="!land.needWater && !land.needWeed && !land.needBug && Number(land.matureInSec || 0) <= 0">普通</span>
                      </div>
                    </button>
                  </div>
                </section>
              </template>

              <template v-if="lastUseResult && Number(lastUseResult.itemId || 0) === Number(bagDetailItem.id || 0)">
                <section class="detail-block detail-block-highlight">
                  <div class="detail-block__header">
                    <div class="detail-block__title">
                      本次使用结果
                    </div>
                    <div class="detail-block__meta">
                      {{ lastUseResult.count || 1 }} 次操作反馈
                    </div>
                  </div>
                  <div class="detail-use-summary">
                    <div class="detail-use-summary__message">
                      {{ lastUseResult.rewardSummary || lastUseResult.message || '使用成功' }}
                    </div>
                    <div class="detail-use-summary__meta">
                      <span>使用数量 {{ lastUseResult.count || 1 }}</span>
                      <span v-if="lastUseResult.landIds?.length">目标土地 {{ lastUseResult.landIds.join(', ') }}</span>
                    </div>
                  </div>
                  <div v-if="lastUseResult.rewardItems?.length" class="detail-preview-grid">
                    <div
                      v-for="reward in lastUseResult.rewardItems"
                      :key="`use-result-${bagDetailItem.id}-${reward.id}`"
                      class="detail-preview-card"
                    >
                      <div class="detail-preview-card__thumb" :data-fallback="getItemFallbackLabel(reward)">
                        <img
                          v-if="reward.image && !imageErrors[getImageErrorKey('use-result', bagDetailItem.id, reward.id)]"
                          :src="reward.image"
                          :alt="reward.name"
                          loading="lazy"
                          @error="imageErrors[getImageErrorKey('use-result', bagDetailItem.id, reward.id)] = true"
                        >
                        <div v-else class="inventory-card__fallback detail-preview-card__fallback">
                          {{ getItemFallbackLabel(reward) }}
                        </div>
                      </div>
                      <div class="detail-preview-card__copy">
                        <div class="detail-preview-card__title">
                          {{ reward.name }}
                        </div>
                        <div class="detail-preview-card__meta">
                          <span>{{ getBagCategoryLabel(resolveBagCategory(reward)) }}</span>
                          <span>x{{ reward.count }}</span>
                          <span v-if="reward.level > 0">Lv{{ reward.level }}</span>
                        </div>
                        <div v-if="reward.effectDesc || reward.desc" class="detail-preview-card__desc">
                          {{ reward.effectDesc || reward.desc }}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </template>
            </template>

            <template v-else-if="mallDetailGoods">
              <div class="detail-hero">
                <div class="detail-hero__art" :data-fallback="getMallFallbackLabel(mallDetailGoods)">
                  <img
                    v-if="mallDetailGoods.image && !imageErrors[getImageErrorKey('mall-detail', mallDetailGoods.goodsId)]"
                    :src="mallDetailGoods.image"
                    :alt="mallDetailGoods.name"
                    class="detail-hero__image"
                    loading="lazy"
                    @error="imageErrors[getImageErrorKey('mall-detail', mallDetailGoods.goodsId)] = true"
                  >
                  <div v-else class="inventory-card__fallback">
                    {{ getMallFallbackLabel(mallDetailGoods) }}
                  </div>
                </div>
                <div class="detail-hero__copy">
                  <div class="detail-badges">
                    <span class="inventory-pill inventory-pill-emerald">{{ getMallPriceLabel(mallDetailGoods) }}</span>
                    <span v-if="mallDetailGoods.isLimited" class="inventory-pill inventory-pill-amber">限购商品</span>
                    <span v-if="!mallDetailGoods.supportsPurchase" class="inventory-pill inventory-pill-sky">{{ mallDetailGoods.purchaseDisabledReason || '需在游戏内完成' }}</span>
                    <span class="inventory-pill inventory-pill-sky">内容 {{ getGoodsPreviewGroups(mallDetailGoods).length }} 种</span>
                  </div>
                  <div class="detail-summary">
                    {{ getGoodsSummary(mallDetailGoods) }}
                  </div>
                  <div class="detail-actions">
                    <div v-if="mallDetailGoods.supportsPurchase" class="trade-stepper">
                      <button class="trade-stepper__btn" @click="bumpPurchaseCount(mallDetailGoods, -1)">
                        -
                      </button>
                      <input
                        :value="getPurchaseCount(mallDetailGoods)"
                        type="number"
                        min="1"
                        class="trade-input trade-input-stepper"
                        @input="updatePurchaseCount(mallDetailGoods, Number(($event.target as HTMLInputElement).value || 1))"
                      >
                      <button class="trade-stepper__btn" @click="bumpPurchaseCount(mallDetailGoods, 1)">
                        +
                      </button>
                    </div>
                    <BaseButton
                      v-if="mallDetailGoods.slotKey === 'month_card' && getMonthCardInfo(mallDetailGoods)?.canClaim"
                      variant="secondary"
                      class="trade-btn trade-btn-secondary"
                      :disabled="actionLoading"
                      @click="handleClaimMonthCard(mallDetailGoods)"
                    >
                      领取今日奖励
                    </BaseButton>
                    <BaseButton variant="primary" class="trade-btn trade-btn-primary" :disabled="actionLoading || !mallDetailGoods.supportsPurchase" @click="handleBuyGoods(mallDetailGoods)">
                      {{ mallDetailGoods.supportsPurchase ? '立即购买' : '需在游戏内完成' }}
                    </BaseButton>
                  </div>
                </div>
              </div>

              <section class="detail-block">
                <div class="detail-block__header">
                  <div class="detail-block__title">
                    购买信息
                  </div>
                  <div class="detail-block__meta">
                    价格、来源与近期购买记录
                  </div>
                </div>
                <div class="detail-stats">
                  <div class="detail-stat-card detail-stat-card-emerald">
                    <span class="detail-stat-card__label">价格</span>
                    <span class="detail-stat-card__value">{{ getMallPriceLabel(mallDetailGoods) }}</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-sky">
                    <span class="detail-stat-card__label">所属分页</span>
                    <span class="detail-stat-card__value">{{ getGoodsSourceLabel(mallDetailGoods) }}</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-amber">
                    <span class="detail-stat-card__label">内容总项</span>
                    <span class="detail-stat-card__value">{{ mallDetailGoods.itemIds?.length || 0 }}</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-violet">
                    <span class="detail-stat-card__label">主物品</span>
                    <span class="detail-stat-card__value">#{{ mallDetailGoods.primaryItemId || 0 }}</span>
                  </div>
                  <div class="detail-stat-card detail-stat-card-rose">
                    <span class="detail-stat-card__label">购买记录</span>
                    <span class="detail-stat-card__value">
                      {{ getMallPurchaseStats(mallDetailGoods).count || 0 }} 次 · {{ formatPurchaseTime(getMallPurchaseStats(mallDetailGoods).lastPurchasedAt) }}
                    </span>
                  </div>
                </div>
              </section>

              <section class="detail-block">
                <div class="detail-block__header">
                  <div class="detail-block__title">
                    内容物清单
                  </div>
                  <div class="detail-block__meta">
                    共 {{ getGoodsPreviewGroups(mallDetailGoods).length }} 种内容物
                  </div>
                </div>
                <div class="detail-preview-grid">
                  <div v-for="preview in getGoodsPreviewGroups(mallDetailGoods)" :key="`detail-preview-${mallDetailGoods.goodsId}-${preview.id}`" class="detail-preview-card">
                    <div class="detail-preview-card__thumb" :data-fallback="getItemFallbackLabel(preview)">
                      <img
                        v-if="preview.image && !imageErrors[getImageErrorKey('mall-detail-preview', mallDetailGoods.goodsId, preview.id)]"
                        :src="preview.image"
                        :alt="preview.name"
                        loading="lazy"
                        @error="imageErrors[getImageErrorKey('mall-detail-preview', mallDetailGoods.goodsId, preview.id)] = true"
                      >
                      <div v-else class="inventory-card__fallback detail-preview-card__fallback">
                        {{ getItemFallbackLabel(preview) }}
                      </div>
                    </div>
                    <div class="detail-preview-card__copy">
                      <div class="detail-preview-card__title">
                        {{ preview.name }}
                      </div>
                      <div class="detail-preview-card__meta">
                        <span>{{ getBagCategoryLabel(resolveBagCategory(preview)) }}</span>
                        <span v-if="preview.count > 1">x{{ preview.count }}</span>
                        <span v-if="preview.level > 0">Lv{{ preview.level }}</span>
                      </div>
                      <div v-if="preview.effectDesc || preview.desc" class="detail-preview-card__desc">
                        {{ preview.effectDesc || preview.desc }}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.bag-panel {
  --bag-surface: var(--ui-bg-surface);
  --bag-surface-raised: var(--ui-bg-surface-raised);
  --bag-border: var(--ui-border-subtle);
  --bag-border-strong: var(--ui-border-strong);
  --bag-text-main: var(--ui-text-1);
  --bag-text-muted: var(--ui-text-2);
  --bag-text-soft: var(--ui-text-3);
  --bag-shadow-soft: var(--ui-shadow-panel);
  --bag-shadow-strong: var(--ui-shadow-panel-strong);
  --bag-shadow-inner: var(--ui-shadow-inner);
  --bag-overlay-backdrop: var(--ui-overlay-backdrop);
  --bag-brand-soft: color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  --bag-brand-soft-strong: color-mix(in srgb, var(--ui-brand-500) 18%, transparent);
  --bag-brand-border: color-mix(in srgb, var(--ui-border-subtle) 68%, var(--ui-brand-500) 32%);
  --bag-brand-border-strong: color-mix(in srgb, var(--ui-border-subtle) 54%, var(--ui-brand-500) 46%);
  --bag-brand-gradient-soft: linear-gradient(135deg, var(--bag-brand-soft), var(--bag-surface));
  --bag-brand-gradient-strong: linear-gradient(135deg, var(--bag-brand-soft-strong), var(--bag-surface));
  --bag-status-use-bg: color-mix(in srgb, var(--ui-status-success-soft) 78%, transparent);
  --bag-status-purchase-bg: color-mix(in srgb, var(--ui-status-warning-soft) 80%, transparent);
  --bag-status-sell-bg: color-mix(in srgb, var(--ui-status-info-soft) 80%, transparent);
  --bag-category-fruit-border: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-status-warning) 30%);
  --bag-category-seed-border: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-status-success) 30%);
  --bag-category-fertilizer-border: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-status-info) 30%);
  --bag-category-pack-border: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-status-danger) 30%);
  --bag-category-pet-border: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-status-info) 30%);
  --bag-category-item-border: color-mix(in srgb, var(--ui-border-subtle) 82%, var(--ui-text-3) 18%);
}

.bag-panel :deep([class*='text-'][class*='gray-500']),
.bag-panel :deep([class*='text-'][class*='gray-400']) {
  color: var(--bag-text-muted) !important;
}

.bag-panel :deep([class*='text-'][class*='white/95']),
.bag-panel :deep([class*='text-'][class*='white/90']),
.bag-panel :deep([class*='text-'][class*='white/85']) {
  color: color-mix(in srgb, var(--ui-text-on-brand) 92%, var(--bag-text-main) 8%) !important;
}

.bag-panel :deep([class*='text-'][class*='white/55']),
.bag-panel :deep([class*='text-'][class*='white/45']) {
  color: color-mix(in srgb, var(--ui-text-on-brand) 68%, var(--bag-text-main) 32%) !important;
}

.bag-panel :deep(.glass-panel) {
  border-color: var(--bag-border) !important;
}

.bag-panel__summary,
.bag-inline-note,
.bag-inline-checkbox {
  color: var(--bag-text-muted) !important;
}

.bag-topbar {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.bag-topbar__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
}

.bag-topbar__copy {
  min-width: 0;
}

.bag-topbar__desc {
  margin-top: 0.45rem;
  color: var(--bag-text-muted);
  font-size: 0.84rem;
  line-height: 1.55;
}

.bag-topbar__actions,
.bag-topbar__chips,
.bag-tab-bar {
  display: flex;
  gap: 0.5rem;
}

.bag-topbar__chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--bag-border);
  border-radius: 999px;
  background: var(--bag-surface);
  color: var(--bag-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.bag-section-eyebrow {
  color: var(--bag-text-soft) !important;
  letter-spacing: 0.2em;
}

.bag-note-warning {
  color: color-mix(in srgb, var(--ui-status-warning) 78%, var(--bag-text-main)) !important;
}

.bag-info-banner {
  border: 1px solid color-mix(in srgb, var(--ui-status-info) 22%, transparent) !important;
  border-radius: 0.875rem;
  background: color-mix(in srgb, var(--ui-status-info) 7%, var(--bag-surface-raised) 93%) !important;
  color: color-mix(in srgb, var(--ui-status-info) 76%, var(--bag-text-main)) !important;
  padding: 0.5rem 0.75rem;
  line-height: 1.5;
}

.bag-empty-state {
  border: 1px solid var(--bag-border) !important;
  border-radius: 0.75rem;
  background: var(--bag-surface) !important;
}

.bag-error-state {
  border: 1px solid color-mix(in srgb, var(--ui-status-danger) 22%, transparent) !important;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--bag-surface-raised) 92%) !important;
  color: color-mix(in srgb, var(--ui-status-danger) 82%, var(--bag-text-main)) !important;
}

.bag-spinner {
  color: var(--ui-status-info) !important;
}

.bag-offline-icon {
  color: var(--bag-text-soft) !important;
}

.bag-select-marker {
  background: color-mix(in srgb, var(--bag-surface-raised) 92%, transparent) !important;
  color: var(--bag-text-main) !important;
}

.bag-item-id-pill {
  background: color-mix(in srgb, var(--ui-text-1) 16%, transparent) !important;
  color: var(--ui-text-on-brand) !important;
}

.bag-meta-success,
.bag-value-success {
  color: color-mix(in srgb, var(--ui-status-success) 80%, var(--bag-text-main)) !important;
}

.ui-btn.trade-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    opacity 180ms ease;
  border: 1px solid transparent;
  box-shadow:
    0 10px 22px -18px var(--bag-shadow-soft),
    inset 0 1px 0 var(--bag-shadow-inner);
}

.ui-btn.trade-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.ui-btn.trade-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 14px 24px -18px var(--bag-shadow-soft),
    inset 0 1px 0 var(--bag-shadow-inner);
}

.ui-btn.trade-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.985);
}

.ui-btn.trade-btn:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--ui-focus-ring),
    0 14px 24px -18px var(--bag-shadow-soft),
    inset 0 1px 0 var(--bag-shadow-inner);
}

.ui-btn.trade-btn-primary {
  background: var(--bag-brand-gradient-strong);
  color: var(--ui-text-on-brand);
}

.ui-btn.trade-btn-secondary {
  background: var(--bag-surface);
  color: var(--bag-text-main);
  border-color: var(--bag-border-strong);
}

.bag-tab-bar :deep(.ui-toggle-option-group__item.bag-trade-tab) {
  border-radius: 999px;
  border: 1px solid var(--bag-border-strong);
  background: var(--bag-surface);
  padding: 0.55rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--bag-text-muted);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.bag-tab-bar :deep(.ui-toggle-option-group__item.bag-trade-tab:hover) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px -18px var(--bag-shadow-soft);
}

.bag-tab-bar :deep(.ui-toggle-option-group__item.bag-trade-tab:active) {
  transform: translateY(0) scale(0.985);
}

.bag-tab-bar :deep(.ui-toggle-option-group__item.bag-trade-tab:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.bag-tab-bar :deep(.ui-toggle-option-group__item--active.bag-trade-tab) {
  background: var(--bag-brand-gradient-strong);
  color: var(--ui-text-on-brand);
  border-color: transparent;
}

.trade-input {
  width: 88px;
  border-radius: 999px;
  border: 1px solid var(--bag-border-strong);
  background: var(--bag-surface-raised);
  color: var(--bag-text-main);
  padding: 0.55rem 0.85rem;
  font-size: 0.875rem;
}

.trade-input-stepper {
  width: 64px;
  padding-left: 0;
  padding-right: 0;
  text-align: center;
}

.inventory-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.inventory-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  align-items: center;
  justify-content: space-between;
}

.inventory-toolbar__search {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--bag-border);
  background: var(--bag-surface);
  padding: 0.72rem 0.95rem;
  color: var(--bag-text-main);
}

.inventory-search-input {
  width: 100%;
  border: 0;
  background: transparent;
  outline: none;
  color: inherit;
  font-size: 0.92rem;
}

.inventory-search-input::placeholder {
  color: var(--bag-text-soft);
}

.trade-select-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--bag-border);
  background: var(--bag-surface);
  padding: 0.28rem 0.42rem 0.28rem 0.85rem;
  color: var(--bag-text-main);
}

.trade-select-wrap__label {
  font-size: 0.78rem;
  color: var(--bag-text-muted);
}

.trade-select {
  min-width: 148px;
  border: 1px solid var(--bag-border);
  border-radius: 999px;
  background: var(--bag-surface-raised);
  color: var(--bag-text-main);
  padding: 0.45rem 0.85rem;
  outline: none;
  font-size: 0.85rem;
}

.strategy-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.strategy-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--bag-border);
  background: var(--bag-surface-raised);
  color: var(--bag-text-main);
  padding: 0.38rem 0.75rem;
  font-size: 0.76rem;
  line-height: 1.2;
}

.strategy-chip-action {
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.strategy-chip-action:hover {
  transform: translateY(-1px);
  border-color: var(--bag-brand-border-strong);
}

.strategy-priority {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  font-size: 0.78rem;
}

.strategy-priority__label {
  color: var(--bag-text-soft);
}

.strategy-priority__value {
  color: var(--bag-text-main);
  font-weight: 600;
}

.strategy-editor {
  border-radius: 20px;
  border: 1px solid var(--bag-brand-border);
  background: var(--bag-brand-gradient-soft);
  padding: 1rem;
  box-shadow: var(--bag-shadow-inner);
}

.strategy-editor__toolbar,
.strategy-editor__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.strategy-editor__title {
  color: var(--bag-text-main);
  font-size: 0.92rem;
  font-weight: 700;
}

.strategy-editor__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.strategy-editor__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.strategy-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.42rem;
}

.strategy-field-checkbox {
  justify-content: flex-end;
}

.strategy-field__label {
  color: var(--bag-text-muted);
  font-size: 0.76rem;
  font-weight: 600;
}

.strategy-input,
.strategy-select,
.strategy-textarea {
  width: 100%;
  border: 1px solid var(--bag-border-strong);
  background: var(--bag-surface);
  color: var(--bag-text-main);
  outline: none;
}

.strategy-input,
.strategy-select {
  border-radius: 14px;
  padding: 0.62rem 0.8rem;
  font-size: 0.88rem;
}

.strategy-textarea {
  min-height: 68px;
  resize: vertical;
  border-radius: 16px;
  padding: 0.75rem 0.85rem;
  font-size: 0.85rem;
}

.strategy-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid var(--bag-border-strong);
  background: var(--bag-surface);
  padding: 0.62rem 0.8rem;
  color: var(--bag-text-main);
  font-size: 0.84rem;
}

.strategy-keep-picker__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.strategy-keep-pill {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.18rem;
  border-radius: 16px;
  border: 1px solid var(--bag-border);
  background: var(--bag-surface);
  padding: 0.62rem 0.8rem;
  color: var(--bag-text-main);
  text-align: left;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.strategy-keep-pill:hover {
  transform: translateY(-1px);
  border-color: var(--bag-brand-border-strong);
}

.strategy-keep-pill.active {
  border-color: var(--bag-brand-border-strong);
  background: var(--bag-brand-soft);
}

.strategy-keep-pill__meta {
  color: var(--bag-text-muted);
  font-size: 0.72rem;
}

.inventory-toolbar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.activity-panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.activity-panel__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.activity-panel__title {
  color: var(--bag-text-main);
  font-size: 1rem;
  font-weight: 700;
}

.activity-panel__subtitle {
  margin-top: 0.2rem;
  color: var(--bag-text-muted);
  font-size: 0.8rem;
}

.activity-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  align-items: center;
}

.activity-panel__summary {
  color: var(--bag-text-muted);
  font-size: 0.78rem;
}

.activity-panel__empty {
  color: var(--bag-text-muted);
}

.activity-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.activity-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  border-radius: 18px;
  border: 1px solid var(--bag-border);
  background: var(--bag-surface);
  padding: 0.9rem 1rem;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.activity-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--ui-border-subtle) 70%, var(--ui-status-success) 30%);
}

.activity-card__body:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
  border-radius: 0.85rem;
}

.activity-card__body {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  text-align: left;
  cursor: pointer;
}

.activity-card__actions {
  display: flex;
  justify-content: flex-end;
}

.activity-card__details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.activity-card__type {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.28rem 0.58rem;
  font-size: 0.74rem;
  font-weight: 700;
}

.activity-card__type.use {
  background: var(--bag-status-use-bg);
  color: var(--ui-status-success);
}

.activity-card__type.purchase {
  background: var(--bag-status-purchase-bg);
  color: var(--ui-status-warning);
}

.activity-card__type.sell {
  background: var(--bag-status-sell-bg);
  color: var(--ui-status-info);
}

.activity-card__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.activity-card__title {
  color: var(--bag-text-main);
  font-size: 0.92rem;
  font-weight: 700;
}

.activity-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  color: var(--bag-text-muted);
  font-size: 0.76rem;
}

.activity-card__summary {
  color: var(--bag-text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.activity-detail-card {
  display: flex;
  gap: 0.7rem;
  border-radius: 16px;
  background: var(--bag-surface);
  padding: 0.75rem;
}

.activity-detail-card__thumb {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 14px;
  background: var(--bag-surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.activity-detail-card__thumb img {
  max-width: 80%;
  max-height: 80%;
  object-fit: contain;
}

.activity-detail-card__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.activity-detail-card__title {
  color: var(--bag-text-main);
  font-size: 0.84rem;
  font-weight: 700;
}

.activity-detail-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  color: var(--bag-text-muted);
  font-size: 0.74rem;
  line-height: 1.45;
}

.activity-detail-card__fallback {
  font-size: 0.8rem;
}

.bag-chip-row :deep(.ui-filter-chip.bag-filter-chip) {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--bag-border);
  background: var(--bag-surface);
  padding: 0.5rem 0.85rem;
  color: var(--bag-text-main);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.bag-chip-row :deep(.ui-filter-chip.bag-filter-chip:hover) {
  transform: translateY(-1px);
  box-shadow: 0 12px 22px -18px var(--bag-shadow-soft);
}

.bag-chip-row :deep(.ui-filter-chip.bag-filter-chip:active) {
  transform: translateY(0) scale(0.985);
}

.bag-chip-row :deep(.ui-filter-chip.bag-filter-chip:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.bag-chip-row :deep(.ui-filter-chip--active.bag-filter-chip) {
  border-color: var(--bag-brand-border-strong);
  background: linear-gradient(
    135deg,
    var(--bag-brand-soft-strong),
    color-mix(in srgb, var(--bag-brand-soft-strong) 72%, var(--bag-surface) 28%)
  );
  color: var(--ui-text-on-brand);
}

.bag-chip-row :deep(.bag-filter-chip__count) {
  border-radius: 999px;
  background: var(--bag-surface-raised);
  padding: 0.1rem 0.45rem;
  font-size: 0.72rem;
}

.inventory-card {
  position: relative;
  overflow: hidden;
  display: flex;
  min-height: 250px;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid var(--bag-border);
  background:
    radial-gradient(circle at top, var(--bag-brand-soft-strong), transparent 48%),
    linear-gradient(180deg, var(--bag-surface-raised), var(--bag-surface));
  padding: 1rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
  cursor: pointer;
}

.inventory-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 34px var(--bag-shadow-soft);
}

.inventory-card:focus-visible,
.mall-card:focus-visible,
.recommend-card:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.inventory-card-fruit {
  border-color: var(--bag-category-fruit-border);
}

.inventory-card-seed {
  border-color: var(--bag-category-seed-border);
}

.inventory-card-fertilizer {
  border-color: var(--bag-category-fertilizer-border);
}

.inventory-card-pack {
  border-color: var(--bag-category-pack-border);
}

.inventory-card-pet {
  border-color: var(--bag-category-pet-border);
}

.inventory-card-item {
  border-color: var(--bag-category-item-border);
}

.inventory-card__art,
.mall-card__art {
  position: relative;
  margin-top: 2.3rem;
  height: 112px;
  border-radius: 22px;
  background: radial-gradient(circle at top, var(--bag-brand-soft), transparent 60%), var(--bag-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.inventory-card__image,
.mall-card__image {
  max-width: 78%;
  max-height: 78%;
  object-fit: contain;
  filter: drop-shadow(0 10px 20px var(--bag-shadow-soft));
}

.mall-card__image--locked {
  filter: grayscale(1) saturate(0.2) opacity(0.78) drop-shadow(0 10px 20px var(--bag-shadow-soft));
}

.inventory-card__fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--bag-text-main);
}

.inventory-card__count {
  margin-top: 0.9rem;
  color: var(--bag-text-main);
  font-size: 1.45rem;
  font-weight: 700;
}

.inventory-card__name {
  margin-top: 0.55rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bag-text-main);
  font-size: 1rem;
  font-weight: 700;
}

.inventory-card__meta {
  margin-top: 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--bag-text-muted);
  font-size: 0.8rem;
}

.inventory-card__tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.55rem;
}

.inventory-card__tag {
  display: inline-flex;
  align-items: center;
  min-height: 1.35rem;
  padding: 0.1rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 68%, transparent);
  color: var(--bag-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
}

.inventory-card__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.85rem;
  color: var(--bag-text-soft);
  font-size: 0.72rem;
}

.inventory-card__footer-tag {
  border-radius: 999px;
  background: var(--ui-status-success-soft);
  padding: 0.18rem 0.48rem;
  color: var(--ui-status-success);
}

.detail-copy--muted {
  color: var(--ui-text-2);
}

.detail-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.2rem;
}

.bag-inventory-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 640px) {
  .bag-inventory-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .bag-inventory-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .bag-inventory-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .bag-inventory-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.bag-market-card__head,
.bag-sell-preview-card__head {
  min-width: 0;
}

.bag-market-card__side-meta,
.bag-sell-preview-card__meta {
  min-width: fit-content;
}

.inventory-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: fit-content;
  border-radius: 999px;
  background: var(--bag-surface-raised);
  padding: 0.22rem 0.55rem;
  color: var(--bag-text-main);
  font-size: 0.72rem;
  font-weight: 600;
}

.inventory-pill-emerald {
  background: color-mix(in srgb, var(--ui-status-success-soft) 86%, transparent);
  color: var(--ui-status-success);
}

.inventory-pill-amber {
  background: color-mix(in srgb, var(--ui-status-warning-soft) 86%, transparent);
  color: var(--ui-status-warning);
}

.inventory-pill-sky {
  background: color-mix(in srgb, var(--ui-status-info-soft) 86%, transparent);
  color: var(--ui-status-info);
}

.mall-card {
  border: 1px solid var(--bag-border);
  background:
    radial-gradient(circle at top right, var(--bag-brand-soft-strong), transparent 36%),
    linear-gradient(180deg, var(--bag-surface-raised), var(--bag-surface));
  cursor: pointer;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.mall-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 34px -24px var(--bag-shadow-soft);
}

.mall-card__summary {
  margin-top: 0.7rem;
  color: var(--bag-text-muted);
  font-size: 0.8rem;
  line-height: 1.5;
}

.mall-card__previews {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.mall-preview-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
  border-radius: 999px;
  background: var(--bag-surface);
  padding: 0.35rem 0.55rem 0.35rem 0.4rem;
}

.mall-preview-pill--more {
  color: var(--bag-text-muted);
}

.mall-preview-pill__thumb {
  height: 30px;
  width: 30px;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--bag-surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.mall-preview-pill__thumb img {
  max-width: 80%;
  max-height: 80%;
  object-fit: contain;
}

.mall-preview-pill__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
  color: var(--bag-text-muted);
  font-size: 0.78rem;
}

.mall-preview-pill__fallback {
  font-size: 0.78rem;
}

.mall-card__actions {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.recommend-strip {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.recommend-strip__label {
  color: var(--bag-text-muted);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.recommend-strip__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.recommend-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  border-radius: 18px;
  border: 1px solid var(--bag-brand-border);
  background: var(--bag-brand-gradient-soft);
  padding: 0.85rem 0.95rem;
  text-align: left;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.recommend-card:hover {
  transform: translateY(-1px);
  border-color: var(--bag-brand-border-strong);
  box-shadow: 0 14px 24px -20px var(--bag-shadow-soft);
}

.recommend-card__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.recommend-card__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bag-text-main);
  font-size: 0.92rem;
  font-weight: 700;
}

.recommend-card__meta,
.recommend-card__time {
  color: var(--bag-text-muted);
  font-size: 0.77rem;
}

.trade-stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  background: var(--bag-surface);
  padding: 0.28rem;
}

.trade-stepper__btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 0;
  background: var(--bag-surface-raised);
  color: var(--bag-text-main);
  font-size: 1rem;
  font-weight: 700;
}

.detail-modal-backdrop {
  --bag-surface: var(--ui-bg-surface);
  --bag-surface-raised: var(--ui-bg-surface-raised);
  --bag-border: var(--ui-border-subtle);
  --bag-border-strong: var(--ui-border-strong);
  --bag-text-main: var(--ui-text-1);
  --bag-text-muted: var(--ui-text-2);
  --bag-text-soft: var(--ui-text-3);
  --bag-shadow-soft: var(--ui-shadow-panel);
  --bag-shadow-strong: var(--ui-shadow-panel-strong);
  --bag-shadow-inner: var(--ui-shadow-inner);
  --bag-overlay-backdrop: var(--ui-overlay-backdrop);
  --bag-brand-soft: color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  --bag-brand-soft-strong: color-mix(in srgb, var(--ui-brand-500) 18%, transparent);
  --bag-brand-border-strong: color-mix(in srgb, var(--ui-border-subtle) 54%, var(--ui-brand-500) 46%);
  --bag-brand-gradient-soft: linear-gradient(135deg, var(--bag-brand-soft), var(--bag-surface));
  --bag-brand-gradient-strong: linear-gradient(135deg, var(--bag-brand-soft-strong), var(--bag-surface));
  position: fixed;
  inset: 0;
  z-index: 80;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: var(--bag-overlay-backdrop);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.detail-modal-panel {
  position: relative;
  isolation: isolate;
  z-index: 1;
  display: flex;
  width: min(900px, 100%);
  min-height: 0;
  flex-direction: column;
  max-height: calc(100vh - 2rem);
  overflow: hidden;
  border-radius: 30px;
  border: 1px solid var(--bag-border-strong);
  background:
    radial-gradient(
      circle at top right,
      color-mix(in srgb, var(--bag-brand-soft-strong) 115%, transparent),
      transparent 32%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--bag-surface-raised) 94%, var(--bag-surface) 6%),
      var(--bag-surface)
    );
  color: var(--bag-text-main);
  box-shadow:
    0 32px 70px -30px var(--bag-shadow-strong),
    inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-modal-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ui-text-on-brand) 5%, transparent), transparent 22%);
  pointer-events: none;
}

.detail-modal-panel::after {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 78%, transparent);
  pointer-events: none;
}

.detail-modal-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.25rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  background: color-mix(in srgb, var(--bag-surface-raised) 94%, var(--bag-surface) 6%);
}

.detail-modal-body {
  min-height: 0;
  overflow: auto;
  padding: 1.25rem;
  scrollbar-gutter: stable both-edges;
  overscroll-behavior: contain;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bag-surface-raised) 90%, var(--bag-surface) 10%),
    color-mix(in srgb, var(--bag-surface) 94%, var(--bag-surface-raised) 6%)
  );
}

.detail-modal-header__copy {
  min-width: 0;
  flex: 1;
}

.detail-modal-header__eyebrow {
  color: var(--bag-text-soft);
  font-size: 0.74rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.detail-modal-header__title {
  margin-top: 0.4rem;
  color: var(--bag-text-main);
  font-size: 1.65rem;
  font-weight: 800;
  line-height: 1.15;
}

.detail-modal-header__sub {
  margin-top: 0.55rem;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 92%, transparent);
  background: color-mix(in srgb, var(--bag-surface-raised) 92%, var(--bag-surface) 8%);
  padding: 0.36rem 0.72rem;
  color: var(--bag-text-muted);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.4;
}

.detail-modal-close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-width: 2.9rem;
  min-height: 2.9rem;
  border-radius: 999px;
  border: 1px solid var(--bag-border-strong);
  background: color-mix(in srgb, var(--bag-surface-raised) 92%, var(--bag-surface) 8%);
  color: var(--bag-text-main);
  padding: 0.6rem 0.8rem;
  font-size: 0.85rem;
  font-weight: 600;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.detail-modal-close:hover {
  transform: translateY(-1px);
  border-color: var(--bag-brand-border-strong);
  background: color-mix(in srgb, var(--bag-brand-soft-strong) 54%, var(--bag-surface-raised) 46%);
  box-shadow: 0 12px 26px -22px var(--bag-shadow-soft);
}

.detail-modal-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ui-focus-ring);
}

.detail-modal-close__icon {
  font-size: 1rem;
}

.detail-modal-close__text {
  line-height: 1;
}

.detail-hero {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
  border: 1px solid color-mix(in srgb, var(--bag-border) 86%, transparent);
  border-radius: 26px;
  background: color-mix(in srgb, var(--bag-surface) 88%, var(--bag-surface-raised) 12%);
  padding: 1rem;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-hero__art {
  min-height: 220px;
  border-radius: 24px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 86%, transparent);
  background: radial-gradient(circle at top, var(--bag-brand-soft), transparent 56%), var(--bag-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-hero__image {
  max-width: 78%;
  max-height: 78%;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px var(--bag-shadow-soft));
}

.detail-hero__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0.2rem 0;
}

.detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.detail-summary {
  border: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--bag-surface-raised) 92%, transparent);
  padding: 0.95rem 1rem;
  color: var(--bag-text-main);
  line-height: 1.7;
  font-size: 0.94rem;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px dashed color-mix(in srgb, var(--bag-border) 92%, transparent);
}

.detail-block {
  margin-top: 1.15rem;
  border: 1px solid color-mix(in srgb, var(--bag-border) 90%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--bag-surface) 78%, var(--bag-surface-raised) 22%);
  padding: 1rem;
  box-shadow:
    0 16px 34px -32px var(--bag-shadow-soft),
    inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-block-highlight {
  border-color: color-mix(in srgb, var(--bag-brand-border-strong) 82%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bag-brand-soft) 54%, var(--bag-surface-raised) 46%),
    color-mix(in srgb, var(--bag-surface) 84%, var(--bag-surface-raised) 16%)
  );
}

.detail-block__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.9rem;
}

.detail-block__title {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--bag-text-main);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.detail-block__title::before {
  content: '';
  width: 0.38rem;
  height: 1rem;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--ui-brand-500), color-mix(in srgb, var(--ui-brand-500) 28%, transparent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-brand-500) 22%, transparent);
}

.detail-block__meta {
  color: var(--bag-text-muted);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.4;
}

.detail-block > .detail-stats,
.detail-block > .detail-sections,
.detail-block > .detail-preview-grid,
.detail-block > .detail-land-toolbar,
.detail-block > .detail-land-empty,
.detail-block > .detail-land-grid,
.detail-block > .detail-use-summary {
  margin-top: 0;
}

.detail-land-counter {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--bag-brand-soft-strong);
  padding: 0.6rem 0.95rem;
  color: var(--bag-text-main);
  font-size: 0.84rem;
  font-weight: 600;
}

.detail-stats {
  margin-top: 1.1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.8rem;
}

.detail-stat-card {
  --detail-stat-accent: var(--ui-brand-500);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  background: color-mix(in srgb, var(--bag-surface) 90%, var(--bag-surface-raised) 10%);
  padding: 1rem;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-stat-card::before {
  content: '';
  position: absolute;
  left: 0.9rem;
  right: 0.9rem;
  top: 0;
  height: 0.24rem;
  border-radius: 0 0 999px 999px;
  background: linear-gradient(
    90deg,
    var(--detail-stat-accent),
    color-mix(in srgb, var(--detail-stat-accent) 28%, transparent)
  );
  opacity: 0.95;
}

.detail-stat-card::after {
  content: '';
  position: absolute;
  top: -1.8rem;
  right: -1rem;
  width: 5.25rem;
  height: 5.25rem;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--detail-stat-accent) 14%, transparent), transparent 68%);
  pointer-events: none;
}

.detail-stat-card__label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  border-radius: 999px;
  background: color-mix(in srgb, var(--detail-stat-accent) 10%, transparent);
  padding: 0.26rem 0.6rem;
  color: color-mix(in srgb, var(--detail-stat-accent) 48%, var(--bag-text-main) 52%);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
}

.detail-stat-card__value {
  position: relative;
  z-index: 1;
  color: var(--bag-text-main);
  font-size: 1.12rem;
  font-weight: 800;
  line-height: 1.3;
  text-wrap: balance;
}

.detail-stat-card-emerald {
  --detail-stat-accent: var(--ui-status-success);
}

.detail-stat-card-amber {
  --detail-stat-accent: var(--ui-status-warning);
}

.detail-stat-card-sky {
  --detail-stat-accent: var(--ui-status-info);
}

.detail-stat-card-violet {
  --detail-stat-accent: #7c3aed;
}

.detail-stat-card-rose {
  --detail-stat-accent: #e11d48;
}

.detail-sections {
  margin-top: 1.1rem;
  display: grid;
  gap: 0.8rem;
}

.detail-section-card {
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  background: color-mix(in srgb, var(--bag-surface) 88%, var(--bag-surface-raised) 12%);
  padding: 1rem 1.05rem;
  color: var(--bag-text-main);
  line-height: 1.72;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-section-title {
  margin-top: 1.2rem;
  color: var(--bag-text-main);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.detail-land-toolbar {
  margin-top: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.detail-land-toolbar__hint {
  color: var(--bag-text-muted);
  font-size: 0.84rem;
  line-height: 1.6;
}

.detail-land-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.detail-land-empty {
  margin-top: 0.85rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  background: color-mix(in srgb, var(--bag-surface) 90%, var(--bag-surface-raised) 10%);
  padding: 1rem;
  color: var(--bag-text-muted);
  text-align: center;
}

.detail-land-grid {
  margin-top: 0.85rem;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}

.detail-land-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.45rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  background: color-mix(in srgb, var(--bag-surface) 90%, var(--bag-surface-raised) 10%);
  padding: 0.9rem;
  text-align: left;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.detail-land-card:hover {
  transform: translateY(-1px);
  border-color: var(--bag-border-strong);
}

.detail-land-card.active {
  border-color: var(--bag-brand-border-strong);
  background: var(--bag-brand-gradient-strong);
}

.detail-land-card.suggested:not(.active) {
  border-color: color-mix(in srgb, var(--ui-border-subtle) 72%, var(--ui-status-info) 28%);
}

.detail-land-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.detail-land-card__id {
  color: var(--bag-text-main);
  font-size: 0.78rem;
  font-weight: 700;
}

.detail-land-card__status {
  color: var(--bag-text-muted);
  font-size: 0.74rem;
}

.detail-land-card__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bag-text-main);
  font-size: 0.9rem;
  font-weight: 700;
}

.detail-land-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  color: var(--bag-text-muted);
  font-size: 0.76rem;
}

.detail-use-summary {
  margin-top: 0.85rem;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--bag-brand-border-strong) 74%, transparent);
  background: var(--bag-brand-gradient-soft);
  padding: 1rem 1.05rem;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-use-summary__message {
  color: var(--bag-text-main);
  font-size: 0.94rem;
  font-weight: 700;
}

.detail-use-summary__meta {
  margin-top: 0.45rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  color: var(--bag-text-muted);
  font-size: 0.8rem;
}

.detail-preview-grid {
  margin-top: 0.85rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
}

.detail-preview-card {
  display: flex;
  gap: 0.8rem;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 88%, transparent);
  background: color-mix(in srgb, var(--bag-surface) 90%, var(--bag-surface-raised) 10%);
  padding: 0.85rem;
  box-shadow: inset 0 1px 0 var(--bag-shadow-inner);
}

.detail-preview-card__thumb {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--bag-border) 82%, transparent);
  background: color-mix(in srgb, var(--bag-surface-raised) 94%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.detail-preview-card__thumb img {
  max-width: 82%;
  max-height: 82%;
  object-fit: contain;
}

.detail-preview-card__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.detail-preview-card__title {
  color: var(--bag-text-main);
  font-weight: 700;
}

.detail-preview-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  color: var(--bag-text-muted);
  font-size: 0.78rem;
}

.detail-preview-card__desc {
  color: var(--bag-text-muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.detail-preview-card__fallback {
  font-size: 0.85rem;
}

:global(html:not(.dark) .detail-modal-backdrop) {
  --bag-surface: #f8fafc;
  --bag-surface-raised: #ffffff;
  --bag-border: rgba(15, 23, 42, 0.08);
  --bag-border-strong: rgba(15, 23, 42, 0.16);
  --bag-shadow-soft: rgba(15, 23, 42, 0.22);
  --bag-shadow-strong: rgba(15, 23, 42, 0.4);
  --bag-shadow-inner: rgba(255, 255, 255, 0.92);
  --bag-overlay-backdrop: rgba(2, 6, 23, 0.84);
  background: rgba(2, 6, 23, 0.82);
  backdrop-filter: blur(18px) brightness(0.62) saturate(0.38);
  -webkit-backdrop-filter: blur(18px) brightness(0.62) saturate(0.38);
}

:global(html:not(.dark) .detail-modal-backdrop)::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.08), rgba(2, 6, 23, 0.22));
  pointer-events: none;
}

:global(html:not(.dark) .detail-modal-panel) {
  border-color: rgba(15, 23, 42, 0.18);
  background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
  box-shadow:
    0 72px 140px -44px rgba(15, 23, 42, 0.7),
    0 38px 84px -44px rgba(15, 23, 42, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

:global(html:not(.dark) .detail-modal-panel)::before {
  background: none;
}

:global(html:not(.dark) .detail-modal-panel)::after {
  border-color: rgba(15, 23, 42, 0.06);
}

:global(html:not(.dark) .detail-modal-body) {
  background: #eef2f7;
}

:global(html:not(.dark) .detail-modal-header) {
  border-bottom-color: rgba(15, 23, 42, 0.1);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

:global(html:not(.dark) .detail-modal-header__eyebrow) {
  color: rgba(71, 85, 105, 0.9);
}

:global(html:not(.dark) .detail-modal-header__title) {
  color: #0f172a;
}

:global(html:not(.dark) .detail-modal-header__sub) {
  border-color: rgba(15, 23, 42, 0.1);
  background: #ffffff;
  color: rgba(51, 65, 85, 0.78);
}

:global(html:not(.dark) .detail-modal-close) {
  border-color: rgba(15, 23, 42, 0.16);
  background: #ffffff;
  box-shadow:
    0 14px 28px -22px rgba(15, 23, 42, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

:global(html:not(.dark) .detail-modal-close:hover) {
  background: #f8fafc;
  border-color: rgba(15, 23, 42, 0.22);
}

:global(html:not(.dark) .detail-modal-close__icon) {
  color: #0f172a;
}

:global(html:not(.dark) .detail-summary),
:global(html:not(.dark) .detail-block),
:global(html:not(.dark) .detail-stat-card),
:global(html:not(.dark) .detail-section-card),
:global(html:not(.dark) .detail-land-empty),
:global(html:not(.dark) .detail-land-card),
:global(html:not(.dark) .detail-preview-card) {
  border-color: rgba(15, 23, 42, 0.1);
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  box-shadow:
    0 24px 46px -38px rgba(15, 23, 42, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
}

:global(html:not(.dark) .detail-block-highlight) {
  border-color: color-mix(in srgb, var(--ui-brand-500) 18%, rgba(15, 23, 42, 0.08));
  background: linear-gradient(180deg, color-mix(in srgb, var(--ui-brand-500) 5%, #ffffff), #ffffff 100%);
}

:global(html:not(.dark) .detail-block__title)::before {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-brand-500) 16%, transparent);
}

:global(html:not(.dark) .detail-stat-card) {
  background: linear-gradient(180deg, #ffffff 0%, #f6f9fc 100%);
}

:global(html:not(.dark) .detail-hero) {
  border-color: rgba(15, 23, 42, 0.1);
  background: linear-gradient(180deg, #ffffff 0%, #f9fbfd 100%);
  box-shadow:
    0 26px 50px -40px rgba(15, 23, 42, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

:global(html:not(.dark) .detail-hero__art),
:global(html:not(.dark) .detail-preview-card__thumb) {
  border-color: rgba(15, 23, 42, 0.1);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

:global(html:not(.dark) .detail-summary),
:global(html:not(.dark) .detail-section-card),
:global(html:not(.dark) .detail-land-toolbar__hint),
:global(html:not(.dark) .detail-land-empty),
:global(html:not(.dark) .detail-land-card__status),
:global(html:not(.dark) .detail-land-card__meta),
:global(html:not(.dark) .detail-use-summary__meta),
:global(html:not(.dark) .detail-preview-card__meta),
:global(html:not(.dark) .detail-preview-card__desc),
:global(html:not(.dark) .detail-modal-header__sub) {
  color: color-mix(in srgb, var(--bag-text-main) 84%, var(--bag-text-muted) 16%);
}

:global(html:not(.dark) .detail-land-card.active) {
  border-color: color-mix(in srgb, var(--ui-brand-500) 38%, rgba(15, 23, 42, 0.08));
  background: color-mix(in srgb, var(--ui-brand-500) 8%, #ffffff);
}

:global(html:not(.dark) .detail-actions) {
  border-top-color: rgba(15, 23, 42, 0.08);
}

:global(html:not(.dark) .detail-use-summary) {
  border-color: color-mix(in srgb, var(--ui-brand-500) 18%, rgba(15, 23, 42, 0.08));
  background: linear-gradient(135deg, color-mix(in srgb, var(--ui-brand-500) 7%, #ffffff), #ffffff 68%);
}

@media (max-width: 768px) {
  .bag-topbar {
    z-index: 12;
    padding: 0.875rem;
    border: 1px solid var(--bag-border);
    border-radius: 1.25rem;
    background: color-mix(in srgb, var(--bag-surface-raised) 88%, transparent);
    box-shadow:
      0 12px 24px -24px var(--bag-shadow-soft),
      inset 0 1px 0 var(--bag-shadow-inner);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .bag-topbar__header {
    flex-direction: column;
  }

  .bag-topbar__actions,
  .bag-topbar__chips,
  .bag-tab-bar {
    margin-inline: -0.1rem;
    padding-inline: 0.1rem;
  }

  .bag-subtoolbar,
  .inventory-toolbar {
    z-index: 11;
    background: color-mix(in srgb, var(--bag-surface-raised) 88%, transparent) !important;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .strategy-editor__grid {
    grid-template-columns: 1fr;
  }

  .inventory-toolbar__row {
    flex-direction: column;
    align-items: stretch;
  }

  .use-history-list {
    grid-template-columns: 1fr;
  }

  .activity-list {
    grid-template-columns: 1fr;
  }

  .activity-card__details {
    grid-template-columns: 1fr;
  }

  .trade-select-wrap {
    width: 100%;
    justify-content: space-between;
  }

  .trade-select {
    min-width: 0;
    width: 100%;
  }

  .inventory-card {
    min-height: 0;
    padding: 0.9rem;
    border-radius: 20px;
  }

  .inventory-card__art,
  .mall-card__art {
    margin-top: 1.9rem;
    height: 96px;
    border-radius: 18px;
  }

  .mall-preview-pill__name {
    max-width: 88px;
  }

  .inventory-card__count {
    margin-top: 0.75rem;
    font-size: 1.2rem;
  }

  .inventory-card__name {
    margin-top: 0.45rem;
    font-size: 0.94rem;
  }

  .inventory-card__meta {
    margin-top: 0.5rem;
    gap: 0.28rem;
    font-size: 0.76rem;
  }

  .inventory-card__footer {
    padding-top: 0.65rem;
  }

  .bag-market-card__head {
    flex-direction: column;
    align-items: stretch;
  }

  .bag-market-card__side-meta {
    align-self: flex-start;
    text-align: left;
  }

  .mall-card__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .bag-market-card__actions .ui-btn.trade-btn {
    width: 100%;
  }

  .recommend-strip__list {
    grid-template-columns: 1fr;
  }

  .trade-stepper {
    width: 100%;
    justify-content: space-between;
  }

  .bag-sell-preview-card {
    gap: 0.85rem;
  }

  .bag-sell-preview-card__head {
    align-items: flex-start;
  }

  .bag-sell-preview-card__meta {
    width: 100%;
    padding-top: 0.75rem;
    border-top: 1px solid var(--bag-border);
    text-align: left;
  }

  .detail-modal-header {
    padding: 1rem 1rem 0.85rem;
    align-items: flex-start;
  }

  .detail-modal-body {
    padding: 1rem;
  }

  .detail-modal-header__title {
    font-size: 1.36rem;
  }

  .detail-block {
    padding: 0.9rem;
  }

  .detail-block__header {
    align-items: flex-start;
  }

  .detail-stat-card__value {
    font-size: 1.02rem;
  }

  .detail-modal-close {
    min-width: 2.6rem;
    min-height: 2.6rem;
    padding-inline: 0.7rem;
  }

  .detail-modal-close__text {
    display: none;
  }

  .detail-hero {
    grid-template-columns: 1fr;
    padding: 0.9rem;
  }

  .detail-hero__art {
    min-height: 176px;
  }

  .detail-stats,
  .detail-preview-grid {
    grid-template-columns: 1fr;
  }

  .detail-land-grid {
    grid-template-columns: 1fr;
  }
}
</style>
