<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandCard from '@/components/LandCard.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'
import { buildFriendFetchBannerCopy, buildFriendFetchSourceCopy, buildFriendLogShortcut, isWechatFriendPlatform } from '@/utils/friend-fetch-status'

const router = useRouter()
const accountStore = useAccountStore()
const toast = useToastStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { friends, loading, seedCacheLoading, clearCacheLoading, importHexLoading, importedSyncAllSource, importedSyncAllLoading, clearImportedSyncAllLoading, friendLands, friendLandsLoading, blacklist, friendFetchMeta } = storeToRefs(friendStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

// Confirm Modal state
const showConfirm = ref(false)
const confirmMessage = ref('')
const confirmLoading = ref(false)
const pendingAction = ref<(() => Promise<void>) | null>(null)
const avatarErrorKeys = ref<Set<string>>(new Set())
const selectionMode = ref(false)
const selectedFriendIds = ref<number[]>([])
const batchRunning = ref(false)
const batchResult = ref<any | null>(null)
const nowTs = ref(Date.now())
const manualRefreshLockedUntil = ref(0)
const importHexText = ref('')
const showImportHexModal = ref(false)
const importHexPrefillPending = ref(false)
const importHexTextareaRef = ref<HTMLTextAreaElement | null>(null)

function confirmAction(msg: string, action: () => Promise<void>) {
  confirmMessage.value = msg
  pendingAction.value = action
  showConfirm.value = true
}

async function onConfirm() {
  if (pendingAction.value) {
    try {
      confirmLoading.value = true
      await pendingAction.value()
      pendingAction.value = null
      showConfirm.value = false
    }
    finally {
      confirmLoading.value = false
    }
  }
  else {
    showConfirm.value = false
  }
}

// Track expanded friends
const expandedFriends = ref<Set<string>>(new Set())

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  if (totalSec < 60)
    return `${totalSec} 秒`
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0)
    return minutes > 0 ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`
  if (minutes > 0 && seconds > 0)
    return `${minutes} 分 ${seconds} 秒`
  return `${minutes} 分钟`
}

function getFriendAutoRetryText() {
  const remainMs = Math.max(0, Number(friendFetchMeta.value?.cooldownUntil || 0) - nowTs.value)
  return remainMs > 0 ? formatDuration(remainMs) : ''
}

function formatDateTime(ts: number) {
  const value = Math.max(0, Number(ts || 0))
  if (!value)
    return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

async function loadFriends(options: { manualRefresh?: boolean } = {}) {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    avatarErrorKeys.value.clear()
    await friendStore.fetchImportedSyncAllSource(currentAccountId.value)
    const result = await friendStore.fetchFriends(currentAccountId.value, options)
    const bannerCopy = buildFriendFetchBannerCopy(friendFetchMeta.value, getFriendAutoRetryText())
    if (result?.fromCache) {
      toast.warning(bannerCopy?.title || '好友列表已回退缓存')
    }
    else if (options.manualRefresh) {
      if (friends.value.length > 0) {
        toast.success('好友列表已手动刷新')
      }
      else {
        toast.warning(bannerCopy?.title || '本次手动刷新未拿到可用好友列表')
      }
    }
    if (acc.running || friends.value.length > 0) {
      await friendStore.fetchBlacklist(currentAccountId.value)
    }
  }
}

async function handleManualRefresh() {
  if (!currentAccountId.value || loading.value || statusLoading.value)
    return
  const remainMs = Math.max(0, manualRefreshLockedUntil.value - Date.now())
  if (remainMs > 0) {
    toast.warning(`手动刷新过于频繁，请 ${formatDuration(remainMs)} 后再试`)
    return
  }
  manualRefreshLockedUntil.value = Date.now() + 10_000
  await loadFriends({ manualRefresh: true })
}

async function handleSeedFriendsCache() {
  if (!currentAccountId.value || seedCacheLoading.value || loading.value || statusLoading.value || !status.value?.connection?.connected)
    return

  const result = await friendStore.seedFriendsCache(currentAccountId.value, 100)
  const bannerCopy = buildFriendFetchBannerCopy(friendFetchMeta.value, getFriendAutoRetryText())

  if (result.ok && friends.value.length > 0) {
    const count = friends.value.length
    const seededCount = Math.max(0, Number(result.seededCount || 0))
    toast.success(seededCount > 0
      ? `已从最近访客/互动记录补出 ${count} 位临时好友`
      : `已加载 ${count} 位缓存好友`)
    if (currentAccount.value?.running) {
      await friendStore.fetchBlacklist(currentAccountId.value)
    }
    return
  }

  const seededCount = Math.max(0, Number(result.seededCount || 0))
  if (seededCount > 0) {
    toast.warning(`已识别 ${seededCount} 个访客种子，但暂未补出可用好友缓存`)
    return
  }

  toast.warning(result.error || bannerCopy?.title || '访客记录里也没有可用好友')
}

useIntervalFn(() => {
  nowTs.value = Date.now()
  for (const gid in friendLands.value) {
    if (friendLands.value[gid]) {
      friendLands.value[gid] = friendLands.value[gid].map((l: any) =>
        l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
      )
    }
  }
}, 1000)

onMounted(() => {
  loadFriends()
  window.addEventListener('keydown', handleImportHexModalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImportHexModalKeydown)
})

// 【修复闪烁】监听 accountId 字符串值而非 currentAccount 对象引用
watch(() => currentAccountId.value, () => {
  expandedFriends.value.clear()
  selectedFriendIds.value = []
  batchResult.value = null
  showImportHexModal.value = false
  importHexText.value = ''
  loadFriends()
})

// Search state
const searchQuery = ref('')

const filteredFriends = computed(() => {
  if (!searchQuery.value)
    return friends.value
  const q = searchQuery.value.toLowerCase()
  return friends.value.filter((f: any) => {
    const nameStr = String(f.name || f.nick || f.userName || f.id || '').toLowerCase()
    return nameStr.includes(q)
  })
})

const isWechatAccount = computed(() => {
  return isWechatFriendPlatform(currentAccount.value?.platform || friendFetchMeta.value?.platform || '')
})

const isAccountConnected = computed(() => !!status.value?.connection?.connected)

const friendAutoRetryRemainingMs = computed(() =>
  Math.max(0, Number(friendFetchMeta.value?.cooldownUntil || 0) - nowTs.value),
)

const friendAutoRetryText = computed(() =>
  friendAutoRetryRemainingMs.value > 0 ? formatDuration(friendAutoRetryRemainingMs.value) : '',
)

const manualRefreshLockRemainingMs = computed(() =>
  Math.max(0, manualRefreshLockedUntil.value - nowTs.value),
)

const manualRefreshButtonLabel = computed(() => {
  if (!currentAccountId.value)
    return '请选择账号'
  if (loading.value)
    return '刷新中...'
  if (statusLoading.value)
    return '状态检查中...'
  if (!isAccountConnected.value)
    return '需先连接账号'
  if (manualRefreshLockRemainingMs.value > 0)
    return `${Math.ceil(manualRefreshLockRemainingMs.value / 1000)}s 后可刷新`
  return '手动刷新'
})

const seedCacheButtonLabel = computed(() => {
  if (!currentAccountId.value)
    return '请选择账号'
  if (seedCacheLoading.value)
    return '补缓存中...'
  if (loading.value)
    return '列表加载中...'
  if (statusLoading.value)
    return '状态检查中...'
  if (!isAccountConnected.value)
    return '需先连接账号'
  return '访客补缓存'
})

const clearCacheButtonLabel = computed(() => {
  if (!currentAccountId.value)
    return '请选择账号'
  if (clearCacheLoading.value)
    return isAccountConnected.value ? '清理重建中...' : '清理中...'
  if (loading.value)
    return '列表加载中...'
  if (seedCacheLoading.value)
    return '补缓存中...'
  if (statusLoading.value)
    return '状态检查中...'
  if (batchRunning.value)
    return '批量执行中...'
  return isAccountConnected.value ? '清理并重建' : '清理缓存'
})

const importHexButtonLabel = computed(() => {
  if (!currentAccountId.value)
    return '请选择账号'
  if (importHexLoading.value)
    return '导入中...'
  if (loading.value)
    return '列表加载中...'
  if (statusLoading.value)
    return '状态检查中...'
  return '导入同步 Hex'
})

const isReadOnlyFriendView = computed(() =>
  !!currentAccountId.value
  && !loading.value
  && !statusLoading.value
  && !isAccountConnected.value
  && friends.value.length > 0,
)

const friendStatusBanner = computed(() => {
  const banner = buildFriendFetchBannerCopy(friendFetchMeta.value, friendAutoRetryText.value)
  if (!banner)
    return null
  return {
    ...banner,
    cooldownText: isWechatAccount.value ? friendAutoRetryText.value : '',
  }
})

const friendSourceCopy = computed(() => {
  if (!currentAccountId.value || loading.value || statusLoading.value)
    return null
  return buildFriendFetchSourceCopy(friendFetchMeta.value)
})

const displayFriendBanner = computed(() => {
  if (isReadOnlyFriendView.value) {
    const baseBanner = friendStatusBanner.value
    const descriptionSuffix = '当前账号未连接，下面显示的是只读缓存好友；连接账号后才能手动刷新并执行好友操作。'
    if (baseBanner) {
      return {
        ...baseBanner,
        tone: 'warning' as const,
        badge: '离线缓存',
        cooldownText: '',
        description: `${baseBanner.description} ${descriptionSuffix}`,
      }
    }
    return {
      tone: 'warning' as const,
      title: '当前显示离线缓存好友',
      description: descriptionSuffix,
      badge: '离线缓存',
      cooldownText: '',
    }
  }
  return friendStatusBanner.value
})

const friendStatusLogShortcut = computed(() => {
  if (!displayFriendBanner.value || !currentAccountId.value)
    return null
  const shortcut = buildFriendLogShortcut(friendFetchMeta.value)
  if (!shortcut)
    return null
  return {
    ...shortcut,
    accountId: currentAccountId.value,
  }
})

const canManualRefreshFriends = computed(() =>
  !!currentAccountId.value
  && !loading.value
  && !statusLoading.value
  && isAccountConnected.value
  && manualRefreshLockRemainingMs.value <= 0,
)

const canSeedFriendsCache = computed(() =>
  !!currentAccountId.value
  && isWechatAccount.value
  && !seedCacheLoading.value
  && !loading.value
  && !statusLoading.value
  && isAccountConnected.value,
)

const canClearFriendsCache = computed(() =>
  !!currentAccountId.value
  && !clearCacheLoading.value
  && !seedCacheLoading.value
  && !loading.value
  && !statusLoading.value
  && !batchRunning.value,
)

const canImportFriendsHex = computed(() =>
  !!currentAccountId.value
  && !importHexLoading.value
  && !clearCacheLoading.value
  && !seedCacheLoading.value
  && !loading.value
  && !statusLoading.value,
)

const canSubmitImportHex = computed(() =>
  canImportFriendsHex.value && importHexText.value.trim().length > 0,
)

const hasImportedSyncAllSource = computed(() =>
  !!importedSyncAllSource.value?.active && Number(importedSyncAllSource.value?.openIdCount || 0) > 0,
)

const canClearImportedSyncAllSource = computed(() =>
  !!currentAccountId.value
  && hasImportedSyncAllSource.value
  && !clearImportedSyncAllLoading.value
  && !importHexLoading.value
  && !loading.value
  && !statusLoading.value,
)

const canMutateFriends = computed(() =>
  !!currentAccountId.value
  && !loading.value
  && !statusLoading.value
  && isAccountConnected.value,
)

async function handleClearFriendsCache() {
  const accountId = currentAccountId.value
  if (!accountId || !canClearFriendsCache.value)
    return

  const shouldRefresh = isAccountConnected.value
  const confirmText = shouldRefresh
    ? '确定清理当前账号的好友缓存，并立即按当前登录身份重建吗？这只会处理当前账号自己的好友缓存，不会影响其它账号。'
    : '当前账号未连接，现在只能清理当前账号自己的好友缓存。清理后列表会暂时清空，待账号重新连接后再手动刷新即可重建。确定继续吗？'

  confirmAction(confirmText, async () => {
    const result = await friendStore.clearFriendsCache(accountId, { refresh: shouldRefresh })
    if (!result.ok) {
      toast.error(result.error || (shouldRefresh ? '清理并重建好友缓存失败' : '清理好友缓存失败'))
      return
    }

    expandedFriends.value.clear()
    selectedFriendIds.value = []
    selectionMode.value = false
    batchResult.value = null
    avatarErrorKeys.value.clear()

    if (shouldRefresh) {
      if (currentAccount.value?.running) {
        await friendStore.fetchBlacklist(accountId)
      }
      if ((result.friendCount || 0) > 0) {
        toast.success(`已按当前账号重建 ${result.friendCount} 位好友缓存`)
      }
      else {
        toast.warning('好友缓存已清理，但当前未重建出可用好友列表')
      }
      return
    }

    toast.success('已清理当前账号的好友缓存')
  })
}

async function handleImportFriendsHex() {
  const accountId = currentAccountId.value
  const hex = importHexText.value.trim()
  if (!accountId || !canImportFriendsHex.value)
    return
  if (!hex) {
    toast.warning('请输入好友同步 Hex 内容')
    return
  }

  const result = await friendStore.importFriendsByHex(accountId, hex)
  if (!result.ok) {
    const errorCode = String(result.errorCode || '').trim()
    if (errorCode)
      toast.error(`${result.error || '导入好友同步 Hex 失败'} (${errorCode})`)
    else
      toast.error(result.error || '导入好友同步 Hex 失败')
    return
  }

  importHexText.value = ''
  const successCount = Math.max(0, Number(result.results?.successCount || 0))
  const skippedCount = Math.max(0, Number(result.results?.skippedCount || 0))
  const patchedCount = Math.max(0, Number(result.meta?.profilePatchedCount || 0))
  if (successCount > 0) {
    toast.success(
      patchedCount > 0
        ? `已导入并启用 ${successCount} 个 open_id，同步时会优先按这份 SyncAll 源拉取好友`
        : `已导入并启用 ${successCount} 个 open_id${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`,
    )
  }
  else {
    toast.warning(skippedCount > 0 ? `没有可导入项，已跳过 ${skippedCount} 个` : '没有解析到可导入的 open_id')
  }
  if (currentAccount.value?.running) {
    await friendStore.fetchBlacklist(accountId)
  }
  showImportHexModal.value = false
}

function handleClearImportedSyncAllSource() {
  const accountId = currentAccountId.value
  if (!accountId || !canClearImportedSyncAllSource.value)
    return
  confirmAction('确定清除当前账号已导入的 SyncAll 同步源吗？清除后好友刷新会恢复为默认链路，不会影响其它账号。', async () => {
    const result = await friendStore.clearImportedSyncAllSource(accountId)
    if (!result.ok) {
      toast.error(result.error || '清除导入同步源失败')
      return
    }
    toast.success('当前账号的导入 SyncAll 同步源已清除')
    await loadFriends()
  })
}

function focusImportHexTextarea() {
  nextTick(() => {
    importHexTextareaRef.value?.focus()
    importHexTextareaRef.value?.select()
  })
}

function closeImportHexModal() {
  if (importHexLoading.value)
    return
  showImportHexModal.value = false
}

function clearImportHexInput() {
  if (importHexLoading.value)
    return
  importHexText.value = ''
  focusImportHexTextarea()
}

async function tryPrefillImportHexFromClipboard() {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    focusImportHexTextarea()
    return
  }
  try {
    importHexPrefillPending.value = true
    const clipboardText = (await navigator.clipboard.readText()).trim()
    if (clipboardText)
      importHexText.value = clipboardText
  }
  catch {
    // 浏览器或系统未授权读取剪贴板时静默降级，仍允许手动粘贴。
  }
  finally {
    importHexPrefillPending.value = false
    focusImportHexTextarea()
  }
}

async function openImportHexModal() {
  if (!canImportFriendsHex.value)
    return
  showImportHexModal.value = true
  await tryPrefillImportHexFromClipboard()
}

function handleImportHexModalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !showImportHexModal.value || importHexLoading.value)
    return
  event.preventDefault()
  closeImportHexModal()
}

function openRelatedLogs() {
  if (!friendStatusLogShortcut.value)
    return
  router.push({
    name: 'system-logs',
    query: {
      accountId: String(friendStatusLogShortcut.value.accountId || ''),
      keyword: friendStatusLogShortcut.value.keyword,
    },
  })
}

const selectedFriendCount = computed(() => selectedFriendIds.value.length)
const selectedIdSet = computed(() => new Set(selectedFriendIds.value))

function toggleFriend(friendId: string) {
  if (!canMutateFriends.value)
    return
  if (expandedFriends.value.has(friendId)) {
    expandedFriends.value.delete(friendId)
  }
  else {
    // Collapse others? The original code does:
    // document.querySelectorAll('.friend-lands').forEach(e => e.style.display = 'none');
    // So it behaves like an accordion.
    expandedFriends.value.clear()
    expandedFriends.value.add(friendId)
    if (currentAccountId.value && currentAccount.value?.running && status.value?.connection?.connected) {
      friendStore.fetchFriendLands(currentAccountId.value, friendId)
    }
  }
}

function toggleSelectionMode() {
  if (!canMutateFriends.value)
    return
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) {
    selectedFriendIds.value = []
  }
}

function toggleFriendSelection(friendId: string | number, e?: Event) {
  e?.stopPropagation()
  if (!canMutateFriends.value)
    return
  const gid = Number(friendId || 0)
  if (!gid)
    return
  if (selectedIdSet.value.has(gid)) {
    selectedFriendIds.value = selectedFriendIds.value.filter(id => id !== gid)
  }
  else {
    selectedFriendIds.value = [...selectedFriendIds.value, gid]
  }
}

function selectAllFiltered() {
  if (!canMutateFriends.value)
    return
  selectedFriendIds.value = filteredFriends.value.map((friend: any) => Number(friend.gid || 0)).filter((gid: number) => gid > 0)
}

function clearSelectedFriends() {
  selectedFriendIds.value = []
}

async function handleOp(friendId: string, type: string, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value || !canMutateFriends.value)
    return

  confirmAction('确定执行此操作吗?', async () => {
    await friendStore.operate(currentAccountId.value!, friendId, type)
    await loadFriends() // 操作完毕后局部刷新
  })
}

async function handleToggleBlacklist(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value || !canMutateFriends.value)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, Number(friend.gid))
  await loadFriends() // 切换黑名单后局部刷新
}

async function handleBatchOp(opType: string) {
  if (!currentAccountId.value || !canMutateFriends.value || selectedFriendIds.value.length === 0)
    return
  const actionLabels: Record<string, string> = {
    steal: '批量偷菜',
    water: '批量浇水',
    weed: '批量除草',
    bug: '批量除虫',
    bad: '批量捣乱',
    blacklist_add: '批量加入黑名单',
    blacklist_remove: '批量移出黑名单',
  }
  confirmAction(`确定对已选 ${selectedFriendIds.value.length} 位好友执行“${actionLabels[opType] || opType}”吗？`, async () => {
    batchRunning.value = true
    try {
      const result = await friendStore.batchOperate(currentAccountId.value!, selectedFriendIds.value, opType, {
        continueOnError: true,
        skipBlacklisted: opType !== 'blacklist_remove',
        cooldownMs: 1200,
      })
      batchResult.value = result
      if (result?.successCount > 0) {
        toast.success(`${actionLabels[opType] || '批量操作'}完成，成功 ${result.successCount} 项`)
      }
      else {
        toast.warning(`${actionLabels[opType] || '批量操作'}已执行，但没有成功项`)
      }
      if (opType === 'blacklist_add' || opType === 'blacklist_remove') {
        await friendStore.fetchBlacklist(currentAccountId.value!)
      }
      await loadFriends()
    }
    finally {
      batchRunning.value = false
    }
  })
}

function getFriendStatusText(friend: any) {
  const p = friend.plant || {}
  const info = []
  if (p.stealNum)
    info.push(`偷${p.stealNum}`)
  if (p.dryNum)
    info.push(`水${p.dryNum}`)
  if (p.weedNum)
    info.push(`草${p.weedNum}`)
  if (p.insectNum)
    info.push(`虫${p.insectNum}`)
  return info.length ? info.join(' ') : '无操作'
}

function getFriendAvatar(friend: any) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const gid = String(friend?.gid || '').trim()
  const uin = String(friend?.uin || '').trim()
  if (!uin || !/^\d+$/.test(uin) || uin === gid)
    return ''
  if (uin && !friend?.isWechat)
    return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
  return ''
}

function getFriendAvatarKey(friend: any) {
  const key = String(friend?.gid || friend?.uin || '').trim()
  return key || String(friend?.name || '').trim()
}

function canShowFriendAvatar(friend: any) {
  const key = getFriendAvatarKey(friend)
  if (!key)
    return false
  return !!getFriendAvatar(friend) && !avatarErrorKeys.value.has(key)
}

function handleFriendAvatarError(friend: any) {
  const key = getFriendAvatarKey(friend)
  if (!key)
    return
  avatarErrorKeys.value.add(key)
}

function getBatchResultStateClass(row: any) {
  if (row?.ok)
    return 'friends-result-state friends-result-state-success'
  if (row?.skipped)
    return 'friends-result-state friends-result-state-skipped'
  return 'friends-result-state friends-result-state-error'
}

function getFriendStatusClass(friend: any) {
  return getFriendStatusText(friend) !== '无操作'
    ? 'friends-status-text friends-status-text-active'
    : 'friends-status-text friends-status-text-idle'
}
</script>

<template>
  <div class="friends-page ui-page-shell ui-page-density-relaxed h-full min-h-0 w-full flex flex-col">
    <div class="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div class="min-w-0">
        <h2 class="flex items-center gap-2 text-2xl font-bold">
          <div class="i-carbon-user-multiple" />
          好友
          <span v-if="friends.length" class="glass-text-muted ml-2 text-sm font-normal">
            (共 {{ friends.length }} 人)
          </span>
        </h2>
        <div v-if="friendSourceCopy" class="mt-2 flex flex-wrap items-center gap-2">
          <BaseBadge
            surface="meta"
            :tone="friendSourceCopy.tone"
            class="friends-source-pill rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            :title="friendSourceCopy.description"
          >
            {{ friendSourceCopy.label }}
          </BaseBadge>
          <span class="friends-summary-note friends-source-note text-sm">
            {{ friendSourceCopy.description }}
          </span>
          <span v-if="friendSourceCopy.detail" class="friends-summary-note friends-source-note text-xs">
            {{ friendSourceCopy.detail }}
          </span>
        </div>
      </div>
      <div class="w-full flex shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
        <button
          class="friends-refresh-btn h-[38px] shrink-0 rounded-lg px-3 text-sm font-medium transition"
          :disabled="!canManualRefreshFriends"
          @click="handleManualRefresh"
        >
          <span class="inline-flex items-center gap-1.5">
            <span class="i-carbon-renew" />
            {{ manualRefreshButtonLabel }}
          </span>
        </button>
        <button
          class="friends-refresh-btn friends-clear-btn h-[38px] shrink-0 rounded-lg px-3 text-sm font-medium transition"
          :disabled="!canClearFriendsCache"
          @click="handleClearFriendsCache"
        >
          <span class="inline-flex items-center gap-1.5">
            <span class="i-carbon-clean" />
            {{ clearCacheButtonLabel }}
          </span>
        </button>
        <button
          class="friends-refresh-btn friends-import-trigger h-[38px] shrink-0 rounded-lg px-3 text-sm font-medium transition"
          :disabled="!canImportFriendsHex"
          @click="openImportHexModal"
        >
          <span class="inline-flex items-center gap-1.5">
            <span class="i-carbon-data-bin" />
            {{ importHexButtonLabel }}
          </span>
        </button>
        <button
          v-if="isWechatAccount"
          class="friends-refresh-btn h-[38px] shrink-0 rounded-lg px-3 text-sm font-medium transition"
          :disabled="!canSeedFriendsCache"
          @click="handleSeedFriendsCache"
        >
          <span class="inline-flex items-center gap-1.5">
            <span class="i-carbon-user-follow" />
            {{ seedCacheButtonLabel }}
          </span>
        </button>
        <div class="relative min-w-0 w-full flex-1 basis-full sm:w-64 sm:basis-auto">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <div class="friends-search-icon i-carbon-search" />
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索好友昵称/备注..."
            class="friends-search-input glass-text-main block h-[38px] w-full rounded-lg py-2 pl-10 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
        </div>
      </div>
    </div>

    <div class="friends-toolbar ui-mobile-sticky-toolbar mb-4">
      <div class="ui-bulk-actions">
        <button class="batch-btn" :class="{ active: selectionMode }" :disabled="!canMutateFriends" @click="toggleSelectionMode">
          {{ selectionMode ? '退出批量模式' : '批量模式' }}
        </button>
        <template v-if="selectionMode">
          <button class="batch-btn batch-btn-subtle" :disabled="!canMutateFriends" @click="selectAllFiltered">
            全选当前筛选
          </button>
          <button class="batch-btn batch-btn-subtle" :disabled="!canMutateFriends" @click="clearSelectedFriends">
            清空选择
          </button>
          <span class="friends-summary-note text-sm">
            已选 {{ selectedFriendCount }} 位
          </span>
        </template>
      </div>
    </div>

    <div v-if="selectionMode" class="glass-panel ui-mobile-action-panel mb-4 rounded-xl p-4 shadow">
      <div class="ui-bulk-actions">
        <button class="batch-action batch-blue" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('steal')">
          批量偷菜
        </button>
        <button class="batch-action batch-cyan" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('water')">
          批量浇水
        </button>
        <button class="batch-action batch-green" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('weed')">
          批量除草
        </button>
        <button class="batch-action batch-orange" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('bug')">
          批量除虫
        </button>
        <button class="batch-action batch-red" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('bad')">
          批量捣乱
        </button>
        <button class="batch-action batch-gray" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('blacklist_add')">
          批量拉黑
        </button>
        <button class="batch-action batch-gray" :disabled="batchRunning || selectedFriendCount === 0 || !canMutateFriends" @click="handleBatchOp('blacklist_remove')">
          批量移黑
        </button>
      </div>
      <div class="friends-summary-note mt-2 text-xs">
        {{ canMutateFriends ? '批量操作默认串行执行，每个好友之间会插入保守冷却，避免瞬时请求过密。' : '当前账号未连接，批量操作已切换为只读状态。' }}
      </div>
    </div>

    <div
      v-if="displayFriendBanner && currentAccountId && !loading && !statusLoading"
      class="friends-status-banner mb-4 rounded-xl px-4 py-3"
      :class="displayFriendBanner.tone === 'danger' ? 'friends-status-banner-danger' : 'friends-status-banner-warning'"
    >
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0 flex items-start gap-3">
          <div
            class="friends-status-banner-icon mt-0.5 shrink-0"
            :class="displayFriendBanner.tone === 'danger' ? 'i-carbon-warning-alt-filled' : 'i-carbon-information-filled'"
          />
          <div class="min-w-0">
            <div class="friends-status-banner-title flex flex-wrap items-center gap-2">
              <span>{{ displayFriendBanner.title }}</span>
              <BaseBadge v-if="displayFriendBanner.badge" surface="meta" :tone="displayFriendBanner.tone === 'danger' ? 'danger' : 'warning'" class="rounded-full px-2 py-0.5 text-[10px]">
                {{ displayFriendBanner.badge }}
              </BaseBadge>
              <BaseBadge v-if="displayFriendBanner.cooldownText" surface="meta" tone="info" class="rounded-full px-2 py-0.5 text-[10px]">
                自动重试约 {{ displayFriendBanner.cooldownText }}
              </BaseBadge>
            </div>
            <div class="friends-status-banner-desc mt-1 text-sm leading-6">
              {{ displayFriendBanner.description }}
            </div>
          </div>
        </div>
        <div v-if="friendStatusLogShortcut" class="flex shrink-0 items-center">
          <BaseButton variant="secondary" size="sm" class="friends-status-log-btn" @click="openRelatedLogs">
            <div class="i-carbon-catalog mr-1.5" />
            {{ friendStatusLogShortcut.label }}
          </BaseButton>
        </div>
      </div>
    </div>

    <div v-if="batchResult" class="glass-panel mb-4 rounded-xl p-4 shadow">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-sm font-semibold">
            批量结果
          </div>
          <div class="friends-summary-note mt-1 text-xs">
            成功 {{ batchResult.successCount || 0 }} · 失败 {{ batchResult.failCount || 0 }} · 影响 {{ batchResult.totalAffectedCount || 0 }}
          </div>
        </div>
        <button class="batch-btn batch-btn-subtle" @click="batchResult = null">
          收起
        </button>
      </div>
      <div class="mt-3 max-h-64 overflow-y-auto pr-1 space-y-2">
        <div
          v-for="row in batchResult.results || []"
          :key="`batch-${row.gid}-${row.opType}`"
          class="friends-result-row flex items-center justify-between rounded-lg px-3 py-2 text-sm"
        >
          <div>
            <div class="font-medium">
              GID {{ row.gid }}
            </div>
            <div class="friends-summary-note text-xs">
              {{ row.message || '已处理' }}
            </div>
          </div>
          <div class="text-xs" :class="getBatchResultStateClass(row)">
            {{ row.ok ? `成功 ${row.count || 0}` : (row.skipped ? '已跳过' : '失败') }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading || statusLoading" class="flex justify-center py-12">
      <div class="friends-spinner i-svg-spinners-90-ring-with-bg text-4xl" />
    </div>

    <div v-else-if="!currentAccountId" class="glass-panel glass-text-muted rounded-lg p-8 text-center shadow">
      请选择账号后查看好友
    </div>

    <div v-else-if="!isAccountConnected && friends.length === 0" class="glass-panel glass-text-muted flex flex-col items-center justify-center gap-4 rounded-lg p-12 text-center shadow">
      <div class="friends-offline-icon i-carbon-connection-signal-off text-4xl" />
      <div>
        <div class="glass-text-main text-lg font-medium">
          账号未登录
        </div>
        <div class="friends-summary-note mt-1 text-sm">
          请先运行账号或检查网络连接。顶部“手动刷新”需要账号连接后才可用；如需清空历史好友缓存，可点击“清理缓存”。
        </div>
      </div>
    </div>

    <div v-else-if="friends.length === 0" class="glass-panel glass-text-muted rounded-lg p-8 text-center shadow">
      <div class="glass-text-main text-base font-semibold">
        {{ friendStatusBanner?.title || '暂无好友或数据加载失败' }}
      </div>
      <div v-if="friendStatusBanner?.description" class="friends-summary-note mt-2 text-sm leading-6">
        {{ friendStatusBanner.description }}
      </div>
      <div v-if="isWechatAccount && isAccountConnected" class="friends-summary-note mt-3 text-xs leading-5">
        你也可以点击上方“访客补缓存”，尝试从最近访客/互动记录补一份临时好友缓存。
      </div>
    </div>

    <div v-else>
      <div v-if="filteredFriends.length === 0" class="glass-panel glass-text-muted mb-4 rounded-lg p-8 text-center shadow">
        没有匹配的好友
      </div>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="friend in filteredFriends"
          :key="friend.gid"
          class="glass-panel flex flex-col overflow-hidden rounded-lg shadow"
        >
          <div
            class="friends-card-body flex flex-1 flex-col gap-4 p-4 transition"
            :class="[
              blacklist.includes(Number(friend.gid)) ? 'opacity-50' : '',
              canMutateFriends ? 'cursor-pointer' : 'cursor-default',
            ]"
            @click="toggleFriend(friend.gid)"
          >
            <!-- 头部：头像 + 名字 + 状态 -->
            <div class="flex items-center gap-3">
              <label
                v-if="selectionMode"
                class="friends-select-box h-5 w-5 flex shrink-0 items-center justify-center rounded"
                @click.stop
              >
                <input
                  :checked="selectedIdSet.has(Number(friend.gid))"
                  :disabled="!canMutateFriends"
                  type="checkbox"
                  @change="toggleFriendSelection(friend.gid, $event)"
                >
              </label>
              <div class="friends-avatar-shell h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full">
                <img
                  v-if="canShowFriendAvatar(friend)"
                  :src="getFriendAvatar(friend)"
                  class="h-full w-full object-cover"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="handleFriendAvatarError(friend)"
                >
                <div v-else class="friends-avatar-fallback i-carbon-user text-xl" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 truncate font-bold">
                  <span class="truncate">{{ friend.name }}</span>
                  <BaseBadge v-if="friend.farmLevel != null && friend.farmLevel > 0" surface="meta" tone="warning" class="friends-level-pill whitespace-nowrap rounded px-1.5 py-0.5 text-[10px]">
                    Lv.{{ friend.farmLevel }}
                  </BaseBadge>
                  <BaseBadge v-if="blacklist.includes(Number(friend.gid))" surface="meta" tone="neutral" class="friends-blacklist-pill whitespace-nowrap rounded px-1.5 py-0.5 text-[10px]">
                    已屏蔽
                  </BaseBadge>
                </div>
                <div class="mt-0.5 truncate text-sm" :class="getFriendStatusClass(friend)">
                  {{ getFriendStatusText(friend) }}
                </div>
              </div>
            </div>

            <!-- 操作按钮：网格3列，强制不换行 -->
            <div class="friends-op-area grid grid-cols-3 mt-auto gap-1.5 pt-2">
              <button
                class="op-btn op-blue w-full whitespace-nowrap"
                :disabled="!canMutateFriends"
                @click="handleOp(friend.gid, 'steal', $event)"
              >
                偷取
              </button>
              <button
                class="op-btn op-cyan w-full whitespace-nowrap"
                :disabled="!canMutateFriends"
                @click="handleOp(friend.gid, 'water', $event)"
              >
                浇水
              </button>
              <button
                class="op-btn op-green w-full whitespace-nowrap"
                :disabled="!canMutateFriends"
                @click="handleOp(friend.gid, 'weed', $event)"
              >
                除草
              </button>
              <button
                class="op-btn op-orange w-full whitespace-nowrap"
                :disabled="!canMutateFriends"
                @click="handleOp(friend.gid, 'bug', $event)"
              >
                除虫
              </button>
              <button
                class="op-btn op-red w-full whitespace-nowrap"
                :disabled="!canMutateFriends"
                @click="handleOp(friend.gid, 'bad', $event)"
              >
                捣乱
              </button>
              <button
                class="op-btn op-gray w-full whitespace-nowrap"
                :disabled="!canMutateFriends"
                :class="{ 'opacity-80': blacklist.includes(Number(friend.gid)) }"
                @click="handleToggleBlacklist(friend, $event)"
              >
                {{ blacklist.includes(Number(friend.gid)) ? '取消' : '屏蔽' }}
              </button>
            </div>
          </div>

          <!-- 展开的土地详情 -->
          <div v-if="expandedFriends.has(friend.gid)" class="friends-expanded-panel border-t p-3">
            <div v-if="friendLandsLoading[friend.gid]" class="flex justify-center py-4">
              <div class="friends-spinner i-svg-spinners-90-ring-with-bg text-2xl" />
            </div>
            <div v-else-if="!friendLands[friend.gid] || friendLands[friend.gid]?.length === 0" class="glass-text-muted py-4 text-center text-sm">
              无土地数据
            </div>
            <div v-else class="grid grid-cols-3 gap-2 md:grid-cols-3 sm:grid-cols-4 xl:grid-cols-4">
              <LandCard
                v-for="land in friendLands[friend.gid]"
                :key="land.id"
                :land="land"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="showConfirm"
      :loading="confirmLoading"
      title="确认操作"
      :message="confirmMessage"
      @confirm="onConfirm"
      @cancel="!confirmLoading && (showConfirm = false)"
    />

    <Teleport to="body">
      <div
        v-if="showImportHexModal"
        class="friends-import-modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <button
          class="friends-import-modal-overlay absolute inset-0"
          type="button"
          aria-label="关闭导入同步 Hex 弹窗"
          @click="closeImportHexModal"
        />
        <div class="friends-import-modal-shell glass-panel relative z-10 max-h-[min(88vh,48rem)] w-full max-w-2xl overflow-hidden rounded-[28px] shadow-2xl" @click.stop>
          <div class="friends-import-modal-header flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
            <div class="min-w-0">
              <div class="friends-import-modal-eyebrow">
                QQ 好友同步源
              </div>
              <h3 class="friends-import-modal-title mt-2 text-xl font-bold sm:text-2xl">
                导入同步 Hex
              </h3>
              <p class="friends-import-modal-desc mt-2 text-sm leading-6">
                点击按钮后会优先尝试读取剪贴板内容并填入输入框，你只需要确认导入即可。
              </p>
            </div>
            <button
              class="friends-import-modal-close mt-1 h-10 w-10 flex shrink-0 items-center justify-center rounded-full transition"
              type="button"
              :disabled="importHexLoading"
              aria-label="关闭导入同步 Hex 弹窗"
              @click="closeImportHexModal"
            >
              <span class="i-carbon-close text-lg" />
            </button>
          </div>

          <div class="friends-import-modal-body max-h-[calc(min(88vh,48rem)-11rem)] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
            <div class="friends-import-panel rounded-3xl p-4 sm:p-5">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="friends-import-panel-title text-sm font-semibold">
                    SyncAll 请求 Hex
                  </div>
                  <div class="friends-summary-note mt-1 text-xs leading-5">
                    支持直接确认导入；如剪贴板未读取成功，也可以在这里手动粘贴。
                  </div>
                </div>
                <button
                  class="friends-import-clear-btn rounded-full px-3 py-1.5 text-xs font-medium transition"
                  type="button"
                  :disabled="importHexLoading || !importHexText"
                  @click="clearImportHexInput"
                >
                  清除内容
                </button>
              </div>

              <div v-if="importHexPrefillPending" class="friends-import-hint mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
                <span class="i-svg-spinners-ring-resize text-sm" />
                正在尝试读取剪贴板内容...
              </div>

              <textarea
                ref="importHexTextareaRef"
                v-model="importHexText"
                rows="8"
                placeholder="粘贴 QQ 好友 SyncAll 请求 Hex，导入后会启用当前账号的同步源"
                class="friends-import-textarea mt-4 w-full rounded-2xl px-4 py-3 text-sm leading-6 outline-none transition"
              />

              <div class="friends-import-note mt-4 rounded-2xl px-4 py-3 text-sm leading-6">
                导入后会为当前账号保存一份可持续使用的 SyncAll open_id 同步源，后续手动刷新和正常好友拉取都会优先按这份导入源请求。
              </div>
            </div>

            <div class="friends-import-status-card mt-4 rounded-3xl px-4 py-4 sm:px-5">
              <template v-if="importedSyncAllLoading">
                <div class="friends-summary-note flex items-center gap-2 text-sm">
                  <span class="i-svg-spinners-ring-resize text-base" />
                  正在读取当前账号的导入同步源状态...
                </div>
              </template>
              <template v-else-if="hasImportedSyncAllSource">
                <div class="flex flex-wrap items-center gap-2">
                  <BaseBadge surface="meta" tone="success" class="rounded-full px-2.5 py-1 text-[11px] font-medium">
                    当前已启用导入源
                  </BaseBadge>
                  <span class="friends-import-status-strong text-sm font-semibold">
                    open_id {{ importedSyncAllSource?.openIdCount || 0 }}
                  </span>
                </div>
                <div class="friends-import-status-grid mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div class="friends-import-status-item">
                    导入时间：{{ formatDateTime(importedSyncAllSource?.importedAt || 0) }}
                  </div>
                  <div v-if="Number(importedSyncAllSource?.lastUsedAt || 0) > 0" class="friends-import-status-item">
                    最近使用：{{ formatDateTime(importedSyncAllSource?.lastUsedAt || 0) }}
                  </div>
                  <div v-if="Number(importedSyncAllSource?.lastSyncFriendCount || 0) > 0" class="friends-import-status-item">
                    最近同步好友：{{ importedSyncAllSource?.lastSyncFriendCount || 0 }}
                  </div>
                  <div class="friends-import-status-item">
                    来源：{{ importedSyncAllSource?.meta?.serviceName || '-' }} / {{ importedSyncAllSource?.meta?.methodName || '-' }}
                  </div>
                </div>
                <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div class="friends-summary-note text-xs leading-5">
                    清除后仅移除当前账号的导入同步源，不会影响其它账号。
                  </div>
                  <button
                    class="friends-refresh-btn friends-clear-btn h-[34px] shrink-0 rounded-full px-4 text-xs font-medium transition"
                    :disabled="!canClearImportedSyncAllSource"
                    @click="handleClearImportedSyncAllSource"
                  >
                    清除导入源
                  </button>
                </div>
              </template>
              <template v-else>
                <div class="friends-summary-note text-sm leading-6">
                  当前账号还没有启用导入的 SyncAll 同步源。
                </div>
              </template>
            </div>
          </div>

          <div class="friends-import-modal-footer flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            <button
              class="friends-import-footer-btn friends-import-footer-secondary rounded-2xl px-4 py-2.5 text-sm font-medium transition"
              type="button"
              :disabled="importHexLoading"
              @click="closeImportHexModal"
            >
              关闭
            </button>
            <button
              class="friends-import-footer-btn friends-import-footer-primary rounded-2xl px-5 py-2.5 text-sm font-semibold transition"
              type="button"
              :disabled="!canSubmitImportHex"
              @click="handleImportFriendsHex"
            >
              <span class="inline-flex items-center gap-2">
                <span v-if="importHexLoading" class="i-svg-spinners-ring-resize text-base" />
                确认导入
              </span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.friends-page {
  color: var(--ui-text-1);
}

.friends-page :is([class*='text-'][class*='gray-400'], [class*='text-'][class*='gray-500'], .glass-text-muted) {
  color: var(--ui-text-2) !important;
}

.friends-search-icon,
.friends-avatar-fallback,
.friends-offline-icon {
  color: var(--ui-text-3) !important;
}

.friends-search-input {
  border: 1px solid var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 60%, transparent) !important;
}

.friends-summary-note {
  color: var(--ui-text-2) !important;
}

.friends-toolbar {
  z-index: 12;
}

.friends-source-pill {
  display: inline-flex;
  align-items: center;
  border-width: 1px;
  border-style: solid;
  line-height: 1.2;
}

.friends-source-note {
  line-height: 1.5;
}

.friends-refresh-btn {
  border: 1px solid var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent) !important;
  color: var(--ui-text-1) !important;
}

.friends-refresh-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-status-info) 22%, var(--ui-border-subtle)) !important;
  background: color-mix(in srgb, var(--ui-status-info) 8%, var(--ui-bg-surface)) !important;
}

.friends-clear-btn {
  border-color: color-mix(in srgb, var(--ui-status-warning) 20%, var(--ui-border-subtle)) !important;
}

.friends-clear-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--ui-status-warning) 28%, var(--ui-border-subtle)) !important;
  background: color-mix(in srgb, var(--ui-status-warning) 9%, var(--ui-bg-surface)) !important;
}

.friends-import-trigger {
  border-color: color-mix(in srgb, var(--ui-brand-500) 22%, var(--ui-border-subtle)) !important;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--ui-brand-500) 12%, transparent), transparent 58%),
    color-mix(in srgb, var(--ui-bg-surface) 76%, transparent) !important;
}

.friends-refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.friends-import-modal-overlay {
  border: 0;
  background: color-mix(in srgb, var(--ui-overlay-backdrop) 82%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.friends-import-modal-shell {
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 14%, var(--ui-border-subtle));
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ui-brand-500) 12%, transparent), transparent 38%),
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-surface-raised) 96%, transparent), color-mix(in srgb, var(--ui-bg-surface) 92%, transparent));
}

.friends-import-modal-header,
.friends-import-modal-footer {
  border-color: var(--ui-border-subtle);
}

.friends-import-modal-eyebrow {
  color: color-mix(in srgb, var(--ui-brand-500) 84%, var(--ui-text-1));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.friends-import-modal-title,
.friends-import-panel-title,
.friends-import-status-strong {
  color: var(--ui-text-1);
}

.friends-import-modal-desc,
.friends-import-hint,
.friends-import-note,
.friends-import-status-item {
  color: var(--ui-text-2);
}

.friends-import-modal-close,
.friends-import-clear-btn,
.friends-import-footer-secondary {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 84%, transparent);
  color: var(--ui-text-2);
}

.friends-import-modal-close:hover:not(:disabled),
.friends-import-clear-btn:hover:not(:disabled),
.friends-import-footer-secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 96%, transparent);
  color: var(--ui-text-1);
}

.friends-import-panel,
.friends-import-status-card {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 76%, transparent);
}

.friends-import-textarea {
  min-height: 12rem;
  resize: vertical;
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 14%, var(--ui-border-subtle));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ui-bg-surface-raised) 94%, transparent), color-mix(in srgb, var(--ui-bg-surface) 92%, transparent));
  color: var(--ui-text-1);
}

.friends-import-textarea:focus {
  border-color: var(--ui-brand-500);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-focus-ring) 78%, transparent);
}

.friends-import-hint {
  border: 1px solid color-mix(in srgb, var(--ui-status-info) 18%, var(--ui-border-subtle));
  background: color-mix(in srgb, var(--ui-status-info) 8%, var(--ui-bg-surface));
}

.friends-import-note {
  border: 1px solid color-mix(in srgb, var(--ui-brand-500) 14%, var(--ui-border-subtle));
  background: linear-gradient(135deg, color-mix(in srgb, var(--ui-brand-500) 7%, transparent), color-mix(in srgb, var(--ui-bg-surface) 82%, transparent));
}

.friends-import-status-item {
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--ui-border-subtle) 94%, transparent);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
  padding: 0.75rem 0.9rem;
}

.friends-import-footer-btn {
  min-width: 7.5rem;
}

.friends-import-footer-primary {
  border: 1px solid transparent;
  background: linear-gradient(135deg, var(--ui-brand-600), var(--ui-brand-500));
  color: var(--ui-text-on-brand);
}

.friends-import-footer-primary:hover:not(:disabled) {
  filter: brightness(1.04);
  transform: translateY(-1px);
}

.friends-import-footer-primary:disabled,
.friends-import-modal-close:disabled,
.friends-import-clear-btn:disabled,
.friends-import-footer-secondary:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.friends-status-banner {
  border: 1px solid var(--ui-border-subtle);
  background: color-mix(in srgb, var(--ui-bg-surface) 82%, transparent);
}

.friends-status-banner-warning {
  border-color: color-mix(in srgb, var(--ui-status-warning) 24%, var(--ui-border-subtle)) !important;
  background: color-mix(in srgb, var(--ui-status-warning) 8%, var(--ui-bg-surface)) !important;
}

.friends-status-banner-danger {
  border-color: color-mix(in srgb, var(--ui-status-danger) 24%, var(--ui-border-subtle)) !important;
  background: color-mix(in srgb, var(--ui-status-danger) 8%, var(--ui-bg-surface)) !important;
}

.friends-status-banner-icon {
  font-size: 18px;
}

.friends-status-banner-warning .friends-status-banner-icon {
  color: color-mix(in srgb, var(--ui-status-warning) 82%, var(--ui-text-1)) !important;
}

.friends-status-banner-danger .friends-status-banner-icon {
  color: color-mix(in srgb, var(--ui-status-danger) 82%, var(--ui-text-1)) !important;
}

.friends-status-banner-title {
  color: var(--ui-text-1) !important;
  font-weight: 700;
}

.friends-status-banner-desc {
  color: var(--ui-text-2) !important;
}

.friends-result-row {
  border: 1px solid var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent) !important;
}

.friends-result-state-success {
  color: color-mix(in srgb, var(--ui-status-success) 82%, var(--ui-text-1)) !important;
}

.friends-result-state-skipped {
  color: color-mix(in srgb, var(--ui-status-warning) 82%, var(--ui-text-1)) !important;
}

.friends-result-state-error {
  color: color-mix(in srgb, var(--ui-status-danger) 82%, var(--ui-text-1)) !important;
}

.friends-card-body:hover {
  background: color-mix(in srgb, var(--ui-bg-surface) 72%, transparent) !important;
}

.friends-card-body.cursor-default:hover {
  background: transparent !important;
}

.friends-select-box,
.friends-avatar-shell {
  border: 1px solid var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 78%, transparent) !important;
}

.friends-level-pill,
.friends-blacklist-pill {
  display: inline-flex;
  align-items: center;
  border-width: 1px;
  border-style: solid;
  line-height: 1;
}

.friends-status-text-active {
  color: color-mix(in srgb, var(--ui-status-success) 82%, var(--ui-text-1)) !important;
  font-weight: 600;
}

.friends-status-text-idle {
  color: var(--ui-text-2) !important;
}

.friends-expanded-panel {
  border-color: var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 66%, transparent) !important;
}

.friends-spinner {
  color: var(--ui-status-info) !important;
}

.friends-page input[type='text'] {
  border-color: var(--ui-border-subtle) !important;
  background: color-mix(in srgb, var(--ui-bg-surface) 60%, transparent) !important;
  color: var(--ui-text-1) !important;
}

.friends-page input[type='text']:focus {
  border-color: var(--ui-brand-500) !important;
  background: var(--ui-bg-surface-raised) !important;
  box-shadow: 0 0 0 2px var(--ui-focus-ring) !important;
}

.friends-page [class*='border-'][class*='gray-200'],
.friends-page [class*='border-'][class*='gray-300'],
.friends-page [class*='dark:border-'][class*='gray-700'],
.friends-page [class*='dark:border-'][class*='gray-600'],
.friends-page [class*='dark:border-'][class*='white/5'] {
  border-color: var(--ui-border-subtle) !important;
}

.friends-page [class*='bg-'][class*='gray-50/50'],
.friends-page [class*='bg-'][class*='black/20'],
.friends-page [class*='bg-'][class*='black/5'],
.friends-page [class*='dark:bg-'][class*='black/20'] {
  background: color-mix(in srgb, var(--ui-bg-surface) 62%, transparent) !important;
}

/* 统一操作按钮基础样式 */
.op-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
  cursor: pointer;
  line-height: 1.25;
}

.op-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.op-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none !important;
  filter: none !important;
}

.op-btn:active {
  transform: translateY(0);
}

.batch-btn {
  border-radius: 999px;
  border: 1px solid var(--ui-border-strong);
  background: color-mix(in srgb, var(--ui-bg-surface-raised) 72%, transparent);
  padding: 0.5rem 0.95rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ui-text-2);
}

.batch-btn.active {
  border-color: transparent;
  background: linear-gradient(135deg, var(--ui-brand-700), var(--ui-brand-500));
  color: var(--ui-text-on-brand);
}

.batch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.batch-btn-subtle {
  background: color-mix(in srgb, var(--ui-bg-surface) 58%, transparent);
}

.batch-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.5rem 0.95rem;
  font-size: 0.875rem;
  font-weight: 600;
  border: 1px solid transparent;
}

.batch-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 颜色方案变体 - 浅色模式 */
.op-blue {
  background-color: color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  color: var(--ui-text-1);
}
.op-cyan {
  background-color: var(--ui-status-info-soft);
  color: var(--ui-status-info);
}
.op-green {
  background-color: var(--ui-status-success-soft);
  color: var(--ui-status-success);
}
.op-orange {
  background-color: var(--ui-status-warning-soft);
  color: var(--ui-status-warning);
}
.op-red {
  background-color: var(--ui-status-danger-soft);
  color: var(--ui-status-danger);
}
.op-gray {
  background-color: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent);
  color: var(--ui-text-2);
  border: 1px solid var(--ui-border-subtle);
}
.batch-blue {
  background-color: color-mix(in srgb, var(--ui-brand-500) 12%, transparent);
  color: var(--ui-text-1);
}
.batch-cyan {
  background-color: var(--ui-status-info-soft);
  color: var(--ui-status-info);
}
.batch-green {
  background-color: var(--ui-status-success-soft);
  color: var(--ui-status-success);
}
.batch-orange {
  background-color: var(--ui-status-warning-soft);
  color: var(--ui-status-warning);
}
.batch-red {
  background-color: var(--ui-status-danger-soft);
  color: var(--ui-status-danger);
}
.batch-gray {
  background-color: color-mix(in srgb, var(--ui-bg-surface) 68%, transparent);
  color: var(--ui-text-2);
  border-color: var(--ui-border-subtle);
}

@media (max-width: 640px) {
  .friends-import-modal-shell {
    border-radius: 24px;
  }

  .friends-import-modal-body {
    max-height: calc(100vh - 11.5rem);
  }

  .friends-import-footer-btn {
    width: 100%;
  }
}
</style>

<!-- 非 scoped：深色模式需匹配 <html class="dark"> 祖先，用 .friends-op-area 前缀防泄漏 -->
<style>
.dark .friends-op-area .op-blue {
  color: var(--ui-text-1);
}
.dark .friends-op-area .op-cyan {
  color: var(--ui-status-info);
}
.dark .friends-op-area .op-green {
  color: var(--ui-status-success);
}
.dark .friends-op-area .op-orange {
  color: var(--ui-status-warning);
}
.dark .friends-op-area .op-red {
  color: var(--ui-status-danger);
}
.dark .friends-op-area .op-gray {
  color: var(--ui-text-2);
}
.dark .friends-op-area .op-btn:hover {
  box-shadow: 0 0 12px var(--ui-shadow-panel);
  border-color: currentColor;
}
.dark .batch-blue {
  color: var(--ui-text-1);
}
.dark .batch-cyan {
  color: var(--ui-status-info);
}
.dark .batch-green {
  color: var(--ui-status-success);
}
.dark .batch-orange {
  color: var(--ui-status-warning);
}
.dark .batch-red {
  color: var(--ui-status-danger);
}
.dark .batch-gray {
  color: var(--ui-text-2);
}
</style>
