import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useFriendStore = defineStore('friend', () => {
  const friends = ref<any[]>([])
  const cachedFriends = ref<any[]>([])
  const loading = ref(false)
  const friendLands = ref<Record<string, any[]>>({})
  const friendLandsLoading = ref<Record<string, boolean>>({})
  const blacklist = ref<number[]>([])

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

  async function fetchFriends(accountId: string): Promise<{ ok: boolean, fromCache?: boolean }> {
    if (!accountId)
      return { ok: false }
    loading.value = true
    try {
      const res = await api.get('/api/friends', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        friends.value = res.data.data || []
        return { ok: true, fromCache: false }
      }
      return { ok: false }
    }
    catch {
      try {
        await fetchCachedFriends(accountId)
        if (cachedFriends.value.length > 0) {
          friends.value = [...cachedFriends.value]
          return { ok: true, fromCache: true }
        }
      }
      catch { /* ignore */ }
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

  async function fetchCachedFriends(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const res = await api.get('/api/friends/cache', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        cachedFriends.value = res.data.data || []
      }
    }
    finally {
      loading.value = false
    }
  }

  return {
    friends,
    cachedFriends,
    loading,
    friendLands,
    friendLandsLoading,
    blacklist,
    fetchFriends,
    fetchCachedFriends,
    fetchBlacklist,
    toggleBlacklist,
    fetchFriendLands,
    operate,
  }
})
