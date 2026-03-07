<script setup lang="ts">
import axios from 'axios'
import { BarChart, LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { adminToken } from '@/utils/auth'

const VChart = defineAsyncComponent(() => import('vue-echarts'))

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
])

const loading = ref(false)

// 经验金币走势
const trendOption = ref<any>({})

// 近期偷菜排行榜
const stealOption = ref<any>({})

async function fetchAnalytics() {
  loading.value = true
  try {
    const res = await axios.get('/api/stats/trend', {
      headers: { 'x-admin-token': adminToken.value },
    })
    if (res.data && res.data.ok) {
      const { dates, series } = res.data.data

      trendOption.value = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(20,20,20,0.8)', borderColor: '#333', textStyle: { color: '#fff' } },
        legend: { data: ['经验增长', '金币增长'], textStyle: { color: '#888' }, top: 0 },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: dates, axisLine: { lineStyle: { color: '#555' } }, axisLabel: { color: '#888' } },
        yAxis: [
          { type: 'value', name: '经验', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#888' } },
          { type: 'value', name: '金币', axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: '#888' } },
        ],
        series: [
          {
            name: '经验增长',
            type: 'line',
            smooth: true,
            itemStyle: { color: '#10b981' },
            areaStyle: { color: 'rgba(16,185,129,0.1)' },
            data: series.exp,
          },
          {
            name: '金币增长',
            type: 'bar',
            yAxisIndex: 1,
            itemStyle: { color: '#d97706', borderRadius: [4, 4, 0, 0] },
            data: series.gold,
          },
        ],
      }

      stealOption.value = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(20,20,20,0.8)', borderColor: '#333', textStyle: { color: '#fff' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#555' } }, axisLabel: { color: '#888' } },
        yAxis: { type: 'value', name: '偷取次数', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#888' } },
        series: [
          {
            name: '偷菜次数',
            type: 'line',
            step: 'start',
            itemStyle: { color: '#8b5cf6' },
            areaStyle: { color: 'rgba(139,92,246,0.1)' },
            data: series.steal,
          },
        ],
      }
    }
  }
  catch (e: any) {
    console.error('获取统计图表失败', e)
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchAnalytics()
})
</script>

<template>
  <div class="fade-in mx-auto max-w-6xl w-full p-4">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-bold">
          <div class="i-carbon-chart-multitype text-primary-400" />
          全盘数据作战大屏
        </h1>
        <p class="glass-text-muted mt-1 text-sm">
          此面板基于各节点过去 7 天的业务执行数据渲染全景产出报表。
        </p>
      </div>
    </div>

    <div v-if="loading" class="glass-panel min-h-[300px] flex flex-col items-center justify-center rounded-lg shadow-sm">
      <div class="i-svg-spinners-90-ring-with-bg mb-4 text-4xl text-primary-500" />
      <span class="glass-text-muted text-sm">正在聚合历史数据流...</span>
    </div>

    <div v-else class="grid grid-cols-1 gap-6">
      <div class="glass-panel rounded-lg p-6 shadow-sm">
        <h3 class="glass-text-muted mb-4 border-b border-gray-200/20 pb-2 text-lg font-bold dark:border-gray-700/50">
          经验与金币成长曲线
        </h3>
        <div class="h-[350px] w-full">
          <VChart :option="trendOption" autoresize />
        </div>
      </div>

      <div class="glass-panel rounded-lg p-6 shadow-sm">
        <h3 class="glass-text-muted mb-4 border-b border-gray-200/20 pb-2 text-lg font-bold dark:border-gray-700/50">
          偷菜风云榜 (单日偷取频次)
        </h3>
        <div class="h-[300px] w-full">
          <VChart :option="stealOption" autoresize />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-in {
  animation: fadeIn 0.5s ease-in-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
