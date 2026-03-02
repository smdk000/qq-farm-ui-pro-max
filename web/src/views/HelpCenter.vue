<script setup lang="ts">
import { ref } from 'vue'
import { developmentProgress, helpArticles, helpCategories } from '@/data/help-articles'

// 从数据文件加载分类
const categories = ref(helpCategories.map(cat => ({
  ...cat,
  expanded: cat.name === '新手入门', // 默认展开第一个
  items: helpArticles
    .filter(article => article.category === cat.name && article.reviewStatus === 'published')
    .map(article => ({
      id: article.id,
      title: article.title,
      icon: article.icon,
    })),
})))

// 当前选中
const selectedArticle = ref('quick-start')
const searchQuery = ref('')
const searchResults = ref<typeof helpArticles>([])
const isSearching = ref(false)

// 搜索功能
function handleSearch() {
  if (!searchQuery.value.trim()) {
    isSearching.value = false
    searchResults.value = []
    return
  }

  isSearching.value = true
  const query = searchQuery.value.toLowerCase()

  searchResults.value = helpArticles.filter((article) => {
    // 搜索标题
    if (article.title.toLowerCase().includes(query))
      return true
    // 搜索标签
    if (article.tags.some(tag => tag.toLowerCase().includes(query)))
      return true
    // 搜索分类
    if (article.category.toLowerCase().includes(query))
      return true

    return false
  }).slice(0, 10) // 限制结果数量
}

function clearSearch() {
  searchQuery.value = ''
  isSearching.value = false
  searchResults.value = []
}

// 切换分类展开/收起
function toggleCategory(index: number) {
  categories.value.forEach((cat, i) => {
    if (i === index) {
      cat.expanded = !cat.expanded
    }
    else {
      cat.expanded = false
    }
  })
}

// 选择文章
function selectArticle(articleId: string) {
  selectedArticle.value = articleId
  clearSearch()
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// 获取当前文章
function getCurrentArticle() {
  return helpArticles.find(article => article.id === selectedArticle.value)
}

// 获取文章标题
function getArticleTitle() {
  const article = getCurrentArticle()
  return article ? article.title : '帮助中心'
}

// 获取开发进度
const progress = developmentProgress
</script>

<template>
  <div class="glass-text-main h-full flex flex-col overflow-hidden p-4 lg:p-8 sm:p-6">
    <div class="mx-auto h-full max-w-7xl w-full flex gap-6">
      <!-- 左侧分类导航 -->
      <aside class="spring-interactive glass-panel h-full w-64 flex shrink-0 flex-col rounded-2xl p-4 shadow-sm transition-all">
        <h2 class="mb-6 from-blue-600 to-indigo-600 bg-gradient-to-r bg-clip-text px-2 text-xl text-transparent font-bold tracking-wide dark:from-cyan-400 dark:to-blue-500">
          御农 Help
        </h2>

        <nav class="flex-1 overflow-y-auto pr-1 space-y-2">
          <div
            v-for="(category, index) in categories"
            :key="category.name"
            class="space-y-1"
          >
            <button
              class="spring-interactive group w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors"
              :class="[
                category.expanded
                  ? 'bg-primary-500/10 border border-primary-500/20 dark:bg-white/[0.08] dark:border-white/10 text-primary-700 dark:text-primary-300 font-bold shadow-[0_0_15px_rgba(var(--color-primary-500),0.1)]'
                  : 'glass-text-main dark:text-gray-300 hover:text-gray-900 border border-transparent dark:hover:text-gray-100 dark:hover:bg-white/5 font-medium',
              ]"
              @click="toggleCategory(index)"
            >
              <div class="flex items-center gap-3">
                <div :class="[category.icon, category.expanded ? 'text-primary-600 dark:text-primary-400' : 'glass-text-muted group-hover:scale-110 transition-transform']" />
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
                  class="spring-interactive w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-all"
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

        <!-- 开发进度信息 -->
        <div class="glass-panel mt-4 rounded-xl p-4 shadow-sm">
          <div class="glass-text-main mb-3 flex items-center gap-2 text-xs font-bold dark:text-gray-300">
            <div class="i-carbon-progress text-primary-600 dark:text-primary-400" />
            <span>核心库补完计划</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
            <div
              class="h-full from-primary-500 to-primary-600 bg-gradient-to-r transition-all duration-1000 ease-out"
              :style="{ width: `${(progress.completedArticles / progress.totalArticles) * 100}%` }"
            />
          </div>
          <div class="glass-text-muted mt-2 text-right text-[10px] font-bold tracking-wider font-mono">
            {{ progress.completedArticles }} / {{ progress.totalArticles }} DOCS
          </div>
        </div>
      </aside>

      <!-- 右侧主内容区 -->
      <main class="h-full min-w-0 flex flex-1 flex-col gap-6">
        <div class="relative min-h-0 flex flex-1 flex-col">
          <!-- 创作者与搜索卡片 (固定在顶部) -->
          <div class="glass-panel group sticky top-0 z-20 mb-6 flex shrink-0 flex-col justify-between gap-4 overflow-hidden rounded-3xl p-4 shadow-sm sm:flex-row sm:items-center lg:p-5">
            <!-- 底部氛围光 -->
            <div class="pointer-events-none absolute h-64 w-64 rounded-full bg-primary-500/5 blur-[40px] transition-all duration-700 -bottom-10 -right-10 group-hover:bg-primary-500/10" />

            <!-- 左侧作者信息 -->
            <div class="relative z-10 flex items-center gap-4">
              <div class="spring-interactive relative h-12 w-12 rounded-full from-blue-500 to-indigo-600 bg-gradient-to-tr p-[2px] shadow-md transition-all duration-500 dark:from-cyan-400 dark:to-blue-500 group-hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                <div class="h-full w-full flex items-center justify-center border border-white/20 rounded-full bg-black/5 dark:border-white/10 dark:bg-black/40">
                  <div class="i-carbon-code text-xl text-primary-700 dark:text-primary-400" />
                </div>
              </div>
              <div>
                <div class="mb-0.5 flex items-center gap-2">
                  <h3 class="glass-text-main text-base font-extrabold tracking-wide">
                    官方核心创作者
                  </h3>
                  <span class="flex items-center gap-0.5 border border-primary-300 rounded-full bg-primary-100 px-2 py-0.5 text-[9px] text-primary-800 font-bold tracking-wider uppercase dark:border-primary-500/30 dark:bg-primary-500/20 dark:text-primary-300">
                    <div class="i-carbon-checkmark-filled text-[10px]" /> VERIFIED
                  </span>
                </div>
                <p class="glass-text-muted text-xs font-medium dark:text-slate-300">
                  系统架构与底座开发：<span class="glass-text-main font-bold">smdk000</span>
                </p>
              </div>
            </div>

            <!-- 右侧搜索与联系方式 -->
            <div class="relative z-10 w-full flex items-center gap-3 sm:w-auto">
              <!-- 搜索框 -->
              <div class="spring-interactive flex flex-1 cursor-text items-center border border-gray-200/50 rounded-xl bg-black/5 p-2.5 shadow-inner backdrop-blur-md transition-all sm:w-64 dark:border-white/5 group-hover:border-primary-400/50 dark:bg-black/30 dark:hover:border-white/10">
                <span class="glass-text-muted i-carbon-search ml-2 mr-2 text-lg transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-400" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="搜索所有文档..."
                  class="glass-text-main w-full border-none bg-transparent text-sm font-medium outline-none placeholder-gray-500 dark:placeholder-gray-500"
                  @keyup.enter="handleSearch"
                >
                <button v-show="searchQuery" class="glass-text-muted mx-1 rounded-full p-1 transition-colors hover:bg-black/5 dark:text-gray-400 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white" @click="clearSearch">
                  <div class="i-carbon-close text-sm" />
                </button>
              </div>

              <!-- QQ群按钮 -->
              <a href="tencent://message/?uin=227916149&Site=&Menu=yes" class="spring-interactive glass-panel glass-text-main flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition-all hover:shadow-md">
                <div class="i-carbon-chat text-lg text-primary-600 dark:text-primary-400" />
                <span class="hidden sm:inline">支持Q群</span>
              </a>
            </div>
          </div>

          <!-- 文档内容卡片 -->
          <div class="glass-panel relative flex-1 overflow-y-auto overscroll-contain scroll-smooth rounded-3xl p-8 shadow-sm">
            <div class="pointer-events-none absolute right-0 top-0 h-32 w-full from-white/30 to-transparent bg-gradient-to-b dark:from-white/[0.02]" />

            <!-- 搜索结果视图 -->
            <div v-if="isSearching" class="relative z-10">
              <h2 class="glass-text-main mb-6 flex items-center gap-3 text-2xl font-extrabold">
                <div class="i-carbon-search text-primary-600 dark:text-primary-400" />
                搜索 "{{ searchQuery }}"
              </h2>
              <div v-if="searchResults.length > 0" class="space-y-3">
                <button
                  v-for="result in searchResults"
                  :key="result.id"
                  class="spring-interactive group w-full flex items-start gap-4 glass-panel rounded-xl p-4 text-left shadow-sm transition-all hover:shadow-md"
                  @click="selectArticle(result.id)"
                >
                  <div class="h-10 w-10 flex shrink-0 items-center justify-center border border-gray-200/50 rounded-lg bg-black/5 text-primary-600 shadow-sm dark:border-white/5 dark:bg-black/30 dark:text-primary-400 group-hover:shadow-md">
                    <div :class="result.icon" class="text-xl" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="glass-text-main mb-1 text-base font-bold transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
                      {{ result.title }}
                    </h3>
                    <div class="flex items-center gap-2">
                      <span class="glass-text-main rounded bg-black/5 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase dark:bg-white/10">{{ result.category }}</span>
                    </div>
                  </div>
                </button>
              </div>
              <div v-else class="py-20 text-center">
                <div class="i-carbon-search-locating dark:glass-text-muted mx-auto mb-4 text-6xl text-gray-300" />
                <p class="glass-text-main text-lg font-bold dark:text-gray-300">
                  未找到相关内容
                </p>
                <p class="glass-text-muted mt-2 text-sm font-medium">
                  尝试使用更短的关键词，或者浏览左侧的分类目录
                </p>
              </div>
            </div>

            <!-- 正常文章视图 -->
            <div v-else class="relative z-10 max-w-3xl">
              <h2 class="glass-text-main mb-8 flex items-center gap-3 text-3xl font-black tracking-tight">
                <div class="i-carbon-document text-primary-600 dark:text-primary-400" />
                {{ getArticleTitle() }}
              </h2>

              <div class="article-markdown-body glass-text-main font-medium leading-relaxed space-y-4">
                <div v-html="getCurrentArticle()?.content || '<div class=\'text-center py-10 opacity-50\'>内容加载中...</div>'" />
              </div>

              <!-- Meta Footer -->
              <div class="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-6 dark:border-white/10/50">
                <div class="glass-text-muted flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
                  <div class="flex items-center gap-2">
                    <div class="i-carbon-calendar" />
                    <span>更新于：{{ getCurrentArticle()?.updatedAt }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="i-carbon-tag" />
                    <span>版本：{{ getCurrentArticle()?.version }}</span>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <span class="glass-text-muted text-sm font-bold">文档有帮助吗？</span>
                  <div class="flex gap-2">
                    <button class="spring-interactive glass-text-muted h-9 w-9 flex items-center justify-center border border-transparent rounded-full bg-black/5 shadow-sm transition-all hover:border-primary-300 dark:bg-white/[0.06] hover:bg-primary-100 hover:text-primary-700 dark:hover:border-primary-700/50 dark:hover:bg-primary-900/40 dark:hover:text-primary-400">
                      <div class="i-carbon-thumbs-up" />
                    </button>
                    <button class="spring-interactive glass-text-muted h-9 w-9 flex items-center justify-center border border-transparent rounded-full bg-black/5 shadow-sm transition-all hover:border-red-300 dark:bg-white/[0.06] hover:bg-red-100 hover:text-red-700 dark:hover:border-red-700/50 dark:hover:bg-red-900/40 dark:hover:text-red-400">
                      <div class="i-carbon-thumbs-down" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* 赋予元素顶级弹簧物理的阻尼感 */
.spring-interactive {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.spring-interactive:active {
  transform: scale(0.95);
  transition: all 0.1s ease-out; /* 按下时快速收缩 */
}

/* 深邃层次感玻璃底板 - 仅增强 box-shadow，backdrop-filter 由全局 style.css 统一管控 */
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

/* --------------- 动态内容内部样式调整 --------------- */
:deep(.article-markdown-body) {
  font-size: 0.95rem;
  color: var(--text-main, #1f2937);
}
.dark :deep(.article-markdown-body) {
  color: var(--text-main, #e5e7eb);
}

:deep(.article-markdown-body h3) {
  font-size: 1.25rem;
  font-weight: 800;
  margin-bottom: 0.75rem;
  color: var(--text-main, #111827);
}
.dark :deep(.article-markdown-body h3) {
  color: var(--text-main, #ffffff);
}

:deep(.article-markdown-body h4) {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--text-main, #374151);
}
.dark :deep(.article-markdown-body h4) {
  color: var(--text-main, #f3f4f6);
}

:deep(.article-markdown-body p) {
  font-weight: 500;
}

:deep(.article-markdown-body ul),
:deep(.article-markdown-body ol) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

:deep(.article-markdown-body pre) {
  background: rgba(0, 0, 0, 0.05);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-family: monospace;
  font-size: 0.85rem;
  margin-top: 0.5rem;
  color: #111827;
  font-weight: 600;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.dark :deep(.article-markdown-body pre) {
  background: rgba(0, 0, 0, 0.4);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* 统一拟态卡片样式 */
:deep(.info-card),
:deep(.step-card),
:deep(.tip-card),
:deep(.feature-card),
:deep(.practice-card),
:deep(.strategy-card),
:deep(.mode-card),
:deep(.tip-section),
:deep(.interaction-card),
:deep(.task-type),
:deep(.gift-list),
:deep(.solution-card),
:deep(.checklist),
:deep(.config-template),
:deep(.faq-item) {
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid var(--glass-border, rgba(0, 0, 0, 0.05));
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.05),
    0 2px 4px -2px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  color: var(--text-main, #1f2937);
  backdrop-filter: blur(10px);
}

.dark :deep(.info-card),
.dark :deep(.step-card),
.dark :deep(.tip-card),
.dark :deep(.feature-card),
.dark :deep(.practice-card),
.dark :deep(.strategy-card),
.dark :deep(.mode-card),
.dark :deep(.tip-section),
.dark :deep(.interaction-card),
.dark :deep(.task-type),
.dark :deep(.gift-list),
.dark :deep(.solution-card),
.dark :deep(.checklist),
.dark :deep(.config-template),
.dark :deep(.faq-item) {
  background: rgba(255, 255, 255, 0.03);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}

/* 特殊卡片增强 */
:deep(.tip-success) {
  border-left: 4px solid #22c55e !important;
}
:deep(.tip-warning) {
  border-left: 4px solid #eab308 !important;
}
:deep(.tip-info) {
  border-left: 4px solid #3b82f6 !important;
}
:deep(.tip-error) {
  border-left: 4px solid #ef4444 !important;
}

:deep(.tip-success) .tip-icon {
  color: #16a34a;
}
.dark :deep(.tip-success) .tip-icon {
  color: #4ade80;
}

:deep(.tip-warning) .tip-icon {
  color: #ca8a04;
}
.dark :deep(.tip-warning) .tip-icon {
  color: #facc15;
}

:deep(.tip-info) .tip-icon {
  color: #2563eb;
}
.dark :deep(.tip-info) .tip-icon {
  color: #60a5fa;
}

:deep(.feature-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

:deep(.step-number) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgb(var(--color-primary-500));
  color: white;
  border-radius: 50%;
  font-size: 0.9rem;
  font-weight: 800;
  margin-right: 12px;
  margin-bottom: 12px;
  box-shadow: 0 2px 4px rgba(var(--color-primary-500), 0.3);
}

.dark :deep(.step-number) {
  background: rgb(var(--color-primary-400));
  box-shadow: 0 2px 4px rgba(var(--color-primary-400), 0.3);
}

:deep(.tip-header) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 8px;
}
</style>
