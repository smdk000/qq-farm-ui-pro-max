<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useFriendStore } from '@/stores/friend'
import { useSettingStore } from '@/stores/setting'

const accountStore = useAccountStore()
const farmStore = useFarmStore()
const friendStore = useFriendStore()
const settingStore = useSettingStore()

const { currentAccountId, accounts } = storeToRefs(accountStore)
const { seeds } = storeToRefs(farmStore)
const { cachedFriends: friends, loading: friendsLoading } = storeToRefs(friendStore)
const { settings, loading: settingsLoading } = storeToRefs(settingStore)

const avatarErrorKeys = ref<Set<string>>(new Set())

function getFriendAvatar(friend: any) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const uin = String(friend?.uin || friend?.id || '').trim()
  if (uin)
    return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
  return ''
}

function getFriendAvatarKey(friend: any) {
  const key = String(friend?.gid || friend?.uin || friend?.id || '').trim()
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

const saving = ref(false)

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

const localSettings = ref({
  automation: {
    stealFilterEnabled: false,
    stealFilterMode: 'blacklist' as 'blacklist' | 'whitelist',
    stealFilterPlantIds: [] as number[],
    stealFriendFilterEnabled: false,
    stealFriendFilterMode: 'blacklist' as 'blacklist' | 'whitelist',
    stealFriendFilterIds: [] as number[],
  } as Record<string, any>,
})

// === UI State ===
const activeTab = ref<'friends' | 'plants'>('friends')
const searchQuery = ref('')
const selectedAccount = ref<string>(currentAccountId.value || '')

function syncLocalSettings() {
  if (settings.value && settings.value.automation) {
    const s = settings.value.automation as any
    localSettings.value.automation = {
      stealFilterEnabled: s.stealFilterEnabled ?? false,
      stealFilterMode: s.stealFilterMode ?? 'blacklist',
      stealFilterPlantIds: [...(s.stealFilterPlantIds || [])],
      stealFriendFilterEnabled: s.stealFriendFilterEnabled ?? false,
      stealFriendFilterMode: s.stealFriendFilterMode ?? 'blacklist',
      stealFriendFilterIds: [...(s.stealFriendFilterIds || [])],
    }
  }
}

const cropAnalytics = ref<Record<string, any>>({})

async function loadData() {
  if (selectedAccount.value) {
    if (currentAccountId.value !== selectedAccount.value) {
      accountStore.setCurrentAccount({ id: selectedAccount.value } as any)
    }
    await settingStore.fetchSettings(selectedAccount.value)
    syncLocalSettings()

    // 加载全部种子和好友(使用本地缓存避免风控)
    farmStore.fetchSeeds(selectedAccount.value)
    friendStore.fetchCachedFriends(selectedAccount.value)

    try {
      const res = await api.get('/api/analytics', {
        headers: { 'x-account-id': selectedAccount.value },
        params: { sort: 'level' },
      })
      if (res.data && res.data.ok) {
        const map: Record<string, any> = {}
        for (const item of res.data.data) {
          map[item.seedId] = item
        }
        cropAnalytics.value = map
      }
    }
    catch (e) {
      console.error('Failed to fetch analytics for crops', e)
    }
  }
}

onMounted(() => {
  if (!selectedAccount.value && accounts.value.length > 0) {
    selectedAccount.value = String(accounts.value[0]?.id || accounts.value[0]?.uin || '')
  }
  loadData()
})

watch(() => selectedAccount.value, () => {
  searchQuery.value = ''
  loadData()
})

watch(() => currentAccountId.value, (newId) => {
  if (newId && newId !== selectedAccount.value) {
    selectedAccount.value = newId
  }
})

// === Plants Logic ===

const filteredPlants = computed(() => {
  if (!seeds.value)
    return []
  let res = [...seeds.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    res = res.filter(s => s.name.toLowerCase().includes(q))
  }
  return res
})

function isPlantSelected(seedId: number) {
  return localSettings.value.automation.stealFilterPlantIds.includes(seedId)
}

function togglePlant(seedId: number) {
  const arr = localSettings.value.automation.stealFilterPlantIds
  const idx = arr.indexOf(seedId)
  if (idx > -1) {
    arr.splice(idx, 1)
  }
  else {
    arr.push(seedId)
  }
}

// 批量设置植物选中状态
// 如果 mode 是 blacklist，全选意味着“全不偷”，全不选意味着“全偷”
// 如果 mode 是 whitelist，全选意味着“全偷”，全不选意味着“全不偷”
function selectAllPlants() {
  localSettings.value.automation.stealFilterPlantIds = filteredPlants.value.map(s => s.seedId)
}

function clearAllPlants() {
  localSettings.value.automation.stealFilterPlantIds = []
}

// === Friends Logic ===

const filteredFriends = computed(() => {
  if (!friends.value)
    return []
  let res = [...friends.value]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    res = res.filter((f) => {
      const name = String(f.name || f.nick || f.userName || f.id || '').toLowerCase()
      return name.includes(q)
    })
  }
  return res
})

function isFriendSelected(id: number) {
  return localSettings.value.automation.stealFriendFilterIds.includes(id)
}

function toggleFriend(id: number) {
  const arr = localSettings.value.automation.stealFriendFilterIds
  const idx = arr.indexOf(id)
  if (idx > -1) {
    arr.splice(idx, 1)
  }
  else {
    arr.push(id)
  }
}

function selectAllFriends() {
  localSettings.value.automation.stealFriendFilterIds = filteredFriends.value.map(f => Number(f.gid || f.id))
}

function clearAllFriends() {
  localSettings.value.automation.stealFriendFilterIds = []
}

// === Save Logic ===

async function saveAccountSettings() {
  if (!selectedAccount.value)
    return

  saving.value = true
  try {
    // We must merge with existing full settings so we don't wipe other automation configs
    const fullSettingsToSave = JSON.parse(JSON.stringify(settings.value))
    if (!fullSettingsToSave.automation)
      fullSettingsToSave.automation = {}

    Object.assign(fullSettingsToSave.automation, localSettings.value.automation)

    const res = await settingStore.saveSettings(selectedAccount.value, fullSettingsToSave)
    if (res.ok) {
      showAlert('偷菜设置已成功同步至云端')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="relative min-h-screen p-6 pb-28">
    <!-- Header -->
    <div class="mb-6 flex flex-col justify-between gap-4 border-b border-gray-100/50 pb-4 md:flex-row md:items-center dark:border-gray-700/50">
      <div>
        <h1 class="glass-text-main flex items-center gap-2 text-2xl font-bold">
          <span class="text-primary-500 font-normal">🌱</span> 偷菜设置
        </h1>
        <p class="glass-text-muted mt-1 text-sm">
          精细化控制偷菜行为：选择哪些好友不偷、哪些作物不偷，定制专属自动化监控网。
        </p>
      </div>
      <div class="w-full shrink-0 md:w-64">
        <BaseSelect
          v-model="selectedAccount"
          :options="accounts.map(a => ({ label: String(a.name || a.nick || a.id || a.uin || ''), value: String(a.id || a.uin || '') }))"
        />
      </div>
    </div>

    <div v-if="settingsLoading" class="flex flex-1 items-center justify-center py-20 text-gray-400">
      <div class="i-svg-spinners-ring-resize text-3xl" />
    </div>

    <div v-else-if="!selectedAccount" class="flex flex-1 flex-col items-center justify-center py-20 text-gray-400">
      <div class="i-carbon-user-settings mb-4 text-4xl" />
      <p>请先在右上角选择指定账号</p>
    </div>

    <template v-else>
      <!-- Tabs -->
      <div class="mb-3 flex shrink-0 gap-4 overflow-x-auto border-b border-gray-100/50 dark:border-gray-700/50">
        <button
          class="whitespace-nowrap border-b-2 px-4 py-2 font-medium transition-colors"
          :class="activeTab === 'friends' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent glass-text-muted hover:glass-text-main dark:text-gray-400 dark:hover:text-gray-300'"
          @click="activeTab = 'friends'; searchQuery = ''"
        >
          👥 好友偷菜名单 ({{ localSettings.automation.stealFriendFilterIds.length }}/{{ friends.length }})
        </button>
        <button
          class="whitespace-nowrap border-b-2 px-4 py-2 font-medium transition-colors"
          :class="activeTab === 'plants' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent glass-text-muted hover:glass-text-main dark:text-gray-400 dark:hover:text-gray-300'"
          @click="activeTab = 'plants'; searchQuery = ''"
        >
          🌾 作物偷菜过滤 ({{ localSettings.automation.stealFilterPlantIds.length }}/{{ seeds.length }})
        </button>
      </div>

      <!-- Compact Toolbar - Moved Up -->
      <div class="glass-panel mb-3 flex shrink-0 flex-wrap items-center gap-2 border border-white/20 rounded-lg p-3 shadow-sm dark:border-white/10">
        <!-- Search Box -->
        <div class="relative max-w-md min-w-[200px] flex-1">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
            <div class="i-carbon-search text-sm text-gray-400 dark:text-gray-300" />
          </div>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="activeTab === 'friends' ? '搜索好友昵称/备注...' : '搜索作物名称...'"
            class="glass-text-main m-0 box-border block h-[36px] w-full border border-gray-300/50 rounded-md bg-black/5 py-1.5 pl-9 pr-3 text-sm font-medium leading-5 transition-colors dark:border-white/10 focus:border-primary-500 dark:bg-black/20 focus:bg-white/60 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:bg-black/40 placeholder-gray-500 dark:placeholder-gray-400"
        </div>

        <!-- Divider -->
        <div class="mx-1 h-6 w-px bg-gray-200/50 dark:bg-gray-700/50" />

        <!-- Master Switch -->
        <div class="flex items-center gap-1.5">
          <span class="glass-text-muted text-xs font-medium">总控:</span>
          <BaseSwitch v-if="activeTab === 'friends'" v-model="localSettings.automation.stealFriendFilterEnabled" size="sm" />
          <BaseSwitch v-else v-model="localSettings.automation.stealFilterEnabled" size="sm" />
        </div>

        <!-- Divider -->
        <div class="mx-1 h-6 w-px bg-gray-200/50 dark:bg-gray-700/50" />

        <!-- Mode Select -->
        <div class="flex items-center gap-1.5">
          <select
            v-if="activeTab === 'friends'"
            v-model="localSettings.automation.stealFriendFilterMode"
            class="glass-text-main border border-gray-300/50 rounded-md bg-black/5 py-1.5 pl-2 pr-6 text-xs font-medium shadow-sm dark:border-white/10 focus:border-primary-500 dark:bg-black/20 focus:bg-white/60 focus:ring-1 focus:ring-primary-500 dark:focus:bg-black/40"
          >
            <option value="blacklist" class="bg-white dark:bg-gray-900">
              黑名单
            </option>
            <option value="whitelist" class="bg-white dark:bg-gray-900">
              白名单
            </option>
          </select>
          <select
            v-else
            v-model="localSettings.automation.stealFilterMode"
            class="glass-text-main border border-gray-300/50 rounded-md bg-black/5 py-1.5 pl-2 pr-6 text-xs font-medium shadow-sm dark:border-white/10 focus:border-primary-500 dark:bg-black/20 focus:bg-white/60 focus:ring-1 focus:ring-primary-500 dark:focus:bg-black/40"
          >
            <option value="blacklist" class="bg-white dark:bg-gray-900">
              黑名单
            </option>
            <option value="whitelist" class="bg-white dark:bg-gray-900">
              白名单
            </option>
          </select>
        </div>

        <!-- Divider -->
        <div class="mx-1 hidden h-6 w-px bg-gray-200/50 sm:block dark:bg-gray-700/50" />

        <!-- Action Buttons -->
        <div class="ml-auto flex gap-2">
          <!-- Select All Button - Blue gradient for visibility -->
          <BaseButton
            v-if="activeTab === 'friends'"
            size="sm"
            class="border-0 from-blue-500 to-blue-600 bg-gradient-to-r text-xs text-white font-bold shadow-blue-500/25 shadow-md transition-all hover:from-blue-600 hover:to-blue-700 !px-4 !py-1.5 dark:shadow-blue-500/40 hover:shadow-blue-500/40 hover:shadow-lg"
            @click="selectAllFriends"
          >
            <div class="i-carbon-checkmark-outline mr-1.5 text-sm" /> 全选
          </BaseButton>
          <BaseButton
            v-else
            size="sm"
            class="border-0 from-blue-500 to-blue-600 bg-gradient-to-r text-xs text-white font-bold shadow-blue-500/25 shadow-md transition-all hover:from-blue-600 hover:to-blue-700 !px-4 !py-1.5 dark:shadow-blue-500/40 hover:shadow-blue-500/40 hover:shadow-lg"
            @click="selectAllPlants"
          >
            <div class="i-carbon-checkmark-outline mr-1.5 text-sm" /> 全选
          </BaseButton>

          <!-- Clear All Button - Red gradient for visibility -->
          <BaseButton
            v-if="activeTab === 'friends'"
            size="sm"
            class="border-0 from-red-500 to-red-600 bg-gradient-to-r text-xs text-white font-bold shadow-md shadow-red-500/25 transition-all hover:from-red-600 hover:to-red-700 !px-4 !py-1.5 dark:shadow-red-500/40 hover:shadow-lg hover:shadow-red-500/40"
            @click="clearAllFriends"
          >
            <div class="i-carbon-close-outline mr-1.5 text-sm" /> 清空
          </BaseButton>
          <BaseButton
            v-else
            size="sm"
            class="border-0 from-red-500 to-red-600 bg-gradient-to-r text-xs text-white font-bold shadow-md shadow-red-500/25 transition-all hover:from-red-600 hover:to-red-700 !px-4 !py-1.5 dark:shadow-red-500/40 hover:shadow-lg hover:shadow-red-500/40"
            @click="clearAllPlants"
          >
            <div class="i-carbon-close-outline mr-1.5 text-sm" /> 清空
          </BaseButton>
        </div>
      </div>


      <!-- Main Visual Grid Area -->
      <div class="flex-1 p-1">
        <!-- Friends Grid -->
        <div v-if="activeTab === 'friends'" class="grid grid-cols-1 gap-3 lg:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-if="friendsLoading" class="glass-text-muted col-span-full flex flex-col items-center justify-center py-20">
            <div class="i-svg-spinners-ring-resize mb-3 text-4xl text-primary-500" />
            <p>正在加载好友列表...</p>
          </div>
          <div v-else-if="filteredFriends.length === 0" class="glass-text-muted col-span-full flex flex-col items-center justify-center py-20">
            <div class="i-carbon-search mx-auto mb-3 text-5xl opacity-30" />
            <p class="text-lg">
              没有匹配的好友数据
            </p>
          </div>

          <div
            v-for="friend in filteredFriends"
            :key="friend.gid || friend.id"
            class="group flex cursor-pointer select-none items-center justify-between border rounded-lg p-3 transition-all"
            :class="[
              isFriendSelected(Number(friend.gid || friend.id))
                ? 'border-primary-500/50 bg-primary-50/50 dark:bg-primary-900/20 dark:border-primary-500/30 shadow-[0_0_0_1px_rgba(34,197,94,0.3)] backdrop-blur-sm'
                : 'border-white/20 glass-panel hover:border-white/30 dark:border-white/5 dark:hover:border-white/10',
            ]"
            @click="toggleFriend(Number(friend.gid || friend.id))"
          >
            <div class="flex items-center gap-3 overflow-hidden">
              <div class="relative h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden border border-white/20 rounded-full bg-gray-100/50 shadow-sm">
                <img
                  v-if="canShowFriendAvatar(friend)"
                  :src="getFriendAvatar(friend)"
                  class="z-10 h-full w-full object-cover"
                  loading="lazy"
                  @error="handleFriendAvatarError(friend)"
                >
                <div v-else class="i-carbon-user absolute inset-0 z-0 flex items-center justify-center text-xl text-gray-400" />
              </div>
              <div class="min-w-0 flex flex-col">
                <span class="glass-text-main w-full truncate text-sm font-bold" :title="friend.name || friend.nick || String(friend.id)">
                  {{ friend.name || friend.nick || '- -' }}
                </span>
                <span class="glass-text-muted mt-0.5 text-xs font-mono" title="QQ/uId">
                  {{ friend.id }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 flex-col items-end pl-2">
              <div
                class="h-[22px] w-[22px] flex items-center justify-center rounded-full transition-colors"
                :class="isFriendSelected(Number(friend.gid || friend.id)) ? 'bg-primary-500 text-white shadow-md' : 'border border-gray-300/50 bg-white/20 group-hover:border-primary-400/50 dark:border-white/10 dark:bg-black/20'"
              >
                <div v-if="isFriendSelected(Number(friend.gid || friend.id))" class="i-carbon-checkmark text-sm" />
              </div>
            </div>
          </div>
        </div>

        <!-- Plants Grid (Rich View) -->
        <div v-if="activeTab === 'plants'" class="grid grid-cols-1 gap-3 lg:grid-cols-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-if="!seeds || seeds.length === 0" class="glass-text-muted col-span-full flex flex-col items-center justify-center py-20">
            <div class="i-carbon-search mx-auto mb-3 text-5xl opacity-30" />
            <p class="text-lg">
              没有加载到作物数据
            </p>
          </div>
          <div v-else-if="filteredPlants.length === 0" class="glass-text-muted col-span-full flex flex-col items-center justify-center py-20">
            <div class="i-carbon-search mx-auto mb-3 text-5xl opacity-30" />
            <p class="text-lg">
              未搜到匹配的作物
            </p>
          </div>

          <div
            v-for="seed in filteredPlants"
            :key="seed.seedId"
            class="group flex cursor-pointer select-none items-start justify-between border rounded-xl p-3.5 transition-all"
            :class="[
              isPlantSelected(seed.seedId)
                ? 'border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-900/20 dark:border-indigo-500/30 shadow-[0_0_0_1px_rgba(99,102,241,0.3)] backdrop-blur-sm'
                : 'border-white/20 glass-panel hover:border-white/30 dark:border-white/5 dark:hover:border-white/10',
            ]"
            @click="togglePlant(seed.seedId)"
          >
            <div class="min-w-0 flex flex-1 items-start gap-3">
              <div class="relative h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden border border-white/20 rounded-lg bg-black/5 p-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                <img
                  :src="cropAnalytics[seed.seedId]?.image || `https://qzonestyle.gtimg.cn/qzone/sngapp/app/appstore/app_100371286/crop/${seed.seedId}.png`"
                  class="z-10 max-h-full max-w-full object-contain drop-shadow-sm"
                  loading="lazy"
                  @error="(e) => (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22transparent%22/%3E%3C/svg%3E'"
                >
                <div class="i-carbon-sprout absolute inset-0 z-0 flex items-center justify-center text-2xl text-gray-300" />
              </div>
              <div class="min-w-0 flex flex-1 flex-col">
                <div class="min-w-0 w-full flex items-center justify-between pr-1">
                  <div class="min-w-0 flex items-center gap-1.5">
                    <span class="glass-text-main truncate text-[15px] font-extrabold" :title="seed.name">
                      {{ seed.name }}
                    </span>
                    <span class="glass-text-muted shrink-0 rounded bg-gray-100/50 px-1.5 py-0.5 text-xs font-bold dark:bg-gray-700/50 dark:text-gray-300">
                      Lv {{ cropAnalytics[seed.seedId]?.level || seed.requiredLevel }}
                    </span>
                  </div>
                </div>

                <div class="mt-1.5 space-y-1.5">
                  <div class="flex items-center gap-1.5 text-xs">
                    <div class="whitespace-nowrap rounded-sm bg-purple-50 px-1.5 py-0.5 text-purple-600 font-medium dark:bg-purple-900/30 dark:text-purple-400">
                      时经: <span class="font-bold">{{ cropAnalytics[seed.seedId]?.expPerHour ?? '-' }}</span>
                    </div>
                    <div class="whitespace-nowrap rounded-sm bg-amber-50 px-1.5 py-0.5 text-amber-500 font-medium dark:bg-amber-900/30 dark:text-amber-400">
                      时润: <span class="font-bold">{{ cropAnalytics[seed.seedId]?.profitPerHour ?? '-' }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 text-[11px] opacity-70">
                    <div class="text-blue-600 font-medium dark:text-blue-400">
                      普时经: <span class="font-bold">{{ cropAnalytics[seed.seedId]?.normalFertilizerExpPerHour ?? '-' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              class="ml-2 mt-1 h-[22px] w-[22px] flex shrink-0 items-center justify-center border rounded transition-colors"
              :class="isPlantSelected(seed.seedId) ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-300 bg-black/5 group-hover:border-primary-400 dark:border-white/20 dark:bg-white/5'"
            >
              <div v-if="isPlantSelected(seed.seedId)" class="i-carbon-checkmark text-sm" />
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Action -->
      <div class="glass-panel fixed bottom-0 left-0 right-0 z-40 flex items-center justify-end gap-4 border-t-0 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] lg:left-64" style="border-top: 1px solid var(--glass-border);">
        <span class="glass-text-muted text-sm font-medium transition-opacity" :class="saving ? 'opacity-100' : 'opacity-0'">
          正在上传修改到服务器...
        </span>
        <BaseButton
          variant="primary"
          class="relative shadow-lg shadow-primary-500/30 !px-8 !py-2.5 !font-bold"
          :loading="saving"
          @click="saveAccountSettings"
        >
          <div class="i-carbon-save mr-2 text-lg" /> 保存过滤配置
        </BaseButton>
      </div>
    </template>

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
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.6);
}
</style>
