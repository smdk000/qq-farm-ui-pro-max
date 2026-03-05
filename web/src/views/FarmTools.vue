<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const menuItems = ref([
  { id: 'calculator.html', title: '经验时间计算', icon: 'i-carbon-calculator' },
  { id: 'levels.html', title: '等级氪金模拟', icon: 'i-carbon-chart-evaluation' },
  { id: 'plants.html', title: '作物图鉴查询', icon: 'i-carbon-catalog' },
  { id: 'lands.html', title: '土地升级属性', icon: 'i-carbon-map' },
])

const selectedArticle = ref('calculator.html')
const iframeRef = ref<HTMLIFrameElement | null>(null)

function selectArticle(articleId: string) {
  selectedArticle.value = articleId
}

// 🔧 优化 #1：将绝大部分不依赖 isDark 的静态系统样式提取出来
const BASE_STATIC_CSS = `
  html, body { 
    background: transparent !important; 
    color: var(--text-main) !important;
  }
  
  /* 隐藏原本自带的内部侧边栏与顶部栏，使其作为纯粹的组件嵌入 */
  aside, header, #sidebar-backdrop { display: none !important; }
  
  .home-container, main {
    background: transparent !important;
  }
  
  /* =========== 卡片与全局玻璃质感同步 =========== */
  .bg-white, [class*="dark:bg-slate-800"] { 
    background-color: var(--glass-bg) !important; 
    backdrop-filter: blur(12px) !important;
    border-color: var(--glass-border) !important;
  }
  
  /* =========== 渐变背景统一 =========== */
  /* 所有 Hero 区域渐变（保留渐变但用系统色） */
  .bg-gradient-to-br.from-primary-700,
  .bg-gradient-to-br[class*="from-primary-700"] {
    background-image: linear-gradient(135deg, rgba(var(--color-primary-700), 0.85), rgba(var(--color-primary-500), 0.7)) !important;
    --tw-gradient-from: transparent !important;
    --tw-gradient-to: transparent !important;
  }
  
  /* =========== 搜索/筛选栏背景 =========== */
  .backdrop-blur {
    background-color: transparent !important;
  }
  
  /* =========== 原色劫持兜底 =========== */
  .text-green-600, .text-green-500, .text-farm-500 { color: rgb(var(--color-primary-500)) !important; }
  .bg-green-500, .bg-green-600, .bg-farm-500 { background-color: rgb(var(--color-primary-500)) !important; }
  
  /* =========== 表单元素 =========== */
  input:active, input:focus, select:active, select:focus {
    border-color: rgb(var(--color-primary-500)) !important;
    outline: none !important;
    box-shadow: 0 0 0 2px rgba(var(--color-primary-500), 0.2) !important;
  }

  /* =========== 表格 =========== */
  table, th, td { border-color: var(--glass-border) !important; }
  tr:hover td { background-color: rgba(var(--color-primary-500), 0.05) !important; }
  
  /* =========== Modal 弹窗 =========== */
  .fixed.inset-0[class*="bg-black"] {
     backdrop-filter: blur(8px) !important;
     background-color: rgba(0,0,0,0.4) !important;
  }

  /* =========== 搜索框暗色适配 =========== */
  .border-slate-200 { border-color: var(--glass-border) !important; }
  [class*="dark:border-slate-700"] { border-color: var(--glass-border) !important; }

  /* =========== 隐藏 shadow-inner（土地图片区残留阴影） =========== */
  .shadow-inner { box-shadow: none !important; }

  /* =========== 土地卡片 bg-transparent 确保生效 =========== */
  .land-card, .plant-card {
    background-color: var(--glass-bg) !important;
    backdrop-filter: blur(12px) !important;
  }
  
  /* =========== 🏷️ 徽章 (bonus-tag) 底色 + 文字色柔化 =========== */
  .bonus-tag { backdrop-filter: blur(6px) !important; }
  
  /* =========== 🔗 特殊土地卡片底部信息区文字 =========== */
  .land-card .text-slate-700 { color: var(--text-main) !important; }

  /* =========== 文本颜色继承系统主题 =========== */
  .text-slate-800, [class*="dark:text-slate-200"] { color: var(--text-main) !important; }
  .text-slate-600, .text-slate-500, .text-slate-400,
  [class*="dark:text-slate-400"], [class*="dark:text-slate-500"],
  [class*="dark:text-slate-300"] { color: var(--text-muted) !important; }
  .text-slate-700, [class*="dark:text-slate-300"] { color: var(--text-main) !important; }
  
  /* =========== 🔘 按钮/交互组件 深浅色适配 =========== */
  /* 主按钮（开始计算等）—— 确保白字在任何主题色上可读 */
  .btn-calc {
    color: #fff !important;
    box-shadow: 0 2px 8px rgba(var(--color-primary-500), 0.35) !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  .btn-calc:hover { box-shadow: 0 4px 16px rgba(var(--color-primary-500), 0.45) !important; }
  
  /* 验算按钮 —— 跟随主题色渐变 */
  .btn-verify {
    background: linear-gradient(135deg, rgb(var(--color-primary-400)), rgb(var(--color-primary-600))) !important;
    color: #fff !important;
    box-shadow: 0 2px 8px rgba(var(--color-primary-500), 0.3) !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  
  /* 排行切换 active / 验算植物 Tab active */
  .rank-tab.active,
  .v-crop-tab.v-active {
    background: rgb(var(--color-primary-500)) !important;
    color: #fff !important;
    border-color: rgb(var(--color-primary-500)) !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }
  
  /* 计算器模式切换 Tab active */
  .calc-mode-tab.active {
    background: rgb(var(--color-primary-500)) !important;
    color: #fff !important;
    text-shadow: 0 1px 2px rgba(0,0,0,0.1);
    box-shadow: 0 2px 8px rgba(var(--color-primary-500), 0.25) !important;
  }
  .calc-mode-tab:hover:not(.active) {
    color: rgb(var(--color-primary-600)) !important;
    background: rgba(var(--color-primary-500), 0.08) !important;
  }
  
  /* 开关 Toggle */
  .fert-toggle input[type="checkbox"]:checked { background: rgb(var(--color-primary-500)) !important; }
  .fert-toggle input[type="checkbox"]::after { background: #fff !important; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
  
  /* 施肥阶段选择按钮 selected */
  .tc-fert-phase-btn.selected {
    border-color: rgb(var(--color-primary-500)) !important;
    background: rgba(var(--color-primary-500), 0.15) !important;
  }
  
  /* Spinner 加载圈白色可见 */
  .spinner { border-color: rgba(255,255,255,0.3) !important; border-top-color: #fff !important; }
`;

// 🔧 优化 #2：持有一个 iframeObserver 引用用于在组件销毁时断开
let iframeObserver: MutationObserver | null = null;

// 主题劫持逻辑：在同源策略下，直接注入 CSS 和监控
function syncThemeToIframe() {
  if (!iframeRef.value?.contentDocument) return
  
  try {
    const doc = iframeRef.value.contentDocument
    if (!doc) return
    
    // 如果已经注入过了就不再重复注入 `<style id="yunong-theme-override">`
    let styleEl = doc.getElementById('yunong-theme-override')
    if (!styleEl) {
      styleEl = doc.createElement('style')
      styleEl.id = 'yunong-theme-override'
      doc.head.appendChild(styleEl)
      
      // 🔥 MutationObserver：监听 iframe <head> 变化
      // 当 Tailwind CDN 异步插入 <style> 标签时，自动将我们的 override style 移到最后
      if (iframeObserver) iframeObserver.disconnect()
      iframeObserver = new MutationObserver(() => {
        const lastChild = doc.head.lastElementChild
        if (lastChild && lastChild.id !== 'yunong-theme-override' && styleEl) {
          doc.head.appendChild(styleEl) // 移到最后
        }
      })
      iframeObserver.observe(doc.head, { childList: true })
    } else {
      // 每次同步时确保 style 标签在 <head> 最后（覆盖后注入的 Tailwind 样式）
      doc.head.appendChild(styleEl)
    }

    // 探测当前父窗口的系统背景以及各个参数
    const isDark = document.documentElement.classList.contains('dark')
    const computed = getComputedStyle(document.documentElement)
    
    let cssVars = ''
    const varsToSync = [
      '--color-primary-50', '--color-primary-100', '--color-primary-200',
      '--color-primary-300', '--color-primary-400', '--color-primary-500',
      '--color-primary-600', '--color-primary-700', '--color-primary-800',
      '--color-primary-900', '--color-primary-950', 
      '--glass-bg', '--glass-border', '--text-main', '--text-muted'
    ]
    
    varsToSync.forEach(v => {
      const val = computed.getPropertyValue(v).trim()
      if (val) {
        cssVars += `${v}: ${val};\n`
      } else {
        // 🔧 容错处理：确保取到的值不是空
        if (v === '--glass-bg') {
          cssVars += `${v}: ${isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'};\n`
        } else if (v === '--glass-border') {
          cssVars += `${v}: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'};\n`
        } else if (v === '--text-main') {
          cssVars += `${v}: ${isDark ? '#e2e8f0' : '#334155'};\n`
        } else if (v === '--text-muted') {
          cssVars += `${v}: ${isDark ? '#94a3b8' : '#64748b'};\n`
        } else if (v.startsWith('--color-primary-')) {
          // 兜底一个蓝色的 primary 色系，防止空值
          const fallbackColors = {
            '--color-primary-50': '239 246 255',
            '--color-primary-100': '219 234 254',
            '--color-primary-200': '191 219 254',
            '--color-primary-300': '147 197 253',
            '--color-primary-400': '96 165 250',
            '--color-primary-500': '59 130 246',
            '--color-primary-600': '37 99 235',
            '--color-primary-700': '29 78 216',
            '--color-primary-800': '30 64 175',
            '--color-primary-900': '30 58 138',
            '--color-primary-950': '23 37 84'
          };
          cssVars += `${v}: ${fallbackColors[v as keyof typeof fallbackColors]};\n`
        }
      }
    })

    // 通用半透明背景色 —— 根据主题深浅自动切换
    const subtleBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
    const stripeBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'

    // 🔧 只拼接真正受 isDark 影响的动态属性
    styleEl.innerHTML = `
      :root { ${cssVars} }
      ${BASE_STATIC_CSS}
      
      .bg-white\\/60, [class*="dark:bg-slate-800\\/60"] { 
        background-color: ${isDark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.6)'} !important; 
      }
      
      /* 土地卡片图片区 & 特殊土地状态区域的各种浅色渐变 → 彻底清除渐变 */
      .bg-gradient-to-br[class*="from-red-50"], .bg-gradient-to-br[class*="from-orange-50"],
      .bg-gradient-to-br[class*="from-slate-100"], .bg-gradient-to-br[class*="from-stone-100"],
      .bg-gradient-to-br[class*="from-stone-50"], .bg-gradient-to-br[class*="from-yellow-50"],
      .bg-gradient-to-br[class*="from-gray-50"] {
        background-image: none !important;
        background-color: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'} !important;
        --tw-gradient-from: transparent !important; --tw-gradient-to: transparent !important;
      }

      /* 植物卡片种子缩略图区域 & 网格格子 */
      .bg-gradient-to-br.from-primary-50, .bg-gradient-to-br[class*="from-primary-50"] {
        background-image: none !important;
        background-color: ${isDark ? 'rgba(var(--color-primary-500), 0.08)' : 'rgba(var(--color-primary-500), 0.06)'} !important;
        --tw-gradient-from: transparent !important; --tw-gradient-to: transparent !important;
      }

      /* 网格格子 */
      .grid-cell.bg-gradient-to-br, .grid-cell[class*="from-primary-50"] {
        background-image: none !important;
        background-color: ${isDark ? 'rgba(var(--color-primary-500), 0.1)' : 'rgba(var(--color-primary-500), 0.08)'} !important;
      }
      
      /* 兜底：所有未被上面匹配的渐变容器，如果包含浅色 from-* 类名 */
      [class*="from-"][class*="-50"], [class*="from-"][class*="-100"]:not([class*="from-primary-700"]) {
        background-image: none !important; background-color: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'} !important;
      }
      /* 🔥 暴力全局覆盖：高特异性复合选择器，确保所有浅色渐变被清除 */
      .bg-gradient-to-br[class*="-50"], .bg-gradient-to-br[class*="-100"]:not([class*="from-primary-700"]),
      .bg-gradient-to-r[class*="-50"], .bg-gradient-to-r[class*="-100"]:not([class*="from-primary-700"]) {
        --tw-gradient-from: transparent !important; --tw-gradient-to: transparent !important; --tw-gradient-stops: transparent !important;
        background-image: none !important; background-color: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'} !important;
      }
      
      /* =========== 属性行的浅色背景条 =========== */
      .bg-primary-50, [class*="bg-primary-50"] { background-color: ${isDark ? 'rgba(var(--color-primary-500), 0.08)' : 'rgba(var(--color-primary-500), 0.06)'} !important; }
      .bg-blue-50, [class*="bg-blue-50"] { background-color: ${isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.06)'} !important; }
      .bg-purple-50, [class*="bg-purple-50"] { background-color: ${isDark ? 'rgba(168, 85, 247, 0.08)' : 'rgba(168, 85, 247, 0.06)'} !important; }
      .bg-red-50, [class*="bg-red-50"] { background-color: ${isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.06)'} !important; }
      .bg-green-50, [class*="bg-green-50"] { background-color: ${isDark ? 'rgba(34, 197, 94, 0.08)' : 'rgba(34, 197, 94, 0.06)'} !important; }
      .bg-yellow-50, [class*="bg-yellow-50"] { background-color: ${isDark ? 'rgba(234, 179, 8, 0.08)' : 'rgba(234, 179, 8, 0.06)'} !important; }
      .bg-stone-50, .bg-stone-100, [class*="bg-stone-50"], [class*="bg-stone-100"] { background-color: ${subtleBg} !important; }
      
      /* =========== 徽章底色统一 =========== */
      .bg-primary-100, [class*="bg-primary-100"] { background-color: ${isDark ? 'rgba(var(--color-primary-500), 0.15)' : 'rgba(var(--color-primary-500), 0.12)'} !important; }
      .bg-red-100 { background-color: ${isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'} !important; }
      .bg-yellow-100 { background-color: ${isDark ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.1)'} !important; }
      .bg-slate-200 { background-color: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'} !important; }
      .bg-amber-400 { background-color: rgba(var(--color-primary-500), 0.9) !important; }
      
      /* =========== 表单元素动态背景 =========== */
      input, select, textarea {
        background: ${isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)'} !important;
        border: 1px solid var(--glass-border) !important; color: inherit !important;
      }
      
      /* =========== 表格条纹色 =========== */
      th { background-color: ${stripeBg} !important; color: var(--text-main) !important; }

      /* =========== 🎨 卡片边框色统一软化 =========== */
      .land-card, .plant-card { border-color: ${isDark ? 'rgba(255,255,255,0.12)' : 'var(--glass-border)'} !important; }
      /* 特定颜色边框降噪 */
      .border-primary-200, .border-primary-400, [class*="border-primary-"] { border-color: ${isDark ? 'rgba(var(--color-primary-500), 0.25)' : 'rgba(var(--color-primary-500), 0.35)'} !important; }
      .border-red-300, [class*="border-red-"] { border-color: ${isDark ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.35)'} !important; }
      .border-yellow-400, [class*="border-yellow-"] { border-color: ${isDark ? 'rgba(234, 179, 8, 0.3)' : 'rgba(234, 179, 8, 0.45)'} !important; }
      .border-green-300, [class*="border-green-"] { border-color: ${isDark ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.35)'} !important; }
      .border-slate-300, .border-slate-400, [class*="border-slate-3"], [class*="border-slate-4"] { border-color: ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'} !important; }
      
      /* =========== 🏷️ 徽章文字色柔化 =========== */
      .bonus-tag.bg-primary-100, .bonus-tag[class*="bg-primary-100"] {
        background-color: ${isDark ? 'rgba(var(--color-primary-500), 0.15)' : 'rgba(var(--color-primary-500), 0.12)'} !important;
        color: ${isDark ? 'rgb(var(--color-primary-300))' : 'rgb(var(--color-primary-700))'} !important;
      }
      .bonus-tag.bg-red-100 { background-color: ${isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'} !important; color: ${isDark ? '#fca5a5' : '#dc2626'} !important; }
      .bonus-tag.bg-yellow-100 { background-color: ${isDark ? 'rgba(234, 179, 8, 0.15)' : 'rgba(234, 179, 8, 0.1)'} !important; color: ${isDark ? '#fde047' : '#a16207'} !important; }
      .bonus-tag.bg-slate-200 { background-color: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'} !important; color: var(--text-muted) !important; }
      /* 通用 Lv 徽章（amber-400底色的那种） */
      .bg-amber-400 { background-color: ${isDark ? 'rgba(var(--color-primary-500), 0.7)' : 'rgba(var(--color-primary-500), 0.85)'} !important; }
      
      /* =========== 📊 属性值文字色降噪 =========== */
      .text-primary-600, .text-primary-700, [class*="text-primary-6"], [class*="text-primary-7"] { color: ${isDark ? 'rgb(var(--color-primary-400))' : 'rgb(var(--color-primary-600))'} !important; }
      .text-blue-600, [class*="text-blue-6"] { color: ${isDark ? '#93c5fd' : '#2563eb'} !important; }
      .text-purple-600, [class*="text-purple-6"] { color: ${isDark ? '#c4b5fd' : '#7c3aed'} !important; }
      .text-red-600, .text-red-700, [class*="text-red-6"], [class*="text-red-7"] { color: ${isDark ? '#fca5a5' : '#dc2626'} !important; }
      .text-yellow-700, [class*="text-yellow-7"] { color: ${isDark ? '#fde047' : '#a16207'} !important; }
      
      /* =========== 🔲 网格格子边框与文字 =========== */
      .grid-cell { border-color: ${isDark ? 'rgba(var(--color-primary-500), 0.2)' : 'rgba(var(--color-primary-500), 0.3)'} !important; }
      .grid-cell[class*="border-amber"], .grid-cell[class*="border-yellow"] { border-color: ${isDark ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.35)'} !important; }
      .grid-cell[class*="border-slate"], .grid-cell[class*="border-gray"] { border-color: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'} !important; }
      .grid-cell .text-primary-700 { color: ${isDark ? 'rgb(var(--color-primary-300))' : 'rgb(var(--color-primary-700))'} !important; }
      .grid-cell .text-primary-600, .grid-cell [class*="text-primary-6"] { color: ${isDark ? 'rgb(var(--color-primary-400))' : 'rgb(var(--color-primary-600))'} !important; }
      .grid-cell [class*="text-amber"], .grid-cell [class*="text-yellow"] { color: ${isDark ? '#fde047' : '#92400e'} !important; }
      .grid-cell [class*="text-slate"] { color: var(--text-muted) !important; }
      
      /* 开关 Toggle */
      .fert-toggle input[type="checkbox"] { background: ${isDark ? '#475569' : '#94a3b8'} !important; }
      
      /* 施肥阶段选择动态字色 */
      .tc-fert-phase-btn.selected { color: ${isDark ? 'rgb(var(--color-primary-300))' : 'rgb(var(--color-primary-700))'} !important; }
      .tc-fert-phase-btn:hover { border-color: ${isDark ? 'rgb(var(--color-primary-400))' : 'rgb(var(--color-primary-300))'} !important; }
      
      /* ⓘ 说明按钮 */
      .info-btn:hover { background: rgba(var(--color-primary-500), 0.1) !important; color: ${isDark ? 'rgb(var(--color-primary-300))' : 'rgb(var(--color-primary-600))'} !important; }
      .info-btn[data-info-key="smart-fert"] { color: ${isDark ? 'rgb(var(--color-primary-400))' : 'rgb(var(--color-primary-600))'} !important; }
    `

    // 强制同步深色类
    if (isDark) {
      doc.documentElement.classList.add('dark')
    } else {
      doc.documentElement.classList.remove('dark')
    }

    // 🔥 终极兜底：JavaScript DOM 遍历，强制覆盖所有浅色渐变元素的内联样式
    const forceOverrideGradients = () => {
      const lightGradientKeywords = [
        'from-red-50', 'from-orange-50', 'from-stone-100', 'from-stone-50',
        'from-yellow-50', 'from-gray-50', 'from-slate-100',
        'from-primary-50', 'to-primary-100', 'to-yellow-50', 'to-orange-50',
        'to-stone-50', 'to-gray-50'
      ]
      const heroKeywords = ['from-primary-700', 'from-primary-600']
      
      doc.querySelectorAll('.bg-gradient-to-br, [class*="from-"]').forEach((rawEl) => {
        const el = rawEl as HTMLElement
        const cls = el.className || ''
        // 跳过 Hero 区域渐变
        if (heroKeywords.some(k => cls.includes(k))) return
        // 检测是否包含浅色渐变类
        if (lightGradientKeywords.some(k => cls.includes(k))) {
          el.style.setProperty('background-image', 'none', 'important')
          el.style.setProperty('background-color', 
            isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', 'important')
        }
      })
    }
    // 🔧 优化 #3: 缩减延迟同步轮次，从 6 次减轻到 3 次
    forceOverrideGradients()
    setTimeout(forceOverrideGradients, 400)
    setTimeout(forceOverrideGradients, 1200)
  } catch (e) {
    console.warn('Iframe 样式劫持失败:', e)
  }
}

function onIframeLoad() {
  syncThemeToIframe()
  // 🔧 优化 #3: 初始重载时缩减多轮定时，仅执行一次后续兜底即可
  setTimeout(() => syncThemeToIframe(), 600)
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
  // 🔧 优化 #2: 清理 iframe 内部的 observer 控制器，避免内存泄漏
  if (iframeObserver) {
    iframeObserver.disconnect()
    iframeObserver = null
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
          <div class="space-y-2 pt-2">
            <button
              v-for="item in menuItems"
              :key="item.id"
              class="w-full flex items-center justify-between rounded-xl px-4 py-3.5 text-left transition-all"
              :class="[
                selectedArticle === item.id
                  ? 'bg-primary-500/10 border border-primary-500/20 dark:bg-white/[0.08] dark:border-white/10 text-primary-700 dark:text-primary-300 font-bold shadow-[0_0_15px_rgba(var(--color-primary-500),0.15)] scale-100'
                  : 'glass-text-main dark:text-gray-300 hover:text-gray-900 border border-transparent dark:hover:text-gray-100 dark:hover:bg-white/5 font-medium hover:bg-black/5 opacity-80 hover:opacity-100',
              ]"
              @click="selectArticle(item.id)"
            >
              <div class="flex items-center gap-3">
                <div class="text-xl" :class="[item.icon, selectedArticle === item.id ? 'text-primary-600 dark:text-primary-400' : '']" />
                <span class="tracking-wide">{{ item.title }}</span>
              </div>
              <div v-if="selectedArticle === item.id" class="h-1.5 w-1.5 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(var(--color-primary-500),0.8)]"></div>
            </button>
          </div>
        </nav>
      </aside>

      <!-- 右侧自适应无边界容器 -->
      <main class="glass-panel h-full min-w-0 flex flex-1 flex-col rounded-2xl overflow-hidden p-0 m-0">
        <iframe 
          ref="iframeRef"
          :src="'/nc_local_version/' + selectedArticle" 
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
