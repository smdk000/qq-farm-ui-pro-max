interface RouteLike {
  fullPath?: string
  name?: string | symbol | null
  meta?: Record<string, any>
}

interface AccountLike {
  id?: string | number
  name?: string
  nick?: string
  uin?: string | number
  platform?: string
  wsError?: { code?: number | string, message?: string } | null
}

interface StatusLike {
  connection?: { connected?: boolean }
  wsError?: { code?: number | string, message?: string } | null
}

interface ContextInput {
  route?: RouteLike | null
  account?: AccountLike | null
  status?: StatusLike | null
  realtimeConnected?: boolean
  now?: Date
  pageTitle?: string
  userAgent?: string
  language?: string
  timezone?: string
  screenWidth?: number
  screenHeight?: number
  windowWidth?: number
  windowHeight?: number
}

function trimText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

export function buildBugReportClientContext(input: ContextInput = {}) {
  const now = input.now instanceof Date ? input.now : new Date()
  const route = input.route || {}
  const account = input.account || {}
  const status = input.status || {}
  const wsError = status.wsError || account.wsError || null

  return {
    route: trimText(route.fullPath || '', 255),
    routeName: trimText(route.name || '', 120),
    pageTitle: trimText(input.pageTitle || '', 255),
    accountId: trimText(account.id || '', 64),
    accountName: trimText(account.name || account.nick || '', 120),
    accountUin: trimText(account.uin || '', 64),
    accountPlatform: trimText(account.platform || '', 32),
    accountConnected: status.connection?.connected ? 'true' : 'false',
    realtimeConnected: input.realtimeConnected ? 'true' : 'false',
    wsErrorCode: trimText(wsError?.code || '', 32),
    wsErrorMessage: trimText(wsError?.message || '', 255),
    userAgent: trimText(input.userAgent || '', 500),
    language: trimText(input.language || '', 64),
    timezone: trimText(input.timezone || '', 64),
    screen: `${Math.max(0, Number(input.screenWidth) || 0)}x${Math.max(0, Number(input.screenHeight) || 0)}`,
    window: `${Math.max(0, Number(input.windowWidth) || 0)}x${Math.max(0, Number(input.windowHeight) || 0)}`,
    submittedAt: now.toISOString(),
  }
}

export function collectBugReportClientContext(input: Omit<ContextInput, 'pageTitle' | 'userAgent' | 'language' | 'timezone' | 'screenWidth' | 'screenHeight' | 'windowWidth' | 'windowHeight'> = {}) {
  const pageTitle = typeof document !== 'undefined' ? document.title : ''
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const language = typeof navigator !== 'undefined' ? navigator.language : ''
  const timezone = typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    : ''
  const screenWidth = typeof screen !== 'undefined' ? screen.width : 0
  const screenHeight = typeof screen !== 'undefined' ? screen.height : 0
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 0
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 0

  return buildBugReportClientContext({
    ...input,
    pageTitle,
    userAgent,
    language,
    timezone,
    screenWidth,
    screenHeight,
    windowWidth,
    windowHeight,
  })
}
