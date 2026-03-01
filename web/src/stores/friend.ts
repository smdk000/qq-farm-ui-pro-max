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

  async function fetchFriends(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const res = await api.get('/api/friends', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        friends.value = res.data.data || []
      }
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
        friendLands.value[friendId] = res.data.data.lands || []
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
