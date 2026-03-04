import type { Socket } from 'socket.io-client'
import { adminToken } from '@/utils/auth'
import { defineStore } from 'pinia'
import { io } from 'socket.io-client'
import { ref } from 'vue'
import api from '@/api'

// Define interfaces for better type checking
interface DailyGift {
  key: string
  label: string
  enabled?: boolean
  doneToday: boolean
  lastAt?: number
  completedCount?: number
  totalCount?: number
  tasks?: any[]
}

interface DailyGiftsResponse {
  date: string
  growth: DailyGift
  gifts: DailyGift[]
}

export const useStatusStore = defineStore('status', () => {
  const status = ref<any>(null)
  const logs = ref<any[]>([])
  const accountLogs = ref<any[]>([])
  const dailyGifts = ref<DailyGiftsResponse | null>(null)
  const loading = ref(false)
  const error = ref('')
  const realtimeConnected = ref(false)
  const realtimeLogsEnabled = ref(true)
  const currentRealtimeAccountId = ref('')
  const tokenRef = adminToken

  let socket: Socket | null = null
  // 幂等订阅守卫：记录最近一次成功订阅的账号 ID，避免重复 subscribe 触发 snapshot 覆盖
  let lastSubscribedAccountId = ''

  function normalizeStatusPayload(input: any) {
    return (input && typeof input === 'object') ? { ...input } : {}
  }

  function normalizeLogEntry(input: any) {
    const entry = (input && typeof input === 'object') ? { ...input } : {}
    const ts = Number(entry.ts) || Date.parse(String(entry.time || '')) || Date.now()
    return Object.freeze({
      ...entry,
      ts,
      time: entry.time || new Date(ts).toISOString().replace('T', ' ').slice(0, 19),
    })
  }

  let logBuffer: any[] = []
  let logFlushTimer: ReturnType<typeof setTimeout> | null = null

  function flushRealtimeLogs() {
    if (logBuffer.length === 0) return
    const merged = [...logs.value, ...logBuffer]
    if (merged.length > 1000) {
      logs.value = merged.slice(-1000)
    } else {
      logs.value = merged
    }
    logBuffer = []
    logFlushTimer = null
  }

  function pushRealtimeLog(entry: any) {
    const next = normalizeLogEntry(entry)
    logBuffer.push(next)

    // 增加 300ms 延迟截流缓冲，防止极端刷屏卡死主线程
    if (!logFlushTimer) {
      logFlushTimer = setTimeout(flushRealtimeLogs, 300)
    }
  }

  function pushRealtimeAccountLog(entry: any) {
    const next = (entry && typeof entry === 'object') ? entry : {}
    accountLogs.value.push(Object.freeze({ ...next }))
    if (accountLogs.value.length > 300)
      accountLogs.value = accountLogs.value.slice(-300)
  }

  function handleRealtimeStatus(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const accountId = String(body.accountId || '')
    if (currentRealtimeAccountId.value && accountId !== currentRealtimeAccountId.value)
      return
    if (body.status && typeof body.status === 'object') {
      status.value = normalizeStatusPayload(body.status)
      error.value = ''
    }
  }

  function handleRealtimeLog(payload: any) {
    if (!realtimeLogsEnabled.value)
      return
    pushRealtimeLog(payload)
  }

  function handleRealtimeAccountLog(payload: any) {
    pushRealtimeAccountLog(payload)
  }

  function handleRealtimeLogsSnapshot(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const list = Array.isArray(body.logs) ? body.logs : []
    // 若快照为空且当前已有日志，不替换，避免误清空
    if (list.length === 0 && logs.value.length > 0)
      return

    const normalized = list.map((item: any) => normalizeLogEntry(item))
    // 首次加载（本地无日志）直接赋值
    if (logs.value.length === 0) {
      logs.value = normalized
      return
    }

    // 合并去重：使用 ts_msg 作为唯一键，保留已有日志 + 补充新快照
    const existingKeys = new Set(logs.value.map((l: any) => `${l.ts}_${l.msg}`))
    const merged = [...logs.value]
    for (const entry of normalized) {
      const key = `${entry.ts}_${entry.msg}`
      if (!existingKeys.has(key)) {
        merged.push(entry)
        existingKeys.add(key)
      }
    }
    // 按时间排序并限制总量
    merged.sort((a: any, b: any) => a.ts - b.ts)
    logs.value = merged.length > 1000 ? merged.slice(-1000) : merged
  }

  function handleRealtimeAccountLogsSnapshot(payload: any) {
    const body = (payload && typeof payload === 'object') ? payload : {}
    const list = Array.isArray(body.logs) ? body.logs : []
    if (list.length === 0 && accountLogs.value.length > 0)
      return

    // 首次加载直接赋值
    if (accountLogs.value.length === 0) {
      accountLogs.value = list
      return
    }

    // 合并去重：使用 time_msg 作为唯一键
    const existingKeys = new Set(accountLogs.value.map((l: any) => `${l.time}_${l.msg}`))
    const merged = [...accountLogs.value]
    for (const entry of list) {
      const key = `${entry.time}_${entry.msg}`
      if (!existingKeys.has(key)) {
        merged.push(entry)
        existingKeys.add(key)
      }
    }
    accountLogs.value = merged.length > 300 ? merged.slice(-300) : merged
  }

  function ensureRealtimeSocket() {
    if (socket)
      return socket

    socket = io('/', {
      path: '/socket.io',
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        token: tokenRef.value,
      },
    })

    socket.on('connect', () => {
      realtimeConnected.value = true
      const subId = currentRealtimeAccountId.value || 'all'
      lastSubscribedAccountId = subId
      socket?.emit('subscribe', { accountId: subId })
    })

    socket.on('disconnect', () => {
      realtimeConnected.value = false
    })

    socket.on('connect_error', (err) => {
      realtimeConnected.value = false
      console.error('[realtime] 连接失败:', err.message)
    })

    socket.on('status:update', handleRealtimeStatus)
    socket.on('log:new', handleRealtimeLog)
    socket.on('account-log:new', handleRealtimeAccountLog)
    socket.on('logs:snapshot', handleRealtimeLogsSnapshot)
    socket.on('account-logs:snapshot', handleRealtimeAccountLogsSnapshot)
    return socket
  }

  function connectRealtime(accountId: string) {
    const newId = String(accountId || '').trim()
    currentRealtimeAccountId.value = newId
    if (!tokenRef.value)
      return

    const client = ensureRealtimeSocket()
    client.auth = {
      token: tokenRef.value,
      accountId: newId || 'all',
    }

    if (client.connected) {
      // 幂等守卫：账号未变化时不重复 subscribe，避免触发 snapshot 覆盖日志
      if (lastSubscribedAccountId === (newId || 'all'))
        return
      lastSubscribedAccountId = newId || 'all'
      client.emit('subscribe', { accountId: newId || 'all' })
      return
    }
    lastSubscribedAccountId = ''
    client.connect()
  }

  function disconnectRealtime() {
    if (!socket)
      return
    socket.off('connect')
    socket.off('disconnect')
    socket.off('connect_error')
    socket.off('status:update', handleRealtimeStatus)
    socket.off('log:new', handleRealtimeLog)
    socket.off('account-log:new', handleRealtimeAccountLog)
    socket.off('logs:snapshot', handleRealtimeLogsSnapshot)
    socket.off('account-logs:snapshot', handleRealtimeAccountLogsSnapshot)
    socket.disconnect()
    socket = null
    realtimeConnected.value = false
    lastSubscribedAccountId = ''
  }

  async function fetchStatus(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/status', {
        headers: { 'x-account-id': accountId },
      })
      if (data.ok) {
        status.value = normalizeStatusPayload(data.data)
        error.value = ''
      }
      else {
        error.value = data.error
      }
    }
    catch (e: any) {
      error.value = e.message
    }
    finally {
      loading.value = false
    }
  }

  async function fetchLogs(accountId: string, options: any = {}) {
    if (!accountId && options.accountId !== 'all')
      return
    const params: any = { limit: 100, ...options }
    const headers: any = {}
    if (accountId && accountId !== 'all') {
      headers['x-account-id'] = accountId
    }
    else {
      params.accountId = 'all'
    }

    try {
      const { data } = await api.get('/api/logs', { headers, params })
      if (data.ok) {
        logs.value = data.data
        error.value = ''
      }
    }
    catch (e: any) {
      console.error(e)
    }
  }

  async function fetchDailyGifts(accountId: string) {
    if (!accountId)
      return
    try {
      const { data } = await api.get('/api/daily-gifts', {
        headers: { 'x-account-id': accountId },
      })
      if (data.ok) {
        dailyGifts.value = data.data
      }
    }
    catch (e) {
      console.error('获取每日奖励失败', e)
    }
  }

  async function fetchAccountLogs(limit = 100) {
    try {
      const res = await api.get(`/api/account-logs?limit=${Math.max(1, Number(limit) || 100)}`)
      if (Array.isArray(res.data)) {
        accountLogs.value = res.data
      }
    }
    catch (e) {
      console.error(e)
    }
  }

  function setRealtimeLogsEnabled(enabled: boolean) {
    realtimeLogsEnabled.value = !!enabled
  }

  return {
    status,
    logs,
    accountLogs,
    dailyGifts,
    loading,
    error,
    realtimeConnected,
    realtimeLogsEnabled,
    fetchStatus,
    fetchLogs,
    fetchAccountLogs,
    fetchDailyGifts,
    setRealtimeLogsEnabled,
    connectRealtime,
    disconnectRealtime,
  }
})
