/* eslint-disable no-alert, unused-imports/no-unused-vars */

<script setup lang="ts">
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { useAppStore } from '@/stores/app'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const appStore = useAppStore()

// 五大预设系统主题色
const THEME_OPTIONS = [
  { key: 'default', color: '#22c55e', bg: 'bg-green-500', bgDark: 'bg-green-600', shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.6)]', name: '御农翠绿 (默认)', desc: '经典护眼配色，生机盎然。代表农业的丰收与稳定。' },
  { key: 'sakura', color: '#ffc0cb', bg: 'bg-[#ffc0cb]', bgDark: 'bg-pink-400', shadow: 'shadow-[0_0_8px_rgba(255,192,203,0.8)]', name: '樱花粉黛 (Sakura)', desc: '活泼灵动的少女粉，猛男标配，点缀极简的玫瑰边框。' },
  { key: 'cyber', color: '#8b5cf6', bg: 'bg-violet-500', bgDark: 'bg-fuchsia-600', shadow: 'shadow-[0_0_8px_rgba(139,92,246,0.6)]', name: '全息赛博 (Neon)', desc: '高对比度的电竞荧光紫，搭配极夜背景，凸显极客执行力。' },
  { key: 'elegant', color: '#eab308', bg: 'bg-yellow-500', bgDark: 'bg-amber-600', shadow: 'shadow-[0_0_8px_rgba(234,179,8,0.6)]', name: '尊贵黯金 (Elegant)', desc: '高端优雅，黄黑相间。适合长期挂机的大佬使用。' },
  { key: 'ocean', color: '#0ea5e9', bg: 'bg-sky-500', bgDark: 'bg-cyan-600', shadow: 'shadow-[0_0_8px_rgba(14,165,233,0.6)]', name: '深海矩阵 (Ocean)', desc: '冷静、理智的数据化浅蓝色调，带来流畅的数据监控体验。' },
]
function changeTheme(themeKey: string) {
  appStore.setUIConfig({ colorTheme: themeKey })
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 overflow-hidden" @click="emit('close')">
    <!-- 遮罩层 -->
    <div
      class="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity dark:bg-black/40"
    />

    <!-- 右侧抽屉主体 -->
    <div
      class="glass-panel absolute bottom-0 right-0 top-0 w-[300px] flex flex-col transform border-l border-white/20 shadow-2xl transition-transform duration-300 dark:border-white/10"
      @click.stop
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between border-b border-gray-200/50 px-5 py-4 dark:border-white/10">
        <h2 class="glass-text-main flex items-center gap-2 text-base font-medium">
          <div class="i-carbon-settings text-lg text-primary" />项目配置
        </h2>
        <button
          class="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          @click="emit('close')"
        >
          <div class="i-carbon-close text-lg" />
        </button>
      </div>

      <!-- 本体滚动区域 -->
      <div class="custom-scrollbar flex-1 overflow-y-auto px-6 py-6 space-y-8">
        <!-- 头部配置区：版权信息 & 深色模式 -->
        <div class="group relative flex items-center justify-between overflow-hidden border border-white/20 rounded-xl bg-black/5 p-4 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/20">
          <!-- 装饰性光晕 -->
          <div class="pointer-events-none absolute h-20 w-20 rounded-full bg-primary/10 blur-xl transition-colors -right-4 -top-4 group-hover:bg-primary/20" />

          <div class="glass-text-muted relative z-10 text-xs font-medium tracking-tight font-mono space-y-2">
            <div class="flex items-center gap-2">
              <div class="i-carbon-code text-sm text-primary" /><span>Maker: smdk000</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="i-carbon-logo-qq text-sm text-primary" /><span>Q群: 227916149</span>
            </div>
          </div>

          <!-- 环境模式切换 -->
          <div class="relative z-10 flex flex-col items-end gap-2 border-l border-white/20 pl-4 dark:border-white/10">
            <span class="glass-text-main text-[11px] font-bold tracking-wider transition-colors duration-300">
              {{ appStore.themeMode === 'auto' ? '自动跟随' : (appStore.isDark ? '深色模式' : '浅色模式') }}
            </span>
            <div
              class="relative h-6 w-16 inline-flex items-center border border-white/20 rounded-full bg-white/50 p-1 shadow-inner transition-colors duration-300 ease-in-out dark:border-white/10 dark:bg-black/40"
            >
              <div class="relative z-10 h-full w-full flex items-center justify-between">
                <div title="浅色模式" class="h-full flex flex-1 cursor-pointer items-center justify-center text-[10px] transition-opacity" :class="appStore.themeMode === 'light' ? 'opacity-100 grayscale-0' : 'opacity-40 grayscale hover:opacity-80'" @click="appStore.setUIConfig({ theme: 'light' })">
                  ☀️
                </div>
                <div title="自动跟随" class="h-full flex flex-1 cursor-pointer items-center justify-center text-[10px] transition-opacity" :class="appStore.themeMode === 'auto' ? 'opacity-100 grayscale-0' : 'opacity-40 grayscale hover:opacity-80'" @click="appStore.setUIConfig({ theme: 'auto' })">
                  A
                </div>
                <div title="深色模式" class="h-full flex flex-1 cursor-pointer items-center justify-center text-[10px] transition-opacity" :class="appStore.themeMode === 'dark' ? 'opacity-100 grayscale-0' : 'opacity-40 grayscale hover:opacity-80'" @click="appStore.setUIConfig({ theme: 'dark' })">
                  🌙
                </div>
              </div>
              <!-- 滑块 -->
              <div
                class="pointer-events-none absolute top-1 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-300 ease-in-out dark:bg-gray-300"
                :class="{
                  'left-1': appStore.themeMode === 'light',
                  'left-[calc(50%-8px)]': appStore.themeMode === 'auto',
                  'left-[calc(100%-20px)]': appStore.themeMode === 'dark',
                }"
              />
            </div>
          </div>
        </div>

        <!-- 性能降级模式 -->
        <div class="group flex items-center justify-between border border-white/20 rounded-xl bg-white/20 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 dark:border-white/10 dark:bg-black/10 hover:bg-white/30 dark:hover:bg-black/20">
          <div class="flex flex-col gap-1 pr-4">
            <div class="glass-text-main flex items-center gap-2 text-[13px] font-bold">
              <div class="i-carbon-flash text-base text-primary" />极简性能模式
            </div>
            <div class="glass-text-muted text-[11px] leading-tight">
              关闭全站毛玻璃特效，解决低配电脑核显渲染缓慢与滑动卡顿问题。
            </div>
          </div>
          <BaseSwitch :model-value="appStore.performanceMode ?? false" @update:model-value="appStore.setUIConfig({ performanceMode: $event ?? false })" />
        </div>

        <!-- 系统主题大卡片变体 -->
        <div>
          <h3 class="glass-text-muted relative z-10 mx-auto mb-4 w-max rounded-lg bg-transparent px-2 text-center text-[13px] font-medium backdrop-blur-md -mt-5">
            系统主题 (预设变体)
          </h3>
          <div class="grid grid-cols-1 gap-4">
            <template v-for="t in THEME_OPTIONS" :key="t.key">
              <div
                class="group relative cursor-pointer overflow-hidden border rounded-xl p-4 shadow-sm transition-all duration-300"
                :class="appStore.colorTheme === t.key ? 'dark:bg-black/20 bg-white/50 backdrop-blur-sm' : 'border-white/20 dark:border-white/10 bg-white/20 dark:bg-black/10 hover:scale-[1.02] backdrop-blur-sm'"
                :style="appStore.colorTheme === t.key ? `border-color: ${t.color}; box-shadow: 0 0 0 1px ${t.color}20, 0 4px 12px -2px ${t.color}20;` : ''"
                @click="changeTheme(t.key)"
              >
                <!-- 仅选中的拥有微弱背景光晕 -->
                <div v-show="appStore.colorTheme === t.key" class="pointer-events-none absolute inset-0 opacity-5" :style="`background-color: ${t.color}`" />
                <!-- 鼠标悬停半透明渐变特效 -->
                <div class="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-10" :style="`background: linear-gradient(to bottom right, ${t.color}, transparent);`" />

                <div class="relative z-10 mb-3 flex items-center justify-between">
                  <div class="glass-text-main flex items-center gap-2 text-[15px] font-bold">
                    <span class="h-3.5 w-3.5 rounded-full" :class="[t.bg, t.shadow]" />
                    {{ t.name }}
                  </div>
                  <!-- 选中标识 -->
                  <div v-if="appStore.colorTheme === t.key" class="flex items-center justify-center rounded px-1.5 py-0.5 text-xs text-white shadow-sm" :style="`background-color: ${t.color}`">
                    <div class="i-carbon-checkmark" />
                  </div>
                </div>
                <!-- 描述 -->
                <div class="glass-text-muted mb-4 pr-2 text-xs leading-relaxed">
                  {{ t.desc }}
                </div>
                <!-- 底层颜色示例方块 -->
                <div class="relative z-10 flex gap-2">
                  <div class="h-6 w-6 rounded" :class="t.bg" />
                  <div class="h-6 w-6 rounded" :class="t.bgDark" />
                  <div class="glass-panel h-6 w-6 border rounded" />
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
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
  border-radius: 4px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
