<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import LandCard from '@/components/LandCard.vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { friends, loading, friendLands, friendLandsLoading, blacklist } = storeToRefs(friendStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

// Confirm Modal state
const showConfirm = ref(false)
const confirmMessage = ref('')
const confirmLoading = ref(false)
const pendingAction = ref<(() => Promise<void>) | null>(null)
const avatarErrorKeys = ref<Set<string>>(new Set())

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

async function loadFriends() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (acc.running && status.value?.connection?.connected) {
      avatarErrorKeys.value.clear()
      await friendStore.fetchFriends(currentAccountId.value)
      await friendStore.fetchBlacklist(currentAccountId.value)
    }
  }
}

useIntervalFn(() => {
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
})

watch(currentAccountId, () => {
  expandedFriends.value.clear()
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

function toggleFriend(friendId: string) {
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

async function handleOp(friendId: string, type: string, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return

  confirmAction('确定执行此操作吗?', async () => {
    await friendStore.operate(currentAccountId.value!, friendId, type)
    await loadFriends() // 操作完毕后局部刷新
  })
}

async function handleToggleBlacklist(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, Number(friend.gid))
  await loadFriends() // 切换黑名单后局部刷新
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
  const uin = String(friend?.uin || '').trim()
  if (uin)
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
</script>

<template>
  <div class="p-4">
    <div class="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <h2 class="flex items-center gap-2 text-2xl font-bold">
        <div class="i-carbon-user-multiple" />
        好友
        <span v-if="friends.length" class="glass-text-muted ml-2 text-sm font-normal">
          (共 {{ friends.length }} 人)
        </span>
      </h2>
      <div class="relative w-full shrink-0 sm:w-64">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <div class="i-carbon-search text-gray-400 dark:text-gray-300" />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索好友昵称/备注..."
          class="glass-text-main block h-[38px] w-full border border-gray-300/50 rounded-lg bg-black/5 py-2 pl-10 pr-3 text-sm dark:border-white/10 focus:border-primary-500 dark:bg-black/20 focus:bg-white/60 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:bg-black/40 placeholder-gray-500 dark:placeholder-gray-400"
        >
      </div>
    </div>

    <div v-if="loading || statusLoading" class="flex justify-center py-12">
      <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
    </div>

    <div v-else-if="!currentAccountId" class="glass-panel glass-text-muted rounded-lg p-8 text-center shadow">
      请选择账号后查看好友
    </div>

    <div v-else-if="!status?.connection?.connected" class="glass-panel glass-text-muted flex flex-col items-center justify-center gap-4 rounded-lg p-12 text-center shadow">
      <div class="i-carbon-connection-signal-off text-4xl text-gray-400" />
      <div>
        <div class="glass-text-main text-lg font-medium dark:text-gray-300">
          账号未登录
        </div>
        <div class="mt-1 text-sm text-gray-400">
          请先运行账号或检查网络连接
        </div>
      </div>
    </div>

    <div v-else-if="friends.length === 0" class="glass-panel glass-text-muted rounded-lg p-8 text-center shadow">
      暂无好友或数据加载失败
    </div>

    <div v-else class="space-y-4">
      <div v-if="filteredFriends.length === 0" class="glass-panel glass-text-muted rounded-lg p-8 text-center shadow">
        没有匹配的好友
      </div>
      <div
        v-for="friend in filteredFriends"
        :key="friend.gid"
        class="glass-panel overflow-hidden rounded-lg shadow"
      >
        <div
          class="flex flex-col cursor-pointer justify-between gap-4 p-4 transition sm:flex-row sm:items-center hover:bg-black/5 dark:hover:bg-white/5"
          :class="blacklist.includes(Number(friend.gid)) ? 'opacity-50' : ''"
          @click="toggleFriend(friend.gid)"
        >
          <div class="flex items-center gap-3">
            <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-1 ring-gray-100 dark:bg-gray-600 dark:ring-gray-700">
              <img
                v-if="canShowFriendAvatar(friend)"
                :src="getFriendAvatar(friend)"
                class="h-full w-full object-cover"
                loading="lazy"
                @error="handleFriendAvatarError(friend)"
              >
              <div v-else class="i-carbon-user text-gray-400" />
            </div>
            <div>
              <div class="flex items-center gap-2 font-bold">
                {{ friend.name }}
                <span v-if="blacklist.includes(Number(friend.gid))" class="glass-text-muted rounded bg-gray-200 px-1.5 py-0.5 text-xs dark:bg-gray-700 dark:text-gray-400">已屏蔽</span>
              </div>
              <div class="text-sm" :class="getFriendStatusText(friend) !== '无操作' ? 'text-green-500 font-medium' : 'text-gray-400'">
                {{ getFriendStatusText(friend) }}
              </div>
            </div>
          </div>

          <div class="friends-op-area flex flex-wrap gap-2">
            <button
              class="op-btn op-blue"
              @click="handleOp(friend.gid, 'steal', $event)"
            >
              偷取
            </button>
            <button
              class="op-btn op-cyan"
              @click="handleOp(friend.gid, 'water', $event)"
            >
              浇水
            </button>
            <button
              class="op-btn op-green"
              @click="handleOp(friend.gid, 'weed', $event)"
            >
              除草
            </button>
            <button
              class="op-btn op-orange"
              @click="handleOp(friend.gid, 'bug', $event)"
            >
              除虫
            </button>
            <button
              class="op-btn op-red"
              @click="handleOp(friend.gid, 'bad', $event)"
            >
              捣乱
            </button>
            <button
              class="op-btn op-gray"
              :class="{ 'opacity-80': blacklist.includes(Number(friend.gid)) }"
              @click="handleToggleBlacklist(friend, $event)"
            >
              {{ blacklist.includes(Number(friend.gid)) ? '移出黑名单' : '加入黑名单' }}
            </button>
          </div>
        </div>

        <div v-if="expandedFriends.has(friend.gid)" class="border-t border-gray-100/50 bg-gray-50/50 p-4 dark:border-white/5 dark:bg-black/20">
          <div v-if="friendLandsLoading[friend.gid]" class="flex justify-center py-4">
            <div class="i-svg-spinners-90-ring-with-bg text-2xl text-blue-500" />
          </div>
          <div v-else-if="!friendLands[friend.gid] || friendLands[friend.gid]?.length === 0" class="glass-text-muted py-4 text-center">
            无土地数据
          </div>
          <div v-else class="grid grid-cols-2 gap-2 lg:grid-cols-8 md:grid-cols-5 sm:grid-cols-4">
            <LandCard
              v-for="land in friendLands[friend.gid]"
              :key="land.id"
              :land="land"
            />
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
  </div>
</template>

<style scoped>
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

.op-btn:active {
  transform: translateY(0);
}

/* 颜色方案变体 - 浅色模式 */
.op-blue { background-color: #eff6ff; color: #1d4ed8; }
.op-cyan { background-color: #ecfeff; color: #0e7490; }
.op-green { background-color: #f0fdf4; color: #15803d; }
.op-orange { background-color: #fff7ed; color: #c2410c; }
.op-red { background-color: #fef2f2; color: #b91c1c; }
.op-gray { background-color: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
</style>

<!-- 非 scoped：深色模式需匹配 <html class="dark"> 祖先，用 .friends-op-area 前缀防泄漏 -->
<style>
.dark .friends-op-area .op-blue { background-color: rgba(30, 64, 175, 0.15); color: #60a5fa; border-color: rgba(59, 130, 246, 0.2); }
.dark .friends-op-area .op-cyan { background-color: rgba(21, 94, 117, 0.15); color: #22d3ee; border-color: rgba(6, 182, 212, 0.2); }
.dark .friends-op-area .op-green { background-color: rgba(22, 101, 52, 0.15); color: #4ade80; border-color: rgba(34, 197, 94, 0.2); }
.dark .friends-op-area .op-orange { background-color: rgba(154, 52, 18, 0.15); color: #fb923c; border-color: rgba(249, 115, 22, 0.2); }
.dark .friends-op-area .op-red { background-color: rgba(153, 27, 27, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.2); }
.dark .friends-op-area .op-gray { background-color: rgba(30, 41, 59, 0.4); color: #94a3b8; border-color: rgba(71, 85, 105, 0.3); }
.dark .friends-op-area .op-btn:hover { box-shadow: 0 0 12px rgba(0, 0, 0, 0.2); border-color: currentColor; }
</style>

