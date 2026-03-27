import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { localizeRuntimeText } from '@/utils/runtime-text'

export const useFriendStore = defineStore('friend', () => {
  const defaultFriendFetchMeta = () => ({
    source: 'live',
    reason: '',
    platform: '',
    cacheSource: '',
    seededCount: 0,
    conservative: false,
    realtimeAvailable: true,
    cooldownUntil: 0,
    syncAllUnsupportedUntil: 0,
  })

  const friends = ref<any[]>([])
  const cachedFriends = ref<any[]>([])
  const friendFetchMeta = ref(defaultFriendFetchMeta())
  const loading = ref(false)
  const seedCacheLoading = ref(false)
  const clearCacheLoading = ref(false)
  const friendLands = ref<Record<string, any[]>>({})
  const friendLandsLoading = ref<Record<string, boolean>>({})
  const blacklist = ref<number[]>([])
  const interactRecords = ref<any[]>([])
  const interactLoading = ref(false)
  const interactError = ref('')
  let interactRequestSeq = 0

  function normalizeFriendFetchMeta(meta: any) {
    const next = (meta && typeof meta === 'object') ? meta : {}
    return {
      source: String(next.source || 'live').trim() || 'live',
      reason: String(next.reason || '').trim(),
      platform: String(next.platform || '').trim(),
      cacheSource: String(next.cacheSource || '').trim(),
      seededCount: Math.max(0, Number(next.seededCount || 0)),
      conservative: !!next.conservative,
      realtimeAvailable: next.realtimeAvailable !== false,
      cooldownUntil: Math.max(0, Number(next.cooldownUntil || 0)),
      syncAllUnsupportedUntil: Math.max(0, Number(next.syncAllUnsupportedUntil || 0)),
    }
  }

  function setFriendFetchMeta(meta?: any) {
    friendFetchMeta.value = meta ? normalizeFriendFetchMeta(meta) : defaultFriendFetchMeta()
  }

  function normalizeInteractError(input: any, errorCode?: string) {
    const raw = String(input || '').trim()
    const lower = raw.toLowerCase()
    const code = String(errorCode || '').trim().toUpperCase()
    if (!raw)
      return '加载访客记录失败'
    if (code === 'INTERACT_PROTO_MISSING' || raw.includes('INTERACT_PROTO_MISSING') || raw.includes('协议未加载'))
      return '访客协议未加载，当前版本暂不支持专用访客接口'
    if (code === 'INTERACT_TIMEOUT' || raw.includes('INTERACT_TIMEOUT') || lower.includes('timeout') || raw.includes('超时'))
      return '访客接口请求超时，已自动回退到日志视图'
    if (code === 'INTERACT_AUTH' || raw.includes('INTERACT_AUTH') || lower.includes('unauthorized') || lower.includes('forbidden') || raw.includes('权限'))
      return '访客接口权限校验失败，请检查账号登录状态'
    if (code === 'INTERACT_RPC_UNAVAILABLE' || raw.includes('INTERACT_RPC_UNAVAILABLE') || raw.includes('接口不可用') || raw.includes('版本不支持'))
      return '访客接口不可用（可能是协议版本不支持），已自动回退到日志视图'
    return localizeRuntimeText(raw)
  }

  /**
   * T5: 从土地详情构建植物摘要 (来源: PR 版 friend.ts)
   * 统计可偷/缺水/杂草/虫害的数量
   */
  function buildPlantSummaryFromDetail(lands: any[], summary: any) {
    const stealNumFromSummary = Array.isArray(summary?.stealable) ? summary.stealable.length : null
    const dryNumFromSummary = Array.isArray(summary?.needWater) ? summary.needWater.length : null
    const weedNumFromSummary = Array.isArray(summary?.needWeed) ? summary.needWeed.length : null
    const insectNumFromSummary = Array.isArray(summary?.needBug) ? summary.needBug.length : null

    let stealNum = stealNumFromSummary
    let dryNum = dryNumFromSummary
    let weedNum = weedNumFromSummary
    let insectNum = insectNumFromSummary

    if (stealNum === null || dryNum === null || weedNum === null || insectNum === null) {
      stealNum = 0
      dryNum = 0
      weedNum = 0
      insectNum = 0
      for (const land of (Array.isArray(lands) ? lands : [])) {
        if (!land || !land.unlocked)
          continue
        if (land.status === 'stealable')
          stealNum++
        if (land.needWater)
          dryNum++
        if (land.needWeed)
          weedNum++
        if (land.needBug)
          insectNum++
      }
    }

    return {
      stealNum: Number(stealNum) || 0,
      dryNum: Number(dryNum) || 0,
      weedNum: Number(weedNum) || 0,
      insectNum: Number(insectNum) || 0,
    }
  }

  /**
   * T5: 同步植物摘要到好友列表 (来源: PR 版 friend.ts)
   * 展开好友详情后自动同步概览数据
   */
  function syncFriendPlantSummary(friendId: string, lands: any[], summary: any) {
    const key = String(friendId)
    const idx = friends.value.findIndex(f => String(f?.gid || '') === key)
    if (idx < 0)
      return
    const nextPlant = buildPlantSummaryFromDetail(lands, summary)
    friends.value[idx] = { ...friends.value[idx], plant: nextPlant }
  }

  async function applyCachedFriendsFallback(accountId: string): Promise<boolean> {
    await fetchCachedFriends(accountId)
    if (cachedFriends.value.length > 0) {
      friends.value = [...cachedFriends.value]
      return true
    }
    return false
  }

  async function fetchFriends(accountId: string, options: { manualRefresh?: boolean } = {}): Promise<{ ok: boolean, fromCache?: boolean }> {
    if (!accountId)
      return { ok: false }
    loading.value = true
    try {
      const res = await api.get('/api/friends', {
        headers: { 'x-account-id': accountId },
        params: options.manualRefresh ? { refresh: '1' } : undefined,
      })
      if (res.data.ok) {
        const apiMeta = normalizeFriendFetchMeta(res.data.meta)
        const liveFriends = Array.isArray(res.data.data) ? res.data.data : []
        if (liveFriends.length > 0) {
          friends.value = liveFriends
          setFriendFetchMeta(apiMeta)
          return { ok: true, fromCache: apiMeta.source === 'cache' }
        }
        const fromCache = await applyCachedFriendsFallback(accountId)
        setFriendFetchMeta(fromCache
          ? {
              ...apiMeta,
              source: 'cache',
              reason: apiMeta.reason || 'cache_fallback',
              realtimeAvailable: apiMeta.realtimeAvailable,
            }
          : apiMeta)
        friends.value = fromCache ? [...cachedFriends.value] : []
        return { ok: true, fromCache }
      }
      const fromCache = await applyCachedFriendsFallback(accountId)
      setFriendFetchMeta(fromCache
        ? {
            source: 'cache',
            reason: 'request_failed',
            platform: '',
            conservative: false,
            realtimeAvailable: false,
          }
        : undefined)
      if (fromCache)
        return { ok: true, fromCache: true }
      return { ok: false }
    }
    catch {
      try {
        const fromCache = await applyCachedFriendsFallback(accountId)
        if (fromCache) {
          setFriendFetchMeta({
            source: 'cache',
            reason: 'request_failed',
            platform: '',
            conservative: false,
            realtimeAvailable: false,
          })
          return { ok: true, fromCache: true }
        }
      }
      catch { /* ignore */ }
      setFriendFetchMeta({
        source: 'empty',
        reason: 'request_failed',
        platform: '',
        conservative: false,
        realtimeAvailable: false,
      })
      return { ok: false }
    }
    finally {
      loading.value = false
    }
  }

  async function fetchBlacklist(accountId: string) {
    if (!accountId)
      return
    try {
      const res = await api.get('/api/friend-blacklist', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        blacklist.value = res.data.data || []
      }
    }
    catch { /* ignore */ }
  }

  async function toggleBlacklist(accountId: string, gid: number) {
    if (!accountId || !gid)
      return
    const res = await api.post('/api/friend-blacklist/toggle', { gid }, {
      headers: { 'x-account-id': accountId },
    })
    if (res.data.ok) {
      blacklist.value = res.data.data || []
    }
  }

  async function fetchFriendLands(accountId: string, friendId: string) {
    if (!accountId || !friendId)
      return
    friendLandsLoading.value[friendId] = true
    try {
      const res = await api.get(`/api/friend/${friendId}/lands`, {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        const lands = res.data.data.lands || []
        const summary = res.data.data.summary || null
        friendLands.value[friendId] = lands
        // T5: 同步植物摘要到好友列表
        syncFriendPlantSummary(friendId, lands, summary)
      }
    }
    finally {
      friendLandsLoading.value[friendId] = false
    }
  }

  async function operate(accountId: string, friendId: string, opType: string) {
    if (!accountId || !friendId)
      return
    await api.post(`/api/friend/${friendId}/op`, { opType }, {
      headers: { 'x-account-id': accountId },
    })
    await fetchFriends(accountId)
    if (friendLands.value[friendId]) {
      await fetchFriendLands(accountId, friendId)
    }
  }

  async function batchOperate(accountId: string, friendIds: Array<string | number>, opType: string, options: Record<string, any> = {}) {
    if (!accountId || !friendIds.length)
      return null
    const res = await api.post('/api/friends/batch-op', {
      gids: friendIds.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0),
      opType,
      options,
    }, {
      headers: { 'x-account-id': accountId },
    })
    await fetchFriends(accountId)
    return res.data?.data || null
  }

  async function fetchCachedFriends(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    cachedFriends.value = []
    try {
      const res = await api.get('/api/friends/cache', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        cachedFriends.value = res.data.data || []
      }
    }
    catch (error) {
      console.error('获取好友缓存失败', error)
      cachedFriends.value = []
    }
    finally {
      loading.value = false
    }
  }

  async function seedFriendsCache(accountId: string, limit = 100): Promise<{ ok: boolean, fromCache?: boolean, seededCount?: number, error?: string, errorCode?: string }> {
    if (!accountId)
      return { ok: false, error: '缺少账号标识' }
    seedCacheLoading.value = true
    try {
      const res = await api.post('/api/friends/seed-cache', {
        limit: Math.max(1, Math.min(200, Number(limit) || 100)),
      }, {
        headers: { 'x-account-id': accountId },
      })

      const apiMeta = normalizeFriendFetchMeta(res.data?.meta)
      const nextFriends = Array.isArray(res.data?.data) ? res.data.data : []

      if (nextFriends.length > 0) {
        friends.value = nextFriends
        cachedFriends.value = [...nextFriends]
        setFriendFetchMeta(apiMeta)
        return {
          ok: true,
          fromCache: true,
          seededCount: Math.max(0, Number(res.data?.seededCount || apiMeta.seededCount || 0)),
        }
      }

      friends.value = []
      setFriendFetchMeta(apiMeta)
      return {
        ok: !!res.data?.ok,
        fromCache: false,
        seededCount: Math.max(0, Number(res.data?.seededCount || apiMeta.seededCount || 0)),
        error: res.data?.ok ? '' : String(res.data?.error || '未补到可用好友缓存'),
        errorCode: String(res.data?.errorCode || '').trim(),
      }
    }
    catch (error: any) {
      setFriendFetchMeta({
        source: 'empty',
        reason: 'interact_seed_error',
        platform: '',
        cacheSource: 'interact_records',
        seededCount: 0,
        conservative: true,
        realtimeAvailable: false,
      })
      return {
        ok: false,
        fromCache: false,
        error: String(error?.response?.data?.error || error?.message || '访客补缓存失败'),
        errorCode: String(error?.response?.data?.errorCode || '').trim(),
      }
    }
    finally {
      seedCacheLoading.value = false
    }
  }

  async function clearFriendsCache(accountId: string, options: { refresh?: boolean } = {}): Promise<{
    ok: boolean
    cleared?: any
    refreshed?: any
    data?: any[]
    meta?: any
    friendCount?: number
    error?: string
  }> {
    const normalizedAccountId = String(accountId || '').trim()
    if (!normalizedAccountId)
      return { ok: false, error: '缺少账号标识' }

    const shouldRefresh = !!options.refresh
    clearCacheLoading.value = true

    try {
      const res = await api.post('/api/friends/cache/clear', {
        refresh: shouldRefresh ? 1 : 0,
      }, {
        headers: { 'x-account-id': normalizedAccountId },
      })

      if (!res.data?.ok) {
        return {
          ok: false,
          error: String(res.data?.error || '清理好友缓存失败'),
        }
      }

      friends.value = []
      cachedFriends.value = []
      friendLands.value = {}
      friendLandsLoading.value = {}

      if (shouldRefresh) {
        const refreshedData = Array.isArray(res.data?.refreshed?.data) ? res.data.refreshed.data : []
        friends.value = [...refreshedData]
        cachedFriends.value = [...refreshedData]
        setFriendFetchMeta(res.data?.refreshed?.meta || (refreshedData.length > 0
          ? {
              source: 'cache',
              reason: 'cache_rebuilt',
            }
          : {
              source: 'empty',
              reason: 'cache_rebuilt_empty',
            }))
      }
      else {
        setFriendFetchMeta({
          source: 'empty',
          reason: 'cache_cleared',
        })
      }

      return {
        ok: true,
        cleared: res.data?.cleared || null,
        refreshed: res.data?.refreshed || null,
        data: Array.isArray(res.data?.refreshed?.data) ? res.data.refreshed.data : [],
        meta: res.data?.refreshed?.meta || null,
        friendCount: friends.value.length,
      }
    }
    catch (error: any) {
      return {
        ok: false,
        error: String(error?.response?.data?.error || error?.message || '清理好友缓存失败'),
      }
    }
    finally {
      clearCacheLoading.value = false
    }
  }

  async function fetchInteractRecords(accountId: string, limit = 50): Promise<boolean> {
    const normalizedAccountId = String(accountId || '').trim()
    if (!normalizedAccountId) {
      interactRequestSeq++
      interactRecords.value = []
      interactError.value = ''
      interactLoading.value = false
      return false
    }

    const reqSeq = ++interactRequestSeq
    interactLoading.value = true
    interactError.value = ''
    try {
      const res = await api.get('/api/interact-records', {
        headers: { 'x-account-id': normalizedAccountId },
        params: { limit: Math.max(1, Math.min(200, Number(limit) || 50)) },
      })
      // 仅允许最后一次请求写入状态，避免快速切号导致旧响应覆盖
      if (reqSeq !== interactRequestSeq)
        return false
      if (res.data?.ok) {
        interactRecords.value = Array.isArray(res.data.data) ? res.data.data : []
        return true
      }
      else {
        interactError.value = normalizeInteractError(res.data?.error || '加载访客记录失败', res.data?.errorCode)
        return true
      }
    }
    catch (error: any) {
      if (reqSeq !== interactRequestSeq)
        return false
      interactError.value = normalizeInteractError(
        error?.response?.data?.error || error?.message || '加载访客记录失败',
        error?.response?.data?.errorCode,
      )
      return true
    }
    finally {
      if (reqSeq === interactRequestSeq)
        interactLoading.value = false
    }
  }

  function clearInteractState() {
    interactRequestSeq++
    interactRecords.value = []
    interactError.value = ''
    interactLoading.value = false
  }

  return {
    friends,
    cachedFriends,
    friendFetchMeta,
    loading,
    seedCacheLoading,
    clearCacheLoading,
    friendLands,
    friendLandsLoading,
    blacklist,
    interactRecords,
    interactLoading,
    interactError,
    clearInteractState,
    fetchFriends,
    fetchCachedFriends,
    seedFriendsCache,
    clearFriendsCache,
    fetchBlacklist,
    toggleBlacklist,
    fetchFriendLands,
    fetchInteractRecords,
    operate,
    batchOperate,
  }
})
