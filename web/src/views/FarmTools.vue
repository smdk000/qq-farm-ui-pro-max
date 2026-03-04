<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const categories = ref([
  {
    name: '农场工具',
    expanded: true,
    items: [
      { id: 'index.html', title: '使用说明', icon: 'i-carbon-home' },
      { id: 'calculator.html', title: '经验时间计算', icon: 'i-carbon-calculator' },
      { id: 'levels.html', title: '等级氪金模拟', icon: 'i-carbon-chart-evaluation' },
      { id: 'plants.html', title: '作物图鉴查询', icon: 'i-carbon-catalog' },
      { id: 'lands.html', title: '土地升级属性', icon: 'i-carbon-map' },
    ],
  },
])

const selectedArticle = ref('index.html')
const iframeRef = ref<HTMLIFrameElement | null>(null)

function toggleCategory(index: number) {
  if (categories.value && categories.value[index]) {
    categories.value[index].expanded = !categories.value[index].expanded
  }
}

function selectArticle(articleId: string) {
  selectedArticle.value = articleId
}

// 主题劫持逻辑：在同源策略下，直接注入 CSS 和监控
function syncThemeToIframe() {
  if (!iframeRef.value?.contentDocument) return
  
  try {
    const doc = iframeRef.value.contentDocument
    
    // 如果已经注入过了就不再重复注入 `<style id="yunong-theme-override">`
    let styleEl = doc.getElementById('yunong-theme-override')
    if (!styleEl) {
      styleEl = doc.createElement('style')
      styleEl.id = 'yunong-theme-override'
      doc.head.appendChild(styleEl)
    }

    // 探测当前父窗口的系统背景以及各个参数
    const isDark = document.documentElement.classList.contains('dark')
    const computed = getComputedStyle(document.documentElement)
    const primary500 = computed.getPropertyValue('--color-primary-500').trim() || '34 197 94'
    const glassBg = computed.getPropertyValue('--glass-bg').trim()
    const textColor = computed.getPropertyValue('--text-main').trim()

    // 强行把原 HTML 中的硬编码 'bg-green-500/10' 等改写
    // 也屏蔽 iframe 原本带的背景，彻底透明融入父组件
    styleEl.innerHTML = `
      /* =========== 隐藏内部自带的各类侧边栏与头部 =========== */
      /* 根据原版工具类的特征，这里隐藏掉原文件里自带的导航结构，因为外层已经有导航了 */
      aside { display: none !important; }
      body { padding: 0 !important; margin: 0 !important; }
      .p-4 { padding: 1.5rem !important; } /* 主容器重新调整边距 */

      /* =========== 基础透视覆写 =========== */
      body, html { 
        background: transparent !important; 
        color: ${textColor} !important;
      }
      
      /* =========== 卡片与区块样式剥离 =========== */
      .bg-white, .bg-gray-50, .bg-gray-100 { 
        background-color: ${isDark ? 'rgba(0,0,0,0.2)' : glassBg || 'rgba(255,255,255,0.4)'} !important; 
        backdrop-filter: blur(12px) !important;
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important;
        box-shadow: none !important;
      }
      
      .dark .bg-gray-800 { background-color: rgba(255,255,255,0.05) !important; }
      .dark .bg-gray-900 { background-color: transparent !important; }
      .text-gray-600 { color: var(--text-muted, #94a3b8) !important; }
      .text-gray-800 { color: ${textColor} !important; }
      
      /* 原本的 Farm / 绿色劫持为系统原色 */
      .text-green-600, .text-green-500, .text-farm-500 { color: rgb(${primary500}) !important; }
      .bg-green-500, .bg-green-600, .bg-farm-500 { background-color: rgb(${primary500}) !important; }
      .bg-green-50, .bg-farm-50 { background-color: rgba(${primary500}, 0.1) !important; }
      .bg-green-100, .bg-farm-100 { background-color: rgba(${primary500}, 0.15) !important; }
      .border-green-200, .border-green-300, .border-farm-200 { border-color: rgba(${primary500}, 0.3) !important; }
      
      /* 强行改变表单元素颜色 */
      input, select, textarea {
        background: ${isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)'} !important;
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} !important;
        color: inherit !important;
      }
      
      input:active, input:focus, select:active, select:focus {
        border-color: rgb(${primary500}) !important;
        outline: none !important;
        box-shadow: 0 0 0 2px rgba(${primary500}, 0.2) !important;
      }

      /* 表格边框剥离 */
      table, th, td { border-color: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important; }
      th { background-color: ${isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)'} !important; }
      tr:hover td { background-color: rgba(${primary500}, 0.05) !important; }
      
      /* Modal 弹窗背景劫持 */
      .fixed.inset-0.bg-black\\/50 {
         backdrop-filter: blur(8px) !important;
         background-color: rgba(0,0,0,0.3) !important;
      }
    `
    // 强制同步深色类
    if (isDark) {
      doc.documentElement.classList.add('dark')
    } else {
      doc.documentElement.classList.remove('dark')
    }
  } catch (e) {
    console.warn('Iframe 样式劫持失败:', e)
  }
}

function onIframeLoad() {
  syncThemeToIframe()
}

// 监听 html class 属性变化 (主题切换)
let observer: MutationObserver | null = null
onMounted(() => {
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        syncThemeToIframe()
      }
    })
  })
  observer.observe(document.documentElement, { attributes: true })
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
  }
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden p-0 lg:p-4 sm:p-2">
    <div class="mx-auto h-full max-w-[1600px] w-full flex gap-4">
      <!-- 左侧分类导航 (复刻帮助中心) -->
      <aside class="glass-panel h-full w-64 flex shrink-0 flex-col rounded-2xl p-4 shadow-sm transition-all hidden md:flex">
        <h2 class="mb-6 from-blue-600 to-indigo-600 bg-gradient-to-r bg-clip-text px-2 text-xl text-transparent font-bold tracking-wide dark:from-cyan-400 dark:to-blue-500">
          农场百科工具
        </h2>

        <nav class="flex-1 overflow-y-auto pr-1 space-y-2">
          <div
            v-for="(category, index) in categories"
            :key="category.name"
            class="space-y-1"
          >
            <button
              class="group w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors"
              :class="[
                category.expanded
                  ? 'bg-primary-500/10 border border-primary-500/20 dark:bg-white/[0.08] dark:border-white/10 text-primary-700 dark:text-primary-300 font-bold shadow-[0_0_15px_rgba(var(--color-primary-500),0.1)]'
                  : 'glass-text-main dark:text-gray-300 hover:text-gray-900 border border-transparent dark:hover:text-gray-100 dark:hover:bg-white/5 font-medium',
              ]"
              @click="toggleCategory(index)"
            >
              <div class="flex items-center gap-3">
                <div class="i-carbon-tool-box" :class="[category.expanded ? 'text-primary-600 dark:text-primary-400' : 'glass-text-muted group-hover:scale-110 transition-transform']" />
                <span>{{ category.name }}</span>
              </div>
              <div
                class="i-carbon-chevron-down transition-transform duration-300"
                :class="{ 'rotate-180': category.expanded, 'opacity-50': !category.expanded }"
              />
            </button>

            <transition
              enter-active-class="transition-all duration-300 ease-out overflow-hidden"
              enter-from-class="opacity-0 max-h-0 -translate-y-2"
              enter-to-class="opacity-100 max-h-96 translate-y-0"
              leave-active-class="transition-all duration-200 ease-in overflow-hidden"
              leave-from-class="opacity-100 max-h-96 translate-y-0"
              leave-to-class="opacity-0 max-h-0 -translate-y-2"
            >
              <div v-if="category.expanded" class="mt-1 pl-4 space-y-1">
                <button
                  v-for="item in category.items"
                  :key="item.id"
                  class="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all"
                  :class="[
                    selectedArticle === item.id
                      ? 'bg-primary-500/10 text-primary-700 font-bold dark:bg-white/[0.08] dark:text-primary-300 shadow-sm'
                      : 'glass-text-muted hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200',
                  ]"
                  @click="selectArticle(item.id)"
                >
                  <div :class="item.icon" class="opacity-80" />
                  <span class="truncate">{{ item.title }}</span>
                </button>
              </div>
            </transition>
          </div>
        </nav>
      </aside>

      <!-- 右侧自适应无边界容器 -->
      <main class="glass-panel h-full min-w-0 flex flex-1 flex-col rounded-2xl overflow-hidden p-0 m-0">
        <iframe 
          ref="iframeRef"
          :src="'/nc_api_version/' + selectedArticle" 
          class="w-full h-full border-none outline-none flex-1 bg-transparent"
          @load="onIframeLoad"
        ></iframe>
      </main>
    </div>
  </div>
</template>

<style scoped>
.glass-panel {
  box-shadow:
    0 8px 32px 0 rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.dark .glass-panel {
  box-shadow:
    0 8px 32px 0 rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

/* iframe 内部背景透明，以便透出 Vue 系统的真实玻璃背景 */
iframe {
  color-scheme: light dark;
}
</style>
